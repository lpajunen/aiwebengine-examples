// The document writer's rules: the cards an agent inbox is sent
// (docs/guides/agent-inbox.md in aiwebengine-dev), what each answer does to a
// document, and applying the model's edits. No storage or calls here —
// main.ts does those — so the rules can be tested on their own.
//
// Each document has at most one open card, which is either
// - next steps: two or three the agent suggests, "Something else…" whose
//   text is the person's own wish, and "Done for now"; or
// - a revision: the change as a diff the inbox draws, bound to the revision
//   it was made on, with Approve, Request changes and Reject.
// Choosing a step leads to a revision card; answering a revision card leads
// to the next steps (or, for Request changes, to another revision). Work
// waits in `pending` until a run writes it.
//
// An answer the person changes or clears in the inbox is undone while nothing
// has happened since: the card it led to is withdrawn, a revision it added is
// dropped, and the card is open again.

/** The name this producer posts under; the inbox's allow-list names it. */
export const PRODUCER = "document-writer";
/** The one instance: a person's documents. */
export const INSTANCE = "documents";
export const LABEL = "Documents";
export const MAX_DOCS = 20;
/** A document's text: under the inbox's 64 KB for each side of a diff. */
export const MAX_TEXT = 60_000;
export const MAX_TITLE = 120;
export const MAX_BRIEF = 4000;
/** Feedback the person gave, kept for the model, newest last. */
export const MAX_NOTES = 20;
/** Tries a change gets when the model's edits do not apply. */
export const MAX_ATTEMPTS = 2;

export const APPROVE = "approve";
export const CHANGES = "changes";
export const REJECT = "reject";
export const OTHER = "other";
export const DONE = "done";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface Step {
  label: string;
  instruction: string;
}

export interface Revision {
  n: number;
  text: string;
  at: string;
  by: "agent" | "person";
  summary: string;
}

export type OpenCard =
  | { kind: "steps"; externalId: string; steps: Step[] }
  | {
      kind: "revision";
      externalId: string;
      /** The revision the change was made on. */
      base: number;
      text: string;
      summary: string;
      why: string;
      /** What the model suggests once this is approved. */
      nextSteps: Step[];
      /** What the change was asked to do, to ask again if it goes stale. */
      instruction: string;
    };

/** Work waiting for a run: a change to write. */
export interface Pending {
  instruction: string;
  /** The person's Request changes text, with the proposal it was about. */
  feedback?: string;
  previous?: { text: string; summary: string };
  /** Why the last try failed, for the model's next one. */
  lastError?: string;
  attempts: number;
  since: string;
  /** When a run to write it was queued. */
  queuedAt?: string;
}

/** What an answer changed, so a correction in the inbox can undo it. */
export interface Undo {
  externalId: string;
  open: OpenCard;
  head: number;
  steps: Step[];
  /** The card the answer led to, once posted. */
  followed: string | null;
}

export interface Doc {
  id: string;
  title: string;
  brief: string;
  createdAt: string;
  updatedAt: string;
  /** The current revision; 0 is the empty document. */
  head: number;
  open: OpenCard | null;
  pending: Pending | null;
  /** The next steps offered after the current revision. */
  steps: Step[];
  last: Undo | null;
  /** Cards posted for this document, for unique externalIds. */
  seq: number;
  problem?: string;
}

/** An event as `inbox_events` answers it; only the fields used here. */
export interface InboxEvent {
  type: string;
  externalId: string;
  itemId?: string | null;
  optionId?: string | null;
  instruction?: string | null;
}

/** Where the writer stands with the inbox, kept in its storage. */
export interface InboxState {
  cursor: number;
  problem?: string;
  syncedAt?: string;
  welcomed?: boolean;
}

/** What the model answers for one change. */
export interface Proposal {
  summary: string;
  why: string;
  edits: { find: string; replace: string }[];
  nextSteps: Step[];
}

/** What main.ts does after a rule ran on a document. */
export interface Outcome {
  post: unknown[];
  withdraw: string[];
  /** A change is pending and a run should write it. */
  write: boolean;
  addRevision?: Revision;
  /** Revisions above this one are dropped. */
  dropAbove?: number;
  /** Feedback worth keeping for later changes. */
  note?: string;
}

