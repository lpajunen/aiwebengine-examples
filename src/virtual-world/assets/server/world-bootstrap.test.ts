/**
 * Tests for looking a world up, creating one, and moving a player between them.
 *
 * These are the questions asked before anything else can happen: which world is
 * this player in, what type and size is it, which class was it made from, and
 * what does its map look like once mods and reservations are layered on. Then
 * the switch, which is the only place a player's position, heartbeat and move
 * lease are torn down together — leaving one behind would follow them into the
 * new world as a ghost.
 *
 * Database-backed; each case's worlds and players are removed afterwards,
 * including the ones the code under test creates for itself.
 */

import { START_WORLD_CLASS_ID, START_WORLD_ID } from "./runtime-config.ts";
import {
  createWorldOfType,
  getEffectiveMap,
  getOrCreatePlayerWorld,
  getWorldClassForWorld,
  getWorldDimensions,
  getWorldInfo,
  getWorldType,
  resolvePortalDestinationWorldType,
  saveWorldType,
} from "./world-bootstrap.ts";
import {
  switchUserToNewWorld,
  switchUserToStartWorld,
  switchUserWorld,
} from "./world-switch.ts";
import {
  getPlayerWorld,
  loadPlayerHeartbeatTs,
  loadPlayerMoveLease,
  loadPlayerPosition,
  savePlayerHeartbeatTs,
  savePlayerMoveLease,
} from "./player-persistence.ts";
import { applyTileMod, loadTileModsOfKind } from "./world-mod-storage.ts";
import {
  TestTile,
  cleanupTestData,
  createTestPlayer,
  createTestWorld,
  testUserId,
  trackTestWorld,
  walkableRunFinder,
} from "./test-fixtures.ts";
import { MAX_WORLD_DIM, worldTileValueForName } from "./world-domain.ts";

const DIM = 20;

let worldId = "";
let tile: TestTile = { row: 1, col: 1 };

beforeEach(function () {
  worldId = createTestWorld(DIM, DIM);
  tile = walkableRunFinder(worldId)(1)[0];
});

afterEach(function () {
  cleanupTestData();
});

describe("which world a player is in", () => {
  test("a player nobody has placed starts in the start world", () => {
    const userId = testUserId("bootstrap");

    expect(getOrCreatePlayerWorld(userId)).toBe(START_WORLD_ID);
    // And it is written down, not just returned.
    expect(getPlayerWorld(userId)).toBe(START_WORLD_ID);
  });

  test("asking twice does not move them", () => {
    const userId = testUserId("bootstrap");

    const first = getOrCreatePlayerWorld(userId);
    const second = getOrCreatePlayerWorld(userId);

    expect(second).toBe(first);
  });

  test("a player already somewhere stays there", () => {
    const userId = createTestPlayer(worldId, "bootstrap", tile, 0);

    expect(getOrCreatePlayerWorld(userId)).toBe(worldId);
  });
});

describe("reading a world", () => {
  test("its type, size and class come off the row", () => {
    const info = getWorldInfo(worldId);

    expect(info.world_type).toBe("forest");
    expect(info.rows).toBe(DIM);
    expect(info.cols).toBe(DIM);
    expect(getWorldType(worldId)).toBe("forest");
    expect(getWorldDimensions(worldId)).toEqual({ rows: DIM, cols: DIM });
  });

  test("a world nobody created still answers", () => {
    // Map generation reads this on every request: a missing row has to yield a
    // usable type and size rather than a zero-sized world.
    const info = getWorldInfo("994001");

    expect(info.world_type).toBeTruthy();
    expect(info.rows > 0).toBe(true);
    expect(info.cols > 0).toBe(true);
    // With no class recorded, the type stands in for one.
    expect(info.world_class_id).toBe(info.world_type);
  });

  test("dimensions are clamped when they are written", () => {
    saveWorldType(worldId, "forest", { rows: 5000, cols: 5000 });

    expect(getWorldDimensions(worldId)).toEqual({
      rows: MAX_WORLD_DIM,
      cols: MAX_WORLD_DIM,
    });
  });

  test("an unknown type becomes forest rather than nothing", () => {
    saveWorldType(worldId, "atlantis", { rows: DIM, cols: DIM });

    expect(getWorldType(worldId)).toBe("forest");
  });

  test("a world resolves the class it was made from", () => {
    const worldClass = getWorldClassForWorld(worldId);

    expect(worldClass).toBeTruthy();
    expect(worldClass ? worldClass.id : "").toBe("forest");
  });
});

describe("creating a world", () => {
  test("each one gets an id of its own", () => {
    const first = trackTestWorld(
      createWorldOfType("cave", { rows: 16, cols: 16 }).world_id,
    );
    const second = trackTestWorld(
      createWorldOfType("cave", { rows: 16, cols: 16 }).world_id,
    );

    expect(second).not.toBe(first);
  });

  test("what it was asked for is what it stores", () => {
    const created = createWorldOfType("island", { rows: 18, cols: 22 });
    trackTestWorld(created.world_id);

    expect(created.world_type).toBe("island");
    expect(getWorldInfo(created.world_id).world_type).toBe("island");
    expect(getWorldDimensions(created.world_id)).toEqual({
      rows: 18,
      cols: 22,
    });
  });

  test("a nonsense type still produces a usable world", () => {
    const created = createWorldOfType("atlantis");
    trackTestWorld(created.world_id);

    expect(created.world_type).toBe("forest");
    expect(created.rows > 0 && created.cols > 0).toBe(true);
  });
});

