import { VWORLD_SPAWN_TIMER_TABLE } from "./runtime-config.ts";
import { deleteWorldRow, queryWorldRows, insertWorldRow } from "./world-db.ts";
import {
  toStoredWorldTimestamp,
  fromStoredWorldTimestamp,
} from "./world-domain.ts";

export type SpawnTimerKind = "item" | "npc";

export type SpawnTimerRow = {
  id: number;
  world_id: string;
  kind: SpawnTimerKind;
  type_id: string;
  ready_at: number;
};

export function insertSpawnTimer(
  worldId: string,
  kind: SpawnTimerKind,
  typeId: string,
  readyAtMs: number,
): void {
  insertWorldRow(VWORLD_SPAWN_TIMER_TABLE, {
    world_id: String(worldId),
    kind: kind,
    type_id: String(typeId),
    ready_at: toStoredWorldTimestamp(readyAtMs),
  });
}

export function loadSpawnTimersForWorld(worldId: string): SpawnTimerRow[] {
  const rows = queryWorldRows(
    VWORLD_SPAWN_TIMER_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    1000,
    "id",
    "asc",
  );
  const out: SpawnTimerRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Number.isFinite(Number(row.id))) continue;
    out.push({
      id: Number(row.id),
      world_id: String(row.world_id || ""),
      kind: row.kind === "npc" ? "npc" : "item",
      type_id: String(row.type_id || ""),
      ready_at: fromStoredWorldTimestamp(row.ready_at),
    });
  }
  return out;
}

export function deleteSpawnTimerById(id: number): void {
  deleteWorldRow(VWORLD_SPAWN_TIMER_TABLE, id);
}
