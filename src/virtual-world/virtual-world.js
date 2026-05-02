/// <reference path="../../types/aiwebengine.d.ts" />

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
var ITEM_TYPES = ["saw", "knife", "flower", "tree_planter", "portal_builder"];
var WORLD_ITEM_SPAWN_COUNT = 10;
var npcTickerStarted = false;
var npcTickOwnerId =
  "npc-tick-" +
  Date.now().toString(36) +
  "-" +
  Math.random().toString(36).slice(2);
/** @type {Record<string, string>} */
var TREE_ACTION_BY_ITEM_TYPE = {
  saw: "cut",
  tree_planter: "plant",
  portal_builder: "build_portal",
  portal: "portal_travel",
  starter_kit: "return_home",
};

/** @type {string[]} */
var EXTRA_ITEM_TYPES = ["portal", "starter_kit"];

/**
 * @returns {string[]}
 */
function getAllKnownItemTypes() {
  /** @type {Record<string, boolean>} */
  var seen = {};
  /** @type {string[]} */
  var out = [];
  ITEM_TYPES.forEach(function (type) {
    if (!type || seen[type]) return;
    seen[type] = true;
    out.push(type);
  });
  EXTRA_ITEM_TYPES.forEach(function (type) {
    if (!type || seen[type]) return;
    seen[type] = true;
    out.push(type);
  });
  return out;
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {string | number} worldId
 * @returns {number[][]}
 */
function generateMap(worldId) {
  var seed = parseInt(String(worldId), 10);
  var rand = mulberry32(seed);
  /** @type {number[][]} */
  var map = [];
  for (var r = 0; r < ROWS; r++) {
    map[r] = [];
    for (var c = 0; c < COLS; c++) map[r][c] = 0;
  }
  // Solid border
  for (var r = 0; r < ROWS; r++) {
    map[r][0] = 1;
    map[r][COLS - 1] = 1;
  }
  for (var c = 0; c < COLS; c++) {
    map[0][c] = 1;
    map[ROWS - 1][c] = 1;
  }

  // Rectangular room outlines, each with a door on all four sides
  for (var i = 0; i < 30; i++) {
    var rr = 3 + Math.floor(rand() * (ROWS - 18));
    var cc = 3 + Math.floor(rand() * (COLS - 18));
    var rh = 4 + Math.floor(rand() * 9);
    var rw = 4 + Math.floor(rand() * 9);
    for (var dr = 0; dr <= rh; dr++) {
      for (var dc = 0; dc <= rw; dc++) {
        if (
          (dr === 0 || dr === rh || dc === 0 || dc === rw) &&
          map[rr + dr][cc + dc] === 0
        )
          map[rr + dr][cc + dc] = 1;
      }
    }
    var mh = Math.floor(rh / 2),
      mw = Math.floor(rw / 2);
    map[rr][cc + mw] = 0;
    map[rr + rh][cc + mw] = 0;
    map[rr + mh][cc] = 0;
    map[rr + mh][cc + rw] = 0;
  }

  // Wall segments with a gap
  for (var i = 0; i < 40; i++) {
    if (rand() > 0.5) {
      var r0 = 2 + Math.floor(rand() * (ROWS - 4));
      var c0 = 2 + Math.floor(rand() * (COLS - 20));
      var len = 6 + Math.floor(rand() * 14);
      var gap = Math.floor(rand() * len);
      for (var k = 0; k < len; k++)
        if (k !== gap && c0 + k < COLS - 1 && map[r0][c0 + k] === 0)
          map[r0][c0 + k] = 1;
    } else {
      var r0 = 2 + Math.floor(rand() * (ROWS - 20));
      var c0 = 2 + Math.floor(rand() * (COLS - 4));
      var len = 6 + Math.floor(rand() * 14);
      var gap = Math.floor(rand() * len);
      for (var k = 0; k < len; k++)
        if (k !== gap && r0 + k < ROWS - 1 && map[r0 + k][c0] === 0)
          map[r0 + k][c0] = 1;
    }
  }

  // Scatter trees in open ground
  for (var i = 0; i < 500; i++) {
    var r = 1 + Math.floor(rand() * (ROWS - 2));
    var c = 1 + Math.floor(rand() * (COLS - 2));
    if (map[r][c] === 0) map[r][c] = 2;
  }

  // Always keep spawn area clear
  map[1][1] = 0;
  map[1][2] = 0;
  map[2][1] = 0;
  return map;
}

/**
 * @param {string} userId
 * @returns {string}
 */
function getOrCreatePlayerWorld(userId) {
  var key = "vworld_current:" + userId;
  var worldId = sharedStorage.getItem(key);
  if (!worldId) {
    worldId = "10000";
    sharedStorage.setItem(key, worldId);
  }
  return worldId;
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
  const treeMods = loadWorldTrees(worldId);
  ensureWorldItems(worldId);
  const worldItems = loadWorldItems(worldId);
  const playerInventory = loadPlayerInventory(userId);
  const npcs = getWorldNPCSnapshot(worldId);
  // Read last known position from dedicated storage (survives page refresh).
  // Falls back to spawn (1,1) only when the player enters a fresh new world.
  const savedPosRaw = sharedStorage.getItem("vworld_pos:" + userId);
  const savedPos = savedPosRaw ? JSON.parse(savedPosRaw) : null;
  const initRow = savedPos ? savedPos.row : 1;
  const initCol = savedPos ? savedPos.col : 1;
  const initSeq = savedPos ? savedPos.seq || 0 : 0;
  const initRotation =
    savedPos && Number.isFinite(Number(savedPos.rotation))
      ? Number(savedPos.rotation)
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
    <span id="hud-nick-row"><span id="nick-display">${(playerNick || authName).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c])}</span><button id="nick-edit-btn" onclick="startNickEdit()" title="Rename">✏️</button><span id="nick-edit-row" style="display:none;"><input id="nick-input" type="text" maxlength="24"><button onclick="commitNickEdit()" title="Save">✓</button><button onclick="cancelNickEdit()" title="Cancel">✗</button></span></span><br>
    World: ${worldId}<br>
    Position: <span id="pos-col">${initCol}</span>, <span id="pos-row">${initRow}</span><br>
    L: <span id="held-left">-</span> | R: <span id="held-right">-</span>
  </div>

  <div class="hud" id="hud-legend">
    <strong>Legend</strong>
    <div class="leg" id="legend-ground"><div class="leg-box" style="background:#7ab648;"></div> Ground</div>
    <div class="leg"><div class="leg-box" style="background:#9e9e9e;"></div> Wall</div>
    <div class="leg"><div class="leg-box" style="background:#2d8a3e;"></div> Tree</div>
    <div class="leg"><div class="leg-box" style="background:#2980b9;"></div> You</div>
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
    var TREE_MODS = ${JSON.stringify(treeMods)};
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
  var raw = sharedStorage.getItem("vworld:" + worldId);
  return raw ? JSON.parse(raw) : {};
}

/**
 * @param {string} worldId
 * @param {Record<string, any>} players
 */
function saveWorldPlayers(worldId, players) {
  sharedStorage.setItem("vworld:" + worldId, JSON.stringify(players));
}

/**
 * @param {string} worldId
 * @returns {Record<string, any>}
 */
function loadWorldTrees(worldId) {
  var raw = sharedStorage.getItem("vworld_trees:" + worldId);
  return raw ? JSON.parse(raw) : {};
}

/**
 * @param {string} worldId
 * @param {Record<string, any>} trees
 */
function saveWorldTrees(worldId, trees) {
  sharedStorage.setItem("vworld_trees:" + worldId, JSON.stringify(trees));
}

/**
 * @returns {{left_hand: any, right_hand: any, inventory: any[]}}
 */
function createEmptyInventory() {
  return {
    left_hand: null,
    right_hand: null,
    inventory: [],
  };
}

