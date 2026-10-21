/**
 * Tests for what meets a player in Väinölä: the shore their boat lands on, the
 * players who may welcome them, and the pike whose jawbone becomes their first
 * kantele.
 *
 * What these guard is the first minutes in the shared world. A boat that lands
 * a newcomer somewhere arbitrary, a welcome that can be farmed, or a kantele
 * that can no longer be made are each a broken promise of the design.
 *
 * Database-backed; every player, world and pending action a case makes is
 * removed afterwards. Väinölä is the live start world, whose livings and items
 * the running game ticks; only the shore case goes there, and everything else
 * happens in worlds of the tests' own.
 */

import {
  NEWCOMER_WINDOW_MS,
  RESERVATION_ARRIVAL_AREA,
  START_WORLD_ID,
} from "./runtime-config.ts";
import { getEffectiveMap, getOrCreatePlayerWorld } from "./world-bootstrap.ts";
import { isNewcomer, loadPlayerHome, savePlayerHome } from "./home-island.ts";
import {
  loadPlayerPosition,
  savePlayerPosition,
} from "./player-persistence.ts";
import { loadPlayerInventory, savePlayerInventory } from "./item-storage.ts";
import {
  performTreeActionForUser,
  resolvePendingActionsForWorld,
} from "./tree-action-helpers.ts";
import { heartbeatForUser } from "./http-handler-helpers.ts";
import { getReservedTiles } from "./world-reservations.ts";
import {
  countLivingItemsByType,
  isWorldTileWalkable,
  worldTileValueForName,
} from "./world-domain.ts";
import {
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  primeTransactions,
  testUserId,
  trackTestWorld,
  walkableRunFinder,
} from "./test-fixtures.ts";

let counter = 0;

beforeEach(function () {
  primeTransactions();
});

afterEach(function () {
  cleanupTestData();
});

function give(userId: string, type: string): void {
  const inv = loadPlayerInventory(userId);
  inv.bag.push({ id: "test-item-" + ++counter + "-" + Date.now(), type: type });
  savePlayerInventory(userId, inv);
}

function held(userId: string, type: string): number {
  return countLivingItemsByType(loadPlayerInventory(userId))[type] || 0;
}

function act(userId: string, action: string, extra?: any): any {
  return performTreeActionForUser(
    userId,
    Object.assign({ action: action }, extra || {}),
  ).payload;
}

/** A new player who has just rowed to Väinölä for the first time. */
function newcomer(): string {
  const userId = testUserId("newcomer");
  trackTestWorld(getOrCreatePlayerWorld(userId));
  give(userId, "boat");
  act(userId, "row_to_vainola");
  return userId;
}

/**
 * A newcomer who arrived just now, in a world of the test's own: the first
 * arrival itself is tested on the shore, and greeting needs no Väinölä.
 */
function freshNewcomer(worldId: string): string {
  const userId = createTestPlayer(
    worldId,
    "newcomer",
    walkableRunFinder(worldId)(1)[0],
  );
  savePlayerHome({
    userId: userId,
    homeWorldId: "test-no-island-" + userId,
    onboardingDoneAt: Date.now(),
    createdAt: Date.now(),
  });
  const inv = loadPlayerInventory(userId);
  inv.values.newcomer = 1;
  savePlayerInventory(userId, inv);
  return userId;
}

/** A player standing next to `other`, in the same world. */
function playerBeside(worldId: string, other: string, prefix: string): string {
  const at = loadPlayerPosition(other);
  const map = getEffectiveMap(worldId);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const row = Number(at && at.row) + dr;
      const col = Number(at && at.col) + dc;
      if ((dr || dc) && map[row] && isWorldTileWalkable(map[row][col])) {
        const userId = createTestPlayer(worldId, prefix, {
          row: row,
          col: col,
        });
        give(userId, "starter_kit");
        return userId;
      }
    }
  }
  throw new Error("no free tile beside " + other);
}

describe("the arrival shore", () => {
  test("is where the boat lands in Väinölä, on sand", () => {
    const userId = newcomer();
    const shore = getReservedTiles(START_WORLD_ID, RESERVATION_ARRIVAL_AREA);
    const at = loadPlayerPosition(userId);

    expect(shore.length).toBeGreaterThan(0);
    expect(at && at.world_id).toBe(START_WORLD_ID);
    expect(
      shore.some(function (tile) {
        return tile.row === Number(at && at.row) && tile.col === at?.col;
      }),
    ).toBe(true);
    expect(getEffectiveMap(START_WORLD_ID)[at!.row][at!.col]).toBe(
      worldTileValueForName("sand"),
    );
    expect(loadPlayerInventory(userId).values.newcomer).toBe(1);
  });
});

