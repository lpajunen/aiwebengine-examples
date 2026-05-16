type CanonicalState = {
  row: number;
  col: number;
  seq: number;
  rotation: number;
};

type MoveOptionsDeps = {
  getEffectiveMap: (worldId: string) => number[][];
  isWorldTileWalkable: (tileValue: any) => boolean;
  worldTileNameForValue: (tileValue: number) => string;
  ROWS: number;
  COLS: number;
};

type CurrentWorldStateDeps = {
  getOrCreatePlayerWorld: (userId: string) => string;
  markNPCWorldActive: (worldId: string) => void;
  ensureWorldItems: (worldId: string) => void;
  getCanonicalPlayerState: (worldId: string, userId: string) => CanonicalState;
  loadPlayerInventory: (userId: string) => any;
  loadWorldItems: (worldId: string) => Record<string, any[]>;
  flattenWorldItems: (itemsByTile: Record<string, any[]>) => any[];
  loadWorldMods: (worldId: string) => any;
  loadWorldHouses: (worldId: string) => any;
  getWorldType: (worldId: string) => string;
  getAvailableWorldActions: (
    inventory: any,
    currentTileItems: any[],
  ) => string[];
  getMoveOptions: (
    worldId: string,
    canonical: CanonicalState,
  ) => Record<
    string,
    {
      row: number;
      col: number;
      walkable: boolean;
      tile_type: string;
      in_bounds: boolean;
    }
  >;
  getTargetTileFromRotation: (
    row: number,
    col: number,
    rotation: number,
  ) => { row: number; col: number; direction: string };
};

export function worldTileNameForValue(
  tileValue: number,
  worldTileNameByValue: Record<number, string>,
): string {
  if (worldTileNameByValue[tileValue]) {
    return worldTileNameByValue[tileValue];
  }
  return "unknown";
}

export function getAvailableWorldActions(
  inventory: { left_hand: any; right_hand: any; inventory: any[] },
  currentTileItems: any[],
  treeActionByItemType: Record<string, string>,
): string[] {
  const actionMap: Record<string, boolean> = {};

  function addItemAction(item: any) {
    if (!item || !item.type) {
      return;
    }
    const action = treeActionByItemType[String(item.type)];
    if (action) {
      actionMap[action] = true;
    }
  }

  addItemAction(inventory && inventory.left_hand);
  addItemAction(inventory && inventory.right_hand);

  const invItems =
    inventory && Array.isArray(inventory.inventory) ? inventory.inventory : [];
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
  deps: MoveOptionsDeps,
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
  const map = deps.getEffectiveMap(worldId);
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
      targetRow < deps.ROWS &&
      targetCol >= 0 &&
      targetCol < deps.COLS;
    const tileValue = inBounds ? map[targetRow][targetCol] : 0;
    options[direction] = {
      row: targetRow,
      col: targetCol,
      walkable: inBounds && deps.isWorldTileWalkable(tileValue),
      tile_type: inBounds
        ? deps.worldTileNameForValue(tileValue)
        : "out_of_bounds",
      in_bounds: inBounds,
    };
  }
  return options;
}

export function getCurrentWorldStateForUser(
  userId: string,
  deps: CurrentWorldStateDeps,
): {
  ok: boolean;
  world_id: string;
  world_type: string;
  player: CanonicalState;
  items: any[];
  tile_items: any[];
  inventory: any;
  world_mods: any;
  houses: any;
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
  const worldId = deps.getOrCreatePlayerWorld(userId);
  deps.markNPCWorldActive(worldId);
  deps.ensureWorldItems(worldId);

  const canonical = deps.getCanonicalPlayerState(worldId, userId);
  const inventory = deps.loadPlayerInventory(userId);
  const worldItems = deps.loadWorldItems(worldId);
  const tileKey = canonical.row + "_" + canonical.col;
  const currentTileItems = Array.isArray(worldItems[tileKey])
    ? worldItems[tileKey]
    : [];

  return {
    ok: true,
    world_id: String(worldId),
    world_type: deps.getWorldType(worldId),
    player: {
      row: canonical.row,
      col: canonical.col,
      seq: canonical.seq,
      rotation: canonical.rotation,
    },
    items: deps.flattenWorldItems(worldItems),
    tile_items: currentTileItems,
    inventory: inventory,
    world_mods: deps.loadWorldMods(worldId),
    houses: deps.loadWorldHouses(worldId),
    available_actions: deps.getAvailableWorldActions(
      inventory,
      currentTileItems,
    ),
    move_options: deps.getMoveOptions(String(worldId), canonical),
    facing_tile: deps.getTargetTileFromRotation(
      canonical.row,
      canonical.col,
      canonical.rotation,
    ),
  };
}
