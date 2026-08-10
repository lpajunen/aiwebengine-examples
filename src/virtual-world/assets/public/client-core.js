/// <reference path="virtual-world-browser-globals.d.ts" />
// Client core: shared typedefs, UI state, HUD pickers/toast, logout.

/**
 * @typedef {{ value: number, walkable: boolean, layer: string }} ClientTileDef
 * @typedef {{ id: string, type: string, destination_world_id?: string | number, destination_world_type?: string, non_droppable?: boolean, state?: Record<string, unknown> }} ClientItem
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
var worldInfoPanelVisible = false;
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

  // Bucket actions by their category, then render one labelled section per
  // non-empty category in ACTION_CATEGORY_ORDER (UI phase 2), so a long list
  // stops being one flat scroll.
  /** @type {Record<string, string[]>} */
  var byCategory = {};
  for (var i = 0; i < actions.length; i++) {
    var cat = actionCategoryOf(actions[i]);
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(actions[i]);
  }
  var cats = Object.keys(byCategory).sort(function (a, b) {
    var ia = ACTION_CATEGORY_ORDER.indexOf(a);
    var ib = ACTION_CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  var multipleCategories = cats.length > 1;
  for (var c = 0; c < cats.length; c++) {
    if (multipleCategories) {
      var header = document.createElement("div");
      header.className = "use-picker-category";
      header.textContent = t("action_category." + cats[c], cats[c]);
      container.appendChild(header);
    }
    var group = byCategory[cats[c]];
    for (var g = 0; g < group.length; g++) {
      var action = group[g];
      var needsAim = actionNeedsAiming(action);
      var btn = document.createElement("button");
      // A target/aim badge marks actions that open a reticle to be aimed after
      // selection, rather than firing immediately.
      btn.textContent = (needsAim ? "🎯 " : "") + treeActionLabel(action);
      btn.onclick = (function (a, aim) {
        return function () {
          closeUsePicker();
          if (aim) armAimAction(a);
          else postTreeAction(a);
        };
      })(action, needsAim);
      container.appendChild(btn);
    }
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
 * @param {Array<{id: string, labelKey?: string, fallbackLabel?: string, labels?: Record<string, string>, rows?: number, cols?: number}>} classes
 */
function renderPortalDestinationPicker(originalAction, classes) {
  if (!Array.isArray(classes) || classes.length === 0) {
    postTreeAction(originalAction, {});
    return;
  }
  var container = requireElementById("use-picker-actions");
  container.innerHTML = "";
  var sortedClasses = classes.slice().sort(function (a, b) {
    var la = localizeLabel(
      a && a.labels,
      String((a && a.labelKey) || ""),
      String((a && a.fallbackLabel) || (a && a.id) || ""),
    );
    var lb = localizeLabel(
      b && b.labels,
      String((b && b.labelKey) || ""),
      String((b && b.fallbackLabel) || (b && b.id) || ""),
    );
    return la.localeCompare(lb);
  });
  for (var i = 0; i < sortedClasses.length; i++) {
    var cls = sortedClasses[i];
    if (!cls || !cls.id) continue;
    var btn = document.createElement("button");
    btn.textContent =
      localizeLabel(
        cls.labels,
        String(cls.labelKey || ""),
        String(cls.fallbackLabel || cls.id),
      ) +
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
 * @param {ClientInventory | any} inv
 * @returns {Array<{key: string, value: unknown}>}
 */
function getLivingValuesEntries(inv) {
  if (!inv || !inv.values || typeof inv.values !== "object") return [];
  var classId = inv.class_id || "";
  var keys = Object.keys(inv.values).sort(function (a, b) {
    return livingValueLabel(classId, a).localeCompare(
      livingValueLabel(classId, b),
    );
  });
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
  // The i18n living.value.* keys are snake_case, but a living's value keys are
  // camelCase (maxHitPoints, …). When the class carries no valueSchema entry to
  // supply a labelKey, snake_case the key so the fallback still resolves a
  // localized label instead of leaking the English humanized key.
  var labelKey =
    schemaEntry && schemaEntry.labelKey
      ? schemaEntry.labelKey
      : "living.value." + camelToSnakeCase(valueKey);
  var fallback =
    schemaEntry && schemaEntry.fallbackLabel
      ? schemaEntry.fallbackLabel
      : humanizeType(valueKey);
  return t(labelKey, fallback);
}

/**
 * @param {unknown} value
 * @param {string} [key]
 */
function formatLivingValue(value, key) {
  if (typeof value === "number") {
    if (key === "fatigue") return String(Math.round(value));
    return String(Math.round(value * 100) / 100);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "-";
  return String(value);
}

// Fixed set of combat-stat keys every item's state carries (see
// getItemStateTemplate on the server) — unlike living values, items have no
// per-class valueSchema, so labels are looked up under a static "item.value."
// i18n namespace instead.
var ITEM_STATE_STAT_KEYS = [
  "maxHitPoints",
  "currentHitPoints",
  "armorClass",
  "weaponClass",
];

/** @param {string} key */
function camelToSnakeCase(key) {
  return String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * @param {string} key
 * @returns {string}
 */
function itemStateValueLabel(key) {
  var snakeKey = camelToSnakeCase(key);
  return t("item.value." + snakeKey, humanizeType(snakeKey));
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {Record<string, unknown>} state
 * @returns {string}
 */
function renderItemStateValueDisplay(key, value, state) {
  if (
    key === "currentHitPoints" &&
    typeof value === "number" &&
    typeof state.maxHitPoints === "number"
  ) {
    return renderLivingValueDisplay(
      { kind: "number", min: 0, max: state.maxHitPoints },
      value,
      key,
    );
  }
  return renderLivingValueDisplay(null, value, key);
}

/**
 * @param {any | null} schemaEntry
 * @param {unknown} value
 * @param {string} [key]
 * @returns {string}
 */
function renderLivingValueDisplay(schemaEntry, value, key) {
  var hasRange =
    schemaEntry &&
    schemaEntry.kind === "number" &&
    typeof schemaEntry.min === "number" &&
    typeof schemaEntry.max === "number" &&
    schemaEntry.max > schemaEntry.min;
  if (!hasRange || typeof value !== "number") {
    return (
      '<span class="living-value-text">' +
      escHtml(formatLivingValue(value, key)) +
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
    escHtml(formatLivingValue(value, key)) +
    "/" +
    escHtml(String(max)) +
    "</span>" +
    "</span>"
  );
}

function updateStatsHud() {
  var inv = normalizeClientInventory(playerInventory);
  var values = inv.values || {};
  requireElementById("hud-level").textContent = formatLivingValue(
    values.level,
    "level",
  );
  requireElementById("hud-xp").textContent = formatLivingValue(
    values.experience,
    "experience",
  );
  requireElementById("hud-hp").textContent =
    formatLivingValue(values.currentHitPoints, "currentHitPoints") +
    "/" +
    formatLivingValue(values.maxHitPoints, "maxHitPoints");
  requireElementById("hud-ac").textContent = formatLivingValue(
    values.armorClass,
    "armorClass",
  );
  requireElementById("hud-wc").textContent = formatLivingValue(
    values.weaponClass,
    "weaponClass",
  );
  requireElementById("hud-fatigue").textContent = formatLivingValue(
    values.fatigue,
    "fatigue",
  );
  updateUseButtonState();
  // Body first: a class change rebuilds the meshes the other three hooks
  // then decorate (equipped items, ghost look, size).
  syncLocalAvatarBody();
  syncLocalAvatarEquippedItems();
  syncLocalAvatarGhostVisual();
  syncLocalAvatarSize();
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
 * @typedef {{action_id: string, target_id: string, target_label: string, started_ts: number, stop_action_id?: string}} ActiveActionEntry
 */

/** @type {ActiveActionEntry[]} */
var activeActions = [];

/** @type {Record<string, string[]>} */
var ACTIVE_ACTION_PREFIX_KEYS = {
  follow: ["hud.following_prefix", "Following"],
  fight: ["hud.fighting_prefix", "Fighting"],
};

function renderActiveActionsList() {
  var container = requireElementById("hud-active-actions");
  var sorted = activeActions.slice().sort(function (a, b) {
    return a.started_ts - b.started_ts;
  });
  var html = sorted
    .map(function (entry) {
      // follow/fight carry their own prefix; any other action_id is an
      // in-flight walk-then-act approach ("Approaching <target>").
      var prefixInfo = ACTIVE_ACTION_PREFIX_KEYS[entry.action_id];
      var prefix = prefixInfo
        ? t(prefixInfo[0], prefixInfo[1])
        : t("hud.approaching_prefix", "Approaching");
      var stopAction = entry.stop_action_id || "stop_" + entry.action_id;
      return (
        '<div class="active-action-row">' +
        "<span>" +
        escapeHtml(prefix) +
        " " +
        escapeHtml(entry.target_label) +
        "</span>" +
        '<button data-stop-action="' +
        escapeHtml(stopAction) +
        '" onclick="stopActiveAction(this.dataset.stopAction)">' +
        escapeHtml(t("hud.stop_action", "Stop")) +
        "</button>" +
        "</div>"
      );
    })
    .join("");
  // The armed-but-uncast action (aiming) shares this panel so stop and cancel
  // live in one place (UI phase 4).
  if (typeof aimActiveRowHtml === "function") html += aimActiveRowHtml();
  if (!html) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }
  container.innerHTML = html;
  container.style.display = "flex";
}

/** @param {ActiveActionEntry} entry */
function upsertActiveAction(entry) {
  if (entry.action_id === "fight") {
    activeActions = activeActions.filter(function (a) {
      return a.action_id !== "follow";
    });
  }
  var found = false;
  activeActions = activeActions.map(function (a) {
    if (a.action_id === entry.action_id) {
      found = true;
      return entry;
    }
    return a;
  });
  if (!found) activeActions.push(entry);
  renderActiveActionsList();
}

/** @param {string} actionId */
function removeActiveAction(actionId) {
  activeActions = activeActions.filter(function (a) {
    return a.action_id !== actionId;
  });
  renderActiveActionsList();
}

// Clears in-flight walk-then-act approach rows (everything that isn't the
// follow/fight entry) — used when an approach is cancelled or completes, ahead
// of the next server active-actions snapshot.
function removeApproachActiveActions() {
  var before = activeActions.length;
  activeActions = activeActions.filter(function (a) {
    return a.action_id === "follow" || a.action_id === "fight";
  });
  if (activeActions.length !== before) renderActiveActionsList();
}

/** @param {ActiveActionEntry[]} list */
function applyActiveActionsSnapshot(list) {
  activeActions = Array.isArray(list) ? list.slice() : [];
  renderActiveActionsList();
}

/**
 * @param {string} stopActionId The tree-action to post (e.g. "stop_follow",
 *   "stop_fight", "cancel_approach").
 */
function stopActiveAction(stopActionId) {
  if (!stopActionId) return;
  postTreeAction(stopActionId, {});
}

applyActiveActionsSnapshot(INITIAL_ACTIVE_ACTIONS || []);

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