function outcome(): Outcome {
  return { post: [], withdraw: [], write: false };
}

export function emptyState(): InboxState {
  return { cursor: 0 };
}

export function needsWelcome(state: InboxState): boolean {
  return state.welcomed === false || (!state.welcomed && !state.syncedAt);
}

/** A fresh document id. */
export function newDocId(now: number, random: number): string {
  return (
    "d" +
    now.toString(36) +
    Math.floor(random * 36 ** 4)
      .toString(36)
      .padStart(4, "0")
  );
}

/** Whether a string is a document id this producer made. */
export function isDocId(id: string): boolean {
  return /^d[a-z0-9]{6,20}$/.test(id);
}

/** The document a card belongs to, from its externalId. */
export function docOfCard(externalId: string): string | null {
  const id = externalId.split(":")[1] ?? "";
  return isDocId(id) ? id : null;
}

/** A new document, with its first draft pending. */
export function newDoc(
  id: string,
  title: string,
  brief: string,
  now: string,
): Doc {
  return {
    id,
    title,
    brief,
    createdAt: now,
    updatedAt: now,
    head: 0,
    open: null,
    pending: {
      instruction: "Write a first draft from the brief.",
      attempts: 0,
      since: now,
    },
    steps: [],
    last: null,
    seq: 0,
  };
}

/**
 * The title and brief from what a person wrote: the first line is the
 * title, the rest the brief. Throws with a message they can act on.
 */
export function readNewDoc(text: string): { title: string; brief: string } {
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const title = (lines.shift() ?? "").trim();
  const brief = lines.join("\n").trim();
  if (!title) throw new Error("Write the document's title first");
  if (title.length > MAX_TITLE) {
    throw new Error(`The title is longer than ${MAX_TITLE} characters`);
  }
  if (brief.length > MAX_BRIEF) {
    throw new Error(`The brief is longer than ${MAX_BRIEF} characters`);
  }
  return { title, brief };
}

// ============================================================================
// Edits
// ============================================================================

/**
 * The text with the model's edits applied in order. Each edit's `find` must
 * occur exactly once in the text as it is by then; an empty `find` adds
 * `replace` at the end (or is the whole text of an empty document).
 */
export function applyEdits(
  text: string,
  edits: { find: string; replace: string }[],
): { text: string } | { error: string } {
  if (!Array.isArray(edits) || edits.length === 0) {
    return { error: "No edits" };
  }
  let out = text;
  for (let i = 0; i < edits.length; i++) {
    const { find, replace } = edits[i] ?? {};
    if (typeof find !== "string" || typeof replace !== "string") {
      return { error: `Edit ${i + 1} is not a find and a replace` };
    }
    if (find === "") {
      out =
        out.trim() === ""
          ? replace
          : out.replace(/\s+$/, "") + "\n\n" + replace.replace(/^\s+/, "");
      continue;
    }
    const at = out.indexOf(find);
    if (at < 0) {
      return { error: `Edit ${i + 1}: the text it replaces is not there` };
    }
    if (out.indexOf(find, at + 1) >= 0) {
      return {
        error: `Edit ${i + 1}: the text it replaces appears more than once`,
      };
    }
    out = out.slice(0, at) + replace + out.slice(at + find.length);
  }
  if (out.length > MAX_TEXT) {
    return {
      error: `The document would be longer than ${MAX_TEXT} characters`,
    };
  }
  if (out === text) return { error: "The edits change nothing" };
  return { text: out };
}

/** At most three steps with labels that fit an option. */
export function cleanSteps(steps: unknown): Step[] {
  if (!Array.isArray(steps)) return [];
  return steps
    .filter(
      (s): s is Step =>
        Boolean(s) &&
        typeof (s as Step).label === "string" &&
        typeof (s as Step).instruction === "string" &&
        (s as Step).label.trim() !== "",
    )
    .slice(0, 3)
    .map((s) => ({
      label: s.label.trim().slice(0, 40),
      instruction: s.instruction.trim().slice(0, 1000),
    }));
}

