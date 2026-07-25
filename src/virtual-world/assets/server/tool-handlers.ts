import {
  refreshActionClassCache,
  refreshItemClassCache,
} from "./item-registry.ts";
import { refreshLivingClassCache } from "./living-registry.ts";
import { refreshWorldClassCache } from "./world-class-storage.ts";
import {
  canManageClass,
  getAuthenticatedUserId,
  normalizeOwnerIdsInput,
  userHasCreatorStone,
} from "./http-handler-helpers.ts";
import {
  getCurrentWorldStateForUser,
  getMoveOptions,
  normalizeMoveDirection,
  rotationForDirection,
} from "./current-world-state.ts";
import {
  grantAllItemsForUser,
  handleItemActionForUser,
} from "./item-action-helpers.ts";
import {
  deleteActionClass,
  deleteItemClass,
  getActionClassWithRefresh,
  getAllActionClasses,
  getAllItemClasses,
  getItemClassWithRefresh,
  upsertActionClass,
  upsertItemClass,
} from "./item-registry.ts";
import {
  deleteLivingClass,
  getAllLivingClasses,
  getLivingClassWithRefresh,
  upsertLivingClass,
} from "./living-registry.ts";
import { movePlayerForUser } from "./move-player.ts";
import { getPlayerWorld } from "./player-persistence.ts";
import { getCanonicalPlayerState } from "./player-snapshots.ts";
import {
  getEffectiveNick,
  savePlayerNick,
  sendGlobalPresenceEvent,
  updateOnlinePresence,
} from "./social-state.ts";
import { performTreeActionForUser } from "./tree-action-helpers.ts";
import { getOrCreatePlayerWorld } from "./world-bootstrap.ts";
import {
  deleteWorldClass,
  getAllWorldClasses,
  getWorldClassWithRefresh,
  isBuiltinWorldClassId,
  normalizeWorldClassRecord,
  upsertWorldClass,
} from "./world-class-storage.ts";
import { buildInventorySelectors } from "./world-domain.ts";

export function virtualWorldGetStateToolHandler(context: any): string {
  const userId = getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }
  return JSON.stringify(getCurrentWorldStateForUser(userId));
}

export function virtualWorldMoveToolHandler(context: any): string {
  const userId = getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }

  const args = context.args || {};
  const direction = normalizeMoveDirection(args.direction);
  if (
    direction !== "north" &&
    direction !== "south" &&
    direction !== "east" &&
    direction !== "west"
  ) {
    return JSON.stringify({
      ok: false,
      error: "direction must be one of north, south, east, or west",
    });
  }

  const worldId = getOrCreatePlayerWorld(userId);
  const canonical = getCanonicalPlayerState(worldId, userId);
  const moveOptions = getMoveOptions(String(worldId), canonical);
  const target = moveOptions[direction];
  const rotation = Number.isFinite(Number(args.rotation))
    ? Number(args.rotation)
    : rotationForDirection(direction);
  const result = movePlayerForUser(userId, {
    toRow: target.row,
    toCol: target.col,
    rotation: rotation,
    session_id: args.session_id ? String(args.session_id) : "mcp",
    seq:
      args.seq !== undefined && Number.isFinite(Number(args.seq))
        ? Number(args.seq)
        : canonical.seq + 1,
  });
  result.payload.status = result.status;
  result.payload.direction = direction;
  return JSON.stringify(result.payload);
}

export function virtualWorldManageItemsToolHandler(context: any): string {
  const userId = getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }

  const args = context.args || {};
  const action = String(args.action || "list");
  if (action === "list") {
    const state = getCurrentWorldStateForUser(userId);
    return JSON.stringify({
      ok: true,
      world_id: state.world_id,
      player: state.player,
      tile_items: state.tile_items,
      inventory: state.inventory,
      inventory_slot_ids: state.inventory_slot_ids,
      inventory_selectors: state.inventory_selectors,
      available_actions: state.available_actions,
    });
  }

  const result = handleItemActionForUser(userId, {
    action: action,
    from: args.from,
    to: args.to,
    index: args.index,
  });
  result.payload.status = result.status;
  result.payload.world_id = getPlayerWorld(userId);
  if (result && result.payload && result.payload.inventory) {
    const selectors = buildInventorySelectors(result.payload.inventory);
    result.payload.inventory_slot_ids = selectors.inventory_slot_ids;
    result.payload.inventory_selectors = selectors.inventory_selectors;
  }
  return JSON.stringify(result.payload);
}

