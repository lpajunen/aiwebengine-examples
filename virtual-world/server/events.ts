import { evaluateEntityConditions } from "./action-logic-interpreter.ts";
import { appendWorldChatMessage } from "./chat-storage.ts";
import { vwLog } from "./diagnostics.ts";
import {
  advanceEvent,
  contributeToEventState,
  EventEffect,
  EventOutcome,
  EventState,
  initialEventState,
  roleMultiplier,
  startEvent,
} from "./event-machine.ts";
import {
  EVENT_DEFINITIONS,
  EventDefinition,
  EventReward,
  getEventDefinition,
  getEventDefinitionsForWorldClass,
} from "./event-registry.ts";
import {
  loadPlayerInventory,
  savePlayerInventory,
  spawnItemsForUser,
} from "./item-storage.ts";
import { buildActiveWorldPlayers } from "./player-snapshots.ts";
import { ORIGINS } from "./origins.ts";
import {
  VWORLD_EVENT_PARTICIPANT_TABLE,
  VWORLD_EVENT_TABLE,
} from "./runtime-config.ts";
import { getEffectiveNick } from "./social-state.ts";
import {
  broadcastPlayerValuesChanged,
  sendVirtualWorldStreamEvent,
  sendWorldScopedStreamEvent,
} from "./stream-broadcast.ts";
import { getWorldClassForWorldId } from "./world-class-storage.ts";
import { deleteWorldRowsWhere, queryWorldRows } from "./world-db.ts";
import {
  consumeLivingItemsByType,
  countLivingItemsByType,
  isWithinTileDistance,
  LivingState,
} from "./world-domain.ts";

// Where events live: their state in vworld_events (one row per event and
// world) and who took part in vworld_event_participants. The rules are
// event-machine.ts; this module reads and writes the rows, carries out what a
// transition asks for, and tells everyone.
//
// Every change to an event happens with its row read `forUpdate` inside a
// transaction, so the world tick and a player starting or working on it at
// the same moment cannot both win.

const EVENT_LOCK_TIMEOUT_MS = 2000;
// A transition never chains further than this in one tick: waiting → ready →
// gathering is the longest a tick can legitimately move.
const MAX_STEPS_PER_TICK = 6;

/** Milliseconds to the stored seconds, keeping 0 as "never". */
function toSeconds(ms: number): number {
  return ms > 0 ? Math.floor(ms / 1000) : 0;
}

