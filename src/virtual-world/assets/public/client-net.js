/// <reference path="virtual-world-browser-globals.d.ts" />
// Networking: world-state sync, move queue, heartbeat, resync, SSE (initMultiplayer).

/**
 * Apply a current-world state payload (inventory + world items), guarded by
 * the item snapshot request seq so a stale in-flight response never
 * overwrites newer SSE-delta state.
 * @param {any} payload
 * @param {number} requestSeq
 */
function applyWorldStatePayload(payload, requestSeq) {
  if (!payload || typeof payload !== "object") return;
  if (payload.world_id && String(payload.world_id) !== String(worldId)) {
    return;
  }
  if (requestSeq < appliedItemSnapshotSeq) {
    return;
  }
  if (payload.inventory) {
    playerInventory = normalizeClientInventory(payload.inventory);
    updateEditingRightsUI();
  }
  if (Array.isArray(payload.items)) {
    var next = /** @type {Record<string, ClientItem[]>} */ ({});
    for (var i = 0; i < payload.items.length; i++) {
      var it = payload.items[i];
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
  }
  appliedItemSnapshotSeq = requestSeq;
  rebuildItemMeshes();
  refreshTileDetailIfOpen();
  updateHeldHud();
  if (inventoryPanelVisible) renderInventoryPanel();
  if (statsPanelVisible) renderStatisticsPanel();
}

/**
 * @param {any[]} items
 * @returns {ClientItem[]}
 */
function normalizeClientTileItems(items) {
  return Array.isArray(items)
    ? /** @type {any[]} */ (items)
        .filter(function (it) {
          return it && it.id && it.type;
        })
        .map(function (it) {
          return {
            id: it.id,
            type: it.type,
            destination_world_id: it.destination_world_id,
            destination_world_type: it.destination_world_type,
            state: it.state,
          };
        })
    : [];
}

/** @param {string} action */
function getRegistryItemEventDef(action) {
  if (!ITEM_REGISTRY || !ITEM_REGISTRY.item_events) return null;
  return ITEM_REGISTRY.item_events[String(action || "")] || null;
}

/**
 * @param {number} row
 * @param {number} col
 * @param {any[]} items
 */
function applyTileItemsState(row, col, items) {
  var tileKey = row + "_" + col;
  var nextItems = normalizeClientTileItems(items);
  if (nextItems.length > 0) {
    worldItemsByTile[tileKey] = nextItems;
  } else {
    delete worldItemsByTile[tileKey];
  }
}

/** @param {any} payload */
function applyItemDeltaFromEvent(payload) {
  if (!payload) return;
  var row = Number(payload.row);
  var col = Number(payload.col);
  if (!isFinite(row) || !isFinite(col)) return;
  var action = String(payload.action || "");
  var itemEventDef = getRegistryItemEventDef(action);
  var tileKey = row + "_" + col;
  var changedItems = normalizeClientTileItems(payload.items);
  var currentItems = Array.isArray(worldItemsByTile[tileKey])
    ? worldItemsByTile[tileKey].slice()
    : [];

  function changedItemIdSet() {
    var ids = /** @type {Record<string, boolean>} */ ({});
    for (var i = 0; i < changedItems.length; i++) {
      if (changedItems[i] && changedItems[i].id) ids[changedItems[i].id] = true;
    }
    return ids;
  }

  // Treat the SSE delta as newer than any in-flight repair snapshot.
  appliedItemSnapshotSeq = Math.max(
    appliedItemSnapshotSeq,
    itemSnapshotRequestSeq + 1,
  );

  if (itemEventDef && itemEventDef.delta_kind === "add") {
    var merged = currentItems.slice();
    var seenIds = changedItemIdSet();
    for (var curIdx = 0; curIdx < merged.length; curIdx++) {
      if (merged[curIdx] && seenIds[merged[curIdx].id]) {
        delete seenIds[merged[curIdx].id];
      }
    }
    for (var addIdx = 0; addIdx < changedItems.length; addIdx++) {
      var changedItem = changedItems[addIdx];
      if (changedItem && seenIds[changedItem.id]) merged.push(changedItem);
    }
    applyTileItemsState(row, col, merged);
  } else if (itemEventDef && itemEventDef.delta_kind === "remove") {
    var removedIds = changedItemIdSet();
    var kept = currentItems.filter(function (item) {
      return item && !removedIds[item.id];
    });
    applyTileItemsState(row, col, kept);
  } else if (itemEventDef && itemEventDef.delta_kind === "snapshot") {
    applyTileItemsState(row, col, changedItems);
  } else {
    requestResync();
    return;
  }

  rebuildItemMeshes();
  refreshTileDetailIfOpen();
  updateUseButtonState();
}

/** @type {any[]} */
var pendingMoves = []; // FIFO queue of {row,col,seq} — one entry per step
var moveInFlight = false;

/**
 * Rebuild the queued moves as direction deltas reapplied from an
 * authoritative server position (preserves the user's intended movement
 * directions), then snap local prediction to the end of the rebuilt queue.
 * @param {number} row
 * @param {number} col
 */
function rebasePendingMovesFrom(row, col) {
  var lastPos = { row: row, col: col };
  for (var i = 0; i < pendingMoves.length; i++) {
    var deltaRow = pendingMoves[i].toRow - pendingMoves[i].fromRow;
    var deltaCol = pendingMoves[i].toCol - pendingMoves[i].fromCol;
    pendingMoves[i].fromRow = lastPos.row;
    pendingMoves[i].fromCol = lastPos.col;
    pendingMoves[i].toRow = lastPos.row + deltaRow;
    pendingMoves[i].toCol = lastPos.col + deltaCol;
    lastPos = {
      row: pendingMoves[i].toRow,
      col: pendingMoves[i].toCol,
    };
  }
  avatarRow = lastPos.row;
  avatarCol = lastPos.col;
  targetX = tileX(avatarCol);
  targetZ = tileZ(avatarRow);
  requireElementById("pos-col").textContent = String(avatarCol);
  requireElementById("pos-row").textContent = String(avatarRow);
}

function flushMove() {
  if (authState !== AUTH_STATE_OK) return;
  if (moveInFlight || pendingMoves.length === 0) return;
  // Send the whole queue as one batched intent; the server validates the
  // longest applicable prefix as a unit and applies it atomically.
  var batch = pendingMoves;
  pendingMoves = [];
  moveInFlight = true;
  fetchWithAuth("/virtual-world/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // world_id and player_id are determined server-side from auth session
    body: JSON.stringify({
      steps: batch.map(function (m) {
        return { row: m.toRow, col: m.toCol, rotation: m.rotation };
      }),
      seq: moveSeq + 1,
      session_id: sessionId,
    }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (result) {
      moveInFlight = false;
      if (!result.ok) {
        if (result.stale) {
          // Another tab took over — our queued moves are based on an old seq.
          // Reconcile to server canonical state, then discard queue.
          if (
            typeof result.row === "number" &&
            typeof result.col === "number"
          ) {
            avatarRow = result.row;
            avatarCol = result.col;
            targetX = tileX(avatarCol);
            targetZ = tileZ(avatarRow);
            requireElementById("pos-col").textContent = String(avatarCol);
            requireElementById("pos-row").textContent = String(avatarRow);
          }
          if (typeof result.seq === "number" && isFinite(result.seq)) {
            moveSeq = result.seq;
          }
          pendingMoves = [];
        } else {
          // Whole batch rejected (wall/bounds). Drop it and rebase moves
          // queued while the batch was in flight onto the server position.
          rebasePendingMovesFrom(result.row, result.col);
        }
      } else {
        // Confirmed — only move moveSeq forward so a late response can
        // never rewind it.
        if (result.seq > moveSeq) {
          moveSeq = result.seq;
        }
        if (
          typeof result.applied_count === "number" &&
          result.applied_count < batch.length
        ) {
          // Blocked mid-path: the unapplied tail was invalid server-side.
          // Rebase moves queued during flight onto the authoritative
          // position and snap local prediction back to it.
          rebasePendingMovesFrom(result.row, result.col);
        }
        if (result.inventory) {
          applyItemStateFromResult(result);
        }
      }
      flushMove(); // drain any moves queued while the batch was in flight
    })
    .catch(function (err) {
      moveInFlight = false;
      // Put the failed batch back at the front and retry after 500 ms
      pendingMoves = batch.concat(pendingMoves);
      if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED")) {
        return;
      }
      setTimeout(flushMove, 500);
    });
}

/**
 * @param {number} fromRow
 * @param {number} fromCol
 * @param {number} toRow
 * @param {number} toCol
 * @param {number} rotation
 * @returns {boolean}
 */
function postMove(fromRow, fromCol, toRow, toCol, rotation) {
  // Never silently drop steps: if queue is full, caller must not move locally.
  if (pendingMoves.length >= MAX_PENDING_MOVES) return false;
  pendingMoves.push({
    fromRow: fromRow,
    fromCol: fromCol,
    toRow: toRow,
    toCol: toCol,
    rotation: rotation,
  });
  flushMove();
  return true;
}

function postLeave() {
  // world_id and player_id are determined server-side from auth session
  navigator.sendBeacon(
    "/virtual-world/leave",
    new Blob([JSON.stringify({ session_id: sessionId })], {
      type: "application/json",
    }),
  );
}

/** @param {number} delayMs */
function scheduleHeartbeat(delayMs) {
  if (heartbeatTimer) window.clearTimeout(heartbeatTimer);
  heartbeatTimer = window.setTimeout(
    function () {
      sendHeartbeat(false);
    },
    Math.max(0, Number(delayMs) || 0),
  );
}

/** @param {boolean} force */
function sendHeartbeat(force) {
  if (authState !== AUTH_STATE_OK) return;
  var now = Date.now();
  if (
    !force &&
    lastHeartbeatAt > 0 &&
    now - lastHeartbeatAt < HEARTBEAT_ACTIVITY_MIN_GAP_MS
  ) {
    scheduleHeartbeat(HEARTBEAT_ACTIVITY_MIN_GAP_MS - (now - lastHeartbeatAt));
    return;
  }
  lastHeartbeatAt = now;
  fetchWithAuth("/virtual-world/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(
      function (result) {
        if (result && result.inventory) {
          applyItemStateFromResult(result);
        }
        scheduleHeartbeat(HEARTBEAT_VISIBLE_MS);
      },
      function (err) {
        if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED")) {
          return;
        }
        scheduleHeartbeat(HEARTBEAT_VISIBLE_MS);
      },
    );
}

