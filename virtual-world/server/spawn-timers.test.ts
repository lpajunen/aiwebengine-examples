/**
 * Tests for respawn timers.
 *
 * When something the world's manifest tracks is taken — an item picked up, an
 * NPC killed — a timer is written for a replacement, and the NPC tick spawns it
 * once the timer comes due. The delay is half an hour in production, so these
 * cases drive the clock themselves: `Date.now` decides when a timer is written
 * for, and `processDueSpawnTimers` takes the current time as an argument.
 *
 * The rule worth guarding hardest is the one that keeps a world from growing
 * without bound: the manifest count is a target population, not a budget. A
 * tick interrupted between spawning and deleting its timer leaves that timer
 * due, and without the population check it would spawn again on every
 * following tick — each extra NPC making the next tick slower.
 *
 * Database-backed; the world class, world and rows are removed afterwards.
 */

import { RESPAWN_DELAY_MS } from "./runtime-config.ts";
import {
  processDueSpawnTimers,
  scheduleRespawnIfManifestTracked,
} from "./spawn-timers.ts";
import {
  insertSpawnTimer,
  loadSpawnTimersForWorld,
} from "./spawn-timer-storage.ts";
import { countWorldItemsByType, upsertWorldItem } from "./item-storage.ts";
import { countNPCsByClass } from "./npc-storage.ts";
import { deleteWorldClass, upsertWorldClass } from "./world-class-storage.ts";
import { cleanupTestData, createTestWorld } from "./test-fixtures.ts";
import { runInWorldTransaction } from "./world-db.ts";

const DIM = 20;
// One of each, so "the world already holds the target" is a single item away.
const TRACKED_ITEM = "sword";
const TRACKED_NPC = "npc_wolf";
const UNTRACKED_ITEM = "chest";

let classId = "";
let worldId = "";
let counter = 0;
let realNow = Date.now;
// A round, fixed clock: timers are stored to the second, so a wall clock would
// make "ready at exactly now" a coin toss.
const NOW = 1800000000000;

beforeEach(function () {
  classId = "test_wc_spawn_" + ++counter + "_" + Date.now();
  upsertWorldClass({
    id: classId,
    baseType: "forest",
    rows: DIM,
    cols: DIM,
    labelKey: "world.class." + classId,
    fallbackLabel: "Spawn timer test world",
    itemSpawns: [{ id: TRACKED_ITEM, count: 1 }],
    npcSpawns: [{ id: TRACKED_NPC, count: 1 }],
    placements: [],
    generation: null,
    placementRevision: 0,
    ownerIds: ["test-owner"],
    labels: {},
  });
  worldId = createTestWorld(DIM, DIM, classId);
  realNow = Date.now;
  Date.now = function () {
    return NOW;
  };
});

afterEach(function () {
  Date.now = realNow;
  runInWorldTransaction("test_spawn_cleanup", function () {
    deleteWorldClass(classId);
  });
  cleanupTestData();
});

function timers(): Array<{ kind: string; type_id: string; ready_at: number }> {
  return loadSpawnTimersForWorld(worldId).map(function (timer) {
    return {
      kind: timer.kind,
      type_id: timer.type_id,
      ready_at: timer.ready_at,
    };
  });
}

function itemCount(type: string): number {
  return countWorldItemsByType(worldId)[type] || 0;
}

function npcCount(classIdOfNPC: string): number {
  return countNPCsByClass(worldId)[classIdOfNPC] || 0;
}

function newItem(type: string): any {
  return { id: "test-item-" + ++counter + "-" + NOW, type: type };
}

describe("scheduling a replacement", () => {
  test("something the manifest tracks gets a timer", () => {
    scheduleRespawnIfManifestTracked(worldId, "item", TRACKED_ITEM);

    const scheduled = timers();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].kind).toBe("item");
    expect(scheduled[0].type_id).toBe(TRACKED_ITEM);
    // Timers are stored to the second, so the delay lands within a second.
    expect(
      Math.abs(scheduled[0].ready_at - (NOW + RESPAWN_DELAY_MS)) <= 1000,
    ).toBe(true);
  });

  test("an NPC class the manifest tracks gets one too", () => {
    scheduleRespawnIfManifestTracked(worldId, "npc", TRACKED_NPC);

    const scheduled = timers();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].kind).toBe("npc");
    expect(scheduled[0].type_id).toBe(TRACKED_NPC);
  });

  test("anything the manifest does not track gets none", () => {
    // A quest item, a corpse, a chest somebody built: taking one of those is
    // not a hole in the world's population.
    scheduleRespawnIfManifestTracked(worldId, "item", UNTRACKED_ITEM);

    expect(timers()).toEqual([]);
  });
});

