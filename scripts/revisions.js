#!/usr/bin/env node
/// <reference types="node" />
require("dotenv").config();
// Reads and moves a script's revisions (GET/POST /engine/revisions*, and
// GET/POST/DELETE /engine/deploy).
//
// Every write to a script records a revision of the whole thing, so this is the
// history a caller editing through /engine/assets has instead of a checkout —
// and, more usefully, it is how writing and deploying became two acts. A pinned
// script keeps answering requests from the revision it is pinned to while
// writes advance `head` behind it: the engine does not even run init() for
// those writes ("reason":"pinned"). That is the loop this tool exists for:
//
//   make pin              # freeze what is being served (revisions.js pin)
//   make deploy-changed   # push freely, production does not move
//   make check-head       # check-script.js --revision head
//   make test-head        # run-tests.js --revision head
//   make promote          # serve head, still pinned (revisions.js pin head)
//   make unpin            # or go back to following head
//
// Two things the endpoints will not tell you unless asked directly:
//
//   * `initOk` is a record of a revision having run, not a verdict on it. A
//     revision written while the script is pinned never ran: it comes back
//     `initOk: null`, and has still been seen reported as `lastGood`, whose
//     init() then threw when it was finally deployed. Do not read `lastGood` as
//     "safe to deploy" for code that has never been served —
//     `check-script.js --revision head` is what answers that.
//   * Pinning does not vet what you pin. Deploying a revision whose init()
//     throws succeeds, and the script is then broken; `pin last-good` is the
//     way back, and it takes about a second.
//
// Usage:
//   node scripts/revisions.js <command> [options]
//
// Commands:
//   status                    What is served, what head is, how far apart
//   list                      Revision history, newest first
//   diff                      Unified diff between two revisions
//   label <revision> [name]   Name a revision; omit the name to clear it
//   revert <revision>         Restore the files a revision held, as a new one
//   pin [revision]            Serve this revision and stop following writes
//                             (default: whatever is being served right now)
//   unpin                     Follow head again
//
// Options:
//   --script-uri <uri>  Script to act on (default https://example.com/virtual-world)
//   --asset <path>      list: only revisions in which this file changed
//   --limit <n>         list: keep at most this many (default 20)
//   --files             list: include each revision's file manifest
//   --from <rev>        diff: older side (default: what --to was computed from)
//   --to <rev>          diff: newer side (default head)
//   --context <n>       diff: lines of context around each hunk (default 3)
//   --dry-run           revert: report what would change, change nothing
//   --force             revert: restore even if the target does not bundle
//   --reinit <when>     revert: 'after' (default) or 'never'
//   --json              Print the raw response instead of a summary
//
// A <revision> is a number, `head`, `last-good`, or a label.
// Env:
//   MANAGE_HOST (default: https://manage.softagen.com) - engine management API

const { loadAccessToken } = require("./lib/token.js");

const manageHost = process.env.MANAGE_HOST || "https://manage.softagen.com";

const DEFAULT_SCRIPT_URI = "https://example.com/virtual-world";

/**
 * @typedef {{ revision: number, parent: number | null, origin?: string,
 *   label?: string | null, at?: string, by?: string | null, files?: number,
 *   bytes?: number, initOk?: boolean | null, initError?: string | null }} Revision
 * @typedef {{ revision: number, at?: string, by?: string | null,
 *   initOk?: boolean | null, initError?: string | null }} Deployment
 * @typedef {{ success?: boolean, error?: string, message?: string,
 *   script?: string, revisions?: Revision[], history?: object[],
 *   head?: number, lastGood?: number | null, pinned?: boolean,
 *   serving?: number | null, behind?: number | null,
 *   deployment?: Deployment | null, deployed?: Deployment,
 *   init?: { ran?: boolean, success?: boolean, durationMs?: number,
 *     error?: string | null, reason?: string },
 *   from?: number, to?: number, files?: object[], truncated?: boolean,
 *   revertedTo?: number, dryRun?: boolean,
 *   changed?: { written?: number, deleted?: number, root?: boolean },
 *   schema?: { matches?: boolean, warnings?: string[] },
 *   label?: string | null }} EngineResponse
 */

/**
 * @param {string} token
 * @param {string} method
 * @param {string} path
 * @param {Record<string, string>} params
 * @returns {Promise<{ payload?: EngineResponse, status: number, body: string }>}
 */
