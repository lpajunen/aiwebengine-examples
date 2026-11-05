// The groomer's rules: reading what the person typed, reading GitHub's
// answers, which issues to propose for closing or labelling, the cards an
// agent inbox is sent (docs/guides/agent-inbox.md in aiwebengine-dev), and
// what each answer means. No storage or calls here — main.ts does those — so
// the rules can be tested on their own.
//
// Three proposals, each a change the person approves before it is made:
// - stale: close an open issue nobody has touched for the configured days,
//   as not planned, with a comment saying why;
// - duplicate: close an issue as a duplicate of another, with a comment
//   linking the two;
// - labels: add labels the repository already has, a batch card a day with
//   one item per issue.
// Closing cards are work items bound to the issue's `updated_at`: an answer
// is applied only if the issue has not changed since, and a fresh card
// follows otherwise. Approving may carry a note, which goes in the comment.
// Everything can be undone on GitHub, so a correction in the inbox reverses
// what was applied.

/** The name this producer posts under; the inbox's allow-list names it. */
export const PRODUCER = "backlog-groomer";
export const MAX_REPOS = 5;
/** An open issue untouched this long is proposed for closing; 0 is never. */
export const DEFAULT_STALE_DAYS = 180;
export const MAX_STALE_DAYS = 3650;
/** Proposals a day's round may add, of each kind. */
export const MAX_STALE_PER_DAY = 3;
export const MAX_DUPLICATES_PER_DAY = 3;
export const MAX_LABELLED_PER_DAY = 10;
/** Labels proposed for one issue at most. */
export const MAX_LABELS_PER_ISSUE = 3;
/** Undecided proposals beyond which a round adds no more. */
export const MAX_OPEN = 12;
/** Signatures of rejected proposals kept, newest first. */
export const MAX_REJECTED = 1000;

export const APPROVE = "approve";
export const REJECT = "reject";

/** owner/name as GitHub allows them. */
const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
/** The inbox's identifiers: letters, digits, '.', '_', ':' or '-'. */
const ID = /^[A-Za-z0-9._:-]{1,128}$/;

export interface Settings {
  repos: string[];
  staleDays: number;
  dailyHourUtc: number;
  /** Stopped by the person from their agent inbox; not scheduled until resumed. */
  paused?: boolean;
}

/** An open issue as the rules use it. */
export interface Issue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  url: string;
  createdAt: string;
  updatedAt: string;
}

interface Base {
  repo: string;
  number: number;
  title: string;
  url: string;
  /** The issue's `updated_at` when proposed: what an answer is bound to. */
  updatedAt: string;
}

export type Proposal =
  | (Base & { kind: "stale"; days: number })
  | (Base & {
      kind: "duplicate";
      original: { number: number; title: string; url: string };
      reason: string;
    })
  | (Base & { kind: "label"; add: string[]; reason: string });

/** What an applied proposal changed, so a correction can reverse it. */
export interface Applied {
  kind: Proposal["kind"];
  repo: string;
  number: number;
  title: string;
  url: string;
  at: string;
  /** Closed by the groomer. */
  closed?: boolean;
  /** The comment it wrote, deleted again on a reversal. */
  commentId?: number;
  /** Labels it added that were not there before. */
  labels?: string[];
}

/** Where the groomer stands with the inbox, kept in its storage. */
export interface InboxState {
  cursor: number;
  problem?: string;
  syncedAt?: string;
  /** Whether the welcome card was posted; false while it is still owed. */
  welcomed?: boolean;
}

/** An event as `inbox_events` answers it; only the fields used here. */
export interface InboxEvent {
  type: string;
  externalId: string;
  itemId?: string | null;
  optionId?: string | null;
  instruction?: string | null;
}

/** What an answer does, for the proposal under `key`. */
export type Effect =
  | { kind: "apply"; key: string; note: string }
  | { kind: "reject"; key: string }
  | { kind: "clear"; key: string }
  | { kind: "drop"; key: string };

/** What the model suggests for one repository. */
export interface Suggestions {
  duplicates: { duplicate: number; original: number; reason: string }[];
  labels: { number: number; add: string[]; reason: string }[];
}

export function emptyState(): InboxState {
  return { cursor: 0 };
}

