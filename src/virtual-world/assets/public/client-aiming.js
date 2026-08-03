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
  renderAimBanner();
}

function cancelAiming() {
  armedAimAction = null;
  if (aimTargetRing) aimTargetRing.visible = false;
  if (aimAreaDisc) aimAreaDisc.visible = false;
  renderAimBanner();
}

/**
 * @param {number} clientX
 * @param {number} clientY
 */
function updateAimFromEvent(clientX, clientY) {
  var action = armedAimAction;
  if (!action) return;
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
 * @param {number} clientX
 * @param {number} clientY
 * @returns {boolean} true if a cast was fired (caller should not also select a tile)
 */
function confirmAimFromEvent(clientX, clientY) {
  var action = armedAimAction;
  if (!action) return false;
  updateAimFromEvent(clientX, clientY);
  var row = aimRow;
  var col = aimCol;
  cancelAiming();
  postTreeAction(action, { row: row, col: col });
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
  banner.innerHTML =
    "<span>" +
    escapeHtml(treeActionLabel(action)) +
    " · " +
    escapeHtml(t("hud.aim_hint", "tap a tile to cast")) +
    "</span>" +
    '<button onclick="cancelAiming()">' +
    escapeHtml(t("hud.cancel", "Cancel")) +
    "</button>";
  banner.style.display = "flex";
}
