/// <reference path="../types/aiwebengine.d.ts" />

// Chess: correspondence games against the agent, a move at a time, in the
// person's agent inbox.
//
// When it is the person's move, a card shows the board (a picture this
// script draws at /chess/board.svg), the last moves, and a field for the
// move: they type "Nf3" and press Play. The inbox wakes the script, which
// reads the answer, plays the agent's reply and posts the next card, in
// about half a minute. Resign is consequential, so the inbox confirms it.
// Live play, several moves in a row, is on the page at /chess, which answers
// at once and keeps the inbox quiet meanwhile.
//
// The agent's moves come from a rules library and a small search in this
// script (server/chess.ts, server/search.ts), never from a model, so it
// needs no AI key. Its strength is a level from 1 to 5 that follows the
// person's results. The rules for games and cards are server/games.ts.

import {
  BOARD,
  DEFAULT_LEVEL,
  INSTANCE,
  LABEL,
  MAX_ACTIVE,
  MAX_GAMES,
  PAGE,
  PRODUCER,
  acceptDraw,
  agentMove,
  boardOf,
  contextOf,
  drawOffered,
  emptyState,
  gameOfCard,
  isGameId,
  latestAnswers,
  newGame,
  newGameId,
  nextLevel,
  offerDraw,
  onAnswer,
  outcomeOf,
  personMove,
  pgn,
  readNewGame,
  resign,
  resultText,
  settle,
  view,
  welcomeCard,
  whoMoves,
  type Game,
  type InboxEvent,
  type InboxState,
  type Outcome,
  type Side,
} from "./server/games.ts";
import { boardSvg } from "./server/board.ts";
import { moveList, san, squareName, uci } from "./server/chess.ts";
import { MAX_LEVEL, MIN_LEVEL, choose, clampLevel } from "./server/search.ts";
import {
  collect,
  inboxProblem,
  inboxReachable,
  notBeforeOf,
  post,
  queueWake,
  wakeDone,
  withdraw,
} from "./server/inbox_kit.ts";

const KEY = "chess";
const INTERVAL_MINUTES = 15;
/** A wake runs this long after an answer, so answers in a row share a run. */
const WAKE_DELAY_MS = 5_000;
/** How long the agent thinks in a run (60 s in all) and on the page (10 s). */
const THINK_IN_RUN_MS = 4_000;
const THINK_ON_PAGE_MS = 2_500;
/** A run stops thinking past this, and leaves the rest for the next run. */
const RUN_BUDGET_MS = 40_000;

interface Settings {
  level: number;
  paused?: boolean;
}

interface RunStatus {
  checkedAt: string;
  problem?: string;
}

