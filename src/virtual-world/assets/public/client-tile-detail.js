/// <reference path="virtual-world-browser-globals.d.ts" />
// Tile inspector: raycast tile picking and the tile detail panel.

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
    t("tile.square", "Square") + " (" + col + ", " + row + ")";

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

  // Item/living-targeted actions only make sense against entities standing
  // on the actor's own tile — the button set is empty when inspecting any
  // other tile, since resolveActionTarget() on the server always resolves
  // these target kinds to the actor's current position.
  var isOwnTile = row === avatarRow && col === avatarCol;
  var itemActionIds = isOwnTile ? actionsAvailableForTargetKind("item") : [];
  var livingActionIds = isOwnTile
    ? actionsAvailableForTargetKind("living")
    : [];

  /**
   * @param {string[]} actionIds
   * @param {string} datasetAttr
   * @param {string} targetId
   * @param {string} handlerName
   * @returns {string}
   */
  function entityActionButtons(actionIds, datasetAttr, targetId, handlerName) {
    var btns = "";
    for (var a = 0; a < actionIds.length; a++) {
      btns +=
        '<button data-action-id="' +
        escHtml(actionIds[a]) +
        '" data-' +
        datasetAttr +
        '="' +
        escHtml(targetId) +
        '" onclick="' +
        handlerName +
        '(this)">' +
        escHtml(treeActionLabel(actionIds[a])) +
        "</button> ";
    }
    return btns;
  }

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
  html +=
    '<div class="tile-section-label">' +
    escHtml(t("tile.terrain_section", "Terrain")) +
    "</div>";
  html += '<div class="tile-row">' + escHtml(terrainLabel) + "</div>";
  if (
    terrainType === clientTileValueForName("house") &&
    dynamicHouses[key] &&
    dynamicHouses[key].built_by
  ) {
    html +=
      '<div class="tile-row">' +
      escHtml(t("tile.built_by", "Built by")) +
      " " +
      escHtml(getNickForPlayer(dynamicHouses[key].built_by)) +
      "</div>";
  }
  html += "</div>";

  html += '<div class="tile-section">';
  html +=
    '<div class="tile-section-label">' +
    escHtml(t("tile.items_section", "Items")) +
    " (" +
    tileItems.length +
    ")</div>";
  if (tileItems.length === 0) {
    html +=
      '<div class="tile-empty">' + escHtml(t("tile.none", "None")) + "</div>";
  } else {
    for (var i = 0; i < tileItems.length; i++) {
      var itm = tileItems[i];
      var label = t(itemTypeToLabelKey(itm.type), humanizeType(itm.type));
      html +=
        '<div class="tile-row">' +
        escHtml(label) +
        " " +
        entityActionButtons(
          itemActionIds,
          "target-item-id",
          String(itm.id),
          "postItemTargetedAction",
        ) +
        "</div>";
      if (itm.type === "portal") {
        html +=
          '<div class="tile-row">' +
          escHtml(t("tile.leads_to", "Leads to")) +
          " " +
          escHtml(portalDestinationLabel(itm)) +
          "</div>";
      }
      var itmState =
        itm.state && typeof itm.state === "object" ? itm.state : {};
      for (var isk = 0; isk < ITEM_STATE_STAT_KEYS.length; isk++) {
        var itmStateKey = ITEM_STATE_STAT_KEYS[isk];
        if (!(itmStateKey in itmState)) continue;
        html +=
          '<div class="tile-row">' +
          escHtml(itemStateValueLabel(itmStateKey)) +
          ": " +
          renderItemStateValueDisplay(
            itmStateKey,
            itmState[itmStateKey],
            itmState,
          ) +
          "</div>";
      }
    }
  }
  html += "</div>";

  html += '<div class="tile-section">';
  html +=
    '<div class="tile-section-label">' +
    escHtml(t("tile.people_section", "People")) +
    " (" +
    playersHere.length +
    ")</div>";
  if (playersHere.length === 0) {
    html +=
      '<div class="tile-empty">' + escHtml(t("tile.none", "None")) + "</div>";
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
          ? t("tile.you_label", "You") +
            " (" +
            escHtml(getNickForPlayer(pp.id)) +
            ")"
          : escHtml(getNickForPlayer(pp.id))) +
        " " +
        entityActionButtons(
          livingActionIds,
          "target-living-id",
          String(pp.id),
          "postLivingTargetedAction",
        ) +
        "</div>";
      if (ppData.class_id) {
        html +=
          '<div class="tile-row">' +
          escHtml(t("tile.class_label", "Class:")) +
          " " +
          escHtml(livingClassLabel(String(ppData.class_id))) +
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
    '<div class="tile-section-label">' +
    escHtml(t("tile.npcs_section", "NPCs")) +
    " (" +
    npcsHere.length +
    ")</div>";
  if (npcsHere.length === 0) {
    html +=
      '<div class="tile-empty">' + escHtml(t("tile.none", "None")) + "</div>";
  } else {
    for (var k = 0; k < npcsHere.length; k++) {
      var npcEntry = npcsHere[k];
      var npcData = npcEntry.data || {};
      var npcSlots =
        npcData.slots && typeof npcData.slots === "object" ? npcData.slots : {};
      // Bag contents are private and never sent to other clients; only the
      // count is public (see buildWorldNPCSnapshot on the server).
      var npcBagCount = Number(npcData.inventory_count) || 0;
      var npcValues =
        npcData.values && typeof npcData.values === "object"
          ? npcData.values
          : {};
      html += '<div class="tile-living-entry">';
      html +=
        '<div class="tile-living-name">' +
        escHtml(npcDisplayName(npcEntry.id)) +
        " " +
        entityActionButtons(
          livingActionIds,
          "target-living-id",
          String(npcEntry.id),
          "postLivingTargetedAction",
        ) +
        "</div>";
      if (npcData.class_id) {
        html +=
          '<div class="tile-row">' +
          escHtml(t("tile.class_label", "Class:")) +
          " " +
          escHtml(livingClassLabel(String(npcData.class_id))) +
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
      if (npcBagCount > 0) {
        html +=
          '<div class="tile-row">' +
          escHtml(t("tile.bag_items", "Bag items:")) +
          " " +
          escHtml(String(npcBagCount)) +
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
