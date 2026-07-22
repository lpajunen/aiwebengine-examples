import { findFirstLivingItemByTypes } from "./world-domain.ts";
import { getWorldNPCSnapshot } from "./npc-orchestration.ts";
import {
  addToDMIndex,
  appendDMMessage,
  appendWorldChatMessage,
  loadDMHistory,
} from "./chat-storage.ts";
import { getCurrentWorldStateForUser } from "./current-world-state.ts";
import { vwLog } from "./diagnostics.ts";
import { getCurrentEventSeq } from "./event-seq.ts";
import { grantAllItemsForUser } from "./item-action-helpers.ts";
import {
  ensureWorldItems,
  flattenWorldItems,
  loadPlayerInventory,
  loadWorldItems,
  savePlayerInventory,
} from "./item-storage.ts";
import { maybeTickWorldNPCs } from "./npc-orchestration.ts";
import { markNPCWorldActive } from "./npc-storage.ts";
import {
  deletePlayerHeartbeat,
  deletePlayerMoveLease,
  getPlayerWorld,
  loadPlayerHeartbeatTs,
  loadPlayerMoveLease,
  loadPlayerPosition,
  markPlayerPositionInactive,
  savePlayerHeartbeatTs,
  savePlayerMoveLease,
} from "./player-persistence.ts";
import { buildActiveWorldPlayers } from "./player-snapshots.ts";
import { FATIGUE_RECOVERY_PER_SECOND, LEASE_TTL_MS } from "./runtime-config.ts";
import {
  buildOnlinePlayersSnapshot,
  deleteOnlinePresence,
  getEffectiveNick,
  savePlayerNick,
  sendGlobalPresenceEvent,
  updateOnlinePresence,
} from "./social-state.ts";
import {
  broadcastPlayerValuesChanged,
  sendRecipientScopedStreamEvent,
  sendWorldScopedStreamEvent,
} from "./stream-broadcast.ts";
import {
  buildInventorySelectors,
  createEmptyLivingState,
  LivingState,
} from "./world-domain.ts";

