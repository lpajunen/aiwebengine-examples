function createSessionId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return (
    "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)
  );
}
var sessionId = createSessionId();

var AUTH_STATE_OK = "ok";
var AUTH_STATE_EXTENDING = "extending";
var AUTH_STATE_EXPIRED = "expired";
var AUTH_STATE_REDIRECTING = "redirecting";
var authState = AUTH_STATE_OK;
var authProbeRetryTimer = null;
var authProbeAttempts = 0;
var authProbeInFlight = false;
var authSseCheckPending = false;
var authRefreshPromise = null;
var authRefreshIntervalTimer = null;
var AUTH_PROBE_MAX_ATTEMPTS = 3;
var AUTH_LOGIN_REDIRECT_DELAY_MS = 800;
var AUTH_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

function setAuthStatusMessage(text, isError) {
  var el = document.getElementById("hud-auth-status");
  if (!el) return;
  if (!text) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.style.display = "block";
  if (isError) {
    el.style.background = "rgba(130, 36, 26, 0.9)";
    el.style.borderColor = "rgba(255, 120, 100, 0.7)";
  } else {
    el.style.background = "rgba(120, 70, 10, 0.86)";
    el.style.borderColor = "rgba(255, 196, 112, 0.6)";
  }
}

function loginRedirectUrl() {
  return "/auth/login?redirect=" + encodeURIComponent("/virtual-world/play");
}

