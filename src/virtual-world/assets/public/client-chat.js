/// <reference path="virtual-world-browser-globals.d.ts" />
// Chat: world chat tab and direct messages.

// ── Chat helpers ─────────────────────────────────────────────────────────

/** @param {any} str */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {number | string | Date} ts */
function formatChatTime(ts) {
  var d = new Date(ts);
  return (
    d.getHours().toString().padStart(2, "0") +
    ":" +
    d.getMinutes().toString().padStart(2, "0")
  );
}

/** @param {any} msg */
function buildMsgHtml(msg) {
  var isMe = msg.sender_id === playerId;
  // For own messages always reflect the current nick so renames apply retroactively.
  var nick = escapeHtml(
    isMe
      ? playerNick || msg.sender_nick || playerId.slice(0, 16)
      : msg.sender_nick || msg.sender_id.slice(0, 16),
  );
  var text = escapeHtml(msg.text);
  return (
    '<div class="chat-msg">' +
    '<span class="msg-nick' +
    (isMe ? " is-me" : "") +
    '">' +
    nick +
    ":</span>" +
    text +
    '<span class="msg-ts">' +
    formatChatTime(msg.ts) +
    "</span>" +
    "</div>"
  );
}

/** @param {string} containerId */
function scrollChatToBottom(containerId) {
  var el = document.getElementById(containerId);
  if (el) el.scrollTop = el.scrollHeight;
}

// ── World chat ────────────────────────────────────────────────────────────

function renderWorldChat() {
  var container = document.getElementById("world-chat-msgs");
  if (!container) return;
  container.innerHTML = worldChatMessages.map(buildMsgHtml).join("");
  scrollChatToBottom("world-chat-msgs");
}

function sendWorldChatMessage() {
  var input = /** @type {HTMLInputElement | null} */ (
    document.getElementById("world-chat-input")
  );
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  input.value = "";
  fetchWithAuth("/virtual-world/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (data && data.ok && data.message) {
        // Server echo will arrive via SSE; optimistically add to avoid duplication check
        var exists = worldChatMessages.some(function (m) {
          return m.id === data.message.id;
        });
        if (!exists) {
          worldChatMessages.push(data.message);
          if (chatPanelVisible && chatActiveTab === "world") renderWorldChat();
        }
      }
    })
    .catch(function () {});
}

// ── Chat panel ────────────────────────────────────────────────────────────

function showChatPanel() {
  chatPanelVisible = true;
  var el = document.getElementById("hud-chat-panel");
  if (el) el.classList.add("visible");
  unreadDmCount = 0;
  updateChatUnreadBadge();
  if (chatActiveTab === "world") renderWorldChat();
  else renderDMContent();
}

function closeChatPanel() {
  chatPanelVisible = false;
  var el = document.getElementById("hud-chat-panel");
  if (el) el.classList.remove("visible");
}

function toggleChatPanel() {
  if (chatPanelVisible) closeChatPanel();
  else showChatPanel();
}

/** @param {"world" | "dm"} tab */
function switchChatTab(tab) {
  chatActiveTab = tab;
  requireElementById("chat-tab-world").classList.toggle(
    "active",
    tab === "world",
  );
  requireElementById("chat-tab-dm").classList.toggle("active", tab === "dm");
  requireElementById("chat-content-world").classList.toggle(
    "hidden",
    tab !== "world",
  );
  requireElementById("chat-content-dm").classList.toggle(
    "hidden",
    tab !== "dm",
  );
  if (tab === "world") renderWorldChat();
  else renderDMContent();
  if (tab === "dm") {
    unreadDmCount = 0;
    updateChatUnreadBadge();
  }
}

function updateChatUnreadBadge() {
  var badge = document.getElementById("chat-unread-badge");
  var tabBadge = document.getElementById("dm-tab-badge");
  if (!badge || !tabBadge) return;
  if (unreadDmCount > 0) {
    badge.textContent = unreadDmCount > 9 ? "9+" : String(unreadDmCount);
    badge.classList.add("visible");
    tabBadge.textContent = badge.textContent;
    tabBadge.classList.add("visible");
  } else {
    badge.classList.remove("visible");
    tabBadge.classList.remove("visible");
  }
}