function readJson<T>(name: string, fallback: T): T {
  const raw = personalStorage.getItem(name);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(name: string, value: unknown): void {
  personalStorage.setItem(name, JSON.stringify(value));
}

function settings(): Settings {
  const s = readJson<Settings>("settings", { level: DEFAULT_LEVEL });
  return { ...s, level: clampLevel(s.level) };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fail(status: number, error: string): HttpResponse {
  return ResponseBuilder.json({ error }, status);
}

function body(context: HandlerContext): Record<string, unknown> {
  try {
    const value = context.request?.json();
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function signedIn(context: HandlerContext): boolean {
  return Boolean(context.request?.auth?.isAuthenticated);
}

/** Whether runs can act for this person and reach their inbox. */
function permitted(grant: DelegationState): boolean {
  const scopes = grant.scopes ?? [];
  return (
    grant.granted &&
    ["personal_storage", "write", "tools"].every(
      (s) => scopes.indexOf(s as DelegationScope) !== -1,
    )
  );
}

function declareSchedule(): PersonalSchedule {
  return personalTasks.schedule({
    key: KEY,
    handler: "tendGames",
    intervalMinutes: INTERVAL_MINUTES,
  });
}

// ============================================================================
// Games
// ============================================================================

function gameIds(): string[] {
  return readJson<string[]>("games", []);
}

function loadGame(id: string): Game | null {
  return isGameId(id) ? readJson<Game | null>(`game:${id}`, null) : null;
}

function saveGame(game: Game): void {
  writeJson(`game:${game.id}`, game);
}

function allGames(): Game[] {
  return gameIds()
    .map(loadGame)
    .filter((g): g is Game => g !== null);
}

function removeGame(id: string): void {
  personalStorage.removeItem(`game:${id}`);
  writeJson(
    "games",
    gameIds().filter((g) => g !== id),
  );
}

/**
 * Starts a game. Past MAX_GAMES the oldest finished game goes; past
 * MAX_ACTIVE games in play it is refused with a message the person can act
 * on.
 */
function startGame(you: Side, level?: number): Game {
  const games = allGames();
  if (games.filter((g) => !g.result).length >= MAX_ACTIVE) {
    throw new Error(
      `You have ${MAX_ACTIVE} games in play; finish or resign one first`,
    );
  }
  const finished = games
    .filter((g) => g.result)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (let n = games.length; n >= MAX_GAMES && finished.length > 0; n--) {
    const oldest = finished.shift();
    if (oldest) dropGame(oldest);
  }
  const game = newGame(
    newGameId(Date.now(), Math.random()),
    you,
    level ?? settings().level,
    new Date().toISOString(),
  );
  saveGame(game);
  writeJson("games", gameIds().concat([game.id]));
  return game;
}

/** Removes a game and the card it has open. */
function dropGame(game: Game): void {
  if (game.card) {
    try {
      withdraw(producer(), game.card.externalId);
    } catch (e) {
      console.warn(`chess: withdrawing ${game.card.externalId}: ${e}`);
    }
  }
  removeGame(game.id);
}

/** The agent plays its move if it is its turn. Answers whether it moved. */
function think(game: Game, budgetMs: number): boolean {
  const r = view(game);
  if (whoMoves(game, r) !== "agent") return false;
  const choice = choose(r.pos, game.level, budgetMs);
  agentMove(game, choice, new Date().toISOString());
  return true;
}

/** A finished game moves the person's level for the next one. */
function noteResult(game: Game, before: Game["result"]): void {
  if (before || !game.result) return;
  const current = settings();
  writeJson("settings", {
    ...current,
    level: nextLevel(game.level, outcomeOf(game)),
  });
}

/**
 * Does what a rule left to do. The game is saved before the inbox is
 * called, so a failed post leaves it to be posted by the next run.
 */
function carryOut(game: Game, out: Outcome): void {
  saveGame(game);
  if (!inboxReachable()) return;
  try {
    for (const externalId of out.withdraw) withdraw(producer(), externalId);
    for (const card of out.post) post(producer(), card);
  } catch (e) {
    writeJson("status", {
      checkedAt: new Date().toISOString(),
      problem: inboxProblem(e),
    });
  }
}

// ============================================================================
// The runs
// ============================================================================

// A task acting as the person: the schedule's run, a wake after an answer,
// or one queued from a card. Reads the inbox's answers, plays the agent's
// moves, and posts the cards that are due.
function tendGames(context: HandlerContext): void {
  void context;
  wakeDone("wake");
  const started = Date.now();
  const now = new Date().toISOString();
  if (!inboxReachable()) {
    writeJson("status", {
      checkedAt: now,
      problem:
        "No agent inbox reachable: your moves come to it as cards, so the games wait",
    });
    return;
  }
  const state = readJson<InboxState>("inbox", emptyState());
  if (!state.welcomed) welcome();
  collectAnswers();
  // A first game, so the person has a move to make right away.
  if (!readJson<InboxState>("inbox", emptyState()).started) {
    if (allGames().length === 0) startGame("w");
    writeJson("inbox", {
      ...readJson<InboxState>("inbox", emptyState()),
      started: true,
    });
  }
  for (const game of allGames()) {
    const before = game.result;
    try {
      if (Date.now() - started < RUN_BUDGET_MS) think(game, THINK_IN_RUN_MS);
    } catch (e) {
      console.warn(`chess: thinking in ${game.id}: ${e}`);
    }
    noteResult(game, before);
    carryOut(game, settle(game, Date.now()));
  }
  writeJson("status", { checkedAt: now });
}

/** Reads what the person answered since the last run and carries it out. */
function collectAnswers(): void {
  const state = readJson<InboxState>("inbox", emptyState());
  const now = new Date().toISOString();
  try {
    const apply = (events: InboxEvent[]) => {
      for (const event of latestAnswers(events)) {
        const id = gameOfCard(event.externalId);
        const game = id ? loadGame(id) : null;
        if (!game) continue;
        const before = game.result;
        const out = onAnswer(game, event, now);
        noteResult(game, before);
        saveGame(game);
        if (out.rematch) {
          try {
            startGame(game.you === "w" ? "b" : "w");
          } catch (e) {
            console.warn(`chess: rematch: ${e}`);
          }
        }
      }
    };
    const save = (cursor: number) => {
      state.cursor = cursor;
      writeJson("inbox", { ...readJson("inbox", state), cursor });
    };
    collect(producer(), state.cursor, apply, save);
    const after = readJson<InboxState>("inbox", state);
    delete after.problem;
    after.syncedAt = now;
    writeJson("inbox", after);
  } catch (e) {
    writeJson("inbox", {
      ...readJson<InboxState>("inbox", state),
      problem: inboxProblem(e),
    });
  }
}

// ============================================================================
// The agent inbox
// ============================================================================

function producer() {
  return {
    name: PRODUCER,
    instance: INSTANCE,
    label: LABEL,
    settingsUrl: PAGE,
  };
}

function welcome(): void {
  let welcomed = true;
  try {
    post(producer(), welcomeCard());
  } catch (e) {
    welcomed = false;
    console.warn(`chess: welcome card: ${e}`);
  }
  writeJson("inbox", {
    ...readJson<InboxState>("inbox", emptyState()),
    welcomed,
  });
}

// What the inbox answers a question on one of the games' cards from: the
// agent's reason for its last move, the game so far and the position. The
// inbox calls it as the person, read-only.
function chessContextTool(context: HandlerContext): unknown {
  contractCall(context);
  const args = (context.args ?? {}) as Record<string, unknown>;
  const id = gameOfCard(String(args.externalId ?? ""));
  const game = id ? loadGame(id) : null;
  if (!game) throw new Error("Not a game the agent still has");
  return contextOf(game, view(game), new Date().toISOString());
}

// A new game from what the person wrote on a card: "white", "black" or
// nothing for either, and a level 1–5 if they like. The agent's first move,
// when it plays White, and the card follow from a run queued now.
function chessCaptureTool(context: HandlerContext): unknown {
  contractCall(context);
  const args = (context.args ?? {}) as Record<string, unknown>;
  const wanted = readNewGame(String(args.text ?? ""), Math.random());
  const game = startGame(wanted.you, wanted.level);
  personalTasks.enqueue({ handler: "tendGames" });
  return {
    message: `Started a game: you play ${game.you === "w" ? "White" : "Black"} against level ${game.level}. Its first card follows.`,
    url: `${PAGE}?game=${game.id}`,
  };
}

// The inbox has answers: read them soon rather than at the next run.
function chessWakeTool(context: HandlerContext): unknown {
  contractCall(context);
  return queueWake({
    key: "wake",
    handler: "tendGames",
    delayMs: WAKE_DELAY_MS,
    notBefore: notBeforeOf(context.args),
  });
}

// ============================================================================
// The agent contract (docs/guides/agent-inbox.md in aiwebengine-dev). One
// instance per person: their games.
// ============================================================================

const CONFIG_SCHEMA = {
  type: "object",
  properties: {
    level: {
      type: "integer",
      title: "Opponent strength",
      description: `${MIN_LEVEL} (a beginner) to ${MAX_LEVEL}. It moves up a level when you win and down when you lose.`,
      minimum: MIN_LEVEL,
      maximum: MAX_LEVEL,
      default: DEFAULT_LEVEL,
    },
  },
};

function chessManifestTool(): unknown {
  return {
    name: PRODUCER,
    label: "Chess",
    description:
      "Correspondence chess against the agent. When it is your move, a card shows the board: type your move and the agent answers within a minute. It gets stronger as you win. No AI key needed.",
    config: CONFIG_SCHEMA,
    instances: "one",
    scopes: ["personal_storage", "write", "tools"],
    secrets: [],
    settingsUrl: PAGE,
    capture: {
      label: "New game",
      placeholder: "white, black or either; a level 1–5 if you like",
    },
    ask: {
      policy:
        "You speak as the person's chess opponent, friendly and brief. Explain your own moves, plans and threats and the position in plain words. Never tell the person which move to play next or reveal what you will play; they decide with the card's options. Use the PGN, FEN and legal moves given, and say so when you are unsure of a line.",
    },
  };
}

function missing(): { kind: string; label: string; url?: string }[] {
  const grant = personalTasks.authorization();
  if (permitted(grant)) return [];
  return [
    {
      kind: "consent",
      label:
        "Give the chess agent permission to play while you are away: personal storage, write and tools",
      url: grant.consentUrl,
    },
  ];
}

function statusOf(): unknown {
  const current = settings();
  const schedule = personalTasks.schedules().find((s) => s.key === KEY) ?? null;
  const gaps = missing();
  const state = current.paused
    ? "paused"
    : gaps.length > 0
      ? "incomplete"
      : !schedule
        ? "ready"
        : schedule.state === "active"
          ? "running"
          : "paused";
  return {
    instance: INSTANCE,
    label: LABEL,
    settingsUrl: PAGE,
    state,
    pausedReason: current.paused
      ? "Paused by you"
      : (schedule?.pausedReason ?? null),
    missing: gaps,
    lastRunAt: schedule?.lastRunAt ?? null,
    nextRunAt:
      schedule && schedule.state === "active" ? schedule.nextRunAt : null,
    problem:
      readJson<InboxState | null>("inbox", null)?.problem ??
      readJson<RunStatus | null>("status", null)?.problem ??
      null,
  };
}

function contractCall(context: HandlerContext): void {
  if (!signedIn(context)) throw new Error("Call as a signed-in person");
  const named = (context.args ?? {}).instance;
  if (named !== undefined && named !== null && named !== INSTANCE) {
    throw new Error(`Chess is the one instance, "${INSTANCE}"`);
  }
}

/** Keeps the schedule to match the settings, once permission is given. */
function schedule(paused: boolean): void {
  if (!permitted(personalTasks.authorization())) return;
  if (paused) {
    personalTasks.unschedule(KEY);
  } else {
    declareSchedule();
    personalTasks.enqueue({ handler: "tendGames" });
  }
}

function readLevel(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_LEVEL || n > MAX_LEVEL) {
    throw new Error(
      `The strength is a whole number from ${MIN_LEVEL} to ${MAX_LEVEL}`,
    );
  }
  return n;
}

function chessSetupTool(context: HandlerContext): unknown {
  contractCall(context);
  const config = ((context.args ?? {}).config ?? {}) as Record<string, unknown>;
  const current = settings();
  const level = readLevel(config.level, current.level);
  writeJson("settings", { ...current, level });
  schedule(current.paused === true);
  return statusOf();
}

function chessStatusTool(context: HandlerContext): unknown {
  contractCall(context);
  return statusOf();
}

function chessPauseTool(context: HandlerContext): unknown {
  contractCall(context);
  personalTasks.unschedule(KEY);
  writeJson("settings", { ...settings(), paused: true });
  return statusOf();
}

function chessResumeTool(context: HandlerContext): unknown {
  contractCall(context);
  const gaps = missing();
  if (gaps.length > 0) {
    throw new Error(`Not yet: ${gaps.map((m) => m.label).join("; ")}`);
  }
  const current = settings();
  delete current.paused;
  writeJson("settings", current);
  schedule(false);
  return statusOf();
}

// Stops the agent and forgets every game.
function chessRemoveTool(context: HandlerContext): unknown {
  contractCall(context);
  personalTasks.unschedule(KEY);
  for (const id of gameIds()) personalStorage.removeItem(`game:${id}`);
  for (const name of ["settings", "games", "inbox", "status", "wake"]) {
    personalStorage.removeItem(name);
  }
  return { removed: true };
}

function registerContractTools(): void {
  const instanceOnly = {
    type: "object",
    properties: { instance: { type: "string" } },
  };
  mcpRegistry.registerTool("chess_manifest", {
    description:
      "What the chess agent is, the configuration it takes, and what it needs — for an agent inbox's catalog.",
    inputSchema: { type: "object", properties: {} },
    handler: "chessManifestTool",
  });
  mcpRegistry.registerTool("chess_setup", {
    description:
      "Set up or change the person's chess agent. Answers its status, listing what is still missing and where to give it.",
    inputSchema: {
      type: "object",
      properties: { instance: { type: "string" }, config: CONFIG_SCHEMA },
      required: ["config"],
    },
    handler: "chessSetupTool",
  });
  mcpRegistry.registerTool("chess_status", {
    description:
      "How the person's chess agent is doing: running, paused, ready or incomplete, its runs, and what is missing.",
    inputSchema: instanceOnly,
    handler: "chessStatusTool",
  });
  mcpRegistry.registerTool("chess_pause", {
    description: "Pause the person's chess agent until resumed.",
    inputSchema: instanceOnly,
    handler: "chessPauseTool",
  });
  mcpRegistry.registerTool("chess_resume", {
    description:
      "Start the chess agent when paused or ready; refused while something is missing.",
    inputSchema: instanceOnly,
    handler: "chessResumeTool",
  });
  mcpRegistry.registerTool("chess_remove", {
    description: "Stop the person's chess agent and delete their games.",
    inputSchema: instanceOnly,
    handler: "chessRemoveTool",
  });
  mcpRegistry.registerTool("chess_wake", {
    description:
      "The inbox has answers for the chess agent: read them soon rather than at the next run. Carries no answer.",
    inputSchema: instanceOnly,
    handler: "chessWakeTool",
  });
  mcpRegistry.registerTool("chess_capture", {
    description:
      "Start a game from what the person wrote on a chess card: white, black or either, and a level 1–5.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string" },
        externalId: {
          type: "string",
          description: "The card it was written on.",
        },
        itemId: { type: "string" },
        text: { type: "string", maxLength: 4000 },
      },
      required: ["externalId", "text"],
    },
    handler: "chessCaptureTool",
  });
  mcpRegistry.registerTool("chess_context", {
    description:
      "The game behind a chess card in the person's agent inbox: the agent's reason for its last move, the game in PGN, the position and the legal moves. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string" },
        externalId: { type: "string", description: "The card's externalId." },
        itemId: { type: "string" },
        question: { type: "string" },
      },
      required: ["externalId"],
    },
    handler: "chessContextTool",
  });
}

