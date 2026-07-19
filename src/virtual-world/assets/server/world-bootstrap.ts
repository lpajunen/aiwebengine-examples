import { VWORLD_WORLD_TYPE_TABLE } from "./runtime-config.ts";
import { generateWorldMap, applyWorldModsToMap } from "./world-map.ts";
import { loadWorldMods } from "./world-mod-storage.ts";
import { getPlayerWorld, savePlayerWorld } from "./player-persistence.ts";
import {
  applyOakReservation,
  createWorldId,
  COLS,
  createLivingSlotsFromDefinitions,
  getDefaultWorldTypeForWorldId,
  normalizeWorldDimension,
  normalizeWorldType,
  ROWS,
  toStoredWorldTimestamp,
} from "./world-domain.ts";
import {
  getDefaultNPCLivingClassId,
  getLivingClass,
  pickRandomNPCLivingClassId,
} from "./living-registry.ts";
import { querySingleWorldRow, upsertWorldRow } from "./world-db.ts";

export function getOrCreatePlayerWorld(userId: string): string {
  let worldId = getPlayerWorld(userId);
  if (!worldId) {
    worldId = "10000";
    savePlayerWorld(userId, worldId);
    saveWorldType(worldId, getDefaultWorldTypeForWorldId(worldId));
  }
  return worldId;
}

export function getWorldType(worldId: string | number): string {
  const normalizedWorldId = String(worldId || "");
  const row = querySingleWorldRow(
    VWORLD_WORLD_TYPE_TABLE,
    JSON.stringify({ world_id: normalizedWorldId }),
  );
  if (row && row.world_type) return normalizeWorldType(String(row.world_type));
  return getDefaultWorldTypeForWorldId(normalizedWorldId);
}

export function saveWorldType(
  worldId: string | number,
  worldType: string | undefined | null,
  dimensions?: WorldDimensions,
): string {
  const normalizedWorldId = String(worldId || "");
  const normalizedType = normalizeWorldType(worldType);
  const row: Record<string, unknown> = {
    world_id: normalizedWorldId,
    world_type: normalizedType,
    updated_ts: toStoredWorldTimestamp(Date.now()),
  };
  if (dimensions) {
    row.rows = normalizeWorldDimension(dimensions.rows, ROWS);
    row.cols = normalizeWorldDimension(dimensions.cols, COLS);
  }
  upsertWorldRow(VWORLD_WORLD_TYPE_TABLE, ["world_id"], row);
  return normalizedType;
}

export type WorldDimensions = { rows: number; cols: number };

// Reads the world's type and dimensions in one query — use this on hot paths
// (map generation) instead of separate getWorldType + getWorldDimensions
// calls against the same row.
export function getWorldInfo(worldId: string | number): {
  world_type: string;
  rows: number;
  cols: number;
} {
  const normalizedWorldId = String(worldId || "");
  const row = querySingleWorldRow(
    VWORLD_WORLD_TYPE_TABLE,
    JSON.stringify({ world_id: normalizedWorldId }),
  );
  return {
    world_type:
      row && row.world_type
        ? normalizeWorldType(String(row.world_type))
        : getDefaultWorldTypeForWorldId(normalizedWorldId),
    rows: normalizeWorldDimension(row && row.rows, ROWS),
    cols: normalizeWorldDimension(row && row.cols, COLS),
  };
}

export function getWorldDimensions(worldId: string | number): WorldDimensions {
  const info = getWorldInfo(worldId);
  return { rows: info.rows, cols: info.cols };
}

export function resolvePortalDestinationWorldType(
  item:
    | { destination_world_id?: string; destination_world_type?: string }
    | undefined,
): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  if (typeof item.destination_world_type === "string") {
    return normalizeWorldType(item.destination_world_type);
  }
  if (typeof item.destination_world_id === "string") {
    return getWorldType(item.destination_world_id);
  }
  return undefined;
}

export function createWorldOfType(
  worldType: string | undefined | null,
  dimensions?: Partial<WorldDimensions>,
): { world_id: string; world_type: string; rows: number; cols: number } {
  const normalizedType = normalizeWorldType(worldType);
  const normalizedDims: WorldDimensions = {
    rows: normalizeWorldDimension(dimensions && dimensions.rows, ROWS),
    cols: normalizeWorldDimension(dimensions && dimensions.cols, COLS),
  };
  const worldId = createWorldId();
  saveWorldType(worldId, normalizedType, normalizedDims);
  return {
    world_id: worldId,
    world_type: normalizedType,
    rows: normalizedDims.rows,
    cols: normalizedDims.cols,
  };
}

export function generateMap(worldId: string | number): number[][] {
  const info = getWorldInfo(worldId);
  return generateWorldMap(worldId, info.world_type, info.rows, info.cols);
}

export function getEffectiveMap(worldId: string): number[][] {
  const map = generateMap(worldId);
  applyWorldModsToMap(map, loadWorldMods(worldId));
  applyOakReservation(map, worldId);
  return map;
}
