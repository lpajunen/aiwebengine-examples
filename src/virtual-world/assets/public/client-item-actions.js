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
        state: it.state,
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
  updateStatsHud();
  renderInventoryPanel();
  if (statsPanelVisible) renderStatisticsPanel();
  refreshContainerPanelIfOpen();
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
        if (result && result.error) {
          showHudToast(translateServerMessage(result.error), true);
        }
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

/**
 * Puts a bag item into the currently open container (see
 * client-container-panel.js). No-op if no container is open.
 * @param {number} index
 */
function putIntoOpenContainer(index) {
  if (!openContainerSel) return;
  postItemAction({
    action: "container_put",
    container: openContainerSel,
    from: "inventory",
    index: index,
  });
}

/**
 * Takes an item out of the currently open container into the player's bag.
 * @param {number} contentIndex
 */
function takeFromOpenContainer(contentIndex) {
  if (!openContainerSel) return;
  postItemAction({
    action: "container_get",
    container: openContainerSel,
    content_index: contentIndex,
    to: "inventory",
  });
}

/**
 * Opens a bag item as a container (see client-container-panel.js). Resolves
 * the bag position to a stable item id up front — the container selector is
 * held across multiple put/take requests, and bag order shifts as items
 * move in and out, so an index would go stale.
 * @param {number} index
 */
function openContainerFromBag(index) {
  var inv = normalizeClientInventory(playerInventory);
  var item = Array.isArray(inv.bag) ? inv.bag[index] : null;
  if (!item) return;
  openContainer({ location: "bag", item_id: item.id });
}

/**
 * Opens a tile item as a container.
 * @param {string} itemId
 */
function openContainerFromTile(itemId) {
  openContainer({ location: "tile", item_id: itemId });
}
