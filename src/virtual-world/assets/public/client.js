/// <reference path="virtual-world-browser-globals.d.ts" />

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
var craftingPanelVisible = false;
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
/** @type {string | null} */
var itemClassEditId = null;
/** @type {string | null} */
var actionClassEditId = null;
/** @type {string | null} */
var livingClassEditId = null;
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

function getBootstrappedRecipeDefs() {
  if (!ITEM_REGISTRY || !ITEM_REGISTRY.recipes) return {};
  return ITEM_REGISTRY.recipes;
}

function getInventoryItemCounts() {
  var counts = /** @type {Record<string, number>} */ ({});
  var inv = normalizeClientInventory(playerInventory);
  var all = [];
  var slotIds = getInventorySlotIds(inv);
  for (var i = 0; i < slotIds.length; i++) {
    var slotItem = inv.slots && inv.slots[slotIds[i]];
    if (slotItem) all.push(slotItem);
  }
  if (Array.isArray(inv.bag)) {
    for (var b = 0; b < inv.bag.length; b++) all.push(inv.bag[b]);
  }
  for (var j = 0; j < all.length; j++) {
    var item = all[j];
    var type = item && item.type ? String(item.type) : "";
    if (!type) continue;
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

/** @param {any} recipe */
function recipeIsCraftable(recipe) {
  if (!recipe || !Array.isArray(recipe.input_items)) return false;
  var counts = getInventoryItemCounts();
  for (var i = 0; i < recipe.input_items.length; i++) {
    var input = recipe.input_items[i];
    var itemId = String(input && input.item_id ? input.item_id : "");
    var required = Number(input && input.count ? input.count : 0);
    if (!itemId || required <= 0) return false;
    if ((counts[itemId] || 0) < required) return false;
  }
  return true;
}

/** @param {any} recipe */
function recipeLabel(recipe) {
  if (!recipe) return "Unknown recipe";
  return t(
    String(recipe.label_key || ""),
    String(recipe.fallback_label || "Unknown recipe"),
  );
}

/** @param {string} itemId */
function itemLabelForRecipe(itemId) {
  return t(itemTypeToLabelKey(itemId), humanizeType(itemId));
}

/** @param {any} recipe */
function recipeIngredientsLabel(recipe) {
  if (
    !recipe ||
    !Array.isArray(recipe.input_items) ||
    recipe.input_items.length === 0
  ) {
    return "No ingredients";
  }
  var parts = [];
  for (var i = 0; i < recipe.input_items.length; i++) {
    var input = recipe.input_items[i];
    parts.push(
      String(input.count || 0) +
        "x " +
        itemLabelForRecipe(String(input.item_id || "")),
    );
  }
  return parts.join(", ");
}

/** @param {any} recipe */
function recipeResultLabel(recipe) {
  if (
    !recipe ||
    !Array.isArray(recipe.outputs) ||
    recipe.outputs.length === 0
  ) {
    return "No outputs";
  }
  var parts = [];
  for (var i = 0; i < recipe.outputs.length; i++) {
    var output = recipe.outputs[i];
    if (!output) continue;
    if (output.kind === "item") {
      parts.push(
        String(output.count || 0) +
          "x " +
          itemLabelForRecipe(String(output.item_id || "")),
      );
    } else if (output.kind === "place_tree") {
      parts.push("place pine tree");
    } else if (output.kind === "place_house") {
      parts.push("place house");
    }
  }
  return parts.join(", ");
}

/** @param {any} recipe */
function recipeTargetLabel(recipe) {
  var targetKind = String(
    recipe && recipe.target_kind ? recipe.target_kind : "inventory",
  );
  if (targetKind === "facing_tile") return "Target: facing tile";
  if (targetKind === "current_tile") return "Target: current tile";
  return "Target: inventory";
}

function triggerLogout() {
  showHudToast("Redirecting to logout...", false);
  setTimeout(function () {
    window.location.href = "/auth/logout";
  }, 150);
}

function initLogoutTrigger() {
  var youEl = requireElementById("legend-you");
  youEl.style.cursor = "pointer";
  youEl.title = 'Triple click "You" to log out';
  function onLogoutTap() {
    var now = Date.now();
    if (now - lastLogoutTapAt < 180) return;
    lastLogoutTapAt = now;
    logoutClickCount += 1;
    youEl.style.opacity = "0.8";
    youEl.title = 'Triple click "You" to log out (' + logoutClickCount + "/3)";
    if (logoutClickResetTimer) window.clearTimeout(logoutClickResetTimer);
    logoutClickResetTimer = window.setTimeout(function () {
      logoutClickCount = 0;
      youEl.style.opacity = "1";
      youEl.title = 'Triple click "You" to log out';
      logoutClickResetTimer = null;
    }, 2000);
    if (logoutClickCount >= 3) {
      logoutClickCount = 0;
      if (logoutClickResetTimer) {
        window.clearTimeout(logoutClickResetTimer);
        logoutClickResetTimer = null;
      }
      youEl.style.opacity = "1";
      youEl.title = 'Triple click "You" to log out';
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

appState.world = {
  rows: ROWS,
  cols: COLS,
  tile: TILE,
};

appRender = initializeRenderScene({
  rows: ROWS,
  cols: COLS,
  tile: TILE,
  targetX: targetX,
  targetZ: targetZ,
});

// ── Renderer / scene state ───────────────────────────────────────────────
var renderer = appRender.renderer;
var scene = appRender.scene;
var mapCX = appRender.mapCX;
var mapCZ = appRender.mapCZ;
var camera = appRender.camera;
var cameraOrbit = appRender.orbit;
var ambient = appRender.ambient;
var sun = appRender.sun;
var fill = appRender.fill;
var bgPlane = appRender.bgPlane;

function updateCamera() {
  appRender.updateCamera(avatar.position.x, avatar.position.z);
}

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

/**
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
function isOldOakTile(row, col) {
  return String(worldId) === "10000" && row === 50 && col === 50;
}

// ── Build tiles with InstancedMesh (efficient for large worlds) ────────────
/** @param {number} col */
function tileX(col) {
  return col * TILE + TILE / 2;
}
/** @param {number} row */
function tileZ(row) {
  return row * TILE + TILE / 2;
}

var dummy = new THREE.Object3D();
dummy.rotation.set(0, 0, 0);
dummy.scale.set(1, 1, 1);

/**
 * @param {any} mesh
 * @param {number} index
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} [scaleX]
 * @param {number} [scaleY]
 * @param {number} [scaleZ]
 */
function setInstanceTransform(mesh, index, x, y, z, scaleX, scaleY, scaleZ) {
  dummy.position.set(x, y, z);
  dummy.scale.set(scaleX || 1, scaleY || 1, scaleZ || 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

/** @param {any} mesh */
function finalizeInstancedMesh(mesh) {
  if (!mesh) return;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
}

/** @param {any[]} meshes */
function disposeInstancedMeshes(meshes) {
  for (var i = 0; i < meshes.length; i++) {
    if (meshes[i]) meshes[i].dispose();
  }
}

/** @param {boolean} visible */
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

/** @param {number} tileValue */
function countTilesByValue(tileValue) {
  var count = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      if (MAP[row][col] === tileValue) count++;
    }
  }
  return count;
}

/** @type {any} */ var iOcean = null;
/** @type {any} */ var iLake = null;
/** @type {any} */ var iRiver = null;
/** @type {any} */ var iRock = null;
/** @type {any} */ var iMountain = null;
/** @type {any} */ var iSandA = null;
/** @type {any} */ var iSandB = null;
/** @type {any} */ var iCaveFloorA = null;
/** @type {any} */ var iCaveFloorB = null;
/** @type {any} */ var iWoodFloorA = null;
/** @type {any} */ var iWoodFloorB = null;

/**
 * @param {string} tileName
 * @param {number} parity
 * @returns {number}
 */
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

/**
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
function hasHouseAt(row, col) {
  return (
    row >= 0 &&
    row < ROWS &&
    col >= 0 &&
    col < COLS &&
    MAP[row][col] === clientTileValueForName("house")
  );
}

/**
 * @param {number} row
 * @param {number} col
 * @returns {any}
 */
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

  /**
   * @param {any} geometry
   * @param {any} material
   * @param {number} px
   * @param {number} py
   * @param {number} pz
   */
  function addWall(geometry, material, px, py, pz) {
    var mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  /**
   * @param {any} geometry
   * @param {number} px
   * @param {number} py
   * @param {number} pz
   */
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
/** @type {any} */
var iPineTrunk = null;
/** @type {any} */
var iPineCanopyLow = null;
/** @type {any} */
var iPineCanopyMid = null;
/** @type {any} */
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
/** @type {Record<string, any>} */
var itemMatCache = {};
var itemMeshGroup = new THREE.Group();
scene.add(itemMeshGroup);

/**
 * @param {string} type
 * @returns {number}
 */
function itemTypeColor(type) {
  var registryItem =
    ITEM_REGISTRY && ITEM_REGISTRY.items
      ? ITEM_REGISTRY.items[String(type || "")]
      : null;
  if (registryItem && Number.isFinite(Number(registryItem.color))) {
    return Number(registryItem.color);
  }
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

/**
 * @param {string} type
 * @returns {any}
 */
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

/**
 * @param {number} w
 * @param {number} h
 * @param {number} d
 * @param {number | string | any} color
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @returns {any}
 */
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
/** @type {Record<string, any>} */
var remoteAvatars = {}; // { pid: { group, targetX, targetZ, targetRot, seq } }
/** @type {Record<string, any>} */
var npcAvatars = {}; // { npcId: { group, targetX, targetZ, targetRot, seq } }

/**
 * @param {string} pid
 * @returns {any}
 */
function avatarBodyColor(pid) {
  var h = 0;
  for (var i = 0; i < pid.length; i++)
    h = (Math.imul(31, h) + pid.charCodeAt(i)) | 0;
  var hue = (h >>> 0) % 360;
  // Shift away from ~200-240 (local avatar blue)
  if (hue >= 200 && hue <= 240) hue = (hue + 80) % 360;
  return new THREE.Color("hsl(" + hue + ",70%,55%)");
}

/**
 * @param {string} pid
 * @returns {any}
 */
function makeRemoteAvatar(pid) {
  var g = new THREE.Group();
  /**
   * @param {number} w
   * @param {number} h
   * @param {number} d
   * @param {number | string | any} color
   * @param {number} px
   * @param {number} py
   * @param {number} pz
   * @returns {any}
   */
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

/**
 * @param {string} pid
 * @param {number} row
 * @param {number} col
 * @param {number | null | undefined} seq
 * @param {number | null | undefined} rotation
 * @param {any} [playerData]
 */
function upsertRemoteAvatar(pid, row, col, seq, rotation, playerData) {
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
      class_id:
        playerData && typeof playerData.class_id === "string"
          ? playerData.class_id
          : "",
      slots:
        playerData && playerData.slots && typeof playerData.slots === "object"
          ? playerData.slots
          : {},
      values:
        playerData && playerData.values && typeof playerData.values === "object"
          ? playerData.values
          : {},
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
    if (
      playerData &&
      playerData.slots &&
      typeof playerData.slots === "object"
    ) {
      remoteAvatars[pid].slots = playerData.slots;
    }
    if (
      playerData &&
      playerData.values &&
      typeof playerData.values === "object"
    ) {
      remoteAvatars[pid].values = playerData.values;
    }
    if (playerData && typeof playerData.class_id === "string") {
      remoteAvatars[pid].class_id = playerData.class_id;
    }
    refreshTileDetailIfOpen();
  }
}

/** @param {string} pid */
function removeRemoteAvatar(pid) {
  if (remoteAvatars[pid]) {
    scene.remove(remoteAvatars[pid].group);
    delete remoteAvatars[pid];
    refreshTileDetailIfOpen();
  }
}

/**
 * @param {string} npcId
 * @returns {any}
 */
function npcBodyColor(npcId) {
  var h = 0;
  for (var i = 0; i < npcId.length; i++) {
    h = (Math.imul(31, h) + npcId.charCodeAt(i)) | 0;
  }
  var hue = 25 + ((h >>> 0) % 80);
  return new THREE.Color("hsl(" + hue + ",65%,52%)");
}

/**
 * @param {string} npcId
 * @returns {any}
 */
function makeNPCAvatar(npcId) {
  var g = new THREE.Group();
  /**
   * @param {number} w
   * @param {number} h
   * @param {number} d
   * @param {number | string | any} color
   * @param {number} px
   * @param {number} py
   * @param {number} pz
   * @returns {any}
   */
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

/**
 * @param {string} npcId
 * @returns {string}
 */
function npcDisplayName(npcId) {
  if (npcAvatars[npcId] && npcAvatars[npcId].displayName) {
    return npcAvatars[npcId].displayName;
  }
  return shortenId(npcId);
}

/**
 * @param {string} npcId
 * @param {number} row
 * @param {number} col
 * @param {number | null | undefined} seq
 * @param {number | null | undefined} rotation
 * @param {string | undefined} displayName
 * @param {any} [npcData]
 */
function upsertNPCAvatar(npcId, row, col, seq, rotation, displayName, npcData) {
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
      class_id:
        npcData && typeof npcData.class_id === "string" ? npcData.class_id : "",
      slots:
        npcData && npcData.slots && typeof npcData.slots === "object"
          ? npcData.slots
          : {},
      bag: npcData && Array.isArray(npcData.bag) ? npcData.bag : [],
      values:
        npcData && npcData.values && typeof npcData.values === "object"
          ? npcData.values
          : {},
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
    if (npcData && npcData.slots && typeof npcData.slots === "object") {
      npcAvatars[npcId].slots = npcData.slots;
    }
    if (npcData && Array.isArray(npcData.bag)) {
      npcAvatars[npcId].bag = npcData.bag;
    }
    if (npcData && npcData.values && typeof npcData.values === "object") {
      npcAvatars[npcId].values = npcData.values;
    }
    if (npcData && typeof npcData.class_id === "string") {
      npcAvatars[npcId].class_id = npcData.class_id;
    }
    refreshTileDetailIfOpen();
  }
}

/** @param {string} npcId */
function removeNPCAvatar(npcId) {
  if (npcAvatars[npcId]) {
    scene.remove(npcAvatars[npcId].group);
    delete npcAvatars[npcId];
    refreshTileDetailIfOpen();
  }
}

/** @param {any[]} npcs */
function syncNPCSnapshot(npcs) {
  if (!Array.isArray(npcs)) return;
  var seen = /** @type {Record<string, boolean>} */ ({});
  for (var i = 0; i < npcs.length; i++) {
    var n = npcs[i];
    if (!n || typeof n.npc_id !== "string") continue;
    seen[n.npc_id] = true;
    upsertNPCAvatar(
      n.npc_id,
      n.row,
      n.col,
      n.seq,
      n.rotation,
      n.display_name,
      n,
    );
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
  var requestSeq = itemSnapshotRequestSeq + 1;
  itemSnapshotRequestSeq = requestSeq;
  fetchJsonWithAuth("/virtual-world/current-world")
    .then(function (payload) {
      if (!payload || typeof payload !== "object") return;
      if (payload.world_id && String(payload.world_id) !== String(worldId)) {
        return;
      }
      if (requestSeq < appliedItemSnapshotSeq) {
        return;
      }
      if (payload.inventory) {
        playerInventory = normalizeClientInventory(payload.inventory);
        updateEditingRightsUI();
      }
      if (Array.isArray(payload.items)) {
        var next = /** @type {Record<string, ClientItem[]>} */ ({});
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
      appliedItemSnapshotSeq = requestSeq;
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

/**
 * @param {any[]} items
 * @returns {ClientItem[]}
 */
function normalizeClientTileItems(items) {
  return Array.isArray(items)
    ? /** @type {any[]} */ (items)
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
        })
    : [];
}

/** @param {string} action */
function getRegistryItemEventDef(action) {
  if (!ITEM_REGISTRY || !ITEM_REGISTRY.item_events) return null;
  return ITEM_REGISTRY.item_events[String(action || "")] || null;
}

/**
 * @param {number} row
 * @param {number} col
 * @param {any[]} items
 */
function applyTileItemsState(row, col, items) {
  var tileKey = row + "_" + col;
  var nextItems = normalizeClientTileItems(items);
  if (nextItems.length > 0) {
    worldItemsByTile[tileKey] = nextItems;
  } else {
    delete worldItemsByTile[tileKey];
  }
}

/** @param {any} payload */
function applyItemDeltaFromEvent(payload) {
  if (!payload) return;
  var row = Number(payload.row);
  var col = Number(payload.col);
  if (!isFinite(row) || !isFinite(col)) return;
  var action = String(payload.action || "");
  var itemEventDef = getRegistryItemEventDef(action);
  var tileKey = row + "_" + col;
  var changedItems = normalizeClientTileItems(payload.items);
  var currentItems = Array.isArray(worldItemsByTile[tileKey])
    ? worldItemsByTile[tileKey].slice()
    : [];

  function changedItemIdSet() {
    var ids = /** @type {Record<string, boolean>} */ ({});
    for (var i = 0; i < changedItems.length; i++) {
      if (changedItems[i] && changedItems[i].id) ids[changedItems[i].id] = true;
    }
    return ids;
  }

  // Treat the SSE delta as newer than any in-flight repair snapshot.
  appliedItemSnapshotSeq = Math.max(
    appliedItemSnapshotSeq,
    itemSnapshotRequestSeq + 1,
  );

  if (itemEventDef && itemEventDef.delta_kind === "add") {
    var merged = currentItems.slice();
    var seenIds = changedItemIdSet();
    for (var curIdx = 0; curIdx < merged.length; curIdx++) {
      if (merged[curIdx] && seenIds[merged[curIdx].id]) {
        delete seenIds[merged[curIdx].id];
      }
    }
    for (var addIdx = 0; addIdx < changedItems.length; addIdx++) {
      var changedItem = changedItems[addIdx];
      if (changedItem && seenIds[changedItem.id]) merged.push(changedItem);
    }
    applyTileItemsState(row, col, merged);
  } else if (itemEventDef && itemEventDef.delta_kind === "remove") {
    var removedIds = changedItemIdSet();
    var kept = currentItems.filter(function (item) {
      return item && !removedIds[item.id];
    });
    applyTileItemsState(row, col, kept);
  } else if (itemEventDef && itemEventDef.delta_kind === "snapshot") {
    applyTileItemsState(row, col, changedItems);
  } else {
    fetchItemSnapshot();
    return;
  }

  rebuildItemMeshes();
  refreshTileDetailIfOpen();
  updateUseButtonState();
}

/** @type {any[]} */
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
            requireElementById("pos-col").textContent = String(avatarCol);
            requireElementById("pos-row").textContent = String(avatarRow);
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
          requireElementById("pos-col").textContent = String(avatarCol);
          requireElementById("pos-row").textContent = String(avatarRow);
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

/**
 * @param {number} fromRow
 * @param {number} fromCol
 * @param {number} toRow
 * @param {number} toCol
 * @param {number} rotation
 * @returns {boolean}
 */
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
    new Blob([JSON.stringify({ session_id: sessionId })], {
      type: "application/json",
    }),
  );
}

/** @param {number} delayMs */
function scheduleHeartbeat(delayMs) {
  if (heartbeatTimer) window.clearTimeout(heartbeatTimer);
  heartbeatTimer = window.setTimeout(
    function () {
      sendHeartbeat(false);
    },
    Math.max(0, Number(delayMs) || 0),
  );
}

/** @param {boolean} force */
function sendHeartbeat(force) {
  if (authState !== AUTH_STATE_OK) return;
  var now = Date.now();
  if (
    !force &&
    lastHeartbeatAt > 0 &&
    now - lastHeartbeatAt < HEARTBEAT_ACTIVITY_MIN_GAP_MS
  ) {
    scheduleHeartbeat(HEARTBEAT_ACTIVITY_MIN_GAP_MS - (now - lastHeartbeatAt));
    return;
  }
  lastHeartbeatAt = now;
  fetchWithAuth("/virtual-world/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  }).then(
    function () {
      scheduleHeartbeat(HEARTBEAT_VISIBLE_MS);
    },
    function (err) {
      if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED")) {
        return;
      }
      scheduleHeartbeat(HEARTBEAT_VISIBLE_MS);
    },
  );
}

function requestHeartbeatSoon() {
  if (authState !== AUTH_STATE_OK) return;
  var now = Date.now();
  var nextDelay = 0;
  if (lastHeartbeatAt > 0) {
    nextDelay = Math.max(
      0,
      HEARTBEAT_ACTIVITY_MIN_GAP_MS - (now - lastHeartbeatAt),
    );
  }
  scheduleHeartbeat(nextDelay);
}

function fetchSnapshot() {
  if (authState !== AUTH_STATE_OK) return;
  fetchJsonWithAuth("/virtual-world/players")
    .then(function (players) {
      /** @type {any[]} */ (players).forEach(function (p) {
        if (p.player_id === playerId) {
          var snapSeq = Number(p.seq || 0);
          var snapshotSessionId =
            typeof p.session_id === "string" ? p.session_id : "";
          if (snapshotSessionId && snapshotSessionId !== sessionId) {
            return;
          }
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
            requireElementById("pos-col").textContent = String(avatarCol);
            requireElementById("pos-row").textContent = String(avatarRow);
          }
        } else {
          upsertRemoteAvatar(p.player_id, p.row, p.col, p.seq, p.rotation, p);
        }
      });
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
  updateEditingRightsUI();
  initLogoutTrigger();
  // Active player positions are not part of the bootstrapped page state,
  // so keep one initial snapshot to populate remote avatars.
  fetchSnapshot();
  syncNPCSnapshot(NPCS);

  var eventsSseParams = new URLSearchParams({
    world_id: String(worldId),
    recipient_id: String(playerId),
  });
  var eventsSseUrl = "/virtual-world/events?" + eventsSseParams.toString();
  /** @type {number | null} */
  var eventsReconnectTimer = null;
  var eventsRetryCount = 0;
  var eventsWaitingForOnline = false;

  /** @param {any} payload */
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
          requireElementById("pos-col").textContent = String(avatarCol);
          requireElementById("pos-row").textContent = String(avatarRow);
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

  /** @param {any} payload */
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

  /** @param {any} payload */
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

  /** @param {any} payload */
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
      payload,
    );
  }

  /** @param {any} msg */
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

  /** @param {any} msg */
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

  /** @param {any} payload */
  function handlePresenceUpdateEvent(payload) {
    if (!payload || !payload.player_id) return;
    if (payload.action === "left") {
      var targetPlayerId = String(payload.player_id);
      var knownEntry = null;
      for (var i = 0; i < onlinePlayersList.length; i++) {
        if (onlinePlayersList[i].player_id === targetPlayerId) {
          knownEntry = onlinePlayersList[i];
          break;
        }
      }
      // Ignore stale leave events from the previous world after a world switch.
      // The player may already have a fresher upsert in a different world.
      if (
        !knownEntry ||
        String(knownEntry.world_id || "") === String(payload.world_id || "")
      ) {
        removeOnlinePlayerEntry(targetPlayerId);
      }
    } else {
      var oldNick = playerNick;
      upsertOnlinePlayerEntry(payload);
      if (payload.player_id === playerId) {
        if (payload.nick) {
          playerNick = String(payload.nick);
          var nickDisplay = document.getElementById("nick-display");
          if (nickDisplay) nickDisplay.textContent = playerNick;
          if (oldNick && oldNick !== playerNick) {
            showHudToast("Changed name to " + playerNick, false);
          }
        }
        if (payload.inventory) {
          playerInventory = normalizeClientInventory(payload.inventory);
          renderInventoryPanel();
          updateUseButtonState();
          updateEditingRightsUI();
        }
        if (payload.items) {
          applyItemStateFromResult(payload);
        }
        if (payload.message) {
          showHudToast(payload.message, false);
        }
      }
    }
    if (playersPanelVisible) renderPlayersPanel();
  }

  /** @param {any} message */
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
        applyItemDeltaFromEvent(payload);
        return;
      case "chat_message":
        handleChatMessageEvent(payload);
        return;
      case "direct_message":
        handleDirectMessageEvent(payload);
        return;
      case "presence_update":
        handlePresenceUpdateEvent(payload);
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
      if (eventsReconnectTimer) window.clearTimeout(eventsReconnectTimer);
      fetchSnapshot();
      fetchNPCSnapshot();
      fetchItemSnapshot();
      eventsRetryCount += 1;
      eventsReconnectTimer = window.setTimeout(
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
  // cause lease and presence renewal to lag. Sending one ping on visibility
  // restore keeps the session fresh without a tight fixed interval.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && authState === AUTH_STATE_OK) {
      sendHeartbeat(true);
    }
  });

  // Heartbeat — keep presence alive while SSE handles steady-state updates.
  // Visible tabs renew every 20 s, which stays below the 30 s lease TTL
  // while removing most of the old 5 s baseline traffic.
  sendHeartbeat(true);
}

// ── Collision & movement ─────────────────────────────────────────────────
/**
 * @param {number} r
 * @param {number} c
 * @returns {boolean}
 */
function isWalkable(r, c) {
  return (
    r >= 0 && r < ROWS && c >= 0 && c < COLS && isWalkableTileValue(MAP[r][c])
  );
}

/** @type {string | null} */
var lastMoveIntentKey = null;
/** @type {"horizontal" | "vertical" | null} */
var lastMoveAxis = null; // 'horizontal' | 'vertical'
/** @type {{ dr: number, dc: number } | null} */
var lastForwardCardinal = null;

/**
 * @param {number} dr
 * @param {number} dc
 * @param {number} angle
 * @returns {boolean}
 */
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
    requireElementById("pos-col").textContent = String(nc);
    requireElementById("pos-row").textContent = String(nr);
    updateUseButtonState();
    return true;
  }
  return false;
}

function getCameraForwardCardinal() {
  // Quantize camera forward to one grid cardinal with hysteresis so
  // near-diagonal default angles do not flip direction frame-to-frame.
  var fx = -Math.sin(cameraOrbit.theta);
  var fz = -Math.cos(cameraOrbit.theta);
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

/**
 * @param {number} inputX
 * @param {number} inputY
 * @returns {boolean}
 */
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
  lastMoveAxis = /** @type {"horizontal" | "vertical"} */ (axis);
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

/** @param {string} action */
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
      requestHeartbeatSoon();
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
  var leftDiv = requireElementById("inv-left-hand");
  var rightDiv = requireElementById("inv-right-hand");
  var listDiv = requireElementById("inv-list");
  var countDiv = requireElementById("inv-count");
  var inv = normalizeClientInventory(playerInventory);
  var slotIds = getInventorySlotIds(inv);
  var handSlotIds = getPrimaryHeldSlotIds(inv);

  /**
   * @param {string} title
   * @param {string} slot
   * @param {ClientItem | null} item
   * @returns {string}
   */
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
    inventorySlotLabel(inv, handSlotIds[0]),
    handSlotIds[0],
    inv.slots[handSlotIds[0]] || null,
  );
  rightDiv.innerHTML = handHtml(
    inventorySlotLabel(inv, handSlotIds[1]),
    handSlotIds[1],
    inv.slots[handSlotIds[1]] || null,
  );

  var remainingSlotIds = slotIds.filter(function (slotId) {
    return slotId !== handSlotIds[0] && slotId !== handSlotIds[1];
  });
  var rows = "";
  for (var s = 0; s < remainingSlotIds.length; s++) {
    var slotId = remainingSlotIds[s];
    var slotItem = inv.slots[slotId] || null;
    rows +=
      '<div class="inv-row">' +
      '<span class="label">' +
      escHtml(inventorySlotLabel(inv, slotId)) +
      ": " +
      escHtml(
        slotItem ? inventoryItemLabel(slotItem) : t("inventory.empty", "empty"),
      ) +
      "</span>" +
      '<span class="inv-row-actions">' +
      (slotItem
        ? (slotItem.non_droppable
            ? ""
            : "<button onclick=\"dropFromSlot('" +
              slotId +
              "')\">Drop</button> ") +
          "<button onclick=\"equipToInventory('" +
          slotId +
          "')\">Store</button>"
        : "") +
      "</span>" +
      "</div>";
  }

  if (!Array.isArray(inv.bag) || inv.bag.length === 0) {
    rows +=
      '<div class="inv-row"><span class="label" style="grid-column:1/-1">' +
      t("inventory.backpack_empty", "Backpack empty") +
      "</span></div>";
  } else {
    for (var i = 0; i < inv.bag.length; i++) {
      var item = inv.bag[i];
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
      var equipBtns = "";
      for (var si = 0; si < slotIds.length; si++) {
        equipBtns +=
          '<button onclick="equipFromInventory(' +
          i +
          ",\'" +
          slotIds[si] +
          "\')\">" +
          escHtml(inventorySlotLabel(inv, slotIds[si])) +
          "</button> ";
      }
      rows +=
        '<div class="inv-row">' +
        '<span class="label">' +
        escHtml(inventoryItemLabel(item)) +
        "</span>" +
        '<span class="inv-row-actions">' +
        equipBtns +
        (item.non_droppable
          ? ""
          : '<button onclick="dropFromInventory(' + i + ')">Drop</button> ') +
        actionBtns +
        "</span>" +
        "</div>";
    }
  }

  listDiv.innerHTML = rows;

  countDiv.textContent =
    inv.bag.length + " " + t("inventory.items_suffix", "items");

  var livingValueEntries = getLivingValuesEntries(inv);
  if (livingValueEntries.length > 0) {
    var valueRows = "";
    for (var lv = 0; lv < livingValueEntries.length; lv++) {
      var entry = livingValueEntries[lv];
      valueRows +=
        '<div class="inv-row">' +
        '<span class="label">' +
        escHtml(livingValueLabel(inv.class_id || "", entry.key)) +
        "</span>" +
        '<span class="inv-row-actions">' +
        renderLivingValueDisplay(
          getLivingValueSchemaEntry(inv.class_id || "", entry.key),
          entry.value,
        ) +
        "</span>" +
        "</div>";
    }
    listDiv.innerHTML +=
      '<div class="inv-row"><span class="label" style="grid-column:1/-1;font-weight:700;opacity:0.9">' +
      escHtml(t("inventory.values", "Living values")) +
      "</span></div>" +
      valueRows;
  }

  updateHeldHud();
}

/** @param {number} autoHideMs */
function showInventoryPanel(autoHideMs) {
  if (craftingPanelVisible) closeCraftingPanel();
  inventoryPanelVisible = true;
  requireElementById("hud-inventory-panel").style.display = "block";
  renderInventoryPanel();
  if (inventoryAutoHideTimer !== null) {
    window.clearTimeout(inventoryAutoHideTimer);
    inventoryAutoHideTimer = null;
  }
  if (autoHideMs && autoHideMs > 0) {
    inventoryAutoHideTimer = window.setTimeout(function () {
      closeInventoryPanel();
    }, autoHideMs);
  }
}

function closeInventoryPanel() {
  inventoryPanelVisible = false;
  requireElementById("hud-inventory-panel").style.display = "none";
  if (inventoryAutoHideTimer !== null) {
    window.clearTimeout(inventoryAutoHideTimer);
    inventoryAutoHideTimer = null;
  }
}

function toggleInventoryPanel() {
  if (inventoryPanelVisible) closeInventoryPanel();
  else showInventoryPanel(0);
}

function renderCraftingPanel() {
  var listDiv = requireElementById("crafting-list");
  var recipes = getBootstrappedRecipeDefs();
  var recipeIds = Object.keys(recipes).sort();
  if (recipeIds.length === 0) {
    listDiv.innerHTML =
      '<div class="craft-row"><div class="craft-status">No recipes available.</div></div>';
    return;
  }
  var rows = "";
  for (var i = 0; i < recipeIds.length; i++) {
    var recipeId = recipeIds[i];
    var recipe = recipes[recipeId];
    var craftable = recipeIsCraftable(recipe);
    rows +=
      '<div class="craft-row">' +
      '<div class="name">' +
      escHtml(recipeLabel(recipe)) +
      "</div>" +
      '<div class="craft-meta">' +
      escHtml(recipeTargetLabel(recipe)) +
      "</div>" +
      '<div class="craft-ingredients">Ingredients: ' +
      escHtml(recipeIngredientsLabel(recipe)) +
      "</div>" +
      '<div class="craft-result">Result: ' +
      escHtml(recipeResultLabel(recipe)) +
      "</div>" +
      '<div class="craft-actions">' +
      '<span class="craft-status">' +
      escHtml(craftable ? "Ready" : "Missing ingredients") +
      "</span>" +
      "<button onclick=\"craftRecipeById('" +
      recipeId +
      "')\"" +
      (craftable ? "" : " disabled") +
      ">Craft</button>" +
      "</div>" +
      "</div>";
  }
  listDiv.className = "crafting-list";
  listDiv.innerHTML = rows;
}

function showCraftingPanel() {
  if (inventoryPanelVisible) closeInventoryPanel();
  craftingPanelVisible = true;
  requireElementById("hud-crafting-panel").style.display = "block";
  renderCraftingPanel();
}

function closeCraftingPanel() {
  craftingPanelVisible = false;
  requireElementById("hud-crafting-panel").style.display = "none";
}

function toggleCraftingPanel() {
  if (craftingPanelVisible) closeCraftingPanel();
  else showCraftingPanel();
}

// ── Players panel ────────────────────────────────────────────────────────

/** @param {number | string | Date | null | undefined} ts */
function formatRelTime(ts) {
  if (!ts) return "-";
  var diff = Math.max(0, Date.now() - new Date(ts).getTime());
  var secs = Math.floor(diff / 1000);
  if (secs < 60) return secs + "s ago";
  var mins = Math.floor(secs / 60);
  if (mins < 60) return mins + "m ago";
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.floor(hrs / 24) + "d ago";
}

function sortOnlinePlayersList() {
  onlinePlayersList.sort(function (a, b) {
    return (
      Number(b && b.last_active ? b.last_active : 0) -
      Number(a && a.last_active ? a.last_active : 0)
    );
  });
}

/** @param {any} entry */
function upsertOnlinePlayerEntry(entry) {
  if (!entry || !entry.player_id) return;
  var normalized = {
    player_id: String(entry.player_id),
    nick: String(entry.nick || shortenId(String(entry.player_id))),
    world_id: String(entry.world_id || ""),
    login_at: Number(entry.login_at || Date.now()),
    last_active: Number(entry.last_active || Date.now()),
  };
  var updated = false;
  for (var i = 0; i < onlinePlayersList.length; i++) {
    if (onlinePlayersList[i].player_id !== normalized.player_id) continue;
    onlinePlayersList[i] = normalized;
    updated = true;
    break;
  }
  if (!updated) onlinePlayersList.push(normalized);
  sortOnlinePlayersList();
}

/** @param {string} targetPlayerId */
function removeOnlinePlayerEntry(targetPlayerId) {
  onlinePlayersList = onlinePlayersList.filter(function (entry) {
    return entry && entry.player_id !== targetPlayerId;
  });
}

function refreshOnlinePlayersSnapshot() {
  fetchWithAuth("/virtual-world/online-players")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!Array.isArray(data)) return;
      onlinePlayersList = data;
      sortOnlinePlayersList();
      if (playersPanelVisible) renderPlayersPanel();
    })
    .catch(function () {});
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
  requireElementById("hud-players-panel").style.display = "block";
  renderPlayersPanel();
  refreshOnlinePlayersSnapshot();
  if (playersPanelRefreshTimer !== null) {
    window.clearInterval(playersPanelRefreshTimer);
  }
  playersPanelRefreshTimer = window.setInterval(function () {
    if (!playersPanelVisible) {
      if (playersPanelRefreshTimer !== null) {
        window.clearInterval(playersPanelRefreshTimer);
      }
      playersPanelRefreshTimer = null;
      return;
    }
    renderPlayersPanel();
  }, 15000);
}

