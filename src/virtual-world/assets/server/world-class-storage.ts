import { VWORLD_WORLD_CLASS_TABLE } from "./runtime-config.ts";
import { vwLog } from "./diagnostics.ts";
import {
  BIRDHAVEN_WORLD_CLASS_ID,
  COLS,
  GUILD_CENTER_COL,
  GUILD_CENTER_ROW,
  GUILD_SPAWN_COL,
  GUILD_SPAWN_ROW,
  GUILD_WORLD_CLASS_ID,
  GUILD_WORLD_COLS,
  GUILD_WORLD_ROWS,
  normalizeWorldDimension,
  normalizeWorldType,
  OAK_CENTER_COL,
  OAK_CENTER_ROW,
  OAK_CLEAR_RADIUS,
  OAK_WORLD_COLS,
  OAK_WORLD_ROWS,
  ROWS,
  VILLAGE_GUILD_DOOR_COL,
  VILLAGE_GUILD_DOOR_ROW,
  WORLD_TYPE_BUILDING,
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
import {
  normalizeWorldClassPlacements,
  validateWorldClassPlacements,
  WorldClassPlacement,
} from "./world-placements.ts";
import {
  RESERVATION_BLOCK_BUILD,
  RESERVATION_BLOCK_PLANT,
  RESERVATION_BLOCK_TERRAIN_FEATURE,
  RESERVATION_SPAWN_AREA,
} from "./runtime-config.ts";

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
  // Deterministic authored contents — see world-placements.ts. Distinct from
  // the random spawn manifests above, which stay responsible for ambient
  // population.
  placements: WorldClassPlacement[];
  // Bumped in code whenever a *system* class's seeded placements change, so
  // the backfill below knows to rewrite an already-seeded row. Creator-owned
  // classes leave it at 0; nothing reads it for them.
  placementRevision: number;
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

function normalizePlacementRevision(raw: unknown): number {
  const revision = Math.floor(Number(raw));
  if (!Number.isFinite(revision) || revision < 0) return 0;
  return revision;
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
    placements: [],
    placementRevision: 0,
    ownerIds: [],
    labels: BUILTIN_WORLD_CLASS_LABELS_FI[worldType]
      ? { fi: BUILTIN_WORLD_CLASS_LABELS_FI[worldType] }
      : {},
  };
}

// Bump whenever the seeded placements below change, so already-seeded system
// rows get rewritten (see the backfill in rebuildWorldClassCache).
const SYSTEM_PLACEMENT_REVISION = 1;

// Birdhaven's authored contents, as data rather than the world-ID branches in
// item-storage.ts. Phase 1 only persists these; phase 3 materializes them and
// deletes the hard-coded seeding they describe.
function birdhavenPlacements(): WorldClassPlacement[] {
  return [
    {
      id: "old-oak",
      kind: "fixture",
      classId: "old_oak",
      position: { strategy: "exact", row: OAK_CENTER_ROW, col: OAK_CENTER_COL },
      state: {},
      reservations: [
        {
          kind: "circle",
          row: OAK_CENTER_ROW,
          col: OAK_CENTER_COL,
          radius: OAK_CLEAR_RADIUS,
          rules: [
            RESERVATION_BLOCK_PLANT,
            RESERVATION_BLOCK_BUILD,
            RESERVATION_BLOCK_TERRAIN_FEATURE,
            RESERVATION_SPAWN_AREA,
          ],
        },
      ],
    },
    {
      id: "guild-house",
      kind: "structure",
      classId: "house",
      position: {
        strategy: "exact",
        row: VILLAGE_GUILD_DOOR_ROW,
        col: VILLAGE_GUILD_DOOR_COL,
      },
      state: {},
      reservations: [],
    },
    {
      id: "guild-door",
      kind: "portal",
      classId: "door",
      position: {
        strategy: "exact",
        row: VILLAGE_GUILD_DOOR_ROW,
        col: VILLAGE_GUILD_DOOR_COL,
      },
      state: {
        open: true,
        fixture: "guild_entrance",
        destination: {
          mode: "ensure_world_class",
          worldClassId: GUILD_WORLD_CLASS_ID,
          entryPlacementId: "guild-return-door",
        },
      },
      reservations: [],
    },
  ];
}

