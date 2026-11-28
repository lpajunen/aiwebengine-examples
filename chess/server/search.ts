// The opponent: an evaluation and a small alpha-beta search with a time
// budget. Its strength is a level from 1 to 5, set by how deep it looks, by
// whether it looks past captures, and by how much noise is added to its
// choice at the root, so a weak level makes the mistakes of a weak player
// rather than playing randomly.
//
// Moves come from the rules in chess.ts, never from a model: a model plays
// illegal moves and blunders unevenly.

import {
  BISHOP,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
  colorOf,
  fileOf,
  rankOf,
  san,
  typeOf,
  uci,
  type Move,
  type Position,
} from "./chess.ts";

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

interface Strength {
  depth: number;
  quiescence: boolean;
  /** Centipawns of noise added to each root move's score. */
  noise: number;
}

const STRENGTHS: Record<number, Strength> = {
  1: { depth: 1, quiescence: false, noise: 250 },
  2: { depth: 2, quiescence: true, noise: 120 },
  3: { depth: 2, quiescence: true, noise: 40 },
  4: { depth: 3, quiescence: true, noise: 15 },
  5: { depth: 5, quiescence: true, noise: 0 },
};

export const VALUE = [0, 100, 320, 330, 500, 900, 0];
const MATE = 100_000;
/** Non-pawn material below which the kings come out. */
const ENDGAME = 1300;

/** The bonus for a piece type on a square, from White's side (0x88). */
const TABLES: number[][] = [];

function centre(square: number): number {
  const f = fileOf(square);
  const r = rankOf(square);
  return Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5)) - 0.5; // 0 to 3
}

function buildTables(): void {
  for (let type = 0; type <= KING + 1; type++)
    TABLES.push(new Array(128).fill(0));
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) continue;
    const f = fileOf(s);
    const r = rankOf(s);
    const c = centre(s);
    TABLES[PAWN][s] =
      [0, 0, 4, 10, 22, 40, 70, 0][r] +
      (f === 3 || f === 4 ? [0, 0, 5, 15, 20, 10, 0, 0][r] : 0) -
      (r === 1 && (f === 3 || f === 4) ? 10 : 0);
    TABLES[KNIGHT][s] = 20 - c * 12 - (r === 0 ? 10 : 0);
    TABLES[BISHOP][s] = 10 - c * 5 - (r === 0 ? 8 : 0);
    TABLES[ROOK][s] = r === 6 ? 15 : f === 3 || f === 4 ? 5 : 0;
    TABLES[QUEEN][s] = 5 - c * 3;
    // Middlegame king: at home, tucked to a side.
    TABLES[KING][s] = r === 0 ? (f <= 2 || f >= 6 ? 20 : 0) : -15 * r;
    // Endgame king (KING + 1): to the centre.
    TABLES[KING + 1][s] = 30 - c * 15;
  }
}
buildTables();

function mirror(square: number): number {
  return (7 - rankOf(square)) * 16 + fileOf(square);
}

/** The position's score in centipawns, for the side to move. */
export function evaluate(pos: Position): number {
  const b = pos.board;
  let score = 0;
  let heavy = 0;
  let bishops0 = 0;
  let bishops1 = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) {
      s += 7;
      continue;
    }
    const piece = b[s];
    if (!piece) continue;
    const type = typeOf(piece);
    if (type !== PAWN && type !== KING) heavy += VALUE[type];
    if (type === BISHOP) {
      if (colorOf(piece) === WHITE) bishops0++;
      else bishops1++;
    }
  }
  const endgame = heavy < ENDGAME * 2;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) {
      s += 7;
      continue;
    }
    const piece = b[s];
    if (!piece) continue;
    const type = typeOf(piece);
    const white = colorOf(piece) === WHITE;
    const table = TABLES[type === KING && endgame ? KING + 1 : type];
    const v = VALUE[type] + table[white ? s : mirror(s)];
    score += white ? v : -v;
  }
  if (bishops0 >= 2) score += 30;
  if (bishops1 >= 2) score -= 30;
  return pos.turn === WHITE ? score : -score;
}

class Timeout extends Error {}

/** Captures first, the biggest victim by the smallest attacker. */
function order(moves: Move[], first: string | null): Move[] {
  const rank = (m: Move) =>
    (first !== null && uci(m) === first ? 100_000 : 0) +
    (m.captured
      ? 10 * VALUE[typeOf(m.captured)] - VALUE[typeOf(m.piece)] + 1000
      : 0) +
    (m.promo ? VALUE[m.promo] : 0);
  return moves
    .map((m) => ({ m, r: rank(m) }))
    .sort((a, b) => b.r - a.r)
    .map((x) => x.m);
}

interface Searcher {
  pos: Position;
  deadline: number;
  nodes: number;
  quiescence: boolean;
  now: () => number;
  /** The principal variation found at each ply, in UCI. */
  pv: string[][];
}

function tick(s: Searcher): void {
  s.nodes++;
  if ((s.nodes & 511) === 0 && s.now() > s.deadline) throw new Timeout();
}

