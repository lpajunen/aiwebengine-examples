/// <reference path="virtual-world-browser-globals.d.ts" />
// Creator tools: locale toggle, editing rights, item/action/living/world class editors.

// ── Localization ──────────────────────────────────────────────────────────

/** @type {Record<string, string>} */
var LOCALE_FLAG_BY_CODE = { en: "🇬🇧", fi: "🇫🇮" };

/**
 * Build the per-locale `labels` payload sent with a class record. The English
 * name lives in the record's fallbackLabel; this carries only the non-English
 * overrides (today just Finnish). Omitted/blank entries are simply left out.
 * @param {string} nameFi
 * @returns {Record<string, string>}
 */
function buildLabelsPayload(nameFi) {
  /** @type {Record<string, string>} */
  var labels = {};
  if (nameFi) labels.fi = nameFi;
  return labels;
}

/**
 * Localized display name for an editor-list row of a flat class record
 * (action/living/world — label fields live at the top level).
 * @param {any} cls
 * @returns {string}
 */
function classDisplayLabel(cls) {
  if (!cls) return "?";
  return localizeLabel(
    cls.labels,
    String(cls.labelKey || ""),
    String(cls.fallbackLabel || cls.id || "?"),
  );
}

/**
 * Localized display name for an item-class editor-list row, whose label
 * fields live under `visuals`.
 * @param {any} ic
 * @returns {string}
 */
function itemClassDisplayLabel(ic) {
  if (!ic) return "?";
  return localizeLabel(
    ic.labels,
    String((ic.visuals && ic.visuals.labelKey) || ""),
    String((ic.visuals && ic.visuals.fallbackLabel) || ic.id || "?"),
  );
}

function updateLocaleToggleIcon() {
  var btn = document.getElementById("btn-locale-toggle");
  if (!btn) return;
  var nextLocale = getOtherLocale();
  btn.textContent = LOCALE_FLAG_BY_CODE[nextLocale] || "🌐";
}

function retranslateUI() {
  applyStaticTranslations();
  updateLocaleToggleIcon();
  renderInventoryPanel();
  refreshTileDetailIfOpen();
  updateStatsHud();
  if (statsPanelVisible) renderStatisticsPanel();
  if (worldInfoPanelVisible) renderWorldInfoPanel();
  if (playersPanelVisible) renderPlayersPanel();
  if (itemClassPanelVisible) renderItemClassList();
  if (actionClassPanelVisible) renderActionClassList();
  if (livingClassPanelVisible) renderLivingClassList();
  if (worldClassPanelVisible) renderWorldClassList();
  if (tileClassPanelVisible) renderTileClassList();
  if (chatPanelVisible && chatActiveTab === "world") renderWorldChat();
}

function toggleLocale() {
  setLocale(getOtherLocale());
  retranslateUI();
}

// ── Editing rights (creator's stone) ─────────────────────────────────────

/** @returns {boolean} */
function playerHasCreatorStone() {
  if (!playerInventory) return false;
  var slots =
    playerInventory.slots && typeof playerInventory.slots === "object"
      ? playerInventory.slots
      : {};
  var slotIds = Object.keys(slots);
  for (var i = 0; i < slotIds.length; i++) {
    var item = slots[slotIds[i]];
    if (item && item.type === "creator_stone") return true;
  }
  var bag = Array.isArray(playerInventory.bag) ? playerInventory.bag : [];
  for (var j = 0; j < bag.length; j++) {
    if (bag[j] && bag[j].type === "creator_stone") return true;
  }
  return false;
}

function updateEditingRightsUI() {
  var hasRights = playerHasCreatorStone();
  requireElementById("btn-item-classes").style.display = hasRights
    ? ""
    : "none";
  requireElementById("btn-action-classes").style.display = hasRights
    ? ""
    : "none";
  requireElementById("btn-living-classes").style.display = hasRights
    ? ""
    : "none";
  requireElementById("btn-world-classes").style.display = hasRights
    ? ""
    : "none";
  requireElementById("btn-tile-classes").style.display = hasRights
    ? ""
    : "none";
  if (!hasRights) {
    if (itemClassPanelVisible) closeItemClassPanel();
    if (actionClassPanelVisible) closeActionClassPanel();
    if (livingClassPanelVisible) closeLivingClassPanel();
    if (worldClassPanelVisible) closeWorldClassPanel();
    if (tileClassPanelVisible) closeTileClassPanel();
  }
}

// ── Item class panel ─────────────────────────────────────────────────────

function renderItemClassList() {
  var listDiv = requireElementById("item-class-list");
  fetchWithAuth("/virtual-world/item-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.item_classes) ? data.item_classes : [];
      classes = classes
        .slice()
        .sort(function (/** @type {any} */ a, /** @type {any} */ b) {
          return itemClassDisplayLabel(a).localeCompare(
            itemClassDisplayLabel(b),
          );
        });
      if (!classes.length) {
        listDiv.innerHTML =
          '<div class="class-row"><em style="opacity:0.55">' +
          escHtml(
            t("class_editor.no_custom_item_types", "No custom item types yet."),
          ) +
          "</em></div>";
        return;
      }
      var rows = "";
      for (var i = 0; i < classes.length; i++) {
        var ic = classes[i];
        var label = escHtml(itemClassDisplayLabel(ic));
        var id = escHtml(String(ic.id || ""));
        rows +=
          '<div class="class-row">' +
          '<span class="class-row-id">' +
          id +
          "</span> " +
          '<span class="class-row-label">' +
          label +
          "</span>" +
          '<span class="class-row-btns">' +
          '<button data-item-class-id="' +
          id +
          '" onclick="editItemClass(this.dataset.itemClassId)">' +
          escHtml(t("class_editor.edit_button", "Edit")) +
          "</button>" +
          '<button data-item-class-id="' +
          id +
          '" onclick="deleteItemClassUI(this.dataset.itemClassId)">' +
          escHtml(t("class_editor.del_button", "Del")) +
          "</button>" +
          "</span></div>";
      }
      listDiv.innerHTML = rows;
    })
    .catch(function () {
      listDiv.innerHTML =
        '<div class="class-row" style="color:#f88">' +
        escHtml(t("class_editor.failed_to_load_list", "Failed to load.")) +
        "</div>";
    });
}

/** @param {string} id */
function editItemClass(id) {
  fetchWithAuth("/virtual-world/item-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.item_classes) ? data.item_classes : [];
      var ic = null;
      for (var i = 0; i < classes.length; i++) {
        if (String(classes[i].id) === String(id)) {
          ic = classes[i];
          break;
        }
      }
      if (!ic) {
        showHudToast(
          t("class_editor.item_not_found", "Item type not found"),
          true,
        );
        return;
      }
      itemClassEditId = String(id);
      var idEl = /** @type {HTMLInputElement} */ (requireElementById("ic-id"));
      idEl.value = String(ic.id || "");
      idEl.disabled = true;
      /** @type {HTMLInputElement} */ (requireElementById("ic-label")).value =
        String((ic.visuals && ic.visuals.fallbackLabel) || "");
      /** @type {HTMLInputElement} */ (requireElementById("ic-name-fi")).value =
        String((ic.labels && ic.labels.fi) || "");
      /** @type {HTMLSelectElement} */ (requireElementById("ic-kind")).value =
        String(ic.kind || "tool");
      /** @type {HTMLSelectElement} */ (requireElementById("ic-size")).value =
        String((ic.visuals && ic.visuals.size) || "medium");
      /** @type {HTMLSelectElement} */ (requireElementById("ic-style")).value =
        String((ic.visuals && ic.visuals.style) || "block");
      setClassColorField(
        "ic",
        itemColorNumberToHex(ic.visuals && ic.visuals.color),
      );
      /** @type {HTMLInputElement} */ (
        requireElementById("ic-non-droppable")
      ).checked = !!ic.nonDroppable;
      /** @type {HTMLInputElement} */ (
        requireElementById("ic-non-pickable")
      ).checked = !!ic.nonPickable;
      /** @type {HTMLInputElement} */ (
        requireElementById("ic-action-ids")
      ).value = Array.isArray(ic.actionIds) ? ic.actionIds.join(",") : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("ic-state-template")
      ).value =
        ic.stateTemplate && Object.keys(ic.stateTemplate).length
          ? JSON.stringify(ic.stateTemplate, null, 2)
          : "";
      requireElementById("item-class-form-title").textContent =
        t("class_editor.edit_prefix", "Edit:") + " " + String(id);
    })
    .catch(function () {
      showHudToast(
        t("class_editor.failed_to_load_item_type", "Failed to load item type"),
        true,
      );
    });
}

function cancelItemClassEdit() {
  itemClassEditId = null;
  var idEl = /** @type {HTMLInputElement} */ (requireElementById("ic-id"));
  idEl.disabled = false;
  idEl.value = "";
  /** @type {HTMLInputElement} */ (requireElementById("ic-label")).value = "";
  /** @type {HTMLInputElement} */ (requireElementById("ic-name-fi")).value = "";
  /** @type {HTMLSelectElement} */ (requireElementById("ic-kind")).value =
    "tool";
  /** @type {HTMLSelectElement} */ (requireElementById("ic-size")).value =
    "medium";
  /** @type {HTMLSelectElement} */ (requireElementById("ic-style")).value =
    "block";
  setClassColorField("ic", "");
  /** @type {HTMLInputElement} */ (
    requireElementById("ic-non-droppable")
  ).checked = false;
  /** @type {HTMLInputElement} */ (
    requireElementById("ic-non-pickable")
  ).checked = false;
  /** @type {HTMLInputElement} */ (requireElementById("ic-action-ids")).value =
    "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("ic-state-template")
  ).value = "";
  requireElementById("item-class-form-title").textContent = t(
    "class_editor.new_item_type",
    "New item type",
  );
}

