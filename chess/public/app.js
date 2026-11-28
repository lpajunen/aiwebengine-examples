// The page: the person's games, and one game to play on. Redrawn from
// /chess/state (and /chess/game for the open game) after every change, and
// every 30 seconds while a game waits for the agent or the inbox.
//
// The board is the same picture the inbox shows (/chess/board.svg) with a
// grid of buttons over it: choose one of your pieces, then where it goes.
// The server sends the legal moves, so this page knows no chess.
//
// A plain script, not a module: it has to run while the page is parsed,
// before the engine's account menu takes #grant-link out of the document.
// Wrapped in a function so its names stay its own. Everything is set as text.

/**
 * @typedef {{ id: string, you: "w" | "b", level: number, moves: number,
 *   result: string | null, updatedAt: string, where: string }} GameSummary
 * @typedef {{
 *   signedIn: boolean, granted?: boolean, consentUrl?: string | null,
 *   inboxAvailable?: boolean,
 *   inbox?: { syncedAt: string | null, problem: string | null } | null,
 *   level?: number, paused?: boolean, maxActive?: number,
 *   games?: GameSummary[],
 *   status?: { checkedAt: string, problem?: string } | null
 * }} ChessState
 * @typedef {{ from: string, to: string, promo: string | null, san: string,
 *   uci: string }} LegalMove
 * @typedef {{ id: string, you: "w" | "b", level: number, board: string,
 *   placement: string, last: string | null, moveList: string,
 *   sans: string[], who: "you" | "agent" | "over", inCheck: boolean,
 *   result: string | null, resultText: string | null,
 *   drawOffered: boolean, canOfferDraw: boolean, note: string | null,
 *   moves: LegalMove[], pgn: string }} GameView
 */

