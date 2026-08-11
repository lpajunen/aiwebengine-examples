// Default dimensions for worlds with no stored rows/cols.
export const ROWS = 100;
export const COLS = 100;
export const MIN_WORLD_DIM = 8;
export const MAX_WORLD_DIM = 200;

import {
  TILE_LAYER_OBJECT,
  TILE_LAYER_TERRAIN,
  getWorldTileDef,
  isWorldTileWalkable,
  worldTileNameForValue,
  worldTileValueForName,
} from "./tile-registry.ts";

// Tile types now live in their own class repository (tile-registry.ts); these
// re-exports keep every existing importer pointed at world-domain, which is
// where the rest of the world vocabulary is.
export {
  getWorldTileDef,
  isWorldTileWalkable,
  worldTileNameForValue,
  worldTileValueForName,
};
export const WORLD_MOD_LAYER_TERRAIN = TILE_LAYER_TERRAIN;
export const WORLD_MOD_LAYER_OBJECT = TILE_LAYER_OBJECT;

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
import { LivingVisualStyle } from "./class-visual.ts";
import { normalizeClassLabels } from "./class-labels.ts";

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

// How the client draws a tile type. A fixed menu of mesh recipes the tile
// picks from, exactly like an item class's visual style — see
// TILE_VISUAL_STYLE_SPECS in client-world-render.js. This is what makes a new
// tile type one entry in WORLD_TILE_DEFS instead of another hand-written pass
// in the renderer: the two per-type passes it replaced named ten tile types
// between them, in code, on top of naming them here.
export type TileVisualStyle =
  // A slab laid over the ground, alternating `color`/`colorAlt` by tile
  // parity so a floor reads as boards or flagstones rather than one flat wash.
  | "floor"
  // A flat pane sunk slightly below ground level.
  | "water"
  // A single scattered boulder.
  | "rock"
  // A cone, tall enough to read as a peak from the game camera.
  | "mountain"
  // A post with two crossed rails: `color` paints the post, `colorAlt` the
  // rails.
  | "fence";

export interface TileVisual {
  style: TileVisualStyle;
  color?: number;
  // Second color: the other parity shade for "floor", the rails for "fence".
  colorAlt?: number;
  // Height the recipe sits at; each style has its own sensible default.
  y?: number;
}

