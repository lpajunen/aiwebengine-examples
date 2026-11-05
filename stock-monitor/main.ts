/// <reference path="../types/aiwebengine.d.ts" />

// Stock Monitor: a watchlist for longer-term investing, and a record of what
// the person would buy and sell. Nothing is traded.
//
// A signed-in person lists the stocks they watch, each with how big a day's
// move is worth an alert, and gives the script permission to act for them.
// Every 15 minutes a run acting as them fetches a quote for each stock from
// Finnhub with their own key, kept as their secret in this script and sent
// with `{{secret:...}}`. The page at /stock-monitor shows the watchlist with
// the day's moves, in the groups the person sorted it into, the person's
// Recommended buy and Recommended sell lists, and peers of the watched stocks
// to look at. The lists are one record across the groups.
//
// Where the person has an agent inbox (`inbox_post` is reachable) and has let
// runs call tools, the runs also post there: the day's watchlist once a day
// (a card per group),
// an alert when a stock moves past its threshold, and the stocks to look at.
// The next run applies the answers as if pressed here: server/rules.ts.
//
// The same watchlist is offered as an MCP tool, stock_watchlist, so an agent
// the person talks to can read it to them. A question the person asks on one
// of the inbox cards is answered by the inbox from stock_monitor_context,
// read-only and as them: why the card was posted, the stock's quote and the
// person's lists, and the company's profile and recent news. The inbox may
// read older news with stock_monitor_news. Answers are information, not
// advice: the manifest's policy says so.

