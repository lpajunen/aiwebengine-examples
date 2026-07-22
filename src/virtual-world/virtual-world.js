/// <reference path="../../types/aiwebengine.d.ts" />

import {
  canInventoryUseTreeAction,
  canTileItemsUseTreeAction,
  createWorldId,
  getAllKnownItemTypes,
  getActionsForItemType,
  getInventoryTreeActions,
  getNPCDisplayName,
  getWorldFlavorTextByIndex,
  getWorldFlavorTextIndex,
  hashString,
  ITEM_TYPES,
  OAK_CENTER_COL,
  OAK_CENTER_ROW,
  OAK_WORLD_ID,
  applyOakReservation,
  buildInventorySelectors,
  canonicalTreeAction,
  findFirstLivingItemByTypes,
  getOakClearingTiles,
  isOakCenterTile,
  isOakClearingTile,
  isOakWorld,
  isWorldTileWalkable,
  normalizeWorldType,
  TREE_ACTION_BY_ITEM_TYPE,
  WORLD_MOD_LAYER_OBJECT,
  WORLD_MOD_LAYER_TERRAIN,
  WORLD_TILE_DEFS,
  WORLD_TILE_NAME_BY_VALUE,
  WORLD_TYPE_FOREST,
  worldTileValueForName,
  worldTypeForPortalBuildAction,
} from "./server/world-domain.ts";
import {
  deleteWorldRow,
  deleteWorldRowsWhere,
  insertWorldRow,
  parseWorldDbResult,
  querySingleWorldRow,
  queryWorldRows,
  runInWorldTransaction,
  updateWorldRow,
  upsertWorldRow,
} from "./server/world-db.ts";
import {
  deletePlayerHeartbeat,
  deletePlayerMoveLease,
  deletePlayerPosition,
  getPlayerWorld,
  loadAllPlayerPositions,
  loadPlayerHeartbeatMap,
  loadPlayerHeartbeatTs,
  loadPlayerMoveLease,
  loadPlayerPosition,
  markPlayerPositionInactive,
  normalizePlayerPositionRow,
  savePlayerHeartbeatTs,
  savePlayerMoveLease,
  savePlayerPosition,
  savePlayerWorld,
} from "./server/player-persistence.ts";
import {
  buildActiveWorldPlayers,
  getCanonicalPlayerState,
  getDefaultSpawnPosition,
  loadWorldPlayers,
} from "./server/player-snapshots.ts";
import {
  createEmptyWorldMods,
  loadWorldHouses,
  loadWorldMods,
  loadWorldTrees,
  parseWorldModPayload,
  saveWorldHouses,
  saveWorldModLayer,
  saveWorldTrees,
} from "./server/world-mod-storage.ts";
import {
  broadcastItemChange,
  sendRecipientScopedStreamEvent,
  sendVirtualWorldStreamEvent,
  sendWorldScopedStreamEvent,
} from "./server/stream-broadcast.ts";
import {
  buildOnlinePlayersSnapshot,
  deleteOnlinePresence,
  getEffectiveNick,
  loadPlayerNick,
  savePlayerNick,
  updateOnlinePresence,
  sendGlobalPresenceEvent,
} from "./server/social-state.ts";
import {
  deleteWorldItemById,
  deleteWorldItems,
  ensureWorldItems,
  flattenWorldItems,
  loadPlayerInventory,
  loadWorldItemMeta,
  loadWorldItems,
  nextWorldItemId,
  savePlayerInventory,
  saveWorldItemMeta,
  saveWorldItems,
  upsertWorldItem,
} from "./server/item-storage.ts";
import {
  grantAllItemsForUser as grantAllItemsForUserImpl,
  handleItemActionForUser as handleItemActionForUserImpl,
} from "./server/item-action-helpers.ts";
import {
  switchUserToNewWorld as switchUserToNewWorldImpl,
  switchUserToStartWorld as switchUserToStartWorldImpl,
  switchUserWorld,
} from "./server/world-switch.ts";
import {
  createWorldOfType,
  getEffectiveMap,
  getOrCreatePlayerWorld,
  getWorldDimensions,
  getWorldInfo as getWorldInfoImpl,
  getWorldType,
  resolvePortalDestinationWorldType,
  saveWorldType,
} from "./server/world-bootstrap.ts";
import {
  ensureChatDatabaseSchema,
  ensureLateWorldDatabaseSchema,
  ensureWorldDatabaseSchema,
  runChatSchemaStep,
  runWorldSchemaStep,
} from "./server/schema-setup.ts";
import { allocateEventSeq, getCurrentEventSeq } from "./server/event-seq.ts";
import {
  buildResyncForUser as buildResyncForUserImpl,
  getCurrentWorldStateForHttpUser as getCurrentWorldStateForHttpUserImpl,
  getDirectMessageHistoryForUser as getDirectMessageHistoryForUserImpl,
  heartbeatForUser as heartbeatForUserImpl,
  leaveWorldForUser as leaveWorldForUserImpl,
  listItemsForUser as listItemsForUserImpl,
  listNPCsForUser as listNPCsForUserImpl,
  listOnlinePlayersForUser as listOnlinePlayersForUserImpl,
  listPlayersForUser as listPlayersForUserImpl,
  postDirectMessageForUser as postDirectMessageForUserImpl,
  postWorldChatForUser as postWorldChatForUserImpl,
  setNicknameForUser as setNicknameForUserImpl,
} from "./server/http-handler-helpers.ts";
import {
  getAvailableWorldActions,
  getCurrentWorldStateForUser,
  getMoveOptions,
  getTargetTileFromRotation,
  normalizeMoveDirection,
  rotationForDirection,
  worldTileNameForValue,
} from "./server/current-world-state.ts";
import { movePlayerForUser } from "./server/move-player.ts";
import {
  buildVirtualWorldPageState as buildVirtualWorldPageStateImpl,
  ensureStarterKit,
  escapeHtml,
  renderVirtualWorldPageHtml as renderVirtualWorldPageHtmlImpl,
} from "./server/page-bootstrap.ts";
import { getBootstrapRegistry } from "./server/item-registry.ts";
import { getActionDefinition } from "./server/item-registry.ts";
import {
  bootstrapItemClasses as bootstrapItemClassesImpl,
  refreshItemClassCache as refreshItemClassCacheImpl,
  getAllItemClasses as getAllItemClassesImpl,
  getItemClass as getItemClassImpl,
  upsertItemClass as upsertItemClassImpl,
  deleteItemClass as deleteItemClassImpl,
  getItemStateTemplate as getItemStateTemplateImpl,
  bootstrapActionClasses as bootstrapActionClassesImpl,
  refreshActionClassCache as refreshActionClassCacheImpl,
  getAllActionClasses as getAllActionClassesImpl,
  getActionClass as getActionClassImpl,
  upsertActionClass as upsertActionClassImpl,
  deleteActionClass as deleteActionClassImpl,
} from "./server/item-registry.ts";
import {
  bootstrapLivingClasses as bootstrapLivingClassesImpl,
  deleteLivingClass as deleteLivingClassImpl,
  getAllLivingClasses,
  getLivingClass as getLivingClassImpl,
  refreshLivingClassCache as refreshLivingClassCacheImpl,
  upsertLivingClass as upsertLivingClassImpl,
} from "./server/living-registry.ts";
import {
  bootstrapWorldClasses as bootstrapWorldClassesImpl,
  deleteWorldClass as deleteWorldClassImpl,
  getAllWorldClasses as getAllWorldClassesImpl,
  getWorldClass as getWorldClassImpl,
  isBuiltinWorldClassId as isBuiltinWorldClassIdImpl,
  normalizeWorldClassRecord as normalizeWorldClassRecordImpl,
  refreshWorldClassCache as refreshWorldClassCacheImpl,
  upsertWorldClass as upsertWorldClassImpl,
} from "./server/world-class-storage.ts";
import { performTreeActionForUser as performTreeActionForUserImpl } from "./server/tree-action-helpers.ts";
import {
  virtualWorldActToolHandler as virtualWorldActToolHandlerImpl,
  virtualWorldGetStateToolHandler as virtualWorldGetStateToolHandlerImpl,
  virtualWorldManageItemsToolHandler as virtualWorldManageItemsToolHandlerImpl,
  virtualWorldMoveToolHandler as virtualWorldMoveToolHandlerImpl,
  virtualWorldSetNicknameToolHandler as virtualWorldSetNicknameToolHandlerImpl,
  virtualWorldManageItemClassesToolHandler as virtualWorldManageItemClassesToolHandlerImpl,
  virtualWorldManageActionClassesToolHandler as virtualWorldManageActionClassesToolHandlerImpl,
  virtualWorldManageLivingClassesToolHandler as virtualWorldManageLivingClassesToolHandlerImpl,
  virtualWorldManageWorldClassesToolHandler as virtualWorldManageWorldClassesToolHandlerImpl,
} from "./server/tool-handlers.ts";
import {
  addToDMIndex,
  appendDMMessage,
  appendWorldChatMessage,
  dmConversationKey,
  loadDMHistory,
  loadDMIndex,
  loadWorldChat,
} from "./server/chat-storage.ts";
import {
  buildWorldNPCSnapshot as buildWorldNPCSnapshotImpl,
  loadNPCActiveWorlds,
  loadNPCLastTick,
  loadWorldNPCs,
  markNPCWorldActive,
  saveNPCActiveWorlds,
  saveNPCLastTick,
  saveWorldNPCs,
  ensureWorldNPCs,
} from "./server/npc-storage.ts";
import {
  buildOccupiedNPCMap as buildOccupiedNPCMapImpl,
  buildOccupiedPlayerMap as buildOccupiedPlayerMapImpl,
  normalizeNPCInventoryState as normalizeNPCInventoryStateImpl,
  tickNPCItemInteractions as tickNPCItemInteractionsImpl,
  tickNPCMovement as tickNPCMovementImpl,
  tickNPCTreeActions as tickNPCTreeActionsImpl,
} from "./server/npc-tick-helpers.ts";
import {
  maybeTickWorldNPCs,
  registerRecurringNPCTick,
  runNPCTick,
  tickWorldNPCs,
  tryTickWorldNPCs,
} from "./server/npc-orchestration.ts";
import { registerVirtualWorldRuntime as registerVirtualWorldRuntimeImpl } from "./server/runtime-registration.ts";
import { generateWorldMap } from "./server/world-map.ts";
import {
  DM_MAX,
  LEASE_TTL_MS,
  NPC_ACTIVE_WORLD_TTL_MS,
  NPC_MAX_COUNT,
  NPC_MIN_COUNT,
  NPC_TICK_LEASE_MS,
  NPC_TICK_MS,
  VIRTUAL_WORLD_EVENTS_STREAM_PATH,
  VWORLD_ACTION_CLASS_TABLE,
  VWORLD_CHAT_TABLE,
  VWORLD_DM_INDEX_TABLE,
  VWORLD_DM_TABLE,
  VWORLD_ITEM_CLASS_TABLE,
  VWORLD_LIVING_CLASS_TABLE,
  VWORLD_NPC_TABLE,
  VWORLD_NPC_TICK_LEASE_TABLE,
  VWORLD_NPC_TICK_TABLE,
  VWORLD_WORLD_CLASS_TABLE,
  WORLD_CHAT_MAX,
  WORLD_ITEM_SPAWN_COUNT,
} from "./server/runtime-config.ts";
import {
  nextDiagRequestId,
  vwLog,
  summarizeInventory,
  summarizeItems,
  vwDiag,
} from "./server/diagnostics.ts";

