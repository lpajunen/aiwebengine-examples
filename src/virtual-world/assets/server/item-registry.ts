import {
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
  "tool" | "artifact" | "world_item" | "placeable" | "consumable";

export interface ItemDefinition {
  id: string;
  kind: ItemKind;
  spawnable?: boolean;
  extra?: boolean;
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
  spawnable: boolean;
  extra: boolean;
  nonDroppable: boolean;
  nonPickable: boolean;
  visuals: {
    color: number;
    labelKey: string;
    fallbackLabel: string;
  };
  actionIds: string[];
  stateTemplate: Record<string, unknown>;
}

export interface RecipeDefinition {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  targetKind: "inventory" | "current_tile" | "facing_tile";
  inputItems: Array<{ itemId: string; count: number }>;
  outputs: Array<
    | { kind: "item"; itemId: string; count: number }
    | { kind: "place_tree"; count: number }
    | { kind: "place_house"; count: number }
  >;
}

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  saw: {
    id: "saw",
    kind: "tool",
    spawnable: true,
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
    spawnable: true,
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
    spawnable: true,
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
    spawnable: true,
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
    spawnable: true,
    visuals: {
      color: 0xff9f1c,
      labelKey: "item.portal_builder.name",
      fallbackLabel: "Rune gate charm",
    },
    actionIds: [
      "build_portal",
      "build_portal_forest",
      "build_portal_island",
      "build_portal_cave",
      "build_portal_building",
      "remove_portal",
    ],
  },
  kantele: {
    id: "kantele",
    kind: "tool",
    spawnable: true,
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
    spawnable: true,
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
    spawnable: true,
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
    spawnable: true,
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
    spawnable: true,
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
    extra: true,
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
    extra: true,
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
    extra: true,
    nonDroppable: true,
    visuals: {
      color: 0xf3ca40,
      labelKey: "item.starter_kit.name",
      fallbackLabel: "Wanderer's bundle",
    },
    actionIds: [
      "return_home",
      "examine",
      "poke",
      "summon_knife",
      "craft_kantele",
    ],
  },
  blessing_marker: {
    id: "blessing_marker",
    kind: "placeable",
    extra: true,
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
    extra: true,
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
    extra: true,
    nonDroppable: true,
    nonPickable: true,
    visuals: {
      color: 0x4a3222,
      labelKey: "item.old_oak.name",
      fallbackLabel: "Old oak",
    },
    actionIds: ["pray"],
  },
};

// craft_kantele and grow_pine_tree have been migrated to
// ACTION_DEFINITIONS (action-registry.ts) — see cost/produces there.
export const RECIPE_DEFINITIONS: Record<string, RecipeDefinition> = {};

export function getItemDefinition(itemId: string): ItemDefinition | null {
  return ITEM_DEFINITIONS[String(itemId || "")] || null;
}

export function getRecipeDefinition(recipeId: string): RecipeDefinition | null {
  return RECIPE_DEFINITIONS[String(recipeId || "")] || null;
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

export function getSpawnableItemTypes(): string[] {
  if (_itemClassCache) {
    return Object.keys(_itemClassCache).filter(function (id) {
      return !!(_itemClassCache as Record<string, ItemClassRecord>)[id]
        .spawnable;
    });
  }
  return Object.keys(ITEM_DEFINITIONS).filter(function (itemId) {
    return !!ITEM_DEFINITIONS[itemId].spawnable;
  });
}

export function getExtraItemTypes(): string[] {
  if (_itemClassCache) {
    return Object.keys(_itemClassCache).filter(function (id) {
      return !!(_itemClassCache as Record<string, ItemClassRecord>)[id].extra;
    });
  }
  return Object.keys(ITEM_DEFINITIONS).filter(function (itemId) {
    return !!ITEM_DEFINITIONS[itemId].extra;
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
    }
  >;
  actions: Record<
    string,
    {
      label_key: string;
      fallback_label: string;
      canonical_id: string;
      target_kind: string;
    }
  >;
  item_events: Record<
    string,
    {
      delta_kind: BootstrapItemChangeDeltaKind;
    }
  >;
  recipes: Record<
    string,
    {
      label_key: string;
      fallback_label: string;
      target_kind: string;
      input_items: Array<{ item_id: string; count: number }>;
      outputs: Array<
        | { kind: "item"; item_id: string; count: number }
        | { kind: "place_tree"; count: number }
        | { kind: "place_house"; count: number }
      >;
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
    }
  > = {};
  const actions: Record<
    string,
    {
      label_key: string;
      fallback_label: string;
      canonical_id: string;
      target_kind: string;
    }
  > = {};
  const itemEvents: Record<
    string,
    {
      delta_kind: BootstrapItemChangeDeltaKind;
    }
  > = {};
  const recipes: Record<
    string,
    {
      label_key: string;
      fallback_label: string;
      target_kind: string;
      input_items: Array<{ item_id: string; count: number }>;
      outputs: Array<
        | { kind: "item"; item_id: string; count: number }
        | { kind: "place_tree"; count: number }
        | { kind: "place_house"; count: number }
      >;
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
      };
    });
  }

  const actionSource = _actionClassCache
    ? _actionClassCache
    : ACTION_DEFINITIONS;
  Object.keys(actionSource).forEach(function (actionId) {
    const action = actionSource[actionId];
    actions[actionId] = {
      label_key: action.labelKey,
      fallback_label: action.fallbackLabel,
      canonical_id: action.canonicalId || action.id,
      target_kind: action.targetKind,
    };
  });

  Object.keys(ITEM_CHANGE_DEFINITIONS).forEach(function (itemChangeId) {
    const itemChange = ITEM_CHANGE_DEFINITIONS[itemChangeId];
    itemEvents[itemChangeId] = {
      delta_kind: itemChange.deltaKind,
    };
  });

  Object.keys(RECIPE_DEFINITIONS).forEach(function (recipeId) {
    const recipe = RECIPE_DEFINITIONS[recipeId];
    recipes[recipeId] = {
      label_key: recipe.labelKey,
      fallback_label: recipe.fallbackLabel,
      target_kind: recipe.targetKind,
      input_items: recipe.inputItems.map(function (input) {
        return { item_id: input.itemId, count: input.count };
      }),
      outputs: recipe.outputs.map(function (output) {
        if (output.kind === "item") {
          return {
            kind: output.kind,
            item_id: output.itemId,
            count: output.count,
          };
        }
        return { kind: output.kind, count: output.count };
      }),
    };
  });

  return {
    items: items,
    actions: actions,
    item_events: itemEvents,
    recipes: recipes,
  };
}

