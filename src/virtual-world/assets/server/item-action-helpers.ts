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

type ItemActionDeps = {
  getPlayerWorld: (userId: string) => string;
  ensureWorldItems: (worldId: string) => void;
  getCanonicalPlayerState: (
    worldId: string,
    userId: string,
  ) => { row: number; col: number; seq: number; rotation: number };
  loadPlayerInventory: (userId: string) => LivingState;
  loadWorldItems: (worldId: string) => Record<string, any[]>;
  isPickableWorldItem: (item: any) => boolean;
  deleteWorldItems: (items: any[]) => void;
  savePlayerInventory: (userId: string, inventory: unknown) => void;
  saveWorldItems: (worldId: string, items: Record<string, any[]>) => void;
  broadcastItemChange: (
    worldId: string,
    actorType: string,
    actorId: string,
    action: string,
    row: number,
    col: number,
    items: any[],
  ) => void;
  flattenWorldItems: (itemsByTile: Record<string, any[]>) => Array<any>;
  upsertWorldItem: (
    worldId: string,
    row: number,
    col: number,
    item: any,
  ) => void;
  getAllKnownItemTypes: () => string[];
  getItemStateTemplate?: (type: string) => Record<string, unknown>;
};

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
  deps: ItemActionDeps,
): { status: number; payload: any } {
  const action = String((body && body.action) || "");
  const worldId = deps.getPlayerWorld(userId);
  if (!worldId) {
    return { status: 200, payload: { ok: false, error: "No world found" } };
  }
  deps.ensureWorldItems(worldId);

  const canonical = deps.getCanonicalPlayerState(worldId, userId);
  const tileKey = canonical.row + "_" + canonical.col;
  const inv = deps.loadPlayerInventory(userId);
  const worldItems = deps.loadWorldItems(worldId);

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
      return deps.isPickableWorldItem(item);
    });
    const remainingOnTile = allTileItems.filter(function (item) {
      return item && !deps.isPickableWorldItem(item);
    });
    if (picked.length > 0) {
      for (let i = 0; i < picked.length; i++) {
        inv.bag.push(picked[i]);
      }
      deps.deleteWorldItems(picked);
      if (remainingOnTile.length > 0) {
        worldItems[tileKey] = remainingOnTile;
      } else {
        delete worldItems[tileKey];
      }
      deps.savePlayerInventory(userId, inv);
      deps.broadcastItemChange(
        worldId,
        "player",
        userId,
        getItemChangeActionId("pick"),
        canonical.row,
        canonical.col,
        picked,
      );
    }
    return {
      status: 200,
      payload: {
        ok: true,
        action: "pick",
        picked_count: picked.length,
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
        payload: { ok: false, error: "Invalid drop source" },
      };
    }

    if (dropItem.non_droppable) {
      return {
        status: 200,
        payload: { ok: false, error: "Item cannot be dropped" },
      };
    }

    if (!worldItems[tileKey]) worldItems[tileKey] = [];
    worldItems[tileKey].push(dropItem);

    deps.savePlayerInventory(userId, inv);
    deps.upsertWorldItem(worldId, canonical.row, canonical.col, dropItem);
    deps.broadcastItemChange(
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
      return { status: 200, payload: { ok: false, error: "No item to equip" } };
    }

    if (!canEquipItemToSelector(inv, toSlot, movingItem)) {
      placeItemToSelector(inv, fromSlot, movingItem);
      return {
        status: 200,
        payload: {
          ok: false,
          error: "Item cannot be equipped to destination slot",
        },
      };
    }

    if (!placeItemToSelector(inv, toSlot, movingItem)) {
      placeItemToSelector(inv, fromSlot, movingItem);
      return {
        status: 200,
        payload: { ok: false, error: "Invalid destination slot" },
      };
    }

    deps.savePlayerInventory(userId, inv);
    return {
      status: 200,
      payload: {
        ok: true,
        action: "equip",
        inventory: inv,
      },
    };
  }

  return { status: 400, payload: { ok: false, error: "Unknown action" } };
}

export function grantAllItemsForUser(
  userId: string,
  deps: Pick<
    ItemActionDeps,
    | "getPlayerWorld"
    | "loadPlayerInventory"
    | "getAllKnownItemTypes"
    | "savePlayerInventory"
    | "ensureWorldItems"
    | "loadWorldItems"
    | "flattenWorldItems"
    | "getItemStateTemplate"
  >,
): {
  ok: boolean;
  action: string;
  granted_count: number;
  inventory: LivingState;
  items: Array<any>;
} {
  const worldId = deps.getPlayerWorld(userId) || "";
  const inv = deps.loadPlayerInventory(userId);
  const itemTypes = deps.getAllKnownItemTypes().filter(function (type) {
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
      state: deps.getItemStateTemplate
        ? deps.getItemStateTemplate(itemTypes[i])
        : undefined,
    });
    grantedCount++;
  }

  deps.savePlayerInventory(userId, inv);

  let itemsSnapshot: Array<any> = [];
  if (worldId) {
    deps.ensureWorldItems(worldId);
    itemsSnapshot = deps.flattenWorldItems(deps.loadWorldItems(worldId));
  }

  return {
    ok: true,
    action: "cheat_grant_all",
    granted_count: grantedCount,
    inventory: inv,
    items: itemsSnapshot,
  };
}
