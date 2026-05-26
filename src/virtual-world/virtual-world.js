/// <reference path="../../types/aiwebengine.d.ts" />

import {
  canInventoryUseTreeAction,
  canTileItemsUseTreeAction,
  createWorldId,
  getAllKnownItemTypes,
  getActionsForItemType,
  getInventoryTreeActions,
  getNPCDisplayName,
  getWorldFlavorText,
  hashString,
  ITEM_TYPES,
  OAK_CENTER_COL,
  OAK_CENTER_ROW,
  OAK_WORLD_ID,
  applyOakReservation,
  canonicalTreeAction,
  createEmptyInventory,
  getOakClearingTiles,
  isOakCenterTile,
  isOakClearingTile,
  isOakWorld,
  isWorldTileWalkable,
  normalizeInventory,
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
  deleteWorldRow as deleteWorldRowImpl,
  deleteWorldRowsWhere as deleteWorldRowsWhereImpl,
  insertWorldRow as insertWorldRowImpl,
  parseWorldDbResult as parseWorldDbResultImpl,
  querySingleWorldRow as querySingleWorldRowImpl,
  queryWorldRows as queryWorldRowsImpl,
  updateWorldRow as updateWorldRowImpl,
  upsertWorldRow as upsertWorldRowImpl,
} from "./server/world-db.ts";
import {
  deletePlayerHeartbeat as deletePlayerHeartbeatImpl,
  deletePlayerMoveLease as deletePlayerMoveLeaseImpl,
  deletePlayerPosition as deletePlayerPositionImpl,
  getPlayerWorld as getPlayerWorldImpl,
  loadAllPlayerPositions as loadAllPlayerPositionsImpl,
  loadPlayerHeartbeatMap as loadPlayerHeartbeatMapImpl,
  loadPlayerHeartbeatTs as loadPlayerHeartbeatTsImpl,
  loadPlayerMoveLease as loadPlayerMoveLeaseImpl,
  loadPlayerPosition as loadPlayerPositionImpl,
  markPlayerPositionInactive as markPlayerPositionInactiveImpl,
  normalizePlayerPositionRow as normalizePlayerPositionRowImpl,
  savePlayerHeartbeatTs as savePlayerHeartbeatTsImpl,
  savePlayerMoveLease as savePlayerMoveLeaseImpl,
  savePlayerPosition as savePlayerPositionImpl,
  savePlayerWorld as savePlayerWorldImpl,
} from "./server/player-persistence.ts";
import {
  buildActiveWorldPlayers as buildActiveWorldPlayersImpl,
  getCanonicalPlayerState as getCanonicalPlayerStateImpl,
  loadWorldPlayers as loadWorldPlayersImpl,
  saveWorldPlayers as saveWorldPlayersImpl,
} from "./server/player-snapshots.ts";
import {
  createEmptyWorldMods as createEmptyWorldModsImpl,
  loadWorldHouses as loadWorldHousesImpl,
  loadWorldMods as loadWorldModsImpl,
  loadWorldTrees as loadWorldTreesImpl,
  parseWorldModPayload as parseWorldModPayloadImpl,
  saveWorldHouses as saveWorldHousesImpl,
  saveWorldModLayer as saveWorldModLayerImpl,
  saveWorldTrees as saveWorldTreesImpl,
} from "./server/world-mod-storage.ts";
import {
  broadcastItemChange as broadcastItemChangeImpl,
  sendRecipientScopedStreamEvent as sendRecipientScopedStreamEventImpl,
  sendVirtualWorldStreamEvent as sendVirtualWorldStreamEventImpl,
  sendWorldScopedStreamEvent as sendWorldScopedStreamEventImpl,
} from "./server/stream-broadcast.ts";
import {
  buildOnlinePlayersSnapshot as buildOnlinePlayersSnapshotImpl,
  deleteOnlinePresence as deleteOnlinePresenceImpl,
  getEffectiveNick as getEffectiveNickImpl,
  loadPlayerNick as loadPlayerNickImpl,
  savePlayerNick as savePlayerNickImpl,
  updateOnlinePresence as updateOnlinePresenceImpl,
} from "./server/social-state.ts";
import {
  deleteWorldItemById as deleteWorldItemByIdImpl,
  deleteWorldItems as deleteWorldItemsImpl,
  ensureWorldItems as ensureWorldItemsImpl,
  flattenWorldItems as flattenWorldItemsImpl,
  loadPlayerInventory as loadPlayerInventoryImpl,
  loadWorldItemMeta as loadWorldItemMetaImpl,
  loadWorldItems as loadWorldItemsImpl,
  nextWorldItemId as nextWorldItemIdImpl,
  savePlayerInventory as savePlayerInventoryImpl,
  saveWorldItemMeta as saveWorldItemMetaImpl,
  saveWorldItems as saveWorldItemsImpl,
  upsertWorldItem as upsertWorldItemImpl,
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
  getWorldType as getWorldTypeImpl,
  resolvePortalDestinationWorldType as resolvePortalDestinationWorldTypeImpl,
  saveWorldType as saveWorldTypeImpl,
} from "./server/world-bootstrap.ts";
import {
  ensureChatDatabaseSchema as ensureChatDatabaseSchemaImpl,
  ensureLateWorldDatabaseSchema as ensureLateWorldDatabaseSchemaImpl,
  ensureWorldDatabaseSchema as ensureWorldDatabaseSchemaImpl,
  runChatSchemaStep as runChatSchemaStepImpl,
  runWorldSchemaStep as runWorldSchemaStepImpl,
} from "./server/schema-setup.ts";
import {
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
  getTargetTileFromRotation as getTargetTileFromRotationImpl,
  normalizeMoveDirection as normalizeMoveDirectionImpl,
  rotationForDirection as rotationForDirectionImpl,
  worldTileNameForValue as worldTileNameForValueImpl,
} from "./server/current-world-state.ts";
import { movePlayerForUser as movePlayerForUserImpl } from "./server/move-player.ts";
import {
  buildVirtualWorldPageState as buildVirtualWorldPageStateImpl,
  ensureStarterKit as ensureStarterKitImpl,
  escapeHtml as escapeHtmlImpl,
  getDefaultSpawnPosition as getDefaultSpawnPositionImpl,
  renderVirtualWorldPageHtml as renderVirtualWorldPageHtmlImpl,
} from "./server/page-bootstrap.ts";
import { getBootstrapRegistry as getBootstrapRegistryImpl } from "./server/item-registry.ts";
import { getActionDefinition as getActionDefinitionImpl } from "./server/item-registry.ts";
import { performTreeActionForUser as performTreeActionForUserImpl } from "./server/tree-action-helpers.ts";
import {
  virtualWorldActToolHandler as virtualWorldActToolHandlerImpl,
  virtualWorldGetStateToolHandler as virtualWorldGetStateToolHandlerImpl,
  virtualWorldManageItemsToolHandler as virtualWorldManageItemsToolHandlerImpl,
  virtualWorldMoveToolHandler as virtualWorldMoveToolHandlerImpl,
  virtualWorldSetNicknameToolHandler as virtualWorldSetNicknameToolHandlerImpl,
} from "./server/tool-handlers.ts";
import {
  addToDMIndex as addToDMIndexImpl,
  appendDMMessage as appendDMMessageImpl,
  appendWorldChatMessage as appendWorldChatMessageImpl,
  dmConversationKey as dmConversationKeyImpl,
  loadDMHistory as loadDMHistoryImpl,
  loadDMIndex as loadDMIndexImpl,
  loadWorldChat as loadWorldChatImpl,
} from "./server/chat-storage.ts";
import {
  buildWorldNPCSnapshot as buildWorldNPCSnapshotImpl,
  loadNPCActiveWorlds as loadNPCActiveWorldsImpl,
  loadNPCLastTick as loadNPCLastTickImpl,
  loadWorldNPCs as loadWorldNPCsImpl,
  markNPCWorldActive as markNPCWorldActiveImpl,
  saveNPCActiveWorlds as saveNPCActiveWorldsImpl,
  saveNPCLastTick as saveNPCLastTickImpl,
  saveWorldNPCs as saveWorldNPCsImpl,
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

// Virtual World - 2.5D block world with Three.js
// Move with WASD or arrow keys. Walls and trees block movement.

// ── Server-side world generation ─────────────────────────────────────────────
var ROWS = 100;
var COLS = 100;
var LEASE_TTL_MS = 30000;
var NPC_MIN_COUNT = 10;
var NPC_MAX_COUNT = 20;
var NPC_TICK_MS = 500;
var NPC_TICK_LEASE_MS = 2000;
var NPC_ACTIVE_WORLD_TTL_MS = 120000;
var WORLD_ITEM_SPAWN_COUNT = 30;
var VIRTUAL_WORLD_EVENTS_STREAM_PATH = "/virtual-world/events";
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
  return generateWorldMap(worldId, getWorldType(worldId));
}

