import { EVENT_DEFINITIONS, EventPhase } from "./event-registry.ts";
import { contributeToEvent, getEventContributors } from "./events.ts";
import { writeChronicle } from "./chronicle.ts";
import {
  loadPlayerInventory,
  loadWorldItems,
  savePlayerInventory,
  upsertWorldItem,
} from "./item-storage.ts";
import { bringLivingBeside, sendAwayLivings } from "./event-livings.ts";
import { START_WORLD_CLASS_ID } from "./runtime-config.ts";
import { rollBonus, trainSkill } from "./skills.ts";
import {
  broadcastItemChange,
  broadcastPlayerValuesChanged,
} from "./stream-broadcast.ts";
import {
  countLivingItemsByType,
  isWithinTileDistance,
  LivingState,
} from "./world-domain.ts";
import { loadWorldTrees } from "./world-mod-storage.ts";

// The great oak (DESIGN-kalevala.md, section 5), the first event. The
// Kalevala's second poem: the oak grows until it hides the sun and the moon,
// and a small man risen from the sea fells it.
//
// The oak is the old_oak fixture in Väinölä. Its state carries `growth`
// (0–100) and `grownAt`, and two flags the oak's actions read through their
// validWhen: `summonable` while the event is ready, `felling` while it runs.
// An oak that predates growth counts as fully grown.

export const GREAT_OAK_EVENT_ID = "great_oak";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long the oak takes to grow full with no trees planted around it. */
export const FULL_GROWTH_MS = 7 * DAY_MS;
/** Every this many trees in Väinölä adds the oak's own pace again. */
const TREES_PER_EXTRA_PACE = 50;
/** How near the oak a striker must stand, in tiles. */
const STRIKE_REACH = 1;
/** What a striker may swing: an axe, a saw or a knife. */
const STRIKING_TOOLS = ["stone_axe", "saw", "knife"];

interface Oak {
  row: number;
  col: number;
  item: any;
}

function findOak(worldId: string): Oak | null {
  const byTile = loadWorldItems(worldId);
  const keys = Object.keys(byTile);
  for (let i = 0; i < keys.length; i++) {
    const items = byTile[keys[i]] || [];
    for (let j = 0; j < items.length; j++) {
      if (items[j] && items[j].type === "old_oak") {
        const parts = keys[i].split("_");
        return { row: Number(parts[0]), col: Number(parts[1]), item: items[j] };
      }
    }
  }
  return null;
}

/** How grown an oak is: 0–100, full when it never recorded any. */
export function oakGrowth(item: any): number {
  const growth = Number(item && item.state && item.state.growth);
  return Number.isFinite(growth) ? Math.max(0, Math.min(100, growth)) : 100;
}

/**
 * The oak's growth after `elapsedMs`: a week from nothing to full on its own,
 * faster for every tree the players have planted in Väinölä.
 */
export function grownOak(
  growth: number,
  elapsedMs: number,
  trees: number,
): number {
  const pace = 1 + Math.max(0, trees) / TREES_PER_EXTRA_PACE;
  const next = growth + (Math.max(0, elapsedMs) / FULL_GROWTH_MS) * 100 * pace;
  return Math.min(100, next);
}

function saveOakState(
  worldId: string,
  oak: Oak,
  patch: Record<string, unknown>,
): void {
  const item = Object.assign({}, oak.item, {
    state: Object.assign({}, oak.item.state || {}, patch),
  });
  upsertWorldItem(worldId, oak.row, oak.col, item);
  const tileItems = (loadWorldItems(worldId)[oak.row + "_" + oak.col] ||
    []) as any[];
  broadcastItemChange(
    worldId,
    "world",
    GREAT_OAK_EVENT_ID,
    "fixture_state",
    oak.row,
    oak.col,
    tileItems,
  );
}

/**
 * The tick's growth. Written only when it passes a whole point, so a week's
 * growing is a hundred writes; `grownAt` stays put in between, which keeps
 * the time since then counting.
 */
function growOak(worldId: string, now: number): void {
  const oak = findOak(worldId);
  if (!oak) return;
  const growth = oakGrowth(oak.item);
  if (growth >= 100) return;
  const grownAt = Number(oak.item.state && oak.item.state.grownAt) || now;
  const trees = Object.keys(loadWorldTrees(worldId)).length;
  const next = grownOak(growth, now - grownAt, trees);
  if (Math.floor(next) === Math.floor(growth)) return;
  saveOakState(worldId, oak, { growth: next, grownAt: now });
}

function isOakGrown(worldId: string): boolean {
  const oak = findOak(worldId);
  return !!oak && oakGrowth(oak.item) >= 100;
}

// ── The small man ────────────────────────────────────────────────────────

/** He rises beside the oak, and goes back to the sea when it is over. */
function raiseSmallMan(worldId: string, oak: Oak): void {
  bringLivingBeside(worldId, "npc_small_man", oak, GREAT_OAK_EVENT_ID);
}

