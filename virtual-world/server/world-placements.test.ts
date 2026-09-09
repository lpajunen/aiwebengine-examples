/**
 * Tests for world-class placements.
 *
 * The two entry points have deliberately different strictness, and that split
 * is the thing worth pinning: `normalizeWorldClassPlacements` runs on the DB
 * read path and must salvage what it can from a malformed row without ever
 * throwing, while `validateWorldClassPlacements` runs on the write path and
 * must report every problem so a creator is told what is wrong.
 *
 * Validation resolves class references, so it reads the item and living class
 * caches; the ids used below are built-ins that exist in any deployment.
 */

import {
  PLACEMENT_KINDS,
  normalizeWorldClassPlacements,
  validateWorldClassPlacements,
} from "./world-placements.ts";

const DIMS = { rows: 40, cols: 40 };

/** The smallest placement that validates cleanly, as a base for edits. */
function validPlacement(): Record<string, unknown> {
  return {
    id: "old_oak",
    kind: "terrain",
    classId: "ground",
    position: { strategy: "exact", row: 10, col: 12 },
  };
}

function errorsFor(placement: Record<string, unknown>): string[] {
  return validateWorldClassPlacements([placement], DIMS);
}

describe("normalizing stored placements", () => {
  test("anything that is not an array reads as no placements", () => {
    expect(normalizeWorldClassPlacements(null)).toEqual([]);
    expect(normalizeWorldClassPlacements({ id: "a" })).toEqual([]);
    expect(normalizeWorldClassPlacements("[]")).toEqual([]);
  });

  test("a placement keeps its id, kind, class and position", () => {
    const placements = normalizeWorldClassPlacements([
      {
        id: "guild_door",
        kind: "portal",
        classId: "door",
        position: { strategy: "exact", row: 3, col: 4 },
      },
    ]);
    expect(placements).toHaveLength(1);
    expect(placements[0].id).toBe("guild_door");
    expect(placements[0].kind).toBe("portal");
    expect(placements[0].classId).toBe("door");
    expect(placements[0].position).toEqual({
      strategy: "exact",
      row: 3,
      col: 4,
    });
    // Absent optional blocks are filled in rather than left undefined, so
    // every consumer can read them without a guard.
    expect(placements[0].state).toEqual({});
    expect(placements[0].reservations).toEqual([]);
  });

  test("a broken placement is skipped and its neighbours survive", () => {
    const placements = normalizeWorldClassPlacements([
      { kind: "terrain", classId: "ground", position: { row: 1, col: 1 } },
      { id: "no_kind", classId: "ground", position: { row: 1, col: 1 } },
      { id: "no_class", kind: "terrain", position: { row: 1, col: 1 } },
      { id: "no_position", kind: "terrain", classId: "ground" },
      { id: "bad_row", kind: "terrain", classId: "ground", position: {} },
      null,
      {
        id: "good",
        kind: "terrain",
        classId: "ground",
        position: { row: 2, col: 2 },
      },
    ]);
    expect(
      placements.map(function (placement) {
        return placement.id;
      }),
    ).toEqual(["good"]);
  });

  test("the first of a duplicated id wins", () => {
    const placements = normalizeWorldClassPlacements([
      {
        id: "oak",
        kind: "terrain",
        classId: "ground",
        position: { row: 1, col: 1 },
      },
      {
        id: "oak",
        kind: "terrain",
        classId: "ground",
        position: { row: 9, col: 9 },
      },
    ]);
    expect(placements).toHaveLength(1);
    expect(placements[0].position.row).toBe(1);
  });

  test("coordinates are floored, so a fractional row cannot land between tiles", () => {
    const placements = normalizeWorldClassPlacements([
      {
        id: "oak",
        kind: "terrain",
        classId: "ground",
        position: { row: 4.9, col: "7" },
      },
    ]);
    expect(placements[0].position.row).toBe(4);
    expect(placements[0].position.col).toBe(7);
  });

  test("strategy defaults to exact", () => {
    const placements = normalizeWorldClassPlacements([
      {
        id: "oak",
        kind: "terrain",
        classId: "ground",
        position: { row: 1, col: 1 },
      },
    ]);
    expect(placements[0].position.strategy).toBe("exact");
  });

  test("a reservation without a centre inherits the placement's tile", () => {
    const placements = normalizeWorldClassPlacements([
      {
        id: "oak",
        kind: "terrain",
        classId: "ground",
        position: { row: 10, col: 12 },
        reservations: [{ kind: "circle", radius: 3, rules: ["spawn_area"] }],
      },
    ]);
    expect(placements[0].reservations[0].row).toBe(10);
    expect(placements[0].reservations[0].col).toBe(12);
    expect(placements[0].reservations[0].radius).toBe(3);
  });

  test("a geometrically impossible reservation is dropped, not repaired", () => {
    const placements = normalizeWorldClassPlacements([
      {
        id: "oak",
        kind: "terrain",
        classId: "ground",
        position: { row: 10, col: 12 },
        reservations: [
          { kind: "circle", rules: ["spawn_area"] }, // no radius
          { kind: "circle", radius: -1, rules: ["spawn_area"] },
          { kind: "rectangle", rows: 0, cols: 4, rules: ["block_build"] },
          { kind: "hexagon", radius: 2, rules: ["block_build"] },
          { kind: "rectangle", rows: 2, cols: 3, rules: ["block_build"] },
        ],
      },
    ]);
    const kept = placements[0].reservations;
    expect(kept).toHaveLength(1);
    expect(kept[0].kind).toBe("rectangle");
    expect(kept[0].rows).toBe(2);
  });

  test("duplicate rules on one reservation collapse", () => {
    const placements = normalizeWorldClassPlacements([
      {
        id: "oak",
        kind: "terrain",
        classId: "ground",
        position: { row: 5, col: 5 },
        reservations: [
          {
            kind: "circle",
            radius: 1,
            rules: ["block_build", "block_build", "", "block_plant"],
          },
        ],
      },
    ]);
    expect(placements[0].reservations[0].rules).toEqual([
      "block_build",
      "block_plant",
    ]);
  });

  test("normalizing keeps unknown rule names, unlike validation", () => {
    // Read-path leniency: an old row naming a legacy zone kind still loads,
    // and world-reservations decides what the name resolves to.
    const placements = normalizeWorldClassPlacements([
      {
        id: "oak",
        kind: "terrain",
        classId: "ground",
        position: { row: 5, col: 5 },
        reservations: [{ kind: "circle", radius: 1, rules: ["oak_clearing"] }],
      },
    ]);
    expect(placements[0].reservations[0].rules).toEqual(["oak_clearing"]);
  });
});

