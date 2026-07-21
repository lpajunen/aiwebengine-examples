import { getItemStateTemplate } from "./item-registry.ts";
import { WORLD_ITEM_SPAWN_COUNT } from "./runtime-config.ts";
import { getEffectiveMap } from "./world-bootstrap.ts";
import { ITEM_TYPES } from "./world-domain.ts";
import { resolvePortalDestinationWorldType } from "./world-bootstrap.ts";
import {
  VWORLD_PLAYER_INVENTORY_TABLE,
  VWORLD_WORLD_ITEM_META_TABLE,
  VWORLD_WORLD_ITEM_TABLE,
} from "./runtime-config.ts";
import {
  createEmptyLivingState,
  isOakWorld,
  isValidItem,
  OAK_CENTER_COL,
  OAK_CENTER_ROW,
  LivingState,
  normalizeLivingState,
  normalizeWorldType,
  toStoredWorldTimestamp,
  fromStoredWorldTimestamp,
} from "./world-domain.ts";
import {
  getDefaultPlayerLivingClassId,
  getLivingClass,
} from "./living-registry.ts";
import {
  deleteWorldRowsWhere,
  querySingleWorldRow,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

export function loadPlayerInventory(userId: string): LivingState {
  const normalizeRawToLiving = function (raw: unknown, classId: string) {
    const livingClass = getLivingClass(classId);
    if (!livingClass) {
      return createEmptyLivingState(classId);
    }
    return normalizeLivingState(raw, livingClass);
  };

  const row = querySingleWorldRow(
    VWORLD_PLAYER_INVENTORY_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
  if (row) {
    const classId =
      typeof row.living_class_id === "string" && row.living_class_id
        ? String(row.living_class_id)
        : getDefaultPlayerLivingClassId();
    try {
      return normalizeRawToLiving(
        {
          class_id: classId,
          slots: row.slots_json ? JSON.parse(row.slots_json) : {},
          bag: row.bag_json ? JSON.parse(row.bag_json) : [],
          values: row.values_json ? JSON.parse(row.values_json) : {},
        },
        classId,
      );
    } catch (e) {
      return normalizeRawToLiving({}, classId);
    }
  }
  return normalizeRawToLiving({}, getDefaultPlayerLivingClassId());
}

export function savePlayerInventory(userId: string, inventory: unknown): void {
  const incoming =
    inventory && typeof inventory === "object"
      ? (inventory as Record<string, unknown>)
      : {};
  const classId =
    typeof incoming.class_id === "string" && incoming.class_id
      ? incoming.class_id
      : getDefaultPlayerLivingClassId();
  const livingClass = getLivingClass(classId);
  const normalized = livingClass
    ? normalizeLivingState(incoming, livingClass)
    : createEmptyLivingState(classId);

  upsertWorldRow(VWORLD_PLAYER_INVENTORY_TABLE, ["user_id"], {
    user_id: String(userId),
    living_class_id: String(normalized.class_id || classId),
    slots_json: JSON.stringify(normalized.slots || {}),
    bag_json: JSON.stringify(normalized.bag || []),
    values_json: JSON.stringify(normalized.values || {}),
    updated_ts: toStoredWorldTimestamp(Date.now()),
  });
}

export function loadWorldItemMeta(worldId: string): {
  next_item_seq: number;
  seeded: number;
  updated_ts: number;
} {
  const row = querySingleWorldRow(
    VWORLD_WORLD_ITEM_META_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
  );
  if (row) {
    return {
      next_item_seq: Number.isFinite(Number(row.next_item_seq))
        ? Number(row.next_item_seq)
        : 0,
      seeded: Number.isFinite(Number(row.seeded)) ? Number(row.seeded) : 0,
      updated_ts: fromStoredWorldTimestamp(row.updated_ts),
    };
  }
  return { next_item_seq: 0, seeded: 0, updated_ts: 0 };
}

export function saveWorldItemMeta(
  worldId: string,
  meta: { next_item_seq: number; seeded: number; updated_ts?: number },
): void {
  upsertWorldRow(VWORLD_WORLD_ITEM_META_TABLE, ["world_id"], {
    world_id: String(worldId),
    next_item_seq: Number.isFinite(Number(meta.next_item_seq))
      ? Number(meta.next_item_seq)
      : 0,
    seeded: Number.isFinite(Number(meta.seeded)) ? Number(meta.seeded) : 0,
    updated_ts: toStoredWorldTimestamp(
      Number.isFinite(Number(meta.updated_ts))
        ? Number(meta.updated_ts)
        : Date.now(),
    ),
  });
}

export function loadWorldItems(worldId: string): Record<string, any[]> {
  const rows = queryWorldRows(
    VWORLD_WORLD_ITEM_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    5000,
    "id",
    "asc",
  );
  if (rows.length > 0) {
    const fromRows: Record<string, any[]> = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.item_id) continue;
      const tileKey = String(row.row) + "_" + String(row.col);
      if (!fromRows[tileKey]) fromRows[tileKey] = [];
      fromRows[tileKey].push({
        id: String(row.item_id),
        type: String(row.type || ""),
        created_at: fromStoredWorldTimestamp(row.created_at),
        destination_world_id:
          typeof row.destination_world_id === "string"
            ? row.destination_world_id
            : undefined,
        destination_world_type: resolvePortalDestinationWorldType({
          destination_world_id:
            typeof row.destination_world_id === "string"
              ? row.destination_world_id
              : undefined,
          destination_world_type:
            typeof row.destination_world_type === "string"
              ? row.destination_world_type
              : undefined,
        }),
        state: (function () {
          if (typeof row.state_json !== "string" || !row.state_json)
            return undefined;
          try {
            return JSON.parse(row.state_json);
          } catch (e) {
            return undefined;
          }
        })(),
      });
    }
    return fromRows;
  }
  return {};
}

