/// <reference path="../../types/aiwebengine.d.ts" />

import {
  canInventoryUseTreeAction,
  canTileItemsUseTreeAction,
  createWorldId,
  getAllKnownItemTypes,
  getActionsForItemType,
  getInventoryTreeActions,
  getNPCDisplayName,
  getWorldFlavorTextByIndex,
  getWorldFlavorTextIndex,
  hashString,
  ITEM_TYPES,
  OAK_CENTER_COL,
  OAK_CENTER_ROW,
  OAK_WORLD_ID,
  applyOakReservation,
  buildInventorySelectors,
  canonicalTreeAction,
  findFirstLivingItemByTypes,
  getOakClearingTiles,
  isOakCenterTile,
  isOakClearingTile,
  isOakWorld,
  isWorldTileWalkable,
  normalizeWorldType,
  TREE_ACTION_BY_ITEM_TYPE,
  WORLD_MOD_LAYER_OBJECT,
  WORLD_MOD_LAYER_TERRAIN,
  WORLD_TILE_DEFS,
  WORLD_TILE_NAME_BY_VALUE,
  WORLD_TYPE_FOREST,
  worldTileValueForName,
  worldTypeForPortalBuildAction,
} from "./server/world-domain.ts";
import {
  deleteWorldRow,
  deleteWorldRowsWhere,
  insertWorldRow,
  parseWorldDbResult,
  querySingleWorldRow,
  queryWorldRows,
  runInWorldTransaction,
  updateWorldRow,
  upsertWorldRow,
} from "./server/world-db.ts";
import {
  deletePlayerHeartbeat,
  deletePlayerMoveLease,
  deletePlayerPosition,
  getPlayerWorld,
  loadAllPlayerPositions,
  loadPlayerHeartbeatMap,
  loadPlayerHeartbeatTs,
  loadPlayerMoveLease,
  loadPlayerPosition,
  markPlayerPositionInactive,
  normalizePlayerPositionRow,
  savePlayerHeartbeatTs,
  savePlayerMoveLease,
  savePlayerPosition,
  savePlayerWorld,
} from "./server/player-persistence.ts";
import {
  buildActiveWorldPlayers,
  getCanonicalPlayerState,
  getDefaultSpawnPosition,
  loadWorldPlayers,
} from "./server/player-snapshots.ts";
import {
  createEmptyWorldMods,
  loadWorldHouses,
  loadWorldMods,
  loadWorldTrees,
  parseWorldModPayload,
  saveWorldHouses,
  saveWorldModLayer,
  saveWorldTrees,
} from "./server/world-mod-storage.ts";
import {
  broadcastItemChange,
  sendRecipientScopedStreamEvent,
  sendVirtualWorldStreamEvent,
  sendWorldScopedStreamEvent,
} from "./server/stream-broadcast.ts";
import {
  buildOnlinePlayersSnapshot,
  deleteOnlinePresence,
  getEffectiveNick,
  loadPlayerNick,
  savePlayerNick,
  updateOnlinePresence,
} from "./server/social-state.ts";
import {
  deleteWorldItemById,
  deleteWorldItems,
  ensureWorldItems,
  flattenWorldItems,
  loadPlayerInventory,
  loadWorldItemMeta,
  loadWorldItems,
  nextWorldItemId,
  savePlayerInventory,
  saveWorldItemMeta,
  saveWorldItems,
  upsertWorldItem,
} from "./server/item-storage.ts";
import {
  grantAllItemsForUser as grantAllItemsForUserImpl,
  handleItemActionForUser as handleItemActionForUserImpl,
} from "./server/item-action-helpers.ts";
import { craftRecipeForUser as craftRecipeForUserImpl } from "./server/crafting-helpers.ts";
import {
  switchUserToNewWorld as switchUserToNewWorldImpl,
  switchUserToStartWorld as switchUserToStartWorldImpl,
  switchUserWorld,
} from "./server/world-switch.ts";
import {
  createWorldOfType,
  getEffectiveMap,
  getOrCreatePlayerWorld,
  getWorldDimensions,
  getWorldInfo as getWorldInfoImpl,
  getWorldType,
  resolvePortalDestinationWorldType,
  saveWorldType,
} from "./server/world-bootstrap.ts";
import {
  ensureChatDatabaseSchema,
  ensureLateWorldDatabaseSchema,
  ensureWorldDatabaseSchema,
  runChatSchemaStep,
  runWorldSchemaStep,
} from "./server/schema-setup.ts";
import { allocateEventSeq, getCurrentEventSeq } from "./server/event-seq.ts";
import {
  buildResyncForUser as buildResyncForUserImpl,
  getCurrentWorldStateForHttpUser as getCurrentWorldStateForHttpUserImpl,
  getDirectMessageHistoryForUser as getDirectMessageHistoryForUserImpl,
  heartbeatForUser as heartbeatForUserImpl,
  leaveWorldForUser as leaveWorldForUserImpl,
  listItemsForUser as listItemsForUserImpl,
  listNPCsForUser as listNPCsForUserImpl,
  listOnlinePlayersForUser as listOnlinePlayersForUserImpl,
  listPlayersForUser as listPlayersForUserImpl,
  postDirectMessageForUser as postDirectMessageForUserImpl,
  postWorldChatForUser as postWorldChatForUserImpl,
  setNicknameForUser as setNicknameForUserImpl,
} from "./server/http-handler-helpers.ts";
import {
  getAvailableWorldActions,
  getCurrentWorldStateForUser,
  getMoveOptions,
  getTargetTileFromRotation,
  normalizeMoveDirection,
  rotationForDirection,
  worldTileNameForValue,
} from "./server/current-world-state.ts";
import { movePlayerForUser } from "./server/move-player.ts";
import {
  buildVirtualWorldPageState as buildVirtualWorldPageStateImpl,
  ensureStarterKit,
  escapeHtml,
  renderVirtualWorldPageHtml as renderVirtualWorldPageHtmlImpl,
} from "./server/page-bootstrap.ts";
import { getBootstrapRegistry } from "./server/item-registry.ts";
import { getActionDefinition } from "./server/item-registry.ts";
import {
  bootstrapItemClasses as bootstrapItemClassesImpl,
  refreshItemClassCache as refreshItemClassCacheImpl,
  getAllItemClasses as getAllItemClassesImpl,
  getItemClass as getItemClassImpl,
  upsertItemClass as upsertItemClassImpl,
  deleteItemClass as deleteItemClassImpl,
  getItemStateTemplate as getItemStateTemplateImpl,
  bootstrapActionClasses as bootstrapActionClassesImpl,
  refreshActionClassCache as refreshActionClassCacheImpl,
  getAllActionClasses as getAllActionClassesImpl,
  getActionClass as getActionClassImpl,
  upsertActionClass as upsertActionClassImpl,
  deleteActionClass as deleteActionClassImpl,
} from "./server/item-registry.ts";
import {
  bootstrapLivingClasses as bootstrapLivingClassesImpl,
  deleteLivingClass as deleteLivingClassImpl,
  getAllLivingClasses,
  getLivingClass as getLivingClassImpl,
  refreshLivingClassCache as refreshLivingClassCacheImpl,
  upsertLivingClass as upsertLivingClassImpl,
} from "./server/living-registry.ts";
import {
  bootstrapWorldClasses as bootstrapWorldClassesImpl,
  deleteWorldClass as deleteWorldClassImpl,
  getAllWorldClasses as getAllWorldClassesImpl,
  getWorldClass as getWorldClassImpl,
  isBuiltinWorldClassId as isBuiltinWorldClassIdImpl,
  normalizeWorldClassRecord as normalizeWorldClassRecordImpl,
  refreshWorldClassCache as refreshWorldClassCacheImpl,
  upsertWorldClass as upsertWorldClassImpl,
} from "./server/world-class-storage.ts";
import { performTreeActionForUser as performTreeActionForUserImpl } from "./server/tree-action-helpers.ts";
import {
  virtualWorldActToolHandler,
  virtualWorldGetStateToolHandler,
  virtualWorldManageItemsToolHandler,
  virtualWorldMoveToolHandler,
  virtualWorldSetNicknameToolHandler,
  virtualWorldManageItemClassesToolHandler,
  virtualWorldManageActionClassesToolHandler,
  virtualWorldManageLivingClassesToolHandler,
  virtualWorldManageWorldClassesToolHandler,
} from "./server/tool-handlers.ts";
import {
  addToDMIndex,
  appendDMMessage,
  appendWorldChatMessage,
  dmConversationKey,
  loadDMHistory,
  loadDMIndex,
  loadWorldChat,
} from "./server/chat-storage.ts";
import {
  buildWorldNPCSnapshot as buildWorldNPCSnapshotImpl,
  loadNPCActiveWorlds,
  loadNPCLastTick,
  loadWorldNPCs,
  markNPCWorldActive,
  saveNPCActiveWorlds,
  saveNPCLastTick,
  saveWorldNPCs,
  ensureWorldNPCs,
} from "./server/npc-storage.ts";
import {
  buildOccupiedNPCMap as buildOccupiedNPCMapImpl,
  buildOccupiedPlayerMap as buildOccupiedPlayerMapImpl,
  normalizeNPCInventoryState as normalizeNPCInventoryStateImpl,
  tickNPCItemInteractions as tickNPCItemInteractionsImpl,
  tickNPCMovement as tickNPCMovementImpl,
  tickNPCTreeActions as tickNPCTreeActionsImpl,
} from "./server/npc-tick-helpers.ts";
import {
  maybeTickWorldNPCs,
  registerRecurringNPCTick,
  runNPCTick,
  tickWorldNPCs,
  tryAcquireNPCTickLease as tryAcquireNPCTickLeaseImpl,
  tryTickWorldNPCs,
} from "./server/npc-orchestration.ts";
import { registerVirtualWorldRuntime as registerVirtualWorldRuntimeImpl } from "./server/runtime-registration.ts";
import { generateWorldMap } from "./server/world-map.ts";
import {
  DM_MAX,
  LEASE_TTL_MS,
  NPC_ACTIVE_WORLD_TTL_MS,
  NPC_MAX_COUNT,
  NPC_MIN_COUNT,
  NPC_TICK_LEASE_MS,
  NPC_TICK_MS,
  VIRTUAL_WORLD_EVENTS_STREAM_PATH,
  VWORLD_ACTION_CLASS_TABLE,
  VWORLD_CHAT_TABLE,
  VWORLD_DM_INDEX_TABLE,
  VWORLD_DM_TABLE,
  VWORLD_ITEM_CLASS_TABLE,
  VWORLD_LIVING_CLASS_TABLE,
  VWORLD_NPC_TABLE,
  VWORLD_NPC_TICK_LEASE_TABLE,
  VWORLD_NPC_TICK_TABLE,
  VWORLD_WORLD_CLASS_TABLE,
  WORLD_CHAT_MAX,
  WORLD_ITEM_SPAWN_COUNT,
} from "./server/runtime-config.ts";
import {
  nextDiagRequestId,
  vwLog,
  summarizeInventory,
  summarizeItems,
  vwDiag,
} from "./server/diagnostics.ts";