describe("the map a world actually has", () => {
  test("it is the size the world says it is", () => {
    const map = getEffectiveMap(worldId);

    expect(map).toHaveLength(DIM);
    expect(map[0]).toHaveLength(DIM);
  });

  test("a mod a player made shows up on it", () => {
    // Terrain is regenerated per read; mods are the part that persists, so a
    // planted tree has to survive being layered onto a fresh map.
    applyTileMod(
      worldId,
      "test-planter",
      "player",
      tile.row,
      tile.col,
      "tree",
      "pine_tree",
      loadTileModsOfKind(worldId, "tree"),
    );

    const map = getEffectiveMap(worldId);

    expect(map[tile.row][tile.col]).toBe(worldTileValueForName("pine_tree"));
  });
});

describe("where a portal leads", () => {
  test("an explicit destination type is taken, normalized", () => {
    expect(
      resolvePortalDestinationWorldType({ destination_world_type: "CAVE" }),
    ).toBe("cave");
  });

  test("a destination world is asked what type it is", () => {
    expect(
      resolvePortalDestinationWorldType({ destination_world_id: worldId }),
    ).toBe("forest");
  });

  test("an item that leads nowhere resolves to nothing", () => {
    expect(resolvePortalDestinationWorldType({})).toBeUndefined();
    expect(resolvePortalDestinationWorldType(undefined)).toBeUndefined();
  });
});

describe("switching worlds", () => {
  test("the player is recorded in the new world at the given tile", () => {
    const userId = createTestPlayer(worldId, "switch", tile, 0);
    const destination = createTestWorld(DIM, DIM);

    switchUserWorld(userId, destination, { row: 4, col: 5 });

    expect(getPlayerWorld(userId)).toBe(destination);
    const position = loadPlayerPosition(userId);
    expect(position ? position.world_id : "").toBe(destination);
    expect(position ? position.row : -1).toBe(4);
    expect(position ? position.col : -1).toBe(5);
    // A fresh world means a fresh sequence: the client resyncs on arrival.
    expect(position ? position.seq : -1).toBe(0);
  });

  test("the heartbeat and move lease of the old world are torn down", () => {
    const userId = createTestPlayer(worldId, "switch", tile, 0);
    savePlayerHeartbeatTs(userId, Date.now());
    savePlayerMoveLease(userId, "old-tab", Date.now() + 30000);
    const destination = createTestWorld(DIM, DIM);

    switchUserWorld(userId, destination, { row: 2, col: 2 });

    // Left behind, either would follow the player into the new world: a stale
    // lease would lock their movement, a stale heartbeat would keep them
    // "online" in a world they left.
    expect(loadPlayerHeartbeatTs(userId)).toBe(0);
    expect(loadPlayerMoveLease(userId)).toBeNull();
  });

  test("without a tile the player arrives unplaced", () => {
    // The next request spawns them: nothing should invent a position here.
    const userId = createTestPlayer(worldId, "switch", tile, 0);
    const destination = createTestWorld(DIM, DIM);

    switchUserWorld(userId, destination);

    expect(getPlayerWorld(userId)).toBe(destination);
    expect(loadPlayerPosition(userId)).toBeNull();
  });

  test("switching to a brand-new world creates it and moves them in", () => {
    const userId = createTestPlayer(worldId, "switch", tile, 0);

    expect(switchUserToNewWorld(userId, "cave").ok).toBe(true);

    const arrived = trackTestWorld(getPlayerWorld(userId));
    expect(arrived).not.toBe(worldId);
    expect(getWorldType(arrived)).toBe("cave");
  });

  test("going home puts them in the start world at its spawn", () => {
    const userId = createTestPlayer(worldId, "switch", tile, 0);

    expect(switchUserToStartWorld(userId).ok).toBe(true);

    expect(getPlayerWorld(userId)).toBe(START_WORLD_ID);
    const position = loadPlayerPosition(userId);
    expect(position ? position.world_id : "").toBe(START_WORLD_ID);
  });

  test("going home leaves the start world's own configuration alone", () => {
    // Switching a player is not a reason to reconfigure a world: this used to
    // rewrite the start world's type, size and class from its arguments,
    // dropping the class's placements every time someone went home.
    const before = getWorldInfo(START_WORLD_ID);
    const userId = createTestPlayer(worldId, "switch", tile, 0);

    switchUserToStartWorld(userId);

    expect(getWorldInfo(START_WORLD_ID)).toEqual(before);
    expect(before.world_class_id).toBe(START_WORLD_CLASS_ID);
  });
});
