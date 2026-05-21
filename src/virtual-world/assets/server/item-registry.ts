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

export interface ActionDefinition {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  targetKind:
    | "self"
    | "current_tile"
    | "facing_tile"
    | "facing_or_current_tile";
  sourceItemIds: string[];
  canonicalId?: string;
  execution?: {
    toastMessage?: string;
    worldChatText?: string;
    successPayload?: {
      includeTargetPosition?: boolean;
      includeWorldId?: boolean;
      includeInventory?: boolean;
      includeTileItems?: boolean;
      includeRemovedCount?: boolean;
      includeSwitchedWorld?: boolean;
    };
    worldEvent?: {
      eventType: string;
      actionId?: string;
    };
    itemChange?: {
      actionId: string;
    };
  };
  validation?: {
    requireWalkableTile?: {
      errorMessage: string;
    };
    requireTreeState?: {
      kind: "plantable" | "cuttable";
      missingErrorMessage?: string;
      conflictErrorMessage?: string;
    };
    requireHouseState?: {
      kind: "present" | "absent";
      errorMessage: string;
    };
    requirePortalState?: {
      kind: "present" | "absent";
      errorMessage: string;
    };
    blockedZones?: Array<{
      kind: "oak_clearing" | "oak_center";
      errorMessage: string;
    }>;
  };
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

export const ACTION_DEFINITIONS: Record<string, ActionDefinition> = {
  plant: {
    id: "plant",
    labelKey: "tree_action.plant",
    fallbackLabel: "Plant pine sapling",
    targetKind: "facing_tile",
    sourceItemIds: ["tree_planter"],
    execution: {
      successPayload: {
        includeTargetPosition: true,
        includeWorldId: true,
      },
      worldEvent: {
        eventType: "tree_changed",
      },
    },
    validation: {
      requireTreeState: {
        kind: "plantable",
        missingErrorMessage: "Cannot plant here",
        conflictErrorMessage: "Tree already exists",
      },
      blockedZones: [
        {
          kind: "oak_clearing",
          errorMessage: "The oak clearing must remain open",
        },
      ],
    },
  },
  cut: {
    id: "cut",
    labelKey: "tree_action.cut",
    fallbackLabel: "Use woodsman's saw",
    targetKind: "facing_tile",
    sourceItemIds: ["saw"],
    execution: {
      successPayload: {
        includeTargetPosition: true,
        includeWorldId: true,
      },
      worldEvent: {
        eventType: "tree_changed",
      },
    },
    validation: {
      requireTreeState: {
        kind: "cuttable",
        missingErrorMessage: "No tree to cut",
        conflictErrorMessage: "Tree already cut",
      },
      blockedZones: [
        {
          kind: "oak_center",
          errorMessage: "The old oak stands firm",
        },
      ],
    },
  },
  build_house: {
    id: "build_house",
    labelKey: "tree_action.build_house",
    fallbackLabel: "Use hammer (build house)",
    targetKind: "facing_tile",
    sourceItemIds: ["hammer"],
    execution: {
      successPayload: {
        includeTargetPosition: true,
        includeWorldId: true,
      },
      worldEvent: {
        eventType: "house_changed",
      },
    },
    validation: {
      requireWalkableTile: {
        errorMessage: "Cannot build house here",
      },
      requireHouseState: {
        kind: "absent",
        errorMessage: "House already exists",
      },
      blockedZones: [
        {
          kind: "oak_clearing",
          errorMessage: "The oak clearing must remain open",
        },
      ],
    },
  },
  destroy_house: {
    id: "destroy_house",
    labelKey: "tree_action.destroy_house",
    fallbackLabel: "Use hammer (destroy house)",
    targetKind: "facing_tile",
    sourceItemIds: ["hammer"],
    execution: {
      successPayload: {
        includeTargetPosition: true,
        includeWorldId: true,
      },
      worldEvent: {
        eventType: "house_changed",
      },
    },
    validation: {
      requireHouseState: {
        kind: "present",
        errorMessage: "No house to destroy",
      },
    },
  },
  build_portal: {
    id: "build_portal",
    labelKey: "tree_action.build_portal",
    fallbackLabel: "Raise rune gate",
    targetKind: "facing_tile",
    sourceItemIds: ["portal_builder"],
    execution: {
      successPayload: {
        includeTargetPosition: true,
        includeWorldId: true,
        includeInventory: true,
        includeTileItems: true,
      },
      itemChange: {
        actionId: "portal_create",
      },
    },
    validation: {
      requireWalkableTile: {
        errorMessage: "Cannot build portal here",
      },
      requirePortalState: {
        kind: "absent",
        errorMessage: "Portal already exists",
      },
    },
  },
  build_portal_forest: {
    id: "build_portal_forest",
    labelKey: "tree_action.build_portal_forest",
    fallbackLabel: "Raise rune gate to forest world",
    targetKind: "facing_tile",
    sourceItemIds: ["portal_builder"],
    canonicalId: "build_portal",
  },
  build_portal_island: {
    id: "build_portal_island",
    labelKey: "tree_action.build_portal_island",
    fallbackLabel: "Raise rune gate to island world",
    targetKind: "facing_tile",
    sourceItemIds: ["portal_builder"],
    canonicalId: "build_portal",
  },
  build_portal_cave: {
    id: "build_portal_cave",
    labelKey: "tree_action.build_portal_cave",
    fallbackLabel: "Raise rune gate to cave world",
    targetKind: "facing_tile",
    sourceItemIds: ["portal_builder"],
    canonicalId: "build_portal",
  },
  build_portal_building: {
    id: "build_portal_building",
    labelKey: "tree_action.build_portal_building",
    fallbackLabel: "Raise rune gate to house world",
    targetKind: "facing_tile",
    sourceItemIds: ["portal_builder"],
    canonicalId: "build_portal",
  },
  remove_portal: {
    id: "remove_portal",
    labelKey: "tree_action.remove_portal",
    fallbackLabel: "Close rune gate",
    targetKind: "facing_tile",
    sourceItemIds: ["portal_builder"],
    execution: {
      successPayload: {
        includeTargetPosition: true,
        includeWorldId: true,
        includeInventory: true,
        includeTileItems: true,
        includeRemovedCount: true,
      },
      itemChange: {
        actionId: "portal_remove",
      },
    },
    validation: {
      requirePortalState: {
        kind: "present",
        errorMessage: "No portal to remove",
      },
    },
  },
  play_tune: {
    id: "play_tune",
    labelKey: "tree_action.play_tune",
    fallbackLabel: "Play kantele tune",
    targetKind: "self",
    sourceItemIds: ["kantele"],
    execution: {
      successPayload: {
        includeInventory: true,
        includeWorldId: true,
      },
      toastMessage: "A kantele tune carries across the clearing.",
      worldChatText: "lets a kantele melody drift through the spruce hush.",
    },
  },
  place_blessing: {
    id: "place_blessing",
    labelKey: "tree_action.place_blessing",
    fallbackLabel: "Place rowan blessing",
    targetKind: "current_tile",
    sourceItemIds: ["rowan_charm"],
    execution: {
      successPayload: {
        includeTargetPosition: true,
        includeWorldId: true,
        includeInventory: true,
        includeTileItems: true,
      },
      itemChange: {
        actionId: "blessing_place",
      },
      toastMessage: "A rowan blessing now marks this place.",
    },
  },
  portal_travel: {
    id: "portal_travel",
    labelKey: "tree_action.portal_travel",
    fallbackLabel: "Enter rune gate",
    targetKind: "current_tile",
    sourceItemIds: ["portal"],
    execution: {
      successPayload: {
        includeSwitchedWorld: true,
        includeWorldId: true,
      },
    },
  },
  return_home: {
    id: "return_home",
    labelKey: "tree_action.return_home",
    fallbackLabel: "Travel to the old oak",
    targetKind: "self",
    sourceItemIds: ["starter_kit"],
    execution: {
      successPayload: {
        includeSwitchedWorld: true,
        includeWorldId: true,
      },
    },
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

export function getActionDefinition(
  actionId: string | null | undefined,
): ActionDefinition | null {
  return ACTION_DEFINITIONS[String(actionId || "")] || null;
}

export function getRecipeDefinition(recipeId: string): RecipeDefinition | null {
  return RECIPE_DEFINITIONS[String(recipeId || "")] || null;
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

export function getAllActionIds(): string[] {
  return Object.keys(ACTION_DEFINITIONS);
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

  return { items: items, actions: actions, recipes: recipes };
}