function redirectToLogin() {
  if (authState === AUTH_STATE_REDIRECTING) return;
  authState = AUTH_STATE_REDIRECTING;
  setAuthStatusMessage("Session expired. Redirecting to login...", true);
  setTimeout(function () {
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
  setAuthStatusMessage("", false);
  flushMove();
}

function refreshSessionSilently(reason) {
  if (isAuthUnavailable()) return Promise.resolve(false);
  if (authRefreshPromise) return authRefreshPromise;
  authRefreshPromise = fetch("/auth/refresh", {
    method: "POST",
    cache: "no-store",
  })
    .then(function (res) {
      if (res.status === 401) return false;
      return res.ok;
    })
    .catch(function () {
      return false;
    })
    .finally(function () {
      authRefreshPromise = null;
    });
  return authRefreshPromise;
}

function probeAuthStatus() {
  return fetch("/virtual-world/current-world", {
    method: "GET",
    cache: "no-store",
  })
    .then(function (res) {
      if (res.status === 401) return false;
      return res.ok;
    })
    .catch(function () {
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
  var delay =
    authProbeAttempts === 0
      ? 0
      : Math.min(4000, Math.pow(2, authProbeAttempts - 1) * 1000);
  authProbeRetryTimer = setTimeout(function () {
    if (authState !== AUTH_STATE_EXTENDING) return;
    authProbeInFlight = true;
    refreshSessionSilently("recovery")
      .then(function (refreshed) {
        if (!refreshed) return false;
        return probeAuthStatus();
      })
      .then(function (ok) {
        authProbeInFlight = false;
        if (ok) {
          handleAuthRecovery();
          return;
        }
        authProbeAttempts += 1;
        runAuthProbeAttempt();
      })
      .catch(function () {
        authProbeInFlight = false;
        authProbeAttempts += 1;
        runAuthProbeAttempt();
      });
  }, delay);
}

function handleAuth401(source) {
  if (authState === AUTH_STATE_REDIRECTING || authState === AUTH_STATE_EXPIRED)
    return;
  if (authState === AUTH_STATE_EXTENDING) return;
  authState = AUTH_STATE_EXTENDING;
  authProbeAttempts = 0;
  setAuthStatusMessage("Session expired, trying to reconnect...", false);
  console.warn("Auth expired during request:", source);
  runAuthProbeAttempt();
}

function isAuthUnavailable() {
  return (
    authState === AUTH_STATE_REDIRECTING || authState === AUTH_STATE_EXPIRED
  );
}

function createAuthError(code) {
  var authErr = new Error(code);
  authErr.code = code;
  return authErr;
}

function scheduleSessionRefresh() {
  if (authRefreshIntervalTimer) {
    clearInterval(authRefreshIntervalTimer);
    authRefreshIntervalTimer = null;
  }
  authRefreshIntervalTimer = setInterval(function () {
    if (authState !== AUTH_STATE_OK) return;
    // Refresh even when the tab is hidden: a passive watcher receiving SSE
    // events may background the tab for hours and should not be forced to
    // re-login. The 30-minute heartbeat is lightweight enough to keep the
    // session alive for the full 30-day absolute lifetime.
    refreshSessionSilently("interval").then(function (ok) {
      if (!ok) handleAuth401("refresh_interval");
    });
  }, AUTH_REFRESH_INTERVAL_MS);
}

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState !== "visible") return;
  if (authState !== AUTH_STATE_OK) return;
  refreshSessionSilently("visibility").then(function (ok) {
    if (!ok) handleAuth401("visibility_refresh");
  });
});

function fetchWithAuth(path, options) {
  if (isAuthUnavailable()) {
    return Promise.reject(createAuthError("AUTH_STOPPED"));
  }
  var requestOptions = options || {};
  return fetch(path, requestOptions)
    .then(function (res) {
      if (res.status !== 401) return res;
      return refreshSessionSilently("request_retry").then(function (refreshed) {
        if (!refreshed) {
          handleAuth401(path);
          throw createAuthError("AUTH_401");
        }
        return fetch(path, requestOptions).then(function (retryRes) {
          if (retryRes.status === 401) {
            handleAuth401(path);
            throw createAuthError("AUTH_401");
          }
          return retryRes;
        });
      });
    })
    .then(function (res) {
      if (res.status === 401) {
        handleAuth401(path);
        throw createAuthError("AUTH_401");
      }
      return res;
    });
}

function fetchJsonWithAuth(path, options) {
  return fetchWithAuth(path, options).then(function (res) {
    return res.json();
  });
}

function scheduleSSEAuthCheck(source) {
  if (authState !== AUTH_STATE_OK || authSseCheckPending) return;
  authSseCheckPending = true;
  setTimeout(function () {
    authSseCheckPending = false;
    probeAuthStatus().then(function (ok) {
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
      saw: { name: "Woodsman's saw" },
      knife: { name: "Puukko knife" },
      flower: { name: "Forest flower" },
      tree_planter: { name: "Pine sapling" },
      portal_builder: { name: "Rune gate charm" },
      portal: { name: "Rune gate" },
      starter_kit: { name: "Wanderer's bundle" },
      kantele: { name: "Kantele" },
      rowan_charm: { name: "Rowan charm" },
      rune_stone: { name: "Rune stone" },
      juniper_bundle: { name: "Juniper bundle" },
      birch_bark_letter: { name: "Birch-bark letter" },
      blessing_marker: { name: "Rowan blessing" },
      unknown: { name: "Unknown item" },
    },
    tree_action: {
      plant: "Plant pine sapling",
      cut: "Use woodsman's saw",
      build_portal: "Raise rune gate",
      build_portal_forest: "Raise rune gate to forest world",
      build_portal_island: "Raise rune gate to island world",
      build_portal_cave: "Raise rune gate to cave world",
      build_portal_building: "Raise rune gate to house world",
      remove_portal: "Close rune gate",
      play_tune: "Play kantele tune",
      place_blessing: "Place rowan blessing",
      portal_travel: "Enter rune gate",
      return_home: "Travel to the old oak",
    },
    terrain: {
      wall: "Spruce thicket",
      house: "House wall",
      tree: "Pine tree",
      tree_planted: "Pine tree (planted)",
      old_oak: "Old oak",
      ocean: "Ocean",
      lake: "Lake",
      river: "River",
      rock: "Rock field",
      mountain: "Mountain",
      sand: "Sand",
      cave_floor: "Cave floor",
      wood_floor: "Wood floor",
      ground_tree_cut: "Forest floor (pine cut)",
      ground: "Forest floor",
    },
    inventory: {
      empty: "empty",
      left_hand: "Left Hand",
      right_hand: "Right Hand",
      backpack_empty: "Backpack empty",
      items_suffix: "items",
    },
  },
  fi: {
    item: {
      saw: { name: "Metsurin saha" },
      knife: { name: "Puukko" },
      flower: { name: "Metsakukka" },
      tree_planter: { name: "Männyn taimi" },
      portal_builder: { name: "Riimuportin amuletti" },
      portal: { name: "Riimuportti" },
      starter_kit: { name: "Kulkijan nyytti" },
      kantele: { name: "Kantele" },
      rowan_charm: { name: "Pihlajakoriste" },
      rune_stone: { name: "Riimukivi" },
      juniper_bundle: { name: "Katajanippu" },
      birch_bark_letter: { name: "Tuohikirje" },
      blessing_marker: { name: "Pihlajansiunaus" },
      unknown: { name: "Tuntematon esine" },
    },
    tree_action: {
      plant: "Istuta männyn taimi",
      cut: "Käytä metsurin sahaa",
      build_portal: "Nosta riimuportti",
      build_portal_forest: "Nosta riimuportti metsämaailmaan",
      build_portal_island: "Nosta riimuportti saareen",
      build_portal_cave: "Nosta riimuportti luolaan",
      build_portal_building: "Nosta riimuportti taloon",
      remove_portal: "Sulje riimuportti",
      play_tune: "Soita kanteleen sävel",
      place_blessing: "Aseta pihlajansiunaus",
      portal_travel: "Astu riimuporttiin",
      return_home: "Matkaa vanhalle tammelle",
    },
    terrain: {
      wall: "Kuusitiheikkö",
      house: "Talon seinä",
      tree: "Mänty",
      tree_planted: "Mänty (istutettu)",
      old_oak: "Vanha tammi",
      ocean: "Meri",
      lake: "Järvi",
      river: "Joki",
      rock: "Kivikko",
      mountain: "Vuori",
      sand: "Hiekka",
      cave_floor: "Luolan lattia",
      wood_floor: "Puutaso",
      ground_tree_cut: "Metsäpohja (mänty kaadettu)",
      ground: "Metsäpohja",
    },
    inventory: {
      empty: "tyhjä",
      left_hand: "Vasen käsi",
      right_hand: "Oikea käsi",
      backpack_empty: "Reppu on tyhjä",
      items_suffix: "esinettä",
    },
  },
};

var activeLocale = null;

function resolveLocale() {
  if (activeLocale) return activeLocale;
  var raw =
    (navigator.languages && navigator.languages.length > 0
      ? navigator.languages[0]
      : navigator.language) || "en";
  var normalized = String(raw).toLowerCase();
  if (I18N_MESSAGES[normalized]) {
    activeLocale = normalized;
    return activeLocale;
  }
  var base = normalized.split("-")[0];
  activeLocale = I18N_MESSAGES[base] ? base : "en";
  return activeLocale;
}

function getMessageByKey(locale, key) {
  var dict = I18N_MESSAGES[locale];
  if (!dict) return null;
  var parts = String(key || "").split(".");
  var cur = dict;
  for (var i = 0; i < parts.length; i++) {
    if (!cur || typeof cur !== "object" || !(parts[i] in cur)) return null;
    cur = cur[parts[i]];
  }
  return typeof cur === "string" ? cur : null;
}

function t(key, fallback) {
  var locale = resolveLocale();
  var localized = getMessageByKey(locale, key);
  if (localized !== null) return localized;
  var english = getMessageByKey("en", key);
  if (english !== null) return english;
  return fallback || key;
}

function humanizeType(type) {
  return String(type || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, function (ch) {
      return ch.toUpperCase();
    });
}

function itemTypeToLabelKey(type) {
  if (type === "saw") return "item.saw.name";
  if (type === "hammer") return "item.hammer.name";
  if (type === "knife") return "item.knife.name";
  if (type === "flower") return "item.flower.name";
  if (type === "tree_planter") return "item.tree_planter.name";
  if (type === "portal_builder") return "item.portal_builder.name";
  if (type === "kantele") return "item.kantele.name";
  if (type === "rowan_charm") return "item.rowan_charm.name";
  if (type === "rune_stone") return "item.rune_stone.name";
  if (type === "juniper_bundle") return "item.juniper_bundle.name";
  if (type === "birch_bark_letter") return "item.birch_bark_letter.name";
  if (type === "blessing_marker") return "item.blessing_marker.name";
  if (type === "portal") return "item.portal.name";
  if (type === "starter_kit") return "item.starter_kit.name";
  return "item.unknown.name";
}

// ── Dynamic world-mod state (client-side) ─────────────────────────────────
var clientTileDefs =
  typeof WORLD_TILE_DEFS === "object" && WORLD_TILE_DEFS
    ? WORLD_TILE_DEFS
    : {
        ground: { value: 0, walkable: true, layer: "terrain" },
        spruce_thicket: { value: 1, walkable: false, layer: "terrain" },
        pine_tree: { value: 2, walkable: false, layer: "object" },
        house: { value: 3, walkable: false, layer: "object" },
        ocean: { value: 4, walkable: false, layer: "terrain" },
        lake: { value: 5, walkable: false, layer: "terrain" },
        river: { value: 6, walkable: false, layer: "terrain" },
        rock: { value: 7, walkable: false, layer: "terrain" },
        mountain: { value: 8, walkable: false, layer: "terrain" },
        sand: { value: 9, walkable: true, layer: "terrain" },
        cave_floor: { value: 10, walkable: true, layer: "terrain" },
        wood_floor: { value: 11, walkable: true, layer: "terrain" },
      };
/** @type {Record<number, string>} */
var clientTileNamesByValue = {};
Object.keys(clientTileDefs).forEach(function (tileName) {
  clientTileNamesByValue[Number(clientTileDefs[tileName].value)] = tileName;
});

/**
 * @param {number} tileValue
 * @returns {string}
 */
function clientTileNameForValue(tileValue) {
  return clientTileNamesByValue[Number(tileValue)] || "ground";
}

/**
 * @param {string} tileName
 * @returns {number}
 */
function clientTileValueForName(tileName) {
  var def = clientTileDefs[String(tileName)] || clientTileDefs.ground;
  return Number(def.value || 0);
}

/**
 * @param {number} tileValue
 * @returns {boolean}
 */
function isWalkableTileValue(tileValue) {
  var def =
    clientTileDefs[clientTileNameForValue(tileValue)] || clientTileDefs.ground;
  return !!def.walkable;
}

/**
 * @returns {{terrain: Record<string, any>, object: Record<string, any>}}
 */
function createEmptyClientWorldMods() {
  return { terrain: {}, object: {} };
}

/**
 * @param {*} raw
 * @returns {{terrain: Record<string, any>, object: Record<string, any>}}
 */
function normalizeWorldMods(raw) {
  var out = createEmptyClientWorldMods();
  if (!raw || typeof raw !== "object") return out;
  ["terrain", "object"].forEach(function (layer) {
    var mods = raw[layer];
    if (!mods || typeof mods !== "object") return;
    Object.keys(mods).forEach(function (tileKey) {
      var mod = mods[tileKey];
      if (!mod || typeof mod !== "object") return;
      out[layer][tileKey] = {
        row: Number(mod.row),
        col: Number(mod.col),
        tile_type: String(mod.tile_type || "ground"),
        actor_id: mod.actor_id ? String(mod.actor_id) : "",
        actor_type: mod.actor_type ? String(mod.actor_type) : "",
        payload:
          mod.payload && typeof mod.payload === "object" ? mod.payload : {},
      };
    });
  });
  return out;
}

/**
 * @returns {{terrain: Record<string, any>, object: Record<string, any>}}
 */
function buildLegacyWorldModsFromBootstrap() {
  var mods = createEmptyClientWorldMods();
  var bootTrees = TREE_MODS || {};
  var bootHouses = HOUSE_MODS || {};
  Object.keys(bootTrees).forEach(function (tileKey) {
    var tree = bootTrees[tileKey];
    var parts = tileKey.split("_");
    var row = Number(parts[0]);
    var col = Number(parts[1]);
    if (!tree || !isFinite(row) || !isFinite(col)) return;
    mods.object[tileKey] = {
      row: row,
      col: col,
      tile_type: tree.action === "plant" ? "pine_tree" : "ground",
      actor_id: String(tree.planted_by || tree.cut_by || ""),
      actor_type: "player",
      payload: { source_kind: "tree", action: String(tree.action || "") },
    };
  });
  Object.keys(bootHouses).forEach(function (tileKey) {
    var house = bootHouses[tileKey];
    var parts = tileKey.split("_");
    var row = Number(parts[0]);
    var col = Number(parts[1]);
    if (!house || !isFinite(row) || !isFinite(col)) return;
    mods.object[tileKey] = {
      row: row,
      col: col,
      tile_type: "house",
      actor_id: String(house.built_by || ""),
      actor_type: String(house.actor_type || "player"),
      payload: { source_kind: "house" },
    };
  });
  return mods;
}

/**
 * @param {{terrain: Record<string, any>, object: Record<string, any>}} mods
 * @returns {boolean}
 */
function hasAnyWorldMods(mods) {
  return (
    !!mods &&
    ((mods.terrain && Object.keys(mods.terrain).length > 0) ||
      (mods.object && Object.keys(mods.object).length > 0))
  );
}

var worldMods = normalizeWorldMods(
  typeof WORLD_MODS !== "undefined" ? WORLD_MODS : null,
);
if (!hasAnyWorldMods(worldMods)) {
  worldMods = buildLegacyWorldModsFromBootstrap();
}

/**
 * @returns {void}
 */
function applyWorldModsToClientMap() {
  ["terrain", "object"].forEach(function (layer) {
    var mods = worldMods[layer] || {};
    Object.keys(mods).forEach(function (tileKey) {
      var mod = mods[tileKey];
      if (!mod) return;
      var row = Number(mod.row);
      var col = Number(mod.col);
      if (row < 0 || row >= 100 || col < 0 || col >= 100) return;
      MAP[row][col] = clientTileValueForName(mod.tile_type);
    });
  });
}

/**
 * @returns {void}
 */
function rebuildLegacyDynamicViews() {
  dynamicTrees = {};
  dynamicHouses = {};
  Object.keys(worldMods.object || {}).forEach(function (tileKey) {
    var mod = worldMods.object[tileKey];
    var payload =
      mod && mod.payload && typeof mod.payload === "object" ? mod.payload : {};
    if (payload.source_kind === "tree") {
      dynamicTrees[tileKey] = {
        action: String(payload.action || "plant"),
        actor_type: mod.actor_type || "player",
        actor_id: mod.actor_id || "",
      };
    }
    if (payload.source_kind === "house") {
      dynamicHouses[tileKey] = {
        built_by: mod.actor_id || "",
        actor_type: mod.actor_type || "player",
      };
    }
  });
}

var dynamicTrees = {};
var dynamicHouses = {};
applyWorldModsToClientMap();
rebuildLegacyDynamicViews();

function applyHouseAction(action, row, col, actorType, actorId) {
  var tileKey = row + "_" + col;
  if (action === "build_house") {
    worldMods.object[tileKey] = {
      row: row,
      col: col,
      tile_type: "house",
      actor_id: actorId || "",
      actor_type: actorType || "player",
      payload: { source_kind: "house" },
    };
    MAP[row][col] = clientTileValueForName("house");
  } else if (action === "destroy_house") {
    delete worldMods.object[tileKey];
    MAP[row][col] = clientTileValueForName("ground");
  }
  rebuildLegacyDynamicViews();
}

function applyTreeAction(action, row, col, actorType, actorId) {
  var tileKey = row + "_" + col;
  if (action === "plant") {
    worldMods.object[tileKey] = {
      row: row,
      col: col,
      tile_type: "pine_tree",
      actor_id: actorId || "",
      actor_type: actorType || "player",
      payload: { source_kind: "tree", action: "plant" },
    };
    MAP[row][col] = clientTileValueForName("pine_tree");
  } else if (action === "cut") {
    worldMods.object[tileKey] = {
      row: row,
      col: col,
      tile_type: "ground",
      actor_id: actorId || "",
      actor_type: actorType || "player",
      payload: { source_kind: "tree", action: "cut" },
    };
    MAP[row][col] = clientTileValueForName("ground");
  }
  rebuildLegacyDynamicViews();
}

function normalizeClientInventory(inv) {
  if (!inv || typeof inv !== "object") {
    return { left_hand: null, right_hand: null, inventory: [] };
  }
  var out = {
    left_hand: inv.left_hand && inv.left_hand.id ? inv.left_hand : null,
    right_hand: inv.right_hand && inv.right_hand.id ? inv.right_hand : null,
    inventory: Array.isArray(inv.inventory)
      ? inv.inventory.filter(function (it) {
          return it && it.id && it.type;
        })
      : [],
  };
  return out;
}

function normalizeClientWorldItems(items) {
  var out = {};
  if (!items || typeof items !== "object") return out;
  for (var tileKey in items) {
    if (!Array.isArray(items[tileKey])) continue;
    var filtered = items[tileKey]
      .filter(function (it) {
        return it && it.id && it.type;
      })
      .map(function (it) {
        return {
          id: it.id,
          type: it.type,
          destination_world_id: it.destination_world_id,
          destination_world_type: it.destination_world_type,
        };
      });
    if (filtered.length > 0) out[tileKey] = filtered;
  }
  return out;
}

function normalizeWorldType(worldType) {
  var normalized = String(worldType || "").toLowerCase();
  if (
    normalized === "forest" ||
    normalized === "island" ||
    normalized === "cave" ||
    normalized === "building"
  ) {
    return normalized;
  }
  return "forest";
}

function worldTypeLabel(worldType) {
  var normalized = normalizeWorldType(worldType);
  if (normalized === "island") return "Island";
  if (normalized === "cave") return "Cave";
  if (normalized === "building") return "House";
  return "Forest";
}

function portalDestinationLabel(item) {
  var destinationType = normalizeWorldType(
    item && item.destination_world_type
      ? item.destination_world_type
      : "forest",
  );
  var worldLabel = worldTypeLabel(destinationType);
  if (item && item.destination_world_id) {
    return worldLabel + " world (#" + String(item.destination_world_id) + ")";
  }
  return worldLabel + " world";
}

var PORTAL_BUILD_ACTIONS = [
  "build_portal_forest",
  "build_portal_island",
  "build_portal_cave",
  "build_portal_building",
];

var worldItemsByTile = normalizeClientWorldItems(WORLD_ITEMS || {});
var playerInventory = normalizeClientInventory(PLAYER_INV);
var inventoryPanelVisible = false;
var inventoryAutoHideTimer = null;
var usePickerVisible = false;

// ── Communication state ──────────────────────────────────────────────────
var playerNick = PLAYER_NICK || "";
var onlinePlayersList = ONLINE_PLAYERS || [];
var playersPanelVisible = false;
var playersPollTimer = null;

var chatPanelVisible = false;
var chatActiveTab = "world"; // 'world' | 'dm'
var worldChatMessages = INITIAL_CHAT || [];
var dmIndex = INITIAL_DM_INDEX || [];
var dmThreads = {}; // { [otherUserId]: Message[] }
var activeDmUserId = null;
var unreadDmCount = 0;

function treeActionsForItemType(type) {
  if (type === "portal_builder") {
    return PORTAL_BUILD_ACTIONS.concat(["remove_portal"]);
  }
  if (type === "hammer") return ["build_house", "destroy_house"];
  if (type === "tree_planter") return ["plant"];
  if (type === "saw") return ["cut"];
  if (type === "kantele") return ["play_tune"];
  if (type === "rowan_charm") return ["place_blessing"];
  if (type === "portal") return ["portal_travel"];
  if (type === "starter_kit") return ["return_home"];
  return [];
}

function treeActionLabel(action) {
  if (action === "plant") {
    return t("tree_action.plant", "Use tree planting spade (plant)");
  }
  if (action === "cut") {
    return t("tree_action.cut", "Use saw (cut)");
  }
  if (action === "build_house") {
    return t("tree_action.build_house", "Use hammer (build house)");
  }
  if (action === "destroy_house") {
    return t("tree_action.destroy_house", "Use hammer (destroy house)");
  }
  if (action === "build_portal") {
    return t("tree_action.build_portal", "Use portal builder (build portal)");
  }
  if (action === "build_portal_forest") {
    return t(
      "tree_action.build_portal_forest",
      "Use portal builder (build forest portal)",
    );
  }
  if (action === "build_portal_island") {
    return t(
      "tree_action.build_portal_island",
      "Use portal builder (build island portal)",
    );
  }
  if (action === "build_portal_cave") {
    return t(
      "tree_action.build_portal_cave",
      "Use portal builder (build cave portal)",
    );
  }
  if (action === "build_portal_building") {
    return t(
      "tree_action.build_portal_building",
      "Use portal builder (build house portal)",
    );
  }
  if (action === "remove_portal") {
    return t("tree_action.remove_portal", "Use portal builder (remove portal)");
  }
  if (action === "play_tune") {
    return t("tree_action.play_tune", "Play kantele tune");
  }
  if (action === "place_blessing") {
    return t("tree_action.place_blessing", "Place rowan blessing");
  }
  if (action === "portal_travel") {
    return t("tree_action.portal_travel", "Use portal (new world)");
  }
  if (action === "return_home") {
    return t("tree_action.return_home", "Travel to the old oak");
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
  var tileItems = worldItemsByTile[avatarRow + "_" + avatarCol];
  if (Array.isArray(tileItems)) {
    for (var k = 0; k < tileItems.length; k++) all.push(tileItems[k]);
  }
  for (var j = 0; j < all.length; j++) {
    var actions = treeActionsForItemType(all[j] && all[j].type);
    if (!Array.isArray(actions)) continue;
    for (var m = 0; m < actions.length; m++) {
      if (!actions[m]) continue;
      actionsByType[actions[m]] = true;
    }
  }
  return Object.keys(actionsByType);
}

function closeUsePicker() {
  usePickerVisible = false;
  document.getElementById("hud-use-picker").style.display = "none";
  document.getElementById("use-picker-actions").innerHTML = "";
}

function updateUseButtonState() {
  var btn = document.getElementById("btn-use");
  if (!btn) return;
  var actions = getOwnedTreeActions();
  if (actions.length === 0) {
    btn.disabled = true;
    btn.style.opacity = "0.45";
  } else {
    btn.disabled = false;
    btn.style.opacity = "1";
  }
  if (actions.length < 2) closeUsePicker();
}

function openUsePicker(actions) {
  var container = document.getElementById("use-picker-actions");
  container.innerHTML = "";
  for (var i = 0; i < actions.length; i++) {
    var action = actions[i];
    var btn = document.createElement("button");
    btn.textContent = treeActionLabel(action);
    btn.onclick = (function (a) {
      return function () {
        closeUsePicker();
        postTreeAction(a);
      };
    })(action);
    container.appendChild(btn);
  }
  usePickerVisible = true;
  document.getElementById("hud-use-picker").style.display = "block";
}

function inventoryItemLabel(item) {
  if (!item || !item.type) return t("inventory.empty", "empty");
  var type = String(item.type);
  return t(itemTypeToLabelKey(type), humanizeType(type));
}

function updateHeldHud() {
  document.getElementById("held-left").textContent = playerInventory.left_hand
    ? inventoryItemLabel(playerInventory.left_hand)
    : "-";
  document.getElementById("held-right").textContent = playerInventory.right_hand
    ? inventoryItemLabel(playerInventory.right_hand)
    : "-";
  updateUseButtonState();
}

var cheatClickCount = 0;
var cheatClickResetTimer = null;
var lastCheatTapAt = 0;
var cheatToastTimer = null;

function showCheatToast(message, isError) {
  var toast = document.getElementById("hud-cheat-toast");
  if (!toast) return;
  toast.textContent = message;
  if (isError) toast.classList.add("error");
  else toast.classList.remove("error");
  toast.style.display = "block";
  if (cheatToastTimer) clearTimeout(cheatToastTimer);
  cheatToastTimer = setTimeout(
    function () {
      toast.style.display = "none";
      toast.classList.remove("error");
      cheatToastTimer = null;
    },
    isError ? 2600 : 1800,
  );
}

function showHudToast(message, isError) {
  showCheatToast(message, isError);
}

function applyCheatResult(result) {
  if (!result || !result.ok) {
    console.log("Cheat failed:", result && result.error);
    showCheatToast("Item cheat failed", true);
    return false;
  }
  applyItemStateFromResult(result);
  showInventoryPanel(2500);
  console.log("Cheat granted items:", result.granted_count || 0);
  showCheatToast(
    "Item cheat activated: +" + String(result.granted_count || 0) + " items",
    false,
  );
  return true;
}

function postCheatViaTreeAction() {
  return fetchWithAuth("/virtual-world/tree-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "cheat_grant_all" }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (result) {
      applyCheatResult(result);
    });
}

function postCheatGrantAllItems() {
  fetchWithAuth("/virtual-world/cheat-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (result) {
      if (!applyCheatResult(result)) {
        return postCheatViaTreeAction();
      }
    })
    .catch(function (err) {
      if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED"))
        return;
      postCheatViaTreeAction().catch(function (innerErr) {
        if (
          innerErr &&
          (innerErr.code === "AUTH_401" || innerErr.code === "AUTH_STOPPED")
        )
          return;
        console.error("Cheat request failed:", innerErr);
        showCheatToast("Item cheat request failed", true);
      });
    });
}

function initCheatTrigger() {
  var nameEl = document.getElementById("legend-ground");
  if (!nameEl) return;
  nameEl.style.cursor = "pointer";
  nameEl.title = "Triple click for test items";
  function onNameCheatTap() {
    var now = Date.now();
    if (now - lastCheatTapAt < 180) return;
    lastCheatTapAt = now;
    cheatClickCount += 1;
    nameEl.style.opacity = "0.8";
    nameEl.title = "Triple click for test items (" + cheatClickCount + "/3)";
    if (cheatClickResetTimer) clearTimeout(cheatClickResetTimer);
    cheatClickResetTimer = setTimeout(function () {
      cheatClickCount = 0;
      nameEl.style.opacity = "1";
      nameEl.title = "Triple click for test items";
      cheatClickResetTimer = null;
    }, 2000);
    if (cheatClickCount >= 3) {
      cheatClickCount = 0;
      if (cheatClickResetTimer) {
        clearTimeout(cheatClickResetTimer);
        cheatClickResetTimer = null;
      }
      nameEl.style.opacity = "1";
      nameEl.title = "Triple click for test items";
      showCheatToast("Activating item cheat...", false);
      postCheatGrantAllItems();
    }
  }
  nameEl.addEventListener("click", onNameCheatTap);
  nameEl.addEventListener("pointerup", onNameCheatTap);
  nameEl.addEventListener(
    "touchend",
    function (e) {
      e.preventDefault();
      onNameCheatTap();
    },
    { passive: false },
  );
}

// ── Constants ─────────────────────────────────────────────────────────────
var ROWS = 100;
var COLS = 100;
var TILE = 2; // world units per tile
var MOVE_INTERVAL = 160; // ms between steps
var MAX_PENDING_MOVES = 40;

var avatarRow = INIT_ROW;
var avatarCol = INIT_COL;
var targetX = avatarCol * TILE + TILE / 2;
var targetZ = avatarRow * TILE + TILE / 2;
var moveSeq = INIT_SEQ; // last confirmed server sequence number
var lastAssignedSeq = INIT_SEQ; // last seq assigned to any move (queued or in-flight)

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
var camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  300,
);

// Camera orbit state (spherical coordinates around map centre)
var camR = 50; // distance
var camTheta = Math.PI / 4; // azimuth (horizontal rotation)
var camPhi = 0.67; // elevation above horizontal (radians)

function updateCamera() {
  var ax = avatar.position.x;
  var az = avatar.position.z;
  camera.position.set(
    ax + camR * Math.cos(camPhi) * Math.sin(camTheta),
    camR * Math.sin(camPhi),
    az + camR * Math.cos(camPhi) * Math.cos(camTheta),
  );
  camera.lookAt(ax, 0, az);
}
// Seed initial camera position using spawn coords (avatar not yet created here)
camera.position.set(
  targetX + camR * Math.cos(camPhi) * Math.sin(camTheta),
  camR * Math.sin(camPhi),
  targetZ + camR * Math.cos(camPhi) * Math.cos(camTheta),
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
var geoFloorOverlay = new THREE.BoxGeometry(TILE, 0.05, TILE);
var matGroundA = new THREE.MeshLambertMaterial({ color: 0x7ab648 });
var matGroundB = new THREE.MeshLambertMaterial({ color: 0x6da040 });
var matSandA = new THREE.MeshLambertMaterial({ color: 0xd7c182 });
var matSandB = new THREE.MeshLambertMaterial({ color: 0xcbb170 });
var matCaveFloorA = new THREE.MeshLambertMaterial({ color: 0x6a6b72 });
var matCaveFloorB = new THREE.MeshLambertMaterial({ color: 0x5a5c63 });
var matWoodFloorA = new THREE.MeshLambertMaterial({ color: 0x9b6c3f });
var matWoodFloorB = new THREE.MeshLambertMaterial({ color: 0x835730 });

var geoSpruceTrunk = new THREE.CylinderGeometry(0.11, 0.16, 0.95, 6);
var geoSpruceCanopyLow = new THREE.ConeGeometry(0.78, 1.5, 8);
var geoSpruceCanopyMid = new THREE.ConeGeometry(0.58, 1.15, 8);
var geoSpruceCanopyTop = new THREE.ConeGeometry(0.36, 0.8, 8);
var matSpruceTrunk = new THREE.MeshLambertMaterial({ color: 0x6d4726 });
var matSpruceLow = new THREE.MeshLambertMaterial({ color: 0x2b5730 });
var matSpruceMid = new THREE.MeshLambertMaterial({ color: 0x36673a });
var matSpruceTop = new THREE.MeshLambertMaterial({ color: 0x447b45 });

var geoPineTrunk = new THREE.CylinderGeometry(0.09, 0.14, 1.05, 6);
var geoPineCanopyLow = new THREE.ConeGeometry(0.48, 1.05, 8);
var geoPineCanopyMid = new THREE.ConeGeometry(0.34, 0.8, 8);
var geoPineCanopyTop = new THREE.ConeGeometry(0.2, 0.52, 8);
var matPineTrunk = new THREE.MeshLambertMaterial({ color: 0x7d4f2a });
var matPineLow = new THREE.MeshLambertMaterial({ color: 0x2d8a3e });
var matPineMid = new THREE.MeshLambertMaterial({ color: 0x3c9f4b });
var matPineTop = new THREE.MeshLambertMaterial({ color: 0x56bf62 });

var geoOakTrunk = new THREE.CylinderGeometry(0.18, 0.28, 1.3, 8);
var geoOakCanopyCore = new THREE.SphereGeometry(0.58, 10, 10);
var geoOakCanopySide = new THREE.SphereGeometry(0.42, 10, 10);
var matOakTrunk = new THREE.MeshLambertMaterial({ color: 0x6c4729 });
var matOakCore = new THREE.MeshLambertMaterial({ color: 0x4f8b42 });
var matOakSide = new THREE.MeshLambertMaterial({ color: 0x6aa651 });
var geoWaterTile = new THREE.BoxGeometry(TILE, 0.12, TILE);
var geoRock = new THREE.DodecahedronGeometry(0.42, 0);
var geoMountain = new THREE.ConeGeometry(0.78, 1.9, 7);
var matOcean = new THREE.MeshLambertMaterial({ color: 0x2f6fa3 });
var matLake = new THREE.MeshLambertMaterial({ color: 0x4f91c9 });
var matRiver = new THREE.MeshLambertMaterial({ color: 0x62b9d9 });
var matRock = new THREE.MeshLambertMaterial({ color: 0x7f8892 });
var matMountain = new THREE.MeshLambertMaterial({ color: 0x8a8178 });
var geoHouseFloor = new THREE.BoxGeometry(1.82, 0.16, 1.82);
var geoHouseBody = new THREE.BoxGeometry(1.56, 1.18, 1.56);
var geoHouseWallNorthSouth = new THREE.BoxGeometry(1.62, 1.06, 0.12);
var geoHouseWallEastWest = new THREE.BoxGeometry(0.12, 1.06, 1.62);
var geoHouseRoofCore = new THREE.BoxGeometry(1.74, 0.28, 1.74);
var geoHouseRoofNorthSouth = new THREE.BoxGeometry(1.9, 0.14, 0.28);
var geoHouseRoofEastWest = new THREE.BoxGeometry(0.28, 0.14, 1.9);
var geoHouseDoor = new THREE.BoxGeometry(0.34, 0.72, 0.08);
var geoHouseChimney = new THREE.BoxGeometry(0.22, 0.62, 0.22);
var matHouseFloor = new THREE.MeshLambertMaterial({ color: 0x8c6b49 });
var matHouseBody = new THREE.MeshLambertMaterial({ color: 0xcaa476 });
var matHouseWall = new THREE.MeshLambertMaterial({ color: 0x845c3b });
var matHouseRoof = new THREE.MeshLambertMaterial({ color: 0x81503c });
var matHouseDoor = new THREE.MeshLambertMaterial({ color: 0x4e311f });
var matHouseChimney = new THREE.MeshLambertMaterial({ color: 0x6a6767 });

function isOldOakTile(row, col) {
  return String(worldId) === "10000" && row === 50 && col === 50;
}

// ── Build tiles with InstancedMesh (efficient for large worlds) ────────────
function tileX(col) {
  return col * TILE + TILE / 2;
}
function tileZ(row) {
  return row * TILE + TILE / 2;
}

var dummy = new THREE.Object3D();
dummy.rotation.set(0, 0, 0);
dummy.scale.set(1, 1, 1);

function setInstanceTransform(mesh, index, x, y, z, scaleX, scaleY, scaleZ) {
  dummy.position.set(x, y, z);
  dummy.scale.set(scaleX || 1, scaleY || 1, scaleZ || 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function finalizeInstancedMesh(mesh) {
  if (!mesh) return;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
}

function disposeInstancedMeshes(meshes) {
  for (var i = 0; i < meshes.length; i++) {
    if (meshes[i]) meshes[i].dispose();
  }
}

function setTreeMeshVisibility(visible) {
  var display = !!visible;
  iPineTrunk.visible = display;
  iPineCanopyLow.visible = display;
  iPineCanopyMid.visible = display;
  iPineCanopyTop.visible = display;
  if (oakGroup) oakGroup.visible = display;
}

function buildOakGroup() {
  if (String(worldId) !== "10000") return null;
  var group = new THREE.Group();
  var oakX = tileX(50);
  var oakZ = tileZ(50);

  var oakTrunk = new THREE.Mesh(geoOakTrunk, matOakTrunk);
  oakTrunk.position.set(oakX, 0.65, oakZ);
  oakTrunk.castShadow = true;
  oakTrunk.receiveShadow = true;
  group.add(oakTrunk);

  var canopyCore = new THREE.Mesh(geoOakCanopyCore, matOakCore);
  canopyCore.position.set(oakX, 1.95, oakZ);
  canopyCore.scale.set(1.2, 0.95, 1.15);
  canopyCore.castShadow = true;
  canopyCore.receiveShadow = true;
  group.add(canopyCore);

  var canopyLeft = new THREE.Mesh(geoOakCanopySide, matOakSide);
  canopyLeft.position.set(oakX - 0.38, 1.82, oakZ + 0.1);
  canopyLeft.scale.set(1.05, 0.9, 1);
  canopyLeft.castShadow = true;
  canopyLeft.receiveShadow = true;
  group.add(canopyLeft);

  var canopyRight = new THREE.Mesh(geoOakCanopySide, matOakSide);
  canopyRight.position.set(oakX + 0.36, 1.78, oakZ - 0.08);
  canopyRight.scale.set(0.98, 0.86, 0.96);
  canopyRight.castShadow = true;
  canopyRight.receiveShadow = true;
  group.add(canopyRight);

  var canopyFront = new THREE.Mesh(geoOakCanopySide, matOakSide);
  canopyFront.position.set(oakX + 0.05, 1.7, oakZ + 0.42);
  canopyFront.scale.set(0.88, 0.76, 0.92);
  canopyFront.castShadow = true;
  canopyFront.receiveShadow = true;
  group.add(canopyFront);

  return group;
}

function countTilesByValue(tileValue) {
  var count = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      if (MAP[row][col] === tileValue) count++;
    }
  }
  return count;
}

var iOcean = null;
var iLake = null;
var iRiver = null;
var iRock = null;
var iMountain = null;
var iSandA = null;
var iSandB = null;
var iCaveFloorA = null;
var iCaveFloorB = null;
var iWoodFloorA = null;
var iWoodFloorB = null;

function countParityTiles(tileName, parity) {
  var tileValue = clientTileValueForName(tileName);
  var count = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      if (((row + col) & 1) !== parity) continue;
      if (MAP[row][col] === tileValue) count++;
    }
  }
  return count;
}

