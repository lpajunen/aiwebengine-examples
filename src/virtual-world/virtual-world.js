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
  buildActiveWorldPlayers as buildActiveWorldPlayersImpl,
  getCanonicalPlayerState as getCanonicalPlayerStateImpl,
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
  broadcastItemChange as broadcastItemChangeImpl,
  sendRecipientScopedStreamEvent as sendRecipientScopedStreamEventImpl,
  sendVirtualWorldStreamEvent as sendVirtualWorldStreamEventImpl,
  sendWorldScopedStreamEvent as sendWorldScopedStreamEventImpl,
} from "./server/stream-broadcast.ts";
import {
  buildOnlinePlayersSnapshot as buildOnlinePlayersSnapshotImpl,
  deleteOnlinePresence,
  getEffectiveNick,
  loadPlayerNick,
  savePlayerNick,
  updateOnlinePresence as updateOnlinePresenceImpl,
} from "./server/social-state.ts";
import {
  deleteWorldItemById,
  deleteWorldItems,
  ensureWorldItems as ensureWorldItemsImpl,
  flattenWorldItems as flattenWorldItemsImpl,
  loadPlayerInventory,
  loadWorldItemMeta,
  loadWorldItems as loadWorldItemsImpl,
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
  switchUserWorld as switchUserWorldImpl,
} from "./server/world-switch.ts";
import {
  createWorldOfType as createWorldOfTypeImpl,
  ensureWorldNPCs as ensureWorldNPCsImpl,
  getEffectiveMap as getEffectiveMapImpl,
  getOrCreatePlayerWorld as getOrCreatePlayerWorldImpl,
  getWorldDimensions,
  getWorldInfo as getWorldInfoImpl,
  getWorldType,
  resolvePortalDestinationWorldType as resolvePortalDestinationWorldTypeImpl,
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
  getAvailableWorldActions as getAvailableWorldActionsImpl,
  getCurrentWorldStateForUser as getCurrentWorldStateForUserImpl,
  getMoveOptions as getMoveOptionsImpl,
  getTargetTileFromRotation,
  normalizeMoveDirection,
  rotationForDirection,
  worldTileNameForValue as worldTileNameForValueImpl,
} from "./server/current-world-state.ts";
import { movePlayerForUser as movePlayerForUserImpl } from "./server/move-player.ts";
import {
  buildVirtualWorldPageState as buildVirtualWorldPageStateImpl,
  ensureStarterKit as ensureStarterKitImpl,
  escapeHtml,
  getDefaultSpawnPosition as getDefaultSpawnPositionImpl,
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
  virtualWorldActToolHandler as virtualWorldActToolHandlerImpl,
  virtualWorldGetStateToolHandler as virtualWorldGetStateToolHandlerImpl,
  virtualWorldManageItemsToolHandler as virtualWorldManageItemsToolHandlerImpl,
  virtualWorldMoveToolHandler as virtualWorldMoveToolHandlerImpl,
  virtualWorldSetNicknameToolHandler as virtualWorldSetNicknameToolHandlerImpl,
  virtualWorldManageItemClassesToolHandler as virtualWorldManageItemClassesToolHandlerImpl,
  virtualWorldManageActionClassesToolHandler as virtualWorldManageActionClassesToolHandlerImpl,
  virtualWorldManageLivingClassesToolHandler as virtualWorldManageLivingClassesToolHandlerImpl,
  virtualWorldManageWorldClassesToolHandler as virtualWorldManageWorldClassesToolHandlerImpl,
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
  maybeTickWorldNPCs as maybeTickWorldNPCsImpl,
  registerRecurringNPCTick as registerRecurringNPCTickImpl,
  runNPCTick as runNPCTickImpl,
  tickWorldNPCs as tickWorldNPCsImpl,
  tryAcquireNPCTickLease as tryAcquireNPCTickLeaseImpl,
  tryTickWorldNPCs as tryTickWorldNPCsImpl,
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
 * @param {string | number} worldId
 * @param {string} userId
 * @returns {{row: number, col: number, seq: number, rotation: number}}
 */
function getDefaultSpawnPosition(worldId, userId) {
  return getDefaultSpawnPositionImpl(worldId, userId, {
    isOakWorld: isOakWorld,
    getOakClearingTiles: getOakClearingTiles,
    OAK_CENTER_ROW: OAK_CENTER_ROW,
    OAK_CENTER_COL: OAK_CENTER_COL,
    getEffectiveMap: getEffectiveMap,
    loadWorldPlayers: loadWorldPlayers,
    hashString: hashString,
    isWorldTileWalkable: isWorldTileWalkable,
  });
}

/**
 * @param {*} item
 * @returns {boolean}
 */
function isPickableWorldItem(item) {
  return !!item && item.type !== "portal" && item.type !== "blessing_marker";
}

/**
 * @param {string | number} worldId
 * @returns {number[][]}
 */
function generateMap(worldId) {
  var info = getWorldInfoImpl(worldId);
  return generateWorldMap(worldId, info.world_type, info.rows, info.cols);
}

/**
 * @param {string} userId
 * @returns {string}
 */
function getOrCreatePlayerWorld(userId) {
  return getOrCreatePlayerWorldImpl(
    userId,
    getPlayerWorld,
    savePlayerWorld,
    saveWorldType,
  );
}

/**
 * Cache-miss-tolerant world class lookup: another instance (or the editor on
 * this one) may have created the class after this instance's cache was built,
 * so refresh from the DB before concluding the class does not exist.
 * @param {string} classId
 * @returns {*}
 */
function getWorldClassWithRefresh(classId) {
  var cls = getWorldClassImpl(classId);
  if (cls) return cls;
  refreshWorldClassCacheImpl();
  return getWorldClassImpl(classId);
}

/**
 * @param {{destination_world_id?: string, destination_world_type?: string}=} item
 * @returns {string | undefined}
 */
function resolvePortalDestinationWorldType(item) {
  return resolvePortalDestinationWorldTypeImpl(item, getWorldType);
}

/**
 * @param {string | undefined | null} worldType
 * @param {{rows?: number, cols?: number}=} dimensions
 * @returns {{world_id: string, world_type: string, rows: number, cols: number}}
 */
function createWorldOfType(worldType, dimensions) {
  return createWorldOfTypeImpl(
    worldType,
    createWorldId,
    saveWorldType,
    dimensions,
  );
}

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
    {
      getOrCreatePlayerWorld: getOrCreatePlayerWorld,
      markNPCWorldActive: markNPCWorldActive,
      ensureStarterKit: ensureStarterKit,
      generateMap: generateMap,
      loadWorldMods: loadWorldMods,
      loadWorldTrees: loadWorldTrees,
      loadWorldHouses: loadWorldHouses,
      ensureWorldItems: ensureWorldItems,
      loadWorldItems: loadWorldItems,
      loadPlayerInventory: loadPlayerInventory,
      getWorldNPCSnapshot: getWorldNPCSnapshot,
      loadPlayerPosition: loadPlayerPosition,
      getDefaultSpawnPosition: getDefaultSpawnPosition,
      savePlayerPosition: savePlayerPosition,
      loadPlayerNick: loadPlayerNick,
      savePlayerNick: savePlayerNick,
      updateOnlinePresence: updateOnlinePresence,
      buildOnlinePlayersSnapshot: buildOnlinePlayersSnapshot,
      loadWorldChat: loadWorldChat,
      loadDMIndex: loadDMIndex,
      getWorldFlavorTextIndex: getWorldFlavorTextIndex,
      getWorldFlavorTextByIndex: getWorldFlavorTextByIndex,
      worldTileDefs: WORLD_TILE_DEFS,
      getBootstrapRegistry: getBootstrapRegistry,
      getAllLivingClasses: getAllLivingClasses,
      getAllWorldClasses: getAllWorldClassesImpl,
    },
  );
  return ResponseBuilder.html(renderVirtualWorldPageHtmlImpl(state));
}