export interface WorldTileDef {
  value: number;
  walkable: boolean;
  layer: WorldModLayer;
  // Missing means the tile is drawn by a pass of its own rather than by the
  // generic dispatcher: plain `ground` is the base floor, and spruce_thicket,
  // pine_tree and house each have their own instanced/mesh pass with
  // behaviour the recipes cannot express (fixtures suppress pines, houses
  // carry walls and roofs).
  visual?: TileVisual;
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
  // Owner-only values are returned only to the owning player's private
  // inventory. Missing visibility preserves legacy behavior: built-in
  // world-observable values are public; unknown values remain private.
  visibility?: "public" | "owner";
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
  // ── The death/revival cycle, as data ──────────────────────────────────
  // What happens when a living of this class is killed, and how it comes
  // back. Together these replace the hardcoded player_ghost/npc_corpse names
  // that used to sit in fight-helpers.ts and the pray handler. See
  // resolveNPCDeath/resolvePlayerDeath in fight-helpers.ts.
  //
  // The class this living *becomes* when killed, instead of being removed
  // from the world — the built-in player classes name player_ghost, so a
  // defeated player keeps their inventory and lingers as a ghost. Missing
  // means "no transformation": an NPC despawns, and a player (who cannot be
  // despawned) simply revives in place at full health.
  deathClassId?: string;
  // Item type left behind on the death tile. The built-in NPC classes name
  // npc_corpse; players leave nothing. Missing == no corpse. Independent of
  // deathClassId, so a class can both transform and drop something.
  corpseItemId?: string;
  // The class a living of this class returns to when revived — the inverse of
  // deathClassId, and what makes the pray handler content-free: it revives
  // whatever class declares a reviveClassId, rather than testing for a ghost
  // by name. Missing == this class cannot be revived.
  reviveClassId?: string;
  // Per-tick odds shaping how this class behaves when left to itself: how
  // often it stands still rather than stepping, how readily it picks things
  // up or drops them, how often it uses a tree tool it carries. Any field
  // left out falls back to DEFAULT_NPC_BEHAVIOR (runtime-config.ts), which is
  // what every class was hardcoded to before this existed. Meaningless for
  // kind "player".
  behavior?: {
    idleChance?: number;
    pickUpChance?: number;
    dropChance?: number;
    forageChance?: number;
  };
  // Marks this class as the one a new living of its kind starts as: a fresh
  // player's body, or an NPC seeded without a class of its own. Exactly one
  // class per kind should carry it; the first match wins, and if none does the
  // built-in human is used. This replaced two functions that returned the
  // literals "player_human" and "npc_human".
  isDefault?: boolean;
  // Whether this living may take part in combat at all — as attacker or as
  // target. False makes a class untouchable and harmless: the built-in
  // player_ghost sets it, which is what stops a dead player from fighting on,
  // being attacked, or being aggro'd by a hostile NPC. Missing == true, so
  // every ordinary class fights as before. A running fight whose either side
  // stops being a combatant is ended by the tick (fight-helpers.ts).
  combatant?: boolean;
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
  // Which avatar mesh recipe the client builds for this class, and the primary
  // body/fur/feather color to paint it with. Together with size these are the
  // three knobs that let a new class reuse an existing silhouette (a donkey is
  // the horse recipe at another size and color) without any client work.
  // Optional; missing == "humanoid" and "" (client picks a per-instance color
  // from the style's own palette, as it did before colors were configurable).
  // See class-visual.ts.
  visualStyle?: LivingVisualStyle;
  color?: string;
}

export interface LivingState {
  class_id: string;
  slots: Record<string, InventoryItem | null>;
  bag: InventoryItem[];
  values: Record<string, unknown>;
}

// Authored identity for one living *instance*, as opposed to the class it is
// an instance of: this is what makes an NPC "Aino the Gatekeeper" rather than
// another anonymous human. Written by a world class's `npc` placement (see
// world-placements.ts) and carried on the NPC row, so a named guard keeps its
// name across ticks, restarts and the world being unloaded.
//
// Naming follows the class convention: `name` is the canonical English text
// and `labels` holds per-locale overrides the client prefers (localizeLabel).
// There is no labelKey — authored content has no i18n bundle entry to point
// at. `description` is the lore line the tile inspector shows.
//
// An NPC with no identity falls back to getNPCDisplayName's hashed name, which
// is what every ambient spawn still gets.
export interface LivingIdentity {
  name?: string;
  labels?: Record<string, string>;
  description?: string;
  descriptions?: Record<string, string>;
}

// The public world-facing identity of a living. "creature" remains a
// class-authoring kind, but runtime public entities are presently players or
// NPCs.
export type PublicLivingKind = "player" | "npc";

// Equipped items are visible, but their state may contain private data such
// as a container's contents. The public projection deliberately exposes only
// stable identity and visual type until item-state visibility is modeled.
export interface PublicEquippedItem {
  id: string;
  type: string;
}

export interface PublicLivingSnapshot {
  id: string;
  kind: PublicLivingKind;
  display_name: string;
  row: number;
  col: number;
  seq: number;
  rotation: number;
  class_id: string;
  slots: Record<string, PublicEquippedItem | null>;
  values: Record<string, unknown>;
  // Present only for a living someone authored an identity for. `display_name`
  // above already carries the canonical name, so this adds what the server
  // cannot resolve on the viewer's behalf: the per-locale name overrides and
  // the description.
  identity?: LivingIdentity;
}

export interface PublicLivingSnapshotInput {
  id: string;
  kind: PublicLivingKind;
  displayName: string;
  row: number;
  col: number;
  seq: number;
  rotation: number;
  living: unknown;
  livingClass?: LivingClassRecord | null;
}

