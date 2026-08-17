/**
 * Tests for the HTTP handlers' contract with their caller.
 *
 * Handlers take the engine's request context rather than a user id, which makes
 * them the layer where authentication and permission live. A context is a plain
 * object, so these cases build one — an authenticated player, an anonymous
 * visitor, a body that is not JSON — and check what comes back before any game
 * logic is reached.
 *
 * The table-driven case is the important one: *every* route that serves a
 * player refuses an anonymous request. A new handler that forgets the check
 * fails here rather than in production.
 */

import {
  canManageClass,
  getAuthenticatedUserId,
  normalizeOwnerIdsInput,
  resolveUpdatedOwnerIds,
  setNicknameForUser,
  userHasCreatorStone,
} from "./http-handler-helpers.ts";
import {
  chatHandler,
  currentWorldHandler,
  dmHandler,
  dmHistoryHandler,
  heartbeatHandler,
  itemActionHandler,
  itemsHandler,
  leaveHandler,
  livingsHandler,
  moveHandler,
  onlinePlayersHandler,
  resyncHandler,
  setNicknameHandler,
  worldStateHandler,
} from "./route-handlers.ts";
import { VWORLD_ADMIN_TABLE } from "./runtime-config.ts";
import { loadPlayerInventory, savePlayerInventory } from "./item-storage.ts";
import {
  TestTile,
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  walkableRunFinder,
} from "./test-fixtures.ts";
import {
  deleteWorldRowsWhere,
  insertWorldRow,
  runInWorldTransaction,
} from "./world-db.ts";

let worldId = "";
let userId = "";
let tile: TestTile = { row: 1, col: 1 };
const adminUserIds: string[] = [];

beforeEach(function () {
  worldId = createTestWorld(20, 20);
  tile = walkableRunFinder(worldId)(1)[0];
  userId = createTestPlayer(worldId, "handler", tile, 0);
});

afterEach(function () {
  runInWorldTransaction("test_handler_cleanup", function () {
    for (let i = 0; i < adminUserIds.length; i++) {
      deleteWorldRowsWhere(
        VWORLD_ADMIN_TABLE,
        JSON.stringify({ user_id: adminUserIds[i] }),
      );
    }
  });
  adminUserIds.length = 0;
  cleanupTestData();
});

/** The engine's context for an authenticated request. */
function contextFor(user: string, body?: unknown): any {
  return {
    request: {
      auth: { isAuthenticated: true, userId: user },
      body: body === undefined ? "" : JSON.stringify(body),
      query: {},
      params: {},
      headers: {},
    },
  };
}

/** The same, for someone who never logged in. */
function anonymousContext(body?: unknown): any {
  return {
    request: {
      auth: { isAuthenticated: false },
      body: body === undefined ? "" : JSON.stringify(body),
      query: {},
      params: {},
      headers: {},
    },
  };
}

function payloadOf(response: any): any {
  try {
    return JSON.parse(String(response.body || "{}"));
  } catch (e) {
    return {};
  }
}

describe("who is asking", () => {
  test("an authenticated context yields the user", () => {
    expect(getAuthenticatedUserId(contextFor("player-1"))).toBe("player-1");
  });

  test("anything less yields nobody", () => {
    expect(getAuthenticatedUserId(anonymousContext())).toBeNull();
    expect(getAuthenticatedUserId({ request: {} })).toBeNull();
    expect(getAuthenticatedUserId({})).toBeNull();
    expect(
      getAuthenticatedUserId({
        request: { auth: { isAuthenticated: true } },
      }),
    ).toBeNull();
  });
});

describe("an anonymous request", () => {
  const handlers: Array<[string, (context: any) => any]> = [
    ["world state", worldStateHandler],
    ["items", itemsHandler],
    ["item action", itemActionHandler],
    ["set nickname", setNicknameHandler],
    ["online players", onlinePlayersHandler],
    ["chat", chatHandler],
    ["dm", dmHandler],
    ["dm history", dmHistoryHandler],
    ["move", moveHandler],
    ["leave", leaveHandler],
    ["heartbeat", heartbeatHandler],
    ["livings", livingsHandler],
    ["resync", resyncHandler],
    ["current world", currentWorldHandler],
  ];

  test("is refused by every handler that serves a player", () => {
    // One case rather than fourteen: a handler added without the check shows
    // up here by name.
    const served = handlers.filter(function (entry) {
      const response = entry[1](anonymousContext({}));
      return Number(response.status) !== 401;
    });
    expect(
      served.map(function (entry) {
        return entry[0];
      }),
    ).toEqual([]);
  });
});

