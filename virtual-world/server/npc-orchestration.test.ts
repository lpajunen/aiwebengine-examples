/**
 * Tests for the NPC tick — the world's heartbeat.
 *
 * Every 500 ms a world with recent activity gets a tick: its NPCs are seeded if
 * missing, each one moves or idles, respawn timers come due, and follow and
 * fight advance. Two things gate it, and both are here: a cadence, so a busy
 * world is not ticked once per request, and a lease, so two instances do not
 * tick the same world at the same moment.
 *
 * The clock is stubbed and the tick's `now` is passed in, so nothing waits.
 * `runNPCTick()` itself is deliberately never called: it iterates every active
 * world in the deployment, including the real ones.
 *
 * The NPCs are a class of this suite's own that never idles, so "did it move?"
 * is a question with an answer rather than a coin toss.
 */

import { NPC_TICK_MS } from "./runtime-config.ts";
import {
  getWorldNPCSnapshot,
  tickWorldNPCs,
  tryAcquireNPCTickLease,
  tryTickWorldNPCs,
} from "./npc-orchestration.ts";
import {
  countNPCsByClass,
  loadNPCActiveWorlds,
  loadNPCLastTick,
  loadWorldNPCs,
  markNPCWorldActive,
} from "./npc-storage.ts";
import { insertSpawnTimer } from "./spawn-timer-storage.ts";
import { countWorldItemsByType } from "./item-storage.ts";
import { deleteLivingClass, upsertLivingClass } from "./living-registry.ts";
import { deleteWorldClass, upsertWorldClass } from "./world-class-storage.ts";
import { cleanupTestData, createTestWorld } from "./test-fixtures.ts";
import { getEffectiveMap } from "./world-bootstrap.ts";
import { isWorldTileWalkable } from "./world-domain.ts";
import { runInWorldTransaction } from "./world-db.ts";

const DIM = 20;
const NPC_COUNT = 2;
// A round clock: the last-tick timestamp is stored to the second, so a wall
// clock would make the cadence gate depend on where in the second we landed.
const NOW = 1800000000000;

let livingClassId = "";
let worldClassId = "";
let worldId = "";
let counter = 0;
let realNow = Date.now;

beforeEach(function () {
  const suffix = ++counter + "_" + Date.now();
  livingClassId = "test_npc_" + suffix;
  worldClassId = "test_wc_npc_" + suffix;
  upsertLivingClass({
    id: livingClassId,
    kind: "npc",
    labelKey: "living.class." + livingClassId,
    fallbackLabel: "Restless test creature",
    slotDefinitions: [],
    valueTemplate: { maxHitPoints: 5 },
    // Never idle: a tick that can move it, does.
    behavior: { idleChance: 0 },
    ownerIds: ["test-owner"],
    labels: {},
  });
  upsertWorldClass({
    id: worldClassId,
    baseType: "forest",
    rows: DIM,
    cols: DIM,
    labelKey: "world.class." + worldClassId,
    fallbackLabel: "NPC tick test world",
    itemSpawns: [],
    npcSpawns: [{ id: livingClassId, count: NPC_COUNT }],
    placements: [],
    generation: null,
    placementRevision: 0,
    ownerIds: ["test-owner"],
    labels: {},
  });
  worldId = createTestWorld(DIM, DIM, worldClassId);
  realNow = Date.now;
  Date.now = function () {
    return NOW;
  };
});

afterEach(function () {
  Date.now = realNow;
  runInWorldTransaction("test_npc_tick_cleanup", function () {
    deleteWorldClass(worldClassId);
    deleteLivingClass(livingClassId);
  });
  cleanupTestData();
});

/** Where every NPC stands, keyed by id. */
function positions(): Record<string, string> {
  const npcs = loadWorldNPCs(worldId);
  const out: Record<string, string> = {};
  Object.keys(npcs).forEach(function (npcId) {
    out[npcId] = npcs[npcId].row + "_" + npcs[npcId].col;
  });
  return out;
}

