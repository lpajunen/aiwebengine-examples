// Records of what a world class's placements actually created in one world —
// see "World Instance Data" in TODO-placements.md.
//
// A world class is a template; materializing it into a world must be
// idempotent, so loading Birdhaven twice does not grow a second oak. The
// identity is (world_id, placement_id): one row per authored placement per
// world, carrying the id of the thing it created.
//
// The row is also what makes removal safe. Deleting a placement from a class
// must delete only the object this row points at — never an object that merely
// happens to share its class id, which would eat a player's own door or chest.

import { VWORLD_WORLD_PLACEMENT_TABLE } from "./runtime-config.ts";
import {
  deleteWorldRowsWhere,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

// Instance id under which a world records which world linked *to* it. A class
// template cannot name its own callers, so an interior's return door has no way
// to know where "back" is; the exterior writes this row when it creates the
// interior, and the interior's source_world portals read it.
//
// Not a placement of any class — it survives the reseed wipe below, because
// losing it would silently strand every return door in the world.
export const SOURCE_WORLD_LINK_ID = "__source_world__";

export type WorldPlacementInstance = {
  worldId: string;
  placementId: string;
  placementKind: string;
  classId: string;
  // The class's placementRevision when this instance was materialized, so a
  // later reconciliation can tell "already done" from "done against an older
  // definition".
  revision: number;
  // Kind-specific back-reference: { itemId } for item/fixture/portal,
  // { npcId } for npc, { tileKey } for structure mods.
  data: Record<string, unknown>;
};

function rowToInstance(row: any): WorldPlacementInstance | null {
  if (!row || !row.world_id || !row.placement_id) return null;
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.data_json || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch (e) {
    data = {};
  }
  return {
    worldId: String(row.world_id),
    placementId: String(row.placement_id),
    placementKind: String(row.placement_kind || ""),
    classId: String(row.class_id || ""),
    revision: Number.isFinite(Number(row.revision)) ? Number(row.revision) : 0,
    data: data,
  };
}

export function loadWorldPlacementInstances(
  worldId: string,
): Record<string, WorldPlacementInstance> {
  const rows = queryWorldRows(
    VWORLD_WORLD_PLACEMENT_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    1000,
    "placement_id",
    "asc",
  );
  const out: Record<string, WorldPlacementInstance> = {};
  for (let i = 0; i < rows.length; i++) {
    const instance = rowToInstance(rows[i]);
    if (instance) out[instance.placementId] = instance;
  }
  return out;
}

export function saveWorldPlacementInstance(
  instance: WorldPlacementInstance,
): void {
  const storedTs = Math.floor(Date.now() / 1000);
  upsertWorldRow(VWORLD_WORLD_PLACEMENT_TABLE, ["world_id", "placement_id"], {
    world_id: String(instance.worldId),
    placement_id: String(instance.placementId),
    placement_kind: String(instance.placementKind || ""),
    class_id: String(instance.classId || ""),
    revision: Number.isFinite(Number(instance.revision))
      ? Number(instance.revision)
      : 0,
    data_json: JSON.stringify(instance.data || {}),
    updated_at: storedTs,
  });
}

export function deleteWorldPlacementInstance(
  worldId: string,
  placementId: string,
): void {
  deleteWorldRowsWhere(
    VWORLD_WORLD_PLACEMENT_TABLE,
    JSON.stringify({
      world_id: String(worldId),
      placement_id: String(placementId),
    }),
  );
}

// Used by the world-item reseed, which deletes every item row in a world: the
// instances pointing at those items are now dangling, so they must go too or
// materialization would consider its work already done and skip re-creating
// the landmarks the wipe removed.
export function deleteWorldPlacementInstances(worldId: string): void {
  const link = loadWorldPlacementInstances(worldId)[SOURCE_WORLD_LINK_ID];
  deleteWorldRowsWhere(
    VWORLD_WORLD_PLACEMENT_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
  );
  // The back-link describes an inbound relationship, not something the reseed
  // recreated, so restore it: nothing else in the world knows it existed.
  if (link) saveWorldPlacementInstance(link);
}
