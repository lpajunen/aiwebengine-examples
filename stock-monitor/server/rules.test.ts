/**
 * Tests for the watchlist's rules: reading what the person typed and what
 * the market-data service answers, when a move is an alert, which stocks are
 * proposed, and what each answer in an agent inbox does.
 */

import {
  BUY,
  DEFAULT_THRESHOLD,
  FOLLOW,
  HOLD,
  MAX_WATCHLIST,
  NOT_INTERESTED,
  SELL,
  alertCard,
  alertsDue,
  askFacts,
  askedSymbol,
  candidatesCard,
  cardKind,
  dailyDue,
  dailyPosts,
  effectsOf,
  emptyState,
  formatWatchlist,
  groupsOf,
  needsWelcome,
  WAKE_DELAY_MS,
  wakeAt,
  parseWatchlist,
  pickCandidates,
  readQuote,
  recommend,
  watchlistCards,
  welcomeCard,
  whyPosted,
  type Quote,
} from "./rules.ts";

const NOW = "2026-11-02T15:00:00.000Z";
const LATER = "2026-11-02T15:15:00.000Z";
const TOMORROW = "2026-11-03T15:00:00.000Z";

function quote(changePct: number, at = NOW): Quote {
  return { price: 100, changePct, previousClose: 100, at };
}

describe("parseWatchlist", function () {
  test("reads a ticker per line with an optional threshold", function () {
    const { watchlist, errors } = parseWatchlist(
      "aapl\nNOKIA.HE 3\n\nbrk.b, 2.5%\nAAPL 9",
    );
    expect(errors).toEqual([]);
    expect(watchlist).toEqual([
      { symbol: "AAPL", threshold: DEFAULT_THRESHOLD },
      { symbol: "NOKIA.HE", threshold: 3 },
      { symbol: "BRK.B", threshold: 2.5 },
    ]);
    expect(formatWatchlist(watchlist)).toBe("AAPL\nNOKIA.HE 3\nBRK.B 2.5");
  });

  test("says which lines it cannot read", function () {
    const { watchlist, errors } = parseWatchlist(
      "AAPL x\n$$$\nMSFT 0\nGOOG 3 extra",
    );
    expect(watchlist).toEqual([]);
    expect(errors.length).toBe(4);
  });

  test("reads groups, ungrouped first, a group named twice as one", function () {
    const { watchlist, errors } = parseWatchlist(
      "# Nordic\nNOKIA.HE 3\n#  US   tech \naapl\n# nordic!\nNESTE.HE\nMSFT",
    );
    expect(errors).toEqual([]);
    expect(watchlist).toEqual([
      { symbol: "NOKIA.HE", threshold: 3, group: "Nordic" },
      { symbol: "NESTE.HE", threshold: DEFAULT_THRESHOLD, group: "Nordic" },
      { symbol: "MSFT", threshold: DEFAULT_THRESHOLD, group: "Nordic" },
      { symbol: "AAPL", threshold: DEFAULT_THRESHOLD, group: "US tech" },
    ]);
    expect(formatWatchlist(watchlist)).toBe(
      "# Nordic\nNOKIA.HE 3\nNESTE.HE\nMSFT\n\n# US tech\nAAPL",
    );
  });

  test("lists stocks under no heading first, wherever they were added", function () {
    const groups = groupsOf([
      { symbol: "AAPL", threshold: 5, group: "US" },
      { symbol: "MSFT", threshold: 5 },
    ]);
    expect(groups.map((g) => g.name)).toEqual([null, "US"]);
    expect(
      formatWatchlist([
        { symbol: "AAPL", threshold: 5, group: "US" },
        { symbol: "MSFT", threshold: 5 },
      ]),
    ).toBe("MSFT\n\n# US\nAAPL");
  });

  test("refuses a group without a name", function () {
    const { errors } = parseWatchlist("#\nAAPL\n# !!\n# " + "x".repeat(41));
    expect(errors.length).toBe(3);
  });

  test("keeps at most the limit", function () {
    const lines: string[] = [];
    for (let i = 0; i < MAX_WATCHLIST + 2; i++) lines.push(`S${i}`);
    const { watchlist, errors } = parseWatchlist(lines.join("\n"));
    expect(watchlist.length).toBe(MAX_WATCHLIST);
    expect(errors.length).toBe(2);
  });
});

