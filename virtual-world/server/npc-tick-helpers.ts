import { getLivingClass } from "./living-registry.ts";
import { DEFAULT_NPC_BEHAVIOR } from "./runtime-config.ts";
import {
  WORLD_TILE_GROUND,
  WORLD_TILE_PINE_TREE,
  createLivingSlotsFromDefinitions,
  isWorldTileWalkable,
  LivingState,
  normalizeLivingState,
  resolveNPCDisplayName,
  worldTileValueForName,
} from "./world-domain.ts";
import {
  isReservedTile,
  RESERVATION_BLOCK_PLANT,
  RESERVATION_PROTECT_LANDMARK,
} from "./world-reservations.ts";

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

/**
 * The per-tick odds this NPC acts on, from its living class, falling back to
 * DEFAULT_NPC_BEHAVIOR for anything the class leaves out. These were four
 * literals inline below, identical for every class — a wolf idled exactly as
 * often as a chicken.
 * @returns every field resolved to a number
 */
function npcBehavior(npc: any): {
  idleChance: number;
  pickUpChance: number;
  dropChance: number;
  forageChance: number;
  // Absent means unleashed — see LivingClassRecord.behavior.roamRadius.
  roamRadius: number | null;
  movement: string;
  fleeRadius: number;
} {
  const cls = getLivingClass(String((npc && npc.class_id) || ""));
  const configured = (cls && cls.behavior) || {};
  function pick(value: unknown, fallback: number): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }
  const roam = Number(configured.roamRadius);
  return {
    idleChance: pick(configured.idleChance, DEFAULT_NPC_BEHAVIOR.idleChance),
    pickUpChance: pick(
      configured.pickUpChance,
      DEFAULT_NPC_BEHAVIOR.pickUpChance,
    ),
    dropChance: pick(configured.dropChance, DEFAULT_NPC_BEHAVIOR.dropChance),
    forageChance: pick(
      configured.forageChance,
      DEFAULT_NPC_BEHAVIOR.forageChance,
    ),
    roamRadius: Number.isFinite(roam) && roam >= 0 ? Math.floor(roam) : null,
    movement: String(configured.movement || DEFAULT_NPC_BEHAVIOR.movement),
    fleeRadius: pick(configured.fleeRadius, DEFAULT_NPC_BEHAVIOR.fleeRadius),
  };
}

// Two metrics, deliberately. Chebyshev measures the leash, because a radius
// in this game is a square (isWithinTileDistance everywhere else agrees).
// Manhattan orders the steps, because a living moves only orthogonally: under
// Chebyshev a row step while the column difference dominates changes nothing,
// so the greedy walk hits a plateau of equally-good moves and paces between
// two tiles forever instead of coming home.
function chebyshev(
  rowA: number,
  colA: number,
  rowB: number,
  colB: number,
): number {
  return Math.max(Math.abs(rowA - rowB), Math.abs(colA - colB));
}

function manhattan(
  rowA: number,
  colA: number,
  rowB: number,
  colB: number,
): number {
  return Math.abs(rowA - rowB) + Math.abs(colA - colB);
}

/**
 * The tile a leashed living belongs on, or null when it has no home — an NPC
 * from before homes were recorded, which simply wanders as it always did.
 */
function npcHome(npc: any): { row: number; col: number } | null {
  const row = Number(npc && npc.home_row);
  const col = Number(npc && npc.home_col);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  return { row: row, col: col };
}

/**
 * The nearest player within `radius`, or null. Reads the tile keys the tick
 * already built rather than taking a second copy of the player list.
 */
