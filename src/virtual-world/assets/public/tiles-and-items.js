/// <reference path="virtual-world-browser-globals.d.ts" />

// ── Dynamic world-mod state (client-side) ─────────────────────────────────
var clientTileDefs = /** @type {Record<string, ClientTileDef>} */ (
  typeof WORLD_TILE_DEFS === "object" && WORLD_TILE_DEFS
    ? WORLD_TILE_DEFS
    : {
        ground: { value: 0, walkable: true, layer: "terrain" },
        spruce_thicket: { value: 1, walkable: false, layer: "terrain" },
        pine_tree: { value: 2, walkable: false, layer: "object" },
        house: { value: 3, walkable: false, layer: "object" },
        ocean: { value: 4, walkable: false, layer: "terrain" },
        lake: { value: 5, walkable: false, layer: "terrain" },
        river: { value: 6, walkable: false, layer: "terrain" },
        rock: { value: 7, walkable: false, layer: "terrain" },
        mountain: { value: 8, walkable: false, layer: "terrain" },
        sand: { value: 9, walkable: true, layer: "terrain" },
        cave_floor: { value: 10, walkable: true, layer: "terrain" },
        wood_floor: { value: 11, walkable: true, layer: "terrain" },
        stick_fence: { value: 12, walkable: false, layer: "terrain" },
        bridge: { value: 13, walkable: true, layer: "terrain" },
      }
);
/** @type {Record<number, string>} */
var clientTileNamesByValue = {};
Object.keys(clientTileDefs).forEach(function (tileName) {
  clientTileNamesByValue[Number(clientTileDefs[tileName].value)] = tileName;
});

/**
 * @param {number} tileValue
 * @returns {string}
 */
function clientTileNameForValue(tileValue) {
  return clientTileNamesByValue[Number(tileValue)] || "ground";
}

/**
 * @param {string} tileName
 * @returns {number}
 */
function clientTileValueForName(tileName) {
  var def = clientTileDefs[String(tileName)] || clientTileDefs.ground;
  return Number(def.value || 0);
}

/**
 * @param {number} tileValue
 * @returns {boolean}
 */
function isWalkableTileValue(tileValue) {
  var def =
    clientTileDefs[clientTileNameForValue(tileValue)] || clientTileDefs.ground;
  return !!def.walkable;
}

/**
 * @returns {{terrain: Record<string, any>, object: Record<string, any>}}
 */
function createEmptyClientWorldMods() {
  return { terrain: {}, object: {} };
}

/**
 * @param {*} raw
 * @returns {{terrain: Record<string, any>, object: Record<string, any>}}
 */
function normalizeWorldMods(raw) {
  var out = createEmptyClientWorldMods();
  if (!raw || typeof raw !== "object") return out;
  ["terrain", "object"].forEach(function (layer) {
    var layerKey = /** @type {"terrain" | "object"} */ (layer);
    var mods = raw[layer];
    if (!mods || typeof mods !== "object") return;
    Object.keys(mods).forEach(function (tileKey) {
      var mod = mods[tileKey];
      if (!mod || typeof mod !== "object") return;
      out[layerKey][tileKey] = {
        row: Number(mod.row),
        col: Number(mod.col),
        tile_type: String(mod.tile_type || "ground"),
        actor_id: mod.actor_id ? String(mod.actor_id) : "",
        actor_type: mod.actor_type ? String(mod.actor_type) : "",
        payload:
          mod.payload && typeof mod.payload === "object" ? mod.payload : {},
      };
    });
  });
  return out;
}

/**
 * @returns {{terrain: Record<string, any>, object: Record<string, any>}}
 */