function rebuildFloorOverlayMeshes() {
  scene.remove(
    iSandA,
    iSandB,
    iCaveFloorA,
    iCaveFloorB,
    iWoodFloorA,
    iWoodFloorB,
  );
  disposeInstancedMeshes([
    iSandA,
    iSandB,
    iCaveFloorA,
    iCaveFloorB,
    iWoodFloorA,
    iWoodFloorB,
  ]);

  iSandA = new THREE.InstancedMesh(
    geoFloorOverlay,
    matSandA,
    countParityTiles("sand", 0),
  );
  iSandB = new THREE.InstancedMesh(
    geoFloorOverlay,
    matSandB,
    countParityTiles("sand", 1),
  );
  iCaveFloorA = new THREE.InstancedMesh(
    geoFloorOverlay,
    matCaveFloorA,
    countParityTiles("cave_floor", 0),
  );
  iCaveFloorB = new THREE.InstancedMesh(
    geoFloorOverlay,
    matCaveFloorB,
    countParityTiles("cave_floor", 1),
  );
  iWoodFloorA = new THREE.InstancedMesh(
    geoFloorOverlay,
    matWoodFloorA,
    countParityTiles("wood_floor", 0),
  );
  iWoodFloorB = new THREE.InstancedMesh(
    geoFloorOverlay,
    matWoodFloorB,
    countParityTiles("wood_floor", 1),
  );

  var sandAIdx = 0;
  var sandBIdx = 0;
  var caveAIdx = 0;
  var caveBIdx = 0;
  var woodAIdx = 0;
  var woodBIdx = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      var tileValue = MAP[row][col];
      var x = tileX(col);
      var z = tileZ(row);
      var parity = (row + col) & 1;
      if (tileValue === clientTileValueForName("sand")) {
        setInstanceTransform(
          parity === 0 ? iSandA : iSandB,
          parity === 0 ? sandAIdx++ : sandBIdx++,
          x,
          0.01,
          z,
          1,
          1,
          1,
        );
      } else if (tileValue === clientTileValueForName("cave_floor")) {
        setInstanceTransform(
          parity === 0 ? iCaveFloorA : iCaveFloorB,
          parity === 0 ? caveAIdx++ : caveBIdx++,
          x,
          0.01,
          z,
          1,
          1,
          1,
        );
      } else if (tileValue === clientTileValueForName("wood_floor")) {
        setInstanceTransform(
          parity === 0 ? iWoodFloorA : iWoodFloorB,
          parity === 0 ? woodAIdx++ : woodBIdx++,
          x,
          0.01,
          z,
          1,
          1,
          1,
        );
      }
    }
  }

  finalizeInstancedMesh(iSandA);
  finalizeInstancedMesh(iSandB);
  finalizeInstancedMesh(iCaveFloorA);
  finalizeInstancedMesh(iCaveFloorB);
  finalizeInstancedMesh(iWoodFloorA);
  finalizeInstancedMesh(iWoodFloorB);
  scene.add(iSandA, iSandB, iCaveFloorA, iCaveFloorB, iWoodFloorA, iWoodFloorB);
}

