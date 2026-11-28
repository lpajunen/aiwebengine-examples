// The agent inbox kit: what a producer needs to work with an agent inbox
// (docs/guides/agent-inbox.md in aiwebengine-dev), and nothing it decides
// itself. Post cards, read the person's answers since a cursor, ask the inbox
// for a model call, and queue one run when the inbox wakes the producer.
//
// This file is copied verbatim into each producer as `server/inbox_kit.ts`
// (scripts cannot import from one another). The source is
// `inbox-kit/inbox_kit.ts` at the repository root: change it there, then
// `make sync-inbox-kit`; `make verify` fails on a copy that drifted.

/** Who is posting: the producer's stable name and the person's instance. */
export interface InboxProducer {
  name: string;
  instance: string;
  /** What the person sees, "Sports digest". */
  label?: string;
  /** The producer's own page for this instance; a path on a shared host. */
  settingsUrl?: string;
}

/** One thing the person did on a card, as `inbox_events` hands it over. */
export interface InboxEvent {
  cardId?: number;
  externalId: string;
  itemId?: string | null;
  type: string;
  optionId?: string | null;
  instruction?: string | null;
  question?: string | null;
  revision?: number;
  at?: number | string;
  [more: string]: unknown;
}

/**
 * What a post answers. `status` is `open` for a card the person has still to
 * finish; `muted` (with `id` null) while the person has muted this instance,
 * when nothing is stored.
 */
export interface Posted {
  id: number | null;
  status: string;
}

/** The engine globals the kit uses, so tests can pass their own. */
export interface InboxDeps {
  tools?: ToolsApi;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  tasks?: Pick<PersonalTasks, "enqueue">;
  now?: () => number;
}

/** The most `inbox_events` calls one read makes. */
export const MAX_EVENT_CALLS = 10;
/** How long after a wake its run starts, so answers in a row share one. */
export const WAKE_DELAY_MS = 30_000;

function toolsOf(deps?: InboxDeps): ToolsApi {
  return deps?.tools ?? tools;
}

/**
 * Whether an inbox is reachable from this run: one is bound to a host this
 * script shares, and the person's grant includes `tools`.
 */
export function inboxReachable(deps?: InboxDeps): boolean {
  try {
    return toolsOf(deps)
      .list("inbox_post")
      .some((t) => t.name === "inbox_post");
  } catch {
    // No "tools" in the grant, so this run cannot call tools at all.
    return false;
  }
}

/** Posts a card, or updates the one with the same `externalId`. */
export function post(
  producer: InboxProducer,
  card: unknown,
  deps?: InboxDeps,
): Posted {
  return toolsOf(deps).call("inbox_post", {
    producer: { ...producer },
    card,
  }) as Posted;
}

/** Withdraws an open card that no longer matters. */
export function withdraw(
  producer: InboxProducer,
  externalId: string,
  deps?: InboxDeps,
): boolean {
  const answer = toolsOf(deps).call("inbox_withdraw", {
    producer: { ...producer },
    externalId,
  }) as { withdrawn?: boolean };
  return !!answer?.withdrawn;
}

/**
 * Reads what the person did since `cursor`, a round at a time. Each round's
 * events go to `onEvents` and then its cursor to `save`, so events applied
 * are not applied again if a later round fails. Answers the last cursor;
 * throws what the inbox threw, for the producer to record.
 */
export function collect(
  producer: InboxProducer,
  cursor: number,
  onEvents: (events: InboxEvent[]) => void,
  save: (cursor: number) => void,
  deps?: InboxDeps,
): number {
  let since = cursor;
  for (let call = 0; call < MAX_EVENT_CALLS; call++) {
    const answer = toolsOf(deps).call("inbox_events", {
      producer: { ...producer },
      since,
    }) as { events: InboxEvent[]; cursor: number };
    if (answer.events.length > 0) onEvents(answer.events);
    since = answer.cursor;
    save(since);
    if (answer.events.length === 0) break;
  }
  return since;
}

/**
 * An Anthropic Messages call through the inbox, on the key the person's inbox
 * provides. Throws the inbox's refusal, whose message starts with its kind
 * (`no-key`, `lapsed`, `bad-request`, `model`).
 */
export function model(
  producer: InboxProducer,
  request: unknown,
  deps?: InboxDeps,
): unknown {
  return toolsOf(deps).call("inbox_model", {
    producer: { ...producer },
    request,
  });
}

/** Several model calls sent together; each answers `{ message }` or `{ error }`. */
export function models(
  producer: InboxProducer,
  requests: unknown[],
  deps?: InboxDeps,
): { message?: unknown; error?: string }[] {
  const answer = toolsOf(deps).call("inbox_model", {
    producer: { ...producer },
    requests,
  }) as {
    responses: { message?: unknown; error?: string }[];
  };
  return answer.responses;
}

/**
 * When a woken producer runs: `delayMs` from now, and not before
 * `notBefore` (when the inbox holds a consequential answer until then); or
 * null while a run queued by an earlier wake is still to come (`pending` is
 * its time) and will read these answers too.
 */
export function wakeAt(
  pending: string | null,
  now: Date,
  delayMs: number = WAKE_DELAY_MS,
  notBefore?: string | null,
): string | null {
  const held = notBefore ? Date.parse(notBefore) : NaN;
  // The first moment a run sees these answers.
  const earliest = Number.isNaN(held) ? now.getTime() : held + 1_000;
  if (pending !== null) {
    const queued = Date.parse(pending);
    if (queued > now.getTime() && queued >= earliest) return null;
  }
  return new Date(Math.max(now.getTime() + delayMs, earliest)).toISOString();
}

/**
 * The `notBefore` a wake was called with: the inbox holds an answer until
 * then, so a run before it would not see it.
 */
export function notBeforeOf(args: unknown): string | undefined {
  const value = (args as { notBefore?: unknown } | null)?.notBefore;
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}

/**
 * What `<x>_wake` does: queue one run of `handler` soon, unless one is
 * already queued. `key` is where the pending run's time is kept in personal
 * storage; the run removes it first thing (`wakeDone`), so an answer given
 * while it runs wakes another.
 */
export function queueWake(
  options: {
    key: string;
    handler: string;
    payload?: Record<string, unknown>;
    delayMs?: number;
    /** From the wake's arguments (`notBeforeOf(context.args)`). */
    notBefore?: string;
  },
  deps?: InboxDeps,
): { queued: boolean; runAt?: string } {
  const storage = deps?.storage ?? personalStorage;
  const tasks = deps?.tasks ?? personalTasks;
  const now = new Date(deps?.now ? deps.now() : Date.now());
  const runAt = wakeAt(
    storage.getItem(options.key),
    now,
    options.delayMs,
    options.notBefore,
  );
  if (runAt === null) return { queued: false };
  tasks.enqueue({
    handler: options.handler,
    runAt,
    ...(options.payload === undefined ? {} : { payload: options.payload }),
  });
  storage.setItem(options.key, runAt);
  return { queued: true, runAt };
}

/** The start of a run a wake queued: the next answer may wake another. */
export function wakeDone(key: string, deps?: InboxDeps): void {
  (deps?.storage ?? personalStorage).removeItem(key);
}

/** A problem with the inbox as a producer's status shows it. */
export function inboxProblem(e: unknown): string {
  return `Inbox: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
}