(function () {
  const POLL_MS = 30_000;

  /**
   * @template {HTMLElement} T
   * @param {string} id
   * @returns {T}
   */
  function byId(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`#${id} is missing`);
    return /** @type {T} */ (node);
  }

  const el = {
    notice: byId("notice"),
    grantLink: /** @type {HTMLAnchorElement} */ (byId("grant-link")),
    listView: byId("list-view"),
    gameView: byId("game-view"),
    games: byId("games"),
    level: /** @type {HTMLSelectElement} */ (byId("level")),
    newStatus: byId("new-status"),
    back: byId("back"),
    boardImg: /** @type {HTMLImageElement} */ (byId("board-img")),
    grid: byId("grid"),
    promote: byId("promote"),
    turn: byId("turn"),
    note: byId("game-note"),
    moveForm: /** @type {HTMLFormElement} */ (byId("move-form")),
    moveText: /** @type {HTMLInputElement} */ (byId("move-text")),
    draw: /** @type {HTMLButtonElement} */ (byId("draw")),
    resign: /** @type {HTMLButtonElement} */ (byId("resign")),
    remove: /** @type {HTMLButtonElement} */ (byId("delete")),
    gameStatus: byId("game-status"),
    moves: byId("moves"),
    pgn: /** @type {HTMLAnchorElement} */ (byId("pgn")),
  };

  /** @type {GameView | null} */
  let game = null;
  /** @type {string | null} */
  let selected = null;
  /** @type {LegalMove[]} */
  let promoting = [];
  let busy = false;
  let resignArmed = false;

  /**
   * @param {string} path
   * @param {unknown} [body]
   * @returns {Promise<any>}
   */
  async function call(path, body) {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  /**
   * @param {HTMLElement} node
   * @param {string} text
   * @param {boolean} [error]
   */
  function say(node, text, error) {
    node.textContent = text;
    node.classList.toggle("error", Boolean(error));
  }

  /** @param {string} iso */
  function when(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  }

  function gameIdInUrl() {
    return new URLSearchParams(location.search).get("game");
  }

  /** @param {string | null} id */
  function setUrl(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set("game", id);
    else url.searchParams.delete("game");
    history.pushState(null, "", url);
  }

  // ==========================================================================
  // The list
  // ==========================================================================

  /** @param {ChessState} state */
  function drawState(state) {
    if (!state.signedIn) {
      el.notice.hidden = false;
      el.notice.textContent = "Sign in to play.";
      el.listView.hidden = true;
      el.gameView.hidden = true;
      return;
    }
    const notes = [];
    if (!state.granted) {
      notes.push(
        "Give the agent permission to play while you are away, so your moves can come to your inbox.",
      );
    }
    if (!state.inboxAvailable) {
      notes.push("No agent inbox is connected, so you can play here only.");
    }
    if (state.inbox?.problem) notes.push(state.inbox.problem);
    el.notice.hidden = notes.length === 0;
    el.notice.textContent = notes.join(" ");
    if (state.consentUrl && !state.granted) {
      el.grantLink.href = state.consentUrl + "&redirect=/chess";
      el.grantLink.hidden = false;
    }
    el.level.value = String(state.level ?? 2);

    el.games.replaceChildren();
    const games = state.games ?? [];
    if (games.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No games yet. Start one below.";
      el.games.append(li);
    }
    for (const g of games) {
      const li = document.createElement("li");
      const text = document.createElement("div");
      const title = document.createElement("div");
      title.textContent = `You play ${g.you === "w" ? "White" : "Black"} · level ${g.level} · ${Math.ceil(g.moves / 2)} moves`;
      const sub = document.createElement("div");
      sub.className = "when";
      sub.textContent = `${g.where} · ${when(g.updatedAt)}`;
      text.append(title, sub);
      const open = document.createElement("button");
      open.type = "button";
      open.className = "aw-button";
      open.textContent = g.result ? "View" : "Play";
      open.addEventListener("click", () => openGame(g.id));
      li.append(text, open);
      el.games.append(li);
    }
  }

  async function refreshList() {
    try {
      drawState(await call("/chess/state"));
    } catch (e) {
      say(el.newStatus, String(e instanceof Error ? e.message : e), true);
    }
  }

  // ==========================================================================
  // One game
  // ==========================================================================

  /** The square shown at a grid cell, given which side is at the bottom. */
  function squareAt(/** @type {number} */ cell, /** @type {boolean} */ flip) {
    const row = Math.floor(cell / 8);
    const col = cell % 8;
    const file = flip ? 7 - col : col;
    const rank = flip ? row + 1 : 8 - row;
    return "abcdefgh"[file] + String(rank);
  }

  function drawBoard() {
    if (!game) return;
    el.boardImg.src = game.board;
    el.boardImg.alt = `The board. ${game.moveList || "The game starts."}`;
    const flip = game.you === "b";
    const mine = new Set(game.moves.map((m) => m.from));
    const targets = new Set(
      game.moves.filter((m) => m.from === selected).map((m) => m.to),
    );
    el.grid.replaceChildren();
    for (let cell = 0; cell < 64; cell++) {
      const square = squareAt(cell, flip);
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", square);
      if (mine.has(square)) b.classList.add("mine");
      if (square === selected) b.classList.add("selected");
      if (targets.has(square)) b.classList.add("target");
      b.addEventListener("click", () => onSquare(square));
      el.grid.append(b);
    }
  }

  /** @param {string} square */
  function onSquare(square) {
    if (!game || busy || game.who !== "you") return;
    if (selected) {
      const found = game.moves.filter(
        (m) => m.from === selected && m.to === square,
      );
      if (found.length === 1) {
        play(found[0].uci);
        return;
      }
      if (found.length > 1) {
        promoting = found;
        el.promote.hidden = false;
        return;
      }
    }
    promoting = [];
    el.promote.hidden = true;
    selected = game.moves.some((m) => m.from === square) ? square : null;
    drawBoard();
  }

  /** @param {GameView} g */
  function drawGame(g) {
    game = g;
    selected = null;
    promoting = [];
    resignArmed = false;
    el.promote.hidden = true;
    el.listView.hidden = true;
    el.gameView.hidden = false;
    drawBoard();
    const side = g.you === "w" ? "White" : "Black";
    let turn;
    if (g.result) turn = `${g.resultText} (${g.result})`;
    else if (g.who === "agent") turn = "The agent is thinking…";
    else if (g.drawOffered) turn = "Your move. The agent offers a draw.";
    else turn = g.inCheck ? "Your move. You are in check." : "Your move.";
    el.turn.textContent = turn;
    say(el.note, g.note ?? `You play ${side} against level ${g.level}.`);
    const playing = g.who === "you";
    el.moveForm.hidden = !playing;
    el.draw.hidden = !playing || !(g.drawOffered || g.canOfferDraw);
    el.draw.textContent = g.drawOffered ? "Accept the draw" : "Offer a draw";
    el.resign.hidden = Boolean(g.result);
    el.resign.textContent = "Resign";
    el.remove.hidden = !g.result;
    el.moves.textContent = g.moveList || "No moves yet.";
    el.pgn.href =
      "data:application/x-chess-pgn;charset=utf-8," + encodeURIComponent(g.pgn);
    say(el.gameStatus, "");
  }

  /** @param {string} id */
  async function openGame(id) {
    try {
      drawGame(await call(`/chess/game?id=${encodeURIComponent(id)}`));
      setUrl(id);
    } catch (e) {
      say(el.newStatus, String(e instanceof Error ? e.message : e), true);
      showList();
    }
  }

  /**
   * @param {string} path
   * @param {Record<string, unknown>} body
   * @param {string} doing
   */
  async function act(path, body, doing) {
    if (!game || busy) return;
    busy = true;
    say(el.gameStatus, doing);
    try {
      drawGame(await call(path, { id: game.id, ...body }));
    } catch (e) {
      say(el.gameStatus, String(e instanceof Error ? e.message : e), true);
    } finally {
      busy = false;
    }
  }

  /** @param {string} move */
  function play(move) {
    el.moveText.value = "";
    void act("/chess/move", { move }, "The agent is thinking…");
  }

  function showList() {
    game = null;
    el.gameView.hidden = true;
    el.listView.hidden = false;
    void refreshList();
  }

  // ==========================================================================
  // Wiring
  // ==========================================================================

  for (const b of document.querySelectorAll("[data-new]")) {
    b.addEventListener("click", async () => {
      say(el.newStatus, "Starting…");
      try {
        const g = await call("/chess/new", {
          you: /** @type {HTMLElement} */ (b).dataset.new,
        });
        say(el.newStatus, "");
        drawGame(g);
        setUrl(g.id);
      } catch (e) {
        say(el.newStatus, String(e instanceof Error ? e.message : e), true);
      }
    });
  }

  for (const b of document.querySelectorAll("[data-promo]")) {
    b.addEventListener("click", () => {
      const promo = /** @type {HTMLElement} */ (b).dataset.promo;
      const move = promoting.find((m) => m.promo === promo);
      if (move) play(move.uci);
    });
  }

  el.level.addEventListener("change", async () => {
    try {
      await call("/chess/settings", { level: Number(el.level.value) });
      say(el.newStatus, "Saved: new games start at this level.");
    } catch (e) {
      say(el.newStatus, String(e instanceof Error ? e.message : e), true);
    }
  });

  el.moveForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = el.moveText.value.trim();
    if (text) play(text);
  });

  el.draw.addEventListener("click", () => {
    void act("/chess/draw", {}, game?.drawOffered ? "Accepting…" : "Offering…");
  });

  el.resign.addEventListener("click", () => {
    if (!resignArmed) {
      resignArmed = true;
      el.resign.textContent = "Resign: are you sure?";
      return;
    }
    void act("/chess/resign", {}, "Resigning…");
  });

  el.remove.addEventListener("click", async () => {
    if (!game) return;
    try {
      await call("/chess/delete", { id: game.id });
      setUrl(null);
      showList();
    } catch (e) {
      say(el.gameStatus, String(e instanceof Error ? e.message : e), true);
    }
  });

  el.back.addEventListener("click", () => {
    setUrl(null);
    showList();
  });

  window.addEventListener("popstate", () => {
    const id = gameIdInUrl();
    if (id) void openGame(id);
    else showList();
  });

  setInterval(() => {
    if (document.hidden || busy) return;
    if (game) {
      if (game.who !== "you" && !game.result) void openGame(game.id);
    } else {
      void refreshList();
    }
  }, POLL_MS);

  void refreshList().then(() => {
    const id = gameIdInUrl();
    if (id) void openGame(id);
  });
})();
