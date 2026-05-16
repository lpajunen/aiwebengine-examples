import {
  fromStoredWorldTimestamp,
  toStoredWorldTimestamp,
} from "./world-domain.ts";
import {
  getPlayerWorld,
  loadAllPlayerPositions,
  loadPlayerHeartbeatMap,
} from "./player-persistence.ts";
import {
  deleteWorldRowsWhere,
  querySingleWorldRow,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

type WorldDbLogFn = (msg: string, obj?: unknown) => void;

export function loadPlayerNick(
  userId: string,
  playerNickTable: string,
  log: WorldDbLogFn,
): string {
  const row = querySingleWorldRow(
    playerNickTable,
    JSON.stringify({ user_id: String(userId) }),
    log,
  );
  if (!row || typeof row.nick !== "string") return "";
  return row.nick;
}

export function savePlayerNick(
  userId: string,
  nick: string,
  playerNickTable: string,
  log: WorldDbLogFn,
): void {
  upsertWorldRow(
    playerNickTable,
    ["user_id"],
    {
      user_id: String(userId),
      nick: String(nick || ""),
      updated_ts: toStoredWorldTimestamp(Date.now()),
    },
    log,
  );
}

export function getEffectiveNick(
  userId: string,
  playerNickTable: string,
  log: WorldDbLogFn,
): string {
  const nick = loadPlayerNick(userId, playerNickTable, log);
  return nick || String(userId).slice(0, 16);
}

export function updateOnlinePresence(
  userId: string,
  worldId: string,
  sessionId: string,
  onlinePresenceTable: string,
  playerNickTable: string,
  log: WorldDbLogFn,
): void {
  const now = Date.now();
  const existing = querySingleWorldRow(
    onlinePresenceTable,
    JSON.stringify({ user_id: String(userId) }),
    log,
  );
  const loginAt =
    existing && existing.session_id === sessionId && existing.login_at
      ? fromStoredWorldTimestamp(existing.login_at)
      : now;
  upsertWorldRow(
    onlinePresenceTable,
    ["user_id"],
    {
      user_id: String(userId),
      world_id: String(worldId),
      nick: getEffectiveNick(userId, playerNickTable, log),
      login_at: toStoredWorldTimestamp(loginAt),
      last_active_ts: toStoredWorldTimestamp(now),
      session_id: String(sessionId || ""),
    },
    log,
  );
}

export function deleteOnlinePresence(
  userId: string,
  onlinePresenceTable: string,
  log: WorldDbLogFn,
): void {
  deleteWorldRowsWhere(
    onlinePresenceTable,
    JSON.stringify({ user_id: String(userId) }),
    log,
  );
}

export function buildOnlinePlayersSnapshot(
  onlinePresenceTable: string,
  playerHeartbeatTable: string,
  playerPositionTable: string,
  playerWorldTable: string,
  playerNickTable: string,
  log: WorldDbLogFn,
  ttlMs: number,
): Array<{
  player_id: string;
  nick: string;
  world_id: string;
  login_at: number;
  last_active: number;
}> {
  const rows = queryWorldRows(
    onlinePresenceTable,
    "",
    1000,
    "last_active_ts",
    "desc",
    log,
  );
  const now = Date.now();
  const heartbeatByUserId = loadPlayerHeartbeatMap(playerHeartbeatTable, log);
  const positionsByUserId = loadAllPlayerPositions(playerPositionTable, log);
  const byUserId: Record<
    string,
    {
      player_id: string;
      nick: string;
      world_id: string;
      login_at: number;
      last_active: number;
    }
  > = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.user_id) continue;
    const userId = String(row.user_id);
    if (byUserId[userId]) continue;
    const pos = positionsByUserId[userId] || null;
    const presenceLastActive = fromStoredWorldTimestamp(row.last_active_ts);
    const canonicalLastActive = Math.max(
      presenceLastActive,
      Number(heartbeatByUserId[userId] || 0),
      pos ? Number(pos.ts || 0) : 0,
    );
    if (now - canonicalLastActive > ttlMs) continue;
    byUserId[userId] = {
      player_id: userId,
      nick: row.nick || getEffectiveNick(userId, playerNickTable, log),
      world_id: String(row.world_id || (pos ? pos.world_id : "") || ""),
      login_at: fromStoredWorldTimestamp(row.login_at) || canonicalLastActive,
      last_active: canonicalLastActive,
    };
  }

  Object.keys(positionsByUserId).forEach(function (userId) {
    const pos = positionsByUserId[userId];
    if (!pos) return;
    const canonicalLastActive = Math.max(
      Number(pos.ts || 0),
      Number(heartbeatByUserId[userId] || 0),
    );
    if (now - canonicalLastActive > ttlMs) return;
    if (!byUserId[userId]) {
      byUserId[userId] = {
        player_id: userId,
        nick: getEffectiveNick(userId, playerNickTable, log),
        world_id: String(
          pos.world_id || getPlayerWorld(userId, playerWorldTable, log) || "",
        ),
        login_at: canonicalLastActive,
        last_active: canonicalLastActive,
      };
      return;
    }
    if (!byUserId[userId].world_id && pos.world_id) {
      byUserId[userId].world_id = String(pos.world_id);
    }
    if (canonicalLastActive > byUserId[userId].last_active) {
      byUserId[userId].last_active = canonicalLastActive;
    }
  });

  return Object.keys(byUserId)
    .map(function (userId) {
      return byUserId[userId];
    })
    .sort(function (a, b) {
      return b.last_active - a.last_active;
    });
}
