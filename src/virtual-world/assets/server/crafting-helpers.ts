import { getTargetTileFromRotation } from "./current-world-state.ts";
import { getItemStateTemplate } from "./item-registry.ts";
import {
  ensureWorldItems,
  loadPlayerInventory,
  nextWorldItemId,
  savePlayerInventory,
} from "./item-storage.ts";
import { getPlayerWorld } from "./player-persistence.ts";
import { getCanonicalPlayerState } from "./player-snapshots.ts";
import { sendWorldScopedStreamEvent } from "./stream-broadcast.ts";
import { getEffectiveMap } from "./world-bootstrap.ts";
import { isOakClearingTile } from "./world-domain.ts";
import {
  checkHouseBuildable,
  checkTreePlantable,
  loadWorldHouses,
  loadWorldTrees,
  saveWorldHouses,
  saveWorldTrees,
} from "./world-mod-storage.ts";
import { getRecipeDefinition } from "./item-registry.ts";
import {
  consumeLivingItemsByType,
  getAllLivingItems,
  LivingState,
} from "./world-domain.ts";

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
): { status: number; payload: any } {
  const recipeId = String((body && body.recipe_id) || "");
  const recipe = getRecipeDefinition(recipeId);
  if (!recipe) {
    return {
      status: 400,
      payload: { ok: false, error: "error.unknown_recipe" },
    };
  }

  const worldId = getPlayerWorld(userId);
  if (!worldId) {
    return {
      status: 200,
      payload: { ok: false, error: "error.no_world_found" },
    };
  }
  ensureWorldItems(worldId);

  const inventory = loadPlayerInventory(userId);
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

  const canonical = getCanonicalPlayerState(worldId, userId);
  const target =
    recipe.targetKind === "facing_tile"
      ? getTargetTileFromRotation(
          canonical.row,
          canonical.col,
          Number.isFinite(Number(body && body.rotation))
            ? Number(body.rotation)
            : canonical.rotation,
        )
      : { row: canonical.row, col: canonical.col };

  const map = getEffectiveMap(worldId);
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

  const trees = loadWorldTrees(worldId);
  const houses = loadWorldHouses(worldId);
  const tileKey = target.row + "_" + target.col;

  for (let i = 0; i < recipe.outputs.length; i++) {
    const output = recipe.outputs[i];
    if (output.kind === "place_tree") {
      if (isOakClearingTile(worldId, target.row, target.col)) {
        return {
          status: 200,
          payload: {
            ok: false,
            error: "error.oak_clearing_must_remain_open",
            recipe_id: recipe.id,
          },
        };
      }
      if (!checkTreePlantable(target.row, target.col, map, trees).ok) {
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
      if (isOakClearingTile(worldId, target.row, target.col)) {
        return {
          status: 200,
          payload: {
            ok: false,
            error: "error.oak_clearing_must_remain_open",
            recipe_id: recipe.id,
          },
        };
      }
      if (!checkHouseBuildable(target.row, target.col, map, houses).ok) {
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
          id: makeCraftedItemId(worldId, nextWorldItemId(worldId)),
          type: output.itemId,
          created_at: Date.now(),
          crafted_by: userId,
          recipe_id: recipe.id,
          state: getItemStateTemplate
            ? getItemStateTemplate(output.itemId)
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
      saveWorldTrees(worldId, trees);
      sendWorldScopedStreamEvent(String(worldId), "tree_changed", {
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
      saveWorldHouses(worldId, houses);
      sendWorldScopedStreamEvent(String(worldId), "house_changed", {
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

  savePlayerInventory(userId, inventory);

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