/** What each phase does to the oak and the shore. */
function enteredPhase(worldId: string, phase: EventPhase): void {
  const oak = findOak(worldId);
  if (!oak) return;
  const flags = {
    summonable: phase === "ready" ? 1 : 0,
    felling: phase === "active" ? 1 : 0,
  };
  if (phase === "rewarding") {
    // Felled: told in the chronicle with everyone who struck it.
    writeChronicle(
      worldId,
      "oak_felled",
      getEventContributors(GREAT_OAK_EVENT_ID, worldId),
    );
    // An acorn is left where it stood, and it grows again from nothing. The
    // small man stays to offer the rewards.
    saveOakState(
      worldId,
      oak,
      Object.assign(flags, { growth: 0, grownAt: Date.now() }),
    );
    return;
  }
  saveOakState(worldId, oak, flags);
  if (phase === "gathering") raiseSmallMan(worldId, oak);
  if (phase === "ready" || phase === "waiting") {
    sendAwayLivings(worldId, GREAT_OAK_EVENT_ID);
  }
}

// ── Striking ─────────────────────────────────────────────────────────────

/**
 * One strike at the oak while it is being felled: beside it, with an axe, a
 * saw or a knife. A d20 with the Voima modifier and woodcraft against 10 is a
 * full blow (two, three on a natural 20); a miss still chips it (one). Trains
 * woodcraft, and counts for the striker's class's role.
 */
export function strikeOakForUser(
  userId: string,
  worldId: string,
  inv: LivingState,
  at: { row: number; col: number },
  now: number,
  roll: () => number = Math.random,
): { ok: boolean; error?: string; amount?: number; felled?: boolean } {
  const oak = findOak(worldId);
  if (
    !oak ||
    !isWithinTileDistance(oak.row, oak.col, at.row, at.col, STRIKE_REACH)
  ) {
    return { ok: false, error: "error.event_too_far" };
  }
  const carried = countLivingItemsByType(inv);
  const armed = STRIKING_TOOLS.some(function (tool) {
    return (carried[tool] || 0) > 0;
  });
  if (!armed) return { ok: false, error: "error.need_a_blade_for_the_oak" };

  const skill = { id: "puutyo", attribute: "voima", gain: 1 };
  const die = 1 + Math.floor(roll() * 20);
  const total = die + rollBonus(inv.values, skill);
  const amount = die === 20 ? 3 : total >= 10 ? 2 : 1;

  const worked = contributeToEvent(
    GREAT_OAK_EVENT_ID,
    userId,
    worldId,
    amount,
    now,
  );
  if (!worked.ok) return { ok: false, error: worked.error };

  const fresh = loadPlayerInventory(userId);
  trainSkill(fresh.values, String(fresh.class_id || ""), skill);
  savePlayerInventory(userId, fresh);
  inv.values = fresh.values;
  broadcastPlayerValuesChanged(worldId, userId, fresh.values);
  return { ok: true, amount: amount, felled: !!worked.succeeded };
}

// ── The branch's luck ────────────────────────────────────────────────────

/**
 * Luck from a branch of the oak: a quarter of the time, one more of what a
 * skilled hand gathers. Carrying more than one changes nothing.
 */
export function oakBranchLuck(
  inv: LivingState,
  roll: () => number = Math.random,
): number {
  const carried = countLivingItemsByType(inv);
  return (carried.oak_branch || 0) > 0 && roll() < 0.25 ? 1 : 0;
}

// ── The event ────────────────────────────────────────────────────────────

EVENT_DEFINITIONS[GREAT_OAK_EVENT_ID] = {
  id: GREAT_OAK_EVENT_ID,
  labelKey: "event.great_oak.name",
  fallbackLabel: "The great oak",
  labels: { fi: "Iso tammi" },
  worldClassId: START_WORLD_CLASS_ID,
  anchorPlacementId: "old-oak",
  gatherRadius: 8,
  ready: {
    kind: "when",
    isReady: function (worldId: string) {
      return isOakGrown(worldId);
    },
  },
  start: {
    kind: "player",
    actionId: "call_small_man",
    requires: [
      {
        field: "values.synty_tammi",
        op: "eq",
        value: 1,
        errorMessage: "error.origin_of_the_oak_not_known",
      },
    ],
    cost: [{ itemId: "sea_shell", count: 1 }],
  },
  gatherMs: 10 * 60 * 1000,
  activeMs: 15 * 60 * 1000,
  rewardWindowMs: 10 * 60 * 1000,
  minParticipants: 1,
  goalPerParticipant: 40,
  // Who strikes hardest, and what the others bring: the singer's work song,
  // the woodsman clearing branches, the sage's origin keeping the wounds
  // open.
  roles: [
    { classId: "player_urho", contributionMultiplier: 1.5 },
    { classId: "player_seppa", contributionMultiplier: 1.5 },
    { classId: "player_laulaja", contributionMultiplier: 1.25 },
    { classId: "player_erankavija", contributionMultiplier: 1.25 },
    { classId: "player_tietaja", contributionMultiplier: 1.25 },
  ],
  rewards: [
    {
      textKey: "event.great_oak.reward_branch",
      text: "A branch: everlasting luck",
      items: [{ itemId: "oak_branch", count: 1 }],
    },
    {
      textKey: "event.great_oak.reward_crown",
      text: "The crown: knowledge",
      items: [],
      teachesOrigin: true,
    },
    {
      textKey: "event.great_oak.reward_leaf",
      text: "A leaf: everlasting love",
      items: [{ itemId: "oak_leaf", count: 1 }],
    },
  ],
  rewardNeedsContribution: true,
  hooks: {
    tick: growOak,
    entered: function (worldId: string, phase: EventPhase) {
      enteredPhase(worldId, phase);
    },
  },
};
