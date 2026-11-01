// The watchlist's rules: reading what the person typed, reading a quote, when
// a move is an alert, which stocks to propose, the cards an agent inbox is
// sent (docs/guides/agent-inbox.md in aiwebengine-dev), and what each answer
// means. No storage or calls here — main.ts does those — so the rules can be
// tested on their own.
//
// Three cards, each with its own options:
// - the daily watchlist, a batch with one item per stock: Recommend buy,
//   Recommend sell or Hold, which put the stock on the person's Recommended
//   buy or sell list, or take it off both;
// - an alert when a stock moves past its threshold, one per stock and day,
//   superseded by the next one for that stock, with the same options;
// - stocks to look at, a batch of peers of the watched ones: Follow adds one
//   to the watchlist, Not interested means it is not proposed again.
// Nothing trades; the lists are the person's own record. A question asked on
// any of them (`stock_monitor_ask`) is about the stock askedSymbol names.

/** The name this producer posts under; the inbox's allow-list names it. */
export const PRODUCER = "stock-monitor";
export const MAX_WATCHLIST = 30;
/** A move of this many percent in a day is an alert, unless the line says. */
export const DEFAULT_THRESHOLD = 5;
/** Stocks proposed per day. */
export const MAX_CANDIDATES = 5;

export const BUY = "buy";
export const SELL = "sell";
export const HOLD = "hold";
export const FOLLOW = "follow";
export const NOT_INTERESTED = "not_interested";

/** Offered beside the inbox's Ask field. */
const SUGGESTED = ["What does the company do?", "Any recent news?"];

const RECOMMEND_OPTIONS = [
  { id: BUY, label: "Recommend buy", style: "primary", weight: "feedback" },
  { id: SELL, label: "Recommend sell", style: "negative", weight: "feedback" },
  { id: HOLD, label: "Hold", style: "neutral", weight: "feedback" },
];
const CANDIDATE_OPTIONS = [
  { id: FOLLOW, label: "Follow", style: "primary", weight: "feedback" },
  {
    id: NOT_INTERESTED,
    label: "Not interested",
    style: "negative",
    weight: "feedback",
  },
];

/** A ticker as the market-data service names it: AAPL, BRK.B, NOKIA.HE. */
const SYMBOL = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

export interface Watched {
  symbol: string;
  /** Percent move in a day that is an alert. */
  threshold: number;
}

export interface Quote {
  price: number;
  /** Change since the previous close, in percent. */
  changePct: number;
  previousClose: number;
  at: string;
}

/** One entry on a Recommended list. */
export interface Recommended {
  symbol: string;
  at: string;
  /** The price when it was recommended, if one was known. */
  price: number | null;
}

export interface Lists {
  buy: Recommended[];
  sell: Recommended[];
}

/** Where the watchlist stands with the inbox, kept in its storage. */
export interface InboxState {
  cursor: number;
  /** The last alert per stock: "<day>:<up|down>". */
  alerts: Record<string, string>;
  /** The day the last day's round reached the inbox. */
  postedDay?: string;
  /** Stocks to look at already posted, newest first. */
  postedCandidates?: string[];
  problem?: string;
  syncedAt?: string;
}

/** An event as `inbox_events` answers it; only the fields used here. */
export interface InboxEvent {
  type: string;
  externalId: string;
  itemId?: string;
  optionId?: string | null;
}

/** What an answer does to the person's lists and watchlist. */
export type Effect =
  | { kind: "recommend"; symbol: string; list: "buy" | "sell" | null }
  | { kind: "follow"; symbol: string }
  | { kind: "dismiss"; symbol: string }
  | { kind: "reconsider"; symbol: string };

export function emptyState(): InboxState {
  return { cursor: 0, alerts: {} };
}

/** The UTC day of an ISO time: "2026-10-31". */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The watchlist from what the person typed: one stock per line, a ticker and
 * optionally its alert threshold in percent ("AAPL 3"). Lines that cannot be
 * read are answered as errors, so nothing is dropped silently.
 */
export function parseWatchlist(text: string): {
  watchlist: Watched[];
  errors: string[];
} {
  const watchlist: Watched[] = [];
  const errors: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const [first, second, ...rest] = line.split(/[\s,;]+/);
    const symbol = first.toUpperCase();
    const threshold =
      second === undefined
        ? DEFAULT_THRESHOLD
        : Number(second.replace(/%$/, ""));
    if (
      !SYMBOL.test(symbol) ||
      rest.length > 0 ||
      !(threshold > 0 && threshold <= 100)
    ) {
      errors.push(`Cannot read "${line.slice(0, 40)}"`);
    } else if (watchlist.some((w) => w.symbol === symbol)) {
      continue;
    } else if (watchlist.length >= MAX_WATCHLIST) {
      errors.push(`At most ${MAX_WATCHLIST} stocks; ${symbol} left out`);
    } else {
      watchlist.push({ symbol, threshold });
    }
  }
  return { watchlist, errors };
}

