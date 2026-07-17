import {
  LivingClassRecord,
  LivingKind,
  LivingValueSchema,
} from "./world-domain.ts";
import {
  deleteLivingClassRow,
  loadAllLivingClassRows,
  upsertLivingClassRow,
} from "./living-class-storage.ts";

type WorldDbLogFn = (msg: string, obj?: unknown) => void;

const DEFAULT_LIVING_CLASSES: Record<string, LivingClassRecord> = {
  player_human: {
    id: "player_human",
    kind: "player",
    slotDefinitions: [
      {
        id: "left_hand",
        labelKey: "living.slot.left_hand",
        fallbackLabel: "Left hand",
        tags: ["hand", "manipulator"],
      },
      {
        id: "right_hand",
        labelKey: "living.slot.right_hand",
        fallbackLabel: "Right hand",
        tags: ["hand", "manipulator"],
      },
    ],
    valueTemplate: {
      fatigue: 0,
    },
    valueSchema: {
      fatigue: {
        kind: "number",
        min: 0,
        max: 100,
        labelKey: "living.value.fatigue",
        fallbackLabel: "Fatigue",
      },
    },
  },
  npc_human: {
    id: "npc_human",
    kind: "npc",
    slotDefinitions: [
      {
        id: "left_hand",
        labelKey: "living.slot.left_hand",
        fallbackLabel: "Left hand",
        tags: ["hand", "manipulator"],
      },
      {
        id: "right_hand",
        labelKey: "living.slot.right_hand",
        fallbackLabel: "Right hand",
        tags: ["hand", "manipulator"],
      },
    ],
    valueTemplate: {
      fatigue: 0,
    },
    valueSchema: {
      fatigue: {
        kind: "number",
        min: 0,
        max: 100,
        labelKey: "living.value.fatigue",
        fallbackLabel: "Fatigue",
      },
    },
  },
};

let _livingClassCache: Record<string, LivingClassRecord> | null = null;

function parseSlotDefinitions(
  raw: string,
): LivingClassRecord["slotDefinitions"] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(function (slot) {
        return (
          slot &&
          typeof slot.id === "string" &&
          typeof slot.labelKey === "string" &&
          typeof slot.fallbackLabel === "string"
        );
      })
      .map(function (slot) {
        return {
          id: String(slot.id),
          labelKey: String(slot.labelKey),
          fallbackLabel: String(slot.fallbackLabel),
          accepts: Array.isArray(slot.accepts)
            ? slot.accepts.map(function (entry: unknown) {
                return String(entry);
              })
            : undefined,
          tags: Array.isArray(slot.tags)
            ? slot.tags.map(function (entry: unknown) {
                return String(entry);
              })
            : undefined,
        };
      });
  } catch (e) {
    return [];
  }
}

function parseValueTemplate(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (e) {
    return {};
  }
}

function parseValueSchema(raw: string): LivingValueSchema {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object") return {};
    const schema: LivingValueSchema = {};
    Object.keys(parsed as Record<string, unknown>).forEach(function (key) {
      const def = (parsed as Record<string, any>)[key];
      if (!def || typeof def !== "object") return;
      const kind = String(def.kind || "");
      if (kind !== "number" && kind !== "string" && kind !== "boolean") {
        return;
      }
      schema[key] = {
        kind: kind,
        min: Number.isFinite(Number(def.min)) ? Number(def.min) : undefined,
        max: Number.isFinite(Number(def.max)) ? Number(def.max) : undefined,
      };
    });
    return schema;
  } catch (e) {
    return {};
  }
}

function livingClassFromDbRow(row: any): LivingClassRecord {
  const kind = String(row.kind || "player") as LivingKind;
  return {
    id: String(row.class_id || ""),
    kind:
      kind === "player" || kind === "npc" || kind === "creature"
        ? kind
        : "player",
    slotDefinitions: parseSlotDefinitions(
      String(row.slot_definitions_json || "[]"),
    ),
    valueTemplate: parseValueTemplate(String(row.value_template_json || "{}")),
    valueSchema: parseValueSchema(String(row.value_schema_json || "{}")),
  };
}

