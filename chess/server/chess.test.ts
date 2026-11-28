/**
 * Tests for the rules: the move generator against the standard perft
 * counts, SAN out and in, FEN, and how games end.
 */

import {
  Position,
  START_FEN,
  ending,
  moveList,
  parseMove,
  perft,
  replay,
  san,
  uci,
} from "./chess.ts";

const KIWIPETE =
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";

function sanOf(fen: string, move: string): string {
  const pos = Position.fromFen(fen);
  const legal = pos.legalMoves();
  const m = legal.find((x) => uci(x) === move);
  if (!m) throw new Error(`no ${move}`);
  return san(pos, m, legal);
}

function parsed(fen: string, input: string): string | null {
  const m = parseMove(Position.fromFen(fen), input);
  return m ? uci(m) : null;
}

describe("move generation", () => {
  test("matches perft from the start", () => {
    expect(perft(Position.fromFen(START_FEN), 3)).toBe(8902);
  });

  test("matches perft with castling, en passant and promotions", () => {
    expect(perft(Position.fromFen(KIWIPETE), 2)).toBe(2039);
    expect(
      perft(Position.fromFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1"), 3),
    ).toBe(2812);
    expect(
      perft(
        Position.fromFen(
          "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
        ),
        2,
      ),
    ).toBe(264);
  });

  test("make and unmake leave the position as it was", () => {
    const pos = Position.fromFen(KIWIPETE);
    for (const m of pos.legalMoves()) {
      pos.make(m);
      pos.unmake();
    }
    expect(pos.fen()).toBe(KIWIPETE);
    expect(pos.plies).toBe(0);
  });

  test("FEN round-trips and refuses what is not one", () => {
    expect(Position.fromFen(START_FEN).fen()).toBe(START_FEN);
    expect(() => Position.fromFen("8/8/8 w - -")).toThrow("8 ranks");
    expect(() => Position.fromFen("8/8/8/8/8/8/8/8 w - - 0 1")).toThrow("king");
  });
});

describe("SAN", () => {
  test("writes pieces, captures, castling and promotion", () => {
    expect(sanOf(START_FEN, "g1f3")).toBe("Nf3");
    expect(sanOf(KIWIPETE, "e1g1")).toBe("O-O");
    expect(sanOf(KIWIPETE, "e1c1")).toBe("O-O-O");
    expect(sanOf(KIWIPETE, "e2a6")).toBe("Bxa6");
    expect(sanOf("8/P7/8/8/8/8/8/k6K w - - 0 1", "a7a8q")).toBe("a8=Q+");
  });

  test("tells two pieces apart by file, then rank", () => {
    const knights = "4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1";
    expect(sanOf(knights, "b1d2")).toBe("Nbd2");
    const rooks = "4k3/8/R7/8/8/8/R7/4K3 w - - 0 1";
    expect(sanOf(rooks, "a6a4")).toBe("R6a4");
  });

  test("marks check and mate", () => {
    const scholar =
      "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 2 4";
    expect(sanOf(scholar, "h5f7")).toBe("Qxf7#");
    expect(sanOf("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "a1a8")).toBe("Ra8+");
  });

  test("reads what a person types", () => {
    expect(parsed(START_FEN, "Nf3")).toBe("g1f3");
    expect(parsed(START_FEN, "nf3")).toBe("g1f3");
    expect(parsed(START_FEN, "E4")).toBe("e2e4");
    expect(parsed(START_FEN, "e2-e4")).toBe("e2e4");
    expect(parsed(START_FEN, " e4!? ")).toBe("e2e4");
    expect(parsed(KIWIPETE, "0-0")).toBe("e1g1");
    expect(parsed(KIWIPETE, "o-o-o")).toBe("e1c1");
    expect(parsed("8/P7/8/8/8/8/8/k6K w - - 0 1", "a8=N")).toBe("a7a8n");
    expect(parsed("8/P7/8/8/8/8/8/k6K w - - 0 1", "a7a8")).toBe("a7a8q");
  });

  test("a capital B is a bishop, a small b a pawn", () => {
    const both = "4k3/8/8/8/8/2p5/1P1B4/4K3 w - - 0 1";
    expect(parsed(both, "Bxc3")).toBe("d2c3");
    expect(parsed(both, "bxc3")).toBe("b2c3");
  });

  test("refuses moves that are not legal or not one move", () => {
    expect(parsed(START_FEN, "Nf6")).toBeNull();
    expect(parsed(START_FEN, "e5")).toBeNull();
    expect(parsed(START_FEN, "hello")).toBeNull();
    expect(parsed(START_FEN, "")).toBeNull();
    expect(parsed("4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1", "Nd2")).toBeNull();
  });
});

describe("games", () => {
  test("replays stored moves and refuses an illegal one", () => {
    const r = replay(["e2e4", "e7e5", "g1f3"]);
    expect(r.sans).toEqual(["e4", "e5", "Nf3"]);
    expect(moveList(r.sans)).toBe("1. e4 e5 2. Nf3");
    expect(moveList(r.sans, 1)).toBe("1… e5 2. Nf3");
    expect(() => replay(["e2e5"])).toThrow("Not a legal move");
  });

  test("ends in mate, stalemate, repetition and bare kings", () => {
    expect(ending(replay(["f2f3", "e7e5", "g2g4", "d8h4"]))).toBe("checkmate");
    expect(ending(replay([], "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"))).toBe(
      "stalemate",
    );
    const shuffle = ["g1f3", "g8f6", "f3g1", "f6g8"];
    expect(ending(replay(shuffle.concat(shuffle)))).toBe("repetition");
    expect(ending(replay([], "8/8/8/4k3/8/8/8/4KB2 w - - 0 1"))).toBe(
      "material",
    );
    expect(ending(replay(["e2e4"]))).toBeNull();
  });
});
