import { getEffectiveMap } from "./world-bootstrap.ts";
import { loadWorldPlayers } from "./player-snapshots.ts";
import { pickRandomNPCLivingClassId } from "./living-registry.ts";
import { NPC_MIN_COUNT, NPC_MAX_COUNT } from "./runtime-config.ts";
import {
  VWORLD_NPC_ACTIVE_WORLD_TABLE,
  VWORLD_NPC_TABLE,
  VWORLD_NPC_TICK_TABLE,
} from "./runtime-config.ts";
import {
  buildInventorySelectors,
  createEmptyLivingState,
  createLivingSlotsFromDefinitions,
  fromStoredWorldTimestamp,
  getItemsInSlotsWithTag,
  normalizeLivingState,
  toStoredWorldTimestamp,
} from "./world-domain.ts";
import {
  getDefaultNPCLivingClassId,
  getLivingClass,
} from "./living-registry.ts";
import {
  insertWorldRow,
  updateWorldRow,
  deleteWorldRow,
  querySingleWorldRow,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

type NPCState = {
  row?: unknown;
  col?: unknown;
  seq?: unknown;
  rotation?: unknown;
  state?: unknown;
  ts?: unknown;
  class_id?: unknown;
  slots?: unknown;
  bag?: unknown;
  values?: unknown;
};

type NPCDisplayNameResolver = (worldId: string, npcId: string) => string;

function normalizeSafeInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.floor(numeric);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

export function loadWorldNPCs(worldId: string): Record<string, any> {
  const rows = queryWorldRows(
    VWORLD_NPC_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    1000,
    "id",
    "asc",
  );
  if (rows.length > 0) {
    const fromRows: Record<string, any> = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.npc_id) continue;
      const classId =
        typeof row.living_class_id === "string" && row.living_class_id
          ? String(row.living_class_id)
          : getDefaultNPCLivingClassId();
      const livingClass = getLivingClass(classId);
      let living = createEmptyLivingState(classId);
      try {
        if (livingClass) {
          living = normalizeLivingState(
            {
              class_id: classId,
              slots: row.slots_json ? JSON.parse(row.slots_json) : {},
              bag: row.bag_json ? JSON.parse(row.bag_json) : [],
              values: row.values_json ? JSON.parse(row.values_json) : {},
            },
            livingClass,
          );
        }
      } catch (e) {}
      const safeRow = normalizeSafeInt(row.row, 1, 0, 99);
      const safeCol = normalizeSafeInt(row.col, 1, 0, 99);
      const safeSeq = normalizeSafeInt(row.seq, 0, 0, 2147483647);
      fromRows[String(row.npc_id)] = {
        row: safeRow,
        col: safeCol,
        seq: safeSeq,
        rotation: Number.isFinite(Number(row.rotation))
          ? Number(row.rotation)
          : 0,
        state: typeof row.state === "string" ? row.state : "idle",
        ts: fromStoredWorldTimestamp(row.ts),
        class_id: living.class_id || classId,
        slots: living.slots,
        bag: living.bag,
        values: living.values,
      };
    }
    return fromRows;
  }
  return {};
}

export function saveWorldNPCs(
  worldId: string,
  npcs: Record<string, any>,
): void {
  Object.keys(npcs && typeof npcs === "object" ? npcs : {}).forEach(
    function (npcId) {
      const npc = npcs[npcId] as NPCState;
      if (!npc || typeof npc !== "object") return;
      const classId =
        typeof npc.class_id === "string" && npc.class_id
          ? String(npc.class_id)
          : getDefaultNPCLivingClassId();
      const livingClass = getLivingClass(classId);
      const living = livingClass
        ? normalizeLivingState(npc, livingClass)
        : createEmptyLivingState(classId);

      const safeRow = normalizeSafeInt(npc.row, 1, 0, 99);
      const safeCol = normalizeSafeInt(npc.col, 1, 0, 99);
      const safeSeq = normalizeSafeInt(npc.seq, 0, 0, 2147483647);

      const rowData = {
        npc_id: String(npcId),
        world_id: String(worldId),
        row: safeRow,
        col: safeCol,
        seq: safeSeq,
        rotation: Number.isFinite(Number(npc.rotation))
          ? Number(npc.rotation)
          : 0,
        state: typeof npc.state === "string" ? npc.state : "idle",
        ts: toStoredWorldTimestamp(
          Number.isFinite(Number(npc.ts)) ? Number(npc.ts) : Date.now(),
        ),
        living_class_id: living.class_id || classId,
        slots_json: JSON.stringify(living.slots || {}),
        bag_json: JSON.stringify(living.bag || []),
        values_json: JSON.stringify(living.values || {}),
      };
      const existingRow = querySingleWorldRow(
        VWORLD_NPC_TABLE,
        JSON.stringify({ npc_id: String(npcId) }),
      );
      if (existingRow && Number.isFinite(Number(existingRow.id))) {
        updateWorldRow(VWORLD_NPC_TABLE, Number(existingRow.id), rowData);
      } else {
        insertWorldRow(VWORLD_NPC_TABLE, rowData);
      }
    },
  );
}

