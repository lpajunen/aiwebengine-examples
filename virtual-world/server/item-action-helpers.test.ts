/**
 * Tests for the item actions — pick, drop, equip, and the container moves.
 *
 * The property every case checks is conservation: an item action moves an item
 * between the ground, the bag, an equipment slot and a container, and must
 * never create or destroy one. That is the integrity TODO-arch item 3 is about,
 * written down as a test rather than as a hope.
 *
 * Database-backed; each case gets its own world and player from
 * test-fixtures.ts and deletes them again afterwards.
 */

import { handleItemActionForUser } from "./item-action-helpers.ts";
import {
  ensureWorldItems,
  loadPlayerInventory,
  loadWorldItems,
  savePlayerInventory,
  upsertWorldItem,
} from "./item-storage.ts";
import { getCanonicalPlayerState } from "./player-snapshots.ts";
import {
  TestTile,
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  walkableRunFinder,
} from "./test-fixtures.ts";

let worldId = "";
let userId = "";
let tile: TestTile = { row: 0, col: 0 };
let itemCounter = 0;

beforeEach(function () {
  worldId = createTestWorld();
  const walkableRun = walkableRunFinder(worldId);
  userId = createTestPlayer(worldId, "items", walkableRun(1)[0], 0);
  const canonical = getCanonicalPlayerState(worldId, userId);
  tile = { row: canonical.row, col: canonical.col };
  // Seed the world once up front so the "before" counts already include
  // whatever the world's own manifest puts on the ground.
  ensureWorldItems(worldId);
});

afterEach(function () {
  cleanupTestData();
});

function newItem(type: string, extra?: Record<string, unknown>): any {
  const item: Record<string, unknown> = {
    id: "test-item-" + ++itemCounter + "-" + Date.now(),
    type: type,
  };
  if (extra) {
    Object.keys(extra).forEach(function (key) {
      item[key] = extra[key];
    });
  }
  return item;
}

/** Put an item in the player's bag and return it. */
function giveToBag(item: any): any {
  const inv = loadPlayerInventory(userId);
  inv.bag.push(item);
  savePlayerInventory(userId, inv);
  return item;
}

/** Put an item on the tile the player is standing on. */
function dropOnTile(item: any): any {
  upsertWorldItem(worldId, tile.row, tile.col, item);
  return item;
}

function bagIndexOf(itemId: string): number {
  const inv = loadPlayerInventory(userId);
  for (let i = 0; i < inv.bag.length; i++) {
    if (inv.bag[i] && String(inv.bag[i].id) === itemId) return i;
  }
  return -1;
}

function countItems(list: any[]): number {
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item) continue;
    total++;
    const contents =
      item.state && Array.isArray(item.state.contents)
        ? item.state.contents
        : [];
    total += contents.length;
  }
  return total;
}

/** Every item the player or the world holds, containers counted inside out. */
function totalItems(): number {
  const inv = loadPlayerInventory(userId);
  const held: any[] = inv.bag.slice();
  Object.keys(inv.slots).forEach(function (slot) {
    if (inv.slots[slot]) held.push(inv.slots[slot]);
  });
  let total = countItems(held);
  const worldItems = loadWorldItems(worldId);
  Object.keys(worldItems).forEach(function (key) {
    if (Array.isArray(worldItems[key])) total += countItems(worldItems[key]);
  });
  return total;
}

function tileItems(): any[] {
  const worldItems = loadWorldItems(worldId);
  const key = tile.row + "_" + tile.col;
  return Array.isArray(worldItems[key]) ? worldItems[key] : [];
}

/** What the container with `containerId` in `list` is holding. */
function contentsOf(list: any[], containerId: string): any[] {
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || String(item.id) !== containerId) continue;
    return item.state && Array.isArray(item.state.contents)
      ? item.state.contents
      : [];
  }
  return [];
}

function hasItem(list: any[], itemId: string): boolean {
  return list.some(function (item) {
    return item && String(item.id) === itemId;
  });
}

describe("picking up", () => {
  test("takes what lies on the tile into the bag, and nothing more", () => {
    const knife = dropOnTile(newItem("knife"));
    const before = totalItems();
    const pickable = tileItems().length;

    const result = handleItemActionForUser(userId, { action: "pick" });

    expect(result.payload.ok).toBe(true);
    expect(result.payload.picked_count).toBe(pickable);
    expect(hasItem(loadPlayerInventory(userId).bag, knife.id)).toBe(true);
    expect(hasItem(tileItems(), knife.id)).toBe(false);
    expect(totalItems()).toBe(before);
  });

  test("leaves a fixture where it stands", () => {
    // A training post is scenery: it must not end up in someone's bag.
    const dummy = dropOnTile(newItem("training_dummy"));
    const before = totalItems();

    handleItemActionForUser(userId, { action: "pick" });

    expect(hasItem(tileItems(), dummy.id)).toBe(true);
    expect(hasItem(loadPlayerInventory(userId).bag, dummy.id)).toBe(false);
    expect(totalItems()).toBe(before);
  });

  test("picking an empty tile is a no-op, not an error", () => {
    handleItemActionForUser(userId, { action: "pick" });
    const before = totalItems();

    const result = handleItemActionForUser(userId, { action: "pick" });

    expect(result.payload.ok).toBe(true);
    expect(result.payload.picked_count).toBe(0);
    expect(totalItems()).toBe(before);
  });
});

