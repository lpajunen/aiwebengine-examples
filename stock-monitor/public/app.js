// The page: the watchlist with the day's moves, the Recommended lists and
// the stocks to look at, redrawn from /stock-monitor/state after every change
// and every minute.
//
// A plain script, not a module: it has to run while the page is parsed,
// before the engine's account menu takes its items (#grant-link and the
// panel buttons) out of the document. Wrapped in a function so its names stay
// its own.

/**
 * @typedef {{ symbol: string, threshold: number, group?: string }} StockWatched
 * @typedef {{ name: string | null, stocks: StockWatched[] }} StockGroup
 * @typedef {{ price: number, changePct: number, previousClose: number,
 *   at: string }} StockQuote
 * @typedef {{ symbol: string, at: string, price: number | null }} StockRecommended
 * @typedef {{
 *   signedIn: boolean, granted?: boolean, consentUrl?: string | null,
 *   hasKey?: boolean, hasAiKey?: boolean, canPost?: boolean, inboxAvailable?: boolean,
 *   inbox?: { syncedAt: string | null, problem: string | null } | null,
 *   watchlist?: StockWatched[], groups?: StockGroup[], watchlistText?: string, dailyHourUtc?: number,
 *   quotes?: Record<string, StockQuote>,
 *   lists?: { buy: StockRecommended[], sell: StockRecommended[] },
 *   candidates?: string[],
 *   status?: { checkedAt: string, problem?: string } | null,
 *   schedule?: { state: string, pausedReason: string | null,
 *     nextRunAt: string, lastRunAt: string | null } | null
 * }} StockState
 */

