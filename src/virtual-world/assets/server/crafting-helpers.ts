import { getRecipeDefinition } from "./item-registry.ts";

type RecipeDeps = {
  getPlayerWorld: (userId: string) => string;
  ensureWorldItems: (worldId: string) => void;
  loadPlayerInventory: (userId: string) => {
    left_hand: any;
    right_hand: any;
    inventory: any[];
  };
  savePlayerInventory: (userId: string, inventory: any) => void;
  getCanonicalPlayerState: (
    worldId: string,
    userId: string,
  ) => { row: number; col: number; seq: number; rotation: number };
  getTargetTileFromRotation: (
    row: number,
    col: number,
    rotation: number,
  ) => { row: number; col: number };
  nextWorldItemId: (worldId: string) => number;
  getEffectiveMap: (worldId: string) => number[][];
  loadWorldTrees: (worldId: string) => Record<string, any>;
  saveWorldTrees: (worldId: string, trees: Record<string, any>) => void;
  loadWorldHouses: (worldId: string) => Record<string, any>;
  saveWorldHouses: (worldId: string, houses: Record<string, any>) => void;
  isOakCenterTile: (worldId: string, row: number, col: number) => boolean;
  isOakClearingTile: (worldId: string, row: number, col: number) => boolean;
  sendWorldScopedStreamEvent: (
    worldId: string,
    eventType: string,
    payload: any,
  ) => void;
  ROWS: number;
  COLS: number;
};

