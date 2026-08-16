/**
 * Tests for the class repositories — items, actions, livings, tiles, worlds.
 *
 * Two properties, one per describe block each time.
 *
 * A creator's class has to survive the trip through the database: the write
 * path returns ok, the in-memory cache is updated, and a reload that throws the
 * cache away and reads the rows back finds the same record. Half of these
 * repositories are read through a module-level cache, so "it worked" and "it
 * was stored" are genuinely different claims.
 *
 * And the built-ins have to still be there. They are seed data: the code
 * declares them, `init()` writes them, and from then on the rows are what the
 * game reads. Deleting or renaming a definition in code leaves its row behind,
 * and an edit to a definition does not reach a row that already exists — so a
 * built-in the code still names has to resolve, and resolve to what the code
 * says it is.
 *
 * Database-backed. Classes are global rather than world-scoped, so each case
 * removes the ones it made; the deletes run in a transaction, or the harness
 * rollback would put the rows back (see test-fixtures.ts).
 */

import { ACTION_DEFINITIONS } from "./action-registry.ts";
import {
  ITEM_DEFINITIONS,
  deleteActionClass,
  deleteItemClass,
  getActionClass,
  getAllItemClasses,
  getItemClass,
  reloadActionClassCache,
  reloadItemClassCache,
  upsertActionClass,
  upsertItemClass,
} from "./item-registry.ts";
import {
  deleteLivingClass,
  getDefaultNPCLivingClassId,
  getDefaultPlayerLivingClassId,
  getLivingClass,
  reloadLivingClassCache,
  upsertLivingClass,
} from "./living-registry.ts";
import {
  deleteTileClass,
  getTileClass,
  isBuiltinTileClassId,
  nextFreeTileValue,
  reloadTileClassCache,
  upsertTileClass,
  worldTileNameForValue,
  worldTileValueForName,
} from "./tile-registry.ts";
import {
  deleteWorldClass,
  getWorldClass,
  getWorldClassCacheGeneration,
  reloadWorldClassCache,
  upsertWorldClass,
} from "./world-class-storage.ts";
import { WORLD_TILE_DEFS } from "./world-domain.ts";
import { START_WORLD_CLASS_ID } from "./runtime-config.ts";
import { runInWorldTransaction } from "./world-db.ts";

type Cleanup = () => void;

const cleanups: Cleanup[] = [];
let classCounter = 0;

/** A class id no other case (or deployment) uses. */
function testClassId(prefix: string): string {
  return "test_" + prefix + "_" + ++classCounter + "_" + Date.now();
}

function onCleanup(fn: Cleanup): void {
  cleanups.push(fn);
}

afterEach(function () {
  // In a transaction, so the deletes outlive the run rather than being undone
  // with everything else the harness rolls back.
  runInWorldTransaction("test_class_cleanup", function () {
    for (let i = 0; i < cleanups.length; i++) cleanups[i]();
  });
  cleanups.length = 0;
});