/**
 * @param {string} userId
 * @returns {string}
 */
function getPlayerWorld(userId) {
  return getPlayerWorldImpl(userId, VWORLD_PLAYER_WORLD_TABLE, vwLog);
}

/**
 * @param {string} userId
 * @param {string} worldId
 * @returns {string}
 */
function savePlayerWorld(userId, worldId) {
  return savePlayerWorldImpl(userId, worldId, VWORLD_PLAYER_WORLD_TABLE, vwLog);
}

/**
 * @param {*} row
 * @returns {{world_id: string, row: number, col: number, seq: number, rotation: number, session_id: string, ts: number} | null}
 */
function normalizePlayerPositionRow(row) {
  return normalizePlayerPositionRowImpl(row);
}

/**
 * @param {string} userId
 * @returns {{world_id: string, row: number, col: number, seq: number, rotation: number, session_id: string, ts: number} | null}
 */
function loadPlayerPosition(userId) {
  return loadPlayerPositionImpl(userId, VWORLD_PLAYER_POSITION_TABLE, vwLog);
}

/**
 * @returns {Record<string, {world_id: string, row: number, col: number, seq: number, rotation: number, session_id: string, ts: number}>}
 */
function loadAllPlayerPositions() {
  return loadAllPlayerPositionsImpl(VWORLD_PLAYER_POSITION_TABLE, vwLog);
}

/**
 * @param {string} userId
 * @param {string} worldId
 * @param {{row:number,col:number,seq:number,rotation:number,session_id?:string,ts?:number}} position
 */
function savePlayerPosition(userId, worldId, position) {
  savePlayerPositionImpl(
    userId,
    worldId,
    position,
    VWORLD_PLAYER_POSITION_TABLE,
    vwLog,
  );
}

/**
 * @param {string} userId
 */
