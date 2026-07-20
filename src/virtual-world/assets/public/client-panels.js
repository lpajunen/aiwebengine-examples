/// <reference path="virtual-world-browser-globals.d.ts" />
// HUD panels: inventory, crafting, online players, nick editing.

function renderInventoryPanel() {
  var leftDiv = requireElementById("inv-left-hand");
  var rightDiv = requireElementById("inv-right-hand");
  var listDiv = requireElementById("inv-list");
  var countDiv = requireElementById("inv-count");
  var inv = normalizeClientInventory(playerInventory);
  var slotIds = getInventorySlotIds(inv);
  var handSlotIds = getPrimaryHeldSlotIds(inv);

  /**
   * @param {string} title
   * @param {string} slot
   * @param {ClientItem | null} item
   * @returns {string}
   */
  function handHtml(title, slot, item) {
    var label = item ? inventoryItemLabel(item) : t("inventory.empty", "empty");
    var html =
      '<div class="name">' +
      title +
      "</div>" +
      "<div>" +
      label +
      "</div>" +
      '<div class="inv-actions">';
    if (item) {
      if (!item.non_droppable) {
        html +=
          "<button onclick=\"dropFromSlot('" +
          slot +
          "')\">" +
          escHtml(t("inventory.drop", "Drop")) +
          "</button>";
      }
      html +=
        "<button onclick=\"equipToInventory('" +
        slot +
        "')\">" +
        escHtml(t("inventory.store", "Store")) +
        "</button>";
    }
    html += "</div>";
    return html;
  }

  leftDiv.innerHTML = handHtml(
    inventorySlotLabel(inv, handSlotIds[0]),
    handSlotIds[0],
    inv.slots[handSlotIds[0]] || null,
  );
  rightDiv.innerHTML = handHtml(
    inventorySlotLabel(inv, handSlotIds[1]),
    handSlotIds[1],
    inv.slots[handSlotIds[1]] || null,
  );

  var remainingSlotIds = slotIds.filter(function (slotId) {
    return slotId !== handSlotIds[0] && slotId !== handSlotIds[1];
  });
  var rows = "";
  for (var s = 0; s < remainingSlotIds.length; s++) {
    var slotId = remainingSlotIds[s];
    var slotItem = inv.slots[slotId] || null;
    rows +=
      '<div class="inv-row">' +
      '<span class="label">' +
      escHtml(inventorySlotLabel(inv, slotId)) +
      ": " +
      escHtml(
        slotItem ? inventoryItemLabel(slotItem) : t("inventory.empty", "empty"),
      ) +
      "</span>" +
      '<span class="inv-row-actions">' +
      (slotItem
        ? (slotItem.non_droppable
            ? ""
            : "<button onclick=\"dropFromSlot('" +
              slotId +
              "')\">" +
              escHtml(t("inventory.drop", "Drop")) +
              "</button> ") +
          "<button onclick=\"equipToInventory('" +
          slotId +
          "')\">" +
          escHtml(t("inventory.store", "Store")) +
          "</button>"
        : "") +
      "</span>" +
      "</div>";
  }

  if (!Array.isArray(inv.bag) || inv.bag.length === 0) {
    rows +=
      '<div class="inv-row"><span class="label" style="grid-column:1/-1">' +
      t("inventory.backpack_empty", "Backpack empty") +
      "</span></div>";
  } else {
    for (var i = 0; i < inv.bag.length; i++) {
      var item = inv.bag[i];
      var itemActions = treeActionsForItemType(item.type);
      var actionBtns = "";
      for (var ai = 0; ai < itemActions.length; ai++) {
        actionBtns +=
          "<button onclick=\"postTreeAction('" +
          itemActions[ai] +
          "')\">" +
          treeActionLabel(itemActions[ai]) +
          "</button> ";
      }
      var equipBtns = "";
      for (var si = 0; si < slotIds.length; si++) {
        equipBtns +=
          '<button onclick="equipFromInventory(' +
          i +
          ",\'" +
          slotIds[si] +
          "\')\">" +
          escHtml(inventorySlotLabel(inv, slotIds[si])) +
          "</button> ";
      }
      rows +=
        '<div class="inv-row">' +
        '<span class="label">' +
        escHtml(inventoryItemLabel(item)) +
        "</span>" +
        '<span class="inv-row-actions">' +
        equipBtns +
        (item.non_droppable
          ? ""
          : '<button onclick="dropFromInventory(' +
            i +
            ')">' +
            escHtml(t("inventory.drop", "Drop")) +
            "</button> ") +
        actionBtns +
        "</span>" +
        "</div>";
    }
  }

  listDiv.innerHTML = rows;

  countDiv.textContent =
    inv.bag.length + " " + t("inventory.items_suffix", "items");

  updateHeldHud();
}

