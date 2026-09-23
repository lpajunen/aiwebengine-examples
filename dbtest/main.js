/// <reference path="../types/aiwebengine.d.ts" />

// dbtest.js
// New script created at 2025-12-14T08:17:31.242Z

/**
 * What a `database.*` call answers with, once parsed. `error` is present only
 * when the call failed.
 *
 * These calls return a result object now, so `.json()` replaces the
 * `JSON.parse(...)` this example used to wrap them in. Each script is its own
 * global scope on the engine but they share one type-check program here, so
 * the name carries this script's prefix.
 *
 * @typedef {{ error?: string }} DbtestDbAnswer
 */

/** @param {HandlerContext} context */
function handler(context) {
  return ResponseBuilder.text("Hello from dbtest.js!");
}

function init() {
  console.log("Initializing dbtest.js at " + new Date().toISOString());

  const tableResult = /** @type {DbtestDbAnswer} */ (
    database.createTable("dbtest").json()
  );
  if (tableResult.error) {
    console.error("Failed to create table:", tableResult.error);
    return;
  }

  const ageResult = /** @type {DbtestDbAnswer} */ (
    database.addIntegerColumn("dbtest", "age").json()
  );
  if (ageResult.error) {
    console.error("Failed to add age column:", ageResult.error);
  }

  const nameResult = /** @type {DbtestDbAnswer} */ (
    database.addTextColumn("dbtest", "name").json()
  );
  if (nameResult.error) {
    console.error("Failed to add name column:", nameResult.error);
  }

  routeRegistry.registerRoute("/dbtest", "handler", "GET");
  console.log("dbtest.js endpoints registered");
}
