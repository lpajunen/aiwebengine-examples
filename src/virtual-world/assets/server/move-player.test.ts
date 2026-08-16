/**
 * Tests for the authoritative move endpoint.
 *
 * These run against the real database: the engine executes them in the same
 * sandbox that serves the script, and rolls the writes back when the run ends.
 * Every case therefore builds its own player in a world created for this run —
 * `newPlayer()` hands out a fresh user id, so cases never see each other's
 * rows even though they share one transaction.
 *
 * The world is created here rather than reusing the start world so the
 * `player_moved` events these moves broadcast go to a world no client is
 * watching.
 */

import { loadPlayerInventory } from "./item-storage.ts";
import { movePlayerForUser } from "./move-player.ts";
import {
  loadPlayerMoveLease,
  loadPlayerPosition,
  savePlayerMoveLease,
  savePlayerPosition,
  savePlayerWorld,
} from "./player-persistence.ts";
import { createWorldOfType, getEffectiveMap } from "./world-bootstrap.ts";
import { isWorldTileWalkable } from "./world-domain.ts";

type Tile = { row: number; col: number };

let worldId = "";
let map: number[][] = [];
let userCounter = 0;

/** Create the shared test world once, on first use. */
function world(): string {
  if (!worldId) {
    worldId = createWorldOfType("forest", { rows: 24, cols: 24 }).world_id;
    map = getEffectiveMap(worldId);
  }
  return worldId;
}

/**
 * Place a brand-new player at `start` with sequence `seq`, so the next move
 * the case sends must carry `seq + 1`.
 */
function newPlayer(start: Tile, seq: number): string {
  const userId = "test-move-" + ++userCounter + "-" + Date.now();
  savePlayerWorld(userId, world());
  savePlayerPosition(userId, world(), {
    row: start.row,
    col: start.col,
    seq: seq,
    rotation: 0,
    session_id: "test-session",
    ts: Date.now(),
  });
  return userId;
}

/** The first straight run of `length` walkable tiles, scanned row by row. */
function walkableRun(length: number): Tile[] {
  world();
  for (let row = 0; row < map.length; row++) {
    const cols = map[row] ? map[row].length : 0;
    for (let col = 0; col + length <= cols; col++) {
      let walkable = true;
      for (let step = 0; step < length; step++) {
        if (!isWorldTileWalkable(map[row][col + step])) {
          walkable = false;
          break;
        }
      }
      if (walkable) {
        const run: Tile[] = [];
        for (let step = 0; step < length; step++) {
          run.push({ row: row, col: col + step });
        }
        return run;
      }
    }
  }
  throw new Error("no walkable run of length " + length + " in the test world");
}

/** A walkable tile that has an unwalkable tile directly beside it. */
function walkableBesideBlocked(): { from: Tile; blocked: Tile } {
  world();
  for (let row = 1; row < map.length - 1; row++) {
    const cols = map[row] ? map[row].length : 0;
    for (let col = 1; col < cols - 1; col++) {
      if (!isWorldTileWalkable(map[row][col])) continue;
      const neighbours: Tile[] = [
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
        // Two tiles away from the previous step: not a single step.
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
    const steps: Tile[] = [];
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