function quiesce(
  s: Searcher,
  alpha: number,
  beta: number,
  ply: number,
): number {
  tick(s);
  const stand = evaluate(s.pos);
  if (!s.quiescence || ply > 12) return stand;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  for (const move of order(s.pos.pseudoMoves(true), null)) {
    s.pos.make(move);
    if (s.pos.leftInCheck()) {
      s.pos.unmake();
      continue;
    }
    const score = -quiesce(s, -beta, -alpha, ply + 1);
    s.pos.unmake();
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(
  s: Searcher,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  first: string | null,
): number {
  s.pv[ply] = [];
  if (depth <= 0) return quiesce(s, alpha, beta, ply);
  tick(s);
  let legal = 0;
  let best = -MATE;
  for (const move of order(s.pos.pseudoMoves(), first)) {
    s.pos.make(move);
    if (s.pos.leftInCheck()) {
      s.pos.unmake();
      continue;
    }
    legal++;
    const score = -negamax(s, depth - 1, -beta, -alpha, ply + 1, null);
    s.pos.unmake();
    if (score > best) best = score;
    if (score > alpha) {
      alpha = score;
      s.pv[ply] = [uci(move), ...(s.pv[ply + 1] ?? [])];
    }
    if (alpha >= beta) break;
  }
  if (legal === 0) return s.pos.inCheck() ? -MATE + ply : 0;
  return best;
}

/** After a move: MATE - 1 when it mates, 0 when it stalemates, else null. */
function endsGame(pos: Position): number | null {
  if (pos.legalMoves().length > 0) return null;
  return pos.inCheck() ? MATE - 1 : 0;
}

export interface Choice {
  move: Move;
  /** In SAN, for the card. */
  san: string;
  /** Centipawns for the side that moved, as the search saw it. */
  score: number;
  /** How many moves deep the last finished search looked. */
  depth: number;
  /** The line it expects, in SAN, starting with its move. */
  line: string[];
  nodes: number;
}

/**
 * Chooses a move for the side to move. Searches deeper while the budget
 * lasts (up to the level's depth); `random` is for the noise, so tests can
 * fix it. Throws when there is no legal move.
 */
export function choose(
  pos: Position,
  level: number,
  budgetMs: number,
  random: () => number = Math.random,
  now: () => number = Date.now,
): Choice {
  const strength = STRENGTHS[clampLevel(level)];
  const legal = pos.legalMoves();
  if (legal.length === 0) throw new Error("No legal move");
  const s: Searcher = {
    pos,
    deadline: now() + budgetMs,
    nodes: 0,
    quiescence: strength.quiescence,
    now,
    pv: [],
  };
  // Root scores from the deepest search that finished.
  let scores: { move: Move; score: number; line: string[] }[] = legal.map(
    (m) => ({
      move: m,
      score: 0,
      line: [uci(m)],
    }),
  );
  let depth = 0;
  let first: string | null = null;
  const rootPlies = pos.plies;
  for (let d = 1; d <= strength.depth; d++) {
    try {
      const next: typeof scores = [];
      for (const move of order(legal, first)) {
        pos.make(move);
        // A full window at the root: every move needs a true score for the
        // noise to choose among. A move that ends the game is scored as
        // such at every level, so even the weakest sees a mate in one.
        const ended = endsGame(pos);
        const score = ended ?? -negamax(s, d - 1, -MATE - 1, MATE + 1, 1, null);
        pos.unmake();
        next.push({ move, score, line: [uci(move), ...(s.pv[1] ?? [])] });
      }
      scores = next;
      depth = d;
      first = uci(scores.reduce((a, b) => (b.score > a.score ? b : a)).move);
    } catch (e) {
      if (!(e instanceof Timeout)) throw e;
      // Takes back whatever the interrupted search left made.
      while (pos.plies > rootPlies) pos.unmake();
      break;
    }
  }
  const noisy = scores.map((x) => ({
    ...x,
    pick: x.score + (strength.noise ? (random() * 2 - 1) * strength.noise : 0),
  }));
  // A mate is never missed for noise, nor walked into.
  for (const x of noisy) {
    if (Math.abs(x.score) > MATE / 2) x.pick = x.score;
  }
  const best = noisy.reduce((a, b) => (b.pick > a.pick ? b : a));
  return {
    move: best.move,
    san: san(pos, best.move, legal),
    score: best.score,
    depth,
    line: sanLine(pos, best.line),
    nodes: s.nodes,
  };
}

/** A line of UCI moves from this position, in SAN; stops at one that is not legal. */
export function sanLine(pos: Position, line: string[]): string[] {
  const out: string[] = [];
  let made = 0;
  for (const text of line) {
    const legal = pos.legalMoves();
    const move = legal.find((m) => uci(m) === text);
    if (!move) break;
    out.push(san(pos, move, legal));
    pos.make(move);
    made++;
  }
  for (; made > 0; made--) pos.unmake();
  return out;
}

export function clampLevel(level: number): number {
  const n = Math.round(Number(level));
  if (!Number.isFinite(n)) return 2;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, n));
}

/** Whether a score means a forced mate. */
export function isMate(score: number): boolean {
  return Math.abs(score) > MATE / 2;
}

/** A score as a person reads it, from the agent's side: "+0.4", "mate in 3". */
export function describeScore(score: number): string {
  if (isMate(score)) {
    const plies = MATE - Math.abs(score);
    const moves = Math.ceil(plies / 2);
    return score > 0 ? `mate in ${moves}` : `mated in ${moves}`;
  }
  const pawns = score / 100;
  return (pawns >= 0 ? "+" : "") + pawns.toFixed(1);
}