// ============================================================================
// Cards
// ============================================================================

function nextId(doc: Doc, kind: string): string {
  doc.seq += 1;
  return `${kind}:${doc.id}:${doc.seq}`;
}

/** Whether the inbox can take this document's ids. */
export function fitsInbox(doc: Doc): boolean {
  return ID.test(`steps:${doc.id}:${doc.seq + 1}`);
}

const SUGGESTED = [
  "Why did you change it this way?",
  "What would you do next?",
];

/** The card proposing a change, as a diff of the two texts. */
export function revisionCard(
  doc: Doc,
  externalId: string,
  before: string,
  after: string,
  proposal: { summary: string; why: string },
) {
  const n = doc.head + 1;
  return {
    externalId,
    topic: `doc:${doc.id}`,
    title: `${doc.title}: ${proposal.summary}`.slice(0, 200),
    summary: proposal.why.slice(0, 2000),
    facts: [
      { label: "Document", value: doc.title.slice(0, 200) },
      { label: "Revision", value: `r${n}, proposed on r${doc.head}` },
    ],
    boundTo: { label: "Revision", value: `r${n} on r${doc.head}` },
    body: {
      kind: "diff",
      before,
      after,
      beforeLabel: doc.head === 0 ? "Empty" : `r${doc.head}`,
      afterLabel: `r${n} (proposed)`,
    },
    options: [
      { id: APPROVE, label: "Approve", style: "primary", weight: "feedback" },
      {
        id: CHANGES,
        label: "Request changes",
        style: "neutral",
        weight: "instruction",
      },
      { id: REJECT, label: "Reject", style: "negative", weight: "instruction" },
    ],
    allowLater: true,
    suggestedQuestions: SUGGESTED,
  };
}

/** The card offering what to do next, with the document as it is. */
export function stepsCard(
  doc: Doc,
  externalId: string,
  text: string,
  steps: Step[],
  note?: string,
) {
  const lead =
    doc.head === 0
      ? "The document is empty."
      : `r${doc.head} is the current version.`;
  return {
    externalId,
    topic: `doc:${doc.id}`,
    title: `${doc.title}: what next?`.slice(0, 200),
    summary: (note ? `${note} ${lead}` : lead).slice(0, 2000),
    facts: [{ label: "Document", value: doc.title.slice(0, 200) }],
    ...(text.trim() ? { body: { kind: "markdown", text } } : {}),
    options: [
      ...steps.map((s, i) => ({
        id: `step${i + 1}`,
        label: s.label,
        style: i === 0 ? "primary" : "neutral",
        weight: "instruction",
      })),
      {
        id: OTHER,
        label: "Something else…",
        style: "neutral",
        weight: "instruction",
      },
      { id: DONE, label: "Done for now", style: "neutral", weight: "feedback" },
    ],
    allowLater: true,
  };
}

/** The card posted once, on the first run that reaches the inbox. */
export function welcomeCard() {
  return {
    externalId: "welcome",
    title: "Your document writer is set up",
    summary:
      "Start a document on its page, or write one on this card: its title " +
      "on the first line, what it is for below. The writer proposes each " +
      "change here as a diff; nothing is added to a document until you " +
      "approve it, and you can ask for changes or say what to do next.",
    options: [
      { id: "ok", label: "Got it", style: "primary", weight: "feedback" },
    ],
  };
}

// ============================================================================
// What answers and requests do
// ============================================================================

const DEFAULT_STEPS: Step[] = [
  {
    label: "Improve the whole draft",
    instruction:
      "Improve the document where it is weakest: clarity, structure, or a missing part the brief asks for.",
  },
];

function stepsOrDefault(steps: Step[]): Step[] {
  return steps.length > 0 ? steps : DEFAULT_STEPS;
}

function offerSteps(
  doc: Doc,
  out: Outcome,
  text: string,
  steps: Step[],
  note?: string,
): string {
  const externalId = nextId(doc, "steps");
  const offered = stepsOrDefault(steps);
  out.post.push(stepsCard(doc, externalId, text, offered, note));
  doc.open = { kind: "steps", externalId, steps: offered };
  return externalId;
}

