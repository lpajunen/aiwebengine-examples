import { VWORLD_EVENT_SEQ_TABLE } from "./runtime-config.ts";
import { vwLog } from "./diagnostics.ts";
import {
  parseWorldDbResult,
  querySingleWorldRow,
  upsertWorldRow,
} from "./world-db.ts";

export function worldEventScope(worldId: string): string {
  return "world:" + String(worldId);
}

export function recipientEventScope(recipientId: string): string {
  return "recipient:" + String(recipientId);
}

/**
 * Allocate the next monotonic sequence number for an event scope.
 *
 * Runs inside a transaction (or savepoint when the handler already opened
 * one) so concurrent emitters on different instances cannot both read the
 * same counter value. Returns 0 on any failure — the caller then emits the
 * event unversioned, which clients apply without gap detection (fail-open:
 * a lost seq must never block event delivery).
 */
export function allocateEventSeq(scopeKey: string): number {
  let began = false;
  try {
    const beginResult = parseWorldDbResult(database.beginTransaction(2000));
    began = !!(beginResult && beginResult.success);
    const row = querySingleWorldRow(
      VWORLD_EVENT_SEQ_TABLE,
      JSON.stringify({ scope_key: scopeKey }),
    );
    const next =
      (row && Number.isFinite(Number(row.seq)) ? Number(row.seq) : 0) + 1;
    const result = upsertWorldRow(VWORLD_EVENT_SEQ_TABLE, ["scope_key"], {
      scope_key: scopeKey,
      seq: next,
    });
    if (result && result.error) {
      if (began) database.rollbackTransaction();
      return 0;
    }
    if (began) {
      const commitResult = parseWorldDbResult(database.commitTransaction());
      if (commitResult && commitResult.error) {
        vwLog("event seq commit failed", {
          scope: scopeKey,
          error: String(commitResult.error),
        });
        return 0;
      }
    }
    return next;
  } catch (e) {
    vwLog("event seq allocation failed", {
      scope: scopeKey,
      error: String(e),
    });
    if (began) {
      try {
        database.rollbackTransaction();
      } catch (rollbackError) {
        vwLog("event seq rollback failed", { error: String(rollbackError) });
      }
    }
    return 0;
  }
}

export function getCurrentEventSeq(scopeKey: string): number {
  const row = querySingleWorldRow(
    VWORLD_EVENT_SEQ_TABLE,
    JSON.stringify({ scope_key: scopeKey }),
  );
  return row && Number.isFinite(Number(row.seq)) ? Number(row.seq) : 0;
}
