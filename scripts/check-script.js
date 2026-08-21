#!/usr/bin/env node
/// <reference types="node" />
require("dotenv").config();
// Asks the server what a script would do if it were deployed
// (POST /engine/check), and reports the diagnostics it comes back with.
//
// The engine runs the script's init() in a sandbox, so this catches what local
// tooling structurally cannot: circular asset-backed imports, handler names a
// route registers but the entrypoint never defines, and an init() that blows
// the engine's startup budget. `make format lint typecheck` does not see any of
// those — the first one it happily accepts, and the other two only surface as
// 404s after a deploy.
//
// KNOWN LIMITATION: this cannot currently check virtual-world itself. Its
// init() calls the schema migration entry points (ensureWorldDatabaseSchema,
// ensureChatDatabaseSchema) and those stall the check sandbox indefinitely —
// the same behaviour that makes them untestable from `*.test.ts`. Every other
// phase of virtual-world's init passes in about a second, and other deployed
// scripts check in ~0.2s. Until the engine side is fixed, a check of
// virtual-world will time out; the target is still useful for other scripts
// and for candidate content that does not run a migration.
//
// By default it checks the copy that is *deployed*, the same way
// `scripts/run-tests.js` does. Pass --candidate to send the local entrypoint
// instead, to check a change before shipping it. Note that candidate content
// replaces only the entrypoint: the modules under assets/ still come from the
// server, so a --candidate run against locally-edited server modules is
// checking a mixture. Deploy the assets, then check.
//
// Usage:
//   node scripts/check-script.js [options]
//
// Options:
//   --script-uri <uri>    Script to check   (default https://example.com/virtual-world)
//   --script-path <path>  Entrypoint to send with --candidate
//                         (default src/virtual-world/virtual-world.js)
//   --candidate           Check the local entrypoint instead of the deployed one
//   --no-rollback         Keep the database writes the checked init() makes
//   --timeout <seconds>   Give up waiting for the server (default 60, 0 = never)
//   --json                Print the raw report as JSON
// Env:
//   MANAGE_HOST (default: https://manage.softagen.com) - engine management API

const fs = require("fs");
const path = require("path");

const manageHost = process.env.MANAGE_HOST || "https://manage.softagen.com";
const repoRoot = path.join(__dirname, "..");

const DEFAULTS = {
  scriptUri: "https://example.com/virtual-world",
  scriptPath: "src/virtual-world/virtual-world.js",
};

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
 * @typedef {{ severity?: string, message?: string, file?: string,
 *   line?: number, column?: number, code?: string, source?: string }} Diagnostic
 * @typedef {{ kind?: string, name?: string, method?: string,
 *   handler?: string }} Registration
 * @typedef {{ ran?: boolean, durationMs?: number, budgetMs?: number }} InitInfo
 * @typedef {{ scriptUri?: string, ok?: boolean, diagnostics?: Diagnostic[],
 *   registrations?: Registration[], init?: InitInfo, error?: string,
 *   message?: string }} CheckReport
 */

/**
 * @param {string} token
 * @param {string} scriptUri
 * @param {{ rollback: boolean, content?: string, timeoutMs: number }} options
 * @returns {Promise<{ report?: CheckReport, status: number, body: string }>}
 */
async function checkScript(token, scriptUri, options) {
  const query = new URLSearchParams({
    uri: scriptUri,
    rollback: String(options.rollback),
  });

  /** @type {RequestInit} */
  const request = {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  };
  if (options.content !== undefined) {
    request.headers = {
      ...request.headers,
      "Content-Type": "application/json",
    };
    request.body = JSON.stringify({
      uri: scriptUri,
      content: options.content,
      rollback: options.rollback,
    });
  }

  if (options.timeoutMs > 0) {
    request.signal = AbortSignal.timeout(options.timeoutMs);
  }

  const res = await fetch(`${manageHost}/engine/check?${query}`, request);
  const body = await res.text();
  try {
    return { report: JSON.parse(body), status: res.status, body };
  } catch {
    return { status: res.status, body };
  }
}

/**
 * `file:line:col` when the engine says where, empty when it does not. The
 * engine reports whole-script diagnostics with `file` set to the script URI,
 * which is just noise when we already printed it, so those come back empty.
 * @param {Diagnostic} diagnostic
 * @param {string} scriptUri
 * @returns {string}
 */
