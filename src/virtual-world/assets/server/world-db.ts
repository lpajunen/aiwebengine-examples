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
  const result = parseWorldDbResult(
    database.query(tableName, filters, limit, orderBy, orderDir),
    log,
  );
  if (!Array.isArray(result)) {
    if (result && result.error) {
      log("world db query failed", {
        table: tableName,
        filters: filters || "",
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
    return null;
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
    return null;
  }
  return result;
}

export function deleteWorldRowsWhere(
  tableName: string,
  filters: string,
  log: WorldDbLogFn,
): void {
  const result = parseWorldDbResult(database.deleteWhere(tableName, filters), log);
  if (result && result.error) {
    log("world db deleteWhere failed", {
      table: tableName,
      error: String(result.error),
    });
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
    database.upsert(tableName, JSON.stringify(keyColumns), JSON.stringify(data)),
    log,
  );
  if (!result || result.error) {
    log("world db upsert failed", {
      table: tableName,
      keys: keyColumns.join(","),
      error: String(result && result.error ? result.error : "unknown"),
    });

    const source =
      data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const keyFilters: Record<string, unknown> = {};
    for (let i = 0; i < keyColumns.length; i++) {
      const key = keyColumns[i];
      if (!source || !Object.prototype.hasOwnProperty.call(source, key)) {
        return null;
      }
      keyFilters[key] = source[key];
    }

    const existingRow = querySingleWorldRow(
      tableName,
      JSON.stringify(keyFilters),
      log,
    );
    if (existingRow && Number.isFinite(Number(existingRow.id))) {
      return updateWorldRow(tableName, Number(existingRow.id), data, log);
    }
    return insertWorldRow(tableName, data, log);
  }
  return result;
}
