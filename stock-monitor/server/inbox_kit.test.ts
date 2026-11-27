/**
 * Tests for the agent inbox kit, copied with it into each producer as
 * `server/inbox_kit.test.ts`.
 */

import {
  MAX_EVENT_CALLS,
  WAKE_DELAY_MS,
  collect,
  inboxProblem,
  inboxReachable,
  post,
  queueWake,
  wakeAt,
  wakeDone,
  withdraw,
  type InboxEvent,
} from "./inbox_kit.ts";

const PRODUCER = { name: "kit-test", instance: "one", label: "Kit test" };
const NOW = Date.parse("2026-11-27T12:00:00Z");

/** Tools that answer from `answers`, recording each call. */
function fakeTools(answers: Record<string, (args: any) => unknown>) {
  const calls: { name: string; args: any }[] = [];
  const api = {
    list(filter?: string) {
      return Object.keys(answers)
        .filter((name) => !filter || name.includes(filter))
        .map((name) => ({ name }));
    },
    call(name: string, args?: Record<string, unknown>) {
      calls.push({ name, args });
      const answer = answers[name];
      if (!answer) throw new Error(`no tool ${name}`);
      return answer(args);
    },
  } as unknown as ToolsApi;
  return { api, calls };
}

function fakeStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  } as unknown as Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

describe("reaching the inbox", () => {
  test("an inbox is reachable when inbox_post is listed", () => {
    const { api } = fakeTools({ inbox_post: () => ({}) });
    expect(inboxReachable({ tools: api })).toBe(true);
    expect(inboxReachable({ tools: fakeTools({}).api })).toBe(false);
  });

  test("a run without tools in its grant reaches none", () => {
    const api = {
      list() {
        throw new Error("SecurityError");
      },
    } as unknown as ToolsApi;
    expect(inboxReachable({ tools: api })).toBe(false);
  });

  test("post and withdraw name the producer", () => {
    const { api, calls } = fakeTools({
      inbox_post: () => ({ id: null, status: "muted" }),
      inbox_withdraw: () => ({ withdrawn: true }),
    });
    expect(post(PRODUCER, { externalId: "x" }, { tools: api })).toEqual({
      id: null,
      status: "muted",
    });
    expect(withdraw(PRODUCER, "x", { tools: api })).toBe(true);
    expect(calls[0].args.producer).toEqual(PRODUCER);
    expect(calls[1].args.externalId).toBe("x");
  });
});

describe("collecting answers", () => {
  test("reads rounds until none is left, saving each cursor", () => {
    const rounds = [
      { events: [{ externalId: "a", type: "decided" }], cursor: 4 },
      { events: [{ externalId: "b", type: "opened" }], cursor: 7 },
      { events: [], cursor: 7 },
    ];
    const { api, calls } = fakeTools({
      inbox_events: () => rounds.shift(),
    });
    const seen: InboxEvent[] = [];
    const saved: number[] = [];
    const last = collect(
      PRODUCER,
      2,
      (events) => seen.push(...events),
      (cursor) => saved.push(cursor),
      { tools: api },
    );
    expect(last).toBe(7);
    expect(seen.map((e) => e.externalId)).toEqual(["a", "b"]);
    expect(saved).toEqual([4, 7, 7]);
    expect(calls.map((c) => c.args.since)).toEqual([2, 4, 7]);
  });

  test("a round that fails keeps what was applied before it", () => {
    let round = 0;
    const { api } = fakeTools({
      inbox_events: () => {
        round += 1;
        if (round === 2) throw new Error("lapsed");
        return { events: [{ externalId: "a", type: "decided" }], cursor: 3 };
      },
    });
    const saved: number[] = [];
    expect(() =>
      collect(
        PRODUCER,
        0,
        () => undefined,
        (c) => saved.push(c),
        {
          tools: api,
        },
      ),
    ).toThrow("lapsed");
    expect(saved).toEqual([3]);
  });

  test("stops after the most calls one read makes", () => {
    let cursor = 0;
    const { api, calls } = fakeTools({
      inbox_events: () => ({
        events: [{ externalId: "a", type: "decided" }],
        cursor: ++cursor,
      }),
    });
    collect(
      PRODUCER,
      0,
      () => undefined,
      () => undefined,
      { tools: api },
    );
    expect(calls.length).toBe(MAX_EVENT_CALLS);
  });
});

describe("waking", () => {
  test("a wake is queued once until its run starts", () => {
    const storage = fakeStorage();
    const queued: any[] = [];
    const deps = {
      storage,
      tasks: { enqueue: (o: any) => queued.push(o) } as any,
      now: () => NOW,
    };
    const first = queueWake(
      { key: "wake", handler: "readAnswers", payload: { instance: "one" } },
      deps,
    );
    expect(first.queued).toBe(true);
    expect(first.runAt).toBe(new Date(NOW + WAKE_DELAY_MS).toISOString());
    expect(queueWake({ key: "wake", handler: "readAnswers" }, deps)).toEqual({
      queued: false,
    });
    wakeDone("wake", deps);
    expect(
      queueWake({ key: "wake", handler: "readAnswers" }, deps).queued,
    ).toBe(true);
    expect(queued.length).toBe(2);
    expect(queued[0].payload).toEqual({ instance: "one" });
    expect("payload" in queued[1]).toBe(false);
  });

  test("a pending time already past queues another", () => {
    const now = new Date(NOW);
    expect(wakeAt(new Date(NOW - 1).toISOString(), now)).not.toBe(null);
    expect(wakeAt(new Date(NOW + 1).toISOString(), now)).toBe(null);
    expect(wakeAt(null, now, 5_000)).toBe(new Date(NOW + 5_000).toISOString());
  });

  test("an inbox problem is short and says where it came from", () => {
    expect(inboxProblem(new Error("x".repeat(300))).length).toBe(200);
    expect(inboxProblem("down")).toBe("Inbox: down");
  });
});
