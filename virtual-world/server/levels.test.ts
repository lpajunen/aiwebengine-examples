/**
 * Tests for what a level brings: attribute points to spend and hit points
 * rolled on the class's die.
 *
 * What these guard is that a level is worth having, and stays fair: points
 * that arrive on the right levels, hit points that come from the class and
 * Kestävyys, and attributes that cannot be pushed past the D&D ceiling.
 *
 * The arithmetic is tested on its own; the level-up itself happens in a world
 * of the test's own.
 */

import {
  applyLevelGains,
  ATTRIBUTE_MAX,
  attributePointsForLevel,
  raiseAttribute,
  raiseAttributeForUser,
  rollHitPointGain,
} from "./levels.ts";
import {
  ensureWorldItems,
  loadPlayerInventory,
  savePlayerInventory,
  upsertWorldItem,
} from "./item-storage.ts";
import { loadPlayerPosition } from "./player-persistence.ts";
import { performTreeActionForUser } from "./tree-action-helpers.ts";
import {
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  primeTransactions,
  walkableRunFinder,
} from "./test-fixtures.ts";

beforeEach(function () {
  primeTransactions();
});

afterEach(function () {
  cleanupTestData();
});

describe("a level's points", () => {
  test("are one, and two on every fourth level", () => {
    expect(attributePointsForLevel(2)).toBe(1);
    expect(attributePointsForLevel(3)).toBe(1);
    expect(attributePointsForLevel(4)).toBe(2);
    expect(attributePointsForLevel(8)).toBe(2);
  });

  test("go on an attribute one at a time, up to the ceiling", () => {
    const values: Record<string, unknown> = { voima: 19, attributePoints: 2 };

    expect(raiseAttribute(values, "voima")).toBeNull();
    expect(values.voima).toBe(20);
    expect(values.attributePoints).toBe(1);
    expect(raiseAttribute(values, "voima")).toBe("error.attribute_at_maximum");
    expect(raiseAttribute(values, "onni")).toBe("error.unknown_attribute");
    expect(raiseAttribute({ voima: 10 }, "voima")).toBe(
      "error.no_attribute_points",
    );
    expect(ATTRIBUTE_MAX).toBe(20);
  });
});

describe("a level's hit points", () => {
  test("are the class's die plus the Kestävyys modifier, at least one", () => {
    const top = function () {
      return 0.999;
    };
    const bottom = function () {
      return 0;
    };

    // A sage rolls a d6; Kestävyys 12 adds one.
    expect(rollHitPointGain("player_tietaja", { kestavyys: 12 }, top)).toBe(7);
    // A hero rolls a d10.
    expect(rollHitPointGain("player_urho", { kestavyys: 10 }, top)).toBe(10);
    // A poor roll with poor Kestävyys still gives one.
    expect(rollHitPointGain("player_urho", { kestavyys: 8 }, bottom)).toBe(1);
  });

  test("raise both the maximum and the current", () => {
    const values: Record<string, unknown> = {
      maxHitPoints: 12,
      currentHitPoints: 5,
      kestavyys: 13,
    };
    const gained = applyLevelGains("player_urho", values, 4, function () {
      return 0.5;
    });

    expect(gained).toEqual({ attributePoints: 2, hitPoints: 6 + 1 });
    expect(values.maxHitPoints).toBe(19);
    expect(values.currentHitPoints).toBe(12);
    expect(values.hitPointBonus).toBe(7);
  });
});

describe("advancing a level", () => {
  test("at the training post leaves points and hit points behind", () => {
    const forest = createTestWorld(16, 16);
    const userId = createTestPlayer(
      forest,
      "trainee",
      walkableRunFinder(forest)(1)[0],
    );
    const inv = loadPlayerInventory(userId);
    inv.class_id = "player_urho";
    inv.values.experience = 5000;
    savePlayerInventory(userId, inv);
    const at = loadPlayerPosition(userId)!;
    // Seeded first: a fresh world's first seeding would replace the post.
    ensureWorldItems(forest);
    upsertWorldItem(forest, at.row, at.col, {
      id: "test-post-" + Date.now(),
      type: "training_dummy",
    });

    const result = performTreeActionForUser(userId, {
      action: "advance_level",
    }).payload;

    expect(result.ok).toBe(true);
    expect(result.new_level).toBe(2);
    expect(result.attribute_points_gained).toBe(1);
    const after = loadPlayerInventory(userId);
    const bonus = Number(after.values.hitPointBonus);
    expect(bonus).toBeGreaterThan(0);
    // Read back: the class's 12 plus what the level rolled.
    expect(after.values.maxHitPoints).toBe(12 + bonus);

    expect(raiseAttributeForUser(userId, "kestavyys").ok).toBe(true);
    const raised = loadPlayerInventory(userId);
    expect(raised.values.attributePoints).toBe(0);
  });
});