function submitItemClassForm() {
  var idVal = /** @type {HTMLInputElement} */ (
    requireElementById("ic-id")
  ).value.trim();
  if (!idVal) {
    showHudToast(
      t("class_editor.item_id_required", "Item type ID is required"),
      true,
    );
    return;
  }
  var labelVal = /** @type {HTMLInputElement} */ (
    requireElementById("ic-label")
  ).value.trim();
  var nameFiVal = /** @type {HTMLInputElement} */ (
    requireElementById("ic-name-fi")
  ).value.trim();
  var kindVal = /** @type {HTMLSelectElement} */ (requireElementById("ic-kind"))
    .value;
  var sizeVal = /** @type {HTMLSelectElement} */ (requireElementById("ic-size"))
    .value;
  var styleVal = /** @type {HTMLSelectElement} */ (
    requireElementById("ic-style")
  ).value;
  var colorVal = readClassColorField("ic");
  var nonDroppableVal = /** @type {HTMLInputElement} */ (
    requireElementById("ic-non-droppable")
  ).checked;
  var nonPickableVal = /** @type {HTMLInputElement} */ (
    requireElementById("ic-non-pickable")
  ).checked;
  var actionIdsRaw = /** @type {HTMLInputElement} */ (
    requireElementById("ic-action-ids")
  ).value;
  var stateTemplateRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("ic-state-template")
  ).value.trim();
  var actionIds = actionIdsRaw
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  var stateTemplate = {};
  if (stateTemplateRaw) {
    try {
      stateTemplate = JSON.parse(stateTemplateRaw);
    } catch (e) {
      showHudToast(
        t(
          "class_editor.invalid_state_template_json",
          "Invalid state template JSON",
        ),
        true,
      );
      return;
    }
  }
  var record = {
    id: idVal,
    kind: kindVal,
    nonDroppable: nonDroppableVal,
    nonPickable: nonPickableVal,
    visuals: {
      fallbackLabel: labelVal || idVal,
      size: sizeVal,
      style: styleVal,
      color: colorVal,
    },
    actionIds: actionIds,
    stateTemplate: stateTemplate,
    labels: buildLabelsPayload(nameFiVal),
  };
  var url = itemClassEditId
    ? "/virtual-world/item-classes/" + encodeURIComponent(itemClassEditId)
    : "/virtual-world/item-classes";
  var method = itemClassEditId ? "PUT" : "POST";
  fetchWithAuth(url, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(
          data.error
            ? translateServerMessage(String(data.error))
            : t("class_editor.save_failed", "Save failed"),
          true,
        );
        return;
      }
      showHudToast(t("class_editor.saved", "Saved!"), false);
      cancelItemClassEdit();
      renderItemClassList();
    })
    .catch(function () {
      showHudToast(t("class_editor.save_failed", "Save failed"), true);
    });
}

/** @param {string} id */
function deleteItemClassUI(id) {
  fetchWithAuth(
    "/virtual-world/item-classes/" + encodeURIComponent(String(id)),
    { method: "DELETE" },
  )
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(
          data.error
            ? translateServerMessage(String(data.error))
            : t("class_editor.delete_failed", "Delete failed"),
          true,
        );
        return;
      }
      showHudToast(
        t("class_editor.deleted_prefix", "Deleted") + " " + String(id),
        false,
      );
      if (itemClassEditId === String(id)) cancelItemClassEdit();
      renderItemClassList();
    })
    .catch(function () {
      showHudToast(t("class_editor.delete_failed", "Delete failed"), true);
    });
}

function showItemClassPanel() {
  if (inventoryPanelVisible) closeInventoryPanel();
  if (actionClassPanelVisible) closeActionClassPanel();
  if (livingClassPanelVisible) closeLivingClassPanel();
  if (worldClassPanelVisible) closeWorldClassPanel();
  if (tileClassPanelVisible) closeTileClassPanel();
  itemClassPanelVisible = true;
  requireElementById("hud-item-class-panel").style.display = "block";
  renderItemClassList();
}

function closeItemClassPanel() {
  itemClassPanelVisible = false;
  requireElementById("hud-item-class-panel").style.display = "none";
}

function toggleItemClassPanel() {
  if (itemClassPanelVisible) closeItemClassPanel();
  else showItemClassPanel();
}

// ── Action class panel ────────────────────────────────────────────────────

function renderActionClassList() {
  var listDiv = requireElementById("action-class-list");
  fetchWithAuth("/virtual-world/action-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.action_classes) ? data.action_classes : [];
      classes = classes
        .slice()
        .sort(function (/** @type {any} */ a, /** @type {any} */ b) {
          return classDisplayLabel(a).localeCompare(classDisplayLabel(b));
        });
      if (!classes.length) {
        listDiv.innerHTML =
          '<div class="class-row"><em style="opacity:0.55">' +
          escHtml(
            t(
              "class_editor.no_custom_action_types",
              "No custom action types yet.",
            ),
          ) +
          "</em></div>";
        return;
      }
      var rows = "";
      for (var i = 0; i < classes.length; i++) {
        var ac = classes[i];
        var label = escHtml(classDisplayLabel(ac));
        var id = escHtml(String(ac.id || ""));
        rows +=
          '<div class="class-row">' +
          '<span class="class-row-id">' +
          id +
          "</span> " +
          '<span class="class-row-label">' +
          label +
          "</span>" +
          '<span class="class-row-btns">' +
          '<button data-action-class-id="' +
          id +
          '" onclick="editActionClass(this.dataset.actionClassId)">' +
          escHtml(t("class_editor.edit_button", "Edit")) +
          "</button>" +
          '<button data-action-class-id="' +
          id +
          '" onclick="deleteActionClassUI(this.dataset.actionClassId)">' +
          escHtml(t("class_editor.del_button", "Del")) +
          "</button>" +
          "</span></div>";
      }
      listDiv.innerHTML = rows;
    })
    .catch(function () {
      listDiv.innerHTML =
        '<div class="class-row" style="color:#f88">' +
        escHtml(t("class_editor.failed_to_load_list", "Failed to load.")) +
        "</div>";
    });
}

/** @param {string} id */
function editActionClass(id) {
  fetchWithAuth("/virtual-world/action-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.action_classes) ? data.action_classes : [];
      var ac = null;
      for (var i = 0; i < classes.length; i++) {
        if (String(classes[i].id) === String(id)) {
          ac = classes[i];
          break;
        }
      }
      if (!ac) {
        showHudToast(
          t("class_editor.action_not_found", "Action type not found"),
          true,
        );
        return;
      }
      actionClassEditId = String(id);
      var idEl = /** @type {HTMLInputElement} */ (requireElementById("ac-id"));
      idEl.value = String(ac.id || "");
      idEl.disabled = true;
      /** @type {HTMLInputElement} */ (requireElementById("ac-label")).value =
        String(ac.fallbackLabel || "");
      /** @type {HTMLInputElement} */ (requireElementById("ac-name-fi")).value =
        String((ac.labels && ac.labels.fi) || "");
      /** @type {HTMLSelectElement} */ (
        requireElementById("ac-target-kind")
      ).value = String(ac.targetKind || "self");
      /** @type {HTMLInputElement} */ (
        requireElementById("ac-source-items")
      ).value = Array.isArray(ac.sourceItemIds)
        ? ac.sourceItemIds.join(",")
        : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("ac-logic-spec")
      ).value = ac.logicSpec ? JSON.stringify(ac.logicSpec, null, 2) : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("ac-living-effect")
      ).value = ac.livingEffect ? JSON.stringify(ac.livingEffect, null, 2) : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("ac-execution")
      ).value = ac.execution ? JSON.stringify(ac.execution, null, 2) : "";
      /** @type {HTMLTextAreaElement} */ (requireElementById("ac-cost")).value =
        ac.cost ? JSON.stringify(ac.cost, null, 2) : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("ac-produces")
      ).value = ac.produces ? JSON.stringify(ac.produces, null, 2) : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("ac-experience")
      ).value = ac.experience ? JSON.stringify(ac.experience, null, 2) : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("ac-messages")
      ).value = ac.messages ? JSON.stringify(ac.messages, null, 2) : "";
      requireElementById("action-class-form-title").textContent =
        t("class_editor.edit_prefix", "Edit:") + " " + String(id);
    })
    .catch(function () {
      showHudToast(
        t(
          "class_editor.failed_to_load_action_type",
          "Failed to load action type",
        ),
        true,
      );
    });
}

