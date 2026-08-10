import {
  COLS,
  isWorldTileWalkable,
  mulberry32,
  ROWS,
  WORLD_TILE_GROUND,
  worldTileValueForName,
  WORLD_MOD_LAYER_TERRAIN,
  WORLD_MOD_LAYER_OBJECT,
} from "./world-domain.ts";
import {
  BlobPass,
  CoastPass,
  EnclosurePass,
  getDefaultWorldGeneration,
  RiverPass,
  ScatterPass,
  WallSegmentPass,
  WorldGenerationSpec,
} from "./world-generation.ts";
import {
  applyWorldReservationsToMap,
  getReservationBounds,
  isTerrainPlacementTile,
  RESERVATION_BLOCK_TERRAIN_FEATURE,
} from "./world-reservations.ts";

function paintWorldBorder(map: number[][], tileName: string): void {
  const tileValue = worldTileValueForName(tileName);
  const rows = map.length;
  const cols = map[0] ? map[0].length : 0;
  for (let r = 0; r < rows; r++) {
    map[r][0] = tileValue;
    map[r][cols - 1] = tileValue;
  }
  for (let c = 0; c < cols; c++) {
    map[0][c] = tileValue;
    map[rows - 1][c] = tileValue;
  }
}

export function generateWorldMap(
  worldId: string | number,
  worldType: string,
  rows: number = ROWS,
  cols: number = COLS,
  generation?: WorldGenerationSpec | null,
): number[][] {
  const seed = parseInt(String(worldId), 10);
  const rand = mulberry32(seed);
  const spec = generation || getDefaultWorldGeneration(worldType);
  const floorTileName = spec.floorTile;
  const boundaryTileName = spec.boundaryTile;
  const wallTileName = spec.wallTile;
  // Feature counts below are tuned for the default 100×100 world; scale them
  // with the map area so smaller worlds get proportionally fewer features.
  const areaFactor = (rows * cols) / (ROWS * COLS);
  const map: number[][] = [];

  for (let r = 0; r < rows; r++) {
    map[r] = [];
    for (let c = 0; c < cols; c++) {
      map[r][c] = worldTileValueForName(floorTileName);
    }
  }

  paintWorldBorder(map, boundaryTileName);

  function paintTerrainCircle(
    centerRow: number,
    centerCol: number,
    radius: number,
    tileName: string,
  ): void {
    const radiusSquared = radius * radius;
    for (let row = centerRow - radius; row <= centerRow + radius; row++) {
      if (row <= 0 || row >= rows - 1) continue;
      for (let col = centerCol - radius; col <= centerCol + radius; col++) {
        if (col <= 0 || col >= cols - 1) continue;
        const dr = row - centerRow;
        const dc = col - centerCol;
        if (dr * dr + dc * dc > radiusSquared) continue;
        map[row][col] = worldTileValueForName(tileName);
      }
    }
  }

  function passFits(pass: { minRows?: number; minCols?: number }): boolean {
    if (pass.minRows !== undefined && rows < pass.minRows) return false;
    if (pass.minCols !== undefined && cols < pass.minCols) return false;
    return true;
  }

  function passCount(count: number, scaleWithArea?: boolean): number {
    return scaleWithArea ? Math.round(count * areaFactor) : count;
  }

  function runEnclosures(pass: EnclosurePass): void {
    const tile = pass.tile || wallTileName;
    const span = pass.maxSize + 6;
    const total = passCount(pass.count, pass.scaleWithArea);
    for (let i = 0; i < total; i++) {
      const rr = 3 + Math.floor(rand() * (rows - span));
      const cc = 3 + Math.floor(rand() * (cols - span));
      const rh =
        pass.minSize + Math.floor(rand() * (pass.maxSize - pass.minSize + 1));
      const rw =
        pass.minSize + Math.floor(rand() * (pass.maxSize - pass.minSize + 1));
      for (let dr = 0; dr <= rh; dr++) {
        for (let dc = 0; dc <= rw; dc++) {
          if (
            (dr === 0 || dr === rh || dc === 0 || dc === rw) &&
            isWorldTileWalkable(map[rr + dr][cc + dc])
          ) {
            map[rr + dr][cc + dc] = worldTileValueForName(tile);
          }
        }
      }
      const mh = Math.floor(rh / 2);
      const mw = Math.floor(rw / 2);
      map[rr][cc + mw] = worldTileValueForName(floorTileName);
      map[rr + rh][cc + mw] = worldTileValueForName(floorTileName);
      map[rr + mh][cc] = worldTileValueForName(floorTileName);
      map[rr + mh][cc + rw] = worldTileValueForName(floorTileName);
    }
  }

  function runWallSegments(pass: WallSegmentPass): void {
    const tile = pass.tile || wallTileName;
    const lengthRange = pass.maxLength - pass.minLength + 1;
    const span = pass.maxLength + 1;
    const total = passCount(pass.count, pass.scaleWithArea);
    for (let i = 0; i < total; i++) {
      if (rand() > 0.5) {
        const r0 = 2 + Math.floor(rand() * (rows - 4));
        const c0 = 2 + Math.floor(rand() * (cols - span));
        const len = pass.minLength + Math.floor(rand() * lengthRange);
        const gap = Math.floor(rand() * len);
        for (let k = 0; k < len; k++) {
          if (
            k !== gap &&
            c0 + k < cols - 1 &&
            isWorldTileWalkable(map[r0][c0 + k])
          ) {
            map[r0][c0 + k] = worldTileValueForName(tile);
          }
        }
      } else {
        const r0 = 2 + Math.floor(rand() * (rows - span));
        const c0 = 2 + Math.floor(rand() * (cols - 4));
        const len = pass.minLength + Math.floor(rand() * lengthRange);
        const gap = Math.floor(rand() * len);
        for (let k = 0; k < len; k++) {
          if (
            k !== gap &&
            r0 + k < rows - 1 &&
            isWorldTileWalkable(map[r0 + k][c0])
          ) {
            map[r0 + k][c0] = worldTileValueForName(tile);
          }
        }
      }
    }
  }

  function runCoast(pass: CoastPass): void {
    const coastWidth =
      pass.minWidth + Math.floor(rand() * (pass.maxWidth - pass.minWidth + 1));
    for (let coastRow = 1; coastRow < rows - 1; coastRow++) {
      const coastInset = Math.floor(rand() * pass.insetRange);
      for (
        let coastCol = cols - 1 - coastWidth - coastInset;
        coastCol < cols - 1;
        coastCol++
      ) {
        if (coastCol <= 0 || coastCol >= cols - 1) continue;
        map[coastRow][coastCol] = worldTileValueForName(pass.tile);
      }
    }
  }

  function runRiver(pass: RiverPass): void {
    // Tracks which columns the river occupies at each row so bridges below
    // can be painted exactly over the river instead of guessing its path.
    const riverColsByRow: Record<number, number[]> = {};

    // A river must run the full height of the map uninterrupted (a reservation
    // painted afterwards would otherwise cut a walkable gap through it), so
    // where the world reserves tiles against terrain features, confine the
    // river's wander to a band on one side of that area instead of letting it
    // drift across the whole map width.
    const featureBounds = getReservationBounds(
      worldId,
      RESERVATION_BLOCK_TERRAIN_FEATURE,
    );
    let riverBandMin = 8;
    let riverBandMax = cols - 9;
    if (featureBounds) {
      if (rand() < 0.5) {
        riverBandMin = 3;
        riverBandMax = Math.max(riverBandMin, featureBounds.minCol - 2);
      } else {
        riverBandMax = cols - 4;
        riverBandMin = Math.min(riverBandMax, featureBounds.maxCol + 2);
      }
    }
    let riverCol = featureBounds
      ? Math.floor((riverBandMin + riverBandMax) / 2)
      : Math.floor(cols * (0.35 + rand() * 0.3));
    for (let riverRow = 1; riverRow < rows - 1; riverRow++) {
      riverCol += rand() < 0.33 ? -1 : rand() < 0.66 ? 0 : 1;
      riverCol = Math.max(riverBandMin, Math.min(riverBandMax, riverCol));
      const riverRadius = rand() < 0.2 ? 1 : 0;
      const riverCols: number[] = [];
      for (
        let riverOffset = -riverRadius;
        riverOffset <= riverRadius;
        riverOffset++
      ) {
        map[riverRow][riverCol + riverOffset] = worldTileValueForName(
          pass.tile,
        );
        riverCols.push(riverCol + riverOffset);
      }
      riverColsByRow[riverRow] = riverCols;
    }

    const fractions = pass.bridgeAtRowFractions;
    if (pass.bridgeTile && Array.isArray(fractions)) {
      // Each crossing is two rows wide, kept clear of any clearing reservation
      // (applied after this function returns) so both banks stay reachable.
      for (let i = 0; i < fractions.length; i++) {
        const bridgeRow = Math.round(rows * Number(fractions[i]));
        for (const bridgeSpanRow of [bridgeRow, bridgeRow + 1]) {
          const riverCols = riverColsByRow[bridgeSpanRow];
          if (!riverCols) continue;
          for (const col of riverCols) {
            map[bridgeSpanRow][col] = worldTileValueForName(pass.bridgeTile);
          }
        }
      }
    }
  }

  function runBlobs(pass: BlobPass): void {
    const radiusRange = pass.maxRadius - pass.minRadius + 1;
    const total = passCount(pass.count, pass.scaleWithArea);
    for (let i = 0; i < total; i++) {
      paintTerrainCircle(
        pass.margin + Math.floor(rand() * (rows - pass.margin * 2)),
        pass.margin + Math.floor(rand() * (cols - pass.margin * 2)),
        pass.minRadius + Math.floor(rand() * radiusRange),
        pass.tile,
      );
    }
  }

  function runScatter(pass: ScatterPass): void {
    const total = passCount(pass.count, pass.scaleWithArea);
    for (let i = 0; i < total; i++) {
      const r = 1 + Math.floor(rand() * (rows - 2));
      const c = 1 + Math.floor(rand() * (cols - 2));
      const current = map[r][c];
      const eligible =
        pass.on === "floor"
          ? current === worldTileValueForName(floorTileName)
          : isWorldTileWalkable(current) ||
            current === worldTileValueForName(WORLD_TILE_GROUND);
      if (eligible) map[r][c] = worldTileValueForName(pass.tile);
    }
  }

  // Passes run in the order the spec lists them, and each draws from the same
  // seeded sequence — so the order is part of what a world looks like, not
  // just what it contains.
  const passes = Array.isArray(spec.passes) ? spec.passes : [];
  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    if (!passFits(pass)) continue;
    if (pass.kind === "enclosures") runEnclosures(pass);
    else if (pass.kind === "wall_segments") runWallSegments(pass);
    else if (pass.kind === "coast") runCoast(pass);
    else if (pass.kind === "river") runRiver(pass);
    else if (pass.kind === "blobs") runBlobs(pass);
    else if (pass.kind === "scatter") runScatter(pass);
  }

  // Authored terrain is part of generation, not a post-step: the page state's
  // `map` is this raw generated map (the client applies world mods itself), so
  // a landmark's footprint and its cleared area have to be painted here to be
  // visible at all. A world whose class declares no placements resolves to
  // nothing and this returns the map untouched.
  applyWorldReservationsToMap(map, worldId);

  // Keep the default spawn corner walkable — but not at the cost of carving a
  // hole through authored terrain, so this yields to a terrain placement that
  // claimed those tiles.
  const corners = [
    [1, 1],
    [1, 2],
    [2, 1],
  ];
  for (let i = 0; i < corners.length; i++) {
    const row = corners[i][0];
    const col = corners[i][1];
    if (isTerrainPlacementTile(worldId, row, col)) continue;
    map[row][col] = worldTileValueForName(floorTileName);
  }
  return map;
}

export function applyWorldModsToMap(
  map: number[][],
  worldMods: Record<string, Record<string, any>>,
): number[][] {
  const mapRows = map.length;
  const mapCols = map[0] ? map[0].length : 0;
  const layerOrder = [WORLD_MOD_LAYER_TERRAIN, WORLD_MOD_LAYER_OBJECT];
  for (let i = 0; i < layerOrder.length; i++) {
    const layer = layerOrder[i];
    const layerMods = worldMods[layer] || {};
    Object.keys(layerMods).forEach(function (tileKey) {
      const mod = layerMods[tileKey];
      if (!mod) return;
      const row = Number(mod.row);
      const col = Number(mod.col);
      if (!isFinite(row) || !isFinite(col)) return;
      if (row < 0 || row >= mapRows || col < 0 || col >= mapCols) return;
      map[row][col] = worldTileValueForName(mod.tile_type);
    });
  }
  return map;
}
