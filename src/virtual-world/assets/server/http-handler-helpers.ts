type HttpHandlerDeps = {
  getPlayerWorld: (userId: string) => string;
  createEmptyInventory: () => any;
  ensureWorldItems: (worldId: string) => void;
  flattenWorldItems: (itemsByTile: Record<string, any[]>) => any[];
  loadWorldItems: (worldId: string) => Record<string, any[]>;
  loadPlayerInventory: (userId: string) => any;
  savePlayerNick: (userId: string, nick: string) => void;
  buildOnlinePlayersSnapshot: () => any[];
  buildActiveWorldPlayers: (worldId: string) => Array<{
    player_id: string;
    row: number;
    col: number;
    seq: number;
    rotation: number;
    session_id: string;
    last_active: number;
  }>;
  getEffectiveNick: (userId: string) => string;
  appendWorldChatMessage: (worldId: string, message: any) => void;
  sendWorldScopedStreamEvent: (
    worldId: string,
    eventType: string,
    payload: any,
  ) => void;
  appendDMMessage: (userId: string, toUserId: string, message: any) => void;
  addToDMIndex: (userId: string, otherUserId: string, lastTs: number) => void;
  sendRecipientScopedStreamEvent: (
    recipientId: string,
    eventType: string,
    payload: any,
  ) => void;
  loadDMHistory: (userId: string, withUserId: string) => any[];
  loadPlayerPosition: (userId: string) => any;
  markPlayerPositionInactive: (userId: string) => void;
  deletePlayerHeartbeat: (userId: string) => void;
  deletePlayerMoveLease: (userId: string) => void;
  deleteOnlinePresence: (userId: string) => void;
  vwLog: (msg: string, obj?: unknown) => void;
  markNPCWorldActive: (worldId: string) => void;
  maybeTickWorldNPCs: (worldId: string) => void;
  loadPlayerMoveLease: (userId: string) => any;
  savePlayerMoveLease: (
    userId: string,
    sessionId: string,
    expiresAt: number,
  ) => void;
  savePlayerHeartbeatTs: (userId: string, ts: number) => void;
  updateOnlinePresence: (
    userId: string,
    worldId: string,
    sessionId: string,
  ) => void;
  LEASE_TTL_MS: number;
  getCurrentWorldStateForUser: (userId: string) => any;
  getWorldNPCSnapshot: (worldId: string) => any[];
};

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

export function listItemsForUser(
  userId: string,
  deps: Pick<
    HttpHandlerDeps,
    | "getPlayerWorld"
    | "createEmptyInventory"
    | "ensureWorldItems"
    | "flattenWorldItems"
    | "loadWorldItems"
    | "loadPlayerInventory"
  >,
): { items: any[]; inventory: any } {
  const worldId = deps.getPlayerWorld(userId);
  if (!worldId) {
    return {
      items: [],
      inventory: deps.createEmptyInventory(),
    };
  }
  deps.ensureWorldItems(worldId);
  return {
    items: deps.flattenWorldItems(deps.loadWorldItems(worldId)),
    inventory: deps.loadPlayerInventory(userId),
  };
}

export function setNicknameForUser(
  userId: string,
  rawNick: any,
  deps: Pick<HttpHandlerDeps, "savePlayerNick">,
): { status: number; payload: any } {
  const nick = sanitizeText(rawNick, 24);
  if (!nick) {
    return {
      status: 400,
      payload: { error: "Nickname cannot be empty" },
    };
  }
  deps.savePlayerNick(userId, nick);
  return {
    status: 200,
    payload: { ok: true, nick: nick },
  };
}

export function listOnlinePlayersForUser(
  userId: string,
  deps: Pick<
    HttpHandlerDeps,
    | "buildOnlinePlayersSnapshot"
    | "getPlayerWorld"
    | "buildActiveWorldPlayers"
    | "getEffectiveNick"
  >,
): any[] {
  const snapshot = deps.buildOnlinePlayersSnapshot();
  if (snapshot.length > 0) {
    return snapshot;
  }
  const worldId = deps.getPlayerWorld(userId);
  if (!worldId) {
    return [];
  }
  return deps.buildActiveWorldPlayers(worldId).map(function (player) {
    return {
      player_id: player.player_id,
      nick: deps.getEffectiveNick(player.player_id),
      world_id: String(worldId),
      login_at: player.last_active,
      last_active: player.last_active,
    };
  });
}

export function postWorldChatForUser(
  userId: string,
  rawText: any,
  deps: Pick<
    HttpHandlerDeps,
    | "getPlayerWorld"
    | "getEffectiveNick"
    | "appendWorldChatMessage"
    | "sendWorldScopedStreamEvent"
  >,
): { status: number; payload: any } {
  const worldId = deps.getPlayerWorld(userId);
  if (!worldId) {
    return {
      status: 400,
      payload: { error: "Not in a world" },
    };
  }
  const text = sanitizeText(rawText, 500);
  if (!text) {
    return {
      status: 400,
      payload: { error: "Message cannot be empty" },
    };
  }
  const msg = {
    id: buildMessageId("wc"),
    sender_id: userId,
    sender_nick: deps.getEffectiveNick(userId),
    text: text,
    ts: Date.now(),
  };
  deps.appendWorldChatMessage(worldId, msg);
  deps.sendWorldScopedStreamEvent(String(worldId), "chat_message", msg);
  return {
    status: 200,
    payload: { ok: true, message: msg },
  };
}