function cancelActionClassEdit() {
  actionClassEditId = null;
  var idEl = /** @type {HTMLInputElement} */ (requireElementById("ac-id"));
  idEl.disabled = false;
  idEl.value = "";
  /** @type {HTMLInputElement} */ (requireElementById("ac-label")).value = "";
  /** @type {HTMLInputElement} */ (requireElementById("ac-name-fi")).value = "";
  /** @type {HTMLSelectElement} */ (
    requireElementById("ac-target-kind")
  ).value = "self";
  /** @type {HTMLInputElement} */ (
    requireElementById("ac-source-items")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("ac-logic-spec")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("ac-living-effect")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("ac-execution")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (requireElementById("ac-cost")).value = "";
  /** @type {HTMLTextAreaElement} */ (requireElementById("ac-produces")).value =
    "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("ac-experience")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (requireElementById("ac-messages")).value =
    "";
  requireElementById("action-class-form-title").textContent = t(
    "class_editor.new_action_type",
    "New action type",
  );
}

function submitActionClassForm() {
  var idVal = /** @type {HTMLInputElement} */ (
    requireElementById("ac-id")
  ).value.trim();
  if (!idVal) {
    showHudToast(
      t("class_editor.action_id_required", "Action type ID is required"),
      true,
    );
    return;
  }
  var labelVal = /** @type {HTMLInputElement} */ (
    requireElementById("ac-label")
  ).value.trim();
  var nameFiVal = /** @type {HTMLInputElement} */ (
    requireElementById("ac-name-fi")
  ).value.trim();
  var targetKindVal = /** @type {HTMLSelectElement} */ (
    requireElementById("ac-target-kind")
  ).value;
  var sourceItemsRaw = /** @type {HTMLInputElement} */ (
    requireElementById("ac-source-items")
  ).value;
  var logicSpecRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("ac-logic-spec")
  ).value.trim();
  var livingEffectRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("ac-living-effect")
  ).value.trim();
  var executionRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("ac-execution")
  ).value.trim();
  // Every remaining action field the editor exposes is edited as JSON, like
  // logicSpec and livingEffect above: same explicit-null rule, so clearing a
  // box actually removes the cost, the reward or the translations.
  var jsonFields = [
    { el: "ac-cost", key: "cost" },
    { el: "ac-produces", key: "produces" },
    { el: "ac-experience", key: "experience" },
    { el: "ac-messages", key: "messages" },
  ];
  /** @type {Record<string, *>} */
  var parsedJsonFields = {};
  for (var jf = 0; jf < jsonFields.length; jf++) {
    var raw = /** @type {HTMLTextAreaElement} */ (
      requireElementById(jsonFields[jf].el)
    ).value.trim();
    if (!raw) {
      parsedJsonFields[jsonFields[jf].key] = null;
      continue;
    }
    try {
      parsedJsonFields[jsonFields[jf].key] = JSON.parse(raw);
    } catch (e) {
      showHudToast(
        t("class_editor.invalid_field_json", "Invalid JSON in") +
          " " +
          jsonFields[jf].key,
        true,
      );
      return;
    }
  }
  var sourceItemIds = sourceItemsRaw
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  var logicSpec;
  if (logicSpecRaw) {
    try {
      logicSpec = JSON.parse(logicSpecRaw);
    } catch (e) {
      showHudToast(
        t("class_editor.invalid_logic_spec_json", "Invalid logic spec JSON"),
        true,
      );
      return;
    }
  }
  // Explicitly null rather than undefined when the box is empty: undefined
  // would be dropped by JSON.stringify and the server would keep the stored
  // effect, leaving a creator no way to take a spell's behavior back off.
  var livingEffect = null;
  if (livingEffectRaw) {
    try {
      livingEffect = JSON.parse(livingEffectRaw);
    } catch (e) {
      showHudToast(
        t(
          "class_editor.invalid_living_effect_json",
          "Invalid living effect JSON",
        ),
        true,
      );
      return;
    }
  }
  // Same explicit-null rule as livingEffect above: an emptied box must be able
  // to take an action's toasts and chat line back off.
  var execution = null;
  if (executionRaw) {
    try {
      execution = JSON.parse(executionRaw);
    } catch (e) {
      showHudToast(
        t("class_editor.invalid_execution_json", "Invalid execution JSON"),
        true,
      );
      return;
    }
  }
  var record = {
    id: idVal,
    fallbackLabel: labelVal || idVal,
    targetKind: targetKindVal,
    sourceItemIds: sourceItemIds,
    logicSpec: logicSpec,
    livingEffect: livingEffect,
    execution: execution,
    cost: parsedJsonFields.cost,
    produces: parsedJsonFields.produces,
    experience: parsedJsonFields.experience,
    messages: parsedJsonFields.messages,
    labels: buildLabelsPayload(nameFiVal),
  };
  var url = actionClassEditId
    ? "/virtual-world/action-classes/" + encodeURIComponent(actionClassEditId)
    : "/virtual-world/action-classes";
  var method = actionClassEditId ? "PUT" : "POST";
  fetchWithAuth(url, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(
          data.error
            ? translateServerMessage(String(data.error))
            : t("class_editor.save_failed", "Save failed"),
          true,
        );
        return;
      }
      showHudToast(t("class_editor.saved", "Saved!"), false);
      cancelActionClassEdit();
      renderActionClassList();
    })
    .catch(function () {
      showHudToast(t("class_editor.save_failed", "Save failed"), true);
    });
}

/** @param {string} id */
function deleteActionClassUI(id) {
  fetchWithAuth(
    "/virtual-world/action-classes/" + encodeURIComponent(String(id)),
    { method: "DELETE" },
  )
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(
          data.error
            ? translateServerMessage(String(data.error))
            : t("class_editor.delete_failed", "Delete failed"),
          true,
        );
        return;
      }
      showHudToast(
        t("class_editor.deleted_prefix", "Deleted") + " " + String(id),
        false,
      );
      if (actionClassEditId === String(id)) cancelActionClassEdit();
      renderActionClassList();
    })
    .catch(function () {
      showHudToast(t("class_editor.delete_failed", "Delete failed"), true);
    });
}

function showActionClassPanel() {
  if (inventoryPanelVisible) closeInventoryPanel();
  if (itemClassPanelVisible) closeItemClassPanel();
  if (livingClassPanelVisible) closeLivingClassPanel();
  if (worldClassPanelVisible) closeWorldClassPanel();
  if (tileClassPanelVisible) closeTileClassPanel();
  actionClassPanelVisible = true;
  requireElementById("hud-action-class-panel").style.display = "block";
  renderActionClassList();
}

function closeActionClassPanel() {
  actionClassPanelVisible = false;
  requireElementById("hud-action-class-panel").style.display = "none";
}

function toggleActionClassPanel() {
  if (actionClassPanelVisible) closeActionClassPanel();
  else showActionClassPanel();
}

// ── Living class panel ────────────────────────────────────────────────────

function renderLivingClassList() {
  var listDiv = requireElementById("living-class-list");
  fetchWithAuth("/virtual-world/living-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.living_classes) ? data.living_classes : [];
      classes = classes
        .slice()
        .sort(function (/** @type {any} */ a, /** @type {any} */ b) {
          return classDisplayLabel(a).localeCompare(classDisplayLabel(b));
        });
      if (!classes.length) {
        listDiv.innerHTML =
          '<div class="class-row"><em style="opacity:0.55">' +
          escHtml(
            t(
              "class_editor.no_custom_living_types",
              "No custom living types yet.",
            ),
          ) +
          "</em></div>";
        return;
      }
      var rows = "";
      for (var i = 0; i < classes.length; i++) {
        var lc = classes[i];
        var label = escHtml(classDisplayLabel(lc));
        var id = escHtml(String(lc.id || ""));
        rows +=
          '<div class="class-row">' +
          '<span class="class-row-id">' +
          id +
          "</span> " +
          '<span class="class-row-label">' +
          label +
          "</span>" +
          '<span class="class-row-btns">' +
          '<button data-living-class-id="' +
          id +
          '" onclick="editLivingClass(this.dataset.livingClassId)">' +
          escHtml(t("class_editor.edit_button", "Edit")) +
          "</button>" +
          '<button data-living-class-id="' +
          id +
          '" onclick="deleteLivingClassUI(this.dataset.livingClassId)">' +
          escHtml(t("class_editor.del_button", "Del")) +
          "</button>" +
          "</span></div>";
      }
      listDiv.innerHTML = rows;
    })
    .catch(function () {
      listDiv.innerHTML =
        '<div class="class-row" style="color:#f88">' +
        escHtml(t("class_editor.failed_to_load_list", "Failed to load.")) +
        "</div>";
    });
}

// ── Class color field ────────────────────────────────────────────────────
// A class's primary color, typed as hex or picked from the swatch. Blank
// means "automatic": the visual style then picks the color itself (a shade
// from its own palette for livings, the client's per-type default for items).
// Shared by the living ("lc") and item ("ic") editors, which have identical
// <prefix>-color / <prefix>-color-picker fields.

/**
 * @param {string} raw
 * @returns {string} "#rrggbb", or "" for blank/unparseable input
 */
function normalizeClassColorInput(raw) {
  var value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(value)) {
    return (
      "#" + value[0] + value[0] + value[1] + value[1] + value[2] + value[2]
    );
  }
  if (/^[0-9a-f]{6}$/.test(value)) return "#" + value;
  return "";
}

/**
 * @param {string} prefix editor field prefix, "lc" or "ic"
 * @param {string} color "#rrggbb" or "" for automatic
 */
function setClassColorField(prefix, color) {
  var normalized = normalizeClassColorInput(color);
  /** @type {HTMLInputElement} */ (
    requireElementById(prefix + "-color")
  ).value = normalized;
  syncClassColorPicker(prefix);
}

/**
 * The saved value, as the server wants it: "" for automatic.
 * @param {string} prefix
 * @returns {string}
 */
function readClassColorField(prefix) {
  return normalizeClassColorInput(
    /** @type {HTMLInputElement} */ (requireElementById(prefix + "-color"))
      .value,
  );
}

/**
 * Keeps the swatch in step with a hex typed into the text field.
 * @param {string} prefix
 */
function syncClassColorPicker(prefix) {
  var normalized = readClassColorField(prefix);
  /** @type {HTMLInputElement} */ (
    requireElementById(prefix + "-color-picker")
  ).value = normalized || "#a0522d";
}

