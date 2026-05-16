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

type WorldDbLogFn = (msg: string, obj?: unknown) => void;

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

export function getPlayerWorld(
  userId: string,
  playerWorldTable: string,
  log: WorldDbLogFn,
): string {
  const row = querySingleWorldRow(
    playerWorldTable,
    JSON.stringify({ user_id: String(userId) }),
    log,
  );
  if (row && row.world_id) return String(row.world_id);
  return "";
}

export function savePlayerWorld(
  userId: string,
  worldId: string,
  playerWorldTable: string,
  log: WorldDbLogFn,
): string {
  upsertWorldRow(
    playerWorldTable,
    ["user_id"],
    {
      user_id: String(userId),
      world_id: String(worldId),
      updated_ts: toStoredWorldTimestamp(Date.now()),
    },
    log,
  );
  return String(worldId);
}

export function normalizePlayerPositionRow(row: unknown): PlayerPositionRow | null {
  const value = row as Record<string, unknown> | null;
  if (!value || !Number.isFinite(Number(value.row)) || !Number.isFinite(Number(value.col))) {
    return null;
  }
  return {
    world_id: String(value.world_id || ""),
    row: Number(value.row),
    col: Number(value.col),
    seq: Number.isFinite(Number(value.seq)) ? Number(value.seq) : 0,
    rotation: Number.isFinite(Number(value.rotation)) ? Number(value.rotation) : 0,
    session_id: typeof value.session_id === "string" ? value.session_id : "",
    ts: fromStoredWorldTimestamp(value.updated_ts),
  };
}

export function loadPlayerPosition(
  userId: string,
  playerPositionTable: string,
  log: WorldDbLogFn,
): PlayerPositionRow | null {
  const row = querySingleWorldRow(
    playerPositionTable,
    JSON.stringify({ user_id: String(userId) }),
    log,
  );
  return normalizePlayerPositionRow(row);
}

export function loadAllPlayerPositions(
  playerPositionTable: string,
  log: WorldDbLogFn,
): Record<string, PlayerPositionRow> {
  const rows = queryWorldRows(playerPositionTable, "", 1000, "updated_ts", "desc", log);
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
  playerPositionTable: string,
  log: WorldDbLogFn,
): void {
  upsertWorldRow(
    playerPositionTable,
    ["user_id"],
    {
      user_id: String(userId),
      world_id: String(worldId),
      row: Number(position.row),
      col: Number(position.col),
      seq: Number.isFinite(Number(position.seq)) ? Number(position.seq) : 0,
      rotation: Number.isFinite(Number(position.rotation)) ? Number(position.rotation) : 0,
      session_id: typeof position.session_id === "string" ? position.session_id : "",
      updated_ts: toStoredWorldTimestamp(
        Number.isFinite(Number(position.ts)) ? Number(position.ts) : Date.now(),
      ),
    },
    log,
  );
}

export function deletePlayerPosition(
  userId: string,
  playerPositionTable: string,
  log: WorldDbLogFn,
): void {
  deleteWorldRowsWhere(
    playerPositionTable,
    JSON.stringify({ user_id: String(userId) }),
    log,
  );
}

export function loadPlayerMoveLease(
  userId: string,
  playerMoveLeaseTable: string,
  log: WorldDbLogFn,
): PlayerMoveLeaseRow | null {
  const row = querySingleWorldRow(
    playerMoveLeaseTable,
    JSON.stringify({ user_id: String(userId) }),
    log,
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
  playerMoveLeaseTable: string,
  log: WorldDbLogFn,
): void {
  upsertWorldRow(
    playerMoveLeaseTable,
    ["user_id"],
    {
      user_id: String(userId),
      session_id: String(sessionId || ""),
      expires_ts: toStoredWorldTimestamp(expiresAt),
    },
    log,
  );
}

export function deletePlayerMoveLease(
  userId: string,
  playerMoveLeaseTable: string,
  log: WorldDbLogFn,
): void {
  deleteWorldRowsWhere(
    playerMoveLeaseTable,
    JSON.stringify({ user_id: String(userId) }),
    log,
  );
}

export function loadPlayerHeartbeatTs(
  userId: string,
  playerHeartbeatTable: string,
  log: WorldDbLogFn,
): number {
  const row = querySingleWorldRow(
    playerHeartbeatTable,
    JSON.stringify({ user_id: String(userId) }),
    log,
  );
  if (!row) return 0;
  return fromStoredWorldTimestamp(row.heartbeat_ts);
}

export function loadPlayerHeartbeatMap(
  playerHeartbeatTable: string,
  log: WorldDbLogFn,
): Record<string, number> {
  const rows = queryWorldRows(playerHeartbeatTable, "", 1000, "heartbeat_ts", "desc", log);
  const out: Record<string, number> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.user_id) continue;
    const heartbeatUserId = String(row.user_id);
    if (out[heartbeatUserId]) continue;
    out[heartbeatUserId] = fromStoredWorldTimestamp(row.heartbeat_ts);
  }
  return out;
}

export function savePlayerHeartbeatTs(
  userId: string,
  heartbeatTs: number,
  playerHeartbeatTable: string,
  log: WorldDbLogFn,
): void {
  upsertWorldRow(
    playerHeartbeatTable,
    ["user_id"],
    {
      user_id: String(userId),
      heartbeat_ts: toStoredWorldTimestamp(heartbeatTs),
    },
    log,
  );
}

export function deletePlayerHeartbeat(
  userId: string,
  playerHeartbeatTable: string,
  log: WorldDbLogFn,
): void {
  deleteWorldRowsWhere(
    playerHeartbeatTable,
    JSON.stringify({ user_id: String(userId) }),
    log,
  );
}

export function markPlayerPositionInactive(
  userId: string,
  playerPositionTable: string,
  log: WorldDbLogFn,
): void {
  const row = querySingleWorldRow(
    playerPositionTable,
    JSON.stringify({ user_id: String(userId) }),
    log,
  );
  if (!row || !Number.isFinite(Number(row.id))) return;
  updateWorldRow(
    playerPositionTable,
    Number(row.id),
    {
      user_id: String(row.user_id || userId),
      world_id: String(row.world_id || "10000"),
      row: Number.isFinite(Number(row.row)) ? Number(row.row) : 1,
      col: Number.isFinite(Number(row.col)) ? Number(row.col) : 1,
      seq: Number.isFinite(Number(row.seq)) ? Number(row.seq) : 0,
      rotation: Number.isFinite(Number(row.rotation)) ? Number(row.rotation) : 0,
      session_id: typeof row.session_id === "string" ? row.session_id : "",
      updated_ts: 0,
    },
    log,
  );
}
