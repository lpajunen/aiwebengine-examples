import {
  COLS,
  fromStoredWorldTimestamp,
  ROWS,
  toStoredWorldTimestamp,
  WORLD_MOD_LAYER_OBJECT,
  WORLD_MOD_LAYER_TERRAIN,
  WORLD_TILE_GROUND,
  WORLD_TILE_HOUSE,
  WORLD_TILE_PINE_TREE,
} from "./world-domain.ts";
import {
  deleteWorldRow,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

type WorldDbLogFn = (msg: string, obj?: unknown) => void;

type WorldModEntry = {
  row: number;
  col: number;
  layer?: string;
  tile_type: string;
  actor_id: string | null;
  actor_type: string | null;
  timestamp: number;
  payload: Record<string, unknown>;
};

export function createEmptyWorldMods(): Record<string, Record<string, WorldModEntry>> {
  const mods: Record<string, Record<string, WorldModEntry>> = {};
  mods[WORLD_MOD_LAYER_TERRAIN] = {};
  mods[WORLD_MOD_LAYER_OBJECT] = {};
  return mods;
}

export function parseWorldModPayload(
  raw: unknown,
  log: WorldDbLogFn,
): Record<string, unknown> {
  if (!raw || typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (e) {
    log("world mod payload parse failed", { error: String(e) });
    return {};
  }
}

export function loadWorldMods(
  worldId: string,
  worldModTable: string,
  log: WorldDbLogFn,
): Record<string, Record<string, WorldModEntry>> {
  const rows = queryWorldRows(
    worldModTable,
    JSON.stringify({ world_id: String(worldId) }),
    5000,
    "id",
    "asc",
    log,
  );
  const mods = createEmptyWorldMods();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.tile_key || !row.layer || !row.tile_type) continue;
    const layer = String(row.layer);
    if (!mods[layer]) mods[layer] = {};
    mods[layer][String(row.tile_key)] = {
      row: Number(row.row),
      col: Number(row.col),
      layer: layer,
      tile_type: String(row.tile_type),
      actor_id: row.actor_id ? String(row.actor_id) : null,
      actor_type: row.actor_type ? String(row.actor_type) : null,
      timestamp: fromStoredWorldTimestamp(row.timestamp),
      payload: parseWorldModPayload(row.payload_json, log),
    };
  }

  return mods;
}

export function saveWorldModLayer(
  worldId: string,
  layer: string,
  sourceKind: string,
  entries: Record<string, any>,
  worldModTable: string,
  log: WorldDbLogFn,
): void {
  const rows = queryWorldRows(
    worldModTable,
    JSON.stringify({ world_id: String(worldId) }),
    5000,
    "id",
    "desc",
    log,
  );
  const existingByTileKey: Record<string, any> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (
      row &&
      row.tile_key &&
      String(row.layer) === String(layer) &&
      parseWorldModPayload(row.payload_json, log).source_kind === String(sourceKind)
    ) {
      existingByTileKey[String(row.tile_key)] = row;
    }
  }

  Object.keys(entries && typeof entries === "object" ? entries : {}).forEach(
    function (tileKey) {
      const entry = entries[tileKey];
      if (!entry || typeof entry !== "object") return;
      upsertWorldRow(
        worldModTable,
        ["world_id", "tile_key", "layer"],
        {
          world_id: String(worldId),
          tile_key: String(tileKey),
          row: Number(entry.row),
          col: Number(entry.col),
          layer: String(layer),
          tile_type: String(entry.tile_type || WORLD_TILE_GROUND),
          actor_id: entry.actor_id ? String(entry.actor_id) : null,
          actor_type: entry.actor_type ? String(entry.actor_type) : null,
          timestamp: toStoredWorldTimestamp(
            Number.isFinite(Number(entry.timestamp))
              ? Number(entry.timestamp)
              : Date.now(),
          ),
          payload_json: JSON.stringify(entry.payload || {}),
        },
        log,
      );
      delete existingByTileKey[String(tileKey)];
    },
  );

  Object.keys(existingByTileKey).forEach(function (tileKey) {
    const row = existingByTileKey[tileKey];
    if (!row || !Number.isFinite(Number(row.id))) return;
    deleteWorldRow(worldModTable, Number(row.id), log);
  });
}

