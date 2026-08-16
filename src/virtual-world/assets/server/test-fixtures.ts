// Shared fixtures for the database-backed test modules. Imported only by
// `*.test.ts` files; nothing in the running game references it.
//
// Why tests have to clean up after themselves: the engine rolls a test run's
// writes back, but only while the run's transaction is still open. The moment
// any code under test commits one of its own — every tick and handler wrapped
// in runInWorldTransaction does, and so does the event-sequence allocator —
// that transaction ends and everything written afterwards is real. So a suite
// that creates worlds and players registers them here and deletes them in an
// `afterEach`, rather than trusting the rollback.

import {
  VWORLD_NPC_ACTIVE_WORLD_TABLE,
  VWORLD_NPC_TABLE,
  VWORLD_NPC_TICK_TABLE,
  VWORLD_PLAYER_HEARTBEAT_TABLE,
  VWORLD_PLAYER_INVENTORY_TABLE,
  VWORLD_PLAYER_MOVE_LEASE_TABLE,
  VWORLD_PLAYER_NICK_TABLE,
  VWORLD_PLAYER_POSITION_TABLE,
  VWORLD_PLAYER_WORLD_TABLE,
  VWORLD_SPAWN_TIMER_TABLE,
  VWORLD_WORLD_ITEM_META_TABLE,
  VWORLD_WORLD_ITEM_TABLE,
  VWORLD_WORLD_MOD_TABLE,
  VWORLD_WORLD_PLACEMENT_TABLE,
  VWORLD_WORLD_TYPE_TABLE,
} from "./runtime-config.ts";
import { deleteWorldRowsWhere, runInWorldTransaction } from "./world-db.ts";
import { savePlayerPosition, savePlayerWorld } from "./player-persistence.ts";
import { createWorldOfType, getEffectiveMap } from "./world-bootstrap.ts";
import { isWorldTileWalkable } from "./world-domain.ts";

export type TestTile = { row: number; col: number };

const PLAYER_TABLES = [
  VWORLD_PLAYER_POSITION_TABLE,
  VWORLD_PLAYER_WORLD_TABLE,
  VWORLD_PLAYER_INVENTORY_TABLE,
  VWORLD_PLAYER_NICK_TABLE,
  VWORLD_PLAYER_MOVE_LEASE_TABLE,
  VWORLD_PLAYER_HEARTBEAT_TABLE,
];

// Everything a test world accumulates once something asks for its contents:
// seeded items and their seed marker, NPCs and their tick bookkeeping, respawn
// timers, materialized placements, and any tile a case modified.
const WORLD_TABLES = [
  VWORLD_WORLD_TYPE_TABLE,
  VWORLD_WORLD_ITEM_TABLE,
  VWORLD_WORLD_ITEM_META_TABLE,
  VWORLD_WORLD_MOD_TABLE,
  VWORLD_WORLD_PLACEMENT_TABLE,
  VWORLD_NPC_TABLE,
  VWORLD_NPC_ACTIVE_WORLD_TABLE,
  VWORLD_NPC_TICK_TABLE,
  VWORLD_SPAWN_TIMER_TABLE,
];

const createdUserIds: string[] = [];
const createdWorldIds: string[] = [];
let idCounter = 0;
let primed = false;

/**
 * Open and close one empty transaction before a case writes anything.
 *
 * The first script-level transaction of a run collides with the transaction the
 * harness opened to roll the run back: committing it discards everything the
 * run has written so far, so a case that sets up rows and then calls code which
 * wraps its work in a transaction (a tick, an item action, a pursuit step)
 * would find its own setup gone. Spending the collision here, before any
 * fixture row exists, leaves the rest of the run behaving normally.
 */
export function primeTransactions(): void {
  if (primed) return;
  primed = true;
  runInWorldTransaction("test_prime", function () {
    return 0;
  });
}

/** A user id no other case will use, tracked for cleanup. */
export function testUserId(prefix: string): string {
  const userId = "test-" + prefix + "-" + ++idCounter + "-" + Date.now();
  createdUserIds.push(userId);
  return userId;
}

/**
 * A small world of this run's own, tracked for cleanup. Small because the map
 * is generated on every read, and private because the events a case triggers
 * are world-scoped: no client is watching this one.
 */
export function createTestWorld(rows = 24, cols = 24): string {
  primeTransactions();
  const worldId = createWorldOfType("forest", {
    rows: rows,
    cols: cols,
  }).world_id;
  createdWorldIds.push(worldId);
  return worldId;
}

/** Place a tracked player at `start`, ready to be moved from sequence `seq`. */
export function createTestPlayer(
  worldId: string,
  prefix: string,
  start: TestTile,
  seq = 0,
): string {
  const userId = testUserId(prefix);
  savePlayerWorld(userId, worldId);
  savePlayerPosition(userId, worldId, {
    row: start.row,
    col: start.col,
    seq: seq,
    rotation: 0,
    session_id: "test-session",
    ts: Date.now(),
  });
  return userId;
}

/**
 * A straight run of `length` walkable tiles, walking a cursor across the map so
 * two calls never overlap. Movement code refuses to step onto an occupied tile,
 * and the players earlier cases left behind stay in the world for the rest of
 * the run, so each case needs its own stretch of ground.
 */
export function walkableRunFinder(
  worldId: string,
): (length: number) => TestTile[] {
  const map = getEffectiveMap(worldId);
  let cursorRow = 0;
  let cursorCol = 0;
  return function walkableRun(length: number): TestTile[] {
    for (let row = cursorRow; row < map.length; row++) {
      const cols = map[row] ? map[row].length : 0;
      const from = row === cursorRow ? cursorCol : 0;
      for (let col = from; col + length <= cols; col++) {
        let walkable = true;
        for (let step = 0; step < length; step++) {
          if (!isWorldTileWalkable(map[row][col + step])) {
            walkable = false;
            break;
          }
        }
        if (!walkable) continue;
        const run: TestTile[] = [];
        for (let step = 0; step < length; step++) {
          run.push({ row: row, col: col + step });
        }
        // Leave a gap, so a step inside the next run cannot land on the player
        // this one left standing.
        cursorRow = row;
        cursorCol = col + length + 1;
        return run;
      }
    }
    throw new Error("no unused walkable run of length " + length);
  };
}

/** Delete every row the fixtures created. Safe to call repeatedly. */
export function cleanupTestData(): void {
  for (let i = 0; i < createdUserIds.length; i++) {
    const filters = JSON.stringify({ user_id: createdUserIds[i] });
    for (let t = 0; t < PLAYER_TABLES.length; t++) {
      deleteWorldRowsWhere(PLAYER_TABLES[t], filters);
    }
  }
  createdUserIds.length = 0;
  for (let i = 0; i < createdWorldIds.length; i++) {
    const filters = JSON.stringify({ world_id: createdWorldIds[i] });
    for (let t = 0; t < WORLD_TABLES.length; t++) {
      deleteWorldRowsWhere(WORLD_TABLES[t], filters);
    }
  }
  createdWorldIds.length = 0;
}
