// Reconciling an existing world against its (edited) world class.
//
// Materialization alone is additive: it creates what is missing and adopts
// what is already there, which is right for a world being loaded. It cannot
// handle a placement a creator *removed* — the oak stays standing after its
// placement is deleted, because nothing is looking for orphans.
//
// Reconciliation closes that, under the constraint from TODO-placements.md
// that it must never remove player-created content. That is exactly what the
// placement instance rows buy: each one names the object that placement
// created, so removal deletes that object and nothing else. An object that
// merely shares a class id with a deleted placement is somebody's property and
// is left alone.
//
// Deliberately explicit, never automatic. Editing a class changes a template;
// rewriting live worlds is a separate decision, made per world.

import {
  deleteWorldItemById,
  materializeWorldPlacements,
} from "./item-storage.ts";
import {
  loadWorldNPCs,
  materializeWorldNPCPlacements,
  saveWorldNPCs,
} from "./npc-storage.ts";
import { loadWorldHouses, saveWorldHouses } from "./world-mod-storage.ts";
import { getWorldClassForWorldId } from "./world-class-storage.ts";
import {
  deleteWorldPlacementInstance,
  loadWorldPlacementInstances,
  SOURCE_WORLD_LINK_ID,
} from "./world-placement-instances.ts";
import { vwLog } from "./diagnostics.ts";

export type ReconcileReport = {
  ok: boolean;
  worldId: string;
  classId: string;
  removed: Array<{ placementId: string; kind: string; detail: string }>;
  kept: string[];
  conflicts: string[];
};

// Removes the object one obsolete placement instance owns. Returns a short
// description of what went, or "" when there was nothing left to remove (the
// object was already gone — a player broke it, or an earlier reconcile ran).
function removeInstanceObject(
  worldId: string,
  placementKind: string,
  data: Record<string, unknown>,
  conflicts: string[],
): string {
  const itemId = String(data.itemId || "");
  if (itemId) {
    return deleteWorldItemById(itemId) ? "item " + itemId : "";
  }

  const npcId = String(data.npcId || "");
  if (npcId) {
    const npcs = loadWorldNPCs(worldId);
    if (!npcs[npcId]) return "";
    delete npcs[npcId];
    saveWorldNPCs(worldId, npcs);
    return "npc " + npcId;
  }

  const tileKey = String(data.tileKey || "");
  if (tileKey) {
    const houses = loadWorldHouses(worldId);
    const house = houses[tileKey];
    if (!house) return "";
    // A structure placement only claims a mod it created. If a player has
    // since built here (built_by is set), the wall is theirs — report it
    // rather than bulldozing it.
    if (house.built_by) {
      conflicts.push(
        "structure at " +
          tileKey +
          " was rebuilt by a player and was left in place",
      );
      return "";
    }
    delete houses[tileKey];
    saveWorldHouses(worldId, houses);
    return "structure at " + tileKey;
  }

  if (placementKind === "terrain") {
    // Terrain is painted from the class at map-generation time and owns no
    // stored object, so dropping the instance row is the whole removal.
    return "terrain";
  }
  return "";
}

export function reconcileWorldPlacements(worldId: string): ReconcileReport {
  const normalizedWorldId = String(worldId || "");
  const worldClass = getWorldClassForWorldId(normalizedWorldId);
  const report: ReconcileReport = {
    ok: true,
    worldId: normalizedWorldId,
    classId: worldClass ? worldClass.id : "",
    removed: [],
    kept: [],
    conflicts: [],
  };
  if (!worldClass) {
    report.ok = false;
    report.conflicts.push("world has no resolvable world class");
    return report;
  }

  const placements = Array.isArray(worldClass.placements)
    ? worldClass.placements
    : [];
  const declared: Record<string, boolean> = {};
  for (let i = 0; i < placements.length; i++) {
    if (placements[i]) declared[String(placements[i].id)] = true;
  }

  const instances = loadWorldPlacementInstances(normalizedWorldId);
  for (const placementId of Object.keys(instances)) {
    // Not a placement: it records which world linked here, and outlives any
    // class edit.
    if (placementId === SOURCE_WORLD_LINK_ID) continue;
    if (declared[placementId]) {
      report.kept.push(placementId);
      continue;
    }
    const instance = instances[placementId];
    const detail = removeInstanceObject(
      normalizedWorldId,
      instance.placementKind,
      instance.data || {},
      report.conflicts,
    );
    deleteWorldPlacementInstance(normalizedWorldId, placementId);
    report.removed.push({
      placementId: placementId,
      kind: instance.placementKind,
      detail: detail || "nothing to remove",
    });
  }

  // Then the additive half: create placements this world is missing and adopt
  // any that already exist.
  materializeWorldPlacements(normalizedWorldId);
  materializeWorldNPCPlacements(
    normalizedWorldId,
    loadWorldNPCs(normalizedWorldId),
  );

  vwLog("world placements reconciled", {
    world_id: normalizedWorldId,
    class_id: report.classId,
    removed_count: report.removed.length,
    kept_count: report.kept.length,
    conflict_count: report.conflicts.length,
  });
  return report;
}