function countItemsByType(inventory: any): Record<string, number> {
  const counts: Record<string, number> = {};
  const items = [];
  if (inventory && inventory.left_hand) items.push(inventory.left_hand);
  if (inventory && inventory.right_hand) items.push(inventory.right_hand);
  if (inventory && Array.isArray(inventory.inventory)) {
    for (let i = 0; i < inventory.inventory.length; i++) {
      items.push(inventory.inventory[i]);
    }
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const type = item && item.type ? String(item.type) : "";
    if (!type) continue;
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

function consumeInventoryItems(
  inventory: any,
  itemId: string,
  count: number,
): void {
  let remaining = Number(count || 0);
  if (remaining <= 0) return;
  if (
    remaining > 0 &&
    inventory.left_hand &&
    String(inventory.left_hand.type || "") === String(itemId)
  ) {
    inventory.left_hand = null;
    remaining--;
  }
  if (
    remaining > 0 &&
    inventory.right_hand &&
    String(inventory.right_hand.type || "") === String(itemId)
  ) {
    inventory.right_hand = null;
    remaining--;
  }
  if (remaining > 0 && Array.isArray(inventory.inventory)) {
    for (let i = inventory.inventory.length - 1; i >= 0 && remaining > 0; i--) {
      const item = inventory.inventory[i];
      if (!item || String(item.type || "") !== String(itemId)) continue;
      inventory.inventory.splice(i, 1);
      remaining--;
    }
  }
}

function makeCraftedItemId(worldId: string, itemSeq: number): string {
  return "w" + worldId + "_i" + String(itemSeq);
}

export function craftRecipeForUser(
  userId: string,
  body: any,
  deps: RecipeDeps,
): { status: number; payload: any } {
  const recipeId = String((body && body.recipe_id) || "");
  const recipe = getRecipeDefinition(recipeId);
  if (!recipe) {
    return { status: 400, payload: { ok: false, error: "Unknown recipe" } };
  }

  const worldId = deps.getPlayerWorld(userId);
  if (!worldId) {
    return { status: 200, payload: { ok: false, error: "No world found" } };
  }
  deps.ensureWorldItems(worldId);

  const inventory = deps.loadPlayerInventory(userId);
  const counts = countItemsByType(inventory);
  for (let i = 0; i < recipe.inputItems.length; i++) {
    const input = recipe.inputItems[i];
    if ((counts[input.itemId] || 0) < Number(input.count || 0)) {
      return {
        status: 200,
        payload: {
          ok: false,
          error: "Missing required ingredients",
          recipe_id: recipe.id,
        },
      };
    }
  }

  const canonical = deps.getCanonicalPlayerState(worldId, userId);
  const target =
    recipe.targetKind === "facing_tile"
      ? deps.getTargetTileFromRotation(
          canonical.row,
          canonical.col,
          Number.isFinite(Number(body && body.rotation))
            ? Number(body.rotation)
            : canonical.rotation,
        )
      : { row: canonical.row, col: canonical.col };

  if (
    target.row < 0 ||
    target.row >= deps.ROWS ||
    target.col < 0 ||
    target.col >= deps.COLS
  ) {
    return {
      status: 200,
      payload: {
        ok: false,
        error: "Target out of bounds",
        recipe_id: recipe.id,
      },
    };
  }

  const map = deps.getEffectiveMap(worldId);
  const trees = deps.loadWorldTrees(worldId);
  const houses = deps.loadWorldHouses(worldId);
  const tileKey = target.row + "_" + target.col;

  for (let i = 0; i < recipe.outputs.length; i++) {
    const output = recipe.outputs[i];
    if (output.kind === "place_tree") {
      const existingTree = trees[tileKey] && trees[tileKey].action === "plant";
      const wasCut = trees[tileKey] && trees[tileKey].action === "cut";
      const baseHasTree = map[target.row][target.col] === 2;
      if (deps.isOakClearingTile(worldId, target.row, target.col)) {
        return {
          status: 200,
          payload: {
            ok: false,
            error: "The oak clearing must remain open",
            recipe_id: recipe.id,
          },
        };
      }
      if (
        existingTree ||
        (baseHasTree && !wasCut) ||
        (map[target.row][target.col] !== 0 && !wasCut)
      ) {
        return {
          status: 200,
          payload: {
            ok: false,
            error: "Cannot place tree here",
            recipe_id: recipe.id,
          },
        };
      }
    }
    if (output.kind === "place_house") {
      if (deps.isOakClearingTile(worldId, target.row, target.col)) {
        return {
          status: 200,
          payload: {
            ok: false,
            error: "The oak clearing must remain open",
            recipe_id: recipe.id,
          },
        };
      }
      if (map[target.row][target.col] !== 0 || houses[tileKey]) {
        return {
          status: 200,
          payload: {
            ok: false,
            error: "Cannot place house here",
            recipe_id: recipe.id,
          },
        };
      }
    }
  }

  for (let i = 0; i < recipe.inputItems.length; i++) {
    const input = recipe.inputItems[i];
    consumeInventoryItems(inventory, input.itemId, input.count);
  }

  const craftedItems = [];
  for (let i = 0; i < recipe.outputs.length; i++) {
    const output = recipe.outputs[i];
    if (output.kind === "item") {
      for (let count = 0; count < Number(output.count || 0); count++) {
        const craftedItem = {
          id: makeCraftedItemId(worldId, deps.nextWorldItemId(worldId)),
          type: output.itemId,
          created_at: Date.now(),
          crafted_by: userId,
          recipe_id: recipe.id,
        };
        inventory.inventory.push(craftedItem);
        craftedItems.push(craftedItem);
      }
      continue;
    }
    if (output.kind === "place_tree") {
      trees[tileKey] = {
        action: "plant",
        planted_by: userId,
        timestamp: Date.now(),
      };
      deps.saveWorldTrees(worldId, trees);
      deps.sendWorldScopedStreamEvent(String(worldId), "tree_changed", {
        action: "plant",
        row: target.row,
        col: target.col,
        actor_type: "player",
        actor_id: userId,
        player_id: userId,
        recipe_id: recipe.id,
      });
      continue;
    }
    if (output.kind === "place_house") {
      houses[tileKey] = {
        built_by: userId,
        actor_type: "player",
        timestamp: Date.now(),
      };
      deps.saveWorldHouses(worldId, houses);
      deps.sendWorldScopedStreamEvent(String(worldId), "house_changed", {
        action: "build_house",
        row: target.row,
        col: target.col,
        actor_type: "player",
        actor_id: userId,
        player_id: userId,
        recipe_id: recipe.id,
      });
    }
  }

  deps.savePlayerInventory(userId, inventory);

  return {
    status: 200,
    payload: {
      ok: true,
      action: "craft",
      recipe_id: recipe.id,
      inventory: inventory,
      crafted_items: craftedItems,
      row: target.row,
      col: target.col,
      world_id: String(worldId),
    },
  };
}