// Opens chat panel on DM tab and directly starts thread with a specific user.
/** @param {string} otherUserId */
function openChatPanelDM(otherUserId) {
  if (!chatPanelVisible) showChatPanel();
  if (chatActiveTab !== "dm") switchChatTab("dm");
  openDMThread(otherUserId);
}

// ── Direct messages ───────────────────────────────────────────────────────

function renderDMContent() {
  if (activeDmUserId) {
    renderDMThread(activeDmUserId);
  } else {
    showDMConvoList();
  }
}

function showDMConvoList() {
  activeDmUserId = null;
  var threadView = document.getElementById("dm-thread-view");
  var convoList = document.getElementById("dm-convo-list");
  if (threadView) threadView.style.display = "none";
  if (!convoList) return;
  convoList.style.display = "";
  if (!dmIndex.length) {
    convoList.innerHTML =
      '<div style="color:rgba(255,255,255,0.4);font-style:italic;font-size:12px;padding:8px;">' +
      escHtml(
        t(
          "chat.no_conversations",
          "No conversations yet. Click 💬 DM next to a player to start one.",
        ),
      ) +
      "</div>";
    return;
  }
  convoList.innerHTML = dmIndex
    .map(function (uid) {
      // Try to get the nick from the online players list first
      var entry = onlinePlayersList.find(function (p) {
        return p.player_id === uid;
      });
      var nick = entry ? escapeHtml(entry.nick) : escapeHtml(uid.slice(0, 16));
      return (
        '<div class="dm-convo-item" data-uid="' +
        escapeHtml(uid) +
        '" onclick="openDMThread(this.dataset.uid)">' +
        '<span class="convo-nick">' +
        nick +
        "</span>" +
        '<span style="font-size:11px;color:#aaa;">→</span>' +
        "</div>"
      );
    })
    .join("");
}

/** @param {string} otherUserId */
function openDMThread(otherUserId) {
  activeDmUserId = otherUserId;
  var threadView = document.getElementById("dm-thread-view");
  var convoList = document.getElementById("dm-convo-list");
  if (convoList) convoList.style.display = "none";
  if (threadView) threadView.style.display = "flex";
  if (dmThreads[otherUserId]) {
    renderDMThread(otherUserId);
  } else {
    // Load from server
    fetchWithAuth(
      "/virtual-world/dm-history?with=" + encodeURIComponent(otherUserId),
    )
      .then(function (res) {
        return res.json();
      })
      .then(function (msgs) {
        dmThreads[otherUserId] = Array.isArray(msgs) ? msgs : [];
        if (
          !dmIndex.includes(otherUserId) &&
          dmThreads[otherUserId].length > 0
        ) {
          dmIndex.push(otherUserId);
        }
        renderDMThread(otherUserId);
      })
      .catch(function () {
        dmThreads[otherUserId] = [];
        renderDMThread(otherUserId);
      });
  }
}

/** @param {string} otherUserId */
function renderDMThread(otherUserId) {
  var msgs = dmThreads[otherUserId] || [];
  var container = document.getElementById("dm-thread-msgs");
  if (!container) return;
  container.innerHTML = msgs.length
    ? msgs.map(buildMsgHtml).join("")
    : '<div style="color:rgba(255,255,255,0.4);font-style:italic;font-size:12px;padding:8px;">' +
      escHtml(t("chat.no_messages", "No messages yet.")) +
      "</div>";
  scrollChatToBottom("dm-thread-msgs");
}

function sendDirectMessage() {
  if (!activeDmUserId) return;
  var input = /** @type {HTMLInputElement | null} */ (
    document.getElementById("dm-chat-input")
  );
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  input.value = "";
  var to = activeDmUserId;
  fetchWithAuth("/virtual-world/dm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: to, text: text }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (data && data.ok && data.message) {
        if (!dmThreads[to]) dmThreads[to] = [];
        var exists = dmThreads[to].some(function (m) {
          return m.id === data.message.id;
        });
        if (!exists) {
          dmThreads[to].push(data.message);
          if (!dmIndex.includes(to)) dmIndex.push(to);
          if (activeDmUserId === to) renderDMThread(to);
        }
      }
    })
    .catch(function () {});
}