function ask(
  doc: Doc,
  out: Outcome,
  pending: Omit<Pending, "attempts" | "since">,
  now: string,
): void {
  doc.pending = { ...pending, attempts: 0, since: now };
  out.write = true;
}

/**
 * What one inbox event does to its document. `headText` is the current
 * revision's text. Changes `doc` and answers what is left to do.
 */
export function onEvent(
  doc: Doc,
  e: InboxEvent,
  now: string,
  headText: string,
): Outcome {
  const out = outcome();
  const answered = e.type === "decided" || e.type === "changed";

  if (doc.open && e.externalId === doc.open.externalId) {
    if (answered) decide(doc, doc.open, e, now, headText, out);
    else if (e.type === "expired" || e.type === "withdrawn") doc.open = null;
  } else if (
    doc.last &&
    e.externalId === doc.last.externalId &&
    (e.type === "cleared" || e.type === "changed") &&
    undoable(doc)
  ) {
    const restored = undo(doc, out);
    if (e.type === "changed") decide(doc, restored, e, now, headText, out);
  }
  if (out.post.length > 0 || out.write || out.withdraw.length > 0) {
    doc.updatedAt = now;
  }
  return out;
}

/** Whether the last answer can still be undone: nothing has followed it. */
function undoable(doc: Doc): boolean {
  const last = doc.last;
  if (!last) return false;
  if (last.followed === null) return doc.open === null;
  return doc.open?.externalId === last.followed && doc.pending === null;
}

function undo(doc: Doc, out: Outcome): OpenCard {
  const last = doc.last as Undo;
  if (last.followed) out.withdraw.push(last.followed);
  if (doc.head > last.head) out.dropAbove = last.head;
  doc.head = last.head;
  doc.steps = last.steps;
  doc.pending = null;
  doc.open = last.open;
  doc.last = null;
  return last.open;
}

function decide(
  doc: Doc,
  card: OpenCard,
  e: InboxEvent,
  now: string,
  headText: string,
  out: Outcome,
): void {
  const note = String(e.instruction ?? "")
    .trim()
    .slice(0, 1000);
  const undo: Undo = {
    externalId: card.externalId,
    open: card,
    head: doc.head,
    steps: doc.steps,
    followed: null,
  };
  doc.open = null;

  if (card.kind === "revision") {
    if (e.optionId === APPROVE) {
      if (doc.head !== card.base) {
        // The document moved on since: the same change, made afresh.
        doc.last = null;
        ask(doc, out, { instruction: card.instruction }, now);
        return;
      }
      doc.head += 1;
      out.addRevision = {
        n: doc.head,
        text: card.text,
        at: now,
        by: "agent",
        summary: card.summary,
      };
      doc.steps = card.nextSteps;
      undo.followed = offerSteps(doc, out, card.text, doc.steps);
    } else if (e.optionId === CHANGES) {
      if (note) out.note = `Asked to change "${card.summary}": ${note}`;
      ask(
        doc,
        out,
        {
          instruction: card.instruction,
          feedback: note || "Try a different approach.",
          previous: { text: card.text, summary: card.summary },
        },
        now,
      );
    } else if (e.optionId === REJECT) {
      out.note = note
        ? `Rejected "${card.summary}": ${note}`
        : `Rejected "${card.summary}"`;
      undo.followed = offerSteps(
        doc,
        out,
        headText,
        doc.steps,
        "Rejected; the document is unchanged.",
      );
    } else {
      doc.open = card;
      return;
    }
  } else {
    const chosen = /^step([1-3])$/.exec(e.optionId ?? "");
    const step = chosen ? card.steps[Number(chosen[1]) - 1] : undefined;
    if (step) {
      ask(
        doc,
        out,
        {
          instruction: note
            ? `${step.instruction}\n\nThe person adds: ${note}`
            : step.instruction,
        },
        now,
      );
    } else if (e.optionId === OTHER) {
      if (note) {
        ask(doc, out, { instruction: note }, now);
      } else {
        undo.followed = offerSteps(
          doc,
          out,
          headText,
          card.steps,
          "Write what you would like under Something else.",
        );
      }
    } else if (e.optionId !== DONE) {
      doc.open = card;
      return;
    }
  }
  doc.last = undo;
}

