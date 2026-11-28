// Correspondence chess against the agent: a person's games, the cards an
// agent inbox is sent for them (docs/guides/agent-inbox.md in
// aiwebengine-dev), and what each answer does to a game. No storage, no
// search and no calls here (main.ts does those), so the rules can be tested
// on their own.
//
// A game has at most one open card:
// - **your move**: the board, the moves so far, and Play (the move typed in
//   its field), Offer a draw or Accept the draw, and Resign. It is bound to
//   the position: an answer on a card the game has moved past changes
//   nothing.
// - **game over**: the result, with Play again and Done.
// Every new card on a game takes the next `seq`, so its externalId is new
// and it supersedes the last one by topic.

import {
  WHITE,
  ending,
  moveList,
  parseMove,
  replay,
  san as sanWriter,
  squareName,
  uci,
  type Ending,
  type Replayed,
} from "./chess.ts";
import { boardPath } from "./board.ts";
import {
  MAX_LEVEL,
  MIN_LEVEL,
  clampLevel,
  describeScore,
  isMate,
  type Choice,
} from "./search.ts";

/** The name this producer posts under; the inbox's allow-list names it. */
export const PRODUCER = "chess";
/** The one instance: a person's games. */
export const INSTANCE = "games";
export const LABEL = "Chess";
export const PAGE = "/chess";
export const BOARD = "/chess/board.svg";
/** Games kept, finished ones included; the oldest finished goes first. */
export const MAX_GAMES = 10;
/** Games in play at once. */
export const MAX_ACTIVE = 5;
export const DEFAULT_LEVEL = 2;

/** A move card holds Resign, so the inbox expires it within a day. */
export const MOVE_CARD_MS = 23 * 60 * 60 * 1000;
/** A move card older than this is posted again, so a slow game never expires. */
export const REPOST_MS = 20 * 60 * 60 * 1000;
/** After a move on the page, the inbox is left alone for this long. */
export const PAGE_QUIET_MS = 10 * 60 * 1000;
/** The agent offers a draw no earlier than this many plies, and not again soon. */
const DRAW_FROM_PLY = 40;
const DRAW_AGAIN_PLIES = 20;
/** The agent accepts a draw when it thinks itself no better than this. */
const DRAW_ACCEPT_CP = 20;

export const PLAY = "move";
export const OFFER_DRAW = "offer-draw";
export const ACCEPT_DRAW = "accept-draw";
export const RESIGN = "resign";
export const REMATCH = "rematch";
export const DONE = "done";
export const GOT_IT = "got-it";
export const WELCOME_ID = "chess-welcome";

export type Side = "w" | "b";
export type Result = "1-0" | "0-1" | "1/2-1/2";
export type Reason = Ending | "resignation" | "agreement";

export interface OpenCard {
  externalId: string;
  kind: "move" | "over";
  /** How many moves had been played when it was posted. */
  ply: number;
  postedAt: string;
}

export interface Game {
  id: string;
  /** The side the person plays. */
  you: Side;
  level: number;
  /** In UCI, from the start. */
  moves: string[];
  result: Result | null;
  reason: Reason | null;
  startedAt: string;
  updatedAt: string;
  /** Cards posted for this game; the next one's number. */
  seq: number;
  card: OpenCard | null;
  /** The game-over card has been answered: nothing more is posted. */
  closed?: boolean;
  /** The agent's last move as its search saw it. */
  agent?: { san: string; score: number; depth: number; line: string[] };
  /** The ply count at which the agent offered a draw. */
  drawOfferedAt?: number;
  /** Said on the next card: why the last answer did not play. */
  note?: string;
  /** When the person last moved on the page. */
  pageAt?: string;
}

/** What an answer, a move or a run leaves for main.ts to do. */
export interface Outcome {
  post: unknown[];
  withdraw: string[];
  /** The person asked for another game. */
  rematch?: boolean;
}

export interface InboxEvent {
  externalId: string;
  type: string;
  optionId?: string | null;
  instruction?: string | null;
  revision?: number;
  [more: string]: unknown;
}

export interface InboxState {
  cursor: number;
  welcomed?: boolean;
  /** A first game has been started for the person. */
  started?: boolean;
  syncedAt?: string;
  problem?: string;
}

export function emptyState(): InboxState {
  return { cursor: 0 };
}

const GAME_ID = /^g[a-z0-9]{6,20}$/;