function livingClassToDbRow(
  record: LivingClassRecord,
  now: number,
): {
  class_id: string;
  kind: string;
  slot_definitions_json: string;
  value_template_json: string;
  value_schema_json: string;
  created_at: number;
  updated_at: number;
} {
  const storedTs = Math.floor(now / 1000);
  return {
    class_id: record.id,
    kind: record.kind,
    slot_definitions_json: JSON.stringify(record.slotDefinitions || []),
    value_template_json: JSON.stringify(record.valueTemplate || {}),
    value_schema_json: JSON.stringify(record.valueSchema || {}),
    created_at: storedTs,
    updated_at: storedTs,
  };
}

function getBuiltInLivingClass(classId: string): LivingClassRecord | null {
  const cls = DEFAULT_LIVING_CLASSES[String(classId || "")];
  if (!cls) return null;
  return {
    id: cls.id,
    kind: cls.kind,
    slotDefinitions: cls.slotDefinitions.map(function (slot) {
      return {
        id: slot.id,
        labelKey: slot.labelKey,
        fallbackLabel: slot.fallbackLabel,
        accepts: Array.isArray(slot.accepts) ? slot.accepts.slice() : undefined,
        tags: Array.isArray(slot.tags) ? slot.tags.slice() : undefined,
      };
    }),
    valueTemplate: Object.assign({}, cls.valueTemplate || {}),
    valueSchema: cls.valueSchema ? Object.assign({}, cls.valueSchema) : {},
  };
}

export function bootstrapLivingClasses(
  livingClassTable: string,
  log: WorldDbLogFn,
): void {
  const rows = loadAllLivingClassRows(livingClassTable, log);
  const cache: Record<string, LivingClassRecord> = {};
  const now = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const record = livingClassFromDbRow(rows[i]);
    if (record.id) cache[record.id] = record;
  }

  const ids = Object.keys(DEFAULT_LIVING_CLASSES);
  let seeded = 0;
  for (let i = 0; i < ids.length; i++) {
    const classId = ids[i];
    if (cache[classId]) continue;
    const cls = getBuiltInLivingClass(classId);
    if (!cls) continue;
    upsertLivingClassRow(livingClassToDbRow(cls, now), livingClassTable, log);
    cache[classId] = cls;
    seeded++;
  }

  if (rows.length === 0) {
    log("living class repository seeded", { count: seeded });
  } else if (seeded > 0) {
    log("living class repository backfilled", { inserted_count: seeded });
  }

  _livingClassCache = cache;
}

export function refreshLivingClassCache(
  livingClassTable: string,
  log: WorldDbLogFn,
): void {
  bootstrapLivingClasses(livingClassTable, log);
}

export function getAllLivingClasses(): LivingClassRecord[] {
  if (!_livingClassCache) return [];
  return Object.keys(_livingClassCache).map(function (classId) {
    return (_livingClassCache as Record<string, LivingClassRecord>)[classId];
  });
}

export function getLivingClass(classId: string): LivingClassRecord | null {
  const lookupId = String(classId || "");
  if (_livingClassCache && _livingClassCache[lookupId]) {
    return _livingClassCache[lookupId];
  }
  return getBuiltInLivingClass(lookupId);
}

export function upsertLivingClass(
  record: LivingClassRecord,
  livingClassTable: string,
  log: WorldDbLogFn,
): { ok: boolean; error?: string } {
  const writeResult = upsertLivingClassRow(
    livingClassToDbRow(record, Date.now()),
    livingClassTable,
    log,
  );
  const ok = !!writeResult && !writeResult.error;
  if (ok && _livingClassCache) _livingClassCache[record.id] = record;
  return ok
    ? { ok: true }
    : {
        ok: false,
        error: String(
          writeResult && writeResult.error ? writeResult.error : "unknown",
        ),
      };
}

export function deleteLivingClass(
  classId: string,
  livingClassTable: string,
  log: WorldDbLogFn,
): void {
  deleteLivingClassRow(classId, livingClassTable, log);
  if (_livingClassCache) {
    delete _livingClassCache[String(classId || "")];
  }
}

export function getDefaultPlayerLivingClassId(): string {
  return "player_human";
}

export function getDefaultNPCLivingClassId(): string {
  return "npc_human";
}