function buildLegacyWorldModsFromBootstrap() {
  var mods = createEmptyClientWorldMods();
  var bootTrees = TREE_MODS || {};
  var bootHouses = HOUSE_MODS || {};
  Object.keys(bootTrees).forEach(function (tileKey) {
    var tree = bootTrees[tileKey];
    var parts = tileKey.split("_");
    var row = Number(parts[0]);
    var col = Number(parts[1]);
    if (!tree || !isFinite(row) || !isFinite(col)) return;
    mods.object[tileKey] = {
      row: row,
      col: col,
      tile_type: tree.action === "plant" ? "pine_tree" : "ground",
      actor_id: String(tree.planted_by || tree.cut_by || ""),
      actor_type: "player",
      payload: { source_kind: "tree", action: String(tree.action || "") },
    };
  });
  Object.keys(bootHouses).forEach(function (tileKey) {
    var house = bootHouses[tileKey];
    var parts = tileKey.split("_");
    var row = Number(parts[0]);
    var col = Number(parts[1]);
    if (!house || !isFinite(row) || !isFinite(col)) return;
    mods.object[tileKey] = {
      row: row,
      col: col,
      tile_type: "house",
      actor_id: String(house.built_by || ""),
      actor_type: String(house.actor_type || "player"),
      payload: { source_kind: "house" },
    };
  });
  return mods;
}

/**
 * @param {{terrain: Record<string, any>, object: Record<string, any>}} mods
 * @returns {boolean}
 */
function hasAnyWorldMods(mods) {
  return (
    !!mods &&
    ((mods.terrain && Object.keys(mods.terrain).length > 0) ||
      (mods.object && Object.keys(mods.object).length > 0))
  );
}

/** @type {ClientWorldMods} */
var worldMods = createEmptyClientWorldMods();

/**
 * @returns {void}
 */
function applyWorldModsToClientMap() {
  ["terrain", "object"].forEach(function (layer) {
    var layerKey = /** @type {"terrain" | "object"} */ (layer);
    var mods = worldMods[layerKey] || {};
    Object.keys(mods).forEach(function (tileKey) {
      var mod = mods[tileKey];
      if (!mod) return;
      var row = Number(mod.row);
      var col = Number(mod.col);
      if (row < 0 || row >= 100 || col < 0 || col >= 100) return;
      MAP[row][col] = clientTileValueForName(mod.tile_type);
    });
  });
}

/**
 * @returns {void}
 */
function rebuildLegacyDynamicViews() {
  dynamicTrees = {};
  dynamicHouses = {};
  Object.keys(worldMods.object || {}).forEach(function (tileKey) {
    var mod = worldMods.object[tileKey];
    var payload =
      mod && mod.payload && typeof mod.payload === "object" ? mod.payload : {};
    if (payload.source_kind === "tree") {
      dynamicTrees[tileKey] = {
        action: String(payload.action || "plant"),
        actor_type: mod.actor_type || "player",
        actor_id: mod.actor_id || "",
      };
    }
    if (payload.source_kind === "house") {
      dynamicHouses[tileKey] = {
        built_by: mod.actor_id || "",
        actor_type: mod.actor_type || "player",
      };
    }
  });
}

/** @type {Record<string, any>} */
var dynamicTrees = {};
/** @type {Record<string, any>} */
var dynamicHouses = {};

// (Re)initialize the client world-mod overlay from the current
// WORLD_MODS/TREE_MODS/HOUSE_MODS globals and paint it into MAP. Trees, houses
// and tile mods live in this overlay (not in the server-generated base map), so
// this must run at boot AND again on an in-place world swap (see swapToWorld) —
// otherwise travelling away and back leaves the village houses/planted trees
// unpainted until a full page reload.
function resetWorldModsFromGlobals() {
  worldMods = /** @type {ClientWorldMods} */ (
    normalizeWorldMods(typeof WORLD_MODS !== "undefined" ? WORLD_MODS : null)
  );
  if (!hasAnyWorldMods(worldMods)) {
    worldMods = buildLegacyWorldModsFromBootstrap();
  }
  applyWorldModsToClientMap();
  rebuildLegacyDynamicViews();
}
resetWorldModsFromGlobals();