export function newGameId(now: number, random: number): string {
  return (
    "g" +
    now.toString(36) +
    Math.floor(random * 36 ** 4)
      .toString(36)
      .padStart(4, "0")
  );
}

export function isGameId(id: string): boolean {
  return GAME_ID.test(id);
}

/** The game a card's externalId names ("chess-<game>-<seq>"), or null. */
export function gameOfCard(externalId: string): string | null {
  const m = /^chess-(g[a-z0-9]{6,20})-\d+$/.exec(externalId);
  return m ? m[1] : null;
}

export function newGame(
  id: string,
  you: Side,
  level: number,
  now: string,
): Game {
  return {
    id,
    you,
    level: clampLevel(level),
    moves: [],
    result: null,
    reason: null,
    startedAt: now,
    updatedAt: now,
    seq: 0,
    card: null,
  };
}

/** The game's position and history; throws on a stored move that is not legal. */
export function view(game: Game): Replayed {
  return replay(game.moves);
}

export function sideToMove(r: Replayed): Side {
  return r.pos.turn === WHITE ? "w" : "b";
}

export function whoMoves(game: Game, r: Replayed): "you" | "agent" | "over" {
  if (game.result) return "over";
  return sideToMove(r) === game.you ? "you" : "agent";
}

function sideName(side: Side): string {
  return side === "w" ? "White" : "Black";
}

/** The person's outcome of a finished game. */
export function outcomeOf(game: Game): "won" | "lost" | "drawn" | null {
  if (!game.result) return null;
  if (game.result === "1/2-1/2") return "drawn";
  const whiteWon = game.result === "1-0";
  return whiteWon === (game.you === "w") ? "won" : "lost";
}

/** The level the next game is played at: up after a win, down after a loss. */
export function nextLevel(level: number, outcome: string | null): number {
  if (outcome === "won") return Math.min(MAX_LEVEL, level + 1);
  if (outcome === "lost") return Math.max(MIN_LEVEL, level - 1);
  return level;
}

function finish(game: Game, result: Result, reason: Reason, now: string): void {
  game.result = result;
  game.reason = reason;
  game.updatedAt = now;
  delete game.drawOfferedAt;
}

/** Ends the game if the position does, after a move by `mover`. */
function checkEnding(game: Game, r: Replayed, now: string): void {
  const end = ending(r);
  if (!end) return;
  if (end === "checkmate") {
    // The side to move is mated.
    finish(game, r.pos.turn === WHITE ? "0-1" : "1-0", end, now);
  } else {
    finish(game, "1/2-1/2", end, now);
  }
}

/**
 * Plays the person's move. Answers the move in SAN, or what to tell them
 * when it cannot be played.
 */
export function personMove(
  game: Game,
  input: string,
  now: string,
): { san: string } | { error: string } {
  const r = view(game);
  const who = whoMoves(game, r);
  if (who === "over") return { error: "The game is over" };
  if (who === "agent") return { error: "It is the agent's move" };
  const text = input.trim().slice(0, 40);
  if (!text) {
    return { error: "Type your move in the field, such as Nf3, e4 or O-O." };
  }
  const move = parseMove(r.pos, text);
  if (!move) return { error: `“${text}” is not a legal move here.` };
  const sanText = sanWriter(r.pos, move, r.pos.legalMoves());
  game.moves.push(uci(move));
  game.updatedAt = now;
  delete game.note;
  // Playing on declines a draw the agent offered.
  delete game.drawOfferedAt;
  checkEnding(game, view(game), now);
  return { san: sanText };
}

/** Plays the move the agent's search chose. */
export function agentMove(game: Game, choice: Choice, now: string): void {
  game.moves.push(uci(choice.move));
  game.updatedAt = now;
  game.agent = {
    san: choice.san,
    score: choice.score,
    depth: choice.depth,
    line: choice.line.slice(0, 8),
  };
  const plies = game.moves.length;
  const even =
    !isMate(choice.score) && Math.abs(choice.score) <= DRAW_ACCEPT_CP;
  const again =
    game.drawOfferedAt === undefined ||
    plies - game.drawOfferedAt >= DRAW_AGAIN_PLIES;
  if (plies >= DRAW_FROM_PLY && even && again) game.drawOfferedAt = plies;
  checkEnding(game, view(game), now);
}

/** Whether the agent's draw offer stands: made with its last move. */
export function drawOffered(game: Game): boolean {
  return !game.result && game.drawOfferedAt === game.moves.length;
}

