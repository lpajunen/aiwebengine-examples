/// <reference path="virtual-world-browser-globals.d.ts" />
// Client core: shared typedefs, UI state, HUD pickers/toast, logout.

/**
 * @typedef {{ value: number, walkable: boolean, layer: string }} ClientTileDef
 * @typedef {{ id: string, type: string, destination_world_id?: string | number, destination_world_type?: string, non_droppable?: boolean }} ClientItem
 * @typedef {{ class_id: string, slots: Record<string, ClientItem | null>, bag: ClientItem[], values: Record<string, unknown>, left_hand: ClientItem | null, right_hand: ClientItem | null, inventory: ClientItem[] }} ClientInventory
 * @typedef {{ row: number, col: number, tile_type: string, actor_id: string, actor_type: string, payload: Record<string, any> }} ClientWorldMod
 * @typedef {{ terrain: Record<string, ClientWorldMod>, object: Record<string, ClientWorldMod> }} ClientWorldMods
 */

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function requireElementById(id) {
  var el = document.getElementById(id);
  if (!el) throw new Error("Missing required DOM element: " + id);
  return el;
}

var virtualWorldApp = getVirtualWorldApp();
var appState = virtualWorldApp.state;
var appRender = virtualWorldApp.render;

var inventoryPanelVisible = false;
/** @type {number | null} */
var inventoryAutoHideTimer = null;
var statsPanelVisible = false;
var usePickerVisible = false;
/** @type {number | null} */
var heartbeatTimer = null;
var lastHeartbeatAt = 0;
var HEARTBEAT_VISIBLE_MS = 20000;
var HEARTBEAT_ACTIVITY_MIN_GAP_MS = 5000;

// ── Communication state ──────────────────────────────────────────────────
var playerNick = PLAYER_NICK || "";
/** @type {any[]} */
var onlinePlayersList = ONLINE_PLAYERS || [];
var playersPanelVisible = false;
/** @type {number | null} */
var playersPanelRefreshTimer = null;

var chatPanelVisible = false;
var chatActiveTab = "world"; // 'world' | 'dm'
var itemClassPanelVisible = false;
var actionClassPanelVisible = false;
var livingClassPanelVisible = false;
var worldClassPanelVisible = false;
/** @type {string | null} */
var itemClassEditId = null;
/** @type {string | null} */
var actionClassEditId = null;
/** @type {string | null} */
var livingClassEditId = null;
/** @type {string | null} */
var worldClassEditId = null;
/** @type {any[]} */
var worldChatMessages = INITIAL_CHAT || [];
/** @type {string[]} */
var dmIndex = INITIAL_DM_INDEX || [];
/** @type {Record<string, any[]>} */
var dmThreads = {}; // { [otherUserId]: Message[] }
/** @type {string | null} */
var activeDmUserId = null;
var unreadDmCount = 0;

function closeUsePicker() {
  usePickerVisible = false;
  requireElementById("hud-use-picker").style.display = "none";
  requireElementById("use-picker-actions").innerHTML = "";
}

function updateUseButtonState() {
  var btn = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("btn-use")
  );
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

/** @param {string[]} actions */
function openUsePicker(actions) {
  var container = requireElementById("use-picker-actions");
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
  requireElementById("hud-use-picker").style.display = "block";
}

/**
 * Fetches the current world types and shows the portal destination picker.
 * Falls back to the page-load snapshot, and if no world types are available
 * at all, posts the original build action unchanged (old behavior).
 * @param {string} originalAction
 */
function openPortalDestinationPicker(originalAction) {
  var snapshot =
    typeof WORLD_CLASS_REGISTRY !== "undefined" &&
    Array.isArray(WORLD_CLASS_REGISTRY)
      ? WORLD_CLASS_REGISTRY
      : [];
  fetchWithAuth("/virtual-world/world-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.world_classes) && data.world_classes.length
          ? data.world_classes
          : snapshot;
      renderPortalDestinationPicker(originalAction, classes);
    })
    .catch(function () {
      renderPortalDestinationPicker(originalAction, snapshot);
    });
}

/**
 * @param {string} originalAction
 * @param {Array<{id: string, labelKey?: string, fallbackLabel?: string, rows?: number, cols?: number}>} classes
 */
