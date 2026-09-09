/**
 * Tests for the world database helpers, and in particular for how
 * `runInWorldTransaction` nests.
 *
 * The engine's transactions are flat: a second `beginTransaction` starts
 * nothing new, and a `rollbackTransaction` from inside discards everything the
 * transaction has done — including writes made before that inner begin. Nearly
 * every tick and handler wraps its work in a transaction and then emits an
 * event (which allocates a sequence number of its own), so an inner helper
 * that rolled back on its own could silently destroy the caller's writes. The
 * cases below are what stops that from coming back.
 */

import { VWORLD_PLAYER_NICK_TABLE } from "./runtime-config.ts";
import { cleanupTestData, testUserId } from "./test-fixtures.ts";
import {
  queryWorldRows,
  querySingleWorldRow,
  runInWorldTransaction,
  upsertWorldRow,
} from "./world-db.ts";

afterEach(function () {
  cleanupTestData();
});

function newUserId(): string {
  return testUserId("worlddb");
}

function writeNick(userId: string, nick: string): void {
  upsertWorldRow(VWORLD_PLAYER_NICK_TABLE, ["user_id"], {
    user_id: userId,
    nick: nick,
    updated_ts: Math.floor(Date.now() / 1000),
  });
}

function readNick(userId: string): string {
  const rows = queryWorldRows(
    VWORLD_PLAYER_NICK_TABLE,
    JSON.stringify({ user_id: userId }),
    1,
    "id",
    "desc",
  );
  return rows.length > 0 ? String(rows[0].nick || "") : "";
}

describe("running in a transaction", () => {
  test("returns what the body returned", () => {
    expect(runInWorldTransaction("test_return", () => 42)).toBe(42);
  });

  test("commits the writes the body made", () => {
    const userId = newUserId();
    runInWorldTransaction("test_commit", function () {
      writeNick(userId, "committed");
    });
    expect(readNick(userId)).toBe("committed");
  });

  test("rethrows the body's error", () => {
    expect(function () {
      runInWorldTransaction("test_throw", function () {
        throw new Error("boom");
      });
    }).toThrow("boom");
  });

  test("a nested call joins the outer transaction instead of opening one", () => {
    const outer = newUserId();
    const inner = newUserId();
    runInWorldTransaction("test_outer", function () {
      writeNick(outer, "outer");
      runInWorldTransaction("test_inner", function () {
        writeNick(inner, "inner");
      });
      // The inner call must not have committed and closed the transaction:
      // both writes belong to the outer one and are visible to it.
      expect(readNick(outer)).toBe("outer");
      expect(readNick(inner)).toBe("inner");
    });
    expect(readNick(outer)).toBe("outer");
    expect(readNick(inner)).toBe("inner");
  });

  test("a failure inside a nested call does not discard the outer work", () => {
    // This is the shape that bit us: a tick opens a transaction, writes the
    // world state, then emits an event whose sequence allocation fails. The
    // helper that failed must not roll back — it would take the tick's own
    // writes, and everything else the transaction had done, with it.
    const userId = newUserId();
    runInWorldTransaction("test_outer_survives", function () {
      writeNick(userId, "kept");
      try {
        runInWorldTransaction("test_inner_fails", function () {
          throw new Error("inner failed");
        });
      } catch (e) {
        // Swallowed by the caller, exactly as allocateEventSeq does.
      }
      writeNick(userId, "kept-after");
    });
    expect(readNick(userId)).toBe("kept-after");
  });

  test("nesting unwinds, so a later transaction still commits on its own", () => {
    const userId = newUserId();
    runInWorldTransaction("test_depth_outer", function () {
      runInWorldTransaction("test_depth_inner", function () {
        return 1;
      });
    });
    // If the depth counter leaked, this write would never be committed.
    runInWorldTransaction("test_depth_after", function () {
      writeNick(userId, "after");
    });
    expect(readNick(userId)).toBe("after");
  });

  test("a throw unwinds the depth as well", () => {
    const userId = newUserId();
    try {
      runInWorldTransaction("test_depth_throw", function () {
        throw new Error("boom");
      });
    } catch (e) {
      // expected
    }
    runInWorldTransaction("test_depth_throw_after", function () {
      writeNick(userId, "after-throw");
    });
    expect(readNick(userId)).toBe("after-throw");
  });
});

/**
 * A plain read takes no lock, so two transactions can read one row, each
 * compute from what they read, and each commit — leaving only the second
 * write, with both reporting success. `forUpdate` is what makes a
 * read-modify-write (allocateEventSeq above all) safe. Real contention needs
 * two concurrent requests, which this harness cannot stage; what is pinned
 * here is that the option reaches the engine accepted rather than refused, and
 * that asking for it where it cannot be honoured degrades instead of throwing.
 */
describe("locked reads", () => {
  test("a locked read inside a transaction returns the row", () => {
    const userId = newUserId();
    writeNick(userId, "locked");
    const row = runInWorldTransaction("test_for_update", function () {
      return querySingleWorldRow(
        VWORLD_PLAYER_NICK_TABLE,
        JSON.stringify({ user_id: userId }),
        { forUpdate: true },
      );
    });
    expect(row && String(row.nick)).toBe("locked");
  });

  test("a re-read in the same transaction sees the write between them", () => {
    const userId = newUserId();
    writeNick(userId, "first");
    const nicks = runInWorldTransaction("test_for_update_twice", function () {
      const before = querySingleWorldRow(
        VWORLD_PLAYER_NICK_TABLE,
        JSON.stringify({ user_id: userId }),
        { forUpdate: true },
      );
      writeNick(userId, "second");
      const after = querySingleWorldRow(
        VWORLD_PLAYER_NICK_TABLE,
        JSON.stringify({ user_id: userId }),
        { forUpdate: true },
      );
      return [String(before.nick), String(after.nick)];
    });
    expect(nicks).toEqual(["first", "second"]);
  });

  test("outside a transaction it degrades to an unlocked read, not an error", () => {
    const userId = newUserId();
    writeNick(userId, "unlocked");
    // The engine refuses forUpdate with no transaction open; world-db drops
    // the option rather than letting the read fail, because
    // runInWorldTransaction runs its body unwrapped when BEGIN fails.
    const row = querySingleWorldRow(
      VWORLD_PLAYER_NICK_TABLE,
      JSON.stringify({ user_id: userId }),
      { forUpdate: true },
    );
    expect(row && String(row.nick)).toBe("unlocked");
  });

  test("a read with no options is unaffected", () => {
    const userId = newUserId();
    writeNick(userId, "plain");
    expect(readNick(userId)).toBe("plain");
  });
});