describe("item classes", () => {
  function makeItemClass(id: string) {
    return {
      id: id,
      kind: "tool",
      nonDroppable: false,
      nonPickable: false,
      visuals: {
        color: 0x123456,
        labelKey: "item." + id + ".name",
        fallbackLabel: "Test tool",
        size: "medium" as const,
        style: "blade" as const,
      },
      actionIds: ["cut"],
      stateTemplate: { charges: 3 },
      ownerIds: ["test-owner"],
      labels: { en: "Test tool" },
    };
  }

  test("a new class is readable straight away", () => {
    const id = testClassId("item");
    onCleanup(function () {
      deleteItemClass(id);
    });

    expect(upsertItemClass(makeItemClass(id)).ok).toBe(true);

    const stored = getItemClass(id);
    expect(stored ? stored.kind : "").toBe("tool");
    expect(stored ? stored.actionIds : []).toEqual(["cut"]);
  });

  test("and survives a reload that reads it back from the row", () => {
    const id = testClassId("item");
    onCleanup(function () {
      deleteItemClass(id);
    });
    upsertItemClass(makeItemClass(id));

    reloadItemClassCache();

    const stored = getItemClass(id);
    expect(stored).toBeTruthy();
    expect(stored ? stored.visuals.fallbackLabel : "").toBe("Test tool");
    expect(stored ? stored.stateTemplate : null).toEqual({ charges: 3 });
    expect(stored ? stored.ownerIds : []).toEqual(["test-owner"]);
  });

  test("editing one replaces what the game reads", () => {
    const id = testClassId("item");
    onCleanup(function () {
      deleteItemClass(id);
    });
    upsertItemClass(makeItemClass(id));

    const edited = makeItemClass(id);
    edited.kind = "weapon";
    edited.actionIds = ["attack"];
    upsertItemClass(edited);
    reloadItemClassCache();

    const stored = getItemClass(id);
    expect(stored ? stored.kind : "").toBe("weapon");
    expect(stored ? stored.actionIds : []).toEqual(["attack"]);
  });

  test("deleting one removes the row, not just the cache entry", () => {
    const id = testClassId("item");
    upsertItemClass(makeItemClass(id));

    deleteItemClass(id);
    reloadItemClassCache();

    expect(getItemClass(id)).toBeNull();
  });

  test("an id nobody defined resolves to nothing", () => {
    expect(getItemClass("no_such_item_class")).toBeNull();
    expect(getItemClass("")).toBeNull();
  });

  test("every built-in definition still has a class", () => {
    const missing = Object.keys(ITEM_DEFINITIONS).filter(function (id) {
      return !getItemClass(id);
    });
    expect(missing).toEqual([]);
  });

  test("built-in classes still say what the code says they are", () => {
    // Seeding inserts a missing row but does not rewrite one that exists, so
    // a definition edited in code without a matching write drifts silently.
    // Only classes nobody owns are checked: a creator-owned class is *meant*
    // to have moved on from whatever the code seeded.
    //
    // KNOWN DRIFT, deliberately listed rather than hidden: the stored `flower`
    // row carries actionIds ["give_flower"] while the definition now says [],
    // so the flower still offers "give" as a direct item action. Deciding
    // whether to sync the row is a content call; until then this list keeps
    // the check live for every other class.
    const knownDrift = ["flower.actionIds"];
    const drifted: string[] = [];
    Object.keys(ITEM_DEFINITIONS).forEach(function (id) {
      const definition = ITEM_DEFINITIONS[id];
      const stored = getItemClass(id);
      if (!stored) return;
      if ((stored.ownerIds || []).length > 0) return;
      if (stored.kind !== definition.kind) drifted.push(id + ".kind");
      if (
        JSON.stringify(stored.actionIds || []) !==
        JSON.stringify(definition.actionIds || [])
      ) {
        drifted.push(id + ".actionIds");
      }
    });
    expect(
      drifted.filter(function (entry) {
        return knownDrift.indexOf(entry) === -1;
      }),
    ).toEqual([]);
  });

  test("the known drift is still exactly what it was", () => {
    // The companion to the allowance above: if the flower row gets synced (or
    // drifts further), this fails and the list has to be revisited rather than
    // quietly outliving the problem.
    const stored = getItemClass("flower");
    expect(stored ? stored.actionIds : []).toEqual(["give_flower"]);
    expect(ITEM_DEFINITIONS.flower.actionIds).toEqual([]);
  });

  test("the repository holds at least the built-ins", () => {
    expect(
      getAllItemClasses().length >= Object.keys(ITEM_DEFINITIONS).length,
    ).toBe(true);
  });
});

