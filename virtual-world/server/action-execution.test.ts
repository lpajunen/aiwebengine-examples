/**
 * Tests for executing a creator-defined action.
 *
 * An action class is a small program: it may charge items and fatigue, hand
 * items back, award experience, and say something. Crafting is not a separate
 * system — it is an action whose `produces` names an item — so these cases are
 * the crafting tests as much as the action ones.
 *
 * What they are really guarding is the accounting. A cost that is charged twice,
 * or charged on a refusal, or an award that lands on every retry, is the kind of
 * bug nobody notices until an economy has drifted.
 *
 * Database-backed: each case builds a world, a player and an action class of its
 * own and removes them again.
 */

import {
  deleteActionClass,
  reloadActionClassCache,
  upsertActionClass,
} from "./item-registry.ts";
import {
  ensureWorldItems,
  loadPlayerInventory,
  savePlayerInventory,
} from "./item-storage.ts";
import { performTreeActionForUser } from "./tree-action-helpers.ts";
import {
  TestTile,
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  walkableRunFinder,
} from "./test-fixtures.ts";
import { getCanonicalPlayerState } from "./player-snapshots.ts";
import { upsertWorldItem } from "./item-storage.ts";
import { countLivingItemsByType } from "./world-domain.ts";
import { runInWorldTransaction } from "./world-db.ts";

let worldId = "";
let userId = "";
let tile: TestTile = { row: 0, col: 0 };
let counter = 0;
const createdActionIds: string[] = [];

beforeEach(function () {
  worldId = createTestWorld();
  const walkableRun = walkableRunFinder(worldId);
  userId = createTestPlayer(worldId, "action", walkableRun(1)[0], 0);
  const canonical = getCanonicalPlayerState(worldId, userId);
  tile = { row: canonical.row, col: canonical.col };
  // Seed the world here rather than letting the first action trigger it:
  // seeding rewrites the world's items, which would sweep away anything a
  // case had already placed on the ground.
  ensureWorldItems(worldId);
});

afterEach(function () {
  // Action classes are global, so they go in a transaction of their own —
  // an unwrapped delete would be undone with the rest of the run.
  runInWorldTransaction("test_action_cleanup", function () {
    for (let i = 0; i < createdActionIds.length; i++) {
      deleteActionClass(createdActionIds[i]);
    }
  });
  createdActionIds.length = 0;
  cleanupTestData();
});

// The tool that grants the actions below. An action is only usable when
// something the actor holds (or something lying nearby) grants it, so every
// case hands the player one of these first — a hammer here, standing in for
// whatever tool a creator would build the action around.
const SOURCE_ITEM = "hammer";

/** Register an action class for this case and return its id. */
function defineAction(spec: Record<string, unknown>): string {
  const id = "test_act_" + ++counter + "_" + Date.now();
  createdActionIds.push(id);
  upsertActionClass({
    id: id,
    labelKey: "action." + id + ".name",
    fallbackLabel: "Test action",
    targetKind: "self",
    sourceItemIds: [SOURCE_ITEM],
    ownerIds: ["test-owner"],
    labels: {},
    ...spec,
  } as any);
  // The executor reads through the class cache; make sure it is the row that
  // answers, exactly as another instance would see it — and that rebuilds the
  // item→actions index the usability check reads.
  reloadActionClassCache();
  giveToBag(SOURCE_ITEM, 1);
  return id;
}

function newItem(type: string): any {
  return { id: "test-item-" + ++counter + "-" + Date.now(), type: type };
}

function giveToBag(type: string, count: number): void {
  const inv = loadPlayerInventory(userId);
  for (let i = 0; i < count; i++) inv.bag.push(newItem(type));
  savePlayerInventory(userId, inv);
}

function held(type: string): number {
  return countLivingItemsByType(loadPlayerInventory(userId))[type] || 0;
}

function value(name: string): number {
  return Number(loadPlayerInventory(userId).values[name] || 0);
}

function act(action: string, body?: Record<string, unknown>): any {
  return performTreeActionForUser(userId, { action: action, ...(body || {}) });
}

describe("producing", () => {
  test("an action hands the item it produces to the actor", () => {
    const action = defineAction({
      produces: [{ itemId: "saw", count: 2 }],
    });

    const result = act(action);

    expect(result.payload.ok).toBe(true);
    expect(held("saw")).toBe(2);
  });

  test("running it twice produces twice", () => {
    // Nothing about the first run may consume the recipe.
    const action = defineAction({ produces: [{ itemId: "saw", count: 1 }] });

    act(action);
    act(action);

    expect(held("saw")).toBe(2);
  });

  test("an action can place what it produces on the ground instead", () => {
    const action = defineAction({
      produces: [{ itemId: "saw", count: 1, placement: "target_tile" }],
    });

    const result = act(action);

    expect(result.payload.ok).toBe(true);
    expect(held("saw")).toBe(0);
  });
});

