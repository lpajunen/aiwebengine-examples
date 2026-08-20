#!/usr/bin/env node
/// <reference types="node" />
require("dotenv").config();
// Per-file deployer: pushes only the changed files you name (or the ones git
// reports changed) to the server, then byte-verifies each asset with a
// sha256 read-back. This is the "MCP write_asset" workflow done from a script,
// so large files don't have to be hand-carried as base64 through a tool call.
// It talks to the same REST endpoints the MCP asset tools wrap, using the
// regular OAuth token from schemas/token.json (run `make oauth-login` first).
//
// Usage:
//   node scripts/deploy-assets.js [options] [file ...]
//
//   file ...   Local paths to changed files (assets and/or the entrypoint).
//              If omitted, defaults to `git diff --name-only HEAD` filtered to
//              files under --assets-dir or equal to --script-path.
//
// Options (defaults target src/virtual-world):
//   --script-uri <uri>    Script URI            (default https://example.com/virtual-world)
//   --assets-dir <path>   Assets root           (default src/virtual-world/assets)
//   --script-path <path>  Entrypoint script     (default src/virtual-world/virtual-world.js)
//   --dry-run             Print what would deploy, upload nothing
//   --no-verify           Skip the sha256 read-back check
// Env:
//   MANAGE_HOST (default: https://manage.softagen.com) - engine management API

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const manageHost = process.env.MANAGE_HOST || "https://manage.softagen.com";
const repoRoot = path.join(__dirname, "..");

const DEFAULTS = {
  scriptUri: "https://example.com/virtual-world",
  assetsDir: "src/virtual-world/assets",
  scriptPath: "src/virtual-world/virtual-world.js",
};

/**
 * @typedef {{ scriptUri: string, assetsDir: string, scriptPath: string,
 *   dryRun: boolean, verify: boolean, files: string[] }} Config
 */

/** @returns {Config} */
function parseArgs() {
  const args = process.argv.slice(2);
  /** @type {Config} */
  const config = {
    scriptUri: DEFAULTS.scriptUri,
    assetsDir: DEFAULTS.assetsDir,
    scriptPath: DEFAULTS.scriptPath,
    dryRun: false,
    verify: true,
    files: [],
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--script-uri":
        config.scriptUri = args[++i];
        break;
      case "--assets-dir":
        config.assetsDir = args[++i];
        break;
      case "--script-path":
        config.scriptPath = args[++i];
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      case "--no-verify":
        config.verify = false;
        break;
      default:
        if (arg.startsWith("--")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        config.files.push(arg);
    }
  }
  return config;
}

/** @returns {string} */
function loadToken() {
  const tokenPath = path.join(repoRoot, "schemas", "token.json");
  let raw;
  try {
    raw = fs.readFileSync(tokenPath, "utf8");
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT") {
      throw new Error("Token not found. Run 'make oauth-login' first.");
    }
    throw err;
  }
  const token = JSON.parse(raw);
  if (token.expires_at && Date.now() > token.expires_at) {
    throw new Error("Token has expired. Run 'make oauth-login' again.");
  }
  return token.access_token;
}

/**
 * Files changed vs the last commit (staged + unstaged + untracked), as
 * absolute paths. Used when no files are passed explicitly.
 * @returns {string[]}
 */
function gitChangedFiles() {
  const out = execFileSync(
    "git",
    ["-C", repoRoot, "status", "--porcelain", "--untracked-files=all"],
    { encoding: "utf8" },
  );
  /** @type {string[]} */
  const files = [];
  out.split("\n").forEach((line) => {
    if (!line.trim()) return;
    // Porcelain: 'XY <path>' (or 'XY <old> -> <new>' for renames).
    const rest = line.slice(3);
    const p = rest.includes(" -> ") ? rest.split(" -> ")[1] : rest;
    files.push(path.resolve(repoRoot, p.trim()));
  });
  return files;
}

/**
 * @param {string} filename
 * @returns {string}
 */
function mimeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  /** @type {Record<string, string>} */
  const map = {
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".html": "text/html",
    ".md": "text/markdown",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * @param {Buffer | string} data
 * @returns {string}
 */
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Upsert the entrypoint script (POST /engine/upsert_script).
 * @param {string} token
 * @param {string} scriptUri
 * @param {string} absPath
 * @returns {Promise<void>}
 */
async function uploadScript(token, scriptUri, absPath) {
  const content = fs.readFileSync(absPath, "utf8");
  const res = await fetch(`${manageHost}/engine/upsert_script`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: new URLSearchParams({ uri: scriptUri, content }).toString(),
  });
  if (!res.ok) {
    throw new Error(
      `upsert_script failed: ${res.status} ${res.statusText}\n${await res.text()}`,
    );
  }
  console.log(
    `  ✓ script uploaded (${content.length} B) — transpile errors, if any, surface in logs`,
  );
}

