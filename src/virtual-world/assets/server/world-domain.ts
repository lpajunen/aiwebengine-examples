export const ROWS = 100;
export const COLS = 100;
export const OAK_WORLD_ID = "10000";
export const OAK_CENTER_ROW = 50;
export const OAK_CENTER_COL = 50;
export const OAK_CLEAR_RADIUS = 5;

export const WORLD_MOD_LAYER_TERRAIN = "terrain";
export const WORLD_MOD_LAYER_OBJECT = "object";

export type WorldModLayer =
  | typeof WORLD_MOD_LAYER_TERRAIN
  | typeof WORLD_MOD_LAYER_OBJECT;

export const WORLD_TILE_GROUND = "ground";
export const WORLD_TILE_SPRUCE_THICKET = "spruce_thicket";
export const WORLD_TILE_PINE_TREE = "pine_tree";
export const WORLD_TILE_HOUSE = "house";
export const WORLD_TILE_OCEAN = "ocean";
export const WORLD_TILE_LAKE = "lake";
export const WORLD_TILE_RIVER = "river";
export const WORLD_TILE_ROCK = "rock";
export const WORLD_TILE_MOUNTAIN = "mountain";
export const WORLD_TILE_SAND = "sand";
export const WORLD_TILE_CAVE_FLOOR = "cave_floor";
export const WORLD_TILE_WOOD_FLOOR = "wood_floor";

export type WorldTileName =
  | typeof WORLD_TILE_GROUND
  | typeof WORLD_TILE_SPRUCE_THICKET
  | typeof WORLD_TILE_PINE_TREE
  | typeof WORLD_TILE_HOUSE
  | typeof WORLD_TILE_OCEAN
  | typeof WORLD_TILE_LAKE
  | typeof WORLD_TILE_RIVER
  | typeof WORLD_TILE_ROCK
  | typeof WORLD_TILE_MOUNTAIN
  | typeof WORLD_TILE_SAND
  | typeof WORLD_TILE_CAVE_FLOOR
  | typeof WORLD_TILE_WOOD_FLOOR;

export const WORLD_TYPE_FOREST = "forest";
export const WORLD_TYPE_ISLAND = "island";
export const WORLD_TYPE_CAVE = "cave";
export const WORLD_TYPE_BUILDING = "building";

import {
  getActionDefinition,
  getActionsForItemType,
  getExtraItemTypes,
  getPrimaryActionForItemType,
  getSpawnableItemTypes,
} from "./item-registry.ts";

export {
  getActionDefinition,
  getActionsForItemType,
  getExtraItemTypes,
  getPrimaryActionForItemType,
  getSpawnableItemTypes,
};

export const WORLD_TYPES = [
  WORLD_TYPE_FOREST,
  WORLD_TYPE_ISLAND,
  WORLD_TYPE_CAVE,
  WORLD_TYPE_BUILDING,
] as const;

export type WorldType = (typeof WORLD_TYPES)[number];

export const ITEM_TYPES = getSpawnableItemTypes();

export const EXTRA_ITEM_TYPES = getExtraItemTypes();

export interface WorldTileDef {
  value: number;
  walkable: boolean;
  layer: WorldModLayer;
}