// Virtual World - 2.5D block world with Three.js
// Move with WASD or arrow keys. Walls and trees block movement.

// ── Server-side world generation ─────────────────────────────────────────────
var npcTickerStarted = false;
var npcTickOwnerId =
  "npc-tick-" +
  Date.now().toString(36) +
  "-" +
  Math.random().toString(36).slice(2);

/**
 * @param {*} context
 */
function getVirtualWorldPage(context) {
  const req = context.request;
  if (!req.auth || !req.auth.isAuthenticated) {
    return ResponseBuilder.redirect(
      "/auth/login?redirect=" + encodeURIComponent("/virtual-world/play"),
    );
  }
  const state = buildVirtualWorldPageStateImpl(
    req.auth.userId,
    req.auth.userName || "",
  );
  return ResponseBuilder.html(renderVirtualWorldPageHtmlImpl(state));
}

// ── Player nicknames ──────────────────────────────────────────────────────────

// ── Global online presence ────────────────────────────────────────────────────

/**
 * @param {string} action
 * @param {string} userId
 * @param {string} worldId
 * @param {string} nick
 * @param {number} [loginAt]
 * @param {number} [lastActive]
 * @param {any} [extra]
 */
function sendGlobalPresenceEvent(
  action,
  userId,
  worldId,
  nick,
  loginAt,
  lastActive,
  extra = undefined,
) {
  var payload = {
    action: String(action || "upsert"),
    player_id: String(userId || ""),
    nick: String(nick || getEffectiveNick(userId)),
    world_id: String(worldId || ""),
    login_at: Number(loginAt || Date.now()),
    last_active: Number(lastActive || Date.now()),
  };
  if (extra && typeof extra === "object") {
    Object.assign(payload, extra);
  }
  sendVirtualWorldStreamEvent("presence_update", payload, {});
}