// ============================================================================
// The page
// ============================================================================

/** Where a game stands, for the list on the page. */
function where(game: Game): string {
  if (game.result) return resultText(game);
  const who = whoMoves(game, view(game));
  if (who === "agent") return "The agent is thinking";
  if (drawOffered(game)) return "Your move; the agent offers a draw";
  return game.card ? "Your move, waiting in your inbox" : "Your move";
}

// Who, what is allowed, and the person's games.
function chessState(context: HandlerContext): HttpResponse {
  if (!signedIn(context)) return ResponseBuilder.json({ signedIn: false });
  const grant = personalTasks.authorization();
  const current = settings();
  let sched = personalTasks.schedules().find((s) => s.key === KEY) ?? null;
  // Settings saved before permission was given are scheduled once it is.
  if (!sched && !current.paused && permitted(grant)) {
    try {
      sched = declareSchedule();
      personalTasks.enqueue({ handler: "tendGames" });
    } catch (e) {
      console.warn(`chess: declaring the schedule: ${e}`);
    }
  }
  const inbox = readJson<InboxState | null>("inbox", null);
  return ResponseBuilder.json({
    signedIn: true,
    granted: permitted(grant),
    consentUrl: grant.consentUrl ?? null,
    inboxAvailable: inboxReachable(),
    inbox: inbox && {
      syncedAt: inbox.syncedAt ?? null,
      problem: inbox.problem ?? null,
    },
    level: current.level,
    paused: current.paused === true,
    maxActive: MAX_ACTIVE,
    games: allGames()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((g) => ({
        id: g.id,
        you: g.you,
        level: g.level,
        moves: g.moves.length,
        result: g.result,
        updatedAt: g.updatedAt,
        where: where(g),
      })),
    status: readJson<RunStatus | null>("status", null),
  });
}

