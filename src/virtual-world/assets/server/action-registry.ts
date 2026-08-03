import {
  ActionCondition,
  ActionLogicSpec,
} from "./action-logic-interpreter.ts";
import { NEARBY_TARGET_TILE_DISTANCE } from "./runtime-config.ts";

// Targeting / aiming spec — see DESIGN-targeting.md. Describes how an action is
// aimed and how far it reaches, independent of the existing `targetKind` (which
// says *what/where* is targeted). Step 1 adds this data + a resolver; it does
// not yet change any behavior, so the built-in defaults below merely describe
// how each `targetKind` already behaves today.
export interface ActionTargeting {
  // Reach in tiles from the actor. 0 = same tile, 1 = adjacent, N = ranged.
  range?: number;
  // How range is measured / previewed: "adjacent" (melee/manipulate),
  // "line" (ranged single target), "radius" (area effect around the point).
  rangeShape?: "adjacent" | "line" | "radius";
  // Whether the actor walks into range before the action resolves.
  // "walk_adjacent" enqueues path-then-act; "none" acts from the current tile.
  approach?: "walk_adjacent" | "none";
  // For rangeShape "radius": tiles affected around the resolved target point.
  areaRadius?: number;
  // Who supplies the effective range: the action's own `range`, or the stat of
  // the item that granted the action (e.g. a longbow overrides a shortbow).
  rangeFrom?: "action" | "item";
}

// Same shape as ActionTargeting but with every field resolved to a concrete
// value — the return type of resolveActionTargeting().
export interface ResolvedActionTargeting {
  range: number;
  rangeShape: "adjacent" | "line" | "radius";
  approach: "walk_adjacent" | "none";
  areaRadius: number;
  rangeFrom: "action" | "item";
}

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
    // Same as "item"/"living" but the target may be up to
    // NEARBY_TARGET_TILE_DISTANCE tiles away instead of requiring the actor's
    // own tile — see resolveActionTarget() in tree-action-helpers.ts.
    | "item_nearby"
    | "living_nearby"
    | "inventory";
  sourceItemIds: string[];
  cost?: Array<{ itemId: string; count: number }>;
  produces?: Array<{
    itemId: string;
    count: number;
    // "inventory" (default) adds the item to the actor's bag, as crafting
    // actions do. "target_tile" places it in the world at the action's
    // resolved target tile instead (e.g. place_blessing) — see the produces
    // handling at the end of performTreeActionForUser in
    // tree-action-helpers.ts.
    placement?: "inventory" | "target_tile";
  }>;
  // Removes any item of these types from the target tile (e.g. remove_portal)
  // — the inverse of produces' placement: "target_tile" — see the removes
  // handling at the end of performTreeActionForUser in tree-action-helpers.ts.
  removes?: Array<{ itemId: string }>;
  fatigueCost?: number;
  // Experience points awarded to the acting player when this action completes
  // successfully. XP is player-only (NPCs never accrue it) and feeds both the
  // player's `experience` and `totalExperience` living values. When `onKill` is
  // true the award is deferred to the combat kill resolver (fight-helpers.ts),
  // which scales `amount` by the slain target's level — so merely *starting*
  // the action (e.g. picking a fight) grants nothing. See
  // maybeAwardActionExperience in tree-action-helpers.ts.
  experience?: {
    amount: number;
    onKill?: boolean;
  };
  // Optional real-time delay (ms) between the action starting and its
  // effects/produces resolving — see execution.startToastMessage.
  durationMs?: number;
  canonicalId?: string;
  execution?: {
    // Shown immediately when a durationMs action starts. toastMessage below
    // remains the finish/success message (shown immediately for instant
    // actions, or when a durationMs action resolves).
    startToastMessage?: string;
    // i18n key for the start toast, localized like toastMessageKey below.
    startToastMessageKey?: string;
    toastMessage?: string;
    // i18n key for the finish toast; the client localizes it with toastMessage
    // as the English fallback (see withConfiguredToastMessage). toastMessage is
    // still required so servers/older clients without the key stay readable.
    toastMessageKey?: string;
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
      treeAction?: "plant" | "cut";
      houseAction?: "build_house" | "destroy_house";
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
    // Generic presence/absence check for any item type at the target tile
    // (e.g. place_blessing rejects a second marker, build_portal/remove_portal
    // check for an existing portal) — same shape as requireHouseState but
    // parameterized by itemId instead of a fixed world-mod kind.
    requireItemState?: {
      itemId: string;
      kind: "present" | "absent";
      errorMessage: string;
    };
    blockedZones?: Array<{
      kind: "oak_clearing" | "oak_center";
      errorMessage: string;
    }>;
  };
  logicSpec?: ActionLogicSpec;
  // Aiming/reach spec (DESIGN-targeting.md). Optional: when omitted, the
  // action inherits defaultTargetingForTargetKind(targetKind).
  targeting?: ActionTargeting;
  // Precondition on the *target* for the action to be offered at all
  // (DESIGN-targeting.md step 3): all conditions must pass against the target
  // entity or the action's button is hidden. Client-evaluated gating (the
  // action's own handler remains the server-side authority); conditions may
  // reference the target's `type`, `state.*` (items) and `values.*` (livings).
  validWhen?: ActionCondition[];
}

// Shared targeting for melee/manipulation actions (poke and the item-targeted
// examine/break/fix/bury): a target chosen up to NEARBY_TARGET_TILE_DISTANCE
// tiles away is pursued and the action resolves on the actor's own tile once
// co-located, rather than requiring the exact tile up front — see
// DESIGN-targeting.md step 2 and maybeBeginApproachAction in
// tree-action-helpers.ts.
const WALK_ADJACENT_TARGETING: ActionTargeting = {
  range: NEARBY_TARGET_TILE_DISTANCE,
  rangeShape: "adjacent",
  approach: "walk_adjacent",
};

export const ACTION_DEFINITIONS: Record<string, ActionDefinition> = {
  plant: {
    id: "plant",
    labelKey: "tree_action.plant",
    fallbackLabel: "Plant pine sapling",
    targetKind: "facing_tile",
    sourceItemIds: ["tree_planter"],
    experience: { amount: 3 },
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
        missingErrorMessage: "error.cannot_plant_here",
        conflictErrorMessage: "error.tree_already_exists",
      },
      blockedZones: [
        {
          kind: "oak_clearing",
          errorMessage: "error.oak_clearing_must_stay_open",
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
    experience: { amount: 5 },
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
        missingErrorMessage: "error.no_tree_to_cut",
        conflictErrorMessage: "error.tree_already_cut",
      },
      blockedZones: [
        {
          kind: "oak_center",
          errorMessage: "error.old_oak_stands_firm",
        },
      ],
    },
  },
  grow_pine_tree: {
    id: "grow_pine_tree",
    labelKey: "recipe.grow_pine_tree",
    fallbackLabel: "Grow pine tree",
    targetKind: "facing_tile",
    sourceItemIds: ["tree_planter"],
    cost: [
      { itemId: "flower", count: 1 },
      { itemId: "juniper_bundle", count: 1 },
      { itemId: "tree_planter", count: 1 },
    ],
    experience: { amount: 15 },
    execution: {
      successPayload: {
        includeTargetPosition: true,
        includeWorldId: true,
      },
      worldMutation: {
        storage: "trees",
        treeAction: "plant",
      },
      worldEvent: {
        eventId: "tree_changed",
      },
    },
    validation: {
      requireTreeState: {
        kind: "plantable",
        missingErrorMessage: "error.cannot_plant_here",
        conflictErrorMessage: "error.tree_already_exists",
      },
      blockedZones: [
        {
          kind: "oak_clearing",
          errorMessage: "error.oak_clearing_must_stay_open",
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
    experience: { amount: 20 },
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
        errorMessage: "error.cannot_build_house_here",
      },
      requireHouseState: {
        kind: "absent",
        errorMessage: "error.house_already_exists",
      },
      blockedZones: [
        {
          kind: "oak_clearing",
          errorMessage: "error.oak_clearing_must_stay_open",
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
        errorMessage: "error.no_house_to_destroy",
      },
    },
  },
  build_door: {
    id: "build_door",
    labelKey: "tree_action.build_door",
    fallbackLabel: "Hang a door",
    targetKind: "facing_tile",
    sourceItemIds: ["hammer"],
    experience: { amount: 15 },
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
        eventId: "door_create",
      },
    },
    validation: {
      // A door is an opening in a house wall — it must be hung on an existing
      // house tile, and only one door per tile.
      requireHouseState: {
        kind: "present",
        errorMessage: "error.door_needs_wall",
      },
      requireItemState: {
        itemId: "door",
        kind: "absent",
        errorMessage: "error.door_already_hangs",
      },
    },
  },
  remove_door: {
    id: "remove_door",
    labelKey: "tree_action.remove_door",
    fallbackLabel: "Take down door",
    targetKind: "facing_tile",
    sourceItemIds: ["hammer"],
    removes: [{ itemId: "door" }],
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
        eventId: "door_remove",
      },
    },
    validation: {
      requireItemState: {
        itemId: "door",
        kind: "present",
        errorMessage: "error.no_door_to_remove",
      },
    },
  },
  build_portal: {
    id: "build_portal",
    labelKey: "tree_action.build_portal",
    fallbackLabel: "Raise rune gate",
    targetKind: "facing_tile",
    sourceItemIds: ["portal_builder"],
    experience: { amount: 25 },
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
        errorMessage: "error.cannot_build_portal_here",
      },
      requireItemState: {
        itemId: "portal",
        kind: "absent",
        errorMessage: "error.portal_already_exists",
      },
    },
  },
  remove_portal: {
    id: "remove_portal",
    labelKey: "tree_action.remove_portal",
    fallbackLabel: "Close rune gate",
    targetKind: "facing_tile",
    sourceItemIds: ["portal_builder"],
    removes: [{ itemId: "portal" }],
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
      requireItemState: {
        itemId: "portal",
        kind: "present",
        errorMessage: "error.no_portal_to_remove",
      },
    },
  },
  tune: {
    id: "tune",
    labelKey: "tree_action.tune",
    fallbackLabel: "Tune kantele",
    targetKind: "self",
    sourceItemIds: ["kantele"],
    fatigueCost: 10,
    experience: { amount: 4 },
    execution: {
      successPayload: {
        includeInventory: true,
      },
      toastMessage: "The kantele strings ring clear and ready.",
      toastMessageKey: "tree_action.tune_toast",
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
    experience: { amount: 4 },
    execution: {
      successPayload: {
        includeInventory: true,
        includeWorldId: true,
      },
      toastMessage: "A kantele tune carries across the clearing.",
      toastMessageKey: "tree_action.play_tune_toast",
      worldChatText: "lets a kantele melody drift through the spruce hush.",
    },
    logicSpec: {
      conditions: [
        {
          field: "state.tuned",
          op: "eq",
          value: true,
          errorMessage: "error.kantele_needs_tuning",
        },
        {
          field: "state.playsLeft",
          op: "gt",
          value: 0,
          errorMessage: "error.kantele_needs_tuning",
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
    experience: { amount: 10 },
    produces: [
      { itemId: "blessing_marker", count: 1, placement: "target_tile" },
    ],
    validation: {
      requireItemState: {
        itemId: "blessing_marker",
        kind: "absent",
        errorMessage: "error.blessing_already_rests_here",
      },
    },
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
      toastMessageKey: "tree_action.place_blessing_toast",
    },
  },
  pray: {
    id: "pray",
    labelKey: "tree_action.pray",
    fallbackLabel: "Pray",
    targetKind: "current_tile",
    sourceItemIds: ["old_oak"],
  },
  advance_level: {
    id: "advance_level",
    labelKey: "tree_action.advance_level",
    fallbackLabel: "Advance level",
    // Used while standing at the guild training post (source item is the
    // non-pickable training_dummy on/next to the actor's tile). The escalating
    // free-experience cost and level bump live in the advance_level branch of
    // tree-action-helpers.ts (it mutates a player living value, which the
    // item-state logicSpec can't express).
    targetKind: "current_tile",
    sourceItemIds: ["training_dummy"],
    execution: {
      successPayload: {
        includeInventory: true,
        includeWorldId: true,
      },
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
  door_travel: {
    id: "door_travel",
    labelKey: "tree_action.door_travel",
    fallbackLabel: "Enter door",
    // A door sits on a (non-walkable) house wall tile, so unlike portal_travel
    // the actor faces it from the adjacent tile rather than standing on it.
    // Travel is gated on the door's open state (see door_travel branch in
    // tree-action-helpers.ts) — a closed door can't be walked through.
    targetKind: "facing_tile",
    sourceItemIds: ["door"],
    execution: {
      successPayload: {
        includeSwitchedWorld: true,
        includeWorldId: true,
      },
    },
  },
  open_door: {
    id: "open_door",
    labelKey: "tree_action.open_door",
    fallbackLabel: "Open door",
    targetKind: "facing_tile",
    sourceItemIds: ["door"],
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
        eventId: "door_state",
      },
      toastMessage: "The door swings open.",
      toastMessageKey: "tree_action.open_door_toast",
    },
    validation: {
      requireItemState: {
        itemId: "door",
        kind: "present",
        errorMessage: "error.no_door_here",
      },
    },
  },
  close_door: {
    id: "close_door",
    labelKey: "tree_action.close_door",
    fallbackLabel: "Close door",
    targetKind: "facing_tile",
    sourceItemIds: ["door"],
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
        eventId: "door_state",
      },
      toastMessage: "You pull the door shut.",
      toastMessageKey: "tree_action.close_door_toast",
    },
    validation: {
      requireItemState: {
        itemId: "door",
        kind: "present",
        errorMessage: "error.no_door_here",
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
    // Walk to the item, then examine it (DESIGN-targeting.md step 2).
    targeting: WALK_ADJACENT_TARGETING,
  },
  break: {
    id: "break",
    labelKey: "tree_action.break",
    fallbackLabel: "Break",
    targetKind: "item",
    sourceItemIds: ["starter_kit"],
    targeting: WALK_ADJACENT_TARGETING,
  },
  fix: {
    id: "fix",
    labelKey: "tree_action.fix",
    fallbackLabel: "Fix",
    targetKind: "item",
    sourceItemIds: ["starter_kit"],
    targeting: WALK_ADJACENT_TARGETING,
    // Only offer Fix on a damaged item (current below max HP).
    validWhen: [
      { field: "state.currentHitPoints", op: "lt", ref: "state.maxHitPoints" },
    ],
  },
  bury: {
    id: "bury",
    labelKey: "tree_action.bury",
    fallbackLabel: "Bury",
    targetKind: "item",
    sourceItemIds: ["starter_kit"],
    targeting: WALK_ADJACENT_TARGETING,
    // Only offer Bury on a corpse.
    validWhen: [{ field: "type", op: "eq", value: "npc_corpse" }],
  },
  // Individual pick: walk to one chosen item and take just that item — the
  // per-item counterpart to the tile-level "pick all" HUD button (the "pick"
  // item-action in item-action-helpers.ts, which grabs every item underfoot).
  pick_item: {
    id: "pick_item",
    labelKey: "tree_action.pick_item",
    fallbackLabel: "Pick up",
    targetKind: "item",
    sourceItemIds: ["starter_kit"],
    targeting: WALK_ADJACENT_TARGETING,
  },
  poke: {
    id: "poke",
    labelKey: "tree_action.poke",
    fallbackLabel: "Poke",
    targetKind: "living",
    sourceItemIds: ["starter_kit"],
    // Pursue a living chosen up to range tiles away, then poke on arrival.
    targeting: WALK_ADJACENT_TARGETING,
  },
  follow: {
    id: "follow",
    labelKey: "tree_action.follow",
    fallbackLabel: "Follow",
    targetKind: "living_nearby",
    sourceItemIds: ["starter_kit"],
  },
  stop_follow: {
    id: "stop_follow",
    labelKey: "tree_action.stop_follow",
    fallbackLabel: "Stop following",
    targetKind: "self",
    sourceItemIds: ["starter_kit"],
  },
  // Stops any in-flight walk-then-act approach (see cancel_approach handler in
  // tree-action-helpers.ts) — the Stop button on an approaching active-action.
  cancel_approach: {
    id: "cancel_approach",
    labelKey: "tree_action.cancel_approach",
    fallbackLabel: "Stop moving",
    targetKind: "self",
    sourceItemIds: ["starter_kit"],
  },
  fight: {
    id: "fight",
    labelKey: "tree_action.fight",
    fallbackLabel: "Fight",
    targetKind: "living_nearby",
    sourceItemIds: ["starter_kit"],
    // Base XP for a kill; the combat resolver multiplies this by the slain
    // target's level (onKill defers the award off the fight-start path).
    experience: { amount: 20, onKill: true },
  },
  stop_fight: {
    id: "stop_fight",
    labelKey: "tree_action.stop_fight",
    fallbackLabel: "Stop fighting",
    targetKind: "self",
    sourceItemIds: ["starter_kit"],
  },
  // Ranged single-target attack (DESIGN-targeting.md step 4, `line` shape): a
  // one-shot strike on a living up to `range` tiles away, resolved from the
  // caster's tile without walking (approach "none"). Kill XP works like fight
  // (base scaled by target level). rangeFrom stays "action" here; a bow/wand
  // that overrides range via rangeFrom "item" is a later slice.
  firebolt: {
    id: "firebolt",
    labelKey: "tree_action.firebolt",
    fallbackLabel: "Firebolt",
    targetKind: "living_nearby",
    sourceItemIds: ["starter_kit"],
    experience: { amount: 20, onKill: true },
    targeting: {
      range: 8,
      rangeShape: "line",
      approach: "none",
    },
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
      toastMessageKey: "tree_action.summon_knife_toast",
    },
  },
  craft_kantele: {
    id: "craft_kantele",
    labelKey: "recipe.craft_kantele",
    fallbackLabel: "Craft kantele",
    targetKind: "inventory",
    sourceItemIds: ["starter_kit"],
    cost: [
      { itemId: "birch_bark_letter", count: 1 },
      { itemId: "juniper_bundle", count: 1 },
      { itemId: "rune_stone", count: 1 },
    ],
    experience: { amount: 30 },
    produces: [{ itemId: "kantele", count: 1 }],
    durationMs: 5000,
    execution: {
      successPayload: {
        includeInventory: true,
      },
      startToastMessage: "You start crafting a Kantele.",
      startToastMessageKey: "tree_action.craft_kantele_start_toast",
      toastMessage: "You finished crafting a Kantele.",
      toastMessageKey: "tree_action.craft_kantele_toast",
    },
  },
};

// Default aiming spec for an action that doesn't declare its own `targeting`.
// These describe how each `targetKind` already behaves today, so seeding them
// (see backfillActionClassDefaults) is behavior-preserving. Later design steps
// change specific actions' targeting deliberately (e.g. poke/fix ->
// walk_adjacent); they do so by setting `targeting` explicitly, not by editing
// these defaults.
export function defaultTargetingForTargetKind(
  // Accepts a plain string (not just the ActionDefinition union) because
  // ActionClassRecord widens targetKind to string — the switch's default
  // covers any unrecognized kind.
  targetKind: string,
): ActionTargeting {
  switch (targetKind) {
    case "item_nearby":
    case "living_nearby":
      // follow/fight already reach up to NEARBY_TARGET_TILE_DISTANCE tiles and
      // act from where the actor stands (they pursue on their own tick after).
      return {
        range: NEARBY_TARGET_TILE_DISTANCE,
        rangeShape: "line",
        approach: "none",
      };
    case "facing_tile":
    case "facing_or_current_tile":
      // The actor is already adjacent by virtue of facing the target tile.
      return { range: 1, rangeShape: "adjacent", approach: "none" };
    case "item":
    case "living":
    case "self":
    case "inventory":
    case "current_tile":
    default:
      // Plain targeted / self / tile actions resolve on the actor's own tile
      // today (step 2 of DESIGN-targeting.md flips item/living to
      // walk_adjacent with a wider reach).
      return { range: 0, rangeShape: "adjacent", approach: "none" };
  }
}

// Resolves an action's targeting to concrete values, filling any unset field
// from defaultTargetingForTargetKind(targetKind).
export function resolveActionTargeting(action: {
  targetKind: string;
  targeting?: ActionTargeting;
}): ResolvedActionTargeting {
  const base = defaultTargetingForTargetKind(action.targetKind);
  const t = action.targeting || {};
  const rangeShape = t.rangeShape || base.rangeShape || "adjacent";
  return {
    range:
      t.range !== undefined
        ? t.range
        : base.range !== undefined
          ? base.range
          : 0,
    rangeShape: rangeShape,
    approach: t.approach || base.approach || "none",
    areaRadius:
      t.areaRadius !== undefined
        ? t.areaRadius
        : base.areaRadius !== undefined
          ? base.areaRadius
          : 0,
    rangeFrom: t.rangeFrom || base.rangeFrom || "action",
  };
}

// Effective reach for a resolved targeting spec. When rangeFrom is "item", a
// numeric `range` on the granting item's state overrides the action's range
// (e.g. a longbow reaches farther than a shortbow granting the same action);
// otherwise the action's own range is used.
export function resolveEffectiveActionRange(
  targeting: ResolvedActionTargeting,
  sourceItem?: { state?: Record<string, unknown> | null } | null,
): number {
  if (targeting.rangeFrom === "item" && sourceItem && sourceItem.state) {
    const itemRange = Number(
      (sourceItem.state as Record<string, unknown>).range,
    );
    if (Number.isFinite(itemRange) && itemRange >= 0) {
      return itemRange;
    }
  }
  return targeting.range;
}
