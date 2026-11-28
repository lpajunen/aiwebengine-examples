// The rules of chess: a position, its legal moves, moves written in SAN and
// UCI, FEN, and how a game ends. No storage and no engine globals, so it can
// be tested on its own.
//
// The board is 0x88: a square is `rank * 16 + file`, rank 0 is White's first
// rank, and `square & 0x88` is non-zero off the board. A piece is its type
// (PAWN … KING) with BLACK_BIT set for Black; 0 is an empty square.

export const WHITE = 0;
export const BLACK = 1;
export type Color = 0 | 1;

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;
export const BLACK_BIT = 8;

export const FLAG_CAPTURE = 1;
export const FLAG_EN_PASSANT = 2;
export const FLAG_CASTLE = 4;
export const FLAG_DOUBLE = 8;

const CASTLE_WK = 1;
const CASTLE_WQ = 2;
const CASTLE_BK = 4;
const CASTLE_BQ = 8;

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const KNIGHT_STEPS = [33, 31, 18, 14, -33, -31, -18, -14];
const BISHOP_STEPS = [15, 17, -15, -17];
const ROOK_STEPS = [1, -1, 16, -16];
const KING_STEPS = [1, -1, 16, -16, 15, 17, -15, -17];

const LETTERS = " pnbrqk";

export interface Move {
  from: number;
  to: number;
  /** The piece that moves, with its color. */
  piece: number;
  /** The piece taken, with its color; 0 for none. */
  captured: number;
  /** The piece type a pawn becomes; 0 for none. */
  promo: number;
  flags: number;
}

interface Undo {
  move: Move;
  castling: number;
  ep: number;
  halfmove: number;
}

export function colorOf(piece: number): Color {
  return piece & BLACK_BIT ? BLACK : WHITE;
}

export function typeOf(piece: number): number {
  return piece & 7;
}

export function fileOf(square: number): number {
  return square & 7;
}

export function rankOf(square: number): number {
  return square >> 4;
}

export function squareName(square: number): string {
  return "abcdefgh"[fileOf(square)] + String(rankOf(square) + 1);
}

/** The 0x88 square a name such as "e4" means, or -1. */
export function squareOf(name: string): number {
  if (!/^[a-h][1-8]$/.test(name)) return -1;
  return (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);
}

/** The square's index 0–63 from a8, as a picture is drawn. */
export function index64(square: number): number {
  return (7 - rankOf(square)) * 8 + fileOf(square);
}

export class Position {
  board = new Int8Array(128);
  turn: Color = WHITE;
  castling = 0;
  /** The square a pawn may take en passant on, or -1. */
  ep = -1;
  halfmove = 0;
  fullmove = 1;
  kings: [number, number] = [-1, -1];
  private undos: Undo[] = [];

  /** How many moves `make` has played that `unmake` has not taken back. */
  get plies(): number {
    return this.undos.length;
  }