async function call(token, method, path, params) {
  const query = new URLSearchParams(params);
  const res = await fetch(`${manageHost}${path}?${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  try {
    return { payload: JSON.parse(body), status: res.status, body };
  } catch {
    return { status: res.status, body };
  }
}

/**
 * Every command fails the same three ways, and each one means something
 * specific enough to be worth saying rather than printing the status code.
 * @param {{ payload?: EngineResponse, status: number, body: string }} result
 * @param {string} what
 * @returns {EngineResponse}
 */
function unwrap(result, what) {
  const { payload, status, body } = result;
  if (!payload) {
    // The endpoints answer JSON for everything they handle, refusals included,
    // so an unparseable 404 is the route itself missing.
    if (status === 404) {
      throw new Error(
        `${manageHost} has no ${what} — the server predates script revisions`,
      );
    }
    throw new Error(`HTTP ${status}: ${body.slice(0, 200)}`);
  }
  if (status === 403) {
    throw new Error("not permitted: you must own this script or be admin");
  }
  if (status === 404) {
    throw new Error("no such script — deploy it first");
  }
  if (payload.error) throw new Error(payload.error);
  if (status >= 400) {
    throw new Error(`HTTP ${status}: ${payload.message || body.slice(0, 200)}`);
  }
  return payload;
}

/** @param {string | undefined} at */
function when(at) {
  if (!at) return "";
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? at : parsed.toISOString();
}

/** @param {Revision} revision @param {EngineResponse} report */
function describeRevision(revision, report) {
  const marks = [];
  if (revision.revision === report.head) marks.push("head");
  if (revision.revision === report.serving) marks.push("serving");
  if (revision.revision === report.lastGood) marks.push("last-good");
  if (revision.label) marks.push(`"${revision.label}"`);
  // initOk is only measured when a revision actually runs, so distinguish
  // "init failed" from "never ran" instead of calling both of them a state.
  const init =
    revision.initOk === false ? "✗ init" : revision.initOk ? "" : "· unrun";
  const size = revision.files ? `${revision.files} files` : "";
  return [
    `  r${String(revision.revision).padEnd(4)}`,
    when(revision.at).replace("T", " ").slice(0, 19),
    marks.length ? `[${marks.join(", ")}]` : "",
    size,
    init,
  ]
    .filter(Boolean)
    .join("  ");
}

/**
 * @param {string} token
 * @param {string} scriptUri
 * @param {boolean} json
 * @returns {Promise<EngineResponse>}
 */
async function printStatus(token, scriptUri, json) {
  const result = await call(token, "GET", "/engine/deploy", {
    script: scriptUri,
  });
  const report = unwrap(result, "/engine/deploy");
  if (json) {
    console.log(result.body);
    return report;
  }

  if (report.pinned) {
    const behind = report.behind || 0;
    console.log(`  pinned to r${report.serving}, head is r${report.head}`);
    console.log(
      behind > 0
        ? `  ${behind} revision(s) written since — writes are not being served`
        : `  head is what is being served`,
    );
    const deployment = report.deployment;
    if (deployment) {
      console.log(`  deployed at ${when(deployment.at)}`);
      if (deployment.initError) {
        console.log(`  ✗ init failed: ${deployment.initError.split("\n")[0]}`);
      }
    }
  } else {
    console.log(`  following head — serving r${report.serving}`);
  }
  return report;
}

/**
 * @param {string} token
 * @param {string} scriptUri
 * @param {{ asset?: string, limit: number, files: boolean, json: boolean }} options
 */
async function listRevisions(token, scriptUri, options) {
  /** @type {Record<string, string>} */
  const params = { script: scriptUri, limit: String(options.limit) };
  if (options.asset) params.asset = options.asset;
  if (options.files) params.files = "true";

  const result = await call(token, "GET", "/engine/revisions", params);
  const report = unwrap(result, "/engine/revisions");
  if (options.json) {
    console.log(result.body);
    return;
  }

  // With --asset the endpoint answers a per-file history instead: one entry per
  // revision in which that file changed, carrying its sha256 rather than the
  // revision's own bookkeeping.
  if (options.asset) {
    const history = report.history || [];
    if (history.length === 0) {
      console.log(`  no revisions touched ${options.asset}`);
      return;
    }
    for (const entry of history) {
      const e = /** @type {{ revision: number, sha256?: string,
        bytes?: number }} */ (entry);
      console.log(
        `  r${String(e.revision).padEnd(4)}  ${String(e.sha256).slice(0, 12)}  ${e.bytes} bytes`,
      );
    }
    return;
  }

  // The deployment is a separate call, but "which one is being served" is the
  // thing you came to this list to find out, so pay for it.
  const deployment = await call(token, "GET", "/engine/deploy", {
    script: scriptUri,
  });
  if (deployment.payload) report.serving = deployment.payload.serving;

  const revisions = report.revisions || [];
  if (revisions.length === 0) {
    console.log("  no revisions");
    return;
  }
  for (const revision of revisions) {
    console.log(describeRevision(revision, report));
    if (revision.initError) {
      console.log(`          ${revision.initError.split("\n")[0]}`);
    }
  }
  console.log(
    `\n  head r${report.head}` +
      (report.lastGood ? `, last known good r${report.lastGood}` : "") +
      (report.serving ? `, serving r${report.serving}` : ""),
  );
}

/**
 * @param {string} token
 * @param {string} scriptUri
 * @param {{ from?: string, to?: string, context?: number, json: boolean }} options
 */
async function diffRevisions(token, scriptUri, options) {
  /** @type {Record<string, string>} */
  const params = { script: scriptUri };
  if (options.from) params.from = options.from;
  if (options.to) params.to = options.to;
  if (options.context !== undefined) params.context = String(options.context);

  const result = await call(token, "GET", "/engine/revisions/diff", params);
  const report = unwrap(result, "/engine/revisions/diff");
  if (options.json) {
    console.log(result.body);
    return;
  }

  const files = report.files || [];
  console.log(`  r${report.from} → r${report.to}\n`);
  if (files.length === 0) {
    console.log("  no differences");
    return;
  }
  for (const file of files) {
    const f = /** @type {{ uri?: string, status?: string, diff?: string,
      note?: string | null }} */ (file);
    console.log(`  ${f.status} ${f.uri}`);
    if (f.note) console.log(`    (${f.note})`);
    for (const line of String(f.diff || "").split("\n")) {
      if (line) console.log(`    ${line}`);
    }
    console.log("");
  }
  if (report.truncated) console.log("  … truncated by the server");
}

/**
 * @param {string} token
 * @param {string} scriptUri
 * @param {string} revision
 * @param {{ dryRun: boolean, force: boolean, reinit?: string, json: boolean }} options
 */
async function revertScript(token, scriptUri, revision, options) {
  /** @type {Record<string, string>} */
  const params = { script: scriptUri, revision };
  if (options.dryRun) params.dry_run = "true";
  if (options.force) params.force = "true";
  if (options.reinit) params.reinit = options.reinit;

  const result = await call(token, "POST", "/engine/revisions/revert", params);
  const report = unwrap(result, "/engine/revisions/revert");
  if (options.json) {
    console.log(result.body);
    return;
  }

  const changed = report.changed || {};
  const prefix = report.dryRun ? "would restore" : "restored";
  // `written`/`deleted` count assets only — the entrypoint is reported
  // separately as `root`, and saying "0 files written" for a revert that put
  // the entrypoint back reads like nothing happened.
  const parts = [
    changed.root ? "entrypoint" : null,
    `${changed.written || 0} asset(s) written`,
    `${changed.deleted || 0} deleted`,
  ].filter(Boolean);
  console.log(`  ${prefix} r${report.revertedTo}: ${parts.join(", ")}`);
  if (report.revision) console.log(`  recorded as r${report.revision}`);

  // Reverting code does not revert the database, and the engine knows whether
  // the schema the old code expects is the schema that is there.
  const schema = report.schema;
  if (schema && schema.matches === false) {
    console.log(`  ! schema does not match this revision`);
    for (const warning of schema.warnings || []) {
      console.log(`    ${warning}`);
    }
  }
  const init = report.init;
  if (init && init.ran === false && init.reason) {
    console.log(`  · init() did not run (${init.reason})`);
  }
}

/**
 * @param {string} token
 * @param {string} scriptUri
 * @param {string | undefined} revision
 * @param {boolean} json
 */
async function pin(token, scriptUri, revision, json) {
  // `pin` with no revision means "freeze what is running", which is the whole
  // point at the start of a session — you do not want to look up the number
  // first, and looking it up is exactly what the deploy endpoint is for.
  let target = revision;
  if (!target) {
    const current = await call(token, "GET", "/engine/deploy", {
      script: scriptUri,
    });
    const status = unwrap(current, "/engine/deploy");
    if (status.pinned) {
      console.log(`  already pinned to r${status.serving}`);
      return;
    }
    target = String(status.serving);
  }

  const result = await call(token, "POST", "/engine/deploy", {
    script: scriptUri,
    revision: target,
  });
  const report = unwrap(result, "/engine/deploy");
  if (json) {
    console.log(result.body);
    return;
  }

  const deployed = report.deployed;
  console.log(`  pinned to r${deployed ? deployed.revision : target}`);
  const init = report.init;
  if (init && init.success === false) {
    // Deploying does not vet what it deploys: the script is broken now, and
    // saying so beats leaving it to the next request to discover.
    console.log(`  ✗ init() failed: ${String(init.error).split("\n")[0]}`);
    console.log(`    recover with: node scripts/revisions.js pin last-good`);
    process.exitCode = 1;
    return;
  }
  if (init && init.ran) console.log(`  · init() ran in ${init.durationMs}ms`);
}

/**
 * @param {string} token
 * @param {string} scriptUri
 * @param {boolean} json
 */
async function unpin(token, scriptUri, json) {
  const result = await call(token, "DELETE", "/engine/deploy", {
    script: scriptUri,
  });
  const report = unwrap(result, "/engine/deploy");
  if (json) {
    console.log(result.body);
    return;
  }
  console.log(`  following head again`);
  const init = report.init;
  if (init && init.success === false) {
    console.log(`  ✗ init() failed: ${String(init.error).split("\n")[0]}`);
    process.exitCode = 1;
  }
}

/**
 * @param {string} token
 * @param {string} scriptUri
 * @param {string} revision
 * @param {string | undefined} label
 * @param {boolean} json
 */
async function labelRevision(token, scriptUri, revision, label, json) {
  /** @type {Record<string, string>} */
  const params = { script: scriptUri, revision };
  // An empty label clears one, which is what omitting the argument means here.
  params.label = label || "";

  const result = await call(token, "POST", "/engine/revisions/label", params);
  const report = unwrap(result, "/engine/revisions/label");
  if (json) {
    console.log(result.body);
    return;
  }
  console.log(
    report.label
      ? `  r${report.revision} is now "${report.label}"`
      : `  cleared the label on r${report.revision}`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();

  let scriptUri = DEFAULT_SCRIPT_URI;
  let asset;
  let limit = 20;
  let files = false;
  let from;
  let to;
  let context;
  let dryRun = false;
  let force = false;
  let reinit;
  let json = false;
  /** @type {string[]} */
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--script-uri":
        scriptUri = args[++i];
        break;
      case "--asset":
        asset = args[++i];
        break;
      case "--limit":
        limit = Number(args[++i]);
        if (!Number.isFinite(limit) || limit <= 0) {
          throw new Error("--limit takes a positive number");
        }
        break;
      case "--files":
        files = true;
        break;
      case "--from":
        from = args[++i];
        break;
      case "--to":
        to = args[++i];
        break;
      case "--context":
        context = Number(args[++i]);
        if (!Number.isFinite(context) || context < 0) {
          throw new Error("--context takes a number of lines");
        }
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--force":
        force = true;
        break;
      case "--reinit":
        reinit = args[++i];
        if (reinit !== "after" && reinit !== "never") {
          throw new Error("--reinit takes 'after' or 'never'");
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

  const commands = [
    "status",
    "list",
    "diff",
    "label",
    "revert",
    "pin",
    "unpin",
  ];
  if (!command || !commands.includes(command)) {
    console.error(
      `Usage: node scripts/revisions.js <${commands.join("|")}> [options]\n` +
        `See the header of this file for the options each command takes.`,
    );
    process.exit(1);
  }

  if (!json) console.log(`${scriptUri}\n  via: ${manageHost}\n`);
  const token = await loadAccessToken();

  switch (command) {
    case "status":
      await printStatus(token, scriptUri, json);
      break;
    case "list":
      await listRevisions(token, scriptUri, { asset, limit, files, json });
      break;
    case "diff":
      await diffRevisions(token, scriptUri, { from, to, context, json });
      break;
    case "label":
      if (positional.length === 0) {
        throw new Error("label takes a revision, and optionally a name");
      }
      await labelRevision(token, scriptUri, positional[0], positional[1], json);
      break;
    case "revert":
      if (positional.length === 0) {
        throw new Error("revert takes the revision to restore");
      }
      await revertScript(token, scriptUri, positional[0], {
        dryRun,
        force,
        reinit,
        json,
      });
      break;
    case "pin":
      await pin(token, scriptUri, positional[0], json);
      break;
    case "unpin":
      await unpin(token, scriptUri, json);
      break;
  }
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
