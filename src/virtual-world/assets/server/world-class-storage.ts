import { VWORLD_WORLD_CLASS_TABLE } from "./runtime-config.ts";
import { vwLog } from "./diagnostics.ts";
import {
  BIRDHAVEN_WORLD_CLASS_ID,
  COLS,
  normalizeWorldDimension,
  normalizeWorldType,
  OAK_WORLD_COLS,
  OAK_WORLD_ROWS,
  ROWS,
  WORLD_TYPE_FOREST,
  WORLD_TYPE_VILLAGE,
  WORLD_TYPES,
} from "./world-domain.ts";
import {
  deleteWorldRowsWhere,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";
import { ClassLabels, normalizeClassLabels } from "./class-labels.ts";

export type WorldClassSpawnEntry = { id: string; count: number };

export type WorldClassRecord = {
  id: string;
  baseType: string;
  rows: number;
  cols: number;
  labelKey: string;
  fallbackLabel: string;
  itemSpawns: WorldClassSpawnEntry[];
  npcSpawns: WorldClassSpawnEntry[];
  ownerIds: string[];
  labels: ClassLabels;
};

const BUILTIN_ITEM_SPAWNS: WorldClassSpawnEntry[] = [
  { id: "saw", count: 3 },
  { id: "knife", count: 3 },
  { id: "flower", count: 3 },
  { id: "tree_planter", count: 3 },
  { id: "portal_builder", count: 3 },
  { id: "kantele", count: 3 },
  { id: "rowan_charm", count: 3 },
  { id: "rune_stone", count: 3 },
  { id: "juniper_bundle", count: 3 },
  { id: "birch_bark_letter", count: 3 },
  { id: "spellbook", count: 3 },
  { id: "shaman_talisman", count: 3 },
  { id: "chest", count: 1 },
];

const BUILTIN_WILD_NPC_SPAWNS: WorldClassSpawnEntry[] = [
  { id: "npc_human", count: 5 },
  { id: "npc_wolf", count: 5 },
  { id: "npc_bear", count: 5 },
  { id: "npc_archer", count: 5 },
  { id: "npc_giant", count: 2 },
];

const BUILTIN_VILLAGE_NPC_SPAWNS: WorldClassSpawnEntry[] = [
  { id: "npc_human", count: 5 },
  { id: "npc_dog", count: 5 },
  { id: "npc_chicken", count: 5 },
  { id: "npc_donkey", count: 3 },
];

const BUILTIN_FOREST_NPC_SPAWNS: WorldClassSpawnEntry[] =
  BUILTIN_WILD_NPC_SPAWNS.concat([{ id: "npc_horse", count: 3 }]);

function copySpawnEntries(
  entries: WorldClassSpawnEntry[],
): WorldClassSpawnEntry[] {
  return entries.map(function (entry) {
    return { id: entry.id, count: entry.count };
  });
}

// Finnish display names for the built-in world classes, mirroring the
// world_class.<type>.name i18n entries. Stored in each built-in class's
// `labels.fi` so the world-type editor's Name(Finnish) field (which reads only
// labels.fi, not the i18n bundle) shows and round-trips them.
const BUILTIN_WORLD_CLASS_LABELS_FI: Record<string, string> = {
  forest: "Metsä",
  island: "Saari",
  cave: "Luola",
  building: "Rakennus",
  village: "Kylä",
};

function normalizeOwnerIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const id = String(raw[i] || "").trim();
    if (id) out.push(id);
  }
  return out;
}

function normalizeSpawnEntries(raw: unknown): WorldClassSpawnEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: WorldClassSpawnEntry[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== "object") continue;
    const id = String((entry as Record<string, unknown>).id || "").trim();
    if (!id) continue;
    const count = Math.floor(Number((entry as Record<string, unknown>).count));
    if (!Number.isFinite(count) || count < 0) continue;
    out.push({ id: id, count: count });
  }
  return out;
}

let _worldClassCache: Record<string, WorldClassRecord> | null = null;

// The generation presets in WORLD_TYPES double as built-in world classes;
// custom classes reference one of them as baseType and override the
// dimensions.
export function isBuiltinWorldClassId(classId: string): boolean {
  return WORLD_TYPES.indexOf(String(classId || "") as any) !== -1;
}

