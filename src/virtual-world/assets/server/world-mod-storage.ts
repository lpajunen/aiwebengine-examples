import { VWORLD_WORLD_MOD_TABLE } from "./runtime-config.ts";
import { vwLog } from "./diagnostics.ts";
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
  isWorldTileWalkable,
  worldTileValueForName,
} from "./world-domain.ts";
import { deleteWorldRow, queryWorldRows, upsertWorldRow } from "./world-db.ts";

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

export function createEmptyWorldMods(): Record<
  string,
  Record<string, WorldModEntry>
> {
  const mods: Record<string, Record<string, WorldModEntry>> = {};
  mods[WORLD_MOD_LAYER_TERRAIN] = {};
  mods[WORLD_MOD_LAYER_OBJECT] = {};
  return mods;
}

export function parseWorldModPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (e) {
    vwLog("world mod payload parse failed", { error: String(e) });
    return {};
  }
}

export function loadWorldMods(
  worldId: string,
): Record<string, Record<string, WorldModEntry>> {
  const rows = queryWorldRows(
    VWORLD_WORLD_MOD_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    5000,
    "id",
    "asc",
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
      payload: parseWorldModPayload(row.payload_json),
    };
  }

  return mods;
}

export function saveWorldModLayer(
  worldId: string,
  layer: string,
  sourceKind: string,
  entries: Record<string, any>,
): void {
  const rows = queryWorldRows(
    VWORLD_WORLD_MOD_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    5000,
    "id",
    "desc",
  );
  const existingByTileKey: Record<string, any> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (
      row &&
      row.tile_key &&
      String(row.layer) === String(layer) &&
      parseWorldModPayload(row.payload_json).source_kind === String(sourceKind)
    ) {
      existingByTileKey[String(row.tile_key)] = row;
    }
  }

  Object.keys(entries && typeof entries === "object" ? entries : {}).forEach(
    function (tileKey) {
      const entry = entries[tileKey];
      if (!entry || typeof entry !== "object") return;
      upsertWorldRow(
        VWORLD_WORLD_MOD_TABLE,
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
      );
      delete existingByTileKey[String(tileKey)];
    },
  );

  Object.keys(existingByTileKey).forEach(function (tileKey) {
    const row = existingByTileKey[tileKey];
    if (!row || !Number.isFinite(Number(row.id))) return;
    deleteWorldRow(VWORLD_WORLD_MOD_TABLE, Number(row.id));
  });
}

// ── Generic tile mods ────────────────────────────────────────────────────
// A tile mod is "this square was changed by something, and now looks like
// `tile_type`". `source_kind` groups the mods so per-kind views can be told
// apart (planted trees vs built houses vs whatever a creator invents). Trees
// and houses used to have a bespoke loader, saver and mutator each; they are
// now two source kinds over these three functions.

/**
 * Every tile mod of one source kind in a world, keyed by "row_col".
 * The mod's own tile_type is the state — a tree mod reading `pine_tree` is a
 * standing tree, one reading `ground` is a stump.
 */
export function loadTileModsOfKind(
  worldId: string,
  sourceKind: string,
): Record<string, WorldModEntry> {
  const objectMods = loadWorldMods(worldId)[WORLD_MOD_LAYER_OBJECT] || {};
  const out: Record<string, WorldModEntry> = {};
  Object.keys(objectMods).forEach(function (tileKey) {
    const mod = objectMods[tileKey];
    const payload =
      mod && mod.payload && typeof mod.payload === "object" ? mod.payload : {};
    if (String(payload.source_kind || "") !== String(sourceKind)) return;
    out[tileKey] = mod;
  });
  return out;
}

/**
 * Writes (or clears) one tile mod and persists that source kind's whole layer.
 * An empty tileType removes the mod, restoring the generated terrain — which
 * is what destroying a house does, as opposed to cutting a tree, which leaves
 * a `ground` mod behind so the square is known to have been cleared.
 */
export function applyTileMod(
  worldId: string,
  actorId: string,
  actorType: string,
  row: number,
  col: number,
  sourceKind: string,
  tileType: string,
  mods: Record<string, WorldModEntry>,
): void {
  const tileKey = row + "_" + col;
  if (!tileType) {
    delete mods[tileKey];
  } else {
    mods[tileKey] = {
      row: row,
      col: col,
      tile_type: tileType,
      actor_id: actorId ? String(actorId) : null,
      actor_type: actorId ? String(actorType || "player") : null,
      timestamp: Date.now(),
      payload: { source_kind: sourceKind, tile_type: tileType },
    };
  }
  saveTileModsOfKind(worldId, sourceKind, mods);
}

