#!/usr/bin/env node
// @ts-check
// Approval gate for Claude Code: a PermissionRequest hook that asks you in
// your Decision Queue instead of the terminal.
//
// When Claude Code would ask for permission (to run a command, edit a file,
// call a tool), this hook posts a card to your queue with what it wants to
// do: the command, or the edit as a diff. You answer Allow or Deny (with a
// note for Claude, if you like) from your phone or anywhere else, and the
// hook hands the answer back. With no answer before the timeout, the card is
// withdrawn and Claude Code asks in the terminal as usual.
//
// It is an agent outside the engine: one connection token, `POST
// /api/cards`, and `GET /api/events` polled for the answer (see "Agents
// outside the engine" in aiwebengine-dev's docs/guides/agent-inbox.md).
// Node 18 or later; no dependencies. README.md says how to set it up.
//
// Configuration, from the environment:
//   DQ_URL           the queue (default https://decisionqueue.com)
//   DQ_TOKEN         the connection token; otherwise read from
//                    ~/.config/decision-queue/token
//   DQ_GATE_TIMEOUT  seconds to wait for an answer (default 300); keep it
//                    under the hook's own timeout in settings.json
//   DQ_GATE=off      ask in the terminal instead, without posting anything

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG_DIR = join(homedir(), ".config", "decision-queue");
const STATE_FILE = join(CONFIG_DIR, "claude-code-gate.json");
const POLL_MS = 2000;
/** What one side of a diff, or a document for Ask, may hold. */
const MAX_TEXT = 60_000;
const MAX_CONTEXT_TEXT = 12_000;

export const ALLOW = "allow";
export const DENY = "deny";

/**
 * @typedef {{
 *   hook_event_name?: string, session_id?: string, cwd?: string,
 *   transcript_path?: string, permission_mode?: string,
 *   tool_name?: string, tool_input?: Record<string, any>
 * }} HookInput
 * @typedef {{ externalId: string, type: string, optionId?: string | null,
 *   instruction?: string | null, revision?: number }} QueueEvent
 */

/** Cuts text to `max` characters, saying so. */
export function cut(text, max) {
  const s = String(text ?? "");
  return s.length <= max ? s : s.slice(0, max - 20) + "\n… (cut short)";
}

/** A fenced code block that the content cannot close early. */
export function fence(text, lang = "") {
  const runs = String(text).match(/`+/g) ?? [];
  const longest = runs.reduce((n, r) => Math.max(n, r.length), 0);
  const ticks = "`".repeat(Math.max(3, longest + 1));
  return `${ticks}${lang}\n${text}\n${ticks}`;
}

/** A path as the person reads it: relative to the project when inside it. */
export function shortPath(path, cwd) {
  const p = String(path ?? "");
  if (!cwd || !isAbsolute(p)) return p;
  const rel = relative(cwd, p);
  return rel && !rel.startsWith("..") ? rel : p;
}

/** Text ending as a sentence does. */
function sentence(text) {
  const t = text.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

function oneLine(text, max) {
  const first = String(text ?? "")
    .split("\n")[0]
    .trim();
  return first.length <= max ? first : first.slice(0, max - 1) + "…";
}

/**
 * What the card shows for one request: its title, a summary, and the body
 * (the command, the edit as a diff, or the tool's input).
 *
 * @param {HookInput} input
 * @param {(path: string) => string | null} readFile the file as it is now
 */
export function describe(input, readFile) {
  const tool = String(input.tool_name ?? "a tool");
  const args = input.tool_input ?? {};
  const cwd = input.cwd ?? "";
  if (tool === "Bash") {
    return {
      title: `Run: ${oneLine(args.command, 150)}`,
      summary: args.description ? sentence(String(args.description)) : "",
      body: {
        kind: "markdown",
        text: cut(fence(String(args.command ?? ""), "sh"), MAX_TEXT),
      },
    };
  }
  if (tool === "Edit" || tool === "MultiEdit" || tool === "Write") {
    const path = String(args.file_path ?? "");
    const name = shortPath(path, cwd);
    const now = readFile(path);
    let after = null;
    if (tool === "Write") {
      after = String(args.content ?? "");
    } else if (now !== null) {
      const edits =
        tool === "MultiEdit"
          ? (args.edits ?? [])
          : [
              {
                old_string: args.old_string,
                new_string: args.new_string,
                replace_all: args.replace_all,
              },
            ];
      after = applyEdits(now, edits);
    }
    const before = now ?? "";
    const title = `${now === null ? "Create" : "Edit"} ${oneLine(name, 150)}`;
    if (after === null) {
      // The edit does not apply to the file as it is: show the pieces.
      const pieces = tool === "MultiEdit" ? (args.edits ?? []) : [args];
      return {
        title,
        summary: "The change, as Claude described it:",
        body: {
          kind: "diff",
          before: cut(
            pieces.map((e) => e.old_string ?? "").join("\n\n"),
            MAX_TEXT,
          ),
          after: cut(
            pieces.map((e) => e.new_string ?? "").join("\n\n"),
            MAX_TEXT,
          ),
          beforeLabel: "Replaces",
          afterLabel: "With",
        },
      };
    }
    return {
      title,
      summary: "",
      body: {
        kind: "diff",
        before: now === null ? "" : cut(markdownOf(before, path), MAX_TEXT),
        after: cut(markdownOf(after, path), MAX_TEXT),
        beforeLabel: now === null ? "(new file)" : "Now",
        afterLabel: "After the change",
      },
    };
  }
  const shown =
    tool === "WebFetch" && args.url
      ? `Fetch ${oneLine(args.url, 140)}`
      : `Use ${oneLine(tool, 140)}`;
  return {
    title: shown,
    summary: "",
    body: {
      kind: "markdown",
      text: cut(fence(JSON.stringify(args, null, 2), "json"), MAX_TEXT),
    },
  };
}

/**
 * A file's text for the queue's diff, which compares Markdown: Markdown
 * stays as it is, anything else goes in a code block.
 */
function markdownOf(text, path) {
  return /\.(md|markdown|txt)$/i.test(path) ? text : fence(text);
}

/**
 * The file after Claude's edits, or null when one does not apply.
 *
 * @param {string} text
 * @param {{old_string?: string, new_string?: string, replace_all?: boolean}[]} edits
 */
export function applyEdits(text, edits) {
  let out = text;
  for (const e of edits) {
    const from = String(e.old_string ?? "");
    const to = String(e.new_string ?? "");
    if (!from) return null;
    if (!out.includes(from)) return null;
    out = e.replace_all
      ? out.split(from).join(to)
      : out.replace(from, () => to);
  }
  return out;
}

/** Claude's last words before asking, from the transcript, for Ask. */
export function lastAssistantText(transcript) {
  const lines = String(transcript ?? "")
    .trim()
    .split("\n")
    .reverse();
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const message = entry?.message;
      if (entry?.type !== "assistant" || !Array.isArray(message?.content)) {
        continue;
      }
      const text = message.content
        .filter((c) => c?.type === "text" && c.text)
        .map((c) => c.text)
        .join("\n")
        .trim();
      if (text) return text;
    } catch {
      // A line that is not JSON is skipped.
    }
  }
  return "";
}

