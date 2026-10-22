/**
 * Tests for the Kalevala's animals: the reindeer, cow, elk, swan and cuckoo
 * that replaced the chicken and the donkey, and Antero Vipunen.
 *
 * What these guard is that the change reaches worlds that already exist: a
 * chicken saved before it was retired comes back as a cuckoo, and the
 * built-in world classes nobody has claimed spawn what the code says.
 */

import { loadWorldNPCs, spawnSingleWorldNPC } from "./npc-storage.ts";
import { currentNPCClassId, getLivingClass } from "./living-registry.ts";
import {
  getWorldClass,
  refreshWorldClassCache,
} from "./world-class-storage.ts";
import {
  cleanupTestData,
  createTestWorld,
  primeTransactions,
} from "./test-fixtures.ts";

beforeEach(function () {
  primeTransactions();
});

afterEach(function () {
  cleanupTestData();
});

describe("a retired animal", () => {
  test("comes back as the one that replaced it", () => {
    const forest = createTestWorld(16, 16);
    const placed = spawnSingleWorldNPC(forest, "npc_chicken");
    expect(placed).toBeTruthy();

    const loaded = loadWorldNPCs(forest)[placed!.npcId];

    expect(loaded.class_id).toBe("npc_cuckoo");
    expect(currentNPCClassId("npc_donkey")).toBe("npc_cow");
    expect(currentNPCClassId("npc_wolf")).toBe("npc_wolf");
  });
});

describe("the built-in world classes", () => {
  test("spawn the Kalevala's animals and no retired ones", () => {
    refreshWorldClassCache();
    const village = getWorldClass("village")!;
    const forest = getWorldClass("forest")!;
    const spawned = village.npcSpawns
      .concat(forest.npcSpawns)
      .map(function (entry) {
        return entry.id;
      });

    expect(spawned).toContain("npc_reindeer");
    expect(spawned).toContain("npc_elk");
    expect(spawned).not.toContain("npc_chicken");
    expect(spawned).not.toContain("npc_donkey");
    spawned.forEach(function (id) {
      expect(getLivingClass(id)).toBeTruthy();
    });
  });
});
