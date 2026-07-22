import { vwLog } from "./diagnostics.ts";
import { isPickableWorldItem } from "./item-registry.ts";
import {
  deleteWorldItems,
  ensureWorldItems,
  loadWorldItems,
  upsertWorldItem,
} from "./item-storage.ts";
import {
  ensureWorldNPCs,
  loadNPCActiveWorlds,
  loadNPCLastTick,
  saveNPCActiveWorlds,
  saveNPCLastTick,
  saveWorldNPCs,
  buildWorldNPCSnapshot,
  markNPCWorldActive,
} from "./npc-storage.ts";
import {
  buildOccupiedNPCMap,
  buildOccupiedPlayerMap,
  normalizeNPCInventoryState,
  tickNPCItemInteractions,
  tickNPCMovement,
  tickNPCTreeActions,
} from "./npc-tick-helpers.ts";
import { loadWorldPlayers } from "./player-snapshots.ts";
import {
  FATIGUE_RECOVERY_PER_SECOND,
  NPC_ACTIVE_WORLD_TTL_MS,
  NPC_TICK_LEASE_MS,
  NPC_TICK_MS,
  VWORLD_NPC_TABLE,
  VWORLD_NPC_TICK_LEASE_TABLE,
  VWORLD_NPC_TICK_TABLE,
} from "./runtime-config.ts";
import { resolvePendingActionsForWorld } from "./tree-action-helpers.ts";
import {
  broadcastItemChange,
  broadcastNPCValuesChanged,
  sendWorldScopedStreamEvent,
} from "./stream-broadcast.ts";
import { getEffectiveMap } from "./world-bootstrap.ts";
import {
  deleteWorldRowsWhere,
  parseWorldDbResult,
  runInWorldTransaction,
} from "./world-db.ts";
import {
  getInventoryTreeActions,
  getNPCDisplayName,
  isOakCenterTile,
  isOakClearingTile,
} from "./world-domain.ts";
import { loadWorldTrees, saveWorldTrees } from "./world-mod-storage.ts";
import { LivingState } from "./world-domain.ts";

const npcTickOwnerId =
  "npc-tick-" +
  Date.now().toString(36) +
  "-" +
  Math.random().toString(36).slice(2);

function directionToRotation(dr: number, dc: number): number {
  if (dr > 0) return 0;
  if (dr < 0) return Math.PI;
  if (dc > 0) return Math.PI / 2;
  if (dc < 0) return -Math.PI / 2;
  return 0;
}

function shuffleDirections(dirs: Array<{ dr: number; dc: number }>): void {
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = dirs[i];
    dirs[i] = dirs[j];
    dirs[j] = t;
  }
}