// ── Item class repository (dynamic, DB-backed) ────────────────────────────────

let _itemClassCache: Record<string, ItemClassRecord> | null = null;

function itemClassFromDefinition(def: ItemDefinition): ItemClassRecord {
  return {
    id: def.id,
    kind: def.kind,
    spawnable: !!def.spawnable,
    extra: !!def.extra,
    nonDroppable: !!def.nonDroppable,
    nonPickable: !!def.nonPickable,
    visuals: {
      color: def.visuals.color,
      labelKey: def.visuals.labelKey,
      fallbackLabel: def.visuals.fallbackLabel,
    },
    actionIds: def.actionIds.slice(),
    stateTemplate: DEFAULT_STATE_TEMPLATES[def.id] || {},
  };
}

// Default stateTemplates for built-in items that use the logic spec
const DEFAULT_STATE_TEMPLATES: Record<string, Record<string, unknown>> = {
  kantele: { tuned: false, playsLeft: 0 },
};

function itemClassFromDbRow(row: any): ItemClassRecord {
  return {
    id: String(row.class_id || ""),
    kind: String(row.kind || "tool") as ItemKind,
    spawnable: row.spawnable === 1 || row.spawnable === true,
    extra: row.extra === 1 || row.extra === true,
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
  };
}

function itemClassToDbRow(
  record: ItemClassRecord,
  now: number,
): {
  class_id: string;
  kind: string;
  spawnable: number;
  extra: number;
  non_droppable: number;
  non_pickable: number;
  color: number;
  label_key: string;
  fallback_label: string;
  action_ids_json: string;
  state_template_json: string;
  created_at: number;
  updated_at: number;
} {
  const storedTs = Math.floor(now / 1000);
  return {
    class_id: record.id,
    kind: record.kind,
    spawnable: record.spawnable ? 1 : 0,
    extra: record.extra ? 1 : 0,
    non_droppable: record.nonDroppable ? 1 : 0,
    non_pickable: record.nonPickable ? 1 : 0,
    color: record.visuals.color,
    label_key: record.visuals.labelKey,
    fallback_label: record.visuals.fallbackLabel,
    action_ids_json: JSON.stringify(record.actionIds),
    state_template_json: JSON.stringify(record.stateTemplate || {}),
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

export function getItemStateTemplate(itemId: string): Record<string, unknown> {
  const cls = getItemClass(itemId);
  if (cls && cls.stateTemplate && Object.keys(cls.stateTemplate).length > 0) {
    return Object.assign({}, cls.stateTemplate);
  }
  return {};
}

// ── Action class repository (dynamic, DB-backed) ─────────────────────────────

export interface ActionClassRecord extends Omit<
  ActionDefinition,
  "targetKind"
> {
  targetKind: string;
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
      const record: ActionClassRecord = Object.assign({}, def);
      upsertActionClassRow(actionClassToDbRow(record, now));
      cache[record.id] = record;
      inserted++;
      continue;
    }
    let changed = false;
    if (existing.execution === undefined && def.execution !== undefined) {
      existing.execution = def.execution;
      changed = true;
    }
    if (existing.validation === undefined && def.validation !== undefined) {
      existing.validation = def.validation;
      changed = true;
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