// These values affect a living's observable condition or combat capability.
// Progression and unknown creator-defined values are private until their
// schemas explicitly support public visibility.
const DEFAULT_PUBLIC_LIVING_VALUE_KEYS = [
  "armorClass",
  "currentHitPoints",
  "fatigue",
  "level",
  "maxHitPoints",
  "weaponClass",
];

const OWNER_ONLY_LIVING_VALUE_KEYS = ["experience", "totalExperience"];

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
  ocean: {
    value: 4,
    walkable: false,
    layer: WORLD_MOD_LAYER_TERRAIN,
    visual: { style: "water", color: 0x2f6fa3, y: -0.055 },
  },
  lake: {
    value: 5,
    walkable: false,
    layer: WORLD_MOD_LAYER_TERRAIN,
    visual: { style: "water", color: 0x4f91c9, y: -0.05 },
  },
  river: {
    value: 6,
    walkable: false,
    layer: WORLD_MOD_LAYER_TERRAIN,
    visual: { style: "water", color: 0x62b9d9, y: -0.045 },
  },
  rock: {
    value: 7,
    walkable: false,
    layer: WORLD_MOD_LAYER_TERRAIN,
    visual: { style: "rock", color: 0x7f8892 },
  },
  mountain: {
    value: 8,
    walkable: false,
    layer: WORLD_MOD_LAYER_TERRAIN,
    visual: { style: "mountain", color: 0x8a8178 },
  },
  sand: {
    value: 9,
    walkable: true,
    layer: WORLD_MOD_LAYER_TERRAIN,
    visual: { style: "floor", color: 0xd7c182, colorAlt: 0xcbb170 },
  },
  cave_floor: {
    value: 10,
    walkable: true,
    layer: WORLD_MOD_LAYER_TERRAIN,
    visual: { style: "floor", color: 0x6a6b72, colorAlt: 0x5a5c63 },
  },
  wood_floor: {
    value: 11,
    walkable: true,
    layer: WORLD_MOD_LAYER_TERRAIN,
    visual: { style: "floor", color: 0x9b6c3f, colorAlt: 0x835730 },
  },
  stick_fence: {
    value: 12,
    walkable: false,
    layer: WORLD_MOD_LAYER_TERRAIN,
    visual: { style: "fence", color: 0x8a6239, colorAlt: 0x9c7444 },
  },
  bridge: {
    value: 13,
    walkable: true,
    layer: WORLD_MOD_LAYER_TERRAIN,
    visual: { style: "floor", color: 0xb08a55, colorAlt: 0x9a7447, y: 0.03 },
  },
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

/**
 * Accepts a parsed object or a JSON string (an NPC row's `identity_json`, a
 * placement's authored block) and returns a clean identity, or null when
 * nothing was authored. Lenient by design: it runs on the DB read path, where
 * a malformed value must still yield a loadable NPC.
 * @returns null rather than an empty object, so callers can persist absence
 */
