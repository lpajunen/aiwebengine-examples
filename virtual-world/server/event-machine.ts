import { EventDefinition, EventPhase } from "./event-registry.ts";

// The state machine every event runs on:
//
//   waiting → ready → gathering → active → rewarding → waiting
//
// Pure: each function takes an event's state and returns the next one plus
// the effects the caller must carry out (events.ts), so the rules are tested
// without a database. Times are milliseconds.

export interface EventProgress {
  // The work this run asks for, set when gathering ends.
  goal?: number;
  // The work done so far.
  total?: number;
  succeeded?: boolean;
  // What the starter paid, handed back if too few gather.
  starterCost?: Array<{ itemId: string; count: number }>;
}

export interface EventState {
  eventId: string;
  worldId: string;
  phase: EventPhase;
  startedBy: string;
  // When the current phase ends: gathering, active and rewarding only.
  phaseEndsAt: number;
  // When a cycle event is next ready.
  readyAt: number;
  lastEndedAt: number;
  // When a random event last rolled for readiness.
  checkedAt: number;
  progress: EventProgress;
}

// What a transition asks of the world. "announce" goes with every phase
// change; the rest are the changes that do not fit in the event's own row.
export type EventEffect =
  | "announce"
  | "return_starter_cost"
  | "grant_single_reward"
  | "clear_participants";

// Why an event left the run early, for the announcement.
export type EventOutcome = "lapsed" | "failed" | "ended" | "";

export interface EventTransition {
  state: EventState;
  effects: EventEffect[];
  outcome: EventOutcome;
}

/** A fresh event: waiting, ready by the rule of its readiness. */
export function initialEventState(
  def: EventDefinition,
  worldId: string,
  now: number,
): EventState {
  return {
    eventId: def.id,
    worldId: String(worldId),
    phase: "waiting",
    startedBy: "",
    phaseEndsAt: 0,
    readyAt: def.ready.kind === "cycle" ? now + def.ready.afterMs : now,
    lastEndedAt: 0,
    checkedAt: now,
    progress: {},
  };
}

function unchanged(state: EventState): EventTransition {
  return { state: state, effects: [], outcome: "" };
}

/** Back to waiting at the end of a run, however it ended. */
function backToWaiting(
  def: EventDefinition,
  state: EventState,
  now: number,
): EventState {
  return Object.assign({}, state, {
    phase: "waiting" as EventPhase,
    startedBy: "",
    phaseEndsAt: 0,
    readyAt: def.ready.kind === "cycle" ? now + def.ready.afterMs : now,
    lastEndedAt: now,
    checkedAt: now,
    progress: {},
  });
}

/**
 * One step of the machine at `now`. `participants` is how many have taken
 * part (counted after the caller enrolled those present at the end of
 * gathering); `roll` is a uniform [0, 1) draw for random readiness, and
 * `readyNow` what a "when" event's isReady answered.
 */
