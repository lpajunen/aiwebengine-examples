#!/usr/bin/env node
/// <reference types="node" />
require("dotenv").config();
// Generic script and asset uploader for the server
// Requires authentication token from schemas/token.json (run `make oauth-login` first)
//
// Assets go up through POST /engine/assets/batch rather than one request each:
// a single-asset write invalidates the script's prepared program, so writing a
// 100-file tree one file at a time made every cluster instance reinitialize the
// script 100 times, each from a tree still being uploaded. Large trees are split
// into chunks that stay under MAX_BATCH_BYTES, and every chunk but the last asks
// for reinit=never, so the whole tree lands before the one init() that follows.
// The script itself must be upserted first — assets carry a foreign key to it,
// so a brand-new URI has nowhere to hang them.
// Usage:
//   node scripts/upload-script.js --script-path <path> --script-uri <uri> [options]
// Options:
//   --script-path <path>    Path to the script file to upload (required)
//   --script-uri <uri>      URI for the script (e.g., https://example.com/editor) (required)
//   --assets-dir <path>     Path to assets directory (optional)
//   --asset-prefix <prefix> Prefix to add to asset names (e.g., "docs/") (optional)
//   --dry-run               Show what would be uploaded without actually uploading (optional)
// Env:
//   MANAGE_HOST (default: https://manage.softagen.com) - engine management API
//   SERVER_HOST (default: https://softagen.com) - where deployed solutions are served

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { minimatch } = require("minimatch");
const { loadAccessToken } = require("./lib/token.js");

const manageHost = process.env.MANAGE_HOST || "https://manage.softagen.com";
const serverHost = process.env.SERVER_HOST || "https://softagen.com";

// Cap on the base64 payload of one batch request. Bigger trees are chunked so a
// single request never has to carry an unbounded body.
const MAX_BATCH_BYTES = 4 * 1024 * 1024;

