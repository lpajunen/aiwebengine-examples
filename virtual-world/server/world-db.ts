import { vwLog } from "./diagnostics.ts";

/**
 * A `database.*` answer as a value, or null when there was nothing.
 *
 * The calls answer with values now; a string is still parsed, because a
 * test's stub may hand one over.
 */
export function parseWorldDbResult(raw: unknown): any | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch (e) {
    vwLog("world db parse failed", { error: String(e) });
    return null;
  }
}

/** A filter as callers write it: an object, or the JSON text of one. */
export type WorldFilter = string | Record<string, unknown>;

function filterObject(filters: WorldFilter): Record<string, unknown> {
  if (typeof filters !== "string") return filters || {};
  if (!filters.trim()) return {};
  try {
    const parsed = JSON.parse(filters);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    vwLog("world db filter unreadable", { filters: filters });
    return {};
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export interface WorldReadOptions {
  /**
   * Hold the returned rows until the transaction ends, so a read-modify-write
   * cannot lose an update to a concurrent one. Only meaningful inside a
   * transaction — see wantsLock.
   */
  forUpdate?: boolean;
}

/**
 * Whether to ask for a locked read.
 *
 * The engine refuses `forUpdate` outside a transaction, because a lock taken
 * there would be released the moment the query returned. runInWorldTransaction
 * is deliberately fail-open — when the transaction cannot start the body still
 * runs, just unprotected — so a locked read reached that way is downgraded to
 * an unlocked one and logged, rather than raising. Turning a lost update into
 * a dead route would be the worse trade.
 */
function wantsLock(
  tableName: string,
  options: WorldReadOptions | undefined,
): boolean {
  if (!options || !options.forUpdate) return false;
  if (transactionDepth === 0) {
    vwLog("forUpdate requested outside a transaction; reading unlocked", {
      table: tableName,
    });
    return false;
  }
  return true;
}

export function queryWorldRows(
  tableName: string,
  filters: WorldFilter,
  limit: number,
  orderBy: string,
  orderDir: "asc" | "desc",
  options?: WorldReadOptions,
): any[] {
  const where = filterObject(filters);
  try {
    return database.query(tableName, {
      where: where,
      limit: limit,
      orderBy: orderBy,
      order: orderDir,
      forUpdate: wantsLock(tableName, options),
    });
  } catch (e) {
    vwLog("world db query failed", {
      table: tableName,
      filters: JSON.stringify(where),
      error: errorText(e),
    });
    return [];
  }
}

export function insertWorldRow(
  tableName: string,
  data: Record<string, any>,
): any | null {
  try {
    return database.insert(tableName, data);
  } catch (e) {
    vwLog("world db insert failed", { table: tableName, error: errorText(e) });
    return { error: errorText(e) };
  }
}

export function updateWorldRow(
  tableName: string,
  id: number,
  data: Record<string, any>,
): any | null {
  try {
    return database.update(tableName, id, data);
  } catch (e) {
    vwLog("world db update failed", {
      table: tableName,
      id: id,
      error: errorText(e),
    });
    return { error: errorText(e) };
  }
}

/**
 * Delete rows matching the filters and return how many were actually
 * deleted. The count is what makes claim semantics possible: under
 * concurrency, only the caller whose delete affected a row owns the item.
 */
export function deleteWorldRowsWhere(
  tableName: string,
  filters: WorldFilter,
): number {
  try {
    const result = database.deleteWhere(tableName, filterObject(filters));
    return Number.isFinite(Number(result.deleted)) ? Number(result.deleted) : 0;
  } catch (e) {
    vwLog("world db deleteWhere failed", {
      table: tableName,
      error: errorText(e),
    });
    return 0;
  }
}

// Depth of the world transaction this execution has open, so a locked read
// knows whether it may ask for a lock. Nested calls are savepoints inside the
// outer one, so an exception rolls back the inner work and propagates to the
// outermost call, which rolls back the rest. Pinned by world-db.test.ts.
let transactionDepth = 0;

/**
 * Run fn inside a database transaction — a savepoint when one is already
 * open. Fail-open: if the transaction cannot be started the work still runs
 * unwrapped — atomicity is lost but the game keeps working. On exception the
 * transaction is rolled back and the error rethrown.
 */
export function runInWorldTransaction<T>(label: string, fn: () => T): T {
  let started = false;
  try {
    return database.transaction(
      () => {
        started = true;
        transactionDepth++;
        try {
          return fn();
        } finally {
          transactionDepth--;
        }
      },
      { timeoutMs: 5000 },
    );
  } catch (e) {
    if (started) throw e;
    vwLog("transaction could not start; running unwrapped", {
      label: label,
      error: errorText(e),
    });
    return fn();
  }
}

export function deleteWorldRow(tableName: string, id: number): void {
  try {
    database.delete(tableName, id);
  } catch (e) {
    vwLog("world db delete failed", {
      table: tableName,
      id: id,
      error: errorText(e),
    });
  }
}

export function querySingleWorldRow(
  tableName: string,
  filters: WorldFilter,
  options?: WorldReadOptions,
): any | null {
  const rows = queryWorldRows(tableName, filters, 1, "id", "desc", options);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Insert or update by key. Falls back to read-then-write when the upsert is
 * refused — on a table whose unique index is missing, say — so the write
 * still lands.
 */
export function upsertWorldRow(
  tableName: string,
  keyColumns: string[],
  data: Record<string, any>,
): any | null {
  let initialError = "";
  try {
    return database.upsert(tableName, keyColumns, data);
  } catch (e) {
    initialError = errorText(e);
    vwLog("world db upsert failed", {
      table: tableName,
      keys: keyColumns.join(","),
      error: initialError,
    });
  }

  const keyFilters: Record<string, unknown> = {};
  for (let i = 0; i < keyColumns.length; i++) {
    const key = keyColumns[i];
    if (!data || !Object.prototype.hasOwnProperty.call(data, key)) {
      return { error: "missing upsert key column: " + key };
    }
    keyFilters[key] = data[key];
  }

  const existingRow = querySingleWorldRow(tableName, keyFilters);
  if (existingRow && Number.isFinite(Number(existingRow.id))) {
    const updateResult = updateWorldRow(
      tableName,
      Number(existingRow.id),
      data,
    );
    if (updateResult && !updateResult.error) return updateResult;
    return {
      error:
        "upsert failed; update fallback failed: " +
        String(
          updateResult && updateResult.error
            ? updateResult.error
            : initialError,
        ),
    };
  }
  const insertResult = insertWorldRow(tableName, data);
  if (insertResult && !insertResult.error) return insertResult;
  return {
    error:
      "upsert failed; insert fallback failed: " +
      String(
        insertResult && insertResult.error ? insertResult.error : initialError,
      ),
  };
}

/**
 * Take or extend a lease: a row per `leaseId` saying who holds it and until
 * when. Taken when there is no row, when it has expired, or when it is already
 * ours. Inside a transaction with the row read `forUpdate`, so two instances
 * cannot both see it free; the unique index on `lease_id` makes a racing first
 * insert fail rather than both callers believing they won.
 *
 * What the engine's `acquireLease` did, before `database` lost it: the
 * operation is small enough to be the script's.
 */
export function tryTakeLease(
  tableName: string,
  leaseId: string,
  owner: string,
  ttlMs: number,
): boolean {
  try {
    return database.transaction(
      () => {
        const now = Date.now();
        const [row] = database.query(tableName, {
          where: { lease_id: leaseId },
          limit: 1,
          forUpdate: true,
        });
        if (!row) {
          database.insert(tableName, {
            lease_id: leaseId,
            owner: owner,
            expires_at_ms: now + ttlMs,
          });
          return true;
        }
        if (row.owner !== owner && Number(row.expires_at_ms) > now)
          return false;
        database.update(tableName, row.id, {
          owner: owner,
          expires_at_ms: now + ttlMs,
        });
        return true;
      },
      { timeoutMs: 2000 },
    );
  } catch (e) {
    vwLog("lease could not be taken", { lease: leaseId, error: errorText(e) });
    return false;
  }
}
