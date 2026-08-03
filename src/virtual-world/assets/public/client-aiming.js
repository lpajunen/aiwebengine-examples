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
  renderCastBar();
}

function cancelAiming() {
  armedAimAction = null;
  if (aimTargetRing) aimTargetRing.visible = false;
  if (aimAreaDisc) aimAreaDisc.visible = false;
  renderCastBar();
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

// ── Cast bar (arm point-targeted actions) ─────────────────────────────────

/** @returns {string[]} Point-targeted actions the held items grant, sorted. */
function availablePointActions() {
  var inv = normalizeClientInventory(playerInventory);
  /** @type {Record<string, boolean>} */ var seen = {};
  /** @type {string[]} */ var result = [];
  /** @param {any} item */
  function collect(item) {
    if (!item) return;
    var ids = treeActionsForItemType(item.type);
    for (var i = 0; i < ids.length; i++) {
      if (seen[ids[i]]) continue;
      var def = getRegistryActionDef(ids[i]);
      if (!def || def.target_kind !== "point") continue;
      seen[ids[i]] = true;
      result.push(ids[i]);
    }
  }
  if (Array.isArray(inv.bag)) {
    for (var b = 0; b < inv.bag.length; b++) collect(inv.bag[b]);
  }
  if (inv.slots && typeof inv.slots === "object") {
    var sids = Object.keys(inv.slots);
    for (var s = 0; s < sids.length; s++) collect(inv.slots[sids[s]]);
  }
  return result.sort(function (a, b) {
    return treeActionLabel(a).localeCompare(treeActionLabel(b));
  });
}

function renderCastBar() {
  var bar = document.getElementById("hud-cast-bar");
  if (!bar) return;
  var actions = availablePointActions();
  if (actions.length === 0) {
    bar.style.display = "none";
    bar.innerHTML = "";
    return;
  }
  var html = actions
    .map(function (a) {
      var armed = a === armedAimAction;
      return (
        '<button data-cast-action="' +
        escapeHtml(a) +
        '"' +
        (armed ? ' class="cast-armed"' : "") +
        ' onclick="toggleCastAction(this.dataset.castAction)">' +
        escapeHtml(treeActionLabel(a)) +
        "</button>"
      );
    })
    .join("");
  if (isAiming()) {
    html +=
      '<button onclick="cancelAiming()">' +
      escapeHtml(t("hud.cancel", "Cancel")) +
      "</button>";
  }
  bar.innerHTML = html;
  bar.style.display = "flex";
}

/** @param {string} actionId */
function toggleCastAction(actionId) {
  if (armedAimAction === actionId) cancelAiming();
  else armAimAction(actionId);
}

// Initial paint; PLAYER_INV / ITEM_REGISTRY are embedded in the page before
// this module loads. Re-rendered on world switch via client-net's state apply.
renderCastBar();
