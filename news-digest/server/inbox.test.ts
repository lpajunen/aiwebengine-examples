/**
 * Tests for the digest as an inbox producer: which articles go to the rolling
 * batch card and which become highlights, when a batch starts afresh, that
 * the cards fit what an inbox accepts, and what each answer does.
 */

import {
  MAX_BATCH,
  MAX_HIGHLIGHTS,
  NOT_RELEVANT,
  RELEVANT,
  UNSURE,
  articleKey,
  articlesAsked,
  askContext,
  batchCard,
  effectsOf,
  emptyState,
  highlightCard,
  needsWelcome,
  planPosts,
  searchArticles,
  WAKE_DELAY_MS,
  wakeAt,
  welcomeCard,
  type InboxArticle,
} from "./inbox.ts";

const NOW = "2026-11-01T09:00:00.000Z";
const LATER = "2026-11-01T09:15:00.000Z";
const TOMORROW = "2026-11-02T09:00:00.000Z";

function article(id: string, extra: Partial<InboxArticle> = {}): InboxArticle {
  return {
    id,
    headline: `Headline ${id}`,
    summary: `Summary ${id}`,
    link: `https://news.example/${id}`,
    source: "Example News",
    ...extra,
  };
}

function articles(n: number, prefix = "x"): InboxArticle[] {
  const list: InboxArticle[] = [];
  for (let i = 0; i < n; i++) list.push(article(`${prefix}${i}`));
  return list;
}

describe("articleKey", function () {
  test("is stable and takes only what an inbox accepts", function () {
    const id = "https://yle.fi/a/74-20100000?utm=rss#x";
    expect(articleKey(id)).toBe(articleKey(id));
    expect(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(articleKey(id))).toBe(
      true,
    );
  });

  test("tells similar ids apart", function () {
    const keys = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      keys.add(articleKey(`https://news.example/article/${i}`));
    }
    expect(keys.size).toBe(2000);
  });
});

describe("planPosts", function () {
  test("puts kept articles in a batch, newest first, and leaves out the filtered", function () {
    const plan = planPosts(
      emptyState(),
      [article("a"), article("b", { filtered: "Gossip" }), article("c")],
      NOW,
    );
    expect(plan.batchIds).toEqual(["a", "c"]);
    expect(plan.state.batch?.externalId).toBe("2026-11-01.1");
  });

  test("adds a later run's articles to the same day's batch, in front", function () {
    const first = planPosts(emptyState(), [article("a")], NOW);
    const second = planPosts(first.state, [article("b")], LATER);
    expect(second.batchIds).toEqual(["b", "a"]);
    expect(second.state.batch?.externalId).toBe("2026-11-01.1");
  });

  test("starts afresh the next day", function () {
    const first = planPosts(emptyState(), [article("a")], NOW);
    const next = planPosts(first.state, [article("b")], TOMORROW);
    expect(next.batchIds).toEqual(["b"]);
    expect(next.state.batch?.externalId).toBe("2026-11-02.1");
  });

  test("starts afresh when the batch would be too long", function () {
    const first = planPosts(emptyState(), articles(MAX_BATCH - 1), NOW);
    const next = planPosts(first.state, articles(2, "y"), LATER);
    expect(next.batchIds).toEqual(["y0", "y1"]);
    expect(next.state.batch?.externalId).toBe("2026-11-01.2");
  });

  test("starts afresh once the person finished the batch", function () {
    const first = planPosts(emptyState(), [article("a")], NOW);
    const again = planPosts(first.state, [article("b")], LATER, true);
    expect(again.batchIds).toEqual(["b"]);
    expect(again.state.batch?.externalId).toBe("2026-11-01.2");
  });

  test("posts no batch when nothing was kept", function () {
    const first = planPosts(emptyState(), [article("a")], NOW);
    const next = planPosts(
      first.state,
      [article("b", { filtered: "Gossip" })],
      LATER,
    );
    expect(next.batchIds).toBeNull();
    expect(next.state.batch).toEqual(first.state.batch);
  });

  test("makes important articles highlights instead, a few a day", function () {
    const important = articles(MAX_HIGHLIGHTS + 2, "h").map((a) => ({
      ...a,
      important: true,
    }));
    const plan = planPosts(emptyState(), important, NOW);
    expect(plan.highlights.length).toBe(MAX_HIGHLIGHTS);
    // The ones over the day's limit join the batch.
    expect(plan.batchIds).toEqual(["h5", "h6"]);

    const later = planPosts(
      plan.state,
      [article("z", { important: true })],
      LATER,
    );
    expect(later.highlights.length).toBe(0);
    const tomorrow = planPosts(
      plan.state,
      [article("z", { important: true })],
      TOMORROW,
    );
    expect(tomorrow.highlights.length).toBe(1);
  });

  test("never highlights a filtered article", function () {
    const plan = planPosts(
      emptyState(),
      [article("a", { important: true, filtered: "Gossip" })],
      NOW,
    );
    expect(plan.highlights.length).toBe(0);
  });
});

