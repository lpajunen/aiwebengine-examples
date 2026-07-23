import { VWORLD_LIVING_CLASS_TABLE } from "./runtime-config.ts";
import { vwLog } from "./diagnostics.ts";
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

function bipedSlotDefinitions(): LivingClassRecord["slotDefinitions"] {
  return [
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
    {
      id: "left_leg",
      labelKey: "living.slot.left_leg",
      fallbackLabel: "Left leg",
      tags: ["leg"],
    },
    {
      id: "right_leg",
      labelKey: "living.slot.right_leg",
      fallbackLabel: "Right leg",
      tags: ["leg"],
    },
  ];
}

function quadrupedSlotDefinitions(): LivingClassRecord["slotDefinitions"] {
  return [
    {
      id: "front_left_leg",
      labelKey: "living.slot.front_left_leg",
      fallbackLabel: "Front left leg",
      tags: ["leg"],
    },
    {
      id: "front_right_leg",
      labelKey: "living.slot.front_right_leg",
      fallbackLabel: "Front right leg",
      tags: ["leg"],
    },
    {
      id: "back_left_leg",
      labelKey: "living.slot.back_left_leg",
      fallbackLabel: "Back left leg",
      tags: ["leg"],
    },
    {
      id: "back_right_leg",
      labelKey: "living.slot.back_right_leg",
      fallbackLabel: "Back right leg",
      tags: ["leg"],
    },
  ];
}

function defaultFatigueValueTemplate(): Record<string, unknown> {
  return { fatigue: 0 };
}

// Combat stats (maxHitPoints/currentHitPoints/armorClass/weaponClass) are not
// listed here — every living gets them regardless of class via the shared
// defaulting in normalizeLivingValues (world-domain.ts). This schema only
// adds display metadata (labels, meter ranges) for the built-in classes.
function defaultFatigueValueSchema(): LivingValueSchema {
  return {
    fatigue: {
      kind: "number",
      min: 0,
      max: 100,
      labelKey: "living.value.fatigue",
      fallbackLabel: "Fatigue",
    },
    maxHitPoints: {
      kind: "number",
      labelKey: "living.value.max_hit_points",
      fallbackLabel: "Max hit points",
    },
    currentHitPoints: {
      kind: "number",
      min: 0,
      max: 10,
      labelKey: "living.value.current_hit_points",
      fallbackLabel: "Hit points",
    },
    armorClass: {
      kind: "number",
      labelKey: "living.value.armor_class",
      fallbackLabel: "Armor class",
    },
    weaponClass: {
      kind: "number",
      labelKey: "living.value.weapon_class",
      fallbackLabel: "Weapon class",
    },
  };
}

const DEFAULT_LIVING_CLASSES: Record<string, LivingClassRecord> = {
  player_human: {
    id: "player_human",
    kind: "player",
    labelKey: "living.class.player_human",
    fallbackLabel: "Human",
    slotDefinitions: bipedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
  },
  player_elf: {
    id: "player_elf",
    kind: "player",
    labelKey: "living.class.player_elf",
    fallbackLabel: "Elf",
    slotDefinitions: bipedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
  },
  player_hobbit: {
    id: "player_hobbit",
    kind: "player",
    labelKey: "living.class.player_hobbit",
    fallbackLabel: "Hobbit",
    slotDefinitions: bipedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
  },
  npc_human: {
    id: "npc_human",
    kind: "npc",
    labelKey: "living.class.npc_human",
    fallbackLabel: "Human",
    slotDefinitions: bipedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
  },
  npc_wolf: {
    id: "npc_wolf",
    kind: "npc",
    labelKey: "living.class.npc_wolf",
    fallbackLabel: "Wolf",
    slotDefinitions: quadrupedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
  },
  npc_bear: {
    id: "npc_bear",
    kind: "npc",
    labelKey: "living.class.npc_bear",
    fallbackLabel: "Bear",
    slotDefinitions: quadrupedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
  },
};

const NPC_SPECIES_POOL = ["npc_human", "npc_wolf", "npc_bear"];

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
        labelKey: typeof def.labelKey === "string" ? def.labelKey : undefined,
        fallbackLabel:
          typeof def.fallbackLabel === "string" ? def.fallbackLabel : undefined,
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
    labelKey: typeof row.label_key === "string" ? row.label_key : "",
    fallbackLabel:
      typeof row.fallback_label === "string" ? row.fallback_label : "",
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
  label_key: string;
  fallback_label: string;
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
    label_key: record.labelKey || "",
    fallback_label: record.fallbackLabel || "",
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
    labelKey: cls.labelKey,
    fallbackLabel: cls.fallbackLabel,
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

export function bootstrapLivingClasses(): void {
  const rows = loadAllLivingClassRows();
  const cache: Record<string, LivingClassRecord> = {};
  const now = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const record = livingClassFromDbRow(rows[i]);
    if (record.id) cache[record.id] = record;
  }

  // The two reserved built-in IDs are always resynced to the current code
  // definition (rather than only backfilled when missing) so that schema
  // additions here (e.g. new labelKey/fallbackLabel fields) reach rows that
  // were already seeded by an older deploy. Custom classes are untouched.
  const ids = Object.keys(DEFAULT_LIVING_CLASSES);
  let seeded = 0;
  let resynced = 0;
  for (let i = 0; i < ids.length; i++) {
    const classId = ids[i];
    const cls = getBuiltInLivingClass(classId);
    if (!cls) continue;
    const existed = !!cache[classId];
    upsertLivingClassRow(livingClassToDbRow(cls, now));
    cache[classId] = cls;
    if (existed) {
      resynced++;
    } else {
      seeded++;
    }
  }

  if (rows.length === 0) {
    vwLog("living class repository seeded", { count: seeded });
  } else if (seeded > 0 || resynced > 0) {
    vwLog("living class repository backfilled", {
      inserted_count: seeded,
      resynced_count: resynced,
    });
  }

  _livingClassCache = cache;
}

export function refreshLivingClassCache(): void {
  bootstrapLivingClasses();
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

export function upsertLivingClass(record: LivingClassRecord): {
  ok: boolean;
  error?: string;
} {
  const writeResult = upsertLivingClassRow(
    livingClassToDbRow(record, Date.now()),
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

export function deleteLivingClass(classId: string): void {
  deleteLivingClassRow(classId);
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

export function pickRandomNPCLivingClassId(): string {
  const index = Math.floor(Math.random() * NPC_SPECIES_POOL.length);
  return NPC_SPECIES_POOL[index] || getDefaultNPCLivingClassId();
}
