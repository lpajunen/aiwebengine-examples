type TreeActionDeps = {
  canonicalTreeAction: (action: string | null | undefined) => string;
  getActionDefinition: (action: string | null | undefined) => any;
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
  const actionDefinition = deps.getActionDefinition(action);
  const requestedPortalWorldType =
    deps.worldTypeForPortalBuildAction(rawAction) ||
    deps.normalizeWorldType(body && body.destination_world_type);

  if (action === "pick" || action === "drop" || action === "equip") {
    return deps.handleItemActionForUser(userId, body || {});
  }

  if (action === "cheat_grant_all") {
    return { status: 200, payload: deps.grantAllItemsForUser(userId) };
  }

  if (!actionDefinition) {
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

  function getActionExecutionConfig(): {
    toastMessage?: string;
    worldChatText?: string;
    successPayload?: {
      includeTargetPosition?: boolean;
      includeWorldId?: boolean;
      includeInventory?: boolean;
      includeTileItems?: boolean;
      includeRemovedCount?: boolean;
      includeSwitchedWorld?: boolean;
    };
    worldEvent?: {
      eventType: string;
      actionId?: string;
    };
    itemChange?: {
      actionId: string;
    };
  } | null {
    return actionDefinition && actionDefinition.execution
      ? actionDefinition.execution
      : null;
  }

  function maybeAppendConfiguredWorldChatMessage(): void {
    const execution = getActionExecutionConfig();
    if (!execution || !execution.worldChatText) return;

    const tuneMsg = {
      id:
        "wc-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2),
      sender_id: userId,
      sender_nick: deps.getEffectiveNick(userId),
      text: execution.worldChatText,
      ts: Date.now(),
    };
    deps.appendWorldChatMessage(worldId, tuneMsg);
    deps.sendWorldScopedStreamEvent(String(worldId), "chat_message", tuneMsg);
  }

  function withConfiguredToastMessage(payload: any): any {
    const execution = getActionExecutionConfig();
    if (!execution || !execution.toastMessage) return payload;
    return {
      ...payload,
      toast_message: execution.toastMessage,
    };
  }

  function buildConfiguredSuccessPayload(overrides?: any): any {
    const execution = getActionExecutionConfig();
    const payload = {
      ok: true,
      action: action,
      ...(overrides || {}),
    };

    if (!execution || !execution.successPayload) {
      return withConfiguredToastMessage(payload);
    }

    const successPayload = execution.successPayload;

    if (successPayload.includeTargetPosition) {
      payload.row = resolvedTarget.row;
      payload.col = resolvedTarget.col;
    }

    if (successPayload.includeWorldId && payload.world_id == null) {
      payload.world_id = String(worldId);
    }

    if (successPayload.includeInventory && payload.inventory == null) {
      payload.inventory = inv;
    }

    if (successPayload.includeTileItems && payload.tile_items == null) {
      payload.tile_items = getTileItemsSnapshot(
        resolvedTarget.row,
        resolvedTarget.col,
      );
    }

    if (successPayload.includeSwitchedWorld && payload.switched_world == null) {
      payload.switched_world = true;
    }

    return withConfiguredToastMessage(payload);
  }

  function maybeSendConfiguredWorldEvent(row: number, col: number): void {
    const execution = getActionExecutionConfig();
    if (!execution || !execution.worldEvent) return;

    deps.sendWorldScopedStreamEvent(
      String(worldId),
      execution.worldEvent.eventType,
      {
        action: execution.worldEvent.actionId || action,
        row: row,
        col: col,
        actor_type: "player",
        actor_id: userId,
        player_id: userId,
      },
    );
  }

  function maybeBroadcastConfiguredItemChange(
    row: number,
    col: number,
    items: any[],
  ): void {
    const execution = getActionExecutionConfig();
    if (!execution || !execution.itemChange) return;

    deps.broadcastItemChange(
      worldId,
      "player",
      userId,
      execution.itemChange.actionId,
      row,
      col,
      items,
    );
  }

  function getBlockedZoneError(row: number, col: number): string | null {
    const validation = actionDefinition && actionDefinition.validation;
    const blockedZones =
      validation && Array.isArray(validation.blockedZones)
        ? validation.blockedZones
        : [];

    for (let i = 0; i < blockedZones.length; i++) {
      const blockedZone = blockedZones[i];
      if (!blockedZone || typeof blockedZone.kind !== "string") continue;

      if (
        blockedZone.kind === "oak_clearing" &&
        deps.isOakClearingTile(worldId, row, col)
      ) {
        return blockedZone.errorMessage || "Action not allowed here";
      }

      if (
        blockedZone.kind === "oak_center" &&
        deps.isOakCenterTile(worldId, row, col)
      ) {
        return blockedZone.errorMessage || "Action not allowed here";
      }
    }

    return null;
  }

  function getActionValidationError(
    row: number,
    col: number,
    map: number[][],
    houses: Record<string, any>,
    trees: Record<string, any>,
  ): string | null {
    const validation = actionDefinition && actionDefinition.validation;
    if (!validation) return null;

    if (validation.requireWalkableTile && map[row] && map[row][col] !== 0) {
      return validation.requireWalkableTile.errorMessage;
    }

    const tileKey = row + "_" + col;

    if (validation.requireHouseState) {
      const hasHouse = !!houses[tileKey];
      if (validation.requireHouseState.kind === "present" && !hasHouse) {
        return validation.requireHouseState.errorMessage;
      }
      if (validation.requireHouseState.kind === "absent" && hasHouse) {
        return validation.requireHouseState.errorMessage;
      }
    }

    if (validation.requirePortalState) {
      const tileItems = getTileItemsSnapshot(row, col);
      const hasPortal = tileItems.some(function (item) {
        return item && item.type === "portal";
      });
      if (validation.requirePortalState.kind === "present" && !hasPortal) {
        return validation.requirePortalState.errorMessage;
      }
      if (validation.requirePortalState.kind === "absent" && hasPortal) {
        return validation.requirePortalState.errorMessage;
      }
    }

    if (validation.requireTreeState) {
      const treeKey = row + "_" + col;
      const treeState = trees[treeKey];
      const hasExistingTree = treeState && treeState.action === "plant";
      const wasTreeCut = treeState && treeState.action === "cut";
      const baseHasTree = map[row] && map[row][col] === 2;

      if (validation.requireTreeState.kind === "plantable") {
        if (map[row] && map[row][col] !== 0 && !wasTreeCut) {
          return (
            validation.requireTreeState.missingErrorMessage || "Cannot use here"
          );
        }
        if (hasExistingTree || (baseHasTree && !wasTreeCut)) {
          return (
            validation.requireTreeState.conflictErrorMessage || "Already exists"
          );
        }
      }

      if (validation.requireTreeState.kind === "cuttable") {
        if (!hasExistingTree && !baseHasTree) {
          return (
            validation.requireTreeState.missingErrorMessage || "Nothing to cut"
          );
        }
        if (wasTreeCut) {
          return (
            validation.requireTreeState.conflictErrorMessage ||
            "Already removed"
          );
        }
      }
    }

    return null;
  }

  function resolveActionTarget(): {
    row: number;
    col: number;
    inBounds: boolean;
  } {
    const targetKind =
      actionDefinition && typeof actionDefinition.targetKind === "string"
        ? actionDefinition.targetKind
        : "facing_tile";

    if (targetKind === "self" || targetKind === "current_tile") {
      return {
        row: canonical.row,
        col: canonical.col,
        inBounds: true,
      };
    }

    const targetTile = deps.getTargetTileFromRotation(
      playerRow,
      playerCol,
      rotation,
    );
    return {
      row: targetTile.row,
      col: targetTile.col,
      inBounds:
        targetTile.row >= 0 &&
        targetTile.row < deps.ROWS &&
        targetTile.col >= 0 &&
        targetTile.col < deps.COLS,
    };
  }

  const resolvedTarget = resolveActionTarget();
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
      payload: buildConfiguredSuccessPayload({
        action: "return_home",
        world_id: deps.OAK_WORLD_ID,
      }),
    };
  }

  if (action === "play_tune") {
    maybeAppendConfiguredWorldChatMessage();
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload(),
    };
  }

  if (action === "place_blessing") {
    const blessingTileKey = resolvedTarget.row + "_" + resolvedTarget.col;
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
    deps.upsertWorldItem(
      worldId,
      resolvedTarget.row,
      resolvedTarget.col,
      blessingItem,
    );
    deps.saveWorldItems(worldId, worldItems);
    maybeBroadcastConfiguredItemChange(resolvedTarget.row, resolvedTarget.col, [
      blessingItem,
    ]);
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload(),
    };
  }

  if (action === "portal_travel") {
    const portalTileItems = getTileItemsSnapshot(
      resolvedTarget.row,
      resolvedTarget.col,
    );
    const portalEntry = portalTileItems.find(function (item) {
      return item && item.type === "portal";
    });
    const newWorldId =
      portalEntry && portalEntry.destination_world_id
        ? String(portalEntry.destination_world_id)
        : "10000";
    deps.switchUserWorld(userId, newWorldId);
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        world_id: newWorldId,
      }),
    };
  }

  const targetRow = resolvedTarget.row;
  const targetCol = resolvedTarget.col;

  if (!resolvedTarget.inBounds) {
    return {
      status: 200,
      payload: { ok: false, error: "Target out of bounds" },
    };
  }

  const blockedZoneError = getBlockedZoneError(targetRow, targetCol);
  if (blockedZoneError) {
    return {
      status: 200,
      payload: { ok: false, error: blockedZoneError },
    };
  }

  const map = deps.getEffectiveMap(worldId);
  const trees = deps.loadWorldTrees(worldId);
  const houses = deps.loadWorldHouses(worldId);
  const tileKey = targetRow + "_" + targetCol;
  const actionValidationError = getActionValidationError(
    targetRow,
    targetCol,
    map,
    houses,
    trees,
  );

  if (actionValidationError) {
    return {
      status: 200,
      payload: { ok: false, error: actionValidationError },
    };
  }

  if (action === "build_house") {
    houses[tileKey] = {
      built_by: userId,
      actor_type: "player",
      timestamp: Date.now(),
    };
    deps.saveWorldHouses(worldId, houses);
    maybeSendConfiguredWorldEvent(targetRow, targetCol);
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload(),
    };
  }

  if (action === "destroy_house") {
    delete houses[tileKey];
    deps.saveWorldHouses(worldId, houses);
    maybeSendConfiguredWorldEvent(targetRow, targetCol);
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload(),
    };
  }

  const treeKey = tileKey;

  if (action === "build_portal") {
    const targetTileKey = targetRow + "_" + targetCol;
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
    maybeBroadcastConfiguredItemChange(targetRow, targetCol, [portalItem]);

    return {
      status: 200,
      payload: buildConfiguredSuccessPayload(),
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

    if (keptItems.length > 0) worldItems[removeTileKey] = keptItems;
    else delete worldItems[removeTileKey];
    deps.deleteWorldItems(removedPortals);
    deps.saveWorldItems(worldId, worldItems);
    maybeBroadcastConfiguredItemChange(targetRow, targetCol, removedPortals);

    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        removed_count: removedPortals.length,
      }),
    };
  }

  if (action === "plant") {
    trees[treeKey] = {
      action: "plant",
      planted_by: userId,
      timestamp: Date.now(),
    };
  } else if (action === "cut") {
    trees[treeKey] = {
      action: "cut",
      cut_by: userId,
      timestamp: Date.now(),
    };
  }

  deps.saveWorldTrees(worldId, trees);
  maybeSendConfiguredWorldEvent(targetRow, targetCol);

  return {
    status: 200,
    payload: buildConfiguredSuccessPayload(),
  };
}