export function loadNPCActiveWorlds(): Record<string, number> {
  const rows = queryWorldRows(
    VWORLD_NPC_ACTIVE_WORLD_TABLE,
    JSON.stringify({}),
    1000,
    "last_active_ts",
    "desc",
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

export function saveNPCActiveWorlds(worlds: Record<string, number>): void {
  const existingRows = queryWorldRows(
    VWORLD_NPC_ACTIVE_WORLD_TABLE,
    JSON.stringify({}),
    1000,
    "id",
    "desc",
  );
  const existingByWorldId: Record<string, any> = {};
  for (let i = 0; i < existingRows.length; i++) {
    if (existingRows[i] && existingRows[i].world_id) {
      existingByWorldId[String(existingRows[i].world_id)] = existingRows[i];
    }
  }

  Object.keys(worlds && typeof worlds === "object" ? worlds : {}).forEach(
    function (worldId) {
      upsertWorldRow(VWORLD_NPC_ACTIVE_WORLD_TABLE, ["world_id"], {
        world_id: String(worldId),
        last_active_ts: toStoredWorldTimestamp(
          Number.isFinite(Number(worlds[worldId]))
            ? Number(worlds[worldId])
            : 0,
        ),
      });
      delete existingByWorldId[worldId];
    },
  );

  Object.keys(existingByWorldId).forEach(function (worldId) {
    const row = existingByWorldId[worldId];
    if (!row || !Number.isFinite(Number(row.id))) return;
    deleteWorldRow(VWORLD_NPC_ACTIVE_WORLD_TABLE, Number(row.id));
  });
}

export function markNPCWorldActive(worldId: string): void {
  upsertWorldRow(VWORLD_NPC_ACTIVE_WORLD_TABLE, ["world_id"], {
    world_id: String(worldId),
    last_active_ts: toStoredWorldTimestamp(Date.now()),
  });
}

export function loadNPCLastTick(worldId: string): number {
  const row = querySingleWorldRow(
    VWORLD_NPC_TICK_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
  );
  if (!row) return 0;
  return fromStoredWorldTimestamp(row.last_tick_ts);
}

export function saveNPCLastTick(worldId: string, lastTickTs: number): void {
  upsertWorldRow(VWORLD_NPC_TICK_TABLE, ["world_id"], {
    world_id: String(worldId),
    last_tick_ts: toStoredWorldTimestamp(lastTickTs),
  });
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
  class_id: string;
  slots: Record<string, any>;
  values: Record<string, unknown>;
  left_hand: string;
  right_hand: string;
  inventory_count: number;
  inventory_slot_ids: string[];
  inventory_selectors: string[];
}> {
  return Object.keys(npcs).map(function (npcId) {
    const n = npcs[npcId] || {};
    const slots = n && n.slots && typeof n.slots === "object" ? n.slots : {};
    const bag = Array.isArray(n && n.bag) ? n.bag : [];
    const values =
      n && n.values && typeof n.values === "object" ? n.values : {};
    const classId =
      typeof n.class_id === "string" && n.class_id
        ? String(n.class_id)
        : getDefaultNPCLivingClassId();
    const livingClass = getLivingClass(classId);
    const handItems = getItemsInSlotsWithTag({ slots }, livingClass, "hand");
    const leftHandItem = handItems[0] || null;
    const rightHandItem = handItems[1] || null;
    const selectors = buildInventorySelectors({ slots, bag });
    return {
      npc_id: npcId,
      display_name: getNPCDisplayName(worldId, npcId),
      row: Number(n.row),
      col: Number(n.col),
      seq: Number(n.seq || 0),
      rotation: Number.isFinite(Number(n.rotation)) ? Number(n.rotation) : 0,
      state: typeof n.state === "string" ? n.state : "idle",
      class_id: classId,
      // Slots are public (drive outside appearance); bag contents are
      // private and intentionally omitted — NPCs have no owning client, so
      // there is no "self" snapshot that legitimately needs bag data here.
      slots: slots,
      values: values,
      left_hand:
        leftHandItem && leftHandItem.type ? String(leftHandItem.type) : "",
      right_hand:
        rightHandItem && rightHandItem.type ? String(rightHandItem.type) : "",
      inventory_count: bag.length,
      inventory_slot_ids: selectors.inventory_slot_ids,
      inventory_selectors: selectors.inventory_selectors,
    };
  });
}

export function ensureWorldNPCs(worldId: string): Record<string, any> {
  const existing = loadWorldNPCs(worldId);
  if (existing && Object.keys(existing).length > 0) {
    let hasNormalizationChanges = false;
    Object.keys(existing).forEach((npcId) => {
      const npc = existing[npcId];
      if (!npc || typeof npc !== "object") {
        existing[npcId] = {
          row: 1,
          col: 1,
          seq: 0,
          rotation: 0,
          state: "idle",
          ts: Date.now(),
          class_id: getDefaultNPCLivingClassId(),
          slots: {},
          bag: [],
          values: {},
        };
        hasNormalizationChanges = true;
        return;
      }

      if (
        typeof npc.class_id !== "string" ||
        !npc.class_id ||
        !npc.slots ||
        typeof npc.slots !== "object" ||
        !Array.isArray(npc.bag)
      ) {
        if (typeof npc.class_id !== "string" || !npc.class_id) {
          npc.class_id = getDefaultNPCLivingClassId();
        }
        if (!npc.slots || typeof npc.slots !== "object") {
          const cls = getLivingClass(String(npc.class_id));
          npc.slots = cls
            ? createLivingSlotsFromDefinitions(cls.slotDefinitions)
            : {};
        }
        if (!Array.isArray(npc.bag)) npc.bag = [];
        if (!npc.values || typeof npc.values !== "object") npc.values = {};
        hasNormalizationChanges = true;
      }
    });

    if (hasNormalizationChanges) {
      saveWorldNPCs(worldId, existing);
    }
    return existing;
  }

  const map = getEffectiveMap(worldId);
  const mapRows = map.length;
  const mapCols = map[0] ? map[0].length : 0;
  const players = loadWorldPlayers(worldId);
  const occupied: Record<string, boolean> = {};
  Object.keys(players).forEach((playerId) => {
    const player = players[playerId];
    if (
      !player ||
      !isFinite(Number(player.row)) ||
      !isFinite(Number(player.col))
    ) {
      return;
    }
    occupied[player.row + "_" + player.col] = true;
  });

  const targetCount =
    NPC_MIN_COUNT +
    Math.floor(Math.random() * (NPC_MAX_COUNT - NPC_MIN_COUNT + 1));
  const npcs: Record<string, any> = {};
  let attempts = 0;
  const maxAttempts = 4000;

  while (Object.keys(npcs).length < targetCount && attempts < maxAttempts) {
    attempts++;
    const row = 1 + Math.floor(Math.random() * (mapRows - 2));
    const col = 1 + Math.floor(Math.random() * (mapCols - 2));
    const tileKey = row + "_" + col;
    if (map[row][col] !== 0 || occupied[tileKey]) {
      continue;
    }
    occupied[tileKey] = true;
    const index = Object.keys(npcs).length + 1;
    const npcId = "npc_" + worldId + "_" + index;
    const classId = pickRandomNPCLivingClassId();
    const livingClass = getLivingClass(classId);
    const slots = livingClass
      ? createLivingSlotsFromDefinitions(livingClass.slotDefinitions)
      : {};
    npcs[npcId] = {
      row,
      col,
      seq: 0,
      rotation: 0,
      state: "idle",
      ts: Date.now(),
      class_id: classId,
      slots: slots,
      bag: [],
      values: livingClass
        ? Object.assign({}, livingClass.valueTemplate || {})
        : {},
    };
  }

  saveWorldNPCs(worldId, npcs);
  return npcs;
}