export function postDirectMessageForUser(
  userId: string,
  rawTo: any,
  rawText: any,
  deps: Pick<
    HttpHandlerDeps,
    | "getEffectiveNick"
    | "appendDMMessage"
    | "addToDMIndex"
    | "sendRecipientScopedStreamEvent"
  >,
): { status: number; payload: any } {
  const to = String(rawTo || "").trim();
  if (!to) {
    return {
      status: 400,
      payload: { error: "Recipient required" },
    };
  }
  if (to === userId) {
    return {
      status: 400,
      payload: { error: "Cannot DM yourself" },
    };
  }
  const text = sanitizeText(rawText, 500);
  if (!text) {
    return {
      status: 400,
      payload: { error: "Message cannot be empty" },
    };
  }
  const msg = {
    id: buildMessageId("dm"),
    sender_id: userId,
    sender_nick: deps.getEffectiveNick(userId),
    recipient_id: to,
    text: text,
    ts: Date.now(),
  };
  deps.appendDMMessage(userId, to, msg);
  deps.addToDMIndex(userId, to, msg.ts);
  deps.addToDMIndex(to, userId, msg.ts);
  deps.sendRecipientScopedStreamEvent(String(to), "direct_message", msg);
  return {
    status: 200,
    payload: { ok: true, message: msg },
  };
}

export function getDirectMessageHistoryForUser(
  userId: string,
  withUser: any,
  deps: Pick<HttpHandlerDeps, "loadDMHistory">,
): { status: number; payload: any } {
  const trimmedWithUser = String(withUser || "").trim();
  if (!trimmedWithUser) {
    return {
      status: 400,
      payload: { error: "with param required" },
    };
  }
  return {
    status: 200,
    payload: deps.loadDMHistory(userId, trimmedWithUser),
  };
}

export function leaveWorldForUser(
  userId: string,
  sessionId: string,
  deps: Pick<
    HttpHandlerDeps,
    | "getPlayerWorld"
    | "loadPlayerPosition"
    | "vwLog"
    | "markPlayerPositionInactive"
    | "deletePlayerHeartbeat"
    | "deletePlayerMoveLease"
    | "deleteOnlinePresence"
    | "sendWorldScopedStreamEvent"
  >,
): any {
  const worldId = deps.getPlayerWorld(userId);
  if (!worldId) {
    return { ok: true };
  }
  const position = deps.loadPlayerPosition(userId);
  if (!position || position.world_id !== String(worldId)) {
    return { ok: true };
  }
  if (!sessionId) {
    deps.vwLog("leave ignored: missing session id", {
      user_id: userId,
      world_id: worldId,
    });
    return { ok: true };
  }
  if (position.session_id && position.session_id !== sessionId) {
    deps.vwLog("leave ignored: stale session", {
      user_id: userId,
      world_id: worldId,
      position_session: position.session_id,
      session_id: sessionId,
    });
    return { ok: true };
  }
  deps.markPlayerPositionInactive(userId);
  deps.deletePlayerHeartbeat(userId);
  deps.deletePlayerMoveLease(userId);
  deps.deleteOnlinePresence(userId);
  deps.sendWorldScopedStreamEvent(String(worldId), "player_moved", {
    player_id: userId,
    leaving: true,
  });
  return { ok: true };
}

export function heartbeatForUser(
  userId: string,
  sessionId: string,
  deps: Pick<
    HttpHandlerDeps,
    | "getPlayerWorld"
    | "markNPCWorldActive"
    | "maybeTickWorldNPCs"
    | "loadPlayerMoveLease"
    | "savePlayerMoveLease"
    | "vwLog"
    | "savePlayerHeartbeatTs"
    | "updateOnlinePresence"
    | "LEASE_TTL_MS"
  >,
): any {
  const worldId = deps.getPlayerWorld(userId);
  if (!worldId) {
    return { ok: true };
  }
  deps.markNPCWorldActive(worldId);
  deps.maybeTickWorldNPCs(worldId);

  if (sessionId) {
    const lease = deps.loadPlayerMoveLease(userId);
    const now = Date.now();
    const leaseSessionId =
      lease && typeof lease.session_id === "string" ? lease.session_id : "";
    const leaseValid = !!lease && Number(lease.expires_at || 0) > now;
    if (!leaseValid || leaseSessionId === sessionId) {
      deps.savePlayerMoveLease(userId, sessionId, now + deps.LEASE_TTL_MS);
    } else {
      deps.vwLog("heartbeat ignored: lease owned by other session", {
        user_id: userId,
        world_id: worldId,
        lease_session: leaseSessionId,
        session_id: sessionId,
      });
    }
  }

  deps.savePlayerHeartbeatTs(userId, Date.now());
  deps.updateOnlinePresence(userId, worldId, sessionId || "");
  return { ok: true };
}

export function listPlayersForUser(
  userId: string,
  deps: Pick<
    HttpHandlerDeps,
    "getPlayerWorld" | "markNPCWorldActive" | "buildActiveWorldPlayers"
  >,
): any[] {
  const worldId = deps.getPlayerWorld(userId);
  if (!worldId) {
    return [];
  }
  deps.markNPCWorldActive(worldId);
  return deps.buildActiveWorldPlayers(worldId).map(function (player) {
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
    };
  });
}

export function getCurrentWorldStateForHttpUser(
  userId: string,
  deps: Pick<HttpHandlerDeps, "getCurrentWorldStateForUser">,
): any {
  return deps.getCurrentWorldStateForUser(userId);
}

export function listNPCsForUser(
  userId: string,
  deps: Pick<HttpHandlerDeps, "getPlayerWorld" | "getWorldNPCSnapshot">,
): any[] {
  const worldId = deps.getPlayerWorld(userId);
  if (!worldId) {
    return [];
  }
  return deps.getWorldNPCSnapshot(worldId);
}