/** The UTC day of an ISO time: "2026-10-31". */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** Whether the day's round is due: once a day, from `hourUtc` on. */
export function dailyDue(
  lastDay: string,
  now: string,
  hourUtc: number,
): boolean {
  return lastDay !== dayOf(now) && new Date(now).getUTCHours() >= hourUtc;
}

// ============================================================================
// Settings
// ============================================================================

/** A repository as typed: owner/name, or its GitHub URL. Null if neither. */
export function readRepo(line: string): string | null {
  const text = line
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  return REPO.test(text) ? text : null;
}

/** The repositories typed one per line, and the lines that are not one. */
export function parseRepos(text: string): {
  repos: string[];
  errors: string[];
} {
  const repos: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const repo = readRepo(line);
    if (!repo) {
      errors.push(`Not a repository: ${line.slice(0, 80)}`);
      continue;
    }
    if (seen.has(repo.toLowerCase())) continue;
    seen.add(repo.toLowerCase());
    repos.push(repo);
  }
  if (repos.length > MAX_REPOS) {
    errors.push(`At most ${MAX_REPOS} repositories`);
  }
  return { repos, errors };
}

/** Days untouched before an issue is proposed for closing; 0 turns it off. */
export function readStaleDays(value: unknown): number | null {
  const days = Number(value);
  return Number.isInteger(days) && days >= 0 && days <= MAX_STALE_DAYS
    ? days
    : null;
}

// ============================================================================
// GitHub
// ============================================================================

/** The open issues in an answer of GitHub's issue list, pull requests left out. */
export function readIssues(answer: unknown): Issue[] {
  if (!Array.isArray(answer)) return [];
  const issues: Issue[] = [];
  for (const raw of answer as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object" || raw.pull_request) continue;
    const issue = readIssue(raw);
    if (issue) issues.push(issue);
  }
  return issues;
}

/** One issue as GitHub answers it, or null for anything else. */
export function readIssue(raw: unknown): Issue | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.number !== "number" || typeof r.title !== "string") return null;
  if (typeof r.updated_at !== "string" || typeof r.html_url !== "string") {
    return null;
  }
  return {
    number: r.number,
    title: r.title,
    body: typeof r.body === "string" ? r.body : "",
    labels: (Array.isArray(r.labels) ? r.labels : [])
      .map((l) =>
        typeof l === "string"
          ? l
          : l && typeof l === "object"
            ? String((l as Record<string, unknown>).name ?? "")
            : "",
      )
      .filter((name) => name !== ""),
    url: r.html_url,
    createdAt: typeof r.created_at === "string" ? r.created_at : r.updated_at,
    updatedAt: r.updated_at,
  };
}

/** Whether GitHub answered with an issue that is still open. */
export function isOpen(raw: unknown): boolean {
  return Boolean(
    raw &&
    typeof raw === "object" &&
    (raw as Record<string, unknown>).state === "open",
  );
}

/** The label names in GitHub's answer for a repository's labels. */
export function readLabels(answer: unknown): string[] {
  if (!Array.isArray(answer)) return [];
  return answer
    .map((l) =>
      l && typeof l === "object"
        ? String((l as Record<string, unknown>).name ?? "")
        : "",
    )
    .filter((name) => name !== "");
}

// ============================================================================
// Keys
// ============================================================================

/** "owner:name:12": an issue in the inbox's identifiers ('/' and '#' are not). */
export function issueKey(repo: string, number: number): string {
  return `${repo.replace("/", ":")}:${number}`;
}

/** The epoch seconds of an `updated_at`, which versions a card's id. */
function version(updatedAt: string): number {
  return Math.floor(Date.parse(updatedAt) / 1000);
}

/**
 * The card's externalId, and for a label the item's id: a closing card is
 * versioned by the issue's `updated_at`, so a fresh one after a change is a
 * new card on the same topic.
 */
export function cardIds(
  p: Proposal,
  day: string,
): {
  externalId: string;
  itemId?: string;
} {
  const key = issueKey(p.repo, p.number);
  if (p.kind === "stale") {
    return { externalId: `stale:${key}:${version(p.updatedAt)}` };
  }
  if (p.kind === "duplicate") {
    return {
      externalId: `dup:${key}:${p.original.number}:${version(p.updatedAt)}`,
    };
  }
  return { externalId: `labels:${day}`, itemId: key };
}

