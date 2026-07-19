import {
  VWORLD_CHAT_TABLE,
  VWORLD_DM_INDEX_TABLE,
  VWORLD_DM_TABLE,
  WORLD_CHAT_MAX,
  DM_MAX,
} from "./runtime-config.ts";
import { vwLog } from "./diagnostics.ts";

function parseChatDbResult(raw: string | null | undefined): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    vwLog("chat db parse failed", { error: String(e) });
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
): any[] {
  const result = parseChatDbResult(
    database.query(tableName, filters, limit, orderBy, orderDir),
  );
  if (!Array.isArray(result)) {
    if (result && result.error) {
      vwLog("chat db query failed", {
        table: tableName,
        filters: filters || "",
        error: String(result.error),
      });
    }
    return [];
  }
  return result;
}

function insertChatRow(tableName: string, data: unknown): any {
  const result = parseChatDbResult(
    database.insert(tableName, JSON.stringify(data)),
  );
  if (result && result.error) {
    vwLog("chat db insert failed", {
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
): void {
  const result = parseChatDbResult(
    database.upsert(
      VWORLD_DM_INDEX_TABLE,
      JSON.stringify(["user_id", "other_user_id"]),
      JSON.stringify({
        user_id: userId,
        other_user_id: otherUserId,
        last_ts: toStoredChatTimestamp(ts),
      }),
    ),
  );
  if (result && result.error) {
    vwLog("chat db upsert failed", {
      table: VWORLD_DM_INDEX_TABLE,
      error: String(result.error),
    });
  }
}

function pruneChatRows(
  tableName: string,
  orderField: string,
  maxCount: number,
  filters: string,
): void {
  const rows = queryChatRows(tableName, filters, 1000, orderField, "desc");
  if (rows.length <= maxCount) return;
  for (let i = maxCount; i < rows.length; i++) {
    if (!Number.isFinite(Number(rows[i] && rows[i].id))) continue;
    const result = parseChatDbResult(
      database.delete(tableName, Number(rows[i].id)),
    );
    if (result && result.error) {
      vwLog("chat db prune delete failed", {
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

export function loadWorldChat(worldId: string): Array<{
  id: string;
  sender_id: string;
  sender_nick: string;
  text: string;
  ts: number;
}> {
  const rows = queryChatRows(
    VWORLD_CHAT_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    WORLD_CHAT_MAX,
    "ts",
    "desc",
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
): void {
  insertChatRow(VWORLD_CHAT_TABLE, {
    message_id: String(msg.id),
    world_id: String(worldId),
    sender_id: String(msg.sender_id || ""),
    sender_nick: String(msg.sender_nick || ""),
    text: String(msg.text || ""),
    ts: toStoredChatTimestamp(Number(msg.ts || Date.now())),
  });
  pruneChatRows(
    VWORLD_CHAT_TABLE,
    "ts",
    WORLD_CHAT_MAX,
    JSON.stringify({ world_id: String(worldId) }),
  );
}

export function dmConversationKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function loadDMHistory(
  a: string,
  b: string,
): Array<{
  id: string;
  sender_id: string;
  sender_nick: string;
  recipient_id: string;
  text: string;
  ts: number;
}> {
  const rows = queryChatRows(
    VWORLD_DM_TABLE,
    JSON.stringify({ conversation_key: dmConversationKey(a, b) }),
    DM_MAX,
    "ts",
    "desc",
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
): void {
  const conversationKey = dmConversationKey(a, b);
  insertChatRow(VWORLD_DM_TABLE, {
    message_id: String(msg.id),
    conversation_key: conversationKey,
    sender_id: String(msg.sender_id || ""),
    sender_nick: String(msg.sender_nick || ""),
    recipient_id: String(msg.recipient_id || ""),
    text: String(msg.text || ""),
    ts: toStoredChatTimestamp(Number(msg.ts || Date.now())),
  });
  pruneChatRows(
    VWORLD_DM_TABLE,
    "ts",
    DM_MAX,
    JSON.stringify({ conversation_key: conversationKey }),
  );
}

export function loadDMIndex(userId: string): string[] {
  const rows = queryChatRows(
    VWORLD_DM_INDEX_TABLE,
    JSON.stringify({ user_id: String(userId) }),
    1000,
    "last_ts",
    "desc",
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
): void {
  upsertDMIndexEntry(userId, otherUserId, Number(ts || Date.now()));
}
