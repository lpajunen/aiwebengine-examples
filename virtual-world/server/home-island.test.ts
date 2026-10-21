/**
 * Tests for home islands: the world a new player wakes in, the steps that
 * teach them the game there, and the boat that takes them to Väinölä.
 *
 * What these guard is the way in and the way out. A new player who cannot leave
 * their island, a player who can row onto someone else's, or an old player sent
 * back to a tutorial they never needed are each worse than any missing feature.
 *
 * Visits come under the same reasoning: a guest who can walk onto an island
 * uninvited, or who is left behind on it once the host has gone, breaks the
 * one promise an island makes.
 *
 * Database-backed; every player, island and pending action a case makes is
 * removed afterwards.
 */

import { HOME_ISLAND_CLASS_ID, START_WORLD_ID } from "./runtime-config.ts";
import {
  ensurePlayerHomeWorld,
  getEffectiveMap,
  getOrCreatePlayerWorld,
  getWorldInfo,
} from "./world-bootstrap.ts";
import {
  getHomeIslandOwner,
  isOnboardingDone,
  loadPlayerHome,
  markOnboardingDone,
} from "./home-island.ts";
import {
  listIslandInvitesByHost,
  mayEnterWorld,
  saveIslandInvite,
} from "./island-invites.ts";
import {
  inviteToIsland,
  revokeIslandInvite,
  sendGuestHome,
  tickIslandVisitsForWorld,
} from "./island-visits.ts";
import {
  switchUserToNewWorld,
  switchUserToStartWorld,
  switchUserWorld,
} from "./world-switch.ts";
import { getPlayerWorld, savePlayerPosition } from "./player-persistence.ts";
import {
  ensureWorldItems,
  loadPlayerInventory,
  savePlayerInventory,
} from "./item-storage.ts";
import {
  performTreeActionForUser,
  resolvePendingActionsForWorld,
} from "./tree-action-helpers.ts";
import { loadWorldChat } from "./chat-storage.ts";
import {
  countLivingItemsByType,
  isWorldTileWalkable,
  worldTileValueForName,
} from "./world-domain.ts";
import {
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  primeTransactions,
  testUserId,
  trackTestWorld,
  walkableRunFinder,
} from "./test-fixtures.ts";

let counter = 0;

beforeEach(function () {
  primeTransactions();
});

afterEach(function () {
  cleanupTestData();
});

/** A brand-new player, on the island the game gives them. */
function newPlayer(): { userId: string; island: string } {
  const userId = testUserId("islander");
  const island = trackTestWorld(getOrCreatePlayerWorld(userId));
  return { userId: userId, island: island };
}

function give(userId: string, type: string): void {
  const inv = loadPlayerInventory(userId);
  inv.bag.push({ id: "test-item-" + ++counter + "-" + Date.now(), type: type });
  savePlayerInventory(userId, inv);
}

function held(userId: string, type: string): number {
  return countLivingItemsByType(loadPlayerInventory(userId))[type] || 0;
}

function act(userId: string, action: string): any {
  return performTreeActionForUser(userId, { action: action }).payload;
}

describe("a new player", () => {
  test("wakes on an island of their own, with onboarding ahead", () => {
    const { userId, island } = newPlayer();

    expect(getWorldInfo(island).world_class_id).toBe(HOME_ISLAND_CLASS_ID);
    expect(getHomeIslandOwner(island)).toBe(userId);
    expect(isOnboardingDone(userId)).toBe(false);
  });

  test("cannot leave by the bundle or the routes, only by boat", () => {
    const { userId, island } = newPlayer();
    // The bundle every player carries is what grants return_home.
    give(userId, "starter_kit");

    expect(act(userId, "return_home").error).toBe("error.finish_island_first");
    expect(switchUserToStartWorld(userId).ok).toBe(false);
    expect(switchUserToNewWorld(userId, "forest").ok).toBe(false);
    expect(getPlayerWorld(userId)).toBe(island);
  });

  test("stands on land wherever the island's things are", () => {
    const { island } = newPlayer();
    const map = getEffectiveMap(island);

    // The sand is a blob placed at random within a tile of the middle; the
    // authored tiles must be on it whichever way the draw fell.
    [
      [7, 6],
      [6, 9],
      [9, 8],
      [9, 5],
    ].forEach(function (tile) {
      expect(isWorldTileWalkable(map[tile[0]][tile[1]])).toBe(true);
    });
    expect(map[0][0]).toBe(worldTileValueForName("ocean"));
  });
});