export function resign(game: Game, now: string): void {
  if (game.result) return;
  finish(game, game.you === "w" ? "0-1" : "1-0", "resignation", now);
}

/**
 * The person offers a draw: the agent takes it when it thinks itself no
 * better, after its last search. Answers whether it was taken.
 */
export function offerDraw(game: Game, now: string): boolean {
  if (game.result) return false;
  const score = game.agent?.score;
  if (
    score !== undefined &&
    !isMate(score) &&
    score <= DRAW_ACCEPT_CP &&
    game.moves.length >= 20
  ) {
    finish(game, "1/2-1/2", "agreement", now);
    return true;
  }
  game.note = "The agent declines the draw: it likes its position.";
  game.updatedAt = now;
  return false;
}

export function acceptDraw(game: Game, now: string): boolean {
  if (!drawOffered(game)) return false;
  finish(game, "1/2-1/2", "agreement", now);
  return true;
}

/**
 * Of the events read in one run, those that count: for each card the last
 * answer (an answer the person changed counts as changed), and expiries.
 */
export function latestAnswers(events: InboxEvent[]): InboxEvent[] {
  const answers = new Map<string, InboxEvent>();
  const out: InboxEvent[] = [];
  for (const event of events) {
    if (["decided", "changed", "cleared"].indexOf(event.type) >= 0) {
      const before = answers.get(event.externalId);
      if (!before || (event.revision ?? 0) >= (before.revision ?? 0)) {
        answers.set(event.externalId, event);
      }
    } else if (event.type === "expired") {
      out.push(event);
    }
  }
  return out.concat(
    Array.from(answers.values()).filter((e) => e.type !== "cleared"),
  );
}

/**
 * What an answer does to its game. Only an answer on the game's open card
 * counts: once the game has moved on, a card it left behind changes nothing.
 */
export function onAnswer(game: Game, event: InboxEvent, now: string): Outcome {
  const out: Outcome = { post: [], withdraw: [] };
  const card = game.card;
  if (!card || card.externalId !== event.externalId) return out;
  if (event.type === "expired") {
    // Posted again with the next card; a finished game's card just goes.
    game.card = null;
    if (card.kind === "over") game.closed = true;
    return out;
  }
  if (card.kind === "over") {
    game.card = null;
    game.closed = true;
    if (event.optionId === REMATCH) out.rematch = true;
    return out;
  }
  if (card.ply !== game.moves.length) return out;
  game.card = null;
  switch (event.optionId) {
    case PLAY: {
      const played = personMove(game, String(event.instruction ?? ""), now);
      if ("error" in played) game.note = played.error;
      break;
    }
    case OFFER_DRAW:
      offerDraw(game, now);
      break;
    case ACCEPT_DRAW:
      if (!acceptDraw(game, now)) {
        game.note = "The draw offer was withdrawn when the game moved on.";
      }
      break;
    case RESIGN:
      resign(game, now);
      break;
    default:
      // Nothing this card offers: post it again.
      break;
  }
  return out;
}

/**
 * The cards a game needs now: a your-move card when it is the person's turn
 * and none is open for this position, the same card again when it is close
 * to expiring, or the game-over card. A move on the page keeps the inbox
 * quiet for a while, and withdraws the card it made stale.
 */
export function settle(game: Game, nowMs: number): Outcome {
  const out: Outcome = { post: [], withdraw: [] };
  const now = new Date(nowMs).toISOString();
  const r = view(game);
  const who = whoMoves(game, r);
  const card = game.card;
  const playingOnPage =
    game.pageAt !== undefined &&
    nowMs - Date.parse(game.pageAt) < PAGE_QUIET_MS;

  if (who === "over") {
    if (game.closed || card?.kind === "over") return out;
    if (card) out.withdraw.push(card.externalId);
    game.card = null;
    if (playingOnPage) {
      // Seen on the page as it happened.
      game.closed = true;
      return out;
    }
    game.card = nextCard(game, "over", now);
    out.post.push(overCard(game, r));
    return out;
  }

  const stale = card !== null && card.ply !== game.moves.length;
  if (stale && card) {
    out.withdraw.push(card.externalId);
    game.card = null;
  }
  if (who !== "you") return out;
  if (!game.card) {
    if (playingOnPage) return out;
    game.card = nextCard(game, "move", now);
    out.post.push(moveCard(game, r, nowMs));
  } else if (nowMs - Date.parse(game.card.postedAt) > REPOST_MS) {
    game.card.postedAt = now;
    out.post.push(moveCard(game, r, nowMs));
  }
  return out;
}

