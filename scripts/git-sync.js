#!/usr/bin/env node
/// <reference types="node" />
require("dotenv").config();
// Move scripts between this engine and a GitHub repository
// (POST /engine/git/pull and POST /engine/git/push).
//
// Neither direction is described by a manifest in the repository. The layout
// is the contract: a script is a directory holding main.ts (or .js/.tsx/.jsx),
// every other file under it is one of that script's assets at the same
// relative path, and a repository with main.ts at its root is itself one
// script. What a manifest would have carried -- the local URI a script is
// served at, and who owns it -- is exactly what must not travel between
// installs, so it comes from the request instead: --prefix on a pull, the
// caller's own account on both.
//
// A push is a real write to GitHub: one commit, on somebody's repository,
// visible to everyone who can see it. It needs a stored credential
// (`make set-git-credentials`) and refuses when both sides have moved since
// the last sync -- the engine does not merge, it reports the divergence. Use
// --dry-run first if you want to see what would be sent.
//
// Usage:
//   node scripts/git-sync.js pull --repo <owner/repo> [options]
//   node scripts/git-sync.js push [--script <uri>] [options]
// Pull options:
//   --repo <owner/repo>  Repository to read, or any GitHub URL naming it (required)
//   --branch <branch>    Branch to read (default: the repository's default branch)
//   --prefix <prefix>    URI prefix the scripts land under (default: the repo name)
//   --force              Re-apply even when the repository has not moved
// Push options:
//   --script <uri>       Script to publish (default: virtual-world)
//   --repo <owner/repo>  Where to publish (default: where the script was pulled from)
//   --branch <branch>    Branch to write (default: the pulled branch, else the default)
//   --message <text>     Commit message (default: one naming the script)
//   --force              Publish even when the engine believes the repo has moved.
//                        GitHub still refuses a non-fast-forward update.
// Common options:
//   --dry-run            Print the request that would be sent, call nothing
//   --timeout <seconds>  Give up waiting for the server (default 120, 0 = never)
//   --json               Print the raw response
// Env:
//   MANAGE_HOST (default: https://manage.softagen.com) - engine management API

const { loadAccessToken } = require("./lib/token.js");

const manageHost = process.env.MANAGE_HOST || "https://manage.softagen.com";
const DEFAULT_SCRIPT_URI = "https://example.com/virtual-world";

/**
 * @typedef {{
 *   command: string,
 *   repo: string,
 *   branch: string,
 *   prefix: string,
 *   script: string,
 *   message: string,
 *   force: boolean,
 *   dryRun: boolean,
 *   json: boolean,
 *   timeoutMs: number,
 * }} Config
 */

/** @returns {Config} */
function parseArgs() {
  const args = process.argv.slice(2);
  /** @type {Config} */
  const config = {
    command: "",
    repo: "",
    branch: "",
    prefix: "",
    script: "",
    message: "",
    force: false,
    dryRun: false,
    json: false,
    timeoutMs: 120_000,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--repo":
        config.repo = args[++i];
        break;
      case "--branch":
        config.branch = args[++i];
        break;
      case "--prefix":
        config.prefix = args[++i];
        break;
      case "--script":
      case "--script-uri":
        config.script = args[++i];
        break;
      case "--message":
        config.message = args[++i];
        break;
      case "--force":
        config.force = true;
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      case "--json":
        config.json = true;
        break;
      case "--timeout": {
        const seconds = Number(args[++i]);
        if (!Number.isFinite(seconds) || seconds < 0) {
          console.error("--timeout takes a number of seconds");
          process.exit(1);
        }
        config.timeoutMs = seconds * 1000;
        break;
      }
      default:
        if (arg.startsWith("--")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        if (config.command) {
          console.error(`Unexpected argument: ${arg}`);
          process.exit(1);
        }
        config.command = arg;
    }
  }

  return config;
}

function usage() {
  console.error("Usage:");
  console.error(
    "  node scripts/git-sync.js pull --repo <owner/repo> [options]",
  );
  console.error("  node scripts/git-sync.js push [--script <uri>] [options]");
  console.error("");
  console.error("Options:");
  console.error("  --repo <owner/repo>  Repository (required for pull)");
  console.error("  --branch <branch>    Branch to read or write");
  console.error(
    "  --prefix <prefix>    pull: URI prefix the scripts land under",
  );
  console.error(
    `  --script <uri>       push: script to publish (default: ${DEFAULT_SCRIPT_URI})`,
  );
  console.error("  --message <text>     push: commit message");
  console.error(
    "  --force              Act even when nothing/too much has moved",
  );
  console.error("  --dry-run            Print the request, call nothing");
  console.error("  --timeout <seconds>  Server wait (default 120, 0 = never)");
  console.error("  --json               Print the raw response");
}

/**
 * @param {string} token
 * @param {string} path
 * @param {Record<string, unknown>} body
 * @param {number} timeoutMs
 * @returns {Promise<{status: number, statusText: string, text: string, parsed: any}>}
 */
async function post(token, path, body, timeoutMs) {
  /** @type {RequestInit} */
  const request = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
  if (timeoutMs > 0) request.signal = AbortSignal.timeout(timeoutMs);

  const response = await fetch(`${manageHost}${path}`, request);
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not every error body is JSON; the raw text is reported instead.
  }

  return {
    status: response.status,
    statusText: response.statusText,
    text,
    parsed,
  };
}

/**
 * @param {{status: number, statusText: string, text: string}} result
 * @param {Record<number, string>} hints
 * @returns {never}
 */
