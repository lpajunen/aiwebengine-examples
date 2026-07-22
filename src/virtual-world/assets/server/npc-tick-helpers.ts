import { getLivingClass } from "./living-registry.ts";
import {
  createLivingSlotsFromDefinitions,
  LivingState,
  normalizeLivingState,
} from "./world-domain.ts";

function ensureNPCSlotsAndBag(npc: any): {
  slots: Record<string, any>;
  bag: any[];
} {
  if (!npc.slots || typeof npc.slots !== "object") {
    const livingClass = getLivingClass(String(npc.class_id || ""));
    npc.slots = livingClass
      ? createLivingSlotsFromDefinitions(livingClass.slotDefinitions)
      : {};
  }
  if (!Array.isArray(npc.bag)) {
    npc.bag = [];
  }
  return { slots: npc.slots, bag: npc.bag };
}

function getOrderedSlotIds(slots: Record<string, any>): string[] {
  return Object.keys(slots || {}).sort();
}

function takeFirstOccupiedSlotItem(slots: Record<string, any>): {
  item: any;
  slotId: string;
} | null {
  const slotIds = getOrderedSlotIds(slots);
  for (let i = 0; i < slotIds.length; i++) {
    const slotId = slotIds[i];
    if (!slots[slotId]) continue;
    const item = slots[slotId];
    slots[slotId] = null;
    return { item: item, slotId: slotId };
  }
  return null;
}

export function buildOccupiedPlayerMap(
  players: Record<string, any>,
): Record<string, boolean> {
  const occupiedPlayers: Record<string, boolean> = {};
  Object.keys(players).forEach(function (pid) {
    const p = players[pid];
    if (
      !p ||
      !Number.isFinite(Number(p.row)) ||
      !Number.isFinite(Number(p.col))
    )
      return;
    occupiedPlayers[p.row + "_" + p.col] = true;
  });
  return occupiedPlayers;
}

export function buildOccupiedNPCMap(
  npcs: Record<string, any>,
): Record<string, string> {
  const occupiedNPCs: Record<string, string> = {};
  Object.keys(npcs).forEach(function (npcId) {
    const n = npcs[npcId];
    if (!n) return;
    occupiedNPCs[n.row + "_" + n.col] = npcId;
  });
  return occupiedNPCs;
}

export function normalizeNPCInventoryState(npc: any): void {
  ensureNPCSlotsAndBag(npc);
  const livingClass = getLivingClass(String(npc.class_id || ""));
  if (!livingClass) return;
  const living = normalizeLivingState(npc, livingClass);
  npc.slots = living.slots;
  npc.bag = living.bag;
  npc.values = living.values;
}

export function tickNPCMovement(params: {
  worldId: string;
  npcId: string;
  npc: any;
  now: number;
  map: number[][];
  occupiedPlayers: Record<string, boolean>;
  occupiedNPCs: Record<string, string>;
  rows: number;
  cols: number;
  shuffleDirections: (dirs: Array<{ dr: number; dc: number }>) => void;
  directionToRotation: (dr: number, dc: number) => number;
  getNPCDisplayName: (worldId: string, npcId: string) => string;
  sendWorldScopedStreamEvent: (
    worldId: string,
    eventType: string,
    payload: any,
  ) => void;
}): boolean {
  const n = params.npc;
  if (Math.random() < 0.35) {
    n.state = "idle";
    n.ts = params.now;
    return false;
  }

  const dirs = [
    { dr: 1, dc: 0 },
    { dr: -1, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 0, dc: -1 },
  ];
  params.shuffleDirections(dirs);

  let moved = false;
  const fromKey = n.row + "_" + n.col;
  delete params.occupiedNPCs[fromKey];

  for (let i = 0; i < dirs.length; i++) {
    const nr = n.row + dirs[i].dr;
    const nc = n.col + dirs[i].dc;
    const key = nr + "_" + nc;
    const walkable =
      nr >= 0 &&
      nr < params.rows &&
      nc >= 0 &&
      nc < params.cols &&
      params.map[nr][nc] === 0;
    if (!walkable) continue;
    if (params.occupiedPlayers[key]) continue;
    if (params.occupiedNPCs[key]) continue;

    n.row = nr;
    n.col = nc;
    n.rotation = params.directionToRotation(dirs[i].dr, dirs[i].dc);
    n.seq = Number(n.seq || 0) + 1;
    n.state = "walking";
    n.ts = params.now;
    if (n.values && typeof n.values === "object") {
      n.values.fatigue = Math.max(0, Number(n.values.fatigue || 0) + 1);
    }
    moved = true;
    params.occupiedNPCs[key] = params.npcId;

    params.sendWorldScopedStreamEvent(String(params.worldId), "npc_moved", {
      npc_id: params.npcId,
      display_name: params.getNPCDisplayName(params.worldId, params.npcId),
      row: n.row,
      col: n.col,
      seq: n.seq,
      rotation: n.rotation,
      state: n.state,
      values: n.values,
    });
    break;
  }

  if (!moved) {
    params.occupiedNPCs[fromKey] = params.npcId;
    n.state = "idle";
    n.ts = params.now;
  }

  return moved;
}

