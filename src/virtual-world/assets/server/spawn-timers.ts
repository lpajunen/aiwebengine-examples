import { getItemClass } from "./item-registry.ts";
import { getLivingClass } from "./living-registry.ts";
import { spawnSingleWorldItem } from "./item-storage.ts";
import { spawnSingleWorldNPC } from "./npc-storage.ts";
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

// Spawns replacements for any due respawn timers in worldId — called from
// the NPC tick (npc-orchestration.ts), which already runs on a regular
// cadence for every world with recent activity.
export function processDueSpawnTimers(worldId: string, nowMs: number): void {
  const timers = loadSpawnTimersForWorld(worldId);
  for (let i = 0; i < timers.length; i++) {
    const timer = timers[i];
    if (timer.ready_at > nowMs) continue;

    if (timer.kind === "item") {
      if (!getItemClass(timer.type_id)) {
        deleteSpawnTimerById(timer.id);
        continue;
      }
      const placed = spawnSingleWorldItem(worldId, timer.type_id);
      if (placed) {
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
