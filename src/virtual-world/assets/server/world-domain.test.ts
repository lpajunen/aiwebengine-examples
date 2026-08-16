/**
 * Sample tests for the world domain helpers.
 *
 * Run them against a deployed engine with:
 *
 *   curl -X POST "$SERVER_HOST/engine/run_tests?uri=virtual-world"
 *
 * The engine finds this file because it is an asset named `*.test.ts`; the file
 * sits next to the module it covers rather than in a separate tests folder,
 * which the suffix rule allows. Every case below is pure — no world rows, no
 * class caches — so the suite says something useful about a fresh deployment
 * before any world exists.
 */

import {
  MAX_WORLD_DIM,
  MIN_WORLD_DIM,
  WORLD_TILE_CAVE_FLOOR,
  WORLD_TILE_MOUNTAIN,
  WORLD_TILE_OCEAN,
  WORLD_TILE_SAND,
  WORLD_TILE_SPRUCE_THICKET,
  WORLD_TYPE_FOREST,
  countLivingItemsByType,
  consumeLivingItemsByType,
  fromStoredWorldTimestamp,
  getAllKnownItemTypes,
  getBagItems,
  getEquippedItems,
  getNPCDisplayName,
  getNearbyTileKeys,
  getWorldBoundaryTileName,
  getWorldFlavorTextByIndex,
  getWorldFlavorTextIndex,
  getWorldFloorTileName,
  getWorldWallTileName,
  hashString,
  isValidItem,
  isWithinTileDistance,
  mulberry32,
  normalizeWorldDimension,
  normalizeWorldType,
  toStoredWorldTimestamp,
} from "./world-domain.ts";

describe("world dimensions", () => {
  test("an absent stored value falls back instead of clamping", () => {
    // Number(null) is 0, which would clamp every pre-existing world to the
    // minimum — the reason normalizeWorldDimension checks for absence first.
    expect(normalizeWorldDimension(null, 100)).toBe(100);
    expect(normalizeWorldDimension(undefined, 100)).toBe(100);
    expect(normalizeWorldDimension("", 100)).toBe(100);
  });

  test("a stored value is clamped to the allowed range", () => {
    expect(normalizeWorldDimension(4, 100)).toBe(MIN_WORLD_DIM);
    expect(normalizeWorldDimension(5000, 100)).toBe(MAX_WORLD_DIM);
    expect(normalizeWorldDimension(64, 100)).toBe(64);
  });

  test("a numeric string from the database is accepted", () => {
    expect(normalizeWorldDimension("64", 100)).toBe(64);
    expect(normalizeWorldDimension("64.9", 100)).toBe(64);
  });

  test("nonsense falls back rather than producing a zero-sized world", () => {
    expect(normalizeWorldDimension(0, 100)).toBe(100);
    expect(normalizeWorldDimension(-5, 100)).toBe(100);
    expect(normalizeWorldDimension("not a number", 100)).toBe(100);
  });
});

describe("world types", () => {
  test("a known type survives, whatever its casing", () => {
    expect(normalizeWorldType("cave")).toBe("cave");
    expect(normalizeWorldType("CAVE")).toBe("cave");
    expect(normalizeWorldType("Island")).toBe("island");
  });

  test("an unknown or missing type becomes forest", () => {
    expect(normalizeWorldType("swamp")).toBe(WORLD_TYPE_FOREST);
    expect(normalizeWorldType(null)).toBe(WORLD_TYPE_FOREST);
    expect(normalizeWorldType(undefined)).toBe(WORLD_TYPE_FOREST);
  });

  test("each world type picks its own floor, wall, and boundary tiles", () => {
    expect(getWorldFloorTileName("island")).toBe(WORLD_TILE_SAND);
    expect(getWorldFloorTileName("cave")).toBe(WORLD_TILE_CAVE_FLOOR);

    expect(getWorldWallTileName("cave")).toBe(WORLD_TILE_MOUNTAIN);
    expect(getWorldBoundaryTileName("island")).toBe(WORLD_TILE_OCEAN);

    // An unknown type is normalized first, so it gets the forest tiles.
    expect(getWorldWallTileName("swamp")).toBe(WORLD_TILE_SPRUCE_THICKET);
  });
});

describe("deterministic world flavour", () => {
  test("hashString is stable and never negative", () => {
    expect(hashString("a")).toBe(97);
    expect(hashString("world-42")).toBe(hashString("world-42"));
    expect(hashString("")).toBe(0);
    expect(hashString("zzzzzzzzzzzz")).toBeGreaterThan(-1);
  });

  test("a world always gets the same flavour text", () => {
    const index = getWorldFlavorTextIndex("42");
    expect(index).toBe(getWorldFlavorTextIndex("42"));
    expect(index).toBeGreaterThan(-1);
    expect(getWorldFlavorTextByIndex(index).length).toBeGreaterThan(0);
  });

  test("an out-of-range flavour index yields an empty string, not a crash", () => {
    expect(getWorldFlavorTextByIndex(99999)).toBe("");
  });

  test("an NPC keeps its name across restarts", () => {
    const name = getNPCDisplayName("42", "npc-7");
    expect(name).toBe(getNPCDisplayName("42", "npc-7"));
    // A prefix and a suffix, e.g. "Lempi the Juniper Hand".
    expect(name).toMatch(/^\S+( \S+)+$/);
    // The world is part of the seed, so the same npc id elsewhere is free to
    // be someone else.
    expect(getNPCDisplayName("42", "npc-7")).not.toBe(
      getNPCDisplayName("43", "npc-7"),
    );
  });

  test("mulberry32 replays a seed exactly", () => {
    const first = mulberry32(12345);
    const second = mulberry32(12345);
    const drawn = [first(), first(), first()];

    expect(drawn).toEqual([second(), second(), second()]);
    drawn.forEach((value) => {
      expect(value).toBeGreaterThan(-0.0001);
      expect(value).toBeLessThan(1);
    });
  });
});

