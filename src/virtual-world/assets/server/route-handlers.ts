// Game HTTP route handlers, page handler, and SSE stream customizer.
import {
  buildResyncForUser,
  getCurrentWorldStateForHttpUser,
  getDirectMessageHistoryForUser,
  heartbeatForUser,
  leaveWorldForUser,
  listItemsForUser,
  listNPCsForUser,
  listOnlinePlayersForUser,
  listPlayersForUser,
  postDirectMessageForUser,
  postWorldChatForUser,
  setNicknameForUser,
} from "./http-handler-helpers.ts";
import {
  buildVirtualWorldPageState,
  renderVirtualWorldPageHtml,
} from "./page-bootstrap.ts";
import {
  switchUserToNewWorld,
  switchUserToStartWorld,
} from "./world-switch.ts";
import {
  nextDiagRequestId,
  summarizeInventory,
  summarizeItems,
  vwDiag,
} from "./diagnostics.ts";
import { loadPlayerInventory, loadWorldItems } from "./item-storage.ts";
import { movePlayerForUser } from "./move-player.ts";
import { getPlayerWorld } from "./player-persistence.ts";
import { getCanonicalPlayerState } from "./player-snapshots.ts";
import {
  getEffectiveNick,
  sendGlobalPresenceEvent,
  updateOnlinePresence,
} from "./social-state.ts";
import { runInWorldTransaction } from "./world-db.ts";
import {
  OAK_WORLD_ID,
  WORLD_TYPE_FOREST,
  buildInventorySelectors,
} from "./world-domain.ts";

/**
 * @param {*} context
 */
export function getVirtualWorldPage(context: any) {
  const req = context.request;
  if (!req.auth || !req.auth.isAuthenticated) {
    return ResponseBuilder.redirect(
      "/auth/login?redirect=" + encodeURIComponent("/virtual-world/play"),
    );
  }
  const state = buildVirtualWorldPageState(
    req.auth.userId,
    req.auth.userName || "",
  );
  return ResponseBuilder.html(renderVirtualWorldPageHtml(state));
}

/**
 * @param {*} context
 * @returns {Record<string, string>}
 */
export function virtualWorldEventsStreamCustomizer(context: any) {
  var userId =
    context &&
    context.request &&
    context.request.auth &&
    context.request.auth.userId;
  if (!userId) return {};
  var currentWorldId = getPlayerWorld(String(userId));
  var filter: Record<string, string> = { recipient_id: String(userId) };
  if (currentWorldId) {
    filter.world_id = String(currentWorldId);
  }
  return filter;
}

/**
 * @param {*} context
 */
export function itemsHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(listItemsForUser(userId));
}

/**
 * @param {any} payload
 * @returns {any}
 */
