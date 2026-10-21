/**
 * Tests for player classes: what a newcomer is, how they become something
 * from the elder in Väinölä, and what they come back as after death.
 *
 * What these guard is that a class is a lasting choice. A player who could
 * choose twice, choose without the elder, or come back from death as a
 * newcomer would make the class meaningless.
 *
 * Database-backed; every player and world a case makes is removed afterwards.
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
  loadPlayerInventory,
  savePlayerInventory,
  upsertWorldItem,
} from "./item-storage.ts";
import { loadPlayerPosition } from "./player-persistence.ts";
import { performTreeActionForUser } from "./tree-action-helpers.ts";
import { retireOldPlayerClass } from "./page-bootstrap.ts";
import { loadChosenClassId } from "./player-character.ts";
import { attributeModifier, PLAYER_CLASSES } from "./player-classes.ts";
import { isWorldTileWalkable } from "./world-domain.ts";
import {
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  primeTransactions,
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

/**
 * An elder of the test's own, in a world of its own: Väinölä's is live, and a
 * test transaction that touches its livings holds up the world tick until the
 * run ends.
 */
function elder(): { worldId: string; id: string; row: number; col: number } {
  const worldId = createTestWorld(16, 16);
  const placed = spawnSingleWorldNPC(worldId, "npc_elder");
  if (!placed) throw new Error("no room for the elder");
  return {
    worldId: worldId,
    id: placed.npcId,
    row: Number(placed.npc.row),
    col: Number(placed.npc.col),
  };
}

/** A newcomer standing beside the given tile of the world. */
function newcomerNear(
  worldId: string,
  tile: { row: number; col: number },
  prefix: string,
): string {
  const map = getEffectiveMap(worldId);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const row = tile.row + dr;
      const col = tile.col + dc;
      if ((dr || dc) && map[row] && isWorldTileWalkable(map[row][col])) {
        const userId = createTestPlayer(worldId, prefix, {
          row: row,
          col: col,
        });
        give(userId, "starter_kit");
        return userId;
      }
    }
  }
  throw new Error("no free tile beside " + tile.row + "," + tile.col);
}

function act(userId: string, action: string, extra?: any): any {
  return performTreeActionForUser(
    userId,
    Object.assign({ action: action }, extra || {}),
  ).payload;
}

describe("a newcomer", () => {
  test("starts with every attribute ordinary", () => {
    const forest = createTestWorld(16, 16);
    const userId = createTestPlayer(
      forest,
      "plain",
      walkableRunFinder(forest)(1)[0],
    );
    const inv = loadPlayerInventory(userId);

    expect(inv.class_id).toBe("player_human");
    expect(inv.values.voima).toBe(10);
    expect(inv.values.sana).toBe(10);
  });

  test("is asked by the elder what they are, and the answer is their class", () => {
    const old = elder();
    const userId = newcomerNear(old.worldId, old, "chooser");

    const opened = openDialogueForUser(userId, old.id).payload;
    expect(opened.ok).toBe(true);
    expect(opened.node.id).toBe("newcomer");
    expect(opened.node.choices).toHaveLength(PLAYER_CLASSES.length);

    const sage = opened.node.choices.find(function (choice: any) {
      return choice.text_key === "dialogue.elder.choose.tietaja";
    });
    const answered = advanceDialogueForUser(userId, {
      target_living_id: old.id,
      node_id: "newcomer",
      choice_index: sage.index,
    }).payload;

    expect(answered.ok).toBe(true);
    expect(answered.node.id).toBe("chosen");
    const inv = loadPlayerInventory(userId);
    expect(inv.class_id).toBe("player_tietaja");
    expect(inv.values.tieto).toBe(15);
    expect(inv.values.voima).toBe(8);
    expect(inv.values.maxHitPoints).toBe(8);
    expect(loadChosenClassId(userId)).toBe("player_tietaja");
  });
});

