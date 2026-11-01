// The digest as an agent inbox producer (docs/guides/agent-inbox.md in
// aiwebengine-dev): what to post after a run, and what the person's answers
// mean for the digest. No storage or calls here — main.ts does those — so the
// rules can be tested on their own.
//
// Each run's kept articles join one rolling batch card per digest, answered
// item by item: Relevant, Unsure or Not relevant. Opening an article (its
// Read button) handles it too, as read; any article can be set aside for
// Later on its own. The batch starts afresh each day,
// when it is full, and once the person has finished it. An article the model
// rates important goes out as a card of its own instead, a few a day at most.
//
// A question asked on a card (`news_digest_ask`) is about the articles that
// card holds: articlesAsked finds them.

/** The name this producer posts under; the inbox's allow-list names it. */
export const PRODUCER = "news-digest";
/** Articles in one batch card; the inbox caps a card's size. */
export const MAX_BATCH = 30;
/** Highlight cards per digest per day. */
export const MAX_HIGHLIGHTS = 5;
const MAX_SUMMARY = 400;

export const RELEVANT = "relevant";
export const UNSURE = "unsure";
export const NOT_RELEVANT = "not_relevant";

/** Offered on every card; the inbox shows them beside its Ask field. */
const SUGGESTED = ["What is the background?", "Why does this matter?"];

const OPTIONS = [
  { id: RELEVANT, label: "Relevant", style: "primary", weight: "feedback" },
  { id: UNSURE, label: "Unsure", style: "neutral", weight: "feedback" },
  {
    id: NOT_RELEVANT,
    label: "Not relevant",
    style: "negative",
    weight: "feedback",
  },
];

/** The fields of a digest article the inbox needs. */
export interface InboxArticle {
  id: string;
  headline: string;
  summary: string;
  link: string;
  source: string;
  /** Rated important by the model when it was summarised. */
  important?: boolean;
  filtered?: string;
}

/** Where one digest stands with the inbox, kept in its storage. */
export interface InboxState {
  /** The inbox's event cursor. */
  cursor: number;
  /** The rolling batch card, newest article first. */
  batch: { externalId: string; day: string; seq: number; ids: string[] } | null;
  /** Today's highlight cards. */
  highlights: { day: string; ids: string[] };
  /** Why the last attempt failed, for the digest's page. */
  problem?: string;
  /** When the inbox was last reached. */
  syncedAt?: string;
}

/** An event as `inbox_events` answers it; only the fields used here. */
export interface InboxEvent {
  type: string;
  externalId: string;
  itemId?: string;
  optionId?: string | null;
}

/** What an answer does to the digest. */
export type Effect =
  | { kind: "verdict"; id: string; verdict: "want" | "skip" }
  | { kind: "unsort"; id: string }
  | { kind: "read"; id: string };

export function emptyState(): InboxState {
  return { cursor: 0, batch: null, highlights: { day: "", ids: [] } };
}

/**
 * A short id for an article that the inbox accepts. Feed item ids are often
 * URLs, and the inbox takes letters, digits and `._:-` only. Two 32-bit
 * FNV-1a hashes, forwards and backwards.
 */
export function articleKey(id: string): string {
  let a = 0x811c9dc5;
  let b = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    a = Math.imul(a ^ id.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ id.charCodeAt(id.length - 1 - i), 0x01000193);
  }
  return "a" + (a >>> 0).toString(36) + "-" + (b >>> 0).toString(36);
}

/** The UTC day of an ISO time: "2026-10-31". */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * What to post for a run's new articles: the batch card's article ids (null
 * when it is not to be posted) and the highlights. Answers the state as it
 * is once those are posted.
 *
 * @param fresh when true the batch starts afresh even on the same day — the
 *   person finished the one there was
 */
export function planPosts(
  state: InboxState,
  added: InboxArticle[],
  now: string,
  fresh = false,
): {
  state: InboxState;
  batchIds: string[] | null;
  highlights: InboxArticle[];
} {
  const today = dayOf(now);
  const kept = added.filter((a) => !a.filtered);
  const used = state.highlights.day === today ? state.highlights.ids : [];
  const highlights = kept
    .filter((a) => a.important)
    .slice(0, Math.max(0, MAX_HIGHLIGHTS - used.length));
  const highlighted = new Set(highlights.map((a) => a.id));
  const rest = kept.filter((a) => !highlighted.has(a.id)).map((a) => a.id);

  let batch = state.batch;
  if (rest.length > 0) {
    const sameDay = batch !== null && batch.day === today;
    if (
      batch === null ||
      !sameDay ||
      fresh ||
      batch.ids.length + rest.length > MAX_BATCH
    ) {
      const seq = sameDay && batch ? batch.seq + 1 : 1;
      batch = {
        externalId: `${today}.${seq}`,
        day: today,
        seq,
        ids: rest.slice(0, MAX_BATCH),
      };
    } else {
      batch = { ...batch, ids: rest.concat(batch.ids) };
    }
  }
  return {
    state: {
      ...state,
      batch,
      highlights: {
        day: today,
        ids: used.concat(highlights.map((a) => a.id)),
      },
    },
    batchIds: rest.length > 0 && batch ? batch.ids : null,
    highlights,
  };
}

