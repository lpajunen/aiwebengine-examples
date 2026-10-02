#!/usr/bin/env node
/// <reference types="node" />
require("dotenv").config();
// Manage the caller's git host credentials (set_git_credential,
// list_git_credentials, delete_git_credential), which is what pull_from_git spends when it
// reads a repository the caller can see but the public internet cannot.
//
// The engine encrypts the token at rest and never gives it back -- neither
// this endpoint nor any other returns it, and scripts cannot reach it -- so
// the only copy that can leak is the one on this side of the wire. That is
// why the token is prompted for by default rather than taken from a flag:
// `make set-git-credentials TOKEN=ghp_...` lands in shell history and in the
// process list, and a personal access token is worth more than the keystrokes
// that saves.
//
// The host is asked to confirm the token before the engine stores it, so a
// mistyped or already-revoked token fails here rather than silently later.
//
// Usage:
//   node scripts/git-credentials.js set [options]     # store a token
//   node scripts/git-credentials.js list              # what is stored
//   node scripts/git-credentials.js delete [options]  # forget one host
// Options:
//   --host <host>        Git host (default: github.com)
//   --token <token>      The token itself. Prefer --token-stdin or the prompt:
//                        this leaves the token in shell history.
//   --token-stdin        Read the token from stdin (trailing newline stripped)
//   --token-env <NAME>   Read the token from the named environment variable
//   --json               Print the raw response
// Env:
//   MANAGE_HOST (default: https://manage.softagen.com) - engine management API
//   GIT_TOKEN - used by `set` when no token option is given and there is no
//               terminal to prompt on

const { loadAccessToken } = require("./lib/token.js");

const manageHost = process.env.MANAGE_HOST || "https://manage.softagen.com";
const DEFAULT_HOST = "github.com";

const KEY_INTERRUPT = String.fromCharCode(3); // Ctrl-C
const KEY_DELETE = String.fromCharCode(127);

/**
 * @typedef {{
 *   command: string,
 *   host: string,
 *   token: string | null,
 *   tokenStdin: boolean,
 *   tokenEnv: string | null,
 *   json: boolean,
 * }} Config
 */

/** @returns {Config} */
function parseArgs() {
  const args = process.argv.slice(2);
  /** @type {Config} */
  const config = {
    command: "",
    host: "",
    token: null,
    tokenStdin: false,
    tokenEnv: null,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--host":
        config.host = args[++i];
        break;
      case "--token":
        config.token = args[++i];
        break;
      case "--token-stdin":
        config.tokenStdin = true;
        break;
      case "--token-env":
        config.tokenEnv = args[++i];
        break;
      case "--json":
        config.json = true;
        break;
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
  console.error("  node scripts/git-credentials.js set [options]");
  console.error("  node scripts/git-credentials.js list");
  console.error("  node scripts/git-credentials.js delete [options]");
  console.error("");
  console.error("Options:");
  console.error(`  --host <host>        Git host (default: ${DEFAULT_HOST})`);
  console.error(
    "  --token <token>      The token (ends up in shell history -- prefer the prompt)",
  );
  console.error("  --token-stdin        Read the token from stdin");
  console.error(
    "  --token-env <NAME>   Read the token from the named environment variable",
  );
  console.error("  --json               Print the raw response");
}

/**
 * Read a secret from the terminal without echoing it.
 *
 * @param {string} question
 * @returns {Promise<string>}
 */
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(
        new Error(
          "No terminal to prompt on -- pass --token-stdin, --token-env <NAME>, or set GIT_TOKEN",
        ),
      );
      return;
    }

    let value = "";
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    /** @param {boolean} newline */
    const cleanup = (newline) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      if (newline) process.stdout.write("\n");
    };

    /** @param {string} chunk */
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          cleanup(true);
          resolve(value);
          return;
        }
        if (ch === KEY_INTERRUPT) {
          // Raw mode swallows the interrupt, so honour it by hand.
          cleanup(true);
          reject(new Error("Cancelled"));
          return;
        }
        if (ch === KEY_DELETE || ch === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        // Ignore the other control characters (arrow keys arrive as these).
        if (ch < " ") continue;
        value += ch;
      }
    };

    stdin.on("data", onData);
  });
}

/** @returns {Promise<string>} */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")));
    process.stdin.on("error", reject);
  });
}