/**
 * Upsert one asset (POST /engine/assets) and optionally verify with a GET read-back.
 * @param {string} token
 * @param {string} scriptUri
 * @param {string} assetName
 * @param {string} absPath
 * @param {boolean} verify
 * @returns {Promise<boolean>} true when uploaded (and verified, if enabled)
 */
async function uploadAsset(token, scriptUri, assetName, absPath, verify) {
  const bytes = fs.readFileSync(absPath);
  const localHash = sha256(bytes);
  const q = `script=${encodeURIComponent(scriptUri)}`;

  const res = await fetch(`${manageHost}/engine/assets?${q}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      asset: assetName,
      mimetype: mimeFor(assetName),
      content: bytes.toString("base64"),
    }),
  });
  if (!res.ok) {
    throw new Error(
      `asset ${assetName} failed: ${res.status} ${res.statusText}\n${await res.text()}`,
    );
  }
  await res.json();

  if (!verify) {
    console.log(`  ✓ ${assetName} (${bytes.length} B, unverified)`);
    return true;
  }

  const readRes = await fetch(
    `${manageHost}/engine/assets?${q}&asset=${encodeURIComponent(assetName)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!readRes.ok) {
    throw new Error(
      `read-back of ${assetName} failed: ${readRes.status} ${readRes.statusText}`,
    );
  }
  const body = await readRes.json();
  if (typeof body.content !== "string") {
    throw new Error(`read-back of ${assetName} returned no content field`);
  }
  const remoteHash = sha256(Buffer.from(body.content, "base64"));
  if (remoteHash !== localHash) {
    console.error(
      `  ✗ ${assetName} VERIFY MISMATCH (local ${localHash.slice(0, 12)} != remote ${remoteHash.slice(0, 12)})`,
    );
    return false;
  }
  console.log(`  ✓ ${assetName} (${bytes.length} B, sha256 verified)`);
  return true;
}

/**
 * @param {string} absPath
 * @param {string} absAssetsDir
 * @param {string} absScriptPath
 * @returns {{ kind: "script" } | { kind: "asset", name: string } | { kind: "skip" }}
 */
function classify(absPath, absAssetsDir, absScriptPath) {
  if (absPath === absScriptPath) return { kind: "script" };
  const rel = path.relative(absAssetsDir, absPath);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return { kind: "asset", name: rel.split(path.sep).join("/") };
  }
  return { kind: "skip" };
}

async function main() {
  const config = parseArgs();
  const absAssetsDir = path.resolve(repoRoot, config.assetsDir);
  const absScriptPath = path.resolve(repoRoot, config.scriptPath);

  const rawFiles =
    config.files.length > 0
      ? config.files.map((f) => path.resolve(f))
      : gitChangedFiles();

  /** @type {Array<{ abs: string, name?: string, isScript: boolean }>} */
  const targets = [];
  const skipped = [];
  for (const abs of rawFiles) {
    if (!fs.existsSync(abs)) {
      skipped.push(
        `${path.relative(repoRoot, abs)} (missing — deletions unsupported)`,
      );
      continue;
    }
    const c = classify(abs, absAssetsDir, absScriptPath);
    if (c.kind === "skip") {
      skipped.push(
        `${path.relative(repoRoot, abs)} (outside assets dir / not the entrypoint)`,
      );
    } else if (c.kind === "script") {
      targets.push({ abs, isScript: true });
    } else {
      targets.push({ abs, name: c.name, isScript: false });
    }
  }

  if (skipped.length > 0) {
    console.log("Skipping:");
    skipped.forEach((s) => console.log(`  - ${s}`));
  }
  if (targets.length === 0) {
    console.log("Nothing to deploy.");
    return;
  }

  console.log(
    `${config.dryRun ? "[DRY RUN] " : ""}Deploying ${targets.length} file(s) to ${manageHost} (${config.scriptUri})`,
  );
  if (config.dryRun) {
    targets.forEach((t) =>
      console.log(
        `  - ${t.isScript ? "[script] " : ""}${t.name || path.relative(repoRoot, t.abs)}`,
      ),
    );
    return;
  }

  const token = loadToken();
  let failures = 0;
  for (const t of targets) {
    if (t.isScript) {
      await uploadScript(token, config.scriptUri, t.abs);
    } else {
      const ok = await uploadAsset(
        token,
        config.scriptUri,
        /** @type {string} */ (t.name),
        t.abs,
        config.verify,
      );
      if (!ok) failures++;
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`✗ ${failures} file(s) failed verification.`);
    process.exit(1);
  }
  console.log(`✓ Deployed ${targets.length} file(s).`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