function rebuildTerrainFeatureMeshes() {
  scene.remove(iOcean, iLake, iRiver, iRock, iMountain);
  disposeInstancedMeshes([iOcean, iLake, iRiver, iRock, iMountain]);

  iOcean = new THREE.InstancedMesh(
    geoWaterTile,
    matOcean,
    countTilesByValue(clientTileValueForName("ocean")),
  );
  iLake = new THREE.InstancedMesh(
    geoWaterTile,
    matLake,
    countTilesByValue(clientTileValueForName("lake")),
  );
  iRiver = new THREE.InstancedMesh(
    geoWaterTile,
    matRiver,
    countTilesByValue(clientTileValueForName("river")),
  );
  iRock = new THREE.InstancedMesh(
    geoRock,
    matRock,
    countTilesByValue(clientTileValueForName("rock")),
  );
  iMountain = new THREE.InstancedMesh(
    geoMountain,
    matMountain,
    countTilesByValue(clientTileValueForName("mountain")),
  );

  var oceanIdx = 0;
  var lakeIdx = 0;
  var riverIdx = 0;
  var rockIdx = 0;
  var mountainIdx = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      var tileValue = MAP[row][col];
      var x = tileX(col);
      var z = tileZ(row);
      if (tileValue === clientTileValueForName("ocean")) {
        setInstanceTransform(iOcean, oceanIdx++, x, -0.055, z, 1, 1, 1);
      } else if (tileValue === clientTileValueForName("lake")) {
        setInstanceTransform(iLake, lakeIdx++, x, -0.05, z, 1, 1, 1);
      } else if (tileValue === clientTileValueForName("river")) {
        setInstanceTransform(iRiver, riverIdx++, x, -0.045, z, 1, 1, 1);
      } else if (tileValue === clientTileValueForName("rock")) {
        setInstanceTransform(iRock, rockIdx++, x, 0.2, z, 1, 1, 1);
      } else if (tileValue === clientTileValueForName("mountain")) {
        setInstanceTransform(iMountain, mountainIdx++, x, 0.92, z, 1, 1, 1);
      }
    }
  }

  finalizeInstancedMesh(iOcean);
  finalizeInstancedMesh(iLake);
  finalizeInstancedMesh(iRiver);
  finalizeInstancedMesh(iRock);
  finalizeInstancedMesh(iMountain);
  scene.add(iOcean, iLake, iRiver, iRock, iMountain);
}

function countRenderablePines() {
  var count = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      if (
        MAP[row][col] === clientTileValueForName("pine_tree") &&
        !isOldOakTile(row, col)
      ) {
        count++;
      }
    }
  }
  return count;
}

function hasHouseAt(row, col) {
  return (
    row >= 0 &&
    row < ROWS &&
    col >= 0 &&
    col < COLS &&
    MAP[row][col] === clientTileValueForName("house")
  );
}

function buildHouseTile(row, col) {
  var group = new THREE.Group();
  var x = tileX(col);
  var z = tileZ(row);
  var north = hasHouseAt(row - 1, col);
  var east = hasHouseAt(row, col + 1);
  var south = hasHouseAt(row + 1, col);
  var west = hasHouseAt(row, col - 1);

  var floor = new THREE.Mesh(geoHouseFloor, matHouseFloor);
  floor.position.set(x, 0.08, z);
  floor.castShadow = true;
  floor.receiveShadow = true;
  group.add(floor);

  var body = new THREE.Mesh(geoHouseBody, matHouseBody);
  body.position.set(x, 0.74, z);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  var roof = new THREE.Mesh(geoHouseRoofCore, matHouseRoof);
  roof.position.set(x, 1.48, z);
  roof.rotation.y = north || south ? 0 : Math.PI / 4;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  function addWall(geometry, material, px, py, pz) {
    var mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  function addRoofTrim(geometry, px, py, pz) {
    var mesh = new THREE.Mesh(geometry, matHouseRoof);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  if (!north) {
    addWall(geoHouseWallNorthSouth, matHouseWall, x, 0.75, z - 0.77);
    addRoofTrim(geoHouseRoofNorthSouth, x, 1.62, z - 0.92);
  }
  if (!south) {
    addWall(geoHouseWallNorthSouth, matHouseWall, x, 0.75, z + 0.77);
    addRoofTrim(geoHouseRoofNorthSouth, x, 1.62, z + 0.92);
  }
  if (!east) {
    addWall(geoHouseWallEastWest, matHouseWall, x + 0.77, 0.75, z);
    addRoofTrim(geoHouseRoofEastWest, x + 0.92, 1.62, z);
  }
  if (!west) {
    addWall(geoHouseWallEastWest, matHouseWall, x - 0.77, 0.75, z);
    addRoofTrim(geoHouseRoofEastWest, x - 0.92, 1.62, z);
  }

  if (!south) {
    var door = new THREE.Mesh(geoHouseDoor, matHouseDoor);
    door.position.set(x, 0.49, z + 0.79);
    door.castShadow = true;
    door.receiveShadow = true;
    group.add(door);
  }

  if (!north && !west) {
    var chimney = new THREE.Mesh(geoHouseChimney, matHouseChimney);
    chimney.position.set(x - 0.42, 1.82, z - 0.42);
    chimney.castShadow = true;
    chimney.receiveShadow = true;
    group.add(chimney);
  }

  return group;
}

var houseMeshGroup = new THREE.Group();
scene.add(houseMeshGroup);

function clearHouseMeshes() {
  while (houseMeshGroup.children.length > 0) {
    houseMeshGroup.remove(
      houseMeshGroup.children[houseMeshGroup.children.length - 1],
    );
  }
}

function rebuildHouseMeshes() {
  clearHouseMeshes();
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      if (!hasHouseAt(row, col)) continue;
      houseMeshGroup.add(buildHouseTile(row, col));
    }
  }
}

function rebuildPineInstances() {
  scene.remove(iPineTrunk, iPineCanopyLow, iPineCanopyMid, iPineCanopyTop);
  disposeInstancedMeshes([
    iPineTrunk,
    iPineCanopyLow,
    iPineCanopyMid,
    iPineCanopyTop,
  ]);

  var pineCount = countRenderablePines();
  iPineTrunk = new THREE.InstancedMesh(geoPineTrunk, matPineTrunk, pineCount);
  iPineCanopyLow = new THREE.InstancedMesh(
    geoPineCanopyLow,
    matPineLow,
    pineCount,
  );
  iPineCanopyMid = new THREE.InstancedMesh(
    geoPineCanopyMid,
    matPineMid,
    pineCount,
  );
  iPineCanopyTop = new THREE.InstancedMesh(
    geoPineCanopyTop,
    matPineTop,
    pineCount,
  );

  var pineIdx = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      if (
        MAP[row][col] !== clientTileValueForName("pine_tree") ||
        isOldOakTile(row, col)
      ) {
        continue;
      }
      var pineX = tileX(col);
      var pineZ = tileZ(row);
      setInstanceTransform(iPineTrunk, pineIdx, pineX, 0.52, pineZ, 1, 1, 1);
      setInstanceTransform(
        iPineCanopyLow,
        pineIdx,
        pineX,
        1.12,
        pineZ,
        1,
        1,
        1,
      );
      setInstanceTransform(
        iPineCanopyMid,
        pineIdx,
        pineX,
        1.62,
        pineZ,
        1,
        1,
        1,
      );
      setInstanceTransform(iPineCanopyTop, pineIdx, pineX, 2.0, pineZ, 1, 1, 1);
      pineIdx++;
    }
  }

  finalizeInstancedMesh(iPineTrunk);
  finalizeInstancedMesh(iPineCanopyLow);
  finalizeInstancedMesh(iPineCanopyMid);
  finalizeInstancedMesh(iPineCanopyTop);
  scene.add(iPineTrunk, iPineCanopyLow, iPineCanopyMid, iPineCanopyTop);
}

// Count instances
var cntA = 0,
  cntB = 0,
  cntWall = 0,
  cntSpruce = 0;
for (var r = 0; r < ROWS; r++) {
  for (var c = 0; c < COLS; c++) {
    if ((r + c) % 2 === 0) cntA++;
    else cntB++;
    if (MAP[r][c] === clientTileValueForName("spruce_thicket")) {
      cntWall++;
      cntSpruce++;
    }
  }
}

var iGroundA = new THREE.InstancedMesh(geoGround, matGroundA, cntA);
var iGroundB = new THREE.InstancedMesh(geoGround, matGroundB, cntB);
var iSpruceTrunk = new THREE.InstancedMesh(
  geoSpruceTrunk,
  matSpruceTrunk,
  cntSpruce,
);
var iSpruceCanopyLow = new THREE.InstancedMesh(
  geoSpruceCanopyLow,
  matSpruceLow,
  cntSpruce,
);
var iSpruceCanopyMid = new THREE.InstancedMesh(
  geoSpruceCanopyMid,
  matSpruceMid,
  cntSpruce,
);
var iSpruceCanopyTop = new THREE.InstancedMesh(
  geoSpruceCanopyTop,
  matSpruceTop,
  cntSpruce,
);
var iPineTrunk = null;
var iPineCanopyLow = null;
var iPineCanopyMid = null;
var iPineCanopyTop = null;
var oakGroup = buildOakGroup();

iGroundA.receiveShadow = true;
iGroundB.receiveShadow = true;
finalizeInstancedMesh(iSpruceTrunk);
finalizeInstancedMesh(iSpruceCanopyLow);
finalizeInstancedMesh(iSpruceCanopyMid);
finalizeInstancedMesh(iSpruceCanopyTop);

var idxA = 0,
  idxB = 0,
  idxW = 0;
for (var r = 0; r < ROWS; r++) {
  for (var c = 0; c < COLS; c++) {
    var tx = tileX(c),
      tz = tileZ(r);

    dummy.position.set(tx, -0.125, tz);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    if ((r + c) % 2 === 0) iGroundA.setMatrixAt(idxA++, dummy.matrix);
    else iGroundB.setMatrixAt(idxB++, dummy.matrix);

    if (MAP[r][c] === clientTileValueForName("spruce_thicket")) {
      setInstanceTransform(iSpruceTrunk, idxW, tx, 0.48, tz, 1, 1, 1);
      setInstanceTransform(iSpruceCanopyLow, idxW, tx, 1.08, tz, 1, 1, 1);
      setInstanceTransform(iSpruceCanopyMid, idxW, tx, 1.62, tz, 1, 1, 1);
      setInstanceTransform(iSpruceCanopyTop, idxW, tx, 2.04, tz, 1, 1, 1);
      idxW++;
    }
  }
}

iGroundA.instanceMatrix.needsUpdate = true;
iGroundB.instanceMatrix.needsUpdate = true;
iSpruceTrunk.instanceMatrix.needsUpdate = true;
iSpruceCanopyLow.instanceMatrix.needsUpdate = true;
iSpruceCanopyMid.instanceMatrix.needsUpdate = true;
iSpruceCanopyTop.instanceMatrix.needsUpdate = true;

scene.add(
  iGroundA,
  iGroundB,
  iSpruceTrunk,
  iSpruceCanopyLow,
  iSpruceCanopyMid,
  iSpruceCanopyTop,
);
if (oakGroup) scene.add(oakGroup);
rebuildFloorOverlayMeshes();
rebuildTerrainFeatureMeshes();
rebuildPineInstances();
rebuildHouseMeshes();

// ── Function to rebuild tree instances after tree modifications ───────────
function updateTreeInstances() {
  rebuildPineInstances();
}

function updateHouseMeshes() {
  rebuildHouseMeshes();
}

function updateTerrainFeatureMeshes() {
  rebuildFloorOverlayMeshes();
  rebuildTerrainFeatureMeshes();
}

// ── Ground items (MVP visuals) ─────────────────────────────────────────
var itemGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
var itemMatCache = {};
var itemMeshGroup = new THREE.Group();
scene.add(itemMeshGroup);

function itemTypeColor(type) {
  if (type === "saw") return 0xbfc6d0;
  if (type === "hammer") return 0x8f7f6d;
  if (type === "knife") return 0xd8dee8;
  if (type === "flower") return 0xec6ea4;
  if (type === "tree_planter") return 0x54d08a;
  if (type === "portal_builder") return 0xff9f1c;
  if (type === "kantele") return 0xc58d52;
  if (type === "rowan_charm") return 0xc73a32;
  if (type === "rune_stone") return 0x7b7f8a;
  if (type === "juniper_bundle") return 0x51764f;
  if (type === "birch_bark_letter") return 0xe4d2a0;
  if (type === "blessing_marker") return 0xb54434;
  if (type === "portal") return 0x5ad7ff;
  return 0xf3ca40;
}

