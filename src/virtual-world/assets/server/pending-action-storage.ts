import { VWORLD_PENDING_ACTION_TABLE } from "./runtime-config.ts";
import { deleteWorldRow, insertWorldRow, queryWorldRows } from "./world-db.ts";

// Integer columns here are seconds, not ms — matches the created_at/updated_at
// convention in action-class-storage.ts/item-registry.ts, needed because
// raw ms epoch values (~1.7e12) overflow the DB's integer column range.
export function addPendingAction(
  worldId: string,
  userId: string,
  action: string,
  body: unknown,
  readyAt: number,
): void {
  insertWorldRow(VWORLD_PENDING_ACTION_TABLE, {
    world_id: String(worldId),
    user_id: String(userId),
    action: String(action),
    body_json: JSON.stringify(body || {}),
    ready_at: Math.floor(readyAt / 1000),
    created_at: Math.floor(Date.now() / 1000),
  });
}

export function loadDuePendingActions(
  worldId: string,
  now: number,
): Array<{
  id: number;
  world_id: string;
  user_id: string;
  action: string;
  body_json: string;
  ready_at: number;
}> {
  const rows = queryWorldRows(
    VWORLD_PENDING_ACTION_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    1000,
    "ready_at",
    "asc",
  );
  const nowSeconds = Math.floor(now / 1000);
  return rows.filter(function (row) {
    return Number(row.ready_at || 0) <= nowSeconds;
  });
}

export function deletePendingAction(id: number): void {
  deleteWorldRow(VWORLD_PENDING_ACTION_TABLE, id);
}

// A user's in-flight walk-then-act approaches in a world (body.__approach set)
// — used to surface them in the active-actions panel and to cancel them (see
// getActiveActionsForUser and the cancel_approach handler). Unlike
// loadDuePendingActions this ignores ready_at (approaches are always "due").
export function loadUserApproachActions(
  worldId: string,
  userId: string,
): Array<{
  id: number;
  user_id: string;
  action: string;
  body_json: string;
  created_at: number;
}> {
  const rows = queryWorldRows(
    VWORLD_PENDING_ACTION_TABLE,
    JSON.stringify({ world_id: String(worldId), user_id: String(userId) }),
    1000,
    "created_at",
    "asc",
  );
  return rows.filter(function (row) {
    try {
      return !!JSON.parse(row.body_json || "{}").__approach;
    } catch (e) {
      return false;
    }
  });
}
