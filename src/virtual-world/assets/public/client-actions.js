/// <reference path="virtual-world-browser-globals.d.ts" />
// Movement & world actions: collision, tryMove, portals, tree actions, useItem.

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

/**
 * @param {string} action
 * @param {Record<string, any>=} extras
 */
function postTreeAction(action, extras) {
  // Portal builds go through the world-type picker so the creator can choose
  // any world class (built-in preset or custom type with its own size).
  if (!extras && String(action).indexOf("build_portal") === 0) {
    openPortalDestinationPicker(action);
    return;
  }
  fetchWithAuth("/virtual-world/tree-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      Object.assign(
        {
          action: action,
          row: avatarRow,
          col: avatarCol,
          rotation: avatar.rotation.y,
        },
        extras || {},
      ),
    ),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (result) {
      if (!result.ok) {
        console.log("Use failed:", result.error);
        if (result.error)
          showHudToast(translateServerMessage(result.error), true);
        updateUseButtonState();
        return;
      }
      applyItemStateFromResult(result);
      requestHeartbeatSoon();
      var resolvedTreeAction = resolveTreeActionKind(result.action);
      if (
        resolvedTreeAction &&
        typeof result.row === "number" &&
        typeof result.col === "number"
      ) {
        applyTreeAction(
          resolvedTreeAction,
          result.row,
          result.col,
          "player",
          playerId,
        );
        updateTreeInstances();
        refreshTileDetailIfOpen();
      }
      var resolvedHouseAction = resolveHouseActionKind(result.action);
      if (
        resolvedHouseAction &&
        typeof result.row === "number" &&
        typeof result.col === "number"
      ) {
        applyHouseAction(
          resolvedHouseAction,
          result.row,
          result.col,
          "player",
          playerId,
        );
        updateHouseMeshes();
        refreshTileDetailIfOpen();
      }
      if (result.action === "poke" && result.target_living_label) {
        showHudToast(
          t("poke.you_poke_prefix", "You poke") +
            " " +
            result.target_living_label +
            ".",
          false,
        );
      } else if (result.toast_message) {
        showHudToast(result.toast_message, false);
      }
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

/** @param {HTMLElement} btn */
function postItemTargetedAction(btn) {
  var actionId = String(btn.dataset.actionId || "");
  var targetItemId = String(btn.dataset.targetItemId || "");
  if (!actionId || !targetItemId) return;
  postTreeAction(actionId, { target_item_id: targetItemId });
}

/** @param {HTMLElement} btn */
function postLivingTargetedAction(btn) {
  var actionId = String(btn.dataset.actionId || "");
  var targetLivingId = String(btn.dataset.targetLivingId || "");
  if (!actionId || !targetLivingId) return;
  postTreeAction(actionId, { target_living_id: targetLivingId });
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