/**
 * Resolves a (possibly custom, config-driven) action id to the underlying
 * tree mutation it performs, so the client can render it the same way as
 * the built-in "plant"/"cut" actions.
 * @param {string} action
 * @returns {"plant"|"cut"|null}
 */
function resolveTreeActionKind(action) {
  if (action === "plant" || action === "cut") return action;
  var actionDef =
    ITEM_REGISTRY && ITEM_REGISTRY.actions && ITEM_REGISTRY.actions[action];
  return (actionDef && actionDef.tree_action) || null;
}

/**
 * Resolves a (possibly custom, config-driven) action id to the underlying
 * house mutation it performs, so the client can render it the same way as
 * the built-in "build_house"/"destroy_house" actions.
 * @param {string} action
 * @returns {"build_house"|"destroy_house"|null}
 */
function resolveHouseActionKind(action) {
  if (action === "build_house" || action === "destroy_house") return action;
  var actionDef =
    ITEM_REGISTRY && ITEM_REGISTRY.actions && ITEM_REGISTRY.actions[action];
  return (actionDef && actionDef.house_action) || null;
}

/**
 * @param {string} action
 * @param {number} row
 * @param {number} col
 * @param {string} actorType
 * @param {string} actorId
 */
function applyHouseAction(action, row, col, actorType, actorId) {
  var tileKey = row + "_" + col;
  if (action === "build_house") {
    worldMods.object[tileKey] = {
      row: row,
      col: col,
      tile_type: "house",
      actor_id: actorId || "",
      actor_type: actorType || "player",
      payload: { source_kind: "house" },
    };
    MAP[row][col] = clientTileValueForName("house");
  } else if (action === "destroy_house") {
    delete worldMods.object[tileKey];
    MAP[row][col] = clientTileValueForName("ground");
  }
  rebuildLegacyDynamicViews();
}

/**
 * @param {string} action
 * @param {number} row
 * @param {number} col
 * @param {string} actorType
 * @param {string} actorId
 */
function applyTreeAction(action, row, col, actorType, actorId) {
  var tileKey = row + "_" + col;
  if (action === "plant") {
    worldMods.object[tileKey] = {
      row: row,
      col: col,
      tile_type: "pine_tree",
      actor_id: actorId || "",
      actor_type: actorType || "player",
      payload: { source_kind: "tree", action: "plant" },
    };
    MAP[row][col] = clientTileValueForName("pine_tree");
  } else if (action === "cut") {
    worldMods.object[tileKey] = {
      row: row,
      col: col,
      tile_type: "ground",
      actor_id: actorId || "",
      actor_type: actorType || "player",
      payload: { source_kind: "tree", action: "cut" },
    };
    MAP[row][col] = clientTileValueForName("ground");
  }
  rebuildLegacyDynamicViews();
}

/**
 * @param {any} inv
 * @returns {ClientInventory}
 */
function normalizeClientInventory(inv) {
  if (!inv || typeof inv !== "object") {
    return {
      class_id: "",
      slots: {},
      bag: [],
      values: {},
      left_hand: null,
      right_hand: null,
      inventory: [],
    };
  }

  /** @param {any} item */
  function asClientItem(item) {
    if (!item || !item.id || !item.type) return null;
    return {
      id: item.id,
      type: item.type,
      destination_world_id: item.destination_world_id,
      destination_world_type: item.destination_world_type,
      non_droppable: item.non_droppable,
      state: item.state,
    };
  }

  var slots = /** @type {Record<string, any>} */ ({});
  if (inv.slots && typeof inv.slots === "object") {
    Object.keys(inv.slots).forEach(function (slotId) {
      slots[String(slotId)] = asClientItem(inv.slots[slotId]);
    });
  } else {
    slots.left_hand = asClientItem(inv.left_hand);
    slots.right_hand = asClientItem(inv.right_hand);
  }

  var bagSource = Array.isArray(inv.bag)
    ? inv.bag
    : Array.isArray(inv.inventory)
      ? inv.inventory
      : [];
  var bag = /** @type {any[]} */ (bagSource)
    .map(function (it) {
      return asClientItem(it);
    })
    .filter(function (it) {
      return !!it;
    });

  var out = {
    class_id: inv.class_id ? String(inv.class_id) : "",
    slots: slots,
    bag: bag,
    values: inv.values && typeof inv.values === "object" ? inv.values : {},
    left_hand: slots.left_hand || null,
    right_hand: slots.right_hand || null,
    inventory: bag,
  };
  return /** @type {ClientInventory} */ (out);
}