/**
 * @param {string} worldId
 * @returns {string}
 */
function worldHouseStorageKey(worldId) {
  return "vworld_houses:" + String(worldId);
}

/**
 * @param {number[][]} map
 * @param {Record<string, Record<string, any>>} worldMods
 * @returns {number[][]}
 */
function applyWorldModsToMap(map, worldMods) {
  var mapRows = map.length;
  var mapCols = map[0] ? map[0].length : 0;
  var layerOrder = [WORLD_MOD_LAYER_TERRAIN, WORLD_MOD_LAYER_OBJECT];
  for (var i = 0; i < layerOrder.length; i++) {
    var layer = layerOrder[i];
    var layerMods = worldMods[layer] || {};
    Object.keys(layerMods).forEach(function (tileKey) {
      var mod = layerMods[tileKey];
      if (!mod) return;
      var row = Number(mod.row);
      var col = Number(mod.col);
      if (!isFinite(row) || !isFinite(col)) return;
      if (row < 0 || row >= mapRows || col < 0 || col >= mapCols) return;
      map[row][col] = worldTileValueForName(mod.tile_type);
    });
  }
  return map;
}

/**
 * Ensures the player has a starter_kit item in their inventory.
 * Idempotent — safe to call on every page load.
 * @param {string} userId
 */
function ensureStarterKit(userId) {
  ensureStarterKitImpl(userId, {
    loadPlayerInventory: loadPlayerInventory,
    savePlayerInventory: savePlayerInventory,
  });
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

/**
 * Write the per-user online-presence entry.  Safe to call from heartbeat
 * because each user only writes their own key — no read-modify-write of a
 * shared object, so there is no concurrency hazard.
 * @param {string} userId
 * @param {string} worldId
 * @param {string} sessionId
 */
function updateOnlinePresence(userId, worldId, sessionId) {
  var result = updateOnlinePresenceImpl(userId, worldId, sessionId);
  if (result && result.changed) {
    sendGlobalPresenceEvent(
      "upsert",
      result.player_id,
      result.world_id,
      result.nick,
      result.login_at,
      result.last_active,
    );
  }
  return result;
}

/**
 * Build a snapshot of all online players (TTL = 30 s).
 * @returns {Array<{player_id: string, nick: string, world_id: string, login_at: number, last_active: number}>}
 */
function buildOnlinePlayersSnapshot() {
  return buildOnlinePlayersSnapshotImpl(90000);
}

// ── World chat ────────────────────────────────────────────────────────────────

/**
 * @param {string} raw
 * @returns {*}
 */
function parseChatDbResult(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    vwLog("chat db parse failed", { error: String(e) });
    return null;
  }
}

/**
 * @param {number} tsMs
 * @returns {number}
 */
function toStoredChatTimestamp(tsMs) {
  var numeric = Number(tsMs || 0);
  if (!isFinite(numeric) || numeric <= 0) return Math.floor(Date.now() / 1000);
  if (numeric >= 1000000000000) return Math.floor(numeric / 1000);
  return Math.floor(numeric);
}

/**
 * @param {*} storedTs
 * @returns {number}
 */
function fromStoredChatTimestamp(storedTs) {
  var numeric = Number(storedTs || 0);
  if (!isFinite(numeric) || numeric <= 0) return 0;
  if (numeric < 1000000000000) return numeric * 1000;
  return numeric;
}

/**
 * @param {*} result
 * @returns {boolean}
 */
function isBenignChatSchemaResult(result) {
  if (!result || !result.error) return true;
  var msg = String(result.error || "").toLowerCase();
  return (
    msg.indexOf("already exists") !== -1 || msg.indexOf("duplicate") !== -1
  );
}

/**
 * @param {string} op
 * @param {string} tableName
 * @param {*} result
 * @param {string} [columnName]
 */
function reportChatSchemaResult(op, tableName, result, columnName) {
  if (isBenignChatSchemaResult(result)) return;
  vwLog("chat schema setup failed", {
    op: op,
    table: tableName,
    column: columnName || "",
    error: String(result && result.error ? result.error : "unknown"),
  });
}

/**
 * @param {string} op
 * @param {string} tableName
 * @param {*} result
 * @param {string} [columnName]
 */
function reportWorldSchemaResult(op, tableName, result, columnName) {
  if (isBenignChatSchemaResult(result)) return;
  vwLog("world schema setup failed", {
    op: op,
    table: tableName,
    column: columnName || "",
    error: String(result && result.error ? result.error : "unknown"),
  });
}

/**
 * @param {"world" | "chat"} scope
 * @param {string} op
 * @param {string} tableName
 * @param {() => string} run
 * @param {string | undefined} columnName
 * @param {Array<any> | undefined} collector
 * @returns {*}
 */