describe("a chosen class", () => {
  test("cannot be chosen again", () => {
    const old = elder();
    const userId = newcomerNear(old.worldId, old, "twice");
    act(userId, "choose_class_urho", { target_living_id: old.id });

    expect(
      act(userId, "choose_class_seppa", { target_living_id: old.id }).error,
    ).toBe("error.class_already_chosen");
    expect(loadPlayerInventory(userId).class_id).toBe("player_urho");
  });

  test("is chosen only from the elder", () => {
    const forest = createTestWorld(16, 16);
    const userId = createTestPlayer(
      forest,
      "far",
      walkableRunFinder(forest)(1)[0],
    );
    give(userId, "starter_kit");

    expect(
      act(userId, "choose_class_seppa", { target_living_id: elder().id }).error,
    ).toBe("error.ask_the_elder");
    expect(loadPlayerInventory(userId).class_id).toBe("player_human");
  });

  test("is what a dead player prays their way back to", () => {
    const old = elder();
    const userId = newcomerNear(old.worldId, old, "mortal");
    act(userId, "choose_class_laulaja", { target_living_id: old.id });
    // Dead, and with an old oak beside them to pray at.
    const inv = loadPlayerInventory(userId);
    inv.class_id = "player_ghost";
    savePlayerInventory(userId, inv);
    const at = loadPlayerPosition(userId)!;
    upsertWorldItem(old.worldId, at.row, at.col, {
      id: "test-oak-" + ++counter + "-" + Date.now(),
      type: "old_oak",
    });

    expect(act(userId, "pray").ok).toBe(true);

    expect(loadPlayerInventory(userId).class_id).toBe("player_laulaja");
  });
});

describe("the bodies classes replaced", () => {
  test("turn their players into newcomers", () => {
    const forest = createTestWorld(16, 16);
    const userId = createTestPlayer(
      forest,
      "elf",
      walkableRunFinder(forest)(1)[0],
    );
    const inv = loadPlayerInventory(userId);
    inv.class_id = "player_elf";
    savePlayerInventory(userId, inv);

    retireOldPlayerClass(userId);

    expect(loadPlayerInventory(userId).class_id).toBe("player_human");
  });
});

describe("attribute modifiers", () => {
  test("follow D&D", () => {
    expect(attributeModifier(8)).toBe(-1);
    expect(attributeModifier(10)).toBe(0);
    expect(attributeModifier(11)).toBe(0);
    expect(attributeModifier(15)).toBe(2);
  });
});

/** A player of the given class in a forest of their own, carrying `items`. */
function playerOfClass(classId: string, items: string[]): string {
  const forest = createTestWorld(16, 16);
  const userId = createTestPlayer(
    forest,
    "of-" + classId,
    walkableRunFinder(forest)(1)[0],
  );
  const inv = loadPlayerInventory(userId);
  inv.class_id = classId;
  savePlayerInventory(userId, inv);
  items.forEach(function (type) {
    give(userId, type);
  });
  return userId;
}

describe("what belongs to one class", () => {
  test("the fireball is the sage's alone", () => {
    const hero = playerOfClass("player_urho", ["spellbook"]);
    const sage = playerOfClass("player_tietaja", ["spellbook"]);
    const at = loadPlayerPosition(sage)!;

    expect(act(hero, "fireball", { row: at.row, col: at.col }).error).toBe(
      "error.not_for_your_class",
    );
    expect(act(sage, "fireball", { row: at.row, col: at.col }).error).not.toBe(
      "error.not_for_your_class",
    );
  });

  test("the longbow is carried by anyone but drawn only by a woodsman", () => {
    const hero = playerOfClass("player_urho", ["longbow"]);
    const woodsman = playerOfClass("player_erankavija", ["longbow"]);
    function equip(userId: string): any {
      const index = loadPlayerInventory(userId).bag.findIndex(function (
        item: any,
      ) {
        return item && item.type === "longbow";
      });
      return performTreeActionForUser(userId, {
        action: "equip",
        from: "bag",
        index: index,
        to: "right_hand",
      }).payload;
    }

    expect(equip(hero).error).toBe("error.not_for_your_class");
    expect(
      loadPlayerInventory(hero).bag.some(function (item: any) {
        return item && item.type === "longbow";
      }),
    ).toBe(true);
    expect(equip(woodsman).ok).toBe(true);
    expect(loadPlayerInventory(woodsman).slots.right_hand!.type).toBe(
      "longbow",
    );
  });
});
