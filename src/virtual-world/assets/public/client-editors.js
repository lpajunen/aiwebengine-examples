/// <reference path="virtual-world-browser-globals.d.ts" />
// Creator tools: locale toggle, editing rights, item/action/living/world class editors.

// ── Localization ──────────────────────────────────────────────────────────

/** @type {Record<string, string>} */
var LOCALE_FLAG_BY_CODE = { en: "🇬🇧", fi: "🇫🇮" };

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
  updateHeldHud();
  if (statsPanelVisible) renderStatisticsPanel();
  if (craftingPanelVisible) renderCraftingPanel();
  if (playersPanelVisible) renderPlayersPanel();
  if (itemClassPanelVisible) renderItemClassList();
  if (actionClassPanelVisible) renderActionClassList();
  if (livingClassPanelVisible) renderLivingClassList();
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
  if (!hasRights) {
    if (itemClassPanelVisible) closeItemClassPanel();
    if (actionClassPanelVisible) closeActionClassPanel();
    if (livingClassPanelVisible) closeLivingClassPanel();
    if (worldClassPanelVisible) closeWorldClassPanel();
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
        var label = escHtml(
          String((ic.visuals && ic.visuals.fallbackLabel) || ic.id || "?"),
        );
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
      /** @type {HTMLSelectElement} */ (requireElementById("ic-kind")).value =
        String(ic.kind || "tool");
      /** @type {HTMLInputElement} */ (
        requireElementById("ic-spawnable")
      ).checked = !!ic.spawnable;
      /** @type {HTMLInputElement} */ (requireElementById("ic-extra")).checked =
        !!ic.extra;
      /** @type {HTMLInputElement} */ (
        requireElementById("ic-non-droppable")
      ).checked = !!ic.nonDroppable;
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
  /** @type {HTMLSelectElement} */ (requireElementById("ic-kind")).value =
    "tool";
  /** @type {HTMLInputElement} */ (requireElementById("ic-spawnable")).checked =
    false;
  /** @type {HTMLInputElement} */ (requireElementById("ic-extra")).checked =
    false;
  /** @type {HTMLInputElement} */ (
    requireElementById("ic-non-droppable")
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
  var kindVal = /** @type {HTMLSelectElement} */ (requireElementById("ic-kind"))
    .value;
  var spawnableVal = /** @type {HTMLInputElement} */ (
    requireElementById("ic-spawnable")
  ).checked;
  var extraVal = /** @type {HTMLInputElement} */ (
    requireElementById("ic-extra")
  ).checked;
  var nonDroppableVal = /** @type {HTMLInputElement} */ (
    requireElementById("ic-non-droppable")
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
    spawnable: spawnableVal,
    extra: extraVal,
    nonDroppable: nonDroppableVal,
    visuals: { fallbackLabel: labelVal || idVal },
    actionIds: actionIds,
    stateTemplate: stateTemplate,
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
  if (craftingPanelVisible) closeCraftingPanel();
  if (actionClassPanelVisible) closeActionClassPanel();
  if (livingClassPanelVisible) closeLivingClassPanel();
  if (worldClassPanelVisible) closeWorldClassPanel();
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
        var label = escHtml(String(ac.fallbackLabel || ac.id || "?"));
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
  /** @type {HTMLSelectElement} */ (
    requireElementById("ac-target-kind")
  ).value = "self";
  /** @type {HTMLInputElement} */ (
    requireElementById("ac-source-items")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("ac-logic-spec")
  ).value = "";
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
  var targetKindVal = /** @type {HTMLSelectElement} */ (
    requireElementById("ac-target-kind")
  ).value;
  var sourceItemsRaw = /** @type {HTMLInputElement} */ (
    requireElementById("ac-source-items")
  ).value;
  var logicSpecRaw = /** @type {HTMLTextAreaElement} */ (
    requireElementById("ac-logic-spec")
  ).value.trim();
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
  var record = {
    id: idVal,
    fallbackLabel: labelVal || idVal,
    targetKind: targetKindVal,
    sourceItemIds: sourceItemIds,
    logicSpec: logicSpec,
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
  if (craftingPanelVisible) closeCraftingPanel();
  if (itemClassPanelVisible) closeItemClassPanel();
  if (livingClassPanelVisible) closeLivingClassPanel();
  if (worldClassPanelVisible) closeWorldClassPanel();
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
        var label = escHtml(String(lc.fallbackLabel || lc.id || "?"));
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
      /** @type {HTMLSelectElement} */ (requireElementById("lc-kind")).value =
        String(lc.kind || "creature");
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
  /** @type {HTMLSelectElement} */ (requireElementById("lc-kind")).value =
    "creature";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-slot-definitions")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-value-template")
  ).value = "";
  /** @type {HTMLTextAreaElement} */ (
    requireElementById("lc-value-schema")
  ).value = "";
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
  var kindVal = /** @type {HTMLSelectElement} */ (requireElementById("lc-kind"))
    .value;
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
  var record = {
    id: idVal,
    kind: kindVal,
    fallbackLabel: labelVal || idVal,
    slotDefinitions: slotDefinitions,
    valueTemplate: valueTemplate,
    valueSchema: valueSchema,
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
  if (craftingPanelVisible) closeCraftingPanel();
  if (itemClassPanelVisible) closeItemClassPanel();
  if (actionClassPanelVisible) closeActionClassPanel();
  if (worldClassPanelVisible) closeWorldClassPanel();
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

var BUILTIN_WORLD_CLASS_IDS = ["forest", "island", "cave", "building"];

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
        var label = escHtml(String(wc.fallbackLabel || wc.id || "?"));
        var summary = escHtml(
          String(wc.baseType || "") +
            " " +
            String(wc.rows || "?") +
            "×" +
            String(wc.cols || "?"),
        );
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
          " · " +
          summary +
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
      /** @type {HTMLSelectElement} */ (
        requireElementById("wc-base-type")
      ).value = String(wc.baseType || "forest");
      /** @type {HTMLInputElement} */ (requireElementById("wc-rows")).value =
        String(wc.rows || 100);
      /** @type {HTMLInputElement} */ (requireElementById("wc-cols")).value =
        String(wc.cols || 100);
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

function cancelWorldClassEdit() {
  worldClassEditId = null;
  var idEl = /** @type {HTMLInputElement} */ (requireElementById("wc-id"));
  idEl.disabled = false;
  idEl.value = "";
  /** @type {HTMLInputElement} */ (requireElementById("wc-label")).value = "";
  /** @type {HTMLSelectElement} */ (requireElementById("wc-base-type")).value =
    "forest";
  /** @type {HTMLInputElement} */ (requireElementById("wc-rows")).value = "100";
  /** @type {HTMLInputElement} */ (requireElementById("wc-cols")).value = "100";
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
  var baseTypeVal = /** @type {HTMLSelectElement} */ (
    requireElementById("wc-base-type")
  ).value;
  var rowsVal = Number(
    /** @type {HTMLInputElement} */ (requireElementById("wc-rows")).value,
  );
  var colsVal = Number(
    /** @type {HTMLInputElement} */ (requireElementById("wc-cols")).value,
  );
  var record = {
    id: idVal,
    baseType: baseTypeVal,
    rows: rowsVal,
    cols: colsVal,
    fallbackLabel: labelVal || idVal,
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
        showHudToast(
          data.error
            ? translateServerMessage(String(data.error))
            : t("class_editor.save_failed", "Save failed"),
          true,
        );
        return;
      }
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
  if (craftingPanelVisible) closeCraftingPanel();
  if (itemClassPanelVisible) closeItemClassPanel();
  if (actionClassPanelVisible) closeActionClassPanel();
  if (livingClassPanelVisible) closeLivingClassPanel();
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
