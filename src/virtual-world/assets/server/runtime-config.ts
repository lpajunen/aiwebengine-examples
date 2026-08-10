// Shared runtime constants: DB table names, tick/lease timing, stream path.
// Imported directly by server modules; keep values in sync with existing rows.

export const LEASE_TTL_MS = 30000;
export const NPC_TICK_MS = 500;
export const NPC_TICK_LEASE_MS = 2000;
export const NPC_ACTIVE_WORLD_TTL_MS = 120000;
// How long after a manifest-tracked item is picked up or NPC is killed before
// a replacement is spawned back into the world (see spawn-timers.ts).
export const RESPAWN_DELAY_MS = 30 * 60 * 1000;
// Idle fatigue recovery rate shared by players and NPCs so both take the
// same calendar time to idle from a given fatigue value down to 0.
export const FATIGUE_RECOVERY_PER_SECOND = 0.5;
// Free experience it costs to advance to the next level at the Adventurer's
// guild training post: the first upgrade (level 1 -> 2) costs 1 x this, the
// second (2 -> 3) costs 2 x, the third 3 x, and so on — i.e. currentLevel x
// this. Only the spendable `experience` value is reduced; `totalExperience`
// (the lifetime tally) is left untouched. See the advance_level branch in
// tree-action-helpers.ts.
export const ADVANCE_LEVEL_COST_PER_LEVEL = 1000;
export const VIRTUAL_WORLD_EVENTS_STREAM_PATH = "/virtual-world/events";

// Class-owned stat keys: tuning knobs the CLASS owns, never the instance.
//
// Item state / living values otherwise work like prototype delegation — an
// instance stores its own copy of a key and the class template only fills in
// what the instance is missing (see normalizeItemState in item-registry.ts and
// normalizeLivingValues in world-domain.ts). That works on a fresh instance,
// but the save path used to persist the fully MERGED snapshot, so the first
// write baked every class value into the row and froze it there: raising a
// class's maxHitPoints left every already-saved instance on the old number,
// indistinguishable from a deliberate override.
//
// The keys below are the ones no gameplay code ever writes — they are pure
// class tuning. For them the relationship is inverted: the class value always
// wins on read, and the save path strips them from the row entirely, so
// editing a class immediately re-tunes every existing instance and rows slim
// down as they are rewritten. Every other key (currentHitPoints, contents,
// fatigue, level, experience, totalExperience, and anything a creator's action
// effects write) stays instance-owned and is persisted normally.
//
// Only add a key here once nothing mutates it at runtime — a key listed here
// silently discards writes. `level` in particular does NOT belong: the
// advance_level action writes it (tree-action-helpers.ts).
export const CLASS_OWNED_ITEM_STATE_KEYS = [
  "maxHitPoints",
  "armorClass",
  "weaponClass",
  "weaponRange",
];
export const CLASS_OWNED_LIVING_VALUE_KEYS = [
  "maxHitPoints",
  "armorClass",
  "weaponClass",
];

export const WORLD_CHAT_MAX = 100;
export const DM_MAX = 200;

export const VWORLD_CHAT_TABLE = "vworld_chat_messages";
export const VWORLD_DM_TABLE = "vworld_direct_messages";
export const VWORLD_DM_INDEX_TABLE = "vworld_dm_index";
export const VWORLD_ONLINE_PRESENCE_TABLE = "vworld_online_presence";
export const VWORLD_PLAYER_HEARTBEAT_TABLE = "vworld_player_heartbeats";
export const VWORLD_PLAYER_MOVE_LEASE_TABLE = "vworld_player_move_leases";
export const VWORLD_PLAYER_NICK_TABLE = "vworld_player_nicks";
export const VWORLD_PLAYER_WORLD_TABLE = "vworld_player_worlds";
export const VWORLD_PLAYER_POSITION_TABLE = "vworld_player_positions";
export const VWORLD_PLAYER_INVENTORY_TABLE = "vworld_player_inventory";
export const VWORLD_WORLD_TYPE_TABLE = "vworld_world_types";
export const VWORLD_WORLD_MOD_TABLE = "vworld_world_mods";
export const VWORLD_WORLD_ITEM_TABLE = "vworld_world_items";
export const VWORLD_WORLD_ITEM_META_TABLE = "vworld_world_item_meta";
export const VWORLD_NPC_TABLE = "vworld_npcs";
export const VWORLD_NPC_ACTIVE_WORLD_TABLE = "vworld_npc_active_worlds";
export const VWORLD_NPC_TICK_TABLE = "vworld_npc_tick_meta";
export const VWORLD_NPC_TICK_LEASE_TABLE = "vworld_npc_tick_leases";
export const VWORLD_ITEM_CLASS_TABLE = "vworld_item_classes";
export const VWORLD_ACTION_CLASS_TABLE = "vworld_action_classes";
export const VWORLD_PENDING_ACTION_TABLE = "vworld_pending_actions";
export const VWORLD_LIVING_CLASS_TABLE = "vworld_living_classes";
export const VWORLD_TILE_CLASS_TABLE = "vworld_tile_classes";
// Deployment configuration, deliberately not world-class content: a class is a
// reusable template, while a deployment needs one concrete world instance to
// drop new players into. Change these to move the game's front door.
export const START_WORLD_ID = "10000";
export const START_WORLD_CLASS_ID = "birdhaven";

