/**
 * Tests for authored descriptions: what examining an item says, and what the
 * world panel says about a world.
 *
 * What these guard is that every built-in has something to say, in both
 * languages, and that it reaches the player: through `examine` for an item,
 * and through the world's class — or its base type's — for a world.
 */

import { ITEM_DESCRIPTIONS, WORLD_DESCRIPTIONS } from "./descriptions.ts";
import { ITEM_DEFINITIONS } from "./item-registry.ts";
import { loadPlayerInventory, savePlayerInventory } from "./item-storage.ts";
import { START_WORLD_ID } from "./runtime-config.ts";
import { performTreeActionForUser } from "./tree-action-helpers.ts";
import {
  getAllWorldClasses,
  getWorldDescription,
} from "./world-class-storage.ts";
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

describe("every built-in", () => {
  test("item says something, in English and Finnish", () => {
    const missing = Object.keys(ITEM_DEFINITIONS).filter(function (id) {
      const text = ITEM_DESCRIPTIONS[id];
      return !text || !text.en || !text.fi;
    });

    expect(missing).toEqual([]);
  });

  test("world class says something, in English and Finnish", () => {
    const missing = getAllWorldClasses()
      .filter(function (cls) {
        return (cls.ownerIds || []).length === 0;
      })
      .filter(function (cls) {
        const text = WORLD_DESCRIPTIONS[cls.id];
        return (
          !text ||
          cls.description !== text.en ||
          (cls.descriptions || {}).fi !== text.fi
        );
      })
      .map(function (cls) {
        return cls.id;
      });

    expect(missing).toEqual([]);
  });
});

describe("examining an item", () => {
  test("tells what its class says about it", () => {
    const forest = createTestWorld(16, 16);
    const userId = createTestPlayer(
      forest,
      "examiner",
      walkableRunFinder(forest)(1)[0],
    );
    const inv = loadPlayerInventory(userId);
    const kanteleId = "test-kantele-" + Date.now();
    inv.bag.push({ id: "test-kit-" + userId, type: "starter_kit" });
    inv.bag.push({ id: kanteleId, type: "kantele" });
    savePlayerInventory(userId, inv);

    const result = performTreeActionForUser(userId, {
      action: "examine",
      target_item_id: kanteleId,
    }).payload;

    expect(result.ok).toBe(true);
    expect(result.examined_item.description).toBe(ITEM_DESCRIPTIONS.kantele.en);
    expect(result.examined_item.descriptions.fi).toBe(
      ITEM_DESCRIPTIONS.kantele.fi,
    );
  });
});

describe("a world", () => {
  test("is described by its class", () => {
    expect(getWorldDescription(START_WORLD_ID).description).toBe(
      WORLD_DESCRIPTIONS.birdhaven.en,
    );
  });

  test("of a class with nothing to say is described by its base type", () => {
    const forest = createTestWorld(16, 16);

    expect(getWorldDescription(forest).description.length).toBeGreaterThan(0);
  });
});