describe("action classes", () => {
  function makeActionClass(id: string) {
    return {
      id: id,
      targetKind: "item",
      labelKey: "action." + id + ".name",
      fallbackLabel: "Test action",
      ownerIds: ["test-owner"],
      labels: { en: "Test action" },
    } as any;
  }

  test("a new class round trips through the database", () => {
    const id = testClassId("action");
    onCleanup(function () {
      deleteActionClass(id);
    });

    expect(upsertActionClass(makeActionClass(id)).ok).toBe(true);
    reloadActionClassCache();

    const stored = getActionClass(id);
    expect(stored ? stored.targetKind : "").toBe("item");
    expect(stored ? stored.fallbackLabel : "").toBe("Test action");
  });

  test("deleting one takes it out of the repository", () => {
    const id = testClassId("action");
    upsertActionClass(makeActionClass(id));

    deleteActionClass(id);
    reloadActionClassCache();

    expect(getActionClass(id)).toBeNull();
  });

  test("every built-in action still has a class", () => {
    const missing = Object.keys(ACTION_DEFINITIONS).filter(function (id) {
      return !getActionClass(id);
    });
    expect(missing).toEqual([]);
  });

  test("built-in actions keep the target kind the code declares", () => {
    const drifted = Object.keys(ACTION_DEFINITIONS).filter(function (id) {
      const stored = getActionClass(id);
      return (
        !!stored && stored.targetKind !== ACTION_DEFINITIONS[id].targetKind
      );
    });
    expect(drifted).toEqual([]);
  });
});

describe("living classes", () => {
  function makeLivingClass(id: string) {
    return {
      id: id,
      kind: "npc" as const,
      labelKey: "living.class." + id,
      fallbackLabel: "Test creature",
      slotDefinitions: [
        {
          id: "right_hand",
          labelKey: "living.slot.right_hand",
          fallbackLabel: "Right hand",
          tags: ["hand"],
        },
      ],
      valueTemplate: { maxHitPoints: 5 },
      ownerIds: ["test-owner"],
      labels: { en: "Test creature" },
    };
  }

  test("a new class round trips through the database", () => {
    const id = testClassId("living");
    onCleanup(function () {
      deleteLivingClass(id);
    });

    expect(upsertLivingClass(makeLivingClass(id)).ok).toBe(true);
    reloadLivingClassCache();

    const stored = getLivingClass(id);
    expect(stored ? stored.kind : "").toBe("npc");
    expect(stored ? stored.slotDefinitions.length : 0).toBe(1);
    expect(stored ? stored.valueTemplate : null).toEqual({ maxHitPoints: 5 });
  });

  test("deleting one takes it out of the repository", () => {
    const id = testClassId("living");
    upsertLivingClass(makeLivingClass(id));

    deleteLivingClass(id);
    reloadLivingClassCache();

    expect(getLivingClass(id)).toBeNull();
  });

  test("the default player and NPC classes exist and carry slots", () => {
    // Every player is created as one of these; a missing row would leave new
    // arrivals with no body to put items on.
    const player = getLivingClass(getDefaultPlayerLivingClassId());
    expect(player).toBeTruthy();
    expect(player ? player.slotDefinitions.length > 0 : false).toBe(true);

    const npc = getLivingClass(getDefaultNPCLivingClassId());
    expect(npc).toBeTruthy();
  });

  test("a player class names a class to become when killed", () => {
    // The death cycle is data: fight-helpers reads deathClassId rather than
    // testing for a ghost by name, and the class it names has to exist.
    const player = getLivingClass(getDefaultPlayerLivingClassId());
    const deathClassId = player ? String(player.deathClassId || "") : "";
    expect(deathClassId).toBeTruthy();
    expect(getLivingClass(deathClassId)).toBeTruthy();
  });
});

