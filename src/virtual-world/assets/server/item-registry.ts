import {
  MAX_CONTAINER_ITEMS,
  VWORLD_ACTION_CLASS_TABLE,
  VWORLD_ITEM_CLASS_TABLE,
} from "./runtime-config.ts";
import { vwLog } from "./diagnostics.ts";
import { ITEM_CHANGE_DEFINITIONS } from "./item-events.ts";
import { ACTION_DEFINITIONS } from "./action-registry.ts";
import { ActionDefinition } from "./action-registry.ts";
import {
  loadAllItemClassRows,
  upsertItemClassRow,
  deleteItemClassRow,
} from "./item-class-storage.ts";
import {
  loadAllActionClassRows,
  upsertActionClassRow,
  deleteActionClassRow,
} from "./action-class-storage.ts";

type BootstrapItemChangeDeltaKind = "add" | "remove" | "snapshot";

export type ItemKind =
  "tool" | "artifact" | "world_item" | "placeable" | "consumable" | "container";

export interface ItemDefinition {
  id: string;
  kind: ItemKind;
  nonDroppable?: boolean;
  nonPickable?: boolean;
  visuals: {
    color: number;
    labelKey: string;
    fallbackLabel: string;
  };
  actionIds: string[];
}

export interface ItemClassRecord {
  id: string;
  kind: string;
  nonDroppable: boolean;
  nonPickable: boolean;
  visuals: {
    color: number;
    labelKey: string;
    fallbackLabel: string;
  };
  actionIds: string[];
  stateTemplate: Record<string, unknown>;
  ownerIds: string[];
}

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  saw: {
    id: "saw",
    kind: "tool",
    visuals: {
      color: 0xbfc6d0,
      labelKey: "item.saw.name",
      fallbackLabel: "Woodsman's saw",
    },
    actionIds: ["cut"],
  },
  knife: {
    id: "knife",
    kind: "tool",
    visuals: {
      color: 0xd8dee8,
      labelKey: "item.knife.name",
      fallbackLabel: "Puukko knife",
    },
    actionIds: [],
  },
  flower: {
    id: "flower",
    kind: "world_item",
    visuals: {
      color: 0xec6ea4,
      labelKey: "item.flower.name",
      fallbackLabel: "Forest flower",
    },
    actionIds: [],
  },
  tree_planter: {
    id: "tree_planter",
    kind: "tool",
    visuals: {
      color: 0x54d08a,
      labelKey: "item.tree_planter.name",
      fallbackLabel: "Pine sapling",
    },
    actionIds: ["plant", "grow_pine_tree"],
  },
  portal_builder: {
    id: "portal_builder",
    kind: "artifact",
    visuals: {
      color: 0xff9f1c,
      labelKey: "item.portal_builder.name",
      fallbackLabel: "Rune gate charm",
    },
    actionIds: ["build_portal", "remove_portal"],
  },
  kantele: {
    id: "kantele",
    kind: "tool",
    visuals: {
      color: 0xc58d52,
      labelKey: "item.kantele.name",
      fallbackLabel: "Kantele",
    },
    actionIds: ["tune", "play_tune"],
  },
  rowan_charm: {
    id: "rowan_charm",
    kind: "artifact",
    visuals: {
      color: 0xc73a32,
      labelKey: "item.rowan_charm.name",
      fallbackLabel: "Rowan charm",
    },
    actionIds: ["place_blessing"],
  },
  rune_stone: {
    id: "rune_stone",
    kind: "artifact",
    visuals: {
      color: 0x7b7f8a,
      labelKey: "item.rune_stone.name",
      fallbackLabel: "Rune stone",
    },
    actionIds: [],
  },
  juniper_bundle: {
    id: "juniper_bundle",
    kind: "artifact",
    visuals: {
      color: 0x51764f,
      labelKey: "item.juniper_bundle.name",
      fallbackLabel: "Juniper bundle",
    },
    actionIds: [],
  },
  birch_bark_letter: {
    id: "birch_bark_letter",
    kind: "artifact",
    visuals: {
      color: 0xe4d2a0,
      labelKey: "item.birch_bark_letter.name",
      fallbackLabel: "Birch-bark letter",
    },
    actionIds: [],
  },
  hammer: {
    id: "hammer",
    kind: "tool",
    visuals: {
      color: 0x8f7f6d,
      labelKey: "item.hammer.name",
      fallbackLabel: "Hammer",
    },
    actionIds: ["build_house", "destroy_house"],
  },
  portal: {
    id: "portal",
    kind: "placeable",
    nonPickable: true,
    visuals: {
      color: 0x5ad7ff,
      labelKey: "item.portal.name",
      fallbackLabel: "Rune gate",
    },
    actionIds: ["portal_travel"],
  },
  starter_kit: {
    id: "starter_kit",
    kind: "artifact",
    nonDroppable: true,
    visuals: {
      color: 0xf3ca40,
      labelKey: "item.starter_kit.name",
      fallbackLabel: "Wanderer's bundle",
    },
    actionIds: [
      "return_home",
      "examine",
      "break",
      "fix",
      "bury",
      "poke",
      "follow",
      "stop_follow",
      "fight",
      "stop_fight",
      "summon_knife",
      "craft_kantele",
    ],
  },
  blessing_marker: {
    id: "blessing_marker",
    kind: "placeable",
    nonDroppable: true,
    nonPickable: true,
    visuals: {
      color: 0xb54434,
      labelKey: "item.blessing_marker.name",
      fallbackLabel: "Rowan blessing",
    },
    actionIds: [],
  },
  creator_stone: {
    id: "creator_stone",
    kind: "artifact",
    visuals: {
      color: 0x9b5cff,
      labelKey: "item.creator_stone.name",
      fallbackLabel: "Creator's stone",
    },
    actionIds: [],
  },
  old_oak: {
    id: "old_oak",
    kind: "placeable",
    nonDroppable: true,
    nonPickable: true,
    visuals: {
      color: 0x4a3222,
      labelKey: "item.old_oak.name",
      fallbackLabel: "Old oak",
    },
    actionIds: ["pray"],
  },
  npc_corpse: {
    id: "npc_corpse",
    kind: "placeable",
    nonDroppable: true,
    nonPickable: true,
    visuals: {
      color: 0x5c5248,
      labelKey: "item.npc_corpse.name",
      fallbackLabel: "Corpse",
    },
    actionIds: [],
  },
  chest: {
    id: "chest",
    kind: "container",
    visuals: {
      color: 0x8a5a2b,
      labelKey: "item.chest.name",
      fallbackLabel: "Wooden chest",
    },
    actionIds: [],
  },
};

