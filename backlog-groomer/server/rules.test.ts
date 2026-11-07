/**
 * Tests for the groomer's rules: reading what the person typed and what
 * GitHub answers, which issues are proposed, the cards, and what each answer
 * in an agent inbox does.
 */

import {
  APPROVE,
  MAX_LABELS_PER_ISSUE,
  MAX_REPOS,
  REJECT,
  cardIds,
  closingComment,
  dailyDue,
  duplicateCard,
  effectsOf,
  fitsInbox,
  issueKey,
  labelsCard,
  needsWelcome,
  newIssue,
  parseRepos,
  pickStale,
  proposalsFrom,
  readIssues,
  readRepo,
  readStaleDays,
  remember,
  signature,
  staleCard,
  storeKey,
  welcomeCard,
  type Issue,
  type Proposal,
} from "./rules.ts";

const NOW = "2026-11-05T06:00:00.000Z";
const REPO = "acme/widgets";

function issue(
  number: number,
  updatedAt: string,
  extra?: Partial<Issue>,
): Issue {
  return {
    number,
    title: `Issue ${number}`,
    body: "",
    labels: [],
    url: `https://github.com/${REPO}/issues/${number}`,
    createdAt: updatedAt,
    updatedAt,
    ...extra,
  };
}

describe("settings", function () {
  test("reads repositories as owner/name or a URL, once each", function () {
    expect(readRepo("acme/widgets")).toBe("acme/widgets");
    expect(readRepo("https://github.com/acme/widgets.git")).toBe(
      "acme/widgets",
    );
    expect(readRepo("acme")).toBe(null);
    expect(readRepo("acme/wid gets")).toBe(null);
    const { repos, errors } = parseRepos(
      "acme/widgets\n\nACME/Widgets\nhttps://github.com/acme/gears/\nnope",
    );
    expect(repos).toEqual(["acme/widgets", "acme/gears"]);
    expect(errors).toEqual(["Not a repository: nope"]);
  });

  test("refuses more repositories than allowed", function () {
    const text = Array.from(
      { length: MAX_REPOS + 1 },
      (_, i) => `a/r${i}`,
    ).join("\n");
    expect(parseRepos(text).errors.length).toBe(1);
  });

  test("reads the days, 0 meaning never", function () {
    expect(readStaleDays(0)).toBe(0);
    expect(readStaleDays("90")).toBe(90);
    expect(readStaleDays(-1)).toBe(null);
    expect(readStaleDays(1.5)).toBe(null);
  });

  test("is due once a day from the hour on", function () {
    expect(dailyDue("", NOW, 6)).toBe(true);
    expect(dailyDue("2026-11-05", NOW, 6)).toBe(false);
    expect(dailyDue("2026-11-04", NOW, 7)).toBe(false);
  });
});

describe("GitHub", function () {
  test("reads issues and leaves pull requests out", function () {
    const issues = readIssues([
      {
        number: 1,
        title: "Bug",
        body: null,
        labels: [{ name: "bug" }, "triage"],
        html_url: "https://github.com/acme/widgets/issues/1",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-02-01T00:00:00Z",
      },
      {
        number: 2,
        title: "A pull request",
        html_url: "https://github.com/acme/widgets/pull/2",
        updated_at: "2026-02-01T00:00:00Z",
        pull_request: {},
      },
      { number: "3" },
    ]);
    expect(issues.length).toBe(1);
    expect(issues[0].labels).toEqual(["bug", "triage"]);
    expect(issues[0].body).toBe("");
  });
});

