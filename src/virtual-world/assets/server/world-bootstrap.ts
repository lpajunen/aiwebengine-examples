import {
  VWORLD_WORLD_ITEM_META_TABLE,
  VWORLD_WORLD_ITEM_TABLE,
  VWORLD_WORLD_TYPE_TABLE,
} from "./runtime-config.ts";
import { generateWorldMap, applyWorldModsToMap } from "./world-map.ts";
import { loadWorldMods } from "./world-mod-storage.ts";
import { getPlayerWorld, savePlayerWorld } from "./player-persistence.ts";
import {
  BIRDHAVEN_WORLD_CLASS_ID,
  createWorldId,
  COLS,
  getDefaultWorldTypeForWorldId,
  isOakWorld,
  normalizeWorldDimension,
  normalizeWorldType,
  OAK_WORLD_COLS,
  OAK_WORLD_ROWS,
  ROWS,
  toStoredWorldTimestamp,
} from "./world-domain.ts";
import {
  getWorldClassWithRefresh,
  WorldClassRecord,
} from "./world-class-storage.ts";
import { applyWorldReservationsToMap } from "./world-reservations.ts";
import {
  deleteWorldRowsWhere,
  querySingleWorldRow,
  upsertWorldRow,
} from "./world-db.ts";

export function getOrCreatePlayerWorld(userId: string): string {
  let worldId = getPlayerWorld(userId);
  if (!worldId) {
    worldId = "10000";
    savePlayerWorld(userId, worldId);
  }
  ensureOakWorldConfig(worldId);
  return worldId;
}

// The oak/start world is a fixed-size village clearing, not a generic
// generated world. Self-heals its stored type/dimensions on every load
// (cheap no-op once migrated) so rows persisted before the village/30x30
// switch upgrade the next time anyone loads into it, without needing a
// one-off migration script.
function ensureOakWorldConfig(worldId: string): void {
  if (!isOakWorld(worldId)) return;
  const defaultType = getDefaultWorldTypeForWorldId(worldId);
  const info = getWorldInfo(worldId);
  const shapeMatches =
    info.world_type === defaultType &&
    info.rows === OAK_WORLD_ROWS &&
    info.cols === OAK_WORLD_COLS;
  // The start world is classed as its own "birdhaven" world class (so it shows
  // in the world-type editor with a name) rather than the bare "village" preset.
  const classMatches = info.world_class_id === BIRDHAVEN_WORLD_CLASS_ID;
  if (shapeMatches && classMatches) {
    return;
  }
  saveWorldType(
    worldId,
    defaultType,
    { rows: OAK_WORLD_ROWS, cols: OAK_WORLD_COLS },
    BIRDHAVEN_WORLD_CLASS_ID,
  );
  // Only the item map depends on the world's shape/type. If just the world
  // class id changed (migrating an existing start world village -> birdhaven),
  // leave the seeded items (oak, guild door, ...) in place — no reseed needed.
  if (shapeMatches) return;
  // The stored map just changed shape/type. Any items seeded against the old
  // map are now at coordinates that may fall outside the new bounds, and the
  // world's "seeded" marker would otherwise stop ensureWorldItems from ever
  // re-placing them. Drop both so the world re-seeds items on the new map.
  deleteWorldRowsWhere(
    VWORLD_WORLD_ITEM_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
  );
  deleteWorldRowsWhere(
    VWORLD_WORLD_ITEM_META_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
  );
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
  worldClassId?: string | null,
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
  if (worldClassId) {
    row.world_class_id = String(worldClassId);
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
  world_class_id: string;
} {
  const normalizedWorldId = String(worldId || "");
  const row = querySingleWorldRow(
    VWORLD_WORLD_TYPE_TABLE,
    JSON.stringify({ world_id: normalizedWorldId }),
  );
  const worldType =
    row && row.world_type
      ? normalizeWorldType(String(row.world_type))
      : getDefaultWorldTypeForWorldId(normalizedWorldId);
  return {
    world_type: worldType,
    rows: normalizeWorldDimension(row && row.rows, ROWS),
    cols: normalizeWorldDimension(row && row.cols, COLS),
    world_class_id:
      row && typeof row.world_class_id === "string" && row.world_class_id
        ? row.world_class_id
        : worldType,
  };
}

// Resolves the WorldClassRecord a world instance was created from (falling
// back to the built-in class for its base world_type when unset — covers
// worlds created before world classes tracked an explicit id, plus the oak
// home world).
export function getWorldClassForWorld(
  worldId: string | number,
): WorldClassRecord | null {
  const info = getWorldInfo(worldId);
  return (
    getWorldClassWithRefresh(info.world_class_id) ||
    getWorldClassWithRefresh(info.world_type)
  );
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
  worldClassId?: string | null,
): { world_id: string; world_type: string; rows: number; cols: number } {
  const normalizedType = normalizeWorldType(worldType);
  const normalizedDims: WorldDimensions = {
    rows: normalizeWorldDimension(dimensions && dimensions.rows, ROWS),
    cols: normalizeWorldDimension(dimensions && dimensions.cols, COLS),
  };
  const worldId = createWorldId();
  saveWorldType(
    worldId,
    normalizedType,
    normalizedDims,
    worldClassId || normalizedType,
  );
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
  applyWorldReservationsToMap(map, worldId);
  return map;
}
