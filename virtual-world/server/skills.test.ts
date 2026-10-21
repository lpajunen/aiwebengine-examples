/**
 * Tests for skills: how they grow, how far each class can take them, and what
 * an action's skill block changes about it.
 *
 * What these guard is the promise that nobody is best at everything: growth
 * that slows toward a cap, caps that differ by class, and skill that makes a
 * real difference to the actions it belongs to.
 *
 * The arithmetic is tested on its own; the cases that act do so on a home
 * island or a forest of the test's own, never in Väinölä.
 */

import {
  extraYield,
  grownSkill,
  meetsSkillMin,
  rollBonus,
  skilledDuration,
  trainSkill,
} from "./skills.ts";
import {
  SKILL_CAP_MAIN,
  SKILL_CAP_OTHER,
  SKILL_CAP_SECONDARY,
  skillCap,
} from "./player-classes.ts";
import { getEffectiveMap, getOrCreatePlayerWorld } from "./world-bootstrap.ts";
import { savePlayerPosition } from "./player-persistence.ts";
import { loadPlayerInventory, savePlayerInventory } from "./item-storage.ts";
import {
  performTreeActionForUser,
  resolvePendingActionsForWorld,
} from "./tree-action-helpers.ts";
import {
  countLivingItemsByType,
  isWorldTileWalkable,
  worldTileValueForName,
} from "./world-domain.ts";
import {
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  primeTransactions,
  testUserId,
  trackTestWorld,
  walkableRunFinder,
} from "./test-fixtures.ts";

let counter = 0;

beforeEach(function () {
  primeTransactions();
});

afterEach(function () {
  cleanupTestData();
});

function give(userId: string, type: string): void {
  const inv = loadPlayerInventory(userId);
  inv.bag.push({ id: "test-item-" + ++counter + "-" + Date.now(), type: type });
  savePlayerInventory(userId, inv);
}

function setValue(userId: string, key: string, value: unknown): void {
  const inv = loadPlayerInventory(userId);
  inv.values[key] = value;
  savePlayerInventory(userId, inv);
}

function held(userId: string, type: string): number {
  return countLivingItemsByType(loadPlayerInventory(userId))[type] || 0;
}

describe("growth", () => {
  test("is quick at first and slows toward the cap", () => {
    const first = grownSkill(0, 2, 100);
    const late = grownSkill(90, 2, 100) - 90;

    expect(first).toBe(2);
    expect(late).toBeLessThan(first);
    expect(grownSkill(99.9, 50, 100)).toBe(100);
    expect(grownSkill(100, 2, 100)).toBe(100);
  });

  test("stops at each class's cap for the skill", () => {
    expect(skillCap("player_seppa", "takominen")).toBe(SKILL_CAP_MAIN);
    expect(skillCap("player_seppa", "lahitaistelu")).toBe(SKILL_CAP_SECONDARY);
    expect(skillCap("player_seppa", "soitto")).toBe(SKILL_CAP_OTHER);
    expect(skillCap("player_human", "soitto")).toBe(SKILL_CAP_OTHER);

    const values: Record<string, unknown> = { soitto: SKILL_CAP_OTHER };
    expect(trainSkill(values, "player_seppa", { id: "soitto", gain: 5 })).toBe(
      0,
    );
    expect(
      trainSkill(values, "player_laulaja", { id: "soitto", gain: 5 }),
    ).toBeGreaterThan(0);
  });
});

describe("what a skill changes", () => {
  test("rolls add the attribute modifier and a fifth of the skill", () => {
    expect(
      rollBonus(
        { voima: 15, lahitaistelu: 40 },
        {
          id: "lahitaistelu",
          attribute: "voima",
          gain: 1,
        },
      ),
    ).toBe(2 + 2);
    expect(
      rollBonus(
        { voima: 8 },
        { id: "lahitaistelu", attribute: "voima", gain: 1 },
      ),
    ).toBe(-1);
  });

  test("durations shorten to half at the top, and yields grow by fifties", () => {
    expect(skilledDuration(10000, 0)).toBe(10000);
    expect(skilledDuration(10000, 50)).toBe(7500);
    expect(skilledDuration(10000, 100)).toBe(5000);
    expect(extraYield(49)).toBe(0);
    expect(extraYield(100)).toBe(2);
  });

  test("a minimum hides and refuses what a player cannot yet do", () => {
    const skill = { id: "takominen", min: 40, gain: 1 };
    expect(meetsSkillMin({ takominen: 39 }, skill)).toBe(false);
    expect(meetsSkillMin({ takominen: 40 }, skill)).toBe(true);
    expect(meetsSkillMin({}, { id: "takominen", gain: 1 })).toBe(true);
  });
});

describe("skills in play", () => {
  /** A newcomer on their island, at its edge with the sea to the south. */
  function fisherOnIsland(): { userId: string; island: string } {
    const userId = testUserId("fisher");
    const island = trackTestWorld(getOrCreatePlayerWorld(userId));
    const map = getEffectiveMap(island);
    const ocean = worldTileValueForName("ocean");
    for (let row = 0; row + 1 < map.length; row++) {
      for (let col = 0; col < map[row].length; col++) {
        if (isWorldTileWalkable(map[row][col]) && map[row + 1][col] === ocean) {
          savePlayerPosition(userId, island, {
            row: row,
            col: col,
            seq: 0,
            rotation: 0,
          });
          give(userId, "boat");
          return { userId: userId, island: island };
        }
      }
    }
    throw new Error("the island has no shore");
  }

  test("fishing trains hunting", () => {
    const { userId, island } = fisherOnIsland();

    performTreeActionForUser(userId, { action: "fish" });
    resolvePendingActionsForWorld(island, Date.now() + 60000);

    expect(Number(loadPlayerInventory(userId).values.metsastys)).toBe(2);
  });

  test("a skilled fisher lands more", () => {
    const { userId, island } = fisherOnIsland();
    setValue(userId, "metsastys", 60);

    performTreeActionForUser(userId, { action: "fish" });
    resolvePendingActionsForWorld(island, Date.now() + 60000);

    expect(held(userId, "pike_jawbone")).toBe(2);
  });

  test("a skilled woodworker carves a boat sooner", () => {
    const forest = createTestWorld(16, 16);
    const runs = walkableRunFinder(forest)(2);
    const novice = createTestPlayer(forest, "novice", runs[0]);
    const master = createTestPlayer(forest, "master", runs[1]);
    [novice, master].forEach(function (userId) {
      give(userId, "starter_kit");
      give(userId, "log");
    });
    setValue(master, "puutyo", 100);

    const now = Date.now();
    const slow = performTreeActionForUser(novice, {
      action: "craft_boat",
    }).payload;
    const quick = performTreeActionForUser(master, {
      action: "craft_boat",
    }).payload;

    expect(slow.started).toBe(true);
    expect(quick.started).toBe(true);
    expect(slow.ready_at - now).toBeGreaterThan(9000);
    expect(quick.ready_at - now).toBeLessThan(6000);
  });
});