describe("readQuote", function () {
  test("reads price, move and time", function () {
    const q = readQuote({ c: 105, pc: 100, dp: 5, t: 1793631600 }, NOW);
    expect(q?.price).toBe(105);
    expect(q?.changePct).toBe(5);
    expect(q?.at).toBe(new Date(1793631600 * 1000).toISOString());
  });

  test("is null for a symbol the service does not know", function () {
    expect(readQuote({ c: 0, d: null, dp: null, pc: 0, t: 0 }, NOW)).toBeNull();
    expect(readQuote(null, NOW)).toBeNull();
  });
});

describe("alertsDue", function () {
  const watchlist = [
    { symbol: "UP", threshold: 5 },
    { symbol: "CALM", threshold: 5 },
    { symbol: "DOWN", threshold: 3 },
  ];

  test("alerts on moves past the stock's own threshold", function () {
    const due = alertsDue(
      emptyState(),
      watchlist,
      { UP: quote(6), CALM: quote(4), DOWN: quote(-3.5) },
      NOW,
    );
    expect(due.symbols).toEqual(["UP", "DOWN"]);
  });

  test("alerts once a day per direction", function () {
    const first = alertsDue(emptyState(), watchlist, { UP: quote(6) }, NOW);
    const again = alertsDue(first.state, watchlist, { UP: quote(7) }, LATER);
    expect(again.symbols).toEqual([]);
    const back = alertsDue(first.state, watchlist, { UP: quote(-6) }, LATER);
    expect(back.symbols).toEqual(["UP"]);
    const tomorrow = alertsDue(
      first.state,
      watchlist,
      { UP: quote(6, TOMORROW) },
      TOMORROW,
    );
    expect(tomorrow.symbols).toEqual(["UP"]);
  });

  test("ignores a quote from an earlier day, such as over a weekend", function () {
    const due = alertsDue(
      emptyState(),
      watchlist,
      { UP: quote(9, "2026-10-30T20:00:00.000Z") },
      NOW,
    );
    expect(due.symbols).toEqual([]);
  });
});

describe("dailyDue", function () {
  test("is due once a day from the hour on", function () {
    expect(dailyDue("", NOW, 16)).toBe(false);
    expect(dailyDue("", NOW, 15)).toBe(true);
    expect(dailyDue("2026-11-02", LATER, 15)).toBe(false);
    expect(dailyDue("2026-11-02", TOMORROW, 15)).toBe(true);
  });
});

describe("pickCandidates", function () {
  test("takes peers in turn, skipping watched, refused and offered", function () {
    const picked = pickCandidates(
      [
        ["AAPL", "MSFT", "GOOG", "DELL"],
        ["NOK", "ERIC", "CSCO"],
      ],
      [
        { symbol: "AAPL", threshold: 5 },
        { symbol: "NOK", threshold: 5 },
      ],
      ["GOOG"],
      ["CSCO"],
      3,
    );
    expect(picked).toEqual(["MSFT", "ERIC", "DELL"]);
  });
});

