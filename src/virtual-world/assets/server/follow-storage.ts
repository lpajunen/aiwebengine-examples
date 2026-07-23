import { VWORLD_FOLLOW_TABLE } from "./runtime-config.ts";
import { ensureWorldDatabaseSchema } from "./schema-setup.ts";
import {
  deleteWorldRowsWhere,
  insertWorldRow,
  queryWorldRows,
  querySingleWorldRow,
  updateWorldRow,
} from "./world-db.ts";
import {
  fromStoredWorldTimestamp,
  toStoredWorldTimestamp,
} from "./world-domain.ts";

// init()'s ensureWorldDatabaseSchema() call can time out before reaching a
// newly-added table (it runs a long idempotent list of table checks
// sequentially) — self-heal here the same way action/item class caches
// self-heal on first read, rather than depending on init() having completed.
let followSchemaEnsured = false;
function ensureFollowSchema(): void {
  if (followSchemaEnsured) return;
  ensureWorldDatabaseSchema();
  followSchemaEnsured = true;
}

export interface FollowStateRow {
  follower_id: string;
  world_id: string;
  target_id: string;
  target_type: "player" | "npc";
  created_ts: number;
}

function normalizeFollowStateRow(row: unknown): FollowStateRow | null {
  const value = row as Record<string, unknown> | null;
  if (!value || !value.follower_id || !value.target_id) return null;
  const targetType = value.target_type === "npc" ? "npc" : "player";
  return {
    follower_id: String(value.follower_id),
    world_id: String(value.world_id || ""),
    target_id: String(value.target_id),
    target_type: targetType,
    created_ts: fromStoredWorldTimestamp(value.created_ts),
  };
}

export function loadFollowState(followerId: string): FollowStateRow | null {
  ensureFollowSchema();
  const row = querySingleWorldRow(
    VWORLD_FOLLOW_TABLE,
    JSON.stringify({ follower_id: String(followerId) }),
  );
  return normalizeFollowStateRow(row);
}

export function loadActiveFollowsForWorld(worldId: string): FollowStateRow[] {
  ensureFollowSchema();
  const rows = queryWorldRows(
    VWORLD_FOLLOW_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    1000,
    "id",
    "asc",
  );
  const out: FollowStateRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const normalized = normalizeFollowStateRow(rows[i]);
    if (normalized) out.push(normalized);
  }
  return out;
}

export function saveFollowState(
  followerId: string,
  worldId: string,
  targetId: string,
  targetType: "player" | "npc",
): void {
  ensureFollowSchema();
  const data = {
    follower_id: String(followerId),
    world_id: String(worldId),
    target_id: String(targetId),
    target_type: targetType,
    created_ts: toStoredWorldTimestamp(Date.now()),
  };
  // Query-then-insert/update instead of database.upsert()'s ON CONFLICT path:
  // that path silently no-ops if the unique index on follower_id isn't in
  // place (e.g. a schema step cut short), since world-db.ts's error
  // detection doesn't catch every failure shape that primitive can return.
  const existing = querySingleWorldRow(
    VWORLD_FOLLOW_TABLE,
    JSON.stringify({ follower_id: String(followerId) }),
  );
  if (existing && Number.isFinite(Number(existing.id))) {
    updateWorldRow(VWORLD_FOLLOW_TABLE, Number(existing.id), data);
  } else {
    insertWorldRow(VWORLD_FOLLOW_TABLE, data);
  }
}

export function deleteFollowState(followerId: string): void {
  ensureFollowSchema();
  deleteWorldRowsWhere(
    VWORLD_FOLLOW_TABLE,
    JSON.stringify({ follower_id: String(followerId) }),
  );
}