(function () {
  const POLL_MS = 60_000;

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
    openSettings: byId("open-settings"),
    openKey: byId("open-key"),
    keyPanel: byId("key-panel"),
    key: /** @type {HTMLInputElement} */ (byId("key")),
    saveKey: /** @type {HTMLButtonElement} */ (byId("save-key")),
    forgetKey: /** @type {HTMLButtonElement} */ (byId("forget-key")),
    closeKey: byId("close-key"),
    keyStatus: byId("key-status"),
    aiKey: /** @type {HTMLInputElement} */ (byId("ai-key")),
    saveAiKey: /** @type {HTMLButtonElement} */ (byId("save-ai-key")),
    forgetAiKey: /** @type {HTMLButtonElement} */ (byId("forget-ai-key")),
    aiKeyStatus: byId("ai-key-status"),
    settingsPanel: byId("settings-panel"),
    watchlist: /** @type {HTMLTextAreaElement} */ (byId("watchlist")),
    dailyHour: /** @type {HTMLInputElement} */ (byId("daily-hour")),
    saveSettings: /** @type {HTMLButtonElement} */ (byId("save-settings")),
    closeSettings: byId("close-settings"),
    runNow: /** @type {HTMLButtonElement} */ (byId("run-now")),
    settingsStatus: byId("settings-status"),
    inboxStatus: byId("inbox-status"),
    stocks: byId("stocks"),
    buy: byId("buy"),
    sell: byId("sell"),
    candidatesPanel: byId("candidates-panel"),
    candidates: byId("candidates"),
    runStatus: byId("run-status"),
  };

  /** @type {StockState} */
  let state = { signedIn: false };

  /**
   * @param {string} path
   * @param {string} [method]
   * @param {unknown} [payload]
   */
  async function api(path, method = "GET", payload) {
    const response = await fetch(path, {
      method,
      headers: payload ? { "content-type": "application/json" } : {},
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(answer.error || `HTTP ${response.status}`);
    return answer;
  }

  /**
   * @param {HTMLElement} node
   * @param {string} text
   * @param {boolean} [isError]
   */
  function say(node, text, isError) {
    node.textContent = text;
    node.classList.toggle("error", Boolean(isError));
  }

  /**
   * A notice with somewhere to go on the end of it, built rather than assigned
   * as HTML so nothing from the server becomes markup.
   * @param {string} text
   * @param {string} [label]
   * @param {string} [href]
   */
  function showNotice(text, label, href) {
    el.notice.textContent = text;
    if (label && href) {
      el.notice.append(" ");
      const link = document.createElement("a");
      link.href = href;
      link.textContent = label;
      el.notice.append(link);
    }
    el.notice.hidden = false;
  }

  /**
   * @param {string} tag
   * @param {string} [text]
   * @param {string} [className]
   */
  function make(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  /** @param {number} pct */
  function signed(pct) {
    const sign = pct > 0 ? "+" : pct < 0 ? "−" : "±";
    return `${sign}${Math.abs(pct).toFixed(1)} %`;
  }

  /** @param {number} price */
  function money(price) {
    return price.toFixed(price < 1 ? 4 : 2);
  }

  /** @param {string} iso */
  function when(iso) {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  /** @param {string} symbol */
  function symbolCell(symbol) {
    const cell = make("span", undefined, "symbol");
    const link = make("a", symbol);
    link.setAttribute(
      "href",
      `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
    );
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener");
    cell.append(link);
    return cell;
  }

  /** @param {string} symbol */
  function listOf(symbol) {
    const lists = state.lists ?? { buy: [], sell: [] };
    if (lists.buy.some((r) => r.symbol === symbol)) return "buy";
    if (lists.sell.some((r) => r.symbol === symbol)) return "sell";
    return null;
  }

  /**
   * @param {string} symbol
   * @param {"buy" | "sell" | null} list
   */
  async function setList(symbol, list) {
    try {
      const answer = await api("/stock-monitor/recommend", "POST", {
        symbol,
        list,
      });
      state.lists = answer.lists;
      render();
    } catch (e) {
      say(el.runStatus, String(e instanceof Error ? e.message : e), true);
    }
  }

  /** @param {string} symbol */
  function choices(symbol) {
    const current = listOf(symbol);
    const box = make("span", undefined, "choices");
    /** @type {[string, "buy" | "sell", string][]} */
    const options = [
      ["Buy", "buy", "aw-button--small"],
      ["Sell", "sell", "aw-button--small aw-button--secondary"],
    ];
    for (const [label, list, className] of options) {
      const button = make("button", label, className);
      const pressed = current === list;
      button.setAttribute("aria-pressed", String(pressed));
      button.title = pressed
        ? `On Recommended ${list}; press to take it off`
        : `Put on Recommended ${list}`;
      button.addEventListener("click", () =>
        setList(symbol, pressed ? null : list),
      );
      box.append(button);
    }
    return box;
  }

  function renderStocks() {
    el.stocks.replaceChildren();
    const watchlist = state.watchlist ?? [];
    if (watchlist.length === 0) {
      el.stocks.append(
        make(
          "li",
          "No stocks yet. Add some under Watchlist in the menu.",
          "empty",
        ),
      );
      return;
    }
    const groups = state.groups ?? [{ name: null, stocks: watchlist }];
    for (const group of groups) {
      if (group.name !== null) {
        el.stocks.append(make("li", group.name, "group"));
      }
      for (const w of group.stocks) {
        const q = state.quotes?.[w.symbol];
        const li = make("li");
        li.append(symbolCell(w.symbol));
        if (q) {
          const past = Math.abs(q.changePct) >= w.threshold;
          const price = make(
            "span",
            `${money(q.price)}  ${signed(q.changePct)}`,
            `price ${q.changePct > 0 ? "up" : q.changePct < 0 ? "down" : ""}${past ? " alert" : ""}`,
          );
          price.title = `Previous close ${money(q.previousClose)}; alert at ±${w.threshold} %; ${when(q.at)}`;
          li.append(price);
        } else {
          li.append(make("span", "No quote yet", "price empty"));
        }
        li.append(make("span", undefined, "spacer"), choices(w.symbol));
        el.stocks.append(li);
      }
    }
  }

  /**
   * @param {HTMLElement} node
   * @param {StockRecommended[]} entries
   */
  function renderList(node, entries) {
    node.replaceChildren();
    if (entries.length === 0) {
      node.append(make("li", "Nothing yet.", "empty"));
      return;
    }
    for (const r of entries) {
      const li = make("li");
      li.append(symbolCell(r.symbol));
      const q = state.quotes?.[r.symbol];
      const since =
        r.price && q
          ? ` · ${signed(((q.price - r.price) / r.price) * 100)} since`
          : "";
      li.append(
        make(
          "span",
          `${new Date(r.at).toLocaleDateString()}${r.price ? ` at ${money(r.price)}` : ""}${since}`,
          "status",
        ),
      );
      li.append(make("span", undefined, "spacer"));
      const off = make(
        "button",
        "Remove",
        "aw-button--small aw-button--secondary",
      );
      off.addEventListener("click", () => setList(r.symbol, null));
      li.append(off);
      node.append(li);
    }
  }

  function renderCandidates() {
    const candidates = state.candidates ?? [];
    el.candidatesPanel.hidden = candidates.length === 0;
    el.candidates.replaceChildren();
    for (const symbol of candidates) {
      const li = make("li");
      li.append(symbolCell(symbol), make("span", undefined, "spacer"));
      /** @type {[string, string, string][]} */
      const verdicts = [
        ["Follow", "follow", "aw-button--small"],
        ["Not interested", "dismiss", "aw-button--small aw-button--secondary"],
      ];
      for (const [label, verdict, className] of verdicts) {
        const button = make("button", label, className);
        button.addEventListener("click", async () => {
          try {
            await api("/stock-monitor/candidate", "POST", { symbol, verdict });
            await refresh();
          } catch (e) {
            say(el.runStatus, String(e instanceof Error ? e.message : e), true);
          }
        });
        li.append(button);
      }
      el.candidates.append(li);
    }
  }

  function renderStatus() {
    const parts = [];
    if (state.status) {
      parts.push(`Checked ${when(state.status.checkedAt)}.`);
      if (state.status.problem) parts.push(state.status.problem);
    }
    const schedule = state.schedule;
    if (schedule?.state === "paused") {
      parts.push(`Paused: ${schedule.pausedReason ?? "no reason given"}.`);
    } else if (schedule) {
      parts.push(`Next check ${when(schedule.nextRunAt)}.`);
    }
    say(el.runStatus, parts.join(" "), Boolean(state.status?.problem));

    el.inboxStatus.hidden = !state.inboxAvailable && !state.inbox;
    if (state.inbox?.problem) {
      say(el.inboxStatus, state.inbox.problem, true);
    } else if (state.inboxAvailable) {
      say(
        el.inboxStatus,
        "Alerts, the day's watchlist and stocks to look at also go to your " +
          "inbox, and what you answer there counts here." +
          (state.inbox?.syncedAt
            ? ` Last reached ${when(state.inbox.syncedAt)}.`
            : ""),
      );
    } else if (!state.canPost) {
      el.inboxStatus.hidden = false;
      say(
        el.inboxStatus,
        "To send cards to an agent inbox, include Tools in the permissions.",
      );
    }
  }

  function render() {
    el.notice.hidden = true;
    if (!state.signedIn) {
      showNotice(
        "Sign in to see your watchlist.",
        "Sign in",
        "/auth/login?redirect=" + encodeURIComponent(location.pathname),
      );
      el.stocks.replaceChildren();
      return;
    }
    const consent = state.consentUrl
      ? state.consentUrl + "&redirect=" + encodeURIComponent(location.pathname)
      : null;
    if (consent) {
      el.grantLink.hidden = false;
      el.grantLink.href = consent;
    }
    if (!state.granted) {
      showNotice(
        "The watchlist is checked while you are away, so it needs your " +
          "permission: personal storage, with write, and your secrets, for " +
          "your Finnhub key.",
        "Give permission",
        consent ?? "#",
      );
    } else if (!state.hasKey) {
      showNotice("Quotes need your own Finnhub key.", "Add your key", "#key");
    }
    el.forgetKey.hidden = !state.hasKey;
    el.forgetAiKey.hidden = !state.hasAiKey;
    renderStocks();
    renderList(el.buy, state.lists?.buy ?? []);
    renderList(el.sell, state.lists?.sell ?? []);
    renderCandidates();
    renderStatus();
  }

  async function refresh() {
    try {
      state = await api("/stock-monitor/state");
      render();
    } catch (e) {
      say(el.runStatus, String(e instanceof Error ? e.message : e), true);
    }
  }

  function openSettings() {
    el.watchlist.value = state.watchlistText ?? "";
    el.dailyHour.value = String(state.dailyHourUtc ?? 21);
    el.settingsPanel.hidden = false;
    el.watchlist.focus();
  }

  function openKey() {
    el.keyPanel.hidden = false;
    el.key.focus();
  }

  el.openSettings.addEventListener("click", openSettings);
  el.closeSettings.addEventListener("click", () => {
    el.settingsPanel.hidden = true;
  });
  el.openKey.addEventListener("click", openKey);
  el.closeKey.addEventListener("click", () => {
    el.keyPanel.hidden = true;
  });
  // The notice's own "#key" link opens the panel rather than going anywhere.
  el.notice.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.getAttribute("href") === "#key") {
      event.preventDefault();
      openKey();
    }
  });

  el.saveSettings.addEventListener("click", async () => {
    el.saveSettings.disabled = true;
    try {
      const answer = await api("/stock-monitor/watchlist", "POST", {
        text: el.watchlist.value,
        dailyHourUtc: Number(el.dailyHour.value),
      });
      say(el.settingsStatus, `Saved ${answer.count} stocks.`);
      await refresh();
    } catch (e) {
      say(el.settingsStatus, String(e instanceof Error ? e.message : e), true);
    } finally {
      el.saveSettings.disabled = false;
    }
  });

  el.runNow.addEventListener("click", async () => {
    try {
      await api("/stock-monitor/run", "POST");
      say(el.settingsStatus, "Checking; quotes appear in a moment.");
      setTimeout(refresh, 8_000);
    } catch (e) {
      say(el.settingsStatus, String(e instanceof Error ? e.message : e), true);
    }
  });

  el.saveKey.addEventListener("click", async () => {
    try {
      await api("/stock-monitor/key", "POST", { key: el.key.value });
      el.key.value = "";
      say(el.keyStatus, "Saved.");
      await refresh();
    } catch (e) {
      say(el.keyStatus, String(e instanceof Error ? e.message : e), true);
    }
  });

  el.forgetKey.addEventListener("click", async () => {
    try {
      await api("/stock-monitor/key", "DELETE");
      say(el.keyStatus, "Removed.");
      await refresh();
    } catch (e) {
      say(el.keyStatus, String(e instanceof Error ? e.message : e), true);
    }
  });

  el.saveAiKey.addEventListener("click", async () => {
    try {
      await api("/stock-monitor/key", "POST", {
        key: el.aiKey.value,
        which: "ai",
      });
      el.aiKey.value = "";
      say(el.aiKeyStatus, "Saved.");
      await refresh();
    } catch (e) {
      say(el.aiKeyStatus, String(e instanceof Error ? e.message : e), true);
    }
  });

  el.forgetAiKey.addEventListener("click", async () => {
    try {
      await api("/stock-monitor/key?which=ai", "DELETE");
      say(el.aiKeyStatus, "Removed.");
      await refresh();
    } catch (e) {
      say(el.aiKeyStatus, String(e instanceof Error ? e.message : e), true);
    }
  });

  refresh().then(() => {
    if (state.granted && !state.hasKey) openKey();
    else if (state.granted && !(state.watchlist ?? []).length) openSettings();
  });
  setInterval(refresh, POLL_MS);
})();