function getItemMaterial(type) {
  if (!itemMatCache[type]) {
    itemMatCache[type] = new THREE.MeshLambertMaterial({
      color: itemTypeColor(type),
    });
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
    var parts = tileKey.split("_");
    var row = Number(parts[0]);
    var col = Number(parts[1]);
    if (!isFinite(row) || !isFinite(col)) continue;
    var arr = worldItemsByTile[tileKey];
    if (!Array.isArray(arr)) continue;
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      var mesh = new THREE.Mesh(itemGeo, getItemMaterial(item.type));
      var ox = ((i % 3) - 1) * 0.2;
      var oz = ((Math.floor(i / 3) % 3) - 1) * 0.2;
      var oy = 0.2 + Math.floor(i / 9) * 0.16;
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
avatar.add(makePart(0.2, 0.35, 0.22, 0x1a252f, -0.14, 0.175, 0));
avatar.add(makePart(0.2, 0.35, 0.22, 0x1a252f, 0.14, 0.175, 0));
// Body
avatar.add(makePart(0.55, 0.65, 0.4, 0x2980b9, 0, 0.525, 0));
// Head
avatar.add(makePart(0.45, 0.45, 0.45, 0xf4c78c, 0, 0.975, 0));
// Eyes (on +Z face of head)
avatar.add(makePart(0.09, 0.09, 0.06, 0x222222, -0.11, 0.995, 0.225));
avatar.add(makePart(0.09, 0.09, 0.06, 0x222222, 0.11, 0.995, 0.225));

avatar.position.set(targetX, 0, targetZ);
avatar.rotation.y = INIT_ROTATION;
scene.add(avatar);

// ── Target indicator (shows where tree actions will occur) ───────────────
var targetIndicatorGeo = new THREE.BoxGeometry(TILE * 0.9, 0.3, TILE * 0.9);
var targetIndicatorMat = new THREE.MeshBasicMaterial({
  color: 0x00ff00,
  transparent: true,
  opacity: 0.3,
  side: THREE.DoubleSide,
});
var targetIndicator = new THREE.Mesh(targetIndicatorGeo, targetIndicatorMat);
targetIndicator.position.set(targetX, 0.15, targetZ);
scene.add(targetIndicator);

// ── Remote players ───────────────────────────────────────────────────────
var remoteAvatars = {}; // { pid: { group, targetX, targetZ, targetRot, seq } }
var npcAvatars = {}; // { npcId: { group, targetX, targetZ, targetRot, seq } }

function avatarBodyColor(pid) {
  var h = 0;
  for (var i = 0; i < pid.length; i++)
    h = (Math.imul(31, h) + pid.charCodeAt(i)) | 0;
  var hue = (h >>> 0) % 360;
  // Shift away from ~200-240 (local avatar blue)
  if (hue >= 200 && hue <= 240) hue = (hue + 80) % 360;
  return new THREE.Color("hsl(" + hue + ",70%,55%)");
}

function makeRemoteAvatar(pid) {
  var g = new THREE.Group();
  function rp(w, h, d, color, px, py, pz) {
    var mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: color }),
    );
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    return mesh;
  }
  var bc = avatarBodyColor(pid);
  g.add(rp(0.2, 0.35, 0.22, 0x1a252f, -0.14, 0.175, 0));
  g.add(rp(0.2, 0.35, 0.22, 0x1a252f, 0.14, 0.175, 0));
  g.add(rp(0.55, 0.65, 0.4, bc, 0, 0.525, 0));
  g.add(rp(0.45, 0.45, 0.45, 0xf4c78c, 0, 0.975, 0));
  g.add(rp(0.09, 0.09, 0.06, 0x222222, -0.11, 0.995, 0.225));
  g.add(rp(0.09, 0.09, 0.06, 0x222222, 0.11, 0.995, 0.225));
  return g;
}

function upsertRemoteAvatar(pid, row, col, seq, rotation) {
  if (pid === playerId) return;
  var tx = tileX(col),
    tz = tileZ(row);
  var incomingRot = Number(rotation);
  var hasIncomingRot = isFinite(incomingRot);
  var incomingSeq = seq !== undefined && seq !== null ? Number(seq) : null;
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
      row: Number(row),
      col: Number(col),
    };
  } else {
    var knownSeq = Number(remoteAvatars[pid].seq || 0);
    if (incomingSeq !== null && incomingSeq <= knownSeq) return;
    remoteAvatars[pid].targetX = tx;
    remoteAvatars[pid].targetZ = tz;
    if (hasIncomingRot) remoteAvatars[pid].targetRot = incomingRot;
    if (incomingSeq !== null) remoteAvatars[pid].seq = incomingSeq;
    remoteAvatars[pid].row = Number(row);
    remoteAvatars[pid].col = Number(col);
    refreshTileDetailIfOpen();
  }
}

function removeRemoteAvatar(pid) {
  if (remoteAvatars[pid]) {
    scene.remove(remoteAvatars[pid].group);
    delete remoteAvatars[pid];
    refreshTileDetailIfOpen();
  }
}

function npcBodyColor(npcId) {
  var h = 0;
  for (var i = 0; i < npcId.length; i++) {
    h = (Math.imul(31, h) + npcId.charCodeAt(i)) | 0;
  }
  var hue = 25 + ((h >>> 0) % 80);
  return new THREE.Color("hsl(" + hue + ",65%,52%)");
}

function makeNPCAvatar(npcId) {
  var g = new THREE.Group();
  function np(w, h, d, color, px, py, pz) {
    var mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: color }),
    );
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    return mesh;
  }
  var bc = npcBodyColor(npcId);
  g.add(np(0.2, 0.35, 0.22, 0x5c4033, -0.14, 0.175, 0));
  g.add(np(0.2, 0.35, 0.22, 0x5c4033, 0.14, 0.175, 0));
  g.add(np(0.55, 0.65, 0.4, bc, 0, 0.525, 0));
  g.add(np(0.45, 0.45, 0.45, 0xd9b38c, 0, 0.975, 0));
  g.add(np(0.09, 0.09, 0.06, 0x222222, -0.11, 0.995, 0.225));
  g.add(np(0.09, 0.09, 0.06, 0x222222, 0.11, 0.995, 0.225));
  return g;
}

function npcDisplayName(npcId) {
  if (npcAvatars[npcId] && npcAvatars[npcId].displayName) {
    return npcAvatars[npcId].displayName;
  }
  return shortenId(npcId);
}

function upsertNPCAvatar(npcId, row, col, seq, rotation, displayName) {
  if (!npcId || !isFinite(Number(row)) || !isFinite(Number(col))) return;
  var tx = tileX(Number(col));
  var tz = tileZ(Number(row));
  var incomingRot = Number(rotation);
  var hasIncomingRot = isFinite(incomingRot);
  var incomingSeq = seq !== undefined && seq !== null ? Number(seq) : null;
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
      row: Number(row),
      col: Number(col),
      displayName: displayName || shortenId(npcId),
    };
  } else {
    var knownSeq = Number(npcAvatars[npcId].seq || 0);
    if (incomingSeq !== null && incomingSeq <= knownSeq) return;
    npcAvatars[npcId].targetX = tx;
    npcAvatars[npcId].targetZ = tz;
    if (hasIncomingRot) npcAvatars[npcId].targetRot = incomingRot;
    if (incomingSeq !== null) npcAvatars[npcId].seq = incomingSeq;
    npcAvatars[npcId].row = Number(row);
    npcAvatars[npcId].col = Number(col);
    if (displayName) npcAvatars[npcId].displayName = displayName;
    refreshTileDetailIfOpen();
  }
}

function removeNPCAvatar(npcId) {
  if (npcAvatars[npcId]) {
    scene.remove(npcAvatars[npcId].group);
    delete npcAvatars[npcId];
    refreshTileDetailIfOpen();
  }
}

function syncNPCSnapshot(npcs) {
  if (!Array.isArray(npcs)) return;
  var seen = {};
  for (var i = 0; i < npcs.length; i++) {
    var n = npcs[i];
    if (!n || typeof n.npc_id !== "string") continue;
    seen[n.npc_id] = true;
    upsertNPCAvatar(n.npc_id, n.row, n.col, n.seq, n.rotation, n.display_name);
  }
  for (var npcId in npcAvatars) {
    if (!seen[npcId]) removeNPCAvatar(npcId);
  }
}

function fetchNPCSnapshot() {
  if (authState !== AUTH_STATE_OK) return;
  fetchJsonWithAuth("/virtual-world/npcs")
    .then(function (npcs) {
      syncNPCSnapshot(npcs);
    })
    .catch(function (err) {
      if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED"))
        return;
    });
}

function fetchItemSnapshot() {
  if (authState !== AUTH_STATE_OK) return;
  fetchJsonWithAuth("/virtual-world/current-world")
    .then(function (payload) {
      if (!payload || typeof payload !== "object") return;
      if (payload.inventory) {
        playerInventory = normalizeClientInventory(payload.inventory);
      }
      if (Array.isArray(payload.items)) {
        var next = {};
        for (var i = 0; i < payload.items.length; i++) {
          var it = payload.items[i];
          if (!it || !it.id || !it.type) continue;
          var key = it.row + "_" + it.col;
          if (!next[key]) next[key] = [];
          next[key].push({
            id: it.id,
            type: it.type,
            destination_world_id: it.destination_world_id,
            destination_world_type: it.destination_world_type,
          });
        }
        worldItemsByTile = next;
      }
      rebuildItemMeshes();
      refreshTileDetailIfOpen();
      updateHeldHud();
      if (inventoryPanelVisible) renderInventoryPanel();
    })
    .catch(function (err) {
      if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED"))
        return;
    });
}

var pendingMoves = []; // FIFO queue of {row,col,seq} — one entry per step
var moveInFlight = false;

function flushMove() {
  if (authState !== AUTH_STATE_OK) return;
  if (moveInFlight || pendingMoves.length === 0) return;
  var payload = pendingMoves.shift();
  moveInFlight = true;
  fetchWithAuth("/virtual-world/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // world_id and player_id are determined server-side from auth session
    body: JSON.stringify({
      fromRow: payload.fromRow,
      fromCol: payload.fromCol,
      toRow: payload.toRow,
      toCol: payload.toCol,
      rotation: payload.rotation,
      seq: payload.seq,
      session_id: sessionId,
    }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (result) {
      moveInFlight = false;
      if (!result.ok) {
        if (result.stale) {
          // Another tab took over — our queued moves are based on an old seq.
          // Reconcile to server canonical state, then discard queue.
          if (
            typeof result.row === "number" &&
            typeof result.col === "number"
          ) {
            avatarRow = result.row;
            avatarCol = result.col;
            targetX = tileX(avatarCol);
            targetZ = tileZ(avatarRow);
            document.getElementById("pos-col").textContent = avatarCol;
            document.getElementById("pos-row").textContent = avatarRow;
          }
          if (typeof result.seq === "number" && isFinite(result.seq)) {
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

            lastPos = {
              row: pendingMoves[i].toRow,
              col: pendingMoves[i].toCol,
            };
          }

          // Update client state to match the end of the rebuilt queue for smooth continuation
          avatarRow = lastPos.row;
          avatarCol = lastPos.col;
          targetX = tileX(avatarCol);
          targetZ = tileZ(avatarRow);
          document.getElementById("pos-col").textContent = avatarCol;
          document.getElementById("pos-row").textContent = avatarRow;
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
    })
    .catch(function (err) {
      moveInFlight = false;
      if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED")) {
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
  navigator.sendBeacon(
    "/virtual-world/leave",
    new Blob(["{}"], { type: "application/json" }),
  );
}

function fetchSnapshot() {
  if (authState !== AUTH_STATE_OK) return;
  fetchJsonWithAuth("/virtual-world/players")
    .then(function (players) {
      players.forEach(function (p) {
        if (p.player_id === playerId) {
          var snapSeq = Number(p.seq || 0);
          // Snapshot healing for same-user tabs when SSE is delayed/flaky.
          // Only accept snapshot if we're idle AND it's not stale (older than our current state).
          if (
            !moveInFlight &&
            pendingMoves.length === 0 &&
            snapSeq >= moveSeq
          ) {
            avatarRow = p.row;
            avatarCol = p.col;
            targetX = tileX(avatarCol);
            targetZ = tileZ(avatarRow);
            if (isFinite(Number(p.rotation))) {
              avatar.rotation.y = Number(p.rotation);
            }
            moveSeq = snapSeq;
            lastAssignedSeq = snapSeq;
            document.getElementById("pos-col").textContent = avatarCol;
            document.getElementById("pos-row").textContent = avatarRow;
          }
        } else {
          upsertRemoteAvatar(p.player_id, p.row, p.col, p.seq, p.rotation);
        }
      });
    })
    .catch(function (err) {
      if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED"))
        return;
    });
}

function ensureCurrentWorld() {
  if (authState !== AUTH_STATE_OK) return;
  fetchJsonWithAuth("/virtual-world/current-world")
    .then(function (state) {
      if (
        state &&
        state.world_id &&
        String(state.world_id) !== String(worldId)
      ) {
        window.location.href = "/virtual-world/play";
      }
    })
    .catch(function (err) {
      if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED"))
        return;
    });
}

function initMultiplayer() {
  scheduleSessionRefresh();
  updateHeldHud();
  renderInventoryPanel();
  initCheatTrigger();
  fetchSnapshot();
  syncNPCSnapshot(NPCS);
  fetchNPCSnapshot();
  fetchItemSnapshot();

  var eventsSseParams = new URLSearchParams({
    world_id: String(worldId),
    recipient_id: String(playerId),
  });
  var eventsSseUrl = "/virtual-world/events?" + eventsSseParams.toString();
  var eventsReconnectTimer = null;
  var eventsRetryCount = 0;
  var eventsWaitingForOnline = false;

  function handlePlayerMovedEvent(payload) {
    if (!payload || !payload.player_id) return;
    if (payload.leaving) {
      if (payload.player_id === playerId && payload.switched_world) {
        window.location.href = "/virtual-world/play";
        return;
      }
      removeRemoteAvatar(payload.player_id);
      return;
    }
    if (payload.player_id === playerId) {
      var incomingSeq = Number(payload.seq);
      var hasIncomingSeq = isFinite(incomingSeq);
      if (!moveInFlight && pendingMoves.length === 0) {
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
          document.getElementById("pos-col").textContent = avatarCol;
          document.getElementById("pos-row").textContent = avatarRow;
          updateUseButtonState();
        }
      }
      return;
    }
    upsertRemoteAvatar(
      payload.player_id,
      payload.row,
      payload.col,
      payload.seq,
      payload.rotation,
    );
  }

  function handleTreeChangedEvent(payload) {
    if (!payload) return;
    applyTreeAction(
      payload.action,
      payload.row,
      payload.col,
      payload.actor_type || "player",
      payload.actor_id || payload.player_id || "",
    );

    updateTreeInstances();
    refreshTileDetailIfOpen();
  }

  function handleHouseChangedEvent(payload) {
    if (!payload) return;
    applyHouseAction(
      payload.action,
      payload.row,
      payload.col,
      payload.actor_type || "player",
      payload.actor_id || payload.player_id || "",
    );
    updateHouseMeshes();
    refreshTileDetailIfOpen();
  }

  function handleNpcMovedEvent(payload) {
    if (!payload || typeof payload.npc_id !== "string") return;
    if (payload.despawn) {
      removeNPCAvatar(payload.npc_id);
      return;
    }
    upsertNPCAvatar(
      payload.npc_id,
      payload.row,
      payload.col,
      payload.seq,
      payload.rotation,
      payload.display_name,
    );
  }

  function handleChatMessageEvent(msg) {
    if (!msg || !msg.id) return;
    var exists = worldChatMessages.some(function (m) {
      return m.id === msg.id;
    });
    if (!exists) {
      worldChatMessages.push(msg);
      if (chatPanelVisible && chatActiveTab === "world") renderWorldChat();
    }
  }

  function handleDirectMessageEvent(msg) {
    if (!msg || !msg.id || !msg.sender_id) return;
    var senderId = msg.sender_id;
    if (!dmThreads[senderId]) dmThreads[senderId] = [];
    var exists = dmThreads[senderId].some(function (m) {
      return m.id === msg.id;
    });
    if (!exists) {
      dmThreads[senderId].push(msg);
      if (dmIndex.indexOf(senderId) === -1) dmIndex.push(senderId);
    }
    if (
      chatPanelVisible &&
      chatActiveTab === "dm" &&
      activeDmUserId === senderId
    ) {
      renderDMThread(senderId);
    } else {
      unreadDmCount += 1;
      updateChatUnreadBadge();
    }
  }

  function handleUnifiedStreamMessage(message) {
    if (!message || typeof message.type !== "string") return;
    var payload = message.payload;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch (e) {}
    }
    switch (message.type) {
      case "player_moved":
        handlePlayerMovedEvent(payload);
        return;
      case "tree_changed":
        handleTreeChangedEvent(payload);
        return;
      case "house_changed":
        handleHouseChangedEvent(payload);
        return;
      case "npc_moved":
        handleNpcMovedEvent(payload);
        return;
      case "item_changed":
        fetchItemSnapshot();
        return;
      case "chat_message":
        handleChatMessageEvent(payload);
        return;
      case "direct_message":
        handleDirectMessageEvent(payload);
        return;
    }
  }

  function openUnifiedSSE() {
    var es = new EventSource(eventsSseUrl);
    es.onmessage = function (evt) {
      eventsRetryCount = 0;
      try {
        handleUnifiedStreamMessage(JSON.parse(evt.data));
      } catch (e) {}
    };
    es.onerror = function () {
      es.close();
      scheduleSSEAuthCheck("virtualWorldEvents");
      if (
        authState === AUTH_STATE_EXPIRED ||
        authState === AUTH_STATE_REDIRECTING
      )
        return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!eventsWaitingForOnline) {
          eventsWaitingForOnline = true;
          function handleEventsOnline() {
            window.removeEventListener("online", handleEventsOnline);
            eventsWaitingForOnline = false;
            openUnifiedSSE();
          }
          window.addEventListener("online", handleEventsOnline);
        }
        return;
      }
      if (eventsReconnectTimer) clearTimeout(eventsReconnectTimer);
      fetchSnapshot();
      fetchNPCSnapshot();
      fetchItemSnapshot();
      eventsRetryCount += 1;
      eventsReconnectTimer = setTimeout(
        openUnifiedSSE,
        getSSEReconnectDelayMs(eventsRetryCount),
      );
    };
    return es;
  }

  openUnifiedSSE();

  // Announce departure
  window.addEventListener("beforeunload", postLeave);

  // Fire a heartbeat immediately when a backgrounded tab regains focus.
  // Browsers throttle setInterval to ≥60 s in background tabs, which can
  // cause presence to expire (TTL = 90 s). Sending one ping on visibility
  // restore keeps the entry fresh without needing a shorter poll interval.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && authState === AUTH_STATE_OK) {
      fetchWithAuth("/virtual-world/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      }).catch(function () {});
    }
  });

  // Heartbeat — keep presence alive and resync snapshot every 15 s
  setInterval(function () {
    if (authState !== AUTH_STATE_OK) return;
    // Use dedicated heartbeat endpoint: only refreshes the presence TTL
    // without sending a position, so idle tabs can't overwrite a moving tab.
    fetchWithAuth("/virtual-world/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(function (err) {
      if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED"))
        return;
    });
    ensureCurrentWorld();
    fetchSnapshot();
    fetchNPCSnapshot();
    fetchItemSnapshot();
  }, 5000);
}