function executeSchemaStep(scope, op, tableName, run, columnName, collector) {
  var parser = scope === "world" ? parseWorldDbResult : parseChatDbResult;
  var reporter =
    scope === "world" ? reportWorldSchemaResult : reportChatSchemaResult;
  var result = null;
  try {
    result = parser(run());
  } catch (e) {
    result = { error: "threw: " + String(e) };
  }
  reporter(op, tableName, result, columnName);
  if (collector) {
    collector.push({
      scope: scope,
      op: op,
      table: tableName,
      column: columnName || "",
      ok: !result || !result.error,
      error: result && result.error ? String(result.error) : "",
    });
  }
  return result;
}

/**
 * @param {string} tableName
 * @param {string} filters
 * @param {number} limit
 * @param {string} orderBy
 * @param {"asc" | "desc"} orderDir
 * @returns {any[]}
 */
function queryChatRows(tableName, filters, limit, orderBy, orderDir) {
  var result = parseChatDbResult(
    database.query(tableName, filters, limit, orderBy, orderDir),
  );
  if (!Array.isArray(result)) {
    if (result && result.error) {
      vwLog("chat db query failed", {
        table: tableName,
        filters: filters || "",
        error: String(result.error),
      });
    }
    return [];
  }
  return result;
}

/**
 * @param {string} tableName
 * @param {*} data
 * @returns {*}
 */
function insertChatRow(tableName, data) {
  var result = parseChatDbResult(
    database.insert(tableName, JSON.stringify(data)),
  );
  if (result && result.error) {
    vwLog("chat db insert failed", {
      table: tableName,
      error: String(result.error),
    });
    return null;
  }
  return result;
}

/**
 * @param {string} userId
 * @param {string} otherUserId
 * @param {number} ts
 */
function upsertDMIndexEntry(userId, otherUserId, ts) {
  var result = parseChatDbResult(
    database.upsert(
      VWORLD_DM_INDEX_TABLE,
      JSON.stringify(["user_id", "other_user_id"]),
      JSON.stringify({
        user_id: userId,
        other_user_id: otherUserId,
        last_ts: toStoredChatTimestamp(ts),
      }),
    ),
  );
  if (result && result.error) {
    vwLog("chat db upsert failed", {
      table: VWORLD_DM_INDEX_TABLE,
      error: String(result.error),
    });
  }
}

/**
 * @param {string} tableName
 * @param {string} filters
 */
function deleteChatRowsWhere(tableName, filters) {
  var result = parseChatDbResult(database.deleteWhere(tableName, filters));
  if (result && result.error) {
    vwLog("chat db deleteWhere failed", {
      table: tableName,
      error: String(result.error),
    });
  }
}

/**
 * @param {string} tableName
 * @param {string} orderField
 * @param {number} maxCount
 * @param {string} filters
 */
function pruneChatRows(tableName, orderField, maxCount, filters) {
  var rows = queryChatRows(tableName, filters, 1000, orderField, "desc");
  if (rows.length <= maxCount) return;
  for (var i = maxCount; i < rows.length; i++) {
    if (!isFinite(Number(rows[i] && rows[i].id))) continue;
    var result = parseChatDbResult(
      database.delete(tableName, Number(rows[i].id)),
    );
    if (result && result.error) {
      vwLog("chat db prune delete failed", {
        table: tableName,
        id: Number(rows[i].id),
        error: String(result.error),
      });
    }
  }
}

/**
 * @param {any[]} rows
 * @returns {Array<{id:string,sender_id:string,sender_nick:string,text:string,ts:number}>}
 */
function normalizeWorldChatRows(rows) {
  return rows
    .filter(function (/** @type {any} */ row) {
      return row && typeof row.message_id === "string";
    })
    .map(function (/** @type {any} */ row) {
      return {
        id: String(row.message_id),
        sender_id: String(row.sender_id || ""),
        sender_nick: String(row.sender_nick || ""),
        text: String(row.text || ""),
        ts: fromStoredChatTimestamp(row.ts),
      };
    });
}

/**
 * @param {any[]} rows
 * @returns {Array<{id:string,sender_id:string,sender_nick:string,recipient_id:string,text:string,ts:number}>}
 */
function normalizeDMRows(rows) {
  return rows
    .filter(function (/** @type {any} */ row) {
      return row && typeof row.message_id === "string";
    })
    .map(function (/** @type {any} */ row) {
      return {
        id: String(row.message_id),
        sender_id: String(row.sender_id || ""),
        sender_nick: String(row.sender_nick || ""),
        recipient_id: String(row.recipient_id || ""),
        text: String(row.text || ""),
        ts: fromStoredChatTimestamp(row.ts),
      };
    });
}

// ── Direct messages ───────────────────────────────────────────────────────────

/**
 * @param {string} worldId
 * @returns {Record<string, any[]>}
 */
function loadWorldItems(worldId) {
  return loadWorldItemsImpl(worldId, resolvePortalDestinationWorldType);
}

/**
 * @param {string} worldId
 */
function ensureWorldItems(worldId) {
  ensureWorldItemsImpl(worldId, {
    loadWorldItemMeta: loadWorldItemMeta,
    getEffectiveMap: getEffectiveMap,
    loadWorldItems: loadWorldItems,
    nextWorldItemId: nextWorldItemId,
    saveWorldItems: saveWorldItems,
    saveWorldItemMeta: saveWorldItemMeta,
    WORLD_ITEM_SPAWN_COUNT: WORLD_ITEM_SPAWN_COUNT,
    ITEM_TYPES: ITEM_TYPES,
    getItemStateTemplate: getItemStateTemplateImpl,
  });
}

/**
 * @param {Record<string, any[]>} itemsByTile
 * @returns {Array<{id: string, type: string, row: number, col: number, destination_world_id?: string, destination_world_type?: string, destination_world_rows?: number, destination_world_cols?: number}>}
 */
function flattenWorldItems(itemsByTile) {
  return flattenWorldItemsImpl(itemsByTile, resolvePortalDestinationWorldType);
}

/**
 * @param {string} worldId
 * @param {string} actorType
 * @param {string} actorId
 * @param {string} action
 * @param {number} row
 * @param {number} col
 * @param {Array<any>} items
 */
function broadcastItemChange(
  worldId,
  actorType,
  actorId,
  action,
  row,
  col,
  items,
) {
  broadcastItemChangeImpl(
    worldId,
    actorType,
    actorId,
    action,
    row,
    col,
    items,
    sendWorldScopedStreamEvent,
  );
}

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
 * @param {string} type
 * @param {*} payload
 * @param {Record<string, string>} filter
 */
function sendVirtualWorldStreamEvent(type, payload, filter) {
  sendVirtualWorldStreamEventImpl(
    VIRTUAL_WORLD_EVENTS_STREAM_PATH,
    type,
    payload,
    filter,
  );
}

