import {
  CLASS_OWNED_ITEM_STATE_KEYS,
  MAX_CONTAINER_ITEMS,
  VWORLD_ACTION_CLASS_TABLE,
  VWORLD_ITEM_CLASS_TABLE,
} from "./runtime-config.ts";
import { vwLog } from "./diagnostics.ts";
import { ITEM_CHANGE_DEFINITIONS } from "./item-events.ts";
import {
  ACTION_DEFINITIONS,
  actionCategory,
  defaultTargetingForTargetKind,
  resolveActionTargeting,
} from "./action-registry.ts";
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
import { ClassLabels, normalizeClassLabels } from "./class-labels.ts";
import { ClassSize, normalizeClassSize } from "./class-size.ts";
import {
  DEFAULT_ITEM_VISUAL_STYLE,
  ItemVisualStyle,
  normalizeItemVisualStyle,
} from "./class-visual.ts";

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
    // How big the item's mesh renders; missing == "medium" (unchanged
    // appearance). Cosmetic only — see class-size.ts.
    size?: ClassSize;
    // Which mesh recipe the client builds; missing == "block", the plain
    // cube. Cosmetic only — see class-visual.ts.
    style?: ItemVisualStyle;
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
    size: ClassSize;
    style: ItemVisualStyle;
  };
  actionIds: string[];
  stateTemplate: Record<string, unknown>;
  ownerIds: string[];
  labels: ClassLabels;
}

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  saw: {
    id: "saw",
    kind: "tool",
    visuals: {
      color: 0xbfc6d0,
      labelKey: "item.saw.name",
      fallbackLabel: "Woodsman's saw",
      style: "blade",
    },
    actionIds: ["cut"],
  },
  knife: {
    id: "knife",
    kind: "tool",
    visuals: {
      color: 0xd8dee8,
      labelKey: "item.knife.name",
      fallbackLabel: "Knife",
      style: "blade",
    },
    actionIds: [],
  },
  // Weapons: when held in a hand slot their state.weaponClass sets the wielder's
  // effective weapon class (damage) and state.weaponRange sets attack range —
  // a large range makes it a ranged weapon (attack from afar), range 1 a melee
  // weapon (must close to adjacent). See fight-helpers.ts.
  sword: {
    id: "sword",
    kind: "tool",
    visuals: {
      color: 0xbfc6d0,
      labelKey: "item.sword.name",
      fallbackLabel: "Sword",
      style: "blade",
    },
    actionIds: [],
  },
  shortbow: {
    id: "shortbow",
    kind: "tool",
    visuals: {
      color: 0xa9752f,
      labelKey: "item.shortbow.name",
      fallbackLabel: "Shortbow",
      style: "bow",
    },
    actionIds: [],
  },
  longbow: {
    id: "longbow",
    kind: "tool",
    visuals: {
      color: 0x7a5220,
      labelKey: "item.longbow.name",
      fallbackLabel: "Longbow",
      style: "bow",
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
      style: "plant",
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
      style: "plant",
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
      style: "orb",
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
      style: "orb",
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
      style: "orb",
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
      style: "plant",
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
      style: "scroll",
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
      style: "staff",
    },
    actionIds: ["build_house", "destroy_house", "build_door", "remove_door"],
  },
  door: {
    id: "door",
    kind: "placeable",
    nonPickable: true,
    visuals: {
      color: 0x9c6b3f,
      labelKey: "item.door.name",
      fallbackLabel: "Door",
      style: "door",
    },
    actionIds: ["door_travel", "open_door", "close_door"],
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
  spellbook: {
    id: "spellbook",
    kind: "artifact",
    visuals: {
      color: 0x6b3e80,
      labelKey: "item.spellbook.name",
      fallbackLabel: "Spellbook",
      style: "book",
    },
    actionIds: ["firebolt", "fireball"],
  },
  shaman_talisman: {
    id: "shaman_talisman",
    kind: "artifact",
    visuals: {
      color: 0x3c9b63,
      labelKey: "item.shaman_talisman.name",
      fallbackLabel: "Shaman's talisman",
      style: "orb",
    },
    actionIds: ["heal", "harm"],
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
      "pick_item",
      "poke",
      "follow",
      "stop_follow",
      "cancel_approach",
      "fight",
      "stop_fight",
      "summon_knife",
      "summon_weapons",
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
      style: "orb",
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
      // A fixture style: the client draws the oak as its own landmark mesh on
      // its tile and skips the pine it would otherwise instance there. What
      // used to be an `item.type === "old_oak"` test in three client passes.
      style: "broadleaf",
    },
    actionIds: ["pray"],
  },
  training_dummy: {
    id: "training_dummy",
    kind: "placeable",
    nonDroppable: true,
    nonPickable: true,
    visuals: {
      color: 0xb08968,
      labelKey: "item.training_dummy.name",
      fallbackLabel: "Training post",
    },
    actionIds: ["advance_level"],
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
      style: "chest",
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

// Reverse index of action.sourceItemIds — which actions each item type grants
// by having been named by them. Rebuilt whenever the action cache is.
let _actionsBySourceItem: Record<string, string[]> = {};

function rebuildActionsBySourceItem(
  cache: Record<string, ActionClassRecord>,
): void {
  const index: Record<string, string[]> = {};
  Object.keys(cache).forEach(function (actionId) {
    const sources = cache[actionId].sourceItemIds;
    if (!Array.isArray(sources)) return;
    for (let i = 0; i < sources.length; i++) {
      const itemId = String(sources[i] || "");
      if (!itemId) continue;
      if (!index[itemId]) index[itemId] = [];
      if (index[itemId].indexOf(actionId) === -1) index[itemId].push(actionId);
    }
  });
  _actionsBySourceItem = index;
}

/**
 * Which actions an item type grants. The relation is written from both ends —
 * an item class lists actionIds, an action lists the sourceItemIds it is
 * granted by — and this is the union, so declaring either side is enough.
 *
 * They used to have to agree: an action naming an item in sourceItemIds but
 * missing from that item's actionIds simply did not work, failing with
 * error.missing_required_item_for_action and nothing to say why. Every
 * built-in did agree, so the union changes nothing that already existed.
 */
export function getActionsForItemType(itemId: string): string[] {
  const id = String(itemId || "");
  let own: string[] = [];
  if (_itemClassCache) {
    const cls = _itemClassCache[id];
    if (cls && Array.isArray(cls.actionIds)) own = cls.actionIds;
  } else {
    const item = getItemDefinition(id);
    if (item && Array.isArray(item.actionIds)) own = item.actionIds;
  }
  const granted = _actionsBySourceItem[id];
  if (!granted || granted.length === 0) return own.slice();
  const out = own.slice();
  for (let i = 0; i < granted.length; i++) {
    if (out.indexOf(granted[i]) === -1) out.push(granted[i]);
  }
  return out;
}

/**
 * Which item types an action is granted by — the mirror of
 * getActionsForItemType, and the union of the same two declarations: the
 * action's own sourceItemIds, plus every item class listing this action in
 * its actionIds.
 *
 * Both directions have to resolve, because sourceItemIds does double duty: it
 * says what grants the action *and* which carried or underfoot item the action
 * reads (the kantele a logicSpec tunes, the door a travel steps through).
 * Declaring only the item side used to leave that second job with nothing to
 * find, so the action ran and silently did nothing.
 */
export function getSourceItemIdsForAction(actionId: string): string[] {
  const id = String(actionId || "");
  const action = getActionDefinition(id);
  const own =
    action && Array.isArray(action.sourceItemIds) ? action.sourceItemIds : [];
  const out = own.slice();
  const itemSource = _itemClassCache || ITEM_DEFINITIONS;
  Object.keys(itemSource).forEach(function (itemId) {
    const cls = (itemSource as Record<string, { actionIds?: string[] }>)[
      itemId
    ];
    if (!cls || !Array.isArray(cls.actionIds)) return;
    if (cls.actionIds.indexOf(id) === -1) return;
    if (out.indexOf(itemId) === -1) out.push(itemId);
  });
  return out;
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
      labels: ClassLabels;
      color: number;
      size: ClassSize;
      style: ItemVisualStyle;
      action_ids: string[];
      kind: string;
      non_pickable?: boolean;
    }
  >;
  actions: Record<
    string,
    {
      label_key: string;
      fallback_label: string;
      labels: ClassLabels;
      canonical_id: string;
      target_kind: string;
      targeting?: ActionDefinition["targeting"];
      valid_when?: ActionDefinition["validWhen"];
      category?: string;
      // The tile mod this action writes, so the client can repaint the square
      // itself; replaced the tree_action/house_action pair.
      source_kind?: string;
      tile_type?: string;
    }
  >;
  item_events: Record<
    string,
    {
      delta_kind: BootstrapItemChangeDeltaKind;
    }
  >;
  // locale -> message key -> text, gathered from every action class's
  // `messages`. The client consults this before its own bundle, so a
  // creator's own toast and error keys localize through the same path the
  // built-in ones do.
  messages: Record<string, Record<string, string>>;
} {
  const items: Record<
    string,
    {
      label_key: string;
      fallback_label: string;
      labels: ClassLabels;
      color: number;
      size: ClassSize;
      style: ItemVisualStyle;
      action_ids: string[];
      kind: string;
      non_pickable?: boolean;
    }
  > = {};
  const actions: Record<
    string,
    {
      label_key: string;
      fallback_label: string;
      labels: ClassLabels;
      canonical_id: string;
      target_kind: string;
      targeting?: ActionDefinition["targeting"];
      valid_when?: ActionDefinition["validWhen"];
      category?: string;
      // The tile mod this action writes, so the client can repaint the square
      // itself; replaced the tree_action/house_action pair.
      source_kind?: string;
      tile_type?: string;
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
        labels: normalizeClassLabels(cls.labels),
        color: cls.visuals.color,
        size: normalizeClassSize(cls.visuals.size),
        style: normalizeItemVisualStyle(cls.visuals.style),
        // The union of both directions, so the client offers an action that
        // named this item without the item having to name it back.
        action_ids: getActionsForItemType(itemId),
        kind: cls.kind,
        non_pickable: !!cls.nonPickable,
      };
    });
  } else {
    Object.keys(ITEM_DEFINITIONS).forEach(function (itemId) {
      const item = ITEM_DEFINITIONS[itemId];
      items[itemId] = {
        label_key: item.visuals.labelKey,
        fallback_label: item.visuals.fallbackLabel,
        labels: {},
        color: item.visuals.color,
        size: normalizeClassSize(item.visuals.size),
        style: normalizeItemVisualStyle(item.visuals.style),
        action_ids: getActionsForItemType(itemId),
        kind: item.kind,
        non_pickable: !!item.nonPickable,
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
      labels: normalizeClassLabels((action as ActionClassRecord).labels),
      canonical_id: action.canonicalId || action.id,
      target_kind: action.targetKind,
      // Resolved, never raw: an action class written by a creator carries no
      // targeting at all (only the built-ins get theirs materialized onto the
      // row at bootstrap), and the client reads a missing range as 0 — which
      // silently means "only a target standing on my own tile", so an authored
      // entity-targeted action was never offered in the palette. Filling the
      // per-kind defaults here keeps that table in one place rather than
      // making the client keep a second copy of it.
      targeting: resolveActionTargeting(action),
      valid_when: action.validWhen,
      category: actionCategory(actionId),
      source_kind: worldMutation ? worldMutation.sourceKind : undefined,
      tile_type: worldMutation ? worldMutation.tileType : undefined,
    };
  });

  // Gather every action's authored per-locale text into one flat table.
  const messages: Record<string, Record<string, string>> = {};
  Object.keys(actionSource).forEach(function (actionId) {
    const authored = (actionSource[actionId] as ActionClassRecord).messages;
    if (!authored || typeof authored !== "object") return;
    Object.keys(authored).forEach(function (messageKey) {
      const byLocale = authored[messageKey];
      if (!byLocale || typeof byLocale !== "object") return;
      Object.keys(byLocale).forEach(function (locale) {
        const text = byLocale[locale];
        if (typeof text !== "string" || !text) return;
        if (!messages[locale]) messages[locale] = {};
        messages[locale][messageKey] = text;
      });
    });
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
    messages: messages,
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
      size: normalizeClassSize(def.visuals.size),
      style: normalizeItemVisualStyle(def.visuals.style),
    },
    actionIds: def.actionIds.slice(),
    stateTemplate: DEFAULT_STATE_TEMPLATES[def.id] || {},
    ownerIds: [],
    labels: {},
  };
}

