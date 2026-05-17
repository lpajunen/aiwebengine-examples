type SpawnPosition = {
  row: number;
  col: number;
  seq?: number;
  rotation?: number;
};

type SwitchUserWorldDeps = {
  getPlayerWorld: (userId: string) => string;
  getEffectiveNick: (userId: string) => string;
  loadPlayerPosition: (userId: string) => any;
  deletePlayerPosition: (userId: string) => void;
  deletePlayerHeartbeat: (userId: string) => void;
  deletePlayerMoveLease: (userId: string) => void;
  sendWorldScopedStreamEvent: (
    worldId: string,
    eventType: string,
    payload: any,
  ) => void;
  sendGlobalPresenceEvent: (
    action: string,
    userId: string,
    worldId: string,
    nick: string,
    loginAt?: number,
    lastActive?: number,
  ) => void;
  savePlayerWorld: (userId: string, worldId: string) => void;
  savePlayerPosition: (userId: string, worldId: string, position: any) => void;
  deleteOnlinePresence: (userId: string) => void;
};

type NewWorldDeps = {
  createWorldOfType: (worldType: string) => {
    world_id: string;
    world_type: string;
  };
  switchUserWorld: (
    userId: string,
    targetWorldId: string,
    spawnPosition?: SpawnPosition,
  ) => void;
};

type StartWorldDeps = {
  saveWorldType: (worldId: string, worldType: string) => string;
  switchUserWorld: (
    userId: string,
    targetWorldId: string,
    spawnPosition?: SpawnPosition,
  ) => void;
  getDefaultSpawnPosition: (worldId: string, userId: string) => SpawnPosition;
};

export function switchUserWorld(
  userId: string,
  targetWorldId: string,
  spawnPosition: SpawnPosition | undefined,
  deps: SwitchUserWorldDeps,
): void {
  const oldWorldId = deps.getPlayerWorld(userId);
  if (oldWorldId) {
    const oldPosition = deps.loadPlayerPosition(userId);
    if (oldPosition && oldPosition.world_id === String(oldWorldId)) {
      deps.deletePlayerPosition(userId);
      deps.deletePlayerHeartbeat(userId);
      deps.deletePlayerMoveLease(userId);
      deps.sendWorldScopedStreamEvent(String(oldWorldId), "player_moved", {
        player_id: userId,
        leaving: true,
        switched_world: true,
        target_world_id: String(targetWorldId),
      });
      deps.sendGlobalPresenceEvent(
        "left",
        userId,
        String(oldWorldId),
        deps.getEffectiveNick(userId),
        Number(oldPosition.ts || 0) || Date.now(),
        Date.now(),
      );
    }
  }

  deps.savePlayerWorld(userId, String(targetWorldId));
  if (
    spawnPosition &&
    Number.isFinite(Number(spawnPosition.row)) &&
    Number.isFinite(Number(spawnPosition.col))
  ) {
    deps.savePlayerPosition(userId, String(targetWorldId), {
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
  deps.deletePlayerMoveLease(userId);
  deps.deleteOnlinePresence(userId);
}

export function switchUserToNewWorld(
  userId: string,
  worldType: string,
  deps: NewWorldDeps,
): { ok: boolean } {
  const createdWorld = deps.createWorldOfType(worldType);
  deps.switchUserWorld(userId, createdWorld.world_id);
  return { ok: true };
}

export function switchUserToStartWorld(
  userId: string,
  oakWorldId: string,
  worldTypeForest: string,
  deps: StartWorldDeps,
): { ok: boolean } {
  deps.saveWorldType(oakWorldId, worldTypeForest);
  deps.switchUserWorld(
    userId,
    oakWorldId,
    deps.getDefaultSpawnPosition(oakWorldId, userId),
  );
  return { ok: true };
}
