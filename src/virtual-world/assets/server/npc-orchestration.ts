import { LivingState } from "./world-domain.ts";

type TickWorldDeps = {
  ensureWorldItems: (worldId: string) => void;
  ensureWorldNPCs: (worldId: string) => Record<string, any>;
  getEffectiveMap: (worldId: string) => number[][];
  loadWorldTrees: (worldId: string) => Record<string, any>;
  loadWorldItems: (worldId: string) => Record<string, any[]>;
  loadWorldPlayers: (worldId: string) => any;
  buildOccupiedPlayerMap: (players: any) => Record<string, any>;
  buildOccupiedNPCMap: (npcs: Record<string, any>) => Record<string, any>;
  normalizeNPCInventoryState: (npc: any) => void;
  tickNPCMovement: (args: any) => boolean;
  tickNPCItemInteractions: (args: any) => {
    hasChanges: boolean;
    itemChanges: boolean;
  };
  tickNPCTreeActions: (args: any) => {
    hasChanges: boolean;
    treeChanges: boolean;
  };
  saveWorldNPCs: (worldId: string, npcs: Record<string, any>) => void;
  saveWorldItems: (worldId: string, items: Record<string, any[]>) => void;
  saveWorldTrees: (worldId: string, trees: Record<string, any>) => void;
  vwLog: (msg: string, obj?: unknown) => void;
  isPickableWorldItem: (item: any) => boolean;
  deleteWorldItems: (items: any[]) => void;
  upsertWorldItem: (
    worldId: string,
    row: number,
    col: number,
    item: any,
  ) => void;
  broadcastItemChange: (
    worldId: string,
    actorType: string,
    actorId: string,
    action: string,
    row: number,
    col: number,
    items: any[],
  ) => void;
  ROWS: number;
  COLS: number;
  shuffleDirections: (dirs: any[]) => void;
  directionToRotation: (...args: any[]) => number;
  getNPCDisplayName: (...args: any[]) => string;
  sendWorldScopedStreamEvent: (
    worldId: string,
    eventType: string,
    payload: any,
  ) => void;
  getInventoryTreeActions: (inventory: LivingState) => string[];
  isOakCenterTile: (worldId: string, row: number, col: number) => boolean;
  isOakClearingTile: (worldId: string, row: number, col: number) => boolean;
};

type TickLeaseDeps = {
  parseWorldDbResult: (raw: string) => any;
  acquireLease: (
    tableName: string,
    leaseId: string,
    ownerId: string,
    ttlMs: number,
  ) => string;
  VWORLD_NPC_TICK_LEASE_TABLE: string;
  npcTickOwnerId: string;
  NPC_TICK_LEASE_MS: number;
  vwLog: (msg: string, obj?: unknown) => void;
};

type TryTickDeps = TickWorldDeps &
  TickLeaseDeps & {
    loadNPCLastTick: (worldId: string) => number;
    saveNPCLastTick: (worldId: string, ts: number) => void;
    NPC_TICK_MS: number;
  };

type RunTickDeps = TryTickDeps & {
  loadNPCActiveWorlds: () => Record<string, number>;
  saveNPCActiveWorlds: (worlds: Record<string, number>) => void;
  deleteWorldRowsWhere: (tableName: string, filterJson: string) => void;
  NPC_ACTIVE_WORLD_TTL_MS: number;
  VWORLD_NPC_TABLE: string;
  VWORLD_NPC_TICK_TABLE: string;
};

type SchedulerDeps = {
  schedulerService: {
    registerRecurring: (args: {
      handler: string;
      intervalMilliseconds: number;
      name: string;
    }) => void;
  };
  NPC_TICK_MS: number;
  vwLog: (msg: string, obj?: unknown) => void;
};

