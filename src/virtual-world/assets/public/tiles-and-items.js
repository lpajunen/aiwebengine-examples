/// <reference path="../../../../types/virtual-world-browser-globals.d.ts" />

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

var worldMods = /** @type {ClientWorldMods} */ (
  normalizeWorldMods(typeof WORLD_MODS !== "undefined" ? WORLD_MODS : null)
);
if (!hasAnyWorldMods(worldMods)) {
  worldMods = buildLegacyWorldModsFromBootstrap();
}

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
applyWorldModsToClientMap();
rebuildLegacyDynamicViews();

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
    return { left_hand: null, right_hand: null, inventory: [] };
  }
  var out = {
    left_hand: inv.left_hand && inv.left_hand.id ? inv.left_hand : null,
    right_hand: inv.right_hand && inv.right_hand.id ? inv.right_hand : null,
    inventory: Array.isArray(inv.inventory)
      ? /** @type {any[]} */ (inv.inventory).filter(function (it) {
          return it && it.id && it.type;
        })
      : [],
  };
  return /** @type {ClientInventory} */ (out);
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
    normalized === "building"
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
  if (normalized === "island") return "Island";
  if (normalized === "cave") return "Cave";
  if (normalized === "building") return "House";
  return "Forest";
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
  if (item && item.destination_world_id) {
    return worldLabel + " world (#" + String(item.destination_world_id) + ")";
  }
  return worldLabel + " world";
}

var PORTAL_BUILD_ACTIONS = [
  "build_portal_forest",
  "build_portal_island",
  "build_portal_cave",
  "build_portal_building",
];

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
  if (type === "portal_builder") {
    return PORTAL_BUILD_ACTIONS.concat(["remove_portal"]);
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
  if (action === "build_portal_forest") {
    return t(
      "tree_action.build_portal_forest",
      "Use portal builder (build forest portal)",
    );
  }
  if (action === "build_portal_island") {
    return t(
      "tree_action.build_portal_island",
      "Use portal builder (build island portal)",
    );
  }
  if (action === "build_portal_cave") {
    return t(
      "tree_action.build_portal_cave",
      "Use portal builder (build cave portal)",
    );
  }
  if (action === "build_portal_building") {
    return t(
      "tree_action.build_portal_building",
      "Use portal builder (build house portal)",
    );
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

/** @returns {string[]} */
function getOwnedTreeActions() {
  var actionsByType = /** @type {Record<string, boolean>} */ ({});
  var inv = normalizeClientInventory(playerInventory);
  var all = /** @type {ClientItem[]} */ ([]);
  if (inv.left_hand) all.push(inv.left_hand);
  if (inv.right_hand) all.push(inv.right_hand);
  if (Array.isArray(inv.inventory)) {
    for (var i = 0; i < inv.inventory.length; i++) all.push(inv.inventory[i]);
  }
  var tileItems = worldItemsByTile[avatarRow + "_" + avatarCol];
  if (Array.isArray(tileItems)) {
    for (var k = 0; k < tileItems.length; k++) all.push(tileItems[k]);
  }
  for (var j = 0; j < all.length; j++) {
    var actions = treeActionsForItemType(all[j] && all[j].type);
    if (!Array.isArray(actions)) continue;
    for (var m = 0; m < actions.length; m++) {
      if (!actions[m]) continue;
      actionsByType[actions[m]] = true;
    }
  }
  return Object.keys(actionsByType);
}

/**
 * @param {ClientItem | null | undefined} item
 * @returns {string}
 */
function inventoryItemLabel(item) {
  if (!item || !item.type) return t("inventory.empty", "empty");
  var type = String(item.type);
  return t(itemTypeToLabelKey(type), humanizeType(type));
}
