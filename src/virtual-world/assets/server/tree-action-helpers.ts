type TreeActionDeps = {
  canonicalTreeAction: (action: string | null | undefined) => string;
  worldTypeForPortalBuildAction: (
    action: string | null | undefined,
  ) => string | null;
  normalizeWorldType: (worldType: string | null | undefined) => string;
  handleItemActionForUser: (
    userId: string,
    body: any,
  ) => { status: number; payload: any };
  grantAllItemsForUser: (userId: string) => any;
  getPlayerWorld: (userId: string) => string;
  ensureWorldItems: (worldId: string) => void;
  loadPlayerInventory: (userId: string) => any;
  getCanonicalPlayerState: (
    worldId: string,
    userId: string,
  ) => {
    row: number;
    col: number;
    seq: number;
    rotation: number;
  };
  loadWorldItems: (worldId: string) => Record<string, any[]>;
  canInventoryUseTreeAction: (inventory: any, action: string) => boolean;
  canTileItemsUseTreeAction: (items: any[], action: string) => boolean;
  switchUserWorld: (
    userId: string,
    targetWorldId: string,
    spawnPosition?: {
      row: number;
      col: number;
      seq?: number;
      rotation?: number;
    },
  ) => void;
  OAK_WORLD_ID: string;
  getDefaultSpawnPosition: (
    worldId: string,
    userId: string,
  ) => {
    row: number;
    col: number;
    seq?: number;
    rotation?: number;
  };
  getEffectiveNick: (userId: string) => string;
  appendWorldChatMessage: (worldId: string, message: any) => void;
  sendWorldScopedStreamEvent: (
    worldId: string,
    eventType: string,
    payload: any,
  ) => void;
  flattenWorldItems: (itemsByTile: Record<string, any[]>) => any[];
  nextWorldItemId: (worldId: string) => number;
  upsertWorldItem: (
    worldId: string,
    row: number,
    col: number,
    item: any,
  ) => void;
  saveWorldItems: (worldId: string, items: Record<string, any[]>) => void;
  broadcastItemChange: (
    worldId: string,
    actorType: string,
    actorId: string,
    action: string,
    row: number,
    col: number,
    items: any[],
  ) => void;
  getTargetTileFromRotation: (
    row: number,
    col: number,
    rotation: number,
  ) => {
    row: number;
    col: number;
  };
  ROWS: number;
  COLS: number;
  getEffectiveMap: (worldId: string) => number[][];
  loadWorldTrees: (worldId: string) => Record<string, any>;
  loadWorldHouses: (worldId: string) => Record<string, any>;
  isOakClearingTile: (worldId: string, row: number, col: number) => boolean;
  saveWorldHouses: (worldId: string, houses: Record<string, any>) => void;
  createWorldOfType: (worldType: string) => {
    world_id: string;
    world_type: string;
  };
  deleteWorldItems: (items: any[]) => void;
  isOakCenterTile: (worldId: string, row: number, col: number) => boolean;
  saveWorldTrees: (worldId: string, trees: Record<string, any>) => void;
};