export interface InventoryItem {
  id: string;
  type: string;
  destination_world_id?: string;
  destination_world_type?: string;
  state?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Inventory {
  left_hand: InventoryItem | null;
  right_hand: InventoryItem | null;
  inventory: InventoryItem[];
}

export type LivingKind = "player" | "npc" | "creature";

export interface LivingSlotDefinition {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  accepts?: string[];
  tags?: string[];
}

export interface LivingValueSchemaEntry {
  kind: "number" | "string" | "boolean";
  min?: number;
  max?: number;
}

export type LivingValueSchema = Record<string, LivingValueSchemaEntry>;

export interface LivingClassRecord {
  id: string;
  kind: LivingKind;
  slotDefinitions: LivingSlotDefinition[];
  valueTemplate: Record<string, unknown>;
  valueSchema?: LivingValueSchema;
}

export interface LivingState {
  class_id: string;
  slots: Record<string, InventoryItem | null>;
  bag: InventoryItem[];
  values: Record<string, unknown>;
}

export interface OakTile {
  row: number;
  col: number;
}

export const PORTAL_BUILD_ACTION_BY_WORLD_TYPE: Record<WorldType, string> = {
  forest: "build_portal_forest",
  island: "build_portal_island",
  cave: "build_portal_cave",
  building: "build_portal_building",
};

export const PORTAL_BUILD_ACTIONS = Object.values(
  PORTAL_BUILD_ACTION_BY_WORLD_TYPE,
);

export const TREE_ACTION_BY_ITEM_TYPE: Record<string, string> = Object.keys(
  ITEM_TYPES.concat(EXTRA_ITEM_TYPES),
).reduce(function (acc: Record<string, string>, itemId) {
  const actionId = getPrimaryActionForItemType(itemId);
  if (actionId) acc[itemId] = actionId;
  return acc;
}, {});

export const WORLD_TILE_DEFS: Record<WorldTileName, WorldTileDef> = {
  ground: { value: 0, walkable: true, layer: WORLD_MOD_LAYER_TERRAIN },
  spruce_thicket: {
    value: 1,
    walkable: false,
    layer: WORLD_MOD_LAYER_TERRAIN,
  },
  pine_tree: { value: 2, walkable: false, layer: WORLD_MOD_LAYER_OBJECT },
  house: { value: 3, walkable: false, layer: WORLD_MOD_LAYER_OBJECT },
  ocean: { value: 4, walkable: false, layer: WORLD_MOD_LAYER_TERRAIN },
  lake: { value: 5, walkable: false, layer: WORLD_MOD_LAYER_TERRAIN },
  river: { value: 6, walkable: false, layer: WORLD_MOD_LAYER_TERRAIN },
  rock: { value: 7, walkable: false, layer: WORLD_MOD_LAYER_TERRAIN },
  mountain: { value: 8, walkable: false, layer: WORLD_MOD_LAYER_TERRAIN },
  sand: { value: 9, walkable: true, layer: WORLD_MOD_LAYER_TERRAIN },
  cave_floor: { value: 10, walkable: true, layer: WORLD_MOD_LAYER_TERRAIN },
  wood_floor: { value: 11, walkable: true, layer: WORLD_MOD_LAYER_TERRAIN },
};

export const WORLD_TILE_NAME_BY_VALUE: Record<number, WorldTileName> = {
  0: WORLD_TILE_GROUND,
  1: WORLD_TILE_SPRUCE_THICKET,
  2: WORLD_TILE_PINE_TREE,
  3: WORLD_TILE_HOUSE,
  4: WORLD_TILE_OCEAN,
  5: WORLD_TILE_LAKE,
  6: WORLD_TILE_RIVER,
  7: WORLD_TILE_ROCK,
  8: WORLD_TILE_MOUNTAIN,
  9: WORLD_TILE_SAND,
  10: WORLD_TILE_CAVE_FLOOR,
  11: WORLD_TILE_WOOD_FLOOR,
};

const WORLD_FLAVOR_TEXTS = [
  "A low rune-song lingers between the spruce boughs.",
  "Rowan charms sway softly where the pine paths meet.",
  "The forest floor feels old here, as if someone just finished a quiet verse.",
  "Juniper smoke and birdsong drift through this hidden clearing.",
];

const NPC_NAME_PREFIXES = [
  "Aino",
  "Ilma",
  "Kylli",
  "Lempi",
  "Otso",
  "Sampo",
  "Tapio",
  "Tuuli",
  "Vesa",
  "Virva",
];

const NPC_NAME_SUFFIXES = [
  "of the Pines",
  "the Rune-Hummer",
  "the Rowan Keeper",
  "of the Quiet Marsh",
  "the Hearth Walker",
  "of the Dawn Path",
  "the Juniper Hand",
  "of the Singing Moss",
];

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function getAllKnownItemTypes(): string[] {
  const seen: Record<string, boolean> = {};
  const out: string[] = [];
  ITEM_TYPES.forEach(function (type) {
    if (!type || seen[type]) return;
    seen[type] = true;
    out.push(type);
  });
  EXTRA_ITEM_TYPES.forEach(function (type) {
    if (!type || seen[type]) return;
    seen[type] = true;
    out.push(type);
  });
  return out;
}

export function hashString(value: string): number {
  const str = String(value || "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export function getWorldFlavorText(worldId: string): string {
  return WORLD_FLAVOR_TEXTS[hashString(worldId) % WORLD_FLAVOR_TEXTS.length];
}

export function getNPCDisplayName(worldId: string, npcId: string): string {
  const seed = hashString(String(worldId) + ":" + String(npcId));
  const prefix = NPC_NAME_PREFIXES[seed % NPC_NAME_PREFIXES.length];
  const suffix =
    NPC_NAME_SUFFIXES[
      Math.floor(seed / NPC_NAME_PREFIXES.length) % NPC_NAME_SUFFIXES.length
    ];
  return prefix + " " + suffix;
}

export function normalizeWorldType(
  worldType: string | undefined | null,
): WorldType {
  const normalized = String(worldType || "").toLowerCase() as WorldType;
  return WORLD_TYPES.indexOf(normalized) !== -1
    ? normalized
    : WORLD_TYPE_FOREST;
}

export function portalBuildActionForWorldType(worldType: string): string {
  return (
    PORTAL_BUILD_ACTION_BY_WORLD_TYPE[normalizeWorldType(worldType)] ||
    PORTAL_BUILD_ACTION_BY_WORLD_TYPE[WORLD_TYPE_FOREST]
  );
}

export function worldTypeForPortalBuildAction(
  action: string | undefined | null,
): WorldType | null {
  const normalizedAction = String(action || "");
  for (let i = 0; i < WORLD_TYPES.length; i++) {
    const worldType = WORLD_TYPES[i];
    if (portalBuildActionForWorldType(worldType) === normalizedAction) {
      return worldType;
    }
  }
  return null;
}

export function canonicalTreeAction(action: string | undefined | null): string {
  return worldTypeForPortalBuildAction(action)
    ? "build_portal"
    : String(action || "");
}

export function getDefaultWorldTypeForWorldId(
  worldId: string | number,
): WorldType {
  return isOakWorld(worldId) ? WORLD_TYPE_FOREST : WORLD_TYPE_FOREST;
}

export function getWorldFloorTileName(worldType: string): WorldTileName {
  const normalizedType = normalizeWorldType(worldType);
  if (normalizedType === WORLD_TYPE_ISLAND) return WORLD_TILE_SAND;
  if (normalizedType === WORLD_TYPE_CAVE) return WORLD_TILE_CAVE_FLOOR;
  if (normalizedType === WORLD_TYPE_BUILDING) return WORLD_TILE_WOOD_FLOOR;
  return WORLD_TILE_GROUND;
}

export function getWorldWallTileName(worldType: string): WorldTileName {
  const normalizedType = normalizeWorldType(worldType);
  if (normalizedType === WORLD_TYPE_ISLAND) return WORLD_TILE_ROCK;
  if (normalizedType === WORLD_TYPE_CAVE) return WORLD_TILE_MOUNTAIN;
  if (normalizedType === WORLD_TYPE_BUILDING) return WORLD_TILE_HOUSE;
  return WORLD_TILE_SPRUCE_THICKET;
}

export function getWorldBoundaryTileName(worldType: string): WorldTileName {
  const normalizedType = normalizeWorldType(worldType);
  if (normalizedType === WORLD_TYPE_ISLAND) return WORLD_TILE_OCEAN;
  if (normalizedType === WORLD_TYPE_CAVE) return WORLD_TILE_MOUNTAIN;
  if (normalizedType === WORLD_TYPE_BUILDING) return WORLD_TILE_HOUSE;
  return WORLD_TILE_SPRUCE_THICKET;
}

export function getWorldTileDef(tileName: string): WorldTileDef {
  return (
    WORLD_TILE_DEFS[tileName as WorldTileName] ||
    WORLD_TILE_DEFS[WORLD_TILE_GROUND]
  );
}

export function worldTileNameForValue(tileValue: number): WorldTileName {
  return WORLD_TILE_NAME_BY_VALUE[Number(tileValue)] || WORLD_TILE_GROUND;
}

export function worldTileValueForName(tileName: string): number {
  return getWorldTileDef(tileName).value;
}

export function isWorldTileWalkable(tileValue: number): boolean {
  return !!getWorldTileDef(worldTileNameForValue(tileValue)).walkable;
}

export function createWorldId(): string {
  return String(Math.floor(Math.random() * 999999) + 1);
}

export function isOakWorld(worldId: string | number): boolean {
  return String(worldId) === OAK_WORLD_ID;
}

export function oakDistanceSquared(row: number, col: number): number {
  const dr = Number(row) - OAK_CENTER_ROW;
  const dc = Number(col) - OAK_CENTER_COL;
  return dr * dr + dc * dc;
}

export function isOakCenterTile(
  worldId: string | number,
  row: number,
  col: number,
): boolean {
  return (
    isOakWorld(worldId) &&
    Number(row) === OAK_CENTER_ROW &&
    Number(col) === OAK_CENTER_COL
  );
}

export function isOakClearingTile(
  worldId: string | number,
  row: number,
  col: number,
): boolean {
  if (!isOakWorld(worldId) || isOakCenterTile(worldId, row, col)) return false;
  return oakDistanceSquared(row, col) <= OAK_CLEAR_RADIUS * OAK_CLEAR_RADIUS;
}

export function applyOakReservation(
  map: number[][],
  worldId: string | number,
): number[][] {
  if (!isOakWorld(worldId)) return map;
  for (
    let row = OAK_CENTER_ROW - OAK_CLEAR_RADIUS;
    row <= OAK_CENTER_ROW + OAK_CLEAR_RADIUS;
    row++
  ) {
    if (row < 0 || row >= ROWS) continue;
    for (
      let col = OAK_CENTER_COL - OAK_CLEAR_RADIUS;
      col <= OAK_CENTER_COL + OAK_CLEAR_RADIUS;
      col++
    ) {
      if (col < 0 || col >= COLS) continue;
      if (isOakCenterTile(worldId, row, col)) {
        map[row][col] = worldTileValueForName(WORLD_TILE_PINE_TREE);
      } else if (isOakClearingTile(worldId, row, col)) {
        map[row][col] = worldTileValueForName(WORLD_TILE_GROUND);
      }
    }
  }
  return map;
}

export function getOakClearingTiles(worldId: string | number): OakTile[] {
  if (!isOakWorld(worldId)) return [];
  const tiles: Array<OakTile & { dist2: number }> = [];
  for (
    let row = OAK_CENTER_ROW - OAK_CLEAR_RADIUS;
    row <= OAK_CENTER_ROW + OAK_CLEAR_RADIUS;
    row++
  ) {
    if (row < 0 || row >= ROWS) continue;
    for (
      let col = OAK_CENTER_COL - OAK_CLEAR_RADIUS;
      col <= OAK_CENTER_COL + OAK_CLEAR_RADIUS;
      col++
    ) {
      if (col < 0 || col >= COLS) continue;
      if (!isOakClearingTile(worldId, row, col)) continue;
      tiles.push({ row: row, col: col, dist2: oakDistanceSquared(row, col) });
    }
  }
  tiles.sort(function (a, b) {
    if (a.dist2 !== b.dist2) return a.dist2 - b.dist2;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
  return tiles.map(function (tile) {
    return { row: tile.row, col: tile.col };
  });
}

export function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEmptyInventory(): Inventory {
  return {
    left_hand: null,
    right_hand: null,
    inventory: [],
  };
}

export function createEmptyLivingState(classId: string): LivingState {
  return {
    class_id: String(classId || ""),
    slots: {},
    bag: [],
    values: {},
  };
}

export function createLivingSlotsFromDefinitions(
  slotDefinitions: LivingSlotDefinition[],
): Record<string, InventoryItem | null> {
  const slots: Record<string, InventoryItem | null> = {};
  if (!Array.isArray(slotDefinitions)) return slots;
  for (let i = 0; i < slotDefinitions.length; i++) {
    const slotDef = slotDefinitions[i];
    if (!slotDef || typeof slotDef.id !== "string") continue;
    slots[String(slotDef.id)] = null;
  }
  return slots;
}

export function normalizeLivingValues(
  values: unknown,
  valueTemplate: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = Object.assign({}, valueTemplate || {});
  if (!isRecordLike(values)) return out;
  Object.keys(values).forEach(function (key) {
    out[key] = values[key];
  });
  return out;
}

export function normalizeLivingState(
  state: unknown,
  livingClass: LivingClassRecord,
): LivingState {
  const out = createEmptyLivingState(livingClass.id);
  const defaultSlots = createLivingSlotsFromDefinitions(
    livingClass.slotDefinitions,
  );
  out.slots = defaultSlots;
  out.values = normalizeLivingValues({}, livingClass.valueTemplate || {});
  if (!isRecordLike(state)) return out;

  if (isRecordLike(state.slots)) {
    const stateSlots = state.slots as Record<string, unknown>;
    Object.keys(defaultSlots).forEach(function (slotId) {
      const candidate = stateSlots[slotId];
      out.slots[slotId] = isValidItem(candidate) ? candidate : null;
    });
  }

  if (Array.isArray(state.bag)) {
    out.bag = state.bag.filter(isValidItem);
  }

  out.values = normalizeLivingValues(
    isRecordLike(state.values) ? state.values : {},
    livingClass.valueTemplate || {},
  );
  return out;
}

export function isValidItem(item: unknown): item is InventoryItem {
  return (
    isRecordLike(item) &&
    typeof item.id === "string" &&
    typeof item.type === "string"
  );
}

export function normalizeInventory(inv: unknown): Inventory {
  const out = createEmptyInventory();
  if (!isRecordLike(inv)) return out;
  if (isRecordLike(inv.slots)) {
    const slots = inv.slots as Record<string, unknown>;
    if (isValidItem(slots.left_hand)) out.left_hand = slots.left_hand;
    if (isValidItem(slots.right_hand)) out.right_hand = slots.right_hand;
    if (Array.isArray(inv.bag)) {
      out.inventory = inv.bag.filter(isValidItem);
    }
    return out;
  }
  if (isValidItem(inv.left_hand)) out.left_hand = inv.left_hand;
  if (isValidItem(inv.right_hand)) out.right_hand = inv.right_hand;
  if (Array.isArray(inv.inventory)) {
    out.inventory = inv.inventory.filter(isValidItem);
  }
  return out;
}

export function getEquippedItems(inv: unknown): InventoryItem[] {
  const out: InventoryItem[] = [];
  if (isRecordLike(inv) && isRecordLike(inv.slots)) {
    const slots = inv.slots as Record<string, unknown>;
    Object.keys(slots).forEach(function (slotId) {
      const item = slots[slotId];
      if (isValidItem(item)) out.push(item);
    });
    return out;
  }

  const normalized = normalizeInventory(inv);
  if (normalized.left_hand) out.push(normalized.left_hand);
  if (normalized.right_hand) out.push(normalized.right_hand);
  return out;
}

export function getBagItems(inv: unknown): InventoryItem[] {
  if (isRecordLike(inv) && Array.isArray(inv.bag)) {
    return inv.bag.filter(isValidItem);
  }
  const normalized = normalizeInventory(inv);
  return Array.isArray(normalized.inventory)
    ? normalized.inventory.slice()
    : [];
}

export function getAllLivingItems(inv: unknown): InventoryItem[] {
  return getEquippedItems(inv).concat(getBagItems(inv));
}

export function findFirstLivingItemByTypes(
  inv: unknown,
  sourceItemIds: string[],
): InventoryItem | null {
  if (!Array.isArray(sourceItemIds) || sourceItemIds.length === 0) {
    return null;
  }
  const allowed: Record<string, boolean> = {};
  sourceItemIds.forEach(function (id) {
    allowed[String(id || "")] = true;
  });
  const candidates = getAllLivingItems(inv);
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (allowed[String(candidate.type || "")]) return candidate;
  }
  return null;
}

export function replaceLivingItemById(
  inv: unknown,
  itemId: string,
  replacement: InventoryItem,
): boolean {
  if (!isRecordLike(inv) || !itemId || !isValidItem(replacement)) return false;

  if (isRecordLike(inv.slots)) {
    const slots = inv.slots as Record<string, unknown>;
    const slotIds = Object.keys(slots);
    for (let i = 0; i < slotIds.length; i++) {
      const slotId = slotIds[i];
      const current = slots[slotId];
      if (isValidItem(current) && current.id === itemId) {
        slots[slotId] = replacement;
        return true;
      }
    }
  }

  if (Array.isArray(inv.bag)) {
    for (let i = 0; i < inv.bag.length; i++) {
      const current = inv.bag[i];
      if (isValidItem(current) && current.id === itemId) {
        inv.bag[i] = replacement;
        return true;
      }
    }
  }

  if (isValidItem(inv.left_hand) && inv.left_hand.id === itemId) {
    inv.left_hand = replacement;
    return true;
  }
  if (isValidItem(inv.right_hand) && inv.right_hand.id === itemId) {
    inv.right_hand = replacement;
    return true;
  }
  if (Array.isArray(inv.inventory)) {
    for (let i = 0; i < inv.inventory.length; i++) {
      const current = inv.inventory[i];
      if (isValidItem(current) && current.id === itemId) {
        inv.inventory[i] = replacement;
        return true;
      }
    }
  }
  return false;
}

export function getInventoryTreeActions(inv: unknown): string[] {
  const actions: Record<string, boolean> = {};
  let items: InventoryItem[] = [];
  if (isRecordLike(inv) && isRecordLike(inv.slots)) {
    const slots = inv.slots as Record<string, unknown>;
    Object.keys(slots).forEach(function (slotId) {
      const item = slots[slotId];
      if (isValidItem(item)) items.push(item);
    });
    if (Array.isArray(inv.bag)) {
      items = items.concat(inv.bag.filter(isValidItem));
    }
  } else {
    const normalized = normalizeInventory(inv);
    if (normalized.left_hand) items.push(normalized.left_hand);
    if (normalized.right_hand) items.push(normalized.right_hand);
    if (Array.isArray(normalized.inventory)) {
      items = items.concat(normalized.inventory);
    }
  }

  items.forEach(function (item) {
    const itemActions = getActionsForItemType(item.type);
    for (let i = 0; i < itemActions.length; i++) {
      actions[itemActions[i]] = true;
    }
  });
  return Object.keys(actions);
}

export function canInventoryUseTreeAction(
  inv: unknown,
  action: string,
): boolean {
  const normalizedAction = canonicalTreeAction(action);
  if (!getActionDefinition(action) && !getActionDefinition(normalizedAction)) {
    return false;
  }
  return getInventoryTreeActions(inv).indexOf(String(action)) !== -1;
}

export function canTileItemsUseTreeAction(
  items: unknown[],
  action: string,
): boolean {
  if (!Array.isArray(items)) return false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!isValidItem(item)) continue;
    const itemActions = getActionsForItemType(item.type);
    if (itemActions.indexOf(action) !== -1) return true;
  }
  return false;
}

export function toStoredWorldTimestamp(tsMs: number): number {
  const numeric = Number(tsMs || 0);
  if (!isFinite(numeric) || numeric <= 0) return Math.floor(Date.now() / 1000);
  if (numeric >= 1000000000000) return Math.floor(numeric / 1000);
  return Math.floor(numeric);
}

export function fromStoredWorldTimestamp(storedTs: unknown): number {
  const numeric = Number(storedTs || 0);
  if (!isFinite(numeric) || numeric <= 0) return 0;
  if (numeric < 1000000000000) return numeric * 1000;
  return numeric;
}
