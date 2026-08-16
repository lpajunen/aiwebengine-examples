/**
 * Tests for action targeting resolution (DESIGN-targeting.md).
 *
 * Targeting decides what an action may aim at, from how far, and whether the
 * actor walks first. The defaults exist to keep pre-targeting actions behaving
 * exactly as they did, so a change to them silently changes every action that
 * never declared a `targeting` block — which is most of them. Pure: these
 * functions read only the action record they are handed.
 */

import {
  actionCategory,
  defaultTargetingForTargetKind,
  resolveActionTargeting,
  resolveEffectiveActionRange,
  targetingAllowsInventory,
  targetingAllowsWorld,
} from "./action-registry.ts";
import { NEARBY_TARGET_TILE_DISTANCE } from "./runtime-config.ts";

describe("default targeting per target kind", () => {
  test("nearby kinds reach across tiles without walking", () => {
    // follow/fight pursue on their own tick, so they act from where they are.
    ["item_nearby", "living_nearby"].forEach(function (kind) {
      const targeting = defaultTargetingForTargetKind(kind);
      expect(targeting.range).toBe(NEARBY_TARGET_TILE_DISTANCE);
      expect(targeting.rangeShape).toBe("line");
      expect(targeting.approach).toBe("none");
    });
  });

  test("facing kinds are adjacent by construction", () => {
    ["facing_tile", "facing_or_current_tile"].forEach(function (kind) {
      const targeting = defaultTargetingForTargetKind(kind);
      expect(targeting.range).toBe(1);
      expect(targeting.rangeShape).toBe("adjacent");
      expect(targeting.approach).toBe("none");
    });
  });

  test("everything else resolves on the actor's own tile", () => {
    ["item", "living", "self", "inventory", "current_tile"].forEach(
      function (kind) {
        expect(defaultTargetingForTargetKind(kind).range).toBe(0);
      },
    );
  });

  test("an unrecognized kind gets the same conservative default", () => {
    expect(defaultTargetingForTargetKind("what_even_is_this")).toEqual(
      defaultTargetingForTargetKind("item"),
    );
  });
});

describe("resolving an action's targeting", () => {
  test("an action without a block gets its kind's default, fully filled in", () => {
    const resolved = resolveActionTargeting({ targetKind: "item" });
    expect(resolved).toEqual({
      range: 0,
      rangeShape: "adjacent",
      approach: "none",
      areaRadius: 0,
      rangeFrom: "action",
      targetScope: "world",
    });
  });

  test("declared fields win over the default", () => {
    const resolved = resolveActionTargeting({
      targetKind: "item",
      targeting: {
        range: 4,
        rangeShape: "radius",
        approach: "walk_adjacent",
        areaRadius: 2,
        rangeFrom: "item",
        targetScope: "any",
      },
    });
    expect(resolved).toEqual({
      range: 4,
      rangeShape: "radius",
      approach: "walk_adjacent",
      areaRadius: 2,
      rangeFrom: "item",
      targetScope: "any",
    });
  });

  test("an explicit zero range survives instead of falling back", () => {
    // `range: 0` is meaningful (same tile) and must not be treated as unset.
    const resolved = resolveActionTargeting({
      targetKind: "living_nearby",
      targeting: { range: 0 },
    });
    expect(resolved.range).toBe(0);
    // Unset fields still come from the kind's default.
    expect(resolved.rangeShape).toBe("line");
  });

  test("a partial block leaves the rest of the default in place", () => {
    const resolved = resolveActionTargeting({
      targetKind: "facing_tile",
      targeting: { approach: "walk_adjacent" },
    });
    expect(resolved.approach).toBe("walk_adjacent");
    expect(resolved.range).toBe(1);
    expect(resolved.rangeShape).toBe("adjacent");
  });
});

describe("target scope", () => {
  test("a world-scoped action reaches items on the ground only", () => {
    const resolved = resolveActionTargeting({ targetKind: "item" });
    expect(targetingAllowsWorld(resolved)).toBe(true);
    expect(targetingAllowsInventory(resolved)).toBe(false);
  });

  test("an inventory-scoped action reaches carried items only", () => {
    const resolved = resolveActionTargeting({
      targetKind: "item",
      targeting: { targetScope: "inventory" },
    });
    expect(targetingAllowsInventory(resolved)).toBe(true);
    expect(targetingAllowsWorld(resolved)).toBe(false);
  });

  test('"any" reaches both, which is what examine needs', () => {
    const resolved = resolveActionTargeting({
      targetKind: "item",
      targeting: { targetScope: "any" },
    });
    expect(targetingAllowsInventory(resolved)).toBe(true);
    expect(targetingAllowsWorld(resolved)).toBe(true);
  });
});

describe("effective range", () => {
  const actionRanged = resolveActionTargeting({
    targetKind: "item",
    targeting: { range: 2, rangeFrom: "item" },
  });

  test("an action-ranged spec ignores the item entirely", () => {
    const resolved = resolveActionTargeting({
      targetKind: "item",
      targeting: { range: 2 },
    });
    expect(
      resolveEffectiveActionRange(resolved, { state: { weaponRange: 9 } }),
    ).toBe(2);
  });

  test("a weapon's reach extends an item-ranged action", () => {
    expect(
      resolveEffectiveActionRange(actionRanged, { state: { weaponRange: 6 } }),
    ).toBe(6);
  });

  test("a plain ranged item may use state.range instead", () => {
    expect(
      resolveEffectiveActionRange(actionRanged, { state: { range: 4 } }),
    ).toBe(4);
  });

  test("weaponRange wins when an item carries both", () => {
    expect(
      resolveEffectiveActionRange(actionRanged, {
        state: { weaponRange: 7, range: 3 },
      }),
    ).toBe(7);
  });

  test("an item never shortens the action's own reach", () => {
    expect(
      resolveEffectiveActionRange(actionRanged, { state: { weaponRange: 1 } }),
    ).toBe(2);
  });

  test("a missing, stateless or nonsense item leaves the action's range alone", () => {
    expect(resolveEffectiveActionRange(actionRanged, null)).toBe(2);
    expect(resolveEffectiveActionRange(actionRanged, {})).toBe(2);
    expect(
      resolveEffectiveActionRange(actionRanged, { state: { weaponRange: 0 } }),
    ).toBe(2);
    expect(
      resolveEffectiveActionRange(actionRanged, {
        state: { weaponRange: "far" },
      }),
    ).toBe(2);
  });
});

describe("action categories", () => {
  test("an unknown action falls into misc rather than crashing a menu", () => {
    expect(actionCategory("no_such_action")).toBe("misc");
    expect(actionCategory("")).toBe("misc");
  });
});