function closePlayersPanel() {
  playersPanelVisible = false;
  requireElementById("hud-players-panel").style.display = "none";
  if (playersPanelRefreshTimer !== null) {
    window.clearInterval(playersPanelRefreshTimer);
    playersPanelRefreshTimer = null;
  }
}

function togglePlayersPanel() {
  if (playersPanelVisible) closePlayersPanel();
  else showPlayersPanel();
}

function startNickEdit() {
  var inp = /** @type {HTMLInputElement | null} */ (
    document.getElementById("nick-input")
  );
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
  requireElementById("nick-display").style.display = "none";
  requireElementById("nick-edit-btn").style.display = "none";
  requireElementById("nick-edit-row").style.display = "inline";
  if (inp) {
    inp.focus();
    inp.select();
  }
}

function cancelNickEdit() {
  requireElementById("nick-display").style.display = "";
  requireElementById("nick-edit-btn").style.display = "";
  requireElementById("nick-edit-row").style.display = "none";
}

function commitNickEdit() {
  var inp = /** @type {HTMLInputElement | null} */ (
    document.getElementById("nick-input")
  );
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
        if (data.inventory) {
          applyItemStateFromResult(data);
        }
        if (data.message) {
          showHudToast(data.message, false);
        }
        if (data.nick) {
          var oldNick = playerNick;
          playerNick = data.nick;
          var display = document.getElementById("nick-display");
          if (display) display.textContent = data.nick;
          upsertOnlinePlayerEntry({
            player_id: playerId,
            nick: data.nick,
            world_id: worldId,
            login_at: Date.now(),
            last_active: Date.now(),
          });
          if (playersPanelVisible) renderPlayersPanel();
          if (chatPanelVisible && chatActiveTab === "world") renderWorldChat();
          if (chatPanelVisible && chatActiveTab === "dm" && activeDmUserId)
            renderDMThread(activeDmUserId);
          if (oldNick && oldNick !== playerNick) {
            showHudToast("Changed name to " + playerNick, false);
          }
        }
      }
      cancelNickEdit();
    })
    .catch(function () {
      cancelNickEdit();
    });
}

