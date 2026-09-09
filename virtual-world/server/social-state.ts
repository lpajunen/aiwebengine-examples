import { sendVirtualWorldStreamEvent } from "./stream-broadcast.ts";
import {
  VWORLD_ONLINE_PRESENCE_TABLE,
  VWORLD_PLAYER_HEARTBEAT_TABLE,
  VWORLD_PLAYER_NICK_TABLE,
  VWORLD_PLAYER_POSITION_TABLE,
  VWORLD_PLAYER_WORLD_TABLE,
} from "./runtime-config.ts";
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

export function loadPlayerNick(userId: string): string {
  const row = querySingleWorldRow(
    VWORLD_PLAYER_NICK_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
  if (!row || typeof row.nick !== "string") return "";
  return row.nick;
}

export function savePlayerNick(userId: string, nick: string): void {
  upsertWorldRow(VWORLD_PLAYER_NICK_TABLE, ["user_id"], {
    user_id: String(userId),
    nick: String(nick || ""),
    updated_ts: toStoredWorldTimestamp(Date.now()),
  });
}

export function getEffectiveNick(userId: string): string {
  const nick = loadPlayerNick(userId);
  return nick || String(userId).slice(0, 16);
}

export function sendGlobalPresenceEvent(
  action: string,
  userId: string,
  worldId: string,
  nick: string,
  loginAt?: number,
  lastActive?: number,
  extra?: Record<string, unknown>,
): void {
  const payload: Record<string, unknown> = {
    action: String(action || "upsert"),
    player_id: String(userId || ""),
    nick: String(nick || getEffectiveNick(userId)),
    world_id: String(worldId || ""),
    login_at: Number(loginAt || Date.now()),
    last_active: Number(lastActive || Date.now()),
  };
  if (extra && typeof extra === "object") {
    Object.assign(payload, extra);
  }
  sendVirtualWorldStreamEvent("presence_update", payload, {});
}

export function updateOnlinePresence(
  userId: string,
  worldId: string,
  sessionId: string,
): {
  player_id: string;
  nick: string;
  world_id: string;
  login_at: number;
  last_active: number;
  changed: boolean;
} {
  const now = Date.now();
  const existing = querySingleWorldRow(
    VWORLD_ONLINE_PRESENCE_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
  const nick = getEffectiveNick(userId);
  const loginAt =
    existing && existing.session_id === sessionId && existing.login_at
      ? fromStoredWorldTimestamp(existing.login_at)
      : now;
  const changed =
    !existing ||
    String(existing.world_id || "") !== String(worldId) ||
    String(existing.nick || "") !== nick;
  upsertWorldRow(VWORLD_ONLINE_PRESENCE_TABLE, ["user_id"], {
    user_id: String(userId),
    world_id: String(worldId),
    nick: nick,
    login_at: toStoredWorldTimestamp(loginAt),
    last_active_ts: toStoredWorldTimestamp(now),
    session_id: String(sessionId || ""),
  });
  if (changed) {
    sendGlobalPresenceEvent(
      "upsert",
      String(userId),
      String(worldId),
      nick,
      loginAt,
      now,
    );
  }
  return {
    player_id: String(userId),
    nick: nick,
    world_id: String(worldId),
    login_at: loginAt,
    last_active: now,
    changed: changed,
  };
}

export function deleteOnlinePresence(userId: string): void {
  deleteWorldRowsWhere(
    VWORLD_ONLINE_PRESENCE_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
}

export function buildOnlinePlayersSnapshot(ttlMs: number = 90000): Array<{
  player_id: string;
  nick: string;
  world_id: string;
  login_at: number;
  last_active: number;
}> {
  const rows = queryWorldRows(
    VWORLD_ONLINE_PRESENCE_TABLE,
    "",
    1000,
    "last_active_ts",
    "desc",
  );
  const now = Date.now();
  const heartbeatByUserId = loadPlayerHeartbeatMap();
  const positionsByUserId = loadAllPlayerPositions();
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
      nick: row.nick || getEffectiveNick(userId),
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
        nick: getEffectiveNick(userId),
        world_id: String(pos.world_id || getPlayerWorld(userId) || ""),
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