/**
 * @returns {Record<string, any>}
 */
function getLivingRegistryClasses() {
  if (!LIVING_REGISTRY || typeof LIVING_REGISTRY !== "object") {
    return {};
  }
  if (!LIVING_REGISTRY.classes || typeof LIVING_REGISTRY.classes !== "object") {
    return {};
  }
  return LIVING_REGISTRY.classes;
}

/**
 * @param {ClientInventory | any} inv
 * @returns {any | null}
 */
function getLivingClassForInventory(inv) {
  var classes = getLivingRegistryClasses();
  var classId = inv && inv.class_id ? String(inv.class_id) : "";
  return classId && classes[classId] ? classes[classId] : null;
}

/**
 * @param {ClientInventory | any} inv
 * @returns {string[]}
 */
function getInventorySlotIds(inv) {
  var slots =
    inv && inv.slots && typeof inv.slots === "object"
      ? inv.slots
      : {
          left_hand: inv.left_hand || null,
          right_hand: inv.right_hand || null,
        };
  var seen = /** @type {Record<string, boolean>} */ ({});
  var ordered = [];
  var livingClass = getLivingClassForInventory(inv);
  if (livingClass && Array.isArray(livingClass.slotDefinitions)) {
    for (var i = 0; i < livingClass.slotDefinitions.length; i++) {
      var slotDef = livingClass.slotDefinitions[i];
      var slotId = slotDef && slotDef.id ? String(slotDef.id) : "";
      if (!slotId || seen[slotId]) continue;
      seen[slotId] = true;
      ordered.push(slotId);
    }
  }
  Object.keys(slots)
    .sort()
    .forEach(function (slotId) {
      if (seen[slotId]) return;
      seen[slotId] = true;
      ordered.push(slotId);
    });
  return ordered;
}

/**
 * @param {string} classId
 * @returns {string}
 */
function livingClassLabel(classId) {
  var id = String(classId || "");
  if (!id) return id;
  var classes = getLivingRegistryClasses();
  var cls = classes[id];
  var labelKey = (cls && cls.labelKey) || "living.class." + id;
  var fallbackLabel = (cls && cls.fallbackLabel) || humanizeType(id);
  return localizeLabel(cls && cls.labels, labelKey, fallbackLabel);
}

/**
 * @param {ClientInventory | any} inv
 * @param {string} slotId
 * @returns {string}
 */
function inventorySlotLabel(inv, slotId) {
  var id = String(slotId || "");
  var livingClass = getLivingClassForInventory(inv);
  if (livingClass && Array.isArray(livingClass.slotDefinitions)) {
    for (var i = 0; i < livingClass.slotDefinitions.length; i++) {
      var slotDef = livingClass.slotDefinitions[i];
      if (!slotDef || String(slotDef.id) !== id) continue;
      return t(
        slotDef.labelKey || "living.slot." + id,
        slotDef.fallbackLabel || humanizeType(id),
      );
    }
  }
  return t("living.slot." + id, humanizeType(id));
}

/**
 * @param {any} items
 * @returns {Record<string, ClientItem[]>}
 */