/**
 * Parse command-line arguments
 * @returns {{scriptPath: string|null, scriptUri: string|null, assetsDir: string|null, assetPrefix: string, dryRun: boolean}}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  /** @type {{scriptPath: string|null, scriptUri: string|null, assetsDir: string|null, assetPrefix: string, dryRun: boolean}} */
  const config = {
    scriptPath: null,
    scriptUri: null,
    assetsDir: null,
    assetPrefix: "",
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--script-path":
        config.scriptPath = args[++i];
        break;
      case "--script-uri":
        config.scriptUri = args[++i];
        break;
      case "--assets-dir":
        config.assetsDir = args[++i];
        break;
      case "--asset-prefix":
        config.assetPrefix = args[++i];
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      default:
        if (arg.startsWith("--")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return config;
}

/**
 * Load ignore patterns from .uploadignore file
 * @returns {Promise<string[]>}
 */
async function loadIgnorePatterns() {
  const ignorePath = path.join(__dirname, "..", ".uploadignore");
  try {
    const ignoreContent = await fs.promises.readFile(ignorePath, "utf8");
    return ignoreContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  } catch (err) {
    const error = /** @type {NodeJS.ErrnoException} */ (err);
    if (error.code === "ENOENT") {
      return []; // No ignore file, return empty array
    }
    throw err;
  }
}

/**
 * Check if a file should be ignored based on patterns
 * @param {string} relativePath - Path relative to assets directory
 * @param {string[]} patterns - Glob patterns
 * @returns {boolean}
 */
function shouldIgnore(relativePath, patterns) {
  return patterns.some((pattern) => minimatch(relativePath, pattern));
}

/**
 * Recursively scan directory for asset files
 * @param {string} dir - Directory to scan
 * @param {string} baseDir - Base directory for calculating relative paths
 * @param {string[]} ignorePatterns - Patterns to ignore
 * @returns {Promise<string[]>} - Array of relative file paths
 */
async function scanDirectory(dir, baseDir, ignorePatterns) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (shouldIgnore(relativePath, ignorePatterns)) {
      continue;
    }

    if (entry.isDirectory()) {
      const subFiles = await scanDirectory(fullPath, baseDir, ignorePatterns);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * Upload the script
 * @param {string} token
 * @param {string} scriptPath
 * @param {string} scriptUri
 * @param {boolean} dryRun
 * @returns {Promise<number>} - Size in bytes
 */
async function uploadScript(token, scriptPath, scriptUri, dryRun) {
  const scriptContent = await fs.promises.readFile(scriptPath, "utf8");
  const scriptName = path.basename(scriptPath);

  if (dryRun) {
    console.log(
      `[DRY RUN] Would upload script ${scriptName} (${scriptContent.length} bytes)`,
    );
    console.log(`[DRY RUN]   URI: ${scriptUri}`);
    return scriptContent.length;
  }

  console.log(
    `Uploading script ${scriptName} (${scriptContent.length} bytes)...`,
  );

  const body = new URLSearchParams({
    uri: scriptUri,
    content: scriptContent,
  }).toString();

  const response = await fetch(`${manageHost}/engine/upsert_script`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to upload script: ${response.status} ${response.statusText}\n${text}`,
    );
  }

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    result = { message: text };
  }

  console.log(
    `✓ Script uploaded successfully: ${result.message || result.success || "OK"}`,
  );
  return scriptContent.length;
}

/**
 * Get MIME type from file extension
 * @param {string} filename
 * @returns {string}
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  /** @type {Record<string, string>} */
  const mimeTypes = {
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
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * @param {Buffer | string} data
 * @returns {string}
 */
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Split files into batches whose base64 payloads stay under MAX_BATCH_BYTES.
 * A single file over the cap still gets its own batch — there is nothing
 * smaller to split it into.
 * @param {Array<{ name: string, base64: string, bytes: number, hash: string }>} files
 * @returns {Array<Array<{ name: string, base64: string, bytes: number, hash: string }>>}
 */
function chunkBatches(files) {
  /** @type {Array<Array<{ name: string, base64: string, bytes: number, hash: string }>>} */
  const chunks = [];
  /** @type {Array<{ name: string, base64: string, bytes: number, hash: string }>} */
  let current = [];
  let size = 0;
  for (const file of files) {
    if (current.length > 0 && size + file.base64.length > MAX_BATCH_BYTES) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += file.base64.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Upload every asset via POST /engine/assets/batch. Each batch is one
 * transaction: a rejected file means nothing in that batch was written.
 * @param {string} token
 * @param {Array<{ name: string, path: string }>} assets
 * @param {string} scriptUri
 * @param {boolean} dryRun
 * @returns {Promise<number>} - Total size in bytes
 */
async function uploadAssets(token, assets, scriptUri, dryRun) {
  const files = [];
  for (const asset of assets) {
    const content = await fs.promises.readFile(asset.path);
    files.push({
      name: asset.name,
      base64: content.toString("base64"),
      bytes: content.length,
      hash: sha256(content),
    });
  }
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  const batches = chunkBatches(files);

  if (dryRun) {
    files.forEach((f) =>
      console.log(
        `[DRY RUN] Would upload asset ${f.name} (${f.bytes} bytes, ${getMimeType(f.name)})`,
      ),
    );
    console.log(
      `[DRY RUN] ${files.length} asset(s) in ${batches.length} batch request(s)`,
    );
    return totalBytes;
  }

  console.log(
    `Uploading ${files.length} asset(s) in ${batches.length} batch request(s)...`,
  );

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const last = i === batches.length - 1;
    const response = await fetch(
      `${manageHost}/engine/assets/batch?script=${encodeURIComponent(scriptUri)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          files: batch.map((f) => ({
            name: f.name,
            mimetype: getMimeType(f.name),
            content_base64: f.base64,
            sha256: f.hash,
          })),
          // Hold the init() until the last chunk, so it never runs against a
          // tree that is still missing files.
          reinit: last ? "after" : "never",
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to upload asset batch ${i + 1}/${batches.length} (nothing in it was written): ${response.status} ${response.statusText}\n${text}`,
      );
    }

    const result = await response.json();
    /** @type {Map<string, { sha256?: string }>} */
    const byName = new Map();
    for (const r of result.results || []) byName.set(r.name, r);
    for (const f of batch) {
      const echoed = byName.get(f.name);
      if (!echoed) {
        throw new Error(`Asset ${f.name} missing from batch results`);
      }
      if (echoed.sha256 && echoed.sha256 !== f.hash) {
        throw new Error(
          `Asset ${f.name} sha256 mismatch (local ${f.hash.slice(0, 12)} != server ${String(echoed.sha256).slice(0, 12)})`,
        );
      }
    }
    console.log(
      `✓ Batch ${i + 1}/${batches.length}: ${batch.length} asset(s), ${formatBytes(batch.reduce((sum, f) => sum + f.bytes, 0))} — sha256 verified`,
    );

    const init = result.init;
    if (init && init.ran === false) {
      console.log(`  · no init() (${init.reason || "not run"})`);
    } else if (init && init.success === false) {
      throw new Error(`init() failed after upload: ${init.error || "unknown"}`);
    } else if (init) {
      console.log(
        `  · init() ok${init.durationMs != null ? ` (${init.durationMs} ms)` : ""}`,
      );
    }
  }

  return totalBytes;
}

/**
 * Look up which host a script publishes on. Falls back to SERVER_HOST's hostname
 * when the binding cannot be read (the endpoint is administrators-only).
 * @param {string} token
 * @param {string} scriptUri
 * @returns {Promise<string>}
 */
async function publishedHost(token, scriptUri) {
  const fallback = new URL(serverHost).host;
  try {
    const params = new URLSearchParams({ uri: scriptUri });
    const response = await fetch(
      `${manageHost}/engine/script_hosts?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return fallback;
    const result = await response.json();
    const hosts = result.publishedOn || result.hosts;
    return Array.isArray(hosts) && hosts.length > 0 ? hosts[0] : fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  try {
    const config = parseArgs();

    // Validate required arguments
    if (!config.scriptPath || !config.scriptUri) {
      console.error("Error: --script-path and --script-uri are required");
      console.error("");
      console.error("Usage:");
      console.error(
        "  node scripts/upload-script.js --script-path <path> --script-uri <uri> [options]",
      );
      console.error("");
      console.error("Options:");
      console.error(
        "  --script-path <path>    Path to the script file to upload (required)",
      );
      console.error("  --script-uri <uri>      URI for the script (required)");
      console.error(
        "  --assets-dir <path>     Path to assets directory (optional)",
      );
      console.error(
        "  --asset-prefix <prefix> Prefix to add to asset names (optional)",
      );
      console.error(
        "  --dry-run               Show what would be uploaded (optional)",
      );
      process.exit(1);
    }

    // Resolve paths
    const scriptPath = path.resolve(config.scriptPath);
    const assetsDir = config.assetsDir ? path.resolve(config.assetsDir) : null;

    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Script file not found: ${scriptPath}`);
    }

    // Check if assets directory exists (if specified)
    if (assetsDir && !fs.existsSync(assetsDir)) {
      throw new Error(`Assets directory not found: ${assetsDir}`);
    }

    const dryRunPrefix = config.dryRun ? "[DRY RUN] " : "";
    console.log(`${dryRunPrefix}Uploading files to ${manageHost}...`);
    console.log("");

    let totalBytes = 0;
    let assetCount = 0;

    // Load authentication token (skip in dry-run mode)
    const token = config.dryRun ? "" : await loadAccessToken();
    if (!config.dryRun) {
      console.log("✓ Authentication token loaded");
      console.log("");
    }

    // Upload script
    totalBytes += await uploadScript(
      token,
      scriptPath,
      config.scriptUri,
      config.dryRun,
    );
    console.log("");

    // Upload assets (if directory specified)
    if (assetsDir) {
      const ignorePatterns = await loadIgnorePatterns();
      if (ignorePatterns.length > 0 && !config.dryRun) {
        console.log(
          `Loaded ${ignorePatterns.length} ignore pattern(s) from .uploadignore`,
        );
      }

      const assetFiles = await scanDirectory(
        assetsDir,
        assetsDir,
        ignorePatterns,
      );

      if (assetFiles.length === 0) {
        console.log("No assets found to upload");
      } else {
        const assets = assetFiles.map((relPath) => ({
          // Normalize path separators to forward slashes for asset names
          name: config.assetPrefix + relPath.split(path.sep).join("/"),
          path: path.join(assetsDir, relPath),
        }));
        totalBytes += await uploadAssets(
          token,
          assets,
          config.scriptUri,
          config.dryRun,
        );
        assetCount = assets.length;
      }
    }

    console.log("");
    console.log(
      `${dryRunPrefix}✓ Upload complete: 1 script + ${assetCount} asset(s) (${formatBytes(totalBytes)} total)`,
    );

    if (!config.dryRun) {
      const scriptName = path.basename(scriptPath, ".js");
      const host = await publishedHost(token, config.scriptUri);
      console.log(`Visit https://${host}/${scriptName} to see your changes.`);
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
