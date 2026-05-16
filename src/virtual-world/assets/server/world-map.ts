import {
  applyOakReservation,
  COLS,
  getWorldBoundaryTileName,
  getWorldFloorTileName,
  getWorldWallTileName,
  isWorldTileWalkable,
  mulberry32,
  ROWS,
  WORLD_TILE_GROUND,
  WORLD_TILE_HOUSE,
  WORLD_TILE_LAKE,
  WORLD_TILE_MOUNTAIN,
  WORLD_TILE_OCEAN,
  WORLD_TILE_PINE_TREE,
  WORLD_TILE_RIVER,
  WORLD_TILE_ROCK,
  WORLD_TYPE_BUILDING,
  WORLD_TYPE_CAVE,
  WORLD_TYPE_FOREST,
  WORLD_TYPE_ISLAND,
  worldTileValueForName,
} from "./world-domain.ts";

function paintWorldBorder(map: number[][], tileName: string): void {
  const tileValue = worldTileValueForName(tileName);
  for (let r = 0; r < ROWS; r++) {
    map[r][0] = tileValue;
    map[r][COLS - 1] = tileValue;
  }
  for (let c = 0; c < COLS; c++) {
    map[0][c] = tileValue;
    map[ROWS - 1][c] = tileValue;
  }
}

function paintWorldRing(map: number[][], tileName: string, inset: number): void {
  const tileValue = worldTileValueForName(tileName);
  const minRow = Math.max(0, Number(inset) || 0);
  const minCol = minRow;
  const maxRow = ROWS - 1 - minRow;
  const maxCol = COLS - 1 - minCol;
  for (let row = minRow; row <= maxRow; row++) {
    map[row][minCol] = tileValue;
    map[row][maxCol] = tileValue;
  }
  for (let col = minCol; col <= maxCol; col++) {
    map[minRow][col] = tileValue;
    map[maxRow][col] = tileValue;
  }
}