export function tickWorldNPCs(
  worldId: string,
  now: number,
  elapsedMs: number,
): void {
  ensureWorldItems(worldId);
  const npcs = ensureWorldNPCs(worldId);
  const npcIds = Object.keys(npcs);
  if (npcIds.length === 0) {
    return;
  }

  const map = getEffectiveMap(worldId);
  const mapRows = map.length;
  const mapCols = map[0] ? map[0].length : 0;
  const trees = loadWorldTrees(worldId);
  const worldItems = loadWorldItems(worldId);
  let itemChanges = false;
  let treeChanges = false;
  const players = loadWorldPlayers(worldId);
  const occupiedPlayers = buildOccupiedPlayerMap(players);
  const occupiedNPCs = buildOccupiedNPCMap(npcs);

  let hasChanges = false;
  npcIds.forEach(function (npcId) {
    const npc = npcs[npcId];
    if (!npc) {
      return;
    }
    normalizeNPCInventoryState(npc);

    const npcMoved = tickNPCMovement({
      worldId: worldId,
      npcId: npcId,
      npc: npc,
      now: now,
      map: map,
      occupiedPlayers: occupiedPlayers,
      occupiedNPCs: occupiedNPCs,
      rows: mapRows,
      cols: mapCols,
      shuffleDirections: shuffleDirections,
      directionToRotation: directionToRotation,
      getNPCDisplayName: getNPCDisplayName,
      sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
    });
    if (npcMoved) {
      hasChanges = true;
    } else {
      // Idled this tick (no step taken): recover fatigue instead of the
      // per-step gain movement would have applied. Recovery is scaled by
      // actual elapsed time (not a flat per-tick amount) so idle recovery
      // pacing matches players' heartbeat-driven recovery in http-handler-helpers.ts.
      const fatigueBeforeTick = Number(npc.values.fatigue || 0);
      const fatigueAfterTick = Math.max(
        0,
        fatigueBeforeTick - (elapsedMs / 1000) * FATIGUE_RECOVERY_PER_SECOND,
      );
      if (fatigueAfterTick !== fatigueBeforeTick) {
        npc.values.fatigue = fatigueAfterTick;
        hasChanges = true;
        broadcastNPCValuesChanged(worldId, npcId, npc.values);
      }
    }

    const itemResult = tickNPCItemInteractions({
      worldId: worldId,
      npcId: npcId,
      npc: npc,
      worldItems: worldItems,
      isPickableWorldItem: isPickableWorldItem,
      deleteWorldItems: deleteWorldItems,
      upsertWorldItem: upsertWorldItem,
      broadcastItemChange: broadcastItemChange,
    });
    if (itemResult.hasChanges) {
      hasChanges = true;
    }
    if (itemResult.itemChanges) {
      itemChanges = true;
    }

    const treeResult = tickNPCTreeActions({
      worldId: worldId,
      npcId: npcId,
      npc: npc,
      now: now,
      map: map,
      trees: trees,
      rows: mapRows,
      cols: mapCols,
      shuffleDirections: shuffleDirections,
      getInventoryTreeActions: getInventoryTreeActions,
      isOakCenterTile: isOakCenterTile,
      isOakClearingTile: isOakClearingTile,
      directionToRotation: directionToRotation,
      sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
    });
    if (treeResult.hasChanges) {
      hasChanges = true;
    }
    if (treeResult.treeChanges) {
      treeChanges = true;
    }
  });

  if (hasChanges) {
    saveWorldNPCs(worldId, npcs);
    vwLog("npc tick moved", {
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
    saveWorldTrees(worldId, trees);
  }
}

export function tryAcquireNPCTickLease(worldId: string): boolean {
  const result = parseWorldDbResult(
    database.acquireLease(
      VWORLD_NPC_TICK_LEASE_TABLE,
      "npc_tick:" + String(worldId),
      npcTickOwnerId,
      NPC_TICK_LEASE_MS,
    ),
  );
  if (!result || result.error) {
    vwLog("npc tick lease acquisition failed", {
      world_id: worldId,
      error: String(result && result.error ? result.error : "unknown"),
    });
    return false;
  }
  return !!(result.acquired && result.owner === npcTickOwnerId);
}

export function tryTickWorldNPCs(worldId: string, now: number): boolean {
  let lastTick = loadNPCLastTick(worldId);
  if (now - lastTick < NPC_TICK_MS) {
    return false;
  }
  if (!tryAcquireNPCTickLease(worldId)) {
    return false;
  }

  lastTick = loadNPCLastTick(worldId);
  if (now - lastTick < NPC_TICK_MS) {
    return false;
  }

  // The lease was acquired outside the transaction on purpose: its
  // visibility to other instances must not wait for this tick's commit.
  runInWorldTransaction("npc_tick:" + String(worldId), function () {
    tickWorldNPCs(worldId, now, now - lastTick);
  });
  saveNPCLastTick(worldId, now);
  // Reuses this same lease-guarded, cadence-gated tick to also resolve any
  // durationMs player actions that have come due for this world.
  resolvePendingActionsForWorld(worldId, now);
  return true;
}

export function runNPCTick(): void {
  const worlds = loadNPCActiveWorlds();
  const now = Date.now();
  let changedWorldSet = false;

  Object.keys(worlds).forEach(function (worldId) {
    if (now - Number(worlds[worldId] || 0) > NPC_ACTIVE_WORLD_TTL_MS) {
      delete worlds[worldId];
      deleteWorldRowsWhere(
        VWORLD_NPC_TABLE,
        JSON.stringify({ world_id: String(worldId) }),
      );
      deleteWorldRowsWhere(
        VWORLD_NPC_TICK_TABLE,
        JSON.stringify({ world_id: String(worldId) }),
      );
      changedWorldSet = true;
      return;
    }
    tryTickWorldNPCs(worldId, now);
  });

  if (changedWorldSet) {
    saveNPCActiveWorlds(worlds);
  }
}

export function maybeTickWorldNPCs(worldId: string): void {
  tryTickWorldNPCs(worldId, Date.now());
}

export function registerRecurringNPCTick(): void {
  try {
    schedulerService.registerRecurring({
      handler: "runNPCTickScheduledJob",
      intervalMilliseconds: NPC_TICK_MS,
      name: "vworld-npc-tick",
    });
  } catch (e) {
    vwLog("npc scheduler registerRecurring failed", {
      error: String(e),
    });
  }
}

export function getWorldNPCSnapshot(worldId: string): Array<{
  npc_id: string;
  row: number;
  col: number;
  seq: number;
  rotation: number;
  state: string;
  left_hand: string;
  right_hand: string;
  inventory_count: number;
}> {
  markNPCWorldActive(worldId);
  maybeTickWorldNPCs(worldId);
  const npcs = ensureWorldNPCs(worldId);
  return buildWorldNPCSnapshot(worldId, npcs, getNPCDisplayName);
}
