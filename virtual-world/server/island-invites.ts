import {
  ISLAND_HOST_STALE_MS,
  VWORLD_ISLAND_INVITE_TABLE,
  VWORLD_PLAYER_WORLD_TABLE,
} from "./runtime-config.ts";
import {
  deleteWorldRowsWhere,
  querySingleWorldRow,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";
import {
  fromStoredWorldTimestamp,
  toStoredWorldTimestamp,
} from "./world-domain.ts";
import {
  getPlayerWorld,
  loadPlayerHeartbeatTs,
  loadPlayerPosition,
} from "./player-persistence.ts";
import { getHomeIslandOwner, loadPlayerHome } from "./home-island.ts";

// Invites to a home island, and who may therefore enter one. Storage and
// presence only; issuing, revoking and ending visits, which move players, live
// in island-visits.ts and world-switch.ts.
//
// An invite opens a window for the guest to arrive in. It says nothing about
// how long they may stay: a guest who has arrived stays until the host leaves,
// sends them away or revokes the invite.

export interface IslandInvite {
  hostId: string;
  guestId: string;
  expiresAt: number;
  createdAt: number;
}

function rowToInvite(row: any): IslandInvite | null {
  if (!row || !row.host_id || !row.guest_id) return null;
  return {
    hostId: String(row.host_id),
    guestId: String(row.guest_id),
    expiresAt: fromStoredWorldTimestamp(Number(row.expires_at || 0)),
    createdAt: fromStoredWorldTimestamp(Number(row.created_at || 0)),
  };
}

function rowsToInvites(rows: any[]): IslandInvite[] {
  const out: IslandInvite[] = [];
  for (let i = 0; i < rows.length; i++) {
    const invite = rowToInvite(rows[i]);
    if (invite) out.push(invite);
  }
  return out;
}

export function loadIslandInvite(
  hostId: string,
  guestId: string,
): IslandInvite | null {
  return rowToInvite(
    querySingleWorldRow(
      VWORLD_ISLAND_INVITE_TABLE,
      JSON.stringify({ host_id: String(hostId), guest_id: String(guestId) }),
    ),
  );
}

export function saveIslandInvite(invite: IslandInvite): void {
  upsertWorldRow(VWORLD_ISLAND_INVITE_TABLE, ["host_id", "guest_id"], {
    host_id: String(invite.hostId),
    guest_id: String(invite.guestId),
    expires_at: toStoredWorldTimestamp(invite.expiresAt),
    created_at: toStoredWorldTimestamp(invite.createdAt || Date.now()),
  });
}

export function deleteIslandInvite(hostId: string, guestId: string): boolean {
  return (
    deleteWorldRowsWhere(
      VWORLD_ISLAND_INVITE_TABLE,
      JSON.stringify({ host_id: String(hostId), guest_id: String(guestId) }),
    ) > 0
  );
}

/** Deletes every invite the host has issued; returns whom they were for. */
export function deleteIslandInvitesByHost(hostId: string): string[] {
  const guests = listIslandInvitesByHost(hostId, 0).map(function (invite) {
    return invite.guestId;
  });
  deleteWorldRowsWhere(
    VWORLD_ISLAND_INVITE_TABLE,
    JSON.stringify({ host_id: String(hostId) }),
  );
  return guests;
}

/** The host's invites still open at `now`; pass 0 for every one stored. */
export function listIslandInvitesByHost(
  hostId: string,
  now: number,
): IslandInvite[] {
  return rowsToInvites(
    queryWorldRows(
      VWORLD_ISLAND_INVITE_TABLE,
      JSON.stringify({ host_id: String(hostId) }),
      1000,
      "id",
      "desc",
    ),
  ).filter(function (invite) {
    return invite.expiresAt > now;
  });
}

/** Invites to the guest still open at `now`, newest first. */
export function listIslandInvitesForGuest(
  guestId: string,
  now: number,
): IslandInvite[] {
  return rowsToInvites(
    queryWorldRows(
      VWORLD_ISLAND_INVITE_TABLE,
      JSON.stringify({ guest_id: String(guestId) }),
      1000,
      "id",
      "desc",
    ),
  )
    .filter(function (invite) {
      return invite.expiresAt > now;
    })
    .sort(function (a, b) {
      return b.createdAt - a.createdAt;
    });
}

/** Everyone whose current world is `worldId`, online or not. */
export function listPlayersInWorld(worldId: string): string[] {
  const rows = queryWorldRows(
    VWORLD_PLAYER_WORLD_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    1000,
    "id",
    "desc",
  );
  const out: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const id = rows[i] && rows[i].user_id ? String(rows[i].user_id) : "";
    if (id && out.indexOf(id) === -1) out.push(id);
  }
  return out;
}

/**
 * Whether the host is on their own island at `now`: it is their current world,
 * and they have been heard from — a heartbeat or a move — within
 * ISLAND_HOST_STALE_MS. A host who closed the game is still recorded on the
 * island, which is why their world alone is not enough.
 */
export function isHostOnIsland(hostId: string, now: number): boolean {
  const home = loadPlayerHome(hostId);
  if (!home || !home.homeWorldId) return false;
  if (getPlayerWorld(hostId) !== home.homeWorldId) return false;
  const position = loadPlayerPosition(hostId);
  const movedAt =
    position && position.world_id === home.homeWorldId ? position.ts : 0;
  const heardAt = Math.max(loadPlayerHeartbeatTs(hostId), movedAt);
  return heardAt >= now - ISLAND_HOST_STALE_MS;
}

/** Whether the guest may row to the host's island now. */
export function hasOpenIslandInvite(
  hostId: string,
  guestId: string,
  now: number,
): boolean {
  const invite = loadIslandInvite(hostId, guestId);
  return !!invite && invite.expiresAt > now && isHostOnIsland(hostId, now);
}

/**
 * Whether a player may enter a world: anyone may enter a world that is nobody's
 * home, its owner may always enter their own, and anyone else only on an open
 * invite while the owner is there.
 */
export function mayEnterWorld(userId: string, worldId: string): boolean {
  const owner = getHomeIslandOwner(worldId);
  if (!owner || owner === String(userId)) return true;
  return hasOpenIslandInvite(owner, userId, Date.now());
}

/** Whether the player is a guest: in someone else's home island. */
export function isIslandGuest(userId: string, worldId: string): boolean {
  const owner = getHomeIslandOwner(worldId);
  return !!owner && owner !== String(userId);
}