/** Where a proposal is kept: its card, and its item on a batch card. */
export function storeKey(externalId: string, itemId?: string | null): string {
  return itemId ? `${externalId}/${itemId}` : externalId;
}

/** Whether the inbox can take these ids: a repository with a long name may not. */
export function fitsInbox(p: Proposal, day: string): boolean {
  const ids = cardIds(p, day);
  return (
    ID.test(ids.externalId) &&
    ID.test(`issue:${issueKey(p.repo, p.number)}`) &&
    (ids.itemId === undefined || ID.test(ids.itemId))
  );
}

/**
 * What a proposal is, apart from when it was made: a rejected one with the
 * same signature is not proposed again.
 */
export function signature(p: Proposal): string {
  const key = issueKey(p.repo, p.number).toLowerCase();
  if (p.kind === "stale") return `stale:${key}`;
  if (p.kind === "duplicate") return `dup:${key}>${p.original.number}`;
  return `label:${key}:${p.add
    .map((l) => l.toLowerCase())
    .sort()
    .join(",")}`;
}

/** The issues already proposed for something, so a round proposes each once. */
export function proposedIssues(open: Proposal[]): Set<string> {
  return new Set(open.map((p) => issueKey(p.repo, p.number).toLowerCase()));
}

// ============================================================================
// Proposals
// ============================================================================

/**
 * The oldest open issues untouched for `days`, at most `max`, leaving out the
 * issues in `skip` and the proposals in `rejected`.
 */
export function pickStale(
  repo: string,
  issues: Issue[],
  now: string,
  days: number,
  skip: Set<string>,
  rejected: Set<string>,
  max: number,
): Proposal[] {
  if (days <= 0 || max <= 0) return [];
  const before = Date.parse(now) - days * 86_400_000;
  const picked: Proposal[] = [];
  const sorted = issues
    .slice()
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  for (const issue of sorted) {
    if (picked.length >= max) break;
    if (Date.parse(issue.updatedAt) >= before) break;
    const p: Proposal = {
      kind: "stale",
      repo,
      number: issue.number,
      title: issue.title,
      url: issue.url,
      updatedAt: issue.updatedAt,
      days: Math.floor(
        (Date.parse(now) - Date.parse(issue.updatedAt)) / 86_400_000,
      ),
    };
    if (skip.has(issueKey(repo, issue.number).toLowerCase())) continue;
    if (rejected.has(signature(p))) continue;
    picked.push(p);
  }
  return picked;
}

/** What the model is shown of an issue: enough to judge it, not all of it. */
export function issueForModel(issue: Issue): {
  number: number;
  title: string;
  labels: string[];
  body: string;
} {
  return {
    number: issue.number,
    title: issue.title,
    labels: issue.labels,
    body: issue.body.slice(0, 600),
  };
}

/**
 * The model's suggestions as proposals, keeping only what can be done:
 * issues it was shown, labels the repository has and the issue lacks, and
 * nothing for an issue in `skip` or rejected before.
 */