export const VWORLD_WORLD_CLASS_TABLE = "vworld_world_classes";
// One row per authored placement per world — what a world class's placements
// actually created in a given world. See world-placement-instances.ts.
export const VWORLD_WORLD_PLACEMENT_TABLE = "vworld_world_placements";
// No CRUD route or MCP tool ever writes to this table — rows are added by an
// operator directly via the DB, deliberately kept out of the creator_stone
// item-economy trust boundary. See canManageClass() in http-handler-helpers.ts.
export const VWORLD_ADMIN_TABLE = "vworld_admins";
export const VWORLD_SPAWN_TIMER_TABLE = "vworld_spawn_timers";
export const VWORLD_EVENT_SEQ_TABLE = "vworld_event_seqs";
// Marker table recording which schema revision has been fully applied, so
// init() can skip the ~200 idempotent DDL round-trips in schema-setup.ts on
// every process start. See ensureWorldDatabaseSchema().
export const VWORLD_SCHEMA_VERSION_TABLE = "vworld_schema_version";
// BUMP THIS whenever any DDL in schema-setup.ts changes — a new table, column,
// or index. The migration list is skipped entirely while the persisted marker
// matches this number, so a forgotten bump means the new column is never
// created on an already-migrated database.
// v2: living class visual_style/color + item class style columns.
// v4: action class living_effect_json + linked_world_json; living class
//     death_class_id/corpse_item_id/revive_class_id/combatant.
// v5: action class item_effect_json.
// v6: living class behavior_json.
// v7: vworld_tile_classes table.
// v8: world class generation_json.
// v9: action class progression_json + messages_json; living class is_default.
export const VWORLD_SCHEMA_VERSION = 9;
export const VWORLD_FOLLOW_TABLE = "vworld_follow_state";
export const VWORLD_FIGHT_TABLE = "vworld_fight_state";
// Per-tick chance a co-located NPC whose living class has aggressive: true
// (see LivingClassRecord in world-domain.ts) starts a fight against a player
// standing on its tile.
export const NPC_AGGRO_CHANCE = 0.4;
// Per-tick odds governing what an NPC does with itself, and the values every
// class used to be stuck with — they were four literals scattered through
// npc-tick-helpers.ts, identical for a wolf, a chicken and a woodsman. A
// living class can now override any of them (LivingClassRecord.behavior), so
// temperament is content; these remain the defaults for anything that does
// not say otherwise.
export const DEFAULT_NPC_BEHAVIOR = {
  // Chance of standing still instead of taking a step.
  idleChance: 0.35,
  // Chance of picking up whatever pickable items share the NPC's tile.
  pickUpChance: 0.65,
  // Chance of dropping something it is carrying.
  dropChance: 0.12,
  // Chance of using a tree tool it carries on a neighbouring square.
  forageChance: 0.08,
};
// Max Chebyshev tile distance for actions with targetKind "item_nearby" or
// "living_nearby" (e.g. follow, fight) — see resolveActionTarget() in
// tree-action-helpers.ts and isWithinTileDistance() in world-domain.ts.
export const NEARBY_TARGET_TILE_DISTANCE = 5;
// Give-up deadline for a walk-then-act approach (DESIGN-targeting.md step 2):
// how long the actor keeps stepping toward a target chosen for an action with
// targeting.approach "walk_adjacent" before the queued action is abandoned
// (target unreachable, blocked, or fleeing faster than we close). See
// resolvePendingActionsForWorld in tree-action-helpers.ts.
export const APPROACH_ACTION_MAX_MS = 15000;
// Max items a single container-kind item (e.g. chest) can hold — keeps
// state_json payloads and container UI bounded. Containers cannot nest, so
// this is also the effective bound on total items reachable through one
// container.
export const MAX_CONTAINER_ITEMS = 20;

// Tile-reservation rule names — see world-reservations.ts, which resolves
// which tiles carry which rule. The names live here, in the dependency-free
// shared-constants module, rather than beside that logic: action-registry.ts
// needs them for its blocked-zone declarations, and importing
// world-reservations.ts there would close a cycle
// (world-domain -> item-registry -> action-registry -> world-reservations ->
// world-domain) that the aiwebengine module loader rejects at transpile time,
// even though TypeScript accepts it.
export const RESERVATION_BLOCK_PLANT = "block_plant";
export const RESERVATION_BLOCK_BUILD = "block_build";
export const RESERVATION_BLOCK_TERRAIN_FEATURE = "block_terrain_feature";
export const RESERVATION_SPAWN_AREA = "spawn_area";
export const RESERVATION_PROTECT_LANDMARK = "protect_landmark";
// Declared so placements can already be authored against it, but nothing
// consumes it yet: random item/NPC population does not currently avoid any
// reserved area, and making it do so is a behavior change that belongs to
// phase 3 of TODO-placements.md.
export const RESERVATION_BLOCK_RANDOM_SPAWN = "block_random_spawn";
// Paints the reserved tiles back to walkable floor after map generation, so a
// clearing is actually clear of the trees/rocks the generator scattered.
export const RESERVATION_CLEAR_TERRAIN = "clear_terrain";

// The registry strict placement validation checks names against. Lives here
// rather than in world-reservations.ts so world-placements.ts can validate
// without importing the lookup module, which resolves placements and would
// close a cycle back through world-class-storage.
export const RESERVATION_RULES = [
  RESERVATION_BLOCK_PLANT,
  RESERVATION_BLOCK_BUILD,
  RESERVATION_BLOCK_TERRAIN_FEATURE,
  RESERVATION_SPAWN_AREA,
  RESERVATION_PROTECT_LANDMARK,
  RESERVATION_BLOCK_RANDOM_SPAWN,
  RESERVATION_CLEAR_TERRAIN,
];

export function isReservationRule(rule: string): boolean {
  return RESERVATION_RULES.indexOf(String(rule)) !== -1;
}