/** @param {number} autoHideMs */
function showInventoryPanel(autoHideMs) {
  if (craftingPanelVisible) closeCraftingPanel();
  inventoryPanelVisible = true;
  requireElementById("hud-inventory-panel").style.display = "block";
  renderInventoryPanel();
  if (inventoryAutoHideTimer !== null) {
    window.clearTimeout(inventoryAutoHideTimer);
    inventoryAutoHideTimer = null;
  }
  if (autoHideMs && autoHideMs > 0) {
    inventoryAutoHideTimer = window.setTimeout(function () {
      closeInventoryPanel();
    }, autoHideMs);
  }
}

function closeInventoryPanel() {
  inventoryPanelVisible = false;
  requireElementById("hud-inventory-panel").style.display = "none";
  if (inventoryAutoHideTimer !== null) {
    window.clearTimeout(inventoryAutoHideTimer);
    inventoryAutoHideTimer = null;
  }
}

function toggleInventoryPanel() {
  if (inventoryPanelVisible) closeInventoryPanel();
  else showInventoryPanel(0);
}

function renderStatisticsPanel() {
  var listDiv = requireElementById("stats-list");
  var inv = normalizeClientInventory(playerInventory);
  var livingValueEntries = getLivingValuesEntries(inv);

  if (livingValueEntries.length === 0) {
    listDiv.innerHTML =
      '<div class="inv-row"><span class="label" style="grid-column:1/-1">' +
      escHtml(t("stats.empty", "No statistics.")) +
      "</span></div>";
    return;
  }

  var rows = "";
  for (var lv = 0; lv < livingValueEntries.length; lv++) {
    var entry = livingValueEntries[lv];
    rows +=
      '<div class="inv-row">' +
      '<span class="label">' +
      escHtml(livingValueLabel(inv.class_id || "", entry.key)) +
      "</span>" +
      '<span class="inv-row-actions">' +
      renderLivingValueDisplay(
        getLivingValueSchemaEntry(inv.class_id || "", entry.key),
        entry.value,
      ) +
      "</span>" +
      "</div>";
  }
  listDiv.innerHTML = rows;
}

function showStatisticsPanel() {
  statsPanelVisible = true;
  requireElementById("hud-statistics-panel").style.display = "block";
  renderStatisticsPanel();
}

function closeStatisticsPanel() {
  statsPanelVisible = false;
  requireElementById("hud-statistics-panel").style.display = "none";
}

function toggleStatisticsPanel() {
  if (statsPanelVisible) closeStatisticsPanel();
  else showStatisticsPanel();
}

function renderCraftingPanel() {
  var listDiv = requireElementById("crafting-list");
  var recipes = getBootstrappedRecipeDefs();
  var recipeIds = Object.keys(recipes).sort();
  if (recipeIds.length === 0) {
    listDiv.innerHTML =
      '<div class="craft-row"><div class="craft-status">' +
      escHtml(t("crafting.no_recipes", "No recipes available.")) +
      "</div></div>";
    return;
  }
  var rows = "";
  for (var i = 0; i < recipeIds.length; i++) {
    var recipeId = recipeIds[i];
    var recipe = recipes[recipeId];
    var craftable = recipeIsCraftable(recipe);
    rows +=
      '<div class="craft-row">' +
      '<div class="name">' +
      escHtml(recipeLabel(recipe)) +
      "</div>" +
      '<div class="craft-meta">' +
      escHtml(recipeTargetLabel(recipe)) +
      "</div>" +
      '<div class="craft-ingredients">' +
      escHtml(t("crafting.ingredients", "Ingredients:")) +
      " " +
      escHtml(recipeIngredientsLabel(recipe)) +
      "</div>" +
      '<div class="craft-result">' +
      escHtml(t("crafting.result", "Result:")) +
      " " +
      escHtml(recipeResultLabel(recipe)) +
      "</div>" +
      '<div class="craft-actions">' +
      '<span class="craft-status">' +
      escHtml(
        craftable
          ? t("crafting.ready", "Ready")
          : t("crafting.missing_ingredients", "Missing ingredients"),
      ) +
      "</span>" +
      "<button onclick=\"craftRecipeById('" +
      recipeId +
      "')\"" +
      (craftable ? "" : " disabled") +
      ">" +
      escHtml(t("hud.craft", "Craft")) +
      "</button>" +
      "</div>" +
      "</div>";
  }
  listDiv.className = "crafting-list";
  listDiv.innerHTML = rows;
}

