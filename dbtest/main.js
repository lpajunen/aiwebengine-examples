/// <reference path="../types/aiwebengine.d.ts" />

// The smallest use of a script's own table: describe it in init().

/** @param {HandlerContext} context */
function handler(context) {
  return ResponseBuilder.text("Hello from dbtest.js!");
}

function init() {
  database.ensureTable("dbtest", {
    columns: [
      { name: "age", type: "integer" },
      { name: "name", type: "text" },
    ],
  });
  routeRegistry.registerRoute("/dbtest", { handler: "handler", method: "GET" });
}