/** The watchlist written back as the person would type it. */
export function formatWatchlist(watchlist: Watched[]): string {
  return watchlist
    .map((w) =>
      w.threshold === DEFAULT_THRESHOLD
        ? w.symbol
        : `${w.symbol} ${w.threshold}`,
    )
    .join("\n");
}

export function isSymbol(value: unknown): value is string {
  return typeof value === "string" && SYMBOL.test(value);
}

/**
 * A quote from the market-data service's answer ({c, pc, dp, t}), or null
 * for a symbol it does not know, which it answers with zeros.
 */
export function readQuote(body: unknown, now: string): Quote | null {
  const q = body as { c?: unknown; pc?: unknown; dp?: unknown; t?: unknown };
  if (!q || typeof q.c !== "number" || q.c <= 0) return null;
  const previousClose = typeof q.pc === "number" ? q.pc : 0;
  const changePct =
    typeof q.dp === "number"
      ? q.dp
      : previousClose > 0
        ? ((q.c - previousClose) / previousClose) * 100
        : 0;
  const at =
    typeof q.t === "number" && q.t > 0
      ? new Date(q.t * 1000).toISOString()
      : now;
  return { price: q.c, changePct, previousClose, at };
}

/**
 * Whether the day's round (the watchlist card, stocks to look at) is due:
 * once a day, from `hourUtc` on. `lastDay` is the day of the last one.
 */
export function dailyDue(
  lastDay: string,
  now: string,
  hourUtc: number,
): boolean {
  return lastDay !== dayOf(now) && new Date(now).getUTCHours() >= hourUtc;
}

/**
 * What the day's round posts to the inbox, if it is due there: the watchlist
 * card, and the stocks to look at not posted before. Kept apart from when
 * the peers are fetched, so a round that ran before the inbox could be
 * reached, or whose post failed, is posted at the next run that reaches it.
 * Answers the state as it is once posted.
 */
export function dailyPosts(
  state: InboxState,
  pending: string[],
  now: string,
  hourUtc: number,
): { due: boolean; candidates: string[]; state: InboxState } {
  if (!dailyDue(state.postedDay ?? "", now, hourUtc)) {
    return { due: false, candidates: [], state };
  }
  const posted = state.postedCandidates ?? [];
  const candidates = pending.filter((s) => posted.indexOf(s) === -1);
  return {
    due: true,
    candidates,
    state: {
      ...state,
      postedDay: dayOf(now),
      postedCandidates: candidates.concat(posted).slice(0, 500),
    },
  };
}

/**
 * The stocks that moved past their threshold and have not had an alert for
 * that move today; a move back the other way is a new alert. Answers the
 * state as it is once those are posted.
 */
export function alertsDue(
  state: InboxState,
  watchlist: Watched[],
  quotes: Record<string, Quote>,
  now: string,
): { state: InboxState; symbols: string[] } {
  const today = dayOf(now);
  const alerts = { ...state.alerts };
  const symbols: string[] = [];
  for (const w of watchlist) {
    const q = quotes[w.symbol];
    if (!q || dayOf(q.at) !== today) continue;
    if (Math.abs(q.changePct) < w.threshold) continue;
    const mark = `${today}:${q.changePct > 0 ? "up" : "down"}`;
    if (alerts[w.symbol] === mark) continue;
    alerts[w.symbol] = mark;
    symbols.push(w.symbol);
  }
  return { state: { ...state, alerts }, symbols };
}

/**
 * Up to `max` peers to propose: not watched, not refused, never proposed
 * before. Peers of each watched stock in turn, so one does not crowd out
 * the rest.
 */
export function pickCandidates(
  peers: string[][],
  watchlist: Watched[],
  refused: string[],
  offered: string[],
  max = MAX_CANDIDATES,
): string[] {
  const skip = new Set(watchlist.map((w) => w.symbol).concat(refused, offered));
  const picked: string[] = [];
  const longest = peers.reduce((n, list) => Math.max(n, list.length), 0);
  for (let i = 0; i < longest && picked.length < max; i++) {
    for (const list of peers) {
      const symbol = list[i];
      if (picked.length >= max) break;
      if (!isSymbol(symbol) || skip.has(symbol)) continue;
      skip.add(symbol);
      picked.push(symbol);
    }
  }
  return picked;
}

/** "+4.2 %", "−3.0 %". */
export function signed(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "±";
  return `${sign}${Math.abs(pct).toFixed(1)} %`;
}

function money(price: number): string {
  return price.toFixed(price < 1 ? 4 : 2);
}

function quoteLink(symbol: string) {
  return {
    label: "Quote",
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
  };
}

function onList(lists: Lists, symbol: string): string {
  if (lists.buy.some((r) => r.symbol === symbol)) return "On Recommended buy.";
  if (lists.sell.some((r) => r.symbol === symbol)) {
    return "On Recommended sell.";
  }
  return "";
}

