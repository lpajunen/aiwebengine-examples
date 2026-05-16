/// <reference path="../../types/aiwebengine.d.ts" />

import {
  canInventoryUseTreeAction,
  canTileItemsUseTreeAction,
  createWorldId,
  EXTRA_ITEM_TYPES,
  getAllKnownItemTypes,
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
  getDefaultWorldTypeForWorldId,
  getOakClearingTiles,
  getWorldBoundaryTileName,
  getWorldFloorTileName,
  getWorldTileDef,
  getWorldWallTileName,
  isOakCenterTile,
  isOakClearingTile,
  isOakWorld,
  isValidItem,
  isWorldTileWalkable,
  normalizeInventory,
  normalizeWorldType,
  PORTAL_BUILD_ACTIONS,
  TREE_ACTION_BY_ITEM_TYPE,
  portalBuildActionForWorldType,
  toStoredWorldTimestamp,
  fromStoredWorldTimestamp,
  WORLD_MOD_LAYER_OBJECT,
  WORLD_MOD_LAYER_TERRAIN,
  WORLD_TILE_CAVE_FLOOR,
  WORLD_TILE_DEFS,
  WORLD_TILE_GROUND,
  WORLD_TILE_HOUSE,
  WORLD_TILE_LAKE,
  WORLD_TILE_MOUNTAIN,
  WORLD_TILE_NAME_BY_VALUE,
  WORLD_TILE_OCEAN,
  WORLD_TILE_PINE_TREE,
  WORLD_TILE_RIVER,
  WORLD_TILE_ROCK,
  WORLD_TILE_SAND,
  WORLD_TILE_SPRUCE_THICKET,
  WORLD_TILE_WOOD_FLOOR,
  WORLD_TYPE_BUILDING,
  WORLD_TYPE_CAVE,
  WORLD_TYPE_FOREST,
  WORLD_TYPE_ISLAND,
  WORLD_TYPES,
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
import {
  switchUserToNewWorld as switchUserToNewWorldImpl,
  switchUserToStartWorld as switchUserToStartWorldImpl,
  switchUserWorld as switchUserWorldImpl,
} from "./server/world-switch.ts";
import {
  createWorldOfType as createWorldOfTypeImpl,
  getOrCreatePlayerWorld as getOrCreatePlayerWorldImpl,
  getWorldType as getWorldTypeImpl,
  resolvePortalDestinationWorldType as resolvePortalDestinationWorldTypeImpl,
  saveWorldType as saveWorldTypeImpl,
} from "./server/world-bootstrap.ts";
import { performTreeActionForUser as performTreeActionForUserImpl } from "./server/tree-action-helpers.ts";
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
  if (!isOakWorld(worldId)) {
    return { row: 1, col: 1, seq: 0, rotation: 0 };
  }

  var tiles = getOakClearingTiles(worldId);
  if (tiles.length === 0) {
    return {
      row: OAK_CENTER_ROW + 1,
      col: OAK_CENTER_COL,
      seq: 0,
      rotation: 0,
    };
  }

  var map = getEffectiveMap(String(worldId));
  var players = loadWorldPlayers(String(worldId));
  /** @type {Record<string, boolean>} */
  var occupied = {};
  for (var playerId in players) {
    var player = players[playerId];
    if (!player) continue;
    occupied[Number(player.row) + "_" + Number(player.col)] = true;
  }

  var startIndex = userId ? hashString(userId) % tiles.length : 0;
  var fallbackTile = null;
  for (var i = 0; i < tiles.length; i++) {
    var tile = tiles[(startIndex + i) % tiles.length];
    if (
      !tile ||
      !map[tile.row] ||
      !isWorldTileWalkable(map[tile.row][tile.col])
    ) {
      continue;
    }
    if (!fallbackTile) fallbackTile = tile;
    if (!occupied[tile.row + "_" + tile.col]) {
      return { row: tile.row, col: tile.col, seq: 0, rotation: 0 };
    }
  }

  if (fallbackTile) {
    return {
      row: fallbackTile.row,
      col: fallbackTile.col,
      seq: 0,
      rotation: 0,
    };
  }

  return { row: OAK_CENTER_ROW + 1, col: OAK_CENTER_COL, seq: 0, rotation: 0 };
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
  return String(value || "").replace(/[<>&]/g, function (c) {
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    return "&amp;";
  });
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
  const userId = req.auth.userId;
  const authName = req.auth.userName || "";

  // ── Server-side state ─────────────────────────────────────────────────────
  const worldId = getOrCreatePlayerWorld(userId);
  markNPCWorldActive(worldId);
  ensureStarterKit(userId);
  const map = generateMap(worldId);
  const worldMods = loadWorldMods(worldId);
  const treeMods = loadWorldTrees(worldId);
  const houseMods = loadWorldHouses(worldId);
  ensureWorldItems(worldId);
  const worldItems = loadWorldItems(worldId);
  const playerInventory = loadPlayerInventory(userId);
  const npcs = getWorldNPCSnapshot(worldId);
  const savedPos = loadPlayerPosition(userId);
  const hasSavedPos = savedPos && savedPos.world_id === String(worldId);
  const initialPos = hasSavedPos
    ? savedPos
    : getDefaultSpawnPosition(worldId, userId);
  if (!hasSavedPos) {
    savePlayerPosition(userId, worldId, {
      row: initialPos.row,
      col: initialPos.col,
      seq: initialPos.seq || 0,
      rotation: Number.isFinite(Number(initialPos.rotation))
        ? Number(initialPos.rotation)
        : 0,
      ts: Date.now(),
    });
  }
  const initRow = initialPos.row;
  const initCol = initialPos.col;
  const initSeq = initialPos.seq || 0;
  const initRotation = Number.isFinite(Number(initialPos.rotation))
    ? Number(initialPos.rotation)
    : 0;
  let playerNick = loadPlayerNick(userId);
  if (!playerNick && authName) {
    savePlayerNick(userId, authName);
    playerNick = authName;
  }
  // Register presence NOW so the loading player appears in the snapshot they receive
  // and in other players' next poll.  Session ID is not yet known (it's client-generated),
  // so pass ""; the first heartbeat will claim the session and preserve login_at.
  updateOnlinePresence(userId, worldId, "");
  const onlinePlayers = buildOnlinePlayersSnapshot();
  const initialChat = loadWorldChat(worldId).slice(-50);
  const initialDmIndex = loadDMIndex(userId);
  const worldFlavorText = getWorldFlavorText(worldId);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Virtual World</title>
  <link rel="stylesheet" href="/virtual-world/styles.css">
</head>
<body class="game">
  <div class="hud" id="hud-pos">
    <strong>Virtual World</strong>
    <div style="margin:4px 0 6px;color:#d8e7c2;font-style:italic;max-width:220px;line-height:1.35;">${escapeHtml(worldFlavorText)}</div>
    <span id="hud-nick-row"><span id="nick-display">${escapeHtml(playerNick || authName)}</span><button id="nick-edit-btn" onclick="startNickEdit()" title="Rename">✏️</button><span id="nick-edit-row" style="display:none;"><input id="nick-input" type="text" maxlength="24"><button onclick="commitNickEdit()" title="Save">✓</button><button onclick="cancelNickEdit()" title="Cancel">✗</button></span></span><br>
    World: ${worldId}<br>
    Position: <span id="pos-col">${initCol}</span>, <span id="pos-row">${initRow}</span><br>
    L: <span id="held-left">-</span> | R: <span id="held-right">-</span>
  </div>

  <div class="hud" id="hud-legend">
    <strong>Legend</strong>
    <div class="leg" id="legend-ground"><div class="leg-box" style="background:#7ab648;"></div> Forest Floor</div>
    <div class="leg"><div class="leg-box" style="background:#355c34;"></div> Spruce Thicket</div>
    <div class="leg"><div class="leg-box" style="background:#2d8a3e;"></div> Pine Tree</div>
    <div class="leg"><div class="leg-box" style="background:#4f91c9;"></div> Water</div>
    <div class="leg"><div class="leg-box" style="background:#7f8892;"></div> Rock / Mountain</div>
    <div class="leg" id="legend-you"><div class="leg-box" style="background:#2980b9;"></div> You</div>
  </div>

  <div class="hud" id="hud-keys">
    Move: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> &nbsp;or&nbsp; <kbd>&uarr;</kbd><kbd>&larr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd>
    &nbsp;&nbsp;|&nbsp;&nbsp; Camera: <kbd>drag</kbd> to orbit &nbsp; <kbd>scroll</kbd> to zoom
  </div>

  <div class="hud" id="hud-auth-status" aria-live="polite"></div>

  <div class="hud" id="hud-cheat-toast" aria-live="polite"></div>

  <div class="hud" id="hud-tree-actions">
    <button id="btn-use" onclick="useItem()">Use</button>
    <button id="btn-pick" onclick="pickItemsOnTile()">📦 Pick</button>
    <button id="btn-items" onclick="toggleInventoryPanel()">🎒 Items</button>
    <button id="btn-players" onclick="togglePlayersPanel()">👥 Players</button>
    <button id="btn-chat" onclick="toggleChatPanel()">💬 Chat<span class="unread-badge" id="chat-unread-badge"></span></button>
  </div>

  <div class="hud" id="hud-use-picker">
    <div class="panel-header">
      <span class="panel-title">Choose Action</span>
      <button class="panel-close" onclick="closeUsePicker()" title="Close">×</button>
    </div>
    <div id="use-picker-actions"></div>
  </div>

  <div class="hud" id="hud-inventory-panel">
    <div class="panel-header">
      <span class="panel-title">Inventory</span>
      <button class="panel-close" onclick="closeInventoryPanel()" title="Close">×</button>
    </div>
    <div class="inv-hands">
      <div class="inv-hand" id="inv-left-hand"></div>
      <div class="inv-hand" id="inv-right-hand"></div>
    </div>
    <div id="inv-list"></div>
    <div id="inv-footer">
      <span id="inv-count">0 items</span>
    </div>
  </div>

  <div class="hud" id="hud-tile-detail" aria-live="polite">
    <div class="panel-header">
      <span class="panel-title" id="tile-detail-title">Square (0, 0)</span>
      <button class="panel-close" onclick="closeTileDetail()" title="Close">×</button>
    </div>
    <div id="tile-detail-body"></div>
  </div>

  <div class="hud" id="hud-players-panel">
    <div class="panel-header">
      <span class="panel-title">Players Online</span>
      <button class="panel-close" onclick="closePlayersPanel()" title="Close">×</button>
    </div>
    <div id="players-list-wrap">
      <table class="players-table">
        <thead><tr>
          <th>Name</th><th>World</th><th>Online since</th><th>Last active</th><th></th>
        </tr></thead>
        <tbody id="players-table-body"></tbody>
      </table>
    </div>
  </div>

  <div class="hud" id="hud-chat-panel">
    <div class="panel-header">
      <span class="panel-title" id="chat-panel-title">Chat</span>
      <button class="panel-close" onclick="closeChatPanel()" title="Close">×</button>
    </div>
    <div class="chat-tabs">
      <button class="chat-tab active" id="chat-tab-world" onclick="switchChatTab('world')">World</button>
      <button class="chat-tab" id="chat-tab-dm" onclick="switchChatTab('dm')">Direct Messages<span class="unread-badge" id="dm-tab-badge"></span></button>
    </div>
    <div class="chat-content" id="chat-content-world">
      <div class="chat-msgs" id="world-chat-msgs"></div>
      <div class="chat-input-row">
        <input type="text" id="world-chat-input" placeholder="Say something…" maxlength="500" onkeydown="if(event.key==='Enter')sendWorldChatMessage()">
        <button onclick="sendWorldChatMessage()">Send</button>
      </div>
    </div>
    <div class="chat-content hidden" id="chat-content-dm">
      <div id="dm-thread-view" style="display:none;flex:1;min-height:0;flex-direction:column;">
        <button class="dm-back" onclick="showDMConvoList()">← Back</button>
        <div class="chat-msgs" id="dm-thread-msgs"></div>
        <div class="chat-input-row">
          <input type="text" id="dm-chat-input" placeholder="Send a direct message…" maxlength="500" onkeydown="if(event.key==='Enter')sendDirectMessage()">
          <button onclick="sendDirectMessage()">Send</button>
        </div>
      </div>
      <div id="dm-convo-list" class="dm-convos" style="overflow-y:auto;flex:1;min-height:0;"></div>
    </div>
  </div>

  <div id="joystick-container">
    <div id="joystick-base"></div>
    <div id="joystick-stick"></div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script>
    // ── Server-injected game state ────────────────────────────────────────────
    var MAP      = ${JSON.stringify(map)};
    var WORLD_MODS = ${JSON.stringify(worldMods)};
    var WORLD_TILE_DEFS = ${JSON.stringify(WORLD_TILE_DEFS)};
    var TREE_MODS = ${JSON.stringify(treeMods)};
    var HOUSE_MODS = ${JSON.stringify(houseMods)};
    var WORLD_ITEMS = ${JSON.stringify(worldItems)};
    var PLAYER_INV = ${JSON.stringify(playerInventory)};
    var NPCS = ${JSON.stringify(npcs)};
    var worldId  = ${JSON.stringify(worldId)};
    var playerId = ${JSON.stringify(userId)};
    var PLAYER_NICK = ${JSON.stringify(playerNick)};
    var ONLINE_PLAYERS = ${JSON.stringify(onlinePlayers)};
    var INITIAL_CHAT = ${JSON.stringify(initialChat)};
    var INITIAL_DM_INDEX = ${JSON.stringify(initialDmIndex)};
    var INIT_ROW = ${JSON.stringify(initRow)};
    var INIT_COL = ${JSON.stringify(initCol)};
    var INIT_SEQ = ${JSON.stringify(initSeq)};
    var INIT_ROTATION = ${JSON.stringify(initRotation)};
  </script>
  <script src="/virtual-world/client.js"></script>
</body>
</html>`;

  return ResponseBuilder.html(html);
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
  var inv = loadPlayerInventory(userId);
  var allItems = [];
  if (inv.left_hand) allItems.push(inv.left_hand);
  if (inv.right_hand) allItems.push(inv.right_hand);
  if (Array.isArray(inv.inventory)) {
    allItems = allItems.concat(inv.inventory);
  }
  var hasKit = allItems.some(function (item) {
    return item && item.type === "starter_kit";
  });
  if (!hasKit) {
    inv.inventory.push({
      id: "starter_kit_" + userId,
      type: "starter_kit",
      created_at: Date.now(),
      non_droppable: true,
    });
  }
  if (!hasKit) savePlayerInventory(userId, inv);
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
 * Write the per-user online-presence entry.  Safe to call from heartbeat
 * because each user only writes their own key — no read-modify-write of a
 * shared object, so there is no concurrency hazard.
 * @param {string} userId
 * @param {string} worldId
 * @param {string} sessionId
 */
function updateOnlinePresence(userId, worldId, sessionId) {
  updateOnlinePresenceImpl(
    userId,
    worldId,
    sessionId,
    VWORLD_ONLINE_PRESENCE_TABLE,
    VWORLD_PLAYER_NICK_TABLE,
    vwLog,
  );
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
  return executeSchemaStep("world", op, tableName, run, columnName, collector);
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
  return executeSchemaStep("chat", op, tableName, run, columnName, collector);
}

/**
 * @param {Array<any>} [collector]
 */
function ensureLateWorldDatabaseSchema(collector) {
  runWorldSchemaStep(
    "createTable",
    VWORLD_WORLD_TYPE_TABLE,
    function () {
      return database.createTable(VWORLD_WORLD_TYPE_TABLE);
    },
    undefined,
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_WORLD_TYPE_TABLE,
    function () {
      return database.addTextColumn(VWORLD_WORLD_TYPE_TABLE, "world_id", false);
    },
    "world_id",
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_WORLD_TYPE_TABLE,
    function () {
      return database.addTextColumn(
        VWORLD_WORLD_TYPE_TABLE,
        "world_type",
        false,
      );
    },
    "world_type",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    VWORLD_WORLD_TYPE_TABLE,
    function () {
      return database.addIntegerColumn(
        VWORLD_WORLD_TYPE_TABLE,
        "updated_ts",
        false,
      );
    },
    "updated_ts",
    collector,
  );
  runWorldSchemaStep(
    "createTable",
    VWORLD_NPC_TABLE,
    function () {
      return database.createTable(VWORLD_NPC_TABLE);
    },
    undefined,
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_NPC_TABLE,
    function () {
      return database.addTextColumn(VWORLD_NPC_TABLE, "npc_id", false);
    },
    "npc_id",
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_NPC_TABLE,
    function () {
      return database.addTextColumn(VWORLD_NPC_TABLE, "world_id", false);
    },
    "world_id",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    VWORLD_NPC_TABLE,
    function () {
      return database.addIntegerColumn(VWORLD_NPC_TABLE, "row", false);
    },
    "row",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    VWORLD_NPC_TABLE,
    function () {
      return database.addIntegerColumn(VWORLD_NPC_TABLE, "col", false);
    },
    "col",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    VWORLD_NPC_TABLE,
    function () {
      return database.addIntegerColumn(VWORLD_NPC_TABLE, "seq", false);
    },
    "seq",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    VWORLD_NPC_TABLE,
    function () {
      return database.addIntegerColumn(VWORLD_NPC_TABLE, "rotation", false);
    },
    "rotation",
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_NPC_TABLE,
    function () {
      return database.addTextColumn(VWORLD_NPC_TABLE, "state", true);
    },
    "state",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    VWORLD_NPC_TABLE,
    function () {
      return database.addIntegerColumn(VWORLD_NPC_TABLE, "ts", false);
    },
    "ts",
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_NPC_TABLE,
    function () {
      return database.addTextColumn(VWORLD_NPC_TABLE, "left_hand_json", true);
    },
    "left_hand_json",
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_NPC_TABLE,
    function () {
      return database.addTextColumn(VWORLD_NPC_TABLE, "right_hand_json", true);
    },
    "right_hand_json",
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_NPC_TABLE,
    function () {
      return database.addTextColumn(VWORLD_NPC_TABLE, "inventory_json", false);
    },
    "inventory_json",
    collector,
  );
  runWorldSchemaStep(
    "addUniqueIndex",
    VWORLD_NPC_TABLE,
    function () {
      return database.addUniqueIndex(
        VWORLD_NPC_TABLE,
        JSON.stringify(["npc_id"]),
      );
    },
    undefined,
    collector,
  );

  runWorldSchemaStep(
    "createTable",
    VWORLD_NPC_ACTIVE_WORLD_TABLE,
    function () {
      return database.createTable(VWORLD_NPC_ACTIVE_WORLD_TABLE);
    },
    undefined,
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_NPC_ACTIVE_WORLD_TABLE,
    function () {
      return database.addTextColumn(
        VWORLD_NPC_ACTIVE_WORLD_TABLE,
        "world_id",
        false,
      );
    },
    "world_id",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    VWORLD_NPC_ACTIVE_WORLD_TABLE,
    function () {
      return database.addIntegerColumn(
        VWORLD_NPC_ACTIVE_WORLD_TABLE,
        "last_active_ts",
        false,
      );
    },
    "last_active_ts",
    collector,
  );
  runWorldSchemaStep(
    "addUniqueIndex",
    VWORLD_NPC_ACTIVE_WORLD_TABLE,
    function () {
      return database.addUniqueIndex(
        VWORLD_NPC_ACTIVE_WORLD_TABLE,
        JSON.stringify(["world_id"]),
      );
    },
    undefined,
    collector,
  );

  runWorldSchemaStep(
    "createTable",
    VWORLD_NPC_TICK_TABLE,
    function () {
      return database.createTable(VWORLD_NPC_TICK_TABLE);
    },
    undefined,
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_NPC_TICK_TABLE,
    function () {
      return database.addTextColumn(VWORLD_NPC_TICK_TABLE, "world_id", false);
    },
    "world_id",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    VWORLD_NPC_TICK_TABLE,
    function () {
      return database.addIntegerColumn(
        VWORLD_NPC_TICK_TABLE,
        "last_tick_ts",
        false,
      );
    },
    "last_tick_ts",
    collector,
  );
  runWorldSchemaStep(
    "addUniqueIndex",
    VWORLD_NPC_TICK_TABLE,
    function () {
      return database.addUniqueIndex(
        VWORLD_NPC_TICK_TABLE,
        JSON.stringify(["world_id"]),
      );
    },
    undefined,
    collector,
  );

  runWorldSchemaStep(
    "createLeaseTable",
    VWORLD_NPC_TICK_LEASE_TABLE,
    function () {
      return database.createLeaseTable(VWORLD_NPC_TICK_LEASE_TABLE);
    },
    undefined,
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
  reportWorldSchemaResult(
    "createTable",
    VWORLD_PLAYER_HEARTBEAT_TABLE,
    parseWorldDbResult(database.createTable(VWORLD_PLAYER_HEARTBEAT_TABLE)),
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_HEARTBEAT_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_PLAYER_HEARTBEAT_TABLE, "user_id", false),
    ),
    "user_id",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_PLAYER_HEARTBEAT_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(
        VWORLD_PLAYER_HEARTBEAT_TABLE,
        "heartbeat_ts",
        false,
      ),
    ),
    "heartbeat_ts",
  );
  reportWorldSchemaResult(
    "addUniqueIndex",
    VWORLD_PLAYER_HEARTBEAT_TABLE,
    parseWorldDbResult(
      database.addUniqueIndex(
        VWORLD_PLAYER_HEARTBEAT_TABLE,
        JSON.stringify(["user_id"]),
      ),
    ),
  );

  reportWorldSchemaResult(
    "createTable",
    VWORLD_PLAYER_MOVE_LEASE_TABLE,
    parseWorldDbResult(database.createTable(VWORLD_PLAYER_MOVE_LEASE_TABLE)),
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_MOVE_LEASE_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_PLAYER_MOVE_LEASE_TABLE, "user_id", false),
    ),
    "user_id",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_MOVE_LEASE_TABLE,
    parseWorldDbResult(
      database.addTextColumn(
        VWORLD_PLAYER_MOVE_LEASE_TABLE,
        "session_id",
        false,
      ),
    ),
    "session_id",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_PLAYER_MOVE_LEASE_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(
        VWORLD_PLAYER_MOVE_LEASE_TABLE,
        "expires_ts",
        false,
      ),
    ),
    "expires_ts",
  );
  reportWorldSchemaResult(
    "addUniqueIndex",
    VWORLD_PLAYER_MOVE_LEASE_TABLE,
    parseWorldDbResult(
      database.addUniqueIndex(
        VWORLD_PLAYER_MOVE_LEASE_TABLE,
        JSON.stringify(["user_id"]),
      ),
    ),
  );

  reportWorldSchemaResult(
    "createTable",
    VWORLD_ONLINE_PRESENCE_TABLE,
    parseWorldDbResult(database.createTable(VWORLD_ONLINE_PRESENCE_TABLE)),
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_ONLINE_PRESENCE_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_ONLINE_PRESENCE_TABLE, "user_id", false),
    ),
    "user_id",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_ONLINE_PRESENCE_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_ONLINE_PRESENCE_TABLE, "world_id", false),
    ),
    "world_id",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_ONLINE_PRESENCE_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_ONLINE_PRESENCE_TABLE, "nick", false),
    ),
    "nick",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_ONLINE_PRESENCE_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(
        VWORLD_ONLINE_PRESENCE_TABLE,
        "login_at",
        false,
      ),
    ),
    "login_at",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_ONLINE_PRESENCE_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(
        VWORLD_ONLINE_PRESENCE_TABLE,
        "last_active_ts",
        false,
      ),
    ),
    "last_active_ts",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_ONLINE_PRESENCE_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_ONLINE_PRESENCE_TABLE, "session_id", false),
    ),
    "session_id",
  );
  reportWorldSchemaResult(
    "addUniqueIndex",
    VWORLD_ONLINE_PRESENCE_TABLE,
    parseWorldDbResult(
      database.addUniqueIndex(
        VWORLD_ONLINE_PRESENCE_TABLE,
        JSON.stringify(["user_id"]),
      ),
    ),
  );

  reportWorldSchemaResult(
    "createTable",
    VWORLD_PLAYER_NICK_TABLE,
    parseWorldDbResult(database.createTable(VWORLD_PLAYER_NICK_TABLE)),
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_NICK_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_PLAYER_NICK_TABLE, "user_id", false),
    ),
    "user_id",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_NICK_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_PLAYER_NICK_TABLE, "nick", false),
    ),
    "nick",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_PLAYER_NICK_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(VWORLD_PLAYER_NICK_TABLE, "updated_ts", false),
    ),
    "updated_ts",
  );
  reportWorldSchemaResult(
    "addUniqueIndex",
    VWORLD_PLAYER_NICK_TABLE,
    parseWorldDbResult(
      database.addUniqueIndex(
        VWORLD_PLAYER_NICK_TABLE,
        JSON.stringify(["user_id"]),
      ),
    ),
  );

  reportWorldSchemaResult(
    "createTable",
    VWORLD_PLAYER_WORLD_TABLE,
    parseWorldDbResult(database.createTable(VWORLD_PLAYER_WORLD_TABLE)),
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_WORLD_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_PLAYER_WORLD_TABLE, "user_id", false),
    ),
    "user_id",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_WORLD_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_PLAYER_WORLD_TABLE, "world_id", false),
    ),
    "world_id",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_PLAYER_WORLD_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(VWORLD_PLAYER_WORLD_TABLE, "updated_ts", false),
    ),
    "updated_ts",
  );
  reportWorldSchemaResult(
    "addUniqueIndex",
    VWORLD_PLAYER_WORLD_TABLE,
    parseWorldDbResult(
      database.addUniqueIndex(
        VWORLD_PLAYER_WORLD_TABLE,
        JSON.stringify(["user_id"]),
      ),
    ),
  );

  reportWorldSchemaResult(
    "createTable",
    VWORLD_PLAYER_POSITION_TABLE,
    parseWorldDbResult(database.createTable(VWORLD_PLAYER_POSITION_TABLE)),
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_POSITION_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_PLAYER_POSITION_TABLE, "user_id", false),
    ),
    "user_id",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_POSITION_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_PLAYER_POSITION_TABLE, "world_id", false),
    ),
    "world_id",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_PLAYER_POSITION_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(VWORLD_PLAYER_POSITION_TABLE, "row", false),
    ),
    "row",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_PLAYER_POSITION_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(VWORLD_PLAYER_POSITION_TABLE, "col", false),
    ),
    "col",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_PLAYER_POSITION_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(VWORLD_PLAYER_POSITION_TABLE, "seq", false),
    ),
    "seq",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_PLAYER_POSITION_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(
        VWORLD_PLAYER_POSITION_TABLE,
        "rotation",
        false,
      ),
    ),
    "rotation",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_POSITION_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_PLAYER_POSITION_TABLE, "session_id", true),
    ),
    "session_id",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_PLAYER_POSITION_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(
        VWORLD_PLAYER_POSITION_TABLE,
        "updated_ts",
        false,
      ),
    ),
    "updated_ts",
  );
  reportWorldSchemaResult(
    "addUniqueIndex",
    VWORLD_PLAYER_POSITION_TABLE,
    parseWorldDbResult(
      database.addUniqueIndex(
        VWORLD_PLAYER_POSITION_TABLE,
        JSON.stringify(["user_id"]),
      ),
    ),
  );

  reportWorldSchemaResult(
    "createTable",
    VWORLD_PLAYER_INVENTORY_TABLE,
    parseWorldDbResult(database.createTable(VWORLD_PLAYER_INVENTORY_TABLE)),
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_INVENTORY_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_PLAYER_INVENTORY_TABLE, "user_id", false),
    ),
    "user_id",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_INVENTORY_TABLE,
    parseWorldDbResult(
      database.addTextColumn(
        VWORLD_PLAYER_INVENTORY_TABLE,
        "left_hand_json",
        true,
      ),
    ),
    "left_hand_json",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_INVENTORY_TABLE,
    parseWorldDbResult(
      database.addTextColumn(
        VWORLD_PLAYER_INVENTORY_TABLE,
        "right_hand_json",
        true,
      ),
    ),
    "right_hand_json",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_PLAYER_INVENTORY_TABLE,
    parseWorldDbResult(
      database.addTextColumn(
        VWORLD_PLAYER_INVENTORY_TABLE,
        "inventory_json",
        false,
      ),
    ),
    "inventory_json",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_PLAYER_INVENTORY_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(
        VWORLD_PLAYER_INVENTORY_TABLE,
        "updated_ts",
        false,
      ),
    ),
    "updated_ts",
  );
  reportWorldSchemaResult(
    "addUniqueIndex",
    VWORLD_PLAYER_INVENTORY_TABLE,
    parseWorldDbResult(
      database.addUniqueIndex(
        VWORLD_PLAYER_INVENTORY_TABLE,
        JSON.stringify(["user_id"]),
      ),
    ),
  );

  reportWorldSchemaResult(
    "createTable",
    VWORLD_WORLD_MOD_TABLE,
    parseWorldDbResult(database.createTable(VWORLD_WORLD_MOD_TABLE)),
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_WORLD_MOD_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_WORLD_MOD_TABLE, "world_id", false),
    ),
    "world_id",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_WORLD_MOD_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_WORLD_MOD_TABLE, "tile_key", false),
    ),
    "tile_key",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_WORLD_MOD_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(VWORLD_WORLD_MOD_TABLE, "row", false),
    ),
    "row",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_WORLD_MOD_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(VWORLD_WORLD_MOD_TABLE, "col", false),
    ),
    "col",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_WORLD_MOD_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_WORLD_MOD_TABLE, "layer", false),
    ),
    "layer",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_WORLD_MOD_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_WORLD_MOD_TABLE, "tile_type", false),
    ),
    "tile_type",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_WORLD_MOD_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_WORLD_MOD_TABLE, "actor_id", true),
    ),
    "actor_id",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_WORLD_MOD_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_WORLD_MOD_TABLE, "actor_type", true),
    ),
    "actor_type",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_WORLD_MOD_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(VWORLD_WORLD_MOD_TABLE, "timestamp", false),
    ),
    "timestamp",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_WORLD_MOD_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_WORLD_MOD_TABLE, "payload_json", true),
    ),
    "payload_json",
  );
  reportWorldSchemaResult(
    "addUniqueIndex",
    VWORLD_WORLD_MOD_TABLE,
    parseWorldDbResult(
      database.addUniqueIndex(
        VWORLD_WORLD_MOD_TABLE,
        JSON.stringify(["world_id", "tile_key", "layer"]),
      ),
    ),
  );

  reportWorldSchemaResult(
    "createTable",
    VWORLD_WORLD_ITEM_TABLE,
    parseWorldDbResult(database.createTable(VWORLD_WORLD_ITEM_TABLE)),
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_WORLD_ITEM_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_WORLD_ITEM_TABLE, "item_id", false),
    ),
    "item_id",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_WORLD_ITEM_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_WORLD_ITEM_TABLE, "world_id", false),
    ),
    "world_id",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_WORLD_ITEM_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(VWORLD_WORLD_ITEM_TABLE, "row", false),
    ),
    "row",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_WORLD_ITEM_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(VWORLD_WORLD_ITEM_TABLE, "col", false),
    ),
    "col",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_WORLD_ITEM_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_WORLD_ITEM_TABLE, "type", false),
    ),
    "type",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_WORLD_ITEM_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(VWORLD_WORLD_ITEM_TABLE, "created_at", false),
    ),
    "created_at",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_WORLD_ITEM_TABLE,
    parseWorldDbResult(
      database.addTextColumn(
        VWORLD_WORLD_ITEM_TABLE,
        "destination_world_id",
        true,
      ),
    ),
    "destination_world_id",
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_WORLD_ITEM_TABLE,
    parseWorldDbResult(
      database.addTextColumn(
        VWORLD_WORLD_ITEM_TABLE,
        "destination_world_type",
        true,
      ),
    ),
    "destination_world_type",
  );
  reportWorldSchemaResult(
    "addUniqueIndex",
    VWORLD_WORLD_ITEM_TABLE,
    parseWorldDbResult(
      database.addUniqueIndex(
        VWORLD_WORLD_ITEM_TABLE,
        JSON.stringify(["item_id"]),
      ),
    ),
  );

  reportWorldSchemaResult(
    "createTable",
    VWORLD_WORLD_ITEM_META_TABLE,
    parseWorldDbResult(database.createTable(VWORLD_WORLD_ITEM_META_TABLE)),
  );
  reportWorldSchemaResult(
    "addTextColumn",
    VWORLD_WORLD_ITEM_META_TABLE,
    parseWorldDbResult(
      database.addTextColumn(VWORLD_WORLD_ITEM_META_TABLE, "world_id", false),
    ),
    "world_id",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_WORLD_ITEM_META_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(
        VWORLD_WORLD_ITEM_META_TABLE,
        "next_item_seq",
        false,
        "0",
      ),
    ),
    "next_item_seq",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_WORLD_ITEM_META_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(
        VWORLD_WORLD_ITEM_META_TABLE,
        "seeded",
        false,
        "0",
      ),
    ),
    "seeded",
  );
  reportWorldSchemaResult(
    "addIntegerColumn",
    VWORLD_WORLD_ITEM_META_TABLE,
    parseWorldDbResult(
      database.addIntegerColumn(
        VWORLD_WORLD_ITEM_META_TABLE,
        "updated_ts",
        false,
      ),
    ),
    "updated_ts",
  );
  reportWorldSchemaResult(
    "addUniqueIndex",
    VWORLD_WORLD_ITEM_META_TABLE,
    parseWorldDbResult(
      database.addUniqueIndex(
        VWORLD_WORLD_ITEM_META_TABLE,
        JSON.stringify(["world_id"]),
      ),
    ),
  );

  ensureLateWorldDatabaseSchema();
}

/**
 * @param {Array<any>} [collector]
 */
function ensureChatDatabaseSchema(collector) {
  runChatSchemaStep(
    "createTable",
    VWORLD_CHAT_TABLE,
    function () {
      return database.createTable(VWORLD_CHAT_TABLE);
    },
    undefined,
    collector,
  );
  runChatSchemaStep(
    "addTextColumn",
    VWORLD_CHAT_TABLE,
    function () {
      return database.addTextColumn(VWORLD_CHAT_TABLE, "message_id", false);
    },
    "message_id",
    collector,
  );
  runChatSchemaStep(
    "addTextColumn",
    VWORLD_CHAT_TABLE,
    function () {
      return database.addTextColumn(VWORLD_CHAT_TABLE, "world_id", false);
    },
    "world_id",
    collector,
  );
  runChatSchemaStep(
    "addTextColumn",
    VWORLD_CHAT_TABLE,
    function () {
      return database.addTextColumn(VWORLD_CHAT_TABLE, "sender_id", false);
    },
    "sender_id",
    collector,
  );
  runChatSchemaStep(
    "addTextColumn",
    VWORLD_CHAT_TABLE,
    function () {
      return database.addTextColumn(VWORLD_CHAT_TABLE, "sender_nick", false);
    },
    "sender_nick",
    collector,
  );
  runChatSchemaStep(
    "addTextColumn",
    VWORLD_CHAT_TABLE,
    function () {
      return database.addTextColumn(VWORLD_CHAT_TABLE, "text", false);
    },
    "text",
    collector,
  );
  runChatSchemaStep(
    "addIntegerColumn",
    VWORLD_CHAT_TABLE,
    function () {
      return database.addIntegerColumn(VWORLD_CHAT_TABLE, "ts", false);
    },
    "ts",
    collector,
  );
  runChatSchemaStep(
    "addUniqueIndex",
    VWORLD_CHAT_TABLE,
    function () {
      return database.addUniqueIndex(
        VWORLD_CHAT_TABLE,
        JSON.stringify(["message_id"]),
      );
    },
    undefined,
    collector,
  );

  runChatSchemaStep(
    "createTable",
    VWORLD_DM_TABLE,
    function () {
      return database.createTable(VWORLD_DM_TABLE);
    },
    undefined,
    collector,
  );
  runChatSchemaStep(
    "addTextColumn",
    VWORLD_DM_TABLE,
    function () {
      return database.addTextColumn(VWORLD_DM_TABLE, "message_id", false);
    },
    "message_id",
    collector,
  );
  runChatSchemaStep(
    "addTextColumn",
    VWORLD_DM_TABLE,
    function () {
      return database.addTextColumn(VWORLD_DM_TABLE, "conversation_key", false);
    },
    "conversation_key",
    collector,
  );
  runChatSchemaStep(
    "addTextColumn",
    VWORLD_DM_TABLE,
    function () {
      return database.addTextColumn(VWORLD_DM_TABLE, "sender_id", false);
    },
    "sender_id",
    collector,
  );
  runChatSchemaStep(
    "addTextColumn",
    VWORLD_DM_TABLE,
    function () {
      return database.addTextColumn(VWORLD_DM_TABLE, "sender_nick", false);
    },
    "sender_nick",
    collector,
  );
  runChatSchemaStep(
    "addTextColumn",
    VWORLD_DM_TABLE,
    function () {
      return database.addTextColumn(VWORLD_DM_TABLE, "recipient_id", false);
    },
    "recipient_id",
    collector,
  );
  runChatSchemaStep(
    "addTextColumn",
    VWORLD_DM_TABLE,
    function () {
      return database.addTextColumn(VWORLD_DM_TABLE, "text", false);
    },
    "text",
    collector,
  );
  runChatSchemaStep(
    "addIntegerColumn",
    VWORLD_DM_TABLE,
    function () {
      return database.addIntegerColumn(VWORLD_DM_TABLE, "ts", false);
    },
    "ts",
    collector,
  );
  runChatSchemaStep(
    "addUniqueIndex",
    VWORLD_DM_TABLE,
    function () {
      return database.addUniqueIndex(
        VWORLD_DM_TABLE,
        JSON.stringify(["message_id"]),
      );
    },
    undefined,
    collector,
  );

  runChatSchemaStep(
    "createTable",
    VWORLD_DM_INDEX_TABLE,
    function () {
      return database.createTable(VWORLD_DM_INDEX_TABLE);
    },
    undefined,
    collector,
  );
  runChatSchemaStep(
    "addTextColumn",
    VWORLD_DM_INDEX_TABLE,
    function () {
      return database.addTextColumn(VWORLD_DM_INDEX_TABLE, "user_id", false);
    },
    "user_id",
    collector,
  );
  runChatSchemaStep(
    "addTextColumn",
    VWORLD_DM_INDEX_TABLE,
    function () {
      return database.addTextColumn(
        VWORLD_DM_INDEX_TABLE,
        "other_user_id",
        false,
      );
    },
    "other_user_id",
    collector,
  );
  runChatSchemaStep(
    "addIntegerColumn",
    VWORLD_DM_INDEX_TABLE,
    function () {
      return database.addIntegerColumn(VWORLD_DM_INDEX_TABLE, "last_ts", false);
    },
    "last_ts",
    collector,
  );
  runChatSchemaStep(
    "addUniqueIndex",
    VWORLD_DM_INDEX_TABLE,
    function () {
      return database.addUniqueIndex(
        VWORLD_DM_INDEX_TABLE,
        JSON.stringify(["user_id", "other_user_id"]),
      );
    },
    undefined,
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
  var meta = loadWorldItemMeta(worldId);
  if (meta.seeded === 1) return;

  var map = getEffectiveMap(worldId);
  var items = loadWorldItems(worldId);
  for (var i = 0; i < WORLD_ITEM_SPAWN_COUNT; i++) {
    var attempts = 0;
    while (attempts < 1000) {
      attempts++;
      var row = 1 + Math.floor(Math.random() * (ROWS - 2));
      var col = 1 + Math.floor(Math.random() * (COLS - 2));
      if (map[row][col] !== 0) continue;
      var tileKey = row + "_" + col;
      if (!items[tileKey]) items[tileKey] = [];
      items[tileKey].push({
        id: "w" + worldId + "_i" + nextWorldItemId(worldId),
        type: ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)],
        created_at: Date.now(),
      });
      break;
    }
  }
  saveWorldItems(worldId, items);
  saveWorldItemMeta(worldId, {
    next_item_seq: loadWorldItemMeta(worldId).next_item_seq,
    seeded: 1,
    updated_ts: Date.now(),
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
  sendWorldScopedStreamEvent(String(worldId), "item_changed", {
    actor_type: actorType,
    actor_id: actorId,
    action: action,
    row: row,
    col: col,
    items: Array.isArray(items)
      ? items.map(function (it) {
          return { id: it.id, type: it.type };
        })
      : [],
  });
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
  return { recipient_id: String(userId) };
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
    VWORLD_PLAYER_POSITION_TABLE,
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
  /** @type {number[][]} */
  var map = generateMap(worldId);
  applyWorldModsToMap(map, loadWorldMods(worldId));
  applyOakReservation(map, worldId);
  return map;
}

/**
 * @param {string} worldId
 * @returns {Record<string, any>}
 */
function ensureWorldNPCs(worldId) {
  var existing = loadWorldNPCs(worldId);
  if (existing && Object.keys(existing).length > 0) {
    var hasNormalizationChanges = false;
    Object.keys(existing).forEach(function (npcId) {
      var n = existing[npcId];
      if (!n || typeof n !== "object") {
        existing[npcId] = {
          row: 1,
          col: 1,
          seq: 0,
          rotation: 0,
          state: "idle",
          ts: Date.now(),
          left_hand: null,
          right_hand: null,
          inventory: [],
        };
        hasNormalizationChanges = true;
        return;
      }
      var inv = normalizeInventory(n);
      if (
        n.left_hand !== inv.left_hand ||
        n.right_hand !== inv.right_hand ||
        !Array.isArray(n.inventory)
      ) {
        n.left_hand = inv.left_hand;
        n.right_hand = inv.right_hand;
        n.inventory = inv.inventory;
        hasNormalizationChanges = true;
      }
    });
    if (hasNormalizationChanges) saveWorldNPCs(worldId, existing);
    return existing;
  }

  var map = getEffectiveMap(worldId);
  var players = loadWorldPlayers(worldId);
  /** @type {Record<string, boolean>} */
  var occupied = {};
  Object.keys(players).forEach(function (pid) {
    var p = players[pid];
    if (!p || !isFinite(Number(p.row)) || !isFinite(Number(p.col))) return;
    occupied[p.row + "_" + p.col] = true;
  });

  var targetCount =
    NPC_MIN_COUNT +
    Math.floor(Math.random() * (NPC_MAX_COUNT - NPC_MIN_COUNT + 1));
  /** @type {Record<string, any>} */
  var npcs = {};
  var attempts = 0;
  var maxAttempts = 4000;

  while (Object.keys(npcs).length < targetCount && attempts < maxAttempts) {
    attempts++;
    var row = 1 + Math.floor(Math.random() * (ROWS - 2));
    var col = 1 + Math.floor(Math.random() * (COLS - 2));
    var tileKey = row + "_" + col;
    if (map[row][col] !== 0 || occupied[tileKey]) continue;
    occupied[tileKey] = true;
    var idx = Object.keys(npcs).length + 1;
    var npcId = "npc_" + worldId + "_" + idx;
    npcs[npcId] = {
      row: row,
      col: col,
      seq: 0,
      rotation: 0,
      state: "idle",
      ts: Date.now(),
      left_hand: null,
      right_hand: null,
      inventory: [],
    };
  }

  saveWorldNPCs(worldId, npcs);
  return npcs;
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
  ensureWorldItems(worldId);
  var npcs = ensureWorldNPCs(worldId);
  var npcIds = Object.keys(npcs);
  if (npcIds.length === 0) return;

  var map = getEffectiveMap(worldId);
  var trees = loadWorldTrees(worldId);
  var worldItems = loadWorldItems(worldId);
  var itemChanges = false;
  var treeChanges = false;
  var players = loadWorldPlayers(worldId);
  var occupiedPlayers = buildOccupiedPlayerMapImpl(players);
  var occupiedNPCs = buildOccupiedNPCMapImpl(npcs);

  var hasChanges = false;
  npcIds.forEach(function (npcId) {
    var n = npcs[npcId];
    if (!n) return;
    normalizeNPCInventoryStateImpl(n);

    if (
      tickNPCMovementImpl({
        worldId: worldId,
        npcId: npcId,
        npc: n,
        now: now,
        map: map,
        occupiedPlayers: occupiedPlayers,
        occupiedNPCs: occupiedNPCs,
        rows: ROWS,
        cols: COLS,
        shuffleDirections: shuffleDirections,
        directionToRotation: directionToRotation,
        getNPCDisplayName: getNPCDisplayName,
        sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
      })
    ) {
      hasChanges = true;
    }

    var itemResult = tickNPCItemInteractionsImpl({
      worldId: worldId,
      npcId: npcId,
      npc: n,
      worldItems: worldItems,
      isPickableWorldItem: isPickableWorldItem,
      deleteWorldItems: deleteWorldItems,
      upsertWorldItem: upsertWorldItem,
      broadcastItemChange: broadcastItemChange,
    });
    if (itemResult.hasChanges) hasChanges = true;
    if (itemResult.itemChanges) itemChanges = true;

    var treeResult = tickNPCTreeActionsImpl({
      worldId: worldId,
      npcId: npcId,
      npc: n,
      now: now,
      map: map,
      trees: trees,
      rows: ROWS,
      cols: COLS,
      shuffleDirections: shuffleDirections,
      getInventoryTreeActions: getInventoryTreeActions,
      isOakCenterTile: isOakCenterTile,
      isOakClearingTile: isOakClearingTile,
      directionToRotation: directionToRotation,
      sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
    });
    if (treeResult.hasChanges) hasChanges = true;
    if (treeResult.treeChanges) treeChanges = true;
  });

  if (hasChanges) {
    saveWorldNPCs(worldId, npcs);
    vwLog("npc tick moved", {
      world_id: worldId,
      npc_count: npcIds.length,
    });
  }
  if (itemChanges) {
    saveWorldItems(worldId, worldItems);
  }
  if (treeChanges) {
    saveWorldTrees(worldId, trees);
  }
}

function runNPCTick() {
  var worlds = loadNPCActiveWorlds();
  var now = Date.now();
  var changedWorldSet = false;

  Object.keys(worlds).forEach(function (worldId) {
    if (now - Number(worlds[worldId] || 0) > NPC_ACTIVE_WORLD_TTL_MS) {
      delete worlds[worldId];
      deleteWorldRowsWhere(
        VWORLD_NPC_TABLE,
        JSON.stringify({ world_id: String(worldId) }),
      );
      deleteWorldRowsWhere(
        VWORLD_NPC_TICK_TABLE,
        JSON.stringify({ world_id: String(worldId) }),
      );
      changedWorldSet = true;
      return;
    }
    tryTickWorldNPCs(worldId, now);
  });

  if (changedWorldSet) saveNPCActiveWorlds(worlds);
}

/**
 * @param {string} worldId
 * @param {number} now
 * @returns {boolean}
 */
function tryAcquireNPCTickLease(worldId, now) {
  var result = parseWorldDbResult(
    database.acquireLease(
      VWORLD_NPC_TICK_LEASE_TABLE,
      "npc_tick:" + String(worldId),
      npcTickOwnerId,
      NPC_TICK_LEASE_MS,
    ),
  );
  if (!result || result.error) {
    vwLog("npc tick lease acquisition failed", {
      world_id: worldId,
      error: String(result && result.error ? result.error : "unknown"),
    });
    return false;
  }
  return !!(result.acquired && result.owner === npcTickOwnerId);
}

/**
 * @param {string} worldId
 * @param {number} now
 * @returns {boolean}
 */
function tryTickWorldNPCs(worldId, now) {
  var lastTick = loadNPCLastTick(worldId);
  if (now - lastTick < NPC_TICK_MS) return false;
  if (!tryAcquireNPCTickLease(worldId, now)) return false;

  // Recheck after lease acquisition to avoid race with another writer.
  lastTick = loadNPCLastTick(worldId);
  if (now - lastTick < NPC_TICK_MS) return false;

  tickWorldNPCs(worldId, now);
  saveNPCLastTick(worldId, now);
  return true;
}

/**
 * @param {string} worldId
 */
function maybeTickWorldNPCs(worldId) {
  var now = Date.now();
  tryTickWorldNPCs(worldId, now);
}

function registerRecurringNPCTick() {
  try {
    schedulerService.registerRecurring({
      handler: "runNPCTickScheduledJob",
      intervalMilliseconds: NPC_TICK_MS,
      name: "vworld-npc-tick",
    });
  } catch (e) {
    vwLog("npc scheduler registerRecurring failed", { error: String(e) });
  }
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
  if (WORLD_TILE_NAME_BY_VALUE[tileValue]) {
    return WORLD_TILE_NAME_BY_VALUE[tileValue];
  }
  return "unknown";
}

/**
 * @param {{left_hand: any, right_hand: any, inventory: any[]}} inventory
 * @param {any[]} currentTileItems
 * @returns {string[]}
 */
function getAvailableWorldActions(inventory, currentTileItems) {
  /** @type {Record<string, boolean>} */
  var actionMap = {};

  /**
   * @param {*} item
   */
  function addItemAction(item) {
    if (!item || !item.type) return;
    var action = TREE_ACTION_BY_ITEM_TYPE[String(item.type)];
    if (action) actionMap[action] = true;
  }

  addItemAction(inventory && inventory.left_hand);
  addItemAction(inventory && inventory.right_hand);

  var invItems =
    inventory && Array.isArray(inventory.inventory) ? inventory.inventory : [];
  for (var i = 0; i < invItems.length; i++) {
    addItemAction(invItems[i]);
  }

  var tileItems = Array.isArray(currentTileItems) ? currentTileItems : [];
  for (var j = 0; j < tileItems.length; j++) {
    addItemAction(tileItems[j]);
  }

  return Object.keys(actionMap).sort();
}

/**
 * @param {number} row
 * @param {number} col
 * @param {number} rotation
 * @returns {{row: number, col: number, direction: string}}
 */
function getTargetTileFromRotation(row, col, rotation) {
  var targetRow = row;
  var targetCol = col;
  var direction = "south";
  var angle = isFinite(Number(rotation)) ? Number(rotation) : 0;

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

/**
 * @param {string} direction
 * @returns {string}
 */
function normalizeMoveDirection(direction) {
  var value = String(direction || "").toLowerCase();
  if (value === "up") return "north";
  if (value === "down") return "south";
  if (value === "left") return "west";
  if (value === "right") return "east";
  return value;
}

/**
 * @param {string} direction
 * @returns {number|null}
 */
function rotationForDirection(direction) {
  if (direction === "south") return 0;
  if (direction === "east") return Math.PI / 2;
  if (direction === "north") return Math.PI;
  if (direction === "west") return -Math.PI / 2;
  return null;
}

/**
 * @param {string} worldId
 * @param {{row: number, col: number}} canonical
 * @returns {Record<string, {row: number, col: number, walkable: boolean, tile_type: string, in_bounds: boolean}>}
 */
function getMoveOptions(worldId, canonical) {
  var map = getEffectiveMap(worldId);
  /** @type {Record<string, {row: number, col: number, walkable: boolean, tile_type: string, in_bounds: boolean}>} */
  var options = {};
  /** @type {Record<string, {row: number, col: number}>} */
  var deltas = {
    north: { row: -1, col: 0 },
    south: { row: 1, col: 0 },
    east: { row: 0, col: 1 },
    west: { row: 0, col: -1 },
  };
  var directions = Object.keys(deltas);
  for (var i = 0; i < directions.length; i++) {
    var direction = directions[i];
    var delta = deltas[direction];
    var targetRow = canonical.row + delta.row;
    var targetCol = canonical.col + delta.col;
    var inBounds =
      targetRow >= 0 && targetRow < ROWS && targetCol >= 0 && targetCol < COLS;
    var tileValue = inBounds ? map[targetRow][targetCol] : 0;
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

/**
 * @param {string} userId
 * @returns {{ok: boolean, world_id: string, world_type: string, player: {row: number, col: number, seq: number, rotation: number}, items: Array<{id: string, type: string, row: number, col: number}>, tile_items: any[], inventory: {left_hand: any, right_hand: any, inventory: any[]}, world_mods: any, houses: any, available_actions: string[], move_options: Record<string, {row: number, col: number, walkable: boolean, tile_type: string, in_bounds: boolean}>, facing_tile: {row: number, col: number, direction: string}}}
 */
function getCurrentWorldStateForUser(userId) {
  var worldId = getOrCreatePlayerWorld(userId);
  markNPCWorldActive(worldId);
  ensureWorldItems(worldId);

  var canonical = getCanonicalPlayerState(worldId, userId);
  var inventory = loadPlayerInventory(userId);
  var worldItems = loadWorldItems(worldId);
  var tileKey = canonical.row + "_" + canonical.col;
  var currentTileItems = Array.isArray(worldItems[tileKey])
    ? worldItems[tileKey]
    : [];

  return {
    ok: true,
    world_id: String(worldId),
    world_type: getWorldType(worldId),
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
    available_actions: getAvailableWorldActions(inventory, currentTileItems),
    move_options: getMoveOptions(String(worldId), canonical),
    facing_tile: getTargetTileFromRotation(
      canonical.row,
      canonical.col,
      canonical.rotation,
    ),
  };
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
 * @param {*} context
 * @returns {string}
 */
function virtualWorldGetStateToolHandler(context) {
  var userId = getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }
  return JSON.stringify(getCurrentWorldStateForUser(userId));
}

/**
 * @param {*} context
 * @returns {string}
 */
function virtualWorldMoveToolHandler(context) {
  var userId = getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }

  var args = context.args || {};
  var direction = normalizeMoveDirection(args.direction);
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

  var worldId = getOrCreatePlayerWorld(userId);
  var canonical = getCanonicalPlayerState(worldId, userId);
  var moveOptions = getMoveOptions(String(worldId), canonical);
  var target = moveOptions[direction];
  var rotation = isFinite(Number(args.rotation))
    ? Number(args.rotation)
    : rotationForDirection(direction);
  var result = movePlayerForUser(userId, {
    toRow: target.row,
    toCol: target.col,
    rotation: rotation,
    session_id: args.session_id ? String(args.session_id) : "mcp",
    seq:
      args.seq !== undefined && isFinite(Number(args.seq))
        ? Number(args.seq)
        : canonical.seq + 1,
  });
  result.payload.status = result.status;
  result.payload.direction = direction;
  return JSON.stringify(result.payload);
}

/**
 * @param {*} context
 * @returns {string}
 */
function virtualWorldManageItemsToolHandler(context) {
  var userId = getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }

  var args = context.args || {};
  var action = String(args.action || "list");
  if (action === "list") {
    var state = getCurrentWorldStateForUser(userId);
    return JSON.stringify({
      ok: true,
      world_id: state.world_id,
      player: state.player,
      tile_items: state.tile_items,
      inventory: state.inventory,
      available_actions: state.available_actions,
    });
  }

  var result = handleItemActionForUser(userId, {
    action: action,
    from: args.from,
    to: args.to,
    index: args.index,
  });
  result.payload.status = result.status;
  result.payload.world_id = getPlayerWorld(userId);
  return JSON.stringify(result.payload);
}

/**
 * @param {*} context
 * @returns {string}
 */
function virtualWorldActToolHandler(context) {
  var userId = getAuthenticatedUserId(context);
  if (!userId) {
    return JSON.stringify({ ok: false, error: "Authentication required" });
  }

  var args = context.args || {};
  var worldId = getOrCreatePlayerWorld(userId);
  var canonical = getCanonicalPlayerState(worldId, userId);
  var result = performTreeActionForUser(userId, {
    action: args.action,
    row: isFinite(Number(args.row)) ? Number(args.row) : canonical.row,
    col: isFinite(Number(args.col)) ? Number(args.col) : canonical.col,
    rotation: isFinite(Number(args.rotation))
      ? Number(args.rotation)
      : canonical.rotation,
    destination_world_type: args.destination_world_type,
  });
  result.payload.status = result.status;
  return JSON.stringify(result.payload);
}

/**
 * @param {*} context
 */
function itemsHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var worldId = getPlayerWorld(userId);
  if (!worldId) {
    return ResponseBuilder.json({
      items: [],
      inventory: createEmptyInventory(),
    });
  }
  ensureWorldItems(worldId);
  return ResponseBuilder.json({
    items: flattenWorldItems(loadWorldItems(worldId)),
    inventory: loadPlayerInventory(userId),
  });
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
  var nick = String(body.nick || "").trim();
  // Strip HTML-special characters to prevent XSS via injected display names
  nick = nick.replace(/[<>&"']/g, "");
  if (nick.length > 24) nick = nick.slice(0, 24);
  if (!nick)
    return ResponseBuilder.json({ error: "Nickname cannot be empty" }, 400);
  savePlayerNick(userId, nick);
  return ResponseBuilder.json({ ok: true, nick: nick });
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
  var snapshot = buildOnlinePlayersSnapshot();
  if (snapshot.length > 0) {
    return ResponseBuilder.json(snapshot);
  }
  var worldId = getPlayerWorld(userId);
  if (!worldId) return ResponseBuilder.json([]);
  return ResponseBuilder.json(
    buildActiveWorldPlayers(worldId).map(function (player) {
      return {
        player_id: player.player_id,
        nick: getEffectiveNick(player.player_id),
        world_id: String(worldId),
        login_at: player.last_active,
        last_active: player.last_active,
      };
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
  var worldId = getPlayerWorld(userId);
  if (!worldId) return ResponseBuilder.json({ error: "Not in a world" }, 400);
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON" }, 400);
  }
  var text = String(body.text || "").trim();
  text = text.replace(/[<>&"']/g, "");
  if (!text)
    return ResponseBuilder.json({ error: "Message cannot be empty" }, 400);
  if (text.length > 500) text = text.slice(0, 500);
  var msg = {
    id:
      "wc-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2),
    sender_id: userId,
    sender_nick: getEffectiveNick(userId),
    text: text,
    ts: Date.now(),
  };
  appendWorldChatMessage(worldId, msg);
  sendWorldScopedStreamEvent(String(worldId), "chat_message", msg);
  return ResponseBuilder.json({ ok: true, message: msg });
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
  var to = String(body.to || "").trim();
  if (!to) return ResponseBuilder.json({ error: "Recipient required" }, 400);
  if (to === userId)
    return ResponseBuilder.json({ error: "Cannot DM yourself" }, 400);
  var text = String(body.text || "").trim();
  text = text.replace(/[<>&"']/g, "");
  if (!text)
    return ResponseBuilder.json({ error: "Message cannot be empty" }, 400);
  if (text.length > 500) text = text.slice(0, 500);
  var msg = {
    id:
      "dm-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2),
    sender_id: userId,
    sender_nick: getEffectiveNick(userId),
    recipient_id: to,
    text: text,
    ts: Date.now(),
  };
  appendDMMessage(userId, to, msg);
  addToDMIndex(userId, to, msg.ts);
  addToDMIndex(to, userId, msg.ts);
  sendRecipientScopedStreamEvent(String(to), "direct_message", msg);
  return ResponseBuilder.json({ ok: true, message: msg });
}

/**
 * @param {*} context
 */
function dmHistoryHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var withUser = String(
    (context.request.query && context.request.query["with"]) || "",
  ).trim();
  if (!withUser)
    return ResponseBuilder.json({ error: "with param required" }, 400);
  return ResponseBuilder.json(loadDMHistory(userId, withUser));
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
  // Derive world from storage. newWorldHandler already broadcasts the leave when
  // switching worlds, so by the time this fires after a New World navigation the
  // player is no longer recorded in the new world — making this a safe no-op.
  var worldId = getPlayerWorld(userId);
  if (!worldId) return ResponseBuilder.json({ ok: true });
  var position = loadPlayerPosition(userId);
  if (!position || position.world_id !== String(worldId)) {
    return ResponseBuilder.json({ ok: true });
  }
  if (!sessionId) {
    vwLog("leave ignored: missing session id", {
      user_id: userId,
      world_id: worldId,
    });
    return ResponseBuilder.json({ ok: true });
  }
  if (position.session_id && position.session_id !== sessionId) {
    vwLog("leave ignored: stale session", {
      user_id: userId,
      world_id: worldId,
      position_session: position.session_id,
      session_id: sessionId,
    });
    return ResponseBuilder.json({ ok: true });
  }
  markPlayerPositionInactive(userId);
  deletePlayerHeartbeat(userId);
  deletePlayerMoveLease(userId);
  deleteOnlinePresence(userId);
  var msg = JSON.stringify({ player_id: userId, leaving: true });
  sendWorldScopedStreamEvent(String(worldId), "player_moved", JSON.parse(msg));
  return ResponseBuilder.json({ ok: true });
}

/**
 * @param {*} context
 */
function heartbeatHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var worldId = getPlayerWorld(userId);
  if (!worldId) return ResponseBuilder.json({ ok: true });
  markNPCWorldActive(worldId);
  maybeTickWorldNPCs(worldId);

  var sessionId = "";
  try {
    var body = JSON.parse(context.request.body || "{}");
    sessionId = body.session_id ? String(body.session_id) : "";
  } catch (e) {}

  if (sessionId) {
    var lease = loadPlayerMoveLease(userId);
    var now = Date.now();
    var leaseSessionId =
      lease && typeof lease.session_id === "string" ? lease.session_id : "";
    var leaseValid = !!lease && Number(lease.expires_at || 0) > now;
    // Heartbeat must not steal another tab's active writer lease.
    // It can only renew if this session already owns the lease,
    // or claim it when no valid lease exists.
    if (!leaseValid || leaseSessionId === sessionId) {
      savePlayerMoveLease(userId, sessionId, now + LEASE_TTL_MS);
    } else {
      vwLog("heartbeat ignored: lease owned by other session", {
        user_id: userId,
        world_id: worldId,
        lease_session: leaseSessionId,
        session_id: sessionId,
      });
    }
  }

  // Write ONLY to a separate per-user timestamp key — never read-modify-write
  // the shared players object.  A concurrent moveHandler write would otherwise
  // be clobbered by this handler writing back a stale row/col, causing the
  // server's canonical position to regress and the next move to be rejected.
  savePlayerHeartbeatTs(userId, Date.now());
  updateOnlinePresence(userId, worldId, sessionId || "");
  return ResponseBuilder.json({ ok: true });
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
    loadPlayerPosition: loadPlayerPosition,
    deletePlayerPosition: deletePlayerPosition,
    deletePlayerHeartbeat: deletePlayerHeartbeat,
    deletePlayerMoveLease: deletePlayerMoveLease,
    sendWorldScopedStreamEvent: sendWorldScopedStreamEvent,
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
  var worldId = getPlayerWorld(userId);
  if (!worldId) return ResponseBuilder.json([]);
  markNPCWorldActive(worldId);
  var active = buildActiveWorldPlayers(worldId).map(function (pid) {
    return {
      player_id: pid.player_id,
      row: pid.row,
      col: pid.col,
      seq: pid.seq || 0,
      rotation: isFinite(Number(pid.rotation)) ? Number(pid.rotation) : 0,
      session_id: typeof pid.session_id === "string" ? pid.session_id : "",
    };
  });
  return ResponseBuilder.json(active);
}

/**
 * @param {*} context
 */
function currentWorldHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(getCurrentWorldStateForUser(userId));
}

/**
 * @param {*} context
 */
function npcsHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var worldId = getPlayerWorld(userId);
  if (!worldId) return ResponseBuilder.json([]);
  return ResponseBuilder.json(getWorldNPCSnapshot(worldId));
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
  /**
   * @param {string} path
   * @param {string} handler
   * @param {string} method
   * @param {*} [opts]
   */
  function safeRegisterRoute(path, handler, method, opts) {
    try {
      if (opts) {
        routeRegistry.registerRoute(path, handler, method, opts);
      } else {
        routeRegistry.registerRoute(path, handler, method);
      }
    } catch (e) {
      vwLog("route registration skipped", {
        path: path,
        method: method,
        error: String(e),
      });
    }
  }

  /**
   * @param {string} path
   * @param {string} customizationFunction
   */
  function safeRegisterStreamRoute(path, customizationFunction) {
    try {
      if (customizationFunction) {
        routeRegistry.registerStreamRoute(path, customizationFunction);
      } else {
        routeRegistry.registerStreamRoute(path);
      }
    } catch (e) {
      vwLog("stream route registration skipped", {
        path: path,
        error: String(e),
      });
    }
  }

  /**
   * @param {string} name
   * @param {string} description
   * @param {string} schema
   * @param {string} handlerName
   */
  function safeRegisterTool(name, description, schema, handlerName) {
    try {
      mcpRegistry.registerTool(name, description, schema, handlerName);
    } catch (e) {
      vwLog("mcp tool registration skipped", {
        name: name,
        handler: handlerName,
        error: String(e),
      });
    }
  }

  var virtualWorldStateSchema = JSON.stringify({
    type: "object",
    properties: {},
  });
  var virtualWorldMoveSchema = JSON.stringify({
    type: "object",
    properties: {
      direction: {
        type: "string",
        enum: ["north", "south", "east", "west", "up", "down", "left", "right"],
        description: "Direction to move the player by one tile",
      },
      rotation: {
        type: "number",
        description:
          "Optional facing rotation in radians; defaults to the chosen direction",
      },
      seq: {
        type: "number",
        description:
          "Optional client sequence number; defaults to the next canonical sequence",
      },
      session_id: {
        type: "string",
        description: "Optional movement session identifier; defaults to 'mcp'",
        default: "mcp",
      },
    },
    required: ["direction"],
  });
  var virtualWorldManageItemsSchema = JSON.stringify({
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "pick", "drop", "equip"],
        description:
          "List nearby items or perform an inventory/world item action",
        default: "list",
      },
      from: {
        type: "string",
        enum: ["left_hand", "right_hand", "inventory"],
        description: "Source slot for drop or equip",
      },
      to: {
        type: "string",
        enum: ["left_hand", "right_hand", "inventory"],
        description: "Destination slot for equip",
      },
      index: {
        type: "number",
        description: "Inventory index used for drop or equip from inventory",
      },
    },
  });
  var virtualWorldActSchema = JSON.stringify({
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "plant",
          "cut",
          "build_house",
          "destroy_house",
          "build_portal",
          "remove_portal",
          "play_tune",
          "place_blessing",
          "portal_travel",
          "return_home",
          "build_portal_forest",
          "build_portal_island",
          "build_portal_cave",
          "build_portal_building",
        ],
        description: "World or item action to perform",
      },
      rotation: {
        type: "number",
        description:
          "Optional player facing rotation in radians; defaults to current player rotation",
      },
      row: {
        type: "number",
        description: "Optional player row; defaults to canonical player row",
      },
      col: {
        type: "number",
        description: "Optional player col; defaults to canonical player col",
      },
      destination_world_type: {
        type: "string",
        enum: ["forest", "island", "cave", "building"],
        description: "Optional portal destination world type for build_portal",
      },
    },
    required: ["action"],
  });

  // Register new endpoints first so they are available even in hot-reload sessions
  // where older routes may already exist.
  safeRegisterRoute("/virtual-world/items", "itemsHandler", "GET");
  safeRegisterRoute("/virtual-world/item-action", "itemActionHandler", "POST");
  safeRegisterTool(
    "virtualWorldGetState",
    "Get the authenticated player's current world, position, items, inventory, available actions, and movement options",
    virtualWorldStateSchema,
    "virtualWorldGetStateToolHandler",
  );
  safeRegisterTool(
    "virtualWorldMove",
    "Move the authenticated player one tile in a cardinal direction",
    virtualWorldMoveSchema,
    "virtualWorldMoveToolHandler",
  );
  safeRegisterTool(
    "virtualWorldManageItems",
    "List, pick up, drop, or equip items for the authenticated player",
    virtualWorldManageItemsSchema,
    "virtualWorldManageItemsToolHandler",
  );
  safeRegisterTool(
    "virtualWorldAct",
    "Perform authenticated player world actions such as cutting, planting, building, portal use, or blessings",
    virtualWorldActSchema,
    "virtualWorldActToolHandler",
  );

  try {
    routeRegistry.registerAssetRoute("/virtual-world", "public/welcome.html");
  } catch (e) {
    vwLog("asset route registration skipped", {
      path: "/virtual-world",
      error: String(e),
    });
  }
  try {
    routeRegistry.registerAssetRoute(
      "/virtual-world/styles.css",
      "public/styles.css",
    );
  } catch (e) {
    vwLog("asset route registration skipped", {
      path: "/virtual-world/styles.css",
      error: String(e),
    });
  }
  try {
    routeRegistry.registerAssetRoute(
      "/virtual-world/client.js",
      "public/client.js",
    );
  } catch (e) {
    vwLog("asset route registration skipped", {
      path: "/virtual-world/client.js",
      error: String(e),
    });
  }
  safeRegisterRoute("/virtual-world/play", "getVirtualWorldPage", "GET", {
    summary: "Virtual World (Play)",
    description:
      "Interactive 2.5D block world rendered with Three.js. Navigate with WASD or arrow keys. Requires authentication.",
    tags: ["Demo"],
  });
  safeRegisterRoute("/virtual-world/move", "moveHandler", "POST");
  safeRegisterRoute("/virtual-world/leave", "leaveHandler", "POST");
  safeRegisterRoute("/virtual-world/new-world", "newWorldHandler", "POST");
  safeRegisterRoute("/virtual-world/start-world", "startWorldHandler", "POST");
  safeRegisterRoute("/virtual-world/players", "playersHandler", "GET");
  safeRegisterRoute(
    "/virtual-world/current-world",
    "currentWorldHandler",
    "GET",
  );
  safeRegisterRoute("/virtual-world/npcs", "npcsHandler", "GET");
  safeRegisterRoute("/virtual-world/heartbeat", "heartbeatHandler", "POST");
  safeRegisterRoute("/virtual-world/tree-action", "treeActionHandler", "POST");
  safeRegisterRoute("/virtual-world/cheat-items", "cheatItemsHandler", "POST");
  safeRegisterRoute(
    "/virtual-world/set-nickname",
    "setNicknameHandler",
    "POST",
  );
  safeRegisterRoute(
    "/virtual-world/online-players",
    "onlinePlayersHandler",
    "GET",
  );
  safeRegisterRoute("/virtual-world/chat", "chatHandler", "POST");
  safeRegisterRoute("/virtual-world/dm", "dmHandler", "POST");
  safeRegisterRoute("/virtual-world/dm-history", "dmHistoryHandler", "GET");
  safeRegisterStreamRoute(
    VIRTUAL_WORLD_EVENTS_STREAM_PATH,
    "virtualWorldEventsStreamCustomizer",
  );
}