function requestHeartbeatSoon() {
  if (authState !== AUTH_STATE_OK) return;
  var now = Date.now();
  var nextDelay = 0;
  if (lastHeartbeatAt > 0) {
    nextDelay = Math.max(
      0,
      HEARTBEAT_ACTIVITY_MIN_GAP_MS - (now - lastHeartbeatAt),
    );
  }
  scheduleHeartbeat(nextDelay);
}

// ── Versioned event protocol: seq tracking + single resync path ──────────
// Server events carry {scope, seq} where seq is monotonic per scope
// ("world:<id>" / "recipient:<id>"). A gap means events were missed; any
// missing-state situation (gap, SSE reconnect, avatar without inventory
// data) requests one debounced full resync instead of per-feature snapshot
// fetches.
/** @type {Record<string, number>} */
var eventSeqByScope = {};
/** @type {number | null} */
var resyncTimer = null;
var lastResyncAt = 0;
var RESYNC_MIN_GAP_MS = 5000;

function requestResync() {
  if (resyncTimer !== null) return;
  var wait = Math.max(500, RESYNC_MIN_GAP_MS - (Date.now() - lastResyncAt));
  resyncTimer = window.setTimeout(function () {
    resyncTimer = null;
    performResync();
  }, wait);
}

/**
 * @param {*} scope
 * @param {*} seq
 * @returns {boolean} true when the event should be applied
 */
