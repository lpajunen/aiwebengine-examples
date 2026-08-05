import { getWorldNPCSnapshot } from "./npc-orchestration.ts";
import { WORLD_TILE_DEFS } from "./world-domain.ts";
import {
  ActiveActionEntry,
  getActiveActionsForUser,
} from "./active-actions.ts";
import { loadDMIndex, loadWorldChat } from "./chat-storage.ts";
import {
  ensureWorldItems,
  loadPlayerInventory,
  loadWorldItems,
  savePlayerInventory,
} from "./item-storage.ts";
import { getAllLivingClasses } from "./living-registry.ts";
import { markNPCWorldActive } from "./npc-storage.ts";
import {
  loadPlayerPosition,
  savePlayerPosition,
} from "./player-persistence.ts";
import { getDefaultSpawnPosition } from "./player-snapshots.ts";
import {
  buildOnlinePlayersSnapshot,
  getEffectiveNick,
  loadPlayerNick,
  savePlayerNick,
  updateOnlinePresence,
} from "./social-state.ts";
import {
  generateMap,
  getOrCreatePlayerWorld,
  getWorldInfo,
} from "./world-bootstrap.ts";
import { getAllWorldClasses } from "./world-class-storage.ts";
import {
  getWorldFlavorTextByIndex,
  getWorldFlavorTextIndex,
  OAK_CENTER_COL,
  OAK_CENTER_ROW,
} from "./world-domain.ts";
import {
  loadWorldHouses,
  loadWorldMods,
  loadWorldTrees,
} from "./world-mod-storage.ts";
import { getBootstrapRegistry } from "./item-registry.ts";
import { getAllLivingItems, LivingState } from "./world-domain.ts";

type PageState = {
  map: number[][];
  worldMods: any;
  treeMods: any;
  houseMods: any;
  worldItems: any;
  playerInventory: any;
  npcs: any;
  worldId: string;
  userId: string;
  playerNick: string;
  authName: string;
  onlinePlayers: any[];
  initialChat: any[];
  initialDmIndex: string[];
  initRow: number;
  initCol: number;
  initSeq: number;
  initRotation: number;
  worldFlavorText: string;
  worldFlavorTextIndex: number;
  worldClassId: string;
  // World-independent registries — present when building the full page, omitted
  // by the in-place world-swap endpoint (the client already holds them from
  // boot). See buildVirtualWorldPageState's includeRegistries option.
  worldTileDefs?: any;
  itemRegistry?: any;
  livingRegistry?: any;
  worldClassRegistry?: any[];
  activeActions: ActiveActionEntry[];
  oakCenterRow: number;
  oakCenterCol: number;
};

export function ensureStarterKit(userId: string): void {
  const inv = loadPlayerInventory(userId);
  const allItems = getAllLivingItems(inv);
  const hasKit = allItems.some(function (item) {
    return item && item.type === "starter_kit";
  });
  if (!hasKit) {
    if (!Array.isArray(inv.bag)) {
      inv.bag = [];
    }
    inv.bag.push({
      id: "starter_kit_" + userId,
      type: "starter_kit",
      created_at: Date.now(),
      non_droppable: true,
    });
    savePlayerInventory(userId, inv);
  }
}

export function escapeHtml(value: string): string {
  return String(value || "").replace(/[<>&]/g, function (c) {
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    return "&amp;";
  });
}

