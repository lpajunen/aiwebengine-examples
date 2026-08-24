import { getEffectiveMap, getWorldDimensions } from "./world-bootstrap.ts";
import { hashString, isWorldTileWalkable } from "./world-domain.ts";
import {
  getReservedTiles,
  getSpawnFallbackTile,
  RESERVATION_SPAWN_AREA,
} from "./world-reservations.ts";
import {
  VWORLD_PLAYER_HEARTBEAT_TABLE,
  VWORLD_PLAYER_POSITION_TABLE,
} from "./runtime-config.ts";
import {
  fromStoredRotation,
  fromStoredWorldTimestamp,
} from "./world-domain.ts";
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
      rotation: fromStoredRotation(row.rotation),
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
  // A world's dimensions can shrink after a position was persisted (e.g. the
  // oak world's village migration to 30x30). Any stored coordinate now off
  // the map is invalid — treat it as absent and fall through to the default
  // spawn, so item drops (which land at the canonical position) never write
  // to an off-map tile that no client would render.
  const dims = getWorldDimensions(worldId);
  const inBounds = function (row: number, col: number): boolean {
    return (
      Number.isFinite(row) &&
      Number.isFinite(col) &&
      row >= 0 &&
      row < dims.rows &&
      col >= 0 &&
      col < dims.cols
    );
  };

  const players = loadWorldPlayers(worldId);
  const cur = players[userId];
  if (cur && inBounds(Number(cur.row), Number(cur.col))) {
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
  if (
    savedPos &&
    savedPos.world_id === String(worldId) &&
    inBounds(Number(savedPos.row), Number(savedPos.col))
  ) {
    return {
      row: savedPos.row,
      col: savedPos.col,
      seq: savedPos.seq,
      rotation: savedPos.rotation,
    };
  }
  return getDefaultSpawnPosition(worldId, userId);
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
  const tiles = getReservedTiles(worldId, RESERVATION_SPAWN_AREA);
  const fallbackAnchor = getSpawnFallbackTile(worldId);
  if (!fallbackAnchor) {
    return { row: 1, col: 1, seq: 0, rotation: 0 };
  }
  if (tiles.length === 0) {
    return {
      row: fallbackAnchor.row,
      col: fallbackAnchor.col,
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
    row: fallbackAnchor.row,
    col: fallbackAnchor.col,
    seq: 0,
    rotation: 0,
  };
}
