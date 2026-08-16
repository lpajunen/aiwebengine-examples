/**
 * Tests for the authoritative move endpoint.
 *
 * Database-backed: the engine executes them in the same sandbox that serves the
 * script. Each case gets a world and players of its own from test-fixtures.ts
 * and deletes them again afterwards — see that file for why the run's rollback
 * is not enough on its own.
 */

import { loadPlayerInventory } from "./item-storage.ts";
import { movePlayerForUser } from "./move-player.ts";
import {
  loadPlayerMoveLease,
  loadPlayerPosition,
  savePlayerMoveLease,
} from "./player-persistence.ts";
import {
  TestTile,
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  walkableRunFinder,
} from "./test-fixtures.ts";
import { getEffectiveMap } from "./world-bootstrap.ts";
import { isWorldTileWalkable } from "./world-domain.ts";

let worldId = "";
let walkableRun: (length: number) => TestTile[];

beforeEach(function () {
  worldId = createTestWorld();
  walkableRun = walkableRunFinder(worldId);
});

afterEach(function () {
  cleanupTestData();
});

function newPlayer(start: TestTile, seq: number): string {
  return createTestPlayer(worldId, "move", start, seq);
}

/** A walkable tile that has an unwalkable tile directly beside it. */
function walkableBesideBlocked(): { from: TestTile; blocked: TestTile } {
  const map = getEffectiveMap(worldId);
  for (let row = 1; row < map.length - 1; row++) {
    const cols = map[row] ? map[row].length : 0;
    for (let col = 1; col < cols - 1; col++) {
      if (!isWorldTileWalkable(map[row][col])) continue;
      const neighbours: TestTile[] = [
        { row: row - 1, col: col },
        { row: row + 1, col: col },
        { row: row, col: col - 1 },
        { row: row, col: col + 1 },
      ];
      for (let i = 0; i < neighbours.length; i++) {
        const n = neighbours[i];
        if (!isWorldTileWalkable(map[n.row][n.col])) {
          return { from: { row: row, col: col }, blocked: n };
        }
      }
    }
  }
  throw new Error("no walkable tile beside a blocked one in the test world");
}

describe("a legal move", () => {
  test("is accepted and persisted", () => {
    const run = walkableRun(2);
    const userId = newPlayer(run[0], 0);

    const result = movePlayerForUser(userId, {
      toRow: run[1].row,
      toCol: run[1].col,
      seq: 1,
      session_id: "test-session",
    });

    expect(result.status).toBe(200);
    expect(result.payload.ok).toBe(true);
    expect(result.payload.row).toBe(run[1].row);
    expect(result.payload.col).toBe(run[1].col);

    const stored = loadPlayerPosition(userId);
    expect(stored).toBeTruthy();
    expect(stored ? stored.row : -1).toBe(run[1].row);
    expect(stored ? stored.col : -1).toBe(run[1].col);
  });

  test("advances the sequence by one", () => {
    const run = walkableRun(2);
    const userId = newPlayer(run[0], 7);

    const result = movePlayerForUser(userId, {
      toRow: run[1].row,
      toCol: run[1].col,
      seq: 8,
      session_id: "test-session",
    });

    expect(result.payload.seq).toBe(8);
    const stored = loadPlayerPosition(userId);
    expect(stored ? stored.seq : -1).toBe(8);
  });

  test("costs one fatigue per tile walked", () => {
    const run = walkableRun(3);
    const userId = newPlayer(run[0], 0);
    const before = Number(loadPlayerInventory(userId).values.fatigue || 0);

    movePlayerForUser(userId, {
      steps: [
        { row: run[1].row, col: run[1].col },
        { row: run[2].row, col: run[2].col },
      ],
      seq: 1,
      session_id: "test-session",
    });

    const after = Number(loadPlayerInventory(userId).values.fatigue || 0);
    expect(after - before).toBe(2);
  });

  test("takes over a lease held by another session", () => {
    const run = walkableRun(2);
    const userId = newPlayer(run[0], 0);
    savePlayerMoveLease(userId, "other-tab", Date.now() + 30000);

    const result = movePlayerForUser(userId, {
      toRow: run[1].row,
      toCol: run[1].col,
      seq: 1,
      session_id: "this-tab",
    });

    // A second device must not be able to freeze the first one out: the move
    // is applied and the lease follows the session that made it.
    expect(result.payload.ok).toBe(true);
    const lease = loadPlayerMoveLease(userId);
    expect(lease ? lease.session_id : "").toBe("this-tab");
  });
});