export function buildVirtualWorldPageState(
  userId: string,
  authName: string,
  options?: { includeRegistries?: boolean },
): PageState {
  const worldId = getOrCreatePlayerWorld(userId);
  markNPCWorldActive(worldId);
  ensureStarterKit(userId);
  const map = generateMap(worldId);
  const worldMods = loadWorldMods(worldId);
  const treeMods = loadWorldTrees(worldId);
  const houseMods = loadWorldHouses(worldId);
  ensureWorldItems(worldId);
  const worldItems = loadWorldItems(worldId);
  const playerInventory = loadPlayerInventory(userId);
  const npcs = getWorldNPCSnapshot(worldId);
  const savedPos = loadPlayerPosition(userId);
  const mapRows = map.length;
  const mapCols = map[0] ? map[0].length : 0;
  // A world's dimensions can shrink after a position was saved (e.g. the oak
  // world's village migration to 30x30) — discard an out-of-bounds saved
  // position rather than spawning the player off the generated map.
  const hasSavedPos =
    !!savedPos &&
    savedPos.world_id === String(worldId) &&
    Number(savedPos.row) >= 0 &&
    Number(savedPos.row) < mapRows &&
    Number(savedPos.col) >= 0 &&
    Number(savedPos.col) < mapCols;
  const initialPos = hasSavedPos
    ? savedPos
    : getDefaultSpawnPosition(worldId, userId);
  if (!hasSavedPos) {
    savePlayerPosition(userId, worldId, {
      row: initialPos.row,
      col: initialPos.col,
      seq: initialPos.seq || 0,
      rotation: Number.isFinite(Number(initialPos.rotation))
        ? Number(initialPos.rotation)
        : 0,
      ts: Date.now(),
    });
  }

  let playerNick = loadPlayerNick(userId);
  if (!playerNick && authName) {
    savePlayerNick(userId, authName);
    playerNick = authName;
  }

  updateOnlinePresence(userId, worldId, "");

  const activeActions = getActiveActionsForUser(userId);

  const includeRegistries = !options || options.includeRegistries !== false;

  const state: PageState = {
    map: map,
    worldMods: worldMods,
    treeMods: treeMods,
    houseMods: houseMods,
    worldItems: worldItems,
    playerInventory: playerInventory,
    npcs: npcs,
    worldId: worldId,
    userId: userId,
    playerNick: playerNick,
    authName: authName,
    onlinePlayers: buildOnlinePlayersSnapshot(),
    initialChat: loadWorldChat(worldId).slice(-50),
    initialDmIndex: loadDMIndex(userId),
    initRow: initialPos.row,
    initCol: initialPos.col,
    initSeq: initialPos.seq || 0,
    initRotation: Number.isFinite(Number(initialPos.rotation))
      ? Number(initialPos.rotation)
      : 0,
    worldFlavorText: getWorldFlavorTextByIndex(
      getWorldFlavorTextIndex(worldId),
    ),
    worldFlavorTextIndex: getWorldFlavorTextIndex(worldId),
    worldClassId: getWorldInfo(worldId).world_class_id,
    activeActions: activeActions,
    oakCenterRow: OAK_CENTER_ROW,
    oakCenterCol: OAK_CENTER_COL,
  };

  // The item/living/world-class registries and tile defs are world-independent
  // and already held by the client from page boot, so the in-place world-swap
  // endpoint omits them (see worldStateHandler) — this both shrinks the swap
  // payload and skips the avoidable server work of assembling them.
  if (includeRegistries) {
    const livingClasses = getAllLivingClasses();
    state.worldTileDefs = WORLD_TILE_DEFS;
    state.itemRegistry = getBootstrapRegistry();
    state.livingRegistry = {
      classes: Array.isArray(livingClasses)
        ? livingClasses.reduce(function (acc: Record<string, any>, cls: any) {
            if (!cls || typeof cls.id !== "string") return acc;
            acc[String(cls.id)] = cls;
            return acc;
          }, {})
        : {},
    };
    state.worldClassRegistry = getAllWorldClasses();
  }

  return state;
}

export function renderVirtualWorldPageHtml(state: PageState): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Virtual World</title>
  <link rel="stylesheet" href="/virtual-world/styles.css">