describe("cards", function () {
  test("a full batch stays well inside an inbox's 32 KB", function () {
    const long = articles(MAX_BATCH).map((a) => ({
      ...a,
      headline: "H".repeat(400),
      summary: "S".repeat(3000),
      link: `https://news.example/${"p".repeat(200)}`,
    }));
    const card = batchCard(
      "sports",
      "Sports",
      { externalId: "2026-11-01.1", day: "2026-11-01" },
      long,
    );
    expect(JSON.stringify(card).length < 32 * 1024).toBe(true);
    expect(card.topic).toBe("news-digest:sports");
    expect(card.items[0].id).toBe(articleKey(long[0].id));
    expect(card.handledByOpening).toBe(true);
    expect(card.allowLater).toBe(true);
    expect(card.options.map((o) => o.id)).toEqual([
      RELEVANT,
      UNSURE,
      NOT_RELEVANT,
    ]);
  });

  test("a highlight can wait until later", function () {
    const card = highlightCard(article("a"));
    expect(card.externalId).toBe(`h-${articleKey("a")}`);
    expect(card.allowLater).toBe(true);
    expect(card.links[0].url).toBe("https://news.example/a");
  });
});

describe("welcome", function () {
  test("is owed by a new digest, and by one whose welcome failed", function () {
    expect(needsWelcome(emptyState())).toBe(true);
    expect(needsWelcome({ ...emptyState(), welcomed: false })).toBe(true);
    expect(needsWelcome({ ...emptyState(), welcomed: true })).toBe(false);
  });

  test("is not owed by a digest that reached the inbox before", function () {
    expect(
      needsWelcome({ ...emptyState(), syncedAt: "2026-11-01T00:00:00Z" }),
    ).toBe(false);
  });

  test("is one card per digest, and its answer changes nothing", function () {
    const card = welcomeCard("sports", "Sports");
    expect(card.externalId).toBe("welcome-sports");
    expect(card.title).toBe("Sports is set up");
    expect(card.options.length).toBe(1);
    expect(
      effectsOf(
        [{ type: "decided", externalId: card.externalId, optionId: "ok" }],
        [],
      ),
    ).toEqual([]);
  });
});

describe("wakeAt", function () {
  test("queues a run a short while from now when none is waiting", function () {
    const at = wakeAt(null, new Date(NOW));
    expect(at).toBe(new Date(Date.parse(NOW) + WAKE_DELAY_MS).toISOString());
  });

  test("queues nothing while an earlier wake is still to run", function () {
    const pending = wakeAt(null, new Date(NOW)) as string;
    const soon = new Date(Date.parse(NOW) + WAKE_DELAY_MS / 2);
    expect(wakeAt(pending, soon)).toBe(null);
  });

  test("queues again once the earlier wake's time has passed", function () {
    expect(wakeAt(NOW, new Date(LATER))).toBe(
      new Date(Date.parse(LATER) + WAKE_DELAY_MS).toISOString(),
    );
  });
});