export function withInventorySelectors(payload: any) {
  if (!payload || typeof payload !== "object" || !payload.inventory) {
    return payload;
  }
  var selectors = buildInventorySelectors(payload.inventory);
  payload.inventory_slot_ids = selectors.inventory_slot_ids;
  payload.inventory_selectors = selectors.inventory_selectors;
  return payload;
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
export function handleItemActionForUser(userId: any, body: any): any {
  return runInWorldTransaction("item_action", function () {
    return handleItemActionForUser(userId, body);
  });
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
export function craftRecipeForUser(userId: any, body: any): any {
  return runInWorldTransaction("craft", function () {
    return craftRecipeForUserInner(userId, body);
  });
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
export function craftRecipeForUserInner(userId: any, body: any): any {
  return craftRecipeForUser(userId, body);
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
export function performTreeActionForUser(userId: any, body: any): any {
  return runInWorldTransaction("tree_action", function () {
    return performTreeActionForUserInner(userId, body);
  });
}

/**
 * @param {string} userId
 * @param {*} body
 * @returns {{status: number, payload: any}}
 */
export function performTreeActionForUserInner(userId: any, body: any): any {
  return performTreeActionForUser(userId, body);
}

/**
 * @param {*} context
 */
export function itemActionHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON body" }, 400);
  }

  var itemRid = nextDiagRequestId();
  var worldIdBefore = getPlayerWorld(userId) || "";
  var posBefore = worldIdBefore
    ? getCanonicalPlayerState(worldIdBefore, userId)
    : null;
  var invBefore = loadPlayerInventory(userId);
  vwDiag("item_action.request", {
    rid: itemRid,
    user_id: userId,
    action: body && body.action ? String(body.action) : "",
    body: body,
    world_id: worldIdBefore,
    position_before: posBefore,
    inventory_before: summarizeInventory(invBefore),
  });

  var handled = handleItemActionForUser(userId, body);
  var worldIdAfter = getPlayerWorld(userId) || worldIdBefore;
  var posAfter = worldIdAfter
    ? getCanonicalPlayerState(worldIdAfter, userId)
    : null;
  var invAfter = loadPlayerInventory(userId);
  var tileItemsAfter = [];
  if (worldIdAfter && posAfter) {
    var tileKeyAfter = String(posAfter.row) + "_" + String(posAfter.col);
    var worldItemsAfter = loadWorldItems(worldIdAfter);
    tileItemsAfter = Array.isArray(worldItemsAfter[tileKeyAfter])
      ? worldItemsAfter[tileKeyAfter]
      : [];
  }
  vwDiag("item_action.result", {
    rid: itemRid,
    user_id: userId,
    status: handled.status,
    ok: !!(handled.payload && handled.payload.ok),
    error:
      handled.payload && handled.payload.error
        ? String(handled.payload.error)
        : "",
    world_id: worldIdAfter,
    position_after: posAfter,
    inventory_after: summarizeInventory(invAfter),
    tile_items_after: summarizeItems(tileItemsAfter),
  });
  return ResponseBuilder.json(
    withInventorySelectors(handled.payload),
    handled.status,
  );
}

/**
 * @param {*} context
 */
export function craftHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON body" }, 400);
  }

  var handled = craftRecipeForUser(userId, body);
  return ResponseBuilder.json(
    withInventorySelectors(handled.payload),
    handled.status,
  );
}

/**
 * @param {string} userId
 * @returns {{ok: boolean, action: string, granted_count: number, inventory: {class_id: string, slots: Record<string, any>, bag: any[], values: Record<string, any>}, items: Array<{id: string, type: string, row: number, col: number}>}}
 */
export function grantAllItemsForUser(userId: any): any {
  return runInWorldTransaction("cheat_grant_all", function () {
    return grantAllItemsForUser(userId);
  });
}

/**
 * @param {*} context
 */
export function setNicknameHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON" }, 400);
  }
  var handled = setNicknameForUser(userId, body.nick);
  if (handled && handled.status === 200 && handled.payload) {
    if (handled.payload.nick) {
      var currentWorldId = getPlayerWorld(userId);
      if (currentWorldId) {
        updateOnlinePresence(userId, currentWorldId, "");
      }
    } else if (handled.payload.inventory && handled.payload.message) {
      var currentWorldId = getPlayerWorld(userId);
      if (currentWorldId) {
        var existingNick = getEffectiveNick(userId);
        var presenceSelectors = buildInventorySelectors(
          handled.payload.inventory,
        );
        sendGlobalPresenceEvent(
          "upsert",
          userId,
          currentWorldId,
          existingNick,
          Date.now(),
          Date.now(),
          {
            inventory: handled.payload.inventory,
            inventory_slot_ids: presenceSelectors.inventory_slot_ids,
            inventory_selectors: presenceSelectors.inventory_selectors,
            items: handled.payload.items,
            message: handled.payload.message,
          },
        );
      }
    }
  }
  return ResponseBuilder.json(
    withInventorySelectors(handled.payload),
    handled.status,
  );
}

/**
 * @param {*} context
 */
export function onlinePlayersHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(listOnlinePlayersForUser(userId));
}

/**
 * @param {*} context
 */
export function chatHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON" }, 400);
  }
  var handled = postWorldChatForUser(userId, body.text);
  return ResponseBuilder.json(handled.payload, handled.status);
}

/**
 * @param {*} context
 */