function trackEventSeq(scope, seq) {
  if (!scope || typeof scope !== "string") return true;
  var n = Number(seq);
  if (!isFinite(n) || n <= 0) return true; // unversioned event
  var last = eventSeqByScope[scope];
  if (typeof last !== "number") {
    eventSeqByScope[scope] = n;
    return true;
  }
  if (n <= last) return false; // duplicate or stale
  // Gap: still apply this event (deltas are idempotent), but resync to
  // recover whatever was missed in between.
  if (n > last + 1) requestResync();
  eventSeqByScope[scope] = n;
  return true;
}

function performResync() {
  if (authState !== AUTH_STATE_OK) return;
  lastResyncAt = Date.now();
  var requestSeq = itemSnapshotRequestSeq + 1;
  itemSnapshotRequestSeq = requestSeq;
  fetchJsonWithAuth("/virtual-world/resync")
    .then(function (payload) {
      if (!payload || typeof payload !== "object") return;
      if (payload.world_id && String(payload.world_id) !== String(worldId)) {
        return;
      }
      var scopeSeqs = payload.scope_seqs;
      if (scopeSeqs && typeof scopeSeqs === "object") {
        for (var scope in scopeSeqs) {
          var serverSeq = Number(scopeSeqs[scope]);
          if (!isFinite(serverSeq) || serverSeq <= 0) continue;
          var known = eventSeqByScope[scope];
          // Events seen live while the resync was in flight may already be
          // ahead of the server-read baseline; never move backwards.
          eventSeqByScope[scope] =
            typeof known === "number" ? Math.max(known, serverSeq) : serverSeq;
        }
      }
      if (Array.isArray(payload.players)) applyPlayersSnapshot(payload.players);
      if (Array.isArray(payload.npcs)) syncNPCSnapshot(payload.npcs);
      applyWorldStatePayload(payload.world, requestSeq);
    })
    .catch(function (err) {
      if (err && (err.code === "AUTH_401" || err.code === "AUTH_STOPPED"))
        return;
    });
}