export function tickNPCItemInteractions(params: {
  worldId: string;
  npcId: string;
  npc: any;
  worldItems: Record<string, any[]>;
  isPickableWorldItem: (item: any) => boolean;
  deleteWorldItems: (items: any[]) => any[];
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
}): { hasChanges: boolean; itemChanges: boolean } {
  const n = params.npc;
  const tileKey = n.row + "_" + n.col;
  const allNpcTileItems = Array.isArray(params.worldItems[tileKey])
    ? params.worldItems[tileKey]
    : [];
  const pickableItems = allNpcTileItems.filter(function (item) {
    return params.isPickableWorldItem(item);
  });

  let hasChanges = false;
  let itemChanges = false;
  const living = ensureNPCSlotsAndBag(n);

  if (pickableItems.length > 0 && Math.random() < 0.65) {
    // Claim by delete: only grant items whose rows this tick actually
    // removed, so racing players/instances cannot dupe them.
    const claimed = params.deleteWorldItems(pickableItems);
    if (claimed.length > 0) {
      const claimedIds: Record<string, boolean> = {};
      for (let pickIdx = 0; pickIdx < claimed.length; pickIdx++) {
        living.bag.push(claimed[pickIdx]);
        claimedIds[String(claimed[pickIdx].id)] = true;
      }
      const remainingItems = allNpcTileItems.filter(function (item) {
        return item && !claimedIds[String(item.id)];
      });
      if (remainingItems.length > 0) {
        params.worldItems[tileKey] = remainingItems;
      } else {
        delete params.worldItems[tileKey];
      }
      itemChanges = true;
      hasChanges = true;
      params.broadcastItemChange(
        params.worldId,
        "npc",
        params.npcId,
        "pick",
        n.row,
        n.col,
        claimed,
      );
    }
  }

  const slotIds = getOrderedSlotIds(living.slots);
  for (let i = 0; i < slotIds.length; i++) {
    const slotId = slotIds[i];
    if (living.slots[slotId]) continue;
    if (living.bag.length <= 0) break;
    living.slots[slotId] = living.bag.shift();
    hasChanges = true;
  }

  if (Math.random() < 0.12) {
    let dropItem = null;
    if (living.bag.length > 0) {
      dropItem = living.bag.shift();
    } else {
      const slotDrop = takeFirstOccupiedSlotItem(living.slots);
      if (slotDrop) dropItem = slotDrop.item;
    }
    if (dropItem) {
      if (!params.worldItems[tileKey]) params.worldItems[tileKey] = [];
      params.worldItems[tileKey].push(dropItem);
      params.upsertWorldItem(params.worldId, n.row, n.col, dropItem);
      itemChanges = true;
      hasChanges = true;
      params.broadcastItemChange(
        params.worldId,
        "npc",
        params.npcId,
        "drop",
        n.row,
        n.col,
        [dropItem],
      );
    }
  }

  return { hasChanges, itemChanges };
}

