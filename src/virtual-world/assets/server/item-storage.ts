import {
  createEmptyInventory,
  isValidItem,
  normalizeInventory,
  normalizeWorldType,
  toStoredWorldTimestamp,
  fromStoredWorldTimestamp,
} from "./world-domain.ts";
import {
  deleteWorldRowsWhere,
  querySingleWorldRow,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

type WorldDbLogFn = (msg: string, obj?: unknown) => void;
type ResolvePortalDestinationWorldType = (item?: {
  destination_world_id?: string;
  destination_world_type?: string;
}) => string | undefined;
type EnsureWorldItemsDeps = {
  loadWorldItemMeta: (worldId: string) => {
    next_item_seq: number;
    seeded: number;
    updated_ts: number;
  };
  getEffectiveMap: (worldId: string) => number[][];
  loadWorldItems: (worldId: string) => Record<string, any[]>;
  nextWorldItemId: (worldId: string) => number;
  saveWorldItems: (worldId: string, items: Record<string, any[]>) => void;
  saveWorldItemMeta: (
    worldId: string,
    meta: { next_item_seq: number; seeded: number; updated_ts?: number },
  ) => void;
  WORLD_ITEM_SPAWN_COUNT: number;
  ROWS: number;
  COLS: number;
  ITEM_TYPES: readonly string[];
};

export function loadPlayerInventory(
  userId: string,
  playerInventoryTable: string,
  log: WorldDbLogFn,
): { left_hand: any; right_hand: any; inventory: any[] } {
  const row = querySingleWorldRow(
    playerInventoryTable,
    JSON.stringify({ user_id: String(userId) }),
    log,
  );
  if (row) {
    try {
      return normalizeInventory({
        left_hand: row.left_hand_json ? JSON.parse(row.left_hand_json) : null,
        right_hand: row.right_hand_json
          ? JSON.parse(row.right_hand_json)
          : null,
        inventory: row.inventory_json ? JSON.parse(row.inventory_json) : [],
      });
    } catch (e) {
      return createEmptyInventory();
    }
  }
  return createEmptyInventory();
}

export function savePlayerInventory(
  userId: string,
  inventory: unknown,
  playerInventoryTable: string,
  log: WorldDbLogFn,
): void {
  const normalized = normalizeInventory(inventory);
  upsertWorldRow(
    playerInventoryTable,
    ["user_id"],
    {
      user_id: String(userId),
      left_hand_json: normalized.left_hand
        ? JSON.stringify(normalized.left_hand)
        : null,
      right_hand_json: normalized.right_hand
        ? JSON.stringify(normalized.right_hand)
        : null,
      inventory_json: JSON.stringify(normalized.inventory || []),
      updated_ts: toStoredWorldTimestamp(Date.now()),
    },
    log,
  );
}

export function loadWorldItemMeta(
  worldId: string,
  worldItemMetaTable: string,
  log: WorldDbLogFn,
): { next_item_seq: number; seeded: number; updated_ts: number } {
  const row = querySingleWorldRow(
    worldItemMetaTable,
    JSON.stringify({ world_id: String(worldId) }),
    log,
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
  worldItemMetaTable: string,
  log: WorldDbLogFn,
): void {
  upsertWorldRow(
    worldItemMetaTable,
    ["world_id"],
    {
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
    },
    log,
  );
}

export function loadWorldItems(
  worldId: string,
  worldItemTable: string,
  log: WorldDbLogFn,
  resolvePortalDestinationWorldType: ResolvePortalDestinationWorldType,
): Record<string, any[]> {
  const rows = queryWorldRows(
    worldItemTable,
    JSON.stringify({ world_id: String(worldId) }),
    5000,
    "id",
    "asc",
    log,
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
      });
    }
    return fromRows;
  }
  return {};
}

export function saveWorldItems(
  worldId: string,
  items: Record<string, any[]>,
  worldItemTable: string,
  log: WorldDbLogFn,
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
      upsertWorldRow(
        worldItemTable,
        ["item_id"],
        {
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
        },
        log,
      );
    });
  });
}

export function upsertWorldItem(
  worldId: string,
  row: number,
  col: number,
  item: unknown,
  worldItemTable: string,
  log: WorldDbLogFn,
): void {
  if (
    !isValidItem(item) ||
    !Number.isFinite(Number(row)) ||
    !Number.isFinite(Number(col))
  ) {
    return;
  }
  upsertWorldRow(
    worldItemTable,
    ["item_id"],
    {
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
    },
    log,
  );
}

export function deleteWorldItemById(
  itemId: string,
  worldItemTable: string,
  log: WorldDbLogFn,
): void {
  if (!itemId) return;
  deleteWorldRowsWhere(
    worldItemTable,
    JSON.stringify({ item_id: String(itemId) }),
    log,
  );
}

export function deleteWorldItems(
  items: any[],
  worldItemTable: string,
  log: WorldDbLogFn,
): void {
  if (!Array.isArray(items)) return;
  for (let i = 0; i < items.length; i++) {
    if (!items[i] || typeof items[i].id !== "string") continue;
    deleteWorldItemById(String(items[i].id), worldItemTable, log);
  }
}

export function nextWorldItemId(
  worldId: string,
  worldItemMetaTable: string,
  log: WorldDbLogFn,
): number {
  const meta = loadWorldItemMeta(worldId, worldItemMetaTable, log);
  const nextSeq = Number(meta.next_item_seq || 0) + 1;
  saveWorldItemMeta(
    worldId,
    {
      next_item_seq: nextSeq,
      seeded: meta.seeded,
      updated_ts: Date.now(),
    },
    worldItemMetaTable,
    log,
  );
  return nextSeq;
}

export function ensureWorldItems(
  worldId: string,
  deps: EnsureWorldItemsDeps,
): void {
  const meta = deps.loadWorldItemMeta(worldId);
  if (meta.seeded === 1) return;

  const map = deps.getEffectiveMap(worldId);
  const items = deps.loadWorldItems(worldId);
  for (let i = 0; i < deps.WORLD_ITEM_SPAWN_COUNT; i++) {
    let attempts = 0;
    while (attempts < 1000) {
      attempts++;
      const row = 1 + Math.floor(Math.random() * (deps.ROWS - 2));
      const col = 1 + Math.floor(Math.random() * (deps.COLS - 2));
      if (map[row][col] !== 0) continue;
      const tileKey = row + "_" + col;
      if (!items[tileKey]) items[tileKey] = [];
      items[tileKey].push({
        id: "w" + worldId + "_i" + deps.nextWorldItemId(worldId),
        type: deps.ITEM_TYPES[
          Math.floor(Math.random() * deps.ITEM_TYPES.length)
        ],
        created_at: Date.now(),
      });
      break;
    }
  }

  deps.saveWorldItems(worldId, items);
  deps.saveWorldItemMeta(worldId, {
    next_item_seq: deps.loadWorldItemMeta(worldId).next_item_seq,
    seeded: 1,
    updated_ts: Date.now(),
  });
}

export function flattenWorldItems(
  itemsByTile: Record<string, any[]>,
  resolvePortalDestinationWorldType: ResolvePortalDestinationWorldType,
): Array<{
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