/** The day's watchlist card: every stock with its price and day's move. */
export function watchlistCard(
  day: string,
  watchlist: Watched[],
  quotes: Record<string, Quote>,
  lists: Lists,
) {
  return {
    externalId: `w-${day}`,
    topic: `${PRODUCER}:watchlist`,
    title: `Watchlist, ${day}`,
    summary:
      "Recommend buy or sell puts a stock on your Recommended list on the " +
      "watchlist's page; Hold takes it off. Nothing is traded.",
    options: RECOMMEND_OPTIONS,
    suggestedQuestions: SUGGESTED,
    allowLater: true,
    items: watchlist.map((w) => {
      const q = quotes[w.symbol];
      return {
        id: w.symbol,
        title: q
          ? `${w.symbol} ${money(q.price)} (${signed(q.changePct)})`
          : `${w.symbol}, no quote`,
        summary: onList(lists, w.symbol) || undefined,
        links: [quoteLink(w.symbol)],
      };
    }),
  };
}

/** A card for a move past the threshold; the next one for the stock replaces it. */
export function alertCard(
  day: string,
  watched: Watched,
  quote: Quote,
  lists: Lists,
) {
  const direction = quote.changePct > 0 ? "up" : "down";
  return {
    externalId: `a-${day}-${watched.symbol}`,
    topic: `${PRODUCER}:${watched.symbol}`,
    title: `${watched.symbol} ${direction} ${signed(quote.changePct)} today`,
    summary:
      `Past your ${watched.threshold} % threshold. ` +
      onList(lists, watched.symbol),
    facts: [
      { label: "Price", value: money(quote.price) },
      { label: "Previous close", value: money(quote.previousClose) },
    ],
    links: [quoteLink(watched.symbol)],
    options: RECOMMEND_OPTIONS,
    allowLater: true,
    priority: "high",
    suggestedQuestions: ["Why did it move today?"].concat(SUGGESTED),
  };
}

/** Peers of the watched stocks, proposed to follow. */
export function candidatesCard(day: string, symbols: string[]) {
  return {
    externalId: `c-${day}`,
    topic: `${PRODUCER}:candidates`,
    title: `Stocks to look at, ${day}`,
    summary:
      "Peers of the stocks you watch. Follow adds one to your watchlist; " +
      "Not interested means it is not proposed again.",
    options: CANDIDATE_OPTIONS,
    suggestedQuestions: SUGGESTED,
    allowLater: true,
    items: symbols.map((symbol) => ({
      id: symbol,
      title: symbol,
      links: [quoteLink(symbol)],
    })),
  };
}

/** The stock a card or item is about, and which kind of card it is. */
function subject(
  e: InboxEvent,
): { card: "w" | "a" | "c"; symbol: string } | null {
  const kind = e.externalId.slice(0, 2);
  // "a-2026-11-01-ACME"
  const symbol = kind === "a-" ? e.externalId.slice(2 + 11) : (e.itemId ?? "");
  if (!isSymbol(symbol)) return null;
  if (kind === "w-" || kind === "a-" || kind === "c-") {
    return { card: kind[0] as "w" | "a" | "c", symbol };
  }
  return null;
}

/**
 * The stock a question on a card is about: an alert's, or the item asked
 * about on a batch. Null for a batch asked about as a whole.
 */
export function askedSymbol(
  externalId: string,
  itemId?: string,
): string | null {
  return subject({ type: "asked", externalId, itemId })?.symbol ?? null;
}

/**
 * What the person's answers do, in order. On the watchlist and alerts: Buy
 * and Sell put the stock on that list, Hold or a cleared answer takes it off
 * both. On the stocks to look at: Follow watches it, Not interested refuses
 * it, a cleared answer undoes either. Opening, Later, expiry and withdrawal
 * change nothing.
 */
export function effectsOf(events: InboxEvent[]): Effect[] {
  const effects: Effect[] = [];
  for (const e of events) {
    const about = subject(e);
    if (!about) continue;
    const { card, symbol } = about;
    const answered = e.type === "decided" || e.type === "changed";
    if (card === "c") {
      if (answered && e.optionId === FOLLOW) {
        effects.push({ kind: "follow", symbol });
      } else if (answered && e.optionId === NOT_INTERESTED) {
        effects.push({ kind: "dismiss", symbol });
      } else if (e.type === "cleared") {
        effects.push({ kind: "reconsider", symbol });
      }
    } else if (answered && (e.optionId === BUY || e.optionId === SELL)) {
      effects.push({ kind: "recommend", symbol, list: e.optionId });
    } else if ((answered && e.optionId === HOLD) || e.type === "cleared") {
      effects.push({ kind: "recommend", symbol, list: null });
    }
  }
  return effects;
}

/**
 * The lists with `symbol` on `list` (newest first) and off the other, or off
 * both for null. A stock already on the list keeps when it was put there.
 */
export function recommend(
  lists: Lists,
  symbol: string,
  list: "buy" | "sell" | null,
  price: number | null,
  at: string,
): Lists {
  const without = (entries: Recommended[]) =>
    entries.filter((r) => r.symbol !== symbol);
  const put = (entries: Recommended[]) =>
    entries.some((r) => r.symbol === symbol)
      ? entries
      : [{ symbol, at, price }].concat(entries);
  return {
    buy: list === "buy" ? put(lists.buy) : without(lists.buy),
    sell: list === "sell" ? put(lists.sell) : without(lists.sell),
  };
}
