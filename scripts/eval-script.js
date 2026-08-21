#!/usr/bin/env node
/// <reference types="node" />
require("dotenv").config();
// Evaluates a snippet inside a deployed script's sandbox (POST /engine/eval)
// and prints what it returned, what it logged, and how long it took.
//
// This is the "ask the server a question" tool: reading a table, calling one
// server function, checking what a helper actually returns. Before it existed
// the only way to do any of that was to write a *.test.ts, deploy it, run the
// suite, and read the answer out of an assertion message.
//
// Database writes are rolled back unless you pass --no-rollback. Asset writes,
// secret writes and outbound HTTP are real either way.
//
// SCOPE: the snippet sees the *entrypoint's* top-level bindings plus the
// engine globals — and `import` is not supported, static or dynamic. For
// virtual-world that means only what virtual-world.js itself imports is
// reachable: VWORLD_NPC_TABLE yes, VWORLD_PLAYER_POSITION_TABLE no. Use the
// literal table name for anything the entrypoint does not import.
//
// Usage:
//   node scripts/eval-script.js [options] [snippet]
//   make eval SRC='JSON.parse(database.query("vworld_npcs", "{}", 3))'
//   make eval FILE=snippet.js
//
// Options:
//   --script-uri <uri>   Sandbox to evaluate in (default https://example.com/virtual-world)
//   --file <path>        Read the snippet from a file, or '-' for stdin
//   --no-rollback        Keep the database writes the snippet makes
//   --timeout <seconds>  Evaluation budget (default 30; the engine clamps it)
//   --json               Print the raw report as JSON
// Env:
//   MANAGE_HOST (default: https://manage.softagen.com) - engine management API

const fs = require("fs");
const path = require("path");

const manageHost = process.env.MANAGE_HOST || "https://manage.softagen.com";
const repoRoot = path.join(__dirname, "..");

const DEFAULT_SCRIPT_URI = "https://example.com/virtual-world";

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
 * @typedef {{ level?: string, message?: string, timestampMs?: number }} ConsoleLine
 * @typedef {{ scriptUri?: string, ok?: boolean, value?: unknown,
 *   valueType?: string, console?: ConsoleLine[], durationMs?: number,
 *   rolledBack?: boolean, error?: string, message?: string }} EvalReport
 */

/**
 * @param {string} token
 * @param {string} scriptUri
 * @param {{ source: string, rollback: boolean, timeoutMs: number }} options
 * @returns {Promise<{ report?: EvalReport, status: number, body: string }>}
 */
async function evaluate(token, scriptUri, options) {
  const query = new URLSearchParams({
    uri: scriptUri,
    rollback: String(options.rollback),
  });
  if (options.timeoutMs > 0) {
    query.set("timeout_ms", String(options.timeoutMs));
  }

  const res = await fetch(`${manageHost}/engine/eval?${query}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uri: scriptUri,
      source: options.source,
      rollback: options.rollback,
      timeoutMs: options.timeoutMs,
    }),
    // The engine enforces its own budget; this is only a floor under a
    // connection that never answers at all.
    signal: AbortSignal.timeout(Math.max(options.timeoutMs, 30_000) + 30_000),
  });
  const body = await res.text();
  try {
    return { report: JSON.parse(body), status: res.status, body };
  } catch {
    return { status: res.status, body };
  }
}

/** @param {EvalReport} report */
function printReport(report) {
  for (const line of report.console || []) {
    const level = (line.level || "LOG").toUpperCase();
    console.log(`  ${level.padEnd(5)} ${line.message}`);
  }

  if (report.ok === false) {
    // The engine packs message and stack into one string as
    // "<message>, \nStack:     at ..." — split it so the message stays
    // readable, and drop the comma it leaves dangling.
    const lines = String(report.error || "unknown error").split("\n");
    for (const line of lines) {
      const text = line.trim().replace(/,$/, "");
      if (text) console.log(`  ✗ ${text}`);
    }
  } else if (report.valueType === "undefined") {
    console.log("  → undefined");
  } else if (typeof report.value === "string") {
    console.log(`  → ${report.value}`);
  } else {
    console.log(`  → ${JSON.stringify(report.value, null, 2)}`);
  }

  const kept = report.rolledBack === false ? ", writes kept" : "";
  console.log(`  · ${report.durationMs}ms${kept}`);
}

/** @returns {Promise<string>} */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  let scriptUri = DEFAULT_SCRIPT_URI;
  let file;
  let rollback = true;
  let timeoutMs = 30_000;
  let json = false;
  /** @type {string[]} */
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--script-uri":
        scriptUri = args[++i];
        break;
      case "--file":
        file = args[++i];
        break;
      case "--no-rollback":
        rollback = false;
        break;
      case "--timeout":
        timeoutMs = Number(args[++i]) * 1000;
        if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
          throw new Error("--timeout takes a number of seconds");
        }
        break;
      case "--json":
        json = true;
        break;
      default:
        if (args[i].startsWith("--")) {
          throw new Error(`Unknown option: ${args[i]}`);
        }
        positional.push(args[i]);
    }
  }

  let source;
  if (file === "-") {
    source = await readStdin();
  } else if (file) {
    source = fs.readFileSync(path.resolve(repoRoot, file), "utf8");
  } else {
    source = positional.join(" ");
  }
  if (!source.trim()) {
    throw new Error(
      "No snippet. Pass one as an argument, or use --file <path> (- for stdin).",
    );
  }

  const token = loadToken();
  const { report, status, body } = await evaluate(token, scriptUri, {
    source,
    rollback,
    timeoutMs,
  });

  if (json) {
    console.log(body);
    process.exit(report && report.ok === false ? 1 : 0);
  }

  if (!report) {
    console.error(
      status === 404
        ? `✗ ${manageHost} has no /engine/eval — the server predates it`
        : `✗ HTTP ${status}: ${body.slice(0, 200)}`,
    );
    process.exit(1);
  }
  if (status === 404) {
    console.error(`✗ no such script: ${scriptUri}`);
    process.exit(1);
  }
  if (status === 403) {
    console.error("✗ not permitted: you must own this script or be admin");
    process.exit(1);
  }

  printReport(report);
  if (report.ok === false) process.exit(1);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
