// The page.
//
// It draws one page of the list and then watches: every minute (sooner just
// after asking for a check) it asks the script how many unread articles
// arrived after the newest one it drew, and says so above the list rather
// than redrawing under the reader's eyes.

/**
 * @typedef {{
 *   id: string, headline: string, summary: string, originalTitle: string,
 *   link: string, source: string, published: string | null,
 *   addedAt?: string, filtered?: string, read: boolean
 * }} Article
 * @typedef {{ checkedAt: string, added: number, problem?: string }} FeedStatus
 * @typedef {{
 *   signedIn: boolean, granted?: boolean, consentUrl?: string | null,
 *   hasKey?: boolean, feeds?: string[], interests?: string,
 *   feedStatus?: Record<string, FeedStatus>,
 *   schedule?: { state: string, pausedReason: string | null,
 *     nextRunAt: string, lastRunAt: string | null } | null,
 *   unread?: number, filtered?: number, newSince?: number, latest?: string
 * }} State
 */

const POLL_MS = 60_000;
/** After "Check all now", how often and for how long to look. */
const EAGER_POLL_MS = 10_000;
const EAGER_FOR_MS = 3 * 60_000;
const TITLE = document.title;

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
  openFeeds: byId("open-feeds"),
  openKey: byId("open-key"),
  keyPanel: byId("key-panel"),
  key: /** @type {HTMLInputElement} */ (byId("key")),
  saveKey: /** @type {HTMLButtonElement} */ (byId("save-key")),
  forgetKey: /** @type {HTMLButtonElement} */ (byId("forget-key")),
  closeKey: byId("close-key"),
  keyStatus: byId("key-status"),
  grantLink: /** @type {HTMLAnchorElement} */ (byId("grant-link")),
  feedsPanel: byId("feeds-panel"),
  feeds: /** @type {HTMLTextAreaElement} */ (byId("feeds")),
  interests: /** @type {HTMLTextAreaElement} */ (byId("interests")),
  saveFeeds: /** @type {HTMLButtonElement} */ (byId("save-feeds")),
  closeFeeds: byId("close-feeds"),
  runNow: /** @type {HTMLButtonElement} */ (byId("run-now")),
  feedsStatus: byId("feeds-status"),
  feedStatus: byId("feed-status"),
  newBanner: byId("new-banner"),
  unreadCount: byId("unread-count"),
  listTitle: byId("list-title"),
  toggleFiltered: byId("toggle-filtered"),
  showReadChoice: byId("show-read-choice"),
  showRead: /** @type {HTMLInputElement} */ (byId("show-read")),
  markAll: /** @type {HTMLButtonElement} */ (byId("mark-all")),
  articles: byId("articles"),
  pager: byId("pager"),
  newer: /** @type {HTMLButtonElement} */ (byId("newer")),
  older: /** @type {HTMLButtonElement} */ (byId("older")),
  pageLabel: byId("page-label"),
  scheduleStatus: byId("schedule-status"),
};

const view = {
  page: 1,
  /**
   * The newest `addedAt` in the list as drawn; "new" is after this. "0" for
   * an empty list, so the first articles to arrive are new too.
   */
  listedUpTo: "0",
  /** Articles after this are marked fresh: new since the previous drawing. */
  freshAfter: "",
  eagerUntil: 0,
  /** Showing what was filtered out rather than the news. */
  filtered: false,
  /** @type {number | undefined} */
  timer: undefined,
  /** @type {State | null} */
  state: null,
};

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * @param {string} path
 * @param {unknown} [body] sent as JSON with a POST when given
 * @param {string} [method] instead of POST
 * @returns {Promise<any>}
 */