  static fromFen(fen: string): Position {
    const p = new Position();
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) throw new Error("Not a FEN: too few fields");
    const rows = parts[0].split("/");
    if (rows.length !== 8) throw new Error("Not a FEN: needs 8 ranks");
    for (let r = 0; r < 8; r++) {
      let file = 0;
      for (const ch of rows[r]) {
        if (/[1-8]/.test(ch)) {
          file += Number(ch);
          continue;
        }
        const type = LETTERS.indexOf(ch.toLowerCase());
        if (type < 1 || file > 7) throw new Error(`Not a FEN: "${ch}"`);
        const square = (7 - r) * 16 + file;
        const piece = type | (ch === ch.toLowerCase() ? BLACK_BIT : 0);
        p.board[square] = piece;
        if (type === KING) p.kings[colorOf(piece)] = square;
        file++;
      }
      if (file !== 8) throw new Error("Not a FEN: a rank is not 8 squares");
    }
    if (p.kings[0] < 0 || p.kings[1] < 0) {
      throw new Error("Not a FEN: each side needs a king");
    }
    if (parts[1] !== "w" && parts[1] !== "b") {
      throw new Error("Not a FEN: side to move");
    }
    p.turn = parts[1] === "w" ? WHITE : BLACK;
    if (parts[2] !== "-") {
      for (const ch of parts[2]) {
        const bit = "KQkq".indexOf(ch);
        if (bit < 0) throw new Error("Not a FEN: castling");
        p.castling |= 1 << bit;
      }
    }
    p.ep = parts[3] === "-" ? -1 : squareOf(parts[3]);
    p.halfmove = Number(parts[4] ?? 0) || 0;
    p.fullmove = Number(parts[5] ?? 1) || 1;
    return p;
  }

  /** The placement field of the FEN: what a picture of the board needs. */
  placement(): string {
    let out = "";
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const piece = this.board[r * 16 + f];
        if (!piece) {
          empty++;
          continue;
        }
        if (empty) out += String(empty);
        empty = 0;
        const letter = LETTERS[typeOf(piece)];
        out += colorOf(piece) === WHITE ? letter.toUpperCase() : letter;
      }
      if (empty) out += String(empty);
      if (r > 0) out += "/";
    }
    return out;
  }

  fen(): string {
    let castle = "";
    if (this.castling & CASTLE_WK) castle += "K";
    if (this.castling & CASTLE_WQ) castle += "Q";
    if (this.castling & CASTLE_BK) castle += "k";
    if (this.castling & CASTLE_BQ) castle += "q";
    return [
      this.placement(),
      this.turn === WHITE ? "w" : "b",
      castle || "-",
      this.ep < 0 ? "-" : squareName(this.ep),
      String(this.halfmove),
      String(this.fullmove),
    ].join(" ");
  }

  /**
   * What makes two positions the same for repetition: the placement, the
   * side to move, castling, and an en passant square only when a pawn can
   * take on it.
   */
  key(): string {
    const fen = this.fen().split(" ");
    let ep = "-";
    if (this.ep >= 0) {
      const pawn = PAWN | (this.turn === BLACK ? BLACK_BIT : 0);
      const back = this.turn === WHITE ? -16 : 16;
      for (const side of [-1, 1]) {
        const from = this.ep + back + side;
        if (!(from & 0x88) && this.board[from] === pawn) ep = fen[3];
      }
    }
    return `${fen[0]} ${fen[1]} ${fen[2]} ${ep}`;
  }

  /** Whether `by` attacks `square`. */
  attacked(square: number, by: Color): boolean {
    const b = this.board;
    const side = by === BLACK ? BLACK_BIT : 0;
    // A pawn attacks diagonally forward, so look backward from the square.
    const pawn = PAWN | side;
    const back = by === WHITE ? -16 : 16;
    for (const s of [back - 1, back + 1]) {
      const from = square + s;
      if (!(from & 0x88) && b[from] === pawn) return true;
    }
    for (const s of KNIGHT_STEPS) {
      const from = square + s;
      if (!(from & 0x88) && b[from] === (KNIGHT | side)) return true;
    }
    for (const s of KING_STEPS) {
      const from = square + s;
      if (!(from & 0x88) && b[from] === (KING | side)) return true;
    }
    for (const s of BISHOP_STEPS) {
      for (let from = square + s; !(from & 0x88); from += s) {
        const piece = b[from];
        if (!piece) continue;
        if (
          colorOf(piece) === by &&
          (typeOf(piece) === BISHOP || typeOf(piece) === QUEEN)
        ) {
          return true;
        }
        break;
      }
    }
    for (const s of ROOK_STEPS) {
      for (let from = square + s; !(from & 0x88); from += s) {
        const piece = b[from];
        if (!piece) continue;
        if (
          colorOf(piece) === by &&
          (typeOf(piece) === ROOK || typeOf(piece) === QUEEN)
        ) {
          return true;
        }
        break;
      }
    }
    return false;
  }

  inCheck(color: Color = this.turn): boolean {
    return this.attacked(this.kings[color], (1 - color) as Color);
  }

  /**
   * Moves that follow the pieces' rules but may leave the king in check.
   * With `capturesOnly`, captures and queen promotions only.
   */
  pseudoMoves(capturesOnly = false): Move[] {
    const out: Move[] = [];
    const b = this.board;
    const us = this.turn;
    const them = (1 - us) as Color;
    for (let from = 0; from < 128; from++) {
      if (from & 0x88) {
        from += 7;
        continue;
      }
      const piece = b[from];
      if (!piece || colorOf(piece) !== us) continue;
      const type = typeOf(piece);
      if (type === PAWN) {
        this.pawnMoves(from, piece, capturesOnly, out);
        continue;
      }
      const steps =
        type === KNIGHT
          ? KNIGHT_STEPS
          : type === BISHOP
            ? BISHOP_STEPS
            : type === ROOK
              ? ROOK_STEPS
              : KING_STEPS;
      const slides = type === BISHOP || type === ROOK || type === QUEEN;
      for (const s of steps) {
        for (let to = from + s; !(to & 0x88); to += s) {
          const target = b[to];
          if (target) {
            if (colorOf(target) === them) {
              out.push({
                from,
                to,
                piece,
                captured: target,
                promo: 0,
                flags: FLAG_CAPTURE,
              });
            }
            break;
          }
          if (!capturesOnly) {
            out.push({ from, to, piece, captured: 0, promo: 0, flags: 0 });
          }
          if (!slides) break;
        }
      }
      if (type === KING && !capturesOnly) this.castles(from, piece, out);
    }
    return out;
  }

  private pawnMoves(
    from: number,
    piece: number,
    capturesOnly: boolean,
    out: Move[],
  ): void {
    const b = this.board;
    const us = colorOf(piece);
    const dir = us === WHITE ? 16 : -16;
    const startRank = us === WHITE ? 1 : 6;
    const lastRank = us === WHITE ? 7 : 0;
    const add = (to: number, captured: number, flags: number) => {
      if (rankOf(to) === lastRank) {
        const promos = capturesOnly ? [QUEEN] : [QUEEN, ROOK, BISHOP, KNIGHT];
        for (const promo of promos) {
          out.push({ from, to, piece, captured, promo, flags });
        }
      } else if (!capturesOnly || captured) {
        out.push({ from, to, piece, captured, promo: 0, flags });
      }
    };
    const one = from + dir;
    if (!(one & 0x88) && !b[one]) {
      if (!capturesOnly || rankOf(one) === lastRank) add(one, 0, 0);
      const two = one + dir;
      if (!capturesOnly && rankOf(from) === startRank && !b[two]) {
        out.push({
          from,
          to: two,
          piece,
          captured: 0,
          promo: 0,
          flags: FLAG_DOUBLE,
        });
      }
    }
    for (const side of [-1, 1]) {
      const to = one + side;
      if (to & 0x88) continue;
      const target = b[to];
      if (target && colorOf(target) !== us) {
        add(to, target, FLAG_CAPTURE);
      } else if (to === this.ep) {
        out.push({
          from,
          to,
          piece,
          captured: PAWN | (us === WHITE ? BLACK_BIT : 0),
          promo: 0,
          flags: FLAG_CAPTURE | FLAG_EN_PASSANT,
        });
      }
    }
  }

  private castles(from: number, piece: number, out: Move[]): void {
    const us = colorOf(piece);
    const them = (1 - us) as Color;
    const home = us === WHITE ? 4 : 0x74;
    if (from !== home || this.attacked(home, them)) return;
    const b = this.board;
    const kingSide = us === WHITE ? CASTLE_WK : CASTLE_BK;
    const queenSide = us === WHITE ? CASTLE_WQ : CASTLE_BQ;
    if (
      this.castling & kingSide &&
      !b[home + 1] &&
      !b[home + 2] &&
      !this.attacked(home + 1, them) &&
      !this.attacked(home + 2, them)
    ) {
      out.push({
        from,
        to: home + 2,
        piece,
        captured: 0,
        promo: 0,
        flags: FLAG_CASTLE,
      });
    }
    if (
      this.castling & queenSide &&
      !b[home - 1] &&
      !b[home - 2] &&
      !b[home - 3] &&
      !this.attacked(home - 1, them) &&
      !this.attacked(home - 2, them)
    ) {
      out.push({
        from,
        to: home - 2,
        piece,
        captured: 0,
        promo: 0,
        flags: FLAG_CASTLE,
      });
    }
  }

  /** Plays a move from `pseudoMoves`; `unmake` takes it back. */
  make(move: Move): void {
    const b = this.board;
    this.undos.push({
      move,
      castling: this.castling,
      ep: this.ep,
      halfmove: this.halfmove,
    });
    const us = colorOf(move.piece);
    b[move.from] = 0;
    if (move.flags & FLAG_EN_PASSANT) {
      b[move.to + (us === WHITE ? -16 : 16)] = 0;
    }
    b[move.to] = move.promo
      ? move.promo | (us === BLACK ? BLACK_BIT : 0)
      : move.piece;
    if (move.flags & FLAG_CASTLE) {
      const kingSide = move.to > move.from;
      const rookFrom = kingSide ? move.from + 3 : move.from - 4;
      const rookTo = kingSide ? move.from + 1 : move.from - 1;
      b[rookTo] = b[rookFrom];
      b[rookFrom] = 0;
    }
    if (typeOf(move.piece) === KING) this.kings[us] = move.to;
    this.castling &= rightsKept(move.from) & rightsKept(move.to);
    this.ep = move.flags & FLAG_DOUBLE ? (move.from + move.to) >> 1 : -1;
    this.halfmove =
      typeOf(move.piece) === PAWN || move.captured ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.turn = (1 - us) as Color;
  }

  unmake(): void {
    const undo = this.undos.pop();
    if (!undo) return;
    const { move } = undo;
    const b = this.board;
    const us = colorOf(move.piece);
    b[move.from] = move.piece;
    b[move.to] = 0;
    if (move.flags & FLAG_EN_PASSANT) {
      b[move.to + (us === WHITE ? -16 : 16)] = move.captured;
    } else {
      b[move.to] = move.captured;
    }
    if (move.flags & FLAG_CASTLE) {
      const kingSide = move.to > move.from;
      const rookFrom = kingSide ? move.from + 3 : move.from - 4;
      const rookTo = kingSide ? move.from + 1 : move.from - 1;
      b[rookFrom] = b[rookTo];
      b[rookTo] = 0;
    }
    if (typeOf(move.piece) === KING) this.kings[us] = move.from;
    this.castling = undo.castling;
    this.ep = undo.ep;
    this.halfmove = undo.halfmove;
    if (us === BLACK) this.fullmove--;
    this.turn = us;
  }

  /** Whether the side that just moved left its own king in check. */
  leftInCheck(): boolean {
    const moved = (1 - this.turn) as Color;
    return this.attacked(this.kings[moved], this.turn);
  }

  legalMoves(): Move[] {
    const out: Move[] = [];
    for (const move of this.pseudoMoves()) {
      this.make(move);
      if (!this.leftInCheck()) out.push(move);
      this.unmake();
    }
    return out;
  }

  /** Whether neither side can mate: kings alone, or with one minor piece. */
  insufficientMaterial(): boolean {
    let minors = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const type = typeOf(this.board[s]);
      if (!type || type === KING) continue;
      if (type === KNIGHT || type === BISHOP) minors++;
      else return false;
    }
    return minors <= 1;
  }
}