/** @param {any[]} players */
function applyPlayersSnapshot(players) {
  players.forEach(function (p) {
    if (p.player_id === playerId) {
      var snapSeq = Number(p.seq || 0);
      var snapshotSessionId =
        typeof p.session_id === "string" ? p.session_id : "";
      if (snapshotSessionId && snapshotSessionId !== sessionId) {
        return;
      }
      // Snapshot healing for same-user tabs when SSE is delayed/flaky.
      // Only accept snapshot if we're idle AND it's not stale (older than our current state).
      if (!moveInFlight && pendingMoves.length === 0 && snapSeq >= moveSeq) {
        avatarRow = p.row;
        avatarCol = p.col;
        targetX = tileX(avatarCol);
        targetZ = tileZ(avatarRow);
        if (isFinite(Number(p.rotation))) {
          avatar.rotation.y = Number(p.rotation);
        }
        moveSeq = snapSeq;
        requireElementById("pos-col").textContent = String(avatarCol);
        requireElementById("pos-row").textContent = String(avatarRow);
      }
    } else {
      upsertRemoteAvatar(p.player_id, p.row, p.col, p.seq, p.rotation, p);
    }
  });
}

function initMultiplayer() {
  scheduleSessionRefresh();
  applyStaticTranslations();
  updateLocaleToggleIcon();
  updateHeldHud();
  renderInventoryPanel();
  updateEditingRightsUI();
  initLogoutTrigger();
  syncNPCSnapshot(NPCS);
  // Active player positions are not part of the bootstrapped page state;
  // an initial resync populates remote avatars and establishes the
  // per-scope event seq baselines for gap detection.
  performResync();

  var eventsSseParams = new URLSearchParams({
    world_id: String(worldId),
    recipient_id: String(playerId),
  });
  var eventsSseUrl = "/virtual-world/events?" + eventsSseParams.toString();
  /** @type {number | null} */
  var eventsReconnectTimer = null;
  var eventsRetryCount = 0;
  var eventsWaitingForOnline = false;

  /** @param {any} payload */
  function handlePlayerMovedEvent(payload) {
    if (!payload || !payload.player_id) return;
    if (payload.leaving) {
      if (payload.player_id === playerId && payload.switched_world) {
        window.location.href = "/virtual-world/play";
        return;
      }
      removeRemoteAvatar(payload.player_id);
      return;
    }
    if (payload.player_id === playerId) {
      var incomingSeq = Number(payload.seq);
      var hasIncomingSeq = isFinite(incomingSeq);
      if (!moveInFlight && pendingMoves.length === 0) {
        if (!hasIncomingSeq || incomingSeq >= moveSeq) {
          avatarRow = payload.row;
          avatarCol = payload.col;
          targetX = tileX(avatarCol);
          targetZ = tileZ(avatarRow);
          if (isFinite(Number(payload.rotation))) {
            avatar.rotation.y = Number(payload.rotation);
          }
          if (hasIncomingSeq) {
            moveSeq = incomingSeq;
          }
          requireElementById("pos-col").textContent = String(avatarCol);
          requireElementById("pos-row").textContent = String(avatarRow);
          updateUseButtonState();
        }
      }
      return;
    }
    upsertRemoteAvatar(
      payload.player_id,
      payload.row,
      payload.col,
      payload.seq,
      payload.rotation,
      payload.values || payload.class_id
        ? { values: payload.values, class_id: payload.class_id }
        : undefined,
      payload.path,
    );
  }

  /**
   * Living-value-only update (e.g. idle-tick fatigue recovery, action
   * fatigue cost) for a player who didn't move — no row/col/seq involved.
   * @param {any} payload
   */
  function handlePlayerValuesChangedEvent(payload) {
    if (!payload || !payload.player_id) return;
    if (payload.player_id === playerId) return;
    if (!payload.values || typeof payload.values !== "object") return;
    if (remoteAvatars[payload.player_id]) {
      remoteAvatars[payload.player_id].values = payload.values;
      refreshTileDetailIfOpen();
    }
  }

  /** @param {any} payload */
  function handleTreeChangedEvent(payload) {
    if (!payload) return;
    var resolvedTreeAction = resolveTreeActionKind(payload.action);
    if (!resolvedTreeAction) return;
    applyTreeAction(
      resolvedTreeAction,
      payload.row,
      payload.col,
      payload.actor_type || "player",
      payload.actor_id || payload.player_id || "",
    );

    updateTreeInstances();
    refreshTileDetailIfOpen();
  }

  /** @param {any} payload */
  function handleHouseChangedEvent(payload) {
    if (!payload) return;
    var resolvedHouseAction = resolveHouseActionKind(payload.action);
    if (!resolvedHouseAction) return;
    applyHouseAction(
      resolvedHouseAction,
      payload.row,
      payload.col,
      payload.actor_type || "player",
      payload.actor_id || payload.player_id || "",
    );
    updateHouseMeshes();
    refreshTileDetailIfOpen();
  }

  /** @param {any} payload */
  function handleNpcMovedEvent(payload) {
    if (!payload || typeof payload.npc_id !== "string") return;
    if (payload.despawn) {
      removeNPCAvatar(payload.npc_id);
      return;
    }
    upsertNPCAvatar(
      payload.npc_id,
      payload.row,
      payload.col,
      payload.seq,
      payload.rotation,
      payload.display_name,
      payload,
    );
  }

  /**
   * Living-value-only update (idle-tick fatigue recovery) for an NPC that
   * didn't move this tick — upsertNPCAvatar's seq gate would otherwise drop
   * this since only movement advances an NPC's seq.
   * @param {any} payload
   */
  function handleNpcValuesChangedEvent(payload) {
    if (!payload || typeof payload.npc_id !== "string") return;
    if (!payload.values || typeof payload.values !== "object") return;
    if (npcAvatars[payload.npc_id]) {
      npcAvatars[payload.npc_id].values = payload.values;
      refreshTileDetailIfOpen();
    }
  }

  /** @param {any} msg */
  function handleChatMessageEvent(msg) {
    if (!msg || !msg.id) return;
    var exists = worldChatMessages.some(function (m) {
      return m.id === msg.id;
    });
    if (!exists) {
      worldChatMessages.push(msg);
      if (chatPanelVisible && chatActiveTab === "world") renderWorldChat();
    }
  }

  /** @param {any} msg */
  function handleDirectMessageEvent(msg) {
    if (!msg || !msg.id || !msg.sender_id) return;
    var senderId = msg.sender_id;
    if (!dmThreads[senderId]) dmThreads[senderId] = [];
    var exists = dmThreads[senderId].some(function (m) {
      return m.id === msg.id;
    });
    if (!exists) {
      dmThreads[senderId].push(msg);
      if (dmIndex.indexOf(senderId) === -1) dmIndex.push(senderId);
    }
    if (
      chatPanelVisible &&
      chatActiveTab === "dm" &&
      activeDmUserId === senderId
    ) {
      renderDMThread(senderId);
    } else {
      unreadDmCount += 1;
      updateChatUnreadBadge();
    }
  }

  /** @param {any} payload */
  function handlePokedEvent(payload) {
    if (!payload) return;
    var pokerNick = String(payload.poker_nick || "");
    if (!pokerNick) return;
    showHudToast(pokerNick + " " + t("poke.pokes_you", "pokes you."), false);
  }

  /** @param {any} payload */
  function handleFollowEndedEvent(payload) {
    hideFollowBanner();
    if (payload && payload.reason === "target_gone") {
      showHudToast(t("follow.target_gone", "Lost track of them."), false);
    }
  }

  /**
   * Per-tick feedback for the attacker in a fight (see fight-helpers.ts
   * tickFightForWorld) — fights are tick-driven rather than a direct
   * request/response, so this is the only way the attacker learns the
   * outcome of each hit.
   * @param {any} payload
   */
  function handleFightTickEvent(payload) {
    if (!payload) return;
    var label = String(payload.target_label || "");
    var suffix = label ? " " + label : "";
    if (payload.result === "miss") {
      showHudToast(t("fight.you_missed", "You missed") + suffix + ".", false);
    } else if (payload.result === "kill") {
      showHudToast(
        t("fight.you_defeated", "You defeated") + suffix + "!",
        false,
      );
    } else if (payload.result === "hit") {
      var dmgSuffix =
        typeof payload.damage === "number" ? " for " + payload.damage : "";
      showHudToast(
        t("fight.you_hit", "You hit") + suffix + dmgSuffix + ".",
        false,
      );
    }
  }

  /** @param {any} payload */
  function handleFightHitTakenEvent(payload) {
    if (!payload) return;
    var label =
      String(payload.attacker_label || "") || t("fight.something", "Something");
    showHudToast(
      label +
        " " +
        t("fight.hits_you_for", "hits you for") +
        " " +
        (Number(payload.damage) || 0) +
        ".",
      true,
    );
  }

  /**
   * Sent only to the player who was just reduced to 0 HP in a fight (see
   * fight-helpers.ts resolvePlayerDeath) — applies their new player_ghost
   * class/values locally and confirms it with a toast. Remote players see
   * the same class/values change via the accompanying "player_moved" event
   * (handlePlayerMovedEvent forwards payload.class_id to upsertRemoteAvatar).
   * @param {any} payload
   */
  function handlePlayerDiedEvent(payload) {
    if (!payload) return;
    var wasGhost =
      playerInventory && playerInventory.class_id === "player_ghost";
    if (payload.class_id) playerInventory.class_id = payload.class_id;
    if (payload.values && typeof payload.values === "object") {
      playerInventory.values = payload.values;
    }
    renderInventoryPanel();
    if (statsPanelVisible) renderStatisticsPanel();
    if (payload.class_id === "player_ghost" && !wasGhost) {
      showHudToast(
        t("fight.you_died", "You have died and become a ghost."),
        true,
      );
    }
  }

  /**
   * A durationMs action (e.g. crafting) that was started earlier has now
   * resolved server-side (see tree-action-helpers.ts resolvePendingActionsForWorld).
   * The payload has the same shape as a normal instant tree-action response.
   * @param {any} payload
   */
  function handleActionCompletedEvent(payload) {
    if (!payload) return;
    if (payload.ok === false) {
      if (payload.error)
        showHudToast(translateServerMessage(payload.error), true);
      return;
    }
    applyItemStateFromResult(payload);
    if (payload.toast_message) showHudToast(payload.toast_message, false);
  }

  /** @param {any} payload */
  function handlePresenceUpdateEvent(payload) {
    if (!payload || !payload.player_id) return;
    if (payload.action === "left") {
      var targetPlayerId = String(payload.player_id);
      var knownEntry = null;
      for (var i = 0; i < onlinePlayersList.length; i++) {
        if (onlinePlayersList[i].player_id === targetPlayerId) {
          knownEntry = onlinePlayersList[i];
          break;
        }
      }
      // Ignore stale leave events from the previous world after a world switch.
      // The player may already have a fresher upsert in a different world.
      if (
        !knownEntry ||
        String(knownEntry.world_id || "") === String(payload.world_id || "")
      ) {
        removeOnlinePlayerEntry(targetPlayerId);
      }
    } else {
      var oldNick = playerNick;
      upsertOnlinePlayerEntry(payload);
      if (payload.player_id === playerId) {
        if (payload.nick) {
          playerNick = String(payload.nick);
          var nickDisplay = document.getElementById("nick-display");
          if (nickDisplay) nickDisplay.textContent = playerNick;
          if (oldNick && oldNick !== playerNick) {
            showHudToast(
              t("nick.changed_name_to", "Changed name to") + " " + playerNick,
              false,
            );
          }
        }
        if (payload.inventory) {
          playerInventory = normalizeClientInventory(payload.inventory);
          renderInventoryPanel();
          if (statsPanelVisible) renderStatisticsPanel();
          updateUseButtonState();
          updateEditingRightsUI();
        }
        if (payload.items) {
          applyItemStateFromResult(payload);
        }
        if (payload.message) {
          showHudToast(payload.message, false);
        }
      }
    }
    if (playersPanelVisible) renderPlayersPanel();
  }

  /** @param {any} message */
  function handleUnifiedStreamMessage(message) {
    if (!message || typeof message.type !== "string") return;
    var payload = message.payload;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch (e) {}
    }
    if (!trackEventSeq(message.scope, message.seq)) return;
    switch (message.type) {
      case "player_moved":
        handlePlayerMovedEvent(payload);
        return;
      case "player_values_changed":
        handlePlayerValuesChangedEvent(payload);
        return;
      case "tree_changed":
        handleTreeChangedEvent(payload);
        return;
      case "house_changed":
        handleHouseChangedEvent(payload);
        return;
      case "npc_moved":
        handleNpcMovedEvent(payload);
        return;
      case "npc_values_changed":
        handleNpcValuesChangedEvent(payload);
        return;
      case "item_changed":
        applyItemDeltaFromEvent(payload);
        return;
      case "chat_message":
        handleChatMessageEvent(payload);
        return;
      case "direct_message":
        handleDirectMessageEvent(payload);
        return;
      case "presence_update":
        handlePresenceUpdateEvent(payload);
        return;
      case "poked":
        handlePokedEvent(payload);
        return;
      case "follow_ended":
        handleFollowEndedEvent(payload);
        return;
      case "fight_tick":
        handleFightTickEvent(payload);
        return;
      case "fight_hit_taken":
        handleFightHitTakenEvent(payload);
        return;
      case "player_died":
        handlePlayerDiedEvent(payload);
        return;
      case "action_completed":
        handleActionCompletedEvent(payload);
        return;
    }
  }

  function openUnifiedSSE() {
    var es = new EventSource(eventsSseUrl);
    es.onmessage = function (evt) {
      eventsRetryCount = 0;
      try {
        handleUnifiedStreamMessage(JSON.parse(evt.data));
      } catch (e) {}
    };
    es.onerror = function () {
      es.close();
      scheduleSSEAuthCheck("virtualWorldEvents");
      if (
        authState === AUTH_STATE_EXPIRED ||
        authState === AUTH_STATE_REDIRECTING
      )
        return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!eventsWaitingForOnline) {
          eventsWaitingForOnline = true;
          function handleEventsOnline() {
            window.removeEventListener("online", handleEventsOnline);
            eventsWaitingForOnline = false;
            openUnifiedSSE();
          }
          window.addEventListener("online", handleEventsOnline);
        }
        return;
      }
      if (eventsReconnectTimer) window.clearTimeout(eventsReconnectTimer);
      requestResync();
      eventsRetryCount += 1;
      eventsReconnectTimer = window.setTimeout(
        openUnifiedSSE,
        getSSEReconnectDelayMs(eventsRetryCount),
      );
    };
    return es;
  }

  openUnifiedSSE();

  // Announce departure
  window.addEventListener("beforeunload", postLeave);

  // Fire a heartbeat immediately when a backgrounded tab regains focus.
  // Browsers throttle setInterval to ≥60 s in background tabs, which can
  // cause lease and presence renewal to lag. Sending one ping on visibility
  // restore keeps the session fresh without a tight fixed interval.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && authState === AUTH_STATE_OK) {
      sendHeartbeat(true);
    }
  });

  // Heartbeat — keep presence alive while SSE handles steady-state updates.
  // Visible tabs renew every 20 s, which stays below the 30 s lease TTL
  // while removing most of the old 5 s baseline traffic.
  sendHeartbeat(true);
}
