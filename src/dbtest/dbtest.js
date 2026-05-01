/// <reference path="../types/aiwebengine.d.ts" />

// dbtest.js
// New script created at 2025-12-14T08:17:31.242Z

function handler(context) {
  return ResponseBuilder.text("Hello from dbtest.js!");
}

function init() {
  console.log("Initializing dbtest.js at " + new Date().toISOString());

  const tableResult = JSON.parse(database.createTable("dbtest"));
  if (tableResult.error) {
    console.error("Failed to create table:", tableResult.error);
    return;
  }

  const ageResult = JSON.parse(database.addIntegerColumn("dbtest", "age"));
  if (ageResult.error) {
    console.error("Failed to add age column:", ageResult.error);
  }

  const nameResult = JSON.parse(database.addTextColumn("dbtest", "name"));
  if (nameResult.error) {
    console.error("Failed to add name column:", nameResult.error);
  }

  routeRegistry.registerRoute("/dbtest", "handler", "GET");
  console.log("dbtest.js endpoints registered");
}
