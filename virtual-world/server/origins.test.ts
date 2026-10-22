/**
 * Tests for origins (synnyt): the spells of fire need the origin of fire, and
 * the elder teaches it — for nothing to a sage, for a birch-bark letter to
 * anyone else.
 *
 * What these guard is that the spellbook's place is taken properly: nobody
 * casts fire without the origin, nobody learns it away from the elder, and
 * the price is paid by those who owe it.
 *
 * The elder is spawned into a world of the test's own rather than met in
 * Väinölä, whose livings the running game ticks.
 */

import { spawnSingleWorldNPC } from "./npc-storage.ts";
import { getEffectiveMap } from "./world-bootstrap.ts";
import {
  advanceDialogueForUser,
  openDialogueForUser,
} from "./dialogue-helpers.ts";
import {
  deleteWorldItemById,
  ensureWorldItems,
  loadPlayerInventory,
  loadWorldItems,
  savePlayerInventory,
} from "./item-storage.ts";
import { saveChosenClassId } from "./player-character.ts";
import { performTreeActionForUser } from "./tree-action-helpers.ts";
import { getAllLivingItems, isWorldTileWalkable } from "./world-domain.ts";
import {
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  primeTransactions,
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

function carries(userId: string, type: string): boolean {
  return getAllLivingItems(loadPlayerInventory(userId)).some(function (item) {
    return item.type === type;
  });
}

/** An elder in a world of the test's own, and a player of `classId` beside him. */
function besideTheElder(
  classId: string,
  prefix: string,
): { userId: string; elderId: string } {
  const worldId = createTestWorld(16, 16);
  // A cost is paid from the ground around the player before the bag, and a
  // forest spawns letters at random: none may lie where the asking happens.
  ensureWorldItems(worldId);
  const byTile = loadWorldItems(worldId);
  Object.keys(byTile).forEach(function (key) {
    (byTile[key] || []).forEach(function (item: any) {
      if (item && item.type === "birch_bark_letter") {
        deleteWorldItemById(String(item.id));
      }
    });
  });
  const placed = spawnSingleWorldNPC(worldId, "npc_elder");
  if (!placed) throw new Error("no room for the elder");
  const at = { row: Number(placed.npc.row), col: Number(placed.npc.col) };
  const map = getEffectiveMap(worldId);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const row = at.row + dr;
      const col = at.col + dc;
      if ((dr || dc) && map[row] && isWorldTileWalkable(map[row][col])) {
        const userId = createTestPlayer(worldId, prefix, { row, col });
        give(userId, "starter_kit");
        const inv = loadPlayerInventory(userId);
        inv.class_id = classId;
        savePlayerInventory(userId, inv);
        saveChosenClassId(userId, classId);
        return { userId: userId, elderId: placed.npcId };
      }
    }
  }
  throw new Error("no free tile beside the elder");
}

/** Asks the elder for the origin of fire, through his dialogue. */
function askForFire(userId: string, elderId: string): any {
  const opened = openDialogueForUser(userId, elderId).payload;
  expect(opened.node.id).toBe("greeting");
  const ask = opened.node.choices.find(function (choice: any) {
    return String(choice.text_key).indexOf("ask_synty_tuli") !== -1;
  });
  expect(ask).toBeTruthy();
  return advanceDialogueForUser(userId, {
    target_living_id: elderId,
    node_id: "greeting",
    choice_index: ask.index,
  }).payload;
}

describe("the spells of fire", () => {
  test("are refused to someone who does not know the origin of fire", () => {
    const { userId } = besideTheElder("player_tietaja", "unlearned");

    const result = performTreeActionForUser(userId, {
      action: "fireball",
      row: 1,
      col: 1,
    }).payload;

    expect(result.ok).toBe(false);
    expect(result.error).toBe("error.origin_not_known");
  });
});

describe("the origin of fire", () => {
  test("is the sage's for the asking", () => {
    const { userId, elderId } = besideTheElder("player_tietaja", "sage");

    const answered = askForFire(userId, elderId);

    expect(answered.ok).toBe(true);
    expect(answered.node.id).toBe("learned_tuli");
    expect(loadPlayerInventory(userId).values.synty_tuli).toBe(1);
  });

  test("costs anyone else a birch-bark letter", () => {
    const { userId, elderId } = besideTheElder("player_urho", "hero");
    give(userId, "birch_bark_letter");

    const answered = askForFire(userId, elderId);

    expect(answered.ok).toBe(true);
    expect(loadPlayerInventory(userId).values.synty_tuli).toBe(1);
    expect(carries(userId, "birch_bark_letter")).toBe(false);
  });

  test("is not given to someone who cannot pay", () => {
    const { userId, elderId } = besideTheElder("player_seppa", "poor");

    const answered = askForFire(userId, elderId);

    expect(answered.ok).toBe(false);
    expect(loadPlayerInventory(userId).values.synty_tuli).toBeUndefined();
  });

  test("is only offered until it is known", () => {
    const { userId, elderId } = besideTheElder("player_tietaja", "known");
    askForFire(userId, elderId);

    const opened = openDialogueForUser(userId, elderId).payload;
    const asks = opened.node.choices.filter(function (choice: any) {
      return String(choice.text_key).indexOf("ask_synty_tuli") !== -1;
    });

    expect(asks).toHaveLength(0);
  });
});