/** One game as the page draws it. */
function gameView(game: Game): unknown {
  const r = view(game);
  const who = whoMoves(game, r);
  const legal = who === "you" ? r.pos.legalMoves() : [];
  return {
    id: game.id,
    you: game.you,
    level: game.level,
    board: boardOf(game, r),
    placement: r.pos.placement(),
    last: r.last ? uci(r.last) : null,
    moveList: moveList(r.sans),
    sans: r.sans,
    who,
    inCheck: r.pos.inCheck(),
    result: game.result,
    resultText: game.result ? resultText(game) : null,
    drawOffered: drawOffered(game),
    canOfferDraw: who === "you" && game.moves.length >= 20,
    note: game.note ?? null,
    moves: legal.map((m) => ({
      from: squareName(m.from),
      to: squareName(m.to),
      promo: m.promo ? "nbrq"[m.promo - 2] : null,
      san: san(r.pos, m, legal),
      uci: uci(m),
    })),
    pgn: pgn(game, r),
  };
}

function namedGame(
  context: HandlerContext,
  input?: Record<string, unknown>,
): Game | null {
  return loadGame(String(input?.id ?? context.request?.query?.id ?? ""));
}

function chessGame(context: HandlerContext): HttpResponse {
  if (!signedIn(context)) return fail(401, "Sign in first");
  const game = namedGame(context);
  if (!game) return fail(404, "No such game");
  return ResponseBuilder.json(gameView(game));
}

