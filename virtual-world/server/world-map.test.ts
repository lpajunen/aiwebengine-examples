/**
 * Tests for terrain generation.
 *
 * Terrain is never stored: a world's map is regenerated from its id on every
 * read, and only mods and placements are layered on top. Determinism is
 * therefore load-bearing — if the same id stopped producing the same map, every
 * house and felled tree in every existing world would end up somewhere else.
 * `world-generation.test.ts` pins the presets; this pins that the generator
 * actually replays them.
 *
 * Pure: `generateWorldMap` takes its dimensions and spec as arguments, and the
 * ids below belong to no world, so the reservation lookups it makes come back
 * empty.
 */

import { applyWorldModsToMap, generateWorldMap } from "./world-map.ts";
import { DEFAULT_WORLD_GENERATION } from "./world-generation.ts";
import {
  WORLD_MOD_LAYER_OBJECT,
  WORLD_MOD_LAYER_TERRAIN,
  isWorldTileWalkable,
  worldTileValueForName,
} from "./world-domain.ts";

// No world carries these ids, so nothing reserves tiles on the maps below.
const WORLD_A = "918273";
const WORLD_B = "918274";

/** A spec with no passes: floor everywhere, boundary around the edge. */
const FLAT: {
  floorTile: string;
  boundaryTile: string;
  wallTile: string;
  passes: [];
} = {
  floorTile: "ground",
  boundaryTile: "ocean",
  wallTile: "ground",
  passes: [],
};

function countTiles(map: number[][], tileName: string): number {
  const value = worldTileValueForName(tileName);
  let count = 0;
  for (let row = 0; row < map.length; row++) {
    for (let col = 0; col < map[row].length; col++) {
      if (map[row][col] === value) count++;
    }
  }
  return count;
}

describe("generating a world map", () => {
  test("the same world id replays the same map", () => {
    const first = generateWorldMap(WORLD_A, "forest", 30, 30);
    const second = generateWorldMap(WORLD_A, "forest", 30, 30);
    expect(second).toEqual(first);
  });

  test("a different world id produces a different map", () => {
    const a = generateWorldMap(WORLD_A, "forest", 30, 30);
    const b = generateWorldMap(WORLD_B, "forest", 30, 30);
    expect(b).not.toEqual(a);
  });

  test("the requested dimensions are honoured exactly", () => {
    const map = generateWorldMap(WORLD_A, "forest", 18, 25);
    expect(map).toHaveLength(18);
    expect(map[0]).toHaveLength(25);
    expect(map[17]).toHaveLength(25);
  });

  test("the border is painted with the type's boundary tile", () => {
    const map = generateWorldMap(WORLD_A, "island", 20, 20);
    const boundary = worldTileValueForName(
      DEFAULT_WORLD_GENERATION.island.boundaryTile,
    );
    for (let col = 0; col < 20; col++) {
      expect(map[0][col]).toBe(boundary);
      expect(map[19][col]).toBe(boundary);
    }
    for (let row = 0; row < 20; row++) {
      expect(map[row][0]).toBe(boundary);
      expect(map[row][19]).toBe(boundary);
    }
  });

  test("the spawn corner stays walkable, whatever the passes rolled", () => {
    // Arriving players are placed here when a world declares no spawn area;
    // a wall or a lake on this tile would strand them.
    const map = generateWorldMap(WORLD_A, "forest", 30, 30);
    expect(isWorldTileWalkable(map[1][1])).toBe(true);
  });

  test("a supplied spec wins over the world type's preset", () => {
    const map = generateWorldMap(WORLD_A, "cave", 12, 12, FLAT);
    // Cave floor would be cave_floor; the spec says ground, and no pass ran.
    expect(countTiles(map, "ground")).toBe(10 * 10);
    expect(countTiles(map, "ocean")).toBe(12 * 12 - 10 * 10);
  });

  test("each world type generates from its own preset", () => {
    const forest = generateWorldMap(WORLD_A, "forest", 20, 20);
    const cave = generateWorldMap(WORLD_A, "cave", 20, 20);
    // Same seed, same size: only the preset differs, and it must show.
    expect(cave).not.toEqual(forest);
    expect(countTiles(cave, "cave_floor") > 0).toBe(true);
    expect(countTiles(forest, "cave_floor")).toBe(0);
  });

  test("a world too small for a pass still generates", () => {
    // The passes guard on 22x22 and 26x26; below that they are skipped rather
    // than producing a map swallowed by one feature.
    const map = generateWorldMap(WORLD_A, "forest", 10, 10);
    expect(map).toHaveLength(10);
    expect(isWorldTileWalkable(map[1][1])).toBe(true);
  });

  test("generating twice does not accumulate into the same array", () => {
    const first = generateWorldMap(WORLD_A, "forest", 24, 24, FLAT);
    first[5][5] = worldTileValueForName("mountain");
    const second = generateWorldMap(WORLD_A, "forest", 24, 24, FLAT);
    // A fresh array every call, so a caller mutating the map it was handed
    // (as applyWorldModsToMap does) cannot poison the next generation.
    expect(second[5][5]).toBe(worldTileValueForName("ground"));
  });
});

describe("layering world mods onto a map", () => {
  function flatMap(): number[][] {
    return generateWorldMap(WORLD_A, "forest", 12, 12, FLAT);
  }

  test("a mod paints its tile", () => {
    const map = flatMap();
    applyWorldModsToMap(map, {
      [WORLD_MOD_LAYER_OBJECT]: {
        "3_4": { row: 3, col: 4, tile_type: "pine_tree" },
      },
    });
    expect(map[3][4]).toBe(worldTileValueForName("pine_tree"));
  });

  test("the object layer is painted after the terrain layer", () => {
    // A tree the player planted has to survive the terrain the same tile
    // carries, not the other way round.
    const map = flatMap();
    applyWorldModsToMap(map, {
      [WORLD_MOD_LAYER_OBJECT]: {
        "2_2": { row: 2, col: 2, tile_type: "pine_tree" },
      },
      [WORLD_MOD_LAYER_TERRAIN]: {
        "2_2": { row: 2, col: 2, tile_type: "sand" },
      },
    });
    expect(map[2][2]).toBe(worldTileValueForName("pine_tree"));
  });

  test("mods off the map are ignored rather than throwing", () => {
    const map = flatMap();
    applyWorldModsToMap(map, {
      [WORLD_MOD_LAYER_OBJECT]: {
        far: { row: 99, col: 3, tile_type: "pine_tree" },
        negative: { row: -1, col: 0, tile_type: "pine_tree" },
        nonsense: { row: "here", col: 1, tile_type: "pine_tree" },
        empty: null,
      },
    });
    expect(countTiles(map, "pine_tree")).toBe(0);
  });

  test("no mods leaves the map exactly as generated", () => {
    const map = flatMap();
    const before = JSON.stringify(map);
    applyWorldModsToMap(map, {});
    expect(JSON.stringify(map)).toBe(before);
  });

  test("the map is painted in place and handed back", () => {
    const map = flatMap();
    const returned = applyWorldModsToMap(map, {
      [WORLD_MOD_LAYER_OBJECT]: {
        "1_2": { row: 1, col: 2, tile_type: "house" },
      },
    });
    expect(returned).toBe(map);
    expect(map[1][2]).toBe(worldTileValueForName("house"));
  });
});