/**
 * Writes the swatch's color into the text field (the saved value).
 * @param {string} prefix
 */
function syncClassColorFromPicker(prefix) {
  /** @type {HTMLInputElement} */ (
    requireElementById(prefix + "-color")
  ).value = /** @type {HTMLInputElement} */ (
    requireElementById(prefix + "-color-picker")
  ).value;
}

/**
 * Clears the color back to automatic.
 * @param {string} prefix
 */
function clearClassColor(prefix) {
  setClassColorField(prefix, "");
}

/**
 * Item classes store their color as an integer (0 = automatic); the shared
 * field speaks "#rrggbb"/"".
 * @param {number | undefined} color
 * @returns {string}
 */
function itemColorNumberToHex(color) {
  var value = Number(color);
  if (!Number.isFinite(value) || value <= 0) return "";
  return "#" + ("000000" + Math.floor(value).toString(16)).slice(-6);
}

/** @param {string} id */
function editLivingClass(id) {
  fetchWithAuth("/virtual-world/living-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.living_classes) ? data.living_classes : [];
      var lc = null;
      for (var i = 0; i < classes.length; i++) {
        if (String(classes[i].id) === String(id)) {
          lc = classes[i];
          break;
        }
      }
      if (!lc) {
        showHudToast(
          t("class_editor.living_not_found", "Living type not found"),
          true,
        );
        return;
      }
      livingClassEditId = String(id);
      var idEl = /** @type {HTMLInputElement} */ (requireElementById("lc-id"));
      idEl.value = String(lc.id || "");
      idEl.disabled = true;
      /** @type {HTMLInputElement} */ (requireElementById("lc-label")).value =
        String(lc.fallbackLabel || "");
      /** @type {HTMLInputElement} */ (requireElementById("lc-name-fi")).value =
        String((lc.labels && lc.labels.fi) || "");
      /** @type {HTMLSelectElement} */ (requireElementById("lc-kind")).value =
        String(lc.kind || "creature");
      /** @type {HTMLSelectElement} */ (requireElementById("lc-size")).value =
        String(lc.size || "medium");
      /** @type {HTMLSelectElement} */ (
        requireElementById("lc-visual-style")
      ).value = String(lc.visualStyle || "humanoid");
      setClassColorField("lc", String(lc.color || ""));
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("lc-slot-definitions")
      ).value =
        Array.isArray(lc.slotDefinitions) && lc.slotDefinitions.length
          ? JSON.stringify(lc.slotDefinitions, null, 2)
          : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("lc-value-template")
      ).value =
        lc.valueTemplate && Object.keys(lc.valueTemplate).length
          ? JSON.stringify(lc.valueTemplate, null, 2)
          : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("lc-value-schema")
      ).value =
        lc.valueSchema && Object.keys(lc.valueSchema).length
          ? JSON.stringify(lc.valueSchema, null, 2)
          : "";
      /** @type {HTMLInputElement} */ (
        requireElementById("lc-aggressive")
      ).checked = !!lc.aggressive;
      /** @type {HTMLInputElement} */ (
        requireElementById("lc-default-items")
      ).value = Array.isArray(lc.defaultItems)
        ? lc.defaultItems.join(", ")
        : "";
      /** @type {HTMLInputElement} */ (
        requireElementById("lc-death-class")
      ).value = String(lc.deathClassId || "");
      /** @type {HTMLInputElement} */ (
        requireElementById("lc-corpse-item")
      ).value = String(lc.corpseItemId || "");
      /** @type {HTMLInputElement} */ (
        requireElementById("lc-revive-class")
      ).value = String(lc.reviveClassId || "");
      /** @type {HTMLInputElement} */ (
        requireElementById("lc-combatant")
      ).checked = lc.combatant !== false;
      requireElementById("living-class-form-title").textContent =
        t("class_editor.edit_prefix", "Edit:") + " " + String(id);
    })
    .catch(function () {
      showHudToast(
        t(
          "class_editor.failed_to_load_living_type",
          "Failed to load living type",
        ),
        true,
      );
    });
}

function cancelLivingClassEdit() {
  livingClassEditId = null;
  var idEl = /** @type {HTMLInputElement} */ (requireElementById("lc-id"));
  idEl.disabled = false;
  idEl.value = "";
  /** @type {HTMLInputElement} */ (requireElementById("lc-label")).value = "";
  /** @type {HTMLInputElement} */ (requireElementById("lc-name-fi")).value = "";
  /** @type {HTMLSelectElement} */ (requireElementById("lc-kind")).value =
    "creature";
  /** @type {HTMLSelectElement} */ (requireElementById("lc-size")).value =
    "medium";
  /** @type {HTMLSelectElement} */ (
    requireElementById("lc-visual-style")
  ).value = "humanoid";
  setClassColorField("lc", "");
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-slot-definitions")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-value-template")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-value-schema")
  ).value = "";
  /** @type {HTMLInputElement} */ (
    requireElementById("lc-aggressive")
  ).checked = false;
  /** @type {HTMLInputElement} */ (
    requireElementById("lc-default-items")
  ).value = "";
  /** @type {HTMLInputElement} */ (requireElementById("lc-death-class")).value =
    "";
  /** @type {HTMLInputElement} */ (requireElementById("lc-corpse-item")).value =
    "";
  /** @type {HTMLInputElement} */ (
    requireElementById("lc-revive-class")
  ).value = "";
  /** @type {HTMLInputElement} */ (requireElementById("lc-combatant")).checked =
    true;
  /** @type {HTMLTextAreaElement} */ (requireElementById("lc-behavior")).value =
    "";
  requireElementById("living-class-form-title").textContent = t(
    "class_editor.new_living_type",
    "New living type",
  );
}

function submitLivingClassForm() {
  var idVal = /** @type {HTMLInputElement} */ (
    requireElementById("lc-id")
  ).value.trim();
  if (!idVal) {
    showHudToast(
      t("class_editor.living_id_required", "Living type ID is required"),
      true,
    );
    return;
  }
  var labelVal = /** @type {HTMLInputElement} */ (
    requireElementById("lc-label")
  ).value.trim();
  var nameFiVal = /** @type {HTMLInputElement} */ (
    requireElementById("lc-name-fi")
  ).value.trim();
  var kindVal = /** @type {HTMLSelectElement} */ (requireElementById("lc-kind"))
    .value;
  var sizeVal = /** @type {HTMLSelectElement} */ (requireElementById("lc-size"))
    .value;
  var visualStyleVal = /** @type {HTMLSelectElement} */ (
    requireElementById("lc-visual-style")
  ).value;
  var colorVal = readClassColorField("lc");
  var slotDefinitionsRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-slot-definitions")
  ).value.trim();
  var valueTemplateRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-value-template")
  ).value.trim();
  var valueSchemaRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-value-schema")
  ).value.trim();
  var slotDefinitions = [];
  if (slotDefinitionsRaw) {
    try {
      slotDefinitions = JSON.parse(slotDefinitionsRaw);
    } catch (e) {
      showHudToast(
        t(
          "class_editor.invalid_slot_definitions_json",
          "Invalid slot definitions JSON",
        ),
        true,
      );
      return;
    }
    if (!Array.isArray(slotDefinitions)) {
      showHudToast(
        t(
          "class_editor.slot_definitions_must_be_array",
          "Slot definitions must be a JSON array",
        ),
        true,
      );
      return;
    }
  }
  var valueTemplate = {};
  if (valueTemplateRaw) {
    try {
      valueTemplate = JSON.parse(valueTemplateRaw);
    } catch (e) {
      showHudToast(
        t(
          "class_editor.invalid_value_template_json",
          "Invalid value template JSON",
        ),
        true,
      );
      return;
    }
  }
  var valueSchema;
  if (valueSchemaRaw) {
    try {
      valueSchema = JSON.parse(valueSchemaRaw);
    } catch (e) {
      showHudToast(
        t(
          "class_editor.invalid_value_schema_json",
          "Invalid value schema JSON",
        ),
        true,
      );
      return;
    }
  }
  var aggressiveVal = /** @type {HTMLInputElement} */ (
    requireElementById("lc-aggressive")
  ).checked;
  var defaultItems = /** @type {HTMLInputElement} */ (
    requireElementById("lc-default-items")
  ).value
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s.length > 0;
    });
  var deathClassId = /** @type {HTMLInputElement} */ (
    requireElementById("lc-death-class")
  ).value.trim();
  var corpseItemId = /** @type {HTMLInputElement} */ (
    requireElementById("lc-corpse-item")
  ).value.trim();
  var reviveClassId = /** @type {HTMLInputElement} */ (
    requireElementById("lc-revive-class")
  ).value.trim();
  var combatantVal = /** @type {HTMLInputElement} */ (
    requireElementById("lc-combatant")
  ).checked;
  var behaviorRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-behavior")
  ).value.trim();
  var behavior = {};
  if (behaviorRaw) {
    try {
      behavior = JSON.parse(behaviorRaw);
    } catch (e) {
      showHudToast(
        t("class_editor.invalid_behavior_json", "Invalid behaviour JSON"),
        true,
      );
      return;
    }
  }
  var record = {
    id: idVal,
    kind: kindVal,
    fallbackLabel: labelVal || idVal,
    deathClassId: deathClassId,
    corpseItemId: corpseItemId,
    reviveClassId: reviveClassId,
    combatant: combatantVal,
    behavior: behavior,
    slotDefinitions: slotDefinitions,
    valueTemplate: valueTemplate,
    valueSchema: valueSchema,
    aggressive: aggressiveVal,
    size: sizeVal,
    visualStyle: visualStyleVal,
    color: colorVal,
    defaultItems: defaultItems,
    labels: buildLabelsPayload(nameFiVal),
  };
  var url = livingClassEditId
    ? "/virtual-world/living-classes/" + encodeURIComponent(livingClassEditId)
    : "/virtual-world/living-classes";
  var method = livingClassEditId ? "PUT" : "POST";
  fetchWithAuth(url, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(
          data.error
            ? translateServerMessage(String(data.error))
            : t("class_editor.save_failed", "Save failed"),
          true,
        );
        return;
      }
      showHudToast(t("class_editor.saved", "Saved!"), false);
      cancelLivingClassEdit();
      renderLivingClassList();
    })
    .catch(function () {
      showHudToast(t("class_editor.save_failed", "Save failed"), true);
    });
}