export function generateWorldMap(
  worldId: string | number,
  worldType: string,
): number[][] {
  const seed = parseInt(String(worldId), 10);
  const rand = mulberry32(seed);
  const floorTileName = getWorldFloorTileName(worldType);
  const boundaryTileName = getWorldBoundaryTileName(worldType);
  const wallTileName = getWorldWallTileName(worldType);
  const map: number[][] = [];

  for (let r = 0; r < ROWS; r++) {
    map[r] = [];
    for (let c = 0; c < COLS; c++) {
      map[r][c] = worldTileValueForName(floorTileName);
    }
  }

  paintWorldBorder(map, boundaryTileName);
  if (worldType === WORLD_TYPE_ISLAND) paintWorldRing(map, WORLD_TILE_OCEAN, 1);
  if (worldType === WORLD_TYPE_CAVE) paintWorldRing(map, WORLD_TILE_ROCK, 1);
  if (worldType === WORLD_TYPE_BUILDING) {
    paintWorldRing(map, WORLD_TILE_HOUSE, 1);
  }

  for (let i = 0; i < 30; i++) {
    const rr = 3 + Math.floor(rand() * (ROWS - 18));
    const cc = 3 + Math.floor(rand() * (COLS - 18));
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

  for (let i = 0; i < 40; i++) {
    if (rand() > 0.5) {
      const r0 = 2 + Math.floor(rand() * (ROWS - 4));
      const c0 = 2 + Math.floor(rand() * (COLS - 20));
      const len = 6 + Math.floor(rand() * 14);
      const gap = Math.floor(rand() * len);
      for (let k = 0; k < len; k++) {
        if (
          k !== gap &&
          c0 + k < COLS - 1 &&
          isWorldTileWalkable(map[r0][c0 + k])
        ) {
          map[r0][c0 + k] = worldTileValueForName(wallTileName);
        }
      }
    } else {
      const r0 = 2 + Math.floor(rand() * (ROWS - 20));
      const c0 = 2 + Math.floor(rand() * (COLS - 4));
      const len = 6 + Math.floor(rand() * 14);
      const gap = Math.floor(rand() * len);
      for (let k = 0; k < len; k++) {
        if (
          k !== gap &&
          r0 + k < ROWS - 1 &&
          isWorldTileWalkable(map[r0 + k][c0])
        ) {
          map[r0 + k][c0] = worldTileValueForName(wallTileName);
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
      if (row <= 0 || row >= ROWS - 1) continue;
      for (let col = centerCol - radius; col <= centerCol + radius; col++) {
        if (col <= 0 || col >= COLS - 1) continue;
        const dr = row - centerRow;
        const dc = col - centerCol;
        if (dr * dr + dc * dc > radiusSquared) continue;
        map[row][col] = worldTileValueForName(tileName);
      }
    }
  }

  if (worldType === WORLD_TYPE_FOREST) {
    const coastWidth = 7 + Math.floor(rand() * 6);
    for (let coastRow = 1; coastRow < ROWS - 1; coastRow++) {
      const coastInset = Math.floor(rand() * 4);
      for (
        let coastCol = COLS - 1 - coastWidth - coastInset;
        coastCol < COLS - 1;
        coastCol++
      ) {
        if (coastCol <= 0 || coastCol >= COLS - 1) continue;
        map[coastRow][coastCol] = worldTileValueForName(WORLD_TILE_OCEAN);
      }
    }

    let riverCol = Math.floor(COLS * (0.35 + rand() * 0.3));
    for (let riverRow = 1; riverRow < ROWS - 1; riverRow++) {
      riverCol += rand() < 0.33 ? -1 : rand() < 0.66 ? 0 : 1;
      riverCol = Math.max(8, Math.min(COLS - 9, riverCol));
      const riverRadius = rand() < 0.2 ? 1 : 0;
      for (
        let riverOffset = -riverRadius;
        riverOffset <= riverRadius;
        riverOffset++
      ) {
        map[riverRow][riverCol + riverOffset] =
          worldTileValueForName(WORLD_TILE_RIVER);
      }
    }

    for (let lakeIndex = 0; lakeIndex < 3; lakeIndex++) {
      paintTerrainCircle(
        12 + Math.floor(rand() * (ROWS - 24)),
        12 + Math.floor(rand() * (COLS - 24)),
        2 + Math.floor(rand() * 3),
        WORLD_TILE_LAKE,
      );
    }
  }

  if (worldType === WORLD_TYPE_FOREST || worldType === WORLD_TYPE_CAVE) {
    for (let mountainIndex = 0; mountainIndex < 5; mountainIndex++) {
      paintTerrainCircle(
        10 + Math.floor(rand() * (ROWS - 20)),
        10 + Math.floor(rand() * (COLS - 20)),
        2 + Math.floor(rand() * 3),
        WORLD_TILE_MOUNTAIN,
      );
    }
    for (let rockIndex = 0; rockIndex < 140; rockIndex++) {
      const rockRow = 1 + Math.floor(rand() * (ROWS - 2));
      const rockCol = 1 + Math.floor(rand() * (COLS - 2));
      if (
        isWorldTileWalkable(map[rockRow][rockCol]) ||
        map[rockRow][rockCol] === worldTileValueForName(WORLD_TILE_GROUND)
      ) {
        map[rockRow][rockCol] = worldTileValueForName(WORLD_TILE_ROCK);
      }
    }
  }

  const treeScatterCount =
    worldType === WORLD_TYPE_FOREST
      ? 500
      : worldType === WORLD_TYPE_ISLAND
        ? 140
        : 0;
  if (treeScatterCount > 0) {
    for (let i = 0; i < treeScatterCount; i++) {
      const r = 1 + Math.floor(rand() * (ROWS - 2));
      const c = 1 + Math.floor(rand() * (COLS - 2));
      if (map[r][c] === worldTileValueForName(floorTileName)) {
        map[r][c] = worldTileValueForName(WORLD_TILE_PINE_TREE);
      }
    }
  }

  if (String(worldId) === "10000") {
    return applyOakReservation(map, worldId);
  }

  map[1][1] = worldTileValueForName(floorTileName);
  map[1][2] = worldTileValueForName(floorTileName);
  map[2][1] = worldTileValueForName(floorTileName);
  return map;
}