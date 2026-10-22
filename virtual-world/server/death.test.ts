/**
 * Tests for what death costs a player who prays their way back: a tenth of
 * their spendable experience and half an hour of being wounded.
 *
 * What these guard is that death matters and stays fair: the toll is taken,
 * nothing that took long to earn — levels, attributes, skills — is lost, and
 * the wound passes.
 */

import {
  applyReturnToll,
  woundedMaxHitPoints,
  woundHasHealed,
  WOUNDED_MS,
} from "./death.ts";
import {
  ensureWorldItems,
  loadPlayerInventory,
  savePlayerInventory,
  upsertWorldItem,
} from "./item-storage.ts";
import { loadPlayerPosition } from "./player-persistence.ts";
import { saveChosenClassId } from "./player-character.ts";
import { performTreeActionForUser } from "./tree-action-helpers.ts";
import { normalizeLivingValues } from "./world-domain.ts";
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

describe("the toll of returning", () => {
  test("is a tenth of the spendable experience and a wound", () => {
    const values: Record<string, unknown> = {
      experience: 95,
      totalExperience: 400,
    };

    expect(applyReturnToll(values, 1000)).toBe(9);
    expect(values.experience).toBe(86);
    expect(values.totalExperience).toBe(400);
    expect(values.woundedUntil).toBe(1000 + WOUNDED_MS);
  });

  test("takes a fifth off the maximum while the wound lasts", () => {
    expect(woundedMaxHitPoints(12)).toBe(10);
    expect(woundedMaxHitPoints(1)).toBe(1);
    const wounded = normalizeLivingValues(
      { woundedUntil: 5000, hitPointBonus: 3 },
      { maxHitPoints: 12 },
      "player",
    );
    expect(wounded.maxHitPoints).toBe(12);
    expect(woundHasHealed(wounded, 4999)).toBe(false);
    expect(woundHasHealed(wounded, 5000)).toBe(true);
  });
});

describe("praying back", () => {
  test("returns the class, takes the toll and keeps the rest", () => {
    const forest = createTestWorld(16, 16);
    const userId = createTestPlayer(
      forest,
      "returner",
      walkableRunFinder(forest)(1)[0],
    );
    saveChosenClassId(userId, "player_urho");
    const inv = loadPlayerInventory(userId);
    inv.class_id = "player_ghost";
    inv.values.experience = 50;
    inv.values.level = 3;
    inv.values.voima = 17;
    savePlayerInventory(userId, inv);
    const at = loadPlayerPosition(userId)!;
    // Seeded first: a fresh world's first seeding would replace the oak.
    ensureWorldItems(forest);
    upsertWorldItem(forest, at.row, at.col, {
      id: "test-oak-" + Date.now(),
      type: "old_oak",
    });

    const result = performTreeActionForUser(userId, { action: "pray" }).payload;

    expect(result.ok).toBe(true);
    expect(result.experience_lost).toBe(5);
    const after = loadPlayerInventory(userId);
    expect(after.class_id).toBe("player_urho");
    expect(after.values.experience).toBe(45);
    expect(after.values.level).toBe(3);
    expect(after.values.voima).toBe(17);
    // The hero's 12, wounded to 10, and filled to it.
    expect(after.values.maxHitPoints).toBe(10);
    expect(after.values.currentHitPoints).toBe(10);
    expect(Number(after.values.woundedUntil)).toBeGreaterThan(Date.now());
  });
});
