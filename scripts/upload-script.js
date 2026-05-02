#!/usr/bin/env node
/// <reference types="node" />
require("dotenv").config();
// Generic script and asset uploader for the server
// Requires authentication token from schemas/token.json (run `make oauth-login` first)
// Usage:
//   node scripts/upload-script.js --script-path <path> --script-uri <uri> [options]
// Options:
//   --script-path <path>    Path to the script file to upload (required)
//   --script-uri <uri>      URI for the script (e.g., https://example.com/editor) (required)
//   --assets-dir <path>     Path to assets directory (optional)
//   --asset-prefix <prefix> Prefix to add to asset names (e.g., "docs/") (optional)
//   --dry-run               Show what would be uploaded without actually uploading (optional)
// Env:
//   SERVER_HOST (default: https://softagen.com)

const fs = require("fs");
const path = require("path");
const { minimatch } = require("minimatch");

const serverHost = process.env.SERVER_HOST || "https://softagen.com";

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
 * Load OAuth token from schemas/token.json
 * @returns {Promise<string>}
 */
async function loadToken() {
  const tokenPath = path.join(__dirname, "..", "schemas", "token.json");
  try {
    const tokenData = await fs.promises.readFile(tokenPath, "utf8");
    const token = JSON.parse(tokenData);

    // Check if token is expired
    if (token.expires_at && Date.now() > token.expires_at) {
      throw new Error(
        "Token has expired. Please run 'make oauth-login' again.",
      );
    }

    return token.access_token;
  } catch (err) {
    const error = /** @type {NodeJS.ErrnoException} */ (err);
    if (error.code === "ENOENT") {
      throw new Error("Token not found. Please run 'make oauth-login' first.");
    }
    throw err;
  }
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

  const response = await fetch(`${serverHost}/upsert_script`, {
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
 * Upload an asset file
 * @param {string} token
 * @param {string} assetName - The asset name (e.g., "editor.css" or "docs/guides/scripts.md")
 * @param {string} assetPath - Local file path to read
 * @param {string} scriptUri - The script URI
 * @param {boolean} dryRun
 * @returns {Promise<number>} - Size in bytes
 */
async function uploadAsset(token, assetName, assetPath, scriptUri, dryRun) {
  const content = await fs.promises.readFile(assetPath);
  const mimetype = getMimeType(assetName);

  if (dryRun) {
    console.log(
      `[DRY RUN] Would upload asset ${assetName} (${content.length} bytes, ${mimetype})`,
    );
    return content.length;
  }

  console.log(`Uploading asset ${assetName} (${content.length} bytes)...`);

  const base64Content = content.toString("base64");
  const encodedScriptUri = encodeURIComponent(scriptUri);
  const response = await fetch(
    `${serverHost}/assets?script=${encodedScriptUri}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        asset: assetName,
        mimetype: mimetype,
        content: base64Content,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to upload asset ${assetName}: ${response.status} ${response.statusText}\n${text}`,
    );
  }

  await response.json();
  console.log(`✓ Asset ${assetName} uploaded successfully`);
  return content.length;
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
    console.log(`${dryRunPrefix}Uploading files to ${serverHost}...`);
    console.log("");

    let totalBytes = 0;
    let assetCount = 0;

    // Load authentication token (skip in dry-run mode)
    const token = config.dryRun ? "" : await loadToken();
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
        for (const relPath of assetFiles) {
          const assetPath = path.join(assetsDir, relPath);
          // Normalize path separators to forward slashes for asset names
          const normalizedPath = relPath.split(path.sep).join("/");
          const assetName = config.assetPrefix + normalizedPath;
          totalBytes += await uploadAsset(
            token,
            assetName,
            assetPath,
            config.scriptUri,
            config.dryRun,
          );
          assetCount++;
        }
      }
    }

    console.log("");
    console.log(
      `${dryRunPrefix}✓ Upload complete: 1 script + ${assetCount} asset(s) (${formatBytes(totalBytes)} total)`,
    );

    if (!config.dryRun) {
      const scriptName = path.basename(scriptPath, ".js");
      console.log(
        `Visit ${serverHost}/engine/${scriptName} to see your changes.`,
      );
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
