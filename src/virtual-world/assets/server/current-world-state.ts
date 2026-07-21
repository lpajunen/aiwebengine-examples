import {
  ensureWorldItems,
  flattenWorldItems,
  loadPlayerInventory,
  loadWorldItems,
} from "./item-storage.ts";
import { markNPCWorldActive } from "./npc-storage.ts";
import { getCanonicalPlayerState } from "./player-snapshots.ts";
import {
  getEffectiveMap,
  getOrCreatePlayerWorld,
  getWorldDimensions,
  getWorldType,
} from "./world-bootstrap.ts";
import {
  isWorldTileWalkable,
  getActionsForItemType,
  WORLD_TILE_NAME_BY_VALUE,
} from "./world-domain.ts";
import { loadWorldHouses, loadWorldMods } from "./world-mod-storage.ts";
import {
  buildInventorySelectors,
  getAllLivingItems,
  getNearbyTileItems,
  LivingState,
} from "./world-domain.ts";

type CanonicalState = {
  row: number;
  col: number;
  seq: number;
  rotation: number;
};

export function worldTileNameForValue(tileValue: number): string {
  if (WORLD_TILE_NAME_BY_VALUE[tileValue]) {
    return WORLD_TILE_NAME_BY_VALUE[tileValue];
  }
  return "unknown";
}

export function getAvailableWorldActions(
  inventory: LivingState,
  currentTileItems: any[],
): string[] {
  const actionMap: Record<string, boolean> = {};

  function addItemAction(item: any) {
    if (!item || !item.type) {
      return;
    }
    const actions = getActionsForItemType(String(item.type));
    for (let i = 0; i < actions.length; i++) {
      if (!actions[i]) continue;
      actionMap[actions[i]] = true;
    }
  }

  const invItems = getAllLivingItems(inventory);
  for (let i = 0; i < invItems.length; i++) {
    addItemAction(invItems[i]);
  }

  const tileItems = Array.isArray(currentTileItems) ? currentTileItems : [];
  for (let i = 0; i < tileItems.length; i++) {
    addItemAction(tileItems[i]);
  }

  return Object.keys(actionMap).sort();
}

export function getTargetTileFromRotation(
  row: number,
  col: number,
  rotation: number,
): { row: number; col: number; direction: string } {
  let targetRow = row;
  let targetCol = col;
  let direction = "south";
  let angle = Number.isFinite(Number(rotation)) ? Number(rotation) : 0;

  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;

  if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
    targetRow = row + 1;
    direction = "south";
  } else if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) {
    targetCol = col + 1;
    direction = "east";
  } else if (angle >= (3 * Math.PI) / 4 || angle < (-3 * Math.PI) / 4) {
    targetRow = row - 1;
    direction = "north";
  } else {
    targetCol = col - 1;
    direction = "west";
  }

  return { row: targetRow, col: targetCol, direction: direction };
}

export function normalizeMoveDirection(direction: any): string {
  const value = String(direction || "").toLowerCase();
  if (value === "up") return "north";
  if (value === "down") return "south";
  if (value === "left") return "west";
  if (value === "right") return "east";
  return value;
}

export function rotationForDirection(direction: string): number | null {
  if (direction === "south") return 0;
  if (direction === "east") return Math.PI / 2;
  if (direction === "north") return Math.PI;
  if (direction === "west") return -Math.PI / 2;
  return null;
}

export function getMoveOptions(
  worldId: string,
  canonical: { row: number; col: number },
): Record<
  string,
  {
    row: number;
    col: number;
    walkable: boolean;
    tile_type: string;
    in_bounds: boolean;
  }
> {
  const map = getEffectiveMap(worldId);
  const mapRows = map.length;
  const mapCols = map[0] ? map[0].length : 0;
  const options: Record<
    string,
    {
      row: number;
      col: number;
      walkable: boolean;
      tile_type: string;
      in_bounds: boolean;
    }
  > = {};
  const deltas: Record<string, { row: number; col: number }> = {
    north: { row: -1, col: 0 },
    south: { row: 1, col: 0 },
    east: { row: 0, col: 1 },
    west: { row: 0, col: -1 },
  };
  const directions = Object.keys(deltas);
  for (let i = 0; i < directions.length; i++) {
    const direction = directions[i];
    const delta = deltas[direction];
    const targetRow = canonical.row + delta.row;
    const targetCol = canonical.col + delta.col;
    const inBounds =
      targetRow >= 0 &&
      targetRow < mapRows &&
      targetCol >= 0 &&
      targetCol < mapCols;
    const tileValue = inBounds ? map[targetRow][targetCol] : 0;
    options[direction] = {
      row: targetRow,
      col: targetCol,
      walkable: inBounds && isWorldTileWalkable(tileValue),
      tile_type: inBounds ? worldTileNameForValue(tileValue) : "out_of_bounds",
      in_bounds: inBounds,
    };
  }
  return options;
}

export function getCurrentWorldStateForUser(userId: string): {
  ok: boolean;
  world_id: string;
  world_type: string;
  world_rows: number;
  world_cols: number;
  player: CanonicalState;
  items: any[];
  tile_items: any[];
  inventory: LivingState;
  world_mods: any;
  houses: any;
  inventory_slot_ids: string[];
  inventory_selectors: string[];
  available_actions: string[];
  move_options: Record<
    string,
    {
      row: number;
      col: number;
      walkable: boolean;
      tile_type: string;
      in_bounds: boolean;
    }
  >;
  facing_tile: { row: number; col: number; direction: string };
} {
  const worldId = getOrCreatePlayerWorld(userId);
  markNPCWorldActive(worldId);
  ensureWorldItems(worldId);

  const canonical = getCanonicalPlayerState(worldId, userId);
  const inventory = loadPlayerInventory(userId);
  const worldItems = loadWorldItems(worldId);
  const tileKey = canonical.row + "_" + canonical.col;
  const currentTileItems = Array.isArray(worldItems[tileKey])
    ? worldItems[tileKey]
    : [];
  const {
    inventory_slot_ids: inventorySlotIds,
    inventory_selectors: inventorySelectors,
  } = buildInventorySelectors(inventory);

  const worldDims = getWorldDimensions(worldId);
  return {
    ok: true,
    world_id: String(worldId),
    world_type: getWorldType(worldId),
    world_rows: worldDims.rows,
    world_cols: worldDims.cols,
    player: {
      row: canonical.row,
      col: canonical.col,
      seq: canonical.seq,
      rotation: canonical.rotation,
    },
    items: flattenWorldItems(worldItems),
    tile_items: currentTileItems,
    inventory: inventory,
    world_mods: loadWorldMods(worldId),
    houses: loadWorldHouses(worldId),
    inventory_slot_ids: inventorySlotIds,
    inventory_selectors: inventorySelectors,
    available_actions: getAvailableWorldActions(
      inventory,
      getNearbyTileItems(worldItems, canonical.row, canonical.col),
    ),
    move_options: getMoveOptions(String(worldId), canonical),
    facing_tile: getTargetTileFromRotation(
      canonical.row,
      canonical.col,
      canonical.rotation,
    ),
  };
}
