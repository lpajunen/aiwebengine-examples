/// <reference path="virtual-world-browser-globals.d.ts" />
// HUD panels: inventory, online players, nick editing.

function renderInventoryPanel() {
  var slotsDiv = requireElementById("inv-slots");
  var listDiv = requireElementById("inv-bag-list");
  var countDiv = requireElementById("inv-count");
  var inv = normalizeClientInventory(playerInventory);
  var slotIds = getInventorySlotIds(inv);

  /**
   * Buttons for the item-targeted actions that reach into the inventory (e.g.
   * Examine), invoked directly on this carried item — targeting a bag item
   * needs no aim step, since there is no tile to tap.
   * @param {ClientItem | null} item
   * @returns {string}
   */
  function targetActionButtons(item) {
    if (!item) return "";
    var actions = inventoryTargetActionsForItem(item);
    var html = "";
    for (var i = 0; i < actions.length; i++) {
      html +=
        "<button onclick=\"postTreeAction('" +
        escHtml(actions[i]) +
        "', { target_item_id: '" +
        escHtml(String(item.id)) +
        "' })\">" +
        escHtml(treeActionLabel(actions[i])) +
        "</button> ";
    }
    return html;
  }

  /**
   * @param {string} title
   * @param {string} slot
   * @param {ClientItem | null} item
   * @returns {string}
   */
  function slotHtml(title, slot, item) {
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
      html += targetActionButtons(item);
    }
    html += "</div>";
    return html;
  }

  var slotBoxes = "";
  for (var s = 0; s < slotIds.length; s++) {
    var slotId = slotIds[s];
    slotBoxes +=
      '<div class="inv-slot" id="inv-slot-' +
      slotId +
      '">' +
      slotHtml(
        inventorySlotLabel(inv, slotId),
        slotId,
        inv.slots[slotId] || null,
      ) +
      "</div>";
  }
  slotsDiv.innerHTML = slotBoxes;

  var rows = "";
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
        if (isEntityTargetedAction(itemActions[ai])) continue;
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
      var isContainer = isContainerItemType(item.type);
      var openBtn = isContainer
        ? '<button onclick="openContainerFromBag(' +
          i +
          ')">' +
          escHtml(t("inventory.open", "Open")) +
          "</button> "
        : "";
      // A container-kind item is never itself a valid put target (nesting is
      // rejected server-side), so excluding isContainer already excludes the
      // open container's own bag row — no separate self-reference check
      // needed.
      var putInChestBtn =
        openContainerSel && !isContainer
          ? '<button onclick="putIntoOpenContainer(' +
            i +
            ')">' +
            escHtml(t("inventory.put_in_chest", "Put in chest")) +
            "</button> "
          : "";
      rows +=
        '<div class="inv-row">' +
        '<span class="label">' +
        escHtml(inventoryItemLabel(item)) +
        "</span>" +
        '<span class="inv-row-actions">' +
        openBtn +
        equipBtns +
        (item.non_droppable
          ? ""
          : '<button onclick="dropFromInventory(' +
            i +
            ')">' +
            escHtml(t("inventory.drop", "Drop")) +
            "</button> ") +
        putInChestBtn +
        actionBtns +
        targetActionButtons(item) +
        "</span>" +
        "</div>";
    }
  }

  listDiv.innerHTML = rows;

  countDiv.textContent =
    inv.bag.length + " " + t("inventory.items_suffix", "items");

  updateStatsHud();
}