// Default stateTemplates for built-in items that use the logic spec
const DEFAULT_STATE_TEMPLATES: Record<string, Record<string, unknown>> = {
  kantele: { tuned: false, playsLeft: 0 },
  chest: { contents: [] },
  // Melee weapon: reach 1 (must be adjacent).
  sword: { weaponClass: 4, weaponRange: 1 },
  // Ranged weapons: attack from up to weaponRange tiles away.
  shortbow: { weaponClass: 3, weaponRange: 5 },
  longbow: { weaponClass: 4, weaponRange: 10 },
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
      size: normalizeClassSize(row.size),
      style: normalizeItemVisualStyle(row.style),
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
    labels: normalizeClassLabels(row.labels_json),
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
  size: string;
  style: string;
  label_key: string;
  fallback_label: string;
  action_ids_json: string;
  state_template_json: string;
  owner_ids_json: string;
  labels_json: string;
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
    size: normalizeClassSize(record.visuals.size),
    style: normalizeItemVisualStyle(record.visuals.style),
    label_key: record.visuals.labelKey,
    fallback_label: record.visuals.fallbackLabel,
    action_ids_json: JSON.stringify(record.actionIds),
    state_template_json: JSON.stringify(record.stateTemplate || {}),
    owner_ids_json: JSON.stringify(record.ownerIds || []),
    labels_json: JSON.stringify(normalizeClassLabels(record.labels)),
    created_at: storedTs,
    updated_at: storedTs,
  };
}