// ── Chat helpers ─────────────────────────────────────────────────────────

/** @param {any} str */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {number | string | Date} ts */
function formatChatTime(ts) {
  var d = new Date(ts);
  return (
    d.getHours().toString().padStart(2, "0") +
    ":" +
    d.getMinutes().toString().padStart(2, "0")
  );
}

/** @param {any} msg */
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

/** @param {string} containerId */
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
  var input = /** @type {HTMLInputElement | null} */ (
    document.getElementById("world-chat-input")
  );
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

/** @param {"world" | "dm"} tab */
function switchChatTab(tab) {
  chatActiveTab = tab;
  requireElementById("chat-tab-world").classList.toggle(
    "active",
    tab === "world",
  );
  requireElementById("chat-tab-dm").classList.toggle("active", tab === "dm");
  requireElementById("chat-content-world").classList.toggle(
    "hidden",
    tab !== "world",
  );
  requireElementById("chat-content-dm").classList.toggle(
    "hidden",
    tab !== "dm",
  );
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
/** @param {string} otherUserId */
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

/** @param {string} otherUserId */
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

/** @param {string} otherUserId */
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
  var input = /** @type {HTMLInputElement | null} */ (
    document.getElementById("dm-chat-input")
  );
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

/** @param {any} result */
function applyItemStateFromResult(result) {
  if (!result || typeof result !== "object") return;
  // Reserve the next snapshot sequence so any older in-flight /current-world
  // responses cannot overwrite the fresher local action result.
  appliedItemSnapshotSeq = Math.max(
    appliedItemSnapshotSeq,
    itemSnapshotRequestSeq + 1,
  );
  if (result.inventory) {
    playerInventory = normalizeClientInventory(result.inventory);
    updateEditingRightsUI();
  }
  if (Array.isArray(result.items)) {
    // Convert flat server snapshot into tile map.
    var next = /** @type {Record<string, ClientItem[]>} */ ({});
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
  } else if (
    isFinite(Number(result.row)) &&
    isFinite(Number(result.col)) &&
    Array.isArray(result.tile_items)
  ) {
    applyTileItemsState(
      Number(result.row),
      Number(result.col),
      result.tile_items,
    );
  }
  rebuildItemMeshes();
  refreshTileDetailIfOpen();
  updateHeldHud();
  renderInventoryPanel();
  if (craftingPanelVisible) renderCraftingPanel();
  updateUseButtonState();
}

/** @param {string} recipeId */
function craftRecipeById(recipeId) {
  fetchWithAuth("/virtual-world/craft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipe_id: recipeId }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (result) {
      if (!result || !result.ok) {
        showHudToast((result && result.error) || "Crafting failed", true);
        return;
      }
      applyItemStateFromResult(result);
      requestHeartbeatSoon();
      if (result.recipe_id) {
        showHudToast(
          "Crafted: " +
            recipeLabel(getBootstrappedRecipeDefs()[result.recipe_id]),
          false,
        );
      }
    })
    .catch(function (err) {
      if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED"))
        return;
      console.error("Craft request failed:", err);
      showHudToast("Crafting request failed", true);
    });
}

