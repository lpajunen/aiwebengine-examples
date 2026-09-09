/**
 * Tests for tile reservations — "what rules does this tile carry in this world".
 *
 * The answers come from the world class's placements: a placement declares
 * circles and rectangles, each carrying rules, and the rest of the game asks
 * questions against them. Spawn selection reads them, terrain generation routes
 * around them, planting and building refuse inside them, and the NPC tick calls
 * `isReservedTile` per candidate tile — so the geometry is both load-bearing and
 * hot.
 *
 * Database-backed, and the first suite that needs a world class of its own: a
 * class carrying placements, and a world belonging to it. Both are deleted
 * again, the class in a transaction because it is global.
 */

import {
  RESERVATION_BLOCK_BUILD,
  RESERVATION_BLOCK_PLANT,
  RESERVATION_CLEAR_TERRAIN,
  RESERVATION_PROTECT_LANDMARK,
  RESERVATION_SPAWN_AREA,
  applyWorldReservationsToMap,
  getReservationBounds,
  getReservedTiles,
  getSpawnFallbackTile,
  isReservedTile,
  isTerrainPlacementTile,
  normalizeReservationRule,
} from "./world-reservations.ts";
import { deleteWorldClass, upsertWorldClass } from "./world-class-storage.ts";
import { cleanupTestData, createTestWorld } from "./test-fixtures.ts";
import { isWorldTileWalkable, worldTileValueForName } from "./world-domain.ts";
import { runInWorldTransaction } from "./world-db.ts";

const DIM = 24;
// The oak stands here with a spawn ring and a clearing around it; the gate
// keeps a rectangle nobody may build in.
const OAK = { row: 10, col: 10 };
const SPAWN_RADIUS = 2;
const CLEARING_RADIUS = 3;
const GATE = { row: 18, col: 18 };
const GATE_ROWS = 2;
const GATE_COLS = 3;

let classId = "";
let worldId = "";
let plainWorldId = "";
let counter = 0;

beforeEach(function () {
  classId = "test_wc_" + ++counter + "_" + Date.now();
  upsertWorldClass({
    id: classId,
    baseType: "forest",
    rows: DIM,
    cols: DIM,
    labelKey: "world.class." + classId,
    fallbackLabel: "Reservation test world",
    itemSpawns: [],
    npcSpawns: [],
    placements: [
      {
        id: "old_oak",
        kind: "terrain",
        classId: "mountain",
        position: { strategy: "exact", row: OAK.row, col: OAK.col },
        state: {},
        reservations: [
          {
            kind: "circle",
            row: OAK.row,
            col: OAK.col,
            radius: SPAWN_RADIUS,
            rules: [RESERVATION_SPAWN_AREA],
          },
          {
            kind: "circle",
            row: OAK.row,
            col: OAK.col,
            radius: CLEARING_RADIUS,
            rules: [RESERVATION_CLEAR_TERRAIN],
          },
        ],
      },
      {
        id: "guild_gate",
        kind: "terrain",
        classId: "house",
        position: { strategy: "exact", row: GATE.row, col: GATE.col },
        state: {},
        reservations: [
          {
            kind: "rectangle",
            row: GATE.row,
            col: GATE.col,
            rows: GATE_ROWS,
            cols: GATE_COLS,
            rules: [RESERVATION_BLOCK_BUILD],
          },
        ],
      },
    ],
    generation: null,
    placementRevision: 0,
    ownerIds: ["test-owner"],
    labels: {},
  });
  worldId = createTestWorld(DIM, DIM, classId);
  // A world of an ordinary class, for the "declares nothing" cases.
  plainWorldId = createTestWorld(DIM, DIM);
});

afterEach(function () {
  runInWorldTransaction("test_reservation_cleanup", function () {
    deleteWorldClass(classId);
  });
  cleanupTestData();
});

/** A map of solid rock, so clearing shows up as a change. */
function rockMap(): number[][] {
  const rock = worldTileValueForName("mountain");
  const map: number[][] = [];
  for (let row = 0; row < DIM; row++) {
    map[row] = [];
    for (let col = 0; col < DIM; col++) map[row][col] = rock;
  }
  return map;
}

describe("naming a rule", () => {
  test("a rule the system knows survives", () => {
    expect(normalizeReservationRule(RESERVATION_SPAWN_AREA)).toBe(
      RESERVATION_SPAWN_AREA,
    );
    expect(normalizeReservationRule(RESERVATION_BLOCK_BUILD)).toBe(
      RESERVATION_BLOCK_BUILD,
    );
  });

  test("the legacy zone kinds still resolve", () => {
    // Action-class rows seeded before rules had names still say oak_clearing,
    // and the seeder never rewrites a key a row already has — so these aliases
    // are a floor, not a shim with an expiry date.
    expect(normalizeReservationRule("oak_clearing")).toBe(
      RESERVATION_BLOCK_PLANT,
    );
    expect(normalizeReservationRule("oak_center")).toBe(
      RESERVATION_PROTECT_LANDMARK,
    );
  });

  test("anything else is no rule at all", () => {
    expect(normalizeReservationRule("no_such_rule")).toBe("");
    expect(normalizeReservationRule("")).toBe("");
    expect(normalizeReservationRule(null)).toBe("");
  });
});

