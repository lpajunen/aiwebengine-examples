import { VWORLD_EVENT_SEQ_TABLE } from "./runtime-config.ts";
import { vwLog } from "./diagnostics.ts";
import {
  querySingleWorldRow,
  runInWorldTransaction,
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
 * Runs inside a transaction and takes a row lock on the counter, so concurrent
 * emitters cannot both read the same value and both write value+1 — which
 * leaves one of them handing out a seq a client has already seen, and clients
 * drop a non-advancing seq as a duplicate. A transaction alone is not enough:
 * the read has to be `forUpdate` for the second caller to wait and re-read
 * what the first one wrote.
 *
 * Joins the caller's transaction when there already is one, because events are
 * usually emitted from inside a handler's transaction and the engine does not
 * nest them (see runInWorldTransaction) — note that this holds the counter
 * lock for the rest of that handler's transaction, serializing emitters on the
 * same scope until it commits.
 *
 * Returns 0 on any failure — the caller then emits the event unversioned,
 * which clients apply without gap detection (fail-open: a lost seq must never
 * block event delivery, and must never take the caller's own writes down with
 * it).
 *
 * One gap remains: the very first allocation for a scope finds no row, and a
 * lock over no rows blocks nobody, so two simultaneous first emitters can both
 * hand out seq 1. It costs one dropped event on a scope's first ever event and
 * needs an atomic upsert-returning primitive to close properly.
 */
export function allocateEventSeq(scopeKey: string): number {
  try {
    return runInWorldTransaction("event_seq:" + scopeKey, function () {
      const row = querySingleWorldRow(
        VWORLD_EVENT_SEQ_TABLE,
        JSON.stringify({ scope_key: scopeKey }),
        { forUpdate: true },
      );
      const next =
        (row && Number.isFinite(Number(row.seq)) ? Number(row.seq) : 0) + 1;
      const result = upsertWorldRow(VWORLD_EVENT_SEQ_TABLE, ["scope_key"], {
        scope_key: scopeKey,
        seq: next,
      });
      if (result && result.error) {
        throw new Error(String(result.error));
      }
      return next;
    });
  } catch (e) {
    vwLog("event seq allocation failed", {
      scope: scopeKey,
      error: String(e),
    });
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