/** @param {string} id */
function deleteLivingClassUI(id) {
  fetchWithAuth(
    "/virtual-world/living-classes/" + encodeURIComponent(String(id)),
    { method: "DELETE" },
  )
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(
          data.error
            ? translateServerMessage(String(data.error))
            : t("class_editor.delete_failed", "Delete failed"),
          true,
        );
        return;
      }
      showHudToast(
        t("class_editor.deleted_prefix", "Deleted") + " " + String(id),
        false,
      );
      if (livingClassEditId === String(id)) cancelLivingClassEdit();
      renderLivingClassList();
    })
    .catch(function () {
      showHudToast(t("class_editor.delete_failed", "Delete failed"), true);
    });
}

function showLivingClassPanel() {
  if (inventoryPanelVisible) closeInventoryPanel();
  if (itemClassPanelVisible) closeItemClassPanel();
  if (actionClassPanelVisible) closeActionClassPanel();
  if (worldClassPanelVisible) closeWorldClassPanel();
  if (tileClassPanelVisible) closeTileClassPanel();
  livingClassPanelVisible = true;
  requireElementById("hud-living-class-panel").style.display = "block";
  renderLivingClassList();
}

function closeLivingClassPanel() {
  livingClassPanelVisible = false;
  requireElementById("hud-living-class-panel").style.display = "none";
}

function toggleLivingClassPanel() {
  if (livingClassPanelVisible) closeLivingClassPanel();
  else showLivingClassPanel();
}

// ── World class panel ────────────────────────────────────────────────────

var BUILTIN_WORLD_CLASS_IDS = [
  "forest",
  "island",
  "cave",
  "building",
  "village",
];

/** @param {string} id
 * @returns {boolean} */
function isBuiltinWorldClassId(id) {
  return BUILTIN_WORLD_CLASS_IDS.indexOf(String(id)) !== -1;
}

function renderWorldClassList() {
  var listDiv = requireElementById("world-class-list");
  fetchWithAuth("/virtual-world/world-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.world_classes) ? data.world_classes : [];
      classes = classes
        .slice()
        .sort(function (/** @type {any} */ a, /** @type {any} */ b) {
          return classDisplayLabel(a).localeCompare(classDisplayLabel(b));
        });
      if (!classes.length) {
        listDiv.innerHTML =
          '<div class="class-row"><em style="opacity:0.55">' +
          escHtml(t("class_editor.no_world_types", "No world types yet.")) +
          "</em></div>";
        return;
      }
      var rows = "";
      for (var i = 0; i < classes.length; i++) {
        var wc = classes[i];
        var id = escHtml(String(wc.id || ""));
        var label = escHtml(classDisplayLabel(wc));
        var delBtn = isBuiltinWorldClassId(String(wc.id || ""))
          ? ""
          : '<button data-world-class-id="' +
            id +
            '" onclick="deleteWorldClassUI(this.dataset.worldClassId)">' +
            escHtml(t("class_editor.del_button", "Del")) +
            "</button>";
        rows +=
          '<div class="class-row">' +
          '<span class="class-row-id">' +
          id +
          "</span> " +
          '<span class="class-row-label">' +
          label +
          "</span>" +
          '<span class="class-row-btns">' +
          '<button data-world-class-id="' +
          id +
          '" onclick="editWorldClass(this.dataset.worldClassId)">' +
          escHtml(t("class_editor.edit_button", "Edit")) +
          "</button>" +
          delBtn +
          "</span></div>";
      }
      listDiv.innerHTML = rows;
    })
    .catch(function () {
      listDiv.innerHTML =
        '<div class="class-row" style="color:#f88">' +
        escHtml(t("class_editor.failed_to_load_list", "Failed to load.")) +
        "</div>";
    });
}

/** @param {string} id */
function editWorldClass(id) {
  fetchWithAuth("/virtual-world/world-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.world_classes) ? data.world_classes : [];
      var wc = null;
      for (var i = 0; i < classes.length; i++) {
        if (String(classes[i].id) === String(id)) {
          wc = classes[i];
          break;
        }
      }
      if (!wc) {
        showHudToast(
          t("class_editor.world_not_found", "World type not found"),
          true,
        );
        return;
      }
      worldClassEditId = String(id);
      var idEl = /** @type {HTMLInputElement} */ (requireElementById("wc-id"));
      idEl.value = String(wc.id || "");
      idEl.disabled = true;
      /** @type {HTMLInputElement} */ (requireElementById("wc-label")).value =
        String(wc.fallbackLabel || "");
      /** @type {HTMLInputElement} */ (requireElementById("wc-name-fi")).value =
        String((wc.labels && wc.labels.fi) || "");
      /** @type {HTMLSelectElement} */ (
        requireElementById("wc-base-type")
      ).value = String(wc.baseType || "forest");
      /** @type {HTMLInputElement} */ (requireElementById("wc-rows")).value =
        String(wc.rows || 100);
      /** @type {HTMLInputElement} */ (requireElementById("wc-cols")).value =
        String(wc.cols || 100);
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("wc-item-spawns")
      ).value =
        Array.isArray(wc.itemSpawns) && wc.itemSpawns.length
          ? JSON.stringify(wc.itemSpawns, null, 2)
          : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("wc-npc-spawns")
      ).value =
        Array.isArray(wc.npcSpawns) && wc.npcSpawns.length
          ? JSON.stringify(wc.npcSpawns, null, 2)
          : "";
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("wc-generation")
      ).value = wc.generation ? JSON.stringify(wc.generation, null, 2) : "";
      worldClassPlacements = Array.isArray(wc.placements)
        ? JSON.parse(JSON.stringify(wc.placements))
        : [];
      renderWorldClassPlacements();
      showPlacementErrors([]);
      /** @type {HTMLInputElement} */ (
        requireElementById("wc-reconcile-world")
      ).value = "";
      requireElementById("world-class-form-title").textContent =
        t("class_editor.edit_prefix", "Edit:") + " " + String(id);
    })
    .catch(function () {
      showHudToast(
        t(
          "class_editor.failed_to_load_world_type",
          "Failed to load world type",
        ),
        true,
      );
    });
}

// ── World-class placements ────────────────────────────────────────────────
//
// Held as state and re-rendered rather than parsed back out of the DOM: a
// placement is a nested shape (position, reservations, destination), and
// round-tripping that through form fields on every keystroke is where
// coordinate mistakes come from. Phase 1 shipped a JSON textarea; this is its
// replacement, per TODO-placements.md.

/** @type {any[]} */
var worldClassPlacements = [];

var PLACEMENT_KIND_OPTIONS = [
  "item",
  "fixture",
  "npc",
  "terrain",
  "structure",
  "portal",
];

var RESERVATION_RULE_OPTIONS = [
  "block_plant",
  "block_build",
  "block_terrain_feature",
  "clear_terrain",
  "spawn_area",
  "protect_landmark",
  "block_random_spawn",
];

/**
 * Which registry a kind's classId is chosen from — mirrors the server's
 * validation in world-placements.ts, so the picker cannot offer something the
 * save will reject.
 * @param {string} kind
 * @returns {string[]}
 */