/**
 * @param {*} item
 * @returns {boolean}
 */
function isValidItem(item) {
  return (
    !!item &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    typeof item.type === "string"
  );
}

/**
 * @param {*} inv
 * @returns {{left_hand: any, right_hand: any, inventory: any[]}}
 */
function normalizeInventory(inv) {
  var out = createEmptyInventory();
  if (!inv || typeof inv !== "object") return out;
  if (isValidItem(inv.left_hand)) out.left_hand = inv.left_hand;
  if (isValidItem(inv.right_hand)) out.right_hand = inv.right_hand;
  if (Array.isArray(inv.inventory)) {
    out.inventory = inv.inventory.filter(isValidItem);
  }
  return out;
}

/**
 * @param {*} inv
 * @returns {string[]}
 */
function getInventoryTreeActions(inv) {
  var normalized = normalizeInventory(inv);
  /** @type {Record<string, boolean>} */
  var actions = {};
  /** @type {any[]} */
  var items = [];
  if (normalized.left_hand) items.push(normalized.left_hand);
  if (normalized.right_hand) items.push(normalized.right_hand);
  if (Array.isArray(normalized.inventory)) {
    items = items.concat(normalized.inventory);
  }

  /**
   * @param {string} type
   * @returns {string[]}
   */
  function actionsForItemType(type) {
    if (type === "portal_builder") return ["build_portal", "remove_portal"];
    var action = TREE_ACTION_BY_ITEM_TYPE[type];
    return action ? [action] : [];
  }

  items.forEach(function (item) {
    if (!item || typeof item.type !== "string") return;
    var itemActions = actionsForItemType(item.type);
    for (var i = 0; i < itemActions.length; i++) {
      actions[itemActions[i]] = true;
    }
  });
  return Object.keys(actions);
}

/**
 * @param {*} inv
 * @param {string} action
 * @returns {boolean}
 */
function canInventoryUseTreeAction(inv, action) {
  if (
    action !== "plant" &&
    action !== "cut" &&
    action !== "build_portal" &&
    action !== "remove_portal" &&
    action !== "portal_travel" &&
    action !== "return_home"
  )
    return false;
  return getInventoryTreeActions(inv).indexOf(action) !== -1;
}

/**
 * @param {any[]} items
 * @param {string} action
 * @returns {boolean}
 */
function canTileItemsUseTreeAction(items, action) {
  if (!Array.isArray(items)) return false;

  /**
   * @param {string} type
   * @returns {string[]}
   */
  function actionsForItemType(type) {
    if (type === "portal_builder") return ["build_portal", "remove_portal"];
    var mapped = TREE_ACTION_BY_ITEM_TYPE[type];
    return mapped ? [mapped] : [];
  }

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item || typeof item.type !== "string") continue;
    var itemActions = actionsForItemType(item.type);
    if (itemActions.indexOf(action) !== -1) return true;
  }
  return false;
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
    savePlayerInventory(userId, inv);
  }
}

/**
 * @param {string} userId
 * @returns {{left_hand: any, right_hand: any, inventory: any[]}}
 */
function loadPlayerInventory(userId) {
  var raw = sharedStorage.getItem("vworld_inv:" + userId);
  if (!raw) return createEmptyInventory();
  try {
    return normalizeInventory(JSON.parse(raw));
  } catch (e) {
    return createEmptyInventory();
  }
}

/**
 * @param {string} userId
 * @param {*} inventory
 */
function savePlayerInventory(userId, inventory) {
  sharedStorage.setItem(
    "vworld_inv:" + userId,
    JSON.stringify(normalizeInventory(inventory)),
  );
}

// ── Player nicknames ──────────────────────────────────────────────────────────

/**
 * @param {string} userId
 * @returns {string}
 */
function loadPlayerNick(userId) {
  return sharedStorage.getItem("vworld_nick:" + userId) || "";
}

/**
 * @param {string} userId
 * @param {string} nick
 */
function savePlayerNick(userId, nick) {
  sharedStorage.setItem("vworld_nick:" + userId, nick);
}

/**
 * Returns the custom nick if set, otherwise falls back to a truncated userId.
 * @param {string} userId
 * @returns {string}
 */
function getEffectiveNick(userId) {
  var nick = loadPlayerNick(userId);
  return nick || userId.slice(0, 16);
}

// ── Global online presence ────────────────────────────────────────────────────

/**
 * Adds userId to the global online index (list of all ever-online user IDs).
 * Benign duplicates are deduplicated on read.
 * @param {string} userId
 */
function addToOnlineIndex(userId) {
  var raw = sharedStorage.getItem("vworld_online_ids");
  /** @type {string[]} */
  var ids = [];
  try {
    ids = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(ids)) ids = [];
  } catch (e) {
    ids = [];
  }
  if (ids.indexOf(userId) === -1) {
    ids.push(userId);
    sharedStorage.setItem("vworld_online_ids", JSON.stringify(ids));
  }
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
  var now = Date.now();
  var existing = null;
  var raw = sharedStorage.getItem("vworld_online:" + userId);
  if (raw) {
    try {
      existing = JSON.parse(raw);
    } catch (e) {}
  }
  var loginAt =
    existing && existing.session_id === sessionId && existing.login_at
      ? existing.login_at
      : now;
  sharedStorage.setItem(
    "vworld_online:" + userId,
    JSON.stringify({
      world_id: String(worldId),
      nick: getEffectiveNick(userId),
      login_at: loginAt,
      ts: now,
      session_id: sessionId,
    }),
  );
  addToOnlineIndex(userId);
}

/**
 * Build a snapshot of all online players (TTL = 30 s).
 * @returns {Array<{player_id: string, nick: string, world_id: string, login_at: number, last_active: number}>}
 */
function buildOnlinePlayersSnapshot() {
  var raw = sharedStorage.getItem("vworld_online_ids");
  /** @type {string[]} */
  var ids = [];
  try {
    ids = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(ids)) ids = [];
  } catch (e) {
    ids = [];
  }
  var now = Date.now();
  // 90 s TTL — gives headroom for background-tab heartbeat throttling.
  var TTL = 90000;
  /** @type {Array<{player_id: string, nick: string, world_id: string, login_at: number, last_active: number}>} */
  var result = [];
  /** @type {Record<string, boolean>} */
  var seen = {};
  for (var i = 0; i < ids.length; i++) {
    var uid = ids[i];
    if (!uid || seen[uid]) continue;
    seen[uid] = true;
    var entryRaw = sharedStorage.getItem("vworld_online:" + uid);
    if (!entryRaw) continue;
    var entry = null;
    try {
      entry = JSON.parse(entryRaw);
    } catch (e) {}
    if (!entry || typeof entry.ts !== "number") continue;
    if (now - entry.ts > TTL) continue;
    result.push({
      player_id: uid,
      nick: entry.nick || uid.slice(0, 16),
      world_id: String(entry.world_id || ""),
      login_at: Number(entry.login_at || 0),
      last_active: Number(entry.ts),
    });
  }
  return result;
}

// ── World chat ────────────────────────────────────────────────────────────────

var WORLD_CHAT_MAX = 100;

/**
 * @param {string} worldId
 * @returns {Array<{id:string,sender_id:string,sender_nick:string,text:string,ts:number}>}
 */
function loadWorldChat(worldId) {
  var raw = sharedStorage.getItem("vworld_chat:" + worldId);
  if (!raw) return [];
  try {
    var msgs = JSON.parse(raw);
    return Array.isArray(msgs) ? msgs : [];
  } catch (e) {
    return [];
  }
}

/**
 * @param {string} worldId
 * @param {Array<any>} msgs
 */
