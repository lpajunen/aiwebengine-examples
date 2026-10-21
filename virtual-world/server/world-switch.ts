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
import { isOnboardingDone, mayEnterWorld } from "./home-island.ts";
type SpawnPosition = {
  row: number;
  col: number;
  seq?: number;
  rotation?: number;
};

/**
 * Moves a player into another world. Every way between worlds comes through
 * here, so this is where entry is decided: someone else's home island is
 * refused, whatever led there. Returns false when the move was refused, and
 * the player stays where they are.
 */
export function switchUserWorld(
  userId: string,
  targetWorldId: string,
  spawnPosition?: SpawnPosition,
): boolean {
  if (!mayEnterWorld(userId, String(targetWorldId))) return false;
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
  return true;
}

export function switchUserToNewWorld(
  userId: string,
  worldType: string,
): { ok: boolean; error?: string } {
  if (!isOnboardingDone(userId)) {
    return { ok: false, error: "error.finish_island_first" };
  }
  const createdWorld = createWorldOfType(worldType);
  switchUserWorld(userId, createdWorld.world_id);
  return { ok: true };
}

// Sends a player to the deployment's configured start world. Deliberately does
// not write the world's type/dimensions/class: rewriting them from the
// caller's arguments would reset the start world's class to the bare preset
// and drop its placements. Switching a player is not a reason to reconfigure a
// world.
//
// A player still on their home island's onboarding is refused: the way off the
// island is the boat they make there.
export function switchUserToStartWorld(userId: string): {
  ok: boolean;
  error?: string;
} {
  if (!isOnboardingDone(userId)) {
    return { ok: false, error: "error.finish_island_first" };
  }
  switchUserWorld(
    userId,
    START_WORLD_ID,
    getDefaultSpawnPosition(START_WORLD_ID, userId),
  );
  return { ok: true };
}
