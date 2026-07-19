import { getEffectiveMap } from "./world-bootstrap.ts";
import {
  getOakClearingTiles,
  hashString,
  isOakWorld,
  isWorldTileWalkable,
  OAK_CENTER_COL,
  OAK_CENTER_ROW,
} from "./world-domain.ts";
import {
  VWORLD_PLAYER_HEARTBEAT_TABLE,
  VWORLD_PLAYER_POSITION_TABLE,
} from "./runtime-config.ts";
import { fromStoredWorldTimestamp } from "./world-domain.ts";
import {
  loadPlayerHeartbeatMap,
  loadPlayerPosition,
  savePlayerPosition,
} from "./player-persistence.ts";
import { queryWorldRows } from "./world-db.ts";

type SpawnPosition = {
  row: number;
  col: number;
  seq: number;
  rotation: number;
};

type SnapshotPlayer = {
  row: number;
  col: number;
  seq: number;
  rotation: number;
  session_id: string;
  ts: number;
};

export function loadWorldPlayers(
  worldId: string,
): Record<string, SnapshotPlayer> {
  const rows = queryWorldRows(
    VWORLD_PLAYER_POSITION_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    1000,
    "id",
    "desc",
  );
  const players: Record<string, SnapshotPlayer> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.user_id) continue;
    const playerUserId = String(row.user_id);
    if (players[playerUserId]) continue;
    players[playerUserId] = {
      row: Number.isFinite(Number(row.row)) ? Number(row.row) : 1,
      col: Number.isFinite(Number(row.col)) ? Number(row.col) : 1,
      seq: Number.isFinite(Number(row.seq)) ? Number(row.seq) : 0,
      rotation: Number.isFinite(Number(row.rotation))
        ? Number(row.rotation)
        : 0,
      session_id: typeof row.session_id === "string" ? row.session_id : "",
      ts: fromStoredWorldTimestamp(row.updated_ts),
    };
  }
  return players;
}

export function saveWorldPlayers(
  worldId: string,
  players: Record<string, any>,
): void {
  const nextPlayers = players && typeof players === "object" ? players : {};
  Object.keys(nextPlayers).forEach(function (userId) {
    const player = nextPlayers[userId] || {};
    savePlayerPosition(userId, worldId, {
      row: Number.isFinite(Number(player.row)) ? Number(player.row) : 1,
      col: Number.isFinite(Number(player.col)) ? Number(player.col) : 1,
      seq: Number.isFinite(Number(player.seq)) ? Number(player.seq) : 0,
      rotation: Number.isFinite(Number(player.rotation))
        ? Number(player.rotation)
        : 0,
      session_id:
        typeof player.session_id === "string" ? player.session_id : "",
      ts: Number.isFinite(Number(player.ts)) ? Number(player.ts) : Date.now(),
    });
  });
}

export function getCanonicalPlayerState(
  worldId: string,
  userId: string,
): SpawnPosition {
  const players = loadWorldPlayers(worldId);
  const cur = players[userId];
  if (
    cur &&
    Number.isFinite(Number(cur.row)) &&
    Number.isFinite(Number(cur.col))
  ) {
    return {
      row: Number(cur.row),
      col: Number(cur.col),
      seq: Number(cur.seq || 0),
      rotation: Number.isFinite(Number(cur.rotation))
        ? Number(cur.rotation)
        : 0,
    };
  }
  const savedPos = loadPlayerPosition(userId);
  if (!savedPos || savedPos.world_id !== String(worldId)) {
    return getDefaultSpawnPosition(worldId, userId);
  }
  return {
    row: savedPos.row,
    col: savedPos.col,
    seq: savedPos.seq,
    rotation: savedPos.rotation,
  };
}

export function buildActiveWorldPlayers(
  worldId: string,
  activeWindowMs: number = 90000,
): Array<{
  player_id: string;
  row: number;
  col: number;
  seq: number;
  rotation: number;
  session_id: string;
  last_active: number;
}> {
  if (!worldId) return [];
  const players = loadWorldPlayers(worldId);
  if (!players || typeof players !== "object") return [];
  const now = Date.now();
  const heartbeatByUserId = loadPlayerHeartbeatMap();
  return Object.keys(players)
    .filter(function (pid) {
      if (!players[pid] || typeof players[pid] !== "object") {
        return false;
      }
      const hbTs = Number(heartbeatByUserId[pid] || 0);
      return (
        now - Math.max(Number(players[pid].ts || 0), hbTs) < activeWindowMs
      );
    })
    .map(function (pid) {
      const hbTs = Number(heartbeatByUserId[pid] || 0);
      return {
        player_id: pid,
        row: players[pid].row,
        col: players[pid].col,
        seq: players[pid].seq || 0,
        rotation: Number.isFinite(Number(players[pid].rotation))
          ? Number(players[pid].rotation)
          : 0,
        session_id:
          typeof players[pid].session_id === "string"
            ? players[pid].session_id
            : "",
        last_active: Math.max(Number(players[pid].ts || 0), hbTs),
      };
    });
}

export function getDefaultSpawnPosition(
  worldId: string | number,
  userId: string,
): { row: number; col: number; seq: number; rotation: number } {
  if (!isOakWorld(worldId)) {
    return { row: 1, col: 1, seq: 0, rotation: 0 };
  }

  const tiles = getOakClearingTiles(worldId);
  if (tiles.length === 0) {
    return {
      row: OAK_CENTER_ROW + 1,
      col: OAK_CENTER_COL,
      seq: 0,
      rotation: 0,
    };
  }

  const map = getEffectiveMap(String(worldId));
  const players = loadWorldPlayers(String(worldId));
  const occupied: Record<string, boolean> = {};
  for (const playerId in players) {
    const player = players[playerId];
    if (!player) continue;
    occupied[Number(player.row) + "_" + Number(player.col)] = true;
  }

  const startIndex = userId ? hashString(userId) % tiles.length : 0;
  let fallbackTile: { row: number; col: number } | null = null;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[(startIndex + i) % tiles.length];
    if (
      !tile ||
      !map[tile.row] ||
      !isWorldTileWalkable(map[tile.row][tile.col])
    ) {
      continue;
    }
    if (!fallbackTile) fallbackTile = tile;
    if (!occupied[tile.row + "_" + tile.col]) {
      return { row: tile.row, col: tile.col, seq: 0, rotation: 0 };
    }
  }

  if (fallbackTile) {
    return {
      row: fallbackTile.row,
      col: fallbackTile.col,
      seq: 0,
      rotation: 0,
    };
  }

  return {
    row: OAK_CENTER_ROW + 1,
    col: OAK_CENTER_COL,
    seq: 0,
    rotation: 0,
  };
}
