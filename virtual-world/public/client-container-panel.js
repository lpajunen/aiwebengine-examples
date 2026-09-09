/// <reference path="virtual-world-browser-globals.d.ts" />
// Container panel: open a container item (bag/slot/tile) and put/take items.

/** @typedef {{location: "bag" | "slot" | "tile", slot?: string, item_id?: string}} ContainerSelector */

/** @type {ContainerSelector | null} */
var openContainerSel = null;

/**
 * Re-reads the live container item from shared client state
 * (playerInventory / worldItemsByTile), which applyItemStateFromResult keeps
 * fresh after every item-changing action — same approach renderInventoryPanel
 * uses for the player's own inventory. Bag/tile lookups are by item id, not
 * array position: bag order shifts as items move in and out while the
 * container stays open, so a remembered index would go stale.
 * @returns {ClientItem | null}
 */
function findOpenContainerItem() {
  if (!openContainerSel) return null;
  var inv = normalizeClientInventory(playerInventory);
  if (openContainerSel.location === "bag") {
    var bagItemId = String(openContainerSel.item_id || "");
    if (!Array.isArray(inv.bag)) return null;
    for (var b = 0; b < inv.bag.length; b++) {
      if (inv.bag[b] && String(inv.bag[b].id) === bagItemId) return inv.bag[b];
    }
    return null;
  }
  if (openContainerSel.location === "slot") {
    var slot = String(openContainerSel.slot || "");
    return (inv.slots && inv.slots[slot]) || null;
  }
  if (openContainerSel.location === "tile") {
    var itemId = String(openContainerSel.item_id || "");
    var tileItems = worldItemsByTile[avatarRow + "_" + avatarCol] || [];
    for (var i = 0; i < tileItems.length; i++) {
      if (tileItems[i] && String(tileItems[i].id) === itemId)
        return tileItems[i];
    }
    return null;
  }
  return null;
}

/** @param {ContainerSelector} sel */
function openContainer(sel) {
  openContainerSel = sel;
  renderContainerPanel();
  requireElementById("hud-container-panel").style.display = "block";
  // Also show the bag panel so "Put in chest" buttons are visible alongside
  // the container's contents.
  showInventoryPanel(0);
}

function closeContainerPanel() {
  openContainerSel = null;
  requireElementById("hud-container-panel").style.display = "none";
  if (inventoryPanelVisible) renderInventoryPanel();
}

function refreshContainerPanelIfOpen() {
  if (!openContainerSel) return;
  var item = findOpenContainerItem();
  if (!item) {
    closeContainerPanel();
    return;
  }
  renderContainerPanel();
}

function renderContainerPanel() {
  var listDiv = requireElementById("container-list");
  var titleSpan = requireElementById("container-panel-title");
  var item = findOpenContainerItem();
  if (!item) {
    listDiv.innerHTML =
      '<div class="inv-row"><span class="label" style="grid-column:1/-1">' +
      escHtml(t("inventory.empty", "empty")) +
      "</span></div>";
    return;
  }
  titleSpan.textContent = inventoryItemLabel(item);
  var rawContents = item.state && item.state.contents;
  var contents = /** @type {ClientItem[]} */ (
    Array.isArray(rawContents) ? rawContents : []
  );
  if (contents.length === 0) {
    listDiv.innerHTML =
      '<div class="inv-row"><span class="label" style="grid-column:1/-1">' +
      escHtml(t("inventory.backpack_empty", "Backpack empty")) +
      "</span></div>";
    return;
  }
  var rows = "";
  for (var i = 0; i < contents.length; i++) {
    rows +=
      '<div class="inv-row">' +
      '<span class="label">' +
      escHtml(inventoryItemLabel(contents[i])) +
      "</span>" +
      '<span class="inv-row-actions">' +
      '<button onclick="takeFromOpenContainer(' +
      i +
      ')">' +
      escHtml(t("inventory.take", "Take")) +
      "</button>" +
      "</span>" +
      "</div>";
  }
  listDiv.innerHTML = rows;
}
