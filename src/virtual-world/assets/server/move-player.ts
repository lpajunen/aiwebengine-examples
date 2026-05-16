type MoveDeps = {
  getPlayerWorld: (userId: string) => string;
  markNPCWorldActive: (worldId: string) => void;
  loadPlayerMoveLease: (userId: string) => any;
  savePlayerMoveLease: (
    userId: string,
    sessionId: string,
    expiresAt: number,
  ) => void;
  loadWorldPlayers: (worldId: string) => Record<string, any>;
  loadPlayerPosition: (userId: string) => any;
  getDefaultSpawnPosition: (
    worldId: string,
    userId: string,
  ) => { row: number; col: number; seq: number; rotation: number };
  getEffectiveMap: (worldId: string) => number[][];
  isWorldTileWalkable: (tileValue: any) => boolean;
  saveWorldPlayers: (worldId: string, players: Record<string, any>) => void;
  savePlayerPosition: (userId: string, worldId: string, position: any) => void;
  sendWorldScopedStreamEvent: (
    worldId: string,
    type: string,
    payload: any,
  ) => void;
  vwLog: (msg: string, obj?: unknown) => void;
  LEASE_TTL_MS: number;
  ROWS: number;
  COLS: number;
};

export function movePlayerForUser(
  userId: string,
  body: any,
  deps: MoveDeps,
): { status: number; payload: any } {
  const toRow =
    body && body.toRow !== undefined
      ? Number(body.toRow)
      : Number(body && body.row);
  const toCol =
    body && body.toCol !== undefined
      ? Number(body.toCol)
      : Number(body && body.col);
  let rotation = Number(body && body.rotation);
  const sessionId =
    body && body.session_id ? String(body.session_id) : "legacy";

  if (!Number.isFinite(toRow) || !Number.isFinite(toCol)) {
    return {
      status: 400,
      payload: { ok: false, error: "Invalid move payload" },
    };
  }

  const worldId = deps.getPlayerWorld(userId);
  if (!worldId) {
    return { status: 200, payload: { ok: false, row: 1, col: 1 } };
  }
  deps.markNPCWorldActive(worldId);

  const lease = deps.loadPlayerMoveLease(userId);
  const now = Date.now();
  const leaseSessionId =
    lease && typeof lease.session_id === "string" ? lease.session_id : "";
  const leaseValid = !!lease && Number(lease.expires_at || 0) > now;
  if (leaseValid && leaseSessionId !== sessionId) {
    deps.vwLog("move taking over lease", {
      user_id: userId,
      world_id: worldId,
      previous_session: leaseSessionId,
      session_id: sessionId,
    });
  }
  deps.savePlayerMoveLease(userId, sessionId, now + deps.LEASE_TTL_MS);

  const players = deps.loadWorldPlayers(worldId);
  let cur = players[userId];
  if (!cur) {
    const savedPos = deps.loadPlayerPosition(userId);
    const defaultSpawn = deps.getDefaultSpawnPosition(worldId, userId);
    cur = {
      row: savedPos ? savedPos.row : defaultSpawn.row,
      col: savedPos ? savedPos.col : defaultSpawn.col,
      seq: savedPos ? savedPos.seq : defaultSpawn.seq,
      rotation: savedPos
        ? Number(savedPos.rotation)
        : Number(defaultSpawn.rotation),
      session_id: savedPos ? savedPos.session_id : "",
    };
  }
  if (!Number.isFinite(rotation)) rotation = Number(cur && cur.rotation);
  if (!Number.isFinite(rotation)) rotation = 0;

  const expectedSeq = cur.seq + 1;
  const clientSeq =
    body && body.seq !== undefined ? Number(body.seq) : expectedSeq;
  if (clientSeq !== expectedSeq) {
    deps.vwLog("move rejected: stale seq", {
      user_id: userId,
      world_id: worldId,
      session_id: sessionId,
      expected_seq: expectedSeq,
      client_seq: clientSeq,
      cur_row: cur.row,
      cur_col: cur.col,
      req_row: toRow,
      req_col: toCol,
    });
    return {
      status: 200,
      payload: {
        ok: false,
        stale: true,
        row: cur.row,
        col: cur.col,
        seq: cur.seq,
      },
    };
  }

  const dr = Math.abs(toRow - cur.row);
  const dc = Math.abs(toCol - cur.col);
  const map = deps.getEffectiveMap(worldId);
  const withinBounds =
    toRow >= 0 && toRow < deps.ROWS && toCol >= 0 && toCol < deps.COLS;
  const singleStep = dr + dc === 1;
  const walkable = withinBounds && deps.isWorldTileWalkable(map[toRow][toCol]);

  if (!singleStep || !walkable) {
    deps.vwLog("move rejected: invalid step", {
      user_id: userId,
      world_id: worldId,
      session_id: sessionId,
      from_row: cur.row,
      from_col: cur.col,
      to_row: toRow,
      to_col: toCol,
      single_step: singleStep,
      walkable: walkable,
    });
    return {
      status: 200,
      payload: {
        ok: false,
        stale: false,
        row: cur.row,
        col: cur.col,
        seq: cur.seq,
      },
    };
  }

  players[userId] = {
    row: toRow,
    col: toCol,
    seq: cur.seq + 1,
    rotation: rotation,
    session_id: sessionId,
    ts: Date.now(),
  };
  deps.saveWorldPlayers(worldId, players);
  deps.savePlayerPosition(userId, worldId, {
    row: toRow,
    col: toCol,
    seq: cur.seq + 1,
    rotation: rotation,
    session_id: sessionId,
    ts: Date.now(),
  });
  deps.sendWorldScopedStreamEvent(String(worldId), "player_moved", {
    player_id: userId,
    row: toRow,
    col: toCol,
    seq: cur.seq + 1,
    rotation: rotation,
  });
  deps.vwLog("move accepted", {
    user_id: userId,
    world_id: worldId,
    session_id: sessionId,
    row: toRow,
    col: toCol,
    seq: cur.seq + 1,
  });
  return {
    status: 200,
    payload: {
      ok: true,
      row: toRow,
      col: toCol,
      seq: cur.seq + 1,
      rotation: rotation,
      world_id: String(worldId),
    },
  };
}
