/// <reference path="virtual-world-browser-globals.d.ts" />
// Action-first aiming for area (radius) attacks (DESIGN-targeting.md step 4):
// arm a point-targeted action from the cast bar, move a ground reticle within
// range, and tap to cast at that tile. The server (fireball handler) strikes
// every living within the action's areaRadius of the chosen tile.

/** @type {string | null} The armed point action, or null when not aiming. */
var armedAimAction = null;
var aimRow = -1;
var aimCol = -1;

/** @type {any} */ var aimTargetRing = null;
/** @type {any} */ var aimAreaDisc = null;

// Pool of pulsing rings drawn under every valid target while an entity action
// is armed, so the (possibly moving) targets are obvious to tap.
/** @type {any[]} */ var aimHighlightRings = [];
/** @type {any} */ var aimHighlightGeo = null;
/** @type {any} */ var aimHighlightMat = null;

function ensureAimMeshes() {
  if (aimTargetRing) return;
  aimTargetRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.78, 28),
    new THREE.MeshBasicMaterial({
      color: 0xff5a3c,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  aimTargetRing.rotation.x = -Math.PI / 2;
  aimTargetRing.visible = false;
  scene.add(aimTargetRing);

  aimAreaDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshBasicMaterial({
      color: 0xff5a3c,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  aimAreaDisc.rotation.x = -Math.PI / 2;
  aimAreaDisc.visible = false;
  scene.add(aimAreaDisc);
}

function isAiming() {
  return armedAimAction !== null;
}

/**
 * @param {string} actionId
 * @returns {number}
 */
function actionAreaRadius(actionId) {
  var def = getRegistryActionDef(actionId);
  var tgt = def && def.targeting;
  return tgt && typeof tgt.areaRadius === "number" ? tgt.areaRadius : 0;
}

function positionAimMeshes() {
  if (!aimTargetRing) return;
  var x = tileX(aimCol);
  var z = tileZ(aimRow);
  aimTargetRing.position.set(x, 0.07, z);
  aimAreaDisc.position.set(x, 0.05, z);
}

/** @param {string} actionId */
function armAimAction(actionId) {
  ensureAimMeshes();
  armedAimAction = actionId;
  if (aimModeFor(actionId) === "reticle") {
    var r = actionAreaRadius(actionId);
    // A Chebyshev radius r covers a (2r+1)-tile square; a disc of radius
    // (r+0.5)*TILE roughly encloses it for the preview.
    aimAreaDisc.geometry.dispose();
    aimAreaDisc.geometry = new THREE.CircleGeometry((r + 0.5) * TILE, 40);
    aimRow = avatarRow;
    aimCol = avatarCol;
    positionAimMeshes();
    aimTargetRing.visible = true;
    aimAreaDisc.visible = r > 0;
  } else {
    // Entity mode: no reticle — the pulsing target highlights (game loop) show
    // what can be tapped.
    aimTargetRing.visible = false;
    aimAreaDisc.visible = false;
  }
  renderAimBanner();
}

function cancelAiming() {
  armedAimAction = null;
  if (aimTargetRing) aimTargetRing.visible = false;
  if (aimAreaDisc) aimAreaDisc.visible = false;
  for (var i = 0; i < aimHighlightRings.length; i++) {
    aimHighlightRings[i].visible = false;
  }
  renderAimBanner();
}

/**
 * @param {number} clientX
 * @param {number} clientY
 */
function updateAimFromEvent(clientX, clientY) {
  var action = armedAimAction;
  if (!action || aimModeFor(action) !== "reticle") return;
  var tile = pickTileFromEvent(clientX, clientY);
  if (!tile) return;
  var range = actionEffectiveRange(action);
  // Clamp the reticle to within the caster's Chebyshev casting range.
  var dr = Math.max(-range, Math.min(range, tile.row - avatarRow));
  var dc = Math.max(-range, Math.min(range, tile.col - avatarCol));
  aimRow = avatarRow + dr;
  aimCol = avatarCol + dc;
  positionAimMeshes();
}

/**
 * @param {string} action
 * @param {string} kind "living" or "item"
 * @param {string} id
 */
function invokeAimTarget(action, kind, id) {
  if (kind === "living") postTreeAction(action, { target_living_id: id });
  else postTreeAction(action, { target_item_id: id });
}

/**
 * Chooser-button handler (from showTargetChooser): invoke the armed action on
 * the chosen target, then close the chooser and end aiming.
 * @param {HTMLElement} btn
 */
function chooseAimTarget(btn) {
  var action = String(btn.dataset.actionId || "");
  var kind = btn.dataset.kind === "living" ? "living" : "item";
  var id = String(btn.dataset.id || "");
  if (!action || !id) return;
  invokeAimTarget(action, kind, id);
  cancelAiming();
  closeTileDetail();
}

/**
 * Handle a tap/click while aiming.
 * @param {number} clientX
 * @param {number} clientY
 * @returns {boolean} true when the tap was consumed by aiming (caller must not
 *   also select a tile).
 */
function confirmAimFromEvent(clientX, clientY) {
  var action = armedAimAction;
  if (!action) return false;
  if (aimModeFor(action) === "reticle") {
    updateAimFromEvent(clientX, clientY);
    var row = aimRow;
    var col = aimCol;
    cancelAiming();
    postTreeAction(action, { row: row, col: col });
    return true;
  }
  // Entity mode: resolve the valid targets on the tapped tile.
  var tile = pickTileFromEvent(clientX, clientY);
  if (!tile) return true;
  var tapRow = tile.row;
  var tapCol = tile.col;
  var onTile = collectAimTargets(action).filter(function (target) {
    return target.row === tapRow && target.col === tapCol;
  });
  if (onTile.length === 0) return true; // mis-tap; stay armed for another try
  if (onTile.length === 1) {
    invokeAimTarget(action, onTile[0].kind, onTile[0].id);
    cancelAiming();
    return true;
  }
  // Several valid targets share the tile — disambiguate via the tile panel.
  showTargetChooser(action, onTile);
  return true;
}

// ── Aiming banner (only visible while an action is armed) ─────────────────
// Shows the armed action + a Cancel button and a hint, so touch users (who
// have no Esc/right-click) can back out of an aim. The entry point for arming
// is the unified action palette (the Use picker), not a persistent bar.

function renderAimBanner() {
  var banner = document.getElementById("hud-aim-banner");
  if (!banner) return;
  var action = armedAimAction;
  if (!action) {
    banner.style.display = "none";
    banner.innerHTML = "";
    return;
  }
  var hint =
    aimModeFor(action) === "reticle"
      ? t("hud.aim_hint", "tap a tile to cast")
      : t("hud.aim_hint_target", "tap a highlighted target");
  banner.innerHTML =
    "<span>" +
    escapeHtml(treeActionLabel(action)) +
    " · " +
    escapeHtml(hint) +
    "</span>" +
    '<button onclick="cancelAiming()">' +
    escapeHtml(t("hud.cancel", "Cancel")) +
    "</button>";
  banner.style.display = "flex";
}

// Pulses a ring under every valid target of an armed entity action. Called each
// frame from the game loop; recomputes targets so rings track moving livings.
// A no-op unless an entity action is armed.
/** @param {number} nowMs */
function updateAimTargetHighlights(nowMs) {
  var action = armedAimAction;
  if (!action || aimModeFor(action) !== "entity") {
    for (var h = 0; h < aimHighlightRings.length; h++) {
      aimHighlightRings[h].visible = false;
    }
    return;
  }
  if (!aimHighlightGeo) {
    aimHighlightGeo = new THREE.RingGeometry(0.5, 0.74, 24);
    aimHighlightMat = new THREE.MeshBasicMaterial({
      color: 0x49d0ff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }
  // One ring per distinct target tile.
  var targets = collectAimTargets(action);
  /** @type {Record<string, boolean>} */ var seen = {};
  /** @type {Array<{row: number, col: number}>} */ var tiles = [];
  for (var i = 0; i < targets.length; i++) {
    var key = targets[i].row + "_" + targets[i].col;
    if (seen[key]) continue;
    seen[key] = true;
    tiles.push({ row: targets[i].row, col: targets[i].col });
  }
  while (aimHighlightRings.length < tiles.length) {
    var ring = new THREE.Mesh(aimHighlightGeo, aimHighlightMat);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    aimHighlightRings.push(ring);
  }
  aimHighlightMat.opacity = 0.4 + 0.3 * (0.5 + 0.5 * Math.sin(nowMs * 0.006));
  for (var r = 0; r < aimHighlightRings.length; r++) {
    if (r < tiles.length) {
      aimHighlightRings[r].position.set(
        tileX(tiles[r].col),
        0.08,
        tileZ(tiles[r].row),
      );
      aimHighlightRings[r].visible = true;
    } else {
      aimHighlightRings[r].visible = false;
    }
  }
}