export function getItemDefinition(itemId: string): ItemDefinition | null {
  return ITEM_DEFINITIONS[String(itemId || "")] || null;
}

export function getActionDefinition(actionId: string | null | undefined) {
  return getActionClass(String(actionId || ""));
}

export function getAllActionIds(): string[] {
  if (!_actionClassCache) refreshActionClassCache();
  return Object.keys(_actionClassCache as Record<string, ActionClassRecord>);
}

export function getActionsForItemType(itemId: string): string[] {
  if (_itemClassCache) {
    const cls = _itemClassCache[String(itemId || "")];
    if (cls && Array.isArray(cls.actionIds)) return cls.actionIds.slice();
    // item not in cache (e.g. no class defined) → no actions
    return [];
  }
  const item = getItemDefinition(itemId);
  if (!item || !Array.isArray(item.actionIds)) return [];
  return item.actionIds.slice();
}

export function getPrimaryActionForItemType(itemId: string): string | null {
  const actions = getActionsForItemType(itemId);
  return actions.length > 0 ? actions[0] : null;
}

export function getAllItemTypeIds(): string[] {
  if (_itemClassCache) return Object.keys(_itemClassCache);
  return Object.keys(ITEM_DEFINITIONS);
}

// Item types marked nonPickable are world-anchored singletons/fixtures (the
// old oak, portals, blessing markers, corpses) — they must never end up in a
// living's inventory, so anything that grants items wholesale should skip
// these regardless of how it enumerates item types.
export function getNonPickableItemTypes(): string[] {
  if (_itemClassCache) {
    return Object.keys(_itemClassCache).filter(function (id) {
      return !!(_itemClassCache as Record<string, ItemClassRecord>)[id]
        .nonPickable;
    });
  }
  return Object.keys(ITEM_DEFINITIONS).filter(function (itemId) {
    return !!ITEM_DEFINITIONS[itemId].nonPickable;
  });
}