export function virtualWorldActToolHandler(context: any): string {
  const userId = getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }

  const args = context.args || {};
  const worldId = getOrCreatePlayerWorld(userId);
  const canonical = getCanonicalPlayerState(worldId, userId);
  const result = performTreeActionForUser(userId, {
    action: args.action,
    row: Number.isFinite(Number(args.row)) ? Number(args.row) : canonical.row,
    col: Number.isFinite(Number(args.col)) ? Number(args.col) : canonical.col,
    rotation: Number.isFinite(Number(args.rotation))
      ? Number(args.rotation)
      : canonical.rotation,
    destination_world_type: args.destination_world_type,
    destination_world_rows: args.destination_world_rows,
    destination_world_cols: args.destination_world_cols,
    destination_world_class_id: args.destination_world_class_id,
  });
  result.payload.status = result.status;
  if (result && result.payload && result.payload.inventory) {
    const selectors = buildInventorySelectors(result.payload.inventory);
    result.payload.inventory_slot_ids = selectors.inventory_slot_ids;
    result.payload.inventory_selectors = selectors.inventory_selectors;
  }
  return JSON.stringify(result.payload);
}

export function virtualWorldSetNicknameToolHandler(context: any): string {
  const userId = getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }

  const args = context.args || {};
  const nick = args.nick;

  if (!nick || String(nick).trim() === "") {
    return JSON.stringify({ status: 400, error: "Nickname cannot be empty" });
  }

  const sanitized = String(nick).trim().slice(0, 24);
  if (sanitized.toLowerCase() === "cheat") {
    const cheatResult = grantAllItemsForUser(userId);
    const selectors = buildInventorySelectors(cheatResult.inventory);
    const currentWorldId = getPlayerWorld(userId);
    if (currentWorldId) {
      const existingNick = getEffectiveNick(userId);
      sendGlobalPresenceEvent(
        "upsert",
        userId,
        String(currentWorldId),
        existingNick,
        Date.now(),
        Date.now(),
        {
          inventory: cheatResult.inventory,
          inventory_slot_ids: selectors.inventory_slot_ids,
          inventory_selectors: selectors.inventory_selectors,
          items: cheatResult.items,
          message:
            "Item cheat activated: +" + cheatResult.granted_count + " items",
        },
      );
    }
    return JSON.stringify({
      status: 200,
      ok: true,
      inventory: cheatResult.inventory,
      inventory_slot_ids: selectors.inventory_slot_ids,
      inventory_selectors: selectors.inventory_selectors,
      items: cheatResult.items,
      message: "Item cheat activated: +" + cheatResult.granted_count + " items",
    });
  }

  try {
    savePlayerNick(userId, sanitized);
  } catch (e) {
    return JSON.stringify({ status: 500, error: "Failed to save nickname" });
  }

  try {
    const currentWorldId = getPlayerWorld(userId);
    if (currentWorldId) {
      updateOnlinePresence(userId, String(currentWorldId), "");
    }
  } catch (e) {
    // ignore presence update errors
  }

  return JSON.stringify({ status: 200, ok: true, nick: sanitized });
}

export function virtualWorldManageItemClassesToolHandler(context: any): string {
  const userId = getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }
  if (!userHasCreatorStone(userId)) {
    return JSON.stringify({ ok: false, error: "Editing rights required" });
  }

  const args = context.args || {};
  const action = String(args.action || "list");

  if (action === "list") {
    refreshItemClassCache();
    return JSON.stringify({ ok: true, item_classes: getAllItemClasses() });
  }

  if (action === "get") {
    refreshItemClassCache();
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    const cls = getItemClassWithRefresh(id);
    if (!cls)
      return JSON.stringify({ ok: false, error: "Item class not found" });
    return JSON.stringify({ ok: true, item_class: cls });
  }

  if (action === "create" || action === "update") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    refreshItemClassCache();
    let existing: ReturnType<typeof getItemClassWithRefresh> = null;
    if (action === "update") {
      existing = getItemClassWithRefresh(id);
      if (!existing)
        return JSON.stringify({ ok: false, error: "Item class not found" });
      if (!canManageClass(userId, existing.ownerIds)) {
        return JSON.stringify({ ok: false, error: "Not class owner" });
      }
    }
    const record = {
      id,
      kind: String(args.kind || "tool"),
      nonDroppable: !!args.nonDroppable,
      nonPickable: !!args.nonPickable,
      visuals: {
        color: Number(args.color || 0),
        labelKey: String(args.labelKey || ""),
        fallbackLabel: String(args.fallbackLabel || id),
      },
      actionIds: Array.isArray(args.actionIds) ? args.actionIds : [],
      stateTemplate:
        args.stateTemplate && typeof args.stateTemplate === "object"
          ? args.stateTemplate
          : {},
      ownerIds: existing
        ? normalizeOwnerIdsInput(args.ownerIds) || existing.ownerIds
        : [userId],
    };
    const writeResult = upsertItemClass(record);
    if (!writeResult || !writeResult.ok) {
      return JSON.stringify({
        ok: false,
        error:
          "Item class upsert failed" +
          (writeResult && writeResult.error
            ? ": " + String(writeResult.error)
            : ""),
      });
    }
    refreshItemClassCache();
    return JSON.stringify({ ok: true, item_class: record });
  }

  if (action === "delete") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    const existing = getItemClassWithRefresh(id);
    if (existing && !canManageClass(userId, existing.ownerIds)) {
      return JSON.stringify({ ok: false, error: "Not class owner" });
    }
    deleteItemClass(id);
    return JSON.stringify({ ok: true, deleted_id: id });
  }

  return JSON.stringify({ ok: false, error: "Unknown action: " + action });
}

