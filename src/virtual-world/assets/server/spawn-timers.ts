import { getItemClass } from "./item-registry.ts";
import { getLivingClass } from "./living-registry.ts";
import { countWorldItemsByType, spawnSingleWorldItem } from "./item-storage.ts";
import { countNPCsByClass, spawnSingleWorldNPC } from "./npc-storage.ts";
import { getWorldClassForWorld } from "./world-bootstrap.ts";
import { resolveNPCDisplayName } from "./world-domain.ts";
import {
  broadcastItemChange,
  sendWorldScopedStreamEvent,
} from "./stream-broadcast.ts";
import { RESPAWN_DELAY_MS } from "./runtime-config.ts";
import {
  deleteSpawnTimerById,
  insertSpawnTimer,
  loadSpawnTimersForWorld,
  SpawnTimerKind,
} from "./spawn-timer-storage.ts";

function manifestHasEntry(
  entries: Array<{ id: string; count: number }> | undefined,
  typeId: string,
): boolean {
  if (!Array.isArray(entries)) return false;
  return entries.some(function (entry) {
    return entry.id === typeId;
  });
}

// Schedules a replacement spawn for typeId in worldId, RESPAWN_DELAY_MS from
// now — call this when a manifest-tracked item is picked up or a
// manifest-tracked NPC is killed. Only schedules if typeId is actually part
// of the world's current spawn manifest (guards against respawning quest
// items, corpses, etc. that were never part of the manifest).
export function scheduleRespawnIfManifestTracked(
  worldId: string,
  kind: SpawnTimerKind,
  typeId: string,
): void {
  const worldClass = getWorldClassForWorld(worldId);
  if (!worldClass) return;
  const tracked =
    kind === "item"
      ? manifestHasEntry(worldClass.itemSpawns, typeId)
      : manifestHasEntry(worldClass.npcSpawns, typeId);
  if (!tracked) return;
  insertSpawnTimer(worldId, kind, typeId, Date.now() + RESPAWN_DELAY_MS);
}

function manifestCount(
  entries: Array<{ id: string; count: number }> | undefined,
  typeId: string,
): number {
  if (!Array.isArray(entries)) return 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i] && entries[i].id === typeId) {
      return Math.max(0, Math.floor(Number(entries[i].count) || 0));
    }
  }
  return 0;
}

// Spawns replacements for any due respawn timers in worldId — called from
// the NPC tick (npc-orchestration.ts), which already runs on a regular
// cadence for every world with recent activity.
export function processDueSpawnTimers(worldId: string, nowMs: number): void {
  const timers = loadSpawnTimersForWorld(worldId);
  const worldClass = getWorldClassForWorld(worldId);
  // Populations are counted lazily and only once: nothing is loaded at all
  // unless a timer is actually due.
  let npcCounts: Record<string, number> | null = null;
  let itemCounts: Record<string, number> | null = null;

  for (let i = 0; i < timers.length; i++) {
    const timer = timers[i];
    if (timer.ready_at > nowMs) continue;

    // The manifest count is a target population, not a budget to spend: if the
    // world already holds that many, the replacement this timer stands for is
    // no longer missing and the timer is stale. Without this a world can grow
    // without bound — a tick interrupted between the spawn below and the
    // timer's deletion leaves the timer due, so it spawns again on the next
    // tick, and again, for as long as the world stays heavy enough to be
    // interrupted. That is a self-sustaining loop: every extra NPC makes the
    // next tick slower.
    const isItem = timer.kind === "item";
    const manifest = worldClass
      ? isItem
        ? worldClass.itemSpawns
        : worldClass.npcSpawns
      : undefined;
    const target = manifestCount(manifest, timer.type_id);
    if (isItem && !itemCounts) itemCounts = countWorldItemsByType(worldId);
    if (!isItem && !npcCounts) npcCounts = countNPCsByClass(worldId);
    const counts = (isItem ? itemCounts : npcCounts) as Record<string, number>;
    if ((counts[timer.type_id] || 0) >= target) {
      deleteSpawnTimerById(timer.id);
      continue;
    }

    if (timer.kind === "item") {
      if (!getItemClass(timer.type_id)) {
        deleteSpawnTimerById(timer.id);
        continue;
      }
      const placed = spawnSingleWorldItem(worldId, timer.type_id);
      if (placed) {
        counts[timer.type_id] = (counts[timer.type_id] || 0) + 1;
        broadcastItemChange(
          worldId,
          "world",
          "spawn_timer",
          "item_respawn",
          placed.row,
          placed.col,
          [{ id: placed.id, type: placed.type }],
        );
      }
    } else {
      if (!getLivingClass(timer.type_id)) {
        deleteSpawnTimerById(timer.id);
        continue;
      }
      const placed = spawnSingleWorldNPC(worldId, timer.type_id);
      if (placed) {
        counts[timer.type_id] = (counts[timer.type_id] || 0) + 1;
        sendWorldScopedStreamEvent(String(worldId), "npc_moved", {
          npc_id: placed.npcId,
          display_name: resolveNPCDisplayName(
            worldId,
            placed.npcId,
            placed.npc,
          ),
          row: placed.npc.row,
          col: placed.npc.col,
          seq: placed.npc.seq,
          rotation: placed.npc.rotation,
          state: placed.npc.state,
          class_id: placed.npc.class_id,
          slots: placed.npc.slots,
          values: placed.npc.values,
        });
      }
    }

    deleteSpawnTimerById(timer.id);
  }
}