function item(a: InboxArticle) {
  return {
    id: articleKey(a.id),
    title: a.headline.slice(0, 300),
    summary: a.summary.slice(0, MAX_SUMMARY),
    links: [
      {
        label: `Read at ${a.source.slice(0, 60) || "the source"}`,
        url: a.link,
      },
    ],
  };
}

/** The rolling batch card. `articles` in the batch's order. */
export function batchCard(
  instance: string,
  label: string,
  batch: { externalId: string; day: string },
  articles: InboxArticle[],
) {
  return {
    externalId: batch.externalId,
    topic: `${PRODUCER}:${instance}`,
    title: `${label}, ${batch.day}`.slice(0, 200),
    summary:
      "Is each one relevant to you? Your answers teach the filter; " +
      "Not relevant moves an article under Filtered on the digest's page. " +
      "Unsure, or just reading it, teaches nothing.",
    options: OPTIONS,
    items: articles.map(item),
    allowLater: true,
    handledByOpening: true,
    suggestedQuestions: SUGGESTED,
  };
}

/** A card of its own for an article the model rated important. */
export function highlightCard(a: InboxArticle) {
  const { title, summary, links } = item(a);
  return {
    externalId: `h-${articleKey(a.id)}`,
    title,
    summary,
    links,
    facts: [{ label: "Source", value: a.source.slice(0, 200) || "Unknown" }],
    options: OPTIONS,
    allowLater: true,
    handledByOpening: true,
    priority: "high",
    suggestedQuestions: SUGGESTED,
  };
}

/**
 * What the person's answers do, in order. Relevant and Not relevant sort the
 * article and mark it read; Unsure marks it read and takes back any verdict; a cleared answer unsorts it; opening it marks it
 * read; Later counts as wanting it. Expiry and withdrawal mean nothing.
 * Events for articles no longer kept are dropped.
 */
export function effectsOf(
  events: InboxEvent[],
  articles: InboxArticle[],
): Effect[] {
  const byKey = new Map(articles.map((a) => [articleKey(a.id), a.id]));
  const effects: Effect[] = [];
  for (const e of events) {
    const key =
      e.itemId ??
      (e.externalId.startsWith("h-") ? e.externalId.slice(2) : undefined);
    const id = key === undefined ? undefined : byKey.get(key);
    if (id === undefined) continue;
    if (e.type === "decided" || e.type === "changed") {
      if (e.optionId === RELEVANT || e.optionId === NOT_RELEVANT) {
        effects.push({
          kind: "verdict",
          id,
          verdict: e.optionId === RELEVANT ? "want" : "skip",
        });
        effects.push({ kind: "read", id });
      } else if (e.optionId === UNSURE) {
        // No verdict, and none left from an earlier answer.
        effects.push({ kind: "unsort", id });
        effects.push({ kind: "read", id });
      }
    } else if (e.type === "cleared") {
      effects.push({ kind: "unsort", id });
    } else if (e.type === "opened") {
      effects.push({ kind: "read", id });
    } else if (e.type === "later") {
      effects.push({ kind: "verdict", id, verdict: "want" });
    }
  }
  return effects;
}

/**
 * The articles a question on a card is about: the item it names, a
 * highlight's article, or for a question on the batch as a whole every
 * article still in it. Empty when the digest no longer keeps them.
 */
export function articlesAsked<T extends InboxArticle>(
  state: InboxState,
  articles: T[],
  externalId: string,
  itemId?: string,
): T[] {
  const byKey = new Map(articles.map((a) => [articleKey(a.id), a]));
  const key =
    itemId ?? (externalId.startsWith("h-") ? externalId.slice(2) : undefined);
  if (key !== undefined) {
    const a = byKey.get(key);
    return a ? [a] : [];
  }
  if (state.batch && state.batch.externalId === externalId) {
    const byId = new Map(articles.map((a) => [a.id, a]));
    return state.batch.ids.flatMap((id) => {
      const a = byId.get(id);
      return a ? [a] : [];
    });
  }
  return [];
}