/**
 * @param {string} worldId
 * @param {string} type
 * @param {*} payload
 */
function sendWorldScopedStreamEvent(worldId, type, payload) {
  sendWorldScopedStreamEventImpl(
    VIRTUAL_WORLD_EVENTS_STREAM_PATH,
    worldId,
    type,
    payload,
    allocateEventSeq,
  );
}

/**
 * @param {string} recipientId
 * @param {string} type
 * @param {*} payload
 */
function sendRecipientScopedStreamEvent(recipientId, type, payload) {
  sendRecipientScopedStreamEventImpl(
    VIRTUAL_WORLD_EVENTS_STREAM_PATH,
    recipientId,
    type,
    payload,
    allocateEventSeq,
  );
}

/**
 * @param {string} worldId
 * @returns {number[][]}
 */
function getEffectiveMap(worldId) {
  return getEffectiveMapImpl(worldId, {
    generateMap: generateMap,
    applyWorldModsToMap: applyWorldModsToMap,
    loadWorldMods: loadWorldMods,
    applyOakReservation: applyOakReservation,
  });
}

/**
 * @param {string} worldId
 * @returns {Record<string, any>}
 */
function ensureWorldNPCs(worldId) {
  return ensureWorldNPCsImpl(worldId, {
    loadWorldNPCs: loadWorldNPCs,
    saveWorldNPCs: saveWorldNPCs,
    getEffectiveMap: getEffectiveMap,
    loadWorldPlayers: loadWorldPlayers,
    NPC_MIN_COUNT: NPC_MIN_COUNT,
    NPC_MAX_COUNT: NPC_MAX_COUNT,
  });
}

/**
 * @param {number} dr
 * @param {number} dc
 * @returns {number}
 */
function directionToRotation(dr, dc) {
  if (dr > 0) return 0;
  if (dr < 0) return Math.PI;
  if (dc > 0) return Math.PI / 2;
  if (dc < 0) return -Math.PI / 2;
  return 0;
}

/**
 * @param {string} worldId
 * @returns {Array<{npc_id: string, row: number, col: number, seq: number, rotation: number, state: string, left_hand: string, right_hand: string, inventory_count: number}>}
 */
function getWorldNPCSnapshot(worldId) {
  markNPCWorldActive(worldId);
  maybeTickWorldNPCs(worldId);
  var npcs = ensureWorldNPCs(worldId);
  return buildWorldNPCSnapshotImpl(worldId, npcs, getNPCDisplayName);
}

/**
 * @param {Array<{dr: number, dc: number}>} dirs
 */
function shuffleDirections(dirs) {
  for (var i = dirs.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = dirs[i];
    dirs[i] = dirs[j];
    dirs[j] = t;
  }
}

/**
 * @param {string} worldId
 * @param {number} now
 */
function tickWorldNPCs(worldId, now) {
  tickWorldNPCsImpl(worldId, now, {
    ensureWorldItems: ensureWorldItems,
    ensureWorldNPCs: ensureWorldNPCs,
    getEffectiveMap: getEffectiveMap,
    loadWorldTrees: loadWorldTrees,
    loadWorldItems: loadWorldItems,
    loadWorldPlayers: loadWorldPlayers,
    buildOccupiedPlayerMap: buildOccupiedPlayerMapImpl,
    buildOccupiedNPCMap: buildOccupiedNPCMapImpl,
    normalizeNPCInventoryState: normalizeNPCInventoryStateImpl,
    tickNPCMovement: tickNPCMovementImpl,
    tickNPCItemInteractions: tickNPCItemInteractionsImpl,
    tickNPCTreeActions: tickNPCTreeActionsImpl,
    saveWorldNPCs: saveWorldNPCs,
    saveWorldItems: saveWorldItems,
    saveWorldTrees: saveWorldTrees,
    vwLog: vwLog,
    isPickableWorldItem: isPickableWorldItem,
    deleteWorldItems: deleteWorldItems,
    upsertWorldItem: upsertWorldItem,
    broadcastItemChange: broadcastItemChange,
    shuffleDirections: shuffleDirections,
    directionToRotation: directionToRotation,
    getNPCDisplayName: getNPCDisplayName,
    sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
    getInventoryTreeActions: getInventoryTreeActions,
    isOakCenterTile: isOakCenterTile,
    isOakClearingTile: isOakClearingTile,
  });
}

function runNPCTick() {
  runNPCTickImpl({
    loadNPCActiveWorlds: loadNPCActiveWorlds,
    saveNPCActiveWorlds: saveNPCActiveWorlds,
    deleteWorldRowsWhere: deleteWorldRowsWhere,
    NPC_ACTIVE_WORLD_TTL_MS: NPC_ACTIVE_WORLD_TTL_MS,
    VWORLD_NPC_TABLE: VWORLD_NPC_TABLE,
    VWORLD_NPC_TICK_TABLE: VWORLD_NPC_TICK_TABLE,
    loadNPCLastTick: loadNPCLastTick,
    saveNPCLastTick: saveNPCLastTick,
    runInTransaction: runInWorldTransaction,
    NPC_TICK_MS: NPC_TICK_MS,
    parseWorldDbResult: parseWorldDbResult,
    acquireLease: database.acquireLease,
    VWORLD_NPC_TICK_LEASE_TABLE: VWORLD_NPC_TICK_LEASE_TABLE,
    npcTickOwnerId: npcTickOwnerId,
    NPC_TICK_LEASE_MS: NPC_TICK_LEASE_MS,
    ensureWorldItems: ensureWorldItems,
    ensureWorldNPCs: ensureWorldNPCs,
    getEffectiveMap: getEffectiveMap,
    loadWorldTrees: loadWorldTrees,
    loadWorldItems: loadWorldItems,
    loadWorldPlayers: loadWorldPlayers,
    buildOccupiedPlayerMap: buildOccupiedPlayerMapImpl,
    buildOccupiedNPCMap: buildOccupiedNPCMapImpl,
    normalizeNPCInventoryState: normalizeNPCInventoryStateImpl,
    tickNPCMovement: tickNPCMovementImpl,
    tickNPCItemInteractions: tickNPCItemInteractionsImpl,
    tickNPCTreeActions: tickNPCTreeActionsImpl,
    saveWorldNPCs: saveWorldNPCs,
    saveWorldItems: saveWorldItems,
    saveWorldTrees: saveWorldTrees,
    vwLog: vwLog,
    isPickableWorldItem: isPickableWorldItem,
    deleteWorldItems: deleteWorldItems,
    upsertWorldItem: upsertWorldItem,
    broadcastItemChange: broadcastItemChange,
    shuffleDirections: shuffleDirections,
    directionToRotation: directionToRotation,
    getNPCDisplayName: getNPCDisplayName,
    sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
    getInventoryTreeActions: getInventoryTreeActions,
    isOakCenterTile: isOakCenterTile,
    isOakClearingTile: isOakClearingTile,
  });
}

