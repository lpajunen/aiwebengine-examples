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
// Assets go up in a single POST /engine/assets/batch: one transaction, one
// init(). Writing them one at a time invalidates the prepared program per
// file, so every cluster instance reinitializes the script once per file from
// a tree that is still being uploaded. When the entrypoint is part of the same
// change the batch asks for reinit=never and the trailing upsert_script
// supplies the one init(), so the new modules and the new entrypoint are
// always initialized together.
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
//   --no-verify           Skip the sha256 read-back check (the batch write
//                         still sends a per-file sha256 the server verifies)
// Env:
//   MANAGE_HOST (default: https://manage.softagen.com) - engine management API

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { loadAccessToken } = require("./lib/token.js");

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
 * Read one asset back (GET /engine/assets) and compare its bytes to the local
 * copy. The batch write already had the server verify the sha256 we supplied
 * against what it received; this additionally proves what it stored.
 * @param {string} token
 * @param {string} scriptUri
 * @param {string} assetName
 * @param {string} localHash
 * @returns {Promise<boolean>}
 */
async function verifyAsset(token, scriptUri, assetName, localHash) {
  const q = `script=${encodeURIComponent(scriptUri)}`;
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
  return true;
}

/**
 * Upsert every asset in one request (POST /engine/assets/batch). The batch is
 * one transaction: on a rejected file nothing is written at all.
 * @param {string} token
 * @param {string} scriptUri
 * @param {Array<{ abs: string, name: string }>} assets
 * @param {"after" | "never"} reinit
 * @param {boolean} verify
 * @returns {Promise<number>} number of files that failed verification
 */
async function uploadAssets(token, scriptUri, assets, reinit, verify) {
  const local = assets.map((a) => {
    const bytes = fs.readFileSync(a.abs);
    return { name: a.name, bytes, hash: sha256(bytes) };
  });

  const res = await fetch(
    `${manageHost}/engine/assets/batch?script=${encodeURIComponent(scriptUri)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        files: local.map((f) => ({
          name: f.name,
          mimetype: mimeFor(f.name),
          content_base64: f.bytes.toString("base64"),
          sha256: f.hash,
        })),
        reinit,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `asset batch failed (nothing written): ${res.status} ${res.statusText}\n${await res.text()}`,
    );
  }
  const body = await res.json();

  /** @type {Map<string, { sha256?: string, bytes?: number, status?: string }>} */
  const byName = new Map();
  for (const r of body.results || []) byName.set(r.name, r);

  let failures = 0;
  for (const f of local) {
    const result = byName.get(f.name);
    if (!result) {
      console.error(`  ✗ ${f.name} MISSING from batch results`);
      failures++;
      continue;
    }
    if (result.sha256 && result.sha256 !== f.hash) {
      console.error(
        `  ✗ ${f.name} SHA MISMATCH (local ${f.hash.slice(0, 12)} != server ${String(result.sha256).slice(0, 12)})`,
      );
      failures++;
      continue;
    }
    const state = result.status === "unchanged" ? "unchanged" : "written";
    if (!verify) {
      console.log(`  ✓ ${f.name} (${f.bytes.length} B, ${state})`);
      continue;
    }
    const ok = await verifyAsset(token, scriptUri, f.name, f.hash);
    if (!ok) failures++;
    else
      console.log(
        `  ✓ ${f.name} (${f.bytes.length} B, ${state}, sha256 verified)`,
      );
  }

  reportInit(body.init, `batch of ${local.length} asset(s)`);
  return failures;
}

/**
 * @param {{ ran?: boolean, success?: boolean, durationMs?: number,
 *   error?: string | null, reason?: string } | undefined} init
 * @param {string} what
 * @returns {void}
 */
function reportInit(init, what) {
  if (!init) return;
  if (init.ran === false) {
    console.log(`  · no init() after ${what} (${init.reason || "not run"})`);
    return;
  }
  if (init.success === false) {
    throw new Error(
      `init() failed after ${what}: ${init.error || "unknown error"}`,
    );
  }
  console.log(
    `  · init() ok after ${what}${init.durationMs != null ? ` (${init.durationMs} ms)` : ""}`,
  );
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

  const token = await loadAccessToken();
  const scriptTarget = targets.find((t) => t.isScript);
  /** @type {Array<{ abs: string, name: string }>} */
  const assetTargets = targets
    .filter((t) => !t.isScript)
    .map((t) => ({ abs: t.abs, name: /** @type {string} */ (t.name) }));

  let failures = 0;
  if (assetTargets.length > 0) {
    // With an entrypoint in the same change, hold the init() until it lands so
    // the new modules and the new entrypoint initialize together — one init().
    failures += await uploadAssets(
      token,
      config.scriptUri,
      assetTargets,
      scriptTarget ? "never" : "after",
      config.verify,
    );
  }
  if (scriptTarget) {
    await uploadScript(token, config.scriptUri, scriptTarget.abs);
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