describe("validating placements a creator submitted", () => {
  test("a well-formed placement produces no messages", () => {
    expect(errorsFor(validPlacement())).toEqual([]);
  });

  test("nothing submitted is not an error", () => {
    expect(validateWorldClassPlacements(undefined, DIMS)).toEqual([]);
    expect(validateWorldClassPlacements(null, DIMS)).toEqual([]);
  });

  test("a non-array is rejected once, not per element", () => {
    expect(validateWorldClassPlacements({ id: "oak" }, DIMS)).toHaveLength(1);
  });

  test("an id must be a lowercase slug", () => {
    const placement = validPlacement();
    placement.id = "Old Oak";
    expect(errorsFor(placement).join(" ")).toContain("lowercase");
  });

  test("a duplicate id is reported rather than silently dropped", () => {
    const errors = validateWorldClassPlacements(
      [validPlacement(), validPlacement()],
      DIMS,
    );
    expect(errors.join(" ")).toContain("duplicate");
  });

  test("an unknown kind is listed with the kinds that exist", () => {
    const placement = validPlacement();
    placement.kind = "monument";
    const message = errorsFor(placement).join(" ");
    expect(message).toContain("kind must be one of");
    expect(message).toContain(PLACEMENT_KINDS[0]);
  });

  test("a terrain placement names a tile, not a class", () => {
    const placement = validPlacement();
    placement.classId = "player_human";
    expect(errorsFor(placement).join(" ")).toContain("unknown world tile");
  });

  test("an npc placement names a living class", () => {
    const good = validPlacement();
    good.kind = "npc";
    good.classId = "player_human";
    expect(errorsFor(good)).toEqual([]);

    const bad = validPlacement();
    bad.kind = "npc";
    bad.classId = "ground";
    expect(errorsFor(bad).join(" ")).toContain("unknown living class");
  });

  test("an item placement names an item class", () => {
    const good = validPlacement();
    good.kind = "item";
    good.classId = "chest";
    expect(errorsFor(good)).toEqual([]);

    const bad = validPlacement();
    bad.kind = "item";
    bad.classId = "no_such_item";
    expect(errorsFor(bad).join(" ")).toContain("unknown item class");
  });

  test("a position outside the class's own dimensions is refused", () => {
    const placement = validPlacement();
    placement.position = { strategy: "exact", row: DIMS.rows, col: -1 };
    const errors = errorsFor(placement);
    expect(errors).toHaveLength(2);
    expect(errors.join(" ")).toContain("position.row");
    expect(errors.join(" ")).toContain("position.col");
  });

  test("only the exact strategy is accepted so far", () => {
    const placement = validPlacement();
    placement.position = { strategy: "random", row: 1, col: 1 };
    expect(errorsFor(placement).join(" ")).toContain("not supported yet");
  });

  test("a reservation needs a rule, and the rule must be a real one", () => {
    const noRules = validPlacement();
    noRules.reservations = [{ kind: "circle", radius: 2, rules: [] }];
    expect(errorsFor(noRules).join(" ")).toContain("at least one rule");

    const badRule = validPlacement();
    badRule.reservations = [
      { kind: "circle", radius: 2, rules: ["oak_clearing"] },
    ];
    expect(errorsFor(badRule).join(" ")).toContain("unknown reservation rule");
  });

  test("reservation geometry is checked per kind", () => {
    const circle = validPlacement();
    circle.reservations = [{ kind: "circle", rules: ["spawn_area"] }];
    expect(errorsFor(circle).join(" ")).toContain("radius");

    const rect = validPlacement();
    rect.reservations = [
      { kind: "rectangle", rows: 0, cols: 3, rules: ["spawn_area"] },
    ];
    expect(errorsFor(rect).join(" ")).toContain("rows >= 1");
  });

  test("a reservation centre off the map is refused", () => {
    const placement = validPlacement();
    placement.reservations = [
      {
        kind: "circle",
        row: DIMS.rows + 5,
        col: 1,
        radius: 1,
        rules: ["spawn_area"],
      },
    ];
    expect(errorsFor(placement).join(" ")).toContain("reservation row");
  });

  test("a portal destination must name what it points at", () => {
    const placement = validPlacement();
    placement.kind = "portal";
    placement.classId = "chest";
    placement.state = { destination: { mode: "ensure_world_class" } };
    expect(errorsFor(placement).join(" ")).toContain(
      "worldClassId is required",
    );

    placement.state = { destination: { mode: "existing_world" } };
    expect(errorsFor(placement).join(" ")).toContain("worldId is required");

    placement.state = { destination: { mode: "somewhere_nice" } };
    expect(errorsFor(placement).join(" ")).toContain("destination.mode");
  });

  test("a return door's entry must name a placement in this same class", () => {
    const door = validPlacement();
    door.kind = "portal";
    door.classId = "chest";
    door.state = {
      destination: { mode: "source_world", entryPlacementId: "front_step" },
    };
    expect(validateWorldClassPlacements([door], DIMS).join(" ")).toContain(
      "does not match any placement",
    );

    const step = validPlacement();
    step.id = "front_step";
    // Order must not matter: the cross-check runs after every id is known.
    expect(validateWorldClassPlacements([door, step], DIMS)).toEqual([]);
  });

  test("every problem is reported, not just the first", () => {
    const errors = validateWorldClassPlacements(
      [{ kind: "monument", position: { row: -1, col: -1 } }],
      DIMS,
    );
    expect(errors.length > 3).toBe(true);
  });
});