/** @param {number} autoHideMs */
function showInventoryPanel(autoHideMs) {
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
        entry.key,
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

// ── World info panel ─────────────────────────────────────────────────────

function renderWorldInfoPanel() {
  requireElementById("world-info-type").textContent = worldClassLabel(
    typeof WORLD_CLASS_ID !== "undefined" ? WORLD_CLASS_ID : "",
  );
}

function showWorldInfoPanel() {
  worldInfoPanelVisible = true;
  requireElementById("hud-world-info-panel").style.display = "block";
  renderWorldInfoPanel();
}

function closeWorldInfoPanel() {
  worldInfoPanelVisible = false;
  requireElementById("hud-world-info-panel").style.display = "none";
}

function toggleWorldInfoPanel() {
  if (worldInfoPanelVisible) closeWorldInfoPanel();
  else showWorldInfoPanel();
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
    var nickA = (a && a.nick) || "";
    var nickB = (b && b.nick) || "";
    return nickA.localeCompare(nickB);
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
    // On their own island a host invites, uninvites and sends guests away.
    var islandOp = "";
    if (!isMe && isOnOwnIsland()) {
      islandOp = sameWorld
        ? "send_home"
        : hasInvitedToIsland(p.player_id)
          ? "revoke"
          : "invite";
    }
    var islandBtn = islandOp
      ? '<button class="btn-dm" data-uid="' +
        escapeHtml(p.player_id) +
        '" data-op="' +
        islandOp +
        '" onclick="islandInviteAction(this.dataset.op, this.dataset.uid)">' +
        escapeHtml(t("players." + islandOp + "_button", islandOp)) +
        "</button>"
      : "";
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
      islandBtn +
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

// ── Home island onboarding ─────────────────────────────────────────────
// The step a new player is on, read from what they carry and from whether a
// tree grows on their island — nothing is stored for it, so it cannot drift
// from what the player actually has. Shown only on the home island, and only
// until the player first rows to Väinölä (ONBOARDING, from the server).

/** @returns {boolean} */
function islandHasTree() {
  var pine = clientTileValueForName("pine_tree");
  for (var row = 0; row < MAP.length; row++) {
    var cols = MAP[row] || [];
    for (var col = 0; col < cols.length; col++) {
      if (cols[col] === pine) return true;
    }
  }
  return false;
}

/** @returns {string} */
function currentOnboardingStep() {
  var inv = normalizeClientInventory(playerInventory);
  /** @type {Record<string, boolean>} */
  var carried = {};
  var items = (inv.bag || []).slice();
  Object.keys(inv.slots || {}).forEach(function (slotId) {
    if (inv.slots[slotId]) items.push(inv.slots[slotId]);
  });
  items.forEach(function (item) {
    if (item && item.type) carried[String(item.type)] = true;
  });
  if (carried.boat) return "row";
  if (carried.log) return "carve";
  var tree = islandHasTree();
  if (carried.stone_axe) return tree ? "fell" : "sow";
  if (tree) return "axe";
  if (carried.seed_pouch) return "sow";
  return "pouch";
}

function renderOnboardingHint() {
  var el = document.getElementById("hud-onboarding");
  if (!el) return;
  var active =
    typeof ONBOARDING !== "undefined" &&
    ONBOARDING &&
    typeof WORLD_CLASS_ID !== "undefined" &&
    WORLD_CLASS_ID === "home_island";
  if (!active) {
    el.style.display = "none";
    return;
  }
  var step = currentOnboardingStep();
  el.innerHTML =
    '<div class="onboarding-step">' +
    escHtml(t("onboarding.step." + step, "")) +
    "</div>" +
    '<div class="onboarding-skip">' +
    escHtml(t("onboarding.skip", "")) +
    "</div>";
  el.style.display = "";
}

// ── Island visits ──────────────────────────────────────────────────────
// A host invites from the players panel while on their own island; a guest
// rows over from the invites panel. ISLAND_VISITS comes from the server with
// the page and every world swap, and the stream keeps it current between.

/** @returns {{ homeWorldId: string, invitesToMe: any[], invitedByMe: any[] }} */
function islandVisits() {
  var v = typeof ISLAND_VISITS !== "undefined" && ISLAND_VISITS;
  return {
    homeWorldId: String((v && v.homeWorldId) || ""),
    invitesToMe: (v && Array.isArray(v.invitesToMe) && v.invitesToMe) || [],
    invitedByMe: (v && Array.isArray(v.invitedByMe) && v.invitedByMe) || [],
  };
}

/** @returns {boolean} */
function isOnOwnIsland() {
  var home = islandVisits().homeWorldId;
  return !!home && String(worldId) === home;
}

/** @param {string} otherId */
function hasInvitedToIsland(otherId) {
  var now = Date.now();
  return islandVisits().invitedByMe.some(function (invite) {
    return invite.guest_id === otherId && Number(invite.expires_at) > now;
  });
}

/**
 * @param {string} text
 * @param {Record<string, string | number>} values
 */
function fillPlaceholders(text, values) {
  return String(text).replace(/\{(\w+)\}/g, function (whole, name) {
    return Object.prototype.hasOwnProperty.call(values, name)
      ? String(values[name])
      : whole;
  });
}

/** @param {string} otherId */
function nickOfPlayer(otherId) {
  var entry = onlinePlayersList.find(function (p) {
    return p.player_id === otherId;
  });
  return entry ? String(entry.nick) : shortenId(otherId);
}

function renderIslandInvites() {
  var el = document.getElementById("hud-island-invites");
  if (!el) return;
  var now = Date.now();
  var open = islandVisits().invitesToMe.filter(function (invite) {
    return Number(invite.expires_at) > now;
  });
  // A guest already on an island has rowed on one of these; the panel is for
  // getting there.
  var onSomeonesIsland =
    typeof WORLD_CLASS_ID !== "undefined" &&
    WORLD_CLASS_ID === "home_island" &&
    !isOnOwnIsland();
  if (!open.length || onSomeonesIsland) {
    el.style.display = "none";
    return;
  }
  el.innerHTML = open
    .map(function (invite) {
      var minutes = Math.max(
        1,
        Math.ceil((Number(invite.expires_at) - now) / 60000),
      );
      return (
        '<div class="island-invite-row">' +
        "<span>" +
        escHtml(
          fillPlaceholders(t("island.invite_row", ""), {
            nick: invite.host_nick || shortenId(invite.host_id),
            min: minutes,
          }),
        ) +
        "</span>" +
        '<button class="btn-dm" data-host="' +
        escapeHtml(invite.host_id) +
        '" onclick="postTreeAction(\'row_to_island\', { host_id: this.dataset.host })">' +
        escHtml(t("island.row_there", "Row there")) +
        "</button>" +
        "</div>"
      );
    })
    .join("");
  el.style.display = "";
}

// Lapsed invites drop out of the panel without waiting for an event.
setInterval(renderIslandInvites, 30000);

/**
 * @param {string} op "invite", "revoke" or "send_home"
 * @param {string} otherId
 */
function islandInviteAction(op, otherId) {
  fetchWithAuth("/virtual-world/island-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: op, player_id: otherId }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (result) {
      if (result && result.visits) ISLAND_VISITS = result.visits;
      if (!result || !result.ok) {
        showHudToast(
          translateServerMessage((result && result.error) || "error"),
          true,
        );
      } else if (op === "invite") {
        showHudToast(
          fillPlaceholders(t("island.invite_sent", ""), {
            nick: nickOfPlayer(otherId),
          }),
          false,
        );
      } else if (op === "revoke") {
        showHudToast(t("island.invite_revoked", ""), false);
      } else {
        showHudToast(t("island.guest_sent_home", ""), false);
      }
      if (playersPanelVisible) renderPlayersPanel();
    })
    .catch(function () {});
}

/** @param {any} payload */
function handleIslandInviteEvent(payload) {
  if (!payload || !payload.host_id) return;
  var v = islandVisits();
  v.invitesToMe = v.invitesToMe.filter(function (invite) {
    return invite.host_id !== payload.host_id;
  });
  v.invitesToMe.unshift({
    host_id: String(payload.host_id),
    host_nick: String(payload.host_nick || ""),
    expires_at: Number(payload.expires_at || 0),
  });
  ISLAND_VISITS = v;
  showHudToast(
    fillPlaceholders(t("island.invited_you", ""), {
      nick: payload.host_nick || shortenId(payload.host_id),
    }),
    false,
  );
  renderIslandInvites();
}

/** @param {any} payload */
function handleIslandInviteEndedEvent(payload) {
  if (!payload || !payload.host_id) return;
  var v = islandVisits();
  v.invitesToMe = v.invitesToMe.filter(function (invite) {
    return invite.host_id !== payload.host_id;
  });
  ISLAND_VISITS = v;
  renderIslandInvites();
}

/** @param {any} payload */
function handleIslandVisitEndedEvent(payload) {
  if (!payload) return;
  handleIslandInviteEndedEvent(payload);
  var reason = String(payload.reason || "host_left");
  showHudToast(
    fillPlaceholders(t("island.visit_ended." + reason, ""), {
      nick: payload.host_nick || shortenId(String(payload.host_id || "")),
    }),
    false,
  );
}
