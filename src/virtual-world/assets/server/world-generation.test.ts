/**
 * Tests for the world-generation spec.
 *
 * A spec is stored on a world class and read back on every map generation, so
 * `normalizeWorldGeneration` sits on the hot read path and must never throw:
 * a malformed stored spec has to degrade to null (caller falls back to the
 * base preset) rather than take the class repository down. Pure — the presets
 * are module constants and nothing here touches a world row.
 */

import {
  DEFAULT_WORLD_GENERATION,
  getDefaultWorldGeneration,
  normalizeWorldGeneration,
} from "./world-generation.ts";
import { WORLD_TILE_DEFS, WORLD_TYPES } from "./world-domain.ts";

const PASS_KINDS = [
  "enclosures",
  "wall_segments",
  "coast",
  "river",
  "blobs",
  "scatter",
];

describe("built-in presets", () => {
  test("every world type has a preset", () => {
    for (let i = 0; i < WORLD_TYPES.length; i++) {
      expect(DEFAULT_WORLD_GENERATION[WORLD_TYPES[i]]).toBeTruthy();
    }
  });

  test("every preset names tiles that actually exist", () => {
    // A typo here produces a world generated out of tile value 0 everywhere,
    // which looks like an empty map rather than an error.
    const tileNames: string[] = [];
    Object.keys(DEFAULT_WORLD_GENERATION).forEach(function (type) {
      const spec = DEFAULT_WORLD_GENERATION[type];
      tileNames.push(spec.floorTile, spec.boundaryTile, spec.wallTile);
      spec.passes.forEach(function (pass) {
        const withTile = pass as { tile?: string; bridgeTile?: string };
        if (withTile.tile) tileNames.push(withTile.tile);
        if (withTile.bridgeTile) tileNames.push(withTile.bridgeTile);
      });
    });
    const unknown = tileNames.filter(function (name) {
      return !(WORLD_TILE_DEFS as Record<string, unknown>)[name];
    });
    expect(unknown).toEqual([]);
  });

  test("every preset pass carries a known kind", () => {
    const kinds: string[] = [];
    Object.keys(DEFAULT_WORLD_GENERATION).forEach(function (type) {
      DEFAULT_WORLD_GENERATION[type].passes.forEach(function (pass) {
        kinds.push(pass.kind);
      });
    });
    const unknown = kinds.filter(function (kind) {
      return PASS_KINDS.indexOf(kind) === -1;
    });
    expect(unknown).toEqual([]);
  });

  test("an unknown base type falls back to forest rather than undefined", () => {
    expect(getDefaultWorldGeneration("no_such_type")).toBe(
      DEFAULT_WORLD_GENERATION.forest,
    );
    expect(getDefaultWorldGeneration("")).toBe(DEFAULT_WORLD_GENERATION.forest);
  });

  test("a known base type gets its own preset", () => {
    expect(getDefaultWorldGeneration("cave")).toBe(
      DEFAULT_WORLD_GENERATION.cave,
    );
  });

  test("pass order is part of the preset, because the generator shares one seed", () => {
    // Every pass draws from the same seeded sequence, so reordering these
    // silently regenerates every existing world of the class.
    const forestKinds = DEFAULT_WORLD_GENERATION.forest.passes.map(
      function (pass) {
        return pass.kind;
      },
    );
    expect(forestKinds).toEqual([
      "enclosures",
      "wall_segments",
      "coast",
      "river",
      "blobs",
      "blobs",
      "scatter",
      "scatter",
    ]);
  });
});

describe("normalizing a stored spec", () => {
  test("nothing stored means no spec, not an empty one", () => {
    expect(normalizeWorldGeneration(null)).toBeNull();
    expect(normalizeWorldGeneration(undefined)).toBeNull();
    expect(normalizeWorldGeneration("")).toBeNull();
  });

  test("a JSON string is parsed, since that is how it comes out of the row", () => {
    const spec = normalizeWorldGeneration(
      JSON.stringify({ floorTile: "sand", passes: [] }),
    );
    expect(spec ? spec.floorTile : "").toBe("sand");
  });

  test("unparseable JSON degrades to null instead of throwing", () => {
    expect(normalizeWorldGeneration("{not json")).toBeNull();
  });

  test("a spec without a floor tile is unusable", () => {
    expect(normalizeWorldGeneration({ passes: [] })).toBeNull();
    expect(normalizeWorldGeneration({ floorTile: "   " })).toBeNull();
    expect(normalizeWorldGeneration(42)).toBeNull();
    expect(normalizeWorldGeneration([])).toBeNull();
  });

  test("boundary and wall default to the floor tile", () => {
    const spec = normalizeWorldGeneration({ floorTile: "ground" });
    expect(spec ? spec.boundaryTile : "").toBe("ground");
    expect(spec ? spec.wallTile : "").toBe("ground");
    expect(spec ? spec.passes : null).toEqual([]);
  });

  test("passes of an unknown kind are dropped, the rest survive", () => {
    const spec = normalizeWorldGeneration({
      floorTile: "ground",
      passes: [
        { kind: "scatter", tile: "rock", count: 10, on: "walkable" },
        { kind: "teleporters", count: 3 },
        null,
        "river",
        { kind: "river", tile: "river" },
      ],
    });
    const kinds = spec
      ? spec.passes.map(function (pass) {
          return pass.kind;
        })
      : [];
    expect(kinds).toEqual(["scatter", "river"]);
  });

  test("a non-array passes field reads as no passes", () => {
    const spec = normalizeWorldGeneration({
      floorTile: "ground",
      passes: "all of them",
    });
    expect(spec ? spec.passes : null).toEqual([]);
  });

  test("a round trip through JSON preserves a preset", () => {
    const spec = normalizeWorldGeneration(
      JSON.stringify(DEFAULT_WORLD_GENERATION.village),
    );
    expect(spec).toEqual(DEFAULT_WORLD_GENERATION.village);
  });
});