export function proposalsFrom(
  repo: string,
  suggestions: Suggestions,
  issues: Issue[],
  repoLabels: string[],
  skip: Set<string>,
  rejected: Set<string>,
  limits: { duplicates: number; labelled: number },
): { duplicates: Proposal[]; labels: Proposal[] } {
  const byNumber = new Map(issues.map((i) => [i.number, i]));
  const canonical = new Map(repoLabels.map((l) => [l.toLowerCase(), l]));
  const taken = new Set(skip);
  const duplicates: Proposal[] = [];
  for (const d of suggestions.duplicates ?? []) {
    if (duplicates.length >= limits.duplicates) break;
    const dup = byNumber.get(d.duplicate);
    const original = byNumber.get(d.original);
    if (!dup || !original || dup.number === original.number) continue;
    const key = issueKey(repo, dup.number).toLowerCase();
    if (taken.has(key)) continue;
    const p: Proposal = {
      kind: "duplicate",
      repo,
      number: dup.number,
      title: dup.title,
      url: dup.url,
      updatedAt: dup.updatedAt,
      original: {
        number: original.number,
        title: original.title,
        url: original.url,
      },
      reason: String(d.reason ?? "").slice(0, 400),
    };
    if (rejected.has(signature(p))) continue;
    taken.add(key);
    duplicates.push(p);
  }
  const labels: Proposal[] = [];
  for (const s of suggestions.labels ?? []) {
    if (labels.length >= limits.labelled) break;
    const issue = byNumber.get(s.number);
    if (!issue) continue;
    const key = issueKey(repo, issue.number).toLowerCase();
    if (taken.has(key)) continue;
    const has = new Set(issue.labels.map((l) => l.toLowerCase()));
    const add: string[] = [];
    for (const raw of s.add ?? []) {
      const name = canonical.get(String(raw).toLowerCase());
      if (!name || has.has(name.toLowerCase()) || add.indexOf(name) !== -1) {
        continue;
      }
      add.push(name);
      if (add.length >= MAX_LABELS_PER_ISSUE) break;
    }
    if (add.length === 0) continue;
    const p: Proposal = {
      kind: "label",
      repo,
      number: issue.number,
      title: issue.title,
      url: issue.url,
      updatedAt: issue.updatedAt,
      add,
      reason: String(s.reason ?? "").slice(0, 300),
    };
    if (rejected.has(signature(p))) continue;
    taken.add(key);
    labels.push(p);
  }
  return { duplicates, labels };
}

// ============================================================================
// Cards
// ============================================================================

const SUGGESTED = ["What is this issue about?", "Why do you propose this?"];

function approve(label: string) {
  return { id: APPROVE, label, style: "primary", weight: "instruction" };
}

function reject(label: string) {
  return { id: REJECT, label, style: "neutral", weight: "feedback" };
}

/** "#12 in owner/name". */
function where(p: { repo: string; number: number }): string {
  return `#${p.number} in ${p.repo}`;
}

/** A card for closing one issue untouched for long. */
export function staleCard(p: Proposal & { kind: "stale" }) {
  const key = issueKey(p.repo, p.number);
  return {
    ...cardIds(p, ""),
    topic: `issue:${key}`,
    title: `Close stale ${where(p)}: ${p.title}`.slice(0, 200),
    summary:
      `Nobody has touched it for ${p.days} days. Approving closes it as ` +
      "not planned, with a comment saying why; a note you add goes in the " +
      "comment. It can be reopened.",
    facts: [
      { label: "Repository", value: p.repo },
      { label: "Last activity", value: dayOf(p.updatedAt) },
    ],
    links: [{ label: `Open #${p.number} on GitHub`, url: p.url }],
    boundTo: { label: "Issue", value: `#${p.number} as of ${p.updatedAt}` },
    options: [approve("Close"), reject("Keep open")],
    suggestedQuestions: SUGGESTED,
  };
}

/** A card for closing one issue as a duplicate of another. */
export function duplicateCard(p: Proposal & { kind: "duplicate" }) {
  const key = issueKey(p.repo, p.number);
  return {
    ...cardIds(p, ""),
    topic: `issue:${key}`,
    title: `Close ${where(p)} as a duplicate of #${p.original.number}?`.slice(
      0,
      200,
    ),
    summary: (
      `#${p.number} "${p.title}" looks like #${p.original.number} ` +
      `"${p.original.title}". ${p.reason} Approving closes #${p.number} ` +
      `with a comment linking #${p.original.number}; a note you add goes in ` +
      "the comment. It can be reopened."
    ).slice(0, 2000),
    facts: [{ label: "Repository", value: p.repo }],
    links: [
      { label: `#${p.number} (to close)`, url: p.url },
      { label: `#${p.original.number} (to keep)`, url: p.original.url },
    ],
    boundTo: { label: "Issue", value: `#${p.number} as of ${p.updatedAt}` },
    options: [approve("Close as duplicate"), reject("Not a duplicate")],
    suggestedQuestions: [
      "How do the two issues differ?",
      "What is this issue about?",
    ],
  };
}

