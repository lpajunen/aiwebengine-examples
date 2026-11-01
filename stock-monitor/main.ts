/// <reference path="../types/aiwebengine.d.ts" />

// Stock Monitor: a watchlist for longer-term investing, and a record of what
// the person would buy and sell. Nothing is traded.
//
// A signed-in person lists the stocks they watch, each with how big a day's
// move is worth an alert, and gives the script permission to act for them.
// Every 15 minutes a run acting as them fetches a quote for each stock from
// Finnhub with their own key, kept as their secret in this script and sent
// with `{{secret:...}}`. The page at /stock-monitor shows the watchlist with
// the day's moves, the person's Recommended buy and Recommended sell lists,
// and peers of the watched stocks to look at.
//
// Where the person has an agent inbox (`inbox_post` is reachable) and has let
// runs call tools, the runs also post there: the day's watchlist once a day,
// an alert when a stock moves past its threshold, and the stocks to look at.
// The next run applies the answers as if pressed here: server/rules.ts.
//
// The same watchlist is offered as an MCP tool, stock_watchlist, so an agent
// the person talks to can read it to them.

import {
  DEFAULT_THRESHOLD,
  MAX_WATCHLIST,
  PRODUCER,
  alertCard,
  alertsDue,
  candidatesCard,
  dailyDue,
  dayOf,
  effectsOf,
  emptyState,
  formatWatchlist,
  isSymbol,
  parseWatchlist,
  pickCandidates,
  readQuote,
  recommend,
  watchlistCard,
  type InboxEvent,
  type InboxState,
  type Lists,
  type Quote,
  type Watched,
} from "./server/rules.ts";

const KEY = "stock-monitor";
const INSTANCE = "watchlist";
const LABEL = "Watchlist";
const INTERVAL_MINUTES = 15;
/** After the US close, so the day's card shows the day's moves. */
const DEFAULT_DAILY_HOUR = 21;
const SECRET_NAME = "FINNHUB_API_KEY";
const API = "https://finnhub.io/api/v1";
/** Watched stocks whose peers are asked for each day. */
const PEER_SOURCES = 3;
const MAX_OFFERED = 500;
/** Events read per call; a run reads until it has them all. */
const MAX_EVENT_CALLS = 10;

interface Settings {
  watchlist: Watched[];
  dailyHourUtc: number;
}

interface RunStatus {
  checkedAt: string;
  /** Why the last run could not do everything, if it could not. */
  problem?: string;
}