/** The person asked for a change on the page. */
export function requestChange(doc: Doc, text: string, now: string): Outcome {
  const out = outcome();
  const wish = text.trim().slice(0, 2000);
  if (!wish) throw new Error("Write what to change");
  const open = doc.open;
  if (open?.kind === "revision") {
    out.withdraw.push(open.externalId);
    ask(
      doc,
      out,
      {
        instruction: open.instruction,
        feedback: wish,
        previous: { text: open.text, summary: open.summary },
      },
      now,
    );
  } else {
    if (open) out.withdraw.push(open.externalId);
    ask(doc, out, { instruction: wish }, now);
  }
  doc.open = null;
  doc.last = null;
  doc.updatedAt = now;
  return out;
}

/** The person saved their own text on the page, as a new revision. */
export function personEdit(
  doc: Doc,
  text: string,
  current: string,
  now: string,
): Outcome {
  const out = outcome();
  if (text.length > MAX_TEXT) {
    throw new Error(`The document is longer than ${MAX_TEXT} characters`);
  }
  if (text === current) return out;
  doc.head += 1;
  out.addRevision = {
    n: doc.head,
    text,
    at: now,
    by: "person",
    summary: "Edited by you",
  };
  // A proposal made on the old text no longer applies: ask for it afresh.
  if (doc.open?.kind === "revision") {
    out.withdraw.push(doc.open.externalId);
    ask(doc, out, { instruction: doc.open.instruction }, now);
    doc.open = null;
  }
  doc.last = null;
  doc.updatedAt = now;
  return out;
}

/** The person asked for the next steps again, for an idle document. */
export function resume(doc: Doc, headText: string, now: string): Outcome {
  const out = outcome();
  if (doc.open || doc.pending) return out;
  offerSteps(doc, out, headText, doc.steps);
  doc.last = null;
  doc.updatedAt = now;
  return out;
}

/** A change was written: the revision card goes to the inbox. */
export function written(
  doc: Doc,
  before: string,
  after: string,
  proposal: Proposal,
  now: string,
): Outcome {
  const out = outcome();
  const instruction = doc.pending?.instruction ?? "";
  const externalId = nextId(doc, "rev");
  out.post.push(revisionCard(doc, externalId, before, after, proposal));
  doc.open = {
    kind: "revision",
    externalId,
    base: doc.head,
    text: after,
    summary: proposal.summary.slice(0, 160),
    why: proposal.why.slice(0, 2000),
    nextSteps: cleanSteps(proposal.nextSteps),
    instruction,
  };
  doc.pending = null;
  delete doc.problem;
  if (doc.last && doc.last.followed === null) doc.last.followed = externalId;
  doc.updatedAt = now;
  return out;
}

/**
 * A try at a change failed. It is tried again, up to MAX_ATTEMPTS, and then
 * the person gets the next steps with the reason.
 */
export function failed(
  doc: Doc,
  error: string,
  headText: string,
  now: string,
): Outcome {
  const out = outcome();
  const pending = doc.pending;
  if (!pending) return out;
  pending.attempts += 1;
  pending.lastError = error.slice(0, 300);
  if (pending.attempts < MAX_ATTEMPTS) {
    out.write = true;
    return out;
  }
  doc.pending = null;
  doc.problem = error.slice(0, 300);
  const followed = offerSteps(
    doc,
    out,
    headText,
    doc.steps,
    `I could not make that change (${error.slice(0, 200)}).`,
  );
  if (doc.last && doc.last.followed === null) doc.last.followed = followed;
  doc.updatedAt = now;
  return out;
}

/** Keeps a note of the person's feedback, newest last. */
export function remember(notes: string[], note: string): string[] {
  return notes.concat([note.slice(0, 600)]).slice(-MAX_NOTES);
}
