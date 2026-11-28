/** Tests for the board picture and its path. */

import { boardPath, boardSvg, squares } from "./board.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

describe("the board", () => {
  test("reads a placement into 64 squares from a8", () => {
    const s = squares(START);
    expect(s).toHaveLength(64);
    expect(s?.[0]).toBe("r");
    expect(s?.[63]).toBe("R");
    expect(squares("8/8/8")).toBeNull();
    expect(squares("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNX")).toBeNull();
  });

  test("draws 32 pieces, the last move and a check", () => {
    const svg = boardSvg({ placement: START, last: "e2e4", check: "e1" }) ?? "";
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.match(/<g transform/g)).toHaveLength(32);
    expect(svg).toContain("<circle");
    expect(boardSvg({ placement: "<script>" })).toBeNull();
  });

  test("its path carries only what it shows", () => {
    expect(
      boardPath("/chess/board.svg", {
        placement: START,
        last: "e2e4",
        flip: true,
      }),
    ).toBe(`/chess/board.svg?p=${START}&l=e2e4&f=1`);
  });
});