describe("costs", () => {
  // Ingredients the world never scatters: an action's cost is paid from the
  // ground first and from the bag only for the rest, so a type the seeder
  // spawns (knife, flower, saw…) would make "was it the bag that paid?"
  // depend on where this world happened to drop things.
  const INGREDIENT = "sword";
  const OTHER_INGREDIENT = "shortbow";

  test("the ingredients are taken from the bag", () => {
    giveToBag(INGREDIENT, 2);
    const action = defineAction({
      cost: [{ itemId: INGREDIENT, count: 1 }],
      produces: [{ itemId: "saw", count: 1 }],
    });

    const result = act(action);

    expect(result.payload.ok).toBe(true);
    expect(held(INGREDIENT)).toBe(1);
    expect(held("saw")).toBe(1);
  });

  test("ingredients lying on the tile are used before the carried ones", () => {
    // Crafting on the spot must not require picking the parts up first — and
    // must spend what is underfoot rather than what is in the bag.
    upsertWorldItem(worldId, tile.row, tile.col, newItem(INGREDIENT));
    giveToBag(INGREDIENT, 1);
    const action = defineAction({
      cost: [{ itemId: INGREDIENT, count: 1 }],
      produces: [{ itemId: "saw", count: 1 }],
    });

    const result = act(action);

    expect(result.payload.ok).toBe(true);
    expect(held("saw")).toBe(1);
    expect(held(INGREDIENT)).toBe(1);
  });

  test("without the ingredients the action is refused and charges nothing", () => {
    giveToBag(INGREDIENT, 1);
    const action = defineAction({
      cost: [{ itemId: INGREDIENT, count: 3 }],
      produces: [{ itemId: "saw", count: 1 }],
    });

    const result = act(action);

    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toBe("error.missing_required_ingredients");
    // What it could not afford to spend is still there, and nothing was made.
    expect(held(INGREDIENT)).toBe(1);
    expect(held("saw")).toBe(0);
  });

  test("a refusal on one ingredient leaves the others untouched", () => {
    giveToBag(INGREDIENT, 2);
    giveToBag(OTHER_INGREDIENT, 1);
    const action = defineAction({
      cost: [
        { itemId: INGREDIENT, count: 1 },
        { itemId: OTHER_INGREDIENT, count: 5 },
      ],
    });

    act(action);

    // The affordable ingredient must not be spent on an action that cannot
    // run: the check clears every line before anything is charged.
    expect(held(INGREDIENT)).toBe(2);
    expect(held(OTHER_INGREDIENT)).toBe(1);
  });

  test("fatigue is charged on success", () => {
    const action = defineAction({ fatigueCost: 3 });
    const before = value("fatigue");

    act(action);

    expect(value("fatigue") - before).toBe(3);
  });
});

describe("experience", () => {
  test("a successful action awards it once", () => {
    const action = defineAction({ experience: { amount: 7 } });
    const before = value("experience");
    const beforeTotal = value("totalExperience");

    const result = act(action);

    expect(result.payload.experience_gained).toBe(7);
    expect(value("experience") - before).toBe(7);
    // Total experience is the lifetime tally: spending experience on levels
    // must not be able to erase what was earned.
    expect(value("totalExperience") - beforeTotal).toBe(7);
  });

  test("each run awards it again", () => {
    const action = defineAction({ experience: { amount: 2 } });
    const before = value("experience");

    act(action);
    act(action);

    expect(value("experience") - before).toBe(4);
  });

  test("a kill-scaled award grants nothing for merely acting", () => {
    // fight is configured this way: starting one must not pay out — the
    // combat resolver awards on the kill, scaled by the target's level.
    const action = defineAction({
      experience: { amount: 50, onKill: true },
    });
    const before = value("experience");

    const result = act(action);

    expect(result.payload.ok).toBe(true);
    expect(result.payload.experience_gained).toBeUndefined();
    expect(value("experience")).toBe(before);
  });

  test("a refused action awards nothing", () => {
    const action = defineAction({
      cost: [{ itemId: "sword", count: 1 }],
      experience: { amount: 9 },
    });
    const before = value("experience");

    act(action);

    expect(value("experience")).toBe(before);
  });
});

describe("what the actor is told", () => {
  test("the configured toast rides back with the result", () => {
    const action = defineAction({
      execution: {
        toastMessage: "You do the thing.",
        toastMessageKey: "test.action.done",
      },
    });

    const result = act(action);

    expect(result.payload.toast_message).toBe("You do the thing.");
    // The key is what the client localizes; the English text is its fallback.
    expect(result.payload.toast_message_key).toBe("test.action.done");
  });

  test("an action with no toast simply reports success", () => {
    const action = defineAction({});

    const result = act(action);

    expect(result.payload.ok).toBe(true);
    expect(result.payload.toast_message).toBeUndefined();
  });
});

describe("refusals", () => {
  test("an action nobody defined is a 400", () => {
    const result = act("no_such_action");

    expect(result.status).toBe(400);
    expect(result.payload.error).toBe("error.invalid_action");
  });

  test("a player in no world is told so", () => {
    const action = defineAction({});

    const result = performTreeActionForUser("test-action-worldless", {
      action: action,
    });

    expect(result.payload.ok).toBe(false);
    expect(result.payload.error).toBe("error.no_world_found");
  });
});