/** A card id unique to this request. */
export function cardId(input, now, random) {
  const session = createHash("sha256")
    .update(String(input.session_id ?? ""))
    .digest("hex")
    .slice(0, 8);
  return `cc-${session}-${now.toString(36)}-${random}`;
}

/**
 * The card for a permission request.
 *
 * @param {HookInput} input
 * @param {{ id: string, now: number, timeoutMs: number,
 *   readFile: (path: string) => string | null, why: string }} with
 */
export function buildCard(input, { id, now, timeoutMs, readFile, why }) {
  const shown = describe(input, readFile);
  const project = basename(input.cwd ?? "") || "(unknown)";
  const tool = String(input.tool_name ?? "");
  const facts = [
    { label: "Project", value: project },
    { label: "Tool", value: tool },
  ];
  if (input.permission_mode) {
    facts.push({ label: "Mode", value: String(input.permission_mode) });
  }
  return {
    id,
    level: "must",
    title: cut(`Claude Code: ${shown.title}`, 200),
    summary: cut(
      [shown.summary, `Waiting for your answer in ${project}.`]
        .filter(Boolean)
        .join(" "),
      2000,
    ),
    facts,
    body: shown.body,
    options: [
      { id: ALLOW, label: "Allow", style: "primary" },
      {
        id: DENY,
        label: "Deny",
        style: "negative",
        weight: "instruction",
        placeholder: "Why, or what to do instead (optional)",
      },
    ],
    suggestedQuestions: ["What does this do?", "Is it safe to allow?"],
    context: {
      why: cut(why || `Claude Code asked to use ${tool}.`, 2000),
      facts,
      documents: [
        {
          title: `What Claude asked to do (${tool})`,
          text: cut(
            JSON.stringify(input.tool_input ?? {}, null, 2),
            MAX_CONTEXT_TEXT,
          ),
        },
      ],
    },
    expiresAt: now + timeoutMs,
  };
}

/**
 * The answer to this card among events, or null: the last decision on it,
 * an expiry or a withdrawal (which mean ask in the terminal).
 *
 * @param {QueueEvent[]} events
 * @param {string} id
 * @param {{ type: string, optionId?: string | null, instruction?: string | null } | null} before
 */