describe("cards", function () {
  const lists = {
    buy: [{ symbol: "AAPL", at: NOW, price: 100 }],
    sell: [],
  };

  test("the watchlist card has one item per stock", function () {
    const [card, ...more] = watchlistCards(
      "2026-11-02",
      [
        { symbol: "AAPL", threshold: 5 },
        { symbol: "MSFT", threshold: 5 },
      ],
      { AAPL: quote(1.25) },
      lists,
    );
    expect(more).toEqual([]);
    expect(card.topic).toBe("stock-monitor:watchlist");
    expect(card.externalId).toBe("w-2026-11-02");
    expect(card.items.map((i) => i.id)).toEqual(["AAPL", "MSFT"]);
    expect(card.items[0].title).toBe("AAPL 100.00 (+1.3 %)");
    expect(card.items[0].summary).toBe("On Recommended buy.");
    expect(card.items[1].title).toBe("MSFT, no quote");
  });

  test("each group has a card of its own", function () {
    const cards = watchlistCards(
      "2026-11-02",
      [
        { symbol: "MSFT", threshold: 5 },
        { symbol: "NOKIA.HE", threshold: 5, group: "Nordic" },
      ],
      {},
      lists,
    );
    expect(cards.map((c) => c.externalId)).toEqual([
      "w-2026-11-02",
      "w-2026-11-02-nordic",
    ]);
    expect(cards[1].topic).toBe("stock-monitor:watchlist:nordic");
    expect(cards[1].title).toBe("Nordic, 2026-11-02");
    expect(cards[1].items.map((i) => i.id)).toEqual(["NOKIA.HE"]);
    expect(askedSymbol(cards[1].externalId, "NOKIA.HE")).toBe("NOKIA.HE");
    expect(
      effectsOf([
        {
          type: "decided",
          externalId: cards[1].externalId,
          itemId: "NOKIA.HE",
          optionId: BUY,
        },
      ]),
    ).toEqual([{ kind: "recommend", symbol: "NOKIA.HE", list: "buy" }]);
  });

  test("an alert names the stock's group", function () {
    const card = alertCard(
      "2026-11-02",
      { symbol: "NOKIA.HE", threshold: 5, group: "Nordic" },
      quote(6),
      lists,
    );
    expect(card.facts[2]).toEqual({ label: "Group", value: "Nordic" });
  });

  test("an alert is superseded by the next one for the stock", function () {
    const card = alertCard(
      "2026-11-02",
      { symbol: "AAPL", threshold: 5 },
      quote(-6),
      lists,
    );
    expect(card.topic).toBe("stock-monitor:AAPL");
    expect(card.title).toBe("AAPL down −6.0 % today");
    expect(card.allowLater).toBe(true);
  });

  test("stocks to look at offer Follow and Not interested", function () {
    const card = candidatesCard("2026-11-02", ["MSFT"]);
    expect(card.options.map((o) => o.id)).toEqual([FOLLOW, NOT_INTERESTED]);
    expect(card.items[0].id).toBe("MSFT");
  });
});

describe("welcome", function () {
  test("is owed by a new watchlist, and by one whose welcome failed", function () {
    expect(needsWelcome(emptyState())).toBe(true);
    expect(needsWelcome({ ...emptyState(), welcomed: false })).toBe(true);
    expect(needsWelcome({ ...emptyState(), welcomed: true })).toBe(false);
    expect(
      needsWelcome({ ...emptyState(), syncedAt: "2026-11-01T00:00:00Z" }),
    ).toBe(false);
  });

  test("names the hour of the day's round, and its answer changes nothing", function () {
    const card = welcomeCard(7);
    expect(card.summary).toContain("07:00 UTC");
    expect(
      effectsOf([{ type: "decided", externalId: "welcome", optionId: "ok" }]),
    ).toEqual([]);
  });
});

