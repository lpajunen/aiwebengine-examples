import {
  deleteFollowState,
  loadActiveFollowsForWorld,
} from "./follow-storage.ts";
import { loadPlayerInventory, savePlayerInventory } from "./item-storage.ts";
import { loadWorldNPCs } from "./npc-storage.ts";
import {
  buildOccupiedNPCMap,
  buildOccupiedPlayerMap,
} from "./npc-tick-helpers.ts";
import { savePlayerPosition } from "./player-persistence.ts";
import { loadWorldPlayers } from "./player-snapshots.ts";
import {
  sendRecipientScopedStreamEvent,
  sendWorldScopedStreamEvent,
} from "./stream-broadcast.ts";
import { runInWorldTransaction } from "./world-db.ts";
import { getEffectiveMap } from "./world-bootstrap.ts";
import { isWorldTileWalkable } from "./world-domain.ts";

function directionToRotation(dr: number, dc: number): number {
  if (dr > 0) return 0;
  if (dr < 0) return Math.PI;
  if (dc > 0) return Math.PI / 2;
  if (dc < 0) return -Math.PI / 2;
  return 0;
}

/**
 * Advances every active follow in worldId by at most one tile each,
 * greedily closing distance to the target. Called from the same
 * lease-guarded, NPC_TICK_MS-cadence hook as resolvePendingActionsForWorld
 * (see npc-orchestration.ts) rather than its own scheduler.
 *
 * Self-healing: a follower or target who is no longer present in this
 * world's player/NPC snapshot (left the world, logged out, despawned) is
 * treated as gone — no explicit cleanup hook is needed elsewhere.
 */
export function tickFollowForWorld(worldId: string, now: number): void {
  const follows = loadActiveFollowsForWorld(worldId);
  if (follows.length === 0) return;

  const players = loadWorldPlayers(worldId);
  const npcs = loadWorldNPCs(worldId);
  const map = getEffectiveMap(worldId);
  const rows = map.length;
  const cols = map[0] ? map[0].length : 0;
  const occupiedPlayers = buildOccupiedPlayerMap(players);
  const occupiedNPCs = buildOccupiedNPCMap(npcs);

  follows.forEach(function (follow) {
    const followerId = follow.follower_id;
    const follower = players[followerId];
    if (!follower) {
      deleteFollowState(followerId);
      return;
    }

    const target =
      follow.target_type === "npc"
        ? npcs[follow.target_id]
        : players[follow.target_id];
    if (!target) {
      deleteFollowState(followerId);
      sendRecipientScopedStreamEvent(followerId, "follow_ended", {
        reason: "target_gone",
      });
      return;
    }

    const dr = target.row - follower.row;
    const dc = target.col - follower.col;
    if (dr === 0 && dc === 0) {
      return;
    }

    // Prefer the axis that closes distance fastest, then its cross axis, so
    // the follower tends toward the target — but a local obstacle (a single
    // tree, a lake edge) must not freeze it entirely, so both remaining
    // cardinal directions are kept as detour fallbacks, same as the NPCs'
    // random walk trying all four directions instead of just two.
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

    const targetKey = target.row + "_" + target.col;
    let step: { row: number; col: number; rotation: number } | null = null;
    for (let i = 0; i < candidates.length; i++) {
      const nr = follower.row + candidates[i].dr;
      const nc = follower.col + candidates[i].dc;
      const key = nr + "_" + nc;
      const walkable =
        nr >= 0 &&
        nr < rows &&
        nc >= 0 &&
        nc < cols &&
        isWorldTileWalkable(map[nr][nc]);
      if (!walkable) continue;
      // The target's own tile is otherwise marked occupied (it's a player
      // or NPC standing there) — that must not block the follower from
      // stepping onto it, since reaching that exact tile is the goal.
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
    if (!step) return;
    const resolvedStep = step;

    runInWorldTransaction("follow_tick:" + followerId, function () {
      const fromKey = follower.row + "_" + follower.col;
      delete occupiedPlayers[fromKey];
      occupiedPlayers[resolvedStep.row + "_" + resolvedStep.col] = true;

      const newSeq = Number(follower.seq || 0) + 1;
      const inv = loadPlayerInventory(followerId);
      inv.values.fatigue = Math.max(0, Number(inv.values.fatigue || 0) + 1);
      savePlayerInventory(followerId, inv);
      savePlayerPosition(followerId, worldId, {
        row: resolvedStep.row,
        col: resolvedStep.col,
        seq: newSeq,
        rotation: resolvedStep.rotation,
        session_id: follower.session_id,
        ts: now,
      });
      sendWorldScopedStreamEvent(String(worldId), "player_moved", {
        player_id: followerId,
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
  });
}
