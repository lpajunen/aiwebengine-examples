import { loadFightState } from "./fight-storage.ts";
import { loadFollowState } from "./follow-storage.ts";
import { getPlayerWorld } from "./player-persistence.ts";
import { loadUserApproachActions } from "./pending-action-storage.ts";
import { getEffectiveNick } from "./social-state.ts";
import { fromStoredWorldTimestamp, getNPCDisplayName } from "./world-domain.ts";

export interface ActiveActionEntry {
  // "follow"/"fight", or a walk-then-act approach's action id (e.g. "poke").
  action_id: string;
  target_id: string;
  target_label: string;
  started_ts: number;
  // The tree-action to post to stop this entry: "stop_follow"/"stop_fight" for
  // those, "cancel_approach" for an in-flight approach.
  stop_action_id: string;
}

function resolveLivingLabel(
  worldId: string,
  targetType: "player" | "npc",
  targetId: string,
): string {
  return targetType === "npc"
    ? getNPCDisplayName(worldId, targetId)
    : getEffectiveNick(targetId);
}

/**
 * A fight always carries a matching follow row to the same target (see
 * tree-action-helpers.ts), so when both exist only the fight is reported —
 * showing a redundant "following" entry underneath it would be confusing
 * and stopping it separately would silently break the fight's pursuit.
 */
export function getActiveActionsForUser(userId: string): ActiveActionEntry[] {
  const entries: ActiveActionEntry[] = [];

  const fight = loadFightState(userId);
  if (fight) {
    entries.push({
      action_id: "fight",
      target_id: fight.target_id,
      target_label: resolveLivingLabel(
        fight.world_id,
        fight.target_type,
        fight.target_id,
      ),
      started_ts: fight.created_ts,
      stop_action_id: "stop_fight",
    });
  } else {
    const follow = loadFollowState(userId);
    if (follow) {
      entries.push({
        action_id: "follow",
        target_id: follow.target_id,
        target_label: resolveLivingLabel(
          follow.world_id,
          follow.target_type,
          follow.target_id,
        ),
        started_ts: follow.created_ts,
        stop_action_id: "stop_follow",
      });
    }
  }

  // In-flight walk-then-act approaches (poke/fix/pick_item/…) so they too get a
  // Stop button while the actor is still walking to the target.
  const worldId = getPlayerWorld(userId);
  if (worldId) {
    const approaches = loadUserApproachActions(worldId, userId);
    for (let i = 0; i < approaches.length; i++) {
      const row = approaches[i];
      let body: any = {};
      try {
        body = JSON.parse(row.body_json || "{}");
      } catch (e) {
        body = {};
      }
      entries.push({
        action_id: String(row.action || ""),
        target_id: String(body.target_living_id || body.target_item_id || ""),
        target_label: String(body.__approach_label || ""),
        started_ts: fromStoredWorldTimestamp(row.created_at),
        stop_action_id: "cancel_approach",
      });
    }
  }

  return entries;
}
