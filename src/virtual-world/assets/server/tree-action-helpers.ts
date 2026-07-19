import { getActionDefinition } from "./action-registry.ts";
import { appendWorldChatMessage } from "./chat-storage.ts";
import { getTargetTileFromRotation } from "./current-world-state.ts";
import {
  grantAllItemsForUser,
  handleItemActionForUser,
} from "./item-action-helpers.ts";
import {
  deleteWorldItems,
  ensureWorldItems,
  loadPlayerInventory,
  loadWorldItems,
  nextWorldItemId,
  savePlayerInventory,
  saveWorldItems,
  upsertWorldItem,
} from "./item-storage.ts";
import { getPlayerWorld } from "./player-persistence.ts";
import {
  getCanonicalPlayerState,
  getDefaultSpawnPosition,
} from "./player-snapshots.ts";
import { getEffectiveNick } from "./social-state.ts";
import {
  broadcastItemChange,
  sendWorldScopedStreamEvent,
} from "./stream-broadcast.ts";
import {
  createWorldOfType,
  getEffectiveMap,
  getWorldDimensions,
} from "./world-bootstrap.ts";
import { getWorldClass } from "./world-class-storage.ts";
import {
  OAK_WORLD_ID,
  canInventoryUseTreeAction,
  canTileItemsUseTreeAction,
  canonicalTreeAction,
  isOakCenterTile,
  isOakClearingTile,
  normalizeWorldType,
  worldTypeForPortalBuildAction,
} from "./world-domain.ts";
import {
  loadWorldHouses,
  loadWorldTrees,
  saveWorldHouses,
  saveWorldTrees,
} from "./world-mod-storage.ts";
import { switchUserWorld } from "./world-switch.ts";
import { getItemChangeDefinition } from "./item-events.ts";
import { getWorldEventDefinition } from "./world-events.ts";
import {
  evaluateConditions,
  applyEffects,
} from "./action-logic-interpreter.ts";
import {
  findFirstLivingItemByTypes,
  isValidItem,
  LivingState,
  replaceLivingItemById,
} from "./world-domain.ts";

