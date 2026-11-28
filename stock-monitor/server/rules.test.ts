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
  REMOVE,
  SELL,
  alertCard,
  alertsDue,
  askFacts,
  askedSymbol,
  candidatesCard,
  latestHeadline,
  marketCap,
  peerSources,
  readProfile,
  cardKind,
  dailyDue,
  dailyPosts,
  effectsOf,
  emptyState,
  formatWatchlist,
  groupsOf,
  listCards,
  listsSignature,
  needsWelcome,
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

  test("an alert says what the company is and the latest news about it", function () {
    const card = alertCard(
      "2026-11-02",
      { symbol: "MPWR", threshold: 5 },
      quote(5.9),
      lists,
      {
        name: "Monolithic Power Systems Inc",
        industry: "Semiconductors",
        country: "US",
        marketCapM: 38_200,
        currency: "USD",
        url: "https://www.monolithicpower.com",
      },
      {
        title: "Monolithic Power beats estimates on data-centre demand",
        source: "Reuters",
        url: "https://example.com/mpwr",
      },
    );
    expect(card.title).toBe(
      "MPWR · Monolithic Power Systems Inc up +5.9 % today",
    );
    expect(card.summary).toBe(
      "Semiconductors · US · market cap 38.2 B USD. Past your 5 % threshold. " +
        "Latest news: “Monolithic Power beats estimates on data-centre " +
        "demand” (Reuters).",
    );
    expect(card.links.map((l) => l.label)).toEqual([
      "Quote",
      "Company site",
      "The news",
    ]);
  });

  test("the watchlist names each company and what it is", function () {
    const [card] = watchlistCards(
      "2026-11-02",
      [{ symbol: "MPWR", threshold: 5 }],
      { MPWR: quote(1) },
      lists,
      {
        MPWR: {
          name: "Monolithic Power Systems Inc",
          industry: "Semiconductors",
        },
      },
    );
    expect(card.items[0].title).toMatch(
      /^MPWR · Monolithic Power Systems Inc /,
    );
    expect(card.items[0].summary).toBe("Semiconductors.");
  });

  test("stocks to look at offer Follow and Not interested", function () {
    const card = candidatesCard("2026-11-02", ["MSFT"]);
    expect(card.options.map((o) => o.id)).toEqual([FOLLOW, NOT_INTERESTED]);
    expect(card.items[0].id).toBe("MSFT");
  });

  test("a stock to look at names its company, what it is and why", function () {
    const card = candidatesCard("2026-11-02", ["MSFT", "ORCL"], {
      MSFT: {
        peerOf: ["AAPL", "GOOGL"],
        company: {
          name: "Microsoft Corp",
          industry: "Technology",
          country: "US",
          marketCapM: 3_100_000,
          currency: "USD",
          url: "https://www.microsoft.com",
        },
        quote: {
          price: 410.5,
          changePct: 1.24,
          previousClose: 405.5,
          at: NOW,
        },
      },
    });
    const [msft, orcl] = card.items;
    expect(msft.title).toBe("MSFT · Microsoft Corp");
    expect(msft.summary).toBe(
      "Technology · US · market cap 3.1 T USD. 410.50 (+1.2 % today). " +
        "A peer of AAPL and GOOGL on your watchlist.",
    );
    expect(msft.links.map((l) => l.label)).toEqual(["Quote", "Company site"]);
    // Nothing known yet: the ticker, and the reason in general.
    expect(orcl.title).toBe("ORCL");
    expect(orcl.summary).toBe("A peer of a stock on your watchlist.");
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

describe("stocks to look at", function () {
  test("the latest headline is the newest item with one", function () {
    expect(
      latestHeadline([
        { headline: "Older", datetime: 100, source: "A", url: "https://a" },
        { headline: "", datetime: 300 },
        { headline: "Newest", datetime: 200, source: "B", url: "ftp://b" },
      ]),
    ).toEqual({ title: "Newest", source: "B" });
    expect(latestHeadline([])).toBe(null);
    expect(latestHeadline({ error: "x" })).toBe(null);
  });

  test("each picked stock names the watched stocks it is a peer of", function () {
    expect(
      peerSources(
        [
          ["MSFT", "ORCL"],
          ["MSFT", "SAP"],
        ],
        ["AAPL", "GOOGL"],
        ["MSFT", "SAP", "NOK"],
      ),
    ).toEqual({ MSFT: ["AAPL", "GOOGL"], SAP: ["GOOGL"], NOK: [] });
  });

  test("a profile reads the fields the card shows, and none is null", function () {
    expect(
      readProfile({
        name: "Nokia Oyj",
        finnhubIndustry: "Communications",
        country: "FI",
        exchange: "NASDAQ HELSINKI",
        marketCapitalization: 21_500,
        currency: "EUR",
        weburl: "https://www.nokia.com/",
        logo: "ignored",
      }),
    ).toEqual({
      name: "Nokia Oyj",
      industry: "Communications",
      country: "FI",
      exchange: "NASDAQ HELSINKI",
      marketCapM: 21_500,
      currency: "EUR",
      url: "https://www.nokia.com/",
    });
    expect(readProfile({})).toBe(null);
    expect(readProfile({ name: "X", weburl: "javascript:alert(1)" })).toEqual({
      name: "X",
    });
  });

  test("market capitalisation reads in millions, billions or trillions", function () {
    expect(marketCap(3_100_000, "USD")).toBe("3.1 T USD");
    expect(marketCap(21_500, "EUR")).toBe("21.5 B EUR");
    expect(marketCap(840)).toBe("840 M");
  });

  test("a question on one says which stocks it is a peer of", function () {
    expect(whyPosted("c", null, null, { peerOf: ["AAPL"] })).toContain(
      "A peer of AAPL on the person's watchlist.",
    );
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

describe("the Recommended lists", function () {
  const LISTS = {
    buy: [{ symbol: "AAPL", at: NOW, price: 80 }],
    sell: [],
  };

  test("are standing cards, each stock with its price and move since", function () {
    const [buy, sell] = listCards(
      LISTS,
      { AAPL: quote(1.5) },
      {
        AAPL: {
          name: "Apple Inc",
          industry: "Technology",
          country: "US",
        },
      },
    ) as any[];
    expect(buy.externalId).toBe("l-buy");
    expect(buy.standing).toBe(true);
    expect(buy.options.map((o: any) => o.id)).toEqual([REMOVE]);
    expect(buy.items[0].id).toBe("AAPL");
    expect(buy.items[0].title).toContain("Apple Inc");
    expect(buy.items[0].summary).toContain("at 80.00; +25.0 % since");
    // An empty list only says how a stock gets there.
    expect(sell.externalId).toBe("l-sell");
    expect(sell.items).toEqual([]);
    expect(sell.options).toBe(undefined);
    expect(sell.level).toBe("know");
  });

  test("Remove takes a stock off, and clearing it puts it back on that list", function () {
    expect(
      effectsOf([
        {
          type: "decided",
          externalId: "l-buy",
          itemId: "AAPL",
          optionId: REMOVE,
        },
        { type: "cleared", externalId: "l-sell", itemId: "NOK" },
        { type: "opened", externalId: "l-buy", itemId: "AAPL" },
      ]),
    ).toEqual([
      { kind: "recommend", symbol: "AAPL", list: null },
      { kind: "recommend", symbol: "NOK", list: "sell" },
    ]);
    expect(cardKind("l-buy")).toBe("l");
    expect(askedSymbol("l-sell", "NOK")).toBe("NOK");
    expect(whyPosted("l", null, null)).toContain("Nothing is traded");
  });

  test("are posted again when a stock comes or goes, or on a new day", function () {
    const today = listsSignature(LISTS, "2026-11-02");
    expect(listsSignature(LISTS, "2026-11-02")).toBe(today);
    expect(listsSignature(LISTS, "2026-11-03")).not.toBe(today);
    expect(listsSignature({ buy: [], sell: LISTS.buy }, "2026-11-02")).not.toBe(
      today,
    );
  });
});