/**
 * @param {Record<string, any>} payload
 * @param {(result: any) => void} [onSuccess]
 */
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
      requestHeartbeatSoon();
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

/** @param {string} slot */
function dropFromSlot(slot) {
  postItemAction({ action: "drop", from: slot });
}

/** @param {number} index */
function dropFromInventory(index) {
  postItemAction({ action: "drop", from: "inventory", index: index });
}

/** @param {string} slot */
function equipToInventory(slot) {
  postItemAction({ action: "equip", from: slot, to: "inventory" });
}

/**
 * @param {number} index
 * @param {string} slot
 */
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

/**
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{ row: number, col: number } | null}
 */
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

/** @param {any} e */
function isClickOnHUD(e) {
  var el = e.target;
  while (el && el !== document.body) {
    if (el.classList && el.classList.contains("hud")) return true;
    if (el.id === "joystick-container") return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * @param {number} row
 * @param {number} col
 */
function selectTile(row, col) {
  selectedTileRow = row;
  selectedTileCol = col;
  renderTileDetailPanel();
}

function closeTileDetail() {
  selectedTileRow = -1;
  selectedTileCol = -1;
  requireElementById("hud-tile-detail").style.display = "none";
}

function refreshTileDetailIfOpen() {
  if (selectedTileRow < 0) return;
  renderTileDetailPanel();
}

/** @param {any} str */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {any} id */
function shortenId(id) {
  var s = String(id || "");
  return s.length > 18 ? s.slice(0, 16) + "\u2026" : s;
}
/** @param {string} id */
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
  var isOakCenter = String(worldId) === "10000" && row === 50 && col === 50;

  requireElementById("tile-detail-title").textContent =
    "Square (" + col + ", " + row + ")";

  var terrainType = MAP[row][col];
  var treeMod = dynamicTrees[key];
  var terrainLabel;
  if (terrainType === clientTileValueForName("spruce_thicket")) {
    terrainLabel = t("terrain.wall", "Spruce thicket");
  } else if (terrainType === clientTileValueForName("house")) {
    terrainLabel = t("terrain.house", "House block");
  } else if (terrainType === clientTileValueForName("pine_tree")) {
    if (isOakCenter || isOldOakTile(row, col)) {
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
      npcsHere.push({ id: nid, data: na });
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
      var ppData = pp.isMe ? playerInventory : remoteAvatars[pp.id] || {};
      var ppSlots =
        ppData.slots && typeof ppData.slots === "object" ? ppData.slots : {};
      var ppValues =
        ppData.values && typeof ppData.values === "object" ? ppData.values : {};
      html += '<div class="tile-living-entry">';
      html +=
        '<div class="tile-living-name' +
        (pp.isMe ? " tile-you" : "") +
        '">' +
        (pp.isMe
          ? "You (" + escHtml(getNickForPlayer(pp.id)) + ")"
          : escHtml(getNickForPlayer(pp.id))) +
        "</div>";
      if (ppData.class_id) {
        html +=
          '<div class="tile-row">Class: ' +
          escHtml(String(ppData.class_id)) +
          "</div>";
      }
      var ppSlotIds = Object.keys(ppSlots);
      for (var ps = 0; ps < ppSlotIds.length; ps++) {
        var ppSlotId = ppSlotIds[ps];
        html +=
          '<div class="tile-row">' +
          escHtml(inventorySlotLabel(ppData, ppSlotId)) +
          ": " +
          escHtml(
            ppSlots[ppSlotId]
              ? inventoryItemLabel(ppSlots[ppSlotId])
              : t("inventory.empty", "empty"),
          ) +
          "</div>";
      }
      var ppValueKeys = Object.keys(ppValues).sort();
      for (var pv = 0; pv < ppValueKeys.length; pv++) {
        var ppValueKey = ppValueKeys[pv];
        html +=
          '<div class="tile-row">' +
          escHtml(livingValueLabel(String(ppData.class_id || ""), ppValueKey)) +
          ": " +
          renderLivingValueDisplay(
            getLivingValueSchemaEntry(
              String(ppData.class_id || ""),
              ppValueKey,
            ),
            ppValues[ppValueKey],
          ) +
          "</div>";
      }
      html += "</div>";
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
      var npcEntry = npcsHere[k];
      var npcData = npcEntry.data || {};
      var npcSlots =
        npcData.slots && typeof npcData.slots === "object" ? npcData.slots : {};
      var npcBag = Array.isArray(npcData.bag) ? npcData.bag : [];
      var npcValues =
        npcData.values && typeof npcData.values === "object"
          ? npcData.values
          : {};
      html += '<div class="tile-living-entry">';
      html +=
        '<div class="tile-living-name">' +
        escHtml(npcDisplayName(npcEntry.id)) +
        "</div>";
      if (npcData.class_id) {
        html +=
          '<div class="tile-row">Class: ' +
          escHtml(String(npcData.class_id)) +
          "</div>";
      }
      var npcSlotIds = Object.keys(npcSlots);
      for (var ns = 0; ns < npcSlotIds.length; ns++) {
        var npcSlotId = npcSlotIds[ns];
        html +=
          '<div class="tile-row">' +
          escHtml(inventorySlotLabel(npcData, npcSlotId)) +
          ": " +
          escHtml(
            npcSlots[npcSlotId]
              ? inventoryItemLabel(npcSlots[npcSlotId])
              : t("inventory.empty", "empty"),
          ) +
          "</div>";
      }
      if (npcBag.length > 0) {
        html +=
          '<div class="tile-row">Bag items: ' +
          escHtml(String(npcBag.length)) +
          "</div>";
      }
      var npcValueKeys = Object.keys(npcValues).sort();
      for (var nv = 0; nv < npcValueKeys.length; nv++) {
        var npcValueKey = npcValueKeys[nv];
        html +=
          '<div class="tile-row">' +
          escHtml(
            livingValueLabel(String(npcData.class_id || ""), npcValueKey),
          ) +
          ": " +
          renderLivingValueDisplay(
            getLivingValueSchemaEntry(
              String(npcData.class_id || ""),
              npcValueKey,
            ),
            npcValues[npcValueKey],
          ) +
          "</div>";
      }
      html += "</div>";
    }
  }
  html += "</div>";

  requireElementById("tile-detail-body").innerHTML = html;
  requireElementById("hud-tile-detail").style.display = "block";
}

// ── Input ────────────────────────────────────────────────────────────────
/** @type {Record<string, boolean>} */
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

/** @param {any} el */
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
  cameraOrbit.theta -= dx * 0.005;
  cameraOrbit.phi = Math.max(0.15, Math.min(1.4, cameraOrbit.phi - dy * 0.004));
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

requireElementById("hud-inventory-panel").addEventListener(
  "wheel",
  function (e) {
    e.stopPropagation();
  },
  { passive: true },
);

requireElementById("hud-crafting-panel").addEventListener(
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
    cameraOrbit.radius = Math.max(
      10,
      Math.min(150, cameraOrbit.radius + e.deltaY * 0.05),
    );
  },
  { passive: false },
);