import {
  itemClassesHandler as itemClassesHandlerImpl,
  createItemClassHandler as createItemClassHandlerImpl,
  updateItemClassHandler as updateItemClassHandlerImpl,
  deleteItemClassHandler as deleteItemClassHandlerImpl,
  actionClassesHandler as actionClassesHandlerImpl,
  createActionClassHandler as createActionClassHandlerImpl,
  updateActionClassHandler as updateActionClassHandlerImpl,
  deleteActionClassHandler as deleteActionClassHandlerImpl,
  livingClassesHandler as livingClassesHandlerImpl,
  createLivingClassHandler as createLivingClassHandlerImpl,
  updateLivingClassHandler as updateLivingClassHandlerImpl,
  deleteLivingClassHandler as deleteLivingClassHandlerImpl,
  worldClassesHandler as worldClassesHandlerImpl,
  createWorldClassHandler as createWorldClassHandlerImpl,
  updateWorldClassHandler as updateWorldClassHandlerImpl,
  deleteWorldClassHandler as deleteWorldClassHandlerImpl,
} from "./server/class-crud-handlers.ts";
import {
  getVirtualWorldPage as getVirtualWorldPageImpl,
  virtualWorldEventsStreamCustomizer as virtualWorldEventsStreamCustomizerImpl,
  itemsHandler as itemsHandlerImpl,
  itemActionHandler as itemActionHandlerImpl,
  craftHandler as craftHandlerImpl,
  setNicknameHandler as setNicknameHandlerImpl,
  onlinePlayersHandler as onlinePlayersHandlerImpl,
  chatHandler as chatHandlerImpl,
  dmHandler as dmHandlerImpl,
  dmHistoryHandler as dmHistoryHandlerImpl,
  cheatItemsHandler as cheatItemsHandlerImpl,
  moveHandler as moveHandlerImpl,
  leaveHandler as leaveHandlerImpl,
  heartbeatHandler as heartbeatHandlerImpl,
  newWorldHandler as newWorldHandlerImpl,
  startWorldHandler as startWorldHandlerImpl,
  playersHandler as playersHandlerImpl,
  resyncHandler as resyncHandlerImpl,
  currentWorldHandler as currentWorldHandlerImpl,
  npcsHandler as npcsHandlerImpl,
  treeActionHandler as treeActionHandlerImpl,
} from "./server/route-handlers.ts";