export function answerIn(events, id, before = null) {
  let answer = before;
  for (const e of events) {
    if (e.externalId !== id) continue;
    if (e.type === "decided" || e.type === "changed") {
      answer = {
        type: e.type,
        optionId: e.optionId,
        instruction: e.instruction,
      };
    } else if (e.type === "cleared") {
      answer = null;
    } else if (e.type === "expired" || e.type === "withdrawn") {
      answer = { type: e.type };
    }
  }
  return answer;
}

/** What the hook prints for Claude Code. */
export function decisionOutput(answer) {
  if (answer.optionId === ALLOW) {
    return {
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" },
      },
    };
  }
  const note = String(answer.instruction ?? "").trim();
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior: "deny",
        message: note
          ? `Denied in the Decision Queue: ${note}`
          : "Denied in the Decision Queue.",
      },
    },
  };
}

// ============================================================================
// Talking to the queue
// ============================================================================

function tokenFrom(env) {
  if (env.DQ_TOKEN) return env.DQ_TOKEN.trim();
  const file = join(CONFIG_DIR, "token");
  return existsSync(file) ? readFileSync(file, "utf8").trim() : "";
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { cursor: 0 };
  }
}

function saveCursor(cursor) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    const state = readState();
    if (cursor > (state.cursor ?? 0)) {
      writeFileSync(STATE_FILE, JSON.stringify({ ...state, cursor }), {
        mode: 0o600,
      });
    }
  } catch {
    // The cursor is a shortcut, not a record: the next run reads further back.
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One call to the queue, waiting out a 429 as it asks.
 *
 * @param {string} base
 * @param {string} token
 * @param {string} method
 * @param {string} path
 * @param {unknown} [body]
 */
async function call(base, token, method, path, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(base + path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 429) {
      const wait = Number(response.headers.get("retry-after")) || 2;
      await sleep(Math.min(wait, 30) * 1000);
      continue;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `${method} ${path}: ${response.status} ${data.message ?? data.error ?? ""}`.trim(),
      );
    }
    return data;
  }
  throw new Error(`${method} ${path}: still too many requests`);
}

function say(text) {
  process.stderr.write(`decision-queue gate: ${text}\n`);
}

/**
 * The hook: read the request, post the card, wait for the answer. Prints
 * nothing (so Claude Code asks in the terminal) when it is off, not set up,
 * muted, unanswered or failing.
 *
 * @param {HookInput} input
 * @param {Record<string, string | undefined>} env
 */
export async function run(input, env) {
  if (input.hook_event_name && input.hook_event_name !== "PermissionRequest") {
    return null;
  }
  if (env.DQ_GATE === "off") return null;
  const token = tokenFrom(env);
  if (!token) {
    say("no token (DQ_TOKEN or ~/.config/decision-queue/token); asking here");
    return null;
  }
  const base = (env.DQ_URL || "https://decisionqueue.com").replace(/\/+$/, "");
  const timeoutMs = Math.max(10, Number(env.DQ_GATE_TIMEOUT) || 300) * 1000;
  const started = Date.now();
  const id = cardId(input, started, randomBytes(3).toString("hex"));
  let why = "";
  try {
    if (input.transcript_path) {
      why = lastAssistantText(readFileSync(input.transcript_path, "utf8"));
    }
  } catch {
    // No transcript: Ask answers from the request alone.
  }
  const card = buildCard(input, {
    id,
    now: started,
    timeoutMs,
    why,
    readFile: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
  });

  // Read from the last cursor seen: this card's answer comes after it.
  let cursor = Number(readState().cursor) || 0;
  const posted = await call(base, token, "POST", "/api/cards", { card });
  if (posted.muted) {
    say("muted in the queue; asking here");
    return null;
  }
  let withdrawn = false;
  const withdraw = async () => {
    if (withdrawn) return;
    withdrawn = true;
    await call(
      base,
      token,
      "DELETE",
      `/api/cards/${encodeURIComponent(id)}`,
    ).catch(() => {});
  };
  const onSignal = () => {
    void withdraw().finally(() => process.exit(0));
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);

  say("waiting for your answer in the Decision Queue");
  let answer = null;
  while (Date.now() - started < timeoutMs) {
    const page = await call(base, token, "GET", `/api/events?since=${cursor}`);
    answer = answerIn(page.events ?? [], id, answer);
    cursor = Number(page.cursor) || cursor;
    if (answer && (answer.type === "decided" || answer.type === "changed")) {
      break;
    }
    if (answer) {
      // Expired or withdrawn in the queue.
      answer = null;
      break;
    }
    await sleep(POLL_MS);
  }
  saveCursor(cursor);
  if (!answer) {
    await withdraw();
    say("no answer in the queue; asking here");
    return null;
  }
  return decisionOutput(answer);
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    say("the hook's input was not JSON; asking here");
    return;
  }
  try {
    const out = await run(input, process.env);
    if (out) process.stdout.write(JSON.stringify(out));
  } catch (e) {
    say(`${e instanceof Error ? e.message : e}; asking here`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