// ── Joystick element references (must be defined before touch handlers) ──
var joystickBase = requireElementById("joystick-base");
var joystickStick = requireElementById("joystick-stick");
var joystickActive = false;
var joystickMouseActive = false; // separate flag for mouse vs touch
var joystickDirection = { x: 0, y: 0 }; // normalized direction

// Touch controls (mobile) - for camera rotation and pinch-to-zoom
var isTouchRotating = false;

/** @param {Touch} touch */
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

/** @param {Touch} touch */
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
  var craftingDiv = document.getElementById("hud-crafting-panel");
  if (craftingDiv && craftingDiv.style.display !== "none") {
    var craftingRect = craftingDiv.getBoundingClientRect();
    if (
      touch.clientX >= craftingRect.left &&
      touch.clientX <= craftingRect.right &&
      touch.clientY >= craftingRect.top &&
      touch.clientY <= craftingRect.bottom
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
      cameraOrbit.theta -= dx * 0.005;
      cameraOrbit.phi = Math.max(
        0.15,
        Math.min(1.4, cameraOrbit.phi - dy * 0.004),
      );
    } else if (e.touches.length === 2) {
      e.preventDefault();
      // Pinch to zoom
      var dx = e.touches[1].clientX - e.touches[0].clientX;
      var dy = e.touches[1].clientY - e.touches[0].clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var delta = lastTouchDist - dist;
      lastTouchDist = dist;
      cameraOrbit.radius = Math.max(
        10,
        Math.min(150, cameraOrbit.radius + delta * 0.2),
      );
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
/**
 * @param {number} touchX
 * @param {number} touchY
 */
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

// ── Editing rights (creator's stone) ─────────────────────────────────────

/** @returns {boolean} */
function playerHasCreatorStone() {
  if (!playerInventory) return false;
  var slots =
    playerInventory.slots && typeof playerInventory.slots === "object"
      ? playerInventory.slots
      : {};
  var slotIds = Object.keys(slots);
  for (var i = 0; i < slotIds.length; i++) {
    var item = slots[slotIds[i]];
    if (item && item.type === "creator_stone") return true;
  }
  var bag = Array.isArray(playerInventory.bag) ? playerInventory.bag : [];
  for (var j = 0; j < bag.length; j++) {
    if (bag[j] && bag[j].type === "creator_stone") return true;
  }
  return false;
}

function updateEditingRightsUI() {
  var hasRights = playerHasCreatorStone();
  requireElementById("btn-item-classes").style.display = hasRights
    ? ""
    : "none";
  requireElementById("btn-action-classes").style.display = hasRights
    ? ""
    : "none";
  requireElementById("btn-living-classes").style.display = hasRights
    ? ""
    : "none";
  if (!hasRights) {
    if (itemClassPanelVisible) closeItemClassPanel();
    if (actionClassPanelVisible) closeActionClassPanel();
    if (livingClassPanelVisible) closeLivingClassPanel();
  }
}

// ── Item class panel ─────────────────────────────────────────────────────

function renderItemClassList() {
  var listDiv = requireElementById("item-class-list");
  fetchWithAuth("/virtual-world/item-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.item_classes) ? data.item_classes : [];
      if (!classes.length) {
        listDiv.innerHTML =
          '<div class="class-row"><em style="opacity:0.55">No custom item types yet.</em></div>';
        return;
      }
      var rows = "";
      for (var i = 0; i < classes.length; i++) {
        var ic = classes[i];
        var label = escHtml(
          String((ic.visuals && ic.visuals.fallbackLabel) || ic.id || "?"),
        );
        var id = escHtml(String(ic.id || ""));
        rows +=
          '<div class="class-row">' +
          '<span class="class-row-id">' +
          id +
          "</span> " +
          '<span class="class-row-label">' +
          label +
          "</span>" +
          '<span class="class-row-btns">' +
          '<button data-item-class-id="' +
          id +
          '" onclick="editItemClass(this.dataset.itemClassId)">Edit</button>' +
          '<button data-item-class-id="' +
          id +
          '" onclick="deleteItemClassUI(this.dataset.itemClassId)">Del</button>' +
          "</span></div>";
      }
      listDiv.innerHTML = rows;
    })
    .catch(function () {
      listDiv.innerHTML =
        '<div class="class-row" style="color:#f88">Failed to load.</div>';
    });
}

/** @param {string} id */
function editItemClass(id) {
  fetchWithAuth("/virtual-world/item-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.item_classes) ? data.item_classes : [];
      var ic = null;
      for (var i = 0; i < classes.length; i++) {
        if (String(classes[i].id) === String(id)) {
          ic = classes[i];
          break;
        }
      }
      if (!ic) {
        showHudToast("Item type not found", true);
        return;
      }
      itemClassEditId = String(id);
      var idEl = /** @type {HTMLInputElement} */ (requireElementById("ic-id"));
      idEl.value = String(ic.id || "");
      idEl.disabled = true;
      /** @type {HTMLInputElement} */ (requireElementById("ic-label")).value =
        String((ic.visuals && ic.visuals.fallbackLabel) || "");
      /** @type {HTMLSelectElement} */ (requireElementById("ic-kind")).value =
        String(ic.kind || "tool");
      /** @type {HTMLInputElement} */ (
        requireElementById("ic-spawnable")
      ).checked = !!ic.spawnable;
      /** @type {HTMLInputElement} */ (requireElementById("ic-extra")).checked =
        !!ic.extra;
      /** @type {HTMLInputElement} */ (
        requireElementById("ic-non-droppable")
      ).checked = !!ic.nonDroppable;
      /** @type {HTMLInputElement} */ (
        requireElementById("ic-action-ids")
      ).value = Array.isArray(ic.actionIds) ? ic.actionIds.join(",") : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("ic-state-template")
      ).value =
        ic.stateTemplate && Object.keys(ic.stateTemplate).length
          ? JSON.stringify(ic.stateTemplate, null, 2)
          : "";
      requireElementById("item-class-form-title").textContent =
        "Edit: " + String(id);
    })
    .catch(function () {
      showHudToast("Failed to load item type", true);
    });
}

