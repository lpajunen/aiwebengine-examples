import { loadFightState } from "./fight-storage.ts";
import { loadFollowState } from "./follow-storage.ts";
import { getEffectiveNick } from "./social-state.ts";
import { getNPCDisplayName } from "./world-domain.ts";

export interface ActiveActionEntry {
  action_id: "follow" | "fight";
  target_id: string;
  target_label: string;
  started_ts: number;
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
  const fight = loadFightState(userId);
  if (fight) {
    return [
      {
        action_id: "fight",
        target_id: fight.target_id,
        target_label: resolveLivingLabel(
          fight.world_id,
          fight.target_type,
          fight.target_id,
        ),
        started_ts: fight.created_ts,
      },
    ];
  }

  const follow = loadFollowState(userId);
  if (follow) {
    return [
      {
        action_id: "follow",
        target_id: follow.target_id,
        target_label: resolveLivingLabel(
          follow.world_id,
          follow.target_type,
          follow.target_id,
        ),
        started_ts: follow.created_ts,
      },
    ];
  }

  return [];
}