// ── Collision & movement ─────────────────────────────────────────────────
function isWalkable(r, c) {
  return (
    r >= 0 && r < ROWS && c >= 0 && c < COLS && isWalkableTileValue(MAP[r][c])
  );
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
    document.getElementById("pos-col").textContent = nc;
    document.getElementById("pos-row").textContent = nr;
    updateUseButtonState();
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
    "," +
    (inputY > 0 ? 1 : inputY < 0 ? -1 : 0);

  var forward = getCameraForwardCardinal();
  // Right direction in grid space for the current camera orientation.
  var right = { dr: forward.dc, dc: -forward.dr };

  var absX = Math.abs(inputX);
  var absY = Math.abs(inputY);
  var axis = null;
  var axisBias = 0.12;
  if (absX > absY + axisBias) axis = "horizontal";
  else if (absY > absX + axisBias) axis = "vertical";
  else if (lastMoveIntentKey === intentKey && lastMoveAxis) axis = lastMoveAxis;
  else axis = absY >= absX ? "vertical" : "horizontal";

  var dr = 0;
  var dc = 0;
  if (axis === "horizontal") {
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
  fetchWithAuth("/virtual-world/new-world", { method: "POST" })
    .then(function () {
      window.location.href = "/virtual-world/play";
    })
    .catch(function () {
      window.location.href = "/virtual-world/play";
    });
}

function postTreeAction(action) {
  fetchWithAuth("/virtual-world/tree-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: action,
      row: avatarRow,
      col: avatarCol,
      rotation: avatar.rotation.y,
    }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (result) {
      if (!result.ok) {
        console.log("Use failed:", result.error);
        if (result.error) showHudToast(result.error, true);
        updateUseButtonState();
        return;
      }
      applyItemStateFromResult(result);
      if (
        (result.action === "plant" || result.action === "cut") &&
        typeof result.row === "number" &&
        typeof result.col === "number"
      ) {
        applyTreeAction(
          result.action,
          result.row,
          result.col,
          "player",
          playerId,
        );
        updateTreeInstances();
        refreshTileDetailIfOpen();
      }
      if (
        (result.action === "build_house" ||
          result.action === "destroy_house") &&
        typeof result.row === "number" &&
        typeof result.col === "number"
      ) {
        applyHouseAction(
          result.action,
          result.row,
          result.col,
          "player",
          playerId,
        );
        updateHouseMeshes();
        refreshTileDetailIfOpen();
      }
      if (result.toast_message) showHudToast(result.toast_message, false);
      if (result.switched_world) {
        window.location.href = "/virtual-world/play";
      }
    })
    .catch(function (err) {
      if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED"))
        return;
      console.error("Use request failed:", err);
    });
}

function useItem() {
  var actions = getOwnedTreeActions().sort();
  if (actions.length === 0) {
    console.log("No usable item available in inventory or on this tile");
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
  var leftDiv = document.getElementById("inv-left-hand");
  var rightDiv = document.getElementById("inv-right-hand");
  var listDiv = document.getElementById("inv-list");
  var countDiv = document.getElementById("inv-count");

  function handHtml(title, slot, item) {
    var label = item ? inventoryItemLabel(item) : "empty";
    var html =
      '<div class="name">' +
      title +
      "</div>" +
      "<div>" +
      label +
      "</div>" +
      '<div class="inv-actions">';
    if (item) {
      if (!item.non_droppable) {
        html +=
          "<button onclick=\"dropFromSlot('" + slot + "')\">Drop</button>";
      }
      html +=
        "<button onclick=\"equipToInventory('" + slot + "')\">Store</button>";
    }
    html += "</div>";
    return html;
  }

  leftDiv.innerHTML = handHtml(
    t("inventory.left_hand", "Left Hand"),
    "left_hand",
    playerInventory.left_hand,
  );
  rightDiv.innerHTML = handHtml(
    t("inventory.right_hand", "Right Hand"),
    "right_hand",
    playerInventory.right_hand,
  );

  if (
    !Array.isArray(playerInventory.inventory) ||
    playerInventory.inventory.length === 0
  ) {
    listDiv.innerHTML =
      '<div class="inv-row"><span class="label" style="grid-column:1/-1">' +
      t("inventory.backpack_empty", "Backpack empty") +
      "</span></div>";
  } else {
    var rows = "";
    for (var i = 0; i < playerInventory.inventory.length; i++) {
      var item = playerInventory.inventory[i];
      var itemActions = treeActionsForItemType(item.type);
      var actionBtns = "";
      for (var ai = 0; ai < itemActions.length; ai++) {
        actionBtns +=
          "<button onclick=\"postTreeAction('" +
          itemActions[ai] +
          "')\">" +
          treeActionLabel(itemActions[ai]) +
          "</button> ";
      }
      rows +=
        '<div class="inv-row">' +
        '<span class="label">' +
        inventoryItemLabel(item) +
        "</span>" +
        '<span class="inv-row-actions">' +
        '<button onclick="equipFromInventory(' +
        i +
        ",'left_hand')\">L</button> " +
        '<button onclick="equipFromInventory(' +
        i +
        ",'right_hand')\">R</button> " +
        (item.non_droppable
          ? ""
          : '<button onclick="dropFromInventory(' + i + ')">Drop</button> ') +
        actionBtns +
        "</span>" +
        "</div>";
    }
    listDiv.innerHTML = rows;
  }

  countDiv.textContent =
    playerInventory.inventory.length +
    " " +
    t("inventory.items_suffix", "items");
  updateHeldHud();
}

function showInventoryPanel(autoHideMs) {
  inventoryPanelVisible = true;
  document.getElementById("hud-inventory-panel").style.display = "block";
  renderInventoryPanel();
  if (inventoryAutoHideTimer) {
    clearTimeout(inventoryAutoHideTimer);
    inventoryAutoHideTimer = null;
  }
  if (autoHideMs && autoHideMs > 0) {
    inventoryAutoHideTimer = setTimeout(function () {
      closeInventoryPanel();
    }, autoHideMs);
  }
}

function closeInventoryPanel() {
  inventoryPanelVisible = false;
  document.getElementById("hud-inventory-panel").style.display = "none";
  if (inventoryAutoHideTimer) {
    clearTimeout(inventoryAutoHideTimer);
    inventoryAutoHideTimer = null;
  }
}

function toggleInventoryPanel() {
  if (inventoryPanelVisible) closeInventoryPanel();
  else showInventoryPanel(0);
}

// ── Players panel ────────────────────────────────────────────────────────

function formatRelTime(ts) {
  if (!ts) return "-";
  var diff = Math.max(0, Date.now() - ts);
  var secs = Math.floor(diff / 1000);
  if (secs < 60) return secs + "s ago";
  var mins = Math.floor(secs / 60);
  if (mins < 60) return mins + "m ago";
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.floor(hrs / 24) + "d ago";
}

function renderPlayersPanel() {
  var tbody = document.getElementById("players-table-body");
  if (!tbody) return;
  if (!onlinePlayersList.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="color:rgba(255,255,255,0.4);font-style:italic;text-align:center;padding:10px;">No players online</td></tr>';
    return;
  }
  var rows = onlinePlayersList.map(function (p) {
    var isMe = p.player_id === playerId;
    var sameWorld = String(p.world_id) === String(worldId);
    var nick = escapeHtml(p.nick || p.player_id.slice(0, 16));
    var worldLabel = p.world_id ? escapeHtml(String(p.world_id)) : "-";
    var youBadge = isMe ? '<span class="you-badge">(you)</span>' : "";
    var mapBadge =
      sameWorld && !isMe
        ? '<span title="In your world" style="margin-left:4px;font-size:10px;opacity:0.7;">🗺️</span>'
        : "";
    var dmBtn = isMe
      ? ""
      : '<button class="btn-dm" data-uid="' +
        escapeHtml(p.player_id) +
        '" onclick="openChatPanelDM(this.dataset.uid)">💬 DM</button>';
    return (
      "<tr" +
      (sameWorld && !isMe
        ? ' style="background:rgba(255,255,255,0.05);"'
        : "") +
      ">" +
      "<td>" +
      nick +
      youBadge +
      mapBadge +
      "</td>" +
      '<td><span class="world-badge">' +
      worldLabel +
      "</span></td>" +
      '<td class="time-cell">' +
      formatRelTime(p.login_at) +
      "</td>" +
      '<td class="time-cell">' +
      formatRelTime(p.last_active) +
      "</td>" +
      "<td>" +
      dmBtn +
      "</td>" +
      "</tr>"
    );
  });
  tbody.innerHTML = rows.join("");
}

function showPlayersPanel() {
  playersPanelVisible = true;
  document.getElementById("hud-players-panel").style.display = "block";
  renderPlayersPanel();
  // Fetch fresh data immediately when opening, then poll every 15 s
  fetchWithAuth("/virtual-world/online-players")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (Array.isArray(data)) {
        onlinePlayersList = data;
        renderPlayersPanel();
      }
    })
    .catch(function () {});
  if (playersPollTimer) clearInterval(playersPollTimer);
  playersPollTimer = setInterval(function () {
    if (!playersPanelVisible) {
      clearInterval(playersPollTimer);
      playersPollTimer = null;
      return;
    }
    fetchWithAuth("/virtual-world/online-players")
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (Array.isArray(data)) {
          onlinePlayersList = data;
          renderPlayersPanel();
        }
      })
      .catch(function () {});
  }, 15000);
}

function closePlayersPanel() {
  playersPanelVisible = false;
  document.getElementById("hud-players-panel").style.display = "none";
  if (playersPollTimer) {
    clearInterval(playersPollTimer);
    playersPollTimer = null;
  }
}

