// The page: the settings, what waits for an answer in the agent inbox, and
// what was changed on GitHub, redrawn from /backlog-groomer/state after every
// change and every minute.
//
// A plain script, not a module: it has to run while the page is parsed,
// before the engine's account menu takes its items (#grant-link and the key
// links) out of the document. Wrapped in a function so its names stay its own.

/**
 * @typedef {{ kind: string, repo: string, number: number, title: string,
 *   url: string }} GroomerProposal
 * @typedef {GroomerProposal & { at: string, labels: string[] }} GroomerChange
 * @typedef {{
 *   signedIn: boolean, granted?: boolean, consentUrl?: string | null,
 *   inboxAvailable?: boolean,
 *   inbox?: { syncedAt: string | null, problem: string | null } | null,
 *   hasGitHubToken?: boolean, gitHubTokenUrl?: string,
 *   hasModelKey?: boolean, modelKeyUrl?: string,
 *   repos?: string[], staleDays?: number, dailyHourUtc?: number,
 *   paused?: boolean,
 *   proposals?: GroomerProposal[], applied?: GroomerChange[],
 *   status?: { checkedAt: string, problem?: string } | null,
 *   schedule?: { state: string, pausedReason: string | null,
 *     nextRunAt: string, lastRunAt: string | null } | null
 * }} GroomerState
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
    tokenLink: /** @type {HTMLAnchorElement} */ (byId("token-link")),
    modelKeyLink: /** @type {HTMLAnchorElement} */ (byId("model-key-link")),
    repos: /** @type {HTMLTextAreaElement} */ (byId("repos")),
    staleDays: /** @type {HTMLInputElement} */ (byId("stale-days")),
    dailyHour: /** @type {HTMLInputElement} */ (byId("daily-hour")),
    save: /** @type {HTMLButtonElement} */ (byId("save")),
    runNow: /** @type {HTMLButtonElement} */ (byId("run-now")),
    saveStatus: byId("save-status"),
    keysStatus: byId("keys-status"),
    proposals: byId("proposals"),
    applied: byId("applied"),
    runStatus: byId("run-status"),
  };

  /** @type {GroomerState} */
  let state = { signedIn: false };
  /** Whether the settings fields were filled from the server yet. */
  let filled = false;

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

  /** @param {string} iso */
  function when(iso) {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  /** @param {GroomerProposal} p */
  function issueLink(p) {
    const link = make("a", `${p.repo}#${p.number}`);
    link.setAttribute("href", p.url);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener");
    return link;
  }

  /** @type {Record<string, string>} */
  const PROPOSED = {
    stale: "Close as stale",
    duplicate: "Close as a duplicate",
    label: "Add labels",
  };

  /** @param {GroomerChange} c */
  function changeText(c) {
    if (c.kind === "label") {
      return c.labels.length > 0
        ? `Added ${c.labels.join(", ")}`
        : "Had the labels already";
    }
    return c.kind === "duplicate" ? "Closed as a duplicate" : "Closed as stale";
  }

  /**
   * @param {HTMLElement} list
   * @param {HTMLElement[]} rows
   * @param {string} empty
   */
  function fill(list, rows, empty) {
    list.replaceChildren(
      ...(rows.length > 0 ? rows : [make("li", empty, "empty")]),
    );
  }

  function render() {
    el.notice.hidden = true;
    if (!state.signedIn) {
      showNotice(
        "Sign in to groom your backlog.",
        "Sign in",
        "/auth/login?redirect=" + encodeURIComponent(location.pathname),
      );
      el.proposals.replaceChildren();
      return;
    }
    const consent = state.consentUrl
      ? state.consentUrl + "&redirect=" + encodeURIComponent(location.pathname)
      : null;
    if (consent) {
      el.grantLink.hidden = false;
      el.grantLink.href = consent;
    }
    // Keys are entered on the engine's own page, so this page never sees them.
    if (state.gitHubTokenUrl) {
      el.tokenLink.hidden = false;
      el.tokenLink.href = state.gitHubTokenUrl;
    }
    if (state.modelKeyUrl) {
      el.modelKeyLink.hidden = false;
      el.modelKeyLink.href = state.modelKeyUrl;
    }
    if (!state.granted) {
      showNotice(
        "The groomer works while you are away, so it needs your permission: " +
          "personal storage with write, your secrets for the keys, and tools " +
          "to reach your agent inbox.",
        "Give permission",
        consent ?? "#",
      );
    } else if (!state.hasGitHubToken && state.gitHubTokenUrl) {
      showNotice(
        "It needs a fine-grained GitHub token with Issues read and write on " +
          "your repositories.",
        "Add your token",
        state.gitHubTokenUrl,
      );
    } else if (!state.inboxAvailable) {
      showNotice(
        "No agent inbox is reachable: proposals are made there, so the " +
          "groomer waits until there is one.",
      );
    }

    if (!filled) {
      el.repos.value = (state.repos ?? []).join("\n");
      el.staleDays.value = String(state.staleDays ?? 180);
      el.dailyHour.value = String(state.dailyHourUtc ?? 6);
      filled = true;
    }
    say(
      el.keysStatus,
      state.hasModelKey
        ? "Duplicates and labels are judged with your Anthropic key."
        : "Without an Anthropic key only stale issues are proposed; add one " +
            "from the menu for duplicates and labels.",
    );

    fill(
      el.proposals,
      (state.proposals ?? []).map((p) => {
        const row = make("li");
        row.append(issueLink(p), ` ${PROPOSED[p.kind] ?? p.kind}: ${p.title}`);
        return row;
      }),
      "Nothing is waiting.",
    );
    fill(
      el.applied,
      (state.applied ?? []).map((c) => {
        const row = make("li");
        row.append(
          issueLink(c),
          ` ${changeText(c)}: ${c.title} `,
          make("span", when(c.at), "when"),
        );
        return row;
      }),
      "Nothing yet.",
    );

    const problem = state.inbox?.problem ?? state.status?.problem ?? null;
    if (problem) {
      say(el.runStatus, problem, true);
    } else if (state.paused) {
      say(el.runStatus, "Paused from your agent inbox.");
    } else if (state.schedule) {
      say(
        el.runStatus,
        (state.schedule.lastRunAt
          ? `Last run ${when(state.schedule.lastRunAt)}. `
          : "") + `Next run ${when(state.schedule.nextRunAt)}.`,
      );
    } else {
      say(el.runStatus, "");
    }
  }

  async function refresh() {
    try {
      state = await api("/backlog-groomer/state");
      render();
    } catch (e) {
      say(el.runStatus, String(e instanceof Error ? e.message : e), true);
    }
  }

  el.save.addEventListener("click", async () => {
    el.save.disabled = true;
    try {
      await api("/backlog-groomer/settings", "POST", {
        repos: el.repos.value,
        staleDays: Number(el.staleDays.value),
        dailyHourUtc: Number(el.dailyHour.value),
      });
      say(el.saveStatus, "Saved.");
      await refresh();
    } catch (e) {
      say(el.saveStatus, String(e instanceof Error ? e.message : e), true);
    } finally {
      el.save.disabled = false;
    }
  });

  el.runNow.addEventListener("click", async () => {
    try {
      await api("/backlog-groomer/run", "POST");
      say(el.saveStatus, "Collecting your answers.");
      setTimeout(refresh, 8_000);
    } catch (e) {
      say(el.saveStatus, String(e instanceof Error ? e.message : e), true);
    }
  });

  refresh();
  setInterval(refresh, POLL_MS);
})();