describe("a malformed body", () => {
  test("is a 400 rather than a crash", () => {
    const context = contextFor(userId);
    context.request.body = "{not json";

    expect(setNicknameHandler(context).status).toBe(400);
    expect(moveHandler(context).status).toBe(400);
  });
});

describe("a handler doing its job", () => {
  test("setting a nickname reaches the player", () => {
    const response = setNicknameHandler(contextFor(userId, { nick: "Aino" }));

    expect(response.status).toBe(200);
    expect(payloadOf(response).nick).toBe("Aino");
    // And it is the same answer the helper gives when called directly.
    expect(setNicknameForUser(userId, "Aino").payload.nick).toBe("Aino");
  });

  test("a move goes through the context and comes back as a payload", () => {
    const response = moveHandler(
      contextFor(userId, {
        toRow: tile.row + 1,
        toCol: tile.col,
        seq: 1,
        session_id: "test-session",
      }),
    );

    expect(response.status).toBe(200);
    // Whether the step was legal is move-player's business; what matters here
    // is that the handler parsed, dispatched and answered.
    expect(typeof payloadOf(response).ok).toBe("boolean");
  });
});

describe("who may edit a class", () => {
  test("an owner may", () => {
    expect(canManageClass(userId, [userId])).toBe(true);
  });

  test("someone who is not an owner may not", () => {
    expect(canManageClass(userId, ["someone-else"])).toBe(false);
    expect(canManageClass(userId, [])).toBe(false);
    expect(canManageClass(userId, null)).toBe(false);
  });

  test("an administrator may, whoever owns it", () => {
    // vworld_admins has no route and no tool: rows are inserted by an operator
    // against the database, which is exactly what this does.
    adminUserIds.push(userId);
    // created_at is NOT NULL with no default, and an insert missing it fails
    // silently — the row simply never appears, and the permission check then
    // reports "not an admin" with nothing to say why.
    insertWorldRow(VWORLD_ADMIN_TABLE, {
      user_id: userId,
      created_at: Math.floor(Date.now() / 1000),
    });

    expect(canManageClass(userId, ["someone-else"])).toBe(true);
  });
});

describe("who may create one", () => {
  test("a player carrying the creator stone", () => {
    const inv = loadPlayerInventory(userId);
    inv.bag.push({ id: "test-stone-" + Date.now(), type: "creator_stone" });
    savePlayerInventory(userId, inv);

    expect(userHasCreatorStone(userId)).toBe(true);
  });

  test("and nobody else", () => {
    expect(userHasCreatorStone(userId)).toBe(false);
  });
});

describe("who owns a class after an edit", () => {
  test("an explicit owner list wins", () => {
    expect(
      resolveUpdatedOwnerIds(["new-owner"], ["old-owner"], "editor"),
    ).toEqual({ ownerIds: ["new-owner"], claimed: false });
  });

  test("an empty list is no opinion, not a release", () => {
    // Every caller that round-trips a fetched record sends back the ownerIds it
    // read, so treating [] as "owned by nobody" would defeat the claim below
    // for exactly those callers.
    expect(resolveUpdatedOwnerIds([], ["old-owner"], "editor")).toEqual({
      ownerIds: ["old-owner"],
      claimed: false,
    });
    expect(resolveUpdatedOwnerIds(undefined, ["old-owner"], "editor")).toEqual({
      ownerIds: ["old-owner"],
      claimed: false,
    });
  });

  test("editing a built-in claims it for the editor", () => {
    // A row nobody owns is resynced from the code definition on every
    // bootstrap, so an edit to one used to be reverted before it took effect —
    // reported as saved, and gone. Claiming it is the trade, and the caller is
    // told so.
    expect(resolveUpdatedOwnerIds(undefined, [], "editor")).toEqual({
      ownerIds: ["editor"],
      claimed: true,
    });
  });

  test("an owner list that is not a list is no opinion at all", () => {
    expect(normalizeOwnerIdsInput("nobody")).toBeNull();
    expect(normalizeOwnerIdsInput(undefined)).toBeNull();
  });

  test("blank entries are dropped and the rest trimmed", () => {
    expect(normalizeOwnerIdsInput([" alice ", "", "  ", "bob"])).toEqual([
      "alice",
      "bob",
    ]);
  });
});