describe("tile neighbourhood", () => {
  test("a living reaches its own tile plus eight neighbours", () => {
    const keys = getNearbyTileKeys(5, 5);

    expect(keys).toHaveLength(9);
    expect(keys[0]).toBe("5_5");
    expect(keys).toContain("4_5");
    expect(keys).toContain("6_6");

    const unique: Record<string, boolean> = {};
    keys.forEach((key) => {
      unique[key] = true;
    });
    expect(Object.keys(unique)).toHaveLength(9);
  });

  test("negative coordinates still produce well-formed keys", () => {
    expect(getNearbyTileKeys(0, 0)).toContain("-1_-1");
  });

  test("distance is measured chessboard-style, so diagonals count as one", () => {
    expect(isWithinTileDistance(0, 0, 1, 1, 1)).toBeTruthy();
    expect(isWithinTileDistance(0, 0, 0, 2, 1)).toBeFalsy();
    expect(isWithinTileDistance(0, 0, 2, 2, 2)).toBeTruthy();
    expect(isWithinTileDistance(5, 5, 5, 5, 0)).toBeTruthy();
  });
});

describe("stored timestamps", () => {
  test("milliseconds are stored as seconds", () => {
    expect(toStoredWorldTimestamp(1700000000000)).toBe(1700000000);
  });

  test("a value already in seconds is left alone", () => {
    expect(toStoredWorldTimestamp(1700000000)).toBe(1700000000);
  });

  test("a missing timestamp becomes now rather than the epoch", () => {
    expect(toStoredWorldTimestamp(0)).toBeGreaterThan(1600000000);
  });

  test("reading back restores milliseconds", () => {
    expect(fromStoredWorldTimestamp(1700000000)).toBe(1700000000000);
    expect(fromStoredWorldTimestamp(1700000000000)).toBe(1700000000000);
    expect(fromStoredWorldTimestamp(0)).toBe(0);
    expect(fromStoredWorldTimestamp(null)).toBe(0);
  });

  test("a round trip loses only the sub-second part", () => {
    const ms = 1700000000750;
    expect(fromStoredWorldTimestamp(toStoredWorldTimestamp(ms))).toBe(
      1700000000000,
    );
  });
});

describe("inventories", () => {
  function inventory() {
    return {
      slots: {
        left_hand: { id: "item-1", type: "saw" },
        right_hand: null,
      },
      bag: [
        { id: "item-2", type: "log" },
        { id: "item-3", type: "log" },
      ],
    };
  }

  test("an item needs both an id and a type", () => {
    expect(isValidItem({ id: "item-1", type: "saw" })).toBeTruthy();
    expect(isValidItem({ id: "item-1" })).toBeFalsy();
    expect(isValidItem({ type: "saw" })).toBeFalsy();
    expect(isValidItem(null)).toBeFalsy();
  });

  test("equipped and bagged items are read separately", () => {
    const inv = inventory();

    // The empty right hand is not an item.
    expect(getEquippedItems(inv)).toHaveLength(1);
    expect(getBagItems(inv)).toHaveLength(2);
  });

  test("a malformed inventory reads as empty instead of throwing", () => {
    expect(getEquippedItems(null)).toHaveLength(0);
    expect(getBagItems({ bag: "not an array" })).toHaveLength(0);
    expect(countLivingItemsByType(undefined)).toEqual({});
  });

  test("counting spans both hands and bag", () => {
    expect(countLivingItemsByType(inventory())).toEqual({ saw: 1, log: 2 });
  });

  test("consuming takes what it can and reports how much that was", () => {
    const inv = inventory();

    expect(consumeLivingItemsByType(inv, "log", 1)).toBe(1);
    expect(inv.bag).toHaveLength(1);
    expect(countLivingItemsByType(inv)).toEqual({ saw: 1, log: 1 });

    // Asking for more than exists consumes everything available and says so,
    // rather than failing or over-consuming.
    expect(consumeLivingItemsByType(inv, "log", 5)).toBe(1);
    expect(inv.bag).toHaveLength(0);
  });

  test("consuming empties the slot an item was equipped in", () => {
    const inv = inventory();

    expect(consumeLivingItemsByType(inv, "saw", 1)).toBe(1);
    expect(inv.slots.left_hand).toBeNull();
    expect(getEquippedItems(inv)).toHaveLength(0);
  });

  test("consuming nothing changes nothing", () => {
    const inv = inventory();

    expect(consumeLivingItemsByType(inv, "log", 0)).toBe(0);
    expect(consumeLivingItemsByType(inv, "shield", 1)).toBe(0);
    expect(countLivingItemsByType(inv)).toEqual({ saw: 1, log: 2 });
  });
});

describe("item registry", () => {
  test("the built-in item types are available without a database", () => {
    const types = getAllKnownItemTypes();

    expect(types.length).toBeGreaterThan(0);
    expect(types).toContain("saw");
  });

  test("the returned list is a copy the caller cannot corrupt", () => {
    const types = getAllKnownItemTypes();
    types.push("not-a-real-item");

    expect(getAllKnownItemTypes()).not.toContain("not-a-real-item");
  });
});
