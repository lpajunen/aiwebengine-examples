// The page: the person's documents, one document with its revisions, and
// the forms that start a document, ask for a change, take the person's own
// edit and save how they like to write. Redrawn from /document-writer/state
// (and /doc for the open document) after every change and every 30 seconds.
//
// A plain script, not a module: it has to run while the page is parsed,
// before the engine's account menu takes its items (#grant-link and the key
// link) out of the document. Wrapped in a function so its names stay its own.
//
// Rendered Markdown comes from the engine's convert.markdown_to_html, which
// turns raw HTML into text and keeps only safe links, so it is set as HTML.
// Everything else is set as text.

/**
 * @typedef {{ id: string, title: string, head: number, updatedAt: string,
 *   where: string, problem: string | null }} DocSummary
 * @typedef {{
 *   signedIn: boolean, granted?: boolean, consentUrl?: string | null,
 *   inboxAvailable?: boolean,
 *   inbox?: { syncedAt: string | null, problem: string | null } | null,
 *   hasModelKey?: boolean, modelKeyUrl?: string, style?: string,
 *   paused?: boolean, maxDocs?: number, docs?: DocSummary[],
 *   status?: { checkedAt: string, problem?: string } | null
 * }} WriterState
 * @typedef {{ id: string, title: string, brief: string, head: number,
 *   text: string, html: string, where: string, idle: boolean,
 *   problem: string | null,
 *   revisions: { n: number, at: string, by: string, summary: string }[]
 * }} DocDetail
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
    modelKeyLink: /** @type {HTMLAnchorElement} */ (byId("model-key-link")),
    listView: byId("list-view"),
    docView: byId("doc-view"),
    docs: byId("docs"),
    newTitle: /** @type {HTMLInputElement} */ (byId("new-title")),
    newBrief: /** @type {HTMLTextAreaElement} */ (byId("new-brief")),
    create: /** @type {HTMLButtonElement} */ (byId("create")),
    createStatus: byId("create-status"),
    style: /** @type {HTMLTextAreaElement} */ (byId("style")),
    saveStyle: /** @type {HTMLButtonElement} */ (byId("save-style")),
    styleStatus: byId("style-status"),
    back: byId("back"),
    docTitle: byId("doc-title"),
    docWhere: byId("doc-where"),
    docProblem: byId("doc-problem"),
    docText: byId("doc-text"),
    next: /** @type {HTMLButtonElement} */ (byId("next")),
    edit: /** @type {HTMLButtonElement} */ (byId("edit")),
    exportLink: /** @type {HTMLAnchorElement} */ (byId("export")),
    del: /** @type {HTMLButtonElement} */ (byId("delete")),
    editorSection: byId("editor-section"),
    editor: /** @type {HTMLTextAreaElement} */ (byId("editor")),
    saveEdit: /** @type {HTMLButtonElement} */ (byId("save-edit")),
    cancelEdit: /** @type {HTMLButtonElement} */ (byId("cancel-edit")),
    editStatus: byId("edit-status"),
    wish: /** @type {HTMLTextAreaElement} */ (byId("wish")),
    ask: /** @type {HTMLButtonElement} */ (byId("ask")),
    askStatus: byId("ask-status"),
    revisions: byId("revisions"),
    revisionView: byId("revision-view"),
    revisionTitle: byId("revision-title"),
    revisionText: byId("revision-text"),
    runStatus: byId("run-status"),
  };

  /** @type {WriterState} */
  let state = { signedIn: false };
  /** @type {DocDetail | null} */
  let current = null;
  let styleFilled = false;
  /** Whether Delete was pressed once and waits for a second press. */
  let deleteArmed = false;

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

  /** The document named in the address, if any. */
  function openId() {
    return new URLSearchParams(location.search).get("id");
  }

  /** @param {string | null} id */
  function go(id) {
    const url = id ? `?id=${encodeURIComponent(id)}` : location.pathname;
    history.pushState(null, "", url);
    current = null;
    el.editorSection.hidden = true;
    el.revisionView.hidden = true;
    refresh();
  }

  function renderNotices() {
    el.notice.hidden = true;
    if (!state.signedIn) {
      showNotice(
        "Sign in to write documents.",
        "Sign in",
        "/auth/login?redirect=" + encodeURIComponent(location.pathname),
      );
      return false;
    }
    const consent = state.consentUrl
      ? state.consentUrl + "&redirect=" + encodeURIComponent(location.pathname)
      : null;
    if (consent) {
      el.grantLink.hidden = false;
      el.grantLink.href = consent;
    }
    if (state.modelKeyUrl) {
      el.modelKeyLink.hidden = false;
      el.modelKeyLink.href = state.modelKeyUrl;
    }
    if (!state.granted) {
      showNotice(
        "The writer works while you are away, so it needs your permission: " +
          "personal storage with write, your secrets for the key, and tools " +
          "to reach your agent inbox.",
        "Give permission",
        consent ?? undefined,
      );
    } else if (!state.hasModelKey) {
      showNotice(
        "Store your Anthropic API key: changes are written with it.",
        "Add the key",
        state.modelKeyUrl,
      );
    } else if (!state.inboxAvailable) {
      showNotice(
        "No agent inbox is reachable: the writer proposes each change there.",
      );
    } else if (state.paused) {
      showNotice("The writer is paused. Resume it in your agent inbox.");
    }
    return true;
  }

  function renderList() {
    const docs = state.docs ?? [];
    const rows = docs.map((d) => {
      const li = make("li");
      const link = make("button", d.title, "link");
      link.addEventListener("click", () => go(d.id));
      li.append(link);
      li.append(
        make(
          "div",
          `${d.head === 0 ? "No revision yet" : `r${d.head}`} · ${d.where} · ${when(d.updatedAt)}`,
          "when",
        ),
      );
      if (d.problem) li.append(make("div", d.problem, "status error"));
      return li;
    });
    el.docs.replaceChildren(
      ...(rows.length > 0 ? rows : [make("li", "No documents yet.", "empty")]),
    );
    el.create.disabled = docs.length >= (state.maxDocs ?? 20);
    if (!styleFilled && state.style !== undefined) {
      el.style.value = state.style;
      styleFilled = true;
    }
  }

  function renderDoc() {
    if (!current) return;
    el.docTitle.textContent = current.title;
    el.docWhere.textContent =
      `${current.head === 0 ? "No revision yet" : `r${current.head}`} · ` +
      current.where;
    el.docProblem.hidden = !current.problem;
    el.docProblem.textContent = current.problem ?? "";
    if (current.html) {
      el.docText.innerHTML = current.html;
    } else {
      el.docText.replaceChildren(
        make("p", "Empty: the first draft is on its way.", "empty"),
      );
    }
    el.next.hidden = !current.idle;
    el.exportLink.href = `/document-writer/export?id=${encodeURIComponent(current.id)}`;
    const id = current.id;
    el.revisions.replaceChildren(
      ...(current.revisions.length > 0
        ? current.revisions.map((r) => {
            const li = make("li");
            const view = make("button", `r${r.n}: ${r.summary}`, "link");
            view.addEventListener("click", () => showRevision(id, r.n));
            li.append(view);
            li.append(
              make(
                "div",
                `${r.by === "person" ? "You" : "The writer"} · ${when(r.at)}`,
                "when",
              ),
            );
            return li;
          })
        : [make("li", "None yet.", "empty")]),
    );
  }

  /**
   * @param {string} id
   * @param {number} n
   */
  async function showRevision(id, n) {
    try {
      const r = await api(
        `/document-writer/revision?id=${encodeURIComponent(id)}&n=${n}`,
      );
      el.revisionTitle.textContent = `r${r.n}: ${r.summary} (${when(r.at)})`;
      el.revisionText.innerHTML = r.html;
      el.revisionView.hidden = false;
      el.editor.value = r.text;
    } catch (e) {
      say(el.revisionTitle, String(/** @type {Error} */ (e).message), true);
      el.revisionView.hidden = false;
    }
  }

  async function refresh() {
    try {
      state = await api("/document-writer/state");
    } catch (e) {
      say(el.runStatus, String(/** @type {Error} */ (e).message), true);
      return;
    }
    const ok = renderNotices();
    const id = openId();
    el.listView.hidden = !ok || Boolean(id);
    el.docView.hidden = !ok || !id;
    if (!ok) return;
    if (id) {
      try {
        current = await api(
          `/document-writer/doc?id=${encodeURIComponent(id)}`,
        );
        renderDoc();
      } catch (e) {
        say(el.docWhere, String(/** @type {Error} */ (e).message), true);
      }
    } else {
      renderList();
    }
    const problem = state.inbox?.problem ?? state.status?.problem;
    say(
      el.runStatus,
      problem
        ? problem
        : state.status
          ? `Last checked ${when(state.status.checkedAt)}`
          : "",
      Boolean(problem),
    );
  }

  /**
   * Runs an action from a button, says how it went, and redraws.
   * @param {HTMLButtonElement} button
   * @param {HTMLElement} status
   * @param {() => Promise<string>} action what to say when it worked
   */
  async function act(button, status, action) {
    button.disabled = true;
    say(status, "…");
    try {
      say(status, await action());
    } catch (e) {
      say(status, String(/** @type {Error} */ (e).message), true);
    } finally {
      button.disabled = false;
    }
    await refresh();
  }

  el.create.addEventListener("click", () =>
    act(el.create, el.createStatus, async () => {
      const made = await api("/document-writer/new", "POST", {
        title: el.newTitle.value,
        brief: el.newBrief.value,
      });
      el.newTitle.value = "";
      el.newBrief.value = "";
      history.pushState(null, "", `?id=${encodeURIComponent(made.id)}`);
      return "Started; the first draft will wait in your inbox.";
    }),
  );

  el.saveStyle.addEventListener("click", () =>
    act(el.saveStyle, el.styleStatus, async () => {
      await api("/document-writer/settings", "POST", { style: el.style.value });
      return "Saved";
    }),
  );

  el.back.addEventListener("click", () => go(null));

  el.ask.addEventListener("click", () =>
    act(el.ask, el.askStatus, async () => {
      await api("/document-writer/change", "POST", {
        id: current?.id,
        text: el.wish.value,
      });
      el.wish.value = "";
      return "Asked; the change will wait in your inbox.";
    }),
  );

  el.next.addEventListener("click", () =>
    act(el.next, el.askStatus, async () => {
      await api("/document-writer/next", "POST", { id: current?.id });
      return "The next steps wait in your inbox.";
    }),
  );

  el.edit.addEventListener("click", () => {
    el.editor.value = current?.text ?? "";
    el.editorSection.hidden = false;
    el.editor.focus();
  });

  el.cancelEdit.addEventListener("click", () => {
    el.editorSection.hidden = true;
  });

  el.saveEdit.addEventListener("click", () =>
    act(el.saveEdit, el.editStatus, async () => {
      await api("/document-writer/edit", "POST", {
        id: current?.id,
        text: el.editor.value,
      });
      el.editorSection.hidden = true;
      return "Saved as a new revision";
    }),
  );

  el.del.addEventListener("click", async () => {
    if (!deleteArmed) {
      deleteArmed = true;
      el.del.textContent = "Delete it and every revision?";
      setTimeout(() => {
        deleteArmed = false;
        el.del.textContent = "Delete";
      }, 5000);
      return;
    }
    deleteArmed = false;
    el.del.textContent = "Delete";
    try {
      await api("/document-writer/delete", "POST", { id: current?.id });
      go(null);
    } catch (e) {
      say(el.docWhere, String(/** @type {Error} */ (e).message), true);
    }
  });

  window.addEventListener("popstate", () => refresh());
  refresh();
  setInterval(refresh, POLL_MS);
})();
