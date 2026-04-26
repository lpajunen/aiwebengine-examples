/// <reference path="../types/aiwebengine.d.ts" />

// Virtual World - 2.5D block world with Three.js
// Move with WASD or arrow keys. Walls and trees block movement.

// ── Server-side world generation ─────────────────────────────────────────────
var ROWS = 100;
var COLS = 100;
var LEASE_TTL_MS = 30000;
var NPC_MIN_COUNT = 10;
var NPC_MAX_COUNT = 20;
var NPC_TICK_MS = 500;
var NPC_ACTIVE_WORLD_TTL_MS = 120000;
var ITEM_TYPES = ["saw", "knife", "flower", "tree_planter"];
var WORLD_ITEM_SPAWN_COUNT = 10;
var npcTickerStarted = false;
/** @type {Record<string, string>} */
var TREE_ACTION_BY_ITEM_TYPE = {
  saw: "cut",
  tree_planter: "plant",
};

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
      "/auth/login?redirect=" + encodeURIComponent("/virtual-world"),
    );
  }
  const userId = req.auth.userId;
  const authName = req.auth.userName || "";

  // ── Server-side state ─────────────────────────────────────────────────────
  const worldId = getOrCreatePlayerWorld(userId);
  markNPCWorldActive(worldId);
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
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Virtual World</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      background: #000; 
      overflow: hidden; 
      font-family: 'Segoe UI', sans-serif;
      touch-action: none;
      -webkit-user-select: none;
      user-select: none;
      overscroll-behavior: none;
    }
    canvas { 
      display: block;
      touch-action: none;
    }

    .hud {
      position: absolute;
      color: #fff;
      background: rgba(0,0,0,0.55);
      border-radius: 8px;
      padding: 10px 14px;
      pointer-events: none;
      user-select: none;
      border: 1px solid rgba(255,255,255,0.15);
      backdrop-filter: blur(4px);
    }

    #hud-pos {
      top: 14px; left: 14px;
      font-size: 13px;
      line-height: 1.7;
    }
    #hud-pos strong { font-size: 15px; display: block; margin-bottom: 4px; color: #a8d8ff; }

    #hud-legend {
      top: 14px; right: 14px;
      font-size: 12px;
      line-height: 1.9;
    }
    #hud-legend strong { display: block; margin-bottom: 4px; color: #a8d8ff; font-size: 13px; }
    .leg { display: flex; align-items: center; gap: 8px; }
    .leg-box {
      width: 16px; height: 16px; border-radius: 3px; flex-shrink: 0;
      border: 1px solid rgba(255,255,255,0.25);
    }

    #hud-keys {
      bottom: 14px; left: 50%; transform: translateX(-50%);
      font-size: 12px; color: #ccc; white-space: nowrap;
      text-align: center;
    }
    #hud-keys kbd {
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 11px;
      font-family: inherit;
    }

    #hud-auth-status {
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      min-width: 280px;
      max-width: min(600px, calc(100vw - 28px));
      text-align: center;
      font-size: 12px;
      line-height: 1.5;
      display: none;
      z-index: 1010;
      pointer-events: auto;
      border-color: rgba(255, 196, 112, 0.6);
      background: rgba(120, 70, 10, 0.86);
    }

    #hud-portal {
      top: 180px; right: 14px;
      pointer-events: auto;
    }
    #hud-portal .portal-buttons {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    #hud-portal button {
      background: rgba(255,130,0,0.82);
      border: 1px solid rgba(255,200,80,0.45);
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      padding: 9px 18px;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
    }
    #hud-portal button:hover { background: rgba(255,160,0,1); }
    #hud-portal button.start-world {
      background: rgba(40,120,220,0.85);
      border-color: rgba(130,190,255,0.55);
    }
    #hud-portal button.start-world:hover { background: rgba(60,150,255,1); }

    #hud-tree-actions {
      bottom: 14px; right: 14px;
      pointer-events: auto;
      display: flex;
      gap: 8px;
    }
    #hud-tree-actions button {
      font-size: 13px;
      font-weight: 600;
      padding: 9px 18px;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
      border: 1px solid rgba(255,255,255,0.3);
      color: #fff;
    }
    #btn-use {
      background: rgba(139,69,19,0.85);
      border-color: rgba(160,82,45,0.5);
    }
    #btn-use:hover { background: rgba(160,82,45,1); }
    #btn-pick {
      background: rgba(25,115,72,0.85);
      border-color: rgba(72,190,130,0.55);
    }
    #btn-pick:hover { background: rgba(32,145,92,1); }
    #btn-items {
      background: rgba(49,76,168,0.88);
      border-color: rgba(130,165,255,0.55);
    }
    #btn-items:hover { background: rgba(67,100,200,1); }

    #hud-use-picker {
      right: 14px;
      bottom: 70px;
      width: min(260px, calc(100vw - 28px));
      display: none;
      pointer-events: auto;
      z-index: 1002;
      padding: 8px;
    }
    #hud-use-picker strong {
      display: block;
      margin-bottom: 8px;
      color: #a8d8ff;
      font-size: 13px;
    }
    #use-picker-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    #use-picker-actions button {
      font-size: 12px;
      font-weight: 600;
      text-align: left;
      padding: 7px 10px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.24);
      color: #fff;
      background: rgba(255,255,255,0.12);
      cursor: pointer;
      font-family: inherit;
    }
    #use-picker-actions button:hover {
      background: rgba(255,255,255,0.2);
    }

    #hud-inventory-panel {
      right: 14px;
      bottom: 70px;
      width: min(340px, calc(100vw - 28px));
      max-height: min(52vh, 460px);
      overflow: hidden;
      display: none;
      pointer-events: auto;
      padding: 10px;
      z-index: 1001;
    }
    #hud-inventory-panel strong {
      display: block;
      margin-bottom: 8px;
      color: #a8d8ff;
      font-size: 13px;
    }
    .inv-hands {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }
    .inv-hand {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 6px;
      padding: 6px;
      font-size: 12px;
      line-height: 1.5;
    }
    .inv-hand .name {
      font-weight: 700;
      color: #d2e8ff;
    }
    .inv-actions {
      display: flex;
      gap: 6px;
      margin-top: 6px;
      flex-wrap: wrap;
    }
    .inv-actions button,
    .inv-row button,
    #btn-close-items {
      font-size: 11px;
      line-height: 1.2;
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.24);
      color: #fff;
      background: rgba(255,255,255,0.12);
      cursor: pointer;
      font-family: inherit;
    }
    .inv-actions button:hover,
    .inv-row button:hover,
    #btn-close-items:hover {
      background: rgba(255,255,255,0.2);
    }
    #inv-list {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 6px;
      max-height: min(32vh, 250px);
      overflow-y: auto;
      padding: 6px;
    }
    .inv-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 5px 4px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      font-size: 12px;
    }
    .inv-row:last-child { border-bottom: 0; }
    .inv-row .label { color: #e6f3ff; word-break: break-word; }
    #inv-footer {
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #cfdde7;
    }

    #joystick-container {
      position: absolute;
      bottom: 14px;
      left: 14px;
      width: 140px;
      height: 140px;
      pointer-events: auto;
      touch-action: auto;
      display: block; /* Always visible for debugging */
      z-index: 1000;
    }
    #joystick-base {
      position: absolute;
      width: 140px;
      height: 140px;
      background: rgba(0,0,0,0.4);
      border: 3px solid rgba(255,255,255,0.4);
      border-radius: 50%;
      backdrop-filter: blur(4px);
      touch-action: auto;
    }
    #joystick-stick {
      position: absolute;
      width: 50px;
      height: 50px;
      background: rgba(255,255,255,0.6);
      border: 2px solid rgba(255,255,255,0.8);
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      transition: all 0.1s ease-out;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    #joystick-stick.active {
      background: rgba(41,128,185,0.8);
      border-color: rgba(41,128,185,1);
    }

    /* Joystick always visible, can hide keyboard hints on touch devices */
    @media (hover: none) and (pointer: coarse) {
      #hud-keys { display: none; }
    }
  </style>
