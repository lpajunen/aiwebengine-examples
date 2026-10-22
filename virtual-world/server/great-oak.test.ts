/**
 * Tests for the great oak: how it grows, and one felling from the call to the
 * rewards.
 *
 * What these guard is the poem as a game: the oak grows faster the more the
 * players plant, only someone who knows its origin can call the small man,
 * striking it is the work, and when it falls each who struck may choose
 * branch, crown or leaf — and it grows again from nothing.
 *
 * The felling happens in a Väinölä of the test's own (the start village's
 * class), not the live one.
 */

import { advanceDueEvent, claimEventReward, getEventState } from "./events.ts";
import { readChronicle } from "./chronicle.ts";
import { getEffectiveNick } from "./social-state.ts";
import { EVENT_DEFINITIONS } from "./event-registry.ts";
import {
  FULL_GROWTH_MS,
  GREAT_OAK_EVENT_ID,
  grownOak,
  oakGrowth,
} from "./great-oak.ts";
import {
  ensureWorldItems,
  loadPlayerInventory,
  loadWorldItems,
  savePlayerInventory,
} from "./item-storage.ts";
import { loadWorldNPCs } from "./npc-storage.ts";
import { START_WORLD_CLASS_ID } from "./runtime-config.ts";
import { performTreeActionForUser } from "./tree-action-helpers.ts";
import { getEffectiveMap } from "./world-bootstrap.ts";
import { isWorldTileWalkable } from "./world-domain.ts";
import {
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  primeTransactions,
} from "./test-fixtures.ts";

beforeEach(function () {
  primeTransactions();
});

afterEach(function () {
  cleanupTestData();
});

describe("the oak's growth", () => {
  test("takes a week alone, and less the more is planted", () => {
    expect(grownOak(0, FULL_GROWTH_MS, 0)).toBe(100);
    expect(grownOak(0, FULL_GROWTH_MS / 2, 0)).toBe(50);
    expect(grownOak(0, FULL_GROWTH_MS / 2, 50)).toBe(100);
    expect(grownOak(90, FULL_GROWTH_MS, 0)).toBe(100);
  });

  test("is full for an oak that never recorded any", () => {
    expect(oakGrowth({ type: "old_oak" })).toBe(100);
    expect(oakGrowth({ type: "old_oak", state: { growth: 12 } })).toBe(12);
  });
});

/** The oak in this world, as its tile and item. */
function theOak(worldId: string): { row: number; col: number; item: any } {
  const byTile = loadWorldItems(worldId);
  for (const key of Object.keys(byTile)) {
    const oak = (byTile[key] || []).find(function (item: any) {
      return item && item.type === "old_oak";
    });
    if (oak) {
      const [row, col] = key.split("_").map(Number);
      return { row: row, col: col, item: oak };
    }
  }
  throw new Error("no oak");
}

describe("Väinölä's shore", () => {
  test("always has shells to call the small man with", () => {
    const vainola = createTestWorld(30, 30, START_WORLD_CLASS_ID);
    ensureWorldItems(vainola);

    const shells = Object.values(loadWorldItems(vainola))
      .flat()
      .filter(function (item: any) {
        return item && item.type === "sea_shell";
      });
    expect(shells).toHaveLength(3);
  });
});

describe("felling the great oak", () => {
  test("goes from the call to the rewards, and the oak grows again", () => {
    const vainola = createTestWorld(30, 30, START_WORLD_CLASS_ID);
    ensureWorldItems(vainola);
    const oak = theOak(vainola);
    const map = getEffectiveMap(vainola);
    const beside = [
      [oak.row + 1, oak.col],
      [oak.row - 1, oak.col],
      [oak.row, oak.col + 1],
      [oak.row, oak.col - 1],
    ].find(function (tile) {
      return isWorldTileWalkable(map[tile[0]][tile[1]]);
    })!;
    const userId = createTestPlayer(vainola, "feller", {
      row: beside[0],
      col: beside[1],
    });
    const inv = loadPlayerInventory(userId);
    inv.class_id = "player_urho";
    inv.values.synty_tammi = 1;
    inv.bag.push({ id: "test-kit-" + userId, type: "starter_kit" });
    inv.bag.push({ id: "test-shell-" + userId, type: "sea_shell" });
    inv.bag.push({ id: "test-axe-" + userId, type: "stone_axe" });
    savePlayerInventory(userId, inv);
    const def = EVENT_DEFINITIONS[GREAT_OAK_EVENT_ID];
    const now = Date.now();

    // Fully grown, so ready, and the oak says the small man may be called.
    advanceDueEvent(def, vainola, now);
    expect(getEventState(def.id, vainola, now)!.phase).toBe("ready");
    expect(theOak(vainola).item.state.summonable).toBe(1);

    const called = performTreeActionForUser(userId, {
      action: "call_small_man",
    }).payload;
    expect(called.ok).toBe(true);
    const gathering = getEventState(def.id, vainola, now)!;
    expect(gathering.phase).toBe("gathering");
    const smallMen = Object.keys(loadWorldNPCs(vainola)).filter(function (id) {
      return loadWorldNPCs(vainola)[id].class_id === "npc_small_man";
    });
    expect(smallMen).toHaveLength(1);

    advanceDueEvent(def, vainola, gathering.phaseEndsAt);
    expect(getEventState(def.id, vainola, now)!.phase).toBe("active");
    expect(theOak(vainola).item.state.felling).toBe(1);

    let felled = false;
    for (let i = 0; i < 60 && !felled; i++) {
      const struck = performTreeActionForUser(userId, {
        action: "strike_oak",
      }).payload;
      expect(struck.ok).toBe(true);
      felled = struck.toast_message_key === "tree_action.oak_felled_toast";
    }
    expect(felled).toBe(true);
    const rewarding = getEventState(def.id, vainola, now)!;
    expect(rewarding.phase).toBe("rewarding");
    expect(theOak(vainola).item.state.growth).toBe(0);
    // Told in the chronicle, with the one who struck it.
    const told = readChronicle(vainola, 1)[0];
    expect(told.kind).toBe("oak_felled");
    expect(told.lines.en.join(" ")).toContain(getEffectiveNick(userId));

    // The crown: an origin they did not know.
    expect(claimEventReward(def.id, userId, vainola, 1, now).ok).toBe(true);
    expect(loadPlayerInventory(userId).values.synty_tuli).toBe(1);

    advanceDueEvent(def, vainola, rewarding.phaseEndsAt);
    expect(getEventState(def.id, vainola, now)!.phase).toBe("waiting");
    const after = loadWorldNPCs(vainola);
    expect(
      Object.keys(after).some(function (id) {
        return after[id].class_id === "npc_small_man";
      }),
    ).toBe(false);
  });

  test("cannot be called by someone who does not know the oak's origin", () => {
    const vainola = createTestWorld(30, 30, START_WORLD_CLASS_ID);
    ensureWorldItems(vainola);
    const oak = theOak(vainola);
    const userId = createTestPlayer(vainola, "ignorant", {
      row: oak.row + 1,
      col: oak.col,
    });
    const inv = loadPlayerInventory(userId);
    inv.bag.push({ id: "test-kit-" + userId, type: "starter_kit" });
    inv.bag.push({ id: "test-shell-" + userId, type: "sea_shell" });
    savePlayerInventory(userId, inv);
    advanceDueEvent(EVENT_DEFINITIONS[GREAT_OAK_EVENT_ID], vainola, Date.now());

    const called = performTreeActionForUser(userId, {
      action: "call_small_man",
    }).payload;

    expect(called.ok).toBe(false);
    expect(called.error).toBe("error.origin_of_the_oak_not_known");
  });
});
