// How a world's terrain is generated, as data.
//
// generateWorldMap used to be a run of `worldType === ...` branches: a coast
// only forests got, a river forests and villages got, lakes nested inside the
// river's branch, mountains and rocks for forests and caves, trees at one
// count for forests and another for islands. Five world types were the only
// kinds of place that could exist, and a creator picking a base preset got
// whatever that branch did.
//
// The ten steps turn out to be five kinds of pass, and the differences between
// the presets are their parameters. A world class carries a spec; the built-in
// presets below are seed data reproducing exactly what each branch did,
// including the order passes run in — which matters, because the generator is
// seeded from the world id and every pass draws from the same sequence. Change
// a spec and every world of that class regenerates differently; terrain is not
// stored, only world mods layered on top of it.

// Where a pass is skipped on maps too small to hold it. The originals guarded
// on 22x22 (enclosures, wall segments, mountains) and 26x26 (coast, river,
// lakes) so a small world was not swallowed by one feature.
interface PassBounds {
  minRows?: number;
  minCols?: number;
}

// Rectangular rings of wall with a gap punched in each side.
export interface EnclosurePass extends PassBounds {
  kind: "enclosures";
  count: number;
  minSize: number;
  maxSize: number;
  // Counts are tuned for a 100x100 world and scaled by map area; a blob count
  // is a literal number of features and is not.
  scaleWithArea?: boolean;
  tile?: string;
}

// Straight runs of wall, horizontal or vertical, each with one gap.
export interface WallSegmentPass extends PassBounds {
  kind: "wall_segments";
  count: number;
  minLength: number;
  maxLength: number;
  scaleWithArea?: boolean;
  tile?: string;
}

// A ragged band along the eastern edge.
export interface CoastPass extends PassBounds {
  kind: "coast";
  tile: string;
  minWidth: number;
  maxWidth: number;
  // How far the edge of the band wanders in and out, row by row.
  insetRange: number;
}

// A wandering channel running the full height of the map. Optional crossings
// are painted over it at the given fractions of the map height, two rows each,
// so both banks stay reachable on foot.
export interface RiverPass extends PassBounds {
  kind: "river";
  tile: string;
  bridgeTile?: string;
  bridgeAtRowFractions?: number[];
}

// Round patches — lakes, mountains, anything with a radius.
export interface BlobPass extends PassBounds {
  kind: "blobs";
  tile: string;
  count: number;
  minRadius: number;
  maxRadius: number;
  // Keep-out distance from the map edge, so a blob is not half border.
  margin: number;
  scaleWithArea?: boolean;
}

// Individual tiles dropped at random. `on` decides what may be overwritten:
// "floor" only the spec's own floor tile (how trees fill a forest), "walkable"
// anything walkable or plain ground (how rocks settle anywhere passable).
export interface ScatterPass extends PassBounds {
  kind: "scatter";
  tile: string;
  count: number;
  on: "floor" | "walkable";
  scaleWithArea?: boolean;
}

export type WorldGenerationPass =
  | EnclosurePass
  | WallSegmentPass
  | CoastPass
  | RiverPass
  | BlobPass
  | ScatterPass;

export interface WorldGenerationSpec {
  // Every tile starts as this, the border is painted with that, and passes
  // that build structures use the wall.
  floorTile: string;
  boundaryTile: string;
  wallTile: string;
  passes: WorldGenerationPass[];
}

// The rings-and-corridors both indoor and outdoor presets start from. They
// were unconditional in the original, applied to every world type alike.
function structurePasses(): WorldGenerationPass[] {
  return [
    {
      kind: "enclosures",
      count: 30,
      minSize: 4,
      maxSize: 12,
      scaleWithArea: true,
      minRows: 22,
      minCols: 22,
    },
    {
      kind: "wall_segments",
      count: 40,
      minLength: 6,
      maxLength: 19,
      scaleWithArea: true,
      minRows: 22,
      minCols: 22,
    },
  ];
}

