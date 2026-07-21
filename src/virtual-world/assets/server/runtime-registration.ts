import { vwLog } from "./diagnostics.ts";
import { VIRTUAL_WORLD_EVENTS_STREAM_PATH } from "./runtime-config.ts";
import { getAllActionIds } from "./item-registry.ts";

function safeRegisterRoute(
  path: string,
  handler: string,
  method: string,
  opts?: any,
): void {
  try {
    if (opts) {
      routeRegistry.registerRoute(path, handler, method, opts);
    } else {
      routeRegistry.registerRoute(path, handler, method);
    }
  } catch (e) {
    vwLog("route registration skipped", {
      path: path,
      method: method,
      error: String(e),
    });
  }
}

function safeRegisterStreamRoute(
  path: string,
  customizationFunction?: string,
): void {
  try {
    if (customizationFunction) {
      routeRegistry.registerStreamRoute(path, customizationFunction);
    } else {
      routeRegistry.registerStreamRoute(path);
    }
  } catch (e) {
    vwLog("stream route registration skipped", {
      path: path,
      error: String(e),
    });
  }
}

function safeRegisterTool(
  name: string,
  description: string,
  schema: string,
  handlerName: string,
): void {
  try {
    mcpRegistry.registerTool(name, description, schema, handlerName);
  } catch (e) {
    vwLog("mcp tool registration skipped", {
      name: name,
      handler: handlerName,
      error: String(e),
    });
  }
}

function safeRegisterAssetRoute(path: string, assetPath: string): void {
  try {
    routeRegistry.registerAssetRoute(path, assetPath);
  } catch (e) {
    vwLog("asset route registration skipped", {
      path: path,
      error: String(e),
    });
  }
}

