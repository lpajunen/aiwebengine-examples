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
export const VWORLD_WORLD_CLASS_TABLE = "vworld_world_classes";
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
export const VWORLD_SCHEMA_VERSION = 2;
export const VWORLD_FOLLOW_TABLE = "vworld_follow_state";
export const VWORLD_FIGHT_TABLE = "vworld_fight_state";
// Per-tick chance a co-located NPC whose living class has aggressive: true
// (see LivingClassRecord in world-domain.ts) starts a fight against a player
// standing on its tile.
export const NPC_AGGRO_CHANCE = 0.4;
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