export function tickNPCTreeActions(params: {
  worldId: string;
  npcId: string;
  npc: any;
  now: number;
  map: number[][];
  trees: Record<string, any>;
  rows: number;
  cols: number;
  shuffleDirections: (dirs: Array<{ dr: number; dc: number }>) => void;
  getInventoryTreeActions: (inventory: LivingState) => string[];
  isOakCenterTile: (worldId: string, row: number, col: number) => boolean;
  isOakClearingTile: (worldId: string, row: number, col: number) => boolean;
  directionToRotation: (dr: number, dc: number) => number;
  sendWorldScopedStreamEvent: (
    worldId: string,
    eventType: string,
    payload: any,
  ) => void;
}): { hasChanges: boolean; treeChanges: boolean } {
  const n = params.npc;
  const npcTreeActions = params.getInventoryTreeActions(n);
  if (npcTreeActions.length === 0 || Math.random() >= 0.08) {
    return { hasChanges: false, treeChanges: false };
  }

  const treeDirs = [
    { dr: 1, dc: 0 },
    { dr: -1, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 0, dc: -1 },
  ];
  params.shuffleDirections(treeDirs);
  let didTreeAction = false;

  for (let td = 0; td < treeDirs.length && !didTreeAction; td++) {
    const tr = n.row + treeDirs[td].dr;
    const tc = n.col + treeDirs[td].dc;
    if (tr < 0 || tr >= params.rows || tc < 0 || tc >= params.cols) continue;
    const treeKey = tr + "_" + tc;

    if (npcTreeActions.indexOf("cut") !== -1) {
      if (params.isOakCenterTile(params.worldId, tr, tc)) {
        continue;
      }
      const hasPlantedTree =
        params.trees[treeKey] && params.trees[treeKey].action === "plant";
      const baseHasTree = params.map[tr][tc] === 2;
      const alreadyCut =
        params.trees[treeKey] && params.trees[treeKey].action === "cut";
      if ((hasPlantedTree || baseHasTree) && !alreadyCut) {
        params.trees[treeKey] = {
          action: "cut",
          cut_by: params.npcId,
          timestamp: params.now,
        };
        params.map[tr][tc] = 0;
        n.rotation = params.directionToRotation(
          treeDirs[td].dr,
          treeDirs[td].dc,
        );
        didTreeAction = true;
        params.sendWorldScopedStreamEvent(
          String(params.worldId),
          "tree_changed",
          {
            action: "cut",
            row: tr,
            col: tc,
            actor_type: "npc",
            actor_id: params.npcId,
          },
        );
        return { hasChanges: true, treeChanges: true };
      }
    }

    if (npcTreeActions.indexOf("plant") !== -1) {
      const hasExistingTree =
        params.trees[treeKey] && params.trees[treeKey].action === "plant";
      const wasTreeCut =
        params.trees[treeKey] && params.trees[treeKey].action === "cut";
      const groundWalkable = params.map[tr][tc] === 0;
      if (
        groundWalkable &&
        !hasExistingTree &&
        !params.isOakClearingTile(params.worldId, tr, tc)
      ) {
        params.trees[treeKey] = {
          action: "plant",
          planted_by: params.npcId,
          timestamp: params.now,
        };
        if (wasTreeCut || params.map[tr][tc] === 0) params.map[tr][tc] = 2;
        n.rotation = params.directionToRotation(
          treeDirs[td].dr,
          treeDirs[td].dc,
        );
        didTreeAction = true;
        params.sendWorldScopedStreamEvent(
          String(params.worldId),
          "tree_changed",
          {
            action: "plant",
            row: tr,
            col: tc,
            actor_type: "npc",
            actor_id: params.npcId,
          },
        );
        return { hasChanges: true, treeChanges: true };
      }
    }
  }

  return { hasChanges: false, treeChanges: false };
}