/**
 * @param {string} worldId
 * @param {number} now
 * @returns {boolean}
 */
function tryAcquireNPCTickLease(worldId, now) {
  return tryAcquireNPCTickLeaseImpl(worldId, {
    parseWorldDbResult: parseWorldDbResult,
    acquireLease: database.acquireLease,
    VWORLD_NPC_TICK_LEASE_TABLE: VWORLD_NPC_TICK_LEASE_TABLE,
    npcTickOwnerId: npcTickOwnerId,
    NPC_TICK_LEASE_MS: NPC_TICK_LEASE_MS,
    vwLog: vwLog,
  });
}

/**
 * @param {string} worldId
 * @param {number} now
 * @returns {boolean}
 */
function tryTickWorldNPCs(worldId, now) {
  return tryTickWorldNPCsImpl(worldId, now, {
    loadNPCLastTick: loadNPCLastTick,
    saveNPCLastTick: saveNPCLastTick,
    runInTransaction: runInWorldTransaction,
    NPC_TICK_MS: NPC_TICK_MS,
    parseWorldDbResult: parseWorldDbResult,
    acquireLease: database.acquireLease,
    VWORLD_NPC_TICK_LEASE_TABLE: VWORLD_NPC_TICK_LEASE_TABLE,
    npcTickOwnerId: npcTickOwnerId,
    NPC_TICK_LEASE_MS: NPC_TICK_LEASE_MS,
    vwLog: vwLog,
    ensureWorldItems: ensureWorldItems,
    ensureWorldNPCs: ensureWorldNPCs,
    getEffectiveMap: getEffectiveMap,
    loadWorldTrees: loadWorldTrees,
    loadWorldItems: loadWorldItems,
    loadWorldPlayers: loadWorldPlayers,
    buildOccupiedPlayerMap: buildOccupiedPlayerMapImpl,
    buildOccupiedNPCMap: buildOccupiedNPCMapImpl,
    normalizeNPCInventoryState: normalizeNPCInventoryStateImpl,
    tickNPCMovement: tickNPCMovementImpl,
    tickNPCItemInteractions: tickNPCItemInteractionsImpl,
    tickNPCTreeActions: tickNPCTreeActionsImpl,
    saveWorldNPCs: saveWorldNPCs,
    saveWorldItems: saveWorldItems,
    saveWorldTrees: saveWorldTrees,
    isPickableWorldItem: isPickableWorldItem,
    deleteWorldItems: deleteWorldItems,
    upsertWorldItem: upsertWorldItem,
    broadcastItemChange: broadcastItemChange,
    shuffleDirections: shuffleDirections,
    directionToRotation: directionToRotation,
    getNPCDisplayName: getNPCDisplayName,
    sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
    getInventoryTreeActions: getInventoryTreeActions,
    isOakCenterTile: isOakCenterTile,
    isOakClearingTile: isOakClearingTile,
  });
}

/**
 * @param {string} worldId
 */
function maybeTickWorldNPCs(worldId) {
  maybeTickWorldNPCsImpl(worldId, {
    loadNPCLastTick: loadNPCLastTick,
    saveNPCLastTick: saveNPCLastTick,
    runInTransaction: runInWorldTransaction,
    NPC_TICK_MS: NPC_TICK_MS,
    parseWorldDbResult: parseWorldDbResult,
    acquireLease: database.acquireLease,
    VWORLD_NPC_TICK_LEASE_TABLE: VWORLD_NPC_TICK_LEASE_TABLE,
    npcTickOwnerId: npcTickOwnerId,
    NPC_TICK_LEASE_MS: NPC_TICK_LEASE_MS,
    vwLog: vwLog,
    ensureWorldItems: ensureWorldItems,
    ensureWorldNPCs: ensureWorldNPCs,
    getEffectiveMap: getEffectiveMap,
    loadWorldTrees: loadWorldTrees,
    loadWorldItems: loadWorldItems,
    loadWorldPlayers: loadWorldPlayers,
    buildOccupiedPlayerMap: buildOccupiedPlayerMapImpl,
    buildOccupiedNPCMap: buildOccupiedNPCMapImpl,
    normalizeNPCInventoryState: normalizeNPCInventoryStateImpl,
    tickNPCMovement: tickNPCMovementImpl,
    tickNPCItemInteractions: tickNPCItemInteractionsImpl,
    tickNPCTreeActions: tickNPCTreeActionsImpl,
    saveWorldNPCs: saveWorldNPCs,
    saveWorldItems: saveWorldItems,
    saveWorldTrees: saveWorldTrees,
    isPickableWorldItem: isPickableWorldItem,
    deleteWorldItems: deleteWorldItems,
    upsertWorldItem: upsertWorldItem,
    broadcastItemChange: broadcastItemChange,
    shuffleDirections: shuffleDirections,
    directionToRotation: directionToRotation,
    getNPCDisplayName: getNPCDisplayName,
    sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
    getInventoryTreeActions: getInventoryTreeActions,
    isOakCenterTile: isOakCenterTile,
    isOakClearingTile: isOakClearingTile,
  });
}

