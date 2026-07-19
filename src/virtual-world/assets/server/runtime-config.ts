// Shared runtime constants: DB table names, tick/lease timing, stream path.
// Imported directly by server modules; keep values in sync with existing rows.

export const LEASE_TTL_MS = 30000;
export const NPC_MIN_COUNT = 10;
export const NPC_MAX_COUNT = 20;
export const NPC_TICK_MS = 500;
export const NPC_TICK_LEASE_MS = 2000;
export const NPC_ACTIVE_WORLD_TTL_MS = 120000;
export const WORLD_ITEM_SPAWN_COUNT = 30;
export const VIRTUAL_WORLD_EVENTS_STREAM_PATH = "/virtual-world/events";

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
export const VWORLD_LIVING_CLASS_TABLE = "vworld_living_classes";
export const VWORLD_WORLD_CLASS_TABLE = "vworld_world_classes";
export const VWORLD_EVENT_SEQ_TABLE = "vworld_event_seqs";
