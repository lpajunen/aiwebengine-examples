import {
  getDefaultWorldTypeForWorldId,
  normalizeWorldType,
  toStoredWorldTimestamp,
} from "./world-domain.ts";
import { querySingleWorldRow, upsertWorldRow } from "./world-db.ts";

type WorldDbLogFn = (msg: string, obj?: unknown) => void;

export function getOrCreatePlayerWorld(
  userId: string,
  getPlayerWorld: (userId: string) => string,
  savePlayerWorld: (userId: string, worldId: string) => void,
  saveWorldType: (
    worldId: string,
    worldType: string | undefined | null,
  ) => string,
): string {
  let worldId = getPlayerWorld(userId);
  if (!worldId) {
    worldId = "10000";
    savePlayerWorld(userId, worldId);
    saveWorldType(worldId, getDefaultWorldTypeForWorldId(worldId));
  }
  return worldId;
}

export function getWorldType(
  worldId: string | number,
  worldTypeTable: string,
  log: WorldDbLogFn,
): string {
  const normalizedWorldId = String(worldId || "");
  const row = querySingleWorldRow(
    worldTypeTable,
    JSON.stringify({ world_id: normalizedWorldId }),
    log,
  );
  if (row && row.world_type) return normalizeWorldType(String(row.world_type));
  return getDefaultWorldTypeForWorldId(normalizedWorldId);
}

export function saveWorldType(
  worldId: string | number,
  worldType: string | undefined | null,
  worldTypeTable: string,
  log: WorldDbLogFn,
): string {
  const normalizedWorldId = String(worldId || "");
  const normalizedType = normalizeWorldType(worldType);
  upsertWorldRow(
    worldTypeTable,
    ["world_id"],
    {
      world_id: normalizedWorldId,
      world_type: normalizedType,
      updated_ts: toStoredWorldTimestamp(Date.now()),
    },
    log,
  );
  return normalizedType;
}

export function resolvePortalDestinationWorldType(
  item:
    | { destination_world_id?: string; destination_world_type?: string }
    | undefined,
  getWorldType: (worldId: string) => string,
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
  createWorldId: () => string,
  saveWorldType: (
    worldId: string,
    worldType: string | undefined | null,
  ) => string,
): { world_id: string; world_type: string } {
  const normalizedType = normalizeWorldType(worldType);
  const worldId = createWorldId();
  saveWorldType(worldId, normalizedType);
  return { world_id: worldId, world_type: normalizedType };
}
