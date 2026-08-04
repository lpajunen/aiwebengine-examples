// Default dimensions for worlds without stored rows/cols (all pre-existing
// worlds except the oak home world, which is pinned to OAK_WORLD_ROWS/COLS
// below regardless of what's stored).
export const ROWS = 100;
export const COLS = 100;
export const MIN_WORLD_DIM = 8;
export const MAX_WORLD_DIM = 200;
export const OAK_WORLD_ID = "10000";
// The oak home/start world is a fixed-size village clearing, not a generic
// generated world — its dimensions and clearing center are pinned here
// rather than following the stored world row, same as OAK_WORLD_ID itself.
export const OAK_WORLD_ROWS = 30;
export const OAK_WORLD_COLS = 30;
export const OAK_CENTER_ROW = Math.floor(OAK_WORLD_ROWS / 2);
export const OAK_CENTER_COL = Math.floor(OAK_WORLD_COLS / 2);
export const OAK_CLEAR_RADIUS = 5;
// The start village (oak world) is classed as its own world class rather than
// the bare "village" preset, so it shows in the world-type editor with a name
// (English "Birdhaven" / Finnish "Lintukoto"). Same village terrain + spawns.
export const BIRDHAVEN_WORLD_CLASS_ID = "birdhaven";

// The Adventurer's guild is a fixed-id building world (a single small room),
// reached through a door on a house just south of the oak clearing. Like the
// oak/start world it uses a reserved id rather than a random one so the
// village door can point at a stable destination and its room fixtures
// (training post + return door) reseed to known tiles.
export const GUILD_WORLD_ID = "10001";
// Its own world class (empty item/NPC spawn manifests) so the room stays a
// clean training hall instead of inheriting the busy default building preset.
export const GUILD_WORLD_CLASS_ID = "adventurers_guild";
export const GUILD_WORLD_ROWS = 10;
export const GUILD_WORLD_COLS = 10;
export const GUILD_CENTER_ROW = Math.floor(GUILD_WORLD_ROWS / 2);
export const GUILD_CENTER_COL = Math.floor(GUILD_WORLD_COLS / 2);
// Where a player lands when entering the guild (its default spawn, see
// getDefaultSpawnPosition for non-oak worlds) — the return door sits here.
export const GUILD_SPAWN_ROW = 1;
export const GUILD_SPAWN_COL = 1;

// The village-side guild entrance: a house wall tile one row south of the oak
// clearing edge, with the door hung on it. The approach tile is the clearing
// tile directly north of the door (guaranteed walkable by the oak
// reservation), where the return door drops the player back off.
export const VILLAGE_GUILD_DOOR_ROW = OAK_CENTER_ROW + OAK_CLEAR_RADIUS + 1;
export const VILLAGE_GUILD_DOOR_COL = OAK_CENTER_COL;
export const VILLAGE_GUILD_APPROACH_ROW = OAK_CENTER_ROW + OAK_CLEAR_RADIUS;
export const VILLAGE_GUILD_APPROACH_COL = OAK_CENTER_COL;

export const WORLD_MOD_LAYER_TERRAIN = "terrain";
export const WORLD_MOD_LAYER_OBJECT = "object";

export type WorldModLayer =
  typeof WORLD_MOD_LAYER_TERRAIN | typeof WORLD_MOD_LAYER_OBJECT;

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
export const WORLD_TILE_STICK_FENCE = "stick_fence";
export const WORLD_TILE_BRIDGE = "bridge";

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
  | typeof WORLD_TILE_WOOD_FLOOR
  | typeof WORLD_TILE_STICK_FENCE
  | typeof WORLD_TILE_BRIDGE;

export const WORLD_TYPE_FOREST = "forest";
export const WORLD_TYPE_ISLAND = "island";
export const WORLD_TYPE_CAVE = "cave";
export const WORLD_TYPE_BUILDING = "building";
export const WORLD_TYPE_VILLAGE = "village";

import {
  getActionDefinition,
  getActionsForItemType,
  getAllItemTypeIds,
  getPrimaryActionForItemType,
  normalizeItemState,
  stripClassOwnedItemState,
} from "./item-registry.ts";
import { CLASS_OWNED_LIVING_VALUE_KEYS } from "./runtime-config.ts";
import { ClassSize } from "./class-size.ts";

export {
  getActionDefinition,
  getActionsForItemType,
  getPrimaryActionForItemType,
};

export const WORLD_TYPES = [
  WORLD_TYPE_FOREST,
  WORLD_TYPE_ISLAND,
  WORLD_TYPE_CAVE,
  WORLD_TYPE_BUILDING,
  WORLD_TYPE_VILLAGE,
] as const;