function saveWorldChat(worldId, msgs) {
  var capped = msgs.slice(-WORLD_CHAT_MAX);
  sharedStorage.setItem("vworld_chat:" + worldId, JSON.stringify(capped));
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
  return [a, b].sort().join(":");
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {Array<{id:string,sender_id:string,sender_nick:string,recipient_id:string,text:string,ts:number}>}
 */
function loadDMHistory(a, b) {
  var raw = sharedStorage.getItem("vworld_dm:" + dmConversationKey(a, b));
  if (!raw) return [];
  try {
    var msgs = JSON.parse(raw);
    return Array.isArray(msgs) ? msgs : [];
  } catch (e) {
    return [];
  }
}

/**
 * @param {string} a
 * @param {string} b
 * @param {Array<any>} msgs
 */
function saveDMHistory(a, b, msgs) {
  var capped = msgs.slice(-DM_MAX);
  sharedStorage.setItem(
    "vworld_dm:" + dmConversationKey(a, b),
    JSON.stringify(capped),
  );
}

/**
 * @param {string} userId
 * @returns {string[]}
 */
function loadDMIndex(userId) {
  var raw = sharedStorage.getItem("vworld_dm_index:" + userId);
  if (!raw) return [];
  try {
    var idx = JSON.parse(raw);
    return Array.isArray(idx) ? idx : [];
  } catch (e) {
    return [];
  }
}

/**
 * @param {string} userId
 * @param {string} otherUserId
 */
function addToDMIndex(userId, otherUserId) {
  var idx = loadDMIndex(userId);
  if (idx.indexOf(otherUserId) === -1) {
    idx.push(otherUserId);
    sharedStorage.setItem("vworld_dm_index:" + userId, JSON.stringify(idx));
  }
}

/**
 * @param {string} worldId
 * @returns {Record<string, any[]>}
 */
function loadWorldItems(worldId) {
  var raw = sharedStorage.getItem("vworld_items:" + worldId);
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    /** @type {Record<string, any[]>} */
    var out = {};
    Object.keys(parsed).forEach(function (tileKey) {
      var arr = parsed[tileKey];
      if (!Array.isArray(arr)) return;
      var filtered = arr.filter(isValidItem);
      if (filtered.length > 0) out[tileKey] = filtered;
    });
    return out;
  } catch (e) {
    return {};
  }
}

/**
 * @param {string} worldId
 * @param {Record<string, any[]>} items
 */
function saveWorldItems(worldId, items) {
  /** @type {Record<string, any[]>} */
  var normalized = {};
  if (items && typeof items === "object") {
    Object.keys(items).forEach(function (tileKey) {
      var arr = items[tileKey];
      if (!Array.isArray(arr)) return;
      var filtered = arr.filter(isValidItem);
      if (filtered.length > 0) normalized[tileKey] = filtered;
    });
  }
  sharedStorage.setItem("vworld_items:" + worldId, JSON.stringify(normalized));
}

/**
 * @param {string} worldId
 * @returns {number}
 */
function nextWorldItemId(worldId) {
  var key = "vworld_item_seq:" + worldId;
  var cur = Number(sharedStorage.getItem(key) || 0) + 1;
  sharedStorage.setItem(key, String(cur));
  return cur;
}

/**
 * @param {string} worldId
 */
function ensureWorldItems(worldId) {
  var seededKey = "vworld_items_seeded:" + worldId;
  if (sharedStorage.getItem(seededKey) === "1") return;

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
  sharedStorage.setItem(seededKey, "1");
}

/**
 * @param {Record<string, any[]>} itemsByTile
 * @returns {Array<{id: string, type: string, row: number, col: number}>}
 */
function flattenWorldItems(itemsByTile) {
  /** @type {Array<{id: string, type: string, row: number, col: number}>} */
  var out = [];
  if (!itemsByTile || typeof itemsByTile !== "object") return out;
  Object.keys(itemsByTile).forEach(function (tileKey) {
    var parts = tileKey.split("_");
    var row = Number(parts[0]);
    var col = Number(parts[1]);
    if (!isFinite(row) || !isFinite(col)) return;
    var arr = itemsByTile[tileKey];
    if (!Array.isArray(arr)) return;
    arr.forEach(function (item) {
      if (!isValidItem(item)) return;
      out.push({
        id: item.id,
        type: item.type,
        row: row,
        col: col,
      });
    });
  });
  return out;
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
  graphQLRegistry.sendSubscriptionMessageFiltered(
    "worldItemChanged",
    JSON.stringify({
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
    }),
    JSON.stringify({ world_id: worldId }),
  );
}

/**
 * @param {string} worldId
 * @returns {Record<string, any>}
 */
function loadWorldNPCs(worldId) {
  var raw = sharedStorage.getItem("vworld_npcs:" + worldId);
  return raw ? JSON.parse(raw) : {};
}

/**
 * @param {string} worldId
 * @param {Record<string, any>} npcs
 */
function saveWorldNPCs(worldId, npcs) {
  sharedStorage.setItem("vworld_npcs:" + worldId, JSON.stringify(npcs));
}

/**
 * @returns {Record<string, number>}
 */
function loadNPCActiveWorlds() {
  var raw = sharedStorage.getItem("vworld_npc_worlds");
  return raw ? JSON.parse(raw) : {};
}

/**
 * @param {Record<string, number>} worlds
 */
function saveNPCActiveWorlds(worlds) {
  sharedStorage.setItem("vworld_npc_worlds", JSON.stringify(worlds));
}

/**
 * @param {string} worldId
 */
function markNPCWorldActive(worldId) {
  var worlds = loadNPCActiveWorlds();
  worlds[String(worldId)] = Date.now();
  saveNPCActiveWorlds(worlds);
}

/**
 * @param {string} worldId
 * @returns {number[][]}
 */
