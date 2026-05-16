type ItemActionDeps = {
  getPlayerWorld: (userId: string) => string;
  ensureWorldItems: (worldId: string) => void;
  getCanonicalPlayerState: (
    worldId: string,
    userId: string,
  ) => { row: number; col: number; seq: number; rotation: number };
  loadPlayerInventory: (userId: string) => {
    left_hand: any;
    right_hand: any;
    inventory: any[];
  };
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
};

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
        inv.inventory.push(picked[i]);
      }
      deps.deleteWorldItems(picked);
      if (remainingOnTile.length > 0) {
        worldItems[tileKey] = remainingOnTile;
      } else {
        delete worldItems[tileKey];
      }
      deps.savePlayerInventory(userId, inv);
      deps.saveWorldItems(worldId, worldItems);
      deps.broadcastItemChange(
        worldId,
        "player",
        userId,
        "pick",
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
        inventory: inv,
        items: deps.flattenWorldItems(worldItems),
      },
    };
  }

  if (action === "drop") {
    const from = String(body.from || "");
    const index = Number(body.index);
    let dropItem = null;
    if (from === "left_hand" && inv.left_hand) {
      dropItem = inv.left_hand;
      inv.left_hand = null;
    } else if (from === "right_hand" && inv.right_hand) {
      dropItem = inv.right_hand;
      inv.right_hand = null;
    } else if (
      from === "inventory" &&
      Number.isFinite(index) &&
      index >= 0 &&
      index < inv.inventory.length
    ) {
      dropItem = inv.inventory.splice(index, 1)[0];
    } else {
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
    deps.saveWorldItems(worldId, worldItems);
    deps.broadcastItemChange(
      worldId,
      "player",
      userId,
      "drop",
      canonical.row,
      canonical.col,
      [dropItem],
    );

    return {
      status: 200,
      payload: {
        ok: true,
        action: "drop",
        inventory: inv,
        items: deps.flattenWorldItems(worldItems),
      },
    };
  }

  if (action === "equip") {
    const fromSlot = String(body.from || "");
    const toSlot = String(body.to || "");
    const fromIndex = Number(body.index);
    let movingItem = null;

    if (fromSlot === "left_hand" && inv.left_hand) {
      movingItem = inv.left_hand;
      inv.left_hand = null;
    } else if (fromSlot === "right_hand" && inv.right_hand) {
      movingItem = inv.right_hand;
      inv.right_hand = null;
    } else if (
      fromSlot === "inventory" &&
      Number.isFinite(fromIndex) &&
      fromIndex >= 0 &&
      fromIndex < inv.inventory.length
    ) {
      movingItem = inv.inventory.splice(fromIndex, 1)[0];
    }

    if (!movingItem) {
      return { status: 200, payload: { ok: false, error: "No item to equip" } };
    }

    if (toSlot === "left_hand") {
      if (inv.left_hand) inv.inventory.push(inv.left_hand);
      inv.left_hand = movingItem;
    } else if (toSlot === "right_hand") {
      if (inv.right_hand) inv.inventory.push(inv.right_hand);
      inv.right_hand = movingItem;
    } else if (toSlot === "inventory") {
      inv.inventory.push(movingItem);
    } else {
      if (fromSlot === "left_hand") inv.left_hand = movingItem;
      else if (fromSlot === "right_hand") inv.right_hand = movingItem;
      else inv.inventory.push(movingItem);
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
        items: deps.flattenWorldItems(worldItems),
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
  >,
): {
  ok: boolean;
  action: string;
  granted_count: number;
  inventory: { left_hand: any; right_hand: any; inventory: any[] };
  items: Array<any>;
} {
  const worldId = deps.getPlayerWorld(userId) || "";
  const inv = deps.loadPlayerInventory(userId);
  const itemTypes = deps.getAllKnownItemTypes().filter(function (type) {
    return type !== "portal";
  });
  const now = Date.now();

  const ownedTypes: Record<string, boolean> = {};
  if (inv.left_hand && inv.left_hand.type)
    ownedTypes[inv.left_hand.type] = true;
  if (inv.right_hand && inv.right_hand.type)
    ownedTypes[inv.right_hand.type] = true;
  if (Array.isArray(inv.inventory)) {
    for (let j = 0; j < inv.inventory.length; j++) {
      if (inv.inventory[j] && inv.inventory[j].type) {
        ownedTypes[inv.inventory[j].type] = true;
      }
    }
  }

  let grantedCount = 0;
  for (let i = 0; i < itemTypes.length; i++) {
    if (ownedTypes[itemTypes[i]]) continue;
    inv.inventory.push({
      id: makeCheatItemId(userId, worldId, i),
      type: itemTypes[i],
      created_at: now,
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