// ── World chat ────────────────────────────────────────────────────────────────

// ── Direct messages ───────────────────────────────────────────────────────────

/**
 * @param {*} context
 * @returns {Record<string, string>}
 */
function virtualWorldEventsStreamCustomizer(context) {
  var userId =
    context &&
    context.request &&
    context.request.auth &&
    context.request.auth.userId;
  if (!userId) return {};
  var currentWorldId = getPlayerWorld(String(userId));
  /** @type {Record<string, string>} */
  var filter = { recipient_id: String(userId) };
  if (currentWorldId) {
    filter.world_id = String(currentWorldId);
  }
  return filter;
}

/**
 * @param {string} worldId
 * @param {number} now
 * @returns {boolean}
 */
function tryAcquireNPCTickLease(worldId, now) {
  return tryAcquireNPCTickLeaseImpl(worldId);
}

/**
 * @param {*} _context
 */
function runNPCTickScheduledJob(_context) {
  runNPCTick();
}

function startNPCTicker() {
  if (npcTickerStarted) return;
  npcTickerStarted = true;
  registerRecurringNPCTick();
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
function performTreeActionForUser(userId, body) {
  return runInWorldTransaction("tree_action", function () {
    return performTreeActionForUserInner(userId, body);
  });
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
function performTreeActionForUserInner(userId, body) {
  return performTreeActionForUserImpl(userId, body);
}

/**
 * @param {*} context
 */
function itemsHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(listItemsForUserImpl(userId));
}

/**
 * @param {any} payload
 * @returns {any}
 */
function withInventorySelectors(payload) {
  if (!payload || typeof payload !== "object" || !payload.inventory) {
    return payload;
  }
  var selectors = buildInventorySelectors(payload.inventory);
  payload.inventory_slot_ids = selectors.inventory_slot_ids;
  payload.inventory_selectors = selectors.inventory_selectors;
  return payload;
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
function handleItemActionForUser(userId, body) {
  return runInWorldTransaction("item_action", function () {
    return handleItemActionForUserImpl(userId, body);
  });
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
function craftRecipeForUser(userId, body) {
  return runInWorldTransaction("craft", function () {
    return craftRecipeForUserInner(userId, body);
  });
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
function craftRecipeForUserInner(userId, body) {
  return craftRecipeForUserImpl(userId, body);
}

/**
 * @param {*} context
 */
function itemActionHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON body" }, 400);
  }

  var itemRid = nextDiagRequestId();
  var worldIdBefore = getPlayerWorld(userId) || "";
  var posBefore = worldIdBefore
    ? getCanonicalPlayerState(worldIdBefore, userId)
    : null;
  var invBefore = loadPlayerInventory(userId);
  vwDiag("item_action.request", {
    rid: itemRid,
    user_id: userId,
    action: body && body.action ? String(body.action) : "",
    body: body,
    world_id: worldIdBefore,
    position_before: posBefore,
    inventory_before: summarizeInventory(invBefore),
  });

  var handled = handleItemActionForUser(userId, body);
  var worldIdAfter = getPlayerWorld(userId) || worldIdBefore;
  var posAfter = worldIdAfter
    ? getCanonicalPlayerState(worldIdAfter, userId)
    : null;
  var invAfter = loadPlayerInventory(userId);
  var tileItemsAfter = [];
  if (worldIdAfter && posAfter) {
    var tileKeyAfter = String(posAfter.row) + "_" + String(posAfter.col);
    var worldItemsAfter = loadWorldItems(worldIdAfter);
    tileItemsAfter = Array.isArray(worldItemsAfter[tileKeyAfter])
      ? worldItemsAfter[tileKeyAfter]
      : [];
  }
  vwDiag("item_action.result", {
    rid: itemRid,
    user_id: userId,
    status: handled.status,
    ok: !!(handled.payload && handled.payload.ok),
    error:
      handled.payload && handled.payload.error
        ? String(handled.payload.error)
        : "",
    world_id: worldIdAfter,
    position_after: posAfter,
    inventory_after: summarizeInventory(invAfter),
    tile_items_after: summarizeItems(tileItemsAfter),
  });
  return ResponseBuilder.json(
    withInventorySelectors(handled.payload),
    handled.status,
  );
}

/**
 * @param {*} context
 */
function craftHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON body" }, 400);
  }

  var handled = craftRecipeForUser(userId, body);
  return ResponseBuilder.json(
    withInventorySelectors(handled.payload),
    handled.status,
  );
}

