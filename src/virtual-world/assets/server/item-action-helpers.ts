import { getItemStateTemplate, isPickableWorldItem } from "./item-registry.ts";
import {
  deleteWorldItems,
  ensureWorldItems,
  flattenWorldItems,
  loadPlayerInventory,
  loadWorldItems,
  savePlayerInventory,
  upsertWorldItem,
} from "./item-storage.ts";
import { getPlayerWorld } from "./player-persistence.ts";
import { getCanonicalPlayerState } from "./player-snapshots.ts";
import { broadcastItemChange } from "./stream-broadcast.ts";
import { getAllKnownItemTypes } from "./world-domain.ts";
import { getItemChangeDefinition } from "./item-events.ts";
import {
  getDefaultPlayerLivingClassId,
  getLivingClass,
} from "./living-registry.ts";
import {
  canEquipItemInSlot,
  getAllLivingItems,
  LivingState,
} from "./world-domain.ts";

function isBagSelector(selector: string): boolean {
  const key = String(selector || "");
  return key === "inventory" || key === "bag";
}

function takeItemFromSelector(
  inv: {
    slots: Record<string, any>;
    bag: any[];
  },
  selector: string,
  index: number,
): any {
  if (isBagSelector(selector)) {
    if (!Number.isFinite(index) || index < 0 || index >= inv.bag.length) {
      return null;
    }
    return inv.bag.splice(index, 1)[0];
  }
  if (!inv.slots || typeof inv.slots !== "object") return null;
  const current = inv.slots[selector];
  if (!current) return null;
  inv.slots[selector] = null;
  return current;
}

function placeItemToSelector(
  inv: {
    slots: Record<string, any>;
    bag: any[];
  },
  selector: string,
  item: any,
): boolean {
  if (isBagSelector(selector)) {
    inv.bag.push(item);
    return true;
  }
  if (!inv.slots || typeof inv.slots !== "object") return false;
  if (!(selector in inv.slots)) return false;
  if (inv.slots[selector]) {
    inv.bag.push(inv.slots[selector]);
  }
  inv.slots[selector] = item;
  return true;
}

function canEquipItemToSelector(
  inv: {
    class_id: string;
    slots: Record<string, any>;
  },
  selector: string,
  item: any,
): boolean {
  if (isBagSelector(selector)) return true;
  if (!inv.slots || typeof inv.slots !== "object") return false;
  if (!(selector in inv.slots)) return false;

  const classId = inv.class_id || getDefaultPlayerLivingClassId();
  const livingClass = getLivingClass(classId);
  if (!livingClass || !Array.isArray(livingClass.slotDefinitions)) return true;
  const itemType = String((item && item.type) || "");
  return canEquipItemInSlot(livingClass, selector, itemType);
}

function makeCheatItemId(
  userId: string,
  worldId: string,
  index: number,
): string {
  return (
    "u" +
    String(userId) +
    "_w" +
    String(worldId || "none") +
    "_cheat_" +
    Date.now().toString(36) +
    "_" +
    String(index)
  );
}