describe("proposals", function () {
  test("proposes the oldest untouched issues, skipping what was refused", function () {
    const issues = [
      issue(3, "2026-01-01T00:00:00Z"),
      issue(1, "2025-01-01T00:00:00Z"),
      issue(2, "2025-06-01T00:00:00Z"),
      issue(4, "2026-11-01T00:00:00Z"),
    ];
    const refused = new Set([
      signature({
        kind: "stale",
        repo: REPO,
        number: 2,
        title: "",
        url: "",
        updatedAt: "",
        days: 0,
      }),
    ]);
    const picked = pickStale(REPO, issues, NOW, 180, new Set(), refused, 5);
    expect(picked.map((p) => p.number)).toEqual([1, 3]);
    expect(picked[0].kind === "stale" && picked[0].days).toBe(673);
    expect(pickStale(REPO, issues, NOW, 0, new Set(), new Set(), 5)).toEqual(
      [],
    );
    const skip = new Set([issueKey(REPO, 1).toLowerCase()]);
    expect(
      pickStale(REPO, issues, NOW, 180, skip, new Set(), 1).map(
        (p) => p.number,
      ),
    ).toEqual([2]);
  });

  test("keeps only what can be done of the model's suggestions", function () {
    const issues = [
      issue(1, NOW, { labels: ["bug"] }),
      issue(2, NOW),
      issue(3, NOW),
    ];
    const found = proposalsFrom(
      REPO,
      {
        duplicates: [
          { duplicate: 2, original: 1, reason: "Same crash." },
          { duplicate: 3, original: 3, reason: "Itself." },
          { duplicate: 9, original: 1, reason: "Not shown." },
        ],
        labels: [
          { number: 1, add: ["Bug", "docs"], reason: "Docs." },
          { number: 2, add: ["docs"], reason: "Taken by the duplicate." },
          {
            number: 3,
            add: ["invented", "bug", "docs", "ui", "api"],
            reason: "",
          },
        ],
      },
      issues,
      ["bug", "Docs", "UI", "API"],
      new Set(),
      new Set(),
      { duplicates: 5, labelled: 5 },
    );
    expect(found.duplicates.map((p) => p.number)).toEqual([2]);
    expect(
      found.labels.map((p) => p.kind === "label" && [p.number, p.add]),
    ).toEqual([
      [1, ["Docs"]],
      [3, ["bug", "Docs", "UI"].slice(0, MAX_LABELS_PER_ISSUE)],
    ]);
  });

  test("does not propose again what was rejected", function () {
    const issues = [issue(1, NOW), issue(2, NOW)];
    const dup: Proposal = {
      kind: "duplicate",
      repo: REPO,
      number: 2,
      title: "",
      url: "",
      updatedAt: NOW,
      original: { number: 1, title: "", url: "" },
      reason: "",
    };
    const found = proposalsFrom(
      REPO,
      {
        duplicates: [{ duplicate: 2, original: 1, reason: "" }],
        labels: [],
      },
      issues,
      [],
      new Set(),
      new Set([signature(dup)]),
      { duplicates: 5, labelled: 5 },
    );
    expect(found.duplicates).toEqual([]);
  });
});