/**
 * @param {string} userId
 * @returns {{ok: boolean, action: string, granted_count: number, inventory: {class_id: string, slots: Record<string, any>, bag: any[], values: Record<string, any>}, items: Array<{id: string, type: string, row: number, col: number}>}}
 */
function grantAllItemsForUser(userId) {
  return runInWorldTransaction("cheat_grant_all", function () {
    return grantAllItemsForUserImpl(userId);
  });
}

// ── Nickname handler ─────────────────────────────────────────────────────────

/**
 * @param {*} context
 */
function setNicknameHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON" }, 400);
  }
  var handled = setNicknameForUserImpl(userId, body.nick);
  if (handled && handled.status === 200 && handled.payload) {
    if (handled.payload.nick) {
      var currentWorldId = getPlayerWorld(userId);
      if (currentWorldId) {
        updateOnlinePresence(userId, currentWorldId, "");
      }
    } else if (handled.payload.inventory && handled.payload.message) {
      var currentWorldId = getPlayerWorld(userId);
      if (currentWorldId) {
        var existingNick = getEffectiveNick(userId);
        var presenceSelectors = buildInventorySelectors(
          handled.payload.inventory,
        );
        sendGlobalPresenceEvent(
          "upsert",
          userId,
          currentWorldId,
          existingNick,
          Date.now(),
          Date.now(),
          {
            inventory: handled.payload.inventory,
            inventory_slot_ids: presenceSelectors.inventory_slot_ids,
            inventory_selectors: presenceSelectors.inventory_selectors,
            items: handled.payload.items,
            message: handled.payload.message,
          },
        );
      }
    }
  }
  return ResponseBuilder.json(
    withInventorySelectors(handled.payload),
    handled.status,
  );
}