export function saveWorldItems(
  worldId: string,
  items: Record<string, any[]>,
): void {
  const normalized: Record<string, any[]> = {};
  if (items && typeof items === "object") {
    Object.keys(items).forEach(function (tileKey) {
      const arr = items[tileKey];
      if (!Array.isArray(arr)) return;
      const filtered = arr.filter(isValidItem);
      if (filtered.length > 0) normalized[tileKey] = filtered;
    });
  }

  Object.keys(normalized).forEach(function (tileKey) {
    const parts = tileKey.split("_");
    const row = Number(parts[0]);
    const col = Number(parts[1]);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;
    normalized[tileKey].forEach(function (item) {
      if (!isValidItem(item)) return;
      upsertWorldRow(VWORLD_WORLD_ITEM_TABLE, ["item_id"], {
        item_id: String(item.id),
        world_id: String(worldId),
        row: row,
        col: col,
        type: String(item.type),
        created_at: toStoredWorldTimestamp(
          Number.isFinite(Number(item.created_at))
            ? Number(item.created_at)
            : Date.now(),
        ),
        destination_world_id:
          typeof item.destination_world_id === "string"
            ? item.destination_world_id
            : null,
        destination_world_type:
          typeof item.destination_world_type === "string"
            ? normalizeWorldType(item.destination_world_type)
            : null,
        state_json:
          item.state && typeof item.state === "object"
            ? JSON.stringify(item.state)
            : null,
      });
    });
  });
}

export function upsertWorldItem(
  worldId: string,
  row: number,
  col: number,
  item: unknown,
): void {
  if (
    !isValidItem(item) ||
    !Number.isFinite(Number(row)) ||
    !Number.isFinite(Number(col))
  ) {
    return;
  }
  upsertWorldRow(VWORLD_WORLD_ITEM_TABLE, ["item_id"], {
    item_id: String(item.id),
    world_id: String(worldId),
    row: Number(row),
    col: Number(col),
    type: String(item.type),
    created_at: toStoredWorldTimestamp(
      Number.isFinite(Number(item.created_at))
        ? Number(item.created_at)
        : Date.now(),
    ),
    destination_world_id:
      typeof item.destination_world_id === "string"
        ? item.destination_world_id
        : null,
    destination_world_type:
      typeof item.destination_world_type === "string"
        ? normalizeWorldType(item.destination_world_type)
        : null,
    state_json:
      item.state && typeof item.state === "object"
        ? JSON.stringify(item.state)
        : null,
  });
}

/**
 * Delete a world item row; returns true only when this call actually
 * removed the row. Under concurrent pickups exactly one caller gets true —
 * that caller owns the item.
 */
export function deleteWorldItemById(itemId: string): boolean {
  if (!itemId) return false;
  return (
    deleteWorldRowsWhere(
      VWORLD_WORLD_ITEM_TABLE,
      JSON.stringify({ item_id: String(itemId) }),
    ) > 0
  );
}

/**
 * Delete the given items and return the subset this caller actually claimed
 * (rows it deleted). Callers must only grant claimed items to inventories.
 */