function normalizeClientWorldItems(items) {
  var out = /** @type {Record<string, ClientItem[]>} */ ({});
  if (!items || typeof items !== "object") return out;
  for (var tileKey in items) {
    if (!Array.isArray(items[tileKey])) continue;
    var filtered = /** @type {any[]} */ (items[tileKey])
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
      });
    if (filtered.length > 0) out[tileKey] = filtered;
  }
  return out;
}

/**
 * @param {string} worldType
 * @returns {string}
 */
function normalizeWorldType(worldType) {
  var normalized = String(worldType || "").toLowerCase();
  if (
    normalized === "forest" ||
    normalized === "island" ||
    normalized === "cave" ||
    normalized === "building" ||
    normalized === "village"
  ) {
    return normalized;
  }
  return "forest";
}

/**
 * @param {string} worldType
 * @returns {string}
 */
function worldTypeLabel(worldType) {
  var normalized = normalizeWorldType(worldType);
  if (normalized === "island") return t("world_type.island", "Island");
  if (normalized === "cave") return t("world_type.cave", "Cave");
  if (normalized === "building") return t("world_type.building", "House");
  if (normalized === "village") return t("world_type.village", "Village");
  return t("world_type.forest", "Forest");
}

/**
 * @param {string} classId
 * @returns {{ id: string, baseType: string, labelKey: string, fallbackLabel: string, labels?: Record<string, string> } | null}
 */
function getWorldClassRecord(classId) {
  if (
    typeof WORLD_CLASS_REGISTRY === "undefined" ||
    !Array.isArray(WORLD_CLASS_REGISTRY)
  ) {
    return null;
  }
  for (var i = 0; i < WORLD_CLASS_REGISTRY.length; i++) {
    if (WORLD_CLASS_REGISTRY[i] && WORLD_CLASS_REGISTRY[i].id === classId) {
      return WORLD_CLASS_REGISTRY[i];
    }
  }
  return null;
}

/**
 * @param {string} classId
 * @returns {string}
 */
function worldClassLabel(classId) {
  var cls = getWorldClassRecord(classId);
  if (!cls) return worldTypeLabel(classId);
  return localizeLabel(
    cls.labels,
    cls.labelKey,
    cls.fallbackLabel || cls.id || "?",
  );
}

/**
 * @param {ClientItem | null | undefined} item
 * @returns {string}
 */
function portalDestinationLabel(item) {
  var destinationType = normalizeWorldType(
    item && item.destination_world_type
      ? item.destination_world_type
      : "forest",
  );
  var worldLabel = worldTypeLabel(destinationType);
  var worldSuffix = t("world_type.world_suffix", "world");
  if (item && item.destination_world_id) {
    return (
      worldLabel +
      " " +
      worldSuffix +
      " (#" +
      String(item.destination_world_id) +
      ")"
    );
  }
  return worldLabel + " " + worldSuffix;
}

/**
 * @param {string} type
 * @returns {{label_key?: string, fallback_label?: string, labels?: Record<string, string>, color?: number, action_ids?: string[], kind?: string, non_pickable?: boolean} | null}
 */
function getRegistryItemDef(type) {
  if (!ITEM_REGISTRY || !ITEM_REGISTRY.items) return null;
  return ITEM_REGISTRY.items[String(type || "")] || null;
}

/**
 * @param {string} type
 * @returns {boolean}
 */
function isContainerItemType(type) {
  var def = getRegistryItemDef(type);
  return !!def && def.kind === "container";
}

/**
 * Whether a world item of this type can be picked up. Unknown types (no
 * registry def) default to pickable, matching the server's isPickableWorldItem.
 * @param {string} type
 * @returns {boolean}
 */
function isPickableItemType(type) {
  var def = getRegistryItemDef(type);
  return !def || !def.non_pickable;
}

/**
 * Reads a dotted path (e.g. "state.currentHitPoints") out of a context object.
 * @param {Record<string, *>} ctx
 * @param {string} path
 * @returns {*}
 */
