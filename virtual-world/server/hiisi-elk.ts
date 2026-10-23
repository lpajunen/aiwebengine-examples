import { writeChronicle } from "./chronicle.ts";
import { bringLivingBeside, sendAwayLivings } from "./event-livings.ts";
import { getEventAnchor, getEventContributors } from "./events.ts";
import { EVENT_DEFINITIONS, EventPhase } from "./event-registry.ts";
import { setOakFlags } from "./great-oak.ts";
import { getLivingClass } from "./living-registry.ts";
import { loadWorldNPCs, saveWorldNPCs } from "./npc-storage.ts";
import { START_WORLD_CLASS_ID } from "./runtime-config.ts";
import { broadcastNPCValuesChanged } from "./stream-broadcast.ts";

// The elk of Hiisi (DESIGN-kalevala.md, section 7). Lemminkäinen's hunt: the
// demon Hiisi's great elk, which only a chase brings down. Someone who knows
// the forest picks up its trail at the old oak; everyone near joins the hunt,
// and every blow anyone lands on the elk — by fight or by spell — is their
// share of it. The elk is as hard to bring down as the hunt is large, so
// bringing it down is the hunt's success; if it escapes, the hunt failed.

export const HIISI_ELK_EVENT_ID = "hiisi_elk";
const ELK_CLASS_ID = "npc_hiisi_elk";
const DAY_MS = 24 * 60 * 60 * 1000;

/** The elk rises with as many hit points as the hunt has work to do. */
function raiseElk(worldId: string, goal: number): void {
  const anchor = getEventAnchor(EVENT_DEFINITIONS[HIISI_ELK_EVENT_ID], worldId);
  if (!anchor) return;
  const elkId = bringLivingBeside(
    worldId,
    ELK_CLASS_ID,
    anchor,
    HIISI_ELK_EVENT_ID,
  );
  if (!elkId) return;
  const cls = getLivingClass(ELK_CLASS_ID);
  const classMax = Number(
    (cls && cls.valueTemplate && cls.valueTemplate.maxHitPoints) || 10,
  );
  const npcs = loadWorldNPCs(worldId);
  const elk = npcs[elkId];
  if (!elk) return;
  elk.values = Object.assign({}, elk.values, {
    hitPointBonus: Math.max(0, goal - classMax),
    currentHitPoints: goal,
  });
  saveWorldNPCs(worldId, { [elkId]: elk });
  broadcastNPCValuesChanged(worldId, elkId, elk.values, elk.class_id);
}

function enteredPhase(
  worldId: string,
  phase: EventPhase,
  state: { startedBy: string; progress: { goal?: number } },
): void {
  setOakFlags(worldId, { elkTrail: phase === "ready" ? 1 : 0 });
  if (phase === "active") raiseElk(worldId, Number(state.progress.goal || 0));
  if (phase === "rewarding") {
    writeChronicle(
      worldId,
      "elk_caught",
      getEventContributors(HIISI_ELK_EVENT_ID, worldId),
    );
  }
  // Brought down, or escaped back to Hiisi's woods.
  if (phase === "rewarding" || phase === "waiting") {
    sendAwayLivings(worldId, HIISI_ELK_EVENT_ID);
  }
}

EVENT_DEFINITIONS[HIISI_ELK_EVENT_ID] = {
  id: HIISI_ELK_EVENT_ID,
  labelKey: "event.hiisi_elk.name",
  fallbackLabel: "The elk of Hiisi",
  labels: { fi: "Hiiden hirvi" },
  worldClassId: START_WORLD_CLASS_ID,
  anchorPlacementId: "old-oak",
  gatherRadius: 8,
  ready: { kind: "cycle", afterMs: 2 * DAY_MS },
  // Someone who has hunted a little can read the trail.
  start: {
    kind: "player",
    actionId: "track_elk",
    requires: [
      {
        field: "values.metsastys",
        op: "gte",
        value: 5,
        errorMessage: "error.not_enough_hunting",
      },
    ],
  },
  gatherMs: 5 * 60 * 1000,
  activeMs: 10 * 60 * 1000,
  rewardWindowMs: 5 * 60 * 1000,
  minParticipants: 1,
  goalPerParticipant: 25,
  quarryClassId: ELK_CLASS_ID,
  rewards: [
    {
      textKey: "event.hiisi_elk.reward",
      text: "A hide of Hiisi's elk",
      items: [{ itemId: "elk_hide", count: 1 }],
      experience: 20,
    },
  ],
  rewardNeedsContribution: true,
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
