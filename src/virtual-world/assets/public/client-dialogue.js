/// <reference path="virtual-world-browser-globals.d.ts" />
// Talking to a living: the panel, and the two requests behind it.
//
// The server owns the conversation — which node this player is in, which
// choices they may see, and what picking one does. This file only draws what
// it is told and sends back where it thinks it is; every step is re-validated
// there, so nothing here needs to be trusted.

/** @type {{targetId: string, nodeId: string} | null} */
var dialogueState = null;

/**
 * Whether this living has anything to say, from the class registry the page
 * shipped — so the tile inspector can offer Talk only where it means
 * something rather than on every chicken.
 * @param {string} classId
 * @returns {boolean}
 */
function livingClassHasDialogue(classId) {
  var classes =
    LIVING_REGISTRY && LIVING_REGISTRY.classes ? LIVING_REGISTRY.classes : {};
  var cls = classes[String(classId || "")];
  return !!(
    cls &&
    cls.dialogue &&
    Array.isArray(cls.dialogue.nodes) &&
    cls.dialogue.nodes.length > 0
  );
}

/** @param {any} payload */
function renderDialogue(payload) {
  var panel = document.getElementById("hud-dialogue");
  if (!panel) return;
  if (!payload || !payload.ok || !payload.node) {
    closeDialogue();
    // An ended conversation is not an error, and neither is a living with
    // nothing left to say — but a refusal (a choice whose action failed) is
    // worth showing, and the action's own message says it best.
    if (payload && payload.error) {
      showHudToast(translateServerMessage(String(payload.error)), true);
    }
    return;
  }

  dialogueState = {
    targetId: String(payload.target_living_id),
    nodeId: String(payload.node.id),
  };
  requireElementById("dialogue-speaker").textContent = String(
    payload.display_name || "",
  );
  requireElementById("dialogue-text").textContent = payload.node.text_key
    ? t(payload.node.text_key, payload.node.text)
    : payload.node.text;

  var list = requireElementById("dialogue-choices");
  list.innerHTML = "";
  var choices = Array.isArray(payload.node.choices) ? payload.node.choices : [];
  for (var i = 0; i < choices.length; i++) {
    var choice = choices[i];
    var btn = document.createElement("button");
    btn.className = "dialogue-choice";
    btn.textContent = choice.text_key
      ? t(choice.text_key, choice.text)
      : choice.text;
    // The server indexes choices by their position in the node's own list, not
    // by position in this (condition-filtered) view, so the original index is
    // what travels back.
    btn.onclick = (function (originalIndex) {
      return function () {
        pickDialogueChoice(originalIndex);
      };
    })(Number(choice.index));
    list.appendChild(btn);
  }
  panel.style.display = "block";
}

/** @param {string} targetLivingId */
function openDialogue(targetLivingId) {
  fetchWithAuth("/virtual-world/dialogue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_living_id: targetLivingId }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(renderDialogue)
    .catch(function () {
      showHudToast(t("dialogue.failed", "Could not talk to them"), true);
    });
}

/** @param {number} choiceIndex */
function pickDialogueChoice(choiceIndex) {
  if (!dialogueState) return;
  fetchWithAuth("/virtual-world/dialogue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_living_id: dialogueState.targetId,
      node_id: dialogueState.nodeId,
      choice_index: choiceIndex,
    }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (payload) {
      // A choice may have run an action — its inventory, values and toast come
      // back exactly as they would from the palette, so the rest of the HUD
      // stays in step with what the conversation just did.
      if (payload && payload.action_result) {
        applyItemStateFromResult(payload.action_result);
        var actionToast = localizeResultToast(payload.action_result);
        if (actionToast) showHudToast(actionToast, false);
        requestHeartbeatSoon();
      }
      renderDialogue(payload);
    })
    .catch(function () {
      showHudToast(t("dialogue.failed", "Could not talk to them"), true);
    });
}

function closeDialogue() {
  dialogueState = null;
  var panel = document.getElementById("hud-dialogue");
  if (panel) panel.style.display = "none";
}