</head>
<body>
  <div class="hud" id="hud-pos">
    <strong>Virtual World</strong>
    ${authName ? `${authName}<br>` : ""}
    World: ${worldId}<br>
    Position: <span id="pos-col">${initCol}</span>, <span id="pos-row">${initRow}</span><br>
    L: <span id="held-left">-</span> | R: <span id="held-right">-</span>
  </div>

  <div class="hud" id="hud-legend">
    <strong>Legend</strong>
    <div class="leg"><div class="leg-box" style="background:#7ab648;"></div> Ground</div>
    <div class="leg"><div class="leg-box" style="background:#9e9e9e;"></div> Wall</div>
    <div class="leg"><div class="leg-box" style="background:#2d8a3e;"></div> Tree</div>
    <div class="leg"><div class="leg-box" style="background:#2980b9;"></div> You</div>
  </div>

  <div class="hud" id="hud-keys">
    Move: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> &nbsp;or&nbsp; <kbd>&uarr;</kbd><kbd>&larr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd>
    &nbsp;&nbsp;|&nbsp;&nbsp; Camera: <kbd>drag</kbd> to orbit &nbsp; <kbd>scroll</kbd> to zoom
  </div>

  <div class="hud" id="hud-auth-status" aria-live="polite"></div>

  <div class="hud" id="hud-portal">
    <div class="portal-buttons">
      <button onclick="goToNewWorld()">&#9654; New World</button>
      <button class="start-world" onclick="startWorld()">Start World</button>
    </div>
  </div>

  <div class="hud" id="hud-tree-actions">
    <button id="btn-use" onclick="useItem()">Use</button>
    <button id="btn-pick" onclick="pickItemsOnTile()">📦 Pick</button>
    <button id="btn-items" onclick="toggleInventoryPanel()">🎒 Items</button>
  </div>

  <div class="hud" id="hud-use-picker">
    <strong>Choose Action</strong>
    <div id="use-picker-actions"></div>
  </div>

  <div class="hud" id="hud-inventory-panel">
    <strong>Inventory</strong>
    <div class="inv-hands">
      <div class="inv-hand" id="inv-left-hand"></div>
      <div class="inv-hand" id="inv-right-hand"></div>
    </div>
    <div id="inv-list"></div>
    <div id="inv-footer">
      <span id="inv-count">0 items</span>
      <button id="btn-close-items" onclick="closeInventoryPanel()">Close</button>
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

    function createSessionId() {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
      return 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    }
    var sessionId = createSessionId();

    var AUTH_STATE_OK = 'ok';
    var AUTH_STATE_EXTENDING = 'extending';
    var AUTH_STATE_EXPIRED = 'expired';
    var AUTH_STATE_REDIRECTING = 'redirecting';
    var authState = AUTH_STATE_OK;
    var authProbeRetryTimer = null;
    var authProbeAttempts = 0;
    var authProbeInFlight = false;
    var authSseCheckPending = false;
    var AUTH_PROBE_MAX_ATTEMPTS = 3;
    var AUTH_LOGIN_REDIRECT_DELAY_MS = 800;

    function setAuthStatusMessage(text, isError) {
      var el = document.getElementById('hud-auth-status');
      if (!el) return;
      if (!text) {
        el.style.display = 'none';
        el.textContent = '';
        return;
      }
      el.textContent = text;
      el.style.display = 'block';
      if (isError) {
        el.style.background = 'rgba(130, 36, 26, 0.9)';
        el.style.borderColor = 'rgba(255, 120, 100, 0.7)';
      } else {
        el.style.background = 'rgba(120, 70, 10, 0.86)';
        el.style.borderColor = 'rgba(255, 196, 112, 0.6)';
      }
    }

    function loginRedirectUrl() {
      return '/auth/login?redirect=' + encodeURIComponent('/virtual-world');
    }

    function redirectToLogin() {
      if (authState === AUTH_STATE_REDIRECTING) return;
      authState = AUTH_STATE_REDIRECTING;
      setAuthStatusMessage('Session expired. Redirecting to login...', true);
      setTimeout(function() {
        window.location.href = loginRedirectUrl();
      }, AUTH_LOGIN_REDIRECT_DELAY_MS);
    }

    function handleAuthRecovery() {
      authState = AUTH_STATE_OK;
      authProbeAttempts = 0;
      if (authProbeRetryTimer) {
        clearTimeout(authProbeRetryTimer);
        authProbeRetryTimer = null;
      }
      setAuthStatusMessage('', false);
      flushMove();
    }

    function probeAuthStatus() {
      return fetch('/virtual-world/current-world', {
        method: 'GET',
        cache: 'no-store',
      }).then(function(res) {
        if (res.status === 401) return false;
        return res.ok;
      }).catch(function() {
        return false;
      });
    }

    function runAuthProbeAttempt() {
      if (authState !== AUTH_STATE_EXTENDING) return;
      if (authProbeInFlight) return;
      if (authProbeAttempts >= AUTH_PROBE_MAX_ATTEMPTS) {
        authState = AUTH_STATE_EXPIRED;
        redirectToLogin();
        return;
      }
      var delay = authProbeAttempts === 0 ? 0 : Math.min(4000, Math.pow(2, authProbeAttempts - 1) * 1000);
      authProbeRetryTimer = setTimeout(function() {
        if (authState !== AUTH_STATE_EXTENDING) return;
        authProbeInFlight = true;
        probeAuthStatus().then(function(ok) {
          authProbeInFlight = false;
          if (ok) {
            handleAuthRecovery();
            return;
          }
          authProbeAttempts += 1;
          runAuthProbeAttempt();
        }).catch(function() {
          authProbeInFlight = false;
          authProbeAttempts += 1;
          runAuthProbeAttempt();
        });
      }, delay);
    }

    function handleAuth401(source) {
      if (authState === AUTH_STATE_REDIRECTING || authState === AUTH_STATE_EXPIRED) return;
      if (authState === AUTH_STATE_EXTENDING) return;
      authState = AUTH_STATE_EXTENDING;
      authProbeAttempts = 0;
      setAuthStatusMessage('Session expired, trying to reconnect...', false);
      console.warn('Auth expired during request:', source);
      runAuthProbeAttempt();
    }

    function isAuthUnavailable() {
      return authState === AUTH_STATE_REDIRECTING || authState === AUTH_STATE_EXPIRED;
    }

    function fetchWithAuth(path, options) {
      if (isAuthUnavailable()) {
        var stoppedErr = new Error('auth_stopped');
        stoppedErr.code = 'AUTH_STOPPED';
        return Promise.reject(stoppedErr);
      }
      return fetch(path, options).then(function(res) {
        if (res.status === 401) {
          handleAuth401(path);
          var authErr = new Error('auth_401');
          authErr.code = 'AUTH_401';
          throw authErr;
        }
        return res;
      });
    }

    function fetchJsonWithAuth(path, options) {
      return fetchWithAuth(path, options).then(function(res) {
        return res.json();
      });
    }

    function scheduleSSEAuthCheck(source) {
      if (authState !== AUTH_STATE_OK || authSseCheckPending) return;
      authSseCheckPending = true;
      setTimeout(function() {
        authSseCheckPending = false;
        probeAuthStatus().then(function(ok) {
          if (!ok) handleAuth401(source);
        });
      }, 250);
    }

    function getSSEReconnectDelayMs(retryCount) {
      var capped = Math.min(retryCount, 5);
      if (authState === AUTH_STATE_EXTENDING) {
        return Math.min(10000, 1000 * Math.pow(2, capped));
      }
      return Math.min(6000, 600 * Math.pow(2, capped));
    }

    // ── Lightweight i18n for UI labels ─────────────────────────────────────
    var I18N_MESSAGES = {
      en: {
        item: {
          saw: { name: 'Saw' },
          knife: { name: 'Knife' },
          flower: { name: 'Rose' },
          tree_planter: { name: 'Tree planting spade' },
          unknown: { name: 'Unknown item' },
        },
        tree_action: {
          plant: 'Use tree planting spade (plant)',
          cut: 'Use saw (cut)',
        },
        inventory: {
          empty: 'empty',
          left_hand: 'Left Hand',
          right_hand: 'Right Hand',
          backpack_empty: 'Backpack empty',
          items_suffix: 'items',
        },
      },
      fi: {
        item: {
          saw: { name: 'Saha' },
          knife: { name: 'Veitsi' },
          flower: { name: 'Ruusu' },
          tree_planter: { name: 'Puunistutuslapio' },
          unknown: { name: 'Tuntematon esine' },
        },
        tree_action: {
          plant: 'Kayta puunistutuslapiota (istuta)',
          cut: 'Kayta sahaa (kaada)',
        },
        inventory: {
          empty: 'tyhja',
          left_hand: 'Vasen kasi',
          right_hand: 'Oikea kasi',
          backpack_empty: 'Reppu on tyhja',
          items_suffix: 'esinetta',
        },
      },
    };

    var activeLocale = null;

    function resolveLocale() {
      if (activeLocale) return activeLocale;
      var raw =
        (navigator.languages && navigator.languages.length > 0
          ? navigator.languages[0]
          : navigator.language) ||
        'en';
      var normalized = String(raw).toLowerCase();
      if (I18N_MESSAGES[normalized]) {
        activeLocale = normalized;
        return activeLocale;
      }
      var base = normalized.split('-')[0];
      activeLocale = I18N_MESSAGES[base] ? base : 'en';
      return activeLocale;
    }

    function getMessageByKey(locale, key) {
      var dict = I18N_MESSAGES[locale];
      if (!dict) return null;
      var parts = String(key || '').split('.');
      var cur = dict;
      for (var i = 0; i < parts.length; i++) {
        if (!cur || typeof cur !== 'object' || !(parts[i] in cur)) return null;
        cur = cur[parts[i]];
      }
      return typeof cur === 'string' ? cur : null;
    }

    function t(key, fallback) {
      var locale = resolveLocale();
      var localized = getMessageByKey(locale, key);
      if (localized !== null) return localized;
      var english = getMessageByKey('en', key);
      if (english !== null) return english;
      return fallback || key;
    }

    function humanizeType(type) {
      return String(type || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
    }

    function itemTypeToLabelKey(type) {
      if (type === 'saw') return 'item.saw.name';
      if (type === 'knife') return 'item.knife.name';
      if (type === 'flower') return 'item.flower.name';
      if (type === 'tree_planter') return 'item.tree_planter.name';
      return 'item.unknown.name';
    }

    // ── Dynamic tree state (client-side) ──────────────────────────────────────
    var dynamicTrees = TREE_MODS || {};
    
    // Apply tree modifications to MAP
    for (var treeKey in dynamicTrees) {
      var parts = treeKey.split('_');
      var tr = parseInt(parts[0], 10);
      var tc = parseInt(parts[1], 10);
      if (tr >= 0 && tr < 100 && tc >= 0 && tc < 100) {
        if (dynamicTrees[treeKey].action === 'plant') {
          MAP[tr][tc] = 2; // Add tree
        } else if (dynamicTrees[treeKey].action === 'cut') {
          MAP[tr][tc] = 0; // Remove tree
        }
      }
    }

    function normalizeClientInventory(inv) {
      if (!inv || typeof inv !== 'object') {
        return { left_hand: null, right_hand: null, inventory: [] };
      }
      var out = {
        left_hand: inv.left_hand && inv.left_hand.id ? inv.left_hand : null,
        right_hand: inv.right_hand && inv.right_hand.id ? inv.right_hand : null,
        inventory: Array.isArray(inv.inventory)
          ? inv.inventory.filter(function(it) { return it && it.id && it.type; })
          : [],
      };
      return out;
    }

    function normalizeClientWorldItems(items) {
      var out = {};
      if (!items || typeof items !== 'object') return out;
      for (var tileKey in items) {
        if (!Array.isArray(items[tileKey])) continue;
        var filtered = items[tileKey].filter(function(it) {
          return it && it.id && it.type;
        });
        if (filtered.length > 0) out[tileKey] = filtered;
      }
      return out;
    }

    var worldItemsByTile = normalizeClientWorldItems(WORLD_ITEMS || {});
    var playerInventory = normalizeClientInventory(PLAYER_INV);
    var inventoryPanelVisible = false;
    var inventoryAutoHideTimer = null;
    var usePickerVisible = false;

    function treeActionForItemType(type) {
      if (type === 'tree_planter') return 'plant';
      if (type === 'saw') return 'cut';
      return '';
    }

    function treeActionLabel(action) {
      if (action === 'plant') {
        return t('tree_action.plant', 'Use tree planting spade (plant)');
      }
      if (action === 'cut') {
        return t('tree_action.cut', 'Use saw (cut)');
      }
      return action;
    }

    function getOwnedTreeActions() {
      var actionsByType = {};
      var inv = normalizeClientInventory(playerInventory);
      var all = [];
      if (inv.left_hand) all.push(inv.left_hand);
      if (inv.right_hand) all.push(inv.right_hand);
      if (Array.isArray(inv.inventory)) {
        for (var i = 0; i < inv.inventory.length; i++) all.push(inv.inventory[i]);
      }
      for (var j = 0; j < all.length; j++) {
        var action = treeActionForItemType(all[j] && all[j].type);
        if (!action) continue;
        actionsByType[action] = true;
      }
      return Object.keys(actionsByType);
    }

    function closeUsePicker() {
      usePickerVisible = false;
      document.getElementById('hud-use-picker').style.display = 'none';
      document.getElementById('use-picker-actions').innerHTML = '';
    }

    function updateUseButtonState() {
      var btn = document.getElementById('btn-use');
      if (!btn) return;
      var actions = getOwnedTreeActions();
      if (actions.length === 0) {
        btn.disabled = true;
        btn.style.opacity = '0.45';
      } else {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
      if (actions.length < 2) closeUsePicker();
    }

    function openUsePicker(actions) {
      var container = document.getElementById('use-picker-actions');
      container.innerHTML = '';
      for (var i = 0; i < actions.length; i++) {
        var action = actions[i];
        var btn = document.createElement('button');
        btn.textContent = treeActionLabel(action);
        btn.onclick = (function(a) {
          return function() {
            closeUsePicker();
            postTreeAction(a);
          };
        })(action);
        container.appendChild(btn);
      }
      usePickerVisible = true;
      document.getElementById('hud-use-picker').style.display = 'block';
    }

    function inventoryItemLabel(item) {
      if (!item || !item.type) return t('inventory.empty', 'empty');
      var type = String(item.type);
      return t(itemTypeToLabelKey(type), humanizeType(type));
    }

    function updateHeldHud() {
      document.getElementById('held-left').textContent =
        playerInventory.left_hand ? inventoryItemLabel(playerInventory.left_hand) : '-';
      document.getElementById('held-right').textContent =
        playerInventory.right_hand ? inventoryItemLabel(playerInventory.right_hand) : '-';
      updateUseButtonState();
    }

    // ── Constants ─────────────────────────────────────────────────────────────
    var ROWS = 100;
    var COLS = 100;
    var TILE = 2;            // world units per tile
    var MOVE_INTERVAL = 160; // ms between steps
    var MAX_PENDING_MOVES = 40;

    var avatarRow = ${initRow};
    var avatarCol = ${initCol};
    var targetX = avatarCol * TILE + TILE / 2;
    var targetZ = avatarRow * TILE + TILE / 2;
    var moveSeq = ${initSeq};  // last confirmed server sequence number
    var lastAssignedSeq = ${initSeq};  // last seq assigned to any move (queued or in-flight)

    // ── Renderer ─────────────────────────────────────────────────────────────
    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // ── Scene ────────────────────────────────────────────────────────────────
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.018);

    // ── Camera ───────────────────────────────────────────────────────────────
    var mapCX = (COLS * TILE) / 2;
    var mapCZ = (ROWS * TILE) / 2;
    var camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 300);

    // Camera orbit state (spherical coordinates around map centre)
    var camR     = 50;           // distance
    var camTheta = Math.PI / 4;  // azimuth (horizontal rotation)
    var camPhi   = 0.67;         // elevation above horizontal (radians)

    function updateCamera() {
      var ax = avatar.position.x;
      var az = avatar.position.z;
      camera.position.set(
        ax + camR * Math.cos(camPhi) * Math.sin(camTheta),
        camR * Math.sin(camPhi),
        az + camR * Math.cos(camPhi) * Math.cos(camTheta)
      );
      camera.lookAt(ax, 0, az);
    }
    // Seed initial camera position using spawn coords (avatar not yet created here)
    camera.position.set(
      targetX + camR * Math.cos(camPhi) * Math.sin(camTheta),
      camR * Math.sin(camPhi),
      targetZ + camR * Math.cos(camPhi) * Math.cos(camTheta)
    );
    camera.lookAt(targetX, 0, targetZ);

    // ── Lighting ─────────────────────────────────────────────────────────────
    var ambient = new THREE.AmbientLight(0xfff8e7, 0.55);
    scene.add(ambient);

    var sun = new THREE.DirectionalLight(0xffe8c0, 1.0);
    sun.position.set(-12, 22, -8);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    scene.add(sun.target); // must be in scene for target.position updates to take effect

    // Secondary fill light from the opposite side
    var fill = new THREE.DirectionalLight(0xc8e8ff, 0.3);
    fill.position.set(14, 10, 14);
    scene.add(fill);
    scene.add(fill.target);

    // ── Large background ground plane ─────────────────────────────────────────
    var bgGeo = new THREE.PlaneGeometry(800, 800);
    var bgMat = new THREE.MeshLambertMaterial({ color: 0x4a7028 });
    var bgPlane = new THREE.Mesh(bgGeo, bgMat);
    bgPlane.rotation.x = -Math.PI / 2;
    bgPlane.position.set(mapCX, -0.26, mapCZ);
    bgPlane.receiveShadow = true;
    scene.add(bgPlane);

    // ── Reusable geometries and materials ────────────────────────────────────
    var geoGround = new THREE.BoxGeometry(TILE, 0.25, TILE);
    var matGroundA = new THREE.MeshLambertMaterial({ color: 0x7ab648 });
    var matGroundB = new THREE.MeshLambertMaterial({ color: 0x6da040 });

    var geoWall = new THREE.BoxGeometry(TILE, 1.7, TILE);
    var matWallSides = new THREE.MeshLambertMaterial({ color: 0x9e9e9e });
    var matWallTop  = new THREE.MeshLambertMaterial({ color: 0xc8c8c8 });
    // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
    var matWall = [matWallSides, matWallSides, matWallTop, matWallSides, matWallSides, matWallSides];

    var geoTrunk = new THREE.BoxGeometry(0.28, 0.9, 0.28);
    var matTrunk = new THREE.MeshLambertMaterial({ color: 0x7d4f2a });

    var geoFoliage1 = new THREE.BoxGeometry(1.1, 0.85, 1.1);
    var geoFoliage2 = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    var matFoliage1 = new THREE.MeshLambertMaterial({ color: 0x2d8a3e });
    var matFoliage2 = new THREE.MeshLambertMaterial({ color: 0x3dba4e });

    // ── Build tiles with InstancedMesh (efficient for large worlds) ────────────
    function tileX(col) { return col * TILE + TILE / 2; }
    function tileZ(row) { return row * TILE + TILE / 2; }

    var dummy = new THREE.Object3D();
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);

    // Count instances
    var cntA = 0, cntB = 0, cntWall = 0, cntTree = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if ((r + c) % 2 === 0) cntA++; else cntB++;
        if (MAP[r][c] === 1) cntWall++;
        if (MAP[r][c] === 2) cntTree++;
      }
    }

    var iGroundA  = new THREE.InstancedMesh(geoGround,   matGroundA,  cntA);
    var iGroundB  = new THREE.InstancedMesh(geoGround,   matGroundB,  cntB);
    var iWall     = new THREE.InstancedMesh(geoWall,     matWall,     cntWall);
    var iTrunk    = new THREE.InstancedMesh(geoTrunk,    matTrunk,    cntTree);
    var iFoliage1 = new THREE.InstancedMesh(geoFoliage1, matFoliage1, cntTree);
    var iFoliage2 = new THREE.InstancedMesh(geoFoliage2, matFoliage2, cntTree);

    iGroundA.receiveShadow = true;
    iGroundB.receiveShadow = true;
    iWall.castShadow = true;     iWall.receiveShadow = true;
    iTrunk.castShadow = true;    iFoliage1.castShadow = true;    iFoliage2.castShadow = true;

    var idxA = 0, idxB = 0, idxW = 0, idxT = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var tx = tileX(c), tz = tileZ(r);

        dummy.position.set(tx, -0.125, tz);
        dummy.updateMatrix();
        if ((r + c) % 2 === 0) iGroundA.setMatrixAt(idxA++, dummy.matrix);
        else                    iGroundB.setMatrixAt(idxB++, dummy.matrix);

        if (MAP[r][c] === 1) {
          dummy.position.set(tx, 0.85, tz);
          dummy.updateMatrix();
          iWall.setMatrixAt(idxW++, dummy.matrix);
        } else if (MAP[r][c] === 2) {
          dummy.position.set(tx, 0.45,  tz); dummy.updateMatrix(); iTrunk.setMatrixAt(idxT, dummy.matrix);
          dummy.position.set(tx, 1.1,   tz); dummy.updateMatrix(); iFoliage1.setMatrixAt(idxT, dummy.matrix);
          dummy.position.set(tx, 1.78,  tz); dummy.updateMatrix(); iFoliage2.setMatrixAt(idxT, dummy.matrix);
          idxT++;
        }
      }
    }

    iGroundA.instanceMatrix.needsUpdate  = true;
    iGroundB.instanceMatrix.needsUpdate  = true;
    iWall.instanceMatrix.needsUpdate     = true;
    iTrunk.instanceMatrix.needsUpdate    = true;
    iFoliage1.instanceMatrix.needsUpdate = true;
    iFoliage2.instanceMatrix.needsUpdate = true;

    scene.add(iGroundA, iGroundB, iWall, iTrunk, iFoliage1, iFoliage2);

    // ── Function to rebuild tree instances after tree modifications ───────────
    function updateTreeInstances() {
      // Remove old tree meshes from scene
      scene.remove(iTrunk, iFoliage1, iFoliage2);
      
      // Dispose of old meshes to free memory
      iTrunk.dispose();
      iFoliage1.dispose();
      iFoliage2.dispose();
      
      // Count trees in current MAP state
      var newTreeCount = 0;
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          if (MAP[r][c] === 2) newTreeCount++;
        }
      }
      
      // Create new tree instances
      iTrunk    = new THREE.InstancedMesh(geoTrunk,    matTrunk,    newTreeCount);
      iFoliage1 = new THREE.InstancedMesh(geoFoliage1, matFoliage1, newTreeCount);
      iFoliage2 = new THREE.InstancedMesh(geoFoliage2, matFoliage2, newTreeCount);
      
      iTrunk.castShadow = true;
      iFoliage1.castShadow = true;
      iFoliage2.castShadow = true;
      
      // Populate tree instances
      var treeIdx = 0;
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          if (MAP[r][c] === 2) {
            var tx = tileX(c), tz = tileZ(r);
            dummy.position.set(tx, 0.45,  tz); dummy.updateMatrix(); iTrunk.setMatrixAt(treeIdx, dummy.matrix);
            dummy.position.set(tx, 1.1,   tz); dummy.updateMatrix(); iFoliage1.setMatrixAt(treeIdx, dummy.matrix);
            dummy.position.set(tx, 1.78,  tz); dummy.updateMatrix(); iFoliage2.setMatrixAt(treeIdx, dummy.matrix);
            treeIdx++;
          }
        }
      }
      
      iTrunk.instanceMatrix.needsUpdate    = true;
      iFoliage1.instanceMatrix.needsUpdate = true;
      iFoliage2.instanceMatrix.needsUpdate = true;
      
      // Add new tree meshes to scene
      scene.add(iTrunk, iFoliage1, iFoliage2);
    }

    // ── Ground items (MVP visuals) ─────────────────────────────────────────
    var itemGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
    var itemMatCache = {};
    var itemMeshGroup = new THREE.Group();
    scene.add(itemMeshGroup);

    function itemTypeColor(type) {
      if (type === 'saw') return 0xbfc6d0;
      if (type === 'knife') return 0xd8dee8;
      if (type === 'flower') return 0xec6ea4;
      if (type === 'tree_planter') return 0x54d08a;
      return 0xf3ca40;
    }

    function getItemMaterial(type) {
      if (!itemMatCache[type]) {
        itemMatCache[type] = new THREE.MeshLambertMaterial({ color: itemTypeColor(type) });
      }
      return itemMatCache[type];
    }

    function clearItemMeshes() {
      while (itemMeshGroup.children.length > 0) {
        var child = itemMeshGroup.children.pop();
        if (child) itemMeshGroup.remove(child);
      }
    }

    function rebuildItemMeshes() {
      clearItemMeshes();
      for (var tileKey in worldItemsByTile) {
        var parts = tileKey.split('_');
        var row = Number(parts[0]);
        var col = Number(parts[1]);
        if (!isFinite(row) || !isFinite(col)) continue;
        var arr = worldItemsByTile[tileKey];
        if (!Array.isArray(arr)) continue;
        for (var i = 0; i < arr.length; i++) {
          var item = arr[i];
          var mesh = new THREE.Mesh(itemGeo, getItemMaterial(item.type));
          var ox = ((i % 3) - 1) * 0.20;
          var oz = (Math.floor(i / 3) % 3 - 1) * 0.20;
          var oy = 0.20 + Math.floor(i / 9) * 0.16;
          mesh.position.set(tileX(col) + ox, oy, tileZ(row) + oz);
          mesh.castShadow = true;
          mesh.receiveShadow = false;
          itemMeshGroup.add(mesh);
        }
      }
    }

    rebuildItemMeshes();

    // ── Avatar ───────────────────────────────────────────────────────────────
    var avatar = new THREE.Group();

    function makePart(w, h, d, color, px, py, pz) {
      var geo = new THREE.BoxGeometry(w, h, d);
      var mat = new THREE.MeshLambertMaterial({ color: color });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      return mesh;
    }

    // Legs
    avatar.add(makePart(0.20, 0.35, 0.22, 0x1a252f, -0.14, 0.175, 0));
    avatar.add(makePart(0.20, 0.35, 0.22, 0x1a252f,  0.14, 0.175, 0));
    // Body
    avatar.add(makePart(0.55, 0.65, 0.40, 0x2980b9, 0, 0.525, 0));
    // Head
    avatar.add(makePart(0.45, 0.45, 0.45, 0xf4c78c, 0, 0.975, 0));
    // Eyes (on +Z face of head)
    avatar.add(makePart(0.09, 0.09, 0.06, 0x222222, -0.11, 0.995, 0.225));
    avatar.add(makePart(0.09, 0.09, 0.06, 0x222222,  0.11, 0.995, 0.225));

    avatar.position.set(targetX, 0, targetZ);
    avatar.rotation.y = ${initRotation};
    scene.add(avatar);

    // ── Target indicator (shows where tree actions will occur) ───────────────
    var targetIndicatorGeo = new THREE.BoxGeometry(TILE * 0.9, 0.3, TILE * 0.9);
    var targetIndicatorMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    var targetIndicator = new THREE.Mesh(targetIndicatorGeo, targetIndicatorMat);
    targetIndicator.position.set(targetX, 0.15, targetZ);
    scene.add(targetIndicator);

    // ── Remote players ───────────────────────────────────────────────────────
    var remoteAvatars = {}; // { pid: { group, targetX, targetZ, targetRot, seq } }
    var npcAvatars = {}; // { npcId: { group, targetX, targetZ, targetRot, seq } }

    function avatarBodyColor(pid) {
      var h = 0;
      for (var i = 0; i < pid.length; i++) h = (Math.imul(31, h) + pid.charCodeAt(i)) | 0;
      var hue = (h >>> 0) % 360;
      // Shift away from ~200-240 (local avatar blue)
      if (hue >= 200 && hue <= 240) hue = (hue + 80) % 360;
      return new THREE.Color('hsl(' + hue + ',70%,55%)');
    }

    function makeRemoteAvatar(pid) {
      var g = new THREE.Group();
      function rp(w, h, d, color, px, py, pz) {
        var mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color: color })
        );
        mesh.position.set(px, py, pz);
        mesh.castShadow = true;
        return mesh;
      }
      var bc = avatarBodyColor(pid);
      g.add(rp(0.20, 0.35, 0.22, 0x1a252f, -0.14, 0.175, 0));
      g.add(rp(0.20, 0.35, 0.22, 0x1a252f,  0.14, 0.175, 0));
      g.add(rp(0.55, 0.65, 0.40, bc,         0,   0.525, 0));
      g.add(rp(0.45, 0.45, 0.45, 0xf4c78c,   0,   0.975, 0));
      g.add(rp(0.09, 0.09, 0.06, 0x222222, -0.11, 0.995, 0.225));
      g.add(rp(0.09, 0.09, 0.06, 0x222222,  0.11, 0.995, 0.225));
      return g;
    }

    function upsertRemoteAvatar(pid, row, col, seq, rotation) {
      if (pid === playerId) return;
      var tx = tileX(col), tz = tileZ(row);
      var incomingRot = Number(rotation);
      var hasIncomingRot = isFinite(incomingRot);
      var incomingSeq = (seq !== undefined && seq !== null) ? Number(seq) : null;
      if (incomingSeq !== null && !isFinite(incomingSeq)) incomingSeq = null;
      if (!remoteAvatars[pid]) {
        var g = makeRemoteAvatar(pid);
        g.position.set(tx, 0, tz);
        g.rotation.y = hasIncomingRot ? incomingRot : 0;
        scene.add(g);
        remoteAvatars[pid] = {
          group: g,
          targetX: tx,
          targetZ: tz,
          targetRot: hasIncomingRot ? incomingRot : 0,
          seq: incomingSeq !== null ? incomingSeq : 0,
        };
      } else {
        var knownSeq = Number(remoteAvatars[pid].seq || 0);
        if (incomingSeq !== null && incomingSeq <= knownSeq) return;
        remoteAvatars[pid].targetX = tx;
        remoteAvatars[pid].targetZ = tz;
        if (hasIncomingRot) remoteAvatars[pid].targetRot = incomingRot;
        if (incomingSeq !== null) remoteAvatars[pid].seq = incomingSeq;
      }
    }

    function removeRemoteAvatar(pid) {
      if (remoteAvatars[pid]) {
        scene.remove(remoteAvatars[pid].group);
        delete remoteAvatars[pid];
      }
    }

    function npcBodyColor(npcId) {
      var h = 0;
      for (var i = 0; i < npcId.length; i++) {
        h = (Math.imul(31, h) + npcId.charCodeAt(i)) | 0;
      }
      var hue = 25 + ((h >>> 0) % 80);
      return new THREE.Color('hsl(' + hue + ',65%,52%)');
    }

    function makeNPCAvatar(npcId) {
      var g = new THREE.Group();
      function np(w, h, d, color, px, py, pz) {
        var mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color: color })
        );
        mesh.position.set(px, py, pz);
        mesh.castShadow = true;
        return mesh;
      }
      var bc = npcBodyColor(npcId);
      g.add(np(0.20, 0.35, 0.22, 0x5c4033, -0.14, 0.175, 0));
      g.add(np(0.20, 0.35, 0.22, 0x5c4033,  0.14, 0.175, 0));
      g.add(np(0.55, 0.65, 0.40, bc,         0,   0.525, 0));
      g.add(np(0.45, 0.45, 0.45, 0xd9b38c,   0,   0.975, 0));
      g.add(np(0.09, 0.09, 0.06, 0x222222, -0.11, 0.995, 0.225));
      g.add(np(0.09, 0.09, 0.06, 0x222222,  0.11, 0.995, 0.225));
      return g;
    }

    function upsertNPCAvatar(npcId, row, col, seq, rotation) {
      if (!npcId || !isFinite(Number(row)) || !isFinite(Number(col))) return;
      var tx = tileX(Number(col));
      var tz = tileZ(Number(row));
      var incomingRot = Number(rotation);
      var hasIncomingRot = isFinite(incomingRot);
      var incomingSeq = (seq !== undefined && seq !== null) ? Number(seq) : null;
      if (incomingSeq !== null && !isFinite(incomingSeq)) incomingSeq = null;

      if (!npcAvatars[npcId]) {
        var g = makeNPCAvatar(npcId);
        g.position.set(tx, 0, tz);
        g.rotation.y = hasIncomingRot ? incomingRot : 0;
        scene.add(g);
        npcAvatars[npcId] = {
          group: g,
          targetX: tx,
          targetZ: tz,
          targetRot: hasIncomingRot ? incomingRot : 0,
          seq: incomingSeq !== null ? incomingSeq : 0,
        };
      } else {
        var knownSeq = Number(npcAvatars[npcId].seq || 0);
        if (incomingSeq !== null && incomingSeq <= knownSeq) return;
        npcAvatars[npcId].targetX = tx;
        npcAvatars[npcId].targetZ = tz;
        if (hasIncomingRot) npcAvatars[npcId].targetRot = incomingRot;
        if (incomingSeq !== null) npcAvatars[npcId].seq = incomingSeq;
      }
    }

    function removeNPCAvatar(npcId) {
      if (npcAvatars[npcId]) {
        scene.remove(npcAvatars[npcId].group);
        delete npcAvatars[npcId];
      }
    }

    function syncNPCSnapshot(npcs) {
      if (!Array.isArray(npcs)) return;
      var seen = {};
      for (var i = 0; i < npcs.length; i++) {
        var n = npcs[i];
        if (!n || typeof n.npc_id !== 'string') continue;
        seen[n.npc_id] = true;
        upsertNPCAvatar(n.npc_id, n.row, n.col, n.seq, n.rotation);
      }
      for (var npcId in npcAvatars) {
        if (!seen[npcId]) removeNPCAvatar(npcId);
      }
    }

    function fetchNPCSnapshot() {
      if (authState !== AUTH_STATE_OK) return;
      fetchJsonWithAuth('/virtual-world/npcs')
        .then(function(npcs) {
          syncNPCSnapshot(npcs);
        }).catch(function(err) {
          if (err && (err.code === 'AUTH_401' || err.code === 'AUTH_STOPPED')) return;
        });
    }

    function fetchItemSnapshot() {
      if (authState !== AUTH_STATE_OK) return;
      fetchJsonWithAuth('/virtual-world/current-world')
        .then(function(payload) {
          if (!payload || typeof payload !== 'object') return;
          if (payload.inventory) {
            playerInventory = normalizeClientInventory(payload.inventory);
          }
          if (Array.isArray(payload.items)) {
            var next = {};
            for (var i = 0; i < payload.items.length; i++) {
              var it = payload.items[i];
              if (!it || !it.id || !it.type) continue;
              var key = it.row + '_' + it.col;
              if (!next[key]) next[key] = [];
              next[key].push({ id: it.id, type: it.type });
            }
            worldItemsByTile = next;
          }
          rebuildItemMeshes();
          updateHeldHud();
          if (inventoryPanelVisible) renderInventoryPanel();
        }).catch(function(err) {
          if (err && (err.code === 'AUTH_401' || err.code === 'AUTH_STOPPED')) return;
        });
    }

    var pendingMoves = [];   // FIFO queue of {row,col,seq} — one entry per step
    var moveInFlight = false;

    function flushMove() {
      if (authState !== AUTH_STATE_OK) return;
      if (moveInFlight || pendingMoves.length === 0) return;
      var payload = pendingMoves.shift();
      moveInFlight = true;
      fetchWithAuth('/virtual-world/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // world_id and player_id are determined server-side from auth session
        body: JSON.stringify({
          fromRow: payload.fromRow,
          fromCol: payload.fromCol,
          toRow: payload.toRow,
          toCol: payload.toCol,
          rotation: payload.rotation,
          seq: payload.seq,
          session_id: sessionId,
        })
      }).then(function(res) { return res.json(); }).then(function(result) {
        moveInFlight = false;
        if (!result.ok) {
          if (result.stale) {
            // Another tab took over — our queued moves are based on an old seq.
            // Reconcile to server canonical state, then discard queue.
            if (typeof result.row === 'number' && typeof result.col === 'number') {
              avatarRow = result.row;
              avatarCol = result.col;
              targetX = tileX(avatarCol);
              targetZ = tileZ(avatarRow);
              document.getElementById('pos-col').textContent = avatarCol;
              document.getElementById('pos-row').textContent = avatarRow;
            }
            if (typeof result.seq === 'number' && isFinite(result.seq)) {
              moveSeq = result.seq;
              lastAssignedSeq = result.seq;
            }
            pendingMoves = [];
          } else {
            // Server rejected the move (wall/bounds) — rebuild the queue by extracting
            // the movement delta from each queued move and reapplying from the corrected position.
            // This preserves the user's intended movement direction.
            var lastPos = { row: result.row, col: result.col };
            for (var i = 0; i < pendingMoves.length; i++) {
              // Extract the intended movement direction (delta) from the original move
              var deltaRow = pendingMoves[i].toRow - pendingMoves[i].fromRow;
              var deltaCol = pendingMoves[i].toCol - pendingMoves[i].fromCol;
              
              // Reapply the delta from the corrected position
              pendingMoves[i].fromRow = lastPos.row;
              pendingMoves[i].fromCol = lastPos.col;
              pendingMoves[i].toRow = lastPos.row + deltaRow;
              pendingMoves[i].toCol = lastPos.col + deltaCol;
              
              lastPos = { row: pendingMoves[i].toRow, col: pendingMoves[i].toCol };
            }
            
            // Update client state to match the end of the rebuilt queue for smooth continuation
            avatarRow = lastPos.row;
            avatarCol = lastPos.col;
            targetX = tileX(avatarCol);
            targetZ = tileZ(avatarRow);
            document.getElementById('pos-col').textContent = avatarCol;
            document.getElementById('pos-row').textContent = avatarRow;
          }
        } else {
          // Confirmed — update the last confirmed server sequence number.
          // Only update if this response is newer than what we've already confirmed.
          // This prevents late responses from moving moveSeq backwards.
          if (result.seq > moveSeq) {
            moveSeq = result.seq;
          }
        }
        flushMove(); // drain next step if any
      }).catch(function(err) {
        moveInFlight = false;
        if (err && (err.code === 'AUTH_401' || err.code === 'AUTH_STOPPED')) {
          pendingMoves.unshift(payload);
          return;
        }
        // Put the failed step back at the front and retry after 500 ms
        pendingMoves.unshift(payload);
        setTimeout(flushMove, 500);
      });
    }

    function postMove(fromRow, fromCol, toRow, toCol, rotation) {
      // Each optimistic step gets the next expected seq number.
      // Never silently drop steps: if queue is full, caller must not move locally.
      if (pendingMoves.length >= MAX_PENDING_MOVES) return false;
      // Assign the next sequence number and track it separately from moveSeq.
      // This ensures every move gets a unique seq even when moves are queued
      // while previous moves are in-flight (before server confirms them).
      var nextSeq = lastAssignedSeq + 1;
      lastAssignedSeq = nextSeq;
      pendingMoves.push({
        fromRow: fromRow,
        fromCol: fromCol,
        toRow: toRow,
        toCol: toCol,
        rotation: rotation,
        seq: nextSeq,
      });
      flushMove();
      return true;
    }

    function postLeave() {
      // world_id and player_id are determined server-side from auth session
      navigator.sendBeacon('/virtual-world/leave',
        new Blob(['{}'], { type: 'application/json' }));
    }

    function fetchSnapshot() {
      if (authState !== AUTH_STATE_OK) return;
      fetchJsonWithAuth('/virtual-world/players')
        .then(function(players) {
          players.forEach(function(p) {
            if (p.player_id === playerId) {
              var snapSeq = Number(p.seq || 0);
              // Snapshot healing for same-user tabs when SSE is delayed/flaky.
              // Only accept snapshot if we're idle AND it's not stale (older than our current state).
              if (!moveInFlight && pendingMoves.length === 0 && snapSeq >= moveSeq) {
                avatarRow = p.row;
                avatarCol = p.col;
                targetX = tileX(avatarCol);
                targetZ = tileZ(avatarRow);
                if (isFinite(Number(p.rotation))) {
                  avatar.rotation.y = Number(p.rotation);
                }
                moveSeq = snapSeq;
                lastAssignedSeq = snapSeq;
                document.getElementById('pos-col').textContent = avatarCol;
                document.getElementById('pos-row').textContent = avatarRow;
              }
            } else {
              upsertRemoteAvatar(p.player_id, p.row, p.col, p.seq, p.rotation);
            }
          });
        }).catch(function(err) {
          if (err && (err.code === 'AUTH_401' || err.code === 'AUTH_STOPPED')) return;
        });
    }

    function ensureCurrentWorld() {
      if (authState !== AUTH_STATE_OK) return;
      fetchJsonWithAuth('/virtual-world/current-world')
        .then(function(state) {
          if (state && state.world_id && String(state.world_id) !== String(worldId)) {
            window.location.href = '/virtual-world';
          }
        }).catch(function(err) {
          if (err && (err.code === 'AUTH_401' || err.code === 'AUTH_STOPPED')) return;
        });
    }

    function initMultiplayer() {
      updateHeldHud();
      renderInventoryPanel();
      fetchSnapshot();
      syncNPCSnapshot(NPCS);
      fetchNPCSnapshot();
      fetchItemSnapshot();

      // Subscribe to real-time moves via GraphQL SSE
      // world_id is resolved server-side from the authenticated user's current world
      var query = 'subscription{worldPlayerMoved}';
      var sseUrl = '/graphql/sse?query=' + encodeURIComponent(query);
      var reconnectTimer = null;
      var sseRetryCount = 0;

      function openSSE() {
        var es = new EventSource(sseUrl);
        es.onmessage = function(evt) {
          sseRetryCount = 0;
          try {
            var obj = JSON.parse(evt.data);
            var raw = obj.data.worldPlayerMoved;
            var payload = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            if (payload.leaving) {
              if (payload.player_id === playerId && payload.switched_world) {
                window.location.href = '/virtual-world';
                return;
              }
              removeRemoteAvatar(payload.player_id);
            } else if (payload.player_id === playerId) {
              var incomingSeq = Number(payload.seq);
              var hasIncomingSeq = isFinite(incomingSeq);
              // Another tab moved us — sync local state ONLY when this tab has
              // no moves in flight or queued. If we are in the middle of
              // optimistic prediction, applying an SSE for an older step would
              // snap the position back and cause the very jump we want to fix.
              // Idle tabs (no moves queued) always accept the update, so they
              // are ready with the correct position when the user switches to them.
              if (!moveInFlight && pendingMoves.length === 0) {
                // CRITICAL: Only accept SSE updates that are newer or equal to our current state.
                // This prevents late-arriving SSE notifications from snapping us back to old positions
                // after we've already moved further ahead (e.g., during rapid WASD movement).
                if (!hasIncomingSeq || incomingSeq >= moveSeq) {
                  avatarRow = payload.row;
                  avatarCol = payload.col;
                  targetX = tileX(avatarCol);
                  targetZ = tileZ(avatarRow);
                  if (isFinite(Number(payload.rotation))) {
                    avatar.rotation.y = Number(payload.rotation);
                  }
                  if (hasIncomingSeq) {
                    moveSeq = incomingSeq;
                    lastAssignedSeq = incomingSeq;
                  }
                  document.getElementById('pos-col').textContent = avatarCol;
                  document.getElementById('pos-row').textContent = avatarRow;
                }
              }
            } else {
              upsertRemoteAvatar(
                payload.player_id,
                payload.row,
                payload.col,
                payload.seq,
                payload.rotation,
              );
            }
          } catch(e) {}
        };
        es.onerror = function() {
          es.close();
          scheduleSSEAuthCheck('worldPlayerMoved');
          if (authState === AUTH_STATE_EXPIRED || authState === AUTH_STATE_REDIRECTING) return;
          // Immediate healing snapshot, then short reconnect retry.
          if (reconnectTimer) clearTimeout(reconnectTimer);
          fetchSnapshot();
          sseRetryCount += 1;
          reconnectTimer = setTimeout(openSSE, getSSEReconnectDelayMs(sseRetryCount));
        };
        return es;
      }

      openSSE();

      // Subscribe to tree changes via GraphQL SSE
      var treeQuery = 'subscription{worldTreeChanged}';
      var treeSseUrl = '/graphql/sse?query=' + encodeURIComponent(treeQuery);
      var treeReconnectTimer = null;
      var treeRetryCount = 0;

      function openTreeSSE() {
        var treeEs = new EventSource(treeSseUrl);
        treeEs.onmessage = function(evt) {
          treeRetryCount = 0;
          try {
            var obj = JSON.parse(evt.data);
            var raw = obj.data.worldTreeChanged;
            var payload = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            
            var treeKey = payload.row + '_' + payload.col;
            var actorType = payload.actor_type || 'player';
            var actorId = payload.actor_id || payload.player_id || '';
            
            if (payload.action === 'plant') {
              MAP[payload.row][payload.col] = 2;
              dynamicTrees[treeKey] = {
                action: 'plant',
                actor_type: actorType,
                actor_id: actorId,
              };
            } else if (payload.action === 'cut') {
              MAP[payload.row][payload.col] = 0;
              dynamicTrees[treeKey] = {
                action: 'cut',
                actor_type: actorType,
                actor_id: actorId,
              };
            }
            
            updateTreeInstances();
          } catch(e) {
            console.error('Tree SSE parse error:', e);
          }
        };
        treeEs.onerror = function() {
          treeEs.close();
          scheduleSSEAuthCheck('worldTreeChanged');
          if (authState === AUTH_STATE_EXPIRED || authState === AUTH_STATE_REDIRECTING) return;
          if (treeReconnectTimer) clearTimeout(treeReconnectTimer);
          treeRetryCount += 1;
          treeReconnectTimer = setTimeout(openTreeSSE, getSSEReconnectDelayMs(treeRetryCount));
        };
        return treeEs;
      }

      openTreeSSE();

      // Subscribe to NPC movement via GraphQL SSE
      var npcQuery = 'subscription{worldNPCMoved}';
      var npcSseUrl = '/graphql/sse?query=' + encodeURIComponent(npcQuery);
      var npcReconnectTimer = null;
      var npcRetryCount = 0;

      function openNPCSSE() {
        var npcEs = new EventSource(npcSseUrl);
        npcEs.onmessage = function(evt) {
          npcRetryCount = 0;
          try {
            var obj = JSON.parse(evt.data);
            var raw = obj.data.worldNPCMoved;
            var payload = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            if (!payload || typeof payload.npc_id !== 'string') return;
            if (payload.despawn) {
              removeNPCAvatar(payload.npc_id);
            } else {
              upsertNPCAvatar(
                payload.npc_id,
                payload.row,
                payload.col,
                payload.seq,
                payload.rotation,
              );
            }
          } catch (e) {}
        };
        npcEs.onerror = function() {
          npcEs.close();
          scheduleSSEAuthCheck('worldNPCMoved');
          if (authState === AUTH_STATE_EXPIRED || authState === AUTH_STATE_REDIRECTING) return;
          if (npcReconnectTimer) clearTimeout(npcReconnectTimer);
          fetchNPCSnapshot();
          npcRetryCount += 1;
          npcReconnectTimer = setTimeout(openNPCSSE, getSSEReconnectDelayMs(npcRetryCount));
        };
        return npcEs;
      }

      openNPCSSE();

      // Subscribe to item changes via GraphQL SSE
      var itemQuery = 'subscription{worldItemChanged}';
      var itemSseUrl = '/graphql/sse?query=' + encodeURIComponent(itemQuery);
      var itemReconnectTimer = null;
      var itemRetryCount = 0;

      function openItemSSE() {
        var itemEs = new EventSource(itemSseUrl);
        itemEs.onmessage = function(_evt) {
          itemRetryCount = 0;
          // Keep item sync authoritative by reloading snapshot on each event.
          fetchItemSnapshot();
        };
        itemEs.onerror = function() {
          itemEs.close();
          scheduleSSEAuthCheck('worldItemChanged');
          if (authState === AUTH_STATE_EXPIRED || authState === AUTH_STATE_REDIRECTING) return;
          if (itemReconnectTimer) clearTimeout(itemReconnectTimer);
          fetchItemSnapshot();
          itemRetryCount += 1;
          itemReconnectTimer = setTimeout(openItemSSE, getSSEReconnectDelayMs(itemRetryCount));
        };
        return itemEs;
      }

      openItemSSE();

      // Announce departure
      window.addEventListener('beforeunload', postLeave);

      // Heartbeat — keep presence alive and resync snapshot every 15 s
      setInterval(function() {
        if (authState !== AUTH_STATE_OK) return;
        // Use dedicated heartbeat endpoint: only refreshes the presence TTL
        // without sending a position, so idle tabs can't overwrite a moving tab.
        fetchWithAuth('/virtual-world/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        }).catch(function(err) {
          if (err && (err.code === 'AUTH_401' || err.code === 'AUTH_STOPPED')) return;
        });
        ensureCurrentWorld();
        fetchSnapshot();
        fetchNPCSnapshot();
        fetchItemSnapshot();
      }, 5000);
    }

    // ── Collision & movement ─────────────────────────────────────────────────
    function isWalkable(r, c) {
      return r >= 0 && r < ROWS && c >= 0 && c < COLS && MAP[r][c] === 0;
    }

    var lastMoveIntentKey = null;
    var lastMoveAxis = null; // 'horizontal' | 'vertical'
    var lastForwardCardinal = null;

    function tryMove(dr, dc, angle) {
      var nr = avatarRow + dr;
      var nc = avatarCol + dc;
      if (isWalkable(nr, nc)) {
        // Send current position AND destination to server for validation
        if (!postMove(avatarRow, avatarCol, nr, nc, angle)) return false;
        // Optimistic client-side prediction — server may still reject
        avatarRow = nr;
        avatarCol = nc;
        targetX = tileX(nc);
        targetZ = tileZ(nr);
        avatar.rotation.y = angle;
        document.getElementById('pos-col').textContent = nc;
        document.getElementById('pos-row').textContent = nr;
        return true;
      }
      return false;
    }

    function getCameraForwardCardinal() {
      // Quantize camera forward to one grid cardinal with hysteresis so
      // near-diagonal default angles do not flip direction frame-to-frame.
      var fx = -Math.sin(camTheta);
      var fz = -Math.cos(camTheta);
      var ax = Math.abs(fx);
      var az = Math.abs(fz);
      var hysteresis = 0.08;

      var candidate = null;
      if (az >= ax) {
        candidate = { dr: fz >= 0 ? 1 : -1, dc: 0 };
      } else {
        candidate = { dr: 0, dc: fx >= 0 ? 1 : -1 };
      }

      // First use must come from actual camera heading (no fallback bias).
      if (!lastForwardCardinal) {
        lastForwardCardinal = candidate;
        return { dr: lastForwardCardinal.dr, dc: lastForwardCardinal.dc };
      }

      if (Math.abs(az - ax) <= hysteresis) {
        return { dr: lastForwardCardinal.dr, dc: lastForwardCardinal.dc };
      }
      lastForwardCardinal = candidate;
      return { dr: lastForwardCardinal.dr, dc: lastForwardCardinal.dc };
    }

    function tryMoveCameraRelative(inputX, inputY) {
      if (Math.abs(inputX) < 1e-6 && Math.abs(inputY) < 1e-6) return false;

      var intentKey =
        (inputX > 0 ? 1 : inputX < 0 ? -1 : 0) +
        ',' +
        (inputY > 0 ? 1 : inputY < 0 ? -1 : 0);

      var forward = getCameraForwardCardinal();
      // Right direction in grid space for the current camera orientation.
      var right = { dr: forward.dc, dc: -forward.dr };

      var absX = Math.abs(inputX);
      var absY = Math.abs(inputY);
      var axis = null;
      var axisBias = 0.12;
      if (absX > absY + axisBias) axis = 'horizontal';
      else if (absY > absX + axisBias) axis = 'vertical';
      else if (lastMoveIntentKey === intentKey && lastMoveAxis) axis = lastMoveAxis;
      else axis = absY >= absX ? 'vertical' : 'horizontal';

      var dr = 0;
      var dc = 0;
      if (axis === 'horizontal') {
        var sx = inputX > 0 ? 1 : -1;
        dr = right.dr * sx;
        dc = right.dc * sx;
      } else {
        var sy = inputY > 0 ? 1 : -1;
        dr = forward.dr * sy;
        dc = forward.dc * sy;
      }

      var angle = 0;
      if (dr !== 0) angle = dr > 0 ? 0 : Math.PI;
      else angle = dc > 0 ? Math.PI / 2 : -Math.PI / 2;

      lastMoveIntentKey = intentKey;
      lastMoveAxis = axis;
      return tryMove(dr, dc, angle);
    }

    function goToNewWorld() {
      fetchWithAuth('/virtual-world/new-world', { method: 'POST' })
        .then(function() { window.location.href = '/virtual-world'; })
        .catch(function() { window.location.href = '/virtual-world'; });
    }

    function startWorld() {
      fetchWithAuth('/virtual-world/start-world', { method: 'POST' })
        .then(function() { window.location.href = '/virtual-world'; })
        .catch(function() { window.location.href = '/virtual-world'; });
    }

    function postTreeAction(action) {
      fetchWithAuth('/virtual-world/tree-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action,
          row: avatarRow,
          col: avatarCol,
          rotation: avatar.rotation.y
        })
      }).then(function(res) { return res.json(); }).then(function(result) {
        if (!result.ok) {
          console.log('Use failed:', result.error);
        }
      }).catch(function(err) {
        if (err && (err.code === 'AUTH_401' || err.code === 'AUTH_STOPPED')) return;
        console.error('Use request failed:', err);
      });
    }

    function useItem() {
      var actions = getOwnedTreeActions().sort();
      if (actions.length === 0) {
        console.log('No usable tree item owned');
        return;
      }
      if (actions.length === 1) {
        closeUsePicker();
        postTreeAction(actions[0]);
        return;
      }
      if (usePickerVisible) {
        closeUsePicker();
        return;
      }
      openUsePicker(actions);
    }

    function renderInventoryPanel() {
      var leftDiv = document.getElementById('inv-left-hand');
      var rightDiv = document.getElementById('inv-right-hand');
      var listDiv = document.getElementById('inv-list');
      var countDiv = document.getElementById('inv-count');

      function handHtml(title, slot, item) {
        var label = item ? inventoryItemLabel(item) : 'empty';
        var html =
          '<div class="name">' + title + '</div>' +
          '<div>' + label + '</div>' +
          '<div class="inv-actions">';
        if (item) {
          html += '<button onclick="dropFromSlot(\\'' + slot + '\\')">Drop</button>';
          html += '<button onclick="equipToInventory(\\'' + slot + '\\')">Store</button>';
        }
        html += '</div>';
        return html;
      }

      leftDiv.innerHTML = handHtml(
        t('inventory.left_hand', 'Left Hand'),
        'left_hand',
        playerInventory.left_hand,
      );
      rightDiv.innerHTML = handHtml(
        t('inventory.right_hand', 'Right Hand'),
        'right_hand',
        playerInventory.right_hand,
      );

      if (!Array.isArray(playerInventory.inventory) || playerInventory.inventory.length === 0) {
        listDiv.innerHTML =
          '<div class="inv-row"><span class="label">' +
          t('inventory.backpack_empty', 'Backpack empty') +
          '</span></div>';
      } else {
        var rows = '';
        for (var i = 0; i < playerInventory.inventory.length; i++) {
          var item = playerInventory.inventory[i];
          rows +=
            '<div class="inv-row">' +
            '<span class="label">' + inventoryItemLabel(item) + '</span>' +
            '<span>' +
            '<button onclick="equipFromInventory(' + i + ',\\'left_hand\\')">L</button> ' +
            '<button onclick="equipFromInventory(' + i + ',\\'right_hand\\')">R</button> ' +
            '<button onclick="dropFromInventory(' + i + ')">Drop</button>' +
            '</span>' +
            '</div>';
        }
        listDiv.innerHTML = rows;
      }

      countDiv.textContent =
        playerInventory.inventory.length + ' ' + t('inventory.items_suffix', 'items');
      updateHeldHud();
    }

    function showInventoryPanel(autoHideMs) {
      inventoryPanelVisible = true;
      document.getElementById('hud-inventory-panel').style.display = 'block';
      renderInventoryPanel();
      if (inventoryAutoHideTimer) {
        clearTimeout(inventoryAutoHideTimer);
        inventoryAutoHideTimer = null;
      }
      if (autoHideMs && autoHideMs > 0) {
        inventoryAutoHideTimer = setTimeout(function() {
          closeInventoryPanel();
        }, autoHideMs);
      }
    }

    function closeInventoryPanel() {
      inventoryPanelVisible = false;
      document.getElementById('hud-inventory-panel').style.display = 'none';
      if (inventoryAutoHideTimer) {
        clearTimeout(inventoryAutoHideTimer);
        inventoryAutoHideTimer = null;
      }
    }

    function toggleInventoryPanel() {
      if (inventoryPanelVisible) closeInventoryPanel();
      else showInventoryPanel(0);
    }

    function applyItemStateFromResult(result) {
      if (!result || typeof result !== 'object') return;
      if (result.inventory) {
        playerInventory = normalizeClientInventory(result.inventory);
      }
      if (Array.isArray(result.items)) {
        // Convert flat server snapshot into tile map.
        var next = {};
        for (var i = 0; i < result.items.length; i++) {
          var it = result.items[i];
          if (!it || !it.id || !it.type) continue;
          var key = it.row + '_' + it.col;
          if (!next[key]) next[key] = [];
          next[key].push({ id: it.id, type: it.type });
        }
        worldItemsByTile = next;
      }
      rebuildItemMeshes();
      renderInventoryPanel();
      updateUseButtonState();
    }

    function postItemAction(payload, onSuccess) {
      fetchWithAuth('/virtual-world/tree-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(function(res) {
        return res.json();
      }).then(function(result) {
        if (!result || !result.ok) {
          console.log('Item action failed:', result && result.error);
          return;
        }
        applyItemStateFromResult(result);
        if (typeof onSuccess === 'function') onSuccess(result);
      }).catch(function(err) {
        if (err && (err.code === 'AUTH_401' || err.code === 'AUTH_STOPPED')) return;
        console.error('Item action request failed:', err);
      });
    }

    function pickItemsOnTile() {
      postItemAction({ action: 'pick' }, function(result) {
        if (result && Number(result.picked_count || 0) > 0) {
          showInventoryPanel(2500);
        }
      });
    }

    function dropFromSlot(slot) {
      postItemAction({ action: 'drop', from: slot });
    }

    function dropFromInventory(index) {
      postItemAction({ action: 'drop', from: 'inventory', index: index });
    }

    function equipToInventory(slot) {
      postItemAction({ action: 'equip', from: slot, to: 'inventory' });
    }

    function equipFromInventory(index, slot) {
      postItemAction({ action: 'equip', from: 'inventory', index: index, to: slot });
    }

    // ── Input ────────────────────────────────────────────────────────────────
    var keys = {};
    var MOVE_KEYS = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'];

    document.addEventListener('keydown', function(e) {
      keys[e.key] = true;
      if (MOVE_KEYS.indexOf(e.key) !== -1) e.preventDefault();
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        toggleInventoryPanel();
      }
    });
    document.addEventListener('keyup', function(e) {
      keys[e.key] = false;
    });

    // ── Camera orbit controls (drag + scroll) ────────────────────────────────
    var isDragging = false;
    var lastMouseX = 0, lastMouseY = 0;
    var lastTouchX = 0, lastTouchY = 0;
    var lastTouchDist = 0;

    // Mouse controls (desktop)
    document.addEventListener('mousedown', function(e) {
      if (e.button === 0) {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }
    });
    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var dx = e.clientX - lastMouseX;
      var dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      camTheta -= dx * 0.005;
      camPhi = Math.max(0.15, Math.min(1.4, camPhi - dy * 0.004));
    });
    document.addEventListener('mouseup',    function() { isDragging = false; });
    document.addEventListener('mouseleave', function() { isDragging = false; });

    document.addEventListener('wheel', function(e) {
      e.preventDefault();
      camR = Math.max(10, Math.min(150, camR + e.deltaY * 0.05));
    }, { passive: false });

    // ── Joystick element references (must be defined before touch handlers) ──
    var joystickBase = document.getElementById('joystick-base');
    var joystickStick = document.getElementById('joystick-stick');
    var joystickActive = false;
    var joystickMouseActive = false; // separate flag for mouse vs touch
    var joystickDirection = { x: 0, y: 0 }; // normalized direction

    // Touch controls (mobile) - for camera rotation and pinch-to-zoom
    var isTouchRotating = false;
    
    function isTouchOnJoystick(touch) {
      if (!joystickBase) return false;
      var joystickRect = joystickBase.getBoundingClientRect();
      return (
        touch.clientX >= joystickRect.left &&
        touch.clientX <= joystickRect.right &&
        touch.clientY >= joystickRect.top &&
        touch.clientY <= joystickRect.bottom
      );
    }

    function isTouchOnButtons(touch) {
      var treeActionsDiv = document.getElementById('hud-tree-actions');
      if (treeActionsDiv) {
        var rect = treeActionsDiv.getBoundingClientRect();
        if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
            touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          return true;
        }
      }
      var portalDiv = document.getElementById('hud-portal');
      if (portalDiv) {
        var rect = portalDiv.getBoundingClientRect();
        if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
            touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          return true;
        }
      }
      var inventoryDiv = document.getElementById('hud-inventory-panel');
      if (inventoryDiv && inventoryDiv.style.display !== 'none') {
        var invRect = inventoryDiv.getBoundingClientRect();
        if (touch.clientX >= invRect.left && touch.clientX <= invRect.right &&
            touch.clientY >= invRect.top && touch.clientY <= invRect.bottom) {
          return true;
        }
      }
      return false;
    }

    document.addEventListener('touchstart', function(e) {
      // Ignore if touching the joystick or buttons
      if (e.touches.length === 1 && !isTouchOnJoystick(e.touches[0]) && !isTouchOnButtons(e.touches[0])) {
        e.preventDefault();
        isTouchRotating = true;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        e.preventDefault();
        // Pinch to zoom
        isTouchRotating = false;
        var dx = e.touches[1].clientX - e.touches[0].clientX;
        var dy = e.touches[1].clientY - e.touches[0].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: false });

    document.addEventListener('touchmove', function(e) {
      if (e.touches.length === 1 && isTouchRotating) {
        e.preventDefault();
        // Single finger drag for camera rotation
        var dx = e.touches[0].clientX - lastTouchX;
        var dy = e.touches[0].clientY - lastTouchY;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        camTheta -= dx * 0.005;
        camPhi = Math.max(0.15, Math.min(1.4, camPhi - dy * 0.004));
      } else if (e.touches.length === 2) {
        e.preventDefault();
        // Pinch to zoom
        var dx = e.touches[1].clientX - e.touches[0].clientX;
        var dy = e.touches[1].clientY - e.touches[0].clientY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var delta = lastTouchDist - dist;
        lastTouchDist = dist;
        camR = Math.max(10, Math.min(150, camR + delta * 0.2));
      }
    }, { passive: false });

    document.addEventListener('touchend', function(e) {
      if (e.touches.length === 0) {
        isTouchRotating = false;
      } else if (e.touches.length === 1 && !isTouchOnJoystick(e.touches[0]) && !isTouchOnButtons(e.touches[0])) {
        // Continuing with one finger after lifting second
        isTouchRotating = true;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      }
    }, { passive: false });

    // ── Joystick control functions ───────────────────────────────────────────
    function updateJoystick(touchX, touchY) {
      var rect = joystickBase.getBoundingClientRect();
      var centerX = rect.left + rect.width / 2;
      var centerY = rect.top + rect.height / 2;
      var dx = touchX - centerX;
      var dy = touchY - centerY;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var maxDistance = 35; // max offset from center

      if (distance > maxDistance) {
        dx = (dx / distance) * maxDistance;
        dy = (dy / distance) * maxDistance;
      }

      joystickStick.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
      
      // Normalize direction
      if (distance > 10) { // dead zone
        joystickDirection.x = dx / maxDistance;
        joystickDirection.y = dy / maxDistance;
      } else {
        joystickDirection.x = 0;
        joystickDirection.y = 0;
      }
    }

    function resetJoystick() {
      joystickStick.style.transform = 'translate(-50%, -50%)';
      joystickDirection.x = 0;
      joystickDirection.y = 0;
      joystickActive = false;
      joystickStick.classList.remove('active');
    }

    joystickBase.addEventListener('touchstart', function(e) {
      e.preventDefault();
      e.stopPropagation();
      joystickActive = true;
      joystickStick.classList.add('active');
      updateJoystick(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    joystickBase.addEventListener('touchmove', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (joystickActive) {
        updateJoystick(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    joystickBase.addEventListener('touchend', function(e) {
      e.preventDefault();
      e.stopPropagation();
      resetJoystick();
    }, { passive: false });

    joystickBase.addEventListener('touchcancel', function(e) {
      e.preventDefault();
      e.stopPropagation();
      resetJoystick();
    }, { passive: false });

    // Mouse event handlers for desktop
    joystickBase.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      joystickActive = true;
      joystickMouseActive = true;
      joystickStick.classList.add('active');
      updateJoystick(e.clientX, e.clientY);
    });

    document.addEventListener('mousemove', function(e) {
      if (joystickMouseActive) {
        e.preventDefault();
        updateJoystick(e.clientX, e.clientY);
      }
    });

    document.addEventListener('mouseup', function(e) {
      if (joystickMouseActive) {
        e.preventDefault();
        joystickMouseActive = false;
        resetJoystick();
      }
    });

    // ── Game loop ────────────────────────────────────────────────────────────
    var moveTimer = 0;
    var clock = new THREE.Clock();
    var walkTime = 0;

    function animate() {
      requestAnimationFrame(animate);
      var dt = clock.getDelta() * 1000; // ms

      // Step timer
      moveTimer -= dt;
      if (moveTimer <= 0) {
        var moved = false;
        
        // Check joystick input first (for touch devices)
        if (joystickActive && (Math.abs(joystickDirection.x) > 0.15 || Math.abs(joystickDirection.y) > 0.15)) {
          moved = tryMoveCameraRelative(joystickDirection.x, -joystickDirection.y);
        }
        // Fallback to keyboard input (camera-relative)
        else {
          var inputX = 0;
          var inputY = 0;
          if (keys['ArrowUp'] || keys['w'] || keys['W']) inputY += 1;
          if (keys['ArrowDown'] || keys['s'] || keys['S']) inputY -= 1;
          if (keys['ArrowLeft'] || keys['a'] || keys['A']) inputX -= 1;
          if (keys['ArrowRight'] || keys['d'] || keys['D']) inputX += 1;
          if (inputX !== 0 || inputY !== 0) moved = tryMoveCameraRelative(inputX, inputY);
          else {
            lastMoveIntentKey = null;
            lastMoveAxis = null;
          }
        }

        if (moved) moveTimer = MOVE_INTERVAL;
      }

      // Smooth lerp toward target position
      var lerp = 1 - Math.exp(-15 * dt / 1000);
      avatar.position.x += (targetX - avatar.position.x) * lerp;
      avatar.position.z += (targetZ - avatar.position.z) * lerp;

      // Walking bob
      var dist = Math.abs(avatar.position.x - targetX) + Math.abs(avatar.position.z - targetZ);
      if (dist > 0.05) {
        walkTime += dt;
        avatar.position.y = Math.abs(Math.sin(walkTime * 0.012)) * 0.1;
      } else {
        walkTime = 0;
        avatar.position.y += (0 - avatar.position.y) * lerp;
      }

      // Lerp remote avatars toward their targets
      for (var pid in remoteAvatars) {
        var ra = remoteAvatars[pid];
        ra.group.position.x += (ra.targetX - ra.group.position.x) * lerp;
        ra.group.position.z += (ra.targetZ - ra.group.position.z) * lerp;
        var rotDelta = ra.targetRot - ra.group.rotation.y;
        while (rotDelta > Math.PI) rotDelta -= 2 * Math.PI;
        while (rotDelta < -Math.PI) rotDelta += 2 * Math.PI;
        ra.group.rotation.y += rotDelta * lerp;
      }

      // Lerp NPC avatars toward their targets
      for (var npcId in npcAvatars) {
        var na = npcAvatars[npcId];
        na.group.position.x += (na.targetX - na.group.position.x) * lerp;
        na.group.position.z += (na.targetZ - na.group.position.z) * lerp;
        var npcRotDelta = na.targetRot - na.group.rotation.y;
        while (npcRotDelta > Math.PI) npcRotDelta -= 2 * Math.PI;
        while (npcRotDelta < -Math.PI) npcRotDelta += 2 * Math.PI;
        na.group.rotation.y += npcRotDelta * lerp;
      }

      // Keep background plane centered under avatar
      bgPlane.position.x = avatar.position.x;
      bgPlane.position.z = avatar.position.z;

      // Track avatar so sun shadows and highlights cover current location
      sun.position.set(avatar.position.x - 12, 22, avatar.position.z - 8);
      sun.target.position.set(avatar.position.x, 0, avatar.position.z);
      sun.target.updateMatrixWorld();
      fill.position.set(avatar.position.x + 14, 10, avatar.position.z + 14);
      fill.target.position.set(avatar.position.x, 0, avatar.position.z);
      fill.target.updateMatrixWorld();

      // Update target indicator position based on player rotation
      var angle = avatar.rotation.y;
      while (angle > Math.PI) angle -= 2 * Math.PI;
      while (angle < -Math.PI) angle += 2 * Math.PI;
      
      var targetRow = avatarRow;
      var targetCol = avatarCol;
      if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
        targetRow = avatarRow + 1; // South
      } else if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) {
        targetCol = avatarCol + 1; // East
      } else if (angle >= 3 * Math.PI / 4 || angle < -3 * Math.PI / 4) {
        targetRow = avatarRow - 1; // North
      } else {
        targetCol = avatarCol - 1; // West
      }
      
      targetIndicator.position.x = tileX(targetCol);
      targetIndicator.position.z = tileZ(targetRow);

      updateCamera();
      renderer.render(scene, camera);
    }

    animate();
    initMultiplayer();

    // ── Resize ───────────────────────────────────────────────────────────────
    window.addEventListener('resize', function() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  </script>
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
  items.forEach(function (item) {
    if (!item || typeof item.type !== "string") return;
    var action = TREE_ACTION_BY_ITEM_TYPE[item.type];
    if (action) actions[action] = true;
  });
  return Object.keys(actions);
}

/**
 * @param {*} inv
 * @param {string} action
 * @returns {boolean}
 */
function canInventoryUseTreeAction(inv, action) {
  if (action !== "plant" && action !== "cut") return false;
  return getInventoryTreeActions(inv).indexOf(action) !== -1;
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

    // NPC item behavior: pick all from current tile, and occasionally drop one.
    var tileKey = n.row + "_" + n.col;
    var tileItems = Array.isArray(worldItems[tileKey])
      ? worldItems[tileKey]
      : [];
    if (tileItems.length > 0 && Math.random() < 0.65) {
      for (var pickIdx = 0; pickIdx < tileItems.length; pickIdx++) {
        n.inventory.push(tileItems[pickIdx]);
      }
      delete worldItems[tileKey];
      itemChanges = true;
      hasChanges = true;
      broadcastItemChange(
        worldId,
        "npc",
        npcId,
        "pick",
        n.row,
        n.col,
        tileItems,
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
    tickWorldNPCs(worldId, now);
  });

  if (changedWorldSet) saveNPCActiveWorlds(worlds);
}

/**
 * @param {string} worldId
 */
function maybeTickWorldNPCs(worldId) {
  var key = "vworld_npc_last_tick:" + worldId;
  var now = Date.now();
  var lastTick = Number(sharedStorage.getItem(key) || 0);
  if (now - lastTick < NPC_TICK_MS) return;
  tickWorldNPCs(worldId, now);
  sharedStorage.setItem(key, String(now));
}

function scheduleNextNPCTick() {
  var runAt = new Date(Date.now() + NPC_TICK_MS).toISOString();
  try {
    schedulerService.registerOnce({
      handler: "runNPCTickScheduledJob",
      runAt: runAt,
      name: "vworld-npc-tick",
    });
  } catch (e) {
    vwLog("npc scheduler register failed", { error: String(e) });
  }
}

/**
 * @param {*} _context
 */
function runNPCTickScheduledJob(_context) {
  runNPCTick();
  scheduleNextNPCTick();
}

function startNPCTicker() {
  if (npcTickerStarted) return;
  npcTickerStarted = true;
  scheduleNextNPCTick();
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
    var picked = Array.isArray(worldItems[tileKey]) ? worldItems[tileKey] : [];
    if (picked.length > 0) {
      for (var i = 0; i < picked.length; i++) {
        inv.inventory.push(picked[i]);
      }
      delete worldItems[tileKey];
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
  return ResponseBuilder.json({ ok: true });
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

  // Broadcast leave from the current world before switching.
  // This must happen here because leaveHandler derives worldId from storage:
  // by the time beforeunload fires after navigation, vworld_current already
  // points to the new world, so the beacon would be a no-op there.
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
          target_world_id: newWorldId,
        }),
        JSON.stringify({ world_id: oldWorldId }),
      );
    }
  }

  sharedStorage.setItem("vworld_current:" + userId, newWorldId);
  sharedStorage.removeItem("vworld_lease:" + userId);
  // Clear persisted position so the player spawns at (1,1) in the new world.
  sharedStorage.removeItem("vworld_pos:" + userId);
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

  // Broadcast leave from the current world before switching.
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
          target_world_id: "10000",
        }),
        JSON.stringify({ world_id: oldWorldId }),
      );
    }
  }

  sharedStorage.setItem("vworld_current:" + userId, "10000");
  sharedStorage.removeItem("vworld_lease:" + userId);
  // Clear persisted position so the player spawns at (1,1) in start world.
  sharedStorage.removeItem("vworld_pos:" + userId);
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
      return now - Math.max(players[pid].ts, hbTs) < 30000;
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

  var action = body.action; // "plant" or "cut"
  var playerRow = Number(body.row);
  var playerCol = Number(body.col);
  var rotation = Number(body.rotation);

  if (action === "pick" || action === "drop" || action === "equip") {
    var handled = handleItemActionForUser(userId, body);
    return ResponseBuilder.json(handled.payload, handled.status);
  }

  if (action !== "plant" && action !== "cut") {
    return ResponseBuilder.json({ error: "Invalid action" }, 400);
  }

  var inv = loadPlayerInventory(userId);
  if (!canInventoryUseTreeAction(inv, action)) {
    return ResponseBuilder.json({
      ok: false,
      error: "Missing required item for action",
    });
  }

  // Derive world from server-side storage
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) {
    return ResponseBuilder.json({ ok: false, error: "No world found" });
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

  var map = generateMap(worldId);
  var trees = loadWorldTrees(worldId);
  var treeKey = targetRow + "_" + targetCol;

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

  safeRegisterRoute("/virtual-world", "getVirtualWorldPage", "GET", {
    summary: "2.5D Virtual World",
    description:
      "Interactive 2.5D block world rendered with Three.js. Navigate with WASD or arrow keys.",
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
}