function getEffectiveMap(worldId) {
  /** @type {number[][]} */
  var map = generateMap(worldId);
  var trees = loadWorldTrees(worldId);
  // Apply tree modifications to the base map
  for (var key in trees) {
    var parts = key.split("_");
    var row = parseInt(parts[0], 10);
    var col = parseInt(parts[1], 10);
    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
      if (trees[key].action === "plant") {
        map[row][col] = 2; // Add tree
      } else if (trees[key].action === "cut") {
        map[row][col] = 0; // Remove tree (make walkable)
      }
    }
  }
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
  return Object.keys(npcs).map(function (npcId) {
    var n = npcs[npcId] || {};
    return {
      npc_id: npcId,
      row: Number(n.row),
      col: Number(n.col),
      seq: Number(n.seq || 0),
      rotation: isFinite(Number(n.rotation)) ? Number(n.rotation) : 0,
      state: typeof n.state === "string" ? n.state : "idle",
      left_hand:
        n.left_hand && n.left_hand.type ? String(n.left_hand.type) : "",
      right_hand:
        n.right_hand && n.right_hand.type ? String(n.right_hand.type) : "",
      inventory_count: Array.isArray(n.inventory) ? n.inventory.length : 0,
    };
  });
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
  /** @type {Record<string, boolean>} */
  var occupiedPlayers = {};
  Object.keys(players).forEach(function (pid) {
    var p = players[pid];
    if (!p || !isFinite(Number(p.row)) || !isFinite(Number(p.col))) return;
    occupiedPlayers[p.row + "_" + p.col] = true;
  });

  /** @type {Record<string, string>} */
  var occupiedNPCs = {};
  npcIds.forEach(function (npcId) {
    var n = npcs[npcId];
    if (!n) return;
    occupiedNPCs[n.row + "_" + n.col] = npcId;
  });

  var hasChanges = false;
  npcIds.forEach(function (npcId) {
    var n = npcs[npcId];
    if (!n) return;
    var npcInv = normalizeInventory(n);
    n.left_hand = npcInv.left_hand;
    n.right_hand = npcInv.right_hand;
    n.inventory = npcInv.inventory;
    if (Math.random() < 0.35) {
      n.state = "idle";
      n.ts = now;
    } else {
      var dirs = [
        { dr: 1, dc: 0 },
        { dr: -1, dc: 0 },
        { dr: 0, dc: 1 },
        { dr: 0, dc: -1 },
      ];
      shuffleDirections(dirs);

      var moved = false;
      var fromKey = n.row + "_" + n.col;
      delete occupiedNPCs[fromKey];

      for (var i = 0; i < dirs.length; i++) {
        var nr = n.row + dirs[i].dr;
        var nc = n.col + dirs[i].dc;
        var key = nr + "_" + nc;
        var walkable =
          nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && map[nr][nc] === 0;
        if (!walkable) continue;
        if (occupiedPlayers[key]) continue;
        if (occupiedNPCs[key]) continue;

        n.row = nr;
        n.col = nc;
        n.rotation = directionToRotation(dirs[i].dr, dirs[i].dc);
        n.seq = Number(n.seq || 0) + 1;
        n.state = "walking";
        n.ts = now;
        moved = true;
        occupiedNPCs[key] = npcId;

        graphQLRegistry.sendSubscriptionMessageFiltered(
          "worldNPCMoved",
          JSON.stringify({
            npc_id: npcId,
            row: n.row,
            col: n.col,
            seq: n.seq,
            rotation: n.rotation,
            state: n.state,
          }),
          JSON.stringify({ world_id: worldId }),
        );
        break;
      }

      if (!moved) {
        occupiedNPCs[fromKey] = npcId;
        n.state = "idle";
        n.ts = now;
      } else {
        hasChanges = true;
      }
    }

    // NPC item behavior: pick all pickable items from current tile, and occasionally drop one.
    var tileKey = n.row + "_" + n.col;
    var allNpcTileItems = Array.isArray(worldItems[tileKey])
      ? worldItems[tileKey]
      : [];
    var pickableItems = allNpcTileItems.filter(function (item) {
      return item && item.type !== "portal";
    });
    var nonPickableItems = allNpcTileItems.filter(function (item) {
      return item && item.type === "portal";
    });
    if (pickableItems.length > 0 && Math.random() < 0.65) {
      for (var pickIdx = 0; pickIdx < pickableItems.length; pickIdx++) {
        n.inventory.push(pickableItems[pickIdx]);
      }
      if (nonPickableItems.length > 0) {
        worldItems[tileKey] = nonPickableItems;
      } else {
        delete worldItems[tileKey];
      }
      itemChanges = true;
      hasChanges = true;
      broadcastItemChange(
        worldId,
        "npc",
        npcId,
        "pick",
        n.row,
        n.col,
        pickableItems,
      );
    }

    if (!n.left_hand && n.inventory.length > 0) {
      n.left_hand = n.inventory.shift();
      hasChanges = true;
    }
    if (!n.right_hand && n.inventory.length > 0) {
      n.right_hand = n.inventory.shift();
      hasChanges = true;
    }

    if (Math.random() < 0.12) {
      var dropItem = null;
      if (n.inventory.length > 0) {
        dropItem = n.inventory.shift();
      } else if (n.left_hand) {
        dropItem = n.left_hand;
        n.left_hand = null;
      } else if (n.right_hand) {
        dropItem = n.right_hand;
        n.right_hand = null;
      }
      if (dropItem) {
        if (!worldItems[tileKey]) worldItems[tileKey] = [];
        worldItems[tileKey].push(dropItem);
        itemChanges = true;
        hasChanges = true;
        broadcastItemChange(worldId, "npc", npcId, "drop", n.row, n.col, [
          dropItem,
        ]);
      }
    }

    var npcTreeActions = getInventoryTreeActions(n);
    if (npcTreeActions.length > 0 && Math.random() < 0.08) {
      var treeDirs = [
        { dr: 1, dc: 0 },
        { dr: -1, dc: 0 },
        { dr: 0, dc: 1 },
        { dr: 0, dc: -1 },
      ];
      shuffleDirections(treeDirs);
      var didTreeAction = false;
      for (var td = 0; td < treeDirs.length && !didTreeAction; td++) {
        var tr = n.row + treeDirs[td].dr;
        var tc = n.col + treeDirs[td].dc;
        if (tr < 0 || tr >= ROWS || tc < 0 || tc >= COLS) continue;
        var treeKey = tr + "_" + tc;

        if (npcTreeActions.indexOf("cut") !== -1) {
          var hasPlantedTree =
            trees[treeKey] && trees[treeKey].action === "plant";
          var baseHasTree = map[tr][tc] === 2;
          var alreadyCut = trees[treeKey] && trees[treeKey].action === "cut";
          if ((hasPlantedTree || baseHasTree) && !alreadyCut) {
            trees[treeKey] = {
              action: "cut",
              cut_by: npcId,
              timestamp: now,
            };
            map[tr][tc] = 0;
            n.rotation = directionToRotation(treeDirs[td].dr, treeDirs[td].dc);
            treeChanges = true;
            hasChanges = true;
            didTreeAction = true;
            graphQLRegistry.sendSubscriptionMessageFiltered(
              "worldTreeChanged",
              JSON.stringify({
                action: "cut",
                row: tr,
                col: tc,
                actor_type: "npc",
                actor_id: npcId,
              }),
              JSON.stringify({ world_id: worldId }),
            );
            continue;
          }
        }

        if (npcTreeActions.indexOf("plant") !== -1) {
          var hasExistingTree =
            trees[treeKey] && trees[treeKey].action === "plant";
          var wasTreeCut = trees[treeKey] && trees[treeKey].action === "cut";
          var groundWalkable = map[tr][tc] === 0;
          if (groundWalkable && !hasExistingTree) {
            trees[treeKey] = {
              action: "plant",
              planted_by: npcId,
              timestamp: now,
            };
            if (wasTreeCut || map[tr][tc] === 0) map[tr][tc] = 2;
            n.rotation = directionToRotation(treeDirs[td].dr, treeDirs[td].dc);
            treeChanges = true;
            hasChanges = true;
            didTreeAction = true;
            graphQLRegistry.sendSubscriptionMessageFiltered(
              "worldTreeChanged",
              JSON.stringify({
                action: "plant",
                row: tr,
                col: tc,
                actor_type: "npc",
                actor_id: npcId,
              }),
              JSON.stringify({ world_id: worldId }),
            );
          }
        }
      }
    }
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
      sharedStorage.removeItem("vworld_npcs:" + worldId);
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
  var key = "vworld_npc_tick_lease:" + worldId;
  var raw = sharedStorage.getItem(key);
  var lease = null;
  if (raw) {
    try {
      lease = JSON.parse(raw);
    } catch (e) {
      lease = null;
    }
  }

  if (
    lease &&
    lease.owner &&
    lease.owner !== npcTickOwnerId &&
    Number(lease.expires_at || 0) > now
  ) {
    return false;
  }

  var newLease = {
    owner: npcTickOwnerId,
    expires_at: now + NPC_TICK_LEASE_MS,
  };
  sharedStorage.setItem(key, JSON.stringify(newLease));

  // Re-read after write so we only proceed if our lease is still current.
  var verifyRaw = sharedStorage.getItem(key);
  if (!verifyRaw) return false;
  try {
    var verify = JSON.parse(verifyRaw);
    return (
      verify &&
      verify.owner === npcTickOwnerId &&
      Number(verify.expires_at || 0) >= now
    );
  } catch (e) {
    return false;
  }
}

/**
 * @param {string} worldId
 * @param {number} now
 * @returns {boolean}
 */
function tryTickWorldNPCs(worldId, now) {
  var key = "vworld_npc_last_tick:" + worldId;
  var lastTick = Number(sharedStorage.getItem(key) || 0);
  if (now - lastTick < NPC_TICK_MS) return false;
  if (!tryAcquireNPCTickLease(worldId, now)) return false;

  // Recheck after lease acquisition to avoid race with another writer.
  lastTick = Number(sharedStorage.getItem(key) || 0);
  if (now - lastTick < NPC_TICK_MS) return false;

  tickWorldNPCs(worldId, now);
  sharedStorage.setItem(key, String(now));
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
  var players = loadWorldPlayers(worldId);
  var cur = players[userId];
  if (cur && isFinite(Number(cur.row)) && isFinite(Number(cur.col))) {
    return {
      row: Number(cur.row),
      col: Number(cur.col),
      seq: Number(cur.seq || 0),
      rotation: isFinite(Number(cur.rotation)) ? Number(cur.rotation) : 0,
    };
  }
  var savedPosRaw = sharedStorage.getItem("vworld_pos:" + userId);
  if (!savedPosRaw) {
    return { row: 1, col: 1, seq: 0, rotation: 0 };
  }
  try {
    var savedPos = JSON.parse(savedPosRaw);
    return {
      row: isFinite(Number(savedPos.row)) ? Number(savedPos.row) : 1,
      col: isFinite(Number(savedPos.col)) ? Number(savedPos.col) : 1,
      seq: isFinite(Number(savedPos.seq)) ? Number(savedPos.seq) : 0,
      rotation: isFinite(Number(savedPos.rotation))
        ? Number(savedPos.rotation)
        : 0,
    };
  } catch (e) {
    return { row: 1, col: 1, seq: 0, rotation: 0 };
  }
}

/**
 * @param {*} context
 */
function itemsHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
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
  var action = String((body && body.action) || "");
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) {
    return { status: 200, payload: { ok: false, error: "No world found" } };
  }
  ensureWorldItems(worldId);

  var canonical = getCanonicalPlayerState(worldId, userId);
  var tileKey = canonical.row + "_" + canonical.col;
  var inv = loadPlayerInventory(userId);
  var worldItems = loadWorldItems(worldId);

  if (action === "pick") {
    var allTileItems = Array.isArray(worldItems[tileKey])
      ? worldItems[tileKey]
      : [];
    var picked = allTileItems.filter(function (item) {
      return item && item.type !== "portal";
    });
    var remainingOnTile = allTileItems.filter(function (item) {
      return item && item.type === "portal";
    });
    if (picked.length > 0) {
      for (var i = 0; i < picked.length; i++) {
        inv.inventory.push(picked[i]);
      }
      if (remainingOnTile.length > 0) {
        worldItems[tileKey] = remainingOnTile;
      } else {
        delete worldItems[tileKey];
      }
      saveWorldItems(worldId, worldItems);
      savePlayerInventory(userId, inv);
      broadcastItemChange(
        worldId,
        "player",
        userId,
        "pick",
        canonical.row,
        canonical.col,
        picked,
      );
    }
    return {
      status: 200,
      payload: {
        ok: true,
        action: "pick",
        picked_count: picked.length,
        inventory: inv,
        items: flattenWorldItems(worldItems),
      },
    };
  }

  if (action === "drop") {
    var from = String(body.from || "");
    var index = Number(body.index);
    var dropItem = null;
    if (from === "left_hand" && inv.left_hand) {
      dropItem = inv.left_hand;
      inv.left_hand = null;
    } else if (from === "right_hand" && inv.right_hand) {
      dropItem = inv.right_hand;
      inv.right_hand = null;
    } else if (
      from === "inventory" &&
      isFinite(index) &&
      index >= 0 &&
      index < inv.inventory.length
    ) {
      dropItem = inv.inventory.splice(index, 1)[0];
    } else {
      return {
        status: 200,
        payload: { ok: false, error: "Invalid drop source" },
      };
    }

    if (dropItem.non_droppable) {
      return {
        status: 200,
        payload: { ok: false, error: "Item cannot be dropped" },
      };
    }

    if (!worldItems[tileKey]) worldItems[tileKey] = [];
    worldItems[tileKey].push(dropItem);

    savePlayerInventory(userId, inv);
    saveWorldItems(worldId, worldItems);
    broadcastItemChange(
      worldId,
      "player",
      userId,
      "drop",
      canonical.row,
      canonical.col,
      [dropItem],
    );

    return {
      status: 200,
      payload: {
        ok: true,
        action: "drop",
        inventory: inv,
        items: flattenWorldItems(worldItems),
      },
    };
  }

  if (action === "equip") {
    var fromSlot = String(body.from || "");
    var toSlot = String(body.to || "");
    var fromIndex = Number(body.index);
    var movingItem = null;

    if (fromSlot === "left_hand" && inv.left_hand) {
      movingItem = inv.left_hand;
      inv.left_hand = null;
    } else if (fromSlot === "right_hand" && inv.right_hand) {
      movingItem = inv.right_hand;
      inv.right_hand = null;
    } else if (
      fromSlot === "inventory" &&
      isFinite(fromIndex) &&
      fromIndex >= 0 &&
      fromIndex < inv.inventory.length
    ) {
      movingItem = inv.inventory.splice(fromIndex, 1)[0];
    }

    if (!movingItem) {
      return { status: 200, payload: { ok: false, error: "No item to equip" } };
    }

    if (toSlot === "left_hand") {
      if (inv.left_hand) inv.inventory.push(inv.left_hand);
      inv.left_hand = movingItem;
    } else if (toSlot === "right_hand") {
      if (inv.right_hand) inv.inventory.push(inv.right_hand);
      inv.right_hand = movingItem;
    } else if (toSlot === "inventory") {
      inv.inventory.push(movingItem);
    } else {
      if (fromSlot === "left_hand") inv.left_hand = movingItem;
      else if (fromSlot === "right_hand") inv.right_hand = movingItem;
      else inv.inventory.push(movingItem);
      return {
        status: 200,
        payload: { ok: false, error: "Invalid destination slot" },
      };
    }

    savePlayerInventory(userId, inv);
    return {
      status: 200,
      payload: {
        ok: true,
        action: "equip",
        inventory: inv,
        items: flattenWorldItems(worldItems),
      },
    };
  }

  return { status: 400, payload: { ok: false, error: "Unknown action" } };
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
  var worldId = sharedStorage.getItem("vworld_current:" + userId) || "";
  var inv = loadPlayerInventory(userId);
  var itemTypes = ITEM_TYPES;
  var now = Date.now();

  // Collect types already owned across all inventory slots
  /** @type {Record<string, boolean>} */
  var ownedTypes = {};
  if (inv.left_hand && inv.left_hand.type)
    ownedTypes[inv.left_hand.type] = true;
  if (inv.right_hand && inv.right_hand.type)
    ownedTypes[inv.right_hand.type] = true;
  if (Array.isArray(inv.inventory)) {
    for (var j = 0; j < inv.inventory.length; j++) {
      if (inv.inventory[j] && inv.inventory[j].type) {
        ownedTypes[inv.inventory[j].type] = true;
      }
    }
  }

  var grantedCount = 0;
  for (var i = 0; i < itemTypes.length; i++) {
    if (ownedTypes[itemTypes[i]]) continue;
    inv.inventory.push({
      id: makeCheatItemId(userId, worldId, i),
      type: itemTypes[i],
      created_at: now,
    });
    grantedCount++;
  }

  savePlayerInventory(userId, inv);

  /** @type {Array<{id: string, type: string, row: number, col: number}>} */
  var itemsSnapshot = [];
  if (worldId) {
    ensureWorldItems(worldId);
    itemsSnapshot = flattenWorldItems(loadWorldItems(worldId));
  }

  return {
    ok: true,
    action: "cheat_grant_all",
    granted_count: grantedCount,
    inventory: inv,
    items: itemsSnapshot,
  };
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
  return ResponseBuilder.json(buildOnlinePlayersSnapshot());
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
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
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
  var history = loadWorldChat(worldId);
  history.push(msg);
  saveWorldChat(worldId, history);
  graphQLRegistry.sendSubscriptionMessageFiltered(
    "worldChatMessage",
    JSON.stringify(msg),
    JSON.stringify({ world_id: worldId }),
  );
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
  var conv = loadDMHistory(userId, to);
  conv.push(msg);
  saveDMHistory(userId, to, conv);
  addToDMIndex(userId, to);
  addToDMIndex(to, userId);
  graphQLRegistry.sendSubscriptionMessageFiltered(
    "worldDirectMessage",
    JSON.stringify(msg),
    JSON.stringify({ recipient_id: to }),
  );
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
  // Support both old format (row/col) and new format (fromRow/fromCol/toRow/toCol)
  var fromRow = body.fromRow !== undefined ? Number(body.fromRow) : null;
  var fromCol = body.fromCol !== undefined ? Number(body.fromCol) : null;
  var toRow = body.toRow !== undefined ? Number(body.toRow) : Number(body.row);
  var toCol = body.toCol !== undefined ? Number(body.toCol) : Number(body.col);
  var rotation = Number(body.rotation);
  // Backward compatible fallback keeps legacy tabs functional.
  var sessionId = body.session_id ? String(body.session_id) : "legacy";

  // Derive world from server-side storage — never trust client for this
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) {
    return ResponseBuilder.json({ ok: false, row: 1, col: 1 });
  }
  markNPCWorldActive(worldId);

  var leaseKey = "vworld_lease:" + userId;
  var leaseRaw = sharedStorage.getItem(leaseKey);
  var lease = null;
  if (leaseRaw) {
    try {
      lease = JSON.parse(leaseRaw);
    } catch (e) {
      lease = null;
    }
  }
  var now = Date.now();
  var leaseValid =
    lease &&
    typeof lease.session_id === "string" &&
    Number(lease.expires_at || 0) > now;
  if (leaseValid && lease.session_id !== sessionId) {
    vwLog("move taking over lease", {
      user_id: userId,
      world_id: worldId,
      previous_session: lease.session_id,
      session_id: sessionId,
    });
  }
  // Acquire or renew writer lease for this session before processing move.
  sharedStorage.setItem(
    leaseKey,
    JSON.stringify({ session_id: sessionId, expires_at: now + LEASE_TTL_MS }),
  );

  var players = loadWorldPlayers(worldId);
  // When players[userId] is absent (player reconnected after a refresh — leaveHandler
  // removed the presence entry on the previous page close), restore from the persisted
  // position key so the adjacency check doesn't incorrectly snap back to (1,1).
  var cur = players[userId];
  if (!cur) {
    var savedPosRaw = sharedStorage.getItem("vworld_pos:" + userId);
    var savedPos = savedPosRaw ? JSON.parse(savedPosRaw) : { row: 1, col: 1 };
    cur = {
      row: savedPos.row,
      col: savedPos.col,
      seq: savedPos.seq || 0,
      rotation: isFinite(Number(savedPos.rotation))
        ? Number(savedPos.rotation)
        : 0,
      session_id: savedPos.session_id || "",
    };
  }
  if (!isFinite(rotation)) rotation = Number(cur && cur.rotation);
  if (!isFinite(rotation)) rotation = 0;

  // Reject stale moves from a tab that is no longer the active mover.
  // A stale move has a seq that doesn't continue from the stored seq.
  // This check must come BEFORE position validation to prevent false rejections
  // during rapid sequential moves (where client has optimistically moved ahead).
  var expectedSeq = cur.seq + 1;
  var clientSeq = body.seq !== undefined ? Number(body.seq) : expectedSeq;
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
    return ResponseBuilder.json({
      ok: false,
      stale: true,
      row: cur.row,
      col: cur.col,
      seq: cur.seq,
    });
  }

  // Server-authoritative validation
  var dr = Math.abs(toRow - cur.row);
  var dc = Math.abs(toCol - cur.col);
  // Movement must respect tree modifications (planted/cut), not just base terrain.
  var map = getEffectiveMap(worldId);
  var withinBounds = toRow >= 0 && toRow < ROWS && toCol >= 0 && toCol < COLS;
  var singleStep = dr + dc === 1;
  var walkable = withinBounds && map[toRow][toCol] === 0;

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
    // Reject — return the canonical position so the client can snap back
    return ResponseBuilder.json({
      ok: false,
      stale: false,
      row: cur.row,
      col: cur.col,
    });
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
  // Persist position independently so page refresh restores it.
  sharedStorage.setItem(
    "vworld_pos:" + userId,
    JSON.stringify({
      row: toRow,
      col: toCol,
      seq: cur.seq + 1,
      rotation: rotation,
      session_id: sessionId,
    }),
  );
  var msg = JSON.stringify({
    player_id: userId,
    row: toRow,
    col: toCol,
    seq: cur.seq + 1,
    rotation: rotation,
  });
  graphQLRegistry.sendSubscriptionMessageFiltered(
    "worldPlayerMoved",
    msg,
    JSON.stringify({ world_id: worldId }),
  );
  vwLog("move accepted", {
    user_id: userId,
    world_id: worldId,
    session_id: sessionId,
    row: toRow,
    col: toCol,
    seq: cur.seq + 1,
  });
  return ResponseBuilder.json({
    ok: true,
    row: toRow,
    col: toCol,
    seq: cur.seq + 1,
    rotation: rotation,
  });
}

