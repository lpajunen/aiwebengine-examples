/// <reference path="virtual-world-browser-globals.d.ts" />
// Item actions: apply action results, pick/drop/equip.

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
  if (statsPanelVisible) renderStatisticsPanel();
  updateUseButtonState();
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