/**
 * Runs a change from the page, then the agent's reply at once, and settles
 * the inbox: a move here withdraws the card it made stale and keeps new ones
 * back for a while.
 */
function onPage(
  context: HandlerContext,
  change: (game: Game, input: Record<string, unknown>, now: string) => void,
): HttpResponse {
  if (!signedIn(context)) return fail(401, "Sign in first");
  const input = body(context);
  const game = namedGame(context, input);
  if (!game) return fail(404, "No such game");
  const before = game.result;
  const now = new Date().toISOString();
  try {
    change(game, input, now);
    game.pageAt = now;
    think(game, THINK_ON_PAGE_MS);
  } catch (e) {
    saveGame(game);
    return fail(400, message(e));
  }
  noteResult(game, before);
  carryOut(game, settle(game, Date.now()));
  return ResponseBuilder.json(gameView(game));
}

function chessMove(context: HandlerContext): HttpResponse {
  return onPage(context, (game, input, now) => {
    const played = personMove(game, String(input.move ?? ""), now);
    if ("error" in played) throw new Error(played.error);
  });
}

function chessDraw(context: HandlerContext): HttpResponse {
  return onPage(context, (game, _input, now) => {
    if (drawOffered(game)) acceptDraw(game, now);
    else offerDraw(game, now);
  });
}