/** The day's labels: one item per issue. */
export function labelsCard(
  day: string,
  proposals: (Proposal & { kind: "label" })[],
) {
  return {
    externalId: `labels:${day}`,
    title: `Labels for ${proposals.length} issue${proposals.length === 1 ? "" : "s"}, ${day}`,
    summary:
      "Labels your repositories already have, for issues that lack them. " +
      "Apply adds them; Skip means they are not proposed for that issue again.",
    items: proposals.map((p) => ({
      id: issueKey(p.repo, p.number),
      title: `${where(p)}: ${p.title}`.slice(0, 300),
      summary:
        `Add ${p.add.map((l) => `"${l}"`).join(", ")}. ${p.reason}`.slice(
          0,
          1000,
        ),
      links: [{ label: `Open #${p.number} on GitHub`, url: p.url }],
    })),
    options: [
      { id: APPROVE, label: "Apply", style: "primary", weight: "feedback" },
      { id: REJECT, label: "Skip", style: "neutral", weight: "feedback" },
    ],
    allowLater: true,
    suggestedQuestions: SUGGESTED,
  };
}

export function needsWelcome(state: InboxState): boolean {
  return state.welcomed === false || (!state.welcomed && !state.syncedAt);
}

/** The card posted once, on the first run that reaches the inbox. */
export function welcomeCard(settings: Settings) {
  const hour = String(settings.dailyHourUtc).padStart(2, "0");
  const stale =
    settings.staleDays > 0
      ? ` issues untouched for ${settings.staleDays} days to close,`
      : "";
  return {
    externalId: "welcome",
    title: "Your backlog groomer is set up",
    summary:
      `After ${hour}:00 UTC each day it looks through ` +
      `${settings.repos.join(", ")} and proposes changes:${stale} ` +
      "duplicates to close, and labels to add. Nothing changes on GitHub " +
      "until you approve it here, and what you approve can be undone by " +
      "changing your answer. Closing and commenting notify the people " +
      "watching the repository.",
    options: [
      { id: "ok", label: "Got it", style: "primary", weight: "feedback" },
    ],
  };
}

// ============================================================================
// Answers
// ============================================================================

/**
 * What the person's answers do, in order: Approve applies the proposal (its
 * note goes in the comment), Reject means it is not proposed again and
 * reverses it if it was applied, a cleared answer reverses it and forgets
 * the rejection. Expiry and withdrawal drop it without a signal; opening,
 * Later and questions change nothing.
 */
export function effectsOf(events: InboxEvent[]): Effect[] {
  const effects: Effect[] = [];
  for (const e of events) {
    if (e.externalId === "welcome") continue;
    const key = storeKey(e.externalId, e.itemId);
    const answered = e.type === "decided" || e.type === "changed";
    if (answered && e.optionId === APPROVE) {
      effects.push({
        kind: "apply",
        key,
        note: String(e.instruction ?? "")
          .trim()
          .slice(0, 1000),
      });
    } else if (answered && e.optionId === REJECT) {
      effects.push({ kind: "reject", key });
    } else if (e.type === "cleared") {
      effects.push({ kind: "clear", key });
    } else if (e.type === "expired" || e.type === "withdrawn") {
      effects.push({ kind: "drop", key });
    }
  }
  return effects;
}

/** The comment a closing leaves on the issue. */
export function closingComment(p: Proposal, note: string): string {
  const said = note ? `\n\n${note}` : "";
  const by =
    "\n\n<sub>Proposed by a backlog groomer agent and approved in its " +
    "owner's agent inbox.</sub>";
  if (p.kind === "duplicate") {
    return `Duplicate of #${p.original.number}.${said}${by}`;
  }
  if (p.kind === "stale") {
    return `Closing as not planned: no activity for ${p.days} days.${said}${by}`;
  }
  return `${note}${by}`;
}

/** Why the groomer posted a card, for a question asked on it. */
export function whyProposed(p: Proposal): string {
  if (p.kind === "stale") {
    return `Nobody has touched ${where(p)} for ${p.days} days, past the person's limit for open issues.`;
  }
  if (p.kind === "duplicate") {
    return `The model read ${where(p)} as a duplicate of #${p.original.number}: ${p.reason}`;
  }
  return `The model suggested adding ${p.add.join(", ")} to ${where(p)}: ${p.reason}`;
}

/** The newest-first list with `signature` on the front, at most MAX_REJECTED. */
export function remember(list: string[], sig: string): string[] {
  return [sig].concat(list.filter((s) => s !== sig)).slice(0, MAX_REJECTED);
}
