import { ActionLogicSpec } from "./action-logic-interpreter.ts";

export interface ActionDefinition {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  targetKind:
    | "self"
    | "current_tile"
    | "facing_tile"
    | "facing_or_current_tile"
    | "item"
    | "living"
    | "inventory";
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
    itemMutation?: {
      saveWorldItems?: boolean;
    };
    worldMutation?: {
      storage: "trees" | "houses";
    };
    worldEvent?: {
      eventId: string;
      actionId?: string;
    };
    itemChange?: {
      eventId: string;
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
  logicSpec?: ActionLogicSpec;
}

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
      worldMutation: {
        storage: "trees",
      },
      worldEvent: {
        eventId: "tree_changed",
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
      worldMutation: {
        storage: "trees",
      },
      worldEvent: {
        eventId: "tree_changed",
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
      worldMutation: {
        storage: "houses",
      },
      worldEvent: {
        eventId: "house_changed",
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
      worldMutation: {
        storage: "houses",
      },
      worldEvent: {
        eventId: "house_changed",
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
      itemMutation: {
        saveWorldItems: true,
      },
      itemChange: {
        eventId: "portal_create",
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
      itemMutation: {
        saveWorldItems: true,
      },
      itemChange: {
        eventId: "portal_remove",
      },
    },
    validation: {
      requirePortalState: {
        kind: "present",
        errorMessage: "No portal to remove",
      },
    },
  },
  tune: {
    id: "tune",
    labelKey: "tree_action.tune",
    fallbackLabel: "Tune kantele",
    targetKind: "self",
    sourceItemIds: ["kantele"],
    execution: {
      successPayload: {
        includeInventory: true,
      },
      toastMessage: "The kantele strings ring clear and ready.",
    },
    logicSpec: {
      effects: [
        { field: "state.tuned", op: "set", value: true },
        { field: "state.playsLeft", op: "set", value: 3 },
      ],
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
    logicSpec: {
      conditions: [
        {
          field: "state.tuned",
          op: "eq",
          value: true,
          errorMessage: "The kantele needs tuning first",
        },
        {
          field: "state.playsLeft",
          op: "gt",
          value: 0,
          errorMessage: "The kantele needs tuning first",
        },
      ],
      effects: [
        {
          field: "state.playsLeft",
          op: "sub",
          value: 1,
        },
      ],
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
      itemMutation: {
        saveWorldItems: true,
      },
      itemChange: {
        eventId: "blessing_place",
      },
      toastMessage: "A rowan blessing now marks this place.",
    },
  },
  pray: {
    id: "pray",
    labelKey: "tree_action.pray",
    fallbackLabel: "Pray",
    targetKind: "current_tile",
    sourceItemIds: ["old_oak"],
    execution: {
      toastMessage: "You pray hard!",
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
  examine: {
    id: "examine",
    labelKey: "tree_action.examine",
    fallbackLabel: "Examine",
    targetKind: "item",
    sourceItemIds: ["starter_kit"],
  },
  poke: {
    id: "poke",
    labelKey: "tree_action.poke",
    fallbackLabel: "Poke",
    targetKind: "living",
    sourceItemIds: ["starter_kit"],
  },
  summon_knife: {
    id: "summon_knife",
    labelKey: "tree_action.summon_knife",
    fallbackLabel: "Summon knife",
    targetKind: "inventory",
    sourceItemIds: ["starter_kit"],
    execution: {
      successPayload: {
        includeInventory: true,
      },
      toastMessage: "A knife appears in your bag.",
    },
  },
};