// Virtual World - 2.5D block world with Three.js
// Move with WASD or arrow keys. Walls and trees block movement.

// ── Server-side world generation ─────────────────────────────────────────────
var npcTickerStarted = false;
var npcTickOwnerId =
  "npc-tick-" +
  Date.now().toString(36) +
  "-" +
  Math.random().toString(36).slice(2);

// ── Player nicknames ──────────────────────────────────────────────────────────

// ── Global online presence ────────────────────────────────────────────────────

// ── World chat ────────────────────────────────────────────────────────────────

// ── Direct messages ───────────────────────────────────────────────────────────

/**
 * @param {*} _context
 */
function runNPCTickScheduledJob(_context) {
  runNPCTick();
}

function startNPCTicker() {
  if (npcTickerStarted) return;
  npcTickerStarted = true;
  registerRecurringNPCTick();
}

// ── Nickname handler ─────────────────────────────────────────────────────────

// ── Online players handler ────────────────────────────────────────────────────

// ── World chat handler ────────────────────────────────────────────────────────

// ── Direct message handlers ───────────────────────────────────────────────────

/**
 * @param {string} userId
 * @returns {boolean}
 */
function userHasCreatorStone(userId) {
  var inv = loadPlayerInventory(userId);
  return !!findFirstLivingItemByTypes(inv, ["creator_stone"]);
}