function showCraftingPanel() {
  if (inventoryPanelVisible) closeInventoryPanel();
  craftingPanelVisible = true;
  requireElementById("hud-crafting-panel").style.display = "block";
  renderCraftingPanel();
}

function closeCraftingPanel() {
  craftingPanelVisible = false;
  requireElementById("hud-crafting-panel").style.display = "none";
}

function toggleCraftingPanel() {
  if (craftingPanelVisible) closeCraftingPanel();
  else showCraftingPanel();
}

// ── Players panel ────────────────────────────────────────────────────────

/** @param {number | string | Date | null | undefined} ts */
function formatRelTime(ts) {
  if (!ts) return "-";
  var diff = Math.max(0, Date.now() - new Date(ts).getTime());
  var secs = Math.floor(diff / 1000);
  if (secs < 60) return secs + t("players.seconds_ago", "s ago");
  var mins = Math.floor(secs / 60);
  if (mins < 60) return mins + t("players.minutes_ago", "m ago");
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + t("players.hours_ago", "h ago");
  return Math.floor(hrs / 24) + t("players.days_ago", "d ago");
}

function sortOnlinePlayersList() {
  onlinePlayersList.sort(function (a, b) {
    return (
      Number(b && b.last_active ? b.last_active : 0) -
      Number(a && a.last_active ? a.last_active : 0)
    );
  });
}

/** @param {any} entry */
function upsertOnlinePlayerEntry(entry) {
  if (!entry || !entry.player_id) return;
  var normalized = {
    player_id: String(entry.player_id),
    nick: String(entry.nick || shortenId(String(entry.player_id))),
    world_id: String(entry.world_id || ""),
    login_at: Number(entry.login_at || Date.now()),
    last_active: Number(entry.last_active || Date.now()),
  };
  var updated = false;
  for (var i = 0; i < onlinePlayersList.length; i++) {
    if (onlinePlayersList[i].player_id !== normalized.player_id) continue;
    onlinePlayersList[i] = normalized;
    updated = true;
    break;
  }
  if (!updated) onlinePlayersList.push(normalized);
  sortOnlinePlayersList();
}

/** @param {string} targetPlayerId */
function removeOnlinePlayerEntry(targetPlayerId) {
  onlinePlayersList = onlinePlayersList.filter(function (entry) {
    return entry && entry.player_id !== targetPlayerId;
  });
}

function refreshOnlinePlayersSnapshot() {
  fetchWithAuth("/virtual-world/online-players")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!Array.isArray(data)) return;
      onlinePlayersList = data;
      sortOnlinePlayersList();
      if (playersPanelVisible) renderPlayersPanel();
    })
    .catch(function () {});
}