function getValidWhenField(ctx, path) {
  var parts = String(path || "").split(".");
  /** @type {*} */
  var cur = ctx;
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined || typeof cur !== "object")
      return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

/**
 * Client mirror of evaluateTargetConditions (action-logic-interpreter.ts):
 * whether an action's validWhen precondition holds for a given target, used to
 * hide inapplicable action buttons (DESIGN-targeting.md step 3). Conditions may
 * read the target's `type`, `state.*` and `values.*`, comparing `field` to a
 * literal `value` or another field via `ref`. No validWhen => always shown.
 * @param {string} actionId
 * @param {{type?: *, state?: Record<string, *>, values?: Record<string, *>}} target
 * @returns {boolean}
 */
function actionValidForTarget(actionId, target) {
  var def = getRegistryActionDef(actionId);
  var conds = def && def.valid_when;
  if (!Array.isArray(conds) || conds.length === 0) return true;
  var ctx = {
    type: target && target.type,
    state:
      target && target.state && typeof target.state === "object"
        ? target.state
        : {},
    values:
      target && target.values && typeof target.values === "object"
        ? target.values
        : {},
  };
  for (var i = 0; i < conds.length; i++) {
    var cond = conds[i];
    var actual = getValidWhenField(ctx, cond.field);
    var expected =
      cond.ref !== undefined ? getValidWhenField(ctx, cond.ref) : cond.value;
    var pass = false;
    switch (cond.op) {
      case "eq":
        pass = actual === expected;
        break;
      case "ne":
        pass = actual !== expected;
        break;
      case "gt":
        pass = Number(actual) > Number(expected);
        break;
      case "lt":
        pass = Number(actual) < Number(expected);
        break;
      case "gte":
        pass = Number(actual) >= Number(expected);
        break;
      case "lte":
        pass = Number(actual) <= Number(expected);
        break;
      default:
        pass = false;
    }
    if (!pass) return false;
  }
  return true;
}

/**
 * @param {string} action
 * @returns {{label_key?: string, fallback_label?: string, labels?: Record<string, string>, canonical_id?: string, target_kind?: string, targeting?: {approach?: string, range?: number, rangeShape?: string, areaRadius?: number, rangeFrom?: string}, valid_when?: Array<{field: string, op: string, value?: *, ref?: string}>} | null}
 */
function getRegistryActionDef(action) {
  if (!ITEM_REGISTRY || !ITEM_REGISTRY.actions) return null;
  return ITEM_REGISTRY.actions[String(action || "")] || null;
}

/**
 * @param {string} action
 * @returns {boolean}
 */
function isEntityTargetedAction(action) {
  var def = getRegistryActionDef(action);
  var targetKind = def && def.target_kind;
  return (
    targetKind === "item" ||
    targetKind === "living" ||
    targetKind === "item_nearby" ||
    targetKind === "living_nearby"
  );
}

// Max Chebyshev tile distance for "item_nearby"/"living_nearby" targeted
// actions (e.g. follow, fight) — keep in sync with NEARBY_TARGET_TILE_DISTANCE
// in assets/server/runtime-config.ts.
var NEARBY_ACTION_TILE_DISTANCE = 5;

/**
 * @param {number} rowA
 * @param {number} colA
 * @param {number} rowB
 * @param {number} colB
 * @param {number} maxDistance
 * @returns {boolean}
 */
function isWithinTileDistance(rowA, colA, rowB, colB, maxDistance) {
  return Math.max(Math.abs(rowA - rowB), Math.abs(colA - colB)) <= maxDistance;
}

/**
 * Actions the player can currently invoke against an item or living,
 * derived from every tool the player is carrying (slots + bag), filtered to
 * the requested target kind ("item" or "living").
 * @param {"item" | "living"} targetKind
 * @param {boolean} nearbyOnly When true, only match the "_nearby" variant
 *   (target kind "item_nearby"/"living_nearby"); when false, match both the
 *   same-tile and "_nearby" variants.
 * @returns {string[]}
 */