export function performTreeActionForUser(
  userId: string,
  body: any,
): { status: number; payload: any } {
  const rawAction = body && body.action;
  const action = canonicalTreeAction(rawAction);
  const actionDefinition = getActionDefinition(action);
  const requestedPortalWorldType =
    worldTypeForPortalBuildAction(rawAction) ||
    normalizeWorldType(body && body.destination_world_type);
  const requestedPortalRows = Number(body && body.destination_world_rows);
  const requestedPortalCols = Number(body && body.destination_world_cols);
  const requestedPortalDimensions =
    isFinite(requestedPortalRows) || isFinite(requestedPortalCols)
      ? {
          rows: isFinite(requestedPortalRows) ? requestedPortalRows : undefined,
          cols: isFinite(requestedPortalCols) ? requestedPortalCols : undefined,
        }
      : undefined;
  const requestedWorldClassId = String(
    (body && body.destination_world_class_id) || "",
  ).trim();

  if (action === "pick" || action === "drop" || action === "equip") {
    return handleItemActionForUser(userId, body || {});
  }

  if (action === "cheat_grant_all") {
    return { status: 200, payload: grantAllItemsForUser(userId) };
  }

  if (!actionDefinition) {
    return {
      status: 400,
      payload: { ok: false, error: "error.invalid_action" },
    };
  }

  const worldId = getPlayerWorld(userId);
  if (!worldId) {
    return {
      status: 200,
      payload: { ok: false, error: "error.no_world_found" },
    };
  }
  ensureWorldItems(worldId);

  const inv = loadPlayerInventory(userId);
  const canonical = getCanonicalPlayerState(worldId, userId);
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
  const worldItems = loadWorldItems(worldId);
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
    itemMutation?: {
      saveWorldItems?: boolean;
    };
    worldMutation?: {
      storage: "trees" | "houses";
    };
    worldEvent?: {
      eventId: string;
      actionId?: string;
    };
    itemChange?: {
      eventId: string;
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
      sender_nick: getEffectiveNick(userId),
      text: execution.worldChatText,
      ts: Date.now(),
    };
    appendWorldChatMessage(worldId, tuneMsg);
    sendWorldScopedStreamEvent(String(worldId), "chat_message", tuneMsg);
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
    const worldEvent = getWorldEventDefinition(execution.worldEvent.eventId);
    if (!worldEvent) return;

    sendWorldScopedStreamEvent(String(worldId), worldEvent.eventType, {
      action: execution.worldEvent.actionId || action,
      row: row,
      col: col,
      actor_type: "player",
      actor_id: userId,
      player_id: userId,
    });
  }

  function maybeBroadcastConfiguredItemChange(
    row: number,
    col: number,
    items: any[],
  ): void {
    const execution = getActionExecutionConfig();
    if (!execution || !execution.itemChange) return;
    const itemChange = getItemChangeDefinition(execution.itemChange.eventId);
    if (!itemChange) return;

    broadcastItemChange(
      worldId,
      "player",
      userId,
      itemChange.id,
      row,
      col,
      items,
    );
  }

  function maybePersistConfiguredWorldMutation(
    row: number,
    col: number,
    state: {
      trees: Record<string, any>;
      houses: Record<string, any>;
    },
  ): boolean {
    const execution = getActionExecutionConfig();
    if (!execution || !execution.worldMutation) return false;

    if (execution.worldMutation.storage === "trees") {
      saveWorldTrees(worldId, state.trees);
      maybeSendConfiguredWorldEvent(row, col);
      return true;
    }

    if (execution.worldMutation.storage === "houses") {
      saveWorldHouses(worldId, state.houses);
      maybeSendConfiguredWorldEvent(row, col);
      return true;
    }

    return false;
  }

  function maybePersistConfiguredItemMutation(
    row: number,
    col: number,
    itemsState: Record<string, any[]>,
    changedItems: any[],
  ): boolean {
    const execution = getActionExecutionConfig();
    if (!execution || !execution.itemMutation) return false;

    if (execution.itemMutation.saveWorldItems) {
      saveWorldItems(worldId, itemsState);
      maybeBroadcastConfiguredItemChange(row, col, changedItems);
      return true;
    }

    return false;
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
        isOakClearingTile(worldId, row, col)
      ) {
        return blockedZone.errorMessage || "error.action_not_allowed_here";
      }

      if (
        blockedZone.kind === "oak_center" &&
        isOakCenterTile(worldId, row, col)
      ) {
        return blockedZone.errorMessage || "error.action_not_allowed_here";
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

    const targetTile = getTargetTileFromRotation(
      playerRow,
      playerCol,
      rotation,
    );
    const worldDims = getWorldDimensions(worldId);
    return {
      row: targetTile.row,
      col: targetTile.col,
      inBounds:
        targetTile.row >= 0 &&
        targetTile.row < worldDims.rows &&
        targetTile.col >= 0 &&
        targetTile.col < worldDims.cols,
    };
  }

  const resolvedTarget = resolveActionTarget();
  const canUseAction =
    canInventoryUseTreeAction(inv, action) ||
    canTileItemsUseTreeAction(currentTileItems, action);

  function maybeApplyLogicEffects(): void {
    if (
      !logicSourceItem ||
      !actionDefinition ||
      !actionDefinition.logicSpec ||
      !actionDefinition.logicSpec.effects ||
      actionDefinition.logicSpec.effects.length === 0
    ) {
      return;
    }
    const updated = applyEffects(actionDefinition.logicSpec, logicSourceItem);
    if (isValidItem(updated)) {
      replaceLivingItemById(inv, String(logicSourceItem.id || ""), updated);
    }
    savePlayerInventory(userId, inv);
  }

  if (!canUseAction) {
    return {
      status: 200,
      payload: {
        ok: false,
        error: "error.missing_required_item_for_action",
      },
    };
  }

  // Evaluate item-state conditions (logicSpec) and collect the source item
  let logicSourceItem: any | null = null;
  if (actionDefinition && actionDefinition.logicSpec) {
    const logicSpec = actionDefinition.logicSpec;
    const sourceItemIds = Array.isArray(actionDefinition.sourceItemIds)
      ? actionDefinition.sourceItemIds
      : [];
    logicSourceItem = findFirstLivingItemByTypes(inv, sourceItemIds);
    if (logicSourceItem) {
      const condResult = evaluateConditions(logicSpec, logicSourceItem);
      if (!condResult.ok) {
        return {
          status: 200,
          payload: {
            ok: false,
            error: condResult.errorMessage || "error.action_condition_not_met",
          },
        };
      }
    }
  }

  if (action === "return_home") {
    switchUserWorld(
      userId,
      OAK_WORLD_ID,
      getDefaultSpawnPosition(OAK_WORLD_ID, userId),
    );
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        action: "return_home",
        world_id: OAK_WORLD_ID,
      }),
    };
  }

  if (action === "tune") {
    maybeApplyLogicEffects();
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload(),
    };
  }

  if (action === "play_tune") {
    maybeAppendConfiguredWorldChatMessage();
    maybeApplyLogicEffects();
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
          error: "error.blessing_already_rests_here",
        },
      };
    }

    const blessingItem = {
      id: "w" + worldId + "_i" + nextWorldItemId(worldId),
      type: "blessing_marker",
      created_at: Date.now(),
      placed_by: userId,
      non_droppable: true,
    };
    if (!worldItems[blessingTileKey]) worldItems[blessingTileKey] = [];
    worldItems[blessingTileKey].push(blessingItem);
    upsertWorldItem(
      worldId,
      resolvedTarget.row,
      resolvedTarget.col,
      blessingItem,
    );
    maybePersistConfiguredItemMutation(
      resolvedTarget.row,
      resolvedTarget.col,
      worldItems,
      [blessingItem],
    );
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
    switchUserWorld(userId, newWorldId);
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
      payload: { ok: false, error: "error.target_out_of_bounds" },
    };
  }

  const blockedZoneError = getBlockedZoneError(targetRow, targetCol);
  if (blockedZoneError) {
    return {
      status: 200,
      payload: { ok: false, error: blockedZoneError },
    };
  }

  const map = getEffectiveMap(worldId);
  const trees = loadWorldTrees(worldId);
  const houses = loadWorldHouses(worldId);
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
    maybePersistConfiguredWorldMutation(targetRow, targetCol, {
      trees: trees,
      houses: houses,
    });
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload(),
    };
  }

  if (action === "destroy_house") {
    delete houses[tileKey];
    maybePersistConfiguredWorldMutation(targetRow, targetCol, {
      trees: trees,
      houses: houses,
    });
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload(),
    };
  }

  const treeKey = tileKey;

  if (action === "build_portal") {
    const targetTileKey = targetRow + "_" + targetCol;
    // A world class (creator-defined world type) supplies the base preset and
    // default size; explicit rows/cols in the request still win over the class.
    let portalWorldType = requestedPortalWorldType;
    let portalDimensions = requestedPortalDimensions;
    if (requestedWorldClassId) {
      const worldClass = getWorldClass(requestedWorldClassId);
      if (!worldClass) {
        return {
          status: 200,
          payload: { ok: false, error: "error.world_class_not_found" },
        };
      }
      portalWorldType = normalizeWorldType(worldClass.baseType);
      portalDimensions = {
        rows:
          portalDimensions && portalDimensions.rows !== undefined
            ? portalDimensions.rows
            : worldClass.rows,
        cols:
          portalDimensions && portalDimensions.cols !== undefined
            ? portalDimensions.cols
            : worldClass.cols,
      };
    }
    const createdDestinationWorld = createWorldOfType(
      portalWorldType,
      portalDimensions,
    );
    const portalItem: Record<string, any> = {
      id: "w" + worldId + "_i" + nextWorldItemId(worldId),
      type: "portal",
      created_at: Date.now(),
      destination_world_id: createdDestinationWorld.world_id,
      destination_world_type: createdDestinationWorld.world_type,
      destination_world_rows: createdDestinationWorld.rows,
      destination_world_cols: createdDestinationWorld.cols,
    };
    if (requestedWorldClassId) {
      portalItem.destination_world_class_id = requestedWorldClassId;
    }
    if (!worldItems[targetTileKey]) worldItems[targetTileKey] = [];
    worldItems[targetTileKey].push(portalItem);
    upsertWorldItem(worldId, targetRow, targetCol, portalItem);
    maybePersistConfiguredItemMutation(targetRow, targetCol, worldItems, [
      portalItem,
    ]);

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
    deleteWorldItems(removedPortals);
    maybePersistConfiguredItemMutation(
      targetRow,
      targetCol,
      worldItems,
      removedPortals,
    );

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

  maybePersistConfiguredWorldMutation(targetRow, targetCol, {
    trees: trees,
    houses: houses,
  });

  return {
    status: 200,
    payload: buildConfiguredSuccessPayload(),
  };
}
