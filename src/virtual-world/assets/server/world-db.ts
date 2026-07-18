type WorldDbLogFn = (msg: string, obj?: unknown) => void;

export function parseWorldDbResult(raw: string, log: WorldDbLogFn): any | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    log("world db parse failed", { error: String(e) });
    return null;
  }
}

export function queryWorldRows(
  tableName: string,
  filters: string,
  limit: number,
  orderBy: string,
  orderDir: "asc" | "desc",
  log: WorldDbLogFn,
): any[] {
  const normalizedFilters =
    typeof filters === "string" && filters.trim() ? filters : "{}";
  const result = parseWorldDbResult(
    database.query(tableName, normalizedFilters, limit, orderBy, orderDir),
    log,
  );
  if (!Array.isArray(result)) {
    if (result && result.error) {
      log("world db query failed", {
        table: tableName,
        filters: normalizedFilters,
        error: String(result.error),
      });
    }
    return [];
  }
  return result;
}

export function insertWorldRow(
  tableName: string,
  data: unknown,
  log: WorldDbLogFn,
): any | null {
  const result = parseWorldDbResult(
    database.insert(tableName, JSON.stringify(data)),
    log,
  );
  if (result && result.error) {
    log("world db insert failed", {
      table: tableName,
      error: String(result.error),
    });
    return { error: String(result.error) };
  }
  return result;
}

export function updateWorldRow(
  tableName: string,
  id: number,
  data: unknown,
  log: WorldDbLogFn,
): any | null {
  const result = parseWorldDbResult(
    database.update(tableName, id, JSON.stringify(data)),
    log,
  );
  if (result && result.error) {
    log("world db update failed", {
      table: tableName,
      id: id,
      error: String(result.error),
    });
    return { error: String(result.error) };
  }
  return result;
}

/**
 * Delete rows matching the filters and return how many were actually
 * deleted. The count is what makes claim semantics possible: under
 * concurrency, only the caller whose delete affected a row owns the item.
 */
export function deleteWorldRowsWhere(
  tableName: string,
  filters: string,
  log: WorldDbLogFn,
): number {
  const result = parseWorldDbResult(
    database.deleteWhere(tableName, filters),
    log,
  );
  if (result && result.error) {
    log("world db deleteWhere failed", {
      table: tableName,
      error: String(result.error),
    });
    return 0;
  }
  return result && Number.isFinite(Number(result.deleted))
    ? Number(result.deleted)
    : 0;
}

/**
 * Run fn inside a database transaction (or a savepoint when the handler is
 * already inside one). Fail-open: if the transaction cannot be started the
 * work still runs unwrapped — atomicity is lost but the game keeps working.
 * On exception the transaction is rolled back and the error rethrown; a
 * commit failure is logged (the runtime has already discarded the writes and
 * clients heal via resync).
 */
export function runInWorldTransaction<T>(
  label: string,
  log: WorldDbLogFn,
  fn: () => T,
): T {
  let began = false;
  try {
    const beginResult = parseWorldDbResult(
      database.beginTransaction(5000),
      log,
    );
    began = !!(beginResult && beginResult.success);
    if (!began) {
      log("transaction begin failed; running unwrapped", {
        label: label,
        error: String(
          beginResult && beginResult.error ? beginResult.error : "unknown",
        ),
      });
    }
  } catch (e) {
    log("transaction begin threw; running unwrapped", {
      label: label,
      error: String(e),
    });
  }
  try {
    const result = fn();
    if (began) {
      const commitResult = parseWorldDbResult(
        database.commitTransaction(),
        log,
      );
      if (commitResult && commitResult.error) {
        log("transaction commit failed", {
          label: label,
          error: String(commitResult.error),
        });
      }
    }
    return result;
  } catch (e) {
    if (began) {
      try {
        database.rollbackTransaction();
      } catch (rollbackError) {
        log("transaction rollback failed", {
          label: label,
          error: String(rollbackError),
        });
      }
    }
    throw e;
  }
}

export function deleteWorldRow(
  tableName: string,
  id: number,
  log: WorldDbLogFn,
): void {
  const result = parseWorldDbResult(database.delete(tableName, id), log);
  if (result && result.error) {
    log("world db delete failed", {
      table: tableName,
      id: id,
      error: String(result.error),
    });
  }
}

export function querySingleWorldRow(
  tableName: string,
  filters: string,
  log: WorldDbLogFn,
): any | null {
  const rows = queryWorldRows(tableName, filters, 1, "id", "desc", log);
  return rows.length > 0 ? rows[0] : null;
}

export function upsertWorldRow(
  tableName: string,
  keyColumns: string[],
  data: unknown,
  log: WorldDbLogFn,
): any | null {
  const result = parseWorldDbResult(
    database.upsert(
      tableName,
      JSON.stringify(keyColumns),
      JSON.stringify(data),
    ),
    log,
  );
  if (!result || result.error) {
    log("world db upsert failed", {
      table: tableName,
      keys: keyColumns.join(","),
      error: String(result && result.error ? result.error : "unknown"),
    });

    const source =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : null;
    const keyFilters: Record<string, unknown> = {};
    for (let i = 0; i < keyColumns.length; i++) {
      const key = keyColumns[i];
      if (!source || !Object.prototype.hasOwnProperty.call(source, key)) {
        return { error: "missing upsert key column: " + key };
      }
      keyFilters[key] = source[key];
    }

    const initialError = String(
      result && result.error ? result.error : "unknown",
    );
    const existingRow = querySingleWorldRow(
      tableName,
      JSON.stringify(keyFilters),
      log,
    );
    if (existingRow && Number.isFinite(Number(existingRow.id))) {
      const updateResult = updateWorldRow(
        tableName,
        Number(existingRow.id),
        data,
        log,
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
    const insertResult = insertWorldRow(tableName, data, log);
    if (insertResult && !insertResult.error) return insertResult;
    return {
      error:
        "upsert failed; insert fallback failed: " +
        String(
          insertResult && insertResult.error
            ? insertResult.error
            : initialError,
        ),
    };
  }
  return result;
}