export function deleteWorldItems(items: any[]): any[] {
  const claimed: any[] = [];
  if (!Array.isArray(items)) return claimed;
  for (let i = 0; i < items.length; i++) {
    if (!items[i] || typeof items[i].id !== "string") continue;
    if (deleteWorldItemById(String(items[i].id))) {
      claimed.push(items[i]);
    }
  }
  return claimed;
}

export function nextWorldItemId(worldId: string): number {
  const meta = loadWorldItemMeta(worldId);
  const nextSeq = Number(meta.next_item_seq || 0) + 1;
  saveWorldItemMeta(worldId, {
    next_item_seq: nextSeq,
    seeded: meta.seeded,
    updated_ts: Date.now(),
  });
  return nextSeq;
}

export function ensureOldOakItem(worldId: string): void {
  if (!isOakWorld(worldId)) return;
  const items = loadWorldItems(worldId);
  const found: Array<{ item: any; tileKey: string }> = [];
  for (const tileKey of Object.keys(items)) {
    for (const item of items[tileKey]) {
      if (item && item.type === "old_oak") found.push({ item, tileKey });
    }
  }

  // Self-heal: concurrent requests racing to seed the singleton oak on a
  // fresh world can each insert their own copy; keep the lowest id (oldest)
  // and delete any others so exactly one old_oak item ever survives.
  found.sort(function (a, b) {
    return String(a.item.id).localeCompare(String(b.item.id));
  });
  const canonical = found.length > 0 ? found[0] : null;
  for (let i = 1; i < found.length; i++) {
    deleteWorldItemById(String(found[i].item.id));
  }

  const centerTileKey = OAK_CENTER_ROW + "_" + OAK_CENTER_COL;
  if (canonical && canonical.tileKey === centerTileKey) return;

  upsertWorldItem(worldId, OAK_CENTER_ROW, OAK_CENTER_COL, {
    id: canonical
      ? canonical.item.id
      : "w" + worldId + "_i" + nextWorldItemId(worldId),
    type: "old_oak",
    created_at: Date.now(),
    non_droppable: true,
  });
}

export function ensureWorldItems(worldId: string): void {
  ensureOldOakItem(worldId);

  const meta = loadWorldItemMeta(worldId);
  if (meta.seeded === 1) return;

  const map = getEffectiveMap(worldId);
  const mapRows = map.length;
  const mapCols = map[0] ? map[0].length : 0;
  const items = loadWorldItems(worldId);
  for (let i = 0; i < WORLD_ITEM_SPAWN_COUNT; i++) {
    let attempts = 0;
    while (attempts < 1000) {
      attempts++;
      const row = 1 + Math.floor(Math.random() * (mapRows - 2));
      const col = 1 + Math.floor(Math.random() * (mapCols - 2));
      if (map[row][col] !== 0) continue;
      const tileKey = row + "_" + col;
      if (!items[tileKey]) items[tileKey] = [];
      const spawnType =
        ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
      items[tileKey].push({
        id: "w" + worldId + "_i" + nextWorldItemId(worldId),
        type: spawnType,
        created_at: Date.now(),
        state: getItemStateTemplate
          ? getItemStateTemplate(spawnType)
          : undefined,
      });
      break;
    }
  }

  saveWorldItems(worldId, items);
  saveWorldItemMeta(worldId, {
    next_item_seq: loadWorldItemMeta(worldId).next_item_seq,
    seeded: 1,
    updated_ts: Date.now(),
  });
}

export function flattenWorldItems(itemsByTile: Record<string, any[]>): Array<{
  id: string;
  type: string;
  row: number;
  col: number;
  destination_world_id?: string;
  destination_world_type?: string;
}> {
  const out: Array<{
    id: string;
    type: string;
    row: number;
    col: number;
    destination_world_id?: string;
    destination_world_type?: string;
  }> = [];
  if (!itemsByTile || typeof itemsByTile !== "object") return out;
  Object.keys(itemsByTile).forEach(function (tileKey) {
    const parts = tileKey.split("_");
    const row = Number(parts[0]);
    const col = Number(parts[1]);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;
    const arr = itemsByTile[tileKey];
    if (!Array.isArray(arr)) return;
    arr.forEach(function (item) {
      if (!isValidItem(item)) return;
      out.push({
        id: item.id,
        type: item.type,
        row: row,
        col: col,
        destination_world_id:
          typeof item.destination_world_id === "string"
            ? item.destination_world_id
            : undefined,
        destination_world_type: resolvePortalDestinationWorldType(item),
      });
    });
  });
  return out;
}
