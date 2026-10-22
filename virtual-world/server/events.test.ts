/**
 * Tests for recurring events: the state machine every event runs on, and an
 * event run end to end against the database.
 *
 * What these guard is the promise of the design: anyone present takes part,
 * everyone who takes part is rewarded once, too few gathered costs the
 * starter nothing, and every event comes round again.
 *
 * The machine is tested on its own, with times made up. The run uses an event
 * of the test's own, registered for the forest worlds the fixtures create and
 * removed afterwards; it lives only in this test's runtime, so the running
 * game never sees it.
 */

import {
  advanceEvent,
  contributeToEventState,
  EventState,
  initialEventState,
  roleMultiplier,
  startEvent,
} from "./event-machine.ts";
import { EVENT_DEFINITIONS, EventDefinition } from "./event-registry.ts";
import {
  advanceDueEvent,
  claimEventReward,
  contributeToEvent,
  getEventContribution,
  getEventState,
} from "./events.ts";
import {
  ensureWorldItems,
  loadPlayerInventory,
  savePlayerInventory,
  upsertWorldItem,
} from "./item-storage.ts";
import { loadPlayerPosition } from "./player-persistence.ts";
import { performTreeActionForUser } from "./tree-action-helpers.ts";
import { countLivingItemsByType } from "./world-domain.ts";
import {
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  primeTransactions,
  walkableRunFinder,
} from "./test-fixtures.ts";

const MINUTE = 60 * 1000;

function definition(overrides?: Partial<EventDefinition>): EventDefinition {
  return Object.assign(
    {
      id: "test_gathering",
      labelKey: "event.test_gathering",
      fallbackLabel: "A test gathering",
      labels: {},
      worldClassId: "forest",
      anchorPlacementId: "nowhere",
      gatherRadius: 5,
      ready: { kind: "cycle", afterMs: 60 * MINUTE },
      start: {
        kind: "player",
        actionId: "pray",
        cost: [{ itemId: "birch_bark_letter", count: 1 }],
      },
      gatherMs: 10 * MINUTE,
      activeMs: 5 * MINUTE,
      rewardWindowMs: 10 * MINUTE,
      minParticipants: 1,
      goalPerParticipant: 10,
      rewards: [
        {
          textKey: "x.a",
          text: "A flower",
          items: [{ itemId: "flower", count: 1 }],
        },
        {
          textKey: "x.b",
          text: "A stone",
          items: [{ itemId: "stone", count: 1 }],
        },
      ],
      rewardNeedsContribution: true,
    },
    overrides || {},
  ) as EventDefinition;
}

function step(def: EventDefinition, state: EventState, now: number, n = 0) {
  return advanceEvent(def, state, now, { participants: n, roll: 0.5 });
}

describe("the event machine", () => {
  test("waits out a cycle, then is ready", () => {
    const def = definition();
    const fresh = initialEventState(def, "w", 0);

    expect(step(def, fresh, 30 * MINUTE).state.phase).toBe("waiting");
    const ready = step(def, fresh, 60 * MINUTE);
    expect(ready.state.phase).toBe("ready");
    expect(ready.effects).toContain("announce");
  });

  test("rolls for random readiness, never before the minimum", () => {
    const def = definition({
      ready: { kind: "random", meanIntervalMs: MINUTE, minIntervalMs: MINUTE },
    });
    const ended = Object.assign(initialEventState(def, "w", 0), {
      lastEndedAt: 10 * MINUTE,
      checkedAt: 10 * MINUTE,
    });
    const lucky = { participants: 0, roll: 0 };

    expect(advanceEvent(def, ended, 10.5 * MINUTE, lucky).state.phase).toBe(
      "waiting",
    );
    expect(advanceEvent(def, ended, 12 * MINUTE, lucky).state.phase).toBe(
      "ready",
    );
    expect(
      advanceEvent(def, ended, 12 * MINUTE, { participants: 0, roll: 0.99 })
        .state.phase,
    ).toBe("waiting");
  });

  test("starts by itself when it says so", () => {
    const def = definition({ start: { kind: "auto" } });
    const ready = Object.assign(initialEventState(def, "w", 0), {
      phase: "ready" as const,
    });

    const gathering = step(def, ready, 0);
    expect(gathering.state.phase).toBe("gathering");
    expect(gathering.state.phaseEndsAt).toBe(10 * MINUTE);
  });

  test("lapses with too few, giving the starter back what they paid", () => {
    const def = definition({ minParticipants: 3 });
    const ready = Object.assign(initialEventState(def, "w", 0), {
      phase: "ready" as const,
    });
    const started = startEvent(def, ready, 0, "u1", [
      { itemId: "birch_bark_letter", count: 1 },
    ]) as EventState;

    const lapsed = step(def, started, 10 * MINUTE, 2);
    expect(lapsed.state.phase).toBe("ready");
    expect(lapsed.outcome).toBe("lapsed");
    expect(lapsed.effects).toContain("return_starter_cost");
  });

  test("asks more work of more people, and succeeds when it is done", () => {
    const def = definition();
    const gathering = startEvent(
      def,
      Object.assign(initialEventState(def, "w", 0), {
        phase: "ready" as const,
      }),
      0,
      "u1",
      [],
    ) as EventState;

    const active = step(def, gathering, 10 * MINUTE, 3).state;
    expect(active.phase).toBe("active");
    expect(active.progress.goal).toBe(30);

    const halfway = contributeToEventState(active, 15)!;
    expect(halfway.progress.succeeded).toBe(false);
    const done = contributeToEventState(halfway, 15)!;
    expect(done.progress.succeeded).toBe(true);
    expect(step(def, done, 11 * MINUTE).state.phase).toBe("rewarding");
  });

  test("fails when the work is not done in time", () => {
    const def = definition();
    const active = Object.assign(initialEventState(def, "w", 0), {
      phase: "active" as const,
      phaseEndsAt: 5 * MINUTE,
      progress: { goal: 10, total: 3 },
    });

    const failed = step(def, active, 5 * MINUTE);
    expect(failed.state.phase).toBe("waiting");
    expect(failed.outcome).toBe("failed");
  });

  test("comes round again after the rewards", () => {
    const def = definition();
    const rewarding = Object.assign(initialEventState(def, "w", 0), {
      phase: "rewarding" as const,
      phaseEndsAt: 10 * MINUTE,
    });

    const over = step(def, rewarding, 10 * MINUTE);
    expect(over.state.phase).toBe("waiting");
    expect(over.state.readyAt).toBe(70 * MINUTE);
    expect(over.effects).toContain("clear_participants");
  });

  test("refuses a start that is not ready or still cooling down", () => {
    const def = definition({
      start: { kind: "player", actionId: "pray", cooldownMs: 30 * MINUTE },
    });
    const waiting = initialEventState(def, "w", 0);
    const cooling = Object.assign(initialEventState(def, "w", 0), {
      phase: "ready" as const,
      lastEndedAt: 10 * MINUTE,
    });

    expect(startEvent(def, waiting, 0, "u", [])).toBe("error.event_not_ready");
    expect(startEvent(def, cooling, 20 * MINUTE, "u", [])).toBe(
      "error.event_not_ready",
    );
    expect(typeof startEvent(def, cooling, 40 * MINUTE, "u", [])).toBe(
      "object",
    );
  });

  test("counts a class's work by its role", () => {
    const def = definition({
      roles: [{ classId: "player_urho", contributionMultiplier: 2 }],
    });

    expect(roleMultiplier(def, "player_urho")).toBe(2);
    expect(roleMultiplier(def, "player_laulaja")).toBe(1);
  });
});

