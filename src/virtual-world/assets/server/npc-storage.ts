import {
  createEmptyInventory,
  fromStoredWorldTimestamp,
  normalizeInventory,
  toStoredWorldTimestamp,
} from "./world-domain.ts";
import {
  deleteWorldRow,
  querySingleWorldRow,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

type WorldDbLogFn = (msg: string, obj?: unknown) => void;

type NPCState = {
  row?: unknown;
  col?: unknown;
  seq?: unknown;
  rotation?: unknown;
  state?: unknown;
  ts?: unknown;
  left_hand?: unknown;
  right_hand?: unknown;
  inventory?: unknown;
};

type NPCDisplayNameResolver = (worldId: string, npcId: string) => string;

export function loadWorldNPCs(
  worldId: string,
  npcTable: string,
  log: WorldDbLogFn,
): Record<string, any> {
  const rows = queryWorldRows(
    npcTable,
    JSON.stringify({ world_id: String(worldId) }),
    1000,
    "id",
    "asc",
    log,
  );
  if (rows.length > 0) {
    const fromRows: Record<string, any> = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.npc_id) continue;
      let inventory = createEmptyInventory();
      try {
        inventory = normalizeInventory({
          left_hand: row.left_hand_json ? JSON.parse(row.left_hand_json) : null,
          right_hand: row.right_hand_json
            ? JSON.parse(row.right_hand_json)
            : null,
          inventory: row.inventory_json ? JSON.parse(row.inventory_json) : [],
        });
      } catch (e) {}
      fromRows[String(row.npc_id)] = {
        row: Number.isFinite(Number(row.row)) ? Number(row.row) : 1,
        col: Number.isFinite(Number(row.col)) ? Number(row.col) : 1,
        seq: Number.isFinite(Number(row.seq)) ? Number(row.seq) : 0,
        rotation: Number.isFinite(Number(row.rotation))
          ? Number(row.rotation)
          : 0,
        state: typeof row.state === "string" ? row.state : "idle",
        ts: fromStoredWorldTimestamp(row.ts),
        left_hand: inventory.left_hand,
        right_hand: inventory.right_hand,
        inventory: inventory.inventory,
      };
    }
    return fromRows;
  }
  return {};
}

export function saveWorldNPCs(
  worldId: string,
  npcs: Record<string, any>,
  npcTable: string,
  log: WorldDbLogFn,
): void {
  Object.keys(npcs && typeof npcs === "object" ? npcs : {}).forEach(
    function (npcId) {
      const npc = npcs[npcId] as NPCState;
      if (!npc || typeof npc !== "object") return;
      const inv = normalizeInventory(npc);
      upsertWorldRow(
        npcTable,
        ["npc_id"],
        {
          npc_id: String(npcId),
          world_id: String(worldId),
          row: Number.isFinite(Number(npc.row)) ? Number(npc.row) : 1,
          col: Number.isFinite(Number(npc.col)) ? Number(npc.col) : 1,
          seq: Number.isFinite(Number(npc.seq)) ? Number(npc.seq) : 0,
          rotation: Number.isFinite(Number(npc.rotation))
            ? Number(npc.rotation)
            : 0,
          state: typeof npc.state === "string" ? npc.state : "idle",
          ts: toStoredWorldTimestamp(
            Number.isFinite(Number(npc.ts)) ? Number(npc.ts) : Date.now(),
          ),
          left_hand_json: inv.left_hand ? JSON.stringify(inv.left_hand) : null,
          right_hand_json: inv.right_hand
            ? JSON.stringify(inv.right_hand)
            : null,
          inventory_json: JSON.stringify(inv.inventory || []),
        },
        log,
      );
    },
  );
}

