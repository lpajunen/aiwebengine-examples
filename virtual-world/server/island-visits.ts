import {
  HOME_ISLAND_CLASS_ID,
  ISLAND_INVITE_TTL_MS,
} from "./runtime-config.ts";
import { getPlayerWorld } from "./player-persistence.ts";
import { getEffectiveNick } from "./social-state.ts";
import { sendRecipientScopedStreamEvent } from "./stream-broadcast.ts";
import { getWorldInfo } from "./world-bootstrap.ts";
import { getHomeIslandOwner, loadPlayerHome } from "./home-island.ts";
import {
  deleteIslandInvite,
  isHostOnIsland,
  listIslandInvitesByHost,
  listIslandInvitesForGuest,
  listPlayersInWorld,
  loadIslandInvite,
  saveIslandInvite,
} from "./island-invites.ts";
import { endIslandVisits, sendGuestToVainola } from "./world-switch.ts";

// What a host does with invites, and what a guest is shown of them. Rowing to
// an island is the boat's row_to_island, in tree-action-helpers.ts.

type VisitResult = { ok: boolean; error?: string; [key: string]: unknown };

/** The host's own island while they stand on it, or "". */
function hostIslandHere(hostId: string): string {
  const home = loadPlayerHome(hostId);
  if (!home || !home.homeWorldId) return "";
  return getPlayerWorld(hostId) === home.homeWorldId ? home.homeWorldId : "";
}

/**
 * Invites a player to the host's island for ISLAND_INVITE_TTL_MS. Only from the
 * island itself; inviting again renews the window.
 */
export function inviteToIsland(hostId: string, guestId: string): VisitResult {
  const guest = String(guestId || "");
  if (!guest || guest === String(hostId)) {
    return { ok: false, error: "error.invite_whom" };
  }
  if (!getPlayerWorld(guest)) {
    return { ok: false, error: "error.unknown_player" };
  }
  if (!hostIslandHere(hostId)) {
    return { ok: false, error: "error.invite_from_your_island" };
  }
  const now = Date.now();
  const invite = {
    hostId: String(hostId),
    guestId: guest,
    expiresAt: now + ISLAND_INVITE_TTL_MS,
    createdAt: now,
  };
  saveIslandInvite(invite);
  sendRecipientScopedStreamEvent(guest, "island_invite", {
    host_id: invite.hostId,
    host_nick: getEffectiveNick(invite.hostId),
    expires_at: invite.expiresAt,
  });
  return { ok: true, guest_id: guest, expires_at: invite.expiresAt };
}

/**
 * Withdraws an invite. A guest already on the island is rowed back to
 * Väinölä: the invite is what they were there on.
 */
export function revokeIslandInvite(
  hostId: string,
  guestId: string,
): VisitResult {
  const guest = String(guestId || "");
  const home = loadPlayerHome(hostId);
  const onIsland =
    !!home && !!home.homeWorldId && getPlayerWorld(guest) === home.homeWorldId;
  if (!deleteIslandInvite(hostId, guest) && !onIsland) {
    return { ok: false, error: "error.no_island_invite" };
  }
  if (onIsland) {
    sendGuestToVainola(guest, hostId, "revoked");
  } else {
    sendRecipientScopedStreamEvent(guest, "island_invite_ended", {
      host_id: String(hostId),
    });
  }
  return { ok: true, guest_id: guest };
}

/** Sends a guest on the host's island back to Väinölä. */
export function sendGuestHome(hostId: string, guestId: string): VisitResult {
  const guest = String(guestId || "");
  const island = hostIslandHere(hostId);
  if (!island || guest === String(hostId) || getPlayerWorld(guest) !== island) {
    return { ok: false, error: "error.not_your_guest" };
  }
  deleteIslandInvite(hostId, guest);
  sendGuestToVainola(guest, hostId, "sent_home");
  return { ok: true, guest_id: guest };
}

/**
 * The host to row to: the one named, or else whoever invited the guest last.
 * Returns the island to row to, or the reason there is none.
 */
export function resolveIslandToVisit(
  guestId: string,
  requestedHostId: string,
  now: number,
): { hostId: string; islandId: string } | { error: string } {
  let hostId = String(requestedHostId || "");
  if (!hostId) {
    const open = listIslandInvitesForGuest(guestId, now);
    if (open.length === 0) return { error: "error.no_island_invite" };
    hostId = open[0].hostId;
  }
  const invite = loadIslandInvite(hostId, guestId);
  if (!invite || invite.expiresAt <= now) {
    return { error: "error.no_island_invite" };
  }
  const home = loadPlayerHome(hostId);
  if (!home || !home.homeWorldId || !isHostOnIsland(hostId, now)) {
    return { error: "error.host_not_on_island" };
  }
  return { hostId: hostId, islandId: home.homeWorldId };
}

/**
 * What the client shows of visits: invites the player may row on, and, for a
 * host, whom they have invited.
 */
export function buildIslandVisitState(userId: string): {
  homeWorldId: string;
  invitesToMe: Array<{
    host_id: string;
    host_nick: string;
    expires_at: number;
  }>;
  invitedByMe: Array<{ guest_id: string; expires_at: number }>;
} {
  const now = Date.now();
  const home = loadPlayerHome(userId);
  return {
    homeWorldId: home ? home.homeWorldId : "",
    invitesToMe: listIslandInvitesForGuest(userId, now).map(function (invite) {
      return {
        host_id: invite.hostId,
        host_nick: getEffectiveNick(invite.hostId),
        expires_at: invite.expiresAt,
      };
    }),
    invitedByMe: listIslandInvitesByHost(userId, now).map(function (invite) {
      return { guest_id: invite.guestId, expires_at: invite.expiresAt };
    }),
  };
}

/**
 * From the world tick: a host who closed the game without leaving their
 * island has left it all the same once they have not been heard from for
 * ISLAND_HOST_STALE_MS, and their guests are rowed back.
 */
export function tickIslandVisitsForWorld(worldId: string, now: number): void {
  if (getWorldInfo(worldId).world_class_id !== HOME_ISLAND_CLASS_ID) return;
  const hostId = getHomeIslandOwner(worldId);
  if (!hostId) return;
  const guests = listPlayersInWorld(worldId).filter(function (id) {
    return id !== hostId;
  });
  if (guests.length === 0) return;
  if (isHostOnIsland(hostId, now)) return;
  endIslandVisits(hostId, worldId, "host_left");
}