describe("asking whether a tile is reserved", () => {
  test("a circle covers its centre and everything within the radius", () => {
    expect(
      isReservedTile(worldId, OAK.row, OAK.col, RESERVATION_SPAWN_AREA),
    ).toBe(true);
    expect(
      isReservedTile(
        worldId,
        OAK.row + SPAWN_RADIUS,
        OAK.col,
        RESERVATION_SPAWN_AREA,
      ),
    ).toBe(true);
    expect(
      isReservedTile(worldId, OAK.row + 1, OAK.col + 1, RESERVATION_SPAWN_AREA),
    ).toBe(true);
  });

  test("and nothing beyond it", () => {
    expect(
      isReservedTile(
        worldId,
        OAK.row + SPAWN_RADIUS + 1,
        OAK.col,
        RESERVATION_SPAWN_AREA,
      ),
    ).toBe(false);
    // The corner of the bounding box is outside the disc.
    expect(
      isReservedTile(
        worldId,
        OAK.row + SPAWN_RADIUS,
        OAK.col + SPAWN_RADIUS,
        RESERVATION_SPAWN_AREA,
      ),
    ).toBe(false);
  });

  test("a rectangle covers its own rows and columns", () => {
    expect(
      isReservedTile(worldId, GATE.row, GATE.col, RESERVATION_BLOCK_BUILD),
    ).toBe(true);
    expect(
      isReservedTile(
        worldId,
        GATE.row + GATE_ROWS - 1,
        GATE.col + GATE_COLS - 1,
        RESERVATION_BLOCK_BUILD,
      ),
    ).toBe(true);
    expect(
      isReservedTile(
        worldId,
        GATE.row + GATE_ROWS,
        GATE.col,
        RESERVATION_BLOCK_BUILD,
      ),
    ).toBe(false);
    expect(
      isReservedTile(worldId, GATE.row, GATE.col - 1, RESERVATION_BLOCK_BUILD),
    ).toBe(false);
  });

  test("each rule sees only its own reservations", () => {
    // The gate's rectangle blocks building, not spawning; the oak's ring is the
    // other way round.
    expect(
      isReservedTile(worldId, GATE.row, GATE.col, RESERVATION_SPAWN_AREA),
    ).toBe(false);
    expect(
      isReservedTile(worldId, OAK.row, OAK.col, RESERVATION_BLOCK_BUILD),
    ).toBe(false);
  });

  test("a placement's own tile is a protected landmark", () => {
    expect(
      isReservedTile(worldId, OAK.row, OAK.col, RESERVATION_PROTECT_LANDMARK),
    ).toBe(true);
    expect(
      isReservedTile(worldId, GATE.row, GATE.col, RESERVATION_PROTECT_LANDMARK),
    ).toBe(true);
    expect(
      isReservedTile(
        worldId,
        OAK.row + 1,
        OAK.col,
        RESERVATION_PROTECT_LANDMARK,
      ),
    ).toBe(false);
  });

  test("an unknown rule reserves nothing rather than everything", () => {
    expect(isReservedTile(worldId, OAK.row, OAK.col, "no_such_rule")).toBe(
      false,
    );
  });

  test("a world whose class declares no placements reserves nothing", () => {
    expect(
      isReservedTile(plainWorldId, OAK.row, OAK.col, RESERVATION_SPAWN_AREA),
    ).toBe(false);
    expect(getReservedTiles(plainWorldId, RESERVATION_SPAWN_AREA)).toEqual([]);
    expect(
      getReservationBounds(plainWorldId, RESERVATION_BLOCK_BUILD),
    ).toBeNull();
    expect(getSpawnFallbackTile(plainWorldId)).toBeNull();
  });
});