function renderPortalDestinationPicker(originalAction, classes) {
  if (!Array.isArray(classes) || classes.length === 0) {
    postTreeAction(originalAction, {});
    return;
  }
  var container = requireElementById("use-picker-actions");
  container.innerHTML = "";
  for (var i = 0; i < classes.length; i++) {
    var cls = classes[i];
    if (!cls || !cls.id) continue;
    var btn = document.createElement("button");
    btn.textContent =
      t(String(cls.labelKey || ""), String(cls.fallbackLabel || cls.id)) +
      " (" +
      String(cls.rows) +
      "×" +
      String(cls.cols) +
      ")";
    btn.onclick = (function (classId) {
      return function () {
        closeUsePicker();
        postTreeAction("build_portal", {
          destination_world_class_id: classId,
        });
      };
    })(String(cls.id));
    container.appendChild(btn);
  }
  usePickerVisible = true;
  requireElementById("hud-use-picker").style.display = "block";
}

/**
 * @param {ClientItem | null | undefined} item
 * @returns {string}
 */
function inventoryItemLabel(item) {
  if (!item || !item.type) return t("inventory.empty", "empty");
  var type = String(item.type);
  return t(itemTypeToLabelKey(type), humanizeType(type));
}

/**
 * @param {ClientInventory | any} inv
 * @returns {Array<{key: string, value: unknown}>}
 */
function getLivingValuesEntries(inv) {
  if (!inv || !inv.values || typeof inv.values !== "object") return [];
  var keys = Object.keys(inv.values).sort();
  var out = [];
  for (var i = 0; i < keys.length; i++) {
    out.push({ key: keys[i], value: inv.values[keys[i]] });
  }
  return out;
}

/**
 * @param {string} classId
 * @param {string} valueKey
 * @returns {any | null}
 */
function getLivingValueSchemaEntry(classId, valueKey) {
  var classes = getLivingRegistryClasses();
  var cls = classes && classes[classId] ? classes[classId] : null;
  var schema =
    cls && cls.valueSchema && typeof cls.valueSchema === "object"
      ? cls.valueSchema
      : {};
  return schema[valueKey] || null;
}

/**
 * @param {string} classId
 * @param {string} valueKey
 * @returns {string}
 */
function livingValueLabel(classId, valueKey) {
  var schemaEntry = getLivingValueSchemaEntry(classId, valueKey);
  var labelKey =
    schemaEntry && schemaEntry.labelKey
      ? schemaEntry.labelKey
      : "living.value." + valueKey;
  var fallback =
    schemaEntry && schemaEntry.fallbackLabel
      ? schemaEntry.fallbackLabel
      : humanizeType(valueKey);
  return t(labelKey, fallback);
}

/** @param {unknown} value */
function formatLivingValue(value) {
  if (typeof value === "number") return String(Math.round(value * 100) / 100);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "-";
  return String(value);
}

/**
 * @param {any | null} schemaEntry
 * @param {unknown} value
 * @returns {string}
 */
function renderLivingValueDisplay(schemaEntry, value) {
  var hasRange =
    schemaEntry &&
    schemaEntry.kind === "number" &&
    typeof schemaEntry.min === "number" &&
    typeof schemaEntry.max === "number" &&
    schemaEntry.max > schemaEntry.min;
  if (!hasRange || typeof value !== "number") {
    return (
      '<span class="living-value-text">' +
      escHtml(formatLivingValue(value)) +
      "</span>"
    );
  }
  var min = schemaEntry.min;
  var max = schemaEntry.max;
  var clamped = Math.max(min, Math.min(max, value));
  var pct = Math.round(((clamped - min) / (max - min)) * 100);
  return (
    '<span class="living-value-meter">' +
    '<span class="living-value-meter-track">' +
    '<span class="living-value-meter-fill" style="width:' +
    pct +
    '%"></span>' +
    "</span>" +
    '<span class="living-value-meter-text">' +
    escHtml(formatLivingValue(value)) +
    "/" +
    escHtml(String(max)) +
    "</span>" +
    "</span>"
  );
}

