import { vwLog } from "./diagnostics.ts";
import { loadPlayerInventory, savePlayerInventory } from "./item-storage.ts";
import { markNPCWorldActive } from "./npc-storage.ts";
import {
  getPlayerWorld,
  loadPlayerMoveLease,
  loadPlayerPosition,
  savePlayerMoveLease,
  savePlayerPosition,
} from "./player-persistence.ts";
import {
  getDefaultSpawnPosition,
  loadWorldPlayers,
} from "./player-snapshots.ts";
import { LEASE_TTL_MS } from "./runtime-config.ts";
import { sendWorldScopedStreamEvent } from "./stream-broadcast.ts";
import { getEffectiveMap } from "./world-bootstrap.ts";
import { isWorldTileWalkable } from "./world-domain.ts";

// Hard bound on steps accepted in one batched move request. The client's
// pending queue is capped at 40; anything larger is a malformed or abusive
// payload rather than a legitimate batch.
const MAX_MOVE_BATCH_STEPS = 60;

type MoveStep = { row: number; col: number; rotation: number };

/**
 * Normalize the request body into an ordered list of steps. Batched bodies
 * carry `steps: [{row, col, rotation?}, ...]`; legacy bodies carry a single
 * `toRow`/`toCol` (or `row`/`col`) pair. Returns null when the payload is
 * invalid.
 */
function normalizeMoveSteps(body: any): MoveStep[] | null {
  if (Array.isArray(body && body.steps)) {
    if (body.steps.length === 0 || body.steps.length > MAX_MOVE_BATCH_STEPS) {
      return null;
    }
    const steps: MoveStep[] = [];
    for (let i = 0; i < body.steps.length; i++) {
      const raw = body.steps[i];
      const row = Number(raw && raw.row);
      const col = Number(raw && raw.col);
      if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
      steps.push({
        row: row,
        col: col,
        rotation: Number(raw && raw.rotation),
      });
    }
    return steps;
  }
  const toRow =
    body && body.toRow !== undefined
      ? Number(body.toRow)
      : Number(body && body.row);
  const toCol =
    body && body.toCol !== undefined
      ? Number(body.toCol)
      : Number(body && body.col);
  if (!Number.isFinite(toRow) || !Number.isFinite(toCol)) return null;
  return [{ row: toRow, col: toCol, rotation: Number(body && body.rotation) }];
}