export function tickWorldNPCs(
  worldId: string,
  now: number,
  deps: TickWorldDeps,
): void {
  deps.ensureWorldItems(worldId);
  const npcs = deps.ensureWorldNPCs(worldId);
  const npcIds = Object.keys(npcs);
  if (npcIds.length === 0) {
    return;
  }

  const map = deps.getEffectiveMap(worldId);
  const trees = deps.loadWorldTrees(worldId);
  const worldItems = deps.loadWorldItems(worldId);
  let itemChanges = false;
  let treeChanges = false;
  const players = deps.loadWorldPlayers(worldId);
  const occupiedPlayers = deps.buildOccupiedPlayerMap(players);
  const occupiedNPCs = deps.buildOccupiedNPCMap(npcs);

  let hasChanges = false;
  npcIds.forEach(function (npcId) {
    const npc = npcs[npcId];
    if (!npc) {
      return;
    }
    deps.normalizeNPCInventoryState(npc);

    if (
      deps.tickNPCMovement({
        worldId: worldId,
        npcId: npcId,
        npc: npc,
        now: now,
        map: map,
        occupiedPlayers: occupiedPlayers,
        occupiedNPCs: occupiedNPCs,
        rows: deps.ROWS,
        cols: deps.COLS,
        shuffleDirections: deps.shuffleDirections,
        directionToRotation: deps.directionToRotation,
        getNPCDisplayName: deps.getNPCDisplayName,
        sendWorldScopedStreamEvent: deps.sendWorldScopedStreamEvent,
      })
    ) {
      hasChanges = true;
    }

    const itemResult = deps.tickNPCItemInteractions({
      worldId: worldId,
      npcId: npcId,
      npc: npc,
      worldItems: worldItems,
      isPickableWorldItem: deps.isPickableWorldItem,
      deleteWorldItems: deps.deleteWorldItems,
      upsertWorldItem: deps.upsertWorldItem,
      broadcastItemChange: deps.broadcastItemChange,
    });
    if (itemResult.hasChanges) {
      hasChanges = true;
    }
    if (itemResult.itemChanges) {
      itemChanges = true;
    }

    const treeResult = deps.tickNPCTreeActions({
      worldId: worldId,
      npcId: npcId,
      npc: npc,
      now: now,
      map: map,
      trees: trees,
      rows: deps.ROWS,
      cols: deps.COLS,
      shuffleDirections: deps.shuffleDirections,
      getInventoryTreeActions: deps.getInventoryTreeActions,
      isOakCenterTile: deps.isOakCenterTile,
      isOakClearingTile: deps.isOakClearingTile,
      directionToRotation: deps.directionToRotation,
      sendWorldScopedStreamEvent: deps.sendWorldScopedStreamEvent,
    });
    if (treeResult.hasChanges) {
      hasChanges = true;
    }
    if (treeResult.treeChanges) {
      treeChanges = true;
    }
  });

  if (hasChanges) {
    deps.saveWorldNPCs(worldId, npcs);
    deps.vwLog("npc tick moved", {
      world_id: worldId,
      npc_count: npcIds.length,
    });
  }
  if (itemChanges) {
    // Item interactions persist through per-item delete/upsert operations.
    // Avoid full snapshot writes here to prevent stale-state resurrection
    // across multi-instance runtimes.
  }
  if (treeChanges) {
    deps.saveWorldTrees(worldId, trees);
  }
}

export function tryAcquireNPCTickLease(
  worldId: string,
  deps: TickLeaseDeps,
): boolean {
  const result = deps.parseWorldDbResult(
    deps.acquireLease(
      deps.VWORLD_NPC_TICK_LEASE_TABLE,
      "npc_tick:" + String(worldId),
      deps.npcTickOwnerId,
      deps.NPC_TICK_LEASE_MS,
    ),
  );
  if (!result || result.error) {
    deps.vwLog("npc tick lease acquisition failed", {
      world_id: worldId,
      error: String(result && result.error ? result.error : "unknown"),
    });
    return false;
  }
  return !!(result.acquired && result.owner === deps.npcTickOwnerId);
}

export function tryTickWorldNPCs(
  worldId: string,
  now: number,
  deps: TryTickDeps,
): boolean {
  let lastTick = deps.loadNPCLastTick(worldId);
  if (now - lastTick < deps.NPC_TICK_MS) {
    return false;
  }
  if (!tryAcquireNPCTickLease(worldId, deps)) {
    return false;
  }

  lastTick = deps.loadNPCLastTick(worldId);
  if (now - lastTick < deps.NPC_TICK_MS) {
    return false;
  }

  tickWorldNPCs(worldId, now, deps);
  deps.saveNPCLastTick(worldId, now);
  return true;
}

export function runNPCTick(deps: RunTickDeps): void {
  const worlds = deps.loadNPCActiveWorlds();
  const now = Date.now();
  let changedWorldSet = false;

  Object.keys(worlds).forEach(function (worldId) {
    if (now - Number(worlds[worldId] || 0) > deps.NPC_ACTIVE_WORLD_TTL_MS) {
      delete worlds[worldId];
      deps.deleteWorldRowsWhere(
        deps.VWORLD_NPC_TABLE,
        JSON.stringify({ world_id: String(worldId) }),
      );
      deps.deleteWorldRowsWhere(
        deps.VWORLD_NPC_TICK_TABLE,
        JSON.stringify({ world_id: String(worldId) }),
      );
      changedWorldSet = true;
      return;
    }
    tryTickWorldNPCs(worldId, now, deps);
  });

  if (changedWorldSet) {
    deps.saveNPCActiveWorlds(worlds);
  }
}

export function maybeTickWorldNPCs(worldId: string, deps: TryTickDeps): void {
  tryTickWorldNPCs(worldId, Date.now(), deps);
}

export function registerRecurringNPCTick(deps: SchedulerDeps): void {
  try {
    deps.schedulerService.registerRecurring({
      handler: "runNPCTickScheduledJob",
      intervalMilliseconds: deps.NPC_TICK_MS,
      name: "vworld-npc-tick",
    });
  } catch (e) {
    deps.vwLog("npc scheduler registerRecurring failed", {
      error: String(e),
    });
  }
}