// Seeds missing built-in item rows from ITEM_DEFINITIONS, and patches
// actionIds on rows that already exist but predate a static definition
// change (e.g. tree_planter gaining "grow_pine_tree") — union-merges
// missing static action ids in without dropping any a creator added.
// Everything else (colors, labels, visuals.size) is seed-only: an already
// stored row keeps whatever a creator last saved.
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
    let changed = false;
    const defActionIds = Array.isArray(def.actionIds) ? def.actionIds : [];
    const missingActionIds = defActionIds.filter(function (id) {
      return existing.actionIds.indexOf(id) === -1;
    });
    if (missingActionIds.length > 0) {
      existing.actionIds = existing.actionIds.concat(missingActionIds);
      changed = true;
    }
    // Rows seeded before visual styles existed read back as "block" (the
    // normalizer's default), so a built-in that declares a real style needs
    // it written on once — without this the sword would still be a cube.
    // Only fills the never-set case: a creator who picked "block" for a
    // built-in keeps it, since that is also what the definition would give.
    if (
      def.visuals.style &&
      normalizeItemVisualStyle(existing.visuals.style) ===
        DEFAULT_ITEM_VISUAL_STYLE &&
      def.visuals.style !== DEFAULT_ITEM_VISUAL_STYLE
    ) {
      existing.visuals.style = def.visuals.style;
      changed = true;
    }
    // Spellbook initially used the scroll recipe. Upgrade that seeded legacy
    // value to the dedicated book recipe without touching creator-selected
    // styles for any other built-in item.
    if (
      defId === "spellbook" &&
      def.visuals.style === "book" &&
      normalizeItemVisualStyle(existing.visuals.style) === "scroll"
    ) {
      existing.visuals.style = "book";
      changed = true;
    }
    if (changed) {
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
  // Reach in tiles when this item is wielded as a weapon (0 for non-weapons).
  if (merged.weaponRange === undefined) merged.weaponRange = 0;
  return merged;
}