function placementClassOptions(kind) {
  if (kind === "npc") {
    var livingClasses =
      LIVING_REGISTRY && LIVING_REGISTRY.classes ? LIVING_REGISTRY.classes : {};
    return Object.keys(livingClasses).sort();
  }
  if (kind === "terrain" || kind === "structure") {
    return Object.keys(WORLD_TILE_DEFS || {}).sort();
  }
  var items = ITEM_REGISTRY && ITEM_REGISTRY.items ? ITEM_REGISTRY.items : {};
  return Object.keys(items).sort();
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeAttrValue(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string[]} options
 * @param {any} selected
 * @returns {string}
 */
function placementOptionsHtml(options, selected) {
  var html = "";
  for (var i = 0; i < options.length; i++) {
    var value = String(options[i]);
    html +=
      '<option value="' +
      escapeAttrValue(value) +
      '"' +
      (value === String(selected == null ? "" : selected) ? " selected" : "") +
      ">" +
      escapeAttrValue(value) +
      "</option>";
  }
  return html;
}

/**
 * @param {any} placement
 * @param {number} index
 * @returns {string}
 */
function renderPlacementRow(placement, index) {
  var kind = String(placement.kind || "fixture");
  var position = placement.position || {};
  var reservation =
    Array.isArray(placement.reservations) && placement.reservations.length
      ? placement.reservations[0]
      : null;
  var destination =
    placement.state && placement.state.destination
      ? placement.state.destination
      : null;

  var html =
    '<div class="wc-placement"><div class="wc-placement-main">' +
    '<input class="wc-p-id" value="' +
    escapeAttrValue(placement.id) +
    '" placeholder="id" oninput="updatePlacementField(' +
    index +
    ",'id',this.value)\">" +
    '<select onchange="updatePlacementKind(' +
    index +
    ',this.value)">' +
    placementOptionsHtml(PLACEMENT_KIND_OPTIONS, kind) +
    "</select>" +
    '<select onchange="updatePlacementField(' +
    index +
    ",'classId',this.value)\">" +
    placementOptionsHtml(placementClassOptions(kind), placement.classId) +
    "</select>" +
    '<input class="wc-p-num" type="number" title="row" value="' +
    escapeAttrValue(position.row) +
    '" oninput="updatePlacementPosition(' +
    index +
    ",'row',this.value)\">" +
    '<input class="wc-p-num" type="number" title="col" value="' +
    escapeAttrValue(position.col) +
    '" oninput="updatePlacementPosition(' +
    index +
    ",'col',this.value)\">" +
    '<button type="button" title="duplicate" onclick="duplicatePlacement(' +
    index +
    ')">+</button>' +
    '<button type="button" title="delete" onclick="removePlacement(' +
    index +
    ')">x</button>' +
    "</div>";

  // One reservation per placement in the UI, which covers every authored
  // landmark so far. The stored schema allows several; extras are preserved
  // untouched and remain editable through MCP.
  html +=
    '<div class="wc-placement-sub"><label><input type="checkbox"' +
    (reservation ? " checked" : "") +
    ' onchange="togglePlacementReservation(' +
    index +
    ',this.checked)"> <span data-i18n-key="class_editor.reservation">reserve area</span></label>';
  if (reservation) {
    html +=
      '<input class="wc-p-num" type="number" title="radius" value="' +
      escapeAttrValue(reservation.radius == null ? 3 : reservation.radius) +
      '" oninput="updateReservationRadius(' +
      index +
      ',this.value)">';
    for (var r = 0; r < RESERVATION_RULE_OPTIONS.length; r++) {
      var rule = RESERVATION_RULE_OPTIONS[r];
      var on =
        Array.isArray(reservation.rules) &&
        reservation.rules.indexOf(rule) !== -1;
      html +=
        '<label class="wc-rule"><input type="checkbox"' +
        (on ? " checked" : "") +
        ' onchange="toggleReservationRule(' +
        index +
        ",'" +
        rule +
        "',this.checked)\"> " +
        rule +
        "</label>";
    }
  }
  html += "</div>";

  // Who stands here, as opposed to what class it is. Only offered for NPCs:
  // they are the placements a player can be told about by name, and nothing
  // reads an authored identity off the other kinds yet.
  if (kind === "npc") {
    var identity = placement.identity || {};
    var identityLabels = identity.labels || {};
    var identityDescriptions = identity.descriptions || {};
    html +=
      '<div class="wc-placement-sub">' +
      '<input placeholder="name" value="' +
      escapeAttrValue(identity.name) +
      '" oninput="updatePlacementIdentity(' +
      index +
      ",'name',this.value)\">" +
      '<input placeholder="name (fi)" value="' +
      escapeAttrValue(identityLabels.fi) +
      '" oninput="updatePlacementIdentity(' +
      index +
      ",'labels.fi',this.value)\">" +
      "</div>" +
      '<div class="wc-placement-sub">' +
      '<input placeholder="description" value="' +
      escapeAttrValue(identity.description) +
      '" oninput="updatePlacementIdentity(' +
      index +
      ",'description',this.value)\">" +
      '<input placeholder="description (fi)" value="' +
      escapeAttrValue(identityDescriptions.fi) +
      '" oninput="updatePlacementIdentity(' +
      index +
      ",'descriptions.fi',this.value)\">" +
      "</div>";
  }

  if (kind === "portal") {
    var mode = destination ? String(destination.mode || "") : "";
    html +=
      '<div class="wc-placement-sub"><select onchange="updateDestinationMode(' +
      index +
      ',this.value)">' +
      placementOptionsHtml(
        ["", "ensure_world_class", "existing_world", "source_world"],
        mode,
      ) +
      "</select>";
    if (mode === "ensure_world_class") {
      var classIds = (WORLD_CLASS_REGISTRY || []).map(function (wc) {
        return String(wc.id);
      });
      html +=
        '<select onchange="updateDestinationField(' +
        index +
        ",'worldClassId',this.value)\">" +
        placementOptionsHtml(classIds, destination.worldClassId) +
        "</select>";
    } else if (mode === "existing_world") {
      html +=
        '<input placeholder="world id" value="' +
        escapeAttrValue(destination.worldId) +
        '" oninput="updateDestinationField(' +
        index +
        ",'worldId',this.value)\">";
    }
    if (mode) {
      html +=
        '<input placeholder="entry placement id" value="' +
        escapeAttrValue(destination.entryPlacementId) +
        '" oninput="updateDestinationField(' +
        index +
        ",'entryPlacementId',this.value)\">";
    }
    html += "</div>";
  }

  return html + "</div>";
}

function renderWorldClassPlacements() {
  var html = "";
  for (var i = 0; i < worldClassPlacements.length; i++) {
    html += renderPlacementRow(worldClassPlacements[i], i);
  }
  requireElementById("wc-placement-list").innerHTML = html;
  renderWorldClassPreview();
}

/**
 * @param {number} index
 * @param {string} field
 * @param {string} value
 */
function updatePlacementField(index, field, value) {
  if (!worldClassPlacements[index]) return;
  worldClassPlacements[index][field] = value;
  renderWorldClassPreview();
}

/**
 * Writes one authored-identity field, where `field` is either a plain key
 * ("name") or a locale entry ("labels.fi"). Empty input removes the key rather
 * than storing "", so clearing a field leaves no identity behind at all and
 * the NPC falls back to its generated name.
 * @param {number} index
 * @param {string} field
 * @param {string} value
 */
function updatePlacementIdentity(index, field, value) {
  var placement = worldClassPlacements[index];
  if (!placement) return;
  if (!placement.identity) placement.identity = {};
  var identity = placement.identity;
  var text = String(value || "").trim();
  var parts = field.split(".");
  if (parts.length === 2) {
    var map = identity[parts[0]] || {};
    if (text) map[parts[1]] = text;
    else delete map[parts[1]];
    if (Object.keys(map).length) identity[parts[0]] = map;
    else delete identity[parts[0]];
  } else if (text) {
    identity[field] = text;
  } else {
    delete identity[field];
  }
  if (!Object.keys(identity).length) delete placement.identity;
  renderWorldClassPreview();
}

/**
 * @param {number} index
 * @param {string} kind
 */
function updatePlacementKind(index, kind) {
  var placement = worldClassPlacements[index];
  if (!placement) return;
  placement.kind = kind;
  // The class list is kind-specific, so an id left over from the previous kind
  // would fail validation on save. Snap to a valid option instead.
  var options = placementClassOptions(kind);
  if (options.indexOf(String(placement.classId)) === -1) {
    placement.classId = options.length ? options[0] : "";
  }
  renderWorldClassPlacements();
}

/**
 * @param {number} index
 * @param {string} axis
 * @param {string} value
 */
function updatePlacementPosition(index, axis, value) {
  var placement = worldClassPlacements[index];
  if (!placement) return;
  if (!placement.position) placement.position = { strategy: "exact" };
  placement.position.strategy = "exact";
  placement.position[axis] = Number(value);
  renderWorldClassPreview();
}

/**
 * @param {number} index
 * @param {boolean} on
 */
function togglePlacementReservation(index, on) {
  var placement = worldClassPlacements[index];
  if (!placement) return;
  placement.reservations = on
    ? [{ kind: "circle", radius: 3, rules: ["block_plant", "block_build"] }]
    : [];
  renderWorldClassPlacements();
}

/**
 * @param {number} index
 * @param {string} value
 */
function updateReservationRadius(index, value) {
  var placement = worldClassPlacements[index];
  if (!placement || !placement.reservations || !placement.reservations[0]) {
    return;
  }
  placement.reservations[0].radius = Number(value);
  renderWorldClassPreview();
}

/**
 * @param {number} index
 * @param {string} rule
 * @param {boolean} on
 */
function toggleReservationRule(index, rule, on) {
  var placement = worldClassPlacements[index];
  if (!placement || !placement.reservations || !placement.reservations[0]) {
    return;
  }
  var rules = placement.reservations[0].rules || [];
  var at = rules.indexOf(rule);
  if (on && at === -1) rules.push(rule);
  if (!on && at !== -1) rules.splice(at, 1);
  placement.reservations[0].rules = rules;
  renderWorldClassPreview();
}

/**
 * @param {number} index
 * @param {string} mode
 */
function updateDestinationMode(index, mode) {
  var placement = worldClassPlacements[index];
  if (!placement) return;
  if (!placement.state) placement.state = {};
  if (!mode) {
    delete placement.state.destination;
  } else {
    placement.state.destination = Object.assign(
      {},
      placement.state.destination || {},
      { mode: mode },
    );
  }
  renderWorldClassPlacements();
}

/**
 * @param {number} index
 * @param {string} field
 * @param {string} value
 */
function updateDestinationField(index, field, value) {
  var placement = worldClassPlacements[index];
  if (!placement || !placement.state || !placement.state.destination) return;
  placement.state.destination[field] = value;
}

/** @param {number} index */
function duplicatePlacement(index) {
  var placement = worldClassPlacements[index];
  if (!placement) return;
  var copy = JSON.parse(JSON.stringify(placement));
  copy.id = String(copy.id || "placement") + "-copy";
  worldClassPlacements.splice(index + 1, 0, copy);
  renderWorldClassPlacements();
}

/** @param {number} index */
function removePlacement(index) {
  worldClassPlacements.splice(index, 1);
  renderWorldClassPlacements();
}

function addWorldClassPlacement() {
  var options = placementClassOptions("fixture");
  worldClassPlacements.push({
    id: "placement-" + (worldClassPlacements.length + 1),
    kind: "fixture",
    classId: options.length ? options[0] : "",
    position: { strategy: "exact", row: 1, col: 1 },
    state: {},
    reservations: [],
  });
  renderWorldClassPlacements();
}

// Coordinates are the easy thing to get wrong and the costly thing to get
// wrong, so this exists to make them visible before saving — not to look like
// the game.
function renderWorldClassPreview() {
  var canvas = /** @type {HTMLCanvasElement} */ (
    requireElementById("wc-preview")
  );
  var ctx = canvas.getContext("2d");
  if (!ctx) return;
  var rows =
    Number(
      /** @type {HTMLInputElement} */ (requireElementById("wc-rows")).value,
    ) || 1;
  var cols =
    Number(
      /** @type {HTMLInputElement} */ (requireElementById("wc-cols")).value,
    ) || 1;
  var scale = Math.min(canvas.width / cols, canvas.height / rows);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1d2b1d";
  ctx.fillRect(0, 0, cols * scale, rows * scale);

  var outOfBounds = false;
  for (var i = 0; i < worldClassPlacements.length; i++) {
    var placement = worldClassPlacements[i];
    var position = placement.position || {};
    var row = Number(position.row);
    var col = Number(position.col);
    if (!isFinite(row) || !isFinite(col)) continue;
    if (row < 0 || row >= rows || col < 0 || col >= cols) outOfBounds = true;
    var reservation =
      Array.isArray(placement.reservations) && placement.reservations.length
        ? placement.reservations[0]
        : null;
    if (reservation && isFinite(Number(reservation.radius))) {
      ctx.fillStyle = "rgba(120, 200, 120, 0.25)";
      ctx.beginPath();
      ctx.arc(
        (col + 0.5) * scale,
        (row + 0.5) * scale,
        (Number(reservation.radius) + 0.5) * scale,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.fillStyle = placement.kind === "portal" ? "#6fa8ff" : "#ffd166";
    ctx.fillRect(
      col * scale,
      row * scale,
      Math.max(scale, 2),
      Math.max(scale, 2),
    );
  }

  // An off-map placement is the mistake most worth catching before save.
  if (outOfBounds) {
    ctx.strokeStyle = "#ff6b6b";
    ctx.strokeRect(1, 1, cols * scale - 2, rows * scale - 2);
  }
}

/** @param {string[]} errors */
function showPlacementErrors(errors) {
  requireElementById("wc-placement-errors").textContent =
    !errors || errors.length === 0 ? "" : errors.join("\n");
}

function reconcileWorldUI() {
  var worldIdVal = /** @type {HTMLInputElement} */ (
    requireElementById("wc-reconcile-world")
  ).value.trim();
  if (!worldIdVal) {
    showHudToast(
      t("class_editor.world_id_required", "World type ID is required"),
      true,
    );
    return;
  }
  fetchWithAuth("/virtual-world/reconcile-world", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ world_id: worldIdVal }),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(
          data.error
            ? translateServerMessage(String(data.error))
            : t("class_editor.reconcile_failed", "Reconcile failed"),
          true,
        );
        return;
      }
      var removed = Array.isArray(data.removed) ? data.removed.length : 0;
      var kept = Array.isArray(data.kept) ? data.kept.length : 0;
      showHudToast(
        t("class_editor.reconciled", "Reconciled") +
          ": " +
          kept +
          " kept, " +
          removed +
          " removed",
        false,
      );
      showPlacementErrors(data.conflicts || []);
    })
    .catch(function () {
      showHudToast(
        t("class_editor.reconcile_failed", "Reconcile failed"),
        true,
      );
    });
}