function togglePlayersPanel() {
  if (playersPanelVisible) closePlayersPanel();
  else showPlayersPanel();
}

function startNickEdit() {
  var inp = document.getElementById("nick-input");
  if (inp) {
    inp.value = playerNick || "";
    inp.onkeydown = function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        commitNickEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelNickEdit();
      }
    };
  }
  document.getElementById("nick-display").style.display = "none";
  document.getElementById("nick-edit-btn").style.display = "none";
  document.getElementById("nick-edit-row").style.display = "inline";
  if (inp) {
    inp.focus();
    inp.select();
  }
}

function cancelNickEdit() {
  document.getElementById("nick-display").style.display = "";
  document.getElementById("nick-edit-btn").style.display = "";
  document.getElementById("nick-edit-row").style.display = "none";
}

function commitNickEdit() {
  var inp = document.getElementById("nick-input");
  if (!inp) return;
  var val = inp.value.trim().slice(0, 24);
  if (!val) {
    cancelNickEdit();
    return;
  }
  fetchWithAuth("/virtual-world/set-nickname", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nick: val }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (data && data.ok) {
        playerNick = data.nick;
        var display = document.getElementById("nick-display");
        if (display) display.textContent = data.nick;
        for (var i = 0; i < onlinePlayersList.length; i++) {
          if (onlinePlayersList[i].player_id === playerId) {
            onlinePlayersList[i].nick = data.nick;
            break;
          }
        }
        if (playersPanelVisible) renderPlayersPanel();
        if (chatPanelVisible && chatActiveTab === "world") renderWorldChat();
        if (chatPanelVisible && chatActiveTab === "dm" && activeDmUserId)
          renderDMThread(activeDmUserId);
      }
      cancelNickEdit();
    })
    .catch(function () {
      cancelNickEdit();
    });
}

// ── Chat helpers ─────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatChatTime(ts) {
  var d = new Date(ts);
  return (
    d.getHours().toString().padStart(2, "0") +
    ":" +
    d.getMinutes().toString().padStart(2, "0")
  );
}

function buildMsgHtml(msg) {
  var isMe = msg.sender_id === playerId;
  // For own messages always reflect the current nick so renames apply retroactively.
  var nick = escapeHtml(
    isMe
      ? playerNick || msg.sender_nick || playerId.slice(0, 16)
      : msg.sender_nick || msg.sender_id.slice(0, 16),
  );
  var text = escapeHtml(msg.text);
  return (
    '<div class="chat-msg">' +
    '<span class="msg-nick' +
    (isMe ? " is-me" : "") +
    '">' +
    nick +
    ":</span>" +
    text +
    '<span class="msg-ts">' +
    formatChatTime(msg.ts) +
    "</span>" +
    "</div>"
  );
}

function scrollChatToBottom(containerId) {
  var el = document.getElementById(containerId);
  if (el) el.scrollTop = el.scrollHeight;
}

// ── World chat ────────────────────────────────────────────────────────────

function renderWorldChat() {
  var container = document.getElementById("world-chat-msgs");
  if (!container) return;
  container.innerHTML = worldChatMessages.map(buildMsgHtml).join("");
  scrollChatToBottom("world-chat-msgs");
}

function sendWorldChatMessage() {
  var input = document.getElementById("world-chat-input");
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  input.value = "";
  fetchWithAuth("/virtual-world/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (data && data.ok && data.message) {
        // Server echo will arrive via SSE; optimistically add to avoid duplication check
        var exists = worldChatMessages.some(function (m) {
          return m.id === data.message.id;
        });
        if (!exists) {
          worldChatMessages.push(data.message);
          if (chatPanelVisible && chatActiveTab === "world") renderWorldChat();
        }
      }
    })
    .catch(function () {});
}

// ── Chat panel ────────────────────────────────────────────────────────────

function showChatPanel() {
  chatPanelVisible = true;
  var el = document.getElementById("hud-chat-panel");
  if (el) el.classList.add("visible");
  unreadDmCount = 0;
  updateChatUnreadBadge();
  if (chatActiveTab === "world") renderWorldChat();
  else renderDMContent();
}

function closeChatPanel() {
  chatPanelVisible = false;
  var el = document.getElementById("hud-chat-panel");
  if (el) el.classList.remove("visible");
}

function toggleChatPanel() {
  if (chatPanelVisible) closeChatPanel();
  else showChatPanel();
}

function switchChatTab(tab) {
  chatActiveTab = tab;
  document
    .getElementById("chat-tab-world")
    .classList.toggle("active", tab === "world");
  document
    .getElementById("chat-tab-dm")
    .classList.toggle("active", tab === "dm");
  document
    .getElementById("chat-content-world")
    .classList.toggle("hidden", tab !== "world");
  document
    .getElementById("chat-content-dm")
    .classList.toggle("hidden", tab !== "dm");
  if (tab === "world") renderWorldChat();
  else renderDMContent();
  if (tab === "dm") {
    unreadDmCount = 0;
    updateChatUnreadBadge();
  }
}

function updateChatUnreadBadge() {
  var badge = document.getElementById("chat-unread-badge");
  var tabBadge = document.getElementById("dm-tab-badge");
  if (!badge || !tabBadge) return;
  if (unreadDmCount > 0) {
    badge.textContent = unreadDmCount > 9 ? "9+" : String(unreadDmCount);
    badge.classList.add("visible");
    tabBadge.textContent = badge.textContent;
    tabBadge.classList.add("visible");
  } else {
    badge.classList.remove("visible");
    tabBadge.classList.remove("visible");
  }
}

// Opens chat panel on DM tab and directly starts thread with a specific user.
function openChatPanelDM(otherUserId) {
  if (!chatPanelVisible) showChatPanel();
  if (chatActiveTab !== "dm") switchChatTab("dm");
  openDMThread(otherUserId);
}

// ── Direct messages ───────────────────────────────────────────────────────

function renderDMContent() {
  if (activeDmUserId) {
    renderDMThread(activeDmUserId);
  } else {
    showDMConvoList();
  }
}

function showDMConvoList() {
  activeDmUserId = null;
  var threadView = document.getElementById("dm-thread-view");
  var convoList = document.getElementById("dm-convo-list");
  if (threadView) threadView.style.display = "none";
  if (!convoList) return;
  convoList.style.display = "";
  if (!dmIndex.length) {
    convoList.innerHTML =
      '<div style="color:rgba(255,255,255,0.4);font-style:italic;font-size:12px;padding:8px;">No conversations yet. Click 💬 DM next to a player to start one.</div>';
    return;
  }
  convoList.innerHTML = dmIndex
    .map(function (uid) {
      // Try to get the nick from the online players list first
      var entry = onlinePlayersList.find(function (p) {
        return p.player_id === uid;
      });
      var nick = entry ? escapeHtml(entry.nick) : escapeHtml(uid.slice(0, 16));
      return (
        '<div class="dm-convo-item" data-uid="' +
        escapeHtml(uid) +
        '" onclick="openDMThread(this.dataset.uid)">' +
        '<span class="convo-nick">' +
        nick +
        "</span>" +
        '<span style="font-size:11px;color:#aaa;">→</span>' +
        "</div>"
      );
    })
    .join("");
}

function openDMThread(otherUserId) {
  activeDmUserId = otherUserId;
  var threadView = document.getElementById("dm-thread-view");
  var convoList = document.getElementById("dm-convo-list");
  if (convoList) convoList.style.display = "none";
  if (threadView) threadView.style.display = "flex";
  if (dmThreads[otherUserId]) {
    renderDMThread(otherUserId);
  } else {
    // Load from server
    fetchWithAuth(
      "/virtual-world/dm-history?with=" + encodeURIComponent(otherUserId),
    )
      .then(function (res) {
        return res.json();
      })
      .then(function (msgs) {
        dmThreads[otherUserId] = Array.isArray(msgs) ? msgs : [];
        if (
          !dmIndex.includes(otherUserId) &&
          dmThreads[otherUserId].length > 0
        ) {
          dmIndex.push(otherUserId);
        }
        renderDMThread(otherUserId);
      })
      .catch(function () {
        dmThreads[otherUserId] = [];
        renderDMThread(otherUserId);
      });
  }
}

function renderDMThread(otherUserId) {
  var msgs = dmThreads[otherUserId] || [];
  var container = document.getElementById("dm-thread-msgs");
  if (!container) return;
  container.innerHTML = msgs.length
    ? msgs.map(buildMsgHtml).join("")
    : '<div style="color:rgba(255,255,255,0.4);font-style:italic;font-size:12px;padding:8px;">No messages yet.</div>';
  scrollChatToBottom("dm-thread-msgs");
}

function sendDirectMessage() {
  if (!activeDmUserId) return;
  var input = document.getElementById("dm-chat-input");
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  input.value = "";
  var to = activeDmUserId;
  fetchWithAuth("/virtual-world/dm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: to, text: text }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (data && data.ok && data.message) {
        if (!dmThreads[to]) dmThreads[to] = [];
        var exists = dmThreads[to].some(function (m) {
          return m.id === data.message.id;
        });
        if (!exists) {
          dmThreads[to].push(data.message);
          if (!dmIndex.includes(to)) dmIndex.push(to);
          if (activeDmUserId === to) renderDMThread(to);
        }
      }
    })
    .catch(function () {});
}

function applyItemStateFromResult(result) {
  if (!result || typeof result !== "object") return;
  if (result.inventory) {
    playerInventory = normalizeClientInventory(result.inventory);
  }
  if (Array.isArray(result.items)) {
    // Convert flat server snapshot into tile map.
    var next = {};
    for (var i = 0; i < result.items.length; i++) {
      var it = result.items[i];
      if (!it || !it.id || !it.type) continue;
      var key = it.row + "_" + it.col;
      if (!next[key]) next[key] = [];
      next[key].push({
        id: it.id,
        type: it.type,
        destination_world_id: it.destination_world_id,
        destination_world_type: it.destination_world_type,
      });
    }
    worldItemsByTile = next;
  }
  rebuildItemMeshes();
  refreshTileDetailIfOpen();
  renderInventoryPanel();
  updateUseButtonState();
}

function postItemAction(payload, onSuccess) {
  fetchWithAuth("/virtual-world/tree-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (result) {
      if (!result || !result.ok) {
        console.log("Item action failed:", result && result.error);
        return;
      }
      applyItemStateFromResult(result);
      if (typeof onSuccess === "function") onSuccess(result);
    })
    .catch(function (err) {
      if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED"))
        return;
      console.error("Item action request failed:", err);
    });
}

function pickItemsOnTile() {
  postItemAction({ action: "pick" }, function (result) {
    if (result && Number(result.picked_count || 0) > 0) {
      showInventoryPanel(2500);
    }
  });
}

function dropFromSlot(slot) {
  postItemAction({ action: "drop", from: slot });
}

function dropFromInventory(index) {
  postItemAction({ action: "drop", from: "inventory", index: index });
}

function equipToInventory(slot) {
  postItemAction({ action: "equip", from: slot, to: "inventory" });
}

function equipFromInventory(index, slot) {
  postItemAction({
    action: "equip",
    from: "inventory",
    index: index,
    to: slot,
  });
}

// ── Tile inspector (click/tap to see square contents) ─────────────────────
var tileRaycaster = new THREE.Raycaster();
var tileRayMouse = new THREE.Vector2();
var selectedTileRow = -1;
var selectedTileCol = -1;

// Invisible flat plane covering the entire world grid, used only for raycasting
var tileColliderGeo = new THREE.PlaneGeometry(COLS * TILE, ROWS * TILE);
var tileColliderMat = new THREE.MeshBasicMaterial({
  visible: false,
  side: THREE.DoubleSide,
});
var tileCollider = new THREE.Mesh(tileColliderGeo, tileColliderMat);
tileCollider.rotation.x = -Math.PI / 2;
tileCollider.position.set(mapCX, 0, mapCZ);
scene.add(tileCollider);

function pickTileFromEvent(clientX, clientY) {
  tileRayMouse.x = (clientX / window.innerWidth) * 2 - 1;
  tileRayMouse.y = -(clientY / window.innerHeight) * 2 + 1;
  tileRaycaster.setFromCamera(tileRayMouse, camera);
  var hits = tileRaycaster.intersectObject(tileCollider);
  if (!hits.length) return null;
  var pt = hits[0].point;
  var r = Math.floor(pt.z / TILE);
  var c = Math.floor(pt.x / TILE);
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
  return { row: r, col: c };
}

function isClickOnHUD(e) {
  var el = e.target;
  while (el && el !== document.body) {
    if (el.classList && el.classList.contains("hud")) return true;
    if (el.id === "joystick-container") return true;
    el = el.parentElement;
  }
  return false;
}

function selectTile(row, col) {
  selectedTileRow = row;
  selectedTileCol = col;
  renderTileDetailPanel();
}

function closeTileDetail() {
  selectedTileRow = -1;
  selectedTileCol = -1;
  document.getElementById("hud-tile-detail").style.display = "none";
}