function cancelItemClassEdit() {
  itemClassEditId = null;
  var idEl = /** @type {HTMLInputElement} */ (requireElementById("ic-id"));
  idEl.disabled = false;
  idEl.value = "";
  /** @type {HTMLInputElement} */ (requireElementById("ic-label")).value = "";
  /** @type {HTMLSelectElement} */ (requireElementById("ic-kind")).value =
    "tool";
  /** @type {HTMLInputElement} */ (requireElementById("ic-spawnable")).checked =
    false;
  /** @type {HTMLInputElement} */ (requireElementById("ic-extra")).checked =
    false;
  /** @type {HTMLInputElement} */ (
    requireElementById("ic-non-droppable")
  ).checked = false;
  /** @type {HTMLInputElement} */ (requireElementById("ic-action-ids")).value =
    "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("ic-state-template")
  ).value = "";
  requireElementById("item-class-form-title").textContent = "New item type";
}

function submitItemClassForm() {
  var idVal = /** @type {HTMLInputElement} */ (
    requireElementById("ic-id")
  ).value.trim();
  if (!idVal) {
    showHudToast("Item type ID is required", true);
    return;
  }
  var labelVal = /** @type {HTMLInputElement} */ (
    requireElementById("ic-label")
  ).value.trim();
  var kindVal = /** @type {HTMLSelectElement} */ (requireElementById("ic-kind"))
    .value;
  var spawnableVal = /** @type {HTMLInputElement} */ (
    requireElementById("ic-spawnable")
  ).checked;
  var extraVal = /** @type {HTMLInputElement} */ (
    requireElementById("ic-extra")
  ).checked;
  var nonDroppableVal = /** @type {HTMLInputElement} */ (
    requireElementById("ic-non-droppable")
  ).checked;
  var actionIdsRaw = /** @type {HTMLInputElement} */ (
    requireElementById("ic-action-ids")
  ).value;
  var stateTemplateRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("ic-state-template")
  ).value.trim();
  var actionIds = actionIdsRaw
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  var stateTemplate = {};
  if (stateTemplateRaw) {
    try {
      stateTemplate = JSON.parse(stateTemplateRaw);
    } catch (e) {
      showHudToast("Invalid state template JSON", true);
      return;
    }
  }
  var record = {
    id: idVal,
    kind: kindVal,
    spawnable: spawnableVal,
    extra: extraVal,
    nonDroppable: nonDroppableVal,
    visuals: { fallbackLabel: labelVal || idVal },
    actionIds: actionIds,
    stateTemplate: stateTemplate,
  };
  var url = itemClassEditId
    ? "/virtual-world/item-classes/" + encodeURIComponent(itemClassEditId)
    : "/virtual-world/item-classes";
  var method = itemClassEditId ? "PUT" : "POST";
  fetchWithAuth(url, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(String(data.error || "Save failed"), true);
        return;
      }
      showHudToast("Saved!", false);
      cancelItemClassEdit();
      renderItemClassList();
    })
    .catch(function () {
      showHudToast("Save failed", true);
    });
}

