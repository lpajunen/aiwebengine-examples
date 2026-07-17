import { getBootstrapRegistry } from "./item-registry.ts";
import { getAllLivingItems, LivingState } from "./world-domain.ts";

type SpawnDeps = {
  isOakWorld: (worldId: string | number) => boolean;
  getOakClearingTiles: (
    worldId: string | number,
  ) => Array<{ row: number; col: number }>;
  OAK_CENTER_ROW: number;
  OAK_CENTER_COL: number;
  getEffectiveMap: (worldId: string) => number[][];
  loadWorldPlayers: (worldId: string) => Record<string, any>;
  hashString: (value: string) => number;
  isWorldTileWalkable: (tileValue: any) => boolean;
};

type StarterKitDeps = {
  loadPlayerInventory: (userId: string) => LivingState;
  savePlayerInventory: (userId: string, inventory: unknown) => void;
};

type PageBootstrapDeps = {
  getOrCreatePlayerWorld: (userId: string) => string;
  markNPCWorldActive: (worldId: string) => void;
  ensureStarterKit: (userId: string) => void;
  generateMap: (worldId: string) => number[][];
  loadWorldMods: (worldId: string) => any;
  loadWorldTrees: (worldId: string) => any;
  loadWorldHouses: (worldId: string) => any;
  ensureWorldItems: (worldId: string) => void;
  loadWorldItems: (worldId: string) => any;
  loadPlayerInventory: (userId: string) => LivingState;
  getWorldNPCSnapshot: (worldId: string) => any;
  loadPlayerPosition: (userId: string) => any;
  getDefaultSpawnPosition: (
    worldId: string,
    userId: string,
  ) => { row: number; col: number; seq: number; rotation: number };
  savePlayerPosition: (userId: string, worldId: string, position: any) => void;
  loadPlayerNick: (userId: string) => string;
  savePlayerNick: (userId: string, nick: string) => void;
  updateOnlinePresence: (
    userId: string,
    worldId: string,
    sessionId: string,
  ) => void;
  buildOnlinePlayersSnapshot: () => any[];
  loadWorldChat: (worldId: string) => any[];
  loadDMIndex: (userId: string) => string[];
  getWorldFlavorText: (worldId: string) => string;
  worldTileDefs: any;
  getBootstrapRegistry: () => any;
  getAllLivingClasses: () => any[];
};

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
  worldTileDefs: any;
  itemRegistry: any;
  livingRegistry: any;
};

export function getDefaultSpawnPosition(
  worldId: string | number,
  userId: string,
  deps: SpawnDeps,
): { row: number; col: number; seq: number; rotation: number } {
  if (!deps.isOakWorld(worldId)) {
    return { row: 1, col: 1, seq: 0, rotation: 0 };
  }

  const tiles = deps.getOakClearingTiles(worldId);
  if (tiles.length === 0) {
    return {
      row: deps.OAK_CENTER_ROW + 1,
      col: deps.OAK_CENTER_COL,
      seq: 0,
      rotation: 0,
    };
  }

  const map = deps.getEffectiveMap(String(worldId));
  const players = deps.loadWorldPlayers(String(worldId));
  const occupied: Record<string, boolean> = {};
  for (const playerId in players) {
    const player = players[playerId];
    if (!player) continue;
    occupied[Number(player.row) + "_" + Number(player.col)] = true;
  }

  const startIndex = userId ? deps.hashString(userId) % tiles.length : 0;
  let fallbackTile: { row: number; col: number } | null = null;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[(startIndex + i) % tiles.length];
    if (
      !tile ||
      !map[tile.row] ||
      !deps.isWorldTileWalkable(map[tile.row][tile.col])
    ) {
      continue;
    }
    if (!fallbackTile) fallbackTile = tile;
    if (!occupied[tile.row + "_" + tile.col]) {
      return { row: tile.row, col: tile.col, seq: 0, rotation: 0 };
    }
  }

  if (fallbackTile) {
    return {
      row: fallbackTile.row,
      col: fallbackTile.col,
      seq: 0,
      rotation: 0,
    };
  }

  return {
    row: deps.OAK_CENTER_ROW + 1,
    col: deps.OAK_CENTER_COL,
    seq: 0,
    rotation: 0,
  };
}