describe("what a tick does", () => {
  test("it populates the world from the class's manifest", () => {
    expect(countNPCsByClass(worldId)[livingClassId] || 0).toBe(0);

    tickWorldNPCs(worldId, NOW, NPC_TICK_MS);

    expect(countNPCsByClass(worldId)[livingClassId]).toBe(NPC_COUNT);
  });

  test("ticking again does not populate it twice", () => {
    tickWorldNPCs(worldId, NOW, NPC_TICK_MS);
    tickWorldNPCs(worldId, NOW + NPC_TICK_MS, NPC_TICK_MS);
    tickWorldNPCs(worldId, NOW + NPC_TICK_MS * 2, NPC_TICK_MS);

    expect(countNPCsByClass(worldId)[livingClassId]).toBe(NPC_COUNT);
  });

  test("a creature that never idles moves", () => {
    tickWorldNPCs(worldId, NOW, NPC_TICK_MS);
    const before = positions();

    tickWorldNPCs(worldId, NOW + NPC_TICK_MS, NPC_TICK_MS);

    const after = positions();
    const moved = Object.keys(before).filter(function (npcId) {
      return after[npcId] !== before[npcId];
    });
    expect(moved.length > 0).toBe(true);
  });

  test("nothing ends up in a wall or off the map", () => {
    const map = getEffectiveMap(worldId);
    for (let i = 0; i < 6; i++) {
      tickWorldNPCs(worldId, NOW + NPC_TICK_MS * i, NPC_TICK_MS);
    }

    const npcs = loadWorldNPCs(worldId);
    const stuck = Object.keys(npcs).filter(function (npcId) {
      const npc = npcs[npcId];
      const inBounds =
        npc.row >= 0 && npc.row < DIM && npc.col >= 0 && npc.col < DIM;
      return !inBounds || !isWorldTileWalkable(map[npc.row][npc.col]);
    });
    expect(stuck).toEqual([]);
  });

  test("two of them never end up on the same tile", () => {
    for (let i = 0; i < 6; i++) {
      tickWorldNPCs(worldId, NOW + NPC_TICK_MS * i, NPC_TICK_MS);
    }

    const tiles = Object.values(positions());
    const unique: Record<string, boolean> = {};
    tiles.forEach(function (tile) {
      unique[tile] = true;
    });
    expect(Object.keys(unique)).toHaveLength(tiles.length);
  });

  test("respawn timers that have come due are spent by the tick", () => {
    // The tick is where timers are processed, which is why nothing else has to
    // run on a cadence of its own.
    insertSpawnTimer(worldId, "item", "sword", NOW - 1000);

    tickWorldNPCs(worldId, NOW, NPC_TICK_MS);

    // The manifest has no swords, so the target is zero and the stale timer is
    // dropped rather than spawning one.
    expect(countWorldItemsByType(worldId)["sword"] || 0).toBe(0);
  });
});

describe("the cadence", () => {
  test("the first tick of a world runs", () => {
    expect(tryTickWorldNPCs(worldId, NOW)).toBe(true);
    expect(loadNPCLastTick(worldId)).toBe(NOW);
  });

  test("a second tick too soon is refused", () => {
    tryTickWorldNPCs(worldId, NOW);

    // A busy world would otherwise be ticked once per request.
    expect(tryTickWorldNPCs(worldId, NOW + NPC_TICK_MS - 100)).toBe(false);
    expect(loadNPCLastTick(worldId)).toBe(NOW);
  });

  test("a tick after the interval runs again", () => {
    tryTickWorldNPCs(worldId, NOW);

    expect(tryTickWorldNPCs(worldId, NOW + 1000)).toBe(true);
    expect(loadNPCLastTick(worldId)).toBe(NOW + 1000);
  });

  test("a world nobody has ticked has no last tick", () => {
    expect(loadNPCLastTick(worldId)).toBe(0);
  });
});

describe("the lease", () => {
  test("the instance holding it may keep it", () => {
    // Re-acquiring extends the TTL for the same owner; a second instance is
    // what it is meant to keep out, which a single test process cannot play.
    expect(tryAcquireNPCTickLease(worldId)).toBe(true);
    expect(tryAcquireNPCTickLease(worldId)).toBe(true);
  });
});

describe("what the world reports", () => {
  test("a snapshot lists the NPCs, and marks the world as active", () => {
    const snapshot = getWorldNPCSnapshot(worldId);

    expect(snapshot).toHaveLength(NPC_COUNT);
    snapshot.forEach(function (npc: any) {
      expect(npc.class_id).toBe(livingClassId);
      expect(Number.isFinite(Number(npc.row))).toBe(true);
    });
    // Being listed is what keeps a world ticking: the scheduler only visits
    // worlds someone has looked at recently.
    expect(loadNPCActiveWorlds()[worldId] > 0).toBe(true);
  });

  test("marking a world active records when that was", () => {
    markNPCWorldActive(worldId);

    expect(loadNPCActiveWorlds()[worldId]).toBe(NOW);
  });
});