describe("the boat", () => {
  test("its first crossing ends onboarding and is announced", () => {
    const { userId } = newPlayer();
    give(userId, "boat");

    const result = act(userId, "row_to_vainola");

    expect(result.ok).toBe(true);
    expect(getPlayerWorld(userId)).toBe(START_WORLD_ID);
    expect(isOnboardingDone(userId)).toBe(true);
    const announced = loadWorldChat(START_WORLD_ID).filter(function (msg) {
      return (
        msg.sender_id === userId && msg.text_key === "chat.arrived_in_vainola"
      );
    });
    expect(announced).toHaveLength(1);
  });

  test("rows home to the player's own island", () => {
    const { userId, island } = newPlayer();
    give(userId, "boat");
    act(userId, "row_to_vainola");

    expect(act(userId, "row_home").ok).toBe(true);

    expect(getPlayerWorld(userId)).toBe(island);
  });

  test("a later crossing is not announced again", () => {
    const { userId } = newPlayer();
    give(userId, "boat");
    act(userId, "row_to_vainola");
    act(userId, "row_home");

    act(userId, "row_to_vainola");

    const announced = loadWorldChat(START_WORLD_ID).filter(function (msg) {
      return msg.sender_id === userId;
    });
    expect(announced).toHaveLength(1);
  });
});

describe("someone else's island", () => {
  test("is refused, whatever leads there", () => {
    const { island } = newPlayer();
    const forest = createTestWorld(16, 16);
    const visitor = createTestPlayer(
      forest,
      "visitor",
      walkableRunFinder(forest)(1)[0],
      0,
    );

    expect(mayEnterWorld(visitor, island)).toBe(false);
    expect(switchUserWorld(visitor, island)).toBe(false);
    expect(getPlayerWorld(visitor)).toBe(forest);
  });
});

describe("skipping", () => {
  test("hands over a boat and an axe, once", () => {
    const { userId, island } = newPlayer();
    // The nest grants the action, so the player has to be standing by it.
    ensureWorldItems(island);
    savePlayerPosition(userId, island, {
      row: 7,
      col: 6,
      seq: 0,
      rotation: 0,
    });

    expect(act(userId, "skip_onboarding").ok).toBe(true);
    expect(held(userId, "boat")).toBe(1);
    expect(held(userId, "stone_axe")).toBe(1);

    act(userId, "row_to_vainola");
    act(userId, "row_home");
    expect(act(userId, "skip_onboarding").error).toBe(
      "error.onboarding_already_done",
    );
  });
});

describe("sowing", () => {
  test("grows a pine on the home island", () => {
    const { userId, island } = newPlayer();
    ensureWorldItems(island);
    give(userId, "seed_pouch");
    // Facing south from (8, 8), clear of the nest's no-planting ring.
    savePlayerPosition(userId, island, {
      row: 8,
      col: 8,
      seq: 0,
      rotation: 0,
    });

    const started = act(userId, "sow_tree");
    expect(started.ok).toBe(true);
    expect(started.started).toBe(true);
    expect(held(userId, "seed_pouch")).toBe(0);

    resolvePendingActionsForWorld(island, Date.now() + 60000);

    expect(getEffectiveMap(island)[9][8]).toBe(
      worldTileValueForName("pine_tree"),
    );
  });

  test("does not take anywhere else", () => {
    const forest = createTestWorld(16, 16);
    const userId = createTestPlayer(
      forest,
      "sower",
      walkableRunFinder(forest)(2)[0],
      0,
    );
    give(userId, "seed_pouch");

    expect(act(userId, "sow_tree").error).toBe("error.sow_only_on_home_island");
    expect(held(userId, "seed_pouch")).toBe(1);
  });
});

describe("a player from before home islands", () => {
  test("is past onboarding, and gets an island when they row home", () => {
    const forest = createTestWorld(16, 16);
    const userId = createTestPlayer(
      forest,
      "veteran",
      walkableRunFinder(forest)(1)[0],
      0,
    );
    expect(isOnboardingDone(userId)).toBe(true);
    expect(loadPlayerHome(userId)).toBeNull();
    give(userId, "boat");

    expect(act(userId, "row_home").ok).toBe(true);

    const island = trackTestWorld(getPlayerWorld(userId));
    expect(getHomeIslandOwner(island)).toBe(userId);
    expect(isOnboardingDone(userId)).toBe(true);
    expect(ensurePlayerHomeWorld(userId)).toBe(island);
  });

  test("marking onboarding done reports the first time only", () => {
    const { userId } = newPlayer();

    expect(markOnboardingDone(userId)).toBe(true);
    expect(markOnboardingDone(userId)).toBe(false);
  });
});

/** A host standing on their island now, as a player who just moved there. */
function hostAtHome(): { hostId: string; island: string } {
  const { userId, island } = newPlayer();
  savePlayerPosition(userId, island, { row: 7, col: 7, seq: 0, rotation: 0 });
  return { hostId: userId, island: island };
}

/** A player elsewhere, with a boat to row in. */
function guestWithBoat(prefix: string): string {
  const forest = createTestWorld(16, 16);
  const guestId = createTestPlayer(
    forest,
    prefix,
    walkableRunFinder(forest)(1)[0],
    0,
  );
  give(guestId, "boat");
  return guestId;
}

function rowTo(guestId: string, hostId: string): any {
  return performTreeActionForUser(guestId, {
    action: "row_to_island",
    host_id: hostId,
  }).payload;
}