// ── Online players handler ────────────────────────────────────────────────────

/**
 * @param {*} context
 */
function onlinePlayersHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(listOnlinePlayersForUserImpl(userId));
}

// ── World chat handler ────────────────────────────────────────────────────────

/**
 * @param {*} context
 */
function chatHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON" }, 400);
  }
  var handled = postWorldChatForUserImpl(userId, body.text);
  return ResponseBuilder.json(handled.payload, handled.status);
}

// ── Direct message handlers ───────────────────────────────────────────────────

/**
 * @param {*} context
 */
function dmHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON" }, 400);
  }
  var handled = postDirectMessageForUserImpl(userId, body.to, body.text);
  return ResponseBuilder.json(handled.payload, handled.status);
}

/**
 * @param {*} context
 */
function dmHistoryHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var handled = getDirectMessageHistoryForUserImpl(
    userId,
    context.request.query && context.request.query["with"],
  );
  return ResponseBuilder.json(handled.payload, handled.status);
}

/**
 * @param {*} context
 */
function cheatItemsHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(
    withInventorySelectors(grantAllItemsForUser(userId)),
  );
}

/**
 * @param {*} context
 */
function moveHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON body" }, 400);
  }
  var moveRid = nextDiagRequestId();
  var moveWorldBefore = getPlayerWorld(userId) || "";
  var moveBefore = moveWorldBefore
    ? getCanonicalPlayerState(moveWorldBefore, userId)
    : null;
  vwDiag("move.request", {
    rid: moveRid,
    user_id: userId,
    body: body,
    world_id: moveWorldBefore,
    position_before: moveBefore,
  });
  var handled = movePlayerForUser(userId, body);
  var moveWorldAfter = getPlayerWorld(userId) || moveWorldBefore;
  var moveAfter = moveWorldAfter
    ? getCanonicalPlayerState(moveWorldAfter, userId)
    : null;
  vwDiag("move.result", {
    rid: moveRid,
    user_id: userId,
    status: handled.status,
    ok: !!(handled.payload && handled.payload.ok),
    error:
      handled.payload && handled.payload.error
        ? String(handled.payload.error)
        : "",
    world_id: moveWorldAfter,
    position_after: moveAfter,
    payload: handled.payload,
  });
  return ResponseBuilder.json(handled.payload, handled.status);
}

/**
 * @param {*} context
 */
function leaveHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var sessionId = "";
  try {
    var body = JSON.parse(context.request.body || "{}");
    sessionId = body.session_id ? String(body.session_id) : "";
  } catch (e) {}
  return ResponseBuilder.json(leaveWorldForUserImpl(userId, sessionId));
}

/**
 * @param {*} context
 */
function heartbeatHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var sessionId = "";
  try {
    var body = JSON.parse(context.request.body || "{}");
    sessionId = body.session_id ? String(body.session_id) : "";
  } catch (e) {}
  return ResponseBuilder.json(heartbeatForUserImpl(userId, sessionId));
}

/**
 * @param {*} context
 */
function newWorldHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(
    switchUserToNewWorldImpl(userId, WORLD_TYPE_FOREST),
  );
}

/**
 * @param {*} context
 */
function startWorldHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(
    switchUserToStartWorldImpl(userId, OAK_WORLD_ID, WORLD_TYPE_FOREST),
  );
}

/**
 * @param {*} context
 */
function playersHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(listPlayersForUserImpl(userId));
}

/**
 * @param {*} context
 */
function resyncHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var result = buildResyncForUserImpl(userId);
  return ResponseBuilder.json(result.payload, result.status);
}

/**
 * @param {*} context
 */
function currentWorldHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var worldRid = nextDiagRequestId();
  var snapshot = getCurrentWorldStateForHttpUserImpl(userId);
  vwDiag("current_world.snapshot", {
    rid: worldRid,
    user_id: userId,
    ok: !!(snapshot && snapshot.ok),
    world_id: snapshot && snapshot.world_id ? String(snapshot.world_id) : "",
    player: snapshot && snapshot.player ? snapshot.player : null,
    inventory: summarizeInventory(snapshot && snapshot.inventory),
    tile_items: summarizeItems(snapshot && snapshot.tile_items),
    item_count: Array.isArray(snapshot && snapshot.items)
      ? snapshot.items.length
      : 0,
  });
  return ResponseBuilder.json(snapshot);
}

/**
 * @param {*} context
 */
function npcsHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(listNPCsForUserImpl(userId));
}

/**
 * @param {*} context
 */
function treeActionHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON body" }, 400);
  }
  var handled = performTreeActionForUser(userId, body);
  return ResponseBuilder.json(
    withInventorySelectors(handled.payload),
    handled.status,
  );
}

/**
 * @param {string} userId
 * @returns {boolean}
 */
function userHasCreatorStone(userId) {
  var inv = loadPlayerInventory(userId);
  return !!findFirstLivingItemByTypes(inv, ["creator_stone"]);
}

// ── Item class CRUD handlers ───────────────────────────────────────────────────

/**
 * @param {*} context
 */
function itemClassesHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  if (!userHasCreatorStone(userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  refreshItemClassCacheImpl();
  var classes = getAllItemClassesImpl();
  return ResponseBuilder.json({ ok: true, item_classes: classes });
}

/**
 * @param {*} context
 */
function createItemClassHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var id = String((body && body.id) || "").trim();
  if (!id) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var record = {
    id: id,
    kind: String((body && body.kind) || "tool"),
    spawnable: !!(body && body.spawnable),
    extra: !!(body && body.extra),
    nonDroppable: !!(body && body.nonDroppable),
    visuals: {
      color: Number((body && body.visuals && body.visuals.color) || 0),
      labelKey: String((body && body.visuals && body.visuals.labelKey) || ""),
      fallbackLabel: String(
        (body && body.visuals && body.visuals.fallbackLabel) || id,
      ),
    },
    actionIds: Array.isArray(body && body.actionIds) ? body.actionIds : [],
    stateTemplate:
      body && body.stateTemplate && typeof body.stateTemplate === "object"
        ? body.stateTemplate
        : {},
  };
  var itemCreateWrite = upsertItemClassImpl(record);
  if (!itemCreateWrite || !itemCreateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.item_class_upsert_failed" +
          (itemCreateWrite && itemCreateWrite.error
            ? ": " + String(itemCreateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, item_class: record });
}

/**
 * @param {*} context
 */
function updateItemClassHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var classId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!classId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var existing = getItemClassImpl(classId);
  if (!existing) {
    return ResponseBuilder.json(
      { ok: false, error: "error.item_class_not_found" },
      404,
    );
  }
  var record = {
    id: classId,
    kind: String((body && body.kind) || existing.kind),
    spawnable:
      body && body.spawnable !== undefined
        ? !!body.spawnable
        : existing.spawnable,
    extra: body && body.extra !== undefined ? !!body.extra : existing.extra,
    nonDroppable:
      body && body.nonDroppable !== undefined
        ? !!body.nonDroppable
        : existing.nonDroppable,
    visuals: {
      color: Number(
        body && body.visuals && body.visuals.color !== undefined
          ? body.visuals.color
          : existing.visuals.color,
      ),
      labelKey: String(
        (body && body.visuals && body.visuals.labelKey) ||
          existing.visuals.labelKey,
      ),
      fallbackLabel: String(
        (body && body.visuals && body.visuals.fallbackLabel) ||
          existing.visuals.fallbackLabel,
      ),
    },
    actionIds: Array.isArray(body && body.actionIds)
      ? body.actionIds
      : existing.actionIds,
    stateTemplate:
      body && body.stateTemplate && typeof body.stateTemplate === "object"
        ? body.stateTemplate
        : existing.stateTemplate,
  };
  var itemUpdateWrite = upsertItemClassImpl(record);
  if (!itemUpdateWrite || !itemUpdateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.item_class_upsert_failed" +
          (itemUpdateWrite && itemUpdateWrite.error
            ? ": " + String(itemUpdateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, item_class: record });
}

/**
 * @param {*} context
 */
function deleteItemClassHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var classId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!classId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  deleteItemClassImpl(classId);
  return ResponseBuilder.json({ ok: true, deleted_id: classId });
}

// ── Action class CRUD handlers ───────────────────────────────────────────

/**
 * @param {*} context
 */
function actionClassesHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  refreshActionClassCacheImpl();
  var classes = getAllActionClassesImpl();
  return ResponseBuilder.json({ ok: true, action_classes: classes });
}

/**
 * @param {*} context
 */
function createActionClassHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var id = String((body && body.id) || "").trim();
  if (!id) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var record = {
    id: id,
    labelKey: String((body && body.labelKey) || ""),
    fallbackLabel: String((body && body.fallbackLabel) || id),
    targetKind: String((body && body.targetKind) || "self"),
    sourceItemIds: Array.isArray(body && body.sourceItemIds)
      ? body.sourceItemIds
      : [],
    canonicalId:
      body && body.canonicalId ? String(body.canonicalId) : undefined,
    execution: body && body.execution ? body.execution : undefined,
    validation: body && body.validation ? body.validation : undefined,
    logicSpec: body && body.logicSpec ? body.logicSpec : undefined,
  };
  var actionCreateWrite = upsertActionClassImpl(record);
  if (!actionCreateWrite || !actionCreateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.action_class_upsert_failed" +
          (actionCreateWrite && actionCreateWrite.error
            ? ": " + String(actionCreateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, action_class: record });
}

/**
 * @param {*} context
 */
function updateActionClassHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var actionId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!actionId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var existing = getActionClassImpl(actionId);
  if (!existing) {
    return ResponseBuilder.json(
      { ok: false, error: "error.action_class_not_found" },
      404,
    );
  }
  var record = {
    id: actionId,
    labelKey: String(body && body.labelKey ? body.labelKey : existing.labelKey),
    fallbackLabel: String(
      body && body.fallbackLabel ? body.fallbackLabel : existing.fallbackLabel,
    ),
    targetKind: String(
      body && body.targetKind ? body.targetKind : existing.targetKind,
    ),
    sourceItemIds: Array.isArray(body && body.sourceItemIds)
      ? body.sourceItemIds
      : existing.sourceItemIds,
    canonicalId:
      body && body.canonicalId !== undefined
        ? body.canonicalId
          ? String(body.canonicalId)
          : undefined
        : existing.canonicalId,
    execution:
      body && body.execution !== undefined
        ? body.execution
        : existing.execution,
    validation:
      body && body.validation !== undefined
        ? body.validation
        : existing.validation,
    logicSpec:
      body && body.logicSpec !== undefined
        ? body.logicSpec
        : existing.logicSpec,
  };
  var actionUpdateWrite = upsertActionClassImpl(record);
  if (!actionUpdateWrite || !actionUpdateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.action_class_upsert_failed" +
          (actionUpdateWrite && actionUpdateWrite.error
            ? ": " + String(actionUpdateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, action_class: record });
}

/**
 * @param {*} context
 */
function deleteActionClassHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var actionId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!actionId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  deleteActionClassImpl(actionId);
  return ResponseBuilder.json({ ok: true, deleted_id: actionId });
}

// ── Living class CRUD handlers ────────────────────────────────────────────

/**
 * @param {*} context
 */
function livingClassesHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  refreshLivingClassCacheImpl();
  var classes = getAllLivingClasses();
  return ResponseBuilder.json({ ok: true, living_classes: classes });
}

/**
 * @param {*} value
 * @param {"player" | "npc" | "creature"} fallback
 * @returns {"player" | "npc" | "creature"}
 */
function normalizeLivingKind(value, fallback) {
  var kind = String(value || "");
  if (kind === "player" || kind === "npc" || kind === "creature") return kind;
  return fallback;
}

/**
 * @param {*} context
 */
function createLivingClassHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var id = String((body && body.id) || "").trim();
  if (!id) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var record = {
    id: id,
    kind: normalizeLivingKind(body && body.kind, "creature"),
    labelKey: String((body && body.labelKey) || ""),
    fallbackLabel: String((body && body.fallbackLabel) || id),
    slotDefinitions: Array.isArray(body && body.slotDefinitions)
      ? body.slotDefinitions
      : [],
    valueTemplate:
      body && body.valueTemplate && typeof body.valueTemplate === "object"
        ? body.valueTemplate
        : {},
    valueSchema:
      body && body.valueSchema && typeof body.valueSchema === "object"
        ? body.valueSchema
        : undefined,
  };
  var livingCreateWrite = upsertLivingClassImpl(record);
  if (!livingCreateWrite || !livingCreateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.living_class_upsert_failed" +
          (livingCreateWrite && livingCreateWrite.error
            ? ": " + String(livingCreateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, living_class: record });
}

/**
 * @param {*} context
 */
function updateLivingClassHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var classId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!classId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var existing = getLivingClassImpl(classId);
  if (!existing) {
    return ResponseBuilder.json(
      { ok: false, error: "error.living_class_not_found" },
      404,
    );
  }
  var record = {
    id: classId,
    kind: normalizeLivingKind(body && body.kind, existing.kind),
    labelKey:
      body && body.labelKey !== undefined
        ? String(body.labelKey || "")
        : existing.labelKey,
    fallbackLabel:
      body && body.fallbackLabel
        ? String(body.fallbackLabel)
        : existing.fallbackLabel,
    slotDefinitions: Array.isArray(body && body.slotDefinitions)
      ? body.slotDefinitions
      : existing.slotDefinitions,
    valueTemplate:
      body && body.valueTemplate && typeof body.valueTemplate === "object"
        ? body.valueTemplate
        : existing.valueTemplate,
    valueSchema:
      body && body.valueSchema && typeof body.valueSchema === "object"
        ? body.valueSchema
        : existing.valueSchema,
  };
  var livingUpdateWrite = upsertLivingClassImpl(record);
  if (!livingUpdateWrite || !livingUpdateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.living_class_upsert_failed" +
          (livingUpdateWrite && livingUpdateWrite.error
            ? ": " + String(livingUpdateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, living_class: record });
}

/**
 * @param {*} context
 */
function deleteLivingClassHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var classId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!classId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  deleteLivingClassImpl(classId);
  return ResponseBuilder.json({ ok: true, deleted_id: classId });
}

// ── World class CRUD handlers ──────────────────────────────────────────────

/**
 * @param {*} context
 */
function worldClassesHandler(context) {
  // Listing is not stone-gated: any player building a portal needs the world
  // type list. Mutations below remain creator's-stone only.
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  refreshWorldClassCacheImpl();
  return ResponseBuilder.json({
    ok: true,
    world_classes: getAllWorldClassesImpl(),
  });
}

/**
 * @param {*} context
 */
function createWorldClassHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var id = String((body && body.id) || "").trim();
  if (!id) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var record = normalizeWorldClassRecordImpl({
    id: id,
    baseType: body && body.baseType,
    rows: body && body.rows,
    cols: body && body.cols,
    labelKey: body && body.labelKey,
    fallbackLabel: body && body.fallbackLabel,
  });
  var worldCreateWrite = upsertWorldClassImpl(record);
  if (!worldCreateWrite || !worldCreateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.world_class_upsert_failed" +
          (worldCreateWrite && worldCreateWrite.error
            ? ": " + String(worldCreateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, world_class: record });
}

/**
 * @param {*} context
 */
function updateWorldClassHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var classId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!classId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var existing = getWorldClassImpl(classId);
  if (!existing) {
    return ResponseBuilder.json(
      { ok: false, error: "error.world_class_not_found" },
      404,
    );
  }
  var record = normalizeWorldClassRecordImpl({
    id: classId,
    baseType:
      body && body.baseType !== undefined ? body.baseType : existing.baseType,
    rows: body && body.rows !== undefined ? body.rows : existing.rows,
    cols: body && body.cols !== undefined ? body.cols : existing.cols,
    labelKey:
      body && body.labelKey !== undefined ? body.labelKey : existing.labelKey,
    fallbackLabel:
      body && body.fallbackLabel !== undefined
        ? body.fallbackLabel
        : existing.fallbackLabel,
  });
  var worldUpdateWrite = upsertWorldClassImpl(record);
  if (!worldUpdateWrite || !worldUpdateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.world_class_upsert_failed" +
          (worldUpdateWrite && worldUpdateWrite.error
            ? ": " + String(worldUpdateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, world_class: record });
}

/**
 * @param {*} context
 */
function deleteWorldClassHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var classId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!classId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  if (isBuiltinWorldClassIdImpl(classId)) {
    return ResponseBuilder.json(
      { ok: false, error: "error.world_class_builtin" },
      400,
    );
  }
  deleteWorldClassImpl(classId);
  return ResponseBuilder.json({ ok: true, deleted_id: classId });
}

function init() {
  ensureWorldDatabaseSchema();
  ensureChatDatabaseSchema();
  bootstrapItemClassesImpl();
  bootstrapActionClassesImpl();
  bootstrapLivingClassesImpl();
  bootstrapWorldClassesImpl();
  vwDiag("init", {
    item_class_table: VWORLD_ITEM_CLASS_TABLE,
    action_class_table: VWORLD_ACTION_CLASS_TABLE,
    living_class_table: VWORLD_LIVING_CLASS_TABLE,
    world_class_table: VWORLD_WORLD_CLASS_TABLE,
  });
  startNPCTicker();
  registerVirtualWorldRuntimeImpl();
}