export type WorldType = (typeof WORLD_TYPES)[number];

export const ALL_ITEM_TYPE_IDS = getAllItemTypeIds();

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
  destination_row?: number;
  destination_col?: number;
  state?: Record<string, unknown>;
  [key: string]: unknown;
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
  labelKey?: string;
  fallbackLabel?: string;
}

export type LivingValueSchema = Record<string, LivingValueSchemaEntry>;

export interface LivingClassRecord {
  id: string;
  kind: LivingKind;
  labelKey?: string;
  fallbackLabel?: string;
  slotDefinitions: LivingSlotDefinition[];
  valueTemplate: Record<string, unknown>;
  valueSchema?: LivingValueSchema;
  // NPCs of this class autonomously start a fight against any player found
  // standing on their tile (see fight-helpers.ts's maybeStartNPCAggression).
  // Meaningless for kind "player".
  aggressive?: boolean;
  // Item types a fresh NPC of this class spawns with. Weapons (state.weaponClass
  // > 0) are auto-wielded into a free hand/manipulator slot; anything else (and
  // any weapon with no free hand) goes to the bag. See applyNPCDefaultItems in
  // npc-storage.ts. Optional; missing == [].
  defaultItems?: string[];
  // Optional so the built-in DEFAULT_LIVING_CLASSES literals don't need to
  // declare it; treat missing the same as [] (admin-only, see canManageClass).
  ownerIds?: string[];
  // Per-locale display-name overrides (today just { fi }); the canonical
  // English name stays in fallbackLabel. Optional so built-in literals — which
  // translate via labelKey — need not declare it. See class-labels.ts.
  labels?: Record<string, string>;
  // How big this living renders, purely cosmetically — a "large" class is a
  // double-scale version of the same avatar mesh. Optional; missing ==
  // "medium" (unchanged appearance). See class-size.ts.
  size?: ClassSize;
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

export const TREE_ACTION_BY_ITEM_TYPE: Record<string, string> =
  ALL_ITEM_TYPE_IDS.reduce(function (acc: Record<string, string>, itemId) {
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
  stick_fence: { value: 12, walkable: false, layer: WORLD_MOD_LAYER_TERRAIN },
  bridge: { value: 13, walkable: true, layer: WORLD_MOD_LAYER_TERRAIN },
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
  12: WORLD_TILE_STICK_FENCE,
  13: WORLD_TILE_BRIDGE,
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
  return ALL_ITEM_TYPE_IDS.slice();
}

export function hashString(value: string): number {
  const str = String(value || "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export function getWorldFlavorTextIndex(worldId: string): number {
  return hashString(worldId) % WORLD_FLAVOR_TEXTS.length;
}

export function getWorldFlavorTextByIndex(index: number): string {
  return WORLD_FLAVOR_TEXTS[index] || "";
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

export function normalizeWorldDimension(
  value: unknown,
  fallback: number,
): number {
  // Null/absent DB values must fall back, not clamp: Number(null) is 0,
  // which would otherwise clamp every pre-existing world to MIN_WORLD_DIM.
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Math.floor(Number(value));
  if (!isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(MIN_WORLD_DIM, Math.min(MAX_WORLD_DIM, parsed));
}

export function normalizeWorldType(
  worldType: string | undefined | null,
): WorldType {
  const normalized = String(worldType || "").toLowerCase() as WorldType;
  return WORLD_TYPES.indexOf(normalized) !== -1
    ? normalized
    : WORLD_TYPE_FOREST;
}

export function getDefaultWorldTypeForWorldId(
  worldId: string | number,
): WorldType {
  if (isOakWorld(worldId)) return WORLD_TYPE_VILLAGE;
  if (isGuildWorld(worldId)) return WORLD_TYPE_BUILDING;
  return WORLD_TYPE_FOREST;
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
  if (normalizedType === WORLD_TYPE_VILLAGE) return WORLD_TILE_STICK_FENCE;
  return WORLD_TILE_SPRUCE_THICKET;
}

export function getWorldBoundaryTileName(worldType: string): WorldTileName {
  const normalizedType = normalizeWorldType(worldType);
  if (normalizedType === WORLD_TYPE_ISLAND) return WORLD_TILE_OCEAN;
  if (normalizedType === WORLD_TYPE_CAVE) return WORLD_TILE_MOUNTAIN;
  if (normalizedType === WORLD_TYPE_BUILDING) return WORLD_TILE_HOUSE;
  if (normalizedType === WORLD_TYPE_VILLAGE) return WORLD_TILE_STICK_FENCE;
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

export function isGuildWorld(worldId: string | number): boolean {
  return String(worldId) === GUILD_WORLD_ID;
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
  const mapRows = map.length;
  for (
    let row = OAK_CENTER_ROW - OAK_CLEAR_RADIUS;
    row <= OAK_CENTER_ROW + OAK_CLEAR_RADIUS;
    row++
  ) {
    if (row < 0 || row >= mapRows || !map[row]) continue;
    const mapCols = map[row].length;
    for (
      let col = OAK_CENTER_COL - OAK_CLEAR_RADIUS;
      col <= OAK_CENTER_COL + OAK_CLEAR_RADIUS;
      col++
    ) {
      if (col < 0 || col >= mapCols) continue;
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

export function getLivingSlotDefinition(
  livingClass: LivingClassRecord | null | undefined,
  slotId: string,
): LivingSlotDefinition | null {
  if (!livingClass || !Array.isArray(livingClass.slotDefinitions)) return null;
  const normalizedSlotId = String(slotId || "");
  for (let i = 0; i < livingClass.slotDefinitions.length; i++) {
    const slot = livingClass.slotDefinitions[i];
    if (!slot || String(slot.id || "") !== normalizedSlotId) continue;
    return slot;
  }
  return null;
}

export function slotAcceptsItemType(
  slotDef: LivingSlotDefinition | null | undefined,
  itemType: string,
): boolean {
  if (!slotDef) return false;
  if (!Array.isArray(slotDef.accepts) || slotDef.accepts.length === 0) {
    return true;
  }
  const normalizedItemType = String(itemType || "");
  if (!normalizedItemType) return false;
  return slotDef.accepts.indexOf(normalizedItemType) !== -1;
}

export function canEquipItemInSlot(
  livingClass: LivingClassRecord | null | undefined,
  slotId: string,
  itemType: string,
): boolean {
  const slotDef = getLivingSlotDefinition(livingClass, slotId);
  if (!slotDef) return false;
  return slotAcceptsItemType(slotDef, itemType);
}

export function getSlotIdsWithTag(
  livingClass: LivingClassRecord | null | undefined,
  tag: string,
): string[] {
  if (!livingClass || !Array.isArray(livingClass.slotDefinitions)) return [];
  const normalizedTag = String(tag || "");
  if (!normalizedTag) return [];
  const out: string[] = [];
  for (let i = 0; i < livingClass.slotDefinitions.length; i++) {
    const slotDef = livingClass.slotDefinitions[i];
    if (!slotDef || !Array.isArray(slotDef.tags)) continue;
    if (slotDef.tags.indexOf(normalizedTag) !== -1) {
      out.push(String(slotDef.id));
    }
  }
  return out;
}

export function getItemsInSlotsWithTag(
  inv: unknown,
  livingClass: LivingClassRecord | null | undefined,
  tag: string,
): InventoryItem[] {
  const slotIds = getSlotIdsWithTag(livingClass, tag);
  if (slotIds.length === 0 || !isRecordLike(inv) || !isRecordLike(inv.slots)) {
    return [];
  }
  const slots = inv.slots as Record<string, unknown>;
  const out: InventoryItem[] = [];
  for (let i = 0; i < slotIds.length; i++) {
    const item = slots[slotIds[i]];
    if (isValidItem(item)) out.push(item);
  }
  return out;
}

// Every living (built-in or creator-defined) gets these combat stats even if
// its class doesn't declare them in valueTemplate. currentHitPoints defaults
// to whatever maxHitPoints resolves to, so a class that only customizes
// maxHitPoints still spawns instances at full health.
//
// `level` is shared by every living kind (integer, starts at 1) — a class can
// raise it via its valueTemplate to spawn tougher, higher-XP NPCs. `experience`
// and `totalExperience` are player-only progression counters (also integers
// starting at 1): actions award XP into both, but only `experience` is meant
// to be spendable/resettable later, while `totalExperience` is a lifetime tally
// (see tree-action-helpers.ts's maybeAwardActionExperience and the combat kill
// award in fight-helpers.ts). NPCs never accrue XP, so those two keys are only
// defaulted for the "player" kind.
function applyLivingValueDefaults(
  merged: Record<string, unknown>,
  kind?: LivingKind,
): Record<string, unknown> {
  if (merged.level === undefined) merged.level = 1;
  if (merged.maxHitPoints === undefined) merged.maxHitPoints = 10;
  if (merged.currentHitPoints === undefined) {
    merged.currentHitPoints = merged.maxHitPoints;
  }
  if (merged.armorClass === undefined) merged.armorClass = 10;
  if (merged.weaponClass === undefined) merged.weaponClass = 1;
  if (kind === "player") {
    if (merged.experience === undefined) merged.experience = 1;
    if (merged.totalExperience === undefined) merged.totalExperience = 1;
  }
  return merged;
}

export function isClassOwnedLivingValueKey(key: string): boolean {
  return CLASS_OWNED_LIVING_VALUE_KEYS.indexOf(key) !== -1;
}

// Class-owned keys are NOT overlaid from stored values: for those the class's
// valueTemplate (plus the shared defaults above) wins, so editing a living
// class re-tunes livings that were saved back when the merged snapshot was
// still being flattened into the row. See CLASS_OWNED_LIVING_VALUE_KEYS.
export function normalizeLivingValues(
  values: unknown,
  valueTemplate: Record<string, unknown>,
  kind?: LivingKind,
): Record<string, unknown> {
  const out: Record<string, unknown> = applyLivingValueDefaults(
    Object.assign({}, valueTemplate || {}),
    kind,
  );
  if (!isRecordLike(values)) return out;
  Object.keys(values).forEach(function (key) {
    if (isClassOwnedLivingValueKey(key)) return;
    out[key] = values[key];
  });
  // maxHitPoints is class-owned while currentHitPoints is instance-owned, so
  // lowering a class's maxHitPoints can leave an existing living holding more
  // current hit points than its class now allows — clamp rather than letting a
  // >100% health meter reach the HUD.
  const max = Number(out.maxHitPoints);
  const current = Number(out.currentHitPoints);
  if (Number.isFinite(max) && Number.isFinite(current) && current > max) {
    out.currentHitPoints = max;
  }
  return out;
}

/**
 * Strips class-owned keys from a living's persisted shape: its own values
 * (CLASS_OWNED_LIVING_VALUE_KEYS) plus the item state of everything it carries
 * in slots and bag (CLASS_OWNED_ITEM_STATE_KEYS). Save paths call this right
 * before serializing so rows carry only instance-owned data.
 */
export function stripClassOwnedLivingState(living: LivingState): {
  slots: Record<string, unknown>;
  bag: unknown[];
  values: Record<string, unknown>;
} {
  const values: Record<string, unknown> = {};
  const srcValues = isRecordLike(living.values) ? living.values : {};
  Object.keys(srcValues).forEach(function (key) {
    if (isClassOwnedLivingValueKey(key)) return;
    values[key] = srcValues[key];
  });

  const stripItem = function (item: InventoryItem) {
    return Object.assign({}, item, {
      state: stripClassOwnedItemState(item.state),
    });
  };

  const slots: Record<string, unknown> = {};
  const srcSlots = isRecordLike(living.slots) ? living.slots : {};
  Object.keys(srcSlots).forEach(function (slotId) {
    const item = srcSlots[slotId];
    slots[slotId] = isValidItem(item) ? stripItem(item) : null;
  });

  const bag = Array.isArray(living.bag)
    ? living.bag.filter(isValidItem).map(stripItem)
    : [];

  return { slots: slots, bag: bag, values: values };
}

// Backfills an item's stat defaults (see normalizeItemState) the same way
// for items held by a living, so a bag/slot item created before a stat
// existed still reads with it once loaded/saved through normalizeLivingState.
function normalizeInventoryItem(item: InventoryItem): InventoryItem {
  return Object.assign({}, item, {
    state: normalizeItemState(item.type, item.state),
  });
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
  out.values = normalizeLivingValues(
    {},
    livingClass.valueTemplate || {},
    livingClass.kind,
  );
  if (!isRecordLike(state)) return out;

  if (isRecordLike(state.slots)) {
    const stateSlots = state.slots as Record<string, unknown>;
    Object.keys(defaultSlots).forEach(function (slotId) {
      const candidate = stateSlots[slotId];
      out.slots[slotId] = isValidItem(candidate)
        ? normalizeInventoryItem(candidate)
        : null;
    });
  }

  if (Array.isArray(state.bag)) {
    out.bag = state.bag.filter(isValidItem).map(normalizeInventoryItem);
  }

  out.values = normalizeLivingValues(
    isRecordLike(state.values) ? state.values : {},
    livingClass.valueTemplate || {},
    livingClass.kind,
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

export function getEquippedItems(inv: unknown): InventoryItem[] {
  const out: InventoryItem[] = [];
  if (isRecordLike(inv) && isRecordLike(inv.slots)) {
    const slots = inv.slots as Record<string, unknown>;
    Object.keys(slots).forEach(function (slotId) {
      const item = slots[slotId];
      if (isValidItem(item)) out.push(item);
    });
  }
  return out;
}

export function getBagItems(inv: unknown): InventoryItem[] {
  if (isRecordLike(inv) && Array.isArray(inv.bag)) {
    return inv.bag.filter(isValidItem);
  }
  return [];
}

export function getAllLivingItems(inv: unknown): InventoryItem[] {
  return getEquippedItems(inv).concat(getBagItems(inv));
}

// Shared by inventory items and world items sitting on tiles — both are
// arrays of objects with an `id`/`type`, so the same counter works for
// "what do I have in my bag" and "what ingredients are lying nearby".
export function countItemsByType(items: unknown[]): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!Array.isArray(items)) return counts;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!isValidItem(item)) continue;
    const type = String(item.type || "");
    if (!type) continue;
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

export function countLivingItemsByType(inv: unknown): Record<string, number> {
  return countItemsByType(getAllLivingItems(inv));
}

export function consumeLivingItemsByType(
  inv: unknown,
  itemId: string,
  count: number,
): number {
  let remaining = Number(count || 0);
  if (remaining <= 0 || !isRecordLike(inv)) return 0;
  let consumed = 0;
  const normalizedItemId = String(itemId || "");

  if (isRecordLike(inv.slots)) {
    const slots = inv.slots as Record<string, unknown>;
    const slotIds = Object.keys(slots);
    for (let i = 0; i < slotIds.length && remaining > 0; i++) {
      const slotId = slotIds[i];
      const item = slots[slotId];
      if (isValidItem(item) && String(item.type || "") === normalizedItemId) {
        slots[slotId] = null;
        remaining--;
        consumed++;
      }
    }
  }

  if (remaining > 0 && Array.isArray(inv.bag)) {
    for (let i = inv.bag.length - 1; i >= 0 && remaining > 0; i--) {
      const item = inv.bag[i];
      if (isValidItem(item) && String(item.type || "") === normalizedItemId) {
        inv.bag.splice(i, 1);
        remaining--;
        consumed++;
      }
    }
  }

  return consumed;
}

export function buildInventorySelectors(inv: unknown): {
  inventory_slot_ids: string[];
  inventory_selectors: string[];
} {
  const slotIds =
    isRecordLike(inv) && isRecordLike(inv.slots)
      ? Object.keys(inv.slots as Record<string, unknown>).sort()
      : ["left_hand", "right_hand"];
  return {
    inventory_slot_ids: slotIds,
    inventory_selectors: slotIds.concat(["inventory", "bag"]),
  };
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

// Locates a carried item by id across both equipped slots and the bag — the
// inventory-side counterpart of looking a world item up on a tile, used by
// item-targeted actions whose targeting scope includes the actor's own items
// (see targetingAllowsInventory in action-registry.ts).
export function findLivingItemById(
  inv: unknown,
  itemId: string,
): InventoryItem | null {
  const wanted = String(itemId || "");
  if (!wanted) return null;
  const candidates = getAllLivingItems(inv);
  for (let i = 0; i < candidates.length; i++) {
    if (String(candidates[i].id || "") === wanted) return candidates[i];
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
  if (!getActionDefinition(action)) {
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

function getAdjacentTileKeys(row: number, col: number): string[] {
  return [
    row - 1 + "_" + col,
    row + 1 + "_" + col,
    row + "_" + (col - 1),
    row + "_" + (col + 1),
    row - 1 + "_" + (col - 1),
    row - 1 + "_" + (col + 1),
    row + 1 + "_" + (col - 1),
    row + 1 + "_" + (col + 1),
  ];
}

// Tile keys a living can reach for item lookup: its current tile plus all
// eight surrounding tiles (cardinal and diagonal/corner neighbors).
export function getNearbyTileKeys(row: number, col: number): string[] {
  return [row + "_" + col].concat(getAdjacentTileKeys(row, col));
}

// Items usable for an action-availability check: the living's current tile
// plus its eight surrounding neighbors, matching how far a living can reach.
export function getNearbyTileItems(
  worldItems: Record<string, unknown>,
  row: number,
  col: number,
): unknown[] {
  const keys = getNearbyTileKeys(row, col);
  let items: unknown[] = [];
  for (let i = 0; i < keys.length; i++) {
    const tileItems = worldItems[keys[i]];
    if (Array.isArray(tileItems)) items = items.concat(tileItems);
  }
  return items;
}

// Chebyshev (chessboard) distance check used for "_nearby" action target
// kinds — a maxDistance of 1 matches getNearbyTileKeys' 8-neighbor radius.
export function isWithinTileDistance(
  rowA: number,
  colA: number,
  rowB: number,
  colB: number,
  maxDistance: number,
): boolean {
  return Math.max(Math.abs(rowA - rowB), Math.abs(colA - colB)) <= maxDistance;
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