export function dmHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON" }, 400);
  }
  var handled = postDirectMessageForUser(userId, body.to, body.text);
  return ResponseBuilder.json(handled.payload, handled.status);
}

/**
 * @param {*} context
 */
export function dmHistoryHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var handled = getDirectMessageHistoryForUser(
    userId,
    context.request.query && context.request.query["with"],
  );
  return ResponseBuilder.json(handled.payload, handled.status);
}

/**
 * @param {*} context
 */
export function cheatItemsHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(
    withInventorySelectors(grantAllItemsForUser(userId)),
  );
}

/**
 * @param {*} context
 */
export function moveHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON body" }, 400);
  }
  var moveRid = nextDiagRequestId();
  var moveWorldBefore = getPlayerWorld(userId) || "";
  var moveBefore = moveWorldBefore
    ? getCanonicalPlayerState(moveWorldBefore, userId)
    : null;
  vwDiag("move.request", {
    rid: moveRid,
    user_id: userId,
    body: body,
    world_id: moveWorldBefore,
    position_before: moveBefore,
  });
  var handled = movePlayerForUser(userId, body);
  var moveWorldAfter = getPlayerWorld(userId) || moveWorldBefore;
  var moveAfter = moveWorldAfter
    ? getCanonicalPlayerState(moveWorldAfter, userId)
    : null;
  vwDiag("move.result", {
    rid: moveRid,
    user_id: userId,
    status: handled.status,
    ok: !!(handled.payload && handled.payload.ok),
    error:
      handled.payload && handled.payload.error
        ? String(handled.payload.error)
        : "",
    world_id: moveWorldAfter,
    position_after: moveAfter,
    payload: handled.payload,
  });
  return ResponseBuilder.json(handled.payload, handled.status);
}

/**
 * @param {*} context
 */
export function leaveHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var sessionId = "";
  try {
    var body = JSON.parse(context.request.body || "{}");
    sessionId = body.session_id ? String(body.session_id) : "";
  } catch (e) {}
  return ResponseBuilder.json(leaveWorldForUser(userId, sessionId));
}

/**
 * @param {*} context
 */
export function heartbeatHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var sessionId = "";
  try {
    var body = JSON.parse(context.request.body || "{}");
    sessionId = body.session_id ? String(body.session_id) : "";
  } catch (e) {}
  return ResponseBuilder.json(heartbeatForUser(userId, sessionId));
}

/**
 * @param {*} context
 */
export function newWorldHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(switchUserToNewWorld(userId, WORLD_TYPE_FOREST));
}

/**
 * @param {*} context
 */
export function startWorldHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(
    switchUserToStartWorld(userId, OAK_WORLD_ID, WORLD_TYPE_FOREST),
  );
}

/**
 * @param {*} context
 */
export function playersHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(listPlayersForUser(userId));
}

/**
 * @param {*} context
 */
export function resyncHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var result = buildResyncForUser(userId);
  return ResponseBuilder.json(result.payload, result.status);
}

/**
 * @param {*} context
 */
export function currentWorldHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var worldRid = nextDiagRequestId();
  var snapshot = getCurrentWorldStateForHttpUser(userId);
  vwDiag("current_world.snapshot", {
    rid: worldRid,
    user_id: userId,
    ok: !!(snapshot && snapshot.ok),
    world_id: snapshot && snapshot.world_id ? String(snapshot.world_id) : "",
    player: snapshot && snapshot.player ? snapshot.player : null,
    inventory: summarizeInventory(snapshot && snapshot.inventory),
    tile_items: summarizeItems(snapshot && snapshot.tile_items),
    item_count: Array.isArray(snapshot && snapshot.items)
      ? snapshot.items.length
      : 0,
  });
  return ResponseBuilder.json(snapshot);
}

/**
 * @param {*} context
 */
export function npcsHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  return ResponseBuilder.json(listNPCsForUser(userId));
}

/**
 * @param {*} context
 */
export function treeActionHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON body" }, 400);
  }
  var handled = performTreeActionForUser(userId, body);
  return ResponseBuilder.json(
    withInventorySelectors(handled.payload),
    handled.status,
  );
}