export function virtualWorldManageActionClassesToolHandler(
  context: any,
): string {
  const userId = getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }
  if (!userHasCreatorStone(userId)) {
    return JSON.stringify({ ok: false, error: "Editing rights required" });
  }

  const args = context.args || {};
  const action = String(args.action || "list");

  if (action === "list") {
    refreshActionClassCache();
    return JSON.stringify({
      ok: true,
      action_classes: getAllActionClasses(),
    });
  }

  if (action === "get") {
    refreshActionClassCache();
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    const cls = getActionClassWithRefresh(id);
    if (!cls)
      return JSON.stringify({ ok: false, error: "Action class not found" });
    return JSON.stringify({ ok: true, action_class: cls });
  }

  if (action === "create" || action === "update") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    refreshActionClassCache();
    let existing: ReturnType<typeof getActionClassWithRefresh> = null;
    if (action === "update") {
      existing = getActionClassWithRefresh(id);
      if (!existing)
        return JSON.stringify({ ok: false, error: "Action class not found" });
      if (!canManageClass(userId, existing.ownerIds)) {
        return JSON.stringify({ ok: false, error: "Not class owner" });
      }
    }
    const record = {
      id,
      labelKey: String(args.labelKey || ""),
      fallbackLabel: String(args.fallbackLabel || id),
      targetKind: String(args.targetKind || "self"),
      sourceItemIds: Array.isArray(args.sourceItemIds)
        ? args.sourceItemIds
        : [],
      canonicalId: args.canonicalId ? String(args.canonicalId) : undefined,
      execution: args.execution ?? undefined,
      validation: args.validation ?? undefined,
      logicSpec: args.logicSpec ?? undefined,
      cost: args.cost ?? undefined,
      produces: args.produces ?? undefined,
      fatigueCost:
        args.fatigueCost !== undefined ? Number(args.fatigueCost) : undefined,
      durationMs:
        args.durationMs !== undefined ? Number(args.durationMs) : undefined,
      ownerIds: existing
        ? normalizeOwnerIdsInput(args.ownerIds) || existing.ownerIds
        : [userId],
    };
    const writeResult = upsertActionClass(record);
    if (!writeResult || !writeResult.ok) {
      return JSON.stringify({
        ok: false,
        error:
          "Action class upsert failed" +
          (writeResult && writeResult.error
            ? ": " + String(writeResult.error)
            : ""),
      });
    }
    refreshActionClassCache();
    return JSON.stringify({ ok: true, action_class: record });
  }

  if (action === "delete") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    const existing = getActionClassWithRefresh(id);
    if (existing && !canManageClass(userId, existing.ownerIds)) {
      return JSON.stringify({ ok: false, error: "Not class owner" });
    }
    deleteActionClass(id);
    return JSON.stringify({ ok: true, deleted_id: id });
  }

  return JSON.stringify({ ok: false, error: "Unknown action: " + action });
}

