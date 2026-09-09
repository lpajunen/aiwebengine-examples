import { VWORLD_FIGHT_TABLE } from "./runtime-config.ts";
import { ensureWorldDatabaseSchema } from "./schema-setup.ts";
import {
  deleteWorldRowsWhere,
  insertWorldRow,
  queryWorldRows,
  querySingleWorldRow,
  updateWorldRow,
} from "./world-db.ts";
import {
  fromStoredWorldTimestamp,
  toStoredWorldTimestamp,
} from "./world-domain.ts";

// init()'s ensureWorldDatabaseSchema() call can time out before reaching a
// newly-added table (it runs a long idempotent list of table checks
// sequentially) — self-heal here the same way action/item class caches
// self-heal on first read, rather than depending on init() having completed.
let fightSchemaEnsured = false;
function ensureFightSchema(): void {
  if (fightSchemaEnsured) return;
  ensureWorldDatabaseSchema();
  fightSchemaEnsured = true;
}

export interface FightStateRow {
  attacker_id: string;
  attacker_type: "player" | "npc";
  world_id: string;
  target_id: string;
  target_type: "player" | "npc";
  created_ts: number;
}

function normalizeFightStateRow(row: unknown): FightStateRow | null {
  const value = row as Record<string, unknown> | null;
  if (!value || !value.attacker_id || !value.target_id) return null;
  const attackerType = value.attacker_type === "npc" ? "npc" : "player";
  const targetType = value.target_type === "npc" ? "npc" : "player";
  return {
    attacker_id: String(value.attacker_id),
    attacker_type: attackerType,
    world_id: String(value.world_id || ""),
    target_id: String(value.target_id),
    target_type: targetType,
    created_ts: fromStoredWorldTimestamp(value.created_ts),
  };
}

export function loadFightState(attackerId: string): FightStateRow | null {
  ensureFightSchema();
  const row = querySingleWorldRow(
    VWORLD_FIGHT_TABLE,
    JSON.stringify({ attacker_id: String(attackerId) }),
  );
  return normalizeFightStateRow(row);
}

export function loadActiveFightsForWorld(worldId: string): FightStateRow[] {
  ensureFightSchema();
  const rows = queryWorldRows(
    VWORLD_FIGHT_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    1000,
    "id",
    "asc",
  );
  const out: FightStateRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const normalized = normalizeFightStateRow(rows[i]);
    if (normalized) out.push(normalized);
  }
  return out;
}

export function saveFightState(
  attackerId: string,
  attackerType: "player" | "npc",
  worldId: string,
  targetId: string,
  targetType: "player" | "npc",
): void {
  ensureFightSchema();
  const data = {
    attacker_id: String(attackerId),
    attacker_type: attackerType,
    world_id: String(worldId),
    target_id: String(targetId),
    target_type: targetType,
    created_ts: toStoredWorldTimestamp(Date.now()),
  };
  // Query-then-insert/update instead of database.upsert()'s ON CONFLICT path:
  // that path silently no-ops if the unique index on attacker_id isn't in
  // place (e.g. a schema step cut short), since world-db.ts's error
  // detection doesn't catch every failure shape that primitive can return.
  const existing = querySingleWorldRow(
    VWORLD_FIGHT_TABLE,
    JSON.stringify({ attacker_id: String(attackerId) }),
  );
  if (existing && Number.isFinite(Number(existing.id))) {
    updateWorldRow(VWORLD_FIGHT_TABLE, Number(existing.id), data);
  } else {
    insertWorldRow(VWORLD_FIGHT_TABLE, data);
  }
}

export function deleteFightState(attackerId: string): void {
  ensureFightSchema();
  deleteWorldRowsWhere(
    VWORLD_FIGHT_TABLE,
    JSON.stringify({ attacker_id: String(attackerId) }),
  );
}
