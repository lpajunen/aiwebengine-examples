import { ActionCondition } from "./action-logic-interpreter.ts";

// Recurring events in the shared world (DESIGN-kalevala.md, section 4). Every
// event is one entry here and runs on one state machine (event-machine.ts);
// events.ts keeps their state and moves them on from the world tick.
//
// An event happens in each world of its `worldClassId` — in practice Väinölä —
// around the placement `anchorPlacementId` names. Anyone near the anchor when
// it gathers takes part, everyone who takes part is rewarded, and every event
// comes round again.

export type EventPhase =
  "waiting" | "ready" | "gathering" | "active" | "rewarding";

export type EventReadiness =
  // Ready again this long after it last ended (e.g. the oak regrowing).
  | { kind: "cycle"; afterMs: number }
  // Ready at unpredictable times: on average every meanIntervalMs, never
  // sooner than minIntervalMs after it last ended.
  | { kind: "random"; meanIntervalMs: number; minIntervalMs: number }
  // Always ready; a player start's cooldown is what spaces it out.
  | { kind: "always" }
  // Ready when the world says so (the oak fully grown), asked every tick.
  | { kind: "when"; isReady: (worldId: string, now: number) => boolean };

export type EventStart =
  // Starts by itself once ready.
  | { kind: "auto" }
  // A player starts it with `actionId`, beside the anchor, if they meet
  // `requires` and carry `cost` (returned if too few gather).
  | {
      kind: "player";
      actionId: string;
      requires?: ActionCondition[];
      cost?: Array<{ itemId: string; count: number }>;
      cooldownMs?: number;
    };

export interface EventReward {
  // A choice the participant makes, or the one thing everyone gets.
  textKey: string;
  text: string;
  items: Array<{ itemId: string; count: number }>;
  experience?: number;
  // Teaches the participant an origin they do not know (origins.ts).
  teachesOrigin?: boolean;
}

export interface EventDefinition {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  labels: Record<string, string>;
  worldClassId: string;
  anchorPlacementId: string;
  // How near the anchor a player must be to take part, in tiles.
  gatherRadius: number;
  ready: EventReadiness;
  start: EventStart;
  gatherMs: number;
  activeMs: number;
  rewardWindowMs: number;
  minParticipants: number;
  // The work the event asks for, per participant: contributions add up to it,
  // and reaching it is success. Without one, the event succeeds by lasting.
  goalPerParticipant?: number;
  // What each class brings: its contributions count this many times over.
  roles?: Array<{ classId: string; contributionMultiplier: number }>;
  // One reward is given to everyone who took part; several are a choice.
  rewards: EventReward[];
  // Only participants who contributed something are rewarded.
  rewardNeedsContribution?: boolean;
  // What the event does to the world: `tick` before every advance, and
  // `entered` after each phase change, once the change is written.
  hooks?: {
    tick?: (worldId: string, now: number) => void;
    entered?: (worldId: string, phase: EventPhase, outcome: string) => void;
  };
}

export const EVENT_DEFINITIONS: Record<string, EventDefinition> = {};

export function getEventDefinition(eventId: string): EventDefinition | null {
  return EVENT_DEFINITIONS[String(eventId || "")] || null;
}

/** The events that happen in worlds of `worldClassId`. */
export function getEventDefinitionsForWorldClass(
  worldClassId: string,
): EventDefinition[] {
  return Object.keys(EVENT_DEFINITIONS)
    .map(function (id) {
      return EVENT_DEFINITIONS[id];
    })
    .filter(function (def) {
      return def.worldClassId === String(worldClassId || "");
    });
}

/** The event a player starts with `actionId`, if any. */
export function getEventStartedByAction(
  actionId: string,
): EventDefinition | null {
  const ids = Object.keys(EVENT_DEFINITIONS);
  for (let i = 0; i < ids.length; i++) {
    const def = EVENT_DEFINITIONS[ids[i]];
    if (def.start.kind === "player" && def.start.actionId === actionId) {
      return def;
    }
  }
  return null;
}
