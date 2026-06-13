import { getAllActionIds } from "./item-registry.ts";

type RegisterDeps = {
  routeRegistry: {
    registerRoute: (
      path: string,
      handler: string,
      method: string,
      opts?: any,
    ) => void;
    registerStreamRoute: (path: string, customizationFunction?: string) => void;
    registerAssetRoute: (path: string, assetPath: string) => void;
  };
  mcpRegistry: {
    registerTool: (
      name: string,
      description: string,
      schema: string,
      handlerName: string,
    ) => void;
  };
  vwLog: (msg: string, obj?: unknown) => void;
  virtualWorldEventsStreamPath: string;
};

function safeRegisterRoute(
  deps: RegisterDeps,
  path: string,
  handler: string,
  method: string,
  opts?: any,
): void {
  try {
    if (opts) {
      deps.routeRegistry.registerRoute(path, handler, method, opts);
    } else {
      deps.routeRegistry.registerRoute(path, handler, method);
    }
  } catch (e) {
    deps.vwLog("route registration skipped", {
      path: path,
      method: method,
      error: String(e),
    });
  }
}

function safeRegisterStreamRoute(
  deps: RegisterDeps,
  path: string,
  customizationFunction?: string,
): void {
  try {
    if (customizationFunction) {
      deps.routeRegistry.registerStreamRoute(path, customizationFunction);
    } else {
      deps.routeRegistry.registerStreamRoute(path);
    }
  } catch (e) {
    deps.vwLog("stream route registration skipped", {
      path: path,
      error: String(e),
    });
  }
}

function safeRegisterTool(
  deps: RegisterDeps,
  name: string,
  description: string,
  schema: string,
  handlerName: string,
): void {
  try {
    deps.mcpRegistry.registerTool(name, description, schema, handlerName);
  } catch (e) {
    deps.vwLog("mcp tool registration skipped", {
      name: name,
      handler: handlerName,
      error: String(e),
    });
  }
}

function safeRegisterAssetRoute(
  deps: RegisterDeps,
  path: string,
  assetPath: string,
): void {
  try {
    deps.routeRegistry.registerAssetRoute(path, assetPath);
  } catch (e) {
    deps.vwLog("asset route registration skipped", {
      path: path,
      error: String(e),
    });
  }
}

export function registerVirtualWorldRuntime(deps: RegisterDeps): void {
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
        enum: ["left_hand", "right_hand", "inventory"],
        description: "Source slot for drop or equip",
      },
      to: {
        type: "string",
        enum: ["left_hand", "right_hand", "inventory"],
        description: "Destination slot for equip",
      },
      index: {
        type: "number",
        description: "Inventory index used for drop or equip from inventory",
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
    },
    required: ["action"],
  });

  safeRegisterRoute(deps, "/virtual-world/items", "itemsHandler", "GET");
  safeRegisterRoute(
    deps,
    "/virtual-world/item-action",
    "itemActionHandler",
    "POST",
  );
  safeRegisterRoute(deps, "/virtual-world/craft", "craftHandler", "POST");
  safeRegisterTool(
    deps,
    "virtualWorldGetState",
    "Get the authenticated player's current world, position, items, inventory, available actions, and movement options",
    virtualWorldStateSchema,
    "virtualWorldGetStateToolHandler",
  );
  safeRegisterTool(
    deps,
    "virtualWorldMove",
    "Move the authenticated player one tile in a cardinal direction",
    virtualWorldMoveSchema,
    "virtualWorldMoveToolHandler",
  );
  safeRegisterTool(
    deps,
    "virtualWorldManageItems",
    "List, pick up, drop, or equip items for the authenticated player",
    virtualWorldManageItemsSchema,
    "virtualWorldManageItemsToolHandler",
  );
  safeRegisterTool(
    deps,
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
    deps,
    "virtualWorldSetNickname",
    "Set the authenticated player's nickname",
    virtualWorldSetNicknameSchema,
    "virtualWorldSetNicknameToolHandler",
  );

  safeRegisterAssetRoute(deps, "/virtual-world", "public/welcome.html");
  safeRegisterAssetRoute(
    deps,
    "/virtual-world/styles.css",
    "public/styles.css",
  );
  safeRegisterAssetRoute(
    deps,
    "/virtual-world/app-state.js",
    "public/app-state.js",
  );
  safeRegisterAssetRoute(deps, "/virtual-world/auth.js", "public/auth.js");
  safeRegisterAssetRoute(deps, "/virtual-world/i18n.js", "public/i18n.js");
  safeRegisterAssetRoute(deps, "/virtual-world/scene.js", "public/scene.js");
  safeRegisterAssetRoute(
    deps,
    "/virtual-world/tiles-and-items.js",
    "public/tiles-and-items.js",
  );
  safeRegisterAssetRoute(deps, "/virtual-world/client.js", "public/client.js");

  safeRegisterRoute(deps, "/virtual-world/play", "getVirtualWorldPage", "GET", {
    summary: "Virtual World (Play)",
    description:
      "Interactive 2.5D block world rendered with Three.js. Navigate with WASD or arrow keys. Requires authentication.",
    tags: ["Demo"],
  });
  safeRegisterRoute(deps, "/virtual-world/move", "moveHandler", "POST");
  safeRegisterRoute(deps, "/virtual-world/leave", "leaveHandler", "POST");
  safeRegisterRoute(
    deps,
    "/virtual-world/new-world",
    "newWorldHandler",
    "POST",
  );
  safeRegisterRoute(
    deps,
    "/virtual-world/start-world",
    "startWorldHandler",
    "POST",
  );
  safeRegisterRoute(deps, "/virtual-world/players", "playersHandler", "GET");
  safeRegisterRoute(
    deps,
    "/virtual-world/current-world",
    "currentWorldHandler",
    "GET",
  );
  safeRegisterRoute(deps, "/virtual-world/npcs", "npcsHandler", "GET");
  safeRegisterRoute(
    deps,
    "/virtual-world/heartbeat",
    "heartbeatHandler",
    "POST",
  );
  safeRegisterRoute(
    deps,
    "/virtual-world/tree-action",
    "treeActionHandler",
    "POST",
  );
  safeRegisterRoute(
    deps,
    "/virtual-world/cheat-items",
    "cheatItemsHandler",
    "POST",
  );
  safeRegisterRoute(
    deps,
    "/virtual-world/set-nickname",
    "setNicknameHandler",
    "POST",
  );
  safeRegisterRoute(
    deps,
    "/virtual-world/online-players",
    "onlinePlayersHandler",
    "GET",
  );
  safeRegisterRoute(deps, "/virtual-world/chat", "chatHandler", "POST");
  safeRegisterRoute(deps, "/virtual-world/dm", "dmHandler", "POST");
  safeRegisterRoute(
    deps,
    "/virtual-world/dm-history",
    "dmHistoryHandler",
    "GET",
  );
  safeRegisterStreamRoute(
    deps,
    deps.virtualWorldEventsStreamPath,
    "virtualWorldEventsStreamCustomizer",
  );
  safeRegisterRoute(
    deps,
    "/virtual-world/item-classes",
    "itemClassesHandler",
    "GET",
  );
  safeRegisterRoute(
    deps,
    "/virtual-world/item-classes",
    "createItemClassHandler",
    "POST",
  );
  safeRegisterRoute(
    deps,
    "/virtual-world/item-classes/:id",
    "updateItemClassHandler",
    "PUT",
  );
  safeRegisterRoute(
    deps,
    "/virtual-world/item-classes/:id",
    "deleteItemClassHandler",
    "DELETE",
  );
}