describe("visiting an island", () => {
  test("an invited guest rows over and lands on it", () => {
    const { hostId, island } = hostAtHome();
    const guestId = guestWithBoat("guest");

    expect(inviteToIsland(hostId, guestId).ok).toBe(true);
    expect(mayEnterWorld(guestId, island)).toBe(true);

    expect(rowTo(guestId, hostId).ok).toBe(true);
    expect(getPlayerWorld(guestId)).toBe(island);
  });

  test("without a host named, rows on the latest invite", () => {
    const { hostId, island } = hostAtHome();
    const guestId = guestWithBoat("guest");
    inviteToIsland(hostId, guestId);

    expect(act(guestId, "row_to_island").ok).toBe(true);
    expect(getPlayerWorld(guestId)).toBe(island);
  });

  test("is invited to only from the host's own island", () => {
    const hostId = guestWithBoat("roaming-host");
    trackTestWorld(ensurePlayerHomeWorld(hostId));
    const guestId = guestWithBoat("guest");

    expect(inviteToIsland(hostId, guestId).error).toBe(
      "error.invite_from_your_island",
    );
  });

  test("is refused once the invite has lapsed", () => {
    const { hostId, island } = hostAtHome();
    const guestId = guestWithBoat("guest");
    saveIslandInvite({
      hostId: hostId,
      guestId: guestId,
      expiresAt: Date.now() - 1000,
      createdAt: Date.now() - 16 * 60 * 1000,
    });

    expect(rowTo(guestId, hostId).error).toBe("error.no_island_invite");
    expect(switchUserWorld(guestId, island)).toBe(false);
  });

  test("is refused while the host is away from the island", () => {
    const { userId: hostId, island } = newPlayer();
    // On the island by record, but not heard from for ten minutes.
    savePlayerPosition(hostId, island, {
      row: 7,
      col: 7,
      seq: 0,
      rotation: 0,
      ts: Date.now() - 10 * 60 * 1000,
    });
    const guestId = guestWithBoat("guest");
    saveIslandInvite({
      hostId: hostId,
      guestId: guestId,
      expiresAt: Date.now() + 60000,
      createdAt: Date.now(),
    });

    expect(rowTo(guestId, hostId).error).toBe("error.host_not_on_island");
    expect(getPlayerWorld(guestId)).not.toBe(island);
  });

  test("ends for every guest when the host leaves", () => {
    const { hostId, island } = hostAtHome();
    const first = guestWithBoat("first");
    const second = guestWithBoat("second");
    inviteToIsland(hostId, first);
    inviteToIsland(hostId, second);
    rowTo(first, hostId);
    rowTo(second, hostId);
    const elsewhere = createTestWorld(16, 16);

    expect(switchUserWorld(hostId, elsewhere)).toBe(true);

    expect(getPlayerWorld(first)).toBe(START_WORLD_ID);
    expect(getPlayerWorld(second)).toBe(START_WORLD_ID);
    expect(listIslandInvitesByHost(hostId, 0)).toHaveLength(0);
  });

  test("ends when the host has not been heard from", () => {
    const { hostId, island } = hostAtHome();
    const guestId = guestWithBoat("guest");
    inviteToIsland(hostId, guestId);
    rowTo(guestId, hostId);

    tickIslandVisitsForWorld(island, Date.now() + 60000);
    expect(getPlayerWorld(guestId)).toBe(island);

    tickIslandVisitsForWorld(island, Date.now() + 3 * 60 * 1000);
    expect(getPlayerWorld(guestId)).toBe(START_WORLD_ID);
  });

  test("a revoked invite rows the guest back", () => {
    const { hostId } = hostAtHome();
    const guestId = guestWithBoat("guest");
    inviteToIsland(hostId, guestId);
    rowTo(guestId, hostId);

    expect(revokeIslandInvite(hostId, guestId).ok).toBe(true);

    expect(getPlayerWorld(guestId)).toBe(START_WORLD_ID);
    expect(rowTo(guestId, hostId).error).toBe("error.no_island_invite");
  });

  test("the host can send a guest away", () => {
    const { hostId } = hostAtHome();
    const guestId = guestWithBoat("guest");
    inviteToIsland(hostId, guestId);
    rowTo(guestId, hostId);

    expect(sendGuestHome(hostId, guestId).ok).toBe(true);

    expect(getPlayerWorld(guestId)).toBe(START_WORLD_ID);
  });

  test("a guest may not plant or pick up, but may row away", () => {
    const { hostId } = hostAtHome();
    const guestId = guestWithBoat("guest");
    give(guestId, "seed_pouch");
    inviteToIsland(hostId, guestId);
    rowTo(guestId, hostId);

    expect(act(guestId, "sow_tree").error).toBe("error.not_as_a_guest");
    expect(act(guestId, "pick").error).toBe("error.not_as_a_guest");
    expect(held(guestId, "seed_pouch")).toBe(1);

    expect(act(guestId, "row_to_vainola").ok).toBe(true);
    expect(getPlayerWorld(guestId)).toBe(START_WORLD_ID);
  });
});
