import { getEffectiveMap } from "./world-bootstrap.ts";
import { isWorldTileWalkable } from "./world-domain.ts";
import { loadWorldNPCs } from "./npc-storage.ts";
import { loadWorldPlayers } from "./player-snapshots.ts";
import {
  buildOccupiedNPCMap,
  buildOccupiedPlayerMap,
} from "./npc-tick-helpers.ts";
import { loadPlayerInventory, savePlayerInventory } from "./item-storage.ts";
import { loadWorldItems } from "./item-storage.ts";
import { savePlayerPosition } from "./player-persistence.ts";
import { sendWorldScopedStreamEvent } from "./stream-broadcast.ts";
import { runInWorldTransaction } from "./world-db.ts";

// Shared pursuit movement for "walk toward a target tile, one step per tick".
// tickFollowForWorld (follow-helpers.ts) implements the same greedy stepping
// inline for the follow feature; this module is the reusable form used by the
// walk-then-act approach queue (see resolvePendingActionsForWorld in
// tree-action-helpers.ts). Kept free of any dependency on the action executor
// so the executor can import it without an import cycle.

function directionToRotation(dr: number, dc: number): number {
  if (dr > 0) return 0;
  if (dr < 0) return Math.PI;
  if (dc > 0) return Math.PI / 2;
  if (dc < 0) return -Math.PI / 2;
  return 0;
}

// Resolves the tile an approach action is heading for from its stored body:
// a living target (target_living_id) is tracked at its *current* position, an
// item target (target_item_id) at the tile it currently rests on, and a bare
// tile target from the body's row/col. Returns null when the target can no
// longer be located (living left/despawned, item picked up/destroyed).
export function resolveApproachTargetTile(
  worldId: string,
  body: any,
): { row: number; col: number } | null {
  // Number(null) is 0, so without this an empty body would resolve to tile
  // (0, 0) and send the actor walking into the map's corner.
  if (!body) return null;
  const livingId =
    body && body.target_living_id ? String(body.target_living_id) : "";
  if (livingId) {
    const npcs = loadWorldNPCs(worldId);
    const npc = npcs[livingId];
    if (npc) return { row: npc.row, col: npc.col };
    const players = loadWorldPlayers(worldId);
    const player = players[livingId];
    if (player) return { row: player.row, col: player.col };
    return null;
  }
  const itemId = body && body.target_item_id ? String(body.target_item_id) : "";
  if (itemId) {
    const worldItems = loadWorldItems(worldId);
    const keys = Object.keys(worldItems);
    for (let i = 0; i < keys.length; i++) {
      const tileItems = worldItems[keys[i]];
      if (!Array.isArray(tileItems)) continue;
      if (
        tileItems.some(function (it) {
          return it && String(it.id) === itemId;
        })
      ) {
        const parts = String(keys[i]).split("_");
        return { row: Number(parts[0]), col: Number(parts[1]) };
      }
    }
    return null;
  }
  const row = Number(body && body.row);
  const col = Number(body && body.col);
  if (Number.isFinite(row) && Number.isFinite(col)) {
    return { row: row, col: col };
  }
  return null;
}

// Advances the actor at most one walkable tile toward (targetRow, targetCol),
// persisting the move and broadcasting player_moved exactly like the follow
// tick. Returns the actor's resulting position and whether a step was taken
// (false when already there or every candidate tile is blocked). The target's
// own tile is never treated as blocked, so the actor can step onto it — that
// co-location is how the caller detects arrival.
export function stepActorTowardTile(
  worldId: string,
  actorId: string,
  targetRow: number,
  targetCol: number,
  now: number,
): { row: number; col: number; moved: boolean } {
  const players = loadWorldPlayers(worldId);
  const actor = players[actorId];
  if (!actor) {
    return { row: targetRow, col: targetCol, moved: false };
  }
  const dr = targetRow - actor.row;
  const dc = targetCol - actor.col;
  if (dr === 0 && dc === 0) {
    return { row: actor.row, col: actor.col, moved: false };
  }

  const map = getEffectiveMap(worldId);
  const rows = map.length;
  const cols = map[0] ? map[0].length : 0;
  const occupiedPlayers = buildOccupiedPlayerMap(players);
  const occupiedNPCs = buildOccupiedNPCMap(loadWorldNPCs(worldId));

  // Prefer the axis that closes the most distance, then its cross axis, then
  // the remaining two cardinals as detours around a local obstacle — same
  // ordering as tickFollowForWorld.
  const candidates: Array<{ dr: number; dc: number }> = [];
  if (Math.abs(dr) >= Math.abs(dc)) {
    if (dr !== 0) candidates.push({ dr: dr > 0 ? 1 : -1, dc: 0 });
    if (dc !== 0) candidates.push({ dr: 0, dc: dc > 0 ? 1 : -1 });
  } else {
    if (dc !== 0) candidates.push({ dr: 0, dc: dc > 0 ? 1 : -1 });
    if (dr !== 0) candidates.push({ dr: dr > 0 ? 1 : -1, dc: 0 });
  }
  [
    { dr: 1, dc: 0 },
    { dr: -1, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 0, dc: -1 },
  ].forEach(function (dir) {
    if (
      !candidates.some(function (c) {
        return c.dr === dir.dr && c.dc === dir.dc;
      })
    ) {
      candidates.push(dir);
    }
  });

  const targetKey = targetRow + "_" + targetCol;
  let step: { row: number; col: number; rotation: number } | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const nr = actor.row + candidates[i].dr;
    const nc = actor.col + candidates[i].dc;
    const key = nr + "_" + nc;
    const walkable =
      nr >= 0 &&
      nr < rows &&
      nc >= 0 &&
      nc < cols &&
      isWorldTileWalkable(map[nr][nc]);
    if (!walkable) continue;
    if (key !== targetKey) {
      if (occupiedPlayers[key]) continue;
      if (occupiedNPCs[key]) continue;
    }
    step = {
      row: nr,
      col: nc,
      rotation: directionToRotation(candidates[i].dr, candidates[i].dc),
    };
    break;
  }
  if (!step) {
    return { row: actor.row, col: actor.col, moved: false };
  }
  const resolvedStep = step;

  runInWorldTransaction("approach_step:" + actorId, function () {
    const newSeq = Number(actor.seq || 0) + 1;
    const inv = loadPlayerInventory(actorId);
    inv.values.fatigue = Math.max(0, Number(inv.values.fatigue || 0) + 1);
    savePlayerInventory(actorId, inv);
    savePlayerPosition(actorId, worldId, {
      row: resolvedStep.row,
      col: resolvedStep.col,
      seq: newSeq,
      rotation: resolvedStep.rotation,
      session_id: actor.session_id,
      ts: now,
    });
    sendWorldScopedStreamEvent(String(worldId), "player_moved", {
      player_id: actorId,
      row: resolvedStep.row,
      col: resolvedStep.col,
      seq: newSeq,
      rotation: resolvedStep.rotation,
      path: [
        {
          row: resolvedStep.row,
          col: resolvedStep.col,
          rotation: resolvedStep.rotation,
        },
      ],
      values: inv.values,
    });
  });

  return { row: resolvedStep.row, col: resolvedStep.col, moved: true };
}
