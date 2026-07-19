import {
  VWORLD_PLAYER_HEARTBEAT_TABLE,
  VWORLD_PLAYER_MOVE_LEASE_TABLE,
  VWORLD_PLAYER_POSITION_TABLE,
  VWORLD_PLAYER_WORLD_TABLE,
} from "./runtime-config.ts";
import {
  deleteWorldRowsWhere,
  querySingleWorldRow,
  queryWorldRows,
  updateWorldRow,
  upsertWorldRow,
} from "./world-db.ts";
import {
  fromStoredWorldTimestamp,
  toStoredWorldTimestamp,
} from "./world-domain.ts";

export interface PlayerPositionRow {
  world_id: string;
  row: number;
  col: number;
  seq: number;
  rotation: number;
  session_id: string;
  ts: number;
}

export interface PlayerMoveLeaseRow {
  session_id: string;
  expires_at: number;
}

export interface SavePlayerPositionInput {
  row: number;
  col: number;
  seq: number;
  rotation: number;
  session_id?: string;
  ts?: number;
}

export function getPlayerWorld(userId: string): string {
  const row = querySingleWorldRow(
    VWORLD_PLAYER_WORLD_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
  if (row && row.world_id) return String(row.world_id);
  return "";
}

export function savePlayerWorld(userId: string, worldId: string): string {
  upsertWorldRow(VWORLD_PLAYER_WORLD_TABLE, ["user_id"], {
    user_id: String(userId),
    world_id: String(worldId),
    updated_ts: toStoredWorldTimestamp(Date.now()),
  });
  return String(worldId);
}

export function normalizePlayerPositionRow(
  row: unknown,
): PlayerPositionRow | null {
  const value = row as Record<string, unknown> | null;
  if (
    !value ||
    !Number.isFinite(Number(value.row)) ||
    !Number.isFinite(Number(value.col))
  ) {
    return null;
  }
  return {
    world_id: String(value.world_id || ""),
    row: Number(value.row),
    col: Number(value.col),
    seq: Number.isFinite(Number(value.seq)) ? Number(value.seq) : 0,
    rotation: Number.isFinite(Number(value.rotation))
      ? Number(value.rotation)
      : 0,
    session_id: typeof value.session_id === "string" ? value.session_id : "",
    ts: fromStoredWorldTimestamp(value.updated_ts),
  };
}

export function loadPlayerPosition(userId: string): PlayerPositionRow | null {
  const row = querySingleWorldRow(
    VWORLD_PLAYER_POSITION_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
  return normalizePlayerPositionRow(row);
}

export function loadAllPlayerPositions(): Record<string, PlayerPositionRow> {
  const rows = queryWorldRows(
    VWORLD_PLAYER_POSITION_TABLE,
    JSON.stringify({}),
    1000,
    "id",
    "desc",
  );
  const out: Record<string, PlayerPositionRow> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const userId = row && row.user_id ? String(row.user_id) : "";
    if (!userId || out[userId]) continue;
    const normalized = normalizePlayerPositionRow(row);
    if (!normalized) continue;
    out[userId] = normalized;
  }
  return out;
}

export function savePlayerPosition(
  userId: string,
  worldId: string,
  position: SavePlayerPositionInput,
): void {
  upsertWorldRow(VWORLD_PLAYER_POSITION_TABLE, ["user_id"], {
    user_id: String(userId),
    world_id: String(worldId),
    row: Number(position.row),
    col: Number(position.col),
    seq: Number.isFinite(Number(position.seq)) ? Number(position.seq) : 0,
    rotation: Number.isFinite(Number(position.rotation))
      ? Number(position.rotation)
      : 0,
    session_id:
      typeof position.session_id === "string" ? position.session_id : "",
    updated_ts: toStoredWorldTimestamp(
      Number.isFinite(Number(position.ts)) ? Number(position.ts) : Date.now(),
    ),
  });
}

export function deletePlayerPosition(userId: string): void {
  deleteWorldRowsWhere(
    VWORLD_PLAYER_POSITION_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
}

export function loadPlayerMoveLease(userId: string): PlayerMoveLeaseRow | null {
  const row = querySingleWorldRow(
    VWORLD_PLAYER_MOVE_LEASE_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
  if (!row) return null;
  return {
    session_id: typeof row.session_id === "string" ? row.session_id : "",
    expires_at: fromStoredWorldTimestamp(row.expires_ts),
  };
}

export function savePlayerMoveLease(
  userId: string,
  sessionId: string,
  expiresAt: number,
): void {
  upsertWorldRow(VWORLD_PLAYER_MOVE_LEASE_TABLE, ["user_id"], {
    user_id: String(userId),
    session_id: String(sessionId || ""),
    expires_ts: toStoredWorldTimestamp(expiresAt),
  });
}

export function deletePlayerMoveLease(userId: string): void {
  deleteWorldRowsWhere(
    VWORLD_PLAYER_MOVE_LEASE_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
}

export function loadPlayerHeartbeatTs(userId: string): number {
  const row = querySingleWorldRow(
    VWORLD_PLAYER_HEARTBEAT_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
  if (!row) return 0;
  return fromStoredWorldTimestamp(row.heartbeat_ts);
}

export function loadPlayerHeartbeatMap(): Record<string, number> {
  const rows = queryWorldRows(
    VWORLD_PLAYER_HEARTBEAT_TABLE,
    JSON.stringify({}),
    1000,
    "id",
    "desc",
  );
  const out: Record<string, number> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.user_id) continue;
    const heartbeatUserId = String(row.user_id);
    if (Object.prototype.hasOwnProperty.call(out, heartbeatUserId)) continue;
    out[heartbeatUserId] = fromStoredWorldTimestamp(row.heartbeat_ts);
  }
  return out;
}

export function savePlayerHeartbeatTs(
  userId: string,
  heartbeatTs: number,
): void {
  upsertWorldRow(VWORLD_PLAYER_HEARTBEAT_TABLE, ["user_id"], {
    user_id: String(userId),
    heartbeat_ts: toStoredWorldTimestamp(heartbeatTs),
  });
}

export function deletePlayerHeartbeat(userId: string): void {
  deleteWorldRowsWhere(
    VWORLD_PLAYER_HEARTBEAT_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
}

export function markPlayerPositionInactive(userId: string): void {
  const row = querySingleWorldRow(
    VWORLD_PLAYER_POSITION_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
  if (!row || !Number.isFinite(Number(row.id))) return;
  updateWorldRow(VWORLD_PLAYER_POSITION_TABLE, Number(row.id), {
    user_id: String(row.user_id || userId),
    world_id: String(row.world_id || "10000"),
    row: Number.isFinite(Number(row.row)) ? Number(row.row) : 1,
    col: Number.isFinite(Number(row.col)) ? Number(row.col) : 1,
    seq: Number.isFinite(Number(row.seq)) ? Number(row.seq) : 0,
    rotation: Number.isFinite(Number(row.rotation)) ? Number(row.rotation) : 0,
    session_id: typeof row.session_id === "string" ? row.session_id : "",
    updated_ts: 0,
  });
}