/**
 * @param {*} context
 */
function leaveHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  // Derive world from storage. newWorldHandler already broadcasts the leave when
  // switching worlds, so by the time this fires after a New World navigation the
  // player is no longer recorded in the new world — making this a safe no-op.
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) return ResponseBuilder.json({ ok: true });
  var players = loadWorldPlayers(worldId);
  if (!players[userId]) return ResponseBuilder.json({ ok: true });
  delete players[userId];
  saveWorldPlayers(worldId, players);
  sharedStorage.removeItem("vworld_hb:" + userId);
  sharedStorage.removeItem("vworld_lease:" + userId);
  sharedStorage.removeItem("vworld_online:" + userId);
  var msg = JSON.stringify({ player_id: userId, leaving: true });
  graphQLRegistry.sendSubscriptionMessageFiltered(
    "worldPlayerMoved",
    msg,
    JSON.stringify({ world_id: worldId }),
  );
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
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) return ResponseBuilder.json({ ok: true });
  markNPCWorldActive(worldId);
  maybeTickWorldNPCs(worldId);

  var sessionId = "";
  try {
    var body = JSON.parse(context.request.body || "{}");
    sessionId = body.session_id ? String(body.session_id) : "";
  } catch (e) {}

  if (sessionId) {
    var leaseKey = "vworld_lease:" + userId;
    var leaseRaw = sharedStorage.getItem(leaseKey);
    var lease = null;
    if (leaseRaw) {
      try {
        lease = JSON.parse(leaseRaw);
      } catch (e) {
        lease = null;
      }
    }
    var now = Date.now();
    var leaseValid =
      lease &&
      typeof lease.session_id === "string" &&
      Number(lease.expires_at || 0) > now;
    // Heartbeat must not steal another tab's active writer lease.
    // It can only renew if this session already owns the lease,
    // or claim it when no valid lease exists.
    if (!leaseValid || lease.session_id === sessionId) {
      sharedStorage.setItem(
        leaseKey,
        JSON.stringify({
          session_id: sessionId,
          expires_at: now + LEASE_TTL_MS,
        }),
      );
    } else {
      vwLog("heartbeat ignored: lease owned by other session", {
        user_id: userId,
        world_id: worldId,
        lease_session: lease.session_id,
        session_id: sessionId,
      });
    }
  }

  // Write ONLY to a separate per-user timestamp key — never read-modify-write
  // the shared players object.  A concurrent moveHandler write would otherwise
  // be clobbered by this handler writing back a stale row/col, causing the
  // server's canonical position to regress and the next move to be rejected.
  sharedStorage.setItem("vworld_hb:" + userId, String(Date.now()));
  updateOnlinePresence(userId, worldId, sessionId || "");
  return ResponseBuilder.json({ ok: true });
}

