import {
  deleteNPCById,
  loadWorldNPCs,
  saveWorldNPCs,
  spawnSingleWorldNPC,
} from "./npc-storage.ts";
import { sendWorldScopedStreamEvent } from "./stream-broadcast.ts";
import { getEffectiveMap } from "./world-bootstrap.ts";
import { isWorldTileWalkable } from "./world-domain.ts";

// Livings an event brings and takes away: the small man who rises beside the
// great oak, the animals that gather to a kantele. Each is an ordinary NPC
// marked with the event that brought it (`values.broughtBy`), so the event
// can send away exactly its own when it ends.

/**
 * Brings a living of `classId` beside a tile — the first free walkable tile
 * within three of it — and tells the world. Returns its id, or "" when there
 * was no room.
 */
export function bringLivingBeside(
  worldId: string,
  classId: string,
  at: { row: number; col: number },
  broughtBy: string,
): string {
  const placed = spawnSingleWorldNPC(worldId, classId);
  if (!placed) return "";
  const map = getEffectiveMap(worldId);
  const npcs = loadWorldNPCs(worldId);
  const taken: Record<string, boolean> = {};
  Object.keys(npcs).forEach(function (id) {
    if (id !== placed.npcId) taken[npcs[id].row + "_" + npcs[id].col] = true;
  });
  for (let radius = 1; radius <= 3; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const row = at.row + dr;
        const col = at.col + dc;
        if (
          map[row] &&
          isWorldTileWalkable(map[row][col]) &&
          !taken[row + "_" + col]
        ) {
          placed.npc.row = row;
          placed.npc.col = col;
          placed.npc.values = Object.assign({}, placed.npc.values, {
            broughtBy: broughtBy,
          });
          saveWorldNPCs(worldId, { [placed.npcId]: placed.npc });
          sendWorldScopedStreamEvent(String(worldId), "npc_moved", {
            npc_id: placed.npcId,
            row: row,
            col: col,
            seq: placed.npc.seq,
            rotation: placed.npc.rotation,
            state: placed.npc.state,
            class_id: placed.npc.class_id,
            values: placed.npc.values,
          });
          return placed.npcId;
        }
      }
    }
  }
  // Nowhere near: it does not come at all rather than stand somewhere else.
  deleteNPCById(placed.npcId);
  return "";
}

/** Sends away every living `broughtBy` brought, and tells the world. */
export function sendAwayLivings(worldId: string, broughtBy: string): void {
  const npcs = loadWorldNPCs(worldId);
  Object.keys(npcs).forEach(function (id) {
    const npc = npcs[id];
    if (npc && npc.values && npc.values.broughtBy === broughtBy) {
      deleteNPCById(id);
      sendWorldScopedStreamEvent(String(worldId), "npc_moved", {
        npc_id: id,
        despawn: true,
      });
    }
  });
}