export function registerVirtualWorldRuntime(): void {
  const virtualWorldActionIds = getAllActionIds();
  const virtualWorldStateSchema = JSON.stringify({
    type: "object",
    properties: {},
  });
  const virtualWorldMoveSchema = JSON.stringify({
    type: "object",
    properties: {
      direction: {
        type: "string",
        enum: ["north", "south", "east", "west", "up", "down", "left", "right"],
        description: "Direction to move the player by one tile",
      },
      rotation: {
        type: "number",
        description:
          "Optional facing rotation in radians; defaults to the chosen direction",
      },
      seq: {
        type: "number",
        description:
          "Optional client sequence number; defaults to the next canonical sequence",
      },
      session_id: {
        type: "string",
        description: "Optional movement session identifier; defaults to 'mcp'",
        default: "mcp",
      },
    },
    required: ["direction"],
  });
  const virtualWorldManageItemsSchema = JSON.stringify({
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "pick", "drop", "equip"],
        description:
          "List nearby items or perform an inventory/world item action",
        default: "list",
      },
      from: {
        type: "string",
        description:
          "Source selector for drop or equip: use 'inventory' (or the equivalent alias 'bag') for bag by index, or a living slot ID like 'left_hand'",
      },
      to: {
        type: "string",
        description:
          "Destination selector for equip: use 'inventory' (or the equivalent alias 'bag') for bag, or any valid living slot ID",
      },
      index: {
        type: "number",
        description:
          "Bag index used for drop or equip when from='inventory' (or 'bag')",
      },
    },
  });
  const virtualWorldActSchema = JSON.stringify({
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: virtualWorldActionIds,
        description: "World or item action to perform",
      },
      rotation: {
        type: "number",
        description:
          "Optional player facing rotation in radians; defaults to current player rotation",
      },
      row: {
        type: "number",
        description: "Optional player row; defaults to canonical player row",
      },
      col: {
        type: "number",
        description: "Optional player col; defaults to canonical player col",
      },
      destination_world_type: {
        type: "string",
        enum: ["forest", "island", "cave", "building"],
        description: "Optional portal destination world type for build_portal",
      },
      destination_world_rows: {
        type: "number",
        description:
          "Optional portal destination world height in tiles for build_portal (clamped to 8-200; defaults to 100)",
      },
      destination_world_cols: {
        type: "number",
        description:
          "Optional portal destination world width in tiles for build_portal (clamped to 8-200; defaults to 100)",
      },
      destination_world_class_id: {
        type: "string",
        description:
          "Optional world class ID for build_portal; supplies the destination's base type and default size (see virtualWorldManageWorldClasses)",
      },
    },
    required: ["action"],
  });

  safeRegisterRoute("/virtual-world/items", "itemsHandler", "GET");
  safeRegisterRoute("/virtual-world/item-action", "itemActionHandler", "POST");
  safeRegisterRoute("/virtual-world/craft", "craftHandler", "POST");
  safeRegisterTool(
    "virtualWorldGetState",
    "Get the authenticated player's current world, position, items, inventory, available actions, and movement options",
    virtualWorldStateSchema,
    "virtualWorldGetStateToolHandler",
  );
  safeRegisterTool(
    "virtualWorldMove",
    "Move the authenticated player one tile in a cardinal direction",
    virtualWorldMoveSchema,
    "virtualWorldMoveToolHandler",
  );
  safeRegisterTool(
    "virtualWorldManageItems",
    "List, pick up, drop, or equip items for the authenticated player",
    virtualWorldManageItemsSchema,
    "virtualWorldManageItemsToolHandler",
  );
  safeRegisterTool(
    "virtualWorldAct",
    "Perform authenticated player world actions such as cutting, planting, building, portal use, or blessings",
    virtualWorldActSchema,
    "virtualWorldActToolHandler",
  );

  const virtualWorldSetNicknameSchema = JSON.stringify({
    type: "object",
    properties: {
      nick: {
        type: "string",
        description: "New nickname for the authenticated player",
      },
    },
    required: ["nick"],
  });
  safeRegisterTool(
    "virtualWorldSetNickname",
    "Set the authenticated player's nickname",
    virtualWorldSetNicknameSchema,
    "virtualWorldSetNicknameToolHandler",
  );

  const virtualWorldManageItemClassesSchema = JSON.stringify({
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get", "create", "update", "delete"],
        description: "Operation to perform on item class definitions",
        default: "list",
      },
      id: {
        type: "string",
        description: "Item class ID (required for get, create, update, delete)",
      },
      kind: {
        type: "string",
        description:
          "Item kind, e.g. tool, material, resource, structure, furniture",
      },
      fallbackLabel: {
        type: "string",
        description: "Human-readable label for the item type",
      },
      labelKey: {
        type: "string",
        description: "i18n label key for the item type",
      },
      spawnable: {
        type: "boolean",
        description: "Whether the item spawns in the world",
      },
      extra: {
        type: "boolean",
        description: "Whether the item is in the extra item pool",
      },
      nonDroppable: {
        type: "boolean",
        description: "Whether the item cannot be dropped",
      },
      nonPickable: {
        type: "boolean",
        description: "Whether the item cannot be picked up",
      },
      color: {
        type: "number",
        description: "Hex color integer for the item (e.g. 0xffa500)",
      },
      actionIds: {
        type: "array",
        items: { type: "string" },
        description: "List of action IDs available for this item type",
      },
      stateTemplate: {
        type: "object",
        description:
          "Default per-instance state for newly spawned or crafted items",
      },
    },
  });
  safeRegisterTool(
    "virtualWorldManageItemClasses",
    "List, get, create, update, or delete item class definitions in the virtual world",
    virtualWorldManageItemClassesSchema,
    "virtualWorldManageItemClassesToolHandler",
  );

  const virtualWorldManageActionClassesSchema = JSON.stringify({
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get", "create", "update", "delete"],
        description: "Operation to perform on action class definitions",
        default: "list",
      },
      id: {
        type: "string",
        description:
          "Action class ID (required for get, create, update, delete)",
      },
      fallbackLabel: {
        type: "string",
        description: "Human-readable label for the action",
      },
      labelKey: {
        type: "string",
        description: "i18n label key for the action",
      },
      targetKind: {
        type: "string",
        enum: ["self", "facing_tile", "current_tile", "inventory"],
        description: "What the action targets",
      },
      sourceItemIds: {
        type: "array",
        items: { type: "string" },
        description:
          "Item IDs that the player must hold to perform this action",
      },
      canonicalId: {
        type: "string",
        description: "Optional canonical action ID this maps to",
      },
      logicSpec: {
        type: "object",
        description:
          "JSON logic spec with conditions and effects that operate on item state",
        properties: {
          conditions: {
            type: "array",
            items: { type: "object" },
            description:
              "Array of condition objects; all must pass for the action to succeed",
          },
          effects: {
            type: "array",
            items: { type: "object" },
            description: "Array of effect objects applied when action succeeds",
          },
          toastMessage: {
            type: "string",
            description: "Optional message shown to the player on success",
          },
        },
      },
      cost: {
        type: "array",
        items: {
          type: "object",
          properties: {
            itemId: { type: "string" },
            count: { type: "number" },
          },
        },
        description:
          "Optional item cost consumed from the player's inventory when the action succeeds",
      },
    },
  });
  safeRegisterTool(
    "virtualWorldManageActionClasses",
    "List, get, create, update, or delete action class definitions in the virtual world",
    virtualWorldManageActionClassesSchema,
    "virtualWorldManageActionClassesToolHandler",
  );

  const virtualWorldManageLivingClassesSchema = JSON.stringify({
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get", "create", "update", "delete"],
        description: "Operation to perform on living class definitions",
        default: "list",
      },
      id: {
        type: "string",
        description:
          "Living class ID (required for get, create, update, delete)",
      },
      kind: {
        type: "string",
        description: "Living kind: player, npc, or creature",
      },
      slotDefinitions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            labelKey: { type: "string" },
            fallbackLabel: { type: "string" },
            accepts: { type: "array", items: { type: "string" } },
            tags: { type: "array", items: { type: "string" } },
          },
        },
        description:
          "Equipment/body slot definitions for this living class, in order",
      },
      valueTemplate: {
        type: "object",
        description:
          "Default mutable living values for new instances of this class (e.g. fatigue)",
      },
      valueSchema: {
        type: "object",
        description:
          "Value schema keyed by value name, each entry describing kind (number/string/boolean), min/max, and optional label",
      },
    },
  });
  safeRegisterTool(
    "virtualWorldManageLivingClasses",
    "List, get, create, update, or delete living class definitions in the virtual world",
    virtualWorldManageLivingClassesSchema,
    "virtualWorldManageLivingClassesToolHandler",
  );

  const virtualWorldManageWorldClassesSchema = JSON.stringify({
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get", "create", "update", "delete"],
        description: "Operation to perform on world class definitions",
        default: "list",
      },
      id: {
        type: "string",
        description:
          "World class ID (required for get, create, update, delete)",
      },
      baseType: {
        type: "string",
        enum: ["forest", "island", "cave", "building"],
        description: "Built-in generation preset the world class is based on",
      },
      rows: {
        type: "number",
        description: "World height in tiles (clamped to 8-200)",
      },
      cols: {
        type: "number",
        description: "World width in tiles (clamped to 8-200)",
      },
      fallbackLabel: {
        type: "string",
        description: "Human-readable label for the world type",
      },
      labelKey: {
        type: "string",
        description: "i18n label key for the world type",
      },
    },
  });
  safeRegisterTool(
    "virtualWorldManageWorldClasses",
    "List, get, create, update, or delete world class definitions (world type, size) in the virtual world",
    virtualWorldManageWorldClassesSchema,
    "virtualWorldManageWorldClassesToolHandler",
  );

  safeRegisterAssetRoute("/virtual-world", "public/welcome.html");
  safeRegisterAssetRoute("/virtual-world/styles.css", "public/styles.css");
  safeRegisterAssetRoute("/virtual-world/app-state.js", "public/app-state.js");
  safeRegisterAssetRoute("/virtual-world/auth.js", "public/auth.js");
  safeRegisterAssetRoute("/virtual-world/i18n.js", "public/i18n.js");
  safeRegisterAssetRoute("/virtual-world/scene.js", "public/scene.js");
  safeRegisterAssetRoute(
    "/virtual-world/tiles-and-items.js",
    "public/tiles-and-items.js",
  );
  // The browser client is split into feature modules; load order matters and
  // is defined by the script tags in page-bootstrap.ts.
  var clientModules = [
    "client-core.js",
    "client-world-render.js",
    "client-avatars.js",
    "client-net.js",
    "client-actions.js",
    "client-panels.js",
    "client-chat.js",
    "client-item-actions.js",
    "client-tile-detail.js",
    "client-input.js",
    "client-editors.js",
    "client-main.js",
  ];
  for (var i = 0; i < clientModules.length; i++) {
    safeRegisterAssetRoute(
      "/virtual-world/" + clientModules[i],
      "public/" + clientModules[i],
    );
  }

  safeRegisterRoute("/virtual-world/play", "getVirtualWorldPage", "GET", {
    summary: "Virtual World (Play)",
    description:
      "Interactive 2.5D block world rendered with Three.js. Navigate with WASD or arrow keys. Requires authentication.",
    tags: ["Demo"],
  });
  safeRegisterRoute("/virtual-world/move", "moveHandler", "POST");
  safeRegisterRoute("/virtual-world/leave", "leaveHandler", "POST");
  safeRegisterRoute("/virtual-world/new-world", "newWorldHandler", "POST");
  safeRegisterRoute("/virtual-world/start-world", "startWorldHandler", "POST");
  safeRegisterRoute("/virtual-world/players", "playersHandler", "GET");
  safeRegisterRoute("/virtual-world/resync", "resyncHandler", "GET");
  safeRegisterRoute(
    "/virtual-world/current-world",
    "currentWorldHandler",
    "GET",
  );
  safeRegisterRoute("/virtual-world/npcs", "npcsHandler", "GET");
  safeRegisterRoute("/virtual-world/heartbeat", "heartbeatHandler", "POST");
  safeRegisterRoute("/virtual-world/tree-action", "treeActionHandler", "POST");
  safeRegisterRoute("/virtual-world/cheat-items", "cheatItemsHandler", "POST");
  safeRegisterRoute(
    "/virtual-world/set-nickname",
    "setNicknameHandler",
    "POST",
  );
  safeRegisterRoute(
    "/virtual-world/online-players",
    "onlinePlayersHandler",
    "GET",
  );
  safeRegisterRoute("/virtual-world/chat", "chatHandler", "POST");
  safeRegisterRoute("/virtual-world/dm", "dmHandler", "POST");
  safeRegisterRoute("/virtual-world/dm-history", "dmHistoryHandler", "GET");
  safeRegisterStreamRoute(
    VIRTUAL_WORLD_EVENTS_STREAM_PATH,
    "virtualWorldEventsStreamCustomizer",
  );
  safeRegisterRoute("/virtual-world/item-classes", "itemClassesHandler", "GET");
  safeRegisterRoute(
    "/virtual-world/item-classes",
    "createItemClassHandler",
    "POST",
  );
  safeRegisterRoute(
    "/virtual-world/item-classes/:id",
    "updateItemClassHandler",
    "PUT",
  );
  safeRegisterRoute(
    "/virtual-world/item-classes/:id",
    "deleteItemClassHandler",
    "DELETE",
  );
  safeRegisterRoute(
    "/virtual-world/action-classes",
    "actionClassesHandler",
    "GET",
  );
  safeRegisterRoute(
    "/virtual-world/action-classes",
    "createActionClassHandler",
    "POST",
  );
  safeRegisterRoute(
    "/virtual-world/action-classes/:id",
    "updateActionClassHandler",
    "PUT",
  );
  safeRegisterRoute(
    "/virtual-world/action-classes/:id",
    "deleteActionClassHandler",
    "DELETE",
  );
  safeRegisterRoute(
    "/virtual-world/living-classes",
    "livingClassesHandler",
    "GET",
  );
  safeRegisterRoute(
    "/virtual-world/living-classes",
    "createLivingClassHandler",
    "POST",
  );
  safeRegisterRoute(
    "/virtual-world/living-classes/:id",
    "updateLivingClassHandler",
    "PUT",
  );
  safeRegisterRoute(
    "/virtual-world/living-classes/:id",
    "deleteLivingClassHandler",
    "DELETE",
  );
  safeRegisterRoute(
    "/virtual-world/world-classes",
    "worldClassesHandler",
    "GET",
  );
  safeRegisterRoute(
    "/virtual-world/world-classes",
    "createWorldClassHandler",
    "POST",
  );
  safeRegisterRoute(
    "/virtual-world/world-classes/:id",
    "updateWorldClassHandler",
    "PUT",
  );
  safeRegisterRoute(
    "/virtual-world/world-classes/:id",
    "deleteWorldClassHandler",
    "DELETE",
  );
}