export function normalizeLivingIdentity(raw: unknown): LivingIdentity | null {
  // The overwhelmingly common case is "nothing authored", which reaches here
  // as "" from an NPC row's identity_json. Bail before the parse: throwing and
  // catching once per NPC per tick is expensive enough to matter, and the NPC
  // tick is already the first thing the engine interrupts.
  if (!raw) return null;
  let source: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    try {
      source = JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  if (!isRecordLike(source)) return null;
  const out: LivingIdentity = {};
  const name = typeof source.name === "string" ? source.name.trim() : "";
  if (name) out.name = name;
  const description =
    typeof source.description === "string" ? source.description.trim() : "";
  if (description) out.description = description;
  const labels = normalizeClassLabels(source.labels);
  if (Object.keys(labels).length > 0) out.labels = labels;
  const descriptions = normalizeClassLabels(source.descriptions);
  if (Object.keys(descriptions).length > 0) out.descriptions = descriptions;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * The name to show for an NPC: its authored one when a placement gave it one,
 * and the hashed name every ambient spawn gets otherwise. Only the canonical
 * text — a locale override travels to the client in the snapshot's `identity`,
 * since the server does not know the viewer's locale.
 * Reads `npc.identity` as-is rather than re-normalizing it: every load path
 * already normalized it once, and this runs per NPC per snapshot.
 * @param npc the NPC record, whose `identity` is consulted; may be absent
 */
export function resolveNPCDisplayName(
  worldId: string,
  npcId: string,
  npc: unknown,
): string {
  if (isRecordLike(npc) && isRecordLike(npc.identity)) {
    const name = npc.identity.name;
    if (typeof name === "string" && name) return name;
  }
  return getNPCDisplayName(worldId, npcId);
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

// Fallback for a world with no stored row. Deliberately world-id agnostic: the
// start world and the guild used to be special-cased here, but both have had a
// stored type since long before placements, and hard-coding two ids meant no
// other deployment could ever have a non-forest front door.
export function getDefaultWorldTypeForWorldId(
  _worldId: string | number,
): WorldType {
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

export function createWorldId(): string {
  return String(Math.floor(Math.random() * 999999) + 1);
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

export function toPublicEquippedItem(item: unknown): PublicEquippedItem | null {
  if (!isValidItem(item)) return null;
  return { id: item.id, type: item.type };
}

export function toPublicLivingSlots(
  living: unknown,
): Record<string, PublicEquippedItem | null> {
  if (!isRecordLike(living) || !isRecordLike(living.slots)) return {};
  const slots = living.slots as Record<string, unknown>;
  const out: Record<string, PublicEquippedItem | null> = {};
  Object.keys(slots).forEach(function (slotId) {
    out[slotId] = toPublicEquippedItem(slots[slotId]);
  });
  return out;
}

export function toPublicLivingValues(
  living: unknown,
  livingClass?: LivingClassRecord | null,
): Record<string, unknown> {
  if (!isRecordLike(living) || !isRecordLike(living.values)) return {};
  const values = living.values as Record<string, unknown>;
  const valueSchema =
    livingClass && livingClass.valueSchema ? livingClass.valueSchema : {};
  const out: Record<string, unknown> = {};
  Object.keys(values).forEach(function (key) {
    if (OWNER_ONLY_LIVING_VALUE_KEYS.indexOf(key) !== -1) return;
    const visibility = valueSchema[key] && valueSchema[key].visibility;
    if (
      visibility === "public" ||
      (visibility !== "owner" &&
        DEFAULT_PUBLIC_LIVING_VALUE_KEYS.indexOf(key) !== -1)
    ) {
      out[key] = values[key];
    }
  });
  return out;
}

export function toPublicLivingSnapshot(
  input: PublicLivingSnapshotInput,
): PublicLivingSnapshot {
  const living = isRecordLike(input.living) ? input.living : {};
  const classId =
    typeof living.class_id === "string" && living.class_id
      ? living.class_id
      : input.livingClass && input.livingClass.id
        ? input.livingClass.id
        : "";
  const snapshot: PublicLivingSnapshot = {
    id: String(input.id),
    kind: input.kind,
    display_name: String(input.displayName || ""),
    row: Number(input.row),
    col: Number(input.col),
    seq: Number(input.seq),
    rotation: Number(input.rotation),
    class_id: classId,
    slots: toPublicLivingSlots(living),
    values: toPublicLivingValues(living, input.livingClass),
  };
  // The name itself is already in display_name; only the parts the client has
  // to resolve for itself travel here, and only when something was authored.
  if (isRecordLike(living.identity)) {
    const identity: LivingIdentity = {};
    if (isRecordLike(living.identity.labels)) {
      identity.labels = living.identity.labels as Record<string, string>;
    }
    if (typeof living.identity.description === "string") {
      identity.description = living.identity.description;
    }
    if (isRecordLike(living.identity.descriptions)) {
      identity.descriptions = living.identity.descriptions as Record<
        string,
        string
      >;
    }
    if (Object.keys(identity).length > 0) snapshot.identity = identity;
  }
  return snapshot;
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
