#!/usr/bin/env node
/// <reference types="node" />
require("dotenv").config();
// Bind deployed scripts to the host they should be published on.
// Requires authentication token from schemas/token.json (run `make oauth-login` first)
// and administrator privileges on the engine.
// Usage:
//   node scripts/set-script-hosts.js --script-uri <uri> [--script-uri <uri> ...] [options]
// Options:
//   --script-uri <uri>   URI of a script to bind (required, repeatable)
//   --hosts <hosts>      Comma-separated hosts, "*" for every configured host, or
//                        "" for the engine default host
//                        (default: the host part of SERVER_HOST)
//   --dry-run            Show what would be changed without calling the API
// Env:
//   MANAGE_HOST (default: https://manage.softagen.com) - engine management API
//   SERVER_HOST (default: https://softagen.com) - where deployed solutions are served

const fs = require("fs");
const path = require("path");
const { loadAccessToken } = require("./lib/token.js");

const manageHost = process.env.MANAGE_HOST || "https://manage.softagen.com";
const serverHost = process.env.SERVER_HOST || "https://softagen.com";

/**
 * Parse command-line arguments
 * @returns {{scriptUris: string[], hosts: string, dryRun: boolean}}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  /** @type {{scriptUris: string[], hosts: string, dryRun: boolean}} */
  const config = {
    scriptUris: [],
    hosts: new URL(serverHost).host,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--script-uri":
        config.scriptUris.push(args[++i]);
        break;
      case "--hosts":
        config.hosts = args[++i];
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
 * Bind a single script to the given hosts
 * @param {string} token
 * @param {string} scriptUri
 * @param {string} hosts
 * @param {boolean} dryRun
 * @returns {Promise<void>}
 */
async function setHosts(token, scriptUri, hosts, dryRun) {
  const target = hosts || "(engine default host)";

  if (dryRun) {
    console.log(`[DRY RUN] Would bind ${scriptUri} to ${target}`);
    return;
  }

  console.log(`Binding ${scriptUri} to ${target}...`);

  const params = new URLSearchParams({ uri: scriptUri, hosts });
  const response = await fetch(
    `${manageHost}/engine/script_hosts?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const text = await response.text();

  if (!response.ok) {
    const hint =
      response.status === 403
        ? " (this endpoint requires administrator privileges)"
        : "";
    throw new Error(
      `Failed to set hosts for ${scriptUri}: ${response.status} ${response.statusText}${hint}\n${text}`,
    );
  }

  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    result = { message: text };
  }

  const resulting = Array.isArray(result.hosts)
    ? result.hosts.join(", ")
    : result.hosts || result.message || "OK";
  console.log(`✓ ${scriptUri} → ${resulting}`);
}

async function main() {
  try {
    const config = parseArgs();

    if (config.scriptUris.length === 0) {
      console.error("Error: at least one --script-uri is required");
      console.error("");
      console.error("Usage:");
      console.error(
        "  node scripts/set-script-hosts.js --script-uri <uri> [--script-uri <uri> ...] [options]",
      );
      console.error("");
      console.error("Options:");
      console.error(
        "  --script-uri <uri>   URI of a script to bind (required, repeatable)",
      );
      console.error(
        "  --hosts <hosts>      Comma-separated hosts, '*' for every configured host,",
      );
      console.error(
        "                       or '' for the engine default host (default: SERVER_HOST)",
      );
      console.error(
        "  --dry-run            Show what would be changed (optional)",
      );
      process.exit(1);
    }

    const dryRunPrefix = config.dryRun ? "[DRY RUN] " : "";
    console.log(
      `${dryRunPrefix}Setting script hosts via ${manageHost}/engine/script_hosts...`,
    );
    console.log("");

    // Load authentication token (skip in dry-run mode)
    const token = config.dryRun ? "" : await loadAccessToken();
    if (!config.dryRun) {
      console.log("✓ Authentication token loaded");
      console.log("");
    }

    for (const scriptUri of config.scriptUris) {
      await setHosts(token, scriptUri, config.hosts, config.dryRun);
    }

    console.log("");
    console.log(
      `${dryRunPrefix}✓ Done: ${config.scriptUris.length} script(s) bound to ${config.hosts || "the engine default host"}`,
    );
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
