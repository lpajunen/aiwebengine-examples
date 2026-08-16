#!/usr/bin/env node
/// <reference types="node" />
require("dotenv").config();
// Runs the test modules the example scripts carry, on the server.
//
// Tests are assets named `*.test.ts` (or .js/.jsx/.tsx) living beside the code
// they cover, so this finds them the same way the engine does — by scanning the
// assets directories — and asks the server to run each owning script's suite
// (POST /engine/run_tests). Nothing executes locally: the engine runs the code
// in the same sandbox that serves it.
//
// The tests that run are the ones *deployed*, not the ones on disk. Deploy
// first (`make deploy-changed`) or a passing run may be telling you about an
// older copy of the file.
//
// Usage:
//   node scripts/run-tests.js [options]
//
// Options:
//   --script-uri <uri>  Test only this script, instead of every project found
//   --filter <text>     Run only cases whose name contains this text
//   --no-rollback       Keep the database writes the tests make
//   --list              Print what would run, call nothing
// Env:
//   SERVER_HOST (default: https://softagen.com)

const fs = require("fs");
const path = require("path");

const serverHost = process.env.SERVER_HOST || "https://softagen.com";
const repoRoot = path.join(__dirname, "..");
const srcDir = path.join(repoRoot, "src");

// Script URIs that do not follow the directory convention below.
const SCRIPT_URI_OVERRIDES = {
  import_example: "https://example.com/import-example",
};

/**
 * The URI a project directory is deployed under. Directories use snake_case or
 * kebab-case; the URIs are kebab-case, which is why the two known ones differ
 * only by that. Anything that deviates belongs in SCRIPT_URI_OVERRIDES.
 * @param {string} projectDir
 * @returns {string}
 */
function scriptUriFor(projectDir) {
  return (
    SCRIPT_URI_OVERRIDES[projectDir] ||
    `https://example.com/${projectDir.replace(/_/g, "-")}`
  );
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
 * @param {string} dir
 * @returns {string[]} paths of test modules below `dir`, relative to it
 */
function findTestModules(dir) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} current @param {string} prefix */
  function walk(current, prefix) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const logical = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(abs, logical);
      } else if (/\.test\.(ts|js|jsx|tsx)$/.test(entry.name)) {
        found.push(logical);
      }
    }
  }
  walk(dir, "");
  return found.sort();
}

/**
 * Every project whose assets carry at least one test module.
 * @returns {{ project: string, scriptUri: string, modules: string[] }[]}
 */
function discoverProjects() {
  let dirs;
  try {
    dirs = fs.readdirSync(srcDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return dirs
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      project: entry.name,
      scriptUri: scriptUriFor(entry.name),
      modules: findTestModules(path.join(srcDir, entry.name, "assets")),
    }))
    .filter((candidate) => candidate.modules.length > 0);
}

/**
 * @typedef {{ name: string, file?: string, status: string, durationMs: number,
 *   error?: string }} TestCase
 * @typedef {{ success: boolean, total: number, passed: number, failed: number,
 *   durationMs: number, timedOut: boolean, cases: TestCase[], error?: string,
 *   message?: string }} TestReport
 */

/**
 * @param {string} token
 * @param {string} scriptUri
 * @param {{ filter?: string, rollback: boolean }} options
 * @returns {Promise<{ report?: TestReport, status: number, body: string }>}
 */
async function runTests(token, scriptUri, options) {
  const query = new URLSearchParams({
    uri: scriptUri,
    rollback: String(options.rollback),
  });
  if (options.filter) query.set("filter", options.filter);

  const res = await fetch(`${serverHost}/engine/run_tests?${query}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  try {
    return { report: JSON.parse(body), status: res.status, body };
  } catch {
    return { status: res.status, body };
  }
}

/** @param {TestReport} report */
function printReport(report) {
  for (const testCase of report.cases || []) {
    if (testCase.status === "passed") continue;
    const where = testCase.file ? ` (${testCase.file})` : "";
    console.log(`    ✗ ${testCase.name}${where}`);
    for (const line of String(testCase.error || "").split("\n")) {
      if (line.trim()) console.log(`        ${line}`);
    }
  }

  if (report.total === 0) {
    // The engine found no test modules for this script — almost always a
    // deploy that has not happened yet, since we only ask about projects whose
    // assets carry tests locally.
    console.log(`    ! no tests on the server — deploy them first`);
    return;
  }

  const summary = `${report.passed}/${report.total} passed in ${report.durationMs}ms`;
  console.log(
    report.success
      ? `    ✓ ${summary}`
      : `    ✗ ${summary}${report.timedOut ? " (timed out)" : ""}`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  let onlyUri = null;
  let filter;
  let rollback = true;
  let list = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--script-uri":
        onlyUri = args[++i];
        break;
      case "--filter":
        filter = args[++i];
        break;
      case "--no-rollback":
        rollback = false;
        break;
      case "--list":
        list = true;
        break;
      default:
        throw new Error(`Unknown option: ${args[i]}`);
    }
  }

  const discovered = discoverProjects();
  const targets = onlyUri
    ? [{ project: onlyUri, scriptUri: onlyUri, modules: [] }]
    : discovered;

  if (targets.length === 0) {
    console.log(
      "No test modules found. Tests are assets named '*.test.ts' under src/<project>/assets/.",
    );
    return;
  }

  if (list) {
    console.log(`Would run tests for ${targets.length} script(s):`);
    for (const target of targets) {
      console.log(`  ${target.scriptUri}`);
      target.modules.forEach((module) => console.log(`    - ${module}`));
    }
    return;
  }

  console.log(`Running tests on ${serverHost}\n`);
  const token = loadToken();
  let failed = 0;

  for (const target of targets) {
    console.log(`  ${target.scriptUri}`);
    const { report, status, body } = await runTests(token, target.scriptUri, {
      filter,
      rollback,
    });

    if (!report) {
      // The endpoint answers JSON for everything it handles, including its
      // refusals — so an unparseable 404 is the route itself missing.
      console.log(
        status === 404
          ? `    ✗ ${serverHost} has no /engine/run_tests — the server predates the test runner`
          : `    ✗ HTTP ${status}: ${body.slice(0, 200)}`,
      );
      failed++;
      continue;
    }
    if (status === 404) {
      console.log(`    ! not deployed — run 'make deploy-changed' first`);
      failed++;
      continue;
    }
    if (status === 403) {
      console.log(`    ✗ not permitted: you must own this script or be admin`);
      failed++;
      continue;
    }
    if (report.error) {
      console.log(`    ✗ run failed: ${report.error}`);
      failed++;
      continue;
    }

    printReport(report);
    // A script with no tests on the server is not a pass: the modules exist
    // here, so something is out of step.
    if (!report.success) failed++;
  }

  console.log("");
  if (failed > 0) {
    console.error(`✗ ${failed} of ${targets.length} script(s) did not pass.`);
    process.exit(1);
  }
  console.log(`✓ All ${targets.length} script(s) passed.`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