describe("wakeAt", function () {
  test("queues a run a short while from now when none is waiting", function () {
    expect(wakeAt(null, new Date(NOW))).toBe(
      new Date(Date.parse(NOW) + WAKE_DELAY_MS).toISOString(),
    );
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
  test("watchlist and alert answers recommend, Hold and clearing take off", function () {
    expect(
      effectsOf([
        {
          type: "decided",
          externalId: "w-2026-11-02",
          itemId: "AAPL",
          optionId: BUY,
        },
        { type: "changed", externalId: "a-2026-11-02-BRK.B", optionId: SELL },
        {
          type: "decided",
          externalId: "w-2026-11-02",
          itemId: "MSFT",
          optionId: HOLD,
        },
        { type: "cleared", externalId: "a-2026-11-02-NOK" },
      ]),
    ).toEqual([
      { kind: "recommend", symbol: "AAPL", list: "buy" },
      { kind: "recommend", symbol: "BRK.B", list: "sell" },
      { kind: "recommend", symbol: "MSFT", list: null },
      { kind: "recommend", symbol: "NOK", list: null },
    ]);
  });

  test("candidate answers follow, refuse and undo", function () {
    expect(
      effectsOf([
        {
          type: "decided",
          externalId: "c-2026-11-02",
          itemId: "MSFT",
          optionId: FOLLOW,
        },
        {
          type: "decided",
          externalId: "c-2026-11-02",
          itemId: "ERIC",
          optionId: NOT_INTERESTED,
        },
        { type: "cleared", externalId: "c-2026-11-02", itemId: "MSFT" },
      ]),
    ).toEqual([
      { kind: "follow", symbol: "MSFT" },
      { kind: "dismiss", symbol: "ERIC" },
      { kind: "reconsider", symbol: "MSFT" },
    ]);
  });

  test("opening, later, expiry and unknown cards change nothing", function () {
    expect(
      effectsOf([
        { type: "opened", externalId: "w-2026-11-02", itemId: "AAPL" },
        { type: "later", externalId: "a-2026-11-02-AAPL" },
        { type: "expired", externalId: "c-2026-11-02" },
        {
          type: "decided",
          externalId: "x-1",
          itemId: "AAPL",
          optionId: BUY,
        },
      ]),
    ).toEqual([]);
  });
});

describe("recommend", function () {
  test("moves a stock between the lists and keeps when it was first put", function () {
    let lists = recommend({ buy: [], sell: [] }, "AAPL", "buy", 100, NOW);
    lists = recommend(lists, "AAPL", "buy", 120, LATER);
    expect(lists.buy).toEqual([{ symbol: "AAPL", at: NOW, price: 100 }]);
    lists = recommend(lists, "AAPL", "sell", 90, LATER);
    expect(lists.buy).toEqual([]);
    expect(lists.sell[0].price).toBe(90);
    lists = recommend(lists, "AAPL", null, null, LATER);
    expect(lists).toEqual({ buy: [], sell: [] });
  });
});

describe("askedSymbol", function () {
  test("names an alert's stock, or the item asked about", function () {
    expect(askedSymbol("a-2026-11-02-BRK.B")).toBe("BRK.B");
    expect(askedSymbol("w-2026-11-02", "AAPL")).toBe("AAPL");
    expect(askedSymbol("c-2026-11-02", "MSFT")).toBe("MSFT");
  });

  test("is null for a batch as a whole or a card it did not post", function () {
    expect(askedSymbol("w-2026-11-02")).toBeNull();
    expect(askedSymbol("x-1", "AAPL")).toBeNull();
  });
});

describe("dailyPosts", function () {
  test("posts the round once a day, with stocks not posted before", function () {
    const first = dailyPosts(emptyState(), ["MSFT", "DELL"], NOW, 15);
    expect(first.due).toBe(true);
    expect(first.candidates).toEqual(["MSFT", "DELL"]);
    expect(dailyPosts(first.state, ["MSFT"], LATER, 15).due).toBe(false);
    const next = dailyPosts(first.state, ["HPQ", "MSFT"], TOMORROW, 15);
    expect(next.candidates).toEqual(["HPQ"]);
  });

  test("waits for the hour", function () {
    expect(dailyPosts(emptyState(), [], NOW, 16).due).toBe(false);
  });

  test("a round the inbox has not had yet is still due later the same day", function () {
    // The peers were fetched at an earlier run that could not reach the
    // inbox; the inbox's own record says nothing was posted today.
    expect(dailyPosts(emptyState(), ["MSFT"], LATER, 15).due).toBe(true);
  });
});

describe("context for a question", function () {
  const lists = {
    buy: [{ symbol: "AAPL", at: NOW, price: 100 }],
    sell: [],
  };

  test("names the kind of card", function () {
    expect(cardKind("w-2026-11-02-nordic")).toBe("w");
    expect(cardKind("a-2026-11-02-AAPL")).toBe("a");
    expect(cardKind("c-2026-11-02")).toBe("c");
    expect(cardKind("x-1")).toBeNull();
  });

  test("says why each card was posted", function () {
    const watched = { symbol: "NOKIA.HE", threshold: 5, group: "Nordic" };
    expect(whyPosted("a", watched, quote(-6))).toContain(
      "moved −6.0 % today, past the person's own alert threshold of 5 %",
    );
    expect(whyPosted("w", watched, null)).toContain("group Nordic");
    expect(whyPosted("c", null, null)).toContain("does not judge them");
  });

  test("gives the quote, the threshold and the lists as facts", function () {
    const facts = askFacts(
      "AAPL",
      { symbol: "AAPL", threshold: 3, group: "US" },
      quote(1.25),
      lists,
    );
    const value = (label: string) =>
      facts.find((f) => f.label === label)?.value;
    expect(value("Change today")).toBe("+1.3 %");
    expect(value("Group")).toBe("US");
    expect(value("The person's lists")).toBe("On Recommended buy.");
    expect(askFacts("MSFT", null, null, lists)).toEqual([
      { label: "Stock", value: "MSFT" },
      { label: "Watched", value: "No" },
      { label: "The person's lists", value: "On neither Recommended list." },
    ]);
  });
});
