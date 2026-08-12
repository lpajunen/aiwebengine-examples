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
import { normalizeClassLabels } from "./class-labels.ts";
import { normalizeClassSize } from "./class-size.ts";
import {
  normalizeClassColor,
  normalizeLivingVisualStyle,
} from "./class-visual.ts";

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

function bipedLegsOnlySlotDefinitions(): LivingClassRecord["slotDefinitions"] {
  return [
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
    // Shared by all livings; experience/totalExperience only ever carry a
    // value on players (see applyLivingValueDefaults in world-domain.ts), so
    // their schema entries here are simply unused for NPC classes.
    level: {
      kind: "number",
      labelKey: "living.value.level",
      fallbackLabel: "Level",
      visibility: "public",
    },
    experience: {
      kind: "number",
      labelKey: "living.value.experience",
      fallbackLabel: "Experience",
      visibility: "owner",
    },
    totalExperience: {
      kind: "number",
      labelKey: "living.value.total_experience",
      fallbackLabel: "Total experience",
      visibility: "owner",
    },
    fatigue: {
      kind: "number",
      min: 0,
      max: 100,
      labelKey: "living.value.fatigue",
      fallbackLabel: "Fatigue",
      visibility: "public",
    },
    maxHitPoints: {
      kind: "number",
      labelKey: "living.value.max_hit_points",
      fallbackLabel: "Max hit points",
      visibility: "public",
    },
    currentHitPoints: {
      kind: "number",
      min: 0,
      max: 10,
      labelKey: "living.value.current_hit_points",
      fallbackLabel: "Hit points",
      visibility: "public",
    },
    armorClass: {
      kind: "number",
      labelKey: "living.value.armor_class",
      fallbackLabel: "Armor class",
      visibility: "public",
    },
    weaponClass: {
      kind: "number",
      labelKey: "living.value.weapon_class",
      fallbackLabel: "Weapon class",
      visibility: "public",
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
    deathClassId: "player_ghost",
    isDefault: true,
  },
  player_elf: {
    id: "player_elf",
    kind: "player",
    labelKey: "living.class.player_elf",
    fallbackLabel: "Elf",
    slotDefinitions: bipedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
    deathClassId: "player_ghost",
  },
  player_hobbit: {
    id: "player_hobbit",
    kind: "player",
    labelKey: "living.class.player_hobbit",
    fallbackLabel: "Hobbit",
    slotDefinitions: bipedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
    deathClassId: "player_ghost",
  },
  // The player-side counterpart to npc_giant: an ordinary human avatar at
  // double scale. Nothing assigns it automatically (new players start as
  // player_human); it exists so a creator can hand out a large body.
  player_giant: {
    id: "player_giant",
    kind: "player",
    labelKey: "living.class.player_giant",
    fallbackLabel: "Giant",
    slotDefinitions: bipedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
    size: "large",
    deathClassId: "player_ghost",
  },
  player_ghost: {
    id: "player_ghost",
    kind: "player",
    labelKey: "living.class.player_ghost",
    fallbackLabel: "Ghost",
    slotDefinitions: bipedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
    reviveClassId: "player_human",
    combatant: false,
  },
  npc_human: {
    id: "npc_human",
    kind: "npc",
    labelKey: "living.class.npc_human",
    fallbackLabel: "Human",
    slotDefinitions: bipedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
    corpseItemId: "npc_corpse",
    isDefault: true,
  },
  // A hostile biped that spawns wielding a shortbow (auto-equipped from
  // defaultItems) and opens fire on players within its bow range — the
  // ranged-NPC counterpart to the melee wolf/bear.
  npc_archer: {
    id: "npc_archer",
    kind: "npc",
    labelKey: "living.class.npc_archer",
    fallbackLabel: "Archer",
    slotDefinitions: bipedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
    aggressive: true,
    defaultItems: ["shortbow"],
    corpseItemId: "npc_corpse",
  },
  // Same humanoid mesh as npc_human, rendered at double scale by its "large"
  // size — the built-in demonstration that size is a class-level visual knob
  // rather than a per-species mesh. Peaceful by design: it only fights back,
  // so dropping giants into the wild preset changes the skyline, not the
  // difficulty.
  npc_giant: {
    id: "npc_giant",
    kind: "npc",
    labelKey: "living.class.npc_giant",
    fallbackLabel: "Giant",
    slotDefinitions: bipedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
    size: "large",
    corpseItemId: "npc_corpse",
    behavior: { idleChance: 0.5 },
  },
  npc_wolf: {
    id: "npc_wolf",
    kind: "npc",
    labelKey: "living.class.npc_wolf",
    fallbackLabel: "Wolf",
    slotDefinitions: quadrupedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
    aggressive: true,
    visualStyle: "wolfish",
    corpseItemId: "npc_corpse",
    behavior: { idleChance: 0.2 },
  },
  npc_bear: {
    id: "npc_bear",
    kind: "npc",
    labelKey: "living.class.npc_bear",
    fallbackLabel: "Bear",
    slotDefinitions: quadrupedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
    aggressive: true,
    visualStyle: "bearish",
    corpseItemId: "npc_corpse",
    behavior: { idleChance: 0.2 },
  },
  npc_dog: {
    id: "npc_dog",
    kind: "npc",
    labelKey: "living.class.npc_dog",
    fallbackLabel: "Dog",
    slotDefinitions: quadrupedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
    visualStyle: "doggish",
    corpseItemId: "npc_corpse",
    behavior: { idleChance: 0.2 },
  },
  // Horse and donkey are the same equine recipe: the donkey just pins a grey
  // coat where the horse leaves the color automatic (bay/chestnut browns
  // hashed per animal). No client work went into the second one — that is the
  // point of visualStyle, see class-visual.ts.
  npc_horse: {
    id: "npc_horse",
    kind: "npc",
    labelKey: "living.class.npc_horse",
    fallbackLabel: "Horse",
    slotDefinitions: quadrupedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
    visualStyle: "equine",
    corpseItemId: "npc_corpse",
    behavior: { idleChance: 0.45 },
  },
  npc_donkey: {
    id: "npc_donkey",
    kind: "npc",
    labelKey: "living.class.npc_donkey",
    fallbackLabel: "Donkey",
    slotDefinitions: quadrupedSlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
    visualStyle: "equine",
    color: "#8f867c",
    corpseItemId: "npc_corpse",
    behavior: { idleChance: 0.5 },
  },
  npc_chicken: {
    id: "npc_chicken",
    kind: "npc",
    labelKey: "living.class.npc_chicken",
    fallbackLabel: "Chicken",
    slotDefinitions: bipedLegsOnlySlotDefinitions(),
    valueTemplate: defaultFatigueValueTemplate(),
    valueSchema: defaultFatigueValueSchema(),
    visualStyle: "birdlike",
    corpseItemId: "npc_corpse",
    behavior: { idleChance: 0.15 },
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
        labelKey: typeof def.labelKey === "string" ? def.labelKey : undefined,
        fallbackLabel:
          typeof def.fallbackLabel === "string" ? def.fallbackLabel : undefined,
        visibility:
          def.visibility === "public" || def.visibility === "owner"
            ? def.visibility
            : undefined,
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
    aggressive: row.aggressive === 1 || row.aggressive === true,
    defaultItems: (function () {
      try {
        const parsed = JSON.parse(row.default_items_json || "[]");
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch (e) {
        return [];
      }
    })(),
    ownerIds: (function () {
      try {
        const parsed = JSON.parse(row.owner_ids_json || "[]");
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch (e) {
        return [];
      }
    })(),
    labels: normalizeClassLabels(row.labels_json),
    size: normalizeClassSize(row.size),
    visualStyle: normalizeLivingVisualStyle(row.visual_style),
    color: normalizeClassColor(row.color),
    deathClassId:
      typeof row.death_class_id === "string" ? row.death_class_id : "",
    corpseItemId:
      typeof row.corpse_item_id === "string" ? row.corpse_item_id : "",
    reviveClassId:
      typeof row.revive_class_id === "string" ? row.revive_class_id : "",
    // Absent (a row seeded before this column existed) reads as a combatant,
    // matching the "missing == true" default on LivingClassRecord.
    combatant: row.combatant !== 0 && row.combatant !== false,
    isDefault: row.is_default === 1 || row.is_default === true,
    behavior: (function () {
      try {
        const parsed = JSON.parse(row.behavior_json || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (e) {
        return {};
      }
    })(),
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
  aggressive: number;
  default_items_json: string;
  owner_ids_json: string;
  labels_json: string;
  size: string;
  visual_style: string;
  color: string;
  death_class_id: string;
  corpse_item_id: string;
  revive_class_id: string;
  combatant: number;
  is_default: number;
  behavior_json: string;
  created_at: number;
  updated_at: number;
} {
  const storedTs = Math.floor(now / 1000);
  return {
    class_id: record.id,
    kind: record.kind,
    size: normalizeClassSize(record.size),
    visual_style: normalizeLivingVisualStyle(record.visualStyle),
    color: normalizeClassColor(record.color),
    label_key: record.labelKey || "",
    fallback_label: record.fallbackLabel || "",
    slot_definitions_json: JSON.stringify(record.slotDefinitions || []),
    value_template_json: JSON.stringify(record.valueTemplate || {}),
    value_schema_json: JSON.stringify(record.valueSchema || {}),
    aggressive: record.aggressive ? 1 : 0,
    death_class_id: String(record.deathClassId || ""),
    corpse_item_id: String(record.corpseItemId || ""),
    revive_class_id: String(record.reviveClassId || ""),
    combatant: record.combatant === false ? 0 : 1,
    is_default: record.isDefault ? 1 : 0,
    behavior_json: JSON.stringify(record.behavior || {}),
    default_items_json: JSON.stringify(record.defaultItems || []),
    owner_ids_json: JSON.stringify(record.ownerIds || []),
    labels_json: JSON.stringify(normalizeClassLabels(record.labels)),
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
    aggressive: !!cls.aggressive,
    defaultItems: Array.isArray(cls.defaultItems)
      ? cls.defaultItems.slice()
      : [],
    ownerIds: [],
    size: normalizeClassSize(cls.size),
    visualStyle: normalizeLivingVisualStyle(cls.visualStyle),
    color: normalizeClassColor(cls.color),
    deathClassId: String(cls.deathClassId || ""),
    corpseItemId: String(cls.corpseItemId || ""),
    reviveClassId: String(cls.reviveClassId || ""),
    combatant: cls.combatant !== false,
    isDefault: !!cls.isDefault,
    behavior: Object.assign({}, cls.behavior || {}),
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

  // A built-in whose row nobody owns is resynced to the current code
  // definition rather than merely backfilled when missing, so schema
  // additions here (a new labelKey, the behavior block) reach rows seeded by
  // an older deploy. A row someone has taken ownership of is left alone —
  // the same rule the item and action repositories use, and the reason an
  // admin can retune a built-in and have it survive the next deploy.
  //
  // Without the ownership check this loop rewrote all fourteen built-ins on
  // every cache refresh, which meant an edit through the class editor or the
  // MCP tool was reverted before it could ever take effect: the repository
  // looked writable and silently was not.
  const ids = Object.keys(DEFAULT_LIVING_CLASSES);
  let seeded = 0;
  let resynced = 0;
  for (let i = 0; i < ids.length; i++) {
    const classId = ids[i];
    const cls = getBuiltInLivingClass(classId);
    if (!cls) continue;
    const existing = cache[classId];
    const isOwned =
      !!existing &&
      Array.isArray(existing.ownerIds) &&
      existing.ownerIds.length > 0;
    if (isOwned) continue;
    upsertLivingClassRow(livingClassToDbRow(cls, now));
    cache[classId] = cls;
    if (existing) {
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
  _defaultClassByKind = {};
}

export function refreshLivingClassCache(): void {
  bootstrapLivingClasses();
}

/**
 * Re-reads the rows into the cache without the bootstrap's seeding pass, so it
 * is safe to run periodically — see class-cache.ts. Built-ins missing a row
 * are not re-added here; getLivingClass falls back to the code definition.
 */
export function reloadLivingClassCache(): void {
  const rows = loadAllLivingClassRows();
  const cache: Record<string, LivingClassRecord> = {};
  for (let i = 0; i < rows.length; i++) {
    const record = livingClassFromDbRow(rows[i]);
    if (record.id) cache[record.id] = record;
  }
  _livingClassCache = cache;
}

// A null cache means this instance never got through bootstrapLivingClasses()
// — init() can time out on a slow schema migration — so build it on demand
// rather than reporting "no living classes". Without this the page bootstrap
// shipped an empty LIVING_REGISTRY to the client, which silently disabled
// every class-driven visual (sizes, slot labels).
// Mirrors getAllItemClasses()/getAllActionClasses() in item-registry.ts.
export function getAllLivingClasses(): LivingClassRecord[] {
  if (!_livingClassCache) refreshLivingClassCache();
  if (!_livingClassCache) return [];
  return Object.keys(_livingClassCache).map(function (classId) {
    return (_livingClassCache as Record<string, LivingClassRecord>)[classId];
  });
}

export function getLivingClass(classId: string): LivingClassRecord | null {
  const lookupId = String(classId || "");
  if (!_livingClassCache) refreshLivingClassCache();
  if (_livingClassCache && _livingClassCache[lookupId]) {
    return _livingClassCache[lookupId];
  }
  return getBuiltInLivingClass(lookupId);
}

// See getItemClassWithRefresh() in item-registry.ts — same cache-miss-
// tolerant retry, for custom (non-built-in) classes another instance may
// have created after this instance's cache was built.
export function getLivingClassWithRefresh(
  classId: string,
): LivingClassRecord | null {
  const cls = getLivingClass(classId);
  if (cls) return cls;
  refreshLivingClassCache();
  return getLivingClass(classId);
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

// Memoized per kind: these are asked on every inventory load and every NPC
// seed, so they must not rescan the class table each time. Cleared with the
// cache, which is what a class edit rebuilds.
let _defaultClassByKind: Record<string, string> = {};

function resolveDefaultLivingClassId(kind: string, fallback: string): string {
  const cached = _defaultClassByKind[kind];
  if (cached) return cached;
  const classes = getAllLivingClasses();
  for (let i = 0; i < classes.length; i++) {
    if (classes[i].kind === kind && classes[i].isDefault) {
      _defaultClassByKind[kind] = classes[i].id;
      return classes[i].id;
    }
  }
  // No class claims the kind — keep the built-in body rather than leaving a
  // player or NPC with no class at all.
  _defaultClassByKind[kind] = fallback;
  return fallback;
}

export function getDefaultPlayerLivingClassId(): string {
  return resolveDefaultLivingClassId("player", "player_human");
}

export function getDefaultNPCLivingClassId(): string {
  return resolveDefaultLivingClassId("npc", "npc_human");
}

// Whether a living of this class may fight or be fought. Unknown classes are
// treated as combatants so a missing/legacy class never makes a living
// silently invulnerable. See LivingClassRecord.combatant.
export function isCombatantClass(classId: unknown): boolean {
  const cls = getLivingClass(String(classId || ""));
  return !cls || cls.combatant !== false;
}
