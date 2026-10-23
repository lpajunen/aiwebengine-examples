/**
 * Tests for the elk of Hiisi: a hunt from the trail to the hides.
 *
 * What these guard is that the hunt is a hunt: the elk is as hard to bring
 * down as the hunt is large, the blows on it are the hunters' shares and
 * nothing else's are, and bringing it down rewards everyone who struck.
 *
 * The blows are counted through countHarmToQuarry, the hook both fights and
 * spells call; how a fight or a spell lands is their own modules' tests.
 */

import { readChronicle } from "./chronicle.ts";
import {
  advanceDueEvent,
  countHarmToQuarry,
  getEventContribution,
  getEventState,
} from "./events.ts";
import { EVENT_DEFINITIONS } from "./event-registry.ts";
import { HIISI_ELK_EVENT_ID } from "./hiisi-elk.ts";
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
import { countLivingItemsByType, isWorldTileWalkable } from "./world-domain.ts";
import {
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  primeTransactions,
} from "./test-fixtures.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(function () {
  primeTransactions();
});

afterEach(function () {
  cleanupTestData();
});

function theElk(worldId: string): { id: string; npc: any } | null {
  const npcs = loadWorldNPCs(worldId);
  const id = Object.keys(npcs).find(function (key) {
    return npcs[key].class_id === "npc_hiisi_elk";
  });
  return id ? { id: id, npc: npcs[id] } : null;
}

describe("the elk of Hiisi", () => {
  test("is hunted down by those who strike it, and leaves them its hide", () => {
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
    const beside = [
      [oakRow + 1, oakCol],
      [oakRow - 1, oakCol],
      [oakRow, oakCol + 1],
      [oakRow, oakCol - 1],
    ].find(function (tile) {
      return isWorldTileWalkable(map[tile[0]][tile[1]]);
    })!;
    const userId = createTestPlayer(vainola, "hunter", {
      row: beside[0],
      col: beside[1],
    });
    const inv = loadPlayerInventory(userId);
    inv.values.metsastys = 6;
    savePlayerInventory(userId, inv);
    const def = EVENT_DEFINITIONS[HIISI_ELK_EVENT_ID];
    const now = Date.now();

    // A first tick starts its two days; after them the trail is there.
    advanceDueEvent(def, vainola, now);
    advanceDueEvent(def, vainola, now + 2 * DAY_MS);
    expect(getEventState(def.id, vainola, now)!.phase).toBe("ready");
    expect(
      performTreeActionForUser(userId, { action: "track_elk" }).payload.ok,
    ).toBe(true);
    const gathering = getEventState(def.id, vainola, now)!;

    advanceDueEvent(def, vainola, gathering.phaseEndsAt);
    expect(getEventState(def.id, vainola, now)!.phase).toBe("active");
    const elk = theElk(vainola)!;
    // One hunter: the elk has the hunt's 25 points of work in it.
    expect(elk.npc.values.currentHitPoints).toBe(25);

    // Another living's harm is not the hunt's.
    countHarmToQuarry(
      vainola,
      { class_id: "npc_wolf", values: { broughtBy: HIISI_ELK_EVENT_ID } },
      userId,
      10,
      now,
    );
    // The tracker is a hunter from the start, with nothing to their name yet.
    expect(getEventContribution(def.id, vainola, userId)).toBe(0);

    countHarmToQuarry(vainola, elk.npc, userId, 10, now);
    expect(getEventState(def.id, vainola, now)!.phase).toBe("active");
    countHarmToQuarry(vainola, elk.npc, userId, 15, now);

    expect(getEventState(def.id, vainola, now)!.phase).toBe("rewarding");
    expect(theElk(vainola)).toBeNull();
    expect(countLivingItemsByType(loadPlayerInventory(userId)).elk_hide).toBe(
      1,
    );
    expect(readChronicle(vainola, 1)[0].kind).toBe("elk_caught");
  });
});
