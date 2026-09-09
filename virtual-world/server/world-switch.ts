import {
  deletePlayerHeartbeat,
  deletePlayerMoveLease,
  deletePlayerPosition,
  getPlayerWorld,
  loadPlayerPosition,
  savePlayerPosition,
  savePlayerWorld,
} from "./player-persistence.ts";
import { getDefaultSpawnPosition } from "./player-snapshots.ts";
import {
  deleteOnlinePresence,
  getEffectiveNick,
  sendGlobalPresenceEvent,
} from "./social-state.ts";
import { sendWorldScopedStreamEvent } from "./stream-broadcast.ts";
import { createWorldOfType } from "./world-bootstrap.ts";
import { START_WORLD_ID } from "./runtime-config.ts";
type SpawnPosition = {
  row: number;
  col: number;
  seq?: number;
  rotation?: number;
};

export function switchUserWorld(
  userId: string,
  targetWorldId: string,
  spawnPosition?: SpawnPosition,
): void {
  const oldWorldId = getPlayerWorld(userId);
  if (oldWorldId) {
    const oldPosition = loadPlayerPosition(userId);
    if (oldPosition && oldPosition.world_id === String(oldWorldId)) {
      deletePlayerPosition(userId);
      deletePlayerHeartbeat(userId);
      deletePlayerMoveLease(userId);
      sendWorldScopedStreamEvent(String(oldWorldId), "player_moved", {
        player_id: userId,
        leaving: true,
        switched_world: true,
        target_world_id: String(targetWorldId),
      });
      sendGlobalPresenceEvent(
        "left",
        userId,
        String(oldWorldId),
        getEffectiveNick(userId),
        Number(oldPosition.ts || 0) || Date.now(),
        Date.now(),
      );
    }
  }

  savePlayerWorld(userId, String(targetWorldId));
  if (
    spawnPosition &&
    Number.isFinite(Number(spawnPosition.row)) &&
    Number.isFinite(Number(spawnPosition.col))
  ) {
    savePlayerPosition(userId, String(targetWorldId), {
      row: Number(spawnPosition.row),
      col: Number(spawnPosition.col),
      seq: Number.isFinite(Number(spawnPosition.seq))
        ? Number(spawnPosition.seq)
        : 0,
      rotation: Number.isFinite(Number(spawnPosition.rotation))
        ? Number(spawnPosition.rotation)
        : 0,
      ts: Date.now(),
    });
  }
  deletePlayerMoveLease(userId);
  deleteOnlinePresence(userId);
}

export function switchUserToNewWorld(
  userId: string,
  worldType: string,
): { ok: boolean } {
  const createdWorld = createWorldOfType(worldType);
  switchUserWorld(userId, createdWorld.world_id);
  return { ok: true };
}

// Sends a player to the deployment's configured start world. Deliberately does
// not write the world's type/dimensions/class: it used to rewrite them from the
// caller's arguments on every use, which reset the start world's class to the
// bare preset and dropped its placements — leaving a separate self-heal to put
// them back on the next load. Switching a player is not a reason to reconfigure
// a world.
export function switchUserToStartWorld(userId: string): { ok: boolean } {
  switchUserWorld(
    userId,
    START_WORLD_ID,
    getDefaultSpawnPosition(START_WORLD_ID, userId),
  );
  return { ok: true };
}
