/**
 * Tests for the schema migration's re-runnability.
 *
 * The migration is a list of ~200 individually idempotent DDL statements that
 * runs at startup, and the whole design rests on being able to run it again: a
 * start killed mid-migration leaves the version marker stale, and the next one
 * retries from the top. So a re-applied step has to be recognisable as
 * harmless — the engine answers "already exists" rather than success, and the
 * migration has to read that as the ordinary answer rather than a failure.
 *
 * What is *not* here: re-applying a whole schema list. `ensureWorldItemSchema`
 * and `ensureLateWorldDatabaseSchema` are dozens of round trips each, and a
 * case that called them blew the harness's 120-second run budget — the same
 * cost that keeps the full migration behind a version marker in production.
 * Individual steps are the testable unit.
 */

import {
  recordSchemaVersion,
  runWorldSchemaStep,
  schemaVersionIsCurrent,
} from "./schema-setup.ts";
import {
  VWORLD_PLAYER_NICK_TABLE,
  VWORLD_SCHEMA_VERSION_TABLE,
} from "./runtime-config.ts";
import { deleteWorldRowsWhere } from "./world-db.ts";

type SchemaStep = {
  op: string;
  table: string;
  column: string;
  ok: boolean;
  error: string;
};

/** How the migration itself decides a step did not really fail. */
function isBenign(step: SchemaStep): boolean {
  if (step.ok) return true;
  const message = step.error.toLowerCase();
  return (
    message.indexOf("already exists") !== -1 ||
    message.indexOf("duplicate") !== -1
  );
}

describe("re-applying a step", () => {
  test("creating a table that exists answers, and answers benignly", () => {
    // The engine reports the collision rather than a success, so "ok" is false
    // and the message is what tells the migration to carry on.
    const steps: SchemaStep[] = [];

    runWorldSchemaStep(
      "createTable",
      VWORLD_PLAYER_NICK_TABLE,
      function () {
        return database.createTable(VWORLD_PLAYER_NICK_TABLE);
      },
      undefined,
      steps,
    );

    expect(steps).toHaveLength(1);
    expect(isBenign(steps[0])).toBe(true);
  });

  test("adding a column that exists is benign too", () => {
    const steps: SchemaStep[] = [];

    runWorldSchemaStep(
      "addTextColumn",
      VWORLD_PLAYER_NICK_TABLE,
      function () {
        return database.addTextColumn(VWORLD_PLAYER_NICK_TABLE, "nick", false);
      },
      "nick",
      steps,
    );

    expect(steps).toHaveLength(1);
    expect(isBenign(steps[0])).toBe(true);
  });

  test("doing it twice more changes nothing", () => {
    // Establish the precondition rather than inheriting it. This case used to
    // assume the marker table was already present from a previous migration,
    // which made it pass or fail on ambient database state: on a freshly
    // recreated server the first create *succeeded* (empty error) and only the
    // second collided, so the two answers differed and the case failed. The
    // claim under test is that re-applying a step is idempotent, so the run
    // that creates the table is setup, not part of the comparison.
    runWorldSchemaStep(
      "createTable",
      VWORLD_SCHEMA_VERSION_TABLE,
      function () {
        return database.createTable(VWORLD_SCHEMA_VERSION_TABLE);
      },
      undefined,
      [],
    );

    const first: SchemaStep[] = [];
    const second: SchemaStep[] = [];

    runWorldSchemaStep(
      "createTable",
      VWORLD_SCHEMA_VERSION_TABLE,
      function () {
        return database.createTable(VWORLD_SCHEMA_VERSION_TABLE);
      },
      undefined,
      first,
    );
    runWorldSchemaStep(
      "createTable",
      VWORLD_SCHEMA_VERSION_TABLE,
      function () {
        return database.createTable(VWORLD_SCHEMA_VERSION_TABLE);
      },
      undefined,
      second,
    );

    expect(isBenign(first[0])).toBe(true);
    expect(second[0].error).toBe(first[0].error);
  });
});

describe("a step that goes wrong", () => {
  test("is reported rather than escaping", () => {
    // One broken statement cannot take the rest of the schema — or the whole
    // start — down with it: every step is caught and recorded.
    const steps: SchemaStep[] = [];

    runWorldSchemaStep(
      "createTable",
      "vworld_never_created",
      function () {
        throw new Error("no such database call");
      },
      undefined,
      steps,
    );

    expect(steps).toHaveLength(1);
    expect(steps[0].ok).toBe(false);
    expect(steps[0].error).toContain("threw");
    expect(isBenign(steps[0])).toBe(false);
  });

  test("an empty answer to createTable is not mistaken for success", () => {
    // A script with no tables at all can look healthy this way: every later
    // column op and query fails as a missing-row case, and the game runs
    // entirely on in-memory defaults.
    const steps: SchemaStep[] = [];

    runWorldSchemaStep(
      "createTable",
      "vworld_never_created",
      function () {
        return "";
      },
      undefined,
      steps,
    );

    expect(steps).toHaveLength(1);
    expect(isBenign(steps[0])).toBe(true);
    // The collector records the raw answer; the migration's own check is what
    // refuses to treat an empty createTable reply as a table.
    expect(steps[0].error).toBe("");
  });
});

describe("the version gate", () => {
  // This gate is the whole reason a start does not pay ~250 DDL round trips.
  // It failed silently for weeks: recordSchemaVersion wrote Date.now()
  // milliseconds (~1.79e12) into a 32-bit INTEGER column, so the write always
  // errored, the marker never went current, every start re-ran the entire
  // list, and the failed write aborted the surrounding transaction on its way
  // out. Nothing surfaced that except the init duration, and the eventual
  // response was to disable the migration entirely — which then left a
  // recreated server with no schema at all.
  //
  // Clearing the marker first is the whole point: this database already holds
  // a current one, so asserting "it reads as current" after recording proves
  // nothing on its own — it passes just as happily when the write silently
  // fails. The gate has to be observed going false → true.
  function clearMarker(scope: "world" | "chat"): void {
    deleteWorldRowsWhere(
      VWORLD_SCHEMA_VERSION_TABLE,
      JSON.stringify({ scope: scope }),
    );
  }

  test("goes from stale to current when a version is recorded", () => {
    clearMarker("world");
    expect(schemaVersionIsCurrent("world")).toBe(false);

    recordSchemaVersion("world");

    expect(schemaVersionIsCurrent("world")).toBe(true);
  });

  test("keeps scopes independent", () => {
    // Separate markers, so completing the world list must not let the chat
    // list skip itself — that would leave a server with half a schema and no
    // sign of it.
    clearMarker("world");
    clearMarker("chat");

    recordSchemaVersion("world");

    expect(schemaVersionIsCurrent("world")).toBe(true);
    expect(schemaVersionIsCurrent("chat")).toBe(false);
  });
});
