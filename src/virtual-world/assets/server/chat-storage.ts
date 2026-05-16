type WorldDbLogFn = (msg: string, obj?: unknown) => void;

function parseChatDbResult(
  raw: string | null | undefined,
  log: WorldDbLogFn,
): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    log("chat db parse failed", { error: String(e) });
    return null;
  }
}

function toStoredChatTimestamp(tsMs: number): number {
  const numeric = Number(tsMs || 0);
  if (!Number.isFinite(numeric) || numeric <= 0)
    return Math.floor(Date.now() / 1000);
  if (numeric >= 1000000000000) return Math.floor(numeric / 1000);
  return Math.floor(numeric);
}

function fromStoredChatTimestamp(storedTs: unknown): number {
  const numeric = Number(storedTs || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (numeric < 1000000000000) return numeric * 1000;
  return numeric;
}

function queryChatRows(
  tableName: string,
  filters: string,
  limit: number,
  orderBy: string,
  orderDir: "asc" | "desc",
  log: WorldDbLogFn,
): any[] {
  const result = parseChatDbResult(
    database.query(tableName, filters, limit, orderBy, orderDir),
    log,
  );
  if (!Array.isArray(result)) {
    if (result && result.error) {
      log("chat db query failed", {
        table: tableName,
        filters: filters || "",
        error: String(result.error),
      });
    }
    return [];
  }
  return result;
}

function insertChatRow(
  tableName: string,
  data: unknown,
  log: WorldDbLogFn,
): any {
  const result = parseChatDbResult(
    database.insert(tableName, JSON.stringify(data)),
    log,
  );
  if (result && result.error) {
    log("chat db insert failed", {
      table: tableName,
      error: String(result.error),
    });
    return null;
  }
  return result;
}

function upsertDMIndexEntry(
  userId: string,
  otherUserId: string,
  ts: number,
  dmIndexTable: string,
  log: WorldDbLogFn,
): void {
  const result = parseChatDbResult(
    database.upsert(
      dmIndexTable,
      JSON.stringify(["user_id", "other_user_id"]),
      JSON.stringify({
        user_id: userId,
        other_user_id: otherUserId,
        last_ts: toStoredChatTimestamp(ts),
      }),
    ),
    log,
  );
  if (result && result.error) {
    log("chat db upsert failed", {
      table: dmIndexTable,
      error: String(result.error),
    });
  }
}

function pruneChatRows(
  tableName: string,
  orderField: string,
  maxCount: number,
  filters: string,
  log: WorldDbLogFn,
): void {
  const rows = queryChatRows(tableName, filters, 1000, orderField, "desc", log);
  if (rows.length <= maxCount) return;
  for (let i = maxCount; i < rows.length; i++) {
    if (!Number.isFinite(Number(rows[i] && rows[i].id))) continue;
    const result = parseChatDbResult(
      database.delete(tableName, Number(rows[i].id)),
      log,
    );
    if (result && result.error) {
      log("chat db prune delete failed", {
        table: tableName,
        id: Number(rows[i].id),
        error: String(result.error),
      });
    }
  }
}

function normalizeWorldChatRows(rows: any[]): Array<{
  id: string;
  sender_id: string;
  sender_nick: string;
  text: string;
  ts: number;
}> {
  return rows
    .filter(function (row) {
      return row && typeof row.message_id === "string";
    })
    .map(function (row) {
      return {
        id: String(row.message_id),
        sender_id: String(row.sender_id || ""),
        sender_nick: String(row.sender_nick || ""),
        text: String(row.text || ""),
        ts: fromStoredChatTimestamp(row.ts),
      };
    });
}

function normalizeDMRows(rows: any[]): Array<{
  id: string;
  sender_id: string;
  sender_nick: string;
  recipient_id: string;
  text: string;
  ts: number;
}> {
  return rows
    .filter(function (row) {
      return row && typeof row.message_id === "string";
    })
    .map(function (row) {
      return {
        id: String(row.message_id),
        sender_id: String(row.sender_id || ""),
        sender_nick: String(row.sender_nick || ""),
        recipient_id: String(row.recipient_id || ""),
        text: String(row.text || ""),
        ts: fromStoredChatTimestamp(row.ts),
      };
    });
}

export function loadWorldChat(
  worldId: string,
  chatTable: string,
  worldChatMax: number,
  log: WorldDbLogFn,
): Array<{
  id: string;
  sender_id: string;
  sender_nick: string;
  text: string;
  ts: number;
}> {
  const rows = queryChatRows(
    chatTable,
    JSON.stringify({ world_id: String(worldId) }),
    worldChatMax,
    "ts",
    "desc",
    log,
  );
  return normalizeWorldChatRows(rows).reverse();
}

export function appendWorldChatMessage(
  worldId: string,
  msg: {
    id: string;
    sender_id: string;
    sender_nick: string;
    text: string;
    ts: number;
  },
  chatTable: string,
  worldChatMax: number,
  log: WorldDbLogFn,
): void {
  insertChatRow(
    chatTable,
    {
      message_id: String(msg.id),
      world_id: String(worldId),
      sender_id: String(msg.sender_id || ""),
      sender_nick: String(msg.sender_nick || ""),
      text: String(msg.text || ""),
      ts: toStoredChatTimestamp(Number(msg.ts || Date.now())),
    },
    log,
  );
  pruneChatRows(
    chatTable,
    "ts",
    worldChatMax,
    JSON.stringify({ world_id: String(worldId) }),
    log,
  );
}

export function dmConversationKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function loadDMHistory(
  a: string,
  b: string,
  dmTable: string,
  dmMax: number,
  log: WorldDbLogFn,
): Array<{
  id: string;
  sender_id: string;
  sender_nick: string;
  recipient_id: string;
  text: string;
  ts: number;
}> {
  const rows = queryChatRows(
    dmTable,
    JSON.stringify({ conversation_key: dmConversationKey(a, b) }),
    dmMax,
    "ts",
    "desc",
    log,
  );
  return normalizeDMRows(rows).reverse();
}

export function appendDMMessage(
  a: string,
  b: string,
  msg: {
    id: string;
    sender_id: string;
    sender_nick: string;
    recipient_id: string;
    text: string;
    ts: number;
  },
  dmTable: string,
  dmMax: number,
  log: WorldDbLogFn,
): void {
  const conversationKey = dmConversationKey(a, b);
  insertChatRow(
    dmTable,
    {
      message_id: String(msg.id),
      conversation_key: conversationKey,
      sender_id: String(msg.sender_id || ""),
      sender_nick: String(msg.sender_nick || ""),
      recipient_id: String(msg.recipient_id || ""),
      text: String(msg.text || ""),
      ts: toStoredChatTimestamp(Number(msg.ts || Date.now())),
    },
    log,
  );
  pruneChatRows(
    dmTable,
    "ts",
    dmMax,
    JSON.stringify({ conversation_key: conversationKey }),
    log,
  );
}

export function loadDMIndex(
  userId: string,
  dmIndexTable: string,
  log: WorldDbLogFn,
): string[] {
  const rows = queryChatRows(
    dmIndexTable,
    JSON.stringify({ user_id: String(userId) }),
    1000,
    "last_ts",
    "desc",
    log,
  );
  const seen: Record<string, boolean> = {};
  const idx: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const otherUserId = rows[i] && rows[i].other_user_id;
    if (!otherUserId || seen[otherUserId]) continue;
    seen[otherUserId] = true;
    idx.push(String(otherUserId));
  }
  return idx;
}

export function addToDMIndex(
  userId: string,
  otherUserId: string,
  ts: number | undefined,
  dmIndexTable: string,
  log: WorldDbLogFn,
): void {
  upsertDMIndexEntry(
    userId,
    otherUserId,
    Number(ts || Date.now()),
    dmIndexTable,
    log,
  );
}