import {
  DEFAULT_THRESHOLD,
  MAX_WATCHLIST,
  PRODUCER,
  alertCard,
  alertsDue,
  askFacts,
  askedSymbol,
  candidatesCard,
  cardKind,
  dailyDue,
  dailyPosts,
  dayOf,
  effectsOf,
  emptyState,
  formatWatchlist,
  groupsOf,
  isSymbol,
  needsWelcome,
  parseWatchlist,
  pickCandidates,
  readQuote,
  recommend,
  watchlistCards,
  welcomeCard,
  whyPosted,
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
/** News items about a stock a question is answered from. */
const MAX_NEWS = 6;
/** How far back news is read: by default, and at most. */
const NEWS_DAYS = 7;
const MAX_NEWS_DAYS = 30;
const API = "https://finnhub.io/api/v1";
/** Watched stocks whose peers are asked for each day. */
const PEER_SOURCES = 3;
const MAX_OFFERED = 500;
/** Events read per call; a run reads until it has them all. */
const MAX_EVENT_CALLS = 10;

interface Settings {
  watchlist: Watched[];
  dailyHourUtc: number;
  /** Stopped by the person from their agent inbox; not scheduled until resumed. */
  paused?: boolean;
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
  let schedule = personalTasks.schedules().find((s) => s.key === KEY) ?? null;
  // A watchlist set up before permission was given is scheduled once it is.
  if (
    !schedule &&
    current.watchlist.length > 0 &&
    !current.paused &&
    permitted(grant)
  ) {
    try {
      schedule = declareSchedule();
    } catch (e) {
      console.warn(`stock-monitor: declaring the schedule: ${e}`);
    }
  }
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
    keyUrl: keyUrl(),
    watchlist: current.watchlist,
    groups: groupsOf(current.watchlist),
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
  try {
    const count = saveSettings(
      String(input.text ?? ""),
      input.dailyHourUtc ?? DEFAULT_DAILY_HOUR,
    );
    return ResponseBuilder.json({ ok: true, count });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(e instanceof SettingsError ? 400 : 403, message);
  }
}

/** A setting the person gave that cannot be used; their mistake, not a refusal. */
class SettingsError extends Error {}

/**
 * Saves the watchlist and the hour of the day's round, and keeps the
 * schedule to match: scheduled with stocks and not paused, and checked at
 * once. Without permission to act for the person the settings are still
 * saved and nothing is scheduled; the status says what is missing. Answers
 * how many stocks are watched.
 */
function saveSettings(text: string, hourValue: unknown): number {
  const { watchlist, errors } = parseWatchlist(text);
  if (errors.length > 0) throw new SettingsError(errors.join("; "));
  const hour = Number(hourValue);
  if (!(Number.isInteger(hour) && hour >= 0 && hour <= 23)) {
    throw new SettingsError("The hour is 0 to 23");
  }
  const paused = settings().paused === true;
  if (permitted(personalTasks.authorization())) {
    if (watchlist.length === 0 || paused) {
      personalTasks.unschedule(KEY);
    } else {
      declareSchedule();
      personalTasks.enqueue({ handler: "checkWatchlist" });
    }
  }
  const next: Settings = { watchlist, dailyHourUtc: hour };
  if (paused) next.paused = true;
  writeJson("settings", next);
  const watched = new Set(watchlist.map((w) => w.symbol));
  writeJson(
    "candidates",
    readJson<string[]>("candidates", []).filter((s) => !watched.has(s)),
  );
  return watchlist.length;
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

/**
 * The engine's page where the person stores, replaces or removes their
 * Finnhub key, coming back here. The key goes straight into `user_secrets`
 * under their account; this script never handles it.
 */
function keyUrl(): string {
  return secretStorage.entryUrl(SECRET_NAME) + "&redirect=" + PAGE;
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

/** A stock followed joins the ones under no heading, at the end. */
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

/** A document of the context a question is answered from. */
interface ContextDocument {
  title: string;
  url?: string;
  text: string;
  at?: string;
}

interface NewsItem {
  headline?: string;
  summary?: string;
  source?: string;
  url?: string;
  datetime?: number;
}

/** Finnhub's answers to these paths, null for one that failed or no key. */
function readFinnhub(paths: string[]): unknown[] {
  if (!secretStorage.exists(SECRET_NAME)) return paths.map(() => null);
  return fetchAll(paths.map(finnhub)).map((r) => {
    if (!r.ok) return null;
    try {
      return r.json();
    } catch {
      return null;
    }
  });
}

function newsPath(symbol: string, days: number): string {
  const today = new Date();
  const from = new Date(today.getTime() - days * 86_400_000);
  return (
    `/company-news?symbol=${encodeURIComponent(symbol)}` +
    `&from=${dayOf(from.toISOString())}&to=${dayOf(today.toISOString())}`
  );
}

function webUrl(value: unknown): string | undefined {
  return typeof value === "string" && /^https?:\/\//.test(value)
    ? value
    : undefined;
}

function newsDocuments(answer: unknown): ContextDocument[] {
  return (Array.isArray(answer) ? (answer as NewsItem[]) : [])
    .slice(0, MAX_NEWS)
    .map((item) => {
      const doc: ContextDocument = {
        title: item.headline ?? "News",
        text:
          (item.summary ?? "").slice(0, 400) +
          (item.source ? `\nSource: ${item.source}` : ""),
      };
      const url = webUrl(item.url);
      if (url) doc.url = url;
      if (item.datetime) {
        doc.at = new Date(item.datetime * 1000).toISOString().slice(0, 10);
      }
      return doc;
    });
}

function profileDocument(
  symbol: string,
  answer: unknown,
): ContextDocument | null {
  if (!answer || typeof answer !== "object") return null;
  const p = answer as Record<string, unknown>;
  if (Object.keys(p).length === 0) return null;
  const lines = [
    ["Name", p.name],
    ["Industry", p.finnhubIndustry],
    ["Country", p.country],
    ["Exchange", p.exchange],
    ["Listed since", p.ipo],
    ["Market capitalisation (millions)", p.marketCapitalization],
    ["Currency", p.currency],
  ]
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    )
    .map(([label, value]) => `${label}: ${String(value)}`);
  const doc: ContextDocument = {
    title: `${typeof p.name === "string" ? p.name : symbol}: company profile`,
    text: lines.join("\n"),
  };
  const url = webUrl(p.weburl);
  if (url) doc.url = url;
  return doc;
}

// What the inbox answers a question on one of the watchlist's cards from:
// why it was posted, what is known of the stock asked about, and the
// company's profile and recent news; for a batch asked about as a whole,
// the card's stocks. The inbox calls it as the person, read-only.
function stockMonitorContextTool(context: HandlerContext): unknown {
  contractCall(context);
  const args = (context.args ?? {}) as Record<string, unknown>;
  const externalId = String(args.externalId ?? "");
  const kind = cardKind(externalId);
  if (!kind) throw new Error("Not a card the watchlist posted");
  const symbol = askedSymbol(
    externalId,
    typeof args.itemId === "string" ? args.itemId : undefined,
  );
  const watchlist = settings().watchlist;
  const quotes = readJson<Record<string, Quote>>("quotes", {});
  const current = lists();
  const at = new Date().toISOString();
  if (!symbol) {
    const stocks =
      kind === "c"
        ? readJson<string[]>("candidates", [])
        : watchlist.map((w) => w.symbol);
    return {
      why: whyPosted(kind, null, null),
      documents: [
        {
          title: "The stocks on the card",
          text: stocks
            .map((s) => {
              const q = quotes[s];
              return (
                `${s}: ` +
                (q
                  ? `${q.price} (${q.changePct.toFixed(2)} % today)`
                  : "no quote") +
                (current.buy.some((r) => r.symbol === s)
                  ? ", on Recommended buy"
                  : current.sell.some((r) => r.symbol === s)
                    ? ", on Recommended sell"
                    : "")
              );
            })
            .join("\n"),
        },
      ],
      at,
    };
  }
  const watched = watchlist.find((w) => w.symbol === symbol) ?? null;
  const quote = quotes[symbol] ?? null;
  const [profile, news] = readFinnhub([
    `/stock/profile2?symbol=${encodeURIComponent(symbol)}`,
    newsPath(symbol, NEWS_DAYS),
  ]);
  const company = profileDocument(symbol, profile);
  return {
    why: whyPosted(kind, watched, quote),
    facts: askFacts(symbol, watched, quote, current),
    documents: (company ? [company] : []).concat(newsDocuments(news)),
    at,
  };
}

// Older news about a stock, for a question that needs more than the last week.
function stockMonitorNewsTool(context: HandlerContext): unknown {
  contractCall(context);
  const args = (context.args ?? {}) as Record<string, unknown>;
  const symbol = String(args.symbol ?? "").toUpperCase();
  if (!isSymbol(symbol)) throw new Error("No such stock");
  const days = Math.min(
    MAX_NEWS_DAYS,
    Math.max(1, Math.floor(Number(args.days) || MAX_NEWS_DAYS)),
  );
  return { documents: newsDocuments(readFinnhub([newsPath(symbol, days)])[0]) };
}

// ============================================================================
// The agent contract: what an agent inbox calls to set the watchlist up, see
// how it is doing, and pause, resume or remove it (docs/guides/agent-inbox.md
// in aiwebengine-dev). The inbox calls these as the person; the keys and the
// permission are still given on this script's own page, which status links.
// One instance per person: the watchlist.
// ============================================================================

const PAGE = "/stock-monitor";

const CONFIG_SCHEMA = {
  type: "object",
  properties: {
    watchlist: {
      type: "string",
      title: "Stocks",
      description: `One per line, at most ${MAX_WATCHLIST}: the ticker and, if not ${DEFAULT_THRESHOLD}, the day's move in percent worth an alert. AAPL, NOKIA.HE 3. A line "# Nordic" puts the stocks below it in that group; each group gets its own daily card.`,
      "x-multiline": true,
    },
    dailyHourUtc: {
      type: "integer",
      title: "Hour of the day's round (UTC)",
      description: "When the day's watchlist and stocks to look at are posted.",
      minimum: 0,
      maximum: 23,
      default: DEFAULT_DAILY_HOUR,
    },
  },
  required: ["watchlist"],
};

function stockMonitorManifestTool(): unknown {
  return {
    name: PRODUCER,
    label: "Stock watchlist",
    description:
      "Your watchlist checked every 15 minutes: an alert when a stock moves past its threshold, the day's watchlist to mark as recommended buy or sell, and peers to look at. Nothing is traded.",
    config: CONFIG_SCHEMA,
    instances: "one",
    scopes: ["personal_storage", "write", "secrets", "tools"],
    secrets: [{ name: SECRET_NAME, label: "Finnhub API key", required: true }],
    settingsUrl: PAGE,
    ask: {
      policy:
        "Information, not advice: never tell the person to buy, sell or hold, and never predict a price. The Recommended buy and sell lists are the person's own record; nothing is ever traded. End every answer with: Information, not advice.",
      tools: ["stock_monitor_news"],
    },
  };
}

/** What the watchlist still needs before it can run, each with where to give it. */
function missing(): { kind: string; label: string; url?: string }[] {
  const found: { kind: string; label: string; url?: string }[] = [];
  const grant = personalTasks.authorization();
  if (!permitted(grant) || (grant.scopes ?? []).indexOf("tools") === -1) {
    found.push({
      kind: "consent",
      label:
        "Give the watchlist permission to work while you are away: personal storage, write, secrets and tools",
      url: grant.consentUrl,
    });
  }
  if (!secretStorage.exists(SECRET_NAME)) {
    found.push({
      kind: "secret",
      label: "Add your Finnhub API key",
      url: keyUrl(),
    });
  }
  if (settings().watchlist.length === 0) {
    found.push({ kind: "config", label: "Add at least one stock", url: PAGE });
  }
  return found;
}

/** How the watchlist is doing, as the inbox shows it. */
function statusOf(): unknown {
  const current = settings();
  const schedule = personalTasks.schedules().find((s) => s.key === KEY) ?? null;
  const gaps = missing();
  const state = current.paused
    ? "paused"
    : gaps.length > 0
      ? "incomplete"
      : !schedule
        ? "ready"
        : schedule.state === "active"
          ? "running"
          : "paused";
  return {
    instance: INSTANCE,
    label: LABEL,
    settingsUrl: PAGE,
    state,
    pausedReason: current.paused
      ? "Paused by you"
      : (schedule?.pausedReason ?? null),
    missing: gaps,
    lastRunAt: schedule?.lastRunAt ?? null,
    nextRunAt:
      schedule && schedule.state === "active" ? schedule.nextRunAt : null,
    problem:
      readJson<InboxState | null>("inbox", null)?.problem ??
      readJson<RunStatus | null>("status", null)?.problem ??
      null,
  };
}

function contractCall(context: HandlerContext): void {
  if (!signedIn(context)) throw new Error("Call as a signed-in person");
  const named = (context.args ?? {}).instance;
  if (named !== undefined && named !== null && named !== INSTANCE) {
    throw new Error(`The watchlist is the one instance, "${INSTANCE}"`);
  }
}

// Sets up the watchlist or changes it. Answers its status, which says what
// is still missing.
function stockMonitorSetupTool(context: HandlerContext): unknown {
  contractCall(context);
  const config = ((context.args ?? {}).config ?? {}) as Record<string, unknown>;
  const current = settings();
  saveSettings(
    config.watchlist !== undefined
      ? String(config.watchlist)
      : formatWatchlist(current.watchlist),
    config.dailyHourUtc ?? current.dailyHourUtc,
  );
  return statusOf();
}

function stockMonitorStatusTool(context: HandlerContext): unknown {
  contractCall(context);
  return statusOf();
}

function stockMonitorPauseTool(context: HandlerContext): unknown {
  contractCall(context);
  personalTasks.unschedule(KEY);
  writeJson("settings", { ...settings(), paused: true });
  return statusOf();
}

// Starts the watchlist when paused, or ready but not yet started.
function stockMonitorResumeTool(context: HandlerContext): unknown {
  contractCall(context);
  const gaps = missing();
  if (gaps.length > 0) {
    throw new Error(`Not yet: ${gaps.map((m) => m.label).join("; ")}`);
  }
  const current = settings();
  delete current.paused;
  writeJson("settings", current);
  declareSchedule();
  personalTasks.enqueue({ handler: "checkWatchlist" });
  return statusOf();
}

// Stops the watchlist and forgets it: stocks, quotes, lists and proposals.
// The keys stay; they are removed on the page.
function stockMonitorRemoveTool(context: HandlerContext): unknown {
  contractCall(context);
  personalTasks.unschedule(KEY);
  for (const name of [
    "settings",
    "quotes",
    "lists",
    "refused",
    "offered",
    "candidates",
    "inbox",
    "status",
    "dailyDay",
  ]) {
    personalStorage.removeItem(name);
  }
  return { removed: true };
}

function registerContractTools(): void {
  const instanceOnly = {
    type: "object",
    properties: { instance: { type: "string" } },
  };
  mcpRegistry.registerTool("stock_monitor_manifest", {
    description:
      "What the stock watchlist is, the configuration it takes, and what it needs (permission, keys) — for an agent inbox's catalog.",
    inputSchema: { type: "object", properties: {} },
    handler: "stockMonitorManifestTool",
  });
  mcpRegistry.registerTool("stock_monitor_setup", {
    description:
      "Set up or change the person's stock watchlist. Answers its status, listing what is still missing and where to give it.",
    inputSchema: {
      type: "object",
      properties: { instance: { type: "string" }, config: CONFIG_SCHEMA },
      required: ["config"],
    },
    handler: "stockMonitorSetupTool",
  });
  mcpRegistry.registerTool("stock_monitor_status", {
    description:
      "How the person's watchlist is doing: running, paused, ready or incomplete, its runs, and what is missing.",
    inputSchema: instanceOnly,
    handler: "stockMonitorStatusTool",
  });
  mcpRegistry.registerTool("stock_monitor_pause", {
    description: "Pause the person's watchlist until resumed.",
    inputSchema: instanceOnly,
    handler: "stockMonitorPauseTool",
  });
  mcpRegistry.registerTool("stock_monitor_resume", {
    description:
      "Start the watchlist when paused or ready; refused while something is missing.",
    inputSchema: instanceOnly,
    handler: "stockMonitorResumeTool",
  });
  mcpRegistry.registerTool("stock_monitor_remove", {
    description:
      "Stop the person's watchlist and forget its stocks, lists and proposals.",
    inputSchema: instanceOnly,
    handler: "stockMonitorRemoveTool",
  });
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
  if (inbox) {
    const owed = needsWelcome(readJson<InboxState>("inbox", emptyState()));
    collectAnswers();
    if (owed) welcome(current.dailyHourUtc);
  }

  const watchlist = settings().watchlist;
  const { quotes, problems } = fetchQuotes(watchlist, now);
  const daily = dailyDue(
    readJson<string>("dailyDay", ""),
    now,
    current.dailyHourUtc,
  );
  if (daily) {
    findCandidates(watchlist, now);
    writeJson("dailyDay", dayOf(now));
  }
  writeJson("status", {
    checkedAt: now,
    ...(problems.length > 0
      ? { problem: problems.slice(0, 5).join("; ") }
      : {}),
  });
  if (inbox) postToInbox(watchlist, quotes, current.dailyHourUtc, now);
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

/** Posts the welcome card; one that fails is tried again on the next run. */
function welcome(dailyHourUtc: number): void {
  let welcomed = true;
  try {
    tools.call("inbox_post", {
      producer: producer(),
      card: welcomeCard(dailyHourUtc),
    });
  } catch (e) {
    welcomed = false;
    console.warn(`stock-monitor: welcome card: ${e}`);
  }
  writeJson("inbox", {
    ...readJson<InboxState>("inbox", emptyState()),
    welcomed,
  });
}

/** Posts the alerts due, and once a day the watchlist and stocks to look at. */
function postToInbox(
  watchlist: Watched[],
  quotes: Record<string, Quote>,
  dailyHourUtc: number,
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
    const daily = dailyPosts(
      due.state,
      readJson<string[]>("candidates", []),
      now,
      dailyHourUtc,
    );
    if (daily.due) {
      for (const card of watchlistCards(day, watchlist, quotes, current)) {
        post(card);
      }
      if (daily.candidates.length > 0) {
        post(candidatesCard(day, daily.candidates));
      }
    }
    const state: InboxState = { ...daily.state };
    delete state.problem;
    state.syncedAt = now;
    writeJson("inbox", state);
  } catch (e) {
    writeJson("inbox", { ...before, problem: inboxProblem(e) });
  }
}

function init(): void {
  secretStorage.declare(SECRET_NAME, { label: "Finnhub API key" });
  registerContractTools();
  mcpRegistry.registerTool("stock_watchlist", {
    description:
      "The person's stock watchlist with the latest quotes, their Recommended buy and sell lists, and stocks proposed to look at.",
    inputSchema: { type: "object", properties: {} },
    handler: "stockWatchlistTool",
  });
  mcpRegistry.registerTool("stock_monitor_context", {
    description:
      "Why the watchlist posted a card in the person's agent inbox, the stock's quote and the person's lists, and the company's profile and recent news: what the inbox answers a question on it from. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string" },
        externalId: { type: "string", description: "The card's externalId." },
        itemId: {
          type: "string",
          description: "The stock asked about on a batch card.",
        },
        question: { type: "string" },
      },
      required: ["externalId"],
    },
    handler: "stockMonitorContextTool",
  });
  mcpRegistry.registerTool("stock_monitor_news", {
    description: `News about a stock from the last ${MAX_NEWS_DAYS} days at most (default all of them), newest first. Read-only.`,
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string" },
        symbol: { type: "string", description: "The ticker: AAPL, NOKIA.HE." },
        days: { type: "integer", minimum: 1, maximum: MAX_NEWS_DAYS },
      },
      required: ["symbol"],
    },
    handler: "stockMonitorNewsTool",
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
  routeRegistry.registerRoute("/stock-monitor/recommend", {
    handler: "stockMonitorRecommend",
    method: "POST",
  });
  routeRegistry.registerRoute("/stock-monitor/candidate", {
    handler: "stockMonitorCandidate",
    method: "POST",
  });
}