function nextCard(game: Game, kind: "move" | "over", now: string): OpenCard {
  game.seq++;
  return {
    externalId: `chess-${game.id}-${game.seq}`,
    kind,
    ply: game.moves.length,
    postedAt: now,
  };
}

/**
 * Moves for a card's Markdown: a leading "1. " would start a numbered list,
 * so its dot is escaped.
 */
export function markdownMoves(text: string): string {
  return text.replace(/^(\d+)\. /, "$1\\. ");
}

/** "11… Nf6" or "12. e4": the last move, numbered. */
export function lastMoveText(r: Replayed): string | null {
  const i = r.sans.length - 1;
  if (i < 0) return null;
  const n = Math.floor(i / 2) + 1;
  return i % 2 === 0 ? `${n}. ${r.sans[i]}` : `${n}… ${r.sans[i]}`;
}

/** The board picture's path for this game's position. */
export function boardOf(game: Game, r: Replayed): string {
  const check = r.pos.inCheck() ? squareName(r.pos.kings[r.pos.turn]) : "";
  return boardPath(BOARD, {
    placement: r.pos.placement(),
    last: r.last ? uci(r.last) : undefined,
    check: check || undefined,
    flip: game.you === "b",
  });
}

function opponent(game: Game): string {
  return `Level ${game.level} of ${MAX_LEVEL}`;
}

/** The position an answer on a move card depends on, as Resign confirms it. */
export function boundOf(game: Game, r: Replayed): string {
  const n = r.pos.fullmove;
  const last = lastMoveText(r);
  return `Move ${n}, ${sideName(sideToMove(r))} to play${last ? `, after ${last}` : ""}`;
}

export function moveCard(game: Game, r: Replayed, nowMs: number): unknown {
  const last = lastMoveText(r);
  const offered = drawOffered(game);
  const title = offered
    ? `The agent offers a draw after ${last}`
    : last
      ? `Your move after ${last}`
      : "Your move: the game starts";
  const said: string[] = [];
  if (game.note) said.push(game.note);
  if (r.pos.inCheck()) said.push("You are in check.");
  said.push(`You play ${sideName(game.you)}.`);
  const recent = Math.max(0, r.sans.length - 10);
  const moves = moveList(r.sans, recent - (recent % 2));
  const body = [
    `![The board${last ? ` after ${last}` : ""}](${boardOf(game, r)})`,
    moves ? `${recent > 0 ? "… " : ""}${markdownMoves(moves)}` : "",
    "Type your move in the field and press Play: Nf3, exd5, O-O, e8=Q. Or open the board to play there.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const options: unknown[] = [
    {
      id: PLAY,
      label: "Play",
      style: "primary",
      weight: "instruction",
      placeholder: "Your move, such as Nf3",
    },
  ];
  if (offered) {
    options.push({
      id: ACCEPT_DRAW,
      label: "Accept the draw",
      style: "neutral",
    });
  } else if (game.moves.length >= 20) {
    options.push({ id: OFFER_DRAW, label: "Offer a draw", style: "neutral" });
  }
  options.push({
    id: RESIGN,
    label: "Resign",
    style: "negative",
    weight: "consequential",
  });
  return {
    externalId: game.card?.externalId,
    topic: `chess-${game.id}`,
    level: "may",
    title,
    summary: said.join(" "),
    body: { kind: "markdown", text: body },
    facts: [
      { label: "You play", value: sideName(game.you) },
      { label: "Opponent", value: opponent(game) },
      { label: "Move", value: String(r.pos.fullmove) },
    ],
    links: [
      {
        label: "Open the board",
        url: `${PAGE}?game=${game.id}`,
        handles: false,
      },
    ],
    options,
    boundTo: { label: "Position", value: boundOf(game, r) },
    suggestedQuestions: [
      "Why did you play that?",
      "Who stands better?",
      "What are you threatening?",
    ],
    expiresAt: nowMs + MOVE_CARD_MS,
  };
}

const ENDINGS: Record<Reason, string> = {
  checkmate: "by checkmate",
  resignation: "by resignation",
  agreement: "by agreement",
  stalemate: "by stalemate",
  repetition: "by repetition",
  "fifty-moves": "by the fifty-move rule",
  material: "as neither side can mate",
};