function nearestPlayerWithin(
  occupiedPlayers: Record<string, boolean>,
  row: number,
  col: number,
  radius: number,
): { row: number; col: number } | null {
  let best: { row: number; col: number } | null = null;
  let bestDistance = radius + 1;
  const keys = Object.keys(occupiedPlayers);
  for (let i = 0; i < keys.length; i++) {
    const parts = keys[i].split("_");
    const pr = Number(parts[0]);
    const pc = Number(parts[1]);
    if (!Number.isFinite(pr) || !Number.isFinite(pc)) continue;
    const distance = chebyshev(pr, pc, row, col);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { row: pr, col: pc };
    }
  }
  return best;
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
  sendWorldScopedStreamEvent: (
    worldId: string,
    eventType: string,
    payload: any,
  ) => void;
}): boolean {
  const n = params.npc;
  const behavior = npcBehavior(n);
  const home = npcHome(n);

  // A living leashed to a post but standing outside it walks back, and one
  // fleeing does not dawdle — in both cases the step it wants is the whole
  // point, so the idle roll is skipped.
  const leashed = behavior.roamRadius !== null && !!home;
  const strayed =
    leashed &&
    chebyshev(n.row, n.col, home!.row, home!.col) > behavior.roamRadius!;
  const threat =
    behavior.movement === "flee"
      ? nearestPlayerWithin(
          params.occupiedPlayers,
          n.row,
          n.col,
          behavior.fleeRadius,
        )
      : null;
  if (!strayed && !threat && Math.random() < behavior.idleChance) {
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

  // The recipe below is unchanged — try each direction, take the first tile
  // that can be stood on. What a policy changes is only which directions are
  // offered and in what order, so a new one is a comparator rather than
  // another copy of the walk.
  if (strayed) {
    // Home first: nearest-to-home ordering, which is a greedy walk back.
    dirs.sort(function (a, b) {
      return (
        manhattan(n.row + a.dr, n.col + a.dc, home!.row, home!.col) -
        manhattan(n.row + b.dr, n.col + b.dc, home!.row, home!.col)
      );
    });
  } else if (threat) {
    // Away from the nearest player, furthest first.
    dirs.sort(function (a, b) {
      return (
        manhattan(n.row + b.dr, n.col + b.dc, threat.row, threat.col) -
        manhattan(n.row + a.dr, n.col + a.dc, threat.row, threat.col)
      );
    });
  }

  let moved = false;
  const fromKey = n.row + "_" + n.col;
  delete params.occupiedNPCs[fromKey];

  for (let i = 0; i < dirs.length; i++) {
    const nr = n.row + dirs[i].dr;
    const nc = n.col + dirs[i].dc;
    const key = nr + "_" + nc;
    // Ask the tile registry whether the square can be stood on, rather than
    // testing for tile value 0. That literal meant "ground", so an NPC in any
    // world whose floor is not plain ground — a cave (cave_floor), a house
    // interior (wood_floor), an island beach (sand) — found every neighbour
    // unwalkable and stood still forever. Pursuit and fighting already used
    // this helper, which is why only idle wandering was affected.
    const walkable =
      nr >= 0 &&
      nr < params.rows &&
      nc >= 0 &&
      nc < params.cols &&
      isWorldTileWalkable(params.map[nr][nc]);
    if (!walkable) continue;
    if (params.occupiedPlayers[key]) continue;
    if (params.occupiedNPCs[key]) continue;
    // The leash. Not applied while strayed: outside its radius every step
    // fails this test, and a living that cannot step cannot come home.
    if (
      leashed &&
      !strayed &&
      chebyshev(nr, nc, home!.row, home!.col) > behavior.roamRadius!
    ) {
      continue;
    }

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
      display_name: resolveNPCDisplayName(params.worldId, params.npcId, n),
      // Saves the stream layer a full world load to answer "which class is
      // this?" — see getLivingClassForPublicEvent in stream-broadcast.ts.
      class_id: n.class_id,
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

  const behavior = npcBehavior(n);
  if (pickableItems.length > 0 && Math.random() < behavior.pickUpChance) {
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

  if (Math.random() < behavior.dropChance) {
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
  directionToRotation: (dr: number, dc: number) => number;
  sendWorldScopedStreamEvent: (
    worldId: string,
    eventType: string,
    payload: any,
  ) => void;
}): { hasChanges: boolean; treeChanges: boolean } {
  const n = params.npc;
  const npcTreeActions = params.getInventoryTreeActions(n);
  if (
    npcTreeActions.length === 0 ||
    Math.random() >= npcBehavior(n).forageChance
  ) {
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
      if (
        isReservedTile(params.worldId, tr, tc, RESERVATION_PROTECT_LANDMARK)
      ) {
        continue;
      }
      const hasPlantedTree =
        params.trees[treeKey] && params.trees[treeKey].action === "plant";
      const baseHasTree =
        params.map[tr][tc] === worldTileValueForName(WORLD_TILE_PINE_TREE);
      const alreadyCut =
        params.trees[treeKey] && params.trees[treeKey].action === "cut";
      if ((hasPlantedTree || baseHasTree) && !alreadyCut) {
        params.trees[treeKey] = {
          action: "cut",
          cut_by: params.npcId,
          timestamp: params.now,
        };
        params.map[tr][tc] = worldTileValueForName(WORLD_TILE_GROUND);
        n.rotation = params.directionToRotation(
          treeDirs[td].dr,
          treeDirs[td].dc,
        );
        didTreeAction = true;
        params.sendWorldScopedStreamEvent(
          String(params.worldId),
          "world_mod_changed",
          {
            action: "cut",
            row: tr,
            col: tc,
            actor_type: "npc",
            actor_id: params.npcId,
            source_kind: "tree",
            tile_type: WORLD_TILE_GROUND,
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
      // Planting still wants bare ground specifically, not merely a walkable
      // square — a sapling does not go into a cave floor or a plank floor.
      const groundWalkable =
        params.map[tr][tc] === worldTileValueForName(WORLD_TILE_GROUND);
      if (
        groundWalkable &&
        !hasExistingTree &&
        !isReservedTile(params.worldId, tr, tc, RESERVATION_BLOCK_PLANT)
      ) {
        params.trees[treeKey] = {
          action: "plant",
          planted_by: params.npcId,
          timestamp: params.now,
        };
        if (
          wasTreeCut ||
          params.map[tr][tc] === worldTileValueForName(WORLD_TILE_GROUND)
        ) {
          params.map[tr][tc] = worldTileValueForName(WORLD_TILE_PINE_TREE);
        }
        n.rotation = params.directionToRotation(
          treeDirs[td].dr,
          treeDirs[td].dc,
        );
        didTreeAction = true;
        params.sendWorldScopedStreamEvent(
          String(params.worldId),
          "world_mod_changed",
          {
            action: "plant",
            row: tr,
            col: tc,
            actor_type: "npc",
            actor_id: params.npcId,
            source_kind: "tree",
            tile_type: WORLD_TILE_PINE_TREE,
          },
        );
        return { hasChanges: true, treeChanges: true };
      }
    }
  }

  return { hasChanges: false, treeChanges: false };
}
