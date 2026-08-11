/// <reference path="virtual-world-browser-globals.d.ts" />
// Tile inspector: raycast tile picking and the tile detail panel.

// ── Tile inspector (click/tap to see square contents) ─────────────────────
var tileRaycaster = new THREE.Raycaster();
var tileRayMouse = new THREE.Vector2();
var selectedTileRow = -1;
var selectedTileCol = -1;

// Invisible flat plane covering the entire world grid, used only for raycasting
var tileColliderMat = new THREE.MeshBasicMaterial({
  visible: false,
  side: THREE.DoubleSide,
});
var tileCollider = new THREE.Mesh(
  new THREE.PlaneGeometry(COLS * TILE, ROWS * TILE),
  tileColliderMat,
);
tileCollider.rotation.x = -Math.PI / 2;
scene.add(tileCollider);

/**
 * Resizes the pick plane to the current world and re-centres it. Travelling
 * in place to a world of a different size leaves the plane covering the old
 * extent, so rays either miss it or land outside the new bounds and tile
 * selection silently stops working until the page is reloaded — which is what
 * stepping through a rune gate does. Called from buildStaticWorldMeshes once
 * it has recomputed ROWS/COLS.
 *
 * The centre is computed here rather than read from mapCX/mapCZ: those are set
 * once when the scene is created and are themselves stale after a swap.
 */
function refreshTileCollider() {
  if (tileCollider.geometry) tileCollider.geometry.dispose();
  tileCollider.geometry = new THREE.PlaneGeometry(COLS * TILE, ROWS * TILE);
  tileCollider.position.set((COLS * TILE) / 2, 0, (ROWS * TILE) / 2);
}
refreshTileCollider();

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

/**
 * @param {number} row
 * @param {number} col
 * @param {string} id
 * @returns {string} label for a world item by id on a tile, id as fallback.
 */
function aimItemLabelOnTile(row, col, id) {
  var arr = worldItemsByTile[row + "_" + col];
  if (Array.isArray(arr)) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && String(arr[i].id) === id) return inventoryItemLabel(arr[i]);
    }
  }
  return id;
}

/**
 * Disambiguation chooser (UI phase 3): when an armed entity action has several
 * valid targets on the tapped tile, reuse the tile panel to list them so the
 * player picks which one; choosing invokes the armed action on it
 * (chooseAimTarget in client-aiming.js). Also serves the bag chooser, whose
 * targets carry their own `label` and have no tile.
 * @param {string} action
 * @param {Array<{kind:"living"|"item", id:string, row?:number, col?:number, label?:string}>} targets
 * @param {string} [title] Panel heading; defaults to "Choose target".
 */
function showTargetChooser(action, targets, title) {
  requireElementById("tile-detail-title").textContent =
    (title || t("tile.choose_target", "Choose target")) +
    " — " +
    treeActionLabel(action);
  var html = '<div class="tile-section">';
  for (var i = 0; i < targets.length; i++) {
    var tgt = targets[i];
    var label = tgt.label
      ? tgt.label
      : tgt.kind === "living"
        ? npcAvatars[tgt.id]
          ? npcDisplayName(tgt.id)
          : getNickForPlayer(tgt.id)
        : aimItemLabelOnTile(Number(tgt.row), Number(tgt.col), tgt.id);
    html +=
      '<div class="tile-row"><button data-action-id="' +
      escHtml(action) +
      '" data-kind="' +
      escHtml(tgt.kind) +
      '" data-id="' +
      escHtml(tgt.id) +
      '" onclick="chooseAimTarget(this)">' +
      escHtml(label) +
      "</button></div>";
  }
  html += "</div>";
  requireElementById("tile-detail-body").innerHTML = html;
  requireElementById("hud-tile-detail").style.display = "block";
}

/**
 * Joins already-escaped "label: value" strings into a single dense row instead
 * of one row per attribute, so a stat-heavy entity doesn't push the panel to
 * dozens of rows. Returns "" (no row) when there's nothing to show.
 * @param {string[]} parts
 * @returns {string}
 */