/** @param {ClientInventory | any} inv */
function getPrimaryHeldSlotIds(inv) {
  var slotIds = getInventorySlotIds(inv);
  if (slotIds.length === 0) return ["left_hand", "right_hand"];
  if (
    slotIds.indexOf("left_hand") !== -1 ||
    slotIds.indexOf("right_hand") !== -1
  ) {
    return ["left_hand", "right_hand"];
  }
  if (slotIds.length === 1) return [slotIds[0], "right_hand"];
  return [slotIds[0], slotIds[1]];
}

function updateHeldHud() {
  var heldSlotIds = getPrimaryHeldSlotIds(playerInventory);
  var leftItem =
    playerInventory && playerInventory.slots
      ? playerInventory.slots[heldSlotIds[0]]
      : playerInventory.left_hand;
  var rightItem =
    playerInventory && playerInventory.slots
      ? playerInventory.slots[heldSlotIds[1]]
      : playerInventory.right_hand;
  requireElementById("held-left").textContent = leftItem
    ? inventoryItemLabel(leftItem)
    : "-";
  requireElementById("held-right").textContent = rightItem
    ? inventoryItemLabel(rightItem)
    : "-";
  updateUseButtonState();
  syncLocalAvatarEquippedItems();
}

var logoutClickCount = 0;
/** @type {number | null} */
var logoutClickResetTimer = null;
var lastLogoutTapAt = 0;
/** @type {number | null} */
var hudToastTimer = null;

/**
 * @param {string} message
 * @param {boolean} isError
 */
function showHudToast(message, isError) {
  var toast = requireElementById("hud-toast");
  toast.textContent = message;
  if (isError) toast.classList.add("error");
  else toast.classList.remove("error");
  toast.style.display = "block";
  if (hudToastTimer) window.clearTimeout(hudToastTimer);
  hudToastTimer = window.setTimeout(
    function () {
      toast.style.display = "none";
      toast.classList.remove("error");
      hudToastTimer = null;
    },
    isError ? 2600 : 1800,
  );
}

/**
 * @param {string} label
 */
function showFollowBanner(label) {
  requireElementById("follow-banner-text").textContent =
    t("hud.following_prefix", "Following") + " " + label;
  requireElementById("hud-follow-banner").style.display = "block";
}

function hideFollowBanner() {
  requireElementById("hud-follow-banner").style.display = "none";
}

function stopFollowing() {
  hideFollowBanner();
  postTreeAction("stop_follow", {});
}

function triggerLogout() {
  showHudToast(
    t("nick.redirecting_to_logout", "Redirecting to logout..."),
    false,
  );
  setTimeout(function () {
    window.location.href = "/auth/logout";
  }, 150);
}

function initLogoutTrigger() {
  var youEl = requireElementById("legend-you");
  youEl.style.cursor = "pointer";
  youEl.title = t("nick.logout_hint", 'Triple click "You" to log out');
  function onLogoutTap() {
    var now = Date.now();
    if (now - lastLogoutTapAt < 180) return;
    lastLogoutTapAt = now;
    logoutClickCount += 1;
    youEl.style.opacity = "0.8";
    youEl.title =
      t("nick.logout_hint", 'Triple click "You" to log out') +
      " (" +
      logoutClickCount +
      "/3)";
    if (logoutClickResetTimer) window.clearTimeout(logoutClickResetTimer);
    logoutClickResetTimer = window.setTimeout(function () {
      logoutClickCount = 0;
      youEl.style.opacity = "1";
      youEl.title = t("nick.logout_hint", 'Triple click "You" to log out');
      logoutClickResetTimer = null;
    }, 2000);
    if (logoutClickCount >= 3) {
      logoutClickCount = 0;
      if (logoutClickResetTimer) {
        window.clearTimeout(logoutClickResetTimer);
        logoutClickResetTimer = null;
      }
      youEl.style.opacity = "1";
      youEl.title = t("nick.logout_hint", 'Triple click "You" to log out');
      triggerLogout();
    }
  }
  youEl.addEventListener("click", onLogoutTap);
  youEl.addEventListener("pointerup", onLogoutTap);
  youEl.addEventListener(
    "touchend",
    function (e) {
      e.preventDefault();
      onLogoutTap();
    },
    { passive: false },
  );
}