describe("a batched move", () => {
  test("consumes one sequence number per applied step", () => {
    const run = walkableRun(3);
    const userId = newPlayer(run[0], 0);

    const result = movePlayerForUser(userId, {
      steps: [
        { row: run[1].row, col: run[1].col },
        { row: run[2].row, col: run[2].col },
      ],
      seq: 1,
      session_id: "test-session",
    });

    expect(result.payload.ok).toBe(true);
    expect(result.payload.applied_count).toBe(2);
    expect(result.payload.seq).toBe(2);
    expect(result.payload.row).toBe(run[2].row);
    expect(result.payload.col).toBe(run[2].col);
  });

  test("applies the legal prefix and stops at the first bad step", () => {
    const run = walkableRun(2);
    const userId = newPlayer(run[0], 0);

    const result = movePlayerForUser(userId, {
      steps: [
        { row: run[1].row, col: run[1].col },
        // Several tiles away from the previous step: not a single step.
        { row: run[1].row + 5, col: run[1].col },
      ],
      seq: 1,
      session_id: "test-session",
    });

    expect(result.payload.ok).toBe(true);
    expect(result.payload.applied_count).toBe(1);
    expect(result.payload.requested_count).toBe(2);
    const stored = loadPlayerPosition(userId);
    expect(stored ? stored.row : -1).toBe(run[1].row);
  });
});

describe("a refused move", () => {
  test("rejects a jump to a tile that is not adjacent", () => {
    const run = walkableRun(3);
    const userId = newPlayer(run[0], 0);

    const result = movePlayerForUser(userId, {
      toRow: run[2].row,
      toCol: run[2].col,
      seq: 1,
      session_id: "test-session",
    });

    expect(result.payload.ok).toBe(false);
    expect(result.payload.stale).toBe(false);
    expect(result.payload.row).toBe(run[0].row);
    expect(result.payload.col).toBe(run[0].col);
    const stored = loadPlayerPosition(userId);
    expect(stored ? stored.col : -1).toBe(run[0].col);
  });

  test("rejects a step onto an unwalkable tile", () => {
    const spot = walkableBesideBlocked();
    const userId = newPlayer(spot.from, 0);

    const result = movePlayerForUser(userId, {
      toRow: spot.blocked.row,
      toCol: spot.blocked.col,
      seq: 1,
      session_id: "test-session",
    });

    expect(result.payload.ok).toBe(false);
    expect(result.payload.row).toBe(spot.from.row);
    expect(result.payload.col).toBe(spot.from.col);
  });

  test("rejects a step off the edge of the map", () => {
    const userId = newPlayer({ row: 0, col: 1 }, 0);

    const result = movePlayerForUser(userId, {
      toRow: -1,
      toCol: 1,
      seq: 1,
      session_id: "test-session",
    });

    expect(result.payload.ok).toBe(false);
  });

  test("reports a replayed sequence as stale rather than illegal", () => {
    const run = walkableRun(2);
    const userId = newPlayer(run[0], 0);
    const body = {
      toRow: run[1].row,
      toCol: run[1].col,
      seq: 1,
      session_id: "test-session",
    };

    expect(movePlayerForUser(userId, body).payload.ok).toBe(true);
    const replay = movePlayerForUser(userId, body);

    // The client tells the two apart: stale means "resync", not "blocked".
    expect(replay.payload.ok).toBe(false);
    expect(replay.payload.stale).toBe(true);
    expect(replay.payload.seq).toBe(1);
    expect(replay.payload.row).toBe(run[1].row);
  });

  test("refuses a payload with no coordinates", () => {
    const run = walkableRun(2);
    const userId = newPlayer(run[0], 0);

    const result = movePlayerForUser(userId, { session_id: "test-session" });

    expect(result.status).toBe(400);
    expect(result.payload.error).toBe("error.invalid_move_payload");
  });

  test("refuses an empty batch", () => {
    const run = walkableRun(2);
    const userId = newPlayer(run[0], 0);

    const result = movePlayerForUser(userId, {
      steps: [],
      session_id: "test-session",
    });

    expect(result.status).toBe(400);
  });

  test("refuses a batch beyond the cap instead of walking it", () => {
    const run = walkableRun(2);
    const userId = newPlayer(run[0], 0);
    const steps: TestTile[] = [];
    for (let i = 0; i < 61; i++) {
      steps.push({ row: run[1].row, col: run[1].col });
    }

    const result = movePlayerForUser(userId, {
      steps: steps,
      seq: 1,
      session_id: "test-session",
    });

    expect(result.status).toBe(400);
  });

  test("answers a player who is in no world at all", () => {
    const userId = "test-move-worldless-" + Date.now();

    const result = movePlayerForUser(userId, {
      toRow: 1,
      toCol: 1,
      seq: 1,
      session_id: "test-session",
    });

    expect(result.status).toBe(200);
    expect(result.payload.ok).toBe(false);
  });
});