function actionsAvailableForTargetKind(targetKind, nearbyOnly) {
  var inv = normalizeClientInventory(playerInventory);
  var acceptedKinds = nearbyOnly
    ? [targetKind + "_nearby"]
    : [targetKind, targetKind + "_nearby"];
  /** @type {Record<string, boolean>} */
  var seen = {};
  /** @type {string[]} */
  var result = [];

  /** @param {ClientItem | null} item */
  function collectFromItem(item) {
    if (!item) return;
    var itemActions = treeActionsForItemType(item.type);
    for (var i = 0; i < itemActions.length; i++) {
      var actionId = itemActions[i];
      if (seen[actionId]) continue;
      var def = getRegistryActionDef(actionId);
      if (!def) continue;
      var kind = def.target_kind || "";
      var accepted = acceptedKinds.indexOf(kind) !== -1;
      // A same-tile action (target_kind "item"/"living") whose targeting uses
      // walk_adjacent is also offered at nearby distance: the server walks the
      // actor to the target and runs it on arrival (DESIGN-targeting.md step 2).
      if (
        !accepted &&
        nearbyOnly &&
        kind === targetKind &&
        def.targeting &&
        def.targeting.approach === "walk_adjacent"
      ) {
        accepted = true;
      }
      if (!accepted) continue;
      seen[actionId] = true;
      result.push(actionId);
    }
  }

  if (Array.isArray(inv.bag)) {
    for (var b = 0; b < inv.bag.length; b++) collectFromItem(inv.bag[b]);
  }
  if (inv.slots && typeof inv.slots === "object") {
    var slotIds = Object.keys(inv.slots);
    for (var s = 0; s < slotIds.length; s++)
      collectFromItem(inv.slots[slotIds[s]]);
  }
  return result.sort(function (a, b) {
    return treeActionLabel(a).localeCompare(treeActionLabel(b));
  });
}

/** @type {Record<string, ClientItem[]>} */
var worldItemsByTile = normalizeClientWorldItems(WORLD_ITEMS || {});
var itemSnapshotRequestSeq = 0;
var appliedItemSnapshotSeq = 0;
var playerInventory = normalizeClientInventory(PLAYER_INV);

/**
 * @param {string} type
 * @returns {string[]}
 */
function treeActionsForItemType(type) {
  var registryItem = getRegistryItemDef(type);
  if (registryItem && Array.isArray(registryItem.action_ids)) {
    return registryItem.action_ids.slice();
  }
  if (type === "portal_builder") {
    return ["build_portal", "remove_portal"];
  }
  if (type === "hammer") return ["build_house", "destroy_house"];
  if (type === "tree_planter") return ["plant"];
  if (type === "saw") return ["cut"];
  if (type === "kantele") return ["play_tune"];
  if (type === "rowan_charm") return ["place_blessing"];
  if (type === "portal") return ["portal_travel"];
  if (type === "starter_kit") return ["return_home"];
  return [];
}

/**
 * @param {string} action
 * @returns {string}
 */
function treeActionLabel(action) {
  var registryAction = getRegistryActionDef(action);
  if (registryAction) {
    return localizeLabel(
      registryAction.labels,
      registryAction.label_key || String(action || ""),
      registryAction.fallback_label || String(action || ""),
    );
  }
  if (action === "plant") {
    return t("tree_action.plant", "Use tree planting spade (plant)");
  }
  if (action === "cut") {
    return t("tree_action.cut", "Use saw (cut)");
  }
  if (action === "build_house") {
    return t("tree_action.build_house", "Use hammer (build house)");
  }
  if (action === "destroy_house") {
    return t("tree_action.destroy_house", "Use hammer (destroy house)");
  }
  if (action === "build_portal") {
    return t("tree_action.build_portal", "Use portal builder (build portal)");
  }
  if (action === "remove_portal") {
    return t("tree_action.remove_portal", "Use portal builder (remove portal)");
  }
  if (action === "play_tune") {
    return t("tree_action.play_tune", "Play kantele tune");
  }
  if (action === "place_blessing") {
    return t("tree_action.place_blessing", "Place rowan blessing");
  }
  if (action === "portal_travel") {
    return t("tree_action.portal_travel", "Use portal (new world)");
  }
  if (action === "return_home") {
    return t("tree_action.return_home", "Travel to the old oak");
  }
  return action;
}