describe("dropping", () => {
  test("moves the item from the bag to the ground", () => {
    const knife = giveToBag(newItem("knife"));
    const before = totalItems();

    const result = handleItemActionForUser(userId, {
      action: "drop",
      from: "inventory",
      index: bagIndexOf(knife.id),
    });

    expect(result.payload.ok).toBe(true);
    expect(hasItem(tileItems(), knife.id)).toBe(true);
    expect(hasItem(loadPlayerInventory(userId).bag, knife.id)).toBe(false);
    expect(totalItems()).toBe(before);
  });

  test("empties the slot when the item was equipped", () => {
    const knife = giveToBag(newItem("knife"));
    handleItemActionForUser(userId, {
      action: "equip",
      from: "inventory",
      index: bagIndexOf(knife.id),
      to: "right_hand",
    });
    const before = totalItems();

    handleItemActionForUser(userId, { action: "drop", from: "right_hand" });

    expect(loadPlayerInventory(userId).slots.right_hand).toBeFalsy();
    expect(hasItem(tileItems(), knife.id)).toBe(true);
    expect(totalItems()).toBe(before);
  });

  test("refuses an item that cannot be dropped, and keeps it", () => {
    const bound = giveToBag(newItem("knife", { non_droppable: true }));
    const before = totalItems();

    const result = handleItemActionForUser(userId, {
      action: "drop",
      from: "inventory",
      index: bagIndexOf(bound.id),
    });

    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toBe("error.item_cannot_be_dropped");
    // The item was taken out of the bag to be inspected — it must not be lost
    // on the way back.
    expect(totalItems()).toBe(before);
  });

  test("refuses a bag index that does not exist", () => {
    const before = totalItems();

    const result = handleItemActionForUser(userId, {
      action: "drop",
      from: "inventory",
      index: 99,
    });

    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toBe("error.invalid_drop_source");
    expect(totalItems()).toBe(before);
  });
});

describe("equipping", () => {
  test("moves an item from the bag into a slot", () => {
    const knife = giveToBag(newItem("knife"));
    const before = totalItems();

    const result = handleItemActionForUser(userId, {
      action: "equip",
      from: "inventory",
      index: bagIndexOf(knife.id),
      to: "right_hand",
    });

    expect(result.payload.ok).toBe(true);
    const inv = loadPlayerInventory(userId);
    expect(inv.slots.right_hand ? inv.slots.right_hand.id : "").toBe(knife.id);
    expect(hasItem(inv.bag, knife.id)).toBe(false);
    expect(totalItems()).toBe(before);
  });

  test("swapping returns the previous occupant to the bag", () => {
    const first = giveToBag(newItem("knife"));
    const second = giveToBag(newItem("saw"));
    handleItemActionForUser(userId, {
      action: "equip",
      from: "inventory",
      index: bagIndexOf(first.id),
      to: "right_hand",
    });
    const before = totalItems();

    handleItemActionForUser(userId, {
      action: "equip",
      from: "inventory",
      index: bagIndexOf(second.id),
      to: "right_hand",
    });

    const inv = loadPlayerInventory(userId);
    expect(inv.slots.right_hand ? inv.slots.right_hand.id : "").toBe(second.id);
    expect(hasItem(inv.bag, first.id)).toBe(true);
    expect(totalItems()).toBe(before);
  });

  test("an unknown destination slot leaves the item where it was", () => {
    const knife = giveToBag(newItem("knife"));
    const before = totalItems();

    const result = handleItemActionForUser(userId, {
      action: "equip",
      from: "inventory",
      index: bagIndexOf(knife.id),
      to: "third_hand",
    });

    expect(result.payload.ok).toBe(false);
    expect(hasItem(loadPlayerInventory(userId).bag, knife.id)).toBe(true);
    expect(totalItems()).toBe(before);
  });

  test("unequipping back to the bag keeps the item", () => {
    const knife = giveToBag(newItem("knife"));
    handleItemActionForUser(userId, {
      action: "equip",
      from: "inventory",
      index: bagIndexOf(knife.id),
      to: "right_hand",
    });
    const before = totalItems();

    handleItemActionForUser(userId, {
      action: "equip",
      from: "right_hand",
      to: "inventory",
    });

    const inv = loadPlayerInventory(userId);
    expect(inv.slots.right_hand).toBeFalsy();
    expect(hasItem(inv.bag, knife.id)).toBe(true);
    expect(totalItems()).toBe(before);
  });
});