export function performTreeActionForUser(
  userId: string,
  body: any,
  deps: TreeActionDeps,
): { status: number; payload: any } {
  const rawAction = body && body.action;
  const action = deps.canonicalTreeAction(rawAction);
  const requestedPortalWorldType =
    deps.worldTypeForPortalBuildAction(rawAction) ||
    deps.normalizeWorldType(body && body.destination_world_type);

  if (action === "pick" || action === "drop" || action === "equip") {
    return deps.handleItemActionForUser(userId, body || {});
  }

  if (action === "cheat_grant_all") {
    return { status: 200, payload: deps.grantAllItemsForUser(userId) };
  }

  if (
    action !== "plant" &&
    action !== "cut" &&
    action !== "build_house" &&
    action !== "destroy_house" &&
    action !== "build_portal" &&
    action !== "remove_portal" &&
    action !== "play_tune" &&
    action !== "place_blessing" &&
    action !== "portal_travel" &&
    action !== "return_home"
  ) {
    return { status: 400, payload: { ok: false, error: "Invalid action" } };
  }

  const worldId = deps.getPlayerWorld(userId);
  if (!worldId) {
    return { status: 200, payload: { ok: false, error: "No world found" } };
  }
  deps.ensureWorldItems(worldId);

  const inv = deps.loadPlayerInventory(userId);
  const canonical = deps.getCanonicalPlayerState(worldId, userId);
  const playerRow = Number.isFinite(Number(body && body.row))
    ? Number(body.row)
    : canonical.row;
  const playerCol = Number.isFinite(Number(body && body.col))
    ? Number(body.col)
    : canonical.col;
  const rotation = Number.isFinite(Number(body && body.rotation))
    ? Number(body.rotation)
    : canonical.rotation;
  const currentTileKey = canonical.row + "_" + canonical.col;
  const worldItems = deps.loadWorldItems(worldId);
  const currentTileItems = Array.isArray(worldItems[currentTileKey])
    ? worldItems[currentTileKey]
    : [];
  function getTileItemsSnapshot(row: number, col: number): any[] {
    const key = row + "_" + col;
    return Array.isArray(worldItems[key]) ? worldItems[key] : [];
  }
  const canUseAction =
    deps.canInventoryUseTreeAction(inv, action) ||
    deps.canTileItemsUseTreeAction(currentTileItems, action);

  if (!canUseAction) {
    return {
      status: 200,
      payload: {
        ok: false,
        error: "Missing required item for action",
      },
    };
  }

  if (action === "return_home") {
    deps.switchUserWorld(
      userId,
      deps.OAK_WORLD_ID,
      deps.getDefaultSpawnPosition(deps.OAK_WORLD_ID, userId),
    );
    return {
      status: 200,
      payload: {
        ok: true,
        action: "return_home",
        switched_world: true,
        world_id: deps.OAK_WORLD_ID,
      },
    };
  }

  if (action === "play_tune") {
    const tuneMsg = {
      id:
        "wc-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2),
      sender_id: userId,
      sender_nick: deps.getEffectiveNick(userId),
      text: "lets a kantele melody drift through the spruce hush.",
      ts: Date.now(),
    };
    deps.appendWorldChatMessage(worldId, tuneMsg);
    deps.sendWorldScopedStreamEvent(String(worldId), "chat_message", tuneMsg);
    return {
      status: 200,
      payload: {
        ok: true,
        action: action,
        inventory: inv,
        toast_message: "A kantele tune carries across the clearing.",
        world_id: String(worldId),
      },
    };
  }

  if (action === "place_blessing") {
    const blessingTileKey = canonical.row + "_" + canonical.col;
    const blessingItems = Array.isArray(worldItems[blessingTileKey])
      ? worldItems[blessingTileKey]
      : [];
    const existingBlessing = blessingItems.some(function (item) {
      return item && item.type === "blessing_marker";
    });
    if (existingBlessing) {
      return {
        status: 200,
        payload: {
          ok: false,
          error: "A blessing already rests here",
        },
      };
    }

    const blessingItem = {
      id: "w" + worldId + "_i" + deps.nextWorldItemId(worldId),
      type: "blessing_marker",
      created_at: Date.now(),
      placed_by: userId,
      non_droppable: true,
    };
    if (!worldItems[blessingTileKey]) worldItems[blessingTileKey] = [];
    worldItems[blessingTileKey].push(blessingItem);
    deps.upsertWorldItem(worldId, canonical.row, canonical.col, blessingItem);
    deps.saveWorldItems(worldId, worldItems);
    deps.broadcastItemChange(
      worldId,
      "player",
      userId,
      "blessing_place",
      canonical.row,
      canonical.col,
      [blessingItem],
    );
    return {
      status: 200,
      payload: {
        ok: true,
        action: action,
        row: canonical.row,
        col: canonical.col,
        tile_items: getTileItemsSnapshot(canonical.row, canonical.col),
        inventory: inv,
        toast_message: "A rowan blessing now marks this place.",
        world_id: String(worldId),
      },
    };
  }

  if (action === "portal_travel") {
    const portalEntry = currentTileItems.find(function (item) {
      return item && item.type === "portal";
    });
    const newWorldId =
      portalEntry && portalEntry.destination_world_id
        ? String(portalEntry.destination_world_id)
        : "10000";
    deps.switchUserWorld(userId, newWorldId);
    return {
      status: 200,
      payload: {
        ok: true,
        action: action,
        switched_world: true,
        world_id: newWorldId,
      },
    };
  }

  const targetTile = deps.getTargetTileFromRotation(
    playerRow,
    playerCol,
    rotation,
  );
  const targetRow = targetTile.row;
  const targetCol = targetTile.col;

  if (
    targetRow < 0 ||
    targetRow >= deps.ROWS ||
    targetCol < 0 ||
    targetCol >= deps.COLS
  ) {
    return {
      status: 200,
      payload: { ok: false, error: "Target out of bounds" },
    };
  }

  const map = deps.getEffectiveMap(worldId);
  const trees = deps.loadWorldTrees(worldId);
  const houses = deps.loadWorldHouses(worldId);
  const tileKey = targetRow + "_" + targetCol;

  if (action === "build_house") {
    if (deps.isOakClearingTile(worldId, targetRow, targetCol)) {
      return {
        status: 200,
        payload: {
          ok: false,
          error: "The oak clearing must remain open",
        },
      };
    }
    if (map[targetRow][targetCol] !== 0) {
      return {
        status: 200,
        payload: { ok: false, error: "Cannot build house here" },
      };
    }
    if (houses[tileKey]) {
      return {
        status: 200,
        payload: { ok: false, error: "House already exists" },
      };
    }
    houses[tileKey] = {
      built_by: userId,
      actor_type: "player",
      timestamp: Date.now(),
    };
    deps.saveWorldHouses(worldId, houses);
    deps.sendWorldScopedStreamEvent(String(worldId), "house_changed", {
      action: action,
      row: targetRow,
      col: targetCol,
      actor_type: "player",
      actor_id: userId,
      player_id: userId,
    });
    return {
      status: 200,
      payload: {
        ok: true,
        action: action,
        row: targetRow,
        col: targetCol,
        world_id: String(worldId),
      },
    };
  }

  if (action === "destroy_house") {
    if (!houses[tileKey]) {
      return {
        status: 200,
        payload: { ok: false, error: "No house to destroy" },
      };
    }
    delete houses[tileKey];
    deps.saveWorldHouses(worldId, houses);
    deps.sendWorldScopedStreamEvent(String(worldId), "house_changed", {
      action: action,
      row: targetRow,
      col: targetCol,
      actor_type: "player",
      actor_id: userId,
      player_id: userId,
    });
    return {
      status: 200,
      payload: {
        ok: true,
        action: action,
        row: targetRow,
        col: targetCol,
        world_id: String(worldId),
      },
    };
  }

  const treeKey = tileKey;

  if (action === "build_portal") {
    if (map[targetRow][targetCol] !== 0) {
      return {
        status: 200,
        payload: { ok: false, error: "Cannot build portal here" },
      };
    }
    const targetTileKey = targetRow + "_" + targetCol;
    const targetItems = Array.isArray(worldItems[targetTileKey])
      ? worldItems[targetTileKey]
      : [];
    const hasPortal = targetItems.some(function (item) {
      return item && item.type === "portal";
    });
    if (hasPortal) {
      return {
        status: 200,
        payload: { ok: false, error: "Portal already exists" },
      };
    }
    const createdDestinationWorld = deps.createWorldOfType(
      requestedPortalWorldType,
    );
    const portalItem = {
      id: "w" + worldId + "_i" + deps.nextWorldItemId(worldId),
      type: "portal",
      created_at: Date.now(),
      destination_world_id: createdDestinationWorld.world_id,
      destination_world_type: createdDestinationWorld.world_type,
    };
    if (!worldItems[targetTileKey]) worldItems[targetTileKey] = [];
    worldItems[targetTileKey].push(portalItem);
    deps.upsertWorldItem(worldId, targetRow, targetCol, portalItem);
    deps.saveWorldItems(worldId, worldItems);

    deps.broadcastItemChange(
      worldId,
      "player",
      userId,
      "portal_create",
      targetRow,
      targetCol,
      [portalItem],
    );

    return {
      status: 200,
      payload: {
        ok: true,
        action: action,
        row: targetRow,
        col: targetCol,
        tile_items: getTileItemsSnapshot(targetRow, targetCol),
        inventory: inv,
        world_id: String(worldId),
      },
    };
  }

  if (action === "remove_portal") {
    const removeTileKey = targetRow + "_" + targetCol;
    const removeItems = Array.isArray(worldItems[removeTileKey])
      ? worldItems[removeTileKey]
      : [];
    const keptItems = [];
    const removedPortals = [];
    for (let removeIdx = 0; removeIdx < removeItems.length; removeIdx++) {
      const removeItem = removeItems[removeIdx];
      if (removeItem && removeItem.type === "portal") {
        removedPortals.push(removeItem);
      } else {
        keptItems.push(removeItem);
      }
    }

    if (removedPortals.length === 0) {
      return {
        status: 200,
        payload: { ok: false, error: "No portal to remove" },
      };
    }

    if (keptItems.length > 0) worldItems[removeTileKey] = keptItems;
    else delete worldItems[removeTileKey];
    deps.deleteWorldItems(removedPortals);
    deps.saveWorldItems(worldId, worldItems);

    deps.broadcastItemChange(
      worldId,
      "player",
      userId,
      "portal_remove",
      targetRow,
      targetCol,
      removedPortals,
    );

    return {
      status: 200,
      payload: {
        ok: true,
        action: action,
        row: targetRow,
        col: targetCol,
        removed_count: removedPortals.length,
        tile_items: getTileItemsSnapshot(targetRow, targetCol),
        inventory: inv,
        world_id: String(worldId),
      },
    };
  }

  if (action === "plant") {
    if (deps.isOakClearingTile(worldId, targetRow, targetCol)) {
      return {
        status: 200,
        payload: {
          ok: false,
          error: "The oak clearing must remain open",
        },
      };
    }
    const hasExistingTree = trees[treeKey] && trees[treeKey].action === "plant";
    const wasTreeCut = trees[treeKey] && trees[treeKey].action === "cut";
    const baseHasTree = map[targetRow][targetCol] === 2;

    if (map[targetRow][targetCol] !== 0 && !wasTreeCut) {
      return {
        status: 200,
        payload: { ok: false, error: "Cannot plant here" },
      };
    }
    if (hasExistingTree || (baseHasTree && !wasTreeCut)) {
      return {
        status: 200,
        payload: { ok: false, error: "Tree already exists" },
      };
    }

    trees[treeKey] = {
      action: "plant",
      planted_by: userId,
      timestamp: Date.now(),
    };
  } else if (action === "cut") {
    if (deps.isOakCenterTile(worldId, targetRow, targetCol)) {
      return {
        status: 200,
        payload: { ok: false, error: "The old oak stands firm" },
      };
    }
    const hasPlantedTree = trees[treeKey] && trees[treeKey].action === "plant";
    const baseTreeExists = map[targetRow][targetCol] === 2;
    const alreadyCut = trees[treeKey] && trees[treeKey].action === "cut";

    if (!hasPlantedTree && !baseTreeExists) {
      return {
        status: 200,
        payload: { ok: false, error: "No tree to cut" },
      };
    }
    if (alreadyCut) {
      return {
        status: 200,
        payload: { ok: false, error: "Tree already cut" },
      };
    }

    trees[treeKey] = {
      action: "cut",
      cut_by: userId,
      timestamp: Date.now(),
    };
  }

  deps.saveWorldTrees(worldId, trees);
  deps.sendWorldScopedStreamEvent(String(worldId), "tree_changed", {
    action: action,
    row: targetRow,
    col: targetCol,
    actor_type: "player",
    actor_id: userId,
    player_id: userId,
  });

  return {
    status: 200,
    payload: {
      ok: true,
      action: action,
      row: targetRow,
      col: targetCol,
      world_id: String(worldId),
    },
  };
}