function chessResign(context: HandlerContext): HttpResponse {
  return onPage(context, (game, _input, now) => resign(game, now));
}

function chessNew(context: HandlerContext): HttpResponse {
  if (!signedIn(context)) return fail(401, "Sign in first");
  const input = body(context);
  const side = String(input.you ?? "");
  const you: Side =
    side === "w" || side === "b" ? side : Math.random() < 0.5 ? "w" : "b";
  try {
    const game = startGame(you);
    game.pageAt = new Date().toISOString();
    think(game, THINK_ON_PAGE_MS);
    carryOut(game, settle(game, Date.now()));
    return ResponseBuilder.json(gameView(game));
  } catch (e) {
    return fail(400, message(e));
  }
}

function chessDelete(context: HandlerContext): HttpResponse {
  if (!signedIn(context)) return fail(401, "Sign in first");
  const game = namedGame(context, body(context));
  if (!game) return fail(404, "No such game");
  dropGame(game);
  return ResponseBuilder.json({ ok: true });
}

function chessSaveSettings(context: HandlerContext): HttpResponse {
  if (!signedIn(context)) return fail(401, "Sign in first");
  const current = settings();
  try {
    const level = readLevel(body(context).level, current.level);
    writeJson("settings", { ...current, level });
    schedule(current.paused === true);
  } catch (e) {
    return fail(400, message(e));
  }
  return ResponseBuilder.json({ ok: true });
}

// The board as a picture, from the query alone: p (placement), l (last move),
// c (a king in check), f (Black at the bottom). Anyone may load it; it shows
// only what its URL says.
function chessBoard(context: HandlerContext): HttpResponse {
  const q = context.request?.query ?? {};
  const svg = boardSvg({
    placement: String(q.p ?? ""),
    last: q.l ? String(q.l) : undefined,
    check: q.c ? String(q.c) : undefined,
    flip: q.f === "1",
    size: q.s ? Number(q.s) : undefined,
  });
  if (!svg) return fail(400, "Not a board");
  return {
    status: 200,
    body: svg,
    contentType: "image/svg+xml",
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  };
}

function init(): void {
  registerContractTools();
  routeRegistry.registerRoute(PAGE, { file: "public/index.html" });
  routeRegistry.registerRoute(`${PAGE}/app.js`, { file: "public/app.js" });
  routeRegistry.registerRoute(BOARD, { handler: "chessBoard" });
  routeRegistry.registerRoute(`${PAGE}/state`, { handler: "chessState" });
  routeRegistry.registerRoute(`${PAGE}/game`, { handler: "chessGame" });
  for (const [path, handler] of [
    ["new", "chessNew"],
    ["move", "chessMove"],
    ["draw", "chessDraw"],
    ["resign", "chessResign"],
    ["delete", "chessDelete"],
    ["settings", "chessSaveSettings"],
  ]) {
    routeRegistry.registerRoute(`${PAGE}/${path}`, { handler, method: "POST" });
  }
}
