import { VWORLD_PLAYER_HOME_TABLE } from "./runtime-config.ts";
import { querySingleWorldRow, upsertWorldRow } from "./world-db.ts";
import {
  fromStoredWorldTimestamp,
  toStoredWorldTimestamp,
} from "./world-domain.ts";

// Each player's home island: the world a new player wakes in, learns the game
// on, and rows home to. The island itself is an ordinary world of class
// HOME_ISLAND_CLASS_ID, created in world-bootstrap.ts; this module only records
// whose it is and whether its owner has finished onboarding. Who else may
// enter it is island-invites.ts.
//
// A player with no row predates home islands. They were already playing in the
// shared world, so they count as past onboarding, and their island is created
// the first time they row home.

export interface PlayerHome {
  userId: string;
  homeWorldId: string;
  // Null until the player first rows to the shared world (or skips).
  onboardingDoneAt: number | null;
  createdAt: number;
}

function rowToHome(row: any): PlayerHome | null {
  if (!row || !row.user_id) return null;
  const doneAt = Number(row.onboarding_done_at);
  return {
    userId: String(row.user_id),
    homeWorldId: String(row.home_world_id || ""),
    onboardingDoneAt:
      row.onboarding_done_at === null ||
      row.onboarding_done_at === undefined ||
      !Number.isFinite(doneAt)
        ? null
        : fromStoredWorldTimestamp(doneAt),
    createdAt: fromStoredWorldTimestamp(Number(row.created_at || 0)),
  };
}

export function loadPlayerHome(userId: string): PlayerHome | null {
  return rowToHome(
    querySingleWorldRow(
      VWORLD_PLAYER_HOME_TABLE,
      JSON.stringify({ user_id: String(userId) }),
    ),
  );
}

export function savePlayerHome(home: PlayerHome): void {
  upsertWorldRow(VWORLD_PLAYER_HOME_TABLE, ["user_id"], {
    user_id: String(home.userId),
    home_world_id: String(home.homeWorldId),
    onboarding_done_at:
      home.onboardingDoneAt === null
        ? null
        : toStoredWorldTimestamp(home.onboardingDoneAt),
    created_at: toStoredWorldTimestamp(home.createdAt || Date.now()),
  });
}

/** Whose home island a world is, or "" when it is nobody's. */
export function getHomeIslandOwner(worldId: string): string {
  const id = String(worldId || "");
  if (!id) return "";
  const row = querySingleWorldRow(
    VWORLD_PLAYER_HOME_TABLE,
    JSON.stringify({ home_world_id: id }),
  );
  return row && row.user_id ? String(row.user_id) : "";
}

export function isOnboardingDone(userId: string): boolean {
  const home = loadPlayerHome(userId);
  return !home || home.onboardingDoneAt !== null;
}

/**
 * Records that the player has left their island for the shared world. Returns
 * true only the first time, so the caller can announce an arrival once.
 */
export function markOnboardingDone(userId: string): boolean {
  const home = loadPlayerHome(userId);
  if (!home || home.onboardingDoneAt !== null) return false;
  home.onboardingDoneAt = Date.now();
  savePlayerHome(home);
  return true;
}