export function advanceEvent(
  def: EventDefinition,
  state: EventState,
  now: number,
  ctx: { participants: number; roll: number; readyNow?: boolean },
): EventTransition {
  switch (state.phase) {
    case "waiting": {
      const ready = def.ready;
      if (ready.kind === "always") {
        return {
          state: Object.assign({}, state, { phase: "ready" as EventPhase }),
          effects: [],
          outcome: "",
        };
      }
      if (ready.kind === "cycle" || ready.kind === "when") {
        const due =
          ready.kind === "cycle" ? now >= state.readyAt : !!ctx.readyNow;
        if (!due) return unchanged(state);
        return {
          state: Object.assign({}, state, { phase: "ready" as EventPhase }),
          effects: ["announce"],
          outcome: "",
        };
      }
      // Random: a Poisson process with the mean interval, rolled for the
      // time since the last roll, and never sooner than the minimum.
      const elapsed = Math.max(0, now - state.checkedAt);
      const rolled = Object.assign({}, state, { checkedAt: now });
      if (now - state.lastEndedAt < ready.minIntervalMs) {
        return unchanged(rolled);
      }
      const chance = 1 - Math.exp(-elapsed / ready.meanIntervalMs);
      if (ctx.roll >= chance) return unchanged(rolled);
      return {
        state: Object.assign({}, rolled, { phase: "ready" as EventPhase }),
        effects: ["announce"],
        outcome: "",
      };
    }
    case "ready": {
      if (def.start.kind !== "auto") return unchanged(state);
      return {
        state: Object.assign({}, state, {
          phase: "gathering" as EventPhase,
          phaseEndsAt: now + def.gatherMs,
        }),
        effects: ["announce"],
        outcome: "",
      };
    }
    case "gathering": {
      if (now < state.phaseEndsAt) return unchanged(state);
      if (ctx.participants < def.minParticipants) {
        // Too few came. A player-started event waits for its next starter,
        // who gets back what they paid; one that started itself waits for its
        // next turn.
        const lapsed =
          def.start.kind === "player"
            ? Object.assign({}, state, {
                phase: "ready" as EventPhase,
                startedBy: "",
                phaseEndsAt: 0,
                progress: {},
              })
            : backToWaiting(def, state, now);
        return {
          state: lapsed,
          effects: ["return_starter_cost", "clear_participants", "announce"],
          outcome: "lapsed",
        };
      }
      return {
        state: Object.assign({}, state, {
          phase: "active" as EventPhase,
          phaseEndsAt: now + def.activeMs,
          progress: Object.assign({}, state.progress, {
            goal: def.goalPerParticipant
              ? def.goalPerParticipant * ctx.participants
              : undefined,
            total: 0,
            starterCost: undefined,
          }),
        }),
        effects: ["announce"],
        outcome: "",
      };
    }
    case "active": {
      const succeeded = !!state.progress.succeeded;
      if (!succeeded && now < state.phaseEndsAt) return unchanged(state);
      // Out of time: an event with work to do has failed, one without has
      // simply run its course.
      if (!succeeded && def.goalPerParticipant) {
        return {
          state: backToWaiting(def, state, now),
          effects: ["clear_participants", "announce"],
          outcome: "failed",
        };
      }
      return {
        state: Object.assign({}, state, {
          phase: "rewarding" as EventPhase,
          phaseEndsAt: now + def.rewardWindowMs,
        }),
        effects:
          def.rewards.length === 1
            ? ["grant_single_reward", "announce"]
            : ["announce"],
        outcome: "",
      };
    }
    case "rewarding": {
      if (now < state.phaseEndsAt) return unchanged(state);
      return {
        state: backToWaiting(def, state, now),
        effects: ["clear_participants", "announce"],
        outcome: "ended",
      };
    }
  }
  return unchanged(state);
}

/**
 * A player starting a ready event. Returns the next state, or the error key
 * when it cannot start; requirements and cost are the caller's to check.
 */
export function startEvent(
  def: EventDefinition,
  state: EventState,
  now: number,
  starterId: string,
  starterCost: Array<{ itemId: string; count: number }>,
): EventState | string {
  if (def.start.kind !== "player") return "error.event_starts_itself";
  if (state.phase !== "ready") return "error.event_not_ready";
  const cooldown = Number(def.start.cooldownMs || 0);
  if (state.lastEndedAt && now - state.lastEndedAt < cooldown) {
    return "error.event_not_ready";
  }
  return Object.assign({}, state, {
    phase: "gathering" as EventPhase,
    startedBy: String(starterId),
    phaseEndsAt: now + def.gatherMs,
    progress: { starterCost: starterCost },
  });
}

/**
 * Adds a participant's work to an active event. Returns the next state, or
 * null when the event is not taking work now.
 */
export function contributeToEventState(
  state: EventState,
  amount: number,
): EventState | null {
  if (state.phase !== "active" || state.progress.succeeded) return null;
  const total = Number(state.progress.total || 0) + Math.max(0, amount);
  const goal = state.progress.goal;
  return Object.assign({}, state, {
    progress: Object.assign({}, state.progress, {
      total: total,
      succeeded: typeof goal === "number" && goal > 0 && total >= goal,
    }),
  });
}

/** What a class's contribution counts for in this event. */
export function roleMultiplier(def: EventDefinition, classId: string): number {
  const role = (def.roles || []).find(function (r) {
    return r.classId === String(classId || "");
  });
  return role ? role.contributionMultiplier : 1;
}