export function getBootstrapRegistry(): {
  items: Record<
    string,
    {
      label_key: string;
      fallback_label: string;
      color: number;
      action_ids: string[];
      kind: string;
    }
  >;
  actions: Record<
    string,
    {
      label_key: string;
      fallback_label: string;
      canonical_id: string;
      target_kind: string;
      tree_action?: "plant" | "cut";
      house_action?: "build_house" | "destroy_house";
    }
  >;
  item_events: Record<
    string,
    {
      delta_kind: BootstrapItemChangeDeltaKind;
    }
  >;
} {
  const items: Record<
    string,
    {
      label_key: string;
      fallback_label: string;
      color: number;
      action_ids: string[];
      kind: string;
    }
  > = {};
  const actions: Record<
    string,
    {
      label_key: string;
      fallback_label: string;
      canonical_id: string;
      target_kind: string;
      tree_action?: "plant" | "cut";
      house_action?: "build_house" | "destroy_house";
    }
  > = {};
  const itemEvents: Record<
    string,
    {
      delta_kind: BootstrapItemChangeDeltaKind;
    }
  > = {};
  const itemSource = _itemClassCache ? _itemClassCache : null;
  if (itemSource) {
    Object.keys(itemSource).forEach(function (itemId) {
      const cls = itemSource[itemId];
      items[itemId] = {
        label_key: cls.visuals.labelKey,
        fallback_label: cls.visuals.fallbackLabel,
        color: cls.visuals.color,
        action_ids: cls.actionIds.slice(),
        kind: cls.kind,
      };
    });
  } else {
    Object.keys(ITEM_DEFINITIONS).forEach(function (itemId) {
      const item = ITEM_DEFINITIONS[itemId];
      items[itemId] = {
        label_key: item.visuals.labelKey,
        fallback_label: item.visuals.fallbackLabel,
        color: item.visuals.color,
        action_ids: item.actionIds.slice(),
        kind: item.kind,
      };
    });
  }

  const actionSource = _actionClassCache
    ? _actionClassCache
    : ACTION_DEFINITIONS;
  Object.keys(actionSource).forEach(function (actionId) {
    const action = actionSource[actionId];
    const worldMutation = action.execution && action.execution.worldMutation;
    actions[actionId] = {
      label_key: action.labelKey,
      fallback_label: action.fallbackLabel,
      canonical_id: action.canonicalId || action.id,
      target_kind: action.targetKind,
      tree_action: worldMutation ? worldMutation.treeAction : undefined,
      house_action: worldMutation ? worldMutation.houseAction : undefined,
    };
  });

  Object.keys(ITEM_CHANGE_DEFINITIONS).forEach(function (itemChangeId) {
    const itemChange = ITEM_CHANGE_DEFINITIONS[itemChangeId];
    itemEvents[itemChangeId] = {
      delta_kind: itemChange.deltaKind,
    };
  });

  return {
    items: items,
    actions: actions,
    item_events: itemEvents,
  };
}

// ── Item class repository (dynamic, DB-backed) ────────────────────────────────

let _itemClassCache: Record<string, ItemClassRecord> | null = null;

function itemClassFromDefinition(def: ItemDefinition): ItemClassRecord {
  return {
    id: def.id,
    kind: def.kind,
    nonDroppable: !!def.nonDroppable,
    nonPickable: !!def.nonPickable,
    visuals: {
      color: def.visuals.color,
      labelKey: def.visuals.labelKey,
      fallbackLabel: def.visuals.fallbackLabel,
    },
    actionIds: def.actionIds.slice(),
    stateTemplate: DEFAULT_STATE_TEMPLATES[def.id] || {},
    ownerIds: [],
  };
}

