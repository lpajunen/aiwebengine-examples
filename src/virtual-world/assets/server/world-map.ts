import {
  COLS,
  getWorldBoundaryTileName,
  getWorldFloorTileName,
  getWorldWallTileName,
  isWorldTileWalkable,
  mulberry32,
  ROWS,
  WORLD_TILE_BRIDGE,
  WORLD_TILE_GROUND,
  WORLD_TILE_LAKE,
  WORLD_TILE_MOUNTAIN,
  WORLD_TILE_OCEAN,
  WORLD_TILE_PINE_TREE,
  WORLD_TILE_RIVER,
  WORLD_TILE_ROCK,
  WORLD_TYPE_CAVE,
  WORLD_TYPE_FOREST,
  WORLD_TYPE_ISLAND,
  WORLD_TYPE_VILLAGE,
  worldTileValueForName,
  WORLD_MOD_LAYER_TERRAIN,
  WORLD_MOD_LAYER_OBJECT,
} from "./world-domain.ts";
import {
  applyWorldReservationsToMap,
  getReservationBounds,
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
): number[][] {
  const seed = parseInt(String(worldId), 10);
  const rand = mulberry32(seed);
  const floorTileName = getWorldFloorTileName(worldType);
  const boundaryTileName = getWorldBoundaryTileName(worldType);
  const wallTileName = getWorldWallTileName(worldType);
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

  // Enclosures need room for position offset 3 + max extent 12 + border.
  if (rows >= 22 && cols >= 22) {
    const enclosureCount = Math.round(30 * areaFactor);
    for (let i = 0; i < enclosureCount; i++) {
      const rr = 3 + Math.floor(rand() * (rows - 18));
      const cc = 3 + Math.floor(rand() * (cols - 18));
      const rh = 4 + Math.floor(rand() * 9);
      const rw = 4 + Math.floor(rand() * 9);
      for (let dr = 0; dr <= rh; dr++) {
        for (let dc = 0; dc <= rw; dc++) {
          if (
            (dr === 0 || dr === rh || dc === 0 || dc === rw) &&
            isWorldTileWalkable(map[rr + dr][cc + dc])
          ) {
            map[rr + dr][cc + dc] = worldTileValueForName(wallTileName);
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

  if (rows >= 22 && cols >= 22) {
    const wallSegmentCount = Math.round(40 * areaFactor);
    for (let i = 0; i < wallSegmentCount; i++) {
      if (rand() > 0.5) {
        const r0 = 2 + Math.floor(rand() * (rows - 4));
        const c0 = 2 + Math.floor(rand() * (cols - 20));
        const len = 6 + Math.floor(rand() * 14);
        const gap = Math.floor(rand() * len);
        for (let k = 0; k < len; k++) {
          if (
            k !== gap &&
            c0 + k < cols - 1 &&
            isWorldTileWalkable(map[r0][c0 + k])
          ) {
            map[r0][c0 + k] = worldTileValueForName(wallTileName);
          }
        }
      } else {
        const r0 = 2 + Math.floor(rand() * (rows - 20));
        const c0 = 2 + Math.floor(rand() * (cols - 4));
        const len = 6 + Math.floor(rand() * 14);
        const gap = Math.floor(rand() * len);
        for (let k = 0; k < len; k++) {
          if (
            k !== gap &&
            r0 + k < rows - 1 &&
            isWorldTileWalkable(map[r0 + k][c0])
          ) {
            map[r0 + k][c0] = worldTileValueForName(wallTileName);
          }
        }
      }
    }
  }

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

  // Coast, river, and lakes assume enough interior to leave land; skip them
  // on small maps rather than flooding the whole world. Villages keep the
  // river (crossed by bridges below) but skip the ocean coastline and lakes,
  // which don't fit a walled settlement.
  if (worldType === WORLD_TYPE_FOREST && rows >= 26 && cols >= 26) {
    const coastWidth = 7 + Math.floor(rand() * 6);
    for (let coastRow = 1; coastRow < rows - 1; coastRow++) {
      const coastInset = Math.floor(rand() * 4);
      for (
        let coastCol = cols - 1 - coastWidth - coastInset;
        coastCol < cols - 1;
        coastCol++
      ) {
        if (coastCol <= 0 || coastCol >= cols - 1) continue;
        map[coastRow][coastCol] = worldTileValueForName(WORLD_TILE_OCEAN);
      }
    }
  }

  if (
    (worldType === WORLD_TYPE_FOREST || worldType === WORLD_TYPE_VILLAGE) &&
    rows >= 26 &&
    cols >= 26
  ) {
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
        map[riverRow][riverCol + riverOffset] =
          worldTileValueForName(WORLD_TILE_RIVER);
        riverCols.push(riverCol + riverOffset);
      }
      riverColsByRow[riverRow] = riverCols;
    }

    if (worldType === WORLD_TYPE_VILLAGE) {
      // Two crossings north/south of center, each two rows wide, kept clear
      // of the oak clearing reservation (applied after this function returns
      // for the oak world) so both riverbanks stay reachable on foot.
      const bridgeRows = [Math.round(rows * 0.25), Math.round(rows * 0.75)];
      for (const bridgeRow of bridgeRows) {
        for (const bridgeSpanRow of [bridgeRow, bridgeRow + 1]) {
          const riverCols = riverColsByRow[bridgeSpanRow];
          if (!riverCols) continue;
          for (const col of riverCols) {
            map[bridgeSpanRow][col] = worldTileValueForName(WORLD_TILE_BRIDGE);
          }
        }
      }
    }

    if (worldType === WORLD_TYPE_FOREST) {
      for (let lakeIndex = 0; lakeIndex < 3; lakeIndex++) {
        paintTerrainCircle(
          12 + Math.floor(rand() * (rows - 24)),
          12 + Math.floor(rand() * (cols - 24)),
          2 + Math.floor(rand() * 3),
          WORLD_TILE_LAKE,
        );
      }
    }
  }

  if (worldType === WORLD_TYPE_FOREST || worldType === WORLD_TYPE_CAVE) {
    if (rows >= 22 && cols >= 22) {
      for (let mountainIndex = 0; mountainIndex < 5; mountainIndex++) {
        paintTerrainCircle(
          10 + Math.floor(rand() * (rows - 20)),
          10 + Math.floor(rand() * (cols - 20)),
          2 + Math.floor(rand() * 3),
          WORLD_TILE_MOUNTAIN,
        );
      }
    }
    const rockCount = Math.round(140 * areaFactor);
    for (let rockIndex = 0; rockIndex < rockCount; rockIndex++) {
      const rockRow = 1 + Math.floor(rand() * (rows - 2));
      const rockCol = 1 + Math.floor(rand() * (cols - 2));
      if (
        isWorldTileWalkable(map[rockRow][rockCol]) ||
        map[rockRow][rockCol] === worldTileValueForName(WORLD_TILE_GROUND)
      ) {
        map[rockRow][rockCol] = worldTileValueForName(WORLD_TILE_ROCK);
      }
    }
  }

  const treeScatterCount = Math.round(
    (worldType === WORLD_TYPE_FOREST
      ? 500
      : worldType === WORLD_TYPE_ISLAND
        ? 140
        : 0) * areaFactor,
  );
  if (treeScatterCount > 0) {
    for (let i = 0; i < treeScatterCount; i++) {
      const r = 1 + Math.floor(rand() * (rows - 2));
      const c = 1 + Math.floor(rand() * (cols - 2));
      if (map[r][c] === worldTileValueForName(floorTileName)) {
        map[r][c] = worldTileValueForName(WORLD_TILE_PINE_TREE);
      }
    }
  }

  if (String(worldId) === "10000") {
    return applyWorldReservationsToMap(map, worldId);
  }

  map[1][1] = worldTileValueForName(floorTileName);
  map[1][2] = worldTileValueForName(floorTileName);
  map[2][1] = worldTileValueForName(floorTileName);
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