/** "You won by checkmate", "Drawn by repetition". */
export function resultText(game: Game): string {
  const how = game.reason ? ENDINGS[game.reason] : "";
  const outcome = outcomeOf(game);
  if (outcome === "won") return `You won ${how}`;
  if (outcome === "lost") {
    return game.reason === "resignation"
      ? "You resigned"
      : `The agent won ${how}`;
  }
  return `Drawn ${how}`;
}

export function overCard(game: Game, r: Replayed): unknown {
  const outcome = outcomeOf(game);
  const next = nextLevel(game.level, outcome);
  const levelNote =
    next !== game.level
      ? ` The agent plays at level ${next} from the next game.`
      : "";
  return {
    externalId: game.card?.externalId,
    topic: `chess-${game.id}`,
    level: "may",
    title: resultText(game),
    summary: `${game.result} after ${r.pos.fullmove - (r.pos.turn === WHITE ? 1 : 0)} moves, against ${opponent(game).toLowerCase()}.${levelNote}`,
    body: {
      kind: "markdown",
      text: `![The final position](${boardOf(game, r)})\n\n${markdownMoves(moveList(r.sans))} ${game.result}`,
    },
    links: [
      {
        label: "Open the game",
        url: `${PAGE}?game=${game.id}`,
        handles: false,
      },
    ],
    options: [
      { id: REMATCH, label: "Play again", style: "primary" },
      { id: DONE, label: "Done", style: "neutral" },
    ],
  };
}

export function welcomeCard(): unknown {
  return {
    externalId: WELCOME_ID,
    level: "know",
    title: "Chess: your moves will come here",
    summary:
      "When it is your move, a card shows the board. Type your move and press Play; the agent answers within a minute. Start more games with New game on any chess card, or on the chess page.",
    links: [{ label: "The chess page", url: PAGE, handles: false }],
    options: [{ id: GOT_IT, label: "Got it", style: "primary" }],
  };
}

/**
 * What the person wrote for a new game: "white", "black" or "random" (the
 * default), and optionally a level 1–5.
 */
export function readNewGame(
  text: string,
  random: number,
): { you: Side; level?: number } {
  const t = text.toLowerCase();
  const level = /\b([1-5])\b/.exec(t);
  const you: Side = /\bwhite\b/.test(t)
    ? "w"
    : /\bblack\b/.test(t)
      ? "b"
      : random < 0.5
        ? "w"
        : "b";
  return level ? { you, level: Number(level[1]) } : { you };
}

/** A game in PGN, for Ask and for export. */
export function pgn(game: Game, r: Replayed): string {
  const white = game.you === "w" ? "You" : `Agent (level ${game.level})`;
  const black = game.you === "b" ? "You" : `Agent (level ${game.level})`;
  const date = game.startedAt.slice(0, 10).replace(/-/g, ".");
  return [
    `[Event "Correspondence game"]`,
    `[Date "${date}"]`,
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${game.result ?? "*"}"]`,
    "",
    `${moveList(r.sans)} ${game.result ?? "*"}`,
  ].join("\n");
}

/** What the inbox answers a question on one of this game's cards from. */
export function contextOf(game: Game, r: Replayed, now: string): unknown {
  const agent = game.agent;
  const why = agent
    ? `The agent played ${agent.san} at level ${game.level} of ${MAX_LEVEL}. Its search looked ${agent.depth} move${agent.depth === 1 ? "" : "s"} ahead, expected ${agent.line.join(" ")}, and scored the position ${describeScore(agent.score)} for itself (in pawns; above 0 is better for the agent). Weaker levels add noise to their choice on purpose.`
    : game.result
      ? `The game is over: ${resultText(game)}.`
      : "The game has just started; the agent has not moved yet.";
  const legal = game.result ? [] : r.pos.legalMoves();
  const legalSans = legal.map((m) => sanWriter(r.pos, m, legal));
  return {
    why,
    facts: [
      { label: "The person plays", value: sideName(game.you) },
      {
        label: "The agent plays",
        value: sideName(game.you === "w" ? "b" : "w"),
      },
      {
        label: "To move",
        value: game.result ? "nobody" : sideName(sideToMove(r)),
      },
      { label: "Opponent level", value: `${game.level} of ${MAX_LEVEL}` },
      { label: "Result", value: game.result ? resultText(game) : "in play" },
    ],
    documents: [
      { title: "The game so far (PGN)", text: pgn(game, r) },
      { title: "The position (FEN)", text: r.pos.fen() },
      ...(legalSans.length
        ? [{ title: "Legal moves now", text: legalSans.join(" ") }]
        : []),
    ],
    at: now,
  };
}