describe("cards", function () {
  const stale: Proposal & { kind: "stale" } = {
    kind: "stale",
    repo: REPO,
    number: 12,
    title: "Old idea",
    url: `https://github.com/${REPO}/issues/12`,
    updatedAt: "2025-01-01T00:00:00Z",
    days: 673,
  };

  test("binds a closing card to the issue and versions its id by it", function () {
    const card = staleCard(stale);
    expect(card.externalId).toBe("stale:acme:widgets:12:1735689600");
    expect(card.topic).toBe("issue:acme:widgets:12");
    expect(card.boundTo.value).toBe("#12 as of 2025-01-01T00:00:00Z");
    expect(card.options.map((o) => [o.id, o.weight])).toEqual([
      [APPROVE, "instruction"],
      [REJECT, "feedback"],
    ]);
    const later = staleCard({ ...stale, updatedAt: "2025-02-01T00:00:00Z" });
    expect(later.externalId).not.toBe(card.externalId);
    expect(later.topic).toBe(card.topic);
    expect(card.allowLater).toBe(true);
  });

  test("links both issues on a duplicate", function () {
    const card = duplicateCard({
      kind: "duplicate",
      repo: REPO,
      number: 7,
      title: "Crash",
      url: "https://github.com/acme/widgets/issues/7",
      updatedAt: NOW,
      original: {
        number: 3,
        title: "Crash on start",
        url: "https://github.com/acme/widgets/issues/3",
      },
      reason: "Same stack trace.",
    });
    expect(card.links.length).toBe(2);
    expect(card.allowLater).toBe(true);
    expect(card.externalId.startsWith("dup:acme:widgets:7:3:")).toBe(true);
  });

  test("puts the day's labels on one card, an item per issue", function () {
    const label: Proposal & { kind: "label" } = {
      kind: "label",
      repo: REPO,
      number: 5,
      title: "Typo",
      url: "https://github.com/acme/widgets/issues/5",
      updatedAt: NOW,
      add: ["docs"],
      reason: "A docs fix.",
    };
    const card = labelsCard("2026-11-05", [label]);
    expect(card.externalId).toBe("labels:2026-11-05");
    expect(card.items[0].id).toBe("acme:widgets:5");
    const ids = cardIds(label, "2026-11-05");
    expect(storeKey(ids.externalId, ids.itemId)).toBe(
      "labels:2026-11-05/acme:widgets:5",
    );
  });

  test("leaves out a repository whose name makes the ids too long", function () {
    const long = { ...stale, repo: `${"o".repeat(39)}/${"x".repeat(100)}` };
    expect(fitsInbox(stale, "")).toBe(true);
    expect(fitsInbox(long, "")).toBe(false);
  });

  test("welcomes once", function () {
    expect(needsWelcome({ cursor: 0 })).toBe(true);
    expect(needsWelcome({ cursor: 4, syncedAt: NOW })).toBe(false);
    expect(needsWelcome({ cursor: 4, syncedAt: NOW, welcomed: false })).toBe(
      true,
    );
    const card = welcomeCard({ repos: [REPO], staleDays: 0, dailyHourUtc: 6 });
    expect(card.summary.indexOf("untouched")).toBe(-1);
  });

  test("says in the comment why it closed and who approved it", function () {
    expect(closingComment(stale, "").startsWith("Closing as not planned")).toBe(
      true,
    );
    expect(closingComment(stale, "Done in v2.")).toContain("Done in v2.");
  });
});

describe("answers", function () {
  test("turns events into what to do, in order", function () {
    const effects = effectsOf([
      { type: "decided", externalId: "welcome", optionId: "ok" },
      {
        type: "decided",
        externalId: "stale:a:b:1:9",
        optionId: APPROVE,
        instruction: " Fixed in 2.0 ",
      },
      {
        type: "decided",
        externalId: "labels:2026-11-05",
        itemId: "a:b:2",
        optionId: REJECT,
      },
      { type: "changed", externalId: "stale:a:b:1:9", optionId: REJECT },
      { type: "cleared", externalId: "stale:a:b:1:9" },
      { type: "opened", externalId: "stale:a:b:1:9" },
      { type: "expired", externalId: "dup:a:b:3:1:9" },
    ]);
    expect(effects).toEqual([
      { kind: "apply", key: "stale:a:b:1:9", note: "Fixed in 2.0" },
      { kind: "reject", key: "labels:2026-11-05/a:b:2" },
      { kind: "reject", key: "stale:a:b:1:9" },
      { kind: "clear", key: "stale:a:b:1:9" },
      { kind: "drop", key: "dup:a:b:3:1:9" },
    ]);
  });

  test("makes a new issue of the first line and the rest", function () {
    expect(
      newIssue("\n  Dark mode toggle \r\nOn the queue page.\n\nAnd agents.\n"),
    ).toEqual({
      title: "Dark mode toggle",
      body: "On the queue page.\n\nAnd agents.",
    });
    expect(newIssue("Just a title")).toEqual({
      title: "Just a title",
      body: "",
    });
    expect(newIssue(" \n ")).toBe(null);
  });

  test("remembers a rejection once, newest first", function () {
    expect(remember(["b", "a"], "a")).toEqual(["a", "b"]);
  });
});