export function loadWorldTrees(
  worldId: string,
  worldModTable: string,
  log: WorldDbLogFn,
): Record<string, any> {
  const worldMods = loadWorldMods(worldId, worldModTable, log);
  const trees: Record<string, any> = {};
  const objectMods = worldMods[WORLD_MOD_LAYER_OBJECT] || {};
  Object.keys(objectMods).forEach(function (tileKey) {
    const mod = objectMods[tileKey];
    const payload =
      mod && mod.payload && typeof mod.payload === "object" ? mod.payload : {};
    if (payload.source_kind !== "tree") return;
    if (payload.action !== "plant" && payload.action !== "cut") return;
    trees[tileKey] = {
      action: String(payload.action),
      timestamp: Number.isFinite(Number(mod.timestamp))
        ? Number(mod.timestamp)
        : Date.now(),
    };
    if (payload.action === "plant" && mod.actor_id) {
      trees[tileKey].planted_by = String(mod.actor_id);
    }
    if (payload.action === "cut" && mod.actor_id) {
      trees[tileKey].cut_by = String(mod.actor_id);
    }
  });
  return trees;
}

export function saveWorldTrees(
  worldId: string,
  trees: Record<string, any>,
  worldModTable: string,
  log: WorldDbLogFn,
): void {
  const treeMods: Record<string, any> = {};
  Object.keys(trees && typeof trees === "object" ? trees : {}).forEach(
    function (tileKey) {
      const tree = trees[tileKey];
      if (!tree || typeof tree !== "object") return;
      const parts = tileKey.split("_");
      const row = Number(parts[0]);
      const col = Number(parts[1]);
      if (!Number.isFinite(row) || !Number.isFinite(col)) return;
      const actorId = tree.planted_by || tree.cut_by || null;
      treeMods[tileKey] = {
        row: row,
        col: col,
        tile_type:
          tree.action === "plant" ? WORLD_TILE_PINE_TREE : WORLD_TILE_GROUND,
        actor_id: actorId ? String(actorId) : null,
        actor_type:
          actorId && String(actorId).indexOf("npc_") === 0
            ? "npc"
            : actorId
              ? "player"
              : null,
        timestamp: Number.isFinite(Number(tree.timestamp))
          ? Number(tree.timestamp)
          : Date.now(),
        payload: {
          source_kind: "tree",
          action: String(tree.action || ""),
        },
      };
    },
  );
  saveWorldModLayer(
    worldId,
    WORLD_MOD_LAYER_OBJECT,
    "tree",
    treeMods,
    worldModTable,
    log,
  );
}

export function loadWorldHouses(
  worldId: string,
  worldModTable: string,
  log: WorldDbLogFn,
): Record<string, any> {
  const worldMods = loadWorldMods(worldId, worldModTable, log);
  const houses: Record<string, any> = {};
  const objectMods = worldMods[WORLD_MOD_LAYER_OBJECT] || {};
  Object.keys(objectMods).forEach(function (tileKey) {
    const mod = objectMods[tileKey];
    const payload =
      mod && mod.payload && typeof mod.payload === "object" ? mod.payload : {};
    if (payload.source_kind !== "house") return;
    houses[tileKey] = {
      built_by: mod.actor_id ? String(mod.actor_id) : undefined,
      actor_type: mod.actor_type ? String(mod.actor_type) : undefined,
      timestamp: Number.isFinite(Number(mod.timestamp))
        ? Number(mod.timestamp)
        : Date.now(),
    };
  });
  return houses;
}

export function saveWorldHouses(
  worldId: string,
  houses: Record<string, any>,
  worldModTable: string,
  log: WorldDbLogFn,
): void {
  const houseMods: Record<string, any> = {};
  Object.keys(houses && typeof houses === "object" ? houses : {}).forEach(
    function (tileKey) {
      const house = houses[tileKey];
      if (!house || typeof house !== "object") return;
      const parts = String(tileKey).split("_");
      const row = Number(parts[0]);
      const col = Number(parts[1]);
      if (
        !Number.isFinite(row) ||
        !Number.isFinite(col) ||
        row < 0 ||
        row >= ROWS ||
        col < 0 ||
        col >= COLS
      ) {
        return;
      }
      houseMods[String(tileKey)] = {
        row: row,
        col: col,
        tile_type: WORLD_TILE_HOUSE,
        actor_id: house.built_by ? String(house.built_by) : null,
        actor_type: house.actor_type ? String(house.actor_type) : null,
        timestamp: Number.isFinite(Number(house.timestamp))
          ? Number(house.timestamp)
          : Date.now(),
        payload: { source_kind: "house" },
      };
    },
  );
  saveWorldModLayer(
    worldId,
    WORLD_MOD_LAYER_OBJECT,
    "house",
    houseMods,
    worldModTable,
    log,
  );
}