/**
 * Where the token comes from, in decreasing order of how deliberate it is.
 *
 * @param {Config} config
 * @returns {Promise<string>}
 */
async function resolveToken(config) {
  if (config.token) return config.token;
  if (config.tokenStdin) return readStdin();
  if (config.tokenEnv) {
    const fromEnv = process.env[config.tokenEnv];
    if (!fromEnv) {
      throw new Error(`Environment variable ${config.tokenEnv} is empty`);
    }
    return fromEnv;
  }
  if (!process.stdin.isTTY && process.env.GIT_TOKEN) {
    return process.env.GIT_TOKEN;
  }
  return promptHidden(`Personal access token for ${config.host}: `);
}

/**
 * @param {string} token
 * @param {string} operation
 * @param {unknown} [body]
 * @returns {Promise<{status: number, statusText: string, text: string, parsed: any}>}
 */
async function call(token, operation, body) {
  /** @type {Record<string, string>} */
  const headers = { Authorization: `Bearer ${token}` };
  headers["Content-Type"] = "application/json";

  const response = await fetch(`${manageHost}/engine/${operation}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });

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
 * @param {string} token
 * @param {Config} config
 * @returns {Promise<void>}
 */
async function setCredential(token, config) {
  const secret = (await resolveToken(config)).trim();
  if (!secret) throw new Error("No token given; nothing was sent");

  console.log(`Storing a token for ${config.host} via ${manageHost}...`);
  const result = await call(token, "set_git_credential", {
    token: secret,
    host: config.host,
  });

  if (result.status !== 200) {
    fail(result, {
      400: "missing token, or a host this engine does not support",
      401: "the host rejected the token -- nothing was stored",
      403: "access denied, or this engine stores no git credentials",
    });
  }

  if (config.json) {
    console.log(result.text);
    return;
  }

  const account =
    result.parsed && (result.parsed.account || result.parsed.login);
  console.log(
    `✓ Stored for ${config.host}${account ? ` as ${account}` : ""} — the engine never returns it again`,
  );
}

/**
 * @param {string} token
 * @param {Config} config
 * @returns {Promise<void>}
 */
async function listCredentials(token, config) {
  const result = await call(token, "list_git_credentials");
  if (result.status !== 200) fail(result, { 403: "access denied" });

  if (config.json) {
    console.log(result.text);
    return;
  }

  const rows = Array.isArray(result.parsed)
    ? result.parsed
    : result.parsed && Array.isArray(result.parsed.credentials)
      ? result.parsed.credentials
      : null;

  if (!rows) {
    console.log(result.text);
    return;
  }
  if (rows.length === 0) {
    console.log("No git credentials stored.");
    return;
  }

  for (const row of rows) {
    const parts = [row.host || "(unknown host)"];
    if (row.account) parts.push(row.account);
    if (row.created_at) parts.push(`added ${row.created_at}`);
    if (row.last_used_at) parts.push(`last used ${row.last_used_at}`);
    console.log(`  ${parts.join("  ·  ")}`);
  }
}

/**
 * @param {string} token
 * @param {Config} config
 * @returns {Promise<void>}
 */
async function deleteCredential(token, config) {
  const result = await call(token, "delete_git_credential", {
    host: config.host,
  });
  if (result.status !== 200) fail(result, { 403: "access denied" });

  if (config.json) {
    console.log(result.text);
    return;
  }

  // The endpoint reports whether there was anything to remove; either way the
  // host is unauthenticated afterwards, which is what was asked for.
  const removed =
    result.parsed && typeof result.parsed === "object"
      ? result.parsed.removed !== false
      : true;
  console.log(
    removed
      ? `✓ Removed the credential for ${config.host}`
      : `✓ Nothing stored for ${config.host}`,
  );
}

async function main() {
  try {
    const config = parseArgs();
    if (!config.command) {
      usage();
      process.exit(1);
    }
    if (!config.host) config.host = DEFAULT_HOST;

    const token = await loadAccessToken();

    switch (config.command) {
      case "set":
        await setCredential(token, config);
        break;
      case "list":
        await listCredentials(token, config);
        break;
      case "delete":
      case "forget":
        await deleteCredential(token, config);
        break;
      default:
        console.error(`Unknown command: ${config.command}`);
        console.error("");
        usage();
        process.exit(1);
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