function tileCompactRow(parts) {
  if (!parts.length) return "";
  return '<div class="tile-row">' + parts.join(" &middot; ") + "</div>";
}

/**
 * Escaped "label: value" fragments for an item's stats, shared by the tile
 * inspector and the examine panel. currentHitPoints/maxHitPoints collapse into
 * one "Hit points: cur/max" fragment. With allStats every other scalar state
 * key (a weapon's range, a creator class's own stat) is listed too; without it
 * only the fixed hit points / armor class / weapon class set is shown.
 * @param {Record<string, unknown> | null | undefined} state
 * @param {boolean} [allStats]
 * @returns {string[]}
 */
function itemStateStatParts(state, allStats) {
  var st = state && typeof state === "object" ? state : {};
  /** @type {string[]} */
  var parts = [];
  /**
   * @param {string} key
   * @param {string} value
   */
  function addPart(key, value) {
    parts.push(escHtml(itemStateValueLabel(key)) + ": " + escHtml(value));
  }
  if ("currentHitPoints" in st || typeof st.maxHitPoints === "number") {
    addPart(
      "currentHitPoints",
      formatLivingValue(st.currentHitPoints, "currentHitPoints") +
        "/" +
        formatLivingValue(st.maxHitPoints, "maxHitPoints"),
    );
  }
  if ("armorClass" in st) {
    addPart("armorClass", formatLivingValue(st.armorClass, "armorClass"));
  }
  if ("weaponClass" in st) {
    addPart("weaponClass", formatLivingValue(st.weaponClass, "weaponClass"));
  }
  if (!allStats) return parts;
  /** @type {Record<string, boolean>} */
  var shown = {
    currentHitPoints: true,
    maxHitPoints: true,
    armorClass: true,
    weaponClass: true,
    // Container fill gets its own row; the contents themselves belong to the
    // container panel, not a stat line.
    contents: true,
  };
  var keys = Object.keys(st).sort();
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (shown[key]) continue;
    var value = st[key];
    if (value === null || typeof value === "object") continue;
    addPart(key, formatLivingValue(value, key));
  }
  return parts;
}

/**
 * @typedef {{ id: string, type: string, source: string, row?: number, col?: number, slot_id?: string, kind?: string, label_key?: string, fallback_label?: string, labels?: Record<string, string>, size?: string, non_pickable?: boolean, non_droppable?: boolean, state?: Record<string, unknown>, contents_count?: number, destination_world_id?: string, destination_world_type?: string }} ExaminedItem
 */

/**
 * Renders the examine action's result: the same facts the tile inspector shows
 * for an item on a square, for the one item examined — including one carried in
 * the bag, which no tile lists. Reuses the tile detail panel so "what is this
 * thing" always appears in the same place on screen.
 * @param {ExaminedItem} info
 */