export function loadNPCActiveWorlds(
  npcActiveWorldTable: string,
  log: WorldDbLogFn,
): Record<string, number> {
  const rows = queryWorldRows(
    npcActiveWorldTable,
    "",
    1000,
    "last_active_ts",
    "desc",
    log,
  );
  if (rows.length > 0) {
    const worlds: Record<string, number> = {};
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i] || !rows[i].world_id) continue;
      worlds[String(rows[i].world_id)] = fromStoredWorldTimestamp(
        rows[i].last_active_ts,
      );
    }
    return worlds;
  }
  return {};
}

export function saveNPCActiveWorlds(
  worlds: Record<string, number>,
  npcActiveWorldTable: string,
  log: WorldDbLogFn,
): void {
  const existingRows = queryWorldRows(
    npcActiveWorldTable,
    "",
    1000,
    "id",
    "desc",
    log,
  );
  const existingByWorldId: Record<string, any> = {};
  for (let i = 0; i < existingRows.length; i++) {
    if (existingRows[i] && existingRows[i].world_id) {
      existingByWorldId[String(existingRows[i].world_id)] = existingRows[i];
    }
  }

  Object.keys(worlds && typeof worlds === "object" ? worlds : {}).forEach(
    function (worldId) {
      upsertWorldRow(
        npcActiveWorldTable,
        ["world_id"],
        {
          world_id: String(worldId),
          last_active_ts: toStoredWorldTimestamp(
            Number.isFinite(Number(worlds[worldId]))
              ? Number(worlds[worldId])
              : 0,
          ),
        },
        log,
      );
      delete existingByWorldId[worldId];
    },
  );

  Object.keys(existingByWorldId).forEach(function (worldId) {
    const row = existingByWorldId[worldId];
    if (!row || !Number.isFinite(Number(row.id))) return;
    deleteWorldRow(npcActiveWorldTable, Number(row.id), log);
  });
}

export function markNPCWorldActive(
  worldId: string,
  npcActiveWorldTable: string,
  log: WorldDbLogFn,
): void {
  upsertWorldRow(
    npcActiveWorldTable,
    ["world_id"],
    {
      world_id: String(worldId),
      last_active_ts: toStoredWorldTimestamp(Date.now()),
    },
    log,
  );
}

export function loadNPCLastTick(
  worldId: string,
  npcTickTable: string,
  log: WorldDbLogFn,
): number {
  const row = querySingleWorldRow(
    npcTickTable,
    JSON.stringify({ world_id: String(worldId) }),
    log,
  );
  if (!row) return 0;
  return fromStoredWorldTimestamp(row.last_tick_ts);
}

export function saveNPCLastTick(
  worldId: string,
  lastTickTs: number,
  npcTickTable: string,
  log: WorldDbLogFn,
): void {
  upsertWorldRow(
    npcTickTable,
    ["world_id"],
    {
      world_id: String(worldId),
      last_tick_ts: toStoredWorldTimestamp(lastTickTs),
    },
    log,
  );
}

export function buildWorldNPCSnapshot(
  worldId: string,
  npcs: Record<string, any>,
  getNPCDisplayName: NPCDisplayNameResolver,
): Array<{
  npc_id: string;
  display_name: string;
  row: number;
  col: number;
  seq: number;
  rotation: number;
  state: string;
  left_hand: string;
  right_hand: string;
  inventory_count: number;
}> {
  return Object.keys(npcs).map(function (npcId) {
    const n = npcs[npcId] || {};
    return {
      npc_id: npcId,
      display_name: getNPCDisplayName(worldId, npcId),
      row: Number(n.row),
      col: Number(n.col),
      seq: Number(n.seq || 0),
      rotation: Number.isFinite(Number(n.rotation)) ? Number(n.rotation) : 0,
      state: typeof n.state === "string" ? n.state : "idle",
      left_hand:
        n.left_hand && n.left_hand.type ? String(n.left_hand.type) : "",
      right_hand:
        n.right_hand && n.right_hand.type ? String(n.right_hand.type) : "",
      inventory_count: Array.isArray(n.inventory) ? n.inventory.length : 0,
    };
  });
}