/** The castling rights a move from or to `square` leaves standing. */
function rightsKept(square: number): number {
  switch (square) {
    case 0:
      return ~CASTLE_WQ;
    case 7:
      return ~CASTLE_WK;
    case 4:
      return ~(CASTLE_WK | CASTLE_WQ);
    case 0x70:
      return ~CASTLE_BQ;
    case 0x77:
      return ~CASTLE_BK;
    case 0x74:
      return ~(CASTLE_BK | CASTLE_BQ);
    default:
      return ~0;
  }
}

/** A move in UCI, "e2e4" or "e7e8q". */
export function uci(move: Move): string {
  return (
    squareName(move.from) +
    squareName(move.to) +
    (move.promo ? LETTERS[move.promo] : "")
  );
}

/**
 * A legal move in SAN ("Nbd7", "exd5", "O-O", "e8=Q+"). `legal` is the
 * position's legal moves, for telling pieces apart.
 */
export function san(pos: Position, move: Move, legal: Move[]): string {
  let out: string;
  const type = typeOf(move.piece);
  if (move.flags & FLAG_CASTLE) {
    out = move.to > move.from ? "O-O" : "O-O-O";
  } else if (type === PAWN) {
    out = move.captured
      ? "abcdefgh"[fileOf(move.from)] + "x" + squareName(move.to)
      : squareName(move.to);
    if (move.promo) out += "=" + LETTERS[move.promo].toUpperCase();
  } else {
    const rivals = legal.filter(
      (m) => m.piece === move.piece && m.to === move.to && m.from !== move.from,
    );
    let which = "";
    if (rivals.length > 0) {
      const sameFile = rivals.some((m) => fileOf(m.from) === fileOf(move.from));
      const sameRank = rivals.some((m) => rankOf(m.from) === rankOf(move.from));
      if (!sameFile) which = squareName(move.from)[0];
      else if (!sameRank) which = squareName(move.from)[1];
      else which = squareName(move.from);
    }
    out =
      LETTERS[type].toUpperCase() +
      which +
      (move.captured ? "x" : "") +
      squareName(move.to);
  }
  pos.make(move);
  if (pos.inCheck()) {
    out += pos.legalMoves().length === 0 ? "#" : "+";
  }
  pos.unmake();
  return out;
}