// Seed specs for the five base types, reproducing the branches they replaced
// pass for pass and in the order the original ran them.
export const DEFAULT_WORLD_GENERATION: Record<string, WorldGenerationSpec> = {
  forest: {
    floorTile: "ground",
    boundaryTile: "spruce_thicket",
    wallTile: "spruce_thicket",
    passes: structurePasses().concat([
      {
        kind: "coast",
        tile: "ocean",
        minWidth: 7,
        maxWidth: 12,
        insetRange: 4,
        minRows: 26,
        minCols: 26,
      },
      { kind: "river", tile: "river", minRows: 26, minCols: 26 },
      {
        kind: "blobs",
        tile: "lake",
        count: 3,
        minRadius: 2,
        maxRadius: 4,
        margin: 12,
        minRows: 26,
        minCols: 26,
      },
      {
        kind: "blobs",
        tile: "mountain",
        count: 5,
        minRadius: 2,
        maxRadius: 4,
        margin: 10,
        minRows: 22,
        minCols: 22,
      },
      {
        kind: "scatter",
        tile: "rock",
        count: 140,
        on: "walkable",
        scaleWithArea: true,
      },
      {
        kind: "scatter",
        tile: "pine_tree",
        count: 500,
        on: "floor",
        scaleWithArea: true,
      },
    ]),
  },
  island: {
    floorTile: "sand",
    boundaryTile: "ocean",
    wallTile: "rock",
    passes: structurePasses().concat([
      {
        kind: "scatter",
        tile: "pine_tree",
        count: 140,
        on: "floor",
        scaleWithArea: true,
      },
    ]),
  },
  cave: {
    floorTile: "cave_floor",
    boundaryTile: "mountain",
    wallTile: "mountain",
    passes: structurePasses().concat([
      {
        kind: "blobs",
        tile: "mountain",
        count: 5,
        minRadius: 2,
        maxRadius: 4,
        margin: 10,
        minRows: 22,
        minCols: 22,
      },
      {
        kind: "scatter",
        tile: "rock",
        count: 140,
        on: "walkable",
        scaleWithArea: true,
      },
    ]),
  },
  village: {
    floorTile: "ground",
    boundaryTile: "stick_fence",
    wallTile: "stick_fence",
    passes: structurePasses().concat([
      {
        kind: "river",
        tile: "river",
        bridgeTile: "bridge",
        bridgeAtRowFractions: [0.25, 0.75],
        minRows: 26,
        minCols: 26,
      },
    ]),
  },
  building: {
    floorTile: "wood_floor",
    boundaryTile: "house",
    wallTile: "house",
    passes: structurePasses(),
  },
};

export function getDefaultWorldGeneration(
  baseType: string,
): WorldGenerationSpec {
  return (
    DEFAULT_WORLD_GENERATION[String(baseType || "")] ||
    DEFAULT_WORLD_GENERATION.forest
  );
}

// Lenient: runs on the DB read path, where a malformed stored spec must still
// yield a loadable world class rather than taking the repository down. An
// unusable spec reads back as null and the caller falls back to the base
// type's default.
export function normalizeWorldGeneration(
  raw: unknown,
): WorldGenerationSpec | null {
  if (!raw) return null;
  let source: unknown = raw;
  if (typeof raw === "string") {
    try {
      source = JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  if (!source || typeof source !== "object") return null;
  const obj = source as Record<string, unknown>;
  const floorTile = String(obj.floorTile || "").trim();
  if (!floorTile) return null;
  const rawPasses = Array.isArray(obj.passes) ? obj.passes : [];
  const passes: WorldGenerationPass[] = [];
  for (let i = 0; i < rawPasses.length; i++) {
    const pass = rawPasses[i];
    if (!pass || typeof pass !== "object") continue;
    const kind = String((pass as Record<string, unknown>).kind || "");
    if (
      kind === "enclosures" ||
      kind === "wall_segments" ||
      kind === "coast" ||
      kind === "river" ||
      kind === "blobs" ||
      kind === "scatter"
    ) {
      passes.push(pass as WorldGenerationPass);
    }
  }
  return {
    floorTile: floorTile,
    boundaryTile: String(obj.boundaryTile || floorTile),
    wallTile: String(obj.wallTile || floorTile),
    passes: passes,
  };
}