/** @param {string} id */
function deleteItemClassUI(id) {
  fetchWithAuth(
    "/virtual-world/item-classes/" + encodeURIComponent(String(id)),
    { method: "DELETE" },
  )
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(String(data.error || "Delete failed"), true);
        return;
      }
      showHudToast("Deleted " + String(id), false);
      if (itemClassEditId === String(id)) cancelItemClassEdit();
      renderItemClassList();
    })
    .catch(function () {
      showHudToast("Delete failed", true);
    });
}

function showItemClassPanel() {
  if (inventoryPanelVisible) closeInventoryPanel();
  if (craftingPanelVisible) closeCraftingPanel();
  if (actionClassPanelVisible) closeActionClassPanel();
  if (livingClassPanelVisible) closeLivingClassPanel();
  itemClassPanelVisible = true;
  requireElementById("hud-item-class-panel").style.display = "block";
  renderItemClassList();
}

function closeItemClassPanel() {
  itemClassPanelVisible = false;
  requireElementById("hud-item-class-panel").style.display = "none";
}

function toggleItemClassPanel() {
  if (itemClassPanelVisible) closeItemClassPanel();
  else showItemClassPanel();
}

// ── Action class panel ────────────────────────────────────────────────────

function renderActionClassList() {
  var listDiv = requireElementById("action-class-list");
  fetchWithAuth("/virtual-world/action-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.action_classes) ? data.action_classes : [];
      if (!classes.length) {
        listDiv.innerHTML =
          '<div class="class-row"><em style="opacity:0.55">No custom action types yet.</em></div>';
        return;
      }
      var rows = "";
      for (var i = 0; i < classes.length; i++) {
        var ac = classes[i];
        var label = escHtml(String(ac.fallbackLabel || ac.id || "?"));
        var id = escHtml(String(ac.id || ""));
        rows +=
          '<div class="class-row">' +
          '<span class="class-row-id">' +
          id +
          "</span> " +
          '<span class="class-row-label">' +
          label +
          "</span>" +
          '<span class="class-row-btns">' +
          '<button data-action-class-id="' +
          id +
          '" onclick="editActionClass(this.dataset.actionClassId)">Edit</button>' +
          '<button data-action-class-id="' +
          id +
          '" onclick="deleteActionClassUI(this.dataset.actionClassId)">Del</button>' +
          "</span></div>";
      }
      listDiv.innerHTML = rows;
    })
    .catch(function () {
      listDiv.innerHTML =
        '<div class="class-row" style="color:#f88">Failed to load.</div>';
    });
}

/** @param {string} id */
function editActionClass(id) {
  fetchWithAuth("/virtual-world/action-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.action_classes) ? data.action_classes : [];
      var ac = null;
      for (var i = 0; i < classes.length; i++) {
        if (String(classes[i].id) === String(id)) {
          ac = classes[i];
          break;
        }
      }
      if (!ac) {
        showHudToast("Action type not found", true);
        return;
      }
      actionClassEditId = String(id);
      var idEl = /** @type {HTMLInputElement} */ (requireElementById("ac-id"));
      idEl.value = String(ac.id || "");
      idEl.disabled = true;
      /** @type {HTMLInputElement} */ (requireElementById("ac-label")).value =
        String(ac.fallbackLabel || "");
      /** @type {HTMLSelectElement} */ (
        requireElementById("ac-target-kind")
      ).value = String(ac.targetKind || "self");
      /** @type {HTMLInputElement} */ (
        requireElementById("ac-source-items")
      ).value = Array.isArray(ac.sourceItemIds)
        ? ac.sourceItemIds.join(",")
        : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("ac-logic-spec")
      ).value = ac.logicSpec ? JSON.stringify(ac.logicSpec, null, 2) : "";
      requireElementById("action-class-form-title").textContent =
        "Edit: " + String(id);
    })
    .catch(function () {
      showHudToast("Failed to load action type", true);
    });
}

function cancelActionClassEdit() {
  actionClassEditId = null;
  var idEl = /** @type {HTMLInputElement} */ (requireElementById("ac-id"));
  idEl.disabled = false;
  idEl.value = "";
  /** @type {HTMLInputElement} */ (requireElementById("ac-label")).value = "";
  /** @type {HTMLSelectElement} */ (
    requireElementById("ac-target-kind")
  ).value = "self";
  /** @type {HTMLInputElement} */ (
    requireElementById("ac-source-items")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("ac-logic-spec")
  ).value = "";
  requireElementById("action-class-form-title").textContent = "New action type";
}