function sanitizeText(value: any, maxLength: number): string {
  const text = String(value || "")
    .trim()
    .replace(/[<>&"']/g, "");
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function buildMessageId(prefix: string): string {
  return (
    prefix +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2)
  );
}

export function getAuthenticatedUserId(context: any): string | null {
  if (
    !context ||
    !context.request ||
    !context.request.auth ||
    !context.request.auth.isAuthenticated ||
    !context.request.auth.userId
  ) {
    return null;
  }
  return String(context.request.auth.userId);
}

export function userHasCreatorStone(userId: string): boolean {
  const inv = loadPlayerInventory(userId);
  return !!findFirstLivingItemByTypes(inv, ["creator_stone"]);
}

export function listItemsForUser(userId: string): {
  items: any[];
  inventory: LivingState;
  inventory_slot_ids: string[];
  inventory_selectors: string[];
} {
  const worldId = getPlayerWorld(userId);
  if (!worldId) {
    const emptyInventory = createEmptyLivingState("");
    const emptySelectors = buildInventorySelectors(emptyInventory);
    return {
      items: [],
      inventory: emptyInventory,
      inventory_slot_ids: emptySelectors.inventory_slot_ids,
      inventory_selectors: emptySelectors.inventory_selectors,
    };
  }
  ensureWorldItems(worldId);
  const inventory = loadPlayerInventory(userId);
  const selectors = buildInventorySelectors(inventory);
  return {
    items: flattenWorldItems(loadWorldItems(worldId)),
    inventory: inventory,
    inventory_slot_ids: selectors.inventory_slot_ids,
    inventory_selectors: selectors.inventory_selectors,
  };
}

export function setNicknameForUser(
  userId: string,
  rawNick: any,
): { status: number; payload: any } {
  const nick = sanitizeText(rawNick, 24);
  if (!nick) {
    return {
      status: 400,
      payload: { error: "error.nickname_empty" },
    };
  }
  if (nick.toLowerCase() === "cheat") {
    const cheatResult = grantAllItemsForUser(userId);
    const selectors = buildInventorySelectors(cheatResult.inventory);
    return {
      status: 200,
      payload: {
        ok: true,
        inventory: cheatResult.inventory,
        inventory_slot_ids: selectors.inventory_slot_ids,
        inventory_selectors: selectors.inventory_selectors,
        items: cheatResult.items,
        message:
          "Item cheat activated: +" + cheatResult.granted_count + " items",
      },
    };
  }
  savePlayerNick(userId, nick);
  return {
    status: 200,
    payload: { ok: true, nick: nick },
  };
}

export function listOnlinePlayersForUser(userId: string): any[] {
  const snapshot = buildOnlinePlayersSnapshot();
  if (snapshot.length > 0) {
    return snapshot;
  }
  const worldId = getPlayerWorld(userId);
  if (!worldId) {
    return [];
  }
  return buildActiveWorldPlayers(worldId).map(function (player) {
    return {
      player_id: player.player_id,
      nick: getEffectiveNick(player.player_id),
      world_id: String(worldId),
      login_at: player.last_active,
      last_active: player.last_active,
    };
  });
}

export function postWorldChatForUser(
  userId: string,
  rawText: any,
): { status: number; payload: any } {
  const worldId = getPlayerWorld(userId);
  if (!worldId) {
    return {
      status: 400,
      payload: { error: "error.not_in_world" },
    };
  }
  const text = sanitizeText(rawText, 500);
  if (!text) {
    return {
      status: 400,
      payload: { error: "error.message_empty" },
    };
  }
  const msg = {
    id: buildMessageId("wc"),
    sender_id: userId,
    sender_nick: getEffectiveNick(userId),
    text: text,
    ts: Date.now(),
  };
  appendWorldChatMessage(worldId, msg);
  sendWorldScopedStreamEvent(String(worldId), "chat_message", msg);
  return {
    status: 200,
    payload: { ok: true, message: msg },
  };
}

export function postDirectMessageForUser(
  userId: string,
  rawTo: any,
  rawText: any,
): { status: number; payload: any } {
  const to = String(rawTo || "").trim();
  if (!to) {
    return {
      status: 400,
      payload: { error: "error.recipient_required" },
    };
  }
  if (to === userId) {
    return {
      status: 400,
      payload: { error: "error.cannot_dm_self" },
    };
  }
  const text = sanitizeText(rawText, 500);
  if (!text) {
    return {
      status: 400,
      payload: { error: "error.message_empty" },
    };
  }
  const msg = {
    id: buildMessageId("dm"),
    sender_id: userId,
    sender_nick: getEffectiveNick(userId),
    recipient_id: to,
    text: text,
    ts: Date.now(),
  };
  appendDMMessage(userId, to, msg);
  addToDMIndex(userId, to, msg.ts);
  addToDMIndex(to, userId, msg.ts);
  sendRecipientScopedStreamEvent(String(to), "direct_message", msg);
  return {
    status: 200,
    payload: { ok: true, message: msg },
  };
}

export function getDirectMessageHistoryForUser(
  userId: string,
  withUser: any,
): { status: number; payload: any } {
  const trimmedWithUser = String(withUser || "").trim();
  if (!trimmedWithUser) {
    return {
      status: 400,
      payload: { error: "error.with_param_required" },
    };
  }
  return {
    status: 200,
    payload: loadDMHistory(userId, trimmedWithUser),
  };
}

export function leaveWorldForUser(userId: string, sessionId: string): any {
  const worldId = getPlayerWorld(userId);
  if (!worldId) {
    return { ok: true };
  }
  const position = loadPlayerPosition(userId);
  if (!position || position.world_id !== String(worldId)) {
    return { ok: true };
  }
  if (!sessionId) {
    vwLog("leave ignored: missing session id", {
      user_id: userId,
      world_id: worldId,
    });
    return { ok: true };
  }
  if (position.session_id && position.session_id !== sessionId) {
    vwLog("leave ignored: stale session", {
      user_id: userId,
      world_id: worldId,
      position_session: position.session_id,
      session_id: sessionId,
    });
    return { ok: true };
  }
  markPlayerPositionInactive(userId);
  deletePlayerHeartbeat(userId);
  deletePlayerMoveLease(userId);
  deleteOnlinePresence(userId);
  sendWorldScopedStreamEvent(String(worldId), "player_moved", {
    player_id: userId,
    leaving: true,
  });
  sendGlobalPresenceEvent(
    "left",
    userId,
    String(worldId),
    getEffectiveNick(userId),
    Number(position.ts || 0) || Date.now(),
    Date.now(),
  );
  return { ok: true };
}

export function heartbeatForUser(userId: string, sessionId: string): any {
  const worldId = getPlayerWorld(userId);
  if (!worldId) {
    return { ok: true };
  }
  markNPCWorldActive(worldId);
  maybeTickWorldNPCs(worldId);

  if (sessionId) {
    const lease = loadPlayerMoveLease(userId);
    const now = Date.now();
    const leaseSessionId =
      lease && typeof lease.session_id === "string" ? lease.session_id : "";
    const leaseValid = !!lease && Number(lease.expires_at || 0) > now;
    if (!leaseValid || leaseSessionId === sessionId) {
      savePlayerMoveLease(userId, sessionId, now + LEASE_TTL_MS);
    } else {
      vwLog("heartbeat ignored: lease owned by other session", {
        user_id: userId,
        world_id: worldId,
        lease_session: leaseSessionId,
        session_id: sessionId,
      });
    }
  }

  // Idle-tick fatigue recovery: only when the player hasn't moved since the
  // previous heartbeat (a "tick" for players, mirroring the NPC tick) do we
  // recover fatigue, so actively moving players don't recover mid-stride.
  // Recovery is scaled by actual elapsed time (not a flat per-heartbeat
  // amount) so pacing matches NPCs' idle recovery in npc-orchestration.ts,
  // even though players and NPCs tick at very different cadences.
  const previousHeartbeatTs = loadPlayerHeartbeatTs(userId);
  const position = loadPlayerPosition(userId);
  const lastMoveTs = position ? Number(position.ts || 0) : 0;
  const inv = loadPlayerInventory(userId);
  if (previousHeartbeatTs > 0 && lastMoveTs <= previousHeartbeatTs) {
    const elapsedMs = Date.now() - previousHeartbeatTs;
    const fatigueBefore = Number(inv.values.fatigue || 0);
    const fatigueAfter = Math.max(
      0,
      fatigueBefore - (elapsedMs / 1000) * FATIGUE_RECOVERY_PER_SECOND,
    );
    if (fatigueAfter !== fatigueBefore) {
      inv.values.fatigue = fatigueAfter;
      savePlayerInventory(userId, inv);
      broadcastPlayerValuesChanged(worldId, userId, inv.values);
    }
  }

  savePlayerHeartbeatTs(userId, Date.now());
  updateOnlinePresence(userId, worldId, sessionId || "");
  return { ok: true, inventory: inv };
}

export function listPlayersForUser(userId: string): any[] {
  const worldId = getPlayerWorld(userId);
  if (!worldId) {
    return [];
  }
  markNPCWorldActive(worldId);
  return buildActiveWorldPlayers(worldId).map(function (player) {
    const living = loadPlayerInventory(player.player_id);
    return {
      player_id: player.player_id,
      row: player.row,
      col: player.col,
      seq: player.seq || 0,
      rotation: Number.isFinite(Number(player.rotation))
        ? Number(player.rotation)
        : 0,
      session_id:
        typeof player.session_id === "string" ? player.session_id : "",
      class_id: living.class_id,
      slots: living.slots,
      values: living.values,
    };
  });
}

/**
 * One-shot resync payload: current event-scope seqs plus full snapshots of
 * players, NPCs, and world state. Scope seqs are read BEFORE the snapshots
 * are built so an event emitted concurrently is re-delivered to the client
 * on top of the snapshot (all deltas are idempotent by id/seq) instead of
 * being silently skipped.
 */
export function buildResyncForUser(userId: string): {
  status: number;
  payload: any;
} {
  const worldId = getPlayerWorld(userId);
  if (!worldId) {
    return {
      status: 400,
      payload: { error: "error.not_in_world" },
    };
  }
  const worldScope = "world:" + String(worldId);
  const recipientScope = "recipient:" + String(userId);
  const scopeSeqs: Record<string, number> = {};
  scopeSeqs[worldScope] = getCurrentEventSeq(worldScope);
  scopeSeqs[recipientScope] = getCurrentEventSeq(recipientScope);
  return {
    status: 200,
    payload: {
      world_id: String(worldId),
      scope_seqs: scopeSeqs,
      players: listPlayersForUser(userId),
      npcs: listNPCsForUser(userId),
      world: getCurrentWorldStateForUser(userId),
    },
  };
}

export function getCurrentWorldStateForHttpUser(userId: string): any {
  return getCurrentWorldStateForUser(userId);
}

export function listNPCsForUser(userId: string): any[] {
  const worldId = getPlayerWorld(userId);
  if (!worldId) {
    return [];
  }
  return getWorldNPCSnapshot(worldId);
}