export function handleItemActionForUser(
  userId: string,
  body: any,
): { status: number; payload: any } {
  const action = String((body && body.action) || "");
  const worldId = getPlayerWorld(userId);
  if (!worldId) {
    return {
      status: 200,
      payload: { ok: false, error: "error.no_world_found" },
    };
  }
  ensureWorldItems(worldId);

  const canonical = getCanonicalPlayerState(worldId, userId);
  const tileKey = canonical.row + "_" + canonical.col;
  const inv = loadPlayerInventory(userId);
  const worldItems = loadWorldItems(worldId);

  function getItemChangeActionId(itemChangeId: string): string {
    const itemChange = getItemChangeDefinition(itemChangeId);
    return itemChange ? itemChange.id : String(itemChangeId || "");
  }

  function getTileItemsSnapshot(row: number, col: number): any[] {
    const key = row + "_" + col;
    return Array.isArray(worldItems[key]) ? worldItems[key] : [];
  }

  if (action === "pick") {
    const allTileItems = Array.isArray(worldItems[tileKey])
      ? worldItems[tileKey]
      : [];
    const picked = allTileItems.filter(function (item) {
      return isPickableWorldItem(item);
    });
    // Claim by delete: only items whose rows this request actually removed
    // are granted, so a concurrent pickup of the same item cannot dupe it.
    const claimed = picked.length > 0 ? deleteWorldItems(picked) : [];
    if (claimed.length > 0) {
      const claimedIds: Record<string, boolean> = {};
      for (let i = 0; i < claimed.length; i++) {
        inv.bag.push(claimed[i]);
        claimedIds[String(claimed[i].id)] = true;
      }
      const remainingOnTile = allTileItems.filter(function (item) {
        return item && !claimedIds[String(item.id)];
      });
      if (remainingOnTile.length > 0) {
        worldItems[tileKey] = remainingOnTile;
      } else {
        delete worldItems[tileKey];
      }
      savePlayerInventory(userId, inv);
      broadcastItemChange(
        worldId,
        "player",
        userId,
        getItemChangeActionId("pick"),
        canonical.row,
        canonical.col,
        claimed,
      );
    }
    return {
      status: 200,
      payload: {
        ok: true,
        action: "pick",
        picked_count: claimed.length,
        row: canonical.row,
        col: canonical.col,
        tile_items: getTileItemsSnapshot(canonical.row, canonical.col),
        inventory: inv,
      },
    };
  }

  if (action === "drop") {
    const from = String(body.from || "");
    const index = Number(body.index);
    const dropItem = takeItemFromSelector(inv, from, index);
    if (!dropItem) {
      return {
        status: 200,
        payload: { ok: false, error: "error.invalid_drop_source" },
      };
    }

    if (dropItem.non_droppable) {
      return {
        status: 200,
        payload: { ok: false, error: "error.item_cannot_be_dropped" },
      };
    }

    if (!worldItems[tileKey]) worldItems[tileKey] = [];
    worldItems[tileKey].push(dropItem);

    savePlayerInventory(userId, inv);
    upsertWorldItem(worldId, canonical.row, canonical.col, dropItem);
    broadcastItemChange(
      worldId,
      "player",
      userId,
      getItemChangeActionId("drop"),
      canonical.row,
      canonical.col,
      [dropItem],
    );

    return {
      status: 200,
      payload: {
        ok: true,
        action: "drop",
        row: canonical.row,
        col: canonical.col,
        tile_items: getTileItemsSnapshot(canonical.row, canonical.col),
        inventory: inv,
      },
    };
  }

  if (action === "equip") {
    const fromSlot = String(body.from || "");
    const toSlot = String(body.to || "");
    const fromIndex = Number(body.index);
    const movingItem = takeItemFromSelector(inv, fromSlot, fromIndex);

    if (!movingItem) {
      return {
        status: 200,
        payload: { ok: false, error: "error.no_item_to_equip" },
      };
    }

    if (!canEquipItemToSelector(inv, toSlot, movingItem)) {
      placeItemToSelector(inv, fromSlot, movingItem);
      return {
        status: 200,
        payload: {
          ok: false,
          error: "error.item_cannot_be_equipped",
        },
      };
    }

    if (!placeItemToSelector(inv, toSlot, movingItem)) {
      placeItemToSelector(inv, fromSlot, movingItem);
      return {
        status: 200,
        payload: { ok: false, error: "error.invalid_destination_slot" },
      };
    }

    savePlayerInventory(userId, inv);
    return {
      status: 200,
      payload: {
        ok: true,
        action: "equip",
        inventory: inv,
      },
    };
  }

  return { status: 400, payload: { ok: false, error: "error.unknown_action" } };
}

export function grantAllItemsForUser(userId: string): {
  ok: boolean;
  action: string;
  granted_count: number;
  inventory: LivingState;
  items: Array<any>;
} {
  const worldId = getPlayerWorld(userId) || "";
  const inv = loadPlayerInventory(userId);
  const itemTypes = getAllKnownItemTypes().filter(function (type) {
    return type !== "portal";
  });
  const now = Date.now();

  const ownedTypes: Record<string, boolean> = {};
  const heldItems = getAllLivingItems(inv);
  for (let i = 0; i < heldItems.length; i++) {
    if (heldItems[i] && heldItems[i].type) {
      ownedTypes[heldItems[i].type] = true;
    }
  }

  let grantedCount = 0;
  for (let i = 0; i < itemTypes.length; i++) {
    if (ownedTypes[itemTypes[i]]) continue;
    inv.bag.push({
      id: makeCheatItemId(userId, worldId, i),
      type: itemTypes[i],
      created_at: now,
      state: getItemStateTemplate
        ? getItemStateTemplate(itemTypes[i])
        : undefined,
    });
    grantedCount++;
  }

  savePlayerInventory(userId, inv);

  let itemsSnapshot: Array<any> = [];
  if (worldId) {
    ensureWorldItems(worldId);
    itemsSnapshot = flattenWorldItems(loadWorldItems(worldId));
  }

  return {
    ok: true,
    action: "cheat_grant_all",
    granted_count: grantedCount,
    inventory: inv,
    items: itemsSnapshot,
  };
}