describe("welcoming a newcomer", () => {
  test("rewards the greeter once", () => {
    const world = createTestWorld(16, 16);
    const arrived = freshNewcomer(world);
    const greeter = playerBeside(world, arrived, "greeter");
    const before = Number(loadPlayerInventory(greeter).values.experience || 0);

    expect(
      act(greeter, "welcome_newcomer", { target_living_id: arrived }).ok,
    ).toBe(true);
    expect(Number(loadPlayerInventory(greeter).values.experience || 0)).toBe(
      before + 25,
    );

    expect(
      act(greeter, "welcome_newcomer", { target_living_id: arrived }).error,
    ).toBe("error.already_welcomed");
  });

  test("is refused once the newcomer's first minutes are over", () => {
    const world = createTestWorld(16, 16);
    const arrived = freshNewcomer(world);
    const home = loadPlayerHome(arrived)!;
    home.onboardingDoneAt = Date.now() - NEWCOMER_WINDOW_MS - 1000;
    savePlayerHome(home);
    const greeter = playerBeside(world, arrived, "late-greeter");

    expect(
      act(greeter, "welcome_newcomer", { target_living_id: arrived }).error,
    ).toBe("error.not_a_newcomer");
  });

  test("the newcomer mark is cleared by the heartbeat when it lapses", () => {
    const forest = createTestWorld(16, 16);
    const userId = createTestPlayer(
      forest,
      "lapsed",
      walkableRunFinder(forest)(1)[0],
    );
    savePlayerHome({
      userId: userId,
      homeWorldId: "test-no-island",
      onboardingDoneAt: Date.now() - NEWCOMER_WINDOW_MS - 1000,
      createdAt: Date.now() - NEWCOMER_WINDOW_MS - 2000,
    });
    const inv = loadPlayerInventory(userId);
    inv.values.newcomer = 1;
    savePlayerInventory(userId, inv);

    expect(isNewcomer(userId, Date.now())).toBe(false);
    heartbeatForUser(userId, "");

    expect(loadPlayerInventory(userId).values.newcomer).toBe(0);
  });
});

describe("the pike", () => {
  test("is fished from the boat, facing water", () => {
    // The home island is sand in open sea: somewhere on it, the sea lies
    // straight to the south.
    const userId = testUserId("fisher");
    const island = trackTestWorld(getOrCreatePlayerWorld(userId));
    const map = getEffectiveMap(island);
    const ocean = worldTileValueForName("ocean");
    let shore: { row: number; col: number } | null = null;
    for (let row = 0; row + 1 < map.length && !shore; row++) {
      for (let col = 0; col < map[row].length && !shore; col++) {
        if (isWorldTileWalkable(map[row][col]) && map[row + 1][col] === ocean) {
          shore = { row: row, col: col };
        }
      }
    }
    savePlayerPosition(userId, island, {
      row: shore!.row,
      col: shore!.col,
      seq: 0,
      rotation: 0,
    });
    give(userId, "boat");

    expect(act(userId, "fish").ok).toBe(true);
    resolvePendingActionsForWorld(island, Date.now() + 60000);

    expect(held(userId, "pike_jawbone")).toBe(1);
  });

  test("is not fished from dry land", () => {
    const forest = createTestWorld(16, 16);
    const map = getEffectiveMap(forest);
    let start: { row: number; col: number } | null = null;
    for (let row = 1; row + 1 < map.length && !start; row++) {
      for (let col = 1; col < map[row].length && !start; col++) {
        if (
          isWorldTileWalkable(map[row][col]) &&
          map[row + 1][col] === worldTileValueForName("ground")
        ) {
          start = { row: row, col: col };
        }
      }
    }
    const fisher = createTestPlayer(forest, "dry-fisher", start!);
    give(fisher, "boat");

    expect(act(fisher, "fish").error).toBe("error.fish_needs_water");
    expect(held(fisher, "pike_jawbone")).toBe(0);
  });

  test("its jawbone makes a kantele, and teaches the kantele's origin", () => {
    const forest = createTestWorld(16, 16);
    const maker = createTestPlayer(
      forest,
      "maker",
      walkableRunFinder(forest)(1)[0],
    );
    give(maker, "starter_kit");
    give(maker, "pike_jawbone");
    give(maker, "birch_bark_letter");
    give(maker, "juniper_bundle");

    expect(act(maker, "craft_kantele").ok).toBe(true);
    resolvePendingActionsForWorld(forest, Date.now() + 60000);

    expect(held(maker, "kantele")).toBe(1);
    expect(held(maker, "pike_jawbone")).toBe(0);
    expect(loadPlayerInventory(maker).values.synty_kantele).toBe(1);
  });

  test("the kantele cannot be made without one", () => {
    const forest = createTestWorld(16, 16);
    const maker = createTestPlayer(
      forest,
      "jawless",
      walkableRunFinder(forest)(1)[0],
    );
    give(maker, "starter_kit");
    give(maker, "birch_bark_letter");
    give(maker, "juniper_bundle");
    give(maker, "rune_stone");

    expect(act(maker, "craft_kantele").ok).toBe(false);
    expect(held(maker, "kantele")).toBe(0);
  });
});