function deletePlayerPosition(userId) {
  deletePlayerPositionImpl(userId, VWORLD_PLAYER_POSITION_TABLE, vwLog);
}

/**
 * @param {string} userId
 * @returns {{session_id: string, expires_at: number} | null}
 */
function loadPlayerMoveLease(userId) {
  return loadPlayerMoveLeaseImpl(userId, VWORLD_PLAYER_MOVE_LEASE_TABLE, vwLog);
}

/**
 * @param {string} userId
 * @param {string} sessionId
 * @param {number} expiresAt
 */
function savePlayerMoveLease(userId, sessionId, expiresAt) {
  savePlayerMoveLeaseImpl(
    userId,
    sessionId,
    expiresAt,
    VWORLD_PLAYER_MOVE_LEASE_TABLE,
    vwLog,
  );
}

/**
 * @param {string} userId
 */
function deletePlayerMoveLease(userId) {
  deletePlayerMoveLeaseImpl(userId, VWORLD_PLAYER_MOVE_LEASE_TABLE, vwLog);
}

/**
 * @param {string} userId
 * @returns {number}
 */
function loadPlayerHeartbeatTs(userId) {
  return loadPlayerHeartbeatTsImpl(
    userId,
    VWORLD_PLAYER_HEARTBEAT_TABLE,
    vwLog,
  );
}

/**
 * @returns {Record<string, number>}
 */
function loadPlayerHeartbeatMap() {
  return loadPlayerHeartbeatMapImpl(VWORLD_PLAYER_HEARTBEAT_TABLE, vwLog);
}

/**
 * @param {string} userId
 * @param {number} heartbeatTs
 */
function savePlayerHeartbeatTs(userId, heartbeatTs) {
  savePlayerHeartbeatTsImpl(
    userId,
    heartbeatTs,
    VWORLD_PLAYER_HEARTBEAT_TABLE,
    vwLog,
  );
}

/**
 * @param {string} userId
 */
function deletePlayerHeartbeat(userId) {
  deletePlayerHeartbeatImpl(userId, VWORLD_PLAYER_HEARTBEAT_TABLE, vwLog);
}

/**
 * @param {string} userId
 */
function markPlayerPositionInactive(userId) {
  markPlayerPositionInactiveImpl(userId, VWORLD_PLAYER_POSITION_TABLE, vwLog);
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
 * @param {string | number} worldId
 * @returns {string}
 */
function getWorldType(worldId) {
  return getWorldTypeImpl(worldId, VWORLD_WORLD_TYPE_TABLE, vwLog);
}

/**
 * @param {string | number} worldId
 * @param {string | undefined | null} worldType
 * @returns {string}
 */
function saveWorldType(worldId, worldType) {
  return saveWorldTypeImpl(worldId, worldType, VWORLD_WORLD_TYPE_TABLE, vwLog);
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
 * @returns {{world_id: string, world_type: string}}
 */
function createWorldOfType(worldType) {
  return createWorldOfTypeImpl(worldType, createWorldId, saveWorldType);
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return escapeHtmlImpl(value);
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
      getWorldFlavorText: getWorldFlavorText,
      worldTileDefs: WORLD_TILE_DEFS,
      getBootstrapRegistry: getBootstrapRegistry,
    },
  );
  return ResponseBuilder.html(renderVirtualWorldPageHtmlImpl(state));
}

function getBootstrapRegistry() {
  return getBootstrapRegistryImpl();
}

/**
 * @param {string} worldId
 * @returns {Record<string, any>}
 */