function builtinWorldClassRecord(worldType: string): WorldClassRecord {
  const npcSpawns =
    worldType === WORLD_TYPE_VILLAGE
      ? BUILTIN_VILLAGE_NPC_SPAWNS
      : worldType === WORLD_TYPE_FOREST
        ? BUILTIN_FOREST_NPC_SPAWNS
        : BUILTIN_WILD_NPC_SPAWNS;
  return {
    id: worldType,
    baseType: worldType,
    rows: ROWS,
    cols: COLS,
    labelKey: "world_class." + worldType + ".name",
    fallbackLabel: worldType.charAt(0).toUpperCase() + worldType.slice(1),
    itemSpawns: copySpawnEntries(BUILTIN_ITEM_SPAWNS),
    npcSpawns: copySpawnEntries(npcSpawns),
    ownerIds: [],
    labels: BUILTIN_WORLD_CLASS_LABELS_FI[worldType]
      ? { fi: BUILTIN_WORLD_CLASS_LABELS_FI[worldType] }
      : {},
  };
}

// System world classes that aren't generation presets (not in WORLD_TYPES) but
// are still seeded/backfilled like built-ins so they show in the world-type
// editor. Birdhaven is the start village's own class (village terrain + spawns,
// pinned to the oak world's 30x30 size).
function birdhavenWorldClassRecord(): WorldClassRecord {
  return {
    id: BIRDHAVEN_WORLD_CLASS_ID,
    baseType: WORLD_TYPE_VILLAGE,
    rows: OAK_WORLD_ROWS,
    cols: OAK_WORLD_COLS,
    labelKey: "world_class." + BIRDHAVEN_WORLD_CLASS_ID + ".name",
    fallbackLabel: "Birdhaven",
    itemSpawns: copySpawnEntries(BUILTIN_ITEM_SPAWNS),
    npcSpawns: copySpawnEntries(BUILTIN_VILLAGE_NPC_SPAWNS),
    ownerIds: [],
    labels: { fi: "Lintukoto" },
  };
}

function systemWorldClassRecords(): WorldClassRecord[] {
  return [birdhavenWorldClassRecord()];
}

export function normalizeWorldClassRecord(record: {
  id: string;
  baseType?: unknown;
  rows?: unknown;
  cols?: unknown;
  labelKey?: unknown;
  fallbackLabel?: unknown;
  itemSpawns?: unknown;
  npcSpawns?: unknown;
  ownerIds?: unknown;
  labels?: unknown;
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
    itemSpawns: normalizeSpawnEntries(record.itemSpawns),
    npcSpawns: normalizeSpawnEntries(record.npcSpawns),
    ownerIds: normalizeOwnerIds(record.ownerIds),
    labels: normalizeClassLabels(record.labels),
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
    itemSpawns: (function () {
      try {
        return JSON.parse(row.item_spawns_json || "[]");
      } catch (e) {
        return [];
      }
    })(),
    npcSpawns: (function () {
      try {
        return JSON.parse(row.npc_spawns_json || "[]");
      } catch (e) {
        return [];
      }
    })(),
    ownerIds: (function () {
      try {
        return JSON.parse(row.owner_ids_json || "[]");
      } catch (e) {
        return [];
      }
    })(),
    labels: row.labels_json,
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
  item_spawns_json: string;
  npc_spawns_json: string;
  owner_ids_json: string;
  labels_json: string;
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
    item_spawns_json: JSON.stringify(record.itemSpawns || []),
    npc_spawns_json: JSON.stringify(record.npcSpawns || []),
    owner_ids_json: JSON.stringify(record.ownerIds || []),
    labels_json: JSON.stringify(normalizeClassLabels(record.labels)),
    created_at: storedTs,
    updated_at: storedTs,
  };
}

function loadAllWorldClassRows(): any[] {
  return queryWorldRows(
    VWORLD_WORLD_CLASS_TABLE,
    JSON.stringify({}),
    1000,
    "class_id",
    "asc",
  );
}

