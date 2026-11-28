/**
 * Tests for the opponent: it never misses a mate in one, takes what is
 * left hanging at a fair level, stops on time, and leaves the position as
 * it found it.
 */

import { Position, START_FEN } from "./chess.ts";
import { choose, clampLevel, describeScore, evaluate } from "./search.ts";

const fixed = () => 0.5;

describe("choose", () => {
  test("finds a mate in one at every level", () => {
    const fen =
      "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 2 4";
    for (const level of [1, 3, 5]) {
      expect(choose(Position.fromFen(fen), level, 2000, fixed).san).toBe(
        "Qxf7#",
      );
    }
  });

  test("takes a queen left hanging", () => {
    const fen =
      "rnb1kbnr/pppp1ppp/8/4p3/3q4/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 3";
    expect(choose(Position.fromFen(fen), 3, 2000, fixed).san).toBe("Nxd4");
  });

  test("stops when its time is up and unwinds the position", () => {
    const fen =
      "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
    const pos = Position.fromFen(fen);
    let t = 0;
    // A clock that runs out after the first few checks.
    const clock = () => (t += 50);
    const c = choose(pos, 5, 200, fixed, clock);
    expect(pos.fen()).toBe(fen);
    expect(pos.plies).toBe(0);
    expect(c.depth).toBeLessThan(5);
    expect(c.line.length).toBeGreaterThan(0);
  });

  test("answers its line in SAN, starting with its move", () => {
    const c = choose(Position.fromFen(START_FEN), 4, 5000, fixed);
    expect(c.line[0]).toBe(c.san);
    expect(c.depth).toBe(3);
  });
});

describe("scores", () => {
  test("the start is about even, and levels are clamped", () => {
    expect(Math.abs(evaluate(Position.fromFen(START_FEN)))).toBeLessThan(20);
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(9)).toBe(5);
    expect(clampLevel(Number.NaN)).toBe(2);
  });

  test("reads as pawns or as a mate", () => {
    expect(describeScore(40)).toBe("+0.4");
    expect(describeScore(-120)).toBe("-1.2");
    expect(describeScore(100_000 - 1)).toBe("mate in 1");
    expect(describeScore(-(100_000 - 2))).toBe("mated in 1");
  });
});