async function api(path, body, method) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : {
          method: method ?? "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  /** @type {any} */
  let answer = {};
  try {
    answer = await response.json();
  } catch {
    // A non-JSON body means something other than this script answered.
  }
  if (!response.ok) {
    // This script answers `{error: "text"}`; the engine its own envelope.
    const error = answer.error;
    throw new Error(
      typeof error === "string"
        ? error
        : (error?.message ?? `HTTP ${response.status}`),
    );
  }
  return answer;
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 */
function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {string} iso */
function ago(iso) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

/** @param {string} iso */
function timeOfDay(iso) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * @param {HTMLElement} node
 * @param {string} text
 * @param {boolean} [isError]
 */
function setStatus(node, text, isError) {
  node.textContent = text;
  node.classList.toggle("error", Boolean(isError));
}

/**
 * A notice with somewhere to go on the end of it. Built, not assigned as HTML,
 * so nothing that came from the server can become markup.
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

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

/** @param {Article} article */
function renderArticle(article) {
  const item = make("li");
  item.classList.toggle("read", article.read);
  item.classList.toggle(
    "fresh",
    !article.read &&
      Boolean(view.freshAfter) &&
      (article.addedAt ?? "") > view.freshAfter,
  );

  // The button leads the item, top right, so that reading down the list and
  // marking each one read never moves the pointer: with read articles hidden,
  // the next item's button slides up into the same place. Under Filtered it
  // is the way back instead.
  const button = /** @type {HTMLButtonElement} */ (
    make("button", "aw-button--secondary aw-button--small mark")
  );
  button.type = "button";
  if (view.filtered) {
    button.textContent = "Show it after all";
    button.title = "Back to the news, and remembered as what you want";
    button.addEventListener("click", () => {
      void sendVerdict(article, item, "want");
    });
  } else {
    button.textContent = article.read ? "Mark unread" : "Mark read";
    button.addEventListener("click", () => {
      void toggleRead(article, item, button);
    });
  }

  const headline = make("h3", "headline");
  const link = document.createElement("a");
  link.href = "/news-digest/open?id=" + encodeURIComponent(article.id);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = article.headline;
  // The script marks it read on the way through; the list follows suit, but
  // keeps it in place, dimmed, until the list is next drawn.
  link.addEventListener("click", () => setRead(item, button, true));
  headline.append(link);

  const header = make("div", "article-head");
  header.append(headline, button);

  const meta = make("div", "meta");
  if (article.filtered) meta.append(make("span", "reason", article.filtered));
  meta.append(make("span", "", article.source));
  if (article.published) {
    meta.append(
      make("span", "", new Date(article.published).toLocaleDateString()),
    );
  }
  meta.append(
    make("span", "original", `originally “${article.originalTitle}”`),
  );
  if (!view.filtered) {
    const skip = /** @type {HTMLButtonElement} */ (
      make("button", "aw-button--secondary aw-button--small skip")
    );
    skip.type = "button";
    skip.textContent = "Not interested";
    skip.title = "Moves it to Filtered, and fewer like it from now on";
    skip.addEventListener("click", () => {
      void sendVerdict(article, item, "skip");
    });
    meta.append(skip);
  }

  item.append(header, make("p", "summary", article.summary), meta);
  return item;
}

/**
 * File an article under Filtered ("skip") or bring it back ("want"); either
 * way it leaves the list in view, at once, and returns if refused.
 * @param {Article} article
 * @param {HTMLElement} item
 * @param {"skip" | "want"} verdict
 */
async function sendVerdict(article, item, verdict) {
  const next = item.nextSibling;
  const unread = !item.classList.contains("read");
  const counts = () => {
    if (!view.state) return;
    const sign = verdict === "skip" ? 1 : -1;
    view.state.filtered = Math.max(0, (view.state.filtered ?? 0) + sign);
    if (unread) {
      view.state.unread = Math.max(0, (view.state.unread ?? 0) - sign);
    }
    renderUnread();
  };
  item.remove();
  counts();
  try {
    await api("/news-digest/verdict", { id: article.id, verdict });
  } catch (e) {
    el.articles.insertBefore(item, next);
    verdict = verdict === "skip" ? "want" : "skip";
    counts();
    showNotice(e instanceof Error ? e.message : String(e));
    return;
  }
  if (el.articles.children.length === 0) await loadArticles();
}

/**
 * Mark one read or unread. Shown at once and sent behind it, so a run of
 * clicks is as fast as the reading; a refusal puts it back.
 * @param {Article} article
 * @param {HTMLElement} item
 * @param {HTMLButtonElement} button
 */
async function toggleRead(article, item, button) {
  const read = !item.classList.contains("read");
  const hide = read && !el.showRead.checked;
  const next = item.nextSibling;
  setRead(item, button, read);
  if (hide) item.remove();
  try {
    await api("/news-digest/read", { id: article.id, read });
  } catch (e) {
    setRead(item, button, !read);
    if (hide) el.articles.insertBefore(item, next);
    showNotice(e instanceof Error ? e.message : String(e));
    return;
  }
  // The last one on the page gone: bring in what was behind it.
  if (hide && el.articles.children.length === 0) await loadArticles();
}

/**
 * @param {HTMLElement} item
 * @param {HTMLButtonElement} button
 * @param {boolean} read
 */
function setRead(item, button, read) {
  const was = item.classList.contains("read");
  item.classList.toggle("read", read);
  item.classList.remove("fresh");
  button.textContent = read ? "Mark unread" : "Mark read";
  if (was === read || !view.state) return;
  view.state.unread = Math.max(0, (view.state.unread ?? 0) + (read ? -1 : 1));
  renderUnread();
}

function renderUnread() {
  const unread = view.state?.unread ?? 0;
  el.unreadCount.hidden = view.filtered || unread === 0;
  el.unreadCount.textContent = String(unread);
  const filtered = view.state?.filtered ?? 0;
  el.toggleFiltered.textContent = view.filtered
    ? "Back to news"
    : filtered
      ? `Filtered (${filtered})`
      : "Filtered";
}

/** Between the news and what was filtered out of it. */
function renderView() {
  el.listTitle.textContent = view.filtered ? "Filtered" : "News";
  el.toggleFiltered.setAttribute("aria-pressed", String(view.filtered));
  el.showReadChoice.hidden = view.filtered;
  el.markAll.hidden = view.filtered;
  renderUnread();
}

async function loadArticles() {
  const query = new URLSearchParams({ page: String(view.page) });
  if (view.filtered) query.set("filtered", "1");
  else if (el.showRead.checked) query.set("all", "1");
  /** @type {{ page: number, pages: number, total: number, articles: Article[] }} */
  const list = await api("/news-digest/articles?" + query);
  view.page = list.page;
  el.articles.replaceChildren(...list.articles.map(renderArticle));
  if (list.articles.length === 0) {
    const feeds = view.state?.feeds?.length ?? 0;
    el.articles.append(
      make(
        "li",
        "empty",
        view.filtered
          ? "Nothing filtered out."
          : feeds === 0
            ? "No feeds yet. Add some from Feeds and interests in the account menu."
            : el.showRead.checked
              ? "No articles yet. The first ones arrive within 15 minutes."
              : "Nothing unread.",
      ),
    );
  }
  el.pager.hidden = list.pages <= 1;
  el.newer.disabled = list.page <= 1;
  el.older.disabled = list.page >= list.pages;
  el.pageLabel.textContent = `Page ${list.page} of ${list.pages}`;
}

// ---------------------------------------------------------------------------
// State: permissions, feeds, schedule, and what is new
// ---------------------------------------------------------------------------

/** @param {State} state */
function renderState(state) {
  el.notice.hidden = true;
  if (!state.signedIn) {
    showNotice(
      "Sign in to read your digest.",
      "Sign in",
      "/auth/login?redirect=" + encodeURIComponent(location.pathname),
    );
    return;
  }
  // The engine's consent page, told to come back here whichever way the
  // person leaves it.
  const consent = state.consentUrl
    ? state.consentUrl + "&redirect=" + encodeURIComponent(location.pathname)
    : null;
  if (consent) {
    el.grantLink.hidden = false;
    el.grantLink.href = consent;
    el.grantLink.title = state.granted
      ? "What the digest may do while you are away."
      : "The digest has no permission to work while you are away yet.";
  }
  if (!state.granted) {
    showNotice(
      "The digest is put together while you are away, so it needs your " +
        "permission: personal storage, with write, and your secrets, for " +
        "your API key.",
      "Give permission",
      consent ?? "#",
    );
  } else if (!state.hasKey) {
    showNotice(
      "Summaries are written with your own Anthropic API key, and none is " +
        "stored yet.",
      "Add your key",
      "#key",
    );
  }
  renderKey(Boolean(state.hasKey));
  renderUnread();
  renderFeedStatus(state);
  renderSchedule(state);
}

/** @param {State} state */
function renderFeedStatus(state) {
  const status = state.feedStatus ?? {};
  el.feedStatus.replaceChildren(
    ...(state.feeds ?? []).map((url) => {
      const item = make("li");
      const last = status[url];
      const when = make(
        "span",
        "feed-when",
        !last
          ? "not read yet"
          : last.problem
            ? `${ago(last.checkedAt)}: ${last.problem}`
            : `${ago(last.checkedAt)} · ${last.added} new`,
      );
      when.classList.toggle("error", Boolean(last?.problem));
      item.append(make("span", "feed-url", url), when);
      return item;
    }),
  );
}

/** @param {State} state */
function renderSchedule(state) {
  const schedule = state.schedule;
  el.scheduleStatus.textContent = !state.feeds?.length
    ? ""
    : !schedule
      ? "Not scheduled: save the feeds again to start."
      : schedule.state === "active"
        ? `Next feed is read at ${timeOfDay(schedule.nextRunAt)}.`
        : `Paused (${schedule.pausedReason ?? "unknown"}).`;
}

/** @param {State} state */
function renderNew(state) {
  const count = state.newSince ?? 0;
  el.newBanner.hidden = count === 0;
  el.newBanner.textContent =
    count === 1
      ? "1 new article — show it"
      : `${count} new articles — show them`;
  document.title = count > 0 ? `(${count}) ${TITLE}` : TITLE;
}

async function refreshState() {
  /** @type {State} */
  const state = await api(
    "/news-digest/state?since=" + encodeURIComponent(view.listedUpTo),
  );
  view.state = state;
  renderState(state);
  return state;
}

/** Draw the list from the top, with everything up to now counted as seen. */
async function showLatest() {
  const state = await refreshState();
  view.freshAfter = view.listedUpTo;
  view.listedUpTo = state.latest || "0";
  view.page = 1;
  view.filtered = false;
  renderView();
  renderNew({ ...state, newSince: 0 });
  await loadArticles();
}

async function poll() {
  window.clearTimeout(view.timer);
  try {
    if (document.visibilityState === "visible") {
      const state = await refreshState();
      if (state.signedIn) renderNew(state);
    }
  } catch {
    // A missed poll is retried on the next one.
  }
  view.timer = window.setTimeout(
    poll,
    Date.now() < view.eagerUntil ? EAGER_POLL_MS : POLL_MS,
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The key
// ---------------------------------------------------------------------------

/** @param {boolean} hasKey */
function renderKey(hasKey) {
  el.forgetKey.hidden = !hasKey;
  el.key.placeholder = hasKey ? "A key is stored" : "sk-ant-...";
  setStatus(el.keyStatus, hasKey ? "Key stored." : "No key stored yet.");
}

function openKey() {
  el.key.value = "";
  el.keyPanel.hidden = false;
  el.key.focus();
}

el.openKey.addEventListener("click", openKey);
el.closeKey.addEventListener("click", () => {
  el.keyPanel.hidden = true;
});
// The notice's own link opens the panel rather than going anywhere.
el.notice.addEventListener("click", (event) => {
  const target = /** @type {HTMLElement} */ (event.target);
  if (target.closest('a[href="#key"]')) {
    event.preventDefault();
    openKey();
  }
});

el.saveKey.addEventListener("click", async () => {
  const key = el.key.value.trim();
  if (!key) {
    setStatus(el.keyStatus, "Paste a key first.", true);
    return;
  }
  el.saveKey.disabled = true;
  try {
    await api("/news-digest/key", { key });
    el.key.value = "";
    el.keyPanel.hidden = true;
    await refreshState();
  } catch (e) {
    setStatus(el.keyStatus, e instanceof Error ? e.message : String(e), true);
  } finally {
    el.saveKey.disabled = false;
  }
});

el.forgetKey.addEventListener("click", async () => {
  el.forgetKey.disabled = true;
  try {
    await api("/news-digest/key", {}, "DELETE");
    await refreshState();
  } catch (e) {
    setStatus(el.keyStatus, e instanceof Error ? e.message : String(e), true);
  } finally {
    el.forgetKey.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------------

function openFeeds() {
  el.feeds.value = (view.state?.feeds ?? []).join("\n");
  el.interests.value = view.state?.interests ?? "";
  setStatus(el.feedsStatus, "");
  el.feedsPanel.hidden = false;
  el.feeds.focus();
}

el.openFeeds.addEventListener("click", openFeeds);
el.closeFeeds.addEventListener("click", () => {
  el.feedsPanel.hidden = true;
});

el.saveFeeds.addEventListener("click", async () => {
  const feeds = el.feeds.value
    .split(/\s+/)
    .map((url) => url.trim())
    .filter((url) => url !== "");
  el.saveFeeds.disabled = true;
  setStatus(el.feedsStatus, "Saving…");
  try {
    await api("/news-digest/feeds", {
      feeds,
      interests: el.interests.value,
    });
    setStatus(
      el.feedsStatus,
      "Saved. New feeds are read now; interests apply to articles from now on.",
    );
    view.eagerUntil = Date.now() + EAGER_FOR_MS;
    await refreshState();
    void poll();
  } catch (e) {
    setStatus(el.feedsStatus, e instanceof Error ? e.message : String(e), true);
  } finally {
    el.saveFeeds.disabled = false;
  }
});

el.runNow.addEventListener("click", async () => {
  el.runNow.disabled = true;
  try {
    await api("/news-digest/run", {});
    setStatus(el.feedsStatus, "Reading every feed; new articles show above.");
    view.eagerUntil = Date.now() + EAGER_FOR_MS;
    void poll();
  } catch (e) {
    setStatus(el.feedsStatus, e instanceof Error ? e.message : String(e), true);
  } finally {
    el.runNow.disabled = false;
  }
});

el.newBanner.addEventListener("click", () => {
  void showLatest();
  window.scrollTo({ top: 0 });
});

el.toggleFiltered.addEventListener("click", () => {
  view.filtered = !view.filtered;
  view.page = 1;
  renderView();
  void loadArticles();
});

el.showRead.addEventListener("change", () => {
  view.page = 1;
  void loadArticles();
});

el.markAll.addEventListener("click", async () => {
  el.markAll.disabled = true;
  try {
    await api("/news-digest/read", { all: true });
    await showLatest();
  } catch (e) {
    showNotice(e instanceof Error ? e.message : String(e));
  } finally {
    el.markAll.disabled = false;
  }
});

el.newer.addEventListener("click", () => {
  view.page -= 1;
  void loadArticles().then(() => window.scrollTo({ top: 0 }));
});
el.older.addEventListener("click", () => {
  view.page += 1;
  void loadArticles().then(() => window.scrollTo({ top: 0 }));
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void poll();
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

(async () => {
  try {
    const state = await refreshState();
    if (!state.signedIn) {
      el.articles.replaceChildren();
      return;
    }
    view.listedUpTo = state.latest || "0";
    await loadArticles();
    // Nothing to read until there is something to read from.
    if (state.granted && !state.hasKey) openKey();
    else if (state.granted && !state.feeds?.length) openFeeds();
    view.timer = window.setTimeout(poll, POLL_MS);
  } catch (e) {
    el.articles.replaceChildren(
      make("li", "empty", e instanceof Error ? e.message : String(e)),
    );
  }
})();
