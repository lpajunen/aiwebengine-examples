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
  var isOakCenter =
    String(worldId) === "10000" &&
    row === OAK_CENTER_ROW &&
    col === OAK_CENTER_COL;

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
  } else if (terrainType === clientTileValueForName("bridge")) {
    terrainLabel = t("terrain.bridge", "Bridge");
  } else {
    terrainLabel =
      treeMod && treeMod.action === "cut"
        ? t("terrain.ground_tree_cut", "Forest floor (pine cut)")
        : t("terrain.ground", "Forest floor");
  }

  var tileItems = worldItemsByTile[key] || [];

  // Plain "item"/"living" targeted actions (e.g. poke) require the entity on
  // the actor's own tile. "item_nearby"/"living_nearby" actions (e.g. follow,
  // fight) also work up to NEARBY_ACTION_TILE_DISTANCE tiles away — see
  // isWithinTileDistance() in tree-action-helpers.ts on the server.
  var isOwnTile = row === avatarRow && col === avatarCol;
  var isNearbyTile = isWithinTileDistance(
    row,
    col,
    avatarRow,
    avatarCol,
    NEARBY_ACTION_TILE_DISTANCE,
  );
  var itemActionIds = isOwnTile
    ? actionsAvailableForTargetKind("item", false)
    : isNearbyTile
      ? actionsAvailableForTargetKind("item", true)
      : [];
  var livingActionIds = isOwnTile
    ? actionsAvailableForTargetKind("living", false)
    : isNearbyTile
      ? actionsAvailableForTargetKind("living", true)
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

  /**
   * Joins already-escaped "label: value" strings into a single dense row
   * instead of one row per attribute, so an equipped/stat-heavy entity
   * doesn't push the panel to dozens of rows. Returns "" (no row) when
   * there's nothing to show.
   * @param {string[]} parts
   * @returns {string}
   */
  function tileCompactRow(parts) {
    if (!parts.length) return "";
    return '<div class="tile-row">' + parts.join(" &middot; ") + "</div>";
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
      var label = inventoryItemLabel(itm);
      var containerOpenBtn =
        isOwnTile && isContainerItemType(itm.type)
          ? "<button onclick=\"openContainerFromTile('" +
            escHtml(String(itm.id)) +
            "')\">" +
            escHtml(t("inventory.open", "Open")) +
            "</button> "
          : "";
      // Per-item button gating: hide the individual-pick button on
      // non-pickable items, and hide any action whose validWhen precondition
      // fails for this item (e.g. Fix only on a damaged item, Bury only on a
      // corpse) — DESIGN-targeting.md step 3.
      var itmTarget = { type: itm.type, state: itm.state };
      var thisItemActions = itemActionIds.filter(function (a) {
        if (a === "pick_item" && !isPickableItemType(itm.type)) return false;
        return actionValidForTarget(a, itmTarget);
      });
      html +=
        '<div class="tile-row">' +
        escHtml(label) +
        " " +
        containerOpenBtn +
        entityActionButtons(
          thisItemActions,
          "target-item-id",
          String(itm.id),
          "postItemTargetedAction",
        ) +
        "</div>";
      if (itm.type === "portal" || itm.type === "door") {
        html +=
          '<div class="tile-row">' +
          escHtml(t("tile.leads_to", "Leads to")) +
          " " +
          escHtml(portalDestinationLabel(itm)) +
          "</div>";
      }
      var itmState =
        itm.state && typeof itm.state === "object" ? itm.state : {};
      var itmStatParts = [];
      if (
        "currentHitPoints" in itmState ||
        typeof itmState.maxHitPoints === "number"
      ) {
        itmStatParts.push(
          escHtml(itemStateValueLabel("currentHitPoints")) +
            ": " +
            escHtml(
              formatLivingValue(itmState.currentHitPoints, "currentHitPoints"),
            ) +
            "/" +
            escHtml(formatLivingValue(itmState.maxHitPoints, "maxHitPoints")),
        );
      }
      if ("armorClass" in itmState) {
        itmStatParts.push(
          escHtml(itemStateValueLabel("armorClass")) +
            ": " +
            escHtml(formatLivingValue(itmState.armorClass, "armorClass")),
        );
      }
      if ("weaponClass" in itmState) {
        itmStatParts.push(
          escHtml(itemStateValueLabel("weaponClass")) +
            ": " +
            escHtml(formatLivingValue(itmState.weaponClass, "weaponClass")),
        );
      }
      html += tileCompactRow(itmStatParts);
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
      var ppActions = livingActionIds.filter(function (a) {
        return actionValidForTarget(a, {
          type: ppData.class_id,
          state: ppData.state,
          values: ppValues,
        });
      });
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
          ppActions,
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
      var ppEquippedParts = [];
      for (var ps = 0; ps < ppSlotIds.length; ps++) {
        var ppSlotId = ppSlotIds[ps];
        if (!ppSlots[ppSlotId]) continue;
        ppEquippedParts.push(
          escHtml(inventorySlotLabel(ppData, ppSlotId)) +
            ": " +
            escHtml(inventoryItemLabel(ppSlots[ppSlotId])),
        );
      }
      html += tileCompactRow(ppEquippedParts);
      var ppValueKeys = Object.keys(ppValues).sort(function (a, b) {
        return livingValueLabel(String(ppData.class_id || ""), a).localeCompare(
          livingValueLabel(String(ppData.class_id || ""), b),
        );
      });
      var ppStatParts = [];
      for (var pv = 0; pv < ppValueKeys.length; pv++) {
        var ppValueKey = ppValueKeys[pv];
        ppStatParts.push(
          escHtml(livingValueLabel(String(ppData.class_id || ""), ppValueKey)) +
            ": " +
            escHtml(formatLivingValue(ppValues[ppValueKey], ppValueKey)),
        );
      }
      html += tileCompactRow(ppStatParts);
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
      var npcActions = livingActionIds.filter(function (a) {
        return actionValidForTarget(a, {
          type: npcData.class_id,
          state: npcData.state,
          values: npcValues,
        });
      });
      html += '<div class="tile-living-entry">';
      html +=
        '<div class="tile-living-name">' +
        escHtml(npcDisplayName(npcEntry.id)) +
        " " +
        entityActionButtons(
          npcActions,
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
      var npcEquippedParts = [];
      for (var ns = 0; ns < npcSlotIds.length; ns++) {
        var npcSlotId = npcSlotIds[ns];
        if (!npcSlots[npcSlotId]) continue;
        npcEquippedParts.push(
          escHtml(inventorySlotLabel(npcData, npcSlotId)) +
            ": " +
            escHtml(inventoryItemLabel(npcSlots[npcSlotId])),
        );
      }
      if (npcBagCount > 0) {
        npcEquippedParts.push(
          escHtml(t("tile.bag_items", "Bag items:")) +
            " " +
            escHtml(String(npcBagCount)),
        );
      }
      html += tileCompactRow(npcEquippedParts);
      var npcValueKeys = Object.keys(npcValues).sort(function (a, b) {
        return livingValueLabel(
          String(npcData.class_id || ""),
          a,
        ).localeCompare(livingValueLabel(String(npcData.class_id || ""), b));
      });
      var npcStatParts = [];
      for (var nv = 0; nv < npcValueKeys.length; nv++) {
        var npcValueKey = npcValueKeys[nv];
        npcStatParts.push(
          escHtml(
            livingValueLabel(String(npcData.class_id || ""), npcValueKey),
          ) +
            ": " +
            escHtml(formatLivingValue(npcValues[npcValueKey], npcValueKey)),
        );
      }
      html += tileCompactRow(npcStatParts);
      html += "</div>";
    }
  }
  html += "</div>";

  requireElementById("tile-detail-body").innerHTML = html;
  requireElementById("hud-tile-detail").style.display = "block";
}
