import {
  COLS,
  normalizeWorldDimension,
  normalizeWorldType,
  ROWS,
  WORLD_TYPES,
} from "./world-domain.ts";
import {
  deleteWorldRowsWhere,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

type WorldDbLogFn = (msg: string, obj?: unknown) => void;

export type WorldClassRecord = {
  id: string;
  baseType: string;
  rows: number;
  cols: number;
  labelKey: string;
  fallbackLabel: string;
};

let _worldClassCache: Record<string, WorldClassRecord> | null = null;

// The four generation presets double as built-in world classes; custom
// classes reference one of them as baseType and override the dimensions.
export function isBuiltinWorldClassId(classId: string): boolean {
  return WORLD_TYPES.indexOf(String(classId || "") as any) !== -1;
}

function builtinWorldClassRecord(worldType: string): WorldClassRecord {
  return {
    id: worldType,
    baseType: worldType,
    rows: ROWS,
    cols: COLS,
    labelKey: "world_class." + worldType + ".name",
    fallbackLabel: worldType.charAt(0).toUpperCase() + worldType.slice(1),
  };
}

export function normalizeWorldClassRecord(record: {
  id: string;
  baseType?: unknown;
  rows?: unknown;
  cols?: unknown;
  labelKey?: unknown;
  fallbackLabel?: unknown;
}): WorldClassRecord {
  const id = String(record.id || "").trim();
  return {
    id: id,
    baseType: normalizeWorldType(
      typeof record.baseType === "string" ? record.baseType : "",
    ),
    rows: normalizeWorldDimension(record.rows, ROWS),
    cols: normalizeWorldDimension(record.cols, COLS),
    labelKey: String(record.labelKey || ""),
    fallbackLabel: String(record.fallbackLabel || id),
  };
}

function worldClassFromDbRow(row: any): WorldClassRecord {
  return normalizeWorldClassRecord({
    id: String(row.class_id || ""),
    baseType: row.base_type,
    rows: row.rows,
    cols: row.cols,
    labelKey: row.label_key,
    fallbackLabel: row.fallback_label,
  });
}

function worldClassToDbRow(
  record: WorldClassRecord,
  now: number,
): {
  class_id: string;
  base_type: string;
  rows: number;
  cols: number;
  label_key: string;
  fallback_label: string;
  created_at: number;
  updated_at: number;
} {
  const storedTs = Math.floor(now / 1000);
  return {
    class_id: record.id,
    base_type: record.baseType,
    rows: record.rows,
    cols: record.cols,
    label_key: record.labelKey,
    fallback_label: record.fallbackLabel,
    created_at: storedTs,
    updated_at: storedTs,
  };
}

function loadAllWorldClassRows(
  worldClassTable: string,
  log: WorldDbLogFn,
): any[] {
  return queryWorldRows(
    worldClassTable,
    JSON.stringify({}),
    1000,
    "class_id",
    "asc",
    log,
  );
}

function rebuildWorldClassCache(
  worldClassTable: string,
  log: WorldDbLogFn,
  logSeed: boolean,
): void {
  const dbRows = loadAllWorldClassRows(worldClassTable, log);
  const cache: Record<string, WorldClassRecord> = {};
  let insertedDefaults = 0;
  const now = Date.now();

  for (let i = 0; i < dbRows.length; i++) {
    const record = worldClassFromDbRow(dbRows[i]);
    if (record.id) cache[record.id] = record;
  }

  // Backfill missing built-ins without overwriting existing custom rows.
  for (let i = 0; i < WORLD_TYPES.length; i++) {
    const worldType = WORLD_TYPES[i];
    if (!cache[worldType]) {
      const record = builtinWorldClassRecord(worldType);
      upsertWorldRow(
        worldClassTable,
        ["class_id"],
        worldClassToDbRow(record, now),
        log,
      );
      cache[record.id] = record;
      insertedDefaults++;
    }
  }
  if (logSeed && dbRows.length === 0) {
    log("world class repository seeded", { count: insertedDefaults });
  } else if (insertedDefaults > 0) {
    log("world class repository backfilled", {
      inserted_count: insertedDefaults,
    });
  }

  _worldClassCache = cache;
}

export function bootstrapWorldClasses(
  worldClassTable: string,
  log: WorldDbLogFn,
): void {
  rebuildWorldClassCache(worldClassTable, log, true);
}

export function refreshWorldClassCache(
  worldClassTable: string,
  log: WorldDbLogFn,
): void {
  rebuildWorldClassCache(worldClassTable, log, false);
}

export function getAllWorldClasses(): WorldClassRecord[] {
  if (!_worldClassCache) return [];
  return Object.keys(_worldClassCache).map(function (id) {
    return (_worldClassCache as Record<string, WorldClassRecord>)[id];
  });
}

export function getWorldClass(classId: string): WorldClassRecord | null {
  if (!_worldClassCache) return null;
  return _worldClassCache[String(classId || "")] || null;
}

export function upsertWorldClass(
  record: WorldClassRecord,
  worldClassTable: string,
  log: WorldDbLogFn,
): { ok: boolean; error?: string } {
  const writeResult = upsertWorldRow(
    worldClassTable,
    ["class_id"],
    worldClassToDbRow(record, Date.now()),
    log,
  );
  const ok = !!writeResult && !writeResult.error;
  if (ok && _worldClassCache) {
    _worldClassCache[record.id] = record;
  }
  return ok
    ? { ok: true }
    : {
        ok: false,
        error: String(
          writeResult && writeResult.error ? writeResult.error : "unknown",
        ),
      };
}

export function deleteWorldClass(
  classId: string,
  worldClassTable: string,
  log: WorldDbLogFn,
): void {
  deleteWorldRowsWhere(
    worldClassTable,
    JSON.stringify({ class_id: String(classId) }),
    log,
  );
  if (_worldClassCache) {
    delete _worldClassCache[classId];
  }
}
