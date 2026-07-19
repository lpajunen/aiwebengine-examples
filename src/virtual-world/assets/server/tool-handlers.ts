import { buildInventorySelectors } from "./world-domain.ts";

type ItemClassHandlerDeps = {
  getAuthenticatedUserId: (context: any) => string | null;
  hasEditingRights: (userId: string) => boolean;
  refreshItemClasses: () => void;
  getAllItemClasses: () => any[];
  getItemClass: (id: string) => any | undefined;
  upsertItemClass: (record: any) => { ok: boolean; error?: string };
  deleteItemClass: (id: string) => void;
};

type ActionClassHandlerDeps = {
  getAuthenticatedUserId: (context: any) => string | null;
  hasEditingRights: (userId: string) => boolean;
  refreshActionClasses: () => void;
  getAllActionClasses: () => any[];
  getActionClass: (id: string) => any | undefined;
  upsertActionClass: (record: any) => { ok: boolean; error?: string };
  deleteActionClass: (id: string) => void;
};

type LivingClassHandlerDeps = {
  getAuthenticatedUserId: (context: any) => string | null;
  hasEditingRights: (userId: string) => boolean;
  refreshLivingClasses: () => void;
  getAllLivingClasses: () => any[];
  getLivingClass: (id: string) => any | null;
  upsertLivingClass: (record: any) => { ok: boolean; error?: string };
  deleteLivingClass: (id: string) => void;
};

type ToolHandlerDeps = {
  getAuthenticatedUserId: (context: any) => string | null;
  getCurrentWorldStateForUser: (userId: string) => any;
  normalizeMoveDirection: (direction: any) => string;
  getOrCreatePlayerWorld: (userId: string) => string;
  getCanonicalPlayerState: (
    worldId: string,
    userId: string,
  ) => {
    row: number;
    col: number;
    seq: number;
    rotation: number;
  };
  getMoveOptions: (
    worldId: string,
    canonical: any,
  ) => Record<string, { row: number; col: number }>;
  rotationForDirection: (direction: string) => number | null;
  movePlayerForUser: (
    userId: string,
    body: any,
  ) => { status: number; payload: any };
  handleItemActionForUser: (
    userId: string,
    body: any,
  ) => { status: number; payload: any };
  getPlayerWorld: (userId: string) => string;
  savePlayerNick: (userId: string, nick: string) => void;
  updateOnlinePresence: (
    userId: string,
    worldId: string,
    sessionId: string,
  ) => any;
  performTreeActionForUser: (
    userId: string,
    body: any,
  ) => { status: number; payload: any };
  grantAllItemsForUser: (userId: string) => any;
  sendGlobalPresenceEvent: (
    action: string,
    userId: string,
    worldId: string,
    nick: string,
    loginAt?: number,
    lastActive?: number,
    extra?: any,
  ) => void;
  getEffectiveNick: (userId: string) => string;
};

export function virtualWorldGetStateToolHandler(
  context: any,
  deps: Pick<
    ToolHandlerDeps,
    "getAuthenticatedUserId" | "getCurrentWorldStateForUser"
  >,
): string {
  const userId = deps.getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }
  return JSON.stringify(deps.getCurrentWorldStateForUser(userId));
}

