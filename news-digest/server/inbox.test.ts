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
  articleKey,
  batchCard,
  effectsOf,
  emptyState,
  highlightCard,
  planPosts,
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
  });

  test("a highlight can wait until later", function () {
    const card = highlightCard(article("a"));
    expect(card.externalId).toBe(`h-${articleKey("a")}`);
    expect(card.allowLater).toBe(true);
    expect(card.links[0].url).toBe("https://news.example/a");
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

  test("clearing unsorts, opening reads, later wants", function () {
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
      { kind: "read", id: "b" },
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