function cancelWorldClassEdit() {
  worldClassEditId = null;
  var idEl = /** @type {HTMLInputElement} */ (requireElementById("wc-id"));
  idEl.disabled = false;
  idEl.value = "";
  /** @type {HTMLInputElement} */ (requireElementById("wc-label")).value = "";
  /** @type {HTMLInputElement} */ (requireElementById("wc-name-fi")).value = "";
  /** @type {HTMLSelectElement} */ (requireElementById("wc-base-type")).value =
    "forest";
  /** @type {HTMLInputElement} */ (requireElementById("wc-rows")).value = "100";
  /** @type {HTMLInputElement} */ (requireElementById("wc-cols")).value = "100";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("wc-item-spawns")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("wc-npc-spawns")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("wc-generation")
  ).value = "";
  worldClassPlacements = [];
  renderWorldClassPlacements();
  showPlacementErrors([]);
  /** @type {HTMLInputElement} */ (
    requireElementById("wc-reconcile-world")
  ).value = "";
  requireElementById("world-class-form-title").textContent = t(
    "class_editor.new_world_type",
    "New world type",
  );
}

function submitWorldClassForm() {
  var idVal = /** @type {HTMLInputElement} */ (
    requireElementById("wc-id")
  ).value.trim();
  if (!idVal) {
    showHudToast(
      t("class_editor.world_id_required", "World type ID is required"),
      true,
    );
    return;
  }
  var labelVal = /** @type {HTMLInputElement} */ (
    requireElementById("wc-label")
  ).value.trim();
  var nameFiVal = /** @type {HTMLInputElement} */ (
    requireElementById("wc-name-fi")
  ).value.trim();
  var baseTypeVal = /** @type {HTMLSelectElement} */ (
    requireElementById("wc-base-type")
  ).value;
  var rowsVal = Number(
    /** @type {HTMLInputElement} */ (requireElementById("wc-rows")).value,
  );
  var colsVal = Number(
    /** @type {HTMLInputElement} */ (requireElementById("wc-cols")).value,
  );
  var itemSpawnsRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("wc-item-spawns")
  ).value.trim();
  var npcSpawnsRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("wc-npc-spawns")
  ).value.trim();
  var generationRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("wc-generation")
  ).value.trim();
  // Null rather than undefined for a blank box: undefined is dropped by
  // JSON.stringify and the server would keep the stored spec, leaving no way
  // to hand a class back to its base type's preset.
  var generation = null;
  if (generationRaw) {
    try {
      generation = JSON.parse(generationRaw);
    } catch (e) {
      showHudToast(
        t("class_editor.invalid_generation_json", "Invalid generation JSON"),
        true,
      );
      return;
    }
  }
  var itemSpawns = [];
  if (itemSpawnsRaw) {
    try {
      itemSpawns = JSON.parse(itemSpawnsRaw);
    } catch (e) {
      showHudToast(
        t("class_editor.invalid_item_spawns_json", "Invalid item spawns JSON"),
        true,
      );
      return;
    }
    if (!Array.isArray(itemSpawns)) {
      showHudToast(
        t("class_editor.invalid_item_spawns_json", "Invalid item spawns JSON"),
        true,
      );
      return;
    }
  }
  var npcSpawns = [];
  if (npcSpawnsRaw) {
    try {
      npcSpawns = JSON.parse(npcSpawnsRaw);
    } catch (e) {
      showHudToast(
        t("class_editor.invalid_npc_spawns_json", "Invalid NPC spawns JSON"),
        true,
      );
      return;
    }
    if (!Array.isArray(npcSpawns)) {
      showHudToast(
        t("class_editor.invalid_npc_spawns_json", "Invalid NPC spawns JSON"),
        true,
      );
      return;
    }
  }
  var record = {
    id: idVal,
    baseType: baseTypeVal,
    rows: rowsVal,
    cols: colsVal,
    fallbackLabel: labelVal || idVal,
    itemSpawns: itemSpawns,
    npcSpawns: npcSpawns,
    generation: generation,
    placements: worldClassPlacements,
    labels: buildLabelsPayload(nameFiVal),
  };
  var url = worldClassEditId
    ? "/virtual-world/world-classes/" + encodeURIComponent(worldClassEditId)
    : "/virtual-world/world-classes";
  var method = worldClassEditId ? "PUT" : "POST";
  fetchWithAuth(url, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        // Placement problems come back as a list of specific messages
        // (bad coordinate, unknown class, duplicate id). Show the first one
        // instead of the generic "invalid placements" — a coordinate mistake
        // is only fixable if the creator is told which placement it is in.
        var placementErrors = Array.isArray(data.placement_errors)
          ? data.placement_errors
          : [];
        if (placementErrors.length > 0) {
          showPlacementErrors(placementErrors);
          showHudToast(
            placementErrors.length > 1
              ? String(placementErrors[0]) +
                  " (+" +
                  String(placementErrors.length - 1) +
                  ")"
              : String(placementErrors[0]),
            true,
          );
          return;
        }
        showHudToast(
          data.error
            ? translateServerMessage(String(data.error))
            : t("class_editor.save_failed", "Save failed"),
          true,
        );
        return;
      }
      showPlacementErrors([]);
      showHudToast(t("class_editor.saved", "Saved!"), false);
      cancelWorldClassEdit();
      renderWorldClassList();
    })
    .catch(function () {
      showHudToast(t("class_editor.save_failed", "Save failed"), true);
    });
}

/** @param {string} id */
function deleteWorldClassUI(id) {
  fetchWithAuth(
    "/virtual-world/world-classes/" + encodeURIComponent(String(id)),
    { method: "DELETE" },
  )
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(
          data.error
            ? translateServerMessage(String(data.error))
            : t("class_editor.delete_failed", "Delete failed"),
          true,
        );
        return;
      }
      showHudToast(
        t("class_editor.deleted_prefix", "Deleted") + " " + String(id),
        false,
      );
      if (worldClassEditId === String(id)) cancelWorldClassEdit();
      renderWorldClassList();
    })
    .catch(function () {
      showHudToast(t("class_editor.delete_failed", "Delete failed"), true);
    });
}