describe("listing the reserved tiles", () => {
  test("the centre comes first, so spawn picking clusters", () => {
    const tiles = getReservedTiles(worldId, RESERVATION_SPAWN_AREA);
    expect(tiles.length > 0).toBe(true);
    expect(tiles[0]).toEqual({ row: OAK.row, col: OAK.col });
  });

  test("the list is the disc, and every tile is inside it", () => {
    const tiles = getReservedTiles(worldId, RESERVATION_SPAWN_AREA);
    // Every tile with dr² + dc² <= r²: 13 of them for a radius of 2.
    expect(tiles).toHaveLength(13);
    const outside = tiles.filter(function (tile) {
      const dr = tile.row - OAK.row;
      const dc = tile.col - OAK.col;
      return dr * dr + dc * dc > SPAWN_RADIUS * SPAWN_RADIUS;
    });
    expect(outside).toEqual([]);
  });

  test("distance decides the order", () => {
    const tiles = getReservedTiles(worldId, RESERVATION_SPAWN_AREA);
    let previous = -1;
    const outOfOrder = tiles.filter(function (tile) {
      const dr = tile.row - OAK.row;
      const dc = tile.col - OAK.col;
      const dist = dr * dr + dc * dc;
      const bad = dist < previous;
      previous = dist;
      return bad;
    });
    expect(outOfOrder).toEqual([]);
  });

  test("a rectangle lists its rows and columns", () => {
    const tiles = getReservedTiles(worldId, RESERVATION_BLOCK_BUILD);
    expect(tiles).toHaveLength(GATE_ROWS * GATE_COLS);
    const outside = tiles.filter(function (tile) {
      return (
        tile.row < GATE.row ||
        tile.row >= GATE.row + GATE_ROWS ||
        tile.col < GATE.col ||
        tile.col >= GATE.col + GATE_COLS
      );
    });
    expect(outside).toEqual([]);
  });

  test("landmark tiles are the placements themselves", () => {
    const tiles = getReservedTiles(worldId, RESERVATION_PROTECT_LANDMARK);
    expect(tiles).toHaveLength(2);
    expect(tiles).toContain({ row: OAK.row, col: OAK.col });
    expect(tiles).toContain({ row: GATE.row, col: GATE.col });
  });
});

describe("the extent of a rule", () => {
  test("a circle's bounds are its bounding box", () => {
    expect(getReservationBounds(worldId, RESERVATION_SPAWN_AREA)).toEqual({
      minRow: OAK.row - SPAWN_RADIUS,
      maxRow: OAK.row + SPAWN_RADIUS,
      minCol: OAK.col - SPAWN_RADIUS,
      maxCol: OAK.col + SPAWN_RADIUS,
    });
  });

  test("a rectangle's bounds are its own corners", () => {
    expect(getReservationBounds(worldId, RESERVATION_BLOCK_BUILD)).toEqual({
      minRow: GATE.row,
      maxRow: GATE.row + GATE_ROWS - 1,
      minCol: GATE.col,
      maxCol: GATE.col + GATE_COLS - 1,
    });
  });

  test("a rule nobody declared has no extent", () => {
    // Terrain generation asks this before routing a river around an area; null
    // has to mean "nothing to avoid" rather than an empty box at the origin.
    expect(getReservationBounds(worldId, RESERVATION_BLOCK_PLANT)).toBeNull();
  });
});

describe("where an arriving player lands when the spawn area is full", () => {
  test("the tile just south of the spawn centre", () => {
    expect(getSpawnFallbackTile(worldId)).toEqual({
      row: OAK.row + 1,
      col: OAK.col,
    });
  });
});

describe("terrain a placement owns", () => {
  test("the placement's tile is claimed", () => {
    expect(isTerrainPlacementTile(worldId, OAK.row, OAK.col)).toBe(true);
    expect(isTerrainPlacementTile(worldId, GATE.row, GATE.col)).toBe(true);
  });

  test("its neighbours are not", () => {
    expect(isTerrainPlacementTile(worldId, OAK.row + 1, OAK.col)).toBe(false);
  });
});

describe("painting reservations onto a map", () => {
  test("a clearing clears the scenery inside it", () => {
    const map = applyWorldReservationsToMap(rockMap(), worldId);

    // Inside the clearing but not on the landmark: walkable ground now.
    expect(isWorldTileWalkable(map[OAK.row][OAK.col + 1])).toBe(true);
    expect(isWorldTileWalkable(map[OAK.row - CLEARING_RADIUS][OAK.col])).toBe(
      true,
    );
  });

  test("and leaves the rock beyond it alone", () => {
    const map = applyWorldReservationsToMap(rockMap(), worldId);

    expect(map[OAK.row + CLEARING_RADIUS + 1][OAK.col]).toBe(
      worldTileValueForName("mountain"),
    );
    expect(map[0][0]).toBe(worldTileValueForName("mountain"));
  });

  test("a landmark's own footprint survives its own clearing", () => {
    // The oak is painted after the clearing runs, so the tile it stands on
    // keeps the terrain the placement names.
    const map = applyWorldReservationsToMap(rockMap(), worldId);

    expect(map[OAK.row][OAK.col]).toBe(worldTileValueForName("mountain"));
    expect(map[GATE.row][GATE.col]).toBe(worldTileValueForName("house"));
  });

  test("a world with no placements gets its map back untouched", () => {
    const before = rockMap();
    const after = applyWorldReservationsToMap(rockMap(), plainWorldId);

    expect(after).toEqual(before);
  });

  test("the map is painted in place and handed back", () => {
    const map = rockMap();
    expect(applyWorldReservationsToMap(map, worldId)).toBe(map);
  });
});