export function movePlayerForUser(
  userId: string,
  body: any,
): { status: number; payload: any } {
  const steps = normalizeMoveSteps(body);
  const sessionId =
    body && body.session_id ? String(body.session_id) : "legacy";

  if (!steps) {
    return {
      status: 400,
      payload: { ok: false, error: "error.invalid_move_payload" },
    };
  }

  const worldId = getPlayerWorld(userId);
  if (!worldId) {
    return { status: 200, payload: { ok: false, row: 1, col: 1 } };
  }
  markNPCWorldActive(worldId);

  const lease = loadPlayerMoveLease(userId);
  const now = Date.now();
  const leaseSessionId =
    lease && typeof lease.session_id === "string" ? lease.session_id : "";
  const leaseValid = !!lease && Number(lease.expires_at || 0) > now;
  if (leaseValid && leaseSessionId !== sessionId) {
    vwLog("move taking over lease", {
      user_id: userId,
      world_id: worldId,
      previous_session: leaseSessionId,
      session_id: sessionId,
    });
  }
  savePlayerMoveLease(userId, sessionId, now + LEASE_TTL_MS);

  const players = loadWorldPlayers(worldId);
  let cur = players[userId];
  if (!cur) {
    const savedPos = loadPlayerPosition(userId);
    const defaultSpawn = getDefaultSpawnPosition(worldId, userId);
    cur = {
      row: savedPos ? savedPos.row : defaultSpawn.row,
      col: savedPos ? savedPos.col : defaultSpawn.col,
      seq: savedPos ? savedPos.seq : defaultSpawn.seq,
      rotation: savedPos
        ? Number(savedPos.rotation)
        : Number(defaultSpawn.rotation),
      session_id: savedPos ? savedPos.session_id : "",
      ts: savedPos ? savedPos.ts : Date.now(),
    };
  }
  const fallbackRotation = Number.isFinite(Number(cur && cur.rotation))
    ? Number(cur.rotation)
    : 0;

  const expectedSeq = cur.seq + 1;
  const clientSeq =
    body && body.seq !== undefined ? Number(body.seq) : expectedSeq;
  if (clientSeq !== expectedSeq) {
    vwLog("move rejected: stale seq", {
      user_id: userId,
      world_id: worldId,
      session_id: sessionId,
      expected_seq: expectedSeq,
      client_seq: clientSeq,
      cur_row: cur.row,
      cur_col: cur.col,
      req_row: steps[0].row,
      req_col: steps[0].col,
      requested_steps: steps.length,
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

  // Validate the longest applicable prefix of the batch as a unit. Each step
  // must be a single walkable in-bounds step from the previous position; the
  // effective map is built once per request instead of once per step.
  const map = getEffectiveMap(worldId);
  const mapRows = map.length;
  const mapCols = map[0] ? map[0].length : 0;
  const applied: MoveStep[] = [];
  let posRow = cur.row;
  let posCol = cur.col;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const withinBounds =
      step.row >= 0 &&
      step.row < mapRows &&
      step.col >= 0 &&
      step.col < mapCols;
    const singleStep =
      Math.abs(step.row - posRow) + Math.abs(step.col - posCol) === 1;
    if (
      !withinBounds ||
      !singleStep ||
      !isWorldTileWalkable(map[step.row][step.col])
    ) {
      break;
    }
    applied.push(step);
    posRow = step.row;
    posCol = step.col;
  }

  if (applied.length === 0) {
    vwLog("move rejected: invalid step", {
      user_id: userId,
      world_id: worldId,
      session_id: sessionId,
      from_row: cur.row,
      from_col: cur.col,
      to_row: steps[0].row,
      to_col: steps[0].col,
      requested_steps: steps.length,
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

  const lastStep = applied[applied.length - 1];
  const rotation = Number.isFinite(lastStep.rotation)
    ? lastStep.rotation
    : fallbackRotation;
  // Each applied step consumes one seq so per-step client assignment and
  // snapshot comparisons keep working unchanged.
  const newSeq = cur.seq + applied.length;

  // Only this player's row is written; rewriting the whole player map here
  // (the old behavior) could clobber other players' concurrent moves with
  // the stale positions read above.
  savePlayerPosition(userId, worldId, {
    row: posRow,
    col: posCol,
    seq: newSeq,
    rotation: rotation,
    session_id: sessionId,
    ts: Date.now(),
  });
  const inv = loadPlayerInventory(userId);
  inv.values.fatigue = Math.max(
    0,
    Number(inv.values.fatigue || 0) + applied.length,
  );
  savePlayerInventory(userId, inv);
  sendWorldScopedStreamEvent(String(worldId), "player_moved", {
    player_id: userId,
    row: posRow,
    col: posCol,
    seq: newSeq,
    rotation: rotation,
    path: applied.map(function (step) {
      return {
        row: step.row,
        col: step.col,
        rotation: Number.isFinite(step.rotation) ? step.rotation : rotation,
      };
    }),
    values: inv.values,
  });
  vwLog("move accepted", {
    user_id: userId,
    world_id: worldId,
    session_id: sessionId,
    row: posRow,
    col: posCol,
    seq: newSeq,
    applied_steps: applied.length,
    requested_steps: steps.length,
  });
  return {
    status: 200,
    payload: {
      ok: true,
      row: posRow,
      col: posCol,
      seq: newSeq,
      rotation: rotation,
      applied_count: applied.length,
      requested_count: steps.length,
      inventory: inv,
      world_id: String(worldId),
    },
  };
}
