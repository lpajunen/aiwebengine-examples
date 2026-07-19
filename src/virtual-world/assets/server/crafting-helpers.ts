import { getRecipeDefinition } from "./item-registry.ts";
import {
  consumeLivingItemsByType,
  getAllLivingItems,
  LivingState,
} from "./world-domain.ts";

type RecipeDeps = {
  getPlayerWorld: (userId: string) => string;
  ensureWorldItems: (worldId: string) => void;
  loadPlayerInventory: (userId: string) => LivingState;
  savePlayerInventory: (userId: string, inventory: unknown) => void;
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
  getItemStateTemplate?: (type: string) => Record<string, unknown>;
};

function countItemsByType(inventory: LivingState): Record<string, number> {
  const counts: Record<string, number> = {};
  const items = getAllLivingItems(inventory);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const type = item && item.type ? String(item.type) : "";
    if (!type) continue;
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
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
    return {
      status: 400,
      payload: { ok: false, error: "error.unknown_recipe" },
    };
  }

  const worldId = deps.getPlayerWorld(userId);
  if (!worldId) {
    return {
      status: 200,
      payload: { ok: false, error: "error.no_world_found" },
    };
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
          error: "error.missing_required_ingredients",
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

  const map = deps.getEffectiveMap(worldId);
  const mapRows = map.length;
  const mapCols = map[0] ? map[0].length : 0;
  if (
    target.row < 0 ||
    target.row >= mapRows ||
    target.col < 0 ||
    target.col >= mapCols
  ) {
    return {
      status: 200,
      payload: {
        ok: false,
        error: "error.target_out_of_bounds",
        recipe_id: recipe.id,
      },
    };
  }

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
            error: "error.oak_clearing_must_remain_open",
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
            error: "error.cannot_place_tree_here",
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
            error: "error.oak_clearing_must_remain_open",
            recipe_id: recipe.id,
          },
        };
      }
      if (map[target.row][target.col] !== 0 || houses[tileKey]) {
        return {
          status: 200,
          payload: {
            ok: false,
            error: "error.cannot_place_house_here",
            recipe_id: recipe.id,
          },
        };
      }
    }
  }

  for (let i = 0; i < recipe.inputItems.length; i++) {
    const input = recipe.inputItems[i];
    consumeLivingItemsByType(inventory, input.itemId, input.count);
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
          state: deps.getItemStateTemplate
            ? deps.getItemStateTemplate(output.itemId)
            : undefined,
        };
        inventory.bag.push(craftedItem);
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