describe("effectsOf", function () {
  const list = [article("a"), article("b")];
  const a = articleKey("a");
  const b = articleKey("b");

  test("a batch answer sorts the article and marks it read", function () {
    expect(
      effectsOf(
        [
          {
            type: "decided",
            externalId: "d.1",
            itemId: a,
            optionId: NOT_RELEVANT,
          },
        ],
        list,
      ),
    ).toEqual([
      { kind: "verdict", id: "a", verdict: "skip" },
      { kind: "read", id: "a" },
    ]);
  });

  test("a highlight is found by its card", function () {
    expect(
      effectsOf(
        [{ type: "changed", externalId: `h-${b}`, optionId: RELEVANT }],
        list,
      ),
    ).toEqual([
      { kind: "verdict", id: "b", verdict: "want" },
      { kind: "read", id: "b" },
    ]);
  });

  test("unsure reads and takes back a verdict", function () {
    expect(
      effectsOf(
        [{ type: "changed", externalId: "d.1", itemId: a, optionId: UNSURE }],
        list,
      ),
    ).toEqual([
      { kind: "unsort", id: "a" },
      { kind: "read", id: "a" },
    ]);
  });

  test("clearing unsorts, opening is a mild positive, later wants", function () {
    expect(
      effectsOf(
        [
          { type: "cleared", externalId: "d.1", itemId: a },
          { type: "opened", externalId: "d.1", itemId: b },
          { type: "later", externalId: `h-${a}` },
        ],
        list,
      ),
    ).toEqual([
      { kind: "unsort", id: "a" },
      { kind: "opened", id: "b" },
      { kind: "verdict", id: "a", verdict: "want" },
    ]);
  });

  test("expiry, withdrawal and articles no longer kept mean nothing", function () {
    expect(
      effectsOf(
        [
          { type: "expired", externalId: "d.1" },
          { type: "withdrawn", externalId: `h-${a}` },
          {
            type: "decided",
            externalId: "d.1",
            itemId: articleKey("gone"),
            optionId: RELEVANT,
          },
        ],
        list,
      ),
    ).toEqual([]);
  });
});

describe("articlesAsked", function () {
  const list = [article("a"), article("b"), article("c")];
  const state = planPosts(
    emptyState(),
    [article("a"), article("b")],
    NOW,
  ).state;

  test("finds an item, a highlight and a whole batch", function () {
    const batchId = state.batch?.externalId ?? "";
    expect(
      articlesAsked(state, list, batchId, articleKey("b")).map((a) => a.id),
    ).toEqual(["b"]);
    expect(
      articlesAsked(state, list, `h-${articleKey("c")}`).map((a) => a.id),
    ).toEqual(["c"]);
    expect(articlesAsked(state, list, batchId).map((a) => a.id)).toEqual([
      "a",
      "b",
    ]);
  });

  test("is empty for articles no longer kept or an earlier batch", function () {
    expect(articlesAsked(state, list, "x", articleKey("gone"))).toEqual([]);
    expect(articlesAsked(state, list, "2026-10-31.1")).toEqual([]);
  });
});

describe("askContext", function () {
  test("says why the card came, with the reader's interests and its articles", function () {
    const batch = askContext(
      "2026-11-01.1",
      [article("a", { link: "javascript:x" }), article("b")],
      "  No transfer gossip. ",
      "Sports",
    );
    expect(batch.why).toContain("passed the reader's interest filter");
    expect(batch.facts).toEqual([
      { label: "Digest", value: "Sports" },
      { label: "The reader's interests", value: "No transfer gossip." },
    ]);
    expect(batch.documents[0].url).toBeUndefined();
    expect(batch.documents[1]).toEqual({
      title: "Headline b",
      url: "https://news.example/b",
      text: "Summary b\nSource: Example News",
    });
    const highlight = askContext(
      `h-${articleKey("a")}`,
      [article("a")],
      "",
      "Sports",
    );
    expect(highlight.why).toContain("rated important");
    expect(highlight.facts.length).toBe(1);
  });
});

describe("searchArticles", function () {
  test("finds kept articles with every word, leaving out the filtered", function () {
    const list = [
      article("a", { headline: "Election called" }),
      article("b", { headline: "Election result", filtered: "Not interested" }),
      article("c", { summary: "The election date is set" }),
    ];
    expect(searchArticles(list, "ELECTION").map((d) => d.title)).toEqual([
      "Election called",
      "Headline c",
    ]);
    expect(searchArticles(list, "election date").length).toBe(1);
    expect(searchArticles(list, "  ")).toEqual([]);
  });
});