function adventurersGuildPlacements(): WorldClassPlacement[] {
  return [
    {
      id: "guild-training-post",
      kind: "fixture",
      classId: "training_dummy",
      position: {
        strategy: "exact",
        row: GUILD_CENTER_ROW,
        col: GUILD_CENTER_COL,
      },
      state: {},
      reservations: [],
    },
    {
      // Doubles as the guild's entry point: travellers arriving through
      // birdhaven's guild-door land on this tile, which is why that placement
      // names this one as its entryPlacementId.
      id: "guild-return-door",
      kind: "portal",
      classId: "door",
      position: {
        strategy: "exact",
        row: GUILD_SPAWN_ROW,
        col: GUILD_SPAWN_COL,
      },
      state: {
        open: true,
        fixture: "guild_return",
        destination: { mode: "source_world" },
      },
      reservations: [],
    },
  ];
}

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
    placements: birdhavenPlacements(),
    placementRevision: SYSTEM_PLACEMENT_REVISION,
    ownerIds: [],
    labels: { fi: "Lintukoto" },
  };
}

// The guild interior. Also written by ensureAdventurersGuildWorld() in
// item-storage.ts on the legacy path; both call this factory so the two can
// never disagree and wipe each other's placements.
export function adventurersGuildWorldClassRecord(): WorldClassRecord {
  return {
    id: GUILD_WORLD_CLASS_ID,
    baseType: WORLD_TYPE_BUILDING,
    rows: GUILD_WORLD_ROWS,
    cols: GUILD_WORLD_COLS,
    labelKey: "world_class." + GUILD_WORLD_CLASS_ID + ".name",
    fallbackLabel: "Adventurers' guild",
    // Deliberately empty: the room's contents are authored placements, not
    // ambient population.
    itemSpawns: [],
    npcSpawns: [],
    placements: adventurersGuildPlacements(),
    placementRevision: SYSTEM_PLACEMENT_REVISION,
    ownerIds: [],
    labels: { fi: "Seikkailijoiden kilta" },
  };
}

// System world classes that aren't generation presets (not in WORLD_TYPES) but
// are still seeded/backfilled like built-ins so they show in the world-type
// editor. Birdhaven is the start village's own class (village terrain + spawns,
// pinned to the oak world's 30x30 size); the guild is its linked interior.
function systemWorldClassRecords(): WorldClassRecord[] {
  return [birdhavenWorldClassRecord(), adventurersGuildWorldClassRecord()];
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
  placements?: unknown;
  placementRevision?: unknown;
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
    placements: normalizeWorldClassPlacements(record.placements),
    placementRevision: normalizePlacementRevision(record.placementRevision),
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
    placements: (function () {
      try {
        return JSON.parse(row.placements_json || "[]");
      } catch (e) {
        return [];
      }
    })(),
    placementRevision: row.placement_revision,
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
  placements_json: string;
  placement_revision: number;
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
    placements_json: JSON.stringify(record.placements || []),
    // Never null: the engine's DB rejects a null write into an INTEGER column.
    placement_revision: normalizePlacementRevision(record.placementRevision),
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
    // Placements are replaced wholesale rather than merged: the seeded set is
    // the authored definition of a system world, and a half-merged landmark is
    // worse than either version. Guarded by the revision so a creator's later
    // edits through the class APIs are not overwritten on every load — only a
    // deliberate code-side bump reclaims the row.
    if (existing.placementRevision < desired.placementRevision) {
      existing.placements = desired.placements;
      existing.placementRevision = desired.placementRevision;
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

// Strict write-path validation. Wraps validateWorldClassPlacements (shape,
// class/tile references, reservation rules) and adds the one check that module
// cannot make without importing this one: that an ensure_world_class
// destination names a world class that actually exists.
//
// Takes the raw request payload rather than a normalized record, because
// normalization silently drops malformed placements — validating after it
// would report success on input the creator never got told was discarded.
export function validateWorldClassPlacementsForWrite(
  rawPlacements: unknown,
  dims: { rows: number; cols: number },
): string[] {
  const errors = validateWorldClassPlacements(rawPlacements, dims);
  if (!Array.isArray(rawPlacements)) return errors;
  for (let i = 0; i < rawPlacements.length; i++) {
    const placement = rawPlacements[i];
    if (!placement || typeof placement !== "object") continue;
    const state = (placement as Record<string, unknown>).state;
    if (!state || typeof state !== "object") continue;
    const destination = (state as Record<string, unknown>).destination;
    if (!destination || typeof destination !== "object") continue;
    const destinationRecord = destination as Record<string, unknown>;
    if (String(destinationRecord.mode || "") !== "ensure_world_class") continue;
    const worldClassId = String(destinationRecord.worldClassId || "");
    if (!worldClassId) continue;
    if (!getWorldClass(worldClassId)) {
      errors.push(
        "placements[" +
          i +
          ']: destination.worldClassId "' +
          worldClassId +
          '" is not an existing world class',
      );
    }
  }
  return errors;
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