export function virtualWorldManageLivingClassesToolHandler(
  context: any,
): string {
  const userId = getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }
  if (!userHasCreatorStone(userId)) {
    return JSON.stringify({ ok: false, error: "Editing rights required" });
  }

  const args = context.args || {};
  const action = String(args.action || "list");

  if (action === "list") {
    refreshLivingClassCache();
    return JSON.stringify({
      ok: true,
      living_classes: getAllLivingClasses(),
    });
  }

  if (action === "get") {
    refreshLivingClassCache();
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    const cls = getLivingClassWithRefresh(id);
    if (!cls)
      return JSON.stringify({ ok: false, error: "Living class not found" });
    return JSON.stringify({ ok: true, living_class: cls });
  }

  if (action === "create" || action === "update") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    refreshLivingClassCache();
    let existing: ReturnType<typeof getLivingClassWithRefresh> = null;
    if (action === "update") {
      existing = getLivingClassWithRefresh(id);
      if (!existing)
        return JSON.stringify({ ok: false, error: "Living class not found" });
      if (!canManageClass(userId, existing.ownerIds)) {
        return JSON.stringify({ ok: false, error: "Not class owner" });
      }
    }
    const record = {
      id,
      kind: (args.kind === "player" ? "player" : "creature") as
        "player" | "creature",
      slotDefinitions: Array.isArray(args.slotDefinitions)
        ? args.slotDefinitions
        : [],
      valueTemplate:
        args.valueTemplate && typeof args.valueTemplate === "object"
          ? args.valueTemplate
          : {},
      valueSchema:
        args.valueSchema && typeof args.valueSchema === "object"
          ? args.valueSchema
          : undefined,
      ownerIds: existing
        ? normalizeOwnerIdsInput(args.ownerIds) || existing.ownerIds
        : [userId],
    };
    const writeResult = upsertLivingClass(record);
    if (!writeResult || !writeResult.ok) {
      return JSON.stringify({
        ok: false,
        error:
          "Living class upsert failed" +
          (writeResult && writeResult.error
            ? ": " + String(writeResult.error)
            : ""),
      });
    }
    refreshLivingClassCache();
    return JSON.stringify({ ok: true, living_class: record });
  }

  if (action === "delete") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    const existing = getLivingClassWithRefresh(id);
    if (existing && !canManageClass(userId, existing.ownerIds)) {
      return JSON.stringify({ ok: false, error: "Not class owner" });
    }
    deleteLivingClass(id);
    return JSON.stringify({ ok: true, deleted_id: id });
  }

  return JSON.stringify({ ok: false, error: "Unknown action: " + action });
}

export function virtualWorldManageWorldClassesToolHandler(
  context: any,
): string {
  const userId = getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }
  if (!userHasCreatorStone(userId)) {
    return JSON.stringify({ ok: false, error: "Editing rights required" });
  }

  const args = context.args || {};
  const action = String(args.action || "list");

  if (action === "list") {
    refreshWorldClassCache();
    return JSON.stringify({
      ok: true,
      world_classes: getAllWorldClasses(),
    });
  }

  if (action === "get") {
    refreshWorldClassCache();
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    const cls = getWorldClassWithRefresh(id);
    if (!cls)
      return JSON.stringify({ ok: false, error: "World class not found" });
    return JSON.stringify({ ok: true, world_class: cls });
  }

  if (action === "create" || action === "update") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    refreshWorldClassCache();
    const existing = getWorldClassWithRefresh(id);
    if (action === "update") {
      if (!existing) {
        return JSON.stringify({ ok: false, error: "World class not found" });
      }
      if (!canManageClass(userId, existing.ownerIds)) {
        return JSON.stringify({ ok: false, error: "Not class owner" });
      }
    }
    const record = normalizeWorldClassRecord({
      id,
      baseType:
        args.baseType !== undefined
          ? args.baseType
          : existing && existing.baseType,
      rows: args.rows !== undefined ? args.rows : existing && existing.rows,
      cols: args.cols !== undefined ? args.cols : existing && existing.cols,
      labelKey:
        args.labelKey !== undefined
          ? args.labelKey
          : existing && existing.labelKey,
      fallbackLabel:
        args.fallbackLabel !== undefined
          ? args.fallbackLabel
          : existing && existing.fallbackLabel,
      itemSpawns:
        args.itemSpawns !== undefined
          ? args.itemSpawns
          : existing && existing.itemSpawns,
      npcSpawns:
        args.npcSpawns !== undefined
          ? args.npcSpawns
          : existing && existing.npcSpawns,
      ownerIds:
        action === "update"
          ? normalizeOwnerIdsInput(args.ownerIds) ||
            (existing && existing.ownerIds)
          : [userId],
    });
    const writeResult = upsertWorldClass(record);
    if (!writeResult || !writeResult.ok) {
      return JSON.stringify({
        ok: false,
        error:
          "World class upsert failed" +
          (writeResult && writeResult.error
            ? ": " + String(writeResult.error)
            : ""),
      });
    }
    return JSON.stringify({ ok: true, world_class: record });
  }

  if (action === "delete") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    if (isBuiltinWorldClassId(id)) {
      return JSON.stringify({
        ok: false,
        error: "Built-in world classes cannot be deleted",
      });
    }
    const existingForDelete = getWorldClassWithRefresh(id);
    if (
      existingForDelete &&
      !canManageClass(userId, existingForDelete.ownerIds)
    ) {
      return JSON.stringify({ ok: false, error: "Not class owner" });
    }
    deleteWorldClass(id);
    return JSON.stringify({ ok: true, deleted_id: id });
  }

  return JSON.stringify({ ok: false, error: "Unknown action: " + action });
}