// ── Item class CRUD handlers ───────────────────────────────────────────────────

// ── Action class CRUD handlers ───────────────────────────────────────────

// ── Living class CRUD handlers ────────────────────────────────────────────

// ── World class CRUD handlers ──────────────────────────────────────────────

// ── Named handler delegates (runtime resolves these by name) ─────────────────
/** @param {*} context */
function itemClassesHandler(context) {
  return itemClassesHandlerImpl(context);
}
/** @param {*} context */
function createItemClassHandler(context) {
  return createItemClassHandlerImpl(context);
}
/** @param {*} context */
function updateItemClassHandler(context) {
  return updateItemClassHandlerImpl(context);
}
/** @param {*} context */
function deleteItemClassHandler(context) {
  return deleteItemClassHandlerImpl(context);
}
/** @param {*} context */
function actionClassesHandler(context) {
  return actionClassesHandlerImpl(context);
}
/** @param {*} context */
function createActionClassHandler(context) {
  return createActionClassHandlerImpl(context);
}
/** @param {*} context */
function updateActionClassHandler(context) {
  return updateActionClassHandlerImpl(context);
}
/** @param {*} context */
function deleteActionClassHandler(context) {
  return deleteActionClassHandlerImpl(context);
}
/** @param {*} context */
function livingClassesHandler(context) {
  return livingClassesHandlerImpl(context);
}
/** @param {*} context */
function createLivingClassHandler(context) {
  return createLivingClassHandlerImpl(context);
}
/** @param {*} context */
function updateLivingClassHandler(context) {
  return updateLivingClassHandlerImpl(context);
}
/** @param {*} context */
function deleteLivingClassHandler(context) {
  return deleteLivingClassHandlerImpl(context);
}
/** @param {*} context */
function worldClassesHandler(context) {
  return worldClassesHandlerImpl(context);
}
/** @param {*} context */
function createWorldClassHandler(context) {
  return createWorldClassHandlerImpl(context);
}
/** @param {*} context */
function updateWorldClassHandler(context) {
  return updateWorldClassHandlerImpl(context);
}
/** @param {*} context */
function deleteWorldClassHandler(context) {
  return deleteWorldClassHandlerImpl(context);
}

