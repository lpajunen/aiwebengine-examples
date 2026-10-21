import { VWORLD_PLAYER_CHARACTER_TABLE } from "./runtime-config.ts";
import { querySingleWorldRow, upsertWorldRow } from "./world-db.ts";
import { toStoredWorldTimestamp } from "./world-domain.ts";

// The class a player chose from the elder, kept apart from their living so it
// outlasts death: a dead player is a ghost, and praying returns them to this
// class rather than to a newcomer. A player with no row has not chosen.

export function loadChosenClassId(userId: string): string {
  const row = querySingleWorldRow(
    VWORLD_PLAYER_CHARACTER_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
  return row && row.class_id ? String(row.class_id) : "";
}

export function saveChosenClassId(userId: string, classId: string): void {
  upsertWorldRow(VWORLD_PLAYER_CHARACTER_TABLE, ["user_id"], {
    user_id: String(userId),
    class_id: String(classId),
    chosen_at: toStoredWorldTimestamp(Date.now()),
  });
}