/**
 * Whether a door's action makes sense given its current open state, so the HUD
 * only offers the relevant one: a closed door offers "open" (not "enter"/
 * "close"), an open door offers "enter"/"close" (not "open"). Non-door items
 * pass through unaffected.
 * @param {ClientItem} item
 * @param {string} action
 * @returns {boolean}
 */
function isNearbyItemActionApplicable(item, action) {
  if (!item || item.type !== "door") return true;
  var isOpen = !!(item.state && item.state.open === true);
  if (action === "open_door") return !isOpen;
  if (action === "close_door") return isOpen;
  if (action === "door_travel") return isOpen;
  return true;
}

/** @returns {string[]} */
function getOwnedTreeActions() {
  var actionsByType = /** @type {Record<string, boolean>} */ ({});
  var inv = normalizeClientInventory(playerInventory);
  var all = /** @type {ClientItem[]} */ ([]);

  var slotIds = getInventorySlotIds(inv);
  for (var i = 0; i < slotIds.length; i++) {
    var slotItem = inv.slots && inv.slots[slotIds[i]];
    if (slotItem) all.push(slotItem);
  }
  if (Array.isArray(inv.bag)) {
    for (var b = 0; b < inv.bag.length; b++) all.push(inv.bag[b]);
  }

  var nearbyTileKeys = [
    avatarRow + "_" + avatarCol,
    avatarRow - 1 + "_" + avatarCol,
    avatarRow + 1 + "_" + avatarCol,
    avatarRow + "_" + (avatarCol - 1),
    avatarRow + "_" + (avatarCol + 1),
    avatarRow - 1 + "_" + (avatarCol - 1),
    avatarRow - 1 + "_" + (avatarCol + 1),
    avatarRow + 1 + "_" + (avatarCol - 1),
    avatarRow + 1 + "_" + (avatarCol + 1),
  ];
  for (var t = 0; t < nearbyTileKeys.length; t++) {
    var tileItems = worldItemsByTile[nearbyTileKeys[t]];
    if (Array.isArray(tileItems)) {
      for (var k = 0; k < tileItems.length; k++) all.push(tileItems[k]);
    }
  }
  for (var j = 0; j < all.length; j++) {
    var actions = treeActionsForItemType(all[j] && all[j].type);
    if (!Array.isArray(actions)) continue;
    for (var m = 0; m < actions.length; m++) {
      if (!actions[m]) continue;
      if (isEntityTargetedAction(actions[m])) continue;
      if (!isNearbyItemActionApplicable(all[j], actions[m])) continue;
      actionsByType[actions[m]] = true;
    }
  }
  return Object.keys(actionsByType).sort(function (a, b) {
    return treeActionLabel(a).localeCompare(treeActionLabel(b));
  });
}

/**
 * @param {ClientItem | null | undefined} item
 * @returns {string}
 */
function inventoryItemLabel(item) {
  if (!item || !item.type) return t("inventory.empty", "empty");
  var type = String(item.type);
  var registryItem = getRegistryItemDef(type);
  if (registryItem && (registryItem.label_key || registryItem.labels)) {
    return localizeLabel(
      registryItem.labels,
      registryItem.label_key,
      registryItem.fallback_label || humanizeType(type),
    );
  }
  return t(itemTypeToLabelKey(type), humanizeType(type));
}
