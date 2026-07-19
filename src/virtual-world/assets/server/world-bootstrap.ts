import { VWORLD_WORLD_TYPE_TABLE } from "./runtime-config.ts";
import {
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

type EffectiveMapDeps = {
  generateMap: (worldId: string) => number[][];
  applyWorldModsToMap: (
    map: number[][],
    worldMods: Record<string, any>,
  ) => number[][];
  loadWorldMods: (worldId: string) => Record<string, any>;
  applyOakReservation: (map: number[][], worldId: string) => void;
};

type EnsureWorldNPCsDeps = {
  loadWorldNPCs: (worldId: string) => Record<string, any>;
  saveWorldNPCs: (worldId: string, npcs: Record<string, any>) => void;
  getEffectiveMap: (worldId: string) => number[][];
  loadWorldPlayers: (worldId: string) => Record<string, any>;
  NPC_MIN_COUNT: number;
  NPC_MAX_COUNT: number;
};

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
    dimensions?: WorldDimensions,
  ) => string,
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

export function getEffectiveMap(
  worldId: string,
  deps: EffectiveMapDeps,
): number[][] {
  const map = deps.generateMap(worldId);
  deps.applyWorldModsToMap(map, deps.loadWorldMods(worldId));
  deps.applyOakReservation(map, worldId);
  return map;
}

export function ensureWorldNPCs(
  worldId: string,
  deps: EnsureWorldNPCsDeps,
): Record<string, any> {
  const existing = deps.loadWorldNPCs(worldId);
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
      deps.saveWorldNPCs(worldId, existing);
    }
    return existing;
  }

  const map = deps.getEffectiveMap(worldId);
  const mapRows = map.length;
  const mapCols = map[0] ? map[0].length : 0;
  const players = deps.loadWorldPlayers(worldId);
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
    deps.NPC_MIN_COUNT +
    Math.floor(Math.random() * (deps.NPC_MAX_COUNT - deps.NPC_MIN_COUNT + 1));
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

  deps.saveWorldNPCs(worldId, npcs);
  return npcs;
}
