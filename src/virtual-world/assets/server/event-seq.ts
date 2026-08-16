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
 * Runs inside a transaction so concurrent emitters on different instances
 * cannot both read the same counter value — and joins the caller's
 * transaction when there already is one, because events are usually emitted
 * from inside a handler's transaction and the engine does not nest them
 * (see runInWorldTransaction). Returns 0 on any failure — the caller then
 * emits the event unversioned, which clients apply without gap detection
 * (fail-open: a lost seq must never block event delivery, and must never
 * take the caller's own writes down with it).
 */
export function allocateEventSeq(scopeKey: string): number {
  try {
    return runInWorldTransaction("event_seq:" + scopeKey, function () {
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