describe("containers", () => {
  test("putting an item in a chest keeps it in the world", () => {
    const chest = giveToBag(newItem("chest"));
    const knife = giveToBag(newItem("knife"));
    const before = totalItems();

    const result = handleItemActionForUser(userId, {
      action: "container_put",
      container: { location: "bag", item_id: chest.id },
      from: "inventory",
      index: bagIndexOf(knife.id),
    });

    expect(result.payload.ok).toBe(true);
    const inv = loadPlayerInventory(userId);
    expect(hasItem(inv.bag, knife.id)).toBe(false);
    expect(hasItem(contentsOf(inv.bag, chest.id), knife.id)).toBe(true);
    expect(totalItems()).toBe(before);
  });

  test("taking it back out returns it to the bag", () => {
    const chest = giveToBag(newItem("chest"));
    const knife = giveToBag(newItem("knife"));
    handleItemActionForUser(userId, {
      action: "container_put",
      container: { location: "bag", item_id: chest.id },
      from: "inventory",
      index: bagIndexOf(knife.id),
    });
    const before = totalItems();

    const result = handleItemActionForUser(userId, {
      action: "container_get",
      container: { location: "bag", item_id: chest.id },
      content_index: 0,
      to: "inventory",
    });

    expect(result.payload.ok).toBe(true);
    expect(hasItem(loadPlayerInventory(userId).bag, knife.id)).toBe(true);
    expect(totalItems()).toBe(before);
  });

  test("a chest on the ground works the same way", () => {
    const chest = dropOnTile(newItem("chest"));
    const knife = giveToBag(newItem("knife"));
    const before = totalItems();

    const result = handleItemActionForUser(userId, {
      action: "container_put",
      container: { location: "tile", item_id: chest.id },
      from: "inventory",
      index: bagIndexOf(knife.id),
    });

    expect(result.payload.ok).toBe(true);
    expect(hasItem(contentsOf(tileItems(), chest.id), knife.id)).toBe(true);
    expect(totalItems()).toBe(before);
  });

  test("a chest cannot be put inside a chest", () => {
    const outer = giveToBag(newItem("chest"));
    const inner = giveToBag(newItem("chest"));
    const before = totalItems();

    const result = handleItemActionForUser(userId, {
      action: "container_put",
      container: { location: "bag", item_id: outer.id },
      from: "inventory",
      index: bagIndexOf(inner.id),
    });

    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toBe("error.container_cannot_nest");
    expect(hasItem(loadPlayerInventory(userId).bag, inner.id)).toBe(true);
    expect(totalItems()).toBe(before);
  });

  test("an item that is not a container refuses to hold anything", () => {
    const notAChest = giveToBag(newItem("knife"));
    const other = giveToBag(newItem("saw"));
    const before = totalItems();

    const result = handleItemActionForUser(userId, {
      action: "container_put",
      container: { location: "bag", item_id: notAChest.id },
      from: "inventory",
      index: bagIndexOf(other.id),
    });

    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toBe("error.not_a_container");
    expect(totalItems()).toBe(before);
  });

  test("a container that is nowhere to be found is reported, not guessed at", () => {
    const before = totalItems();

    const result = handleItemActionForUser(userId, {
      action: "container_put",
      container: { location: "bag", item_id: "no-such-chest" },
      from: "inventory",
      index: 0,
    });

    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toBe("error.container_not_found");
    expect(totalItems()).toBe(before);
  });

  test("an out-of-range content index takes nothing", () => {
    const chest = giveToBag(newItem("chest"));
    const before = totalItems();

    const result = handleItemActionForUser(userId, {
      action: "container_get",
      container: { location: "bag", item_id: chest.id },
      content_index: 3,
      to: "inventory",
    });

    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toBe("error.invalid_container_item");
    expect(totalItems()).toBe(before);
  });
});

describe("the action itself", () => {
  test("an unknown action is a 400", () => {
    const result = handleItemActionForUser(userId, { action: "eat" });
    expect(result.status).toBe(400);
    expect(result.payload.error).toBe("error.unknown_action");
  });

  test("a player in no world is told so rather than crashing", () => {
    const result = handleItemActionForUser("test-items-worldless", {
      action: "pick",
    });
    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toBe("error.no_world_found");
  });
});
