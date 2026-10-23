import { writeChronicle } from "./chronicle.ts";
import { bringLivingBeside, sendAwayLivings } from "./event-livings.ts";
import { getEventAnchor } from "./events.ts";
import { EVENT_DEFINITIONS, EventPhase } from "./event-registry.ts";
import { START_WORLD_CLASS_ID } from "./runtime-config.ts";

// The kantele concert (DESIGN-kalevala.md, section 7): anyone with a kantele
// plays beneath the old oak, everyone near listens, and the animals come to
// hear it as they came to Väinämöinen. The song rests every listener, and the
// chronicle remembers who played.

export const KANTELE_CONCERT_EVENT_ID = "kantele_concert";

/** Who comes to listen: the forest's animals, and now and then an elk. */
const LISTENING_ANIMALS = ["npc_reindeer", "npc_swan", "npc_cuckoo"];
const SHY_LISTENER = "npc_elk";

function enteredPhase(
  worldId: string,
  phase: EventPhase,
  state: { startedBy: string; progress: { goal?: number } },
): void {
  const anchor = getEventAnchor(
    EVENT_DEFINITIONS[KANTELE_CONCERT_EVENT_ID],
    worldId,
  );
  if (phase === "active" && anchor) {
    LISTENING_ANIMALS.forEach(function (classId) {
      bringLivingBeside(worldId, classId, anchor, KANTELE_CONCERT_EVENT_ID);
    });
    if (Math.random() < 1 / 3) {
      bringLivingBeside(
        worldId,
        SHY_LISTENER,
        anchor,
        KANTELE_CONCERT_EVENT_ID,
      );
    }
  }
  if (phase === "rewarding" && state.startedBy) {
    writeChronicle(worldId, "concert", [state.startedBy]);
  }
  if (phase === "ready" || phase === "waiting") {
    sendAwayLivings(worldId, KANTELE_CONCERT_EVENT_ID);
  }
}

EVENT_DEFINITIONS[KANTELE_CONCERT_EVENT_ID] = {
  id: KANTELE_CONCERT_EVENT_ID,
  labelKey: "event.kantele_concert.name",
  fallbackLabel: "A kantele concert",
  labels: { fi: "Kanteleen soitto" },
  worldClassId: START_WORLD_CLASS_ID,
  anchorPlacementId: "old-oak",
  gatherRadius: 6,
  ready: { kind: "always" },
  // The action is the kantele's own: carrying one is what lets a player
  // give a concert at all.
  start: {
    kind: "player",
    actionId: "give_concert",
    cooldownMs: 30 * 60 * 1000,
  },
  gatherMs: 3 * 60 * 1000,
  activeMs: 5 * 60 * 1000,
  rewardWindowMs: 60 * 1000,
  minParticipants: 1,
  rewards: [
    {
      textKey: "event.kantele_concert.reward",
      text: "The song's blessing",
      items: [],
      experience: 15,
      restoresFatigue: true,
    },
  ],
  hooks: {
    entered: function (
      worldId: string,
      phase: EventPhase,
      outcome: string,
      state: { startedBy: string; progress: { goal?: number } },
    ) {
      enteredPhase(worldId, phase, state);
    },
  },
};