export function virtualWorldMoveToolHandler(
  context: any,
  deps: Pick<
    ToolHandlerDeps,
    | "getAuthenticatedUserId"
    | "normalizeMoveDirection"
    | "getOrCreatePlayerWorld"
    | "getCanonicalPlayerState"
    | "getMoveOptions"
    | "rotationForDirection"
    | "movePlayerForUser"
  >,
): string {
  const userId = deps.getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }

  const args = context.args || {};
  const direction = deps.normalizeMoveDirection(args.direction);
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

  const worldId = deps.getOrCreatePlayerWorld(userId);
  const canonical = deps.getCanonicalPlayerState(worldId, userId);
  const moveOptions = deps.getMoveOptions(String(worldId), canonical);
  const target = moveOptions[direction];
  const rotation = Number.isFinite(Number(args.rotation))
    ? Number(args.rotation)
    : deps.rotationForDirection(direction);
  const result = deps.movePlayerForUser(userId, {
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

export function virtualWorldManageItemsToolHandler(
  context: any,
  deps: Pick<
    ToolHandlerDeps,
    | "getAuthenticatedUserId"
    | "getCurrentWorldStateForUser"
    | "handleItemActionForUser"
    | "getPlayerWorld"
  >,
): string {
  const userId = deps.getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }

  const args = context.args || {};
  const action = String(args.action || "list");
  if (action === "list") {
    const state = deps.getCurrentWorldStateForUser(userId);
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

  const result = deps.handleItemActionForUser(userId, {
    action: action,
    from: args.from,
    to: args.to,
    index: args.index,
  });
  result.payload.status = result.status;
  result.payload.world_id = deps.getPlayerWorld(userId);
  if (result && result.payload && result.payload.inventory) {
    const selectors = buildInventorySelectors(result.payload.inventory);
    result.payload.inventory_slot_ids = selectors.inventory_slot_ids;
    result.payload.inventory_selectors = selectors.inventory_selectors;
  }
  return JSON.stringify(result.payload);
}

export function virtualWorldActToolHandler(
  context: any,
  deps: Pick<
    ToolHandlerDeps,
    | "getAuthenticatedUserId"
    | "getOrCreatePlayerWorld"
    | "getCanonicalPlayerState"
    | "performTreeActionForUser"
  >,
): string {
  const userId = deps.getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }

  const args = context.args || {};
  const worldId = deps.getOrCreatePlayerWorld(userId);
  const canonical = deps.getCanonicalPlayerState(worldId, userId);
  const result = deps.performTreeActionForUser(userId, {
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

export function virtualWorldSetNicknameToolHandler(
  context: any,
  deps: Pick<
    ToolHandlerDeps,
    | "getAuthenticatedUserId"
    | "savePlayerNick"
    | "getPlayerWorld"
    | "updateOnlinePresence"
    | "grantAllItemsForUser"
    | "sendGlobalPresenceEvent"
    | "getEffectiveNick"
  >,
): string {
  const userId = deps.getAuthenticatedUserId(context);
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
    const cheatResult = deps.grantAllItemsForUser(userId);
    const selectors = buildInventorySelectors(cheatResult.inventory);
    const currentWorldId = deps.getPlayerWorld(userId);
    if (currentWorldId) {
      const existingNick = deps.getEffectiveNick(userId);
      deps.sendGlobalPresenceEvent(
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
    deps.savePlayerNick(userId, sanitized);
  } catch (e) {
    return JSON.stringify({ status: 500, error: "Failed to save nickname" });
  }

  try {
    const currentWorldId = deps.getPlayerWorld(userId);
    if (currentWorldId) {
      deps.updateOnlinePresence(userId, String(currentWorldId), "");
    }
  } catch (e) {
    // ignore presence update errors
  }

  return JSON.stringify({ status: 200, ok: true, nick: sanitized });
}

export function virtualWorldManageItemClassesToolHandler(
  context: any,
  deps: ItemClassHandlerDeps,
): string {
  const userId = deps.getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }
  if (!deps.hasEditingRights(userId)) {
    return JSON.stringify({ ok: false, error: "Editing rights required" });
  }

  const args = context.args || {};
  const action = String(args.action || "list");

  if (action === "list") {
    deps.refreshItemClasses();
    return JSON.stringify({ ok: true, item_classes: deps.getAllItemClasses() });
  }

  if (action === "get") {
    deps.refreshItemClasses();
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    const cls = deps.getItemClass(id);
    if (!cls)
      return JSON.stringify({ ok: false, error: "Item class not found" });
    return JSON.stringify({ ok: true, item_class: cls });
  }

  if (action === "create" || action === "update") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    deps.refreshItemClasses();
    if (action === "update") {
      const existing = deps.getItemClass(id);
      if (!existing)
        return JSON.stringify({ ok: false, error: "Item class not found" });
    }
    const record = {
      id,
      kind: String(args.kind || "tool"),
      spawnable: !!args.spawnable,
      extra: !!args.extra,
      nonDroppable: !!args.nonDroppable,
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
    };
    const writeResult = deps.upsertItemClass(record);
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
    deps.refreshItemClasses();
    return JSON.stringify({ ok: true, item_class: record });
  }

  if (action === "delete") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    deps.deleteItemClass(id);
    return JSON.stringify({ ok: true, deleted_id: id });
  }

  return JSON.stringify({ ok: false, error: "Unknown action: " + action });
}

export function virtualWorldManageActionClassesToolHandler(
  context: any,
  deps: ActionClassHandlerDeps,
): string {
  const userId = deps.getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }
  if (!deps.hasEditingRights(userId)) {
    return JSON.stringify({ ok: false, error: "Editing rights required" });
  }

  const args = context.args || {};
  const action = String(args.action || "list");

  if (action === "list") {
    deps.refreshActionClasses();
    return JSON.stringify({
      ok: true,
      action_classes: deps.getAllActionClasses(),
    });
  }

  if (action === "get") {
    deps.refreshActionClasses();
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    const cls = deps.getActionClass(id);
    if (!cls)
      return JSON.stringify({ ok: false, error: "Action class not found" });
    return JSON.stringify({ ok: true, action_class: cls });
  }

  if (action === "create" || action === "update") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    deps.refreshActionClasses();
    if (action === "update") {
      const existing = deps.getActionClass(id);
      if (!existing)
        return JSON.stringify({ ok: false, error: "Action class not found" });
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
    };
    const writeResult = deps.upsertActionClass(record);
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
    deps.refreshActionClasses();
    return JSON.stringify({ ok: true, action_class: record });
  }

  if (action === "delete") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    deps.deleteActionClass(id);
    return JSON.stringify({ ok: true, deleted_id: id });
  }

  return JSON.stringify({ ok: false, error: "Unknown action: " + action });
}