/**
 * @param {string} userId
 * @param {string} targetWorldId
 */
function switchUserWorld(userId, targetWorldId) {
  var oldWorldId = sharedStorage.getItem("vworld_current:" + userId);
  if (oldWorldId) {
    var oldPlayers = loadWorldPlayers(oldWorldId);
    if (oldPlayers[userId]) {
      delete oldPlayers[userId];
      saveWorldPlayers(oldWorldId, oldPlayers);
      sharedStorage.removeItem("vworld_hb:" + userId);
      sharedStorage.removeItem("vworld_lease:" + userId);
      graphQLRegistry.sendSubscriptionMessageFiltered(
        "worldPlayerMoved",
        JSON.stringify({
          player_id: userId,
          leaving: true,
          switched_world: true,
          target_world_id: String(targetWorldId),
        }),
        JSON.stringify({ world_id: oldWorldId }),
      );
    }
  }

  sharedStorage.setItem("vworld_current:" + userId, String(targetWorldId));
  sharedStorage.removeItem("vworld_lease:" + userId);
  sharedStorage.removeItem("vworld_pos:" + userId);
  // Clear presence entry so login_at resets when the player establishes
  // presence in the new world on their next heartbeat.
  sharedStorage.removeItem("vworld_online:" + userId);
}

/**
 * @param {*} context
 */
function newWorldHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var newWorldId = String(Math.floor(Math.random() * 999999) + 1);
  switchUserWorld(userId, newWorldId);
  return ResponseBuilder.json({ ok: true });
}

/**
 * @param {*} context
 */
function startWorldHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  switchUserWorld(userId, "10000");
  return ResponseBuilder.json({ ok: true });
}

/**
 * @param {*} context
 */
function playersHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) return ResponseBuilder.json([]);
  markNPCWorldActive(worldId);
  var players = loadWorldPlayers(worldId);
  if (!players || typeof players !== "object") {
    vwLog("playersHandler recovered malformed players payload", {
      user_id: userId,
      world_id: worldId,
      type: typeof players,
    });
    players = {};
  }
  var now = Date.now();
  var active = Object.keys(players)
    .filter(function (pid) {
      if (!players[pid] || typeof players[pid] !== "object") {
        vwLog("playersHandler skipped malformed player entry", {
          user_id: userId,
          world_id: worldId,
          player_id: pid,
        });
        return false;
      }
      // A player is active if either their last move OR their last heartbeat
      // is within the TTL window.  Heartbeat ts is stored separately to avoid
      // racing with the move handler's write to the players object.
      var hbTs = Number(sharedStorage.getItem("vworld_hb:" + pid) || 0);
      return now - Math.max(players[pid].ts, hbTs) < 90000;
    })
    .map(function (pid) {
      return {
        player_id: pid,
        row: players[pid].row,
        col: players[pid].col,
        seq: players[pid].seq || 0,
        rotation: isFinite(Number(players[pid].rotation))
          ? Number(players[pid].rotation)
          : 0,
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
  var worldId = sharedStorage.getItem("vworld_current:" + userId) || "10000";
  markNPCWorldActive(worldId);
  ensureWorldItems(worldId);
  return ResponseBuilder.json({
    world_id: String(worldId),
    items: flattenWorldItems(loadWorldItems(worldId)),
    inventory: loadPlayerInventory(userId),
  });
}

/**
 * @param {*} context
 */
function npcsHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
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

  var action = body.action; // "plant", "cut", "build_portal", "remove_portal" or "portal_travel"
  var playerRow = Number(body.row);
  var playerCol = Number(body.col);
  var rotation = Number(body.rotation);

  if (action === "pick" || action === "drop" || action === "equip") {
    var handled = handleItemActionForUser(userId, body);
    return ResponseBuilder.json(handled.payload, handled.status);
  }

  if (action === "cheat_grant_all") {
    return ResponseBuilder.json(grantAllItemsForUser(userId));
  }

  if (
    action !== "plant" &&
    action !== "cut" &&
    action !== "build_portal" &&
    action !== "remove_portal" &&
    action !== "portal_travel" &&
    action !== "return_home"
  ) {
    return ResponseBuilder.json({ error: "Invalid action" }, 400);
  }

  // Derive world from server-side storage
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) {
    return ResponseBuilder.json({ ok: false, error: "No world found" });
  }
  ensureWorldItems(worldId);

  var inv = loadPlayerInventory(userId);
  var canonical = getCanonicalPlayerState(worldId, userId);
  var currentTileKey = canonical.row + "_" + canonical.col;
  var worldItems = loadWorldItems(worldId);
  var currentTileItems = Array.isArray(worldItems[currentTileKey])
    ? worldItems[currentTileKey]
    : [];
  var canUseAction =
    canInventoryUseTreeAction(inv, action) ||
    canTileItemsUseTreeAction(currentTileItems, action);

  if (!canUseAction) {
    return ResponseBuilder.json({
      ok: false,
      error: "Missing required item for action",
    });
  }

  if (action === "return_home") {
    switchUserWorld(userId, "10000");
    return ResponseBuilder.json({
      ok: true,
      action: "return_home",
      switched_world: true,
      world_id: "10000",
    });
  }

  if (action === "portal_travel") {
    var portalEntry = currentTileItems.find(function (item) {
      return item && item.type === "portal";
    });
    var newWorldId =
      portalEntry && portalEntry.destination_world_id
        ? String(portalEntry.destination_world_id)
        : "10000";
    switchUserWorld(userId, newWorldId);
    return ResponseBuilder.json({
      ok: true,
      action: action,
      switched_world: true,
      world_id: newWorldId,
    });
  }

  // Calculate target tile based on player rotation.
  // Must match client indicator/movement mapping:
  // 0 = south (+row), Math.PI/2 = east (+col), Math.PI = north (-row), -Math.PI/2 = west (-col)
  var targetRow = playerRow;
  var targetCol = playerCol;

  var angle = rotation;
  // Normalize angle to [-π, π]
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;

  // Determine direction based on angle
  if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
    targetRow = playerRow + 1; // South
  } else if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) {
    targetCol = playerCol + 1; // East
  } else if (angle >= (3 * Math.PI) / 4 || angle < (-3 * Math.PI) / 4) {
    targetRow = playerRow - 1; // North
  } else {
    targetCol = playerCol - 1; // West
  }

  // Validate target is within bounds
  if (
    targetRow < 0 ||
    targetRow >= ROWS ||
    targetCol < 0 ||
    targetCol >= COLS
  ) {
    return ResponseBuilder.json({ ok: false, error: "Target out of bounds" });
  }

  var map = getEffectiveMap(worldId);
  var trees = loadWorldTrees(worldId);
  var treeKey = targetRow + "_" + targetCol;

  if (action === "build_portal") {
    if (map[targetRow][targetCol] !== 0) {
      return ResponseBuilder.json({
        ok: false,
        error: "Cannot build portal here",
      });
    }
    var targetTileKey = targetRow + "_" + targetCol;
    var targetItems = Array.isArray(worldItems[targetTileKey])
      ? worldItems[targetTileKey]
      : [];
    var hasPortal = targetItems.some(function (item) {
      return item && item.type === "portal";
    });
    if (hasPortal) {
      return ResponseBuilder.json({
        ok: false,
        error: "Portal already exists",
      });
    }
    var portalItem = {
      id: "w" + worldId + "_i" + nextWorldItemId(worldId),
      type: "portal",
      created_at: Date.now(),
      destination_world_id: String(Math.floor(Math.random() * 999999) + 1),
    };
    if (!worldItems[targetTileKey]) worldItems[targetTileKey] = [];
    worldItems[targetTileKey].push(portalItem);
    saveWorldItems(worldId, worldItems);

    broadcastItemChange(
      worldId,
      "player",
      userId,
      "portal_create",
      targetRow,
      targetCol,
      [portalItem],
    );

    return ResponseBuilder.json({
      ok: true,
      action: action,
      row: targetRow,
      col: targetCol,
      items: flattenWorldItems(worldItems),
      inventory: inv,
    });
  }

  if (action === "remove_portal") {
    var removeTileKey = targetRow + "_" + targetCol;
    var removeItems = Array.isArray(worldItems[removeTileKey])
      ? worldItems[removeTileKey]
      : [];
    var keptItems = [];
    var removedPortals = [];
    for (var removeIdx = 0; removeIdx < removeItems.length; removeIdx++) {
      var removeItem = removeItems[removeIdx];
      if (removeItem && removeItem.type === "portal") {
        removedPortals.push(removeItem);
      } else {
        keptItems.push(removeItem);
      }
    }

    if (removedPortals.length === 0) {
      return ResponseBuilder.json({ ok: false, error: "No portal to remove" });
    }

    if (keptItems.length > 0) worldItems[removeTileKey] = keptItems;
    else delete worldItems[removeTileKey];
    saveWorldItems(worldId, worldItems);

    broadcastItemChange(
      worldId,
      "player",
      userId,
      "portal_remove",
      targetRow,
      targetCol,
      removedPortals,
    );

    return ResponseBuilder.json({
      ok: true,
      action: action,
      row: targetRow,
      col: targetCol,
      removed_count: removedPortals.length,
      items: flattenWorldItems(worldItems),
      inventory: inv,
    });
  }

  if (action === "plant") {
    // Check if target is walkable ground (no wall, no tree)
    var hasExistingTree = trees[treeKey] && trees[treeKey].action === "plant";
    var wasTreeCut = trees[treeKey] && trees[treeKey].action === "cut";
    var baseHasTree = map[targetRow][targetCol] === 2;

    // Can only plant on empty ground
    if (map[targetRow][targetCol] !== 0 && !wasTreeCut) {
      return ResponseBuilder.json({ ok: false, error: "Cannot plant here" });
    }
    if (hasExistingTree || (baseHasTree && !wasTreeCut)) {
      return ResponseBuilder.json({ ok: false, error: "Tree already exists" });
    }

    // Plant the tree
    trees[treeKey] = {
      action: "plant",
      planted_by: userId,
      timestamp: Date.now(),
    };
  } else if (action === "cut") {
    // Check if target has a tree
    var hasPlantedTree = trees[treeKey] && trees[treeKey].action === "plant";
    var baseHasTree = map[targetRow][targetCol] === 2;
    var alreadyCut = trees[treeKey] && trees[treeKey].action === "cut";

    if (!hasPlantedTree && !baseHasTree) {
      return ResponseBuilder.json({ ok: false, error: "No tree to cut" });
    }
    if (alreadyCut) {
      return ResponseBuilder.json({ ok: false, error: "Tree already cut" });
    }

    // Cut the tree
    trees[treeKey] = {
      action: "cut",
      cut_by: userId,
      timestamp: Date.now(),
    };
  }

  saveWorldTrees(worldId, trees);

  // Broadcast tree change
  var msg = JSON.stringify({
    action: action,
    row: targetRow,
    col: targetCol,
    actor_type: "player",
    actor_id: userId,
    player_id: userId,
  });
  graphQLRegistry.sendSubscriptionMessageFiltered(
    "worldTreeChanged",
    msg,
    JSON.stringify({ world_id: worldId }),
  );

  return ResponseBuilder.json({
    ok: true,
    action: action,
    row: targetRow,
    col: targetCol,
  });
}