/** @param {*} context */
function getVirtualWorldPage(context) {
  return getVirtualWorldPageImpl(context);
}
/** @param {*} context */
function virtualWorldEventsStreamCustomizer(context) {
  return virtualWorldEventsStreamCustomizerImpl(context);
}
/** @param {*} context */
function itemsHandler(context) {
  return itemsHandlerImpl(context);
}
/** @param {*} context */
function itemActionHandler(context) {
  return itemActionHandlerImpl(context);
}
/** @param {*} context */
function craftHandler(context) {
  return craftHandlerImpl(context);
}
/** @param {*} context */
function setNicknameHandler(context) {
  return setNicknameHandlerImpl(context);
}
/** @param {*} context */
function onlinePlayersHandler(context) {
  return onlinePlayersHandlerImpl(context);
}
/** @param {*} context */
function chatHandler(context) {
  return chatHandlerImpl(context);
}
/** @param {*} context */
function dmHandler(context) {
  return dmHandlerImpl(context);
}
/** @param {*} context */
function dmHistoryHandler(context) {
  return dmHistoryHandlerImpl(context);
}
/** @param {*} context */
function cheatItemsHandler(context) {
  return cheatItemsHandlerImpl(context);
}
/** @param {*} context */
function moveHandler(context) {
  return moveHandlerImpl(context);
}
/** @param {*} context */
function leaveHandler(context) {
  return leaveHandlerImpl(context);
}
/** @param {*} context */
function heartbeatHandler(context) {
  return heartbeatHandlerImpl(context);
}
/** @param {*} context */
function newWorldHandler(context) {
  return newWorldHandlerImpl(context);
}
/** @param {*} context */
function startWorldHandler(context) {
  return startWorldHandlerImpl(context);
}
/** @param {*} context */
function playersHandler(context) {
  return playersHandlerImpl(context);
}
/** @param {*} context */
function resyncHandler(context) {
  return resyncHandlerImpl(context);
}
/** @param {*} context */
function currentWorldHandler(context) {
  return currentWorldHandlerImpl(context);
}
/** @param {*} context */
function npcsHandler(context) {
  return npcsHandlerImpl(context);
}
/** @param {*} context */
function treeActionHandler(context) {
  return treeActionHandlerImpl(context);
}

/** @param {*} context */
function virtualWorldGetStateToolHandler(context) {
  return virtualWorldGetStateToolHandlerImpl(context);
}

/** @param {*} context */
function virtualWorldMoveToolHandler(context) {
  return virtualWorldMoveToolHandlerImpl(context);
}

/** @param {*} context */
function virtualWorldManageItemsToolHandler(context) {
  return virtualWorldManageItemsToolHandlerImpl(context);
}

/** @param {*} context */
function virtualWorldActToolHandler(context) {
  return virtualWorldActToolHandlerImpl(context);
}

/** @param {*} context */
function virtualWorldSetNicknameToolHandler(context) {
  return virtualWorldSetNicknameToolHandlerImpl(context);
}

/** @param {*} context */
function virtualWorldManageItemClassesToolHandler(context) {
  return virtualWorldManageItemClassesToolHandlerImpl(context);
}

/** @param {*} context */
function virtualWorldManageActionClassesToolHandler(context) {
  return virtualWorldManageActionClassesToolHandlerImpl(context);
}

/** @param {*} context */
function virtualWorldManageLivingClassesToolHandler(context) {
  return virtualWorldManageLivingClassesToolHandlerImpl(context);
}

/** @param {*} context */
function virtualWorldManageWorldClassesToolHandler(context) {
  return virtualWorldManageWorldClassesToolHandlerImpl(context);
}

function init() {
  ensureWorldDatabaseSchema();
  ensureChatDatabaseSchema();
  bootstrapItemClassesImpl();
  bootstrapActionClassesImpl();
  bootstrapLivingClassesImpl();
  bootstrapWorldClassesImpl();
  vwDiag("init", {
    item_class_table: VWORLD_ITEM_CLASS_TABLE,
    action_class_table: VWORLD_ACTION_CLASS_TABLE,
    living_class_table: VWORLD_LIVING_CLASS_TABLE,
    world_class_table: VWORLD_WORLD_CLASS_TABLE,
  });
  startNPCTicker();
  registerVirtualWorldRuntimeImpl();
}