function registerRecurringNPCTick() {
  registerRecurringNPCTickImpl({
    schedulerService: schedulerService,
    NPC_TICK_MS: NPC_TICK_MS,
    vwLog: vwLog,
  });
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
 * @param {string} worldId
 * @param {string} userId
 * @returns {{row: number, col: number, seq: number, rotation: number}}
 */
function getCanonicalPlayerState(worldId, userId) {
  return getCanonicalPlayerStateImpl(worldId, userId, getDefaultSpawnPosition);
}

/**
 * @param {*} context
 * @returns {string|null}
 */
function getAuthenticatedUserId(context) {
  if (
    !context ||
    !context.request ||
    !context.request.auth ||
    !context.request.auth.isAuthenticated ||
    !context.request.auth.userId
  ) {
    return null;
  }
  return String(context.request.auth.userId);
}

/**
 * @param {number} tileValue
 * @returns {string}
 */
function worldTileNameForValue(tileValue) {
  return worldTileNameForValueImpl(tileValue, WORLD_TILE_NAME_BY_VALUE);
}

/**
 * @param {{class_id: string, slots: Record<string, any>, bag: any[], values: Record<string, any>}} inventory
 * @param {any[]} currentTileItems
 * @returns {string[]}
 */
function getAvailableWorldActions(inventory, currentTileItems) {
  return getAvailableWorldActionsImpl(
    inventory,
    currentTileItems,
    getActionsForItemType,
  );
}

/**
 * @param {string} worldId
 * @param {{row: number, col: number}} canonical
 * @returns {Record<string, {row: number, col: number, walkable: boolean, tile_type: string, in_bounds: boolean}>}
 */
function getMoveOptions(worldId, canonical) {
  return getMoveOptionsImpl(worldId, canonical, {
    getEffectiveMap: getEffectiveMap,
    isWorldTileWalkable: isWorldTileWalkable,
    worldTileNameForValue: worldTileNameForValue,
  });
}

/**
 * @param {string} userId
 * @returns {{ok: boolean, world_id: string, world_type: string, world_rows: number, world_cols: number, player: {row: number, col: number, seq: number, rotation: number}, items: Array<{id: string, type: string, row: number, col: number}>, tile_items: any[], inventory: {class_id: string, slots: Record<string, any>, bag: any[], values: Record<string, any>}, world_mods: any, houses: any, available_actions: string[], move_options: Record<string, {row: number, col: number, walkable: boolean, tile_type: string, in_bounds: boolean}>, facing_tile: {row: number, col: number, direction: string}}}
 */
function getCurrentWorldStateForUser(userId) {
  return getCurrentWorldStateForUserImpl(userId, {
    getOrCreatePlayerWorld: getOrCreatePlayerWorld,
    markNPCWorldActive: markNPCWorldActive,
    ensureWorldItems: ensureWorldItems,
    getCanonicalPlayerState: getCanonicalPlayerState,
    loadPlayerInventory: loadPlayerInventory,
    loadWorldItems: loadWorldItems,
    flattenWorldItems: flattenWorldItems,
    loadWorldMods: loadWorldMods,
    loadWorldHouses: loadWorldHouses,
    getWorldType: getWorldType,
    getWorldDimensions: getWorldDimensions,
    getAvailableWorldActions: getAvailableWorldActions,
    getMoveOptions: getMoveOptions,
    getTargetTileFromRotation: getTargetTileFromRotation,
  });
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
function movePlayerForUser(userId, body) {
  return movePlayerForUserImpl(userId, body, {
    getPlayerWorld: getPlayerWorld,
    markNPCWorldActive: markNPCWorldActive,
    loadPlayerMoveLease: loadPlayerMoveLease,
    savePlayerMoveLease: savePlayerMoveLease,
    loadWorldPlayers: loadWorldPlayers,
    loadPlayerPosition: loadPlayerPosition,
    getDefaultSpawnPosition: getDefaultSpawnPosition,
    getEffectiveMap: getEffectiveMap,
    isWorldTileWalkable: isWorldTileWalkable,
    savePlayerPosition: savePlayerPosition,
    sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
    vwLog: vwLog,
    LEASE_TTL_MS: LEASE_TTL_MS,
  });
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
  return performTreeActionForUserImpl(userId, body, {
    canonicalTreeAction: canonicalTreeAction,
    getActionDefinition: getActionDefinition,
    worldTypeForPortalBuildAction: worldTypeForPortalBuildAction,
    normalizeWorldType: normalizeWorldType,
    handleItemActionForUser: handleItemActionForUser,
    grantAllItemsForUser: grantAllItemsForUser,
    getPlayerWorld: getPlayerWorld,
    ensureWorldItems: ensureWorldItems,
    loadPlayerInventory: loadPlayerInventory,
    getCanonicalPlayerState: getCanonicalPlayerState,
    loadWorldItems: loadWorldItems,
    canInventoryUseTreeAction: canInventoryUseTreeAction,
    canTileItemsUseTreeAction: canTileItemsUseTreeAction,
    switchUserWorld: switchUserWorld,
    OAK_WORLD_ID: OAK_WORLD_ID,
    getDefaultSpawnPosition: getDefaultSpawnPosition,
    getEffectiveNick: getEffectiveNick,
    appendWorldChatMessage: appendWorldChatMessage,
    sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
    flattenWorldItems: flattenWorldItems,
    nextWorldItemId: nextWorldItemId,
    upsertWorldItem: upsertWorldItem,
    saveWorldItems: saveWorldItems,
    broadcastItemChange: broadcastItemChange,
    getTargetTileFromRotation: getTargetTileFromRotation,
    getWorldDimensions: getWorldDimensions,
    getWorldClass: getWorldClassWithRefresh,
    getEffectiveMap: getEffectiveMap,
    loadWorldTrees: loadWorldTrees,
    loadWorldHouses: loadWorldHouses,
    isOakClearingTile: isOakClearingTile,
    saveWorldHouses: saveWorldHouses,
    createWorldOfType: createWorldOfType,
    deleteWorldItems: deleteWorldItems,
    isOakCenterTile: isOakCenterTile,
    saveWorldTrees: saveWorldTrees,
    savePlayerInventory: savePlayerInventory,
  });
}

/**
 * @param {*} context
 * @returns {string}
 */
function virtualWorldGetStateToolHandler(context) {
  return virtualWorldGetStateToolHandlerImpl(context, {
    getAuthenticatedUserId: getAuthenticatedUserId,
    getCurrentWorldStateForUser: getCurrentWorldStateForUser,
  });
}

/**
 * @param {*} context
 * @returns {string}
 */
function virtualWorldMoveToolHandler(context) {
  return virtualWorldMoveToolHandlerImpl(context, {
    getAuthenticatedUserId: getAuthenticatedUserId,
    normalizeMoveDirection: normalizeMoveDirection,
    getOrCreatePlayerWorld: getOrCreatePlayerWorld,
    getCanonicalPlayerState: getCanonicalPlayerState,
    getMoveOptions: getMoveOptions,
    rotationForDirection: rotationForDirection,
    movePlayerForUser: movePlayerForUser,
  });
}

/**
 * @param {*} context
 * @returns {string}
 */
function virtualWorldManageItemsToolHandler(context) {
  return virtualWorldManageItemsToolHandlerImpl(context, {
    getAuthenticatedUserId: getAuthenticatedUserId,
    getCurrentWorldStateForUser: getCurrentWorldStateForUser,
    handleItemActionForUser: handleItemActionForUser,
    getPlayerWorld: getPlayerWorld,
  });
}

/**
 * @param {*} context
 * @returns {string}
 */
function virtualWorldActToolHandler(context) {
  return virtualWorldActToolHandlerImpl(context, {
    getAuthenticatedUserId: getAuthenticatedUserId,
    getOrCreatePlayerWorld: getOrCreatePlayerWorld,
    getCanonicalPlayerState: getCanonicalPlayerState,
    performTreeActionForUser: performTreeActionForUser,
  });
}

/**
 * @param {*} context
 * @returns {string}
 */
function virtualWorldSetNicknameToolHandler(context) {
  return virtualWorldSetNicknameToolHandlerImpl(context, {
    getAuthenticatedUserId: getAuthenticatedUserId,
    savePlayerNick: savePlayerNick,
    getPlayerWorld: getPlayerWorld,
    updateOnlinePresence: updateOnlinePresence,
    grantAllItemsForUser: grantAllItemsForUser,
    sendGlobalPresenceEvent: sendGlobalPresenceEvent,
    getEffectiveNick: getEffectiveNick,
  });
}

/**
 * @param {*} context
 * @returns {string}
 */
function virtualWorldManageItemClassesToolHandler(context) {
  return virtualWorldManageItemClassesToolHandlerImpl(context, {
    getAuthenticatedUserId: getAuthenticatedUserId,
    hasEditingRights: userHasCreatorStone,
    refreshItemClasses: function () {
      refreshItemClassCacheImpl();
    },
    getAllItemClasses: getAllItemClassesImpl,
    getItemClass: getItemClassImpl,
    upsertItemClass: function (record) {
      return upsertItemClassImpl(record);
    },
    deleteItemClass: function (id) {
      deleteItemClassImpl(id);
    },
  });
}

/**
 * @param {*} context
 * @returns {string}
 */
function virtualWorldManageActionClassesToolHandler(context) {
  return virtualWorldManageActionClassesToolHandlerImpl(context, {
    getAuthenticatedUserId: getAuthenticatedUserId,
    hasEditingRights: userHasCreatorStone,
    refreshActionClasses: function () {
      refreshActionClassCacheImpl();
    },
    getAllActionClasses: getAllActionClassesImpl,
    getActionClass: getActionClassImpl,
    upsertActionClass: function (record) {
      return upsertActionClassImpl(record);
    },
    deleteActionClass: function (id) {
      deleteActionClassImpl(id);
    },
  });
}

/**
 * @param {*} context
 * @returns {string}
 */
function virtualWorldManageLivingClassesToolHandler(context) {
  return virtualWorldManageLivingClassesToolHandlerImpl(context, {
    getAuthenticatedUserId: getAuthenticatedUserId,
    hasEditingRights: userHasCreatorStone,
    refreshLivingClasses: function () {
      refreshLivingClassCacheImpl();
    },
    getAllLivingClasses: getAllLivingClasses,
    getLivingClass: getLivingClassImpl,
    upsertLivingClass: function (record) {
      return upsertLivingClassImpl(record);
    },
    deleteLivingClass: function (id) {
      deleteLivingClassImpl(id);
    },
  });
}

/**
 * @param {*} context
 */
function virtualWorldManageWorldClassesToolHandler(context) {
  return virtualWorldManageWorldClassesToolHandlerImpl(context, {
    getAuthenticatedUserId: getAuthenticatedUserId,
    hasEditingRights: userHasCreatorStone,
    refreshWorldClasses: function () {
      refreshWorldClassCacheImpl();
    },
    getAllWorldClasses: getAllWorldClassesImpl,
    getWorldClass: getWorldClassWithRefresh,
    upsertWorldClass: function (record) {
      return upsertWorldClassImpl(record);
    },
    deleteWorldClass: function (id) {
      deleteWorldClassImpl(id);
    },
    isBuiltinWorldClassId: isBuiltinWorldClassIdImpl,
    normalizeWorldClassRecord: normalizeWorldClassRecordImpl,
  });
}

/**
 * @param {*} context
 */
function itemsHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(
    listItemsForUserImpl(userId, {
      getPlayerWorld: getPlayerWorld,
      ensureWorldItems: ensureWorldItems,
      flattenWorldItems: flattenWorldItems,
      loadWorldItems: loadWorldItems,
      loadPlayerInventory: loadPlayerInventory,
    }),
  );
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
    return handleItemActionForUserImpl(userId, body, {
      getPlayerWorld: getPlayerWorld,
      ensureWorldItems: ensureWorldItems,
      getCanonicalPlayerState: getCanonicalPlayerState,
      loadPlayerInventory: loadPlayerInventory,
      loadWorldItems: loadWorldItems,
      isPickableWorldItem: isPickableWorldItem,
      deleteWorldItems: deleteWorldItems,
      savePlayerInventory: savePlayerInventory,
      saveWorldItems: saveWorldItems,
      broadcastItemChange: broadcastItemChange,
      flattenWorldItems: flattenWorldItems,
      upsertWorldItem: upsertWorldItem,
      getAllKnownItemTypes: getAllKnownItemTypes,
    });
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
  return craftRecipeForUserImpl(userId, body, {
    getPlayerWorld: getPlayerWorld,
    ensureWorldItems: ensureWorldItems,
    loadPlayerInventory: loadPlayerInventory,
    savePlayerInventory: savePlayerInventory,
    getCanonicalPlayerState: getCanonicalPlayerState,
    getTargetTileFromRotation: getTargetTileFromRotation,
    nextWorldItemId: nextWorldItemId,
    getEffectiveMap: getEffectiveMap,
    loadWorldTrees: loadWorldTrees,
    saveWorldTrees: saveWorldTrees,
    loadWorldHouses: loadWorldHouses,
    saveWorldHouses: saveWorldHouses,
    isOakCenterTile: isOakCenterTile,
    isOakClearingTile: isOakClearingTile,
    sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
    getItemStateTemplate: getItemStateTemplateImpl,
  });
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
 * @param {string} worldId
 * @param {number} index
 * @returns {string}
 */
function makeCheatItemId(userId, worldId, index) {
  return (
    "u" +
    String(userId) +
    "_w" +
    String(worldId || "none") +
    "_cheat_" +
    Date.now().toString(36) +
    "_" +
    String(index)
  );
}

/**
 * @param {string} userId
 * @returns {{ok: boolean, action: string, granted_count: number, inventory: {class_id: string, slots: Record<string, any>, bag: any[], values: Record<string, any>}, items: Array<{id: string, type: string, row: number, col: number}>}}
 */
function grantAllItemsForUser(userId) {
  return runInWorldTransaction("cheat_grant_all", function () {
    return grantAllItemsForUserImpl(userId, {
      getPlayerWorld: getPlayerWorld,
      loadPlayerInventory: loadPlayerInventory,
      getAllKnownItemTypes: getAllKnownItemTypes,
      savePlayerInventory: savePlayerInventory,
      ensureWorldItems: ensureWorldItems,
      loadWorldItems: loadWorldItems,
      flattenWorldItems: flattenWorldItems,
      getItemStateTemplate: getItemStateTemplateImpl,
    });
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
  var handled = setNicknameForUserImpl(userId, body.nick, {
    savePlayerNick: savePlayerNick,
    grantAllItemsForUser: grantAllItemsForUser,
  });
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
  return ResponseBuilder.json(
    listOnlinePlayersForUserImpl(userId, {
      buildOnlinePlayersSnapshot: buildOnlinePlayersSnapshot,
      getPlayerWorld: getPlayerWorld,
      buildActiveWorldPlayers: buildActiveWorldPlayers,
      getEffectiveNick: getEffectiveNick,
    }),
  );
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
  var handled = postWorldChatForUserImpl(userId, body.text, {
    getPlayerWorld: getPlayerWorld,
    getEffectiveNick: getEffectiveNick,
    appendWorldChatMessage: appendWorldChatMessage,
    sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
  });
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
  var handled = postDirectMessageForUserImpl(userId, body.to, body.text, {
    getEffectiveNick: getEffectiveNick,
    appendDMMessage: appendDMMessage,
    addToDMIndex: addToDMIndex,
    sendRecipientScopedStreamEvent: sendRecipientScopedStreamEvent,
  });
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
    {
      loadDMHistory: loadDMHistory,
    },
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
  return ResponseBuilder.json(
    leaveWorldForUserImpl(userId, sessionId, {
      getPlayerWorld: getPlayerWorld,
      loadPlayerPosition: loadPlayerPosition,
      vwLog: vwLog,
      markPlayerPositionInactive: markPlayerPositionInactive,
      deletePlayerHeartbeat: deletePlayerHeartbeat,
      deletePlayerMoveLease: deletePlayerMoveLease,
      deleteOnlinePresence: deleteOnlinePresence,
      getEffectiveNick: getEffectiveNick,
      sendGlobalPresenceEvent: sendGlobalPresenceEvent,
      sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
    }),
  );
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
  return ResponseBuilder.json(
    heartbeatForUserImpl(userId, sessionId, {
      getPlayerWorld: getPlayerWorld,
      markNPCWorldActive: markNPCWorldActive,
      maybeTickWorldNPCs: maybeTickWorldNPCs,
      loadPlayerMoveLease: loadPlayerMoveLease,
      savePlayerMoveLease: savePlayerMoveLease,
      vwLog: vwLog,
      savePlayerHeartbeatTs: savePlayerHeartbeatTs,
      updateOnlinePresence: updateOnlinePresence,
      LEASE_TTL_MS: LEASE_TTL_MS,
    }),
  );
}

/**
 * @param {string} worldId
 * @returns {Array<{player_id: string, row: number, col: number, seq: number, rotation: number, session_id: string, last_active: number}>}
 */
function buildActiveWorldPlayers(worldId) {
  return buildActiveWorldPlayersImpl(worldId, 90000);
}

/**
 * @param {string} userId
 * @param {string} targetWorldId
 * @param {{row: number, col: number, seq?: number, rotation?: number}=} spawnPosition
 */
function switchUserWorld(userId, targetWorldId, spawnPosition) {
  switchUserWorldImpl(userId, targetWorldId, spawnPosition, {
    getPlayerWorld: getPlayerWorld,
    getEffectiveNick: getEffectiveNick,
    loadPlayerPosition: loadPlayerPosition,
    deletePlayerPosition: deletePlayerPosition,
    deletePlayerHeartbeat: deletePlayerHeartbeat,
    deletePlayerMoveLease: deletePlayerMoveLease,
    sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
    sendGlobalPresenceEvent: sendGlobalPresenceEvent,
    savePlayerWorld: savePlayerWorld,
    savePlayerPosition: savePlayerPosition,
    deleteOnlinePresence: deleteOnlinePresence,
  });
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
    switchUserToNewWorldImpl(userId, WORLD_TYPE_FOREST, {
      createWorldOfType: createWorldOfType,
      switchUserWorld: switchUserWorld,
    }),
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
    switchUserToStartWorldImpl(userId, OAK_WORLD_ID, WORLD_TYPE_FOREST, {
      saveWorldType: saveWorldType,
      switchUserWorld: switchUserWorld,
      getDefaultSpawnPosition: getDefaultSpawnPosition,
    }),
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
  return ResponseBuilder.json(
    listPlayersForUserImpl(userId, {
      getPlayerWorld: getPlayerWorld,
      markNPCWorldActive: markNPCWorldActive,
      buildActiveWorldPlayers: buildActiveWorldPlayers,
      loadPlayerInventory: loadPlayerInventory,
    }),
  );
}

/**
 * @param {*} context
 */
function resyncHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var result = buildResyncForUserImpl(userId, {
    getPlayerWorld: getPlayerWorld,
    markNPCWorldActive: markNPCWorldActive,
    buildActiveWorldPlayers: buildActiveWorldPlayers,
    loadPlayerInventory: loadPlayerInventory,
    getWorldNPCSnapshot: getWorldNPCSnapshot,
    getCurrentWorldStateForUser: getCurrentWorldStateForUser,
    getCurrentEventSeq: getCurrentEventSeq,
  });
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
  var snapshot = getCurrentWorldStateForHttpUserImpl(userId, {
    getCurrentWorldStateForUser: getCurrentWorldStateForUser,
  });
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
  return ResponseBuilder.json(
    listNPCsForUserImpl(userId, {
      getPlayerWorld: getPlayerWorld,
      getWorldNPCSnapshot: getWorldNPCSnapshot,
    }),
  );
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
  registerVirtualWorldRuntimeImpl({
    routeRegistry: routeRegistry,
    mcpRegistry: mcpRegistry,
    vwLog: vwLog,
    virtualWorldEventsStreamPath: VIRTUAL_WORLD_EVENTS_STREAM_PATH,
  });
}