function fromSeconds(value: unknown): number {
  const seconds = Number(value || 0);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

function rowToState(row: any): EventState {
  let progress = {};
  try {
    progress = JSON.parse(String(row.progress_json || "{}")) || {};
  } catch (e) {
    progress = {};
  }
  return {
    eventId: String(row.event_id),
    worldId: String(row.world_id),
    phase: String(row.phase || "waiting") as EventState["phase"],
    startedBy: String(row.started_by || ""),
    phaseEndsAt: fromSeconds(row.phase_ends_at),
    readyAt: fromSeconds(row.ready_at),
    lastEndedAt: fromSeconds(row.last_ended_at),
    checkedAt: fromSeconds(row.checked_at),
    progress: progress,
  };
}

function stateToRow(state: EventState): Record<string, unknown> {
  return {
    event_id: state.eventId,
    world_id: state.worldId,
    phase: state.phase,
    started_by: state.startedBy,
    phase_ends_at: toSeconds(state.phaseEndsAt),
    ready_at: toSeconds(state.readyAt),
    last_ended_at: toSeconds(state.lastEndedAt),
    checked_at: toSeconds(state.checkedAt),
    progress_json: JSON.stringify(state.progress || {}),
    updated_at: toSeconds(Date.now()),
  };
}

/**
 * Runs `fn` on the event's state with its row locked, and writes back what it
 * returns. An event with no row yet starts from its initial state.
 */
function withLockedEvent<T>(
  def: EventDefinition,
  worldId: string,
  now: number,
  fn: (state: EventState) => { state: EventState | null; result: T },
): T {
  return database.transaction(
    function () {
      const [row] = database.query(VWORLD_EVENT_TABLE, {
        where: { event_id: def.id, world_id: String(worldId) },
        limit: 1,
        forUpdate: true,
      });
      const before = row
        ? rowToState(row)
        : initialEventState(def, worldId, now);
      const out = fn(before);
      if (out.state) {
        const data = stateToRow(out.state);
        if (row) database.update(VWORLD_EVENT_TABLE, row.id, data);
        else database.insert(VWORLD_EVENT_TABLE, data);
      }
      return out.result;
    },
    { timeoutMs: EVENT_LOCK_TIMEOUT_MS },
  );
}

function loadEventState(
  def: EventDefinition,
  worldId: string,
  now: number,
): EventState {
  const [row] = queryWorldRows(
    VWORLD_EVENT_TABLE,
    JSON.stringify({ event_id: def.id, world_id: String(worldId) }),
    1,
    "id",
    "asc",
  );
  return row ? rowToState(row) : initialEventState(def, worldId, now);
}

// ── Participants ─────────────────────────────────────────────────────────

interface Participant {
  rowId: number;
  userId: string;
  classId: string;
  contribution: number;
  rewardedAt: number;
}

function loadParticipants(eventId: string, worldId: string): Participant[] {
  return queryWorldRows(
    VWORLD_EVENT_PARTICIPANT_TABLE,
    JSON.stringify({ event_id: eventId, world_id: String(worldId) }),
    1000,
    "id",
    "asc",
  ).map(function (row: any) {
    return {
      rowId: Number(row.id),
      userId: String(row.user_id),
      classId: String(row.class_id || ""),
      contribution: Number(row.contribution || 0),
      rewardedAt: fromSeconds(row.rewarded_at),
    };
  });
}

function findParticipant(
  eventId: string,
  worldId: string,
  userId: string,
): Participant | null {
  return (
    loadParticipants(eventId, worldId).find(function (p) {
      return p.userId === String(userId);
    }) || null
  );
}

/** Makes the player a participant, if they are not one already. */
function enrol(eventId: string, worldId: string, userId: string): Participant {
  const existing = findParticipant(eventId, worldId, userId);
  if (existing) return existing;
  const classId = String(loadPlayerInventory(userId).class_id || "");
  database.insert(VWORLD_EVENT_PARTICIPANT_TABLE, {
    event_id: eventId,
    world_id: String(worldId),
    user_id: String(userId),
    class_id: classId,
    contribution: 0,
    reward_choice: -1,
    rewarded_at: 0,
  });
  return findParticipant(eventId, worldId, userId)!;
}

function clearParticipants(eventId: string, worldId: string): void {
  deleteWorldRowsWhere(
    VWORLD_EVENT_PARTICIPANT_TABLE,
    JSON.stringify({ event_id: eventId, world_id: String(worldId) }),
  );
}

// ── Where an event happens ───────────────────────────────────────────────

/** The anchor's tile, or null when its placement cannot be found. */
export function getEventAnchor(
  def: EventDefinition,
  worldId: string,
): { row: number; col: number } | null {
  const cls = getWorldClassForWorldId(worldId);
  const placement = cls
    ? (cls.placements || []).find(function (p) {
        return p.id === def.anchorPlacementId;
      })
    : null;
  const position = placement ? (placement.position as any) : null;
  if (
    !position ||
    !Number.isFinite(Number(position.row)) ||
    !Number.isFinite(Number(position.col))
  ) {
    return null;
  }
  return { row: Number(position.row), col: Number(position.col) };
}

function isNearAnchor(
  def: EventDefinition,
  worldId: string,
  at: { row: number; col: number },
): boolean {
  const anchor = getEventAnchor(def, worldId);
  if (!anchor) return true;
  return isWithinTileDistance(
    anchor.row,
    anchor.col,
    at.row,
    at.col,
    def.gatherRadius,
  );
}

/** Everyone near the anchor when gathering ends takes part. */
function enrolPresent(def: EventDefinition, worldId: string): void {
  buildActiveWorldPlayers(worldId).forEach(function (player) {
    if (isNearAnchor(def, worldId, player)) {
      enrol(def.id, worldId, player.player_id);
    }
  });
}

// ── Rewards ──────────────────────────────────────────────────────────────

function giveItems(
  worldId: string,
  userId: string,
  items: Array<{ itemId: string; count: number }>,
  experience: number,
  restoresFatigue = false,
): void {
  const inv = loadPlayerInventory(userId);
  if (restoresFatigue) inv.values.fatigue = 0;
  if (items.length > 0) spawnItemsForUser(worldId, userId, inv, items);
  if (experience > 0) {
    inv.values.experience = Number(inv.values.experience || 0) + experience;
    inv.values.totalExperience =
      Number(inv.values.totalExperience || 0) + experience;
  }
  savePlayerInventory(userId, inv);
  broadcastPlayerValuesChanged(worldId, userId, inv.values);
}

/** Teaches the player an origin they do not know yet, if there is one. */
function teachUnknownOrigin(worldId: string, userId: string): void {
  const inv = loadPlayerInventory(userId);
  const unknown = ORIGINS.filter(function (origin) {
    return Number(inv.values[origin.valueKey]) !== 1;
  });
  if (unknown.length === 0) return;
  const origin = unknown[Math.floor(Math.random() * unknown.length)];
  inv.values[origin.valueKey] = 1;
  savePlayerInventory(userId, inv);
  broadcastPlayerValuesChanged(worldId, userId, inv.values);
}

function isEligible(def: EventDefinition, participant: Participant): boolean {
  return !def.rewardNeedsContribution || participant.contribution > 0;
}

function grantReward(
  def: EventDefinition,
  worldId: string,
  participant: Participant,
  reward: EventReward,
  choiceIndex: number,
): void {
  giveItems(
    worldId,
    participant.userId,
    reward.items,
    reward.experience || 0,
    !!reward.restoresFatigue,
  );
  if (reward.teachesOrigin) teachUnknownOrigin(worldId, participant.userId);
  database.update(VWORLD_EVENT_PARTICIPANT_TABLE, participant.rowId, {
    reward_choice: choiceIndex,
    rewarded_at: toSeconds(Date.now()),
  });
}

// ── Announcements ────────────────────────────────────────────────────────

/** What every player is told about an event, and what the page starts with. */
export function toPublicEvent(
  def: EventDefinition,
  state: EventState,
): Record<string, unknown> {
  return {
    event_id: def.id,
    world_id: state.worldId,
    phase: state.phase,
    phase_ends_at: state.phaseEndsAt,
    label_key: def.labelKey,
    fallback_label: def.fallbackLabel,
    labels: def.labels,
    started_by_nick: state.startedBy ? getEffectiveNick(state.startedBy) : "",
    goal: state.progress.goal,
    total: state.progress.total,
    rewards: def.rewards.map(function (reward) {
      return { text_key: reward.textKey, text: reward.text };
    }),
  };
}

const CHAT_LINES: Record<string, string> = {
  ready: "is ready to begin.",
  gathering: "is gathering in Väinölä. Come and take part!",
  active: "has begun!",
  rewarding: "is over. Those who took part may claim their reward.",
  lapsed: "came to nothing: too few gathered.",
  failed: "failed.",
};

/**
 * Tells every player, wherever they are, writes it in the world's chat, and
 * lets the event change the world for its new phase.
 */
function announce(
  def: EventDefinition,
  state: EventState,
  outcome: EventOutcome,
): void {
  if (def.hooks && def.hooks.entered) {
    try {
      def.hooks.entered(state.worldId, state.phase, outcome, state);
    } catch (e) {
      vwLog("event hook failed", { event_id: def.id, error: String(e) });
    }
  }
  sendVirtualWorldStreamEvent(
    "world_event",
    Object.assign(toPublicEvent(def, state), { outcome: outcome }),
    {},
  );
  const line = outcome || state.phase;
  if (!CHAT_LINES[line]) return;
  const msg = {
    id:
      "wc-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2),
    sender_id: "event:" + def.id,
    sender_nick: def.fallbackLabel,
    sender_kind: "npc" as const,
    text: CHAT_LINES[line],
    text_key: "chat.event." + line,
    ts: Date.now(),
  };
  appendWorldChatMessage(state.worldId, msg);
  sendWorldScopedStreamEvent(state.worldId, "chat_message", msg);
}

// ── Moving events on ─────────────────────────────────────────────────────

/**
 * Advances one event as far as `now` allows and carries out what each step
 * asks for. Announcements go out after the row is written.
 */
export function advanceDueEvent(
  def: EventDefinition,
  worldId: string,
  now: number,
  roll: () => number = Math.random,
): EventState {
  const told: Array<{ state: EventState; outcome: EventOutcome }> = [];
  if (def.hooks && def.hooks.tick) def.hooks.tick(worldId, now);
  const readyNow =
    def.ready.kind === "when" ? def.ready.isReady(worldId, now) : false;
  const final = withLockedEvent(def, worldId, now, function (start) {
    let state = start;
    for (let step = 0; step < MAX_STEPS_PER_TICK; step++) {
      if (state.phase === "gathering" && now >= state.phaseEndsAt) {
        enrolPresent(def, worldId);
      }
      const participants = loadParticipants(def.id, worldId);
      const next = advanceEvent(def, state, now, {
        participants: participants.length,
        roll: roll(),
        readyNow: readyNow,
      });
      applyEffects(def, worldId, state, next.effects, participants);
      if (next.effects.indexOf("announce") !== -1) {
        told.push({ state: next.state, outcome: next.outcome });
      }
      const moved = next.state.phase !== state.phase;
      state = next.state;
      if (!moved) break;
    }
    return { state: state, result: state };
  });
  told.forEach(function (entry) {
    announce(def, entry.state, entry.outcome);
  });
  return final;
}

function applyEffects(
  def: EventDefinition,
  worldId: string,
  before: EventState,
  effects: EventEffect[],
  participants: Participant[],
): void {
  if (effects.indexOf("return_starter_cost") !== -1 && before.startedBy) {
    giveItems(worldId, before.startedBy, before.progress.starterCost || [], 0);
  }
  if (effects.indexOf("grant_single_reward") !== -1) {
    participants.forEach(function (participant) {
      if (isEligible(def, participant)) {
        grantReward(def, worldId, participant, def.rewards[0], 0);
      }
    });
  }
  if (effects.indexOf("clear_participants") !== -1) {
    clearParticipants(def.id, worldId);
  }
}

/** The world tick's hook: moves on every event that happens in this world. */
export function processDueEvents(worldId: string, now: number): void {
  const cls = getWorldClassForWorldId(worldId);
  if (!cls) return;
  getEventDefinitionsForWorldClass(cls.id).forEach(function (def) {
    try {
      advanceDueEvent(def, worldId, now);
    } catch (e) {
      vwLog("event could not advance", {
        event_id: def.id,
        world_id: String(worldId),
        error: String(e),
      });
    }
  });
}

// ── What players do ──────────────────────────────────────────────────────

/**
 * A player starting `def` with its start action: beside the anchor, meeting
 * its requirements and carrying its cost, which is taken (and returned if too
 * few gather). Saves `inv` when it succeeds.
 */
export function startEventForUser(
  def: EventDefinition,
  userId: string,
  worldId: string,
  inv: LivingState,
  at: { row: number; col: number },
  now: number,
): { ok: boolean; error?: string } {
  if (def.start.kind !== "player") {
    return { ok: false, error: "error.event_starts_itself" };
  }
  if (!isNearAnchor(def, worldId, at)) {
    return { ok: false, error: "error.event_too_far" };
  }
  const gate = evaluateEntityConditions(def.start.requires, {
    class_id: inv.class_id,
    values: inv.values,
  });
  if (!gate.ok) {
    return {
      ok: false,
      error: gate.errorMessage || "error.action_condition_not_met",
    };
  }
  const cost = def.start.cost || [];
  const carried = countLivingItemsByType(inv);
  const lacking = cost.some(function (entry) {
    return (carried[entry.itemId] || 0) < entry.count;
  });
  if (lacking) {
    return { ok: false, error: "error.missing_required_item_for_action" };
  }
  let started: EventState | null = null;
  const error = withLockedEvent(def, worldId, now, function (state) {
    const next = startEvent(def, state, now, userId, cost);
    if (typeof next === "string") return { state: null, result: next };
    cost.forEach(function (entry) {
      consumeLivingItemsByType(inv, entry.itemId, entry.count);
    });
    savePlayerInventory(userId, inv);
    enrol(def.id, worldId, userId);
    started = next;
    return { state: next, result: "" };
  });
  if (error) return { ok: false, error: error };
  if (started) announce(def, started, "");
  return { ok: true };
}

/**
 * A participant's work on an active event, counted by their class's role.
 * Someone who arrived after gathering takes part by working. Returns whether
 * the work was taken and whether the event has now succeeded.
 */
export function contributeToEvent(
  eventId: string,
  userId: string,
  worldId: string,
  amount: number,
  now: number,
): { ok: boolean; error?: string; succeeded?: boolean } {
  const def = getEventDefinition(eventId);
  if (!def) return { ok: false, error: "error.event_not_active" };
  const classId = String(loadPlayerInventory(userId).class_id || "");
  const counted = amount * roleMultiplier(def, classId);
  type Contribution = { ok: boolean; error?: string; succeeded?: boolean };
  const result = withLockedEvent<Contribution>(
    def,
    worldId,
    now,
    function (state) {
      const next = contributeToEventState(state, counted);
      if (!next) {
        return {
          state: null,
          result: { ok: false, error: "error.event_not_active" },
        };
      }
      const participant = enrol(def.id, worldId, userId);
      database.update(VWORLD_EVENT_PARTICIPANT_TABLE, participant.rowId, {
        contribution: Math.round(participant.contribution + counted),
      });
      return {
        state: next,
        result: { ok: true, succeeded: !!next.progress.succeeded },
      };
    },
  );
  // Success ends the work at once rather than at the next tick.
  if (result.ok && result.succeeded) advanceDueEvent(def, worldId, now);
  return result;
}

/** A participant taking one of the rewards on offer, once. */
export function claimEventReward(
  eventId: string,
  userId: string,
  worldId: string,
  choiceIndex: number,
  now: number,
): { ok: boolean; error?: string } {
  const def = getEventDefinition(eventId);
  if (!def) return { ok: false, error: "error.event_not_rewarding" };
  type Claim = { ok: boolean; error?: string };
  return withLockedEvent<Claim>(def, worldId, now, function (state) {
    const refuse = function (error: string) {
      return { state: null, result: { ok: false, error: error } };
    };
    if (state.phase !== "rewarding") return refuse("error.event_not_rewarding");
    const participant = findParticipant(def.id, worldId, userId);
    if (!participant || !isEligible(def, participant)) {
      return refuse("error.event_not_a_participant");
    }
    if (participant.rewardedAt) return refuse("error.event_reward_taken");
    const reward = def.rewards[Math.floor(choiceIndex)];
    if (!reward) return refuse("error.event_no_such_reward");
    grantReward(def, worldId, participant, reward, Math.floor(choiceIndex));
    return { state: null, result: { ok: true } };
  });
}

/** Every event under way anywhere, for a page that is just loading. */
export function buildWorldEventsSnapshot(
  now: number,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  Object.keys(EVENT_DEFINITIONS).forEach(function (id) {
    const def = EVENT_DEFINITIONS[id];
    queryWorldRows(
      VWORLD_EVENT_TABLE,
      JSON.stringify({ event_id: def.id }),
      100,
      "id",
      "asc",
    ).forEach(function (row: any) {
      const state = rowToState(row);
      if (state.phase === "waiting") return;
      // An event that is always ready is news only once someone starts it.
      if (state.phase === "ready" && def.ready.kind === "always") return;
      out.push(toPublicEvent(def, state));
    });
  });
  return out;
}

/** The state of one event in one world, for tests and handlers. */
export function getEventState(
  eventId: string,
  worldId: string,
  now: number,
): EventState | null {
  const def = getEventDefinition(eventId);
  return def ? loadEventState(def, worldId, now) : null;
}

/** Who has done something for the event this run, first come first. */
export function getEventContributors(
  eventId: string,
  worldId: string,
): string[] {
  return loadParticipants(eventId, worldId)
    .filter(function (p) {
      return p.contribution > 0;
    })
    .map(function (p) {
      return p.userId;
    });
}

/** How much a player has given an event this run, or null if nothing. */
export function getEventContribution(
  eventId: string,
  worldId: string,
  userId: string,
): number | null {
  const participant = findParticipant(eventId, worldId, userId);
  return participant ? participant.contribution : null;
}