function showExaminedItemPanel(info) {
  if (!info || !info.type) return;
  // Leaving tile-inspector mode: a later tile refresh must not overwrite the
  // examine result with the square's contents.
  selectedTileRow = -1;
  selectedTileCol = -1;
  var label = localizeLabel(
    info.labels,
    info.label_key,
    info.fallback_label || humanizeType(String(info.type)),
  );
  requireElementById("tile-detail-title").textContent =
    t("examine.title", "Examined") + " — " + label;

  var html = '<div class="tile-section">';
  html +=
    '<div class="tile-section-label">' +
    escHtml(t("examine.item_section", "Item")) +
    "</div>";
  html += '<div class="tile-row">' + escHtml(label) + "</div>";
  if (info.kind) {
    html +=
      '<div class="tile-row">' +
      escHtml(t("examine.kind_label", "Kind:")) +
      " " +
      escHtml(
        t("item.kind." + String(info.kind), humanizeType(String(info.kind))),
      ) +
      "</div>";
  }
  // Only worth a row when the item isn't the default size — every class was
  // "medium" before sizes existed, so saying so adds noise.
  if (info.size && String(info.size) !== "medium") {
    html +=
      '<div class="tile-row">' +
      escHtml(t("examine.size_label", "Size:")) +
      " " +
      escHtml(t("size." + String(info.size), humanizeType(String(info.size)))) +
      "</div>";
  }
  if (info.destination_world_id || info.destination_world_type) {
    html +=
      '<div class="tile-row">' +
      escHtml(t("tile.leads_to", "Leads to")) +
      " " +
      escHtml(portalDestinationLabel(info)) +
      "</div>";
  }
  if (typeof info.contents_count === "number") {
    html +=
      '<div class="tile-row">' +
      escHtml(t("examine.contents_label", "Contents:")) +
      " " +
      escHtml(String(info.contents_count)) +
      "</div>";
  }
  html +=
    '<div class="tile-row">' + escHtml(examineLocationText(info)) + "</div>";
  html += "</div>";

  html += '<div class="tile-section">';
  html +=
    '<div class="tile-section-label">' +
    escHtml(t("examine.properties_section", "Properties")) +
    "</div>";
  var statParts = itemStateStatParts(info.state, true);
  if (statParts.length === 0) {
    html +=
      '<div class="tile-empty">' +
      escHtml(t("examine.no_properties", "Nothing else stands out.")) +
      "</div>";
  } else {
    html += tileCompactRow(statParts);
  }
  html += "</div>";

  requireElementById("tile-detail-body").innerHTML = html;
  requireElementById("hud-tile-detail").style.display = "block";
}

/**
 * Where the examined item was found, as a display string.
 * @param {ExaminedItem} info
 * @returns {string}
 */
function examineLocationText(info) {
  if (info.source === "inventory") {
    if (info.slot_id) {
      return tFormat("examine.equipped", "Equipped in {slot}", {
        slot: inventorySlotLabel(
          normalizeClientInventory(playerInventory),
          String(info.slot_id),
        ),
      });
    }
    return t("examine.in_bag", "Carried in your bag");
  }
  if (typeof info.row === "number" && typeof info.col === "number") {
    return tFormat("examine.on_ground_at", "On the ground at ({col}, {row})", {
      col: info.col,
      row: info.row,
    });
  }
  return t("examine.on_ground", "On the ground");
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
    // A fixture standing here replaces the pine, so name the square after the
    // landmark itself rather than after the terrain it covers.
    var pineFixture = getTileFixtureItem(row, col);
    if (pineFixture) {
      terrainLabel = inventoryItemLabel(pineFixture);
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

  // Inspector only (UI phase 3): the tile panel shows what's here; actions are
  // invoked from the action palette's aim step. The container Open button is
  // the one exception (it opens a panel, it doesn't act on the world).
  var isOwnTile = row === avatarRow && col === avatarCol;

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
      // Inspector only (UI phase 3): item actions are invoked from the action
      // palette's aim step now, not per-row here. The container Open button
      // stays — it opens a panel rather than acting on the world.
      html +=
        '<div class="tile-row">' +
        escHtml(label) +
        " " +
        containerOpenBtn +
        "</div>";
      if (itm.type === "portal" || itm.type === "door") {
        html +=
          '<div class="tile-row">' +
          escHtml(t("tile.leads_to", "Leads to")) +
          " " +
          escHtml(portalDestinationLabel(itm)) +
          "</div>";
      }
      html += tileCompactRow(itemStateStatParts(itm.state));
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
      var npcValues =
        npcData.values && typeof npcData.values === "object"
          ? npcData.values
          : {};
      html += '<div class="tile-living-entry">';
      html +=
        '<div class="tile-living-name">' +
        escHtml(npcDisplayName(npcEntry.id)) +
        "</div>";
      var npcLore = npcDescription(npcEntry.id);
      if (npcLore) {
        html +=
          '<div class="tile-living-description">' + escHtml(npcLore) + "</div>";
      }
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