export function virtualWorldManageLivingClassesToolHandler(
  context: any,
  deps: LivingClassHandlerDeps,
): string {
  const userId = deps.getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }
  if (!deps.hasEditingRights(userId)) {
    return JSON.stringify({ ok: false, error: "Editing rights required" });
  }

  const args = context.args || {};
  const action = String(args.action || "list");

  if (action === "list") {
    deps.refreshLivingClasses();
    return JSON.stringify({
      ok: true,
      living_classes: deps.getAllLivingClasses(),
    });
  }

  if (action === "get") {
    deps.refreshLivingClasses();
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    const cls = deps.getLivingClass(id);
    if (!cls)
      return JSON.stringify({ ok: false, error: "Living class not found" });
    return JSON.stringify({ ok: true, living_class: cls });
  }

  if (action === "create" || action === "update") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    deps.refreshLivingClasses();
    if (action === "update") {
      const existing = deps.getLivingClass(id);
      if (!existing)
        return JSON.stringify({ ok: false, error: "Living class not found" });
    }
    const record = {
      id,
      kind: String(args.kind || "creature"),
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
    };
    const writeResult = deps.upsertLivingClass(record);
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
    deps.refreshLivingClasses();
    return JSON.stringify({ ok: true, living_class: record });
  }

  if (action === "delete") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    deps.deleteLivingClass(id);
    return JSON.stringify({ ok: true, deleted_id: id });
  }

  return JSON.stringify({ ok: false, error: "Unknown action: " + action });
}

type WorldClassHandlerDeps = {
  getAuthenticatedUserId: (context: any) => string | null;
  hasEditingRights: (userId: string) => boolean;
  refreshWorldClasses: () => void;
  getAllWorldClasses: () => any[];
  getWorldClass: (id: string) => any | null;
  upsertWorldClass: (record: any) => { ok: boolean; error?: string };
  deleteWorldClass: (id: string) => void;
  isBuiltinWorldClassId: (id: string) => boolean;
  normalizeWorldClassRecord: (record: any) => any;
};

export function virtualWorldManageWorldClassesToolHandler(
  context: any,
  deps: WorldClassHandlerDeps,
): string {
  const userId = deps.getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }
  if (!deps.hasEditingRights(userId)) {
    return JSON.stringify({ ok: false, error: "Editing rights required" });
  }

  const args = context.args || {};
  const action = String(args.action || "list");

  if (action === "list") {
    deps.refreshWorldClasses();
    return JSON.stringify({
      ok: true,
      world_classes: deps.getAllWorldClasses(),
    });
  }

  if (action === "get") {
    deps.refreshWorldClasses();
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    const cls = deps.getWorldClass(id);
    if (!cls)
      return JSON.stringify({ ok: false, error: "World class not found" });
    return JSON.stringify({ ok: true, world_class: cls });
  }

  if (action === "create" || action === "update") {
    const id = String(args.id || "").trim();
    if (!id) return JSON.stringify({ ok: false, error: "Missing id" });
    deps.refreshWorldClasses();
    const existing = deps.getWorldClass(id);
    if (action === "update" && !existing) {
      return JSON.stringify({ ok: false, error: "World class not found" });
    }
    const record = deps.normalizeWorldClassRecord({
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
    });
    const writeResult = deps.upsertWorldClass(record);
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
    if (deps.isBuiltinWorldClassId(id)) {
      return JSON.stringify({
        ok: false,
        error: "Built-in world classes cannot be deleted",
      });
    }
    deps.deleteWorldClass(id);
    return JSON.stringify({ ok: true, deleted_id: id });
  }

  return JSON.stringify({ ok: false, error: "Unknown action: " + action });
}