// maxHitPoints is class-owned while currentHitPoints is instance-owned, so
// lowering a class's maxHitPoints can leave an existing instance holding more
// current hit points than its class now allows. Clamp on the way out rather
// than letting a >100% health meter reach the HUD.
function clampCurrentHitPoints(merged: Record<string, unknown>): void {
  const max = Number(merged.maxHitPoints);
  const current = Number(merged.currentHitPoints);
  if (!Number.isFinite(max) || !Number.isFinite(current)) return;
  if (current > max) merged.currentHitPoints = max;
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

export function isClassOwnedItemStateKey(key: string): boolean {
  return CLASS_OWNED_ITEM_STATE_KEYS.indexOf(key) !== -1;
}

/**
 * Drops the class-owned tuning keys (see CLASS_OWNED_ITEM_STATE_KEYS) from an
 * item state before it is persisted, so the row carries only what the instance
 * actually owns and later class edits keep flowing through. Recurses one level
 * into container contents, which hold whole item objects with their own state.
 * Returns null when nothing instance-owned is left, so the caller can store a
 * null state_json instead of an empty object.
 */
export function stripClassOwnedItemState(
  state: unknown,
  depth?: number,
): Record<string, unknown> | null {
  if (!state || typeof state !== "object") return null;
  const src = state as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let kept = 0;
  Object.keys(src).forEach(function (key) {
    if (isClassOwnedItemStateKey(key)) return;
    if (key === "contents" && Array.isArray(src[key]) && (depth || 0) < 1) {
      out[key] = (src[key] as unknown[]).map(function (entry) {
        if (!isValidContentItem(entry)) return entry;
        const contentItem = entry as unknown as Record<string, unknown>;
        return Object.assign({}, contentItem, {
          state: stripClassOwnedItemState(contentItem.state, (depth || 0) + 1),
        });
      });
      kept++;
      return;
    }
    out[key] = src[key];
    kept++;
  });
  return kept > 0 ? out : null;
}

// Merges stored item state over the class's current state template, so an
// item created before a stat was added (or before a class's stateTemplate
// was edited) still reads with the up-to-date defaults — the same backfill
// normalizeLivingValues does for living values on every load/save.
//
// Class-owned keys are the exception and are NOT overlaid: for those the
// class template wins over whatever the row happens to carry, so editing a
// class re-tunes instances that were saved back when the old value was still
// being flattened into the row. See CLASS_OWNED_ITEM_STATE_KEYS.
export function normalizeItemState(
  itemId: string,
  state: unknown,
  depth?: number,
): Record<string, unknown> {
  const out = getItemStateTemplate(itemId);
  if (state && typeof state === "object") {
    Object.keys(state as Record<string, unknown>).forEach(function (key) {
      if (isClassOwnedItemStateKey(key)) return;
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
      .slice(0, MAX_CONTAINER_ITEMS)
      // Contained items are stored inline in the container's own state, so
      // they need the same class-value refresh. The depth guard stops a
      // malformed container-in-container row from recursing forever.
      .map(function (entry) {
        if ((depth || 0) >= 1) return entry;
        const contentItem = entry as unknown as Record<string, unknown>;
        return Object.assign({}, contentItem, {
          state: normalizeItemState(
            String(contentItem.type || ""),
            contentItem.state,
            (depth || 0) + 1,
          ),
        });
      });
  }
  clampCurrentHitPoints(out);
  return out;
}

// What an examined item reveals: the same facts the tile inspector shows for
// an item lying on a square (class label, kind, stats, container fill, portal
// destination), resolved server-side so both the game client and the MCP tool
// path see one authoritative answer. See the examine action in
// tree-action-helpers.ts.
export interface ItemInspection {
  id: string;
  type: string;
  // Where the examined item was found: lying in the world, or carried by the
  // examining living (bag or equipped slot).
  source: "tile" | "inventory";
  row?: number;
  col?: number;
  slot_id?: string;
  kind: string;
  label_key: string;
  fallback_label: string;
  labels: ClassLabels;
  size: ClassSize;
  non_pickable: boolean;
  non_droppable: boolean;
  state: Record<string, unknown>;
  // Containers only: how full the item is (contents are listed by the
  // container panel, not repeated here).
  contents_count?: number;
  // Portals/doors only, mirroring the tile inspector's "Leads to" row.
  destination_world_id?: string;
  destination_world_type?: string;
}

export function buildItemInspection(
  item: {
    id?: unknown;
    type?: unknown;
    state?: unknown;
    non_droppable?: unknown;
    destination_world_id?: unknown;
    destination_world_type?: unknown;
  },
  location: {
    source: "tile" | "inventory";
    row?: number;
    col?: number;
    slotId?: string;
  },
): ItemInspection {
  const type = String((item && item.type) || "");
  const cls = getItemClass(type);
  const def = getItemDefinition(type);
  const state = normalizeItemState(type, item && item.state);
  const inspection: ItemInspection = {
    id: String((item && item.id) || ""),
    type: type,
    source: location.source,
    kind: cls ? cls.kind : def ? def.kind : "misc",
    label_key: cls
      ? cls.visuals.labelKey
      : def
        ? def.visuals.labelKey
        : "item." + type,
    fallback_label: cls
      ? cls.visuals.fallbackLabel
      : def
        ? def.visuals.fallbackLabel
        : type,
    labels: normalizeClassLabels(cls ? cls.labels : {}),
    size: normalizeClassSize(
      cls ? cls.visuals.size : def ? def.visuals.size : undefined,
    ),
    non_pickable: cls ? !!cls.nonPickable : !!(def && def.nonPickable),
    non_droppable: !!(item && item.non_droppable),
    state: state,
  };
  if (location.row !== undefined) inspection.row = location.row;
  if (location.col !== undefined) inspection.col = location.col;
  if (location.slotId) inspection.slot_id = location.slotId;
  if (inspection.kind === "container") {
    inspection.contents_count = Array.isArray(state.contents)
      ? state.contents.length
      : 0;
  }
  if (item && item.destination_world_id !== undefined) {
    inspection.destination_world_id = String(item.destination_world_id);
  }
  if (item && item.destination_world_type !== undefined) {
    inspection.destination_world_type = String(item.destination_world_type);
  }
  return inspection;
}

// ── Action class repository (dynamic, DB-backed) ─────────────────────────────

export interface ActionClassRecord extends Omit<
  ActionDefinition,
  "targetKind"
> {
  targetKind: string;
  ownerIds: string[];
  labels: ClassLabels;
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
    targeting: parseJson(row.targeting_json, undefined) as
      ActionDefinition["targeting"] | undefined,
    validWhen: parseJson(row.valid_when_json, undefined) as
      ActionDefinition["validWhen"] | undefined,
    cost: parseJson(row.cost_json, undefined) as
      ActionDefinition["cost"] | undefined,
    produces: parseJson(row.produces_json, undefined) as
      ActionDefinition["produces"] | undefined,
    removes: parseJson(row.removes_json, undefined) as
      ActionDefinition["removes"] | undefined,
    experience: parseJson(row.experience_json, undefined) as
      ActionDefinition["experience"] | undefined,
    livingEffect: parseJson(row.living_effect_json, undefined) as
      ActionDefinition["livingEffect"] | undefined,
    linkedWorld: parseJson(row.linked_world_json, undefined) as
      ActionDefinition["linkedWorld"] | undefined,
    itemEffect: parseJson(row.item_effect_json, undefined) as
      ActionDefinition["itemEffect"] | undefined,
    progression: parseJson(row.progression_json, undefined) as
      ActionDefinition["progression"] | undefined,
    messages: parseJson(row.messages_json, undefined) as
      ActionDefinition["messages"] | undefined,
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
    labels: normalizeClassLabels(row.labels_json),
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
  targeting_json: string;
  valid_when_json: string;
  cost_json: string;
  produces_json: string;
  removes_json: string;
  experience_json: string;
  living_effect_json: string;
  linked_world_json: string;
  item_effect_json: string;
  progression_json: string;
  messages_json: string;
  fatigue_cost?: number;
  duration_ms?: number;
  owner_ids_json: string;
  labels_json: string;
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
    targeting_json: record.targeting ? JSON.stringify(record.targeting) : "",
    valid_when_json: record.validWhen ? JSON.stringify(record.validWhen) : "",
    cost_json: record.cost ? JSON.stringify(record.cost) : "",
    produces_json: record.produces ? JSON.stringify(record.produces) : "",
    removes_json: record.removes ? JSON.stringify(record.removes) : "",
    experience_json: record.experience ? JSON.stringify(record.experience) : "",
    living_effect_json: record.livingEffect
      ? JSON.stringify(record.livingEffect)
      : "",
    linked_world_json: record.linkedWorld
      ? JSON.stringify(record.linkedWorld)
      : "",
    item_effect_json: record.itemEffect
      ? JSON.stringify(record.itemEffect)
      : "",
    progression_json: record.progression
      ? JSON.stringify(record.progression)
      : "",
    messages_json: record.messages ? JSON.stringify(record.messages) : "",
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
    labels_json: JSON.stringify(normalizeClassLabels(record.labels)),
    created_at: storedTs,
    updated_at: storedTs,
  };
}

// Shallow-compares two targeting specs over their known scalar fields, used to
// tell whether a seeded row still holds the auto-derived default (and may adopt
// a newly-declared built-in targeting) or a creator's customization.
function targetingEquals(
  a: ActionDefinition["targeting"] | undefined,
  b: ActionDefinition["targeting"] | undefined,
): boolean {
  const x = a || {};
  const y = b || {};
  return (
    x.range === y.range &&
    x.rangeShape === y.rangeShape &&
    x.approach === y.approach &&
    x.areaRadius === y.areaRadius &&
    x.rangeFrom === y.rangeFrom &&
    x.targetScope === y.targetScope
  );
}

// Blocked zones name tile-reservation rules (see world-reservations.ts). Rows
// seeded before reservations existed still say `oak_clearing`/`oak_center`,
// and the backfill below only fills in validation keys a stored row is
// *missing* — so those rows would keep the old names forever, and a creator's
// own protected clearing would report "The oak clearing must remain open".
//
// The definition is authoritative here, unlike every other validation key:
// blocked zones are not exposed by any editor, so there is no creator
// customization to preserve, and a stale kind is actively wrong. `oak_clearing`
// in particular cannot distinguish block_plant from block_build — mapping it
// generically would leave build_house checking the planting rule.
function syncBlockedZonesWithDefinition(
  record: ActionClassRecord,
  def: ActionDefinition,
): boolean {
  const defZones = def.validation && def.validation.blockedZones;
  if (!Array.isArray(defZones)) return false;
  const validation = (record.validation || {}) as Record<string, unknown>;
  const storedZones = Array.isArray(validation.blockedZones)
    ? (validation.blockedZones as Array<Record<string, unknown>>)
    : [];
  const matches =
    storedZones.length === defZones.length &&
    defZones.every(function (defZone, i) {
      const stored = storedZones[i];
      return (
        !!stored &&
        String(stored.kind || "") === defZone.kind &&
        String(stored.errorMessage || "") === defZone.errorMessage
      );
    });
  if (matches) return false;
  validation.blockedZones = defZones.map(function (defZone) {
    return { kind: defZone.kind, errorMessage: defZone.errorMessage };
  });
  record.validation = validation as ActionClassRecord["validation"];
  return true;
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
      const record: ActionClassRecord = Object.assign(
        { ownerIds: [], labels: {} },
        def,
      );
      if (record.targeting === undefined) {
        record.targeting = defaultTargetingForTargetKind(record.targetKind);
      }
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
    if (syncBlockedZonesWithDefinition(existing, def)) {
      changed = true;
    }
    // validation's tree/house rules became one ordered requireTileState list.
    // Same shallow-merge problem as worldMutation below: a seeded row keeps
    // its whole old validation object, so both the legacy rules and the new
    // list would end up running. Rewrite validation wholesale when it still
    // carries the old keys — the new list says exactly what they said.
    if (def.validation && def.validation.requireTileState) {
      const storedValidation = existing.validation;
      if (
        storedValidation &&
        !storedValidation.requireTileState &&
        (storedValidation.requireTreeState ||
          storedValidation.requireHouseState)
      ) {
        existing.validation = def.validation;
        changed = true;
      }
    }
    // worldMutation grew a sourceKind/tileType pair in place of the closed
    // storage enum. execution is shallow-merged above, so an already-seeded
    // row keeps its whole old worldMutation object and would never see the new
    // keys — rewrite that one key when it still has the old shape. This is a
    // format migration, not an override: the replacement says exactly what the
    // stored value said.
    if (def.execution && def.execution.worldMutation) {
      const storedMutation =
        existing.execution && existing.execution.worldMutation;
      if (
        storedMutation &&
        !storedMutation.sourceKind &&
        storedMutation.storage
      ) {
        existing.execution = Object.assign({}, existing.execution, {
          worldMutation: def.execution.worldMutation,
        });
        changed = true;
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
    if (existing.experience === undefined && def.experience !== undefined) {
      existing.experience = def.experience;
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
    // Keep the aiming spec (DESIGN-targeting.md) in sync with the code for
    // every built-in row nobody owns. Such a row is code-owned — this backfill
    // seeded it, and only an admin can edit a built-in through the class CRUD
    // route (canManageClass) — so a declared targeting always wins over what is
    // stored. Resyncing rather than adopting-once is what lets a built-in
    // change its spec more than once (poke gaining walk_adjacent in step 2,
    // then examine becoming a no-approach look in step 5); the older
    // adopt-only-if-still-derived rule could not, because the first adoption
    // made the row look customized. An owned row belongs to a creator and is
    // left untouched — an admin who wants a built-in's spec to survive deploys
    // takes ownership of the row by setting its ownerIds.
    const derivedTargeting = defaultTargetingForTargetKind(def.targetKind);
    const declaredTargeting = def.targeting
      ? Object.assign({}, derivedTargeting, def.targeting)
      : derivedTargeting;
    const targetingIsCodeOwned =
      !Array.isArray(existing.ownerIds) || existing.ownerIds.length === 0;
    if (existing.targeting === undefined) {
      existing.targeting = declaredTargeting;
      changed = true;
    } else if (
      targetingIsCodeOwned &&
      !targetingEquals(existing.targeting, declaredTargeting)
    ) {
      existing.targeting = declaredTargeting;
      changed = true;
    }
    // Seed the target precondition (DESIGN-targeting.md step 3) onto rows that
    // predate it. Fill-only-if-absent, like logicSpec — a creator who cleared
    // or customized validWhen is left untouched.
    if (existing.validWhen === undefined && def.validWhen !== undefined) {
      existing.validWhen = def.validWhen;
      changed = true;
    }
    // livingEffect carries a spell's entire behavior — its gates, its damage
    // and its toasts — so a built-in row nobody owns resyncs with the code
    // rather than adopting once, on the same reasoning as targeting above: a
    // fill-only-if-absent rule would freeze the first shape that ever reached
    // the DB and quietly ignore every later rebalance. A creator-owned row is
    // theirs and is left untouched.
    if (def.livingEffect !== undefined) {
      const livingEffectIsCodeOwned =
        !Array.isArray(existing.ownerIds) || existing.ownerIds.length === 0;
      if (existing.livingEffect === undefined) {
        existing.livingEffect = def.livingEffect;
        changed = true;
      } else if (
        livingEffectIsCodeOwned &&
        JSON.stringify(existing.livingEffect) !==
          JSON.stringify(def.livingEffect)
      ) {
        existing.livingEffect = def.livingEffect;
        changed = true;
      }
    }
    if (def.progression !== undefined && existing.progression === undefined) {
      existing.progression = def.progression;
      changed = true;
    }
    if (def.messages !== undefined && existing.messages === undefined) {
      existing.messages = def.messages;
      changed = true;
    }
    // Same code-owned resync rule as livingEffect, for the same reason.
    if (def.itemEffect !== undefined) {
      const itemEffectIsCodeOwned =
        !Array.isArray(existing.ownerIds) || existing.ownerIds.length === 0;
      if (existing.itemEffect === undefined) {
        existing.itemEffect = def.itemEffect;
        changed = true;
      } else if (
        itemEffectIsCodeOwned &&
        JSON.stringify(existing.itemEffect) !== JSON.stringify(def.itemEffect)
      ) {
        existing.itemEffect = def.itemEffect;
        changed = true;
      }
    }
    // Same code-owned resync rule as livingEffect above, for the same reason:
    // linkedWorld is the whole behavior of a build-a-way-in action.
    if (def.linkedWorld !== undefined) {
      const linkedWorldIsCodeOwned =
        !Array.isArray(existing.ownerIds) || existing.ownerIds.length === 0;
      if (existing.linkedWorld === undefined) {
        existing.linkedWorld = def.linkedWorld;
        changed = true;
      } else if (
        linkedWorldIsCodeOwned &&
        JSON.stringify(existing.linkedWorld) !== JSON.stringify(def.linkedWorld)
      ) {
        existing.linkedWorld = def.linkedWorld;
        changed = true;
      }
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
  rebuildActionsBySourceItem(cache);
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
  rebuildActionsBySourceItem(cache);
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