/** Persists one source kind's tile mods, replacing that kind's whole layer. */
export function saveTileModsOfKind(
  worldId: string,
  sourceKind: string,
  mods: Record<string, WorldModEntry>,
): void {
  const out: Record<string, WorldModEntry> = {};
  Object.keys(mods && typeof mods === "object" ? mods : {}).forEach(
    function (tileKey) {
      const mod = mods[tileKey];
      if (!mod || typeof mod !== "object") return;
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
      out[String(tileKey)] = {
        row: row,
        col: col,
        tile_type: String(mod.tile_type || WORLD_TILE_GROUND),
        actor_id: mod.actor_id ? String(mod.actor_id) : null,
        actor_type: mod.actor_type ? String(mod.actor_type) : null,
        timestamp: Number.isFinite(Number(mod.timestamp))
          ? Number(mod.timestamp)
          : Date.now(),
        payload: {
          source_kind: sourceKind,
          tile_type: String(mod.tile_type || WORLD_TILE_GROUND),
        },
      };
    },
  );
  saveWorldModLayer(worldId, WORLD_MOD_LAYER_OBJECT, sourceKind, out);
}

// ── Tree and house views ─────────────────────────────────────────────────
// Two source kinds over the generic tile mods above, kept as named views
// because the NPC tick, the page bootstrap and placement reconciliation all
// think in trees and houses. They no longer own any storage of their own.

export function loadWorldTrees(worldId: string): Record<string, any> {
  const trees: Record<string, any> = {};
  const mods = loadTileModsOfKind(worldId, "tree");
  Object.keys(mods).forEach(function (tileKey) {
    const mod = mods[tileKey];
    // The mod's tile_type *is* the state: a standing pine, or the ground a cut
    // one left behind. Rows written before tile mods went generic carried a
    // payload.action saying the same thing, so reading the tile type covers
    // both without a fallback.
    const planted = mod.tile_type === WORLD_TILE_PINE_TREE;
    trees[tileKey] = {
      action: planted ? "plant" : "cut",
      timestamp: Number.isFinite(Number(mod.timestamp))
        ? Number(mod.timestamp)
        : Date.now(),
    };
    if (mod.actor_id) {
      if (planted) trees[tileKey].planted_by = String(mod.actor_id);
      else trees[tileKey].cut_by = String(mod.actor_id);
    }
  });
  return trees;
}

export function saveWorldTrees(
  worldId: string,
  trees: Record<string, any>,
): void {
  const mods: Record<string, WorldModEntry> = {};
  Object.keys(trees && typeof trees === "object" ? trees : {}).forEach(
    function (tileKey) {
      const tree = trees[tileKey];
      if (!tree || typeof tree !== "object") return;
      const parts = String(tileKey).split("_");
      const actorId = tree.planted_by || tree.cut_by || null;
      mods[tileKey] = {
        row: Number(parts[0]),
        col: Number(parts[1]),
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
        payload: {},
      };
    },
  );
  saveTileModsOfKind(worldId, "tree", mods);
}

export function loadWorldHouses(worldId: string): Record<string, any> {
  const houses: Record<string, any> = {};
  const mods = loadTileModsOfKind(worldId, "house");
  Object.keys(mods).forEach(function (tileKey) {
    const mod = mods[tileKey];
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
): void {
  const mods: Record<string, WorldModEntry> = {};
  Object.keys(houses && typeof houses === "object" ? houses : {}).forEach(
    function (tileKey) {
      const house = houses[tileKey];
      if (!house || typeof house !== "object") return;
      const parts = String(tileKey).split("_");
      mods[tileKey] = {
        row: Number(parts[0]),
        col: Number(parts[1]),
        tile_type: WORLD_TILE_HOUSE,
        actor_id: house.built_by ? String(house.built_by) : null,
        actor_type: house.actor_type ? String(house.actor_type) : null,
        timestamp: Number.isFinite(Number(house.timestamp))
          ? Number(house.timestamp)
          : Date.now(),
        payload: {},
      };
    },
  );
  saveTileModsOfKind(worldId, "house", mods);
}
