import {
  parseWorldDbResult,
  querySingleWorldRow,
  upsertWorldRow,
} from "./world-db.ts";

type WorldDbLogFn = (msg: string, obj?: unknown) => void;

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
export function allocateEventSeq(
  scopeKey: string,
  eventSeqTable: string,
  log: WorldDbLogFn,
): number {
  let began = false;
  try {
    const beginResult = parseWorldDbResult(
      database.beginTransaction(2000),
      log,
    );
    began = !!(beginResult && beginResult.success);
    const row = querySingleWorldRow(
      eventSeqTable,
      JSON.stringify({ scope_key: scopeKey }),
      log,
    );
    const next =
      (row && Number.isFinite(Number(row.seq)) ? Number(row.seq) : 0) + 1;
    const result = upsertWorldRow(
      eventSeqTable,
      ["scope_key"],
      { scope_key: scopeKey, seq: next },
      log,
    );
    if (result && result.error) {
      if (began) database.rollbackTransaction();
      return 0;
    }
    if (began) {
      const commitResult = parseWorldDbResult(
        database.commitTransaction(),
        log,
      );
      if (commitResult && commitResult.error) {
        log("event seq commit failed", {
          scope: scopeKey,
          error: String(commitResult.error),
        });
        return 0;
      }
    }
    return next;
  } catch (e) {
    log("event seq allocation failed", {
      scope: scopeKey,
      error: String(e),
    });
    if (began) {
      try {
        database.rollbackTransaction();
      } catch (rollbackError) {
        log("event seq rollback failed", { error: String(rollbackError) });
      }
    }
    return 0;
  }
}

export function getCurrentEventSeq(
  scopeKey: string,
  eventSeqTable: string,
  log: WorldDbLogFn,
): number {
  const row = querySingleWorldRow(
    eventSeqTable,
    JSON.stringify({ scope_key: scopeKey }),
    log,
  );
  return row && Number.isFinite(Number(row.seq)) ? Number(row.seq) : 0;
}