describe("tile classes", () => {
  function makeTileClass(id: string, value: number) {
    return {
      id: id,
      value: value,
      walkable: true,
      layer: "terrain",
      visual: { style: "floor" as const, color: 0x445566 },
      ownerIds: ["test-owner"],
      labels: { en: "Test tile" },
    };
  }

  test("a new tile round trips, and its name and value agree", () => {
    const id = testClassId("tile");
    const value = nextFreeTileValue();
    onCleanup(function () {
      deleteTileClass(id);
    });

    expect(upsertTileClass(makeTileClass(id, value)).ok).toBe(true);
    reloadTileClassCache();

    const stored = getTileClass(id);
    expect(stored ? stored.value : -1).toBe(value);
    expect(worldTileValueForName(id)).toBe(value);
    expect(worldTileNameForValue(value)).toBe(id);
  });

  test("a value another tile already uses is refused", () => {
    // Two ids sharing a value would be indistinguishable in a map array: the
    // second would silently render and behave as the first.
    const id = testClassId("tile");
    const taken = worldTileValueForName("ground");

    const result = upsertTileClass(makeTileClass(id, taken));

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("taken");
    expect(getTileClass(id)).toBeNull();
  });

  test("deleting a tile frees its value again", () => {
    const id = testClassId("tile");
    const value = nextFreeTileValue();
    upsertTileClass(makeTileClass(id, value));

    deleteTileClass(id);

    expect(getTileClass(id)).toBeNull();
    expect(nextFreeTileValue() <= value).toBe(true);
  });

  test("built-in tiles are marked as such and a creator's tile is not", () => {
    expect(isBuiltinTileClassId("ground")).toBe(true);
    expect(isBuiltinTileClassId("no_such_tile")).toBe(false);
  });

  test("every tile the domain names has a class", () => {
    const missing = Object.keys(WORLD_TILE_DEFS).filter(function (name) {
      return !getTileClass(name);
    });
    expect(missing).toEqual([]);
  });

  test("built-in tiles keep the value and walkability the code declares", () => {
    // A changed value would move every stored map mod to a different tile.
    const drifted: string[] = [];
    Object.keys(WORLD_TILE_DEFS).forEach(function (name) {
      const definition = (WORLD_TILE_DEFS as Record<string, any>)[name];
      const stored = getTileClass(name);
      if (!stored) return;
      if (stored.value !== definition.value) drifted.push(name + ".value");
      if (stored.walkable !== definition.walkable) {
        drifted.push(name + ".walkable");
      }
    });
    expect(drifted).toEqual([]);
  });
});

describe("world classes", () => {
  function makeWorldClass(id: string) {
    return {
      id: id,
      baseType: "forest",
      rows: 24,
      cols: 24,
      labelKey: "world.class." + id,
      fallbackLabel: "Test world",
      itemSpawns: [{ id: "saw", count: 1 }],
      npcSpawns: [],
      placements: [],
      generation: null,
      placementRevision: 0,
      ownerIds: ["test-owner"],
      labels: { en: "Test world" },
    };
  }

  test("a new class round trips through the database", () => {
    const id = testClassId("world");
    onCleanup(function () {
      deleteWorldClass(id);
    });

    expect(upsertWorldClass(makeWorldClass(id)).ok).toBe(true);
    reloadWorldClassCache();

    const stored = getWorldClass(id);
    expect(stored ? stored.baseType : "").toBe("forest");
    expect(stored ? stored.rows : 0).toBe(24);
    expect(stored ? stored.itemSpawns : null).toEqual([
      { id: "saw", count: 1 },
    ]);
  });

  test("a write advances the cache generation", () => {
    // Resolved reservations are memoized against this number; if it stopped
    // moving, an edited class would keep serving its old spawn area.
    const id = testClassId("world");
    onCleanup(function () {
      deleteWorldClass(id);
    });
    const before = getWorldClassCacheGeneration();

    upsertWorldClass(makeWorldClass(id));

    expect(getWorldClassCacheGeneration() > before).toBe(true);
  });

  test("deleting one takes it out of the repository", () => {
    const id = testClassId("world");
    upsertWorldClass(makeWorldClass(id));

    deleteWorldClass(id);
    reloadWorldClassCache();

    expect(getWorldClass(id)).toBeNull();
  });

  test("the class new players start in exists", () => {
    const start = getWorldClass(START_WORLD_CLASS_ID);
    expect(start).toBeTruthy();
    expect(start ? start.rows > 0 && start.cols > 0 : false).toBe(true);
  });
});