function submitActionClassForm() {
  var idVal = /** @type {HTMLInputElement} */ (
    requireElementById("ac-id")
  ).value.trim();
  if (!idVal) {
    showHudToast("Action type ID is required", true);
    return;
  }
  var labelVal = /** @type {HTMLInputElement} */ (
    requireElementById("ac-label")
  ).value.trim();
  var targetKindVal = /** @type {HTMLSelectElement} */ (
    requireElementById("ac-target-kind")
  ).value;
  var sourceItemsRaw = /** @type {HTMLInputElement} */ (
    requireElementById("ac-source-items")
  ).value;
  var logicSpecRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("ac-logic-spec")
  ).value.trim();
  var sourceItemIds = sourceItemsRaw
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  var logicSpec;
  if (logicSpecRaw) {
    try {
      logicSpec = JSON.parse(logicSpecRaw);
    } catch (e) {
      showHudToast("Invalid logic spec JSON", true);
      return;
    }
  }
  var record = {
    id: idVal,
    fallbackLabel: labelVal || idVal,
    targetKind: targetKindVal,
    sourceItemIds: sourceItemIds,
    logicSpec: logicSpec,
  };
  var url = actionClassEditId
    ? "/virtual-world/action-classes/" + encodeURIComponent(actionClassEditId)
    : "/virtual-world/action-classes";
  var method = actionClassEditId ? "PUT" : "POST";
  fetchWithAuth(url, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(String(data.error || "Save failed"), true);
        return;
      }
      showHudToast("Saved!", false);
      cancelActionClassEdit();
      renderActionClassList();
    })
    .catch(function () {
      showHudToast("Save failed", true);
    });
}

/** @param {string} id */
function deleteActionClassUI(id) {
  fetchWithAuth(
    "/virtual-world/action-classes/" + encodeURIComponent(String(id)),
    { method: "DELETE" },
  )
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(String(data.error || "Delete failed"), true);
        return;
      }
      showHudToast("Deleted " + String(id), false);
      if (actionClassEditId === String(id)) cancelActionClassEdit();
      renderActionClassList();
    })
    .catch(function () {
      showHudToast("Delete failed", true);
    });
}

function showActionClassPanel() {
  if (inventoryPanelVisible) closeInventoryPanel();
  if (craftingPanelVisible) closeCraftingPanel();
  if (itemClassPanelVisible) closeItemClassPanel();
  if (livingClassPanelVisible) closeLivingClassPanel();
  actionClassPanelVisible = true;
  requireElementById("hud-action-class-panel").style.display = "block";
  renderActionClassList();
}

function closeActionClassPanel() {
  actionClassPanelVisible = false;
  requireElementById("hud-action-class-panel").style.display = "none";
}

function toggleActionClassPanel() {
  if (actionClassPanelVisible) closeActionClassPanel();
  else showActionClassPanel();
}

// ── Living class panel ────────────────────────────────────────────────────

function renderLivingClassList() {
  var listDiv = requireElementById("living-class-list");
  fetchWithAuth("/virtual-world/living-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.living_classes) ? data.living_classes : [];
      if (!classes.length) {
        listDiv.innerHTML =
          '<div class="class-row"><em style="opacity:0.55">No custom living types yet.</em></div>';
        return;
      }
      var rows = "";
      for (var i = 0; i < classes.length; i++) {
        var lc = classes[i];
        var label = escHtml(String(lc.kind || "?"));
        var id = escHtml(String(lc.id || ""));
        rows +=
          '<div class="class-row">' +
          '<span class="class-row-id">' +
          id +
          "</span> " +
          '<span class="class-row-label">' +
          label +
          "</span>" +
          '<span class="class-row-btns">' +
          '<button data-living-class-id="' +
          id +
          '" onclick="editLivingClass(this.dataset.livingClassId)">Edit</button>' +
          '<button data-living-class-id="' +
          id +
          '" onclick="deleteLivingClassUI(this.dataset.livingClassId)">Del</button>' +
          "</span></div>";
      }
      listDiv.innerHTML = rows;
    })
    .catch(function () {
      listDiv.innerHTML =
        '<div class="class-row" style="color:#f88">Failed to load.</div>';
    });
}

/** @param {string} id */
function editLivingClass(id) {
  fetchWithAuth("/virtual-world/living-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.living_classes) ? data.living_classes : [];
      var lc = null;
      for (var i = 0; i < classes.length; i++) {
        if (String(classes[i].id) === String(id)) {
          lc = classes[i];
          break;
        }
      }
      if (!lc) {
        showHudToast("Living type not found", true);
        return;
      }
      livingClassEditId = String(id);
      var idEl = /** @type {HTMLInputElement} */ (requireElementById("lc-id"));
      idEl.value = String(lc.id || "");
      idEl.disabled = true;
      /** @type {HTMLSelectElement} */ (requireElementById("lc-kind")).value =
        String(lc.kind || "creature");
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("lc-slot-definitions")
      ).value =
        Array.isArray(lc.slotDefinitions) && lc.slotDefinitions.length
          ? JSON.stringify(lc.slotDefinitions, null, 2)
          : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("lc-value-template")
      ).value =
        lc.valueTemplate && Object.keys(lc.valueTemplate).length
          ? JSON.stringify(lc.valueTemplate, null, 2)
          : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("lc-value-schema")
      ).value =
        lc.valueSchema && Object.keys(lc.valueSchema).length
          ? JSON.stringify(lc.valueSchema, null, 2)
          : "";
      requireElementById("living-class-form-title").textContent =
        "Edit: " + String(id);
    })
    .catch(function () {
      showHudToast("Failed to load living type", true);
    });
}

function cancelLivingClassEdit() {
  livingClassEditId = null;
  var idEl = /** @type {HTMLInputElement} */ (requireElementById("lc-id"));
  idEl.disabled = false;
  idEl.value = "";
  /** @type {HTMLSelectElement} */ (requireElementById("lc-kind")).value =
    "creature";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-slot-definitions")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-value-template")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-value-schema")
  ).value = "";
  requireElementById("living-class-form-title").textContent = "New living type";
}

function submitLivingClassForm() {
  var idVal = /** @type {HTMLInputElement} */ (
    requireElementById("lc-id")
  ).value.trim();
  if (!idVal) {
    showHudToast("Living type ID is required", true);
    return;
  }
  var kindVal = /** @type {HTMLSelectElement} */ (requireElementById("lc-kind"))
    .value;
  var slotDefinitionsRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-slot-definitions")
  ).value.trim();
  var valueTemplateRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-value-template")
  ).value.trim();
  var valueSchemaRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-value-schema")
  ).value.trim();
  var slotDefinitions = [];
  if (slotDefinitionsRaw) {
    try {
      slotDefinitions = JSON.parse(slotDefinitionsRaw);
    } catch (e) {
      showHudToast("Invalid slot definitions JSON", true);
      return;
    }
    if (!Array.isArray(slotDefinitions)) {
      showHudToast("Slot definitions must be a JSON array", true);
      return;
    }
  }
  var valueTemplate = {};
  if (valueTemplateRaw) {
    try {
      valueTemplate = JSON.parse(valueTemplateRaw);
    } catch (e) {
      showHudToast("Invalid value template JSON", true);
      return;
    }
  }
  var valueSchema;
  if (valueSchemaRaw) {
    try {
      valueSchema = JSON.parse(valueSchemaRaw);
    } catch (e) {
      showHudToast("Invalid value schema JSON", true);
      return;
    }
  }
  var record = {
    id: idVal,
    kind: kindVal,
    slotDefinitions: slotDefinitions,
    valueTemplate: valueTemplate,
    valueSchema: valueSchema,
  };
  var url = livingClassEditId
    ? "/virtual-world/living-classes/" + encodeURIComponent(livingClassEditId)
    : "/virtual-world/living-classes";
  var method = livingClassEditId ? "PUT" : "POST";
  fetchWithAuth(url, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(String(data.error || "Save failed"), true);
        return;
      }
      showHudToast("Saved!", false);
      cancelLivingClassEdit();
      renderLivingClassList();
    })
    .catch(function () {
      showHudToast("Save failed", true);
    });
}

/** @param {string} id */
function deleteLivingClassUI(id) {
  fetchWithAuth(
    "/virtual-world/living-classes/" + encodeURIComponent(String(id)),
    { method: "DELETE" },
  )
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(String(data.error || "Delete failed"), true);
        return;
      }
      showHudToast("Deleted " + String(id), false);
      if (livingClassEditId === String(id)) cancelLivingClassEdit();
      renderLivingClassList();
    })
    .catch(function () {
      showHudToast("Delete failed", true);
    });
}

function showLivingClassPanel() {
  if (inventoryPanelVisible) closeInventoryPanel();
  if (craftingPanelVisible) closeCraftingPanel();
  if (itemClassPanelVisible) closeItemClassPanel();
  if (actionClassPanelVisible) closeActionClassPanel();
  livingClassPanelVisible = true;
  requireElementById("hud-living-class-panel").style.display = "block";
  renderLivingClassList();
}

function closeLivingClassPanel() {
  livingClassPanelVisible = false;
  requireElementById("hud-living-class-panel").style.display = "none";
}

function toggleLivingClassPanel() {
  if (livingClassPanelVisible) closeLivingClassPanel();
  else showLivingClassPanel();
}

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
  appRender.handleResize();
});