function refreshTileDetailIfOpen() {
  if (selectedTileRow < 0) return;
  renderTileDetailPanel();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortenId(id) {
  var s = String(id || "");
  return s.length > 18 ? s.slice(0, 16) + "\u2026" : s;
}

function getNickForPlayer(id) {
  if (id === playerId) return playerNick || shortenId(id);
  for (var i = 0; i < onlinePlayersList.length; i++) {
    if (onlinePlayersList[i].player_id === id)
      return onlinePlayersList[i].nick || shortenId(id);
  }
  return shortenId(id);
}

function renderTileDetailPanel() {
  var row = selectedTileRow;
  var col = selectedTileCol;
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
  var key = row + "_" + col;
  var isOldOakTile = String(worldId) === "10000" && row === 50 && col === 50;

  document.getElementById("tile-detail-title").textContent =
    "Square (" + col + ", " + row + ")";

  var terrainType = MAP[row][col];
  var treeMod = dynamicTrees[key];
  var terrainLabel;
  if (terrainType === clientTileValueForName("spruce_thicket")) {
    terrainLabel = t("terrain.wall", "Spruce thicket");
  } else if (terrainType === clientTileValueForName("house")) {
    terrainLabel = t("terrain.house", "House block");
  } else if (terrainType === clientTileValueForName("pine_tree")) {
    if (isOldOakTile(row, col)) {
      terrainLabel = t("terrain.old_oak", "Old oak");
    } else {
      terrainLabel =
        treeMod && treeMod.action === "plant"
          ? t("terrain.tree_planted", "Pine tree (planted)")
          : t("terrain.tree", "Pine tree");
    }
  } else if (terrainType === clientTileValueForName("ocean")) {
    terrainLabel = t("terrain.ocean", "Ocean");
  } else if (terrainType === clientTileValueForName("lake")) {
    terrainLabel = t("terrain.lake", "Lake");
  } else if (terrainType === clientTileValueForName("river")) {
    terrainLabel = t("terrain.river", "River");
  } else if (terrainType === clientTileValueForName("rock")) {
    terrainLabel = t("terrain.rock", "Rock field");
  } else if (terrainType === clientTileValueForName("mountain")) {
    terrainLabel = t("terrain.mountain", "Mountain");
  } else if (terrainType === clientTileValueForName("sand")) {
    terrainLabel = t("terrain.sand", "Sand");
  } else if (terrainType === clientTileValueForName("cave_floor")) {
    terrainLabel = t("terrain.cave_floor", "Cave floor");
  } else if (terrainType === clientTileValueForName("wood_floor")) {
    terrainLabel = t("terrain.wood_floor", "Wood floor");
  } else {
    terrainLabel =
      treeMod && treeMod.action === "cut"
        ? t("terrain.ground_tree_cut", "Forest floor (pine cut)")
        : t("terrain.ground", "Forest floor");
  }

  var tileItems = worldItemsByTile[key] || [];

  var playersHere = [];
  if (avatarRow === row && avatarCol === col) {
    playersHere.push({ id: playerId, isMe: true });
  }
  for (var rpid in remoteAvatars) {
    var ra = remoteAvatars[rpid];
    if (ra.row === row && ra.col === col) {
      playersHere.push({ id: rpid, isMe: false });
    }
  }

  var npcsHere = [];
  for (var nid in npcAvatars) {
    var na = npcAvatars[nid];
    if (na.row === row && na.col === col) {
      npcsHere.push(nid);
    }
  }

  var html = "";

  html += '<div class="tile-section">';
  html += '<div class="tile-section-label">Terrain</div>';
  html += '<div class="tile-row">' + escHtml(terrainLabel) + "</div>";
  if (
    terrainType === clientTileValueForName("house") &&
    dynamicHouses[key] &&
    dynamicHouses[key].built_by
  ) {
    html +=
      '<div class="tile-row">Built by ' +
      escHtml(getNickForPlayer(dynamicHouses[key].built_by)) +
      "</div>";
  }
  html += "</div>";

  html += '<div class="tile-section">';
  html +=
    '<div class="tile-section-label">Items (' + tileItems.length + ")</div>";
  if (tileItems.length === 0) {
    html += '<div class="tile-empty">None</div>';
  } else {
    for (var i = 0; i < tileItems.length; i++) {
      var itm = tileItems[i];
      var label = t(itemTypeToLabelKey(itm.type), humanizeType(itm.type));
      html += '<div class="tile-row">' + escHtml(label) + "</div>";
      if (itm.type === "portal") {
        html +=
          '<div class="tile-row">Leads to ' +
          escHtml(portalDestinationLabel(itm)) +
          "</div>";
      }
    }
  }
  html += "</div>";

  html += '<div class="tile-section">';
  html +=
    '<div class="tile-section-label">People (' + playersHere.length + ")</div>";
  if (playersHere.length === 0) {
    html += '<div class="tile-empty">None</div>';
  } else {
    for (var j = 0; j < playersHere.length; j++) {
      var pp = playersHere[j];
      if (pp.isMe) {
        html +=
          '<div class="tile-row tile-you">You (' +
          escHtml(getNickForPlayer(pp.id)) +
          ")</div>";
      } else {
        html +=
          '<div class="tile-row">' +
          escHtml(getNickForPlayer(pp.id)) +
          "</div>";
      }
    }
  }
  html += "</div>";

  html += '<div class="tile-section">';
  html +=
    '<div class="tile-section-label">NPCs (' + npcsHere.length + ")</div>";
  if (npcsHere.length === 0) {
    html += '<div class="tile-empty">None</div>';
  } else {
    for (var k = 0; k < npcsHere.length; k++) {
      html +=
        '<div class="tile-row">' +
        escHtml(npcDisplayName(npcsHere[k])) +
        "</div>";
    }
  }
  html += "</div>";

  document.getElementById("tile-detail-body").innerHTML = html;
  document.getElementById("hud-tile-detail").style.display = "block";
}

// ── Input ────────────────────────────────────────────────────────────────
var keys = {};
var MOVE_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "w",
  "a",
  "s",
  "d",
  "W",
  "A",
  "S",
  "D",
];

function isTypingTarget(el) {
  if (!el) return false;
  var tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

// Clear held movement keys when an input gains focus to prevent stuck movement
document.addEventListener("focusin", function (e) {
  if (isTypingTarget(e.target)) {
    MOVE_KEYS.forEach(function (k) {
      keys[k] = false;
    });
  }
});

document.addEventListener("keydown", function (e) {
  if (isTypingTarget(document.activeElement)) return;
  keys[e.key] = true;
  if (MOVE_KEYS.indexOf(e.key) !== -1) e.preventDefault();
  if (e.key === "i" || e.key === "I") {
    e.preventDefault();
    toggleInventoryPanel();
  }
});
document.addEventListener("keyup", function (e) {
  if (isTypingTarget(document.activeElement)) return;
  keys[e.key] = false;
});

// ── Camera orbit controls (drag + scroll) ────────────────────────────────
var isDragging = false;
var lastMouseX = 0,
  lastMouseY = 0;
var mouseClickStartX = 0,
  mouseClickStartY = 0;
var lastTouchX = 0,
  lastTouchY = 0;
var lastTouchDist = 0;
var touchTapStartX = 0,
  touchTapStartY = 0;

// Mouse controls (desktop)
document.addEventListener("mousedown", function (e) {
  if (e.button === 0) {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    mouseClickStartX = e.clientX;
    mouseClickStartY = e.clientY;
  }
});
document.addEventListener("mousemove", function (e) {
  if (!isDragging) return;
  var dx = e.clientX - lastMouseX;
  var dy = e.clientY - lastMouseY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  camTheta -= dx * 0.005;
  camPhi = Math.max(0.15, Math.min(1.4, camPhi - dy * 0.004));
});
document.addEventListener("mouseup", function (e) {
  if (isDragging && e.button === 0 && !isClickOnHUD(e)) {
    var ddx = e.clientX - mouseClickStartX;
    var ddy = e.clientY - mouseClickStartY;
    if (Math.sqrt(ddx * ddx + ddy * ddy) < 6) {
      var tile = pickTileFromEvent(e.clientX, e.clientY);
      if (tile) selectTile(tile.row, tile.col);
    }
  }
  isDragging = false;
});
document.addEventListener("mouseleave", function () {
  isDragging = false;
});

document.getElementById("hud-inventory-panel").addEventListener(
  "wheel",
  function (e) {
    e.stopPropagation();
  },
  { passive: true },
);

document.addEventListener(
  "wheel",
  function (e) {
    e.preventDefault();
    camR = Math.max(10, Math.min(150, camR + e.deltaY * 0.05));
  },
  { passive: false },
);

// ── Joystick element references (must be defined before touch handlers) ──
var joystickBase = document.getElementById("joystick-base");
var joystickStick = document.getElementById("joystick-stick");
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
  var treeActionsDiv = document.getElementById("hud-tree-actions");
  if (treeActionsDiv) {
    var rect = treeActionsDiv.getBoundingClientRect();
    if (
      touch.clientX >= rect.left &&
      touch.clientX <= rect.right &&
      touch.clientY >= rect.top &&
      touch.clientY <= rect.bottom
    ) {
      return true;
    }
  }
  var inventoryDiv = document.getElementById("hud-inventory-panel");
  if (inventoryDiv && inventoryDiv.style.display !== "none") {
    var invRect = inventoryDiv.getBoundingClientRect();
    if (
      touch.clientX >= invRect.left &&
      touch.clientX <= invRect.right &&
      touch.clientY >= invRect.top &&
      touch.clientY <= invRect.bottom
    ) {
      return true;
    }
  }
  var tileDetailDiv = document.getElementById("hud-tile-detail");
  if (tileDetailDiv && tileDetailDiv.style.display !== "none") {
    var tileRect = tileDetailDiv.getBoundingClientRect();
    if (
      touch.clientX >= tileRect.left &&
      touch.clientX <= tileRect.right &&
      touch.clientY >= tileRect.top &&
      touch.clientY <= tileRect.bottom
    ) {
      return true;
    }
  }
  var usePickerDiv = document.getElementById("hud-use-picker");
  if (usePickerDiv && usePickerDiv.style.display !== "none") {
    var usePickerRect = usePickerDiv.getBoundingClientRect();
    if (
      touch.clientX >= usePickerRect.left &&
      touch.clientX <= usePickerRect.right &&
      touch.clientY >= usePickerRect.top &&
      touch.clientY <= usePickerRect.bottom
    ) {
      return true;
    }
  }
  return false;
}

document.addEventListener(
  "touchstart",
  function (e) {
    // Ignore if touching the joystick or buttons
    if (
      e.touches.length === 1 &&
      !isTouchOnJoystick(e.touches[0]) &&
      !isTouchOnButtons(e.touches[0])
    ) {
      e.preventDefault();
      isTouchRotating = true;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      touchTapStartX = e.touches[0].clientX;
      touchTapStartY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      e.preventDefault();
      // Pinch to zoom
      isTouchRotating = false;
      var dx = e.touches[1].clientX - e.touches[0].clientX;
      var dy = e.touches[1].clientY - e.touches[0].clientY;
      lastTouchDist = Math.sqrt(dx * dx + dy * dy);
    }
  },
  { passive: false },
);

document.addEventListener(
  "touchmove",
  function (e) {
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
  },
  { passive: false },
);

document.addEventListener(
  "touchend",
  function (e) {
    if (e.touches.length === 0) {
      if (isTouchRotating && e.changedTouches.length > 0) {
        var ct = e.changedTouches[0];
        var tdx = ct.clientX - touchTapStartX;
        var tdy = ct.clientY - touchTapStartY;
        if (Math.sqrt(tdx * tdx + tdy * tdy) < 10) {
          var tile = pickTileFromEvent(ct.clientX, ct.clientY);
          if (tile) selectTile(tile.row, tile.col);
        }
      }
      isTouchRotating = false;
    } else if (
      e.touches.length === 1 &&
      !isTouchOnJoystick(e.touches[0]) &&
      !isTouchOnButtons(e.touches[0])
    ) {
      // Continuing with one finger after lifting second
      isTouchRotating = true;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      touchTapStartX = e.touches[0].clientX;
      touchTapStartY = e.touches[0].clientY;
    }
  },
  { passive: false },
);

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

  joystickStick.style.transform =
    "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";

  // Normalize direction
  if (distance > 10) {
    // dead zone
    joystickDirection.x = dx / maxDistance;
    joystickDirection.y = dy / maxDistance;
  } else {
    joystickDirection.x = 0;
    joystickDirection.y = 0;
  }
}

function resetJoystick() {
  joystickStick.style.transform = "translate(-50%, -50%)";
  joystickDirection.x = 0;
  joystickDirection.y = 0;
  joystickActive = false;
  joystickStick.classList.remove("active");
}

joystickBase.addEventListener(
  "touchstart",
  function (e) {
    e.preventDefault();
    e.stopPropagation();
    joystickActive = true;
    joystickStick.classList.add("active");
    updateJoystick(e.touches[0].clientX, e.touches[0].clientY);
  },
  { passive: false },
);

joystickBase.addEventListener(
  "touchmove",
  function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (joystickActive) {
      updateJoystick(e.touches[0].clientX, e.touches[0].clientY);
    }
  },
  { passive: false },
);

joystickBase.addEventListener(
  "touchend",
  function (e) {
    e.preventDefault();
    e.stopPropagation();
    resetJoystick();
  },
  { passive: false },
);

joystickBase.addEventListener(
  "touchcancel",
  function (e) {
    e.preventDefault();
    e.stopPropagation();
    resetJoystick();
  },
  { passive: false },
);

// Mouse event handlers for desktop
joystickBase.addEventListener("mousedown", function (e) {
  e.preventDefault();
  e.stopPropagation();
  joystickActive = true;
  joystickMouseActive = true;
  joystickStick.classList.add("active");
  updateJoystick(e.clientX, e.clientY);
});

document.addEventListener("mousemove", function (e) {
  if (joystickMouseActive) {
    e.preventDefault();
    updateJoystick(e.clientX, e.clientY);
  }
});

document.addEventListener("mouseup", function (e) {
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
    if (
      joystickActive &&
      (Math.abs(joystickDirection.x) > 0.15 ||
        Math.abs(joystickDirection.y) > 0.15)
    ) {
      moved = tryMoveCameraRelative(joystickDirection.x, -joystickDirection.y);
    }
    // Fallback to keyboard input (camera-relative)
    else {
      var inputX = 0;
      var inputY = 0;
      if (keys["ArrowUp"] || keys["w"] || keys["W"]) inputY += 1;
      if (keys["ArrowDown"] || keys["s"] || keys["S"]) inputY -= 1;
      if (keys["ArrowLeft"] || keys["a"] || keys["A"]) inputX -= 1;
      if (keys["ArrowRight"] || keys["d"] || keys["D"]) inputX += 1;
      if (inputX !== 0 || inputY !== 0)
        moved = tryMoveCameraRelative(inputX, inputY);
      else {
        lastMoveIntentKey = null;
        lastMoveAxis = null;
      }
    }

    if (moved) moveTimer = MOVE_INTERVAL;
  }

  // Smooth lerp toward target position
  var lerp = 1 - Math.exp((-15 * dt) / 1000);
  avatar.position.x += (targetX - avatar.position.x) * lerp;
  avatar.position.z += (targetZ - avatar.position.z) * lerp;

  // Walking bob
  var dist =
    Math.abs(avatar.position.x - targetX) +
    Math.abs(avatar.position.z - targetZ);
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
  } else if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) {
    targetCol = avatarCol + 1; // East
  } else if (angle >= (3 * Math.PI) / 4 || angle < (-3 * Math.PI) / 4) {
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
window.addEventListener("resize", function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
