// Tests for the approval gate: the card it posts, and the hook end to end
// against a queue stub on a local port. Run with `node --test`.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Keep the cursor file out of the real home directory.
process.env.HOME = mkdtempSync(join(tmpdir(), "gate-test-"));
const gate = await import("./gate.mjs");

const BASH = {
  hook_event_name: "PermissionRequest",
  session_id: "s-1",
  cwd: "/work/acme",
  tool_name: "Bash",
  tool_input: { command: "git push origin main", description: "Push the fix" },
};

const noFile = () => null;

test("a command is shown in a code block, with what Claude said it is for", () => {
  const card = gate.buildCard(BASH, {
    id: "cc-1",
    now: 0,
    timeoutMs: 1000,
    readFile: noFile,
    why: "The tests pass, so I'll push.",
  });
  assert.equal(card.level, "must");
  assert.equal(card.title, "Claude Code: Run: git push origin main");
  assert.match(
    card.summary,
    /^Push the fix\. Waiting for your answer in acme\./,
  );
  assert.equal(card.body.text, "```sh\ngit push origin main\n```");
  assert.deepEqual(
    card.options.map((o) => [o.id, o.weight ?? "feedback"]),
    [
      ["allow", "feedback"],
      ["deny", "instruction"],
    ],
  );
  assert.equal(card.context.why, "The tests pass, so I'll push.");
  assert.equal(card.expiresAt, 1000);
});

test("a fence is longer than any run of backticks in the command", () => {
  assert.equal(gate.fence("echo ```"), "````\necho ```\n````");
});

test("an edit is shown as a diff of the file", () => {
  const shown = gate.describe(
    {
      cwd: "/work/acme",
      tool_name: "Edit",
      tool_input: {
        file_path: "/work/acme/README.md",
        old_string: "Hello",
        new_string: "Hello, world",
      },
    },
    () => "# Title\n\nHello\n",
  );
  assert.equal(shown.title, "Edit README.md");
  assert.equal(shown.body.kind, "diff");
  assert.equal(shown.body.before, "# Title\n\nHello\n");
  assert.equal(shown.body.after, "# Title\n\nHello, world\n");
});

test("a new file is a diff from nothing; code goes in a code block", () => {
  const shown = gate.describe(
    {
      cwd: "/work/acme",
      tool_name: "Write",
      tool_input: { file_path: "/work/acme/src/a.ts", content: "export {};\n" },
    },
    noFile,
  );
  assert.equal(shown.title, "Create src/a.ts");
  assert.equal(shown.body.before, "");
  assert.equal(shown.body.after, "```\nexport {};\n\n```");
});

test("an edit that does not apply shows its pieces", () => {
  const shown = gate.describe(
    {
      tool_name: "Edit",
      tool_input: { file_path: "/x.md", old_string: "gone", new_string: "new" },
    },
    () => "something else",
  );
  assert.equal(shown.body.beforeLabel, "Replaces");
  assert.equal(shown.body.after, "new");
});

test("Claude's last words come from the transcript", () => {
  const transcript = [
    JSON.stringify({ type: "user", message: { content: "go" } }),
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Pushing now." }] },
    }),
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Bash" }] },
    }),
  ].join("\n");
  assert.equal(gate.lastAssistantText(transcript), "Pushing now.");
});

test("the last answer on the card counts", () => {
  const events = [
    { externalId: "other", type: "decided", optionId: "allow" },
    { externalId: "cc-1", type: "decided", optionId: "allow" },
    {
      externalId: "cc-1",
      type: "changed",
      optionId: "deny",
      instruction: "no",
    },
  ];
  assert.equal(gate.answerIn(events, "cc-1")?.optionId, "deny");
  assert.equal(
    gate.answerIn([{ externalId: "cc-1", type: "cleared" }], "cc-1", {
      type: "decided",
      optionId: "allow",
    }),
    null,
  );
});

test("Deny carries the person's note to Claude", () => {
  assert.deepEqual(gate.decisionOutput({ optionId: "allow" }), {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: "allow" },
    },
  });
  assert.equal(
    gate.decisionOutput({
      optionId: "deny",
      instruction: "run the tests first",
    }).hookSpecificOutput.decision.message,
    "Denied in the Decision Queue: run the tests first",
  );
});

/** A queue stub: answers `answer` on the posted card after `afterPolls` polls. */
async function stubQueue(answer, afterPolls) {
  const seen = { posted: null, deleted: null, polls: 0, auth: null };
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    seen.auth = req.headers.authorization;
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.url === "/api/cards") {
      seen.posted = JSON.parse(body).card;
      res.end(
        JSON.stringify({
          cards: [{ id: seen.posted.id, status: "open" }],
          muted: false,
        }),
      );
    } else if (req.method === "GET" && req.url?.startsWith("/api/events")) {
      seen.polls++;
      const events =
        answer && seen.polls > afterPolls
          ? [{ externalId: seen.posted.id, type: "decided", ...answer }]
          : [];
      res.end(JSON.stringify({ events, cursor: seen.polls }));
    } else if (req.method === "DELETE") {
      seen.deleted = decodeURIComponent(req.url?.split("/").pop() ?? "");
      res.end(JSON.stringify({ withdrawn: true }));
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", () => r(undefined)));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}`, seen, close: () => server.close() };
}

test("the hook posts the card and hands back the answer", async () => {
  const q = await stubQueue(
    { optionId: "deny", instruction: "not on main" },
    1,
  );
  try {
    const out = await gate.run(BASH, { DQ_URL: q.url, DQ_TOKEN: "tok_x" });
    assert.equal(q.seen.auth, "Bearer tok_x");
    assert.equal(q.seen.posted.title, "Claude Code: Run: git push origin main");
    assert.deepEqual(out?.hookSpecificOutput.decision, {
      behavior: "deny",
      message: "Denied in the Decision Queue: not on main",
    });
    assert.equal(q.seen.deleted, null);
  } finally {
    q.close();
  }
});

test("with no answer in time, the card is withdrawn and the terminal asks", async () => {
  const q = await stubQueue(null, 0);
  try {
    const out = await gate.run(BASH, {
      DQ_URL: q.url,
      DQ_TOKEN: "tok_x",
      DQ_GATE_TIMEOUT: "10",
    });
    assert.equal(out, null);
    assert.equal(q.seen.deleted, q.seen.posted.id);
  } finally {
    q.close();
  }
});

test("off, or without a token, it posts nothing", async () => {
  assert.equal(await gate.run(BASH, { DQ_GATE: "off", DQ_TOKEN: "x" }), null);
  assert.equal(await gate.run(BASH, {}), null);
  assert.equal(
    await gate.run(
      { ...BASH, hook_event_name: "PreToolUse" },
      { DQ_TOKEN: "x" },
    ),
    null,
  );
});