/** SAN with its check mark and promotion sign dropped, for matching input. */
function bare(text: string): string {
  return text.replace(/[+#]/g, "").replace("=", "");
}

/**
 * The legal move a person's input means: SAN ("Nf3", "exd5", "O-O",
 * "e8=Q"), or UCI ("e2e4", "e2-e4", "e7e8q"). Check marks, annotations and
 * a capital first letter typed by a phone are allowed. Null when it is not
 * exactly one legal move.
 */
export function parseMove(pos: Position, input: string): Move | null {
  const text = input
    .trim()
    .replace(/\s+/g, "")
    .replace(/[!?]+$/, "")
    .replace(/e\.?p\.?$/i, "")
    .replace(/^0-0-0/, "O-O-O")
    .replace(/^0-0/, "O-O")
    .replace(/^o-o-o/, "O-O-O")
    .replace(/^o-o/, "O-O");
  if (!text) return null;
  const legal = pos.legalMoves();
  const named = legal.map((m) => ({ move: m, san: bare(san(pos, m, legal)) }));
  const wanted = bare(text);

  const exact = named.filter((n) => n.san === wanted);
  if (exact.length === 1) return exact[0].move;

  const long = /^([a-h][1-8])[-x]?([a-h][1-8])=?([qrbnQRBN])?$/.exec(wanted);
  if (long) {
    const from = squareOf(long[1]);
    const to = squareOf(long[2]);
    const promo = long[3] ? LETTERS.indexOf(long[3].toLowerCase()) : 0;
    const found = legal.filter(
      (m) =>
        m.from === from &&
        m.to === to &&
        (m.promo === promo || (!long[3] && m.promo === QUEEN)),
    );
    if (found.length === 1) return found[0];
  }

  // "nf3", or "E4" from a keyboard that capitalises: matched ignoring case,
  // a piece letter first. "bxc3" is a pawn when no bishop can take on c3.
  const lower = wanted.toLowerCase();
  const loose = named.filter((n) => n.san.toLowerCase() === lower);
  if (loose.length === 1) return loose[0].move;
  if (loose.length > 1) {
    const pawn = loose.filter((n) => typeOf(n.move.piece) === PAWN);
    const piece = loose.filter((n) => typeOf(n.move.piece) !== PAWN);
    const capital = /^[A-Z]/.test(wanted);
    const pick = capital ? piece : pawn;
    if (pick.length === 1) return pick[0].move;
  }
  return null;
}

/** How a game is over, or null while it goes on. */
export type Ending =
  "checkmate" | "stalemate" | "repetition" | "fifty-moves" | "material";

/** A game replayed from its moves: the position and what it has seen. */
export interface Replayed {
  pos: Position;
  sans: string[];
  /** How many times each position key has occurred. */
  seen: Map<string, number>;
  last: Move | null;
}

/**
 * Replays moves given in UCI from the start. Throws on a move that is not
 * legal, so stored games are checked every time they are read.
 */
export function replay(moves: string[], fen: string = START_FEN): Replayed {
  const pos = Position.fromFen(fen);
  const seen = new Map<string, number>([[pos.key(), 1]]);
  const sans: string[] = [];
  let last: Move | null = null;
  for (const text of moves) {
    const legal = pos.legalMoves();
    const move = legal.find((m) => uci(m) === text);
    if (!move) throw new Error(`Not a legal move here: ${text}`);
    sans.push(san(pos, move, legal));
    pos.make(move);
    const key = pos.key();
    seen.set(key, (seen.get(key) ?? 0) + 1);
    last = move;
  }
  return { pos, sans, seen, last };
}

/** How the game in this state has ended, or null. */
export function ending(game: Replayed): Ending | null {
  const { pos } = game;
  if (pos.legalMoves().length === 0) {
    return pos.inCheck() ? "checkmate" : "stalemate";
  }
  if ((game.seen.get(pos.key()) ?? 0) >= 3) return "repetition";
  if (pos.halfmove >= 100) return "fifty-moves";
  if (pos.insufficientMaterial()) return "material";
  return null;
}

/** Counts leaf positions `depth` moves ahead: the standard check of a move generator. */
export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const move of pos.pseudoMoves()) {
    pos.make(move);
    if (!pos.leftInCheck()) nodes += perft(pos, depth - 1);
    pos.unmake();
  }
  return nodes;
}

/** Moves numbered as a person writes them: "1. e4 e5 2. Nf3". */
export function moveList(sans: string[], from = 0): string {
  const parts: string[] = [];
  for (let i = from; i < sans.length; i++) {
    const n = Math.floor(i / 2) + 1;
    if (i % 2 === 0) parts.push(`${n}. ${sans[i]}`);
    else if (i === from) parts.push(`${n}… ${sans[i]}`);
    else parts.push(sans[i]);
  }
  return parts.join(" ");
}
