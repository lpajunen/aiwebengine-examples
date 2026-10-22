/**
 * Tests for the chronicle: what happened in a world, told in verse.
 *
 * What these guard is that a line names everyone who did the deed, in a way a
 * reader of either language would say it, that the newest is told first, and
 * that a rune stone tells the chronicle of the world it stands in.
 */

import {
  joinNames,
  readChronicle,
  renderChronicle,
  writeChronicle,
} from "./chronicle.ts";
import { loadPlayerInventory, savePlayerInventory } from "./item-storage.ts";
import { getEffectiveNick } from "./social-state.ts";
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

describe("a chronicle line", () => {
  test("names everyone as a reader would say it", () => {
    expect(joinNames(["Aino"], "and")).toBe("Aino");
    expect(joinNames(["Aino", "Kalervo"], "ja")).toBe("Aino ja Kalervo");
    expect(joinNames(["Aino", "Kalervo", "Lemmikki"], "and")).toBe(
      "Aino, Kalervo and Lemmikki",
    );
  });

  test("is told in both languages", () => {
    const told = renderChronicle("oak_felled", ["Aino", "Kalervo"]);

    expect(told.fi[0]).toBe("Kaatui tammi kasvanehe,");
    expect(told.fi[told.fi.length - 1]).toBe("Aino ja Kalervo.");
    expect(told.en[told.en.length - 1]).toBe("Aino and Kalervo.");
  });
});

describe("a world's chronicle", () => {
  test("tells the newest first, by the doers' names", () => {
    const forest = createTestWorld(16, 16);
    const userId = createTestPlayer(
      forest,
      "builder",
      walkableRunFinder(forest)(1)[0],
    );

    writeChronicle(forest, "house_built", [userId]);
    writeChronicle(forest, "portal_raised", [userId]);

    const told = readChronicle(forest);
    expect(told.map((entry) => entry.kind)).toEqual([
      "portal_raised",
      "house_built",
    ]);
    expect(told[1].lines.fi.join(" ")).toContain(getEffectiveNick(userId));
  });

  test("is read from a rune stone", () => {
    const forest = createTestWorld(16, 16);
    const userId = createTestPlayer(
      forest,
      "reader",
      walkableRunFinder(forest)(1)[0],
    );
    writeChronicle(forest, "house_built", [userId]);
    const inv = loadPlayerInventory(userId);
    const stoneId = "test-runes-" + Date.now();
    inv.bag.push({ id: "test-kit-" + userId, type: "starter_kit" });
    inv.bag.push({ id: stoneId, type: "rune_stone" });
    savePlayerInventory(userId, inv);

    const result = performTreeActionForUser(userId, {
      action: "examine",
      target_item_id: stoneId,
    }).payload;

    expect(result.ok).toBe(true);
    expect(result.examined_item.chronicle).toHaveLength(1);
    expect(result.examined_item.chronicle[0].kind).toBe("house_built");
  });
});