describe("processing what is due", () => {
  test("a due timer spawns the replacement and is spent", () => {
    scheduleRespawnIfManifestTracked(worldId, "item", TRACKED_ITEM);

    processDueSpawnTimers(worldId, NOW + RESPAWN_DELAY_MS);

    expect(itemCount(TRACKED_ITEM)).toBe(1);
    expect(timers()).toEqual([]);
  });

  test("a timer that is not due yet is left alone", () => {
    scheduleRespawnIfManifestTracked(worldId, "item", TRACKED_ITEM);

    processDueSpawnTimers(worldId, NOW + RESPAWN_DELAY_MS - 60000);

    expect(itemCount(TRACKED_ITEM)).toBe(0);
    expect(timers()).toHaveLength(1);
  });

  test("a due NPC timer spawns one of that class", () => {
    scheduleRespawnIfManifestTracked(worldId, "npc", TRACKED_NPC);

    processDueSpawnTimers(worldId, NOW + RESPAWN_DELAY_MS);

    expect(npcCount(TRACKED_NPC)).toBe(1);
    expect(timers()).toEqual([]);
  });

  test("processing again spawns nothing more", () => {
    scheduleRespawnIfManifestTracked(worldId, "item", TRACKED_ITEM);

    processDueSpawnTimers(worldId, NOW + RESPAWN_DELAY_MS);
    processDueSpawnTimers(worldId, NOW + RESPAWN_DELAY_MS);

    expect(itemCount(TRACKED_ITEM)).toBe(1);
  });

  test("a world already at its target drops the timer without spawning", () => {
    // This is the anti-runaway rule: the replacement this timer stands for is
    // not missing any more, so the timer is stale rather than owed.
    upsertWorldItem(worldId, 1, 1, newItem(TRACKED_ITEM));
    scheduleRespawnIfManifestTracked(worldId, "item", TRACKED_ITEM);

    processDueSpawnTimers(worldId, NOW + RESPAWN_DELAY_MS);

    expect(itemCount(TRACKED_ITEM)).toBe(1);
    expect(timers()).toEqual([]);
  });

  test("two due timers for the same type only fill the gap once", () => {
    // What an interrupted tick leaves behind: the second timer finds the
    // population restored and is discarded.
    insertSpawnTimer(worldId, "item", TRACKED_ITEM, NOW - 1000);
    insertSpawnTimer(worldId, "item", TRACKED_ITEM, NOW - 1000);

    processDueSpawnTimers(worldId, NOW);

    expect(itemCount(TRACKED_ITEM)).toBe(1);
    expect(timers()).toEqual([]);
  });

  test("a timer for a type nobody defines is discarded, not retried", () => {
    insertSpawnTimer(worldId, "item", "no_such_item_class", NOW - 1000);
    insertSpawnTimer(worldId, "npc", "no_such_living_class", NOW - 1000);

    processDueSpawnTimers(worldId, NOW);

    expect(timers()).toEqual([]);
  });

  test("a world with no timers at all is a no-op", () => {
    processDueSpawnTimers(worldId, NOW + RESPAWN_DELAY_MS);

    expect(itemCount(TRACKED_ITEM)).toBe(0);
    expect(timers()).toEqual([]);
  });
});

describe("the clock", () => {
  test("a timer is written against the time it was scheduled, not read", () => {
    scheduleRespawnIfManifestTracked(worldId, "item", TRACKED_ITEM);
    const scheduled = timers()[0];

    // Time passing does not move a timer that was already written.
    Date.now = function () {
      return NOW + RESPAWN_DELAY_MS * 4;
    };

    expect(timers()[0].ready_at).toBe(scheduled.ready_at);
  });

  test("processing takes the time from its caller, not the wall", () => {
    // The tick passes its own `now`, which is what makes catching up possible.
    scheduleRespawnIfManifestTracked(worldId, "item", TRACKED_ITEM);
    Date.now = function () {
      return NOW + RESPAWN_DELAY_MS * 4;
    };

    processDueSpawnTimers(worldId, NOW);

    expect(itemCount(TRACKED_ITEM)).toBe(0);
    expect(timers()).toHaveLength(1);
  });
});