function locationOf(diagnostic, scriptUri) {
  if (!diagnostic.file || diagnostic.file === scriptUri) return "";
  const line = diagnostic.line === undefined ? "" : `:${diagnostic.line}`;
  const column =
    diagnostic.column === undefined || diagnostic.line === undefined
      ? ""
      : `:${diagnostic.column}`;
  return `${diagnostic.file}${line}${column}`;
}

/**
 * @param {CheckReport} report
 * @param {string} scriptUri
 */
function printReport(report, scriptUri) {
  const diagnostics = report.diagnostics || [];

  for (const diagnostic of diagnostics) {
    const severity = (diagnostic.severity || "error").toLowerCase();
    const mark = severity === "error" ? "✗" : "!";
    const where = locationOf(diagnostic, scriptUri);
    const header = [diagnostic.code && `[${diagnostic.code}]`, where]
      .filter(Boolean)
      .join(" ");
    console.log(`  ${mark} ${header || severity}`);
    // The engine's messages are paragraphs, not one-liners — they explain the
    // failure and how to fix it — so give them their own indented block.
    for (const line of String(diagnostic.message || "").split("\n")) {
      if (line.trim()) console.log(`      ${line.trim()}`);
    }
  }

  if (diagnostics.length === 0) console.log("  ✓ no diagnostics");

  const init = report.init;
  if (init) {
    const budget = init.budgetMs ? ` of ${init.budgetMs}ms budget` : "";
    console.log(
      init.ran
        ? `  · init() ran in ${init.durationMs}ms${budget}`
        : `  · init() did not run`,
    );
  }

  const registrations = report.registrations || [];
  if (registrations.length > 0) {
    const byKind = {};
    for (const registration of registrations) {
      const kind = registration.kind || "other";
      byKind[kind] = (byKind[kind] || 0) + 1;
    }
    const summary = Object.entries(byKind)
      .map(([kind, count]) => `${count} ${kind}${count === 1 ? "" : "s"}`)
      .join(", ");
    console.log(`  · would register ${summary} (--json to list them)`);
  } else {
    console.log(`  · would register nothing`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let scriptUri = DEFAULTS.scriptUri;
  let scriptPath = DEFAULTS.scriptPath;
  let candidate = false;
  let rollback = true;
  let timeoutMs = 60_000;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--script-uri":
        scriptUri = args[++i];
        break;
      case "--script-path":
        scriptPath = args[++i];
        break;
      case "--candidate":
        candidate = true;
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
        throw new Error(`Unknown option: ${args[i]}`);
    }
  }

  let content;
  if (candidate) {
    // resolve, not join: an absolute --script-path should mean what it says.
    content = fs.readFileSync(path.resolve(repoRoot, scriptPath), "utf8");
  }

  const source = candidate ? `${scriptPath} (candidate)` : "deployed copy";
  console.log(
    `Checking ${scriptUri}\n  source: ${source}\n  via: ${manageHost}\n`,
  );

  const token = loadToken();
  let result;
  try {
    result = await checkScript(token, scriptUri, {
      rollback,
      content,
      timeoutMs,
    });
  } catch (err) {
    // The check runs the script's init() for real, so it can legitimately take
    // a while — but a stall far past that is worth distinguishing from a slow
    // script, and the server's own logs are where to tell the two apart.
    if (/** @type {Error} */ (err).name === "TimeoutError") {
      console.error(
        `✗ no answer in ${timeoutMs / 1000}s. Raise --timeout, or check ` +
          `'GET ${manageHost}/engine/script_logs?uri=...' to see whether ` +
          `init() ran at all.`,
      );
      process.exit(1);
    }
    throw err;
  }
  const { report, status, body } = result;

  if (json) {
    console.log(body);
  }

  if (!report) {
    // The endpoint answers JSON for everything it handles, refusals included,
    // so an unparseable 404 is the route itself missing.
    console.error(
      status === 404
        ? `✗ ${manageHost} has no /engine/check — the server predates the checker`
        : `✗ HTTP ${status}: ${body.slice(0, 200)}`,
    );
    process.exit(1);
  }
  if (status === 404) {
    console.error("✗ not deployed — run 'make deploy-changed' first");
    process.exit(1);
  }
  if (status === 403) {
    console.error("✗ not permitted: you must own this script or be admin");
    process.exit(1);
  }
  if (report.error) {
    console.error(`✗ check failed: ${report.error}`);
    process.exit(1);
  }

  if (!json) printReport(report, scriptUri);

  console.log("");
  if (report.ok === false) {
    console.error("✗ Check failed.");
    process.exit(1);
  }
  console.log("✓ Check passed.");
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
