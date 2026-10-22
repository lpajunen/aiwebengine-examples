/// <reference path="virtual-world-browser-globals.d.ts" />

// Recurring events (server/events.ts): every player hears of one wherever
// they are, sees it with a countdown in the active-actions panel, and — when
// it offers a choice of rewards — picks theirs there.

/**
 * @typedef {{ event_id: string, world_id: string, phase: string, phase_ends_at: number, label_key?: string, fallback_label?: string, labels?: Record<string, string>, started_by_nick?: string, goal?: number, total?: number, rewards?: Array<{ text_key: string, text: string }>, outcome?: string }} WorldEventInfo
 */

/** @type {Record<string, WorldEventInfo>} */
var worldEvents = {};

/** @param {WorldEventInfo} info */
function worldEventKey(info) {
  return String(info.event_id) + "@" + String(info.world_id);
}

/** @param {WorldEventInfo} info */
function worldEventLabel(info) {
  return localizeLabel(
    info.labels,
    info.label_key || "",
    info.fallback_label || String(info.event_id),
  );
}

/** Minutes and seconds left until `endsAt`, as m:ss. @param {number} endsAt */
function worldEventCountdown(endsAt) {
  var left = Math.max(0, Math.ceil((Number(endsAt) - Date.now()) / 1000));
  var minutes = Math.floor(left / 60);
  var seconds = left % 60;
  return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
}

/**
 * The panel rows for every event under way, ahead of the player's own active
 * actions (client-core.js renderActiveActionsList).
 * @returns {string}
 */
function worldEventRowsHtml() {
  return Object.keys(worldEvents)
    .map(function (key) {
      var info = worldEvents[key];
      var html =
        '<div class="active-action-row world-event-row">' +
        "<span>" +
        escapeHtml(worldEventLabel(info)) +
        " — " +
        escapeHtml(t("event.phase." + info.phase, info.phase));
      if (Number(info.phase_ends_at) > 0) {
        html +=
          ' <span class="world-event-countdown" data-ends="' +
          Number(info.phase_ends_at) +
          '">' +
          worldEventCountdown(info.phase_ends_at) +
          "</span>";
      }
      html += "</span>";
      var rewards = Array.isArray(info.rewards) ? info.rewards : [];
      if (info.phase === "rewarding" && rewards.length > 1) {
        html += rewards
          .map(function (reward, index) {
            return (
              '<button data-event="' +
              escapeHtml(String(info.event_id)) +
              '" data-choice="' +
              index +
              '" onclick="claimWorldEventReward(this.dataset.event, Number(this.dataset.choice))">' +
              escapeHtml(t(reward.text_key, reward.text)) +
              "</button>"
            );
          })
          .join("");
      }
      return html + "</div>";
    })
    .join("");
}

/** @param {WorldEventInfo} info */
function worldEventToast(info) {
  var line = info.outcome || info.phase;
  return (
    worldEventLabel(info) +
    ": " +
    t("event.toast." + line, t("event.phase." + info.phase, info.phase))
  );
}

/**
 * A `world_event` from the stream: the event moved on somewhere.
 * @param {WorldEventInfo} info
 */
function handleWorldEvent(info) {
  if (!info || !info.event_id) return;
  if (info.phase === "waiting") delete worldEvents[worldEventKey(info)];
  else worldEvents[worldEventKey(info)] = info;
  showHudToast(worldEventToast(info), false);
  renderActiveActionsList();
}

/**
 * @param {string} eventId
 * @param {number} choice
 */
function claimWorldEventReward(eventId, choice) {
  fetchWithAuth("/virtual-world/event-reward", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: eventId, choice: choice }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (result) {
      if (!result || !result.ok) {
        showHudToast(
          translateServerMessage((result && result.error) || "error"),
          true,
        );
        return;
      }
      showHudToast(t("event.reward_taken", "The reward is yours."), false);
      requestHeartbeatSoon();
    })
    .catch(function () {});
}

// The countdowns tick in place, so a button is never redrawn under a click.
window.setInterval(function () {
  var spans = document.querySelectorAll(".world-event-countdown");
  for (var i = 0; i < spans.length; i++) {
    var span = /** @type {HTMLElement} */ (spans[i]);
    span.textContent = worldEventCountdown(Number(span.dataset.ends || 0));
  }
}, 1000);

(Array.isArray(WORLD_EVENTS) ? WORLD_EVENTS : []).forEach(function (info) {
  worldEvents[worldEventKey(info)] = info;
});
renderActiveActionsList();