// Default stateTemplates for built-in items that use the logic spec
const DEFAULT_STATE_TEMPLATES: Record<string, Record<string, unknown>> = {
  kantele: { tuned: false, playsLeft: 0 },
  chest: { contents: [] },
};

function itemClassFromDbRow(row: any): ItemClassRecord {
  return {
    id: String(row.class_id || ""),
    kind: String(row.kind || "tool") as ItemKind,
    nonDroppable: row.non_droppable === 1 || row.non_droppable === true,
    nonPickable: row.non_pickable === 1 || row.non_pickable === true,
    visuals: {
      color: Number(row.color || 0),
      labelKey: String(row.label_key || ""),
      fallbackLabel: String(row.fallback_label || ""),
    },
    actionIds: (function () {
      try {
        return JSON.parse(row.action_ids_json || "[]");
      } catch (e) {
        return [];
      }
    })(),
    stateTemplate: (function () {
      try {
        return JSON.parse(row.state_template_json || "{}");
      } catch (e) {
        return {};
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
  };
}

function itemClassToDbRow(
  record: ItemClassRecord,
  now: number,
): {
  class_id: string;
  kind: string;
  non_droppable: number;
  non_pickable: number;
  color: number;
  label_key: string;
  fallback_label: string;
  action_ids_json: string;
  state_template_json: string;
  owner_ids_json: string;
  spawnable: number;
  extra: number;
  created_at: number;
  updated_at: number;
} {
  const storedTs = Math.floor(now / 1000);
  return {
    class_id: record.id,
    kind: record.kind,
    // Dead columns from an earlier schema (see item-class-storage.ts) —
    // constant filler so NOT NULL inserts succeed; nothing reads these back.
    spawnable: 1,
    extra: 0,
    non_droppable: record.nonDroppable ? 1 : 0,
    non_pickable: record.nonPickable ? 1 : 0,
    color: record.visuals.color,
    label_key: record.visuals.labelKey,
    fallback_label: record.visuals.fallbackLabel,
    action_ids_json: JSON.stringify(record.actionIds),
    state_template_json: JSON.stringify(record.stateTemplate || {}),
    owner_ids_json: JSON.stringify(record.ownerIds || []),
    created_at: storedTs,
    updated_at: storedTs,
  };
}

// Seeds missing built-in item rows from ITEM_DEFINITIONS, and patches
// actionIds on rows that already exist but predate a static definition
// change (e.g. tree_planter gaining "grow_pine_tree") — union-merges
// missing static action ids in without dropping any a creator added.
function backfillItemClassDefaults(
  cache: Record<string, ItemClassRecord>,
  now: number,
): { inserted: number; patched: number } {
  const defKeys = Object.keys(ITEM_DEFINITIONS);
  let inserted = 0;
  let patched = 0;
  for (let i = 0; i < defKeys.length; i++) {
    const defId = defKeys[i];
    const def = ITEM_DEFINITIONS[defId];
    const existing = cache[defId];
    if (!existing) {
      const record = itemClassFromDefinition(def);
      upsertItemClassRow(itemClassToDbRow(record, now));
      cache[record.id] = record;
      inserted++;
      continue;
    }
    const defActionIds = Array.isArray(def.actionIds) ? def.actionIds : [];
    const missingActionIds = defActionIds.filter(function (id) {
      return existing.actionIds.indexOf(id) === -1;
    });
    if (missingActionIds.length > 0) {
      existing.actionIds = existing.actionIds.concat(missingActionIds);
      upsertItemClassRow(itemClassToDbRow(existing, now));
      patched++;
    }
  }
  return { inserted: inserted, patched: patched };
}

export function bootstrapItemClasses(): void {
  const rows = loadAllItemClassRows();
  const cache: Record<string, ItemClassRecord> = {};
  const now = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const record = itemClassFromDbRow(rows[i]);
    if (record.id) cache[record.id] = record;
  }

  const { inserted, patched } = backfillItemClassDefaults(cache, now);
  if (rows.length === 0) {
    vwLog("item class repository seeded", { count: inserted });
  } else if (inserted > 0 || patched > 0) {
    vwLog("item class repository backfilled", {
      inserted_count: inserted,
      patched_count: patched,
      existing_count: rows.length,
    });
  }

  _itemClassCache = cache;
}

export function refreshItemClassCache(): void {
  const rows = loadAllItemClassRows();
  const cache: Record<string, ItemClassRecord> = {};
  const now = Date.now();
  for (let i = 0; i < rows.length; i++) {
    const record = itemClassFromDbRow(rows[i]);
    if (record.id) cache[record.id] = record;
  }

  const { inserted, patched } = backfillItemClassDefaults(cache, now);
  if (inserted > 0 || patched > 0) {
    vwLog("item class repository backfilled during refresh", {
      inserted_count: inserted,
      patched_count: patched,
    });
  }

  _itemClassCache = cache;
}

export function getAllItemClasses(): ItemClassRecord[] {
  if (!_itemClassCache) refreshItemClassCache();
  return Object.keys(_itemClassCache as Record<string, ItemClassRecord>).map(
    function (id) {
      return (_itemClassCache as Record<string, ItemClassRecord>)[id];
    },
  );
}

export function getItemClass(itemId: string): ItemClassRecord | null {
  if (!_itemClassCache) refreshItemClassCache();
  return (
    (_itemClassCache as Record<string, ItemClassRecord>)[
      String(itemId || "")
    ] || null
  );
}

// Cache-miss-tolerant lookup: another instance (or the editor on this one)
// may have created the class after this instance's cache was built, so
// refresh from the DB before concluding the class does not exist. Use this
// instead of getItemClass() wherever a miss would otherwise be reported to
// the caller as "not found" (get/update/delete).
export function getItemClassWithRefresh(
  itemId: string,
): ItemClassRecord | null {
  const cls = getItemClass(itemId);
  if (cls) return cls;
  refreshItemClassCache();
  return getItemClass(itemId);
}

export function upsertItemClass(record: ItemClassRecord): {
  ok: boolean;
  error?: string;
} {
  const now = Date.now();
  const writeResult = upsertItemClassRow(itemClassToDbRow(record, now));
  const ok = !!writeResult && !writeResult.error;
  if (ok && _itemClassCache) {
    _itemClassCache[record.id] = record;
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

export function deleteItemClass(classId: string): void {
  deleteItemClassRow(classId);
  if (_itemClassCache) {
    delete _itemClassCache[classId];
  }
}

// Every item instance gets these combat stats even if its class's
// stateTemplate doesn't declare them. currentHitPoints defaults to whatever
// maxHitPoints resolves to, so a class that only customizes maxHitPoints
// still spawns instances at full health.
function applyItemStateDefaults(
  merged: Record<string, unknown>,
): Record<string, unknown> {
  if (merged.maxHitPoints === undefined) merged.maxHitPoints = 10;
  if (merged.currentHitPoints === undefined) {
    merged.currentHitPoints = merged.maxHitPoints;
  }
  if (merged.armorClass === undefined) merged.armorClass = 10;
  if (merged.weaponClass === undefined) merged.weaponClass = 0;
  return merged;
}

export function getItemStateTemplate(itemId: string): Record<string, unknown> {
  const cls = getItemClass(itemId);
  const classTemplate = cls && cls.stateTemplate ? cls.stateTemplate : {};
  return applyItemStateDefaults(Object.assign({}, classTemplate));
}

// Minimal structural check for a content-array entry — deliberately not the
// full isValidItem() from world-domain.ts (which imports this module), to
// avoid a circular import; id/type is all normalizeItemState needs to trust.
function isValidContentItem(
  item: unknown,
): item is { id: string; type: string } {
  return (
    !!item &&
    typeof item === "object" &&
    typeof (item as Record<string, unknown>).id === "string" &&
    typeof (item as Record<string, unknown>).type === "string"
  );
}

// Merges stored item state over the class's current state template, so an
// item created before a stat was added (or before a class's stateTemplate
// was edited) still reads with the up-to-date defaults — the same backfill
// normalizeLivingValues does for living values on every load/save.
export function normalizeItemState(
  itemId: string,
  state: unknown,
): Record<string, unknown> {
  const out = getItemStateTemplate(itemId);
  if (state && typeof state === "object") {
    Object.keys(state as Record<string, unknown>).forEach(function (key) {
      out[key] = (state as Record<string, unknown>)[key];
    });
  }
  // Containers hold at most one level of nesting (contents can't themselves
  // be containers — enforced at put-time in item-action-helpers.ts) and at
  // most MAX_CONTAINER_ITEMS entries — bound the array defensively here too
  // so any load path (not just the put action) normalizes to the invariant.
  const cls = getItemClass(itemId);
  if (cls && cls.kind === "container") {
    const rawContents = Array.isArray(out.contents) ? out.contents : [];
    out.contents = rawContents
      .filter(isValidContentItem)
      .slice(0, MAX_CONTAINER_ITEMS);
  }
  return out;
}

// ── Action class repository (dynamic, DB-backed) ─────────────────────────────

export interface ActionClassRecord extends Omit<
  ActionDefinition,
  "targetKind"
> {
  targetKind: string;
  ownerIds: string[];
}

let _actionClassCache: Record<string, ActionClassRecord> | null = null;

function actionClassFromDbRow(row: any): ActionClassRecord {
  function parseJson(str: string, fallback: unknown): unknown {
    if (!str) return fallback;
    try {
      return JSON.parse(str);
    } catch (e) {
      return fallback;
    }
  }
  return {
    id: String(row.action_id || ""),
    labelKey: String(row.label_key || ""),
    fallbackLabel: String(row.fallback_label || ""),
    targetKind: String(
      row.target_kind || "self",
    ) as ActionDefinition["targetKind"],
    sourceItemIds: parseJson(row.source_item_ids_json, []) as string[],
    canonicalId: row.canonical_id ? String(row.canonical_id) : undefined,
    execution: parseJson(row.execution_json, undefined) as
      ActionDefinition["execution"] | undefined,
    validation: parseJson(row.validation_json, undefined) as
      ActionDefinition["validation"] | undefined,
    logicSpec: parseJson(row.logic_spec_json, undefined) as
      ActionDefinition["logicSpec"] | undefined,
    cost: parseJson(row.cost_json, undefined) as
      ActionDefinition["cost"] | undefined,
    produces: parseJson(row.produces_json, undefined) as
      ActionDefinition["produces"] | undefined,
    removes: parseJson(row.removes_json, undefined) as
      ActionDefinition["removes"] | undefined,
    fatigueCost:
      row.fatigue_cost === null || row.fatigue_cost === undefined
        ? undefined
        : Number(row.fatigue_cost),
    durationMs:
      row.duration_ms === null || row.duration_ms === undefined
        ? undefined
        : Number(row.duration_ms),
    ownerIds: (function () {
      const parsed = parseJson(row.owner_ids_json, []) as unknown[];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    })(),
  };
}

function actionClassToDbRow(
  record: ActionClassRecord,
  now: number,
): {
  action_id: string;
  label_key: string;
  fallback_label: string;
  target_kind: string;
  source_item_ids_json: string;
  canonical_id: string;
  execution_json: string;
  validation_json: string;
  logic_spec_json: string;
  cost_json: string;
  produces_json: string;
  removes_json: string;
  fatigue_cost?: number;
  duration_ms?: number;
  owner_ids_json: string;
  created_at: number;
  updated_at: number;
} {
  const storedTs = Math.floor(now / 1000);
  return {
    action_id: record.id,
    label_key: record.labelKey,
    fallback_label: record.fallbackLabel,
    target_kind: record.targetKind,
    source_item_ids_json: JSON.stringify(record.sourceItemIds || []),
    canonical_id: record.canonicalId || "",
    execution_json: record.execution ? JSON.stringify(record.execution) : "",
    validation_json: record.validation ? JSON.stringify(record.validation) : "",
    logic_spec_json: record.logicSpec ? JSON.stringify(record.logicSpec) : "",
    cost_json: record.cost ? JSON.stringify(record.cost) : "",
    produces_json: record.produces ? JSON.stringify(record.produces) : "",
    removes_json: record.removes ? JSON.stringify(record.removes) : "",
    // The host's JSON->SQL binding can't infer an INTEGER type from a JSON
    // `null` value (binds it as text, which Postgres then rejects against
    // the integer column) — omit the key entirely instead of writing null
    // when unset; the column is nullable and defaults to SQL NULL when
    // absent from the insert/upsert payload.
    ...(record.fatigueCost !== undefined
      ? { fatigue_cost: Number(record.fatigueCost) }
      : {}),
    ...(record.durationMs !== undefined
      ? { duration_ms: Number(record.durationMs) }
      : {}),
    owner_ids_json: JSON.stringify(record.ownerIds || []),
    created_at: storedTs,
    updated_at: storedTs,
  };
}

// Seeds missing built-in action rows from ACTION_DEFINITIONS, and patches
// rows that already exist but predate a field's DB column (e.g. rows seeded
// before logic_spec_json existed never got a logicSpec) — without touching
// fields a creator has since customized via the editor.
function backfillActionClassDefaults(
  cache: Record<string, ActionClassRecord>,
  now: number,
): { inserted: number; patched: number } {
  const defKeys = Object.keys(ACTION_DEFINITIONS);
  let inserted = 0;
  let patched = 0;
  for (let i = 0; i < defKeys.length; i++) {
    const defId = defKeys[i];
    const def = ACTION_DEFINITIONS[defId];
    const existing = cache[defId];
    if (!existing) {
      const record: ActionClassRecord = Object.assign({ ownerIds: [] }, def);
      upsertActionClassRow(actionClassToDbRow(record, now));
      cache[record.id] = record;
      inserted++;
      continue;
    }
    let changed = false;
    if (def.execution !== undefined) {
      if (existing.execution === undefined) {
        existing.execution = def.execution;
        changed = true;
      } else {
        // execution already exists (e.g. seeded by an older version of this
        // built-in action) — shallow-merge only keys missing from it, so a
        // creator's customization of an existing key is preserved but a new
        // key added to the built-in definition later (e.g. a duration
        // action's startToastMessage) still reaches an already-seeded row.
        const mergedExecution: Record<string, unknown> = Object.assign(
          {},
          existing.execution,
        );
        let executionChanged = false;
        Object.keys(def.execution).forEach(function (key) {
          const defExecution = def.execution as Record<string, unknown>;
          if (
            mergedExecution[key] === undefined &&
            defExecution[key] !== undefined
          ) {
            mergedExecution[key] = defExecution[key];
            executionChanged = true;
          }
        });
        if (executionChanged) {
          existing.execution =
            mergedExecution as ActionClassRecord["execution"];
          changed = true;
        }
      }
    }
    if (def.validation !== undefined) {
      if (existing.validation === undefined) {
        existing.validation = def.validation;
        changed = true;
      } else {
        // Same rationale as execution above: shallow-merge only keys missing
        // from the already-seeded row, so a creator's customization of an
        // existing validation key survives but a new key (or one renamed in
        // ACTION_DEFINITIONS, e.g. requirePortalState -> requireItemState)
        // still reaches rows seeded before that change.
        const mergedValidation: Record<string, unknown> = Object.assign(
          {},
          existing.validation,
        );
        let validationChanged = false;
        Object.keys(def.validation).forEach(function (key) {
          const defValidation = def.validation as Record<string, unknown>;
          if (
            mergedValidation[key] === undefined &&
            defValidation[key] !== undefined
          ) {
            mergedValidation[key] = defValidation[key];
            validationChanged = true;
          }
        });
        if (validationChanged) {
          existing.validation =
            mergedValidation as ActionClassRecord["validation"];
          changed = true;
        }
      }
    }
    if (existing.logicSpec === undefined && def.logicSpec !== undefined) {
      existing.logicSpec = def.logicSpec;
      changed = true;
    }
    if (existing.cost === undefined && def.cost !== undefined) {
      existing.cost = def.cost;
      changed = true;
    }
    if (existing.produces === undefined && def.produces !== undefined) {
      existing.produces = def.produces;
      changed = true;
    }
    if (existing.removes === undefined && def.removes !== undefined) {
      existing.removes = def.removes;
      changed = true;
    }
    if (existing.fatigueCost === undefined && def.fatigueCost !== undefined) {
      existing.fatigueCost = def.fatigueCost;
      changed = true;
    }
    if (existing.durationMs === undefined && def.durationMs !== undefined) {
      existing.durationMs = def.durationMs;
      changed = true;
    }
    if (changed) {
      upsertActionClassRow(actionClassToDbRow(existing, now));
      patched++;
    }
  }
  return { inserted: inserted, patched: patched };
}

export function bootstrapActionClasses(): void {
  const rows = loadAllActionClassRows();
  const cache: Record<string, ActionClassRecord> = {};
  const now = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const record = actionClassFromDbRow(rows[i]);
    if (record.id) cache[record.id] = record;
  }

  const { inserted, patched } = backfillActionClassDefaults(cache, now);
  if (rows.length === 0) {
    vwLog("action class repository seeded", { count: inserted });
  } else if (inserted > 0 || patched > 0) {
    vwLog("action class repository backfilled", {
      inserted_count: inserted,
      patched_count: patched,
      existing_count: rows.length,
    });
  }

  _actionClassCache = cache;
}

export function refreshActionClassCache(): void {
  const rows = loadAllActionClassRows();
  const cache: Record<string, ActionClassRecord> = {};
  const now = Date.now();
  for (let i = 0; i < rows.length; i++) {
    const record = actionClassFromDbRow(rows[i]);
    if (record.id) cache[record.id] = record;
  }

  const { inserted, patched } = backfillActionClassDefaults(cache, now);
  if (inserted > 0 || patched > 0) {
    vwLog("action class repository backfilled during refresh", {
      inserted_count: inserted,
      patched_count: patched,
    });
  }

  _actionClassCache = cache;
}

export function getAllActionClasses(): ActionClassRecord[] {
  if (!_actionClassCache) refreshActionClassCache();
  return Object.keys(
    _actionClassCache as Record<string, ActionClassRecord>,
  ).map(function (id) {
    return (_actionClassCache as Record<string, ActionClassRecord>)[id];
  });
}

export function getActionClass(actionId: string): ActionClassRecord | null {
  if (!_actionClassCache) refreshActionClassCache();
  return (
    (_actionClassCache as Record<string, ActionClassRecord>)[
      String(actionId || "")
    ] || null
  );
}

// See getItemClassWithRefresh() above — same cache-miss-tolerant retry.
export function getActionClassWithRefresh(
  actionId: string,
): ActionClassRecord | null {
  const cls = getActionClass(actionId);
  if (cls) return cls;
  refreshActionClassCache();
  return getActionClass(actionId);
}

export function upsertActionClass(record: ActionClassRecord): {
  ok: boolean;
  error?: string;
} {
  const now = Date.now();
  const writeResult = upsertActionClassRow(actionClassToDbRow(record, now));
  const ok = !!writeResult && !writeResult.error;
  if (ok && _actionClassCache) {
    _actionClassCache[record.id] = record;
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

export function deleteActionClass(actionId: string): void {
  deleteActionClassRow(actionId);
  if (_actionClassCache) {
    delete _actionClassCache[actionId];
  }
}

export function isPickableWorldItem(item: any): boolean {
  if (!item) return false;
  const cls = getItemClass(String(item.type || ""));
  if (cls) return !cls.nonPickable;
  const def = getItemDefinition(String(item.type || ""));
  return !(def && def.nonPickable);
}