function readJson<T>(name: string, fallback: T): T {
  const raw = personalStorage.getItem(name);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(name: string, value: unknown): void {
  personalStorage.setItem(name, JSON.stringify(value));
}

function settings(): Settings {
  return readJson<Settings>("settings", {
    watchlist: [],
    dailyHourUtc: DEFAULT_DAILY_HOUR,
  });
}

function lists(): Lists {
  return readJson<Lists>("lists", { buy: [], sell: [] });
}

function fail(status: number, error: string): HttpResponse {
  return ResponseBuilder.json({ error }, status);
}

/** The JSON body, or an empty object for one that is not. */
function body(context: HandlerContext): Record<string, unknown> {
  try {
    const value = context.request?.json();
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function signedIn(context: HandlerContext): boolean {
  return Boolean(context.request?.auth?.isAuthenticated);
}

/** Whether runs can act for this person: storage with write, and their key. */
function permitted(grant: DelegationState): boolean {
  const scopes = grant.scopes ?? [];
  return (
    grant.granted &&
    scopes.indexOf("personal_storage") !== -1 &&
    scopes.indexOf("write") !== -1 &&
    scopes.indexOf("secrets") !== -1
  );
}

function declareSchedule(): PersonalSchedule {
  // Saying it again under the same key replaces it.
  return personalTasks.schedule({
    key: KEY,
    handler: "checkWatchlist",
    intervalMinutes: INTERVAL_MINUTES,
  });
}

// ============================================================================
// The page
// ============================================================================

// Everything the page shows: who, what is allowed, the watchlist with its
// quotes, the lists, the stocks to look at, and how the last run went.
function stockMonitorState(context: HandlerContext): HttpResponse {
  if (!signedIn(context)) return ResponseBuilder.json({ signedIn: false });
  const grant = personalTasks.authorization();
  const current = settings();
  const schedule = personalTasks.schedules().find((s) => s.key === KEY) ?? null;
  const inbox = readJson<InboxState | null>("inbox", null);
  return ResponseBuilder.json({
    signedIn: true,
    granted: permitted(grant),
    canPost: (grant.scopes ?? []).indexOf("tools") !== -1,
    inboxAvailable: inboxReachable(),
    inbox: inbox && {
      syncedAt: inbox.syncedAt ?? null,
      problem: inbox.problem ?? null,
    },
    consentUrl: grant.consentUrl ?? null,
    hasKey: secretStorage.exists(SECRET_NAME),
    watchlist: current.watchlist,
    watchlistText: formatWatchlist(current.watchlist),
    dailyHourUtc: current.dailyHourUtc,
    quotes: readJson<Record<string, Quote>>("quotes", {}),
    lists: lists(),
    candidates: readJson<string[]>("candidates", []),
    status: readJson<RunStatus | null>("status", null),
    schedule: schedule && {
      state: schedule.state,
      pausedReason: schedule.pausedReason ?? null,
      nextRunAt: schedule.nextRunAt,
      lastRunAt: schedule.lastRunAt,
    },
  });
}

function stockMonitorSaveWatchlist(context: HandlerContext): HttpResponse {
  if (!signedIn(context)) return fail(401, "Sign in first");
  const input = body(context);
  const { watchlist, errors } = parseWatchlist(String(input.text ?? ""));
  if (errors.length > 0) return fail(400, errors.join("; "));
  const hour = Number(input.dailyHourUtc ?? DEFAULT_DAILY_HOUR);
  if (!(Number.isInteger(hour) && hour >= 0 && hour <= 23)) {
    return fail(400, "The hour is 0 to 23");
  }
  if (permitted(personalTasks.authorization())) {
    try {
      if (watchlist.length === 0) {
        personalTasks.unschedule(KEY);
      } else {
        declareSchedule();
        personalTasks.enqueue({ handler: "checkWatchlist" });
      }
    } catch (e) {
      return fail(403, e instanceof Error ? e.message : "Not allowed");
    }
  }
  writeJson("settings", { watchlist, dailyHourUtc: hour });
  const watched = new Set(watchlist.map((w) => w.symbol));
  writeJson(
    "candidates",
    readJson<string[]>("candidates", []).filter((s) => !watched.has(s)),
  );
  return ResponseBuilder.json({ ok: true, count: watchlist.length });
}

// Every quote, now, rather than at the next run.
function stockMonitorRunNow(context: HandlerContext): HttpResponse {
  if (!signedIn(context)) return fail(401, "Sign in first");
  if (settings().watchlist.length === 0) return fail(400, "No stocks yet");
  if (!secretStorage.exists(SECRET_NAME)) {
    return fail(400, "Store your Finnhub key first");
  }
  try {
    personalTasks.enqueue({ handler: "checkWatchlist" });
  } catch (e) {
    return fail(403, e instanceof Error ? e.message : "Not allowed");
  }
  return ResponseBuilder.json({ ok: true });
}

// The person's own key. It lands in `user_secrets` under their account, so
// nobody else's runs can use it and this script cannot read it back.
function stockMonitorStoreKey(context: HandlerContext): HttpResponse {
  if (!signedIn(context)) return fail(401, "Sign in first");
  const key = String(body(context).key ?? "").trim();
  if (!key) return fail(400, "A key is required");
  try {
    secretStorage.setSecret(SECRET_NAME, key);
  } catch (e) {
    return fail(400, e instanceof Error ? e.message : String(e));
  }
  return ResponseBuilder.json({ hasKey: true });
}

function stockMonitorForgetKey(context: HandlerContext): HttpResponse {
  if (!signedIn(context)) return fail(401, "Sign in first");
  secretStorage.removeSecret(SECRET_NAME);
  return ResponseBuilder.json({ hasKey: secretStorage.exists(SECRET_NAME) });
}

// Puts a stock on a Recommended list, or with `list: null` takes it off.
function stockMonitorRecommend(context: HandlerContext): HttpResponse {
  if (!signedIn(context)) return fail(401, "Sign in first");
  const input = body(context);
  const list = input.list ?? null;
  if (!isSymbol(input.symbol)) return fail(400, "No such stock");
  if (list !== null && list !== "buy" && list !== "sell") {
    return fail(400, "The list is buy, sell or null");
  }
  applyRecommend(input.symbol, list);
  return ResponseBuilder.json({ lists: lists() });
}

// Follow or refuse one of the stocks to look at.
function stockMonitorCandidate(context: HandlerContext): HttpResponse {
  if (!signedIn(context)) return fail(401, "Sign in first");
  const input = body(context);
  if (!isSymbol(input.symbol)) return fail(400, "No such stock");
  if (input.verdict === "follow") follow(input.symbol);
  else if (input.verdict === "dismiss") dismiss(input.symbol);
  else return fail(400, "The verdict is follow or dismiss");
  return ResponseBuilder.json({ ok: true });
}

function applyRecommend(symbol: string, list: "buy" | "sell" | null): void {
  const price = readJson<Record<string, Quote>>("quotes", {})[symbol]?.price;
  writeJson(
    "lists",
    recommend(lists(), symbol, list, price ?? null, new Date().toISOString()),
  );
}

function dropCandidate(symbol: string): void {
  writeJson(
    "candidates",
    readJson<string[]>("candidates", []).filter((s) => s !== symbol),
  );
}

function follow(symbol: string): void {
  const current = settings();
  dropCandidate(symbol);
  if (current.watchlist.some((w) => w.symbol === symbol)) return;
  if (current.watchlist.length >= MAX_WATCHLIST) return;
  current.watchlist.push({ symbol, threshold: DEFAULT_THRESHOLD });
  writeJson("settings", current);
}

function dismiss(symbol: string): void {
  dropCandidate(symbol);
  const refused = readJson<string[]>("refused", []);
  if (refused.indexOf(symbol) === -1) {
    writeJson("refused", [symbol].concat(refused).slice(0, MAX_OFFERED));
  }
}

/** Undoes a Follow or Not interested answered in the inbox. */
function reconsider(symbol: string): void {
  const current = settings();
  current.watchlist = current.watchlist.filter((w) => w.symbol !== symbol);
  writeJson("settings", current);
  writeJson(
    "refused",
    readJson<string[]>("refused", []).filter((s) => s !== symbol),
  );
}

// ============================================================================
// MCP
// ============================================================================

function stockWatchlistTool(context: HandlerContext): unknown {
  if (!context.request?.auth?.isAuthenticated) {
    throw new Error("Sign in to read your watchlist");
  }
  const quotes = readJson<Record<string, Quote>>("quotes", {});
  return {
    watchlist: settings().watchlist.map((w) => ({
      ...w,
      quote: quotes[w.symbol] ?? null,
    })),
    recommended: lists(),
    toLookAt: readJson<string[]>("candidates", []),
  };
}

// ============================================================================
// The run
// ============================================================================

function finnhub(path: string) {
  return {
    url: `${API}${path}`,
    options: {
      timeout: 15_000,
      headers: { "X-Finnhub-Token": "{{secret:" + SECRET_NAME + "}}" },
    },
  };
}

function httpProblem(response: FetchResponse): string {
  return response.status === 401 || response.status === 403
    ? `Finnhub refused the key (HTTP ${response.status})`
    : `Finnhub: HTTP ${response.status}`;
}

/** Quotes for the watchlist, keeping the last known one where a fetch fails. */
function fetchQuotes(
  watchlist: Watched[],
  now: string,
): { quotes: Record<string, Quote>; problems: string[] } {
  const quotes = readJson<Record<string, Quote>>("quotes", {});
  const kept: Record<string, Quote> = {};
  const problems: string[] = [];
  const responses = fetchAll(
    watchlist.map((w) =>
      finnhub(`/quote?symbol=${encodeURIComponent(w.symbol)}`),
    ),
  );
  watchlist.forEach((w, i) => {
    const response = responses[i];
    if (quotes[w.symbol]) kept[w.symbol] = quotes[w.symbol];
    if (!response.ok) {
      problems.push(`${w.symbol}: ${httpProblem(response)}`);
      return;
    }
    let q: Quote | null = null;
    try {
      q = readQuote(response.json(), now);
    } catch {
      q = null;
    }
    if (q) kept[w.symbol] = q;
    else problems.push(`${w.symbol}: no quote`);
  });
  writeJson("quotes", kept);
  return { quotes: kept, problems };
}

/** New peers of a few watched stocks, a different few each day. */
function findCandidates(watchlist: Watched[], now: string): string[] {
  if (watchlist.length === 0) return [];
  const start = Math.floor(Date.parse(now) / 86_400_000) % watchlist.length;
  const sources: Watched[] = [];
  for (let i = 0; i < Math.min(PEER_SOURCES, watchlist.length); i++) {
    sources.push(watchlist[(start + i) % watchlist.length]);
  }
  const responses = fetchAll(
    sources.map((w) =>
      finnhub(`/stock/peers?symbol=${encodeURIComponent(w.symbol)}`),
    ),
  );
  const peers = responses.map((r) => {
    if (!r.ok) return [];
    try {
      const list = r.json();
      return Array.isArray(list) ? list.map(String) : [];
    } catch {
      return [];
    }
  });
  const offered = readJson<string[]>("offered", []);
  const picked = pickCandidates(
    peers,
    watchlist,
    readJson<string[]>("refused", []),
    offered,
  );
  if (picked.length > 0) {
    writeJson("offered", picked.concat(offered).slice(0, MAX_OFFERED));
    writeJson(
      "candidates",
      picked.concat(readJson<string[]>("candidates", [])).slice(0, 20),
    );
  }
  return picked;
}

function checkWatchlist(context: HandlerContext): void {
  void context;
  const current = settings();
  if (current.watchlist.length === 0) return;
  const now = new Date().toISOString();
  if (!secretStorage.exists(SECRET_NAME)) {
    writeJson("status", { checkedAt: now, problem: "No Finnhub key stored" });
    return;
  }

  // What the person answered in their inbox counts before this run posts.
  const inbox = inboxReachable();
  if (inbox) collectAnswers();

  const watchlist = settings().watchlist;
  const { quotes, problems } = fetchQuotes(watchlist, now);
  const daily = dailyDue(
    readJson<string>("dailyDay", ""),
    now,
    current.dailyHourUtc,
  );
  const candidates = daily ? findCandidates(watchlist, now) : [];
  if (daily) writeJson("dailyDay", dayOf(now));
  writeJson("status", {
    checkedAt: now,
    ...(problems.length > 0
      ? { problem: problems.slice(0, 5).join("; ") }
      : {}),
  });
  if (inbox) postToInbox(watchlist, quotes, candidates, daily, now);
}

// ============================================================================
// The agent inbox
// ============================================================================

/** Whether an inbox is reachable from this run. */
function inboxReachable(): boolean {
  try {
    return tools.list("inbox_post").some((t) => t.name === "inbox_post");
  } catch {
    // No "tools" in the grant, so this run cannot call tools at all.
    return false;
  }
}

function producer() {
  return {
    name: PRODUCER,
    instance: INSTANCE,
    label: LABEL,
    settingsUrl: "/stock-monitor",
  };
}

function inboxProblem(e: unknown): string {
  return `Inbox: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
}

/** Applies what the person answered in the inbox since the last run. */
function collectAnswers(): void {
  const state = readJson<InboxState>("inbox", emptyState());
  try {
    for (let call = 0; call < MAX_EVENT_CALLS; call++) {
      const answer = tools.call("inbox_events", {
        producer: producer(),
        since: state.cursor,
      }) as { events: InboxEvent[]; cursor: number };
      for (const effect of effectsOf(answer.events)) {
        if (effect.kind === "recommend") {
          applyRecommend(effect.symbol, effect.list);
        } else if (effect.kind === "follow") {
          follow(effect.symbol);
        } else if (effect.kind === "dismiss") {
          dismiss(effect.symbol);
        } else {
          reconsider(effect.symbol);
        }
      }
      // Saved each round, so answers applied are not applied again.
      state.cursor = answer.cursor;
      writeJson("inbox", state);
      if (answer.events.length === 0) break;
    }
    delete state.problem;
    state.syncedAt = new Date().toISOString();
  } catch (e) {
    state.problem = inboxProblem(e);
  }
  writeJson("inbox", state);
}

/** Posts the alerts due, and once a day the watchlist and stocks to look at. */
function postToInbox(
  watchlist: Watched[],
  quotes: Record<string, Quote>,
  candidates: string[],
  daily: boolean,
  now: string,
): void {
  const before = readJson<InboxState>("inbox", emptyState());
  const day = dayOf(now);
  const current = lists();
  const post = (card: unknown) =>
    tools.call("inbox_post", { producer: producer(), card });
  try {
    const due = alertsDue(before, watchlist, quotes, now);
    for (const symbol of due.symbols) {
      const watched = watchlist.find((w) => w.symbol === symbol);
      if (watched) post(alertCard(day, watched, quotes[symbol], current));
    }
    const state: InboxState = { ...due.state };
    if (daily) {
      post(watchlistCard(day, watchlist, quotes, current));
      if (candidates.length > 0) post(candidatesCard(day, candidates));
    }
    delete state.problem;
    state.syncedAt = now;
    writeJson("inbox", state);
  } catch (e) {
    writeJson("inbox", { ...before, problem: inboxProblem(e) });
  }
}

function init(): void {
  mcpRegistry.registerTool("stock_watchlist", {
    description:
      "The person's stock watchlist with the latest quotes, their Recommended buy and sell lists, and stocks proposed to look at.",
    inputSchema: { type: "object", properties: {} },
    handler: "stockWatchlistTool",
  });
  routeRegistry.registerRoute("/stock-monitor", { file: "public/index.html" });
  routeRegistry.registerRoute("/stock-monitor/app.js", {
    file: "public/app.js",
  });
  routeRegistry.registerRoute("/stock-monitor/state", {
    handler: "stockMonitorState",
  });
  routeRegistry.registerRoute("/stock-monitor/watchlist", {
    handler: "stockMonitorSaveWatchlist",
    method: "POST",
  });
  routeRegistry.registerRoute("/stock-monitor/run", {
    handler: "stockMonitorRunNow",
    method: "POST",
  });
  routeRegistry.registerRoute("/stock-monitor/key", {
    handler: "stockMonitorStoreKey",
    method: "POST",
  });
  routeRegistry.registerRoute("/stock-monitor/key", {
    handler: "stockMonitorForgetKey",
    method: "DELETE",
  });
  routeRegistry.registerRoute("/stock-monitor/recommend", {
    handler: "stockMonitorRecommend",
    method: "POST",
  });
  routeRegistry.registerRoute("/stock-monitor/candidate", {
    handler: "stockMonitorCandidate",
    method: "POST",
  });
}