function rebuildWorldClassCache(logSeed: boolean): void {
  const dbRows = loadAllWorldClassRows();
  const cache: Record<string, WorldClassRecord> = {};
  let insertedDefaults = 0;
  const now = Date.now();

  for (let i = 0; i < dbRows.length; i++) {
    const record = worldClassFromDbRow(dbRows[i]);
    if (record.id) cache[record.id] = record;
  }

  // Seed missing built-ins. Existing rows, including their spawn manifests,
  // remain authoritative and are changed only through the class APIs.
  let patchedRecords = 0;
  for (let i = 0; i < WORLD_TYPES.length; i++) {
    const worldType = WORLD_TYPES[i];
    const existing = cache[worldType];
    if (!existing) {
      const record = builtinWorldClassRecord(worldType);
      upsertWorldRow(
        VWORLD_WORLD_CLASS_TABLE,
        ["class_id"],
        worldClassToDbRow(record, now),
      );
      cache[record.id] = record;
      insertedDefaults++;
      continue;
    }
    let changed = false;
    // Backfill the built-in Finnish name onto rows seeded before it existed,
    // without overwriting a non-empty value a creator may have set.
    const desiredLabelFi = BUILTIN_WORLD_CLASS_LABELS_FI[worldType];
    if (desiredLabelFi && !(existing.labels && existing.labels.fi)) {
      existing.labels = Object.assign({}, existing.labels || {}, {
        fi: desiredLabelFi,
      });
      changed = true;
    }
    if (changed) {
      upsertWorldRow(
        VWORLD_WORLD_CLASS_TABLE,
        ["class_id"],
        worldClassToDbRow(existing, now),
      );
      patchedRecords++;
    }
  }

  // Seed/backfill non-preset system classes (e.g. birdhaven, the start
  // village's class) the same way, so they appear in the editor.
  const systemRecords = systemWorldClassRecords();
  for (let i = 0; i < systemRecords.length; i++) {
    const desired = systemRecords[i];
    const existing = cache[desired.id];
    if (!existing) {
      upsertWorldRow(
        VWORLD_WORLD_CLASS_TABLE,
        ["class_id"],
        worldClassToDbRow(desired, now),
      );
      cache[desired.id] = desired;
      insertedDefaults++;
      continue;
    }
    let changed = false;
    if (desired.labels.fi && !(existing.labels && existing.labels.fi)) {
      existing.labels = Object.assign({}, existing.labels || {}, {
        fi: desired.labels.fi,
      });
      changed = true;
    }
    if (existing.fallbackLabel !== desired.fallbackLabel) {
      existing.fallbackLabel = desired.fallbackLabel;
      changed = true;
    }
    if (changed) {
      upsertWorldRow(
        VWORLD_WORLD_CLASS_TABLE,
        ["class_id"],
        worldClassToDbRow(existing, now),
      );
      patchedRecords++;
    }
  }

  if (logSeed && dbRows.length === 0) {
    vwLog("world class repository seeded", { count: insertedDefaults });
  } else if (insertedDefaults > 0 || patchedRecords > 0) {
    vwLog("world class repository backfilled", {
      inserted_count: insertedDefaults,
      patched_record_count: patchedRecords,
    });
  }

  _worldClassCache = cache;
}

export function bootstrapWorldClasses(): void {
  rebuildWorldClassCache(true);
}

export function refreshWorldClassCache(): void {
  rebuildWorldClassCache(false);
}

// Same cache-miss tolerance as the item/living registries: an instance whose
// init() timed out before bootstrapWorldClasses() would otherwise report that
// no world classes exist, taking the spawn manifests with it.
export function getAllWorldClasses(): WorldClassRecord[] {
  if (!_worldClassCache) refreshWorldClassCache();
  if (!_worldClassCache) return [];
  return Object.keys(_worldClassCache).map(function (id) {
    return (_worldClassCache as Record<string, WorldClassRecord>)[id];
  });
}

export function getWorldClass(classId: string): WorldClassRecord | null {
  if (!_worldClassCache) refreshWorldClassCache();
  if (!_worldClassCache) return null;
  return _worldClassCache[String(classId || "")] || null;
}

export function upsertWorldClass(record: WorldClassRecord): {
  ok: boolean;
  error?: string;
} {
  const writeResult = upsertWorldRow(
    VWORLD_WORLD_CLASS_TABLE,
    ["class_id"],
    worldClassToDbRow(record, Date.now()),
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

export function deleteWorldClass(classId: string): void {
  deleteWorldRowsWhere(
    VWORLD_WORLD_CLASS_TABLE,
    JSON.stringify({ class_id: String(classId) }),
  );
  if (_worldClassCache) {
    delete _worldClassCache[classId];
  }
}

// Cache-miss-tolerant world class lookup: another instance (or the editor on
// this one) may have created the class after this instance's cache was built,
// so refresh from the DB before concluding the class does not exist.
export function getWorldClassWithRefresh(classId: string): any {
  const cls = getWorldClass(classId);
  if (cls) return cls;
  refreshWorldClassCache();
  return getWorldClass(classId);
}