function loadWorldPlayers(worldId) {
  return loadWorldPlayersImpl(worldId, VWORLD_PLAYER_POSITION_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @param {Record<string, any>} players
 */
function saveWorldPlayers(worldId, players) {
  saveWorldPlayersImpl(worldId, players, VWORLD_PLAYER_POSITION_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @returns {Record<string, any>}
 */
function loadWorldTrees(worldId) {
  return loadWorldTreesImpl(worldId, VWORLD_WORLD_MOD_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @param {Record<string, any>} trees
 */
function saveWorldTrees(worldId, trees) {
  saveWorldTreesImpl(worldId, trees, VWORLD_WORLD_MOD_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @returns {string}
 */
function worldHouseStorageKey(worldId) {
  return "vworld_houses:" + String(worldId);
}

/**
 * @param {string} worldId
 * @returns {Record<string, any>}
 */
function loadWorldHouses(worldId) {
  return loadWorldHousesImpl(worldId, VWORLD_WORLD_MOD_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @param {Record<string, any>} houses
 */
function saveWorldHouses(worldId, houses) {
  saveWorldHousesImpl(worldId, houses, VWORLD_WORLD_MOD_TABLE, vwLog);
}

/**
 * @returns {Record<string, Record<string, any>>}
 */
function createEmptyWorldMods() {
  return createEmptyWorldModsImpl();
}

/**
 * @param {*} raw
 * @returns {*}
 */
function parseWorldModPayload(raw) {
  return parseWorldModPayloadImpl(raw, vwLog);
}

/**
 * @param {string} worldId
 * @returns {Record<string, Record<string, any>>}
 */
function loadWorldMods(worldId) {
  return loadWorldModsImpl(worldId, VWORLD_WORLD_MOD_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @param {string} layer
 * @param {string} sourceKind
 * @param {Record<string, any>} entries
 */
function saveWorldModLayer(worldId, layer, sourceKind, entries) {
  saveWorldModLayerImpl(
    worldId,
    layer,
    sourceKind,
    entries,
    VWORLD_WORLD_MOD_TABLE,
    vwLog,
  );
}

/**
 * @param {number[][]} map
 * @param {Record<string, Record<string, any>>} worldMods
 * @returns {number[][]}
 */
function applyWorldModsToMap(map, worldMods) {
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
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
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

/**
 * @param {string} userId
 * @returns {{left_hand: any, right_hand: any, inventory: any[]}}
 */
function loadPlayerInventory(userId) {
  return loadPlayerInventoryImpl(userId, VWORLD_PLAYER_INVENTORY_TABLE, vwLog);
}

/**
 * @param {string} userId
 * @param {*} inventory
 */
function savePlayerInventory(userId, inventory) {
  savePlayerInventoryImpl(
    userId,
    inventory,
    VWORLD_PLAYER_INVENTORY_TABLE,
    vwLog,
  );
}

// ── Player nicknames ──────────────────────────────────────────────────────────

/**
 * @param {string} userId
 * @returns {string}
 */
function loadPlayerNick(userId) {
  return loadPlayerNickImpl(userId, VWORLD_PLAYER_NICK_TABLE, vwLog);
}

/**
 * @param {string} userId
 * @param {string} nick
 */
function savePlayerNick(userId, nick) {
  savePlayerNickImpl(userId, nick, VWORLD_PLAYER_NICK_TABLE, vwLog);
}

/**
 * Returns the custom nick if set, otherwise falls back to a truncated userId.
 * @param {string} userId
 * @returns {string}
 */
function getEffectiveNick(userId) {
  return getEffectiveNickImpl(userId, VWORLD_PLAYER_NICK_TABLE, vwLog);
}

// ── Global online presence ────────────────────────────────────────────────────

/**
 * @param {string} action
 * @param {string} userId
 * @param {string} worldId
 * @param {string} nick
 * @param {number} [loginAt]
 * @param {number} [lastActive]
 */
function sendGlobalPresenceEvent(
  action,
  userId,
  worldId,
  nick,
  loginAt,
  lastActive,
) {
  sendVirtualWorldStreamEvent(
    "presence_update",
    {
      action: String(action || "upsert"),
      player_id: String(userId || ""),
      nick: String(nick || getEffectiveNick(userId)),
      world_id: String(worldId || ""),
      login_at: Number(loginAt || Date.now()),
      last_active: Number(lastActive || Date.now()),
    },
    {},
  );
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
  var result = updateOnlinePresenceImpl(
    userId,
    worldId,
    sessionId,
    VWORLD_ONLINE_PRESENCE_TABLE,
    VWORLD_PLAYER_NICK_TABLE,
    vwLog,
  );
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
 * @param {string} userId
 */
function deleteOnlinePresence(userId) {
  deleteOnlinePresenceImpl(userId, VWORLD_ONLINE_PRESENCE_TABLE, vwLog);
}

/**
 * Build a snapshot of all online players (TTL = 30 s).
 * @returns {Array<{player_id: string, nick: string, world_id: string, login_at: number, last_active: number}>}
 */
function buildOnlinePlayersSnapshot() {
  return buildOnlinePlayersSnapshotImpl(
    VWORLD_ONLINE_PRESENCE_TABLE,
    VWORLD_PLAYER_HEARTBEAT_TABLE,
    VWORLD_PLAYER_POSITION_TABLE,
    VWORLD_PLAYER_WORLD_TABLE,
    VWORLD_PLAYER_NICK_TABLE,
    vwLog,
    90000,
  );
}

// ── World chat ────────────────────────────────────────────────────────────────

var WORLD_CHAT_MAX = 100;
var VWORLD_CHAT_TABLE = "vworld_chat_messages";
var VWORLD_DM_TABLE = "vworld_direct_messages";
var VWORLD_DM_INDEX_TABLE = "vworld_dm_index";
var VWORLD_ONLINE_PRESENCE_TABLE = "vworld_online_presence";
var VWORLD_PLAYER_HEARTBEAT_TABLE = "vworld_player_heartbeats";
var VWORLD_PLAYER_MOVE_LEASE_TABLE = "vworld_player_move_leases";
var VWORLD_PLAYER_NICK_TABLE = "vworld_player_nicks";
var VWORLD_PLAYER_WORLD_TABLE = "vworld_player_worlds";
var VWORLD_PLAYER_POSITION_TABLE = "vworld_player_positions";
var VWORLD_PLAYER_INVENTORY_TABLE = "vworld_player_inventory";
var VWORLD_WORLD_TYPE_TABLE = "vworld_world_types";
var VWORLD_WORLD_MOD_TABLE = "vworld_world_mods";
var VWORLD_WORLD_ITEM_TABLE = "vworld_world_items";
var VWORLD_WORLD_ITEM_META_TABLE = "vworld_world_item_meta";
var VWORLD_NPC_TABLE = "vworld_npcs";
var VWORLD_NPC_ACTIVE_WORLD_TABLE = "vworld_npc_active_worlds";
var VWORLD_NPC_TICK_TABLE = "vworld_npc_tick_meta";
var VWORLD_NPC_TICK_LEASE_TABLE = "vworld_npc_tick_leases";

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
 * @param {string} raw
 * @returns {*}
 */
function parseWorldDbResult(raw) {
  return parseWorldDbResultImpl(raw, vwLog);
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
 * @param {string} op
 * @param {string} tableName
 * @param {() => string} run
 * @param {string} [columnName]
 * @param {Array<any>} [collector]
 * @returns {*}
 */
function runWorldSchemaStep(op, tableName, run, columnName, collector) {
  return runWorldSchemaStepImpl(
    op,
    tableName,
    run,
    parseWorldDbResult,
    vwLog,
    columnName,
    collector,
  );
}

/**
 * @param {string} op
 * @param {string} tableName
 * @param {() => string} run
 * @param {string} [columnName]
 * @param {Array<any>} [collector]
 * @returns {*}
 */
function runChatSchemaStep(op, tableName, run, columnName, collector) {
  return runChatSchemaStepImpl(
    op,
    tableName,
    run,
    parseChatDbResult,
    vwLog,
    columnName,
    collector,
  );
}

/**
 * @param {Array<any>} [collector]
 */
function ensureLateWorldDatabaseSchema(collector) {
  ensureLateWorldDatabaseSchemaImpl(
    {
      worldType: VWORLD_WORLD_TYPE_TABLE,
      npc: VWORLD_NPC_TABLE,
      npcActiveWorld: VWORLD_NPC_ACTIVE_WORLD_TABLE,
      npcTick: VWORLD_NPC_TICK_TABLE,
      npcTickLease: VWORLD_NPC_TICK_LEASE_TABLE,
    },
    parseWorldDbResult,
    vwLog,
    collector,
  );
}

/**
 * @param {string} tableName
 * @param {string} filters
 * @param {number} limit
 * @param {string} orderBy
 * @param {"asc" | "desc"} orderDir
 * @returns {any[]}
 */
function queryWorldRows(tableName, filters, limit, orderBy, orderDir) {
  return queryWorldRowsImpl(
    tableName,
    filters,
    limit,
    orderBy,
    orderDir,
    vwLog,
  );
}

/**
 * @param {string} tableName
 * @param {*} data
 * @returns {*}
 */
function insertWorldRow(tableName, data) {
  return insertWorldRowImpl(tableName, data, vwLog);
}

/**
 * @param {string} tableName
 * @param {string[]} keyColumns
 * @param {*} data
 * @returns {*}
 */
function upsertWorldRow(tableName, keyColumns, data) {
  return upsertWorldRowImpl(tableName, keyColumns, data, vwLog);
}

/**
 * @param {string} tableName
 * @param {number} id
 * @param {*} data
 * @returns {*}
 */
function updateWorldRow(tableName, id, data) {
  return updateWorldRowImpl(tableName, id, data, vwLog);
}

/**
 * @param {string} tableName
 * @param {string} filters
 */
function deleteWorldRowsWhere(tableName, filters) {
  deleteWorldRowsWhereImpl(tableName, filters, vwLog);
}

/**
 * @param {string} tableName
 * @param {number} id
 */
function deleteWorldRow(tableName, id) {
  deleteWorldRowImpl(tableName, id, vwLog);
}

/**
 * @param {string} tableName
 * @param {string} filters
 * @returns {any | null}
 */
function querySingleWorldRow(tableName, filters) {
  return querySingleWorldRowImpl(tableName, filters, vwLog);
}

function ensureWorldDatabaseSchema() {
  ensureWorldDatabaseSchemaImpl(
    {
      worldType: VWORLD_WORLD_TYPE_TABLE,
      npc: VWORLD_NPC_TABLE,
      npcActiveWorld: VWORLD_NPC_ACTIVE_WORLD_TABLE,
      npcTick: VWORLD_NPC_TICK_TABLE,
      npcTickLease: VWORLD_NPC_TICK_LEASE_TABLE,
      playerHeartbeat: VWORLD_PLAYER_HEARTBEAT_TABLE,
      playerMoveLease: VWORLD_PLAYER_MOVE_LEASE_TABLE,
      onlinePresence: VWORLD_ONLINE_PRESENCE_TABLE,
      playerNick: VWORLD_PLAYER_NICK_TABLE,
      playerWorld: VWORLD_PLAYER_WORLD_TABLE,
      playerPosition: VWORLD_PLAYER_POSITION_TABLE,
      playerInventory: VWORLD_PLAYER_INVENTORY_TABLE,
      worldMod: VWORLD_WORLD_MOD_TABLE,
      worldItem: VWORLD_WORLD_ITEM_TABLE,
      worldItemMeta: VWORLD_WORLD_ITEM_META_TABLE,
    },
    parseWorldDbResult,
    vwLog,
  );
}

/**
 * @param {Array<any>} [collector]
 */
function ensureChatDatabaseSchema(collector) {
  ensureChatDatabaseSchemaImpl(
    {
      chat: VWORLD_CHAT_TABLE,
      dm: VWORLD_DM_TABLE,
      dmIndex: VWORLD_DM_INDEX_TABLE,
    },
    parseChatDbResult,
    vwLog,
    collector,
  );
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

/**
 * @param {string} worldId
 * @returns {Array<{id:string,sender_id:string,sender_nick:string,text:string,ts:number}>}
 */
function loadWorldChat(worldId) {
  return loadWorldChatImpl(worldId, VWORLD_CHAT_TABLE, WORLD_CHAT_MAX, vwLog);
}

/**
 * @param {string} worldId
 * @param {{id:string,sender_id:string,sender_nick:string,text:string,ts:number}} msg
 */
function appendWorldChatMessage(worldId, msg) {
  appendWorldChatMessageImpl(
    worldId,
    msg,
    VWORLD_CHAT_TABLE,
    WORLD_CHAT_MAX,
    vwLog,
  );
}

// ── Direct messages ───────────────────────────────────────────────────────────

var DM_MAX = 200;

/**
 * Returns the storage key for a DM conversation (stable regardless of who
 * is sender / recipient).
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function dmConversationKey(a, b) {
  return dmConversationKeyImpl(a, b);
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {Array<{id:string,sender_id:string,sender_nick:string,recipient_id:string,text:string,ts:number}>}
 */
function loadDMHistory(a, b) {
  return loadDMHistoryImpl(a, b, VWORLD_DM_TABLE, DM_MAX, vwLog);
}

/**
 * @param {string} a
 * @param {string} b
 * @param {{id:string,sender_id:string,sender_nick:string,recipient_id:string,text:string,ts:number}} msg
 */
function appendDMMessage(a, b, msg) {
  appendDMMessageImpl(a, b, msg, VWORLD_DM_TABLE, DM_MAX, vwLog);
}

/**
 * @param {string} userId
 * @returns {string[]}
 */
function loadDMIndex(userId) {
  return loadDMIndexImpl(userId, VWORLD_DM_INDEX_TABLE, vwLog);
}

/**
 * @param {string} userId
 * @param {string} otherUserId
 * @param {number} [ts]
 */
function addToDMIndex(userId, otherUserId, ts) {
  addToDMIndexImpl(userId, otherUserId, ts, VWORLD_DM_INDEX_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @returns {{next_item_seq: number, seeded: number, updated_ts: number}}
 */
function loadWorldItemMeta(worldId) {
  return loadWorldItemMetaImpl(worldId, VWORLD_WORLD_ITEM_META_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @param {{next_item_seq:number, seeded:number, updated_ts?:number}} meta
 */
function saveWorldItemMeta(worldId, meta) {
  saveWorldItemMetaImpl(worldId, meta, VWORLD_WORLD_ITEM_META_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @returns {Record<string, any[]>}
 */
function loadWorldItems(worldId) {
  return loadWorldItemsImpl(
    worldId,
    VWORLD_WORLD_ITEM_TABLE,
    vwLog,
    resolvePortalDestinationWorldType,
  );
}

/**
 * @param {string} worldId
 * @param {Record<string, any[]>} items
 */
function saveWorldItems(worldId, items) {
  saveWorldItemsImpl(worldId, items, VWORLD_WORLD_ITEM_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @param {number} row
 * @param {number} col
 * @param {*} item
 */
function upsertWorldItem(worldId, row, col, item) {
  upsertWorldItemImpl(worldId, row, col, item, VWORLD_WORLD_ITEM_TABLE, vwLog);
}

/**
 * @param {string} itemId
 */
function deleteWorldItemById(itemId) {
  deleteWorldItemByIdImpl(itemId, VWORLD_WORLD_ITEM_TABLE, vwLog);
}

/**
 * @param {any[]} items
 */
function deleteWorldItems(items) {
  deleteWorldItemsImpl(items, VWORLD_WORLD_ITEM_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @returns {number}
 */
function nextWorldItemId(worldId) {
  return nextWorldItemIdImpl(worldId, VWORLD_WORLD_ITEM_META_TABLE, vwLog);
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
    ROWS: ROWS,
    COLS: COLS,
    ITEM_TYPES: ITEM_TYPES,
  });
}

/**
 * @param {Record<string, any[]>} itemsByTile
 * @returns {Array<{id: string, type: string, row: number, col: number, destination_world_id?: string, destination_world_type?: string}>}
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
    vwLog,
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
    vwLog,
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
    vwLog,
  );
}

/**
 * @param {string} worldId
 * @returns {Record<string, any>}
 */
function loadWorldNPCs(worldId) {
  return loadWorldNPCsImpl(worldId, VWORLD_NPC_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @param {Record<string, any>} npcs
 */
function saveWorldNPCs(worldId, npcs) {
  saveWorldNPCsImpl(worldId, npcs, VWORLD_NPC_TABLE, vwLog);
}

/**
 * @returns {Record<string, number>}
 */
function loadNPCActiveWorlds() {
  return loadNPCActiveWorldsImpl(VWORLD_NPC_ACTIVE_WORLD_TABLE, vwLog);
}

/**
 * @param {Record<string, number>} worlds
 */
function saveNPCActiveWorlds(worlds) {
  saveNPCActiveWorldsImpl(worlds, VWORLD_NPC_ACTIVE_WORLD_TABLE, vwLog);
}

/**
 * @param {string} worldId
 */
function markNPCWorldActive(worldId) {
  markNPCWorldActiveImpl(worldId, VWORLD_NPC_ACTIVE_WORLD_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @returns {number}
 */
function loadNPCLastTick(worldId) {
  return loadNPCLastTickImpl(worldId, VWORLD_NPC_TICK_TABLE, vwLog);
}

/**
 * @param {string} worldId
 * @param {number} lastTickTs
 */
function saveNPCLastTick(worldId, lastTickTs) {
  saveNPCLastTickImpl(worldId, lastTickTs, VWORLD_NPC_TICK_TABLE, vwLog);
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
    normalizeInventory: normalizeInventory,
    getEffectiveMap: getEffectiveMap,
    loadWorldPlayers: loadWorldPlayers,
    NPC_MIN_COUNT: NPC_MIN_COUNT,
    NPC_MAX_COUNT: NPC_MAX_COUNT,
    ROWS: ROWS,
    COLS: COLS,
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
    ROWS: ROWS,
    COLS: COLS,
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
    ROWS: ROWS,
    COLS: COLS,
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
    ROWS: ROWS,
    COLS: COLS,
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
    ROWS: ROWS,
    COLS: COLS,
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

var VW_DEBUG = false;

/**
 * @param {string} msg
 * @param {*} [obj]
 */
function vwLog(msg, obj) {
  if (!VW_DEBUG) return;
  try {
    if (obj !== undefined) {
      console.log("[vworld] " + msg + " " + JSON.stringify(obj));
    } else {
      console.log("[vworld] " + msg);
    }
  } catch (e) {
    console.log("[vworld] " + msg);
  }
}

/**
 * @param {string} worldId
 * @param {string} userId
 * @returns {{row: number, col: number, seq: number, rotation: number}}
 */
function getCanonicalPlayerState(worldId, userId) {
  return getCanonicalPlayerStateImpl(
    worldId,
    userId,
    VWORLD_PLAYER_POSITION_TABLE,
    vwLog,
    getDefaultSpawnPosition,
  );
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
 * @param {{left_hand: any, right_hand: any, inventory: any[]}} inventory
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
 * @param {number} row
 * @param {number} col
 * @param {number} rotation
 * @returns {{row: number, col: number, direction: string}}
 */
function getTargetTileFromRotation(row, col, rotation) {
  return getTargetTileFromRotationImpl(row, col, rotation);
}

/**
 * @param {string} direction
 * @returns {string}
 */
function normalizeMoveDirection(direction) {
  return normalizeMoveDirectionImpl(direction);
}

/**
 * @param {string} direction
 * @returns {number|null}
 */
function rotationForDirection(direction) {
  return rotationForDirectionImpl(direction);
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
    ROWS: ROWS,
    COLS: COLS,
  });
}

/**
 * @param {string} userId
 * @returns {{ok: boolean, world_id: string, world_type: string, player: {row: number, col: number, seq: number, rotation: number}, items: Array<{id: string, type: string, row: number, col: number}>, tile_items: any[], inventory: {left_hand: any, right_hand: any, inventory: any[]}, world_mods: any, houses: any, available_actions: string[], move_options: Record<string, {row: number, col: number, walkable: boolean, tile_type: string, in_bounds: boolean}>, facing_tile: {row: number, col: number, direction: string}}}
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
  var toRow =
    body && body.toRow !== undefined
      ? Number(body.toRow)
      : Number(body && body.row);
  var toCol =
    body && body.toCol !== undefined
      ? Number(body.toCol)
      : Number(body && body.col);
  var rotation = Number(body && body.rotation);
  var sessionId = body && body.session_id ? String(body.session_id) : "legacy";

  if (!isFinite(toRow) || !isFinite(toCol)) {
    return {
      status: 400,
      payload: { ok: false, error: "Invalid move payload" },
    };
  }

  var worldId = getPlayerWorld(userId);
  if (!worldId) {
    return { status: 200, payload: { ok: false, row: 1, col: 1 } };
  }
  markNPCWorldActive(worldId);

  var lease = loadPlayerMoveLease(userId);
  var now = Date.now();
  var leaseSessionId =
    lease && typeof lease.session_id === "string" ? lease.session_id : "";
  var leaseValid = !!lease && Number(lease.expires_at || 0) > now;
  if (leaseValid && leaseSessionId !== sessionId) {
    vwLog("move taking over lease", {
      user_id: userId,
      world_id: worldId,
      previous_session: leaseSessionId,
      session_id: sessionId,
    });
  }
  savePlayerMoveLease(userId, sessionId, now + LEASE_TTL_MS);

  var players = loadWorldPlayers(worldId);
  var cur = players[userId];
  if (!cur) {
    var savedPos = loadPlayerPosition(userId);
    var defaultSpawn = getDefaultSpawnPosition(worldId, userId);
    cur = {
      row: savedPos ? savedPos.row : defaultSpawn.row,
      col: savedPos ? savedPos.col : defaultSpawn.col,
      seq: savedPos ? savedPos.seq : defaultSpawn.seq,
      rotation: savedPos
        ? Number(savedPos.rotation)
        : Number(defaultSpawn.rotation),
      session_id: savedPos ? savedPos.session_id : "",
    };
  }
  if (!isFinite(rotation)) rotation = Number(cur && cur.rotation);
  if (!isFinite(rotation)) rotation = 0;

  var expectedSeq = cur.seq + 1;
  var clientSeq =
    body && body.seq !== undefined ? Number(body.seq) : expectedSeq;
  if (clientSeq !== expectedSeq) {
    vwLog("move rejected: stale seq", {
      user_id: userId,
      world_id: worldId,
      session_id: sessionId,
      expected_seq: expectedSeq,
      client_seq: clientSeq,
      cur_row: cur.row,
      cur_col: cur.col,
      req_row: toRow,
      req_col: toCol,
    });
    return {
      status: 200,
      payload: {
        ok: false,
        stale: true,
        row: cur.row,
        col: cur.col,
        seq: cur.seq,
      },
    };
  }

  var dr = Math.abs(toRow - cur.row);
  var dc = Math.abs(toCol - cur.col);
  var map = getEffectiveMap(worldId);
  var withinBounds = toRow >= 0 && toRow < ROWS && toCol >= 0 && toCol < COLS;
  var singleStep = dr + dc === 1;
  var walkable = withinBounds && isWorldTileWalkable(map[toRow][toCol]);

  if (!singleStep || !walkable) {
    vwLog("move rejected: invalid step", {
      user_id: userId,
      world_id: worldId,
      session_id: sessionId,
      from_row: cur.row,
      from_col: cur.col,
      to_row: toRow,
      to_col: toCol,
      single_step: singleStep,
      walkable: walkable,
    });
    return {
      status: 200,
      payload: {
        ok: false,
        stale: false,
        row: cur.row,
        col: cur.col,
        seq: cur.seq,
      },
    };
  }

  players[userId] = {
    row: toRow,
    col: toCol,
    seq: cur.seq + 1,
    rotation: rotation,
    session_id: sessionId,
    ts: Date.now(),
  };
  saveWorldPlayers(worldId, players);
  savePlayerPosition(userId, worldId, {
    row: toRow,
    col: toCol,
    seq: cur.seq + 1,
    rotation: rotation,
    session_id: sessionId,
    ts: Date.now(),
  });
  sendWorldScopedStreamEvent(String(worldId), "player_moved", {
    player_id: userId,
    row: toRow,
    col: toCol,
    seq: cur.seq + 1,
    rotation: rotation,
  });
  vwLog("move accepted", {
    user_id: userId,
    world_id: worldId,
    session_id: sessionId,
    row: toRow,
    col: toCol,
    seq: cur.seq + 1,
  });
  return {
    status: 200,
    payload: {
      ok: true,
      row: toRow,
      col: toCol,
      seq: cur.seq + 1,
      rotation: rotation,
      world_id: String(worldId),
    },
  };
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
function performTreeActionForUser(userId, body) {
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
    ROWS: ROWS,
    COLS: COLS,
    getEffectiveMap: getEffectiveMap,
    loadWorldTrees: loadWorldTrees,
    loadWorldHouses: loadWorldHouses,
    isOakClearingTile: isOakClearingTile,
    saveWorldHouses: saveWorldHouses,
    createWorldOfType: createWorldOfType,
    deleteWorldItems: deleteWorldItems,
    isOakCenterTile: isOakCenterTile,
    saveWorldTrees: saveWorldTrees,
  });
}

/**
 * @param {string | null | undefined} action
 * @returns {*}
 */
function getActionDefinition(action) {
  return getActionDefinitionImpl(action);
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
      createEmptyInventory: createEmptyInventory,
      ensureWorldItems: ensureWorldItems,
      flattenWorldItems: flattenWorldItems,
      loadWorldItems: loadWorldItems,
      loadPlayerInventory: loadPlayerInventory,
    }),
  );
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
function handleItemActionForUser(userId, body) {
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
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
function craftRecipeForUser(userId, body) {
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
    ROWS: ROWS,
    COLS: COLS,
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

  var handled = handleItemActionForUser(userId, body);
  return ResponseBuilder.json(handled.payload, handled.status);
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
  return ResponseBuilder.json(handled.payload, handled.status);
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
 * @returns {{ok: boolean, action: string, granted_count: number, inventory: {left_hand: any, right_hand: any, inventory: any[]}, items: Array<{id: string, type: string, row: number, col: number}>}}
 */
function grantAllItemsForUser(userId) {
  return grantAllItemsForUserImpl(userId, {
    getPlayerWorld: getPlayerWorld,
    loadPlayerInventory: loadPlayerInventory,
    getAllKnownItemTypes: getAllKnownItemTypes,
    savePlayerInventory: savePlayerInventory,
    ensureWorldItems: ensureWorldItems,
    loadWorldItems: loadWorldItems,
    flattenWorldItems: flattenWorldItems,
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
  });
  if (
    handled &&
    handled.status === 200 &&
    handled.payload &&
    handled.payload.nick
  ) {
    var currentWorldId = getPlayerWorld(userId);
    if (currentWorldId) {
      updateOnlinePresence(userId, currentWorldId, "");
    }
  }
  return ResponseBuilder.json(handled.payload, handled.status);
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
  return ResponseBuilder.json(grantAllItemsForUser(userId));
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
  var handled = movePlayerForUser(userId, body);
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
  return buildActiveWorldPlayersImpl(
    worldId,
    VWORLD_PLAYER_POSITION_TABLE,
    VWORLD_PLAYER_HEARTBEAT_TABLE,
    vwLog,
    90000,
  );
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
    }),
  );
}

/**
 * @param {*} context
 */
function currentWorldHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(
    getCurrentWorldStateForHttpUserImpl(userId, {
      getCurrentWorldStateForUser: getCurrentWorldStateForUser,
    }),
  );
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
  return ResponseBuilder.json(handled.payload, handled.status);
}

function init() {
  ensureWorldDatabaseSchema();
  ensureChatDatabaseSchema();
  startNPCTicker();
  registerVirtualWorldRuntimeImpl({
    routeRegistry: routeRegistry,
    mcpRegistry: mcpRegistry,
    vwLog: vwLog,
    virtualWorldEventsStreamPath: VIRTUAL_WORLD_EVENTS_STREAM_PATH,
  });
}