function renderPlayersPanel() {
  var tbody = document.getElementById("players-table-body");
  if (!tbody) return;
  if (!onlinePlayersList.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="color:rgba(255,255,255,0.4);font-style:italic;text-align:center;padding:10px;">' +
      escapeHtml(t("players.no_players_online", "No players online")) +
      "</td></tr>";
    return;
  }
  var rows = onlinePlayersList.map(function (p) {
    var isMe = p.player_id === playerId;
    var sameWorld = String(p.world_id) === String(worldId);
    var nick = escapeHtml(p.nick || p.player_id.slice(0, 16));
    var worldLabel = p.world_id ? escapeHtml(String(p.world_id)) : "-";
    var youBadge = isMe
      ? '<span class="you-badge">' +
        escapeHtml(t("players.you_badge", "(you)")) +
        "</span>"
      : "";
    var mapBadge =
      sameWorld && !isMe
        ? '<span title="' +
          escapeHtml(t("players.in_your_world", "In your world")) +
          '" style="margin-left:4px;font-size:10px;opacity:0.7;">🗺️</span>'
        : "";
    var dmBtn = isMe
      ? ""
      : '<button class="btn-dm" data-uid="' +
        escapeHtml(p.player_id) +
        '" onclick="openChatPanelDM(this.dataset.uid)">💬 ' +
        escapeHtml(t("players.dm_button", "DM")) +
        "</button>";
    return (
      "<tr" +
      (sameWorld && !isMe
        ? ' style="background:rgba(255,255,255,0.05);"'
        : "") +
      ">" +
      "<td>" +
      nick +
      youBadge +
      mapBadge +
      "</td>" +
      '<td><span class="world-badge">' +
      worldLabel +
      "</span></td>" +
      '<td class="time-cell">' +
      formatRelTime(p.login_at) +
      "</td>" +
      '<td class="time-cell">' +
      formatRelTime(p.last_active) +
      "</td>" +
      "<td>" +
      dmBtn +
      "</td>" +
      "</tr>"
    );
  });
  tbody.innerHTML = rows.join("");
}

function showPlayersPanel() {
  playersPanelVisible = true;
  requireElementById("hud-players-panel").style.display = "block";
  renderPlayersPanel();
  refreshOnlinePlayersSnapshot();
  if (playersPanelRefreshTimer !== null) {
    window.clearInterval(playersPanelRefreshTimer);
  }
  playersPanelRefreshTimer = window.setInterval(function () {
    if (!playersPanelVisible) {
      if (playersPanelRefreshTimer !== null) {
        window.clearInterval(playersPanelRefreshTimer);
      }
      playersPanelRefreshTimer = null;
      return;
    }
    renderPlayersPanel();
  }, 15000);
}

function closePlayersPanel() {
  playersPanelVisible = false;
  requireElementById("hud-players-panel").style.display = "none";
  if (playersPanelRefreshTimer !== null) {
    window.clearInterval(playersPanelRefreshTimer);
    playersPanelRefreshTimer = null;
  }
}

function togglePlayersPanel() {
  if (playersPanelVisible) closePlayersPanel();
  else showPlayersPanel();
}

function startNickEdit() {
  var inp = /** @type {HTMLInputElement | null} */ (
    document.getElementById("nick-input")
  );
  if (inp) {
    inp.value = playerNick || "";
    inp.onkeydown = function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        commitNickEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelNickEdit();
      }
    };
  }
  requireElementById("nick-display").style.display = "none";
  requireElementById("nick-edit-btn").style.display = "none";
  requireElementById("nick-edit-row").style.display = "inline";
  if (inp) {
    inp.focus();
    inp.select();
  }
}

function cancelNickEdit() {
  requireElementById("nick-display").style.display = "";
  requireElementById("nick-edit-btn").style.display = "";
  requireElementById("nick-edit-row").style.display = "none";
}

function commitNickEdit() {
  var inp = /** @type {HTMLInputElement | null} */ (
    document.getElementById("nick-input")
  );
  if (!inp) return;
  var val = inp.value.trim().slice(0, 24);
  if (!val) {
    cancelNickEdit();
    return;
  }
  fetchWithAuth("/virtual-world/set-nickname", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nick: val }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (data && data.ok) {
        if (data.inventory) {
          applyItemStateFromResult(data);
        }
        if (data.message) {
          showHudToast(data.message, false);
        }
        if (data.nick) {
          var oldNick = playerNick;
          playerNick = data.nick;
          var display = document.getElementById("nick-display");
          if (display) display.textContent = data.nick;
          upsertOnlinePlayerEntry({
            player_id: playerId,
            nick: data.nick,
            world_id: worldId,
            login_at: Date.now(),
            last_active: Date.now(),
          });
          if (playersPanelVisible) renderPlayersPanel();
          if (chatPanelVisible && chatActiveTab === "world") renderWorldChat();
          if (chatPanelVisible && chatActiveTab === "dm" && activeDmUserId)
            renderDMThread(activeDmUserId);
          if (oldNick && oldNick !== playerNick) {
            showHudToast(
              t("nick.changed_name_to", "Changed name to") + " " + playerNick,
              false,
            );
          }
        }
      }
      cancelNickEdit();
    })
    .catch(function () {
      cancelNickEdit();
    });
}