describe("an event run", () => {
  beforeEach(function () {
    primeTransactions();
  });

  afterEach(function () {
    delete EVENT_DEFINITIONS.test_gathering;
    cleanupTestData();
  });

  /**
   * A player in a forest of the test's own, carrying what starting costs, on
   * an old oak: the test's event is started with `pray`, which needs one.
   */
  function starter(prefix: string): { userId: string; worldId: string } {
    const worldId = createTestWorld(16, 16);
    const userId = createTestPlayer(
      worldId,
      prefix,
      walkableRunFinder(worldId)(1)[0],
    );
    const inv = loadPlayerInventory(userId);
    inv.bag.push({ id: "test-kit-" + userId, type: "starter_kit" });
    inv.bag.push({ id: "test-letter-" + userId, type: "birch_bark_letter" });
    savePlayerInventory(userId, inv);
    const at = loadPlayerPosition(userId)!;
    // Seeded first: a fresh world's first seeding would replace the oak.
    ensureWorldItems(worldId);
    upsertWorldItem(worldId, at.row, at.col, {
      id: "test-oak-" + userId,
      type: "old_oak",
    });
    return { userId: userId, worldId: worldId };
  }

  function carries(userId: string, type: string): number {
    return countLivingItemsByType(loadPlayerInventory(userId))[type] || 0;
  }

  /** The event made ready in this world, started by `userId`. */
  function startedBy(
    def: EventDefinition,
    userId: string,
    worldId: string,
  ): number {
    const now = Date.now();
    EVENT_DEFINITIONS[def.id] = def;
    // The first tick records the event, waiting out its cycle from then.
    advanceDueEvent(def, worldId, now);
    advanceDueEvent(def, worldId, now + 61 * MINUTE);
    expect(getEventState(def.id, worldId, now)!.phase).toBe("ready");
    const result = performTreeActionForUser(userId, {
      action: "pray",
    }).payload;
    expect(result.ok).toBe(true);
    return now;
  }

  test("rewards the one who worked, once, and comes round again", () => {
    const def = definition();
    const { userId, worldId } = starter("worker");
    startedBy(def, userId, worldId);
    expect(carries(userId, "birch_bark_letter")).toBe(0);
    const later = getEventState(def.id, worldId, 0)!.phaseEndsAt;

    advanceDueEvent(def, worldId, later);
    expect(getEventState(def.id, worldId, later)!.phase).toBe("active");

    expect(
      contributeToEvent(def.id, userId, worldId, 10, later).succeeded,
    ).toBe(true);
    expect(getEventContribution(def.id, worldId, userId)).toBe(10);
    expect(getEventState(def.id, worldId, later)!.phase).toBe("rewarding");

    expect(claimEventReward(def.id, userId, worldId, 1, later).ok).toBe(true);
    expect(carries(userId, "stone")).toBe(1);
    expect(claimEventReward(def.id, userId, worldId, 0, later).error).toBe(
      "error.event_reward_taken",
    );

    advanceDueEvent(def, worldId, later + 11 * MINUTE);
    expect(getEventState(def.id, worldId, later)!.phase).toBe("waiting");
    expect(getEventContribution(def.id, worldId, userId)).toBeNull();
  });

  test("hands the starter's cost back when too few gather", () => {
    const def = definition({ minParticipants: 2 });
    const { userId, worldId } = starter("alone");
    startedBy(def, userId, worldId);
    const later = getEventState(def.id, worldId, 0)!.phaseEndsAt;

    advanceDueEvent(def, worldId, later);

    expect(getEventState(def.id, worldId, later)!.phase).toBe("ready");
    expect(carries(userId, "birch_bark_letter")).toBe(1);
  });
});
