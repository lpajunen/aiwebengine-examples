/**
 * Tests for shared pursuit movement — the "walk one tile toward a target per
 * tick" step behind the walk-then-act approach queue.
 *
 * Database-backed, like move-player.test.ts: each case gets its own world and
 * players from test-fixtures.ts and deletes them again afterwards.
 */

import { loadPlayerInventory } from "./item-storage.ts";
import { loadPlayerPosition } from "./player-persistence.ts";
import {
  resolveApproachTargetTile,
  stepActorTowardTile,
} from "./pursuit-movement.ts";
import {
  TestTile,
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  walkableRunFinder,
} from "./test-fixtures.ts";

let worldId = "";
let walkableRun: (length: number) => TestTile[];

beforeEach(function () {
  worldId = createTestWorld();
  walkableRun = walkableRunFinder(worldId);
});

afterEach(function () {
  cleanupTestData();
});

function newPlayer(start: TestTile): string {
  return createTestPlayer(worldId, "pursuit", start, 0);
}

describe("resolving what an approach is heading for", () => {
  test("a bare tile target is taken at face value", () => {
    expect(resolveApproachTargetTile(worldId, { row: 4, col: 9 })).toEqual({
      row: 4,
      col: 9,
    });
  });

  test("a living that is nowhere to be found resolves to nothing", () => {
    // The pursued NPC despawned or the player left: the caller drops the
    // pending action rather than walking to a stale tile.
    expect(
      resolveApproachTargetTile(worldId, {
        target_living_id: "ghost-does-not-exist",
      }),
    ).toBeNull();
  });

  test("an item that no longer lies in the world resolves to nothing", () => {
    expect(
      resolveApproachTargetTile(worldId, { target_item_id: "vanished-item" }),
    ).toBeNull();
  });

  test("a player is tracked at their current position", () => {
    const run = walkableRun(1);
    const userId = newPlayer(run[0]);
    expect(
      resolveApproachTargetTile(worldId, { target_living_id: userId }),
    ).toEqual({ row: run[0].row, col: run[0].col });
  });

  test("a body with no usable target resolves to nothing", () => {
    // Number(null) is 0, so a missing body must be refused explicitly or the
    // actor walks to tile (0, 0).
    expect(resolveApproachTargetTile(worldId, {})).toBeNull();
    expect(resolveApproachTargetTile(worldId, null)).toBeNull();
    expect(
      resolveApproachTargetTile(worldId, { row: "over there", col: 2 }),
    ).toBeNull();
  });
});

describe("stepping toward a tile", () => {
  test("closes one tile per call and persists the step", () => {
    const run = walkableRun(3);
    const userId = newPlayer(run[0]);

    const first = stepActorTowardTile(
      worldId,
      userId,
      run[2].row,
      run[2].col,
      Date.now(),
    );

    expect(first.moved).toBe(true);
    expect(first.row).toBe(run[1].row);
    expect(first.col).toBe(run[1].col);
    const stored = loadPlayerPosition(userId);
    expect(stored ? stored.col : -1).toBe(run[1].col);
    // The step advances the sequence, so a client watching the stream can
    // order it against the player's own moves.
    expect(stored ? stored.seq : -1).toBe(1);
  });

  test("standing on the target is arrival, not a step", () => {
    const run = walkableRun(1);
    const userId = newPlayer(run[0]);

    const result = stepActorTowardTile(
      worldId,
      userId,
      run[0].row,
      run[0].col,
      Date.now(),
    );

    expect(result.moved).toBe(false);
    expect(result.row).toBe(run[0].row);
    expect(result.col).toBe(run[0].col);
  });

  test("an actor with no position in the world does not move", () => {
    const result = stepActorTowardTile(
      worldId,
      "test-pursuit-absent-" + Date.now(),
      3,
      3,
      Date.now(),
    );
    expect(result.moved).toBe(false);
  });

  test("repeated calls arrive, and each tile costs fatigue like a walked one", () => {
    const run = walkableRun(3);
    const userId = newPlayer(run[0]);
    const before = Number(loadPlayerInventory(userId).values.fatigue || 0);

    stepActorTowardTile(worldId, userId, run[2].row, run[2].col, Date.now());
    stepActorTowardTile(worldId, userId, run[2].row, run[2].col, Date.now());
    const arrived = stepActorTowardTile(
      worldId,
      userId,
      run[2].row,
      run[2].col,
      Date.now(),
    );

    expect(arrived.moved).toBe(false);
    const stored = loadPlayerPosition(userId);
    expect(stored ? stored.col : -1).toBe(run[2].col);
    expect(stored ? stored.seq : -1).toBe(2);
    const after = Number(loadPlayerInventory(userId).values.fatigue || 0);
    expect(after - before).toBe(2);
  });

  test("a target far off the map still moves exactly one tile", () => {
    const run = walkableRun(3);
    const userId = newPlayer(run[1]);

    const result = stepActorTowardTile(
      worldId,
      userId,
      run[1].row,
      run[1].col + 500,
      Date.now(),
    );

    expect(result.moved).toBe(true);
    expect(result.row).toBe(run[2].row);
    expect(result.col).toBe(run[2].col);
  });
});