</head>
<body class="game">
  <div id="hud-left-col">
    <div class="hud" id="hud-pos">
      <span id="hud-title-row"><strong data-i18n-key="hud.title">Virtual World</strong><span id="hud-editor-buttons"><button id="btn-item-classes" onclick="toggleItemClassPanel()" data-i18n-title="hud.item_types" title="Item types">📦</button><button id="btn-action-classes" onclick="toggleActionClassPanel()" data-i18n-title="hud.action_types" title="Action types">⚡</button><button id="btn-living-classes" onclick="toggleLivingClassPanel()" data-i18n-title="hud.living_types" title="Living types">🧬</button><button id="btn-world-classes" onclick="toggleWorldClassPanel()" data-i18n-title="hud.world_types" title="World types">🌍</button></span><button id="btn-world-info" onclick="toggleWorldInfoPanel()" data-i18n-title="hud.world_info" title="World info">ℹ️</button></span>
      <span id="hud-nick-row"><span id="nick-display">${escapeHtml(state.playerNick || state.authName)}</span><button id="nick-edit-btn" onclick="startNickEdit()" data-i18n-title="hud.rename" title="Rename">✏️</button><button id="btn-locale-toggle" onclick="toggleLocale()" data-i18n-title="hud.switch_language" title="Switch language">🌐</button><span id="nick-edit-row" style="display:none;"><input id="nick-input" type="text" maxlength="24"><button onclick="commitNickEdit()" data-i18n-title="hud.save" title="Save">✓</button><button onclick="cancelNickEdit()" data-i18n-title="hud.cancel" title="Cancel">✗</button></span></span><br>
      <span data-i18n-key="hud.world_label">World:</span> <span id="hud-world-id">${state.worldId}</span> (<span id="pos-col">${state.initCol}</span>, <span id="pos-row">${state.initRow}</span>)<br>
      <span data-i18n-key="hud.stats_label">Stats:</span>
      <span class="hud-stat" data-i18n-title="living.value.level" title="Level"><span data-i18n-key="hud.level_abbr">Lvl:</span> <span id="hud-level">-</span></span>
      <span class="hud-stat" data-i18n-title="living.value.current_hit_points" title="Hit points"><span data-i18n-key="hud.hp_abbr">HP:</span> <span id="hud-hp">-/-</span></span>
      <span class="hud-stat" data-i18n-title="living.value.armor_class" title="Armor class"><span data-i18n-key="hud.ac_abbr">AC:</span> <span id="hud-ac">-</span></span>
      <span class="hud-stat" data-i18n-title="living.value.weapon_class" title="Weapon class"><span data-i18n-key="hud.wc_abbr">WC:</span> <span id="hud-wc">-</span></span>
      <span class="hud-stat" data-i18n-title="living.value.fatigue" title="Fatigue"><span data-i18n-key="hud.fatigue_abbr">F:</span> <span id="hud-fatigue">-</span></span>
      <span class="hud-stat" data-i18n-title="living.value.experience" title="Experience"><span data-i18n-key="hud.xp_abbr">XP:</span> <span id="hud-xp">-</span></span>
    </div>

    <div class="hud" id="hud-tile-detail" aria-live="polite">
      <div class="panel-header">
        <span class="panel-title" id="tile-detail-title">Square (0, 0)</span>
        <button class="panel-close" onclick="closeTileDetail()" data-i18n-title="panel.close" title="Close">×</button>
      </div>
      <div id="tile-detail-body"></div>
    </div>
  </div>

  <div class="hud" id="hud-world-info-panel" style="display:none;">
    <div class="panel-header">
      <span class="panel-title" data-i18n-key="panel.world_info">World Info</span>
      <button class="panel-close" onclick="closeWorldInfoPanel()" data-i18n-title="panel.close" title="Close">×</button>
    </div>
    <div class="world-info-type" id="world-info-type"></div>
    <div class="world-info-desc" id="world-info-desc" data-i18n-key="world.flavor_text_${state.worldFlavorTextIndex}">${escapeHtml(state.worldFlavorText)}</div>
    <strong class="world-info-legend-title" data-i18n-key="legend.title">Legend</strong>
    <div class="leg" id="legend-ground"><div class="leg-box" style="background:#7ab648;"></div> <span data-i18n-key="legend.forest_floor">Forest Floor</span></div>
    <div class="leg"><div class="leg-box" style="background:#355c34;"></div> <span data-i18n-key="legend.spruce_thicket">Spruce Thicket</span></div>
    <div class="leg"><div class="leg-box" style="background:#2d8a3e;"></div> <span data-i18n-key="legend.pine_tree">Pine Tree</span></div>
    <div class="leg"><div class="leg-box" style="background:#4f91c9;"></div> <span data-i18n-key="legend.water">Water</span></div>
    <div class="leg"><div class="leg-box" style="background:#7f8892;"></div> <span data-i18n-key="legend.rock_mountain">Rock / Mountain</span></div>
    <div class="leg" id="legend-you"><div class="leg-box" style="background:#2980b9;"></div> <span data-i18n-key="legend.you">You</span></div>
  </div>

  <div class="hud" id="hud-keys">
    <span data-i18n-key="controls.move_label">Move:</span> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> &nbsp;<span data-i18n-key="controls.or">or</span>&nbsp; <kbd>&uarr;</kbd><kbd>&larr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd>
    &nbsp;&nbsp;|&nbsp;&nbsp; <span data-i18n-key="controls.camera_label">Camera:</span> <kbd>drag</kbd> <span data-i18n-key="controls.to_orbit">to orbit</span> &nbsp; <kbd>scroll</kbd> <span data-i18n-key="controls.to_zoom">to zoom</span>
  </div>

  <div class="hud" id="hud-auth-status" aria-live="polite"></div>

  <div class="hud" id="hud-toast" aria-live="polite"></div>

  <div class="hud" id="hud-active-actions" style="display:none;"></div>

  <div class="hud" id="hud-tree-actions">
    <button id="btn-use" onclick="useItem()"><span data-i18n-key="hud.use">Use</span></button>
    <button id="btn-pick" onclick="pickItemsOnTile()">📦 <span data-i18n-key="hud.pick">Pick</span></button>
    <button id="btn-items" onclick="toggleInventoryPanel()">🎒 <span data-i18n-key="hud.items">Items</span></button>
    <button id="btn-stats" onclick="toggleStatisticsPanel()">📊 <span data-i18n-key="hud.stats">Stats</span></button>
    <button id="btn-players" onclick="togglePlayersPanel()">👥 <span data-i18n-key="hud.players">Players</span></button>
    <button id="btn-chat" onclick="toggleChatPanel()">💬 <span data-i18n-key="hud.chat">Chat</span><span class="unread-badge" id="chat-unread-badge"></span></button>
  </div>

  <div class="hud" id="hud-use-picker">
    <div class="panel-header">
      <span class="panel-title" data-i18n-key="panel.choose_action">Choose Action</span>
      <button class="panel-close" onclick="closeUsePicker()" data-i18n-title="panel.close" title="Close">×</button>
    </div>
    <div id="use-picker-actions"></div>
  </div>

  <div class="hud" id="hud-inventory-panel">
    <div class="panel-header">
      <span class="panel-title" data-i18n-key="panel.inventory">Inventory</span>
      <button class="panel-close" onclick="closeInventoryPanel()" data-i18n-title="panel.close" title="Close">×</button>
    </div>
    <div class="inv-slots" id="inv-slots"></div>
    <div id="inv-bag-list"></div>
    <div id="inv-footer">
      <span id="inv-count">0 items</span>
    </div>
  </div>

  <div class="hud" id="hud-container-panel">
    <div class="panel-header">
      <span class="panel-title" id="container-panel-title" data-i18n-key="panel.container">Container</span>
      <button class="panel-close" onclick="closeContainerPanel()" data-i18n-title="panel.close" title="Close">×</button>
    </div>
    <div id="container-list"></div>
  </div>

  <div class="hud" id="hud-statistics-panel">
    <div class="panel-header">
      <span class="panel-title" data-i18n-key="panel.statistics">Statistics</span>
      <button class="panel-close" onclick="closeStatisticsPanel()" data-i18n-title="panel.close" title="Close">×</button>
    </div>
    <div id="stats-list"></div>
  </div>

  <div class="hud" id="hud-players-panel">
    <div class="panel-header">
      <span class="panel-title" data-i18n-key="panel.players_online">Players Online</span>
      <button class="panel-close" onclick="closePlayersPanel()" data-i18n-title="panel.close" title="Close">×</button>
    </div>
    <div id="players-list-wrap">
      <table class="players-table">
        <thead><tr>
          <th data-i18n-key="players.name">Name</th><th data-i18n-key="players.world">World</th><th data-i18n-key="players.online_since">Online since</th><th data-i18n-key="players.last_active">Last active</th><th></th>
        </tr></thead>
        <tbody id="players-table-body"></tbody>
      </table>
    </div>
  </div>

  <div class="hud" id="hud-chat-panel">
    <div class="panel-header">
      <span class="panel-title" id="chat-panel-title" data-i18n-key="panel.chat">Chat</span>
      <button class="panel-close" onclick="closeChatPanel()" data-i18n-title="panel.close" title="Close">×</button>
    </div>
    <div class="chat-tabs">
      <button class="chat-tab active" id="chat-tab-world" onclick="switchChatTab('world')" data-i18n-key="chat.world_tab">World</button>
      <button class="chat-tab" id="chat-tab-dm" onclick="switchChatTab('dm')"><span data-i18n-key="chat.dm_tab">Direct Messages</span><span class="unread-badge" id="dm-tab-badge"></span></button>
    </div>
    <div class="chat-content" id="chat-content-world">
      <div class="chat-msgs" id="world-chat-msgs"></div>
      <div class="chat-input-row">
        <input type="text" id="world-chat-input" data-i18n-placeholder="chat.say_something" placeholder="Say something…" maxlength="500" onkeydown="if(event.key==='Enter')sendWorldChatMessage()">
        <button onclick="sendWorldChatMessage()" data-i18n-key="chat.send">Send</button>
      </div>
    </div>
    <div class="chat-content hidden" id="chat-content-dm">
      <div id="dm-thread-view" style="display:none;flex:1;min-height:0;flex-direction:column;">
        <button class="dm-back" onclick="showDMConvoList()" data-i18n-key="chat.back">← Back</button>
        <div class="chat-msgs" id="dm-thread-msgs"></div>
        <div class="chat-input-row">
          <input type="text" id="dm-chat-input" data-i18n-placeholder="chat.dm_placeholder" placeholder="Send a direct message…" maxlength="500" onkeydown="if(event.key==='Enter')sendDirectMessage()">
          <button onclick="sendDirectMessage()" data-i18n-key="chat.send">Send</button>
        </div>
      </div>
      <div id="dm-convo-list" class="dm-convos" style="overflow-y:auto;flex:1;min-height:0;"></div>
    </div>
  </div>

  <div class="hud" id="hud-item-class-panel">
    <div class="panel-header">
      <span class="panel-title" data-i18n-key="panel.item_types">Item Types</span>
      <button class="panel-close" onclick="closeItemClassPanel()" data-i18n-title="panel.close" title="Close">×</button>
    </div>
    <div id="item-class-list" class="class-list"></div>
    <div class="class-form">
      <div class="class-form-title" id="item-class-form-title" data-i18n-key="class_editor.new_item_type">New item type</div>
      <div class="class-form-fields">
        <label><span data-i18n-key="class_editor.id_label">ID</span> <input id="ic-id" type="text" placeholder="my_item" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.label_label">Name (English)</span> <input id="ic-label" type="text" placeholder="My Item" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.name_fi_label">Name (Finnish)</span> <input id="ic-name-fi" type="text" placeholder="Esineeni" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.kind_label">Kind</span>
          <select id="ic-kind">
            <option value="tool">tool</option>
            <option value="material">material</option>
            <option value="resource">resource</option>
            <option value="structure">structure</option>
            <option value="furniture">furniture</option>
          </select>
        </label>
        <label><span data-i18n-key="class_editor.size_label">Size</span>
          <select id="ic-size">
            <option value="tiny" data-i18n-key="size.tiny">Tiny</option>
            <option value="small" data-i18n-key="size.small">Small</option>
            <option value="medium" data-i18n-key="size.medium">Medium</option>
            <option value="large" data-i18n-key="size.large">Large</option>
            <option value="huge" data-i18n-key="size.huge">Huge</option>
          </select>
        </label>
        <label><input id="ic-non-droppable" type="checkbox"> <span data-i18n-key="class_editor.non_droppable">Non-droppable</span></label>
        <label><input id="ic-non-pickable" type="checkbox"> <span data-i18n-key="class_editor.non_pickable">Non-pickable</span></label>
        <label><span data-i18n-key="class_editor.action_ids_label">Action IDs (comma-sep)</span> <input id="ic-action-ids" type="text" placeholder="tune,play_tune" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.state_template_label">State template (JSON)</span> <textarea id="ic-state-template" rows="3" placeholder='{"key": 0}'></textarea></label>
      </div>
      <div class="class-form-actions">
        <button onclick="submitItemClassForm()" data-i18n-key="class_editor.save">Save</button>
        <button onclick="cancelItemClassEdit()" data-i18n-key="class_editor.cancel">Cancel</button>
      </div>
    </div>
  </div>

  <div class="hud" id="hud-action-class-panel">
    <div class="panel-header">
      <span class="panel-title" data-i18n-key="panel.action_types">Action Types</span>
      <button class="panel-close" onclick="closeActionClassPanel()" data-i18n-title="panel.close" title="Close">×</button>
    </div>
    <div id="action-class-list" class="class-list"></div>
    <div class="class-form">
      <div class="class-form-title" id="action-class-form-title" data-i18n-key="class_editor.new_action_type">New action type</div>
      <div class="class-form-fields">
        <label><span data-i18n-key="class_editor.id_label">ID</span> <input id="ac-id" type="text" placeholder="my_action" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.label_label">Name (English)</span> <input id="ac-label" type="text" placeholder="My Action" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.name_fi_label">Name (Finnish)</span> <input id="ac-name-fi" type="text" placeholder="Toimintoni" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.target_kind_label">Target kind</span>
          <select id="ac-target-kind">
            <option value="self">self</option>
            <option value="facing_tile">facing_tile</option>
            <option value="current_tile">current_tile</option>
            <option value="facing_or_current_tile">facing_or_current_tile</option>
            <option value="item">item</option>
            <option value="living">living</option>
            <option value="item_nearby">item_nearby</option>
            <option value="living_nearby">living_nearby</option>
            <option value="inventory">inventory</option>
          </select>
        </label>
        <label><span data-i18n-key="class_editor.source_items_label">Source items (comma-sep)</span> <input id="ac-source-items" type="text" placeholder="kantele" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.logic_spec_label">Logic spec (JSON)</span> <textarea id="ac-logic-spec" rows="3" placeholder='{"conditions":[],"effects":[]}'></textarea></label>
      </div>
      <div class="class-form-actions">
        <button onclick="submitActionClassForm()" data-i18n-key="class_editor.save">Save</button>
        <button onclick="cancelActionClassEdit()" data-i18n-key="class_editor.cancel">Cancel</button>
      </div>
    </div>
  </div>

  <div class="hud" id="hud-living-class-panel">
    <div class="panel-header">
      <span class="panel-title" data-i18n-key="panel.living_types">Living Types</span>
      <button class="panel-close" onclick="closeLivingClassPanel()" data-i18n-title="panel.close" title="Close">×</button>
    </div>
    <div id="living-class-list" class="class-list"></div>
    <div class="class-form">
      <div class="class-form-title" id="living-class-form-title" data-i18n-key="class_editor.new_living_type">New living type</div>
      <div class="class-form-fields">
        <label><span data-i18n-key="class_editor.id_label">ID</span> <input id="lc-id" type="text" placeholder="my_creature" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.label_label">Name (English)</span> <input id="lc-label" type="text" placeholder="My Creature" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.name_fi_label">Name (Finnish)</span> <input id="lc-name-fi" type="text" placeholder="Olentoni" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.kind_label">Kind</span>
          <select id="lc-kind">
            <option value="player">player</option>
            <option value="npc">npc</option>
            <option value="creature">creature</option>
          </select>
        </label>
        <label><span data-i18n-key="class_editor.size_label">Size</span>
          <select id="lc-size">
            <option value="tiny" data-i18n-key="size.tiny">Tiny</option>
            <option value="small" data-i18n-key="size.small">Small</option>
            <option value="medium" data-i18n-key="size.medium">Medium</option>
            <option value="large" data-i18n-key="size.large">Large</option>
            <option value="huge" data-i18n-key="size.huge">Huge</option>
          </select>
        </label>
        <label><span data-i18n-key="class_editor.visual_style_label">Visual style</span>
          <select id="lc-visual-style">
            <option value="humanoid" data-i18n-key="visual_style.humanoid">Humanoid (two legs)</option>
            <option value="wolfish" data-i18n-key="visual_style.wolfish">Wolfish (lean four legs)</option>
            <option value="bearish" data-i18n-key="visual_style.bearish">Bearish (bulky four legs)</option>
            <option value="doggish" data-i18n-key="visual_style.doggish">Doggish (small four legs)</option>
            <option value="birdlike" data-i18n-key="visual_style.birdlike">Birdlike (two-legged bird)</option>
            <option value="equine" data-i18n-key="visual_style.equine">Equine (horse-like)</option>
          </select>
        </label>
        <label><span data-i18n-key="class_editor.color_label">Color (blank = automatic)</span>
          <span class="class-form-color"><input id="lc-color" type="text" placeholder="#a0522d" autocomplete="off" oninput="syncLivingClassColorPicker()"><input id="lc-color-picker" type="color" value="#a0522d" data-i18n-title="class_editor.color_pick" title="Pick a color" oninput="syncLivingClassColorFromPicker()"><button type="button" onclick="clearLivingClassColor()" data-i18n-key="class_editor.color_auto">Auto</button></span>
        </label>
        <label><span data-i18n-key="class_editor.slot_definitions_label">Slot definitions (JSON)</span> <textarea id="lc-slot-definitions" rows="3" placeholder='[{"id":"left_hand","labelKey":"living.slot.left_hand","fallbackLabel":"Left hand","tags":["hand"]}]'></textarea></label>
        <label><span data-i18n-key="class_editor.value_template_label">Value template (JSON)</span> <textarea id="lc-value-template" rows="2" placeholder='{"fatigue": 0}'></textarea></label>
        <label><span data-i18n-key="class_editor.value_schema_label">Value schema (JSON)</span> <textarea id="lc-value-schema" rows="3" placeholder='{"fatigue":{"kind":"number","min":0,"max":100}}'></textarea></label>
        <label><input id="lc-aggressive" type="checkbox"> <span data-i18n-key="class_editor.aggressive">Aggressive (NPC auto-attacks players on its tile)</span></label>
        <label><span data-i18n-key="class_editor.default_items_label">Default items (comma-separated types; weapons are auto-wielded)</span> <input id="lc-default-items" type="text" placeholder="shortbow"></label>
      </div>
      <div class="class-form-actions">
        <button onclick="submitLivingClassForm()" data-i18n-key="class_editor.save">Save</button>
        <button onclick="cancelLivingClassEdit()" data-i18n-key="class_editor.cancel">Cancel</button>
      </div>
    </div>
  </div>

  <div class="hud" id="hud-world-class-panel">
    <div class="panel-header">
      <span class="panel-title" data-i18n-key="panel.world_types">World Types</span>
      <button class="panel-close" onclick="closeWorldClassPanel()" data-i18n-title="panel.close" title="Close">×</button>
    </div>
    <div id="world-class-list" class="class-list"></div>
    <div class="class-form">
      <div class="class-form-title" id="world-class-form-title" data-i18n-key="class_editor.new_world_type">New world type</div>
      <div class="class-form-fields">
        <label><span data-i18n-key="class_editor.id_label">ID</span> <input id="wc-id" type="text" placeholder="small_house" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.label_label">Name (English)</span> <input id="wc-label" type="text" placeholder="Small house" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.name_fi_label">Name (Finnish)</span> <input id="wc-name-fi" type="text" placeholder="Pieni talo" autocomplete="off"></label>
        <label><span data-i18n-key="class_editor.base_type_label">Base type</span>
          <select id="wc-base-type">
            <option value="forest">forest</option>
            <option value="island">island</option>
            <option value="cave">cave</option>
            <option value="building">building</option>
            <option value="village">village</option>
          </select>
        </label>
        <label><span data-i18n-key="class_editor.rows_label">Rows (8-200)</span> <input id="wc-rows" type="number" min="8" max="200" value="100"></label>
        <label><span data-i18n-key="class_editor.cols_label">Cols (8-200)</span> <input id="wc-cols" type="number" min="8" max="200" value="100"></label>
        <label><span data-i18n-key="class_editor.item_spawns_label">Item spawns (JSON)</span> <textarea id="wc-item-spawns" rows="3" placeholder='[{"id":"flower","count":3}]'></textarea></label>
        <label><span data-i18n-key="class_editor.npc_spawns_label">NPC spawns (JSON)</span> <textarea id="wc-npc-spawns" rows="3" placeholder='[{"id":"npc_wolf","count":5}]'></textarea></label>
      </div>
      <div class="class-form-actions">
        <button onclick="submitWorldClassForm()" data-i18n-key="class_editor.save">Save</button>
        <button onclick="cancelWorldClassEdit()" data-i18n-key="class_editor.cancel">Cancel</button>
      </div>
    </div>
  </div>

  <div id="joystick-container">
    <div id="joystick-base"></div>
    <div id="joystick-stick"></div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script>
    // ── Server-injected game state ────────────────────────────────────────────
    var MAP      = ${JSON.stringify(state.map)};
    var WORLD_MODS = ${JSON.stringify(state.worldMods)};
    var WORLD_TILE_DEFS = ${JSON.stringify(state.worldTileDefs)};
    var TREE_MODS = ${JSON.stringify(state.treeMods)};
    var HOUSE_MODS = ${JSON.stringify(state.houseMods)};
    var WORLD_ITEMS = ${JSON.stringify(state.worldItems)};
    var PLAYER_INV = ${JSON.stringify(state.playerInventory)};
    var NPCS = ${JSON.stringify(state.npcs)};
    var worldId  = ${JSON.stringify(state.worldId)};
    var WORLD_CLASS_ID = ${JSON.stringify(state.worldClassId)};
    var playerId = ${JSON.stringify(state.userId)};
    var PLAYER_NICK = ${JSON.stringify(state.playerNick)};
    var ONLINE_PLAYERS = ${JSON.stringify(state.onlinePlayers)};
    var INITIAL_CHAT = ${JSON.stringify(state.initialChat)};
    var INITIAL_DM_INDEX = ${JSON.stringify(state.initialDmIndex)};
    var INIT_ROW = ${JSON.stringify(state.initRow)};
    var INIT_COL = ${JSON.stringify(state.initCol)};
    var INIT_SEQ = ${JSON.stringify(state.initSeq)};
    var INIT_ROTATION = ${JSON.stringify(state.initRotation)};
    var ITEM_REGISTRY = ${JSON.stringify(state.itemRegistry)};
    var LIVING_REGISTRY = ${JSON.stringify(state.livingRegistry)};
    var WORLD_CLASS_REGISTRY = ${JSON.stringify(state.worldClassRegistry)};
    var INITIAL_ACTIVE_ACTIONS = ${JSON.stringify(state.activeActions)};
    var OAK_CENTER_ROW = ${JSON.stringify(state.oakCenterRow)};
    var OAK_CENTER_COL = ${JSON.stringify(state.oakCenterCol)};
  </script>
  <script src="/virtual-world/app-state.js"></script>
  <script src="/virtual-world/auth.js"></script>
  <script src="/virtual-world/i18n.js"></script>
  <script src="/virtual-world/scene.js"></script>
  <script src="/virtual-world/tiles-and-items.js"></script>
  <script src="/virtual-world/client-core.js"></script>
  <script src="/virtual-world/client-world-render.js"></script>
  <script src="/virtual-world/client-avatars.js"></script>
  <script src="/virtual-world/client-net.js"></script>
  <script src="/virtual-world/client-actions.js"></script>
  <script src="/virtual-world/client-panels.js"></script>
  <script src="/virtual-world/client-container-panel.js"></script>
  <script src="/virtual-world/client-chat.js"></script>
  <script src="/virtual-world/client-item-actions.js"></script>
  <script src="/virtual-world/client-tile-detail.js"></script>
  <script src="/virtual-world/client-aiming.js"></script>
  <script src="/virtual-world/client-input.js"></script>
  <script src="/virtual-world/client-editors.js"></script>
  <script src="/virtual-world/client-main.js"></script>
</body>
</html>`;
}
