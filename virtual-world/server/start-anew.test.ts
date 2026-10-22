/**
 * Tests for starting anew: a dead player gives up their character and wakes
 * on their home island as a newcomer.
 *
 * What these guard is the rule that what affects play is reset and what does
 * not is kept. A fresh start that kept a sword would be a way round death; one
 * that took the creator's stone or the island would punish the player rather
 * than the character.
 */

import { loadPlayerInventory, savePlayerInventory } from "./item-storage.ts";
import { loadChosenClassId, saveChosenClassId } from "./player-character.ts";
import { getPlayerWorld } from "./player-persistence.ts";
import { freshCharacter } from "./start-anew.ts";
import { performTreeActionForUser } from "./tree-action-helpers.ts";
import { ensurePlayerHomeWorld } from "./world-bootstrap.ts";
import { getAllLivingItems, LivingState } from "./world-domain.ts";
import {
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  primeTransactions,
  trackTestWorld,
  walkableRunFinder,
} from "./test-fixtures.ts";

beforeEach(function () {
  primeTransactions();
});

afterEach(function () {
  cleanupTestData();
});

/** The bundle every player carries, which offers start_anew. */
function giveKit(userId: string): void {
  const inv = loadPlayerInventory(userId);
  inv.bag.push({ id: "test-kit-" + userId, type: "starter_kit" });
  savePlayerInventory(userId, inv);
}

function carried(inv: LivingState): string[] {
  return getAllLivingItems(inv)
    .map(function (item) {
      return String(item.type);
    })
    .sort();
}

describe("a fresh character", () => {
  test("is a newcomer carrying only what is kept", () => {
    const fresh = freshCharacter({
      class_id: "player_ghost",
      slots: { right_hand: { id: "s", type: "sword" } },
      bag: [
        { id: "k", type: "starter_kit" },
        { id: "b", type: "boat" },
        { id: "c", type: "creator_stone" },
        { id: "f", type: "flower" },
        { id: "a", type: "stone_axe" },
      ],
      values: { level: 4, voima: 16, puutyo: 40, synty_kantele: 1 },
    });

    expect(fresh.class_id).toBe("player_human");
    expect(fresh.values).toEqual({});
    expect(carried(fresh)).toEqual([
      "boat",
      "creator_stone",
      "flower",
      "starter_kit",
    ]);
  });
});

describe("starting anew", () => {
  test("is only for the dead", () => {
    const forest = createTestWorld(16, 16);
    const userId = createTestPlayer(
      forest,
      "living",
      walkableRunFinder(forest)(1)[0],
    );
    giveKit(userId);

    const result = performTreeActionForUser(userId, {
      action: "start_anew",
    }).payload;

    expect(result.error).toBe("error.not_for_your_class");
  });

  test("resets the character and wakes them on their island", () => {
    const forest = createTestWorld(16, 16);
    const userId = createTestPlayer(
      forest,
      "anew",
      walkableRunFinder(forest)(1)[0],
    );
    const islandId = trackTestWorld(ensurePlayerHomeWorld(userId));
    saveChosenClassId(userId, "player_seppa");
    giveKit(userId);
    const inv = loadPlayerInventory(userId);
    inv.class_id = "player_ghost";
    inv.values.level = 5;
    inv.values.takominen = 30;
    inv.bag.push({ id: "test-sword-" + Date.now(), type: "sword" });
    inv.bag.push({ id: "test-flower-" + Date.now(), type: "flower" });
    savePlayerInventory(userId, inv);

    const result = performTreeActionForUser(userId, {
      action: "start_anew",
    }).payload;

    expect(result.ok).toBe(true);
    expect(getPlayerWorld(userId)).toBe(islandId);
    expect(loadChosenClassId(userId)).toBe("");
    const after = loadPlayerInventory(userId);
    expect(after.class_id).toBe("player_human");
    expect(after.values.level).toBe(1);
    expect(after.values.takominen).toBeUndefined();
    const types = carried(after);
    expect(types).toContain("flower");
    expect(types).not.toContain("sword");
  });
});
