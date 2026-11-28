/**
 * Tests for games and their cards: what is posted when, what each answer
 * does, answers on a card the game has moved past, and the page keeping the
 * inbox quiet.
 */

import { Position, uci } from "./chess.ts";
import {
  ACCEPT_DRAW,
  OFFER_DRAW,
  PAGE_QUIET_MS,
  PLAY,
  REMATCH,
  REPOST_MS,
  RESIGN,
  agentMove,
  contextOf,
  drawOffered,
  gameOfCard,
  isGameId,
  latestAnswers,
  newGame,
  newGameId,
  nextLevel,
  onAnswer,
  outcomeOf,
  personMove,
  readNewGame,
  resultText,
  settle,
  view,
  type Game,
} from "./games.ts";
import { choose } from "./search.ts";

const T0 = Date.UTC(2026, 10, 28, 12);
const NOW = new Date(T0).toISOString();
const ID = "gmid4xk1a0b2";

function game(you: "w" | "b" = "w"): Game {
  return newGame(ID, you, 2, NOW);
}

/** The agent's reply, chosen without noise. */
function reply(g: Game): void {
  const r = view(g);
  agentMove(
    g,
    choose(r.pos, 3, 2000, () => 0.5),
    NOW,
  );
}

function answer(externalId: string, optionId: string, instruction?: string) {
  return { type: "decided", externalId, optionId, instruction, revision: 1 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCard = any;

describe("ids", () => {
  test("a game id is recognised and found in a card's externalId", () => {
    const id = newGameId(T0, 0.25);
    expect(isGameId(id)).toBe(true);
    expect(gameOfCard(`chess-${id}-3`)).toBe(id);
    expect(gameOfCard("chess-welcome")).toBeNull();
    expect(gameOfCard("chess-../x-1")).toBeNull();
  });

  test("reads a new game's side and level", () => {
    expect(readNewGame("Black please, level 4", 0.1)).toEqual({
      you: "b",
      level: 4,
    });
    expect(readNewGame("white", 0.9)).toEqual({ you: "w" });
    expect(readNewGame("", 0.9)).toEqual({ you: "b" });
  });
});

describe("cards", () => {
  test("a new game as White posts a move card bound to the position", () => {
    const g = game();
    const out = settle(g, T0);
    expect(out.post).toHaveLength(1);
    const card: AnyCard = out.post[0];
    expect(card.externalId).toBe(`chess-${ID}-1`);
    expect(card.topic).toBe(`chess-${ID}`);
    expect(card.title).toBe("Your move: the game starts");
    expect(card.boundTo.value).toBe("Move 1, White to play");
    expect(card.options.map((o: AnyCard) => o.id)).toEqual([PLAY, RESIGN]);
    expect(card.options[0].weight).toBe("instruction");
    expect(card.options[1].weight).toBe("consequential");
    expect(card.body.text).toContain("/chess/board.svg?p=rnbqkbnr/");
    // Nothing more until something changes.
    expect(settle(g, T0 + 60_000).post).toHaveLength(0);
  });

  test("as Black, nothing is posted until the agent has moved", () => {
    const g = game("b");
    expect(settle(g, T0).post).toHaveLength(0);
    reply(g);
    const card: AnyCard = settle(g, T0).post[0];
    expect(card.title).toMatch(/^Your move after 1\. /);
    // Not a numbered list in the body's Markdown.
    expect(card.body.text).toMatch(/\n\n1\\\. /);
    expect(card.body.text).toContain("f=1");
  });

  test("an old card is posted again before the inbox expires it", () => {
    const g = game();
    settle(g, T0);
    const again = settle(g, T0 + REPOST_MS + 1);
    expect(again.post).toHaveLength(1);
    expect((again.post[0] as AnyCard).externalId).toBe(`chess-${ID}-1`);
  });
});

describe("answers", () => {
  test("Play with a move plays it; the next card follows the reply", () => {
    const g = game();
    settle(g, T0);
    onAnswer(g, answer(`chess-${ID}-1`, PLAY, "e4"), NOW);
    expect(g.moves).toEqual(["e2e4"]);
    expect(g.card).toBeNull();
    reply(g);
    const out = settle(g, T0);
    expect((out.post[0] as AnyCard).externalId).toBe(`chess-${ID}-2`);
  });

  test("an illegal or missing move is said on a fresh card", () => {
    const g = game();
    settle(g, T0);
    onAnswer(g, answer(`chess-${ID}-1`, PLAY, "Ke2"), NOW);
    expect(g.moves).toEqual([]);
    const card: AnyCard = settle(g, T0).post[0];
    expect(card.externalId).toBe(`chess-${ID}-2`);
    expect(card.summary).toContain("“Ke2” is not a legal move here.");
    onAnswer(g, answer(`chess-${ID}-2`, PLAY, ""), NOW);
    expect((settle(g, T0).post[0] as AnyCard).summary).toContain(
      "Type your move",
    );
  });

  test("an answer on a card the game has moved past changes nothing", () => {
    const g = game();
    settle(g, T0);
    onAnswer(g, answer(`chess-${ID}-1`, PLAY, "e4"), NOW);
    onAnswer(g, answer(`chess-${ID}-1`, PLAY, "d4"), NOW);
    expect(g.moves).toEqual(["e2e4"]);
  });

  test("a corrected answer counts as the person left it", () => {
    const events = [
      answer("chess-gmid4xk1a0b2-1", PLAY, "e4"),
      {
        type: "changed",
        externalId: "chess-gmid4xk1a0b2-1",
        optionId: PLAY,
        instruction: "d4",
        revision: 2,
      },
      answer("chess-gmid4xk1a0b2-9", PLAY, "c4"),
      { type: "cleared", externalId: "chess-gmid4xk1a0b2-9", revision: 2 },
    ];
    const kept = latestAnswers(events);
    expect(kept).toHaveLength(1);
    expect(kept[0].instruction).toBe("d4");
  });

  test("Resign ends the game and posts the result", () => {
    const g = game();
    settle(g, T0);
    onAnswer(g, answer(`chess-${ID}-1`, RESIGN), NOW);
    expect(g.result).toBe("0-1");
    expect(outcomeOf(g)).toBe("lost");
    const card: AnyCard = settle(g, T0).post[0];
    expect(card.title).toBe("You resigned");
    expect(card.options.map((o: AnyCard) => o.id)).toEqual([REMATCH, "done"]);
  });

  test("Play again asks for a rematch and closes the game", () => {
    const g = game();
    settle(g, T0);
    onAnswer(g, answer(`chess-${ID}-1`, RESIGN), NOW);
    settle(g, T0);
    const out = onAnswer(g, answer(`chess-${ID}-2`, REMATCH), NOW);
    expect(out.rematch).toBe(true);
    expect(g.closed).toBe(true);
    expect(settle(g, T0).post).toHaveLength(0);
  });

  test("an expired card is posted again as a new one", () => {
    const g = game();
    settle(g, T0);
    onAnswer(g, { type: "expired", externalId: `chess-${ID}-1` }, NOW);
    expect((settle(g, T0).post[0] as AnyCard).externalId).toBe(`chess-${ID}-2`);
  });
});

describe("draws", () => {
  /** A game `plies` long that never repeats a position or ends. */
  function played(plies: number): Game {
    const g = game();
    while (g.moves.length < plies) {
      const r = view(g);
      const next = r.pos.legalMoves().find((m) => {
        r.pos.make(m);
        const fresh = !r.seen.has(r.pos.key()) && r.pos.legalMoves().length > 0;
        r.pos.unmake();
        return fresh && !m.captured;
      });
      if (!next) throw new Error("no quiet move");
      g.moves.push(uci(next));
    }
    return g;
  }

  test("the agent offers a draw in a level position, and it can be taken", () => {
    const g = played(39);
    const r = view(g);
    const move = r.pos.legalMoves().find((m) => !m.captured);
    if (!move) throw new Error("no move");
    agentMove(
      g,
      { move, san: "x", score: 0, depth: 2, line: [], nodes: 0 },
      NOW,
    );
    expect(g.result).toBeNull();
    expect(drawOffered(g)).toBe(true);
    const card: AnyCard = settle(g, T0).post[0];
    expect(card.title).toMatch(/^The agent offers a draw/);
    expect(card.options.map((o: AnyCard) => o.id)).toContain(ACCEPT_DRAW);
    onAnswer(g, answer(card.externalId, ACCEPT_DRAW), NOW);
    expect(g.result).toBe("1/2-1/2");
    expect(resultText(g)).toBe("Drawn by agreement");
  });

  test("playing on declines the agent's offer", () => {
    const g = played(39);
    const move = view(g).pos.legalMoves()[0];
    agentMove(
      g,
      { move, san: "x", score: 0, depth: 2, line: [], nodes: 0 },
      NOW,
    );
    expect(drawOffered(g)).toBe(true);
    const mine = view(g).pos.legalMoves()[0];
    personMove(g, uci(mine), NOW);
    expect(drawOffered(g)).toBe(false);
  });

  test("a draw the person offers is declined while the agent stands better", () => {
    const g = played(20);
    g.agent = { san: "x", score: 150, depth: 2, line: [] };
    settle(g, T0);
    const card: AnyCard = settle(game(), T0).post[0];
    expect(card.options.map((o: AnyCard) => o.id)).not.toContain(OFFER_DRAW);
    onAnswer(g, answer(g.card?.externalId ?? "", OFFER_DRAW), NOW);
    expect(g.result).toBeNull();
    expect(g.note).toContain("declines");
  });

  test("and taken when it does not", () => {
    const g = played(20);
    g.agent = { san: "x", score: -30, depth: 2, line: [] };
    settle(g, T0);
    onAnswer(g, answer(g.card?.externalId ?? "", OFFER_DRAW), NOW);
    expect(g.result).toBe("1/2-1/2");
  });
});

describe("the page and the inbox", () => {
  test("a move on the page withdraws the stale card and keeps the inbox quiet", () => {
    const g = game();
    settle(g, T0);
    personMove(g, "e4", NOW);
    g.pageAt = NOW;
    reply(g);
    const out = settle(g, T0 + 1000);
    expect(out.withdraw).toEqual([`chess-${ID}-1`]);
    expect(out.post).toHaveLength(0);
    const later = settle(g, T0 + PAGE_QUIET_MS + 1);
    expect(later.post).toHaveLength(1);
  });

  test("a game won in the inbox posts the result; one won on the page does not", () => {
    for (const onPage of [false, true]) {
      const g = game("b");
      g.moves.push("f2f3");
      personMove(g, "e5", NOW);
      g.moves.push("g2g4");
      if (onPage) g.pageAt = NOW;
      personMove(g, "Qh4#", NOW);
      expect(g.result).toBe("0-1");
      expect(outcomeOf(g)).toBe("won");
      const out = settle(g, T0);
      if (onPage) {
        expect(out.post).toHaveLength(0);
        expect(g.closed).toBe(true);
      } else {
        expect((out.post[0] as AnyCard).title).toBe("You won by checkmate");
      }
    }
  });

  test("the level follows the results", () => {
    expect(nextLevel(2, "won")).toBe(3);
    expect(nextLevel(5, "won")).toBe(5);
    expect(nextLevel(1, "lost")).toBe(1);
    expect(nextLevel(3, "drawn")).toBe(3);
  });

  test("the context for Ask holds the game, the position and the legal moves", () => {
    const g = game();
    personMove(g, "e4", NOW);
    reply(g);
    const ctx = contextOf(g, view(g), NOW) as AnyCard;
    expect(ctx.why).toMatch(/^The agent played /);
    expect(ctx.documents[0].text).toContain("1. e4");
    expect(ctx.documents[1].text).toBe(view(g).pos.fen());
    expect(ctx.documents[2].text.split(" ").length).toBeGreaterThan(10);
    expect(Position.fromFen(ctx.documents[1].text).turn).toBe(0);
  });
});