export function ensureStarterKit(userId: string, deps: StarterKitDeps): void {
  const inv = deps.loadPlayerInventory(userId);
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
    deps.savePlayerInventory(userId, inv);
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
  deps: PageBootstrapDeps,
): PageState {
  const worldId = deps.getOrCreatePlayerWorld(userId);
  deps.markNPCWorldActive(worldId);
  deps.ensureStarterKit(userId);
  const map = deps.generateMap(worldId);
  const worldMods = deps.loadWorldMods(worldId);
  const treeMods = deps.loadWorldTrees(worldId);
  const houseMods = deps.loadWorldHouses(worldId);
  deps.ensureWorldItems(worldId);
  const worldItems = deps.loadWorldItems(worldId);
  const playerInventory = deps.loadPlayerInventory(userId);
  const npcs = deps.getWorldNPCSnapshot(worldId);
  const savedPos = deps.loadPlayerPosition(userId);
  const hasSavedPos = savedPos && savedPos.world_id === String(worldId);
  const initialPos = hasSavedPos
    ? savedPos
    : deps.getDefaultSpawnPosition(worldId, userId);
  if (!hasSavedPos) {
    deps.savePlayerPosition(userId, worldId, {
      row: initialPos.row,
      col: initialPos.col,
      seq: initialPos.seq || 0,
      rotation: Number.isFinite(Number(initialPos.rotation))
        ? Number(initialPos.rotation)
        : 0,
      ts: Date.now(),
    });
  }

  let playerNick = deps.loadPlayerNick(userId);
  if (!playerNick && authName) {
    deps.savePlayerNick(userId, authName);
    playerNick = authName;
  }

  deps.updateOnlinePresence(userId, worldId, "");

  const livingClasses = deps.getAllLivingClasses();
  const livingRegistry = {
    classes: Array.isArray(livingClasses)
      ? livingClasses.reduce(function (acc: Record<string, any>, cls: any) {
          if (!cls || typeof cls.id !== "string") return acc;
          acc[String(cls.id)] = cls;
          return acc;
        }, {})
      : {},
  };

  return {
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
    onlinePlayers: deps.buildOnlinePlayersSnapshot(),
    initialChat: deps.loadWorldChat(worldId).slice(-50),
    initialDmIndex: deps.loadDMIndex(userId),
    initRow: initialPos.row,
    initCol: initialPos.col,
    initSeq: initialPos.seq || 0,
    initRotation: Number.isFinite(Number(initialPos.rotation))
      ? Number(initialPos.rotation)
      : 0,
    worldFlavorText: deps.getWorldFlavorText(worldId),
    worldTileDefs: deps.worldTileDefs,
    itemRegistry: deps.getBootstrapRegistry(),
    livingRegistry: livingRegistry,
  };
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
  <div class="hud" id="hud-pos">
    <strong>Virtual World</strong>
    <div style="margin:4px 0 6px;color:#d8e7c2;font-style:italic;max-width:220px;line-height:1.35;">${escapeHtml(state.worldFlavorText)}</div>
    <span id="hud-nick-row"><span id="nick-display">${escapeHtml(state.playerNick || state.authName)}</span><button id="nick-edit-btn" onclick="startNickEdit()" title="Rename">✏️</button><span id="nick-edit-row" style="display:none;"><input id="nick-input" type="text" maxlength="24"><button onclick="commitNickEdit()" title="Save">✓</button><button onclick="cancelNickEdit()" title="Cancel">✗</button></span></span><br>
    World: ${state.worldId}<br>
    Position: <span id="pos-col">${state.initCol}</span>, <span id="pos-row">${state.initRow}</span><br>
    L: <span id="held-left">-</span> | R: <span id="held-right">-</span>
  </div>

  <div class="hud" id="hud-legend">
    <strong>Legend</strong>
    <div class="leg" id="legend-ground"><div class="leg-box" style="background:#7ab648;"></div> Forest Floor</div>
    <div class="leg"><div class="leg-box" style="background:#355c34;"></div> Spruce Thicket</div>
    <div class="leg"><div class="leg-box" style="background:#2d8a3e;"></div> Pine Tree</div>
    <div class="leg"><div class="leg-box" style="background:#4f91c9;"></div> Water</div>
    <div class="leg"><div class="leg-box" style="background:#7f8892;"></div> Rock / Mountain</div>
    <div class="leg" id="legend-you"><div class="leg-box" style="background:#2980b9;"></div> You</div>
  </div>

  <div class="hud" id="hud-keys">
    Move: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> &nbsp;or&nbsp; <kbd>&uarr;</kbd><kbd>&larr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd>
    &nbsp;&nbsp;|&nbsp;&nbsp; Camera: <kbd>drag</kbd> to orbit &nbsp; <kbd>scroll</kbd> to zoom
  </div>

  <div class="hud" id="hud-auth-status" aria-live="polite"></div>

  <div class="hud" id="hud-toast" aria-live="polite"></div>

  <div class="hud" id="hud-tree-actions">
    <button id="btn-use" onclick="useItem()">Use</button>
    <button id="btn-pick" onclick="pickItemsOnTile()">📦 Pick</button>
    <button id="btn-items" onclick="toggleInventoryPanel()">🎒 Items</button>
    <button id="btn-craft" onclick="toggleCraftingPanel()">🛠 Craft</button>
    <button id="btn-players" onclick="togglePlayersPanel()">👥 Players</button>
    <button id="btn-chat" onclick="toggleChatPanel()">💬 Chat<span class="unread-badge" id="chat-unread-badge"></span></button>
    <button id="btn-item-classes" onclick="toggleItemClassPanel()">📦 Item types</button>
    <button id="btn-action-classes" onclick="toggleActionClassPanel()">⚡ Action types</button>
    <button id="btn-living-classes" onclick="toggleLivingClassPanel()">🧬 Living types</button>
  </div>

  <div class="hud" id="hud-use-picker">
    <div class="panel-header">
      <span class="panel-title">Choose Action</span>
      <button class="panel-close" onclick="closeUsePicker()" title="Close">×</button>
    </div>
    <div id="use-picker-actions"></div>
  </div>

  <div class="hud" id="hud-inventory-panel">
    <div class="panel-header">
      <span class="panel-title">Inventory</span>
      <button class="panel-close" onclick="closeInventoryPanel()" title="Close">×</button>
    </div>
    <div class="inv-hands">
      <div class="inv-hand" id="inv-left-hand"></div>
      <div class="inv-hand" id="inv-right-hand"></div>
    </div>
    <div id="inv-list"></div>
    <div id="inv-footer">
      <span id="inv-count">0 items</span>
    </div>
  </div>

  <div class="hud" id="hud-crafting-panel">
    <div class="panel-header">
      <span class="panel-title">Crafting</span>
      <button class="panel-close" onclick="closeCraftingPanel()" title="Close">×</button>
    </div>
    <div id="crafting-list"></div>
  </div>

  <div class="hud" id="hud-tile-detail" aria-live="polite">
    <div class="panel-header">
      <span class="panel-title" id="tile-detail-title">Square (0, 0)</span>
      <button class="panel-close" onclick="closeTileDetail()" title="Close">×</button>
    </div>
    <div id="tile-detail-body"></div>
  </div>

  <div class="hud" id="hud-players-panel">
    <div class="panel-header">
      <span class="panel-title">Players Online</span>
      <button class="panel-close" onclick="closePlayersPanel()" title="Close">×</button>
    </div>
    <div id="players-list-wrap">
      <table class="players-table">
        <thead><tr>
          <th>Name</th><th>World</th><th>Online since</th><th>Last active</th><th></th>
        </tr></thead>
        <tbody id="players-table-body"></tbody>
      </table>
    </div>
  </div>

  <div class="hud" id="hud-chat-panel">
    <div class="panel-header">
      <span class="panel-title" id="chat-panel-title">Chat</span>
      <button class="panel-close" onclick="closeChatPanel()" title="Close">×</button>
    </div>
    <div class="chat-tabs">
      <button class="chat-tab active" id="chat-tab-world" onclick="switchChatTab('world')">World</button>
      <button class="chat-tab" id="chat-tab-dm" onclick="switchChatTab('dm')">Direct Messages<span class="unread-badge" id="dm-tab-badge"></span></button>
    </div>
    <div class="chat-content" id="chat-content-world">
      <div class="chat-msgs" id="world-chat-msgs"></div>
      <div class="chat-input-row">
        <input type="text" id="world-chat-input" placeholder="Say something…" maxlength="500" onkeydown="if(event.key==='Enter')sendWorldChatMessage()">
        <button onclick="sendWorldChatMessage()">Send</button>
      </div>
    </div>
    <div class="chat-content hidden" id="chat-content-dm">
      <div id="dm-thread-view" style="display:none;flex:1;min-height:0;flex-direction:column;">
        <button class="dm-back" onclick="showDMConvoList()">← Back</button>
        <div class="chat-msgs" id="dm-thread-msgs"></div>
        <div class="chat-input-row">
          <input type="text" id="dm-chat-input" placeholder="Send a direct message…" maxlength="500" onkeydown="if(event.key==='Enter')sendDirectMessage()">
          <button onclick="sendDirectMessage()">Send</button>
        </div>
      </div>
      <div id="dm-convo-list" class="dm-convos" style="overflow-y:auto;flex:1;min-height:0;"></div>
    </div>
  </div>

  <div class="hud" id="hud-item-class-panel">
    <div class="panel-header">
      <span class="panel-title">Item Types</span>
      <button class="panel-close" onclick="closeItemClassPanel()" title="Close">×</button>
    </div>
    <div id="item-class-list" class="class-list"></div>
    <div class="class-form">
      <div class="class-form-title" id="item-class-form-title">New item type</div>
      <div class="class-form-fields">
        <label>ID <input id="ic-id" type="text" placeholder="my_item" autocomplete="off"></label>
        <label>Label <input id="ic-label" type="text" placeholder="My Item" autocomplete="off"></label>
        <label>Kind
          <select id="ic-kind">
            <option value="tool">tool</option>
            <option value="material">material</option>
            <option value="resource">resource</option>
            <option value="structure">structure</option>
            <option value="furniture">furniture</option>
          </select>
        </label>
        <label><input id="ic-spawnable" type="checkbox"> Spawnable</label>
        <label><input id="ic-extra" type="checkbox"> Extra</label>
        <label><input id="ic-non-droppable" type="checkbox"> Non-droppable</label>
        <label>Action IDs (comma-sep) <input id="ic-action-ids" type="text" placeholder="tune,play_tune" autocomplete="off"></label>
        <label>State template (JSON) <textarea id="ic-state-template" rows="3" placeholder='{"key": 0}'></textarea></label>
      </div>
      <div class="class-form-actions">
        <button onclick="submitItemClassForm()">Save</button>
        <button onclick="cancelItemClassEdit()">Cancel</button>
      </div>
    </div>
  </div>

  <div class="hud" id="hud-action-class-panel">
    <div class="panel-header">
      <span class="panel-title">Action Types</span>
      <button class="panel-close" onclick="closeActionClassPanel()" title="Close">×</button>
    </div>
    <div id="action-class-list" class="class-list"></div>
    <div class="class-form">
      <div class="class-form-title" id="action-class-form-title">New action type</div>
      <div class="class-form-fields">
        <label>ID <input id="ac-id" type="text" placeholder="my_action" autocomplete="off"></label>
        <label>Label <input id="ac-label" type="text" placeholder="My Action" autocomplete="off"></label>
        <label>Target kind
          <select id="ac-target-kind">
            <option value="self">self</option>
            <option value="facing_tile">facing_tile</option>
            <option value="current_tile">current_tile</option>
            <option value="inventory">inventory</option>
          </select>
        </label>
        <label>Source items (comma-sep) <input id="ac-source-items" type="text" placeholder="kantele" autocomplete="off"></label>
        <label>Logic spec (JSON) <textarea id="ac-logic-spec" rows="3" placeholder='{"conditions":[],"effects":[]}'></textarea></label>
      </div>
      <div class="class-form-actions">
        <button onclick="submitActionClassForm()">Save</button>
        <button onclick="cancelActionClassEdit()">Cancel</button>
      </div>
    </div>
  </div>

  <div class="hud" id="hud-living-class-panel">
    <div class="panel-header">
      <span class="panel-title">Living Types</span>
      <button class="panel-close" onclick="closeLivingClassPanel()" title="Close">×</button>
    </div>
    <div id="living-class-list" class="class-list"></div>
    <div class="class-form">
      <div class="class-form-title" id="living-class-form-title">New living type</div>
      <div class="class-form-fields">
        <label>ID <input id="lc-id" type="text" placeholder="my_creature" autocomplete="off"></label>
        <label>Kind
          <select id="lc-kind">
            <option value="player">player</option>
            <option value="npc">npc</option>
            <option value="creature">creature</option>
          </select>
        </label>
        <label>Slot definitions (JSON) <textarea id="lc-slot-definitions" rows="3" placeholder='[{"id":"left_hand","labelKey":"living.slot.left_hand","fallbackLabel":"Left hand","tags":["hand"]}]'></textarea></label>
        <label>Value template (JSON) <textarea id="lc-value-template" rows="2" placeholder='{"fatigue": 0}'></textarea></label>
        <label>Value schema (JSON) <textarea id="lc-value-schema" rows="3" placeholder='{"fatigue":{"kind":"number","min":0,"max":100}}'></textarea></label>
      </div>
      <div class="class-form-actions">
        <button onclick="submitLivingClassForm()">Save</button>
        <button onclick="cancelLivingClassEdit()">Cancel</button>
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
  </script>
  <script src="/virtual-world/app-state.js"></script>
  <script src="/virtual-world/auth.js"></script>
  <script src="/virtual-world/i18n.js"></script>
  <script src="/virtual-world/scene.js"></script>
  <script src="/virtual-world/tiles-and-items.js"></script>
  <script src="/virtual-world/client.js"></script>
</body>
</html>`;
}