function showWorldClassPanel() {
  if (inventoryPanelVisible) closeInventoryPanel();
  if (itemClassPanelVisible) closeItemClassPanel();
  if (actionClassPanelVisible) closeActionClassPanel();
  if (livingClassPanelVisible) closeLivingClassPanel();
  if (tileClassPanelVisible) closeTileClassPanel();
  worldClassPanelVisible = true;
  requireElementById("hud-world-class-panel").style.display = "block";
  renderWorldClassList();
}

function closeWorldClassPanel() {
  worldClassPanelVisible = false;
  requireElementById("hud-world-class-panel").style.display = "none";
}

function toggleWorldClassPanel() {
  if (worldClassPanelVisible) closeWorldClassPanel();
  else showWorldClassPanel();
}

// ── Tile class panel ─────────────────────────────────────────────────────
// The vocabulary worlds are made of. A tile's map value is a runtime encoding
// (maps are regenerated from a seed and world mods store the tile id), so the
// field is only here to be kept unique — leaving it blank takes the next free
// one.

/** @type {string | null} */
var tileClassEditId = null;

function renderTileClassList() {
  var listDiv = requireElementById("tile-class-list");
  fetchWithAuth("/virtual-world/tile-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.tile_classes) ? data.tile_classes : [];
      classes = classes
        .slice()
        .sort(function (/** @type {any} */ a, /** @type {any} */ b) {
          return Number(a.value) - Number(b.value);
        });
      if (!classes.length) {
        listDiv.innerHTML =
          '<div class="class-row"><em style="opacity:0.55">' +
          escHtml(t("class_editor.no_tile_types", "No tile types yet.")) +
          "</em></div>";
        return;
      }
      var rows = "";
      for (var i = 0; i < classes.length; i++) {
        var tc = classes[i];
        var id = escHtml(String(tc.id || ""));
        // The value is what the map array holds, so showing it makes a clash
        // obvious before the server rejects one.
        var meta =
          "#" +
          escHtml(String(tc.value)) +
          " · " +
          escHtml(
            tc.walkable
              ? t("class_editor.tile_walkable_short", "walkable")
              : t("class_editor.tile_blocking_short", "blocks"),
          );
        rows +=
          '<div class="class-row">' +
          '<span class="class-row-id">' +
          id +
          "</span> " +
          '<span class="class-row-label">' +
          meta +
          "</span>" +
          '<span class="class-row-btns">' +
          '<button data-tile-class-id="' +
          id +
          '" onclick="editTileClass(this.dataset.tileClassId)">' +
          escHtml(t("class_editor.edit_button", "Edit")) +
          "</button>" +
          '<button data-tile-class-id="' +
          id +
          '" onclick="deleteTileClassUI(this.dataset.tileClassId)">' +
          escHtml(t("class_editor.del_button", "Del")) +
          "</button>" +
          "</span></div>";
      }
      listDiv.innerHTML = rows;
    })
    .catch(function () {
      listDiv.innerHTML =
        '<div class="class-row"><em style="opacity:0.55">' +
        escHtml(t("class_editor.failed_to_load", "Failed to load")) +
        "</em></div>";
    });
}

/** @param {string} id */
function editTileClass(id) {
  fetchWithAuth("/virtual-world/tile-classes")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var classes =
        data && Array.isArray(data.tile_classes) ? data.tile_classes : [];
      var tc = null;
      for (var i = 0; i < classes.length; i++) {
        if (String(classes[i].id) === String(id)) tc = classes[i];
      }
      if (!tc) {
        showHudToast(
          t("class_editor.tile_not_found", "Tile type not found"),
          true,
        );
        return;
      }
      tileClassEditId = String(id);
      var idEl = /** @type {HTMLInputElement} */ (requireElementById("tc-id"));
      idEl.value = String(tc.id || "");
      idEl.disabled = true;
      /** @type {HTMLInputElement} */ (requireElementById("tc-name-fi")).value =
        String((tc.labels && tc.labels.fi) || "");
      /** @type {HTMLInputElement} */ (requireElementById("tc-value")).value =
        String(tc.value);
      /** @type {HTMLInputElement} */ (
        requireElementById("tc-walkable")
      ).checked = !!tc.walkable;
      /** @type {HTMLSelectElement} */ (requireElementById("tc-layer")).value =
        String(tc.layer || "terrain");
      /** @type {HTMLTextAreaElement} */ (
        requireElementById("tc-visual")
      ).value = tc.visual ? JSON.stringify(tc.visual) : "";
      requireElementById("tile-class-form-title").textContent =
        t("class_editor.edit_prefix", "Edit:") + " " + String(id);
    })
    .catch(function () {
      showHudToast(
        t("class_editor.failed_to_load_tile_type", "Failed to load tile type"),
        true,
      );
    });
}

function cancelTileClassEdit() {
  tileClassEditId = null;
  var idEl = /** @type {HTMLInputElement} */ (requireElementById("tc-id"));
  idEl.value = "";
  idEl.disabled = false;
  /** @type {HTMLInputElement} */ (requireElementById("tc-name-fi")).value = "";
  /** @type {HTMLInputElement} */ (requireElementById("tc-value")).value = "";
  /** @type {HTMLInputElement} */ (requireElementById("tc-walkable")).checked =
    false;
  /** @type {HTMLSelectElement} */ (requireElementById("tc-layer")).value =
    "terrain";
  /** @type {HTMLTextAreaElement} */ (requireElementById("tc-visual")).value =
    "";
  requireElementById("tile-class-form-title").textContent = t(
    "class_editor.new_tile_type",
    "New tile type",
  );
}

function submitTileClassForm() {
  var idVal = /** @type {HTMLInputElement} */ (
    requireElementById("tc-id")
  ).value.trim();
  if (!idVal) {
    showHudToast(t("class_editor.id_required", "ID is required"), true);
    return;
  }
  var nameFiVal = /** @type {HTMLInputElement} */ (
    requireElementById("tc-name-fi")
  ).value.trim();
  var valueRaw = /** @type {HTMLInputElement} */ (
    requireElementById("tc-value")
  ).value.trim();
  var walkableVal = /** @type {HTMLInputElement} */ (
    requireElementById("tc-walkable")
  ).checked;
  var layerVal = /** @type {HTMLSelectElement} */ (
    requireElementById("tc-layer")
  ).value;
  var visualRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("tc-visual")
  ).value.trim();
  // Null rather than undefined so clearing the box clears the stored visual:
  // undefined would be dropped by JSON.stringify and the server would keep it.
  var visual = null;
  if (visualRaw) {
    try {
      visual = JSON.parse(visualRaw);
    } catch (e) {
      showHudToast(
        t("class_editor.invalid_tile_visual_json", "Invalid visual JSON"),
        true,
      );
      return;
    }
  }
  /** @type {Record<string, *>} */
  var record = {
    id: idVal,
    walkable: walkableVal,
    layer: layerVal,
    visual: visual,
    labels: buildLabelsPayload(nameFiVal),
  };
  // Only send a value when one was typed; blank means "assign the next free".
  if (valueRaw) record.value = Number(valueRaw);
  var url = tileClassEditId
    ? "/virtual-world/tile-classes/" + encodeURIComponent(tileClassEditId)
    : "/virtual-world/tile-classes";
  var method = tileClassEditId ? "PUT" : "POST";
  fetchWithAuth(url, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(
          data.error
            ? translateServerMessage(String(data.error))
            : t("class_editor.save_failed", "Save failed"),
          true,
        );
        return;
      }
      showHudToast(
        t("class_editor.saved_prefix", "Saved") + " " + idVal,
        false,
      );
      cancelTileClassEdit();
      renderTileClassList();
    })
    .catch(function () {
      showHudToast(t("class_editor.save_failed", "Save failed"), true);
    });
}

/** @param {string} id */
function deleteTileClassUI(id) {
  fetchWithAuth(
    "/virtual-world/tile-classes/" + encodeURIComponent(String(id)),
    {
      method: "DELETE",
    },
  )
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data.ok) {
        showHudToast(
          data.error
            ? translateServerMessage(String(data.error))
            : t("class_editor.delete_failed", "Delete failed"),
          true,
        );
        return;
      }
      showHudToast(
        t("class_editor.deleted_prefix", "Deleted") + " " + String(id),
        false,
      );
      if (tileClassEditId === String(id)) cancelTileClassEdit();
      renderTileClassList();
    })
    .catch(function () {
      showHudToast(t("class_editor.delete_failed", "Delete failed"), true);
    });
}

function showTileClassPanel() {
  if (inventoryPanelVisible) closeInventoryPanel();
  if (itemClassPanelVisible) closeItemClassPanel();
  if (actionClassPanelVisible) closeActionClassPanel();
  if (livingClassPanelVisible) closeLivingClassPanel();
  if (worldClassPanelVisible) closeWorldClassPanel();
  tileClassPanelVisible = true;
  requireElementById("hud-tile-class-panel").style.display = "block";
  renderTileClassList();
}

function closeTileClassPanel() {
  tileClassPanelVisible = false;
  requireElementById("hud-tile-class-panel").style.display = "none";
}

function toggleTileClassPanel() {
  if (tileClassPanelVisible) closeTileClassPanel();
  else showTileClassPanel();
}