/**
 * @param {*} context
 * @returns {Record<string, string>}
 */
function worldPlayerMovedResolver(context) {
  var userId =
    context.request && context.request.auth && context.request.auth.userId;
  if (!userId) return {};
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) return {};
  return { world_id: worldId };
}

/**
 * @param {*} context
 * @returns {Record<string, string>}
 */
function worldTreeChangedResolver(context) {
  var userId =
    context.request && context.request.auth && context.request.auth.userId;
  if (!userId) return {};
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) return {};
  return { world_id: worldId };
}

/**
 * @param {*} context
 * @returns {Record<string, string>}
 */
function worldNPCMovedResolver(context) {
  var userId =
    context.request && context.request.auth && context.request.auth.userId;
  if (!userId) return {};
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) return {};
  return { world_id: worldId };
}

/**
 * @param {*} context
 * @returns {Record<string, string>}
 */
function worldItemChangedResolver(context) {
  var userId =
    context.request && context.request.auth && context.request.auth.userId;
  if (!userId) return {};
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) return {};
  return { world_id: worldId };
}

/**
 * @param {*} context
 * @returns {Record<string, string>}
 */
function worldChatMessageResolver(context) {
  var userId =
    context.request && context.request.auth && context.request.auth.userId;
  if (!userId) return {};
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) return {};
  return { world_id: worldId };
}

/**
 * @param {*} context
 * @returns {Record<string, string>}
 */
function worldDirectMessageResolver(context) {
  var userId =
    context.request && context.request.auth && context.request.auth.userId;
  if (!userId) return {};
  return { recipient_id: userId };
}

function init() {
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
   * @param {string} name
   * @param {string} schema
   * @param {string} resolver
   * @param {string} type
   */
  function safeRegisterSubscription(name, schema, resolver, type) {
    try {
      graphQLRegistry.registerSubscription(name, schema, resolver, type);
    } catch (e) {
      vwLog("subscription registration skipped", {
        name: name,
        error: String(e),
      });
    }
  }

  // Register new endpoints first so they are available even in hot-reload sessions
  // where older routes may already exist.
  safeRegisterRoute("/virtual-world/items", "itemsHandler", "GET");
  safeRegisterRoute("/virtual-world/item-action", "itemActionHandler", "POST");

  try {
    routeRegistry.registerAssetRoute("/virtual-world", "welcome.html");
  } catch (e) {
    vwLog("asset route registration skipped", { path: "/virtual-world", error: String(e) });
  }
  try {
    routeRegistry.registerAssetRoute("/virtual-world/styles.css", "styles.css");
  } catch (e) {
    vwLog("asset route registration skipped", { path: "/virtual-world/styles.css", error: String(e) });
  }
  try {
    routeRegistry.registerAssetRoute("/virtual-world/client.js", "client.js");
  } catch (e) {
    vwLog("asset route registration skipped", { path: "/virtual-world/client.js", error: String(e) });
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

  safeRegisterSubscription(
    "worldItemChanged",
    "type Subscription { worldItemChanged: String }",
    "worldItemChangedResolver",
    "external",
  );
  safeRegisterSubscription(
    "worldPlayerMoved",
    "type Subscription { worldPlayerMoved: String }",
    "worldPlayerMovedResolver",
    "external",
  );
  safeRegisterSubscription(
    "worldTreeChanged",
    "type Subscription { worldTreeChanged: String }",
    "worldTreeChangedResolver",
    "external",
  );
  safeRegisterSubscription(
    "worldNPCMoved",
    "type Subscription { worldNPCMoved: String }",
    "worldNPCMovedResolver",
    "external",
  );
  safeRegisterSubscription(
    "worldChatMessage",
    "type Subscription { worldChatMessage: String }",
    "worldChatMessageResolver",
    "external",
  );
  safeRegisterSubscription(
    "worldDirectMessage",
    "type Subscription { worldDirectMessage: String }",
    "worldDirectMessageResolver",
    "external",
  );
}
