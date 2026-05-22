import { ITEM_CHANGE_DEFINITIONS } from "./item-events.ts";
import {
  ACTION_DEFINITIONS,
  getActionDefinition as getActionDefinitionImpl,
  getAllActionIds as getAllActionIdsImpl,
} from "./action-registry.ts";

type BootstrapItemChangeDeltaKind = "add" | "remove" | "snapshot";

export type ItemKind =
  | "tool"
  | "artifact"
  | "world_item"
  | "placeable"
  | "consumable";

export interface ItemDefinition {
  id: string;
  kind: ItemKind;
  spawnable?: boolean;
  extra?: boolean;
  nonDroppable?: boolean;
  visuals: {
    color: number;
    labelKey: string;
    fallbackLabel: string;
  };
  actionIds: string[];
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
    actionIds: ["plant"],
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
    actionIds: ["play_tune"],
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
    actionIds: ["return_home"],
  },
  blessing_marker: {
    id: "blessing_marker",
    kind: "placeable",
    extra: true,
    nonDroppable: true,
    visuals: {
      color: 0xb54434,
      labelKey: "item.blessing_marker.name",
      fallbackLabel: "Rowan blessing",
    },
    actionIds: [],
  },
};

export const RECIPE_DEFINITIONS: Record<string, RecipeDefinition> = {
  craft_kantele: {
    id: "craft_kantele",
    labelKey: "recipe.craft_kantele",
    fallbackLabel: "Craft kantele",
    targetKind: "inventory",
    inputItems: [
      { itemId: "birch_bark_letter", count: 1 },
      { itemId: "juniper_bundle", count: 1 },
      { itemId: "rune_stone", count: 1 },
    ],
    outputs: [{ kind: "item", itemId: "kantele", count: 1 }],
  },
  grow_pine_tree: {
    id: "grow_pine_tree",
    labelKey: "recipe.grow_pine_tree",
    fallbackLabel: "Grow pine tree",
    targetKind: "facing_tile",
    inputItems: [
      { itemId: "flower", count: 1 },
      { itemId: "juniper_bundle", count: 1 },
      { itemId: "tree_planter", count: 1 },
    ],
    outputs: [{ kind: "place_tree", count: 1 }],
  },
};

export function getItemDefinition(itemId: string): ItemDefinition | null {
  return ITEM_DEFINITIONS[String(itemId || "")] || null;
}

export function getRecipeDefinition(recipeId: string): RecipeDefinition | null {
  return RECIPE_DEFINITIONS[String(recipeId || "")] || null;
}

export function getActionDefinition(actionId: string | null | undefined) {
  return getActionDefinitionImpl(actionId);
}

export function getAllActionIds(): string[] {
  return getAllActionIdsImpl();
}

export function getActionsForItemType(itemId: string): string[] {
  const item = getItemDefinition(itemId);
  if (!item || !Array.isArray(item.actionIds)) return [];
  return item.actionIds.slice();
}

export function getPrimaryActionForItemType(itemId: string): string | null {
  const actions = getActionsForItemType(itemId);
  return actions.length > 0 ? actions[0] : null;
}

export function getSpawnableItemTypes(): string[] {
  return Object.keys(ITEM_DEFINITIONS).filter(function (itemId) {
    return !!ITEM_DEFINITIONS[itemId].spawnable;
  });
}

export function getExtraItemTypes(): string[] {
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

  Object.keys(ITEM_DEFINITIONS).forEach(function (itemId) {
    const item = ITEM_DEFINITIONS[itemId];
    items[itemId] = {
      label_key: item.visuals.labelKey,
      fallback_label: item.visuals.fallbackLabel,
      color: item.visuals.color,
      action_ids: item.actionIds.slice(),
    };
  });

  Object.keys(ACTION_DEFINITIONS).forEach(function (actionId) {
    const action = ACTION_DEFINITIONS[actionId];
    actions[actionId] = {
      label_key: action.labelKey,
      fallback_label: action.fallbackLabel,
      canonical_id: action.canonicalId || action.id,
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
