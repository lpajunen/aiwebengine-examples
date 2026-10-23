/**
 * Tests for the kantele concert: one played beneath the old oak, from the
 * first note to the animals going home.
 *
 * What these guard is that a concert is worth giving and worth hearing —
 * the animals come, every listener is rested and rewarded, the chronicle
 * remembers the player — and that it cannot be given again at once.
 *
 * The concert happens in a Väinölä of the test's own, not the live one.
 */

import { readChronicle } from "./chronicle.ts";
import { advanceDueEvent, getEventState } from "./events.ts";
import { EVENT_DEFINITIONS } from "./event-registry.ts";
import { KANTELE_CONCERT_EVENT_ID } from "./kantele-concert.ts";
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

/** The livings the concert brought to this world. */
function listeners(worldId: string): string[] {
  const npcs = loadWorldNPCs(worldId);
  return Object.keys(npcs).filter(function (id) {
    return npcs[id].values && npcs[id].values.broughtBy === "kantele_concert";
  });
}

describe("a kantele concert", () => {
  test("gathers the animals, rests its listeners, and is remembered", () => {
    const vainola = createTestWorld(30, 30, START_WORLD_CLASS_ID);
    ensureWorldItems(vainola);
    const byTile = loadWorldItems(vainola);
    const oakKey = Object.keys(byTile).find(function (key) {
      return (byTile[key] || []).some(function (item: any) {
        return item.type === "old_oak";
      });
    })!;
    const [oakRow, oakCol] = oakKey.split("_").map(Number);
    const map = getEffectiveMap(vainola);
    const row = isWorldTileWalkable(map[oakRow + 2][oakCol])
      ? oakRow + 2
      : oakRow - 2;
    const userId = createTestPlayer(vainola, "player", {
      row: row,
      col: oakCol,
    });
    const inv = loadPlayerInventory(userId);
    inv.bag.push({ id: "test-kantele-" + userId, type: "kantele" });
    inv.values.fatigue = 50;
    inv.values.experience = 0;
    savePlayerInventory(userId, inv);
    const def = EVENT_DEFINITIONS[KANTELE_CONCERT_EVENT_ID];
    const now = Date.now();

    advanceDueEvent(def, vainola, now);
    expect(getEventState(def.id, vainola, now)!.phase).toBe("ready");
    expect(
      performTreeActionForUser(userId, { action: "give_concert" }).payload.ok,
    ).toBe(true);
    const gathering = getEventState(def.id, vainola, now)!;
    expect(gathering.phase).toBe("gathering");

    advanceDueEvent(def, vainola, gathering.phaseEndsAt);
    const playing = getEventState(def.id, vainola, now)!;
    expect(playing.phase).toBe("active");
    expect(listeners(vainola).length).toBeGreaterThan(2);

    advanceDueEvent(def, vainola, playing.phaseEndsAt);
    const rewarding = getEventState(def.id, vainola, now)!;
    expect(rewarding.phase).toBe("rewarding");
    const rested = loadPlayerInventory(userId);
    expect(rested.values.fatigue).toBe(0);
    expect(rested.values.experience).toBe(15);
    expect(readChronicle(vainola, 1)[0].kind).toBe("concert");

    advanceDueEvent(def, vainola, rewarding.phaseEndsAt);
    expect(listeners(vainola)).toHaveLength(0);

    // Not again at once: the next concert waits out the cooldown.
    advanceDueEvent(def, vainola, rewarding.phaseEndsAt + 1000);
    const again = performTreeActionForUser(userId, {
      action: "give_concert",
    }).payload;
    expect(again.ok).toBe(false);
    expect(again.error).toBe("error.event_not_ready");
  });
});