function fail(result, hints) {
  const hint = hints[result.status] ? ` (${hints[result.status]})` : "";
  throw new Error(
    `${result.status} ${result.statusText}${hint}\n${result.text}`,
  );
}

/**
 * Everything the response says, for a shape this script does not recognise.
 * Better an honest dump than a summary that quietly drops half the answer.
 *
 * @param {{text: string, parsed: any}} result
 */
function dump(result) {
  console.log(
    result.parsed ? JSON.stringify(result.parsed, null, 2) : result.text,
  );
}

/**
 * @param {any} value
 * @returns {number | null}
 */
function countOf(value) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number") return value;
  return null;
}

/**
 * @param {string} token
 * @param {Config} config
 * @returns {Promise<void>}
 */
async function pull(token, config) {
  if (!config.repo) {
    throw new Error("pull needs --repo <owner/repo>");
  }

  /** @type {Record<string, unknown>} */
  const body = { repo: config.repo };
  if (config.branch) body.branch = config.branch;
  if (config.prefix) body.prefix = config.prefix;
  if (config.force) body.force = true;

  if (config.dryRun) {
    console.log(`[DRY RUN] POST ${manageHost}/engine/git/pull`);
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  console.log(
    `Pulling ${config.repo}${config.branch ? `#${config.branch}` : ""} into ${manageHost}...`,
  );
  const result = await post(token, "/engine/git/pull", body, config.timeoutMs);

  if (result.status !== 200) {
    fail(result, {
      400: "unusable repository, branch or layout -- nothing was written",
      403: "the pull would write a script you do not own",
      404: "no such repository or branch, or it is private (store a credential with `make set-git-credentials`)",
      413: "the repository is larger than this engine will read",
      502: "GitHub refused or could not be reached",
    });
  }

  if (config.json) {
    console.log(result.text);
    return;
  }

  const scripts = Array.isArray(result.parsed?.scripts)
    ? result.parsed.scripts
    : null;
  if (!scripts) {
    dump(result);
    return;
  }

  for (const script of scripts) {
    const name = script.uri || script.script || "(unnamed script)";
    const written = countOf(script.assetsWritten ?? script.written);
    const deleted = countOf(script.assetsDeleted ?? script.deleted);
    const parts = [];
    if (script.status) parts.push(script.status);
    if (written !== null) parts.push(`${written} written`);
    if (deleted !== null) parts.push(`${deleted} deleted`);
    // A pull runs init() afterwards, and a script that pulled cleanly but
    // failed to start is the interesting case here, not a success.
    if (script.init && script.init.ran === false) {
      parts.push(
        `init did not run${script.init.reason ? `: ${script.init.reason}` : ""}`,
      );
    } else if (script.init && script.init.ok === false) {
      parts.push(
        `init FAILED${script.init.error ? `: ${script.init.error}` : ""}`,
      );
    } else if (script.init && script.init.ok === true) {
      parts.push("init ok");
    }
    console.log(`  ${name}${parts.length ? ` - ${parts.join(", ")}` : ""}`);
  }
  console.log("");
  console.log(`✓ Pulled ${scripts.length} script(s) from ${config.repo}`);
}

/**
 * @param {string} token
 * @param {Config} config
 * @returns {Promise<void>}
 */
async function push(token, config) {
  const script = config.script || DEFAULT_SCRIPT_URI;

  /** @type {Record<string, unknown>} */
  const body = { script };
  if (config.repo) body.repo = config.repo;
  if (config.branch) body.branch = config.branch;
  if (config.message) body.message = config.message;
  if (config.force) body.force = true;

  if (config.dryRun) {
    console.log(`[DRY RUN] POST ${manageHost}/engine/git/push`);
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  console.log(
    `Publishing ${script} to ${config.repo || "the repository it was pulled from"}...`,
  );
  const result = await post(token, "/engine/git/push", body, config.timeoutMs);

  if (result.status !== 200) {
    fail(result, {
      400: "unusable script, repository or branch -- nothing was written",
      403: "access denied, or no credential is stored (`make set-git-credentials`)",
      404: "no such repository, or the stored token cannot write to it",
      409: "both sides have moved -- review the difference, then --force if the repository should lose",
      502: "GitHub could not be reached",
    });
  }

  if (config.json) {
    console.log(result.text);
    return;
  }

  const commit = result.parsed?.commit;
  const sha = typeof commit === "string" ? commit : commit?.sha;
  if (!sha) {
    dump(result);
    return;
  }

  const written = countOf(result.parsed.written ?? result.parsed.filesWritten);
  const removed = countOf(result.parsed.removed ?? result.parsed.filesRemoved);
  const counts = [];
  if (written !== null) counts.push(`${written} written`);
  if (removed !== null) counts.push(`${removed} removed`);

  console.log(
    `✓ Committed ${String(sha).slice(0, 12)}${counts.length ? ` - ${counts.join(", ")}` : ""}`,
  );
  if (commit && commit.url) console.log(`  ${commit.url}`);
}

async function main() {
  try {
    const config = parseArgs();
    if (!config.command) {
      usage();
      process.exit(1);
    }

    const token = config.dryRun ? "" : await loadAccessToken();

    switch (config.command) {
      case "pull":
        await pull(token, config);
        break;
      case "push":
        await push(token, config);
        break;
      default:
        console.error(`Unknown command: ${config.command}`);
        console.error("");
        usage();
        process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === "TimeoutError") {
      console.error("Error: no answer from the server; raise --timeout");
    } else {
      console.error("Error:", message);
    }
    process.exit(1);
  }
}

main();
