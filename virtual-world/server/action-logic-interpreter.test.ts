/**
 * Tests for the action-logic interpreter.
 *
 * This module executes creator-authored condition/effect programs, so a silent
 * regression here changes what every user-defined action does. Everything below
 * is pure — no world rows, no class caches — and runs against a fresh
 * deployment before any world exists.
 */

import {
  applyEffects,
  evaluateConditions,
  evaluateEntityConditions,
  evaluateTargetConditions,
  getFieldValue,
  setFieldValue,
} from "./action-logic-interpreter.ts";

describe("field paths", () => {
  test("a dotted path walks nested objects", () => {
    expect(getFieldValue({ state: { charges: 3 } }, "state.charges")).toBe(3);
  });

  test("a missing intermediate yields undefined instead of throwing", () => {
    expect(getFieldValue({}, "state.charges")).toBe(undefined);
    expect(getFieldValue({ state: null } as any, "state.charges")).toBe(
      undefined,
    );
  });

  test("walking through a primitive stops rather than reading its properties", () => {
    // "abc".length would be 3; the interpreter must not expose host properties
    // of primitives to authored programs.
    expect(getFieldValue({ state: "abc" } as any, "state.length")).toBe(
      undefined,
    );
  });

  test("setting a path creates the objects it needs", () => {
    const obj: Record<string, unknown> = {};
    setFieldValue(obj, "state.charges", 5);
    expect(obj).toEqual({ state: { charges: 5 } });
  });

  test("setting through a non-object replaces it", () => {
    const obj: Record<string, unknown> = { state: 7 };
    setFieldValue(obj, "state.charges", 1);
    expect(obj).toEqual({ state: { charges: 1 } });
  });

  test("a single-segment path is a plain assignment", () => {
    const obj: Record<string, unknown> = { a: 1 };
    setFieldValue(obj, "a", 2);
    expect(obj.a).toBe(2);
  });
});

describe("item conditions", () => {
  test("no conditions always passes", () => {
    expect(evaluateConditions({}, { state: { charges: 0 } }).ok).toBe(true);
    expect(
      evaluateConditions({ conditions: [] }, { state: { charges: 0 } }).ok,
    ).toBe(true);
  });

  test("a stateless item skips the check instead of failing it", () => {
    // Items created before a class grew state have no state object; refusing
    // them would break every existing item of that class.
    const spec = {
      conditions: [{ field: "state.charges", op: "gt" as const, value: 0 }],
    };
    expect(evaluateConditions(spec, {}).ok).toBe(true);
    expect(evaluateConditions(spec, { state: {} }).ok).toBe(true);
  });

  test("each comparison operator decides the right way", () => {
    const item = { state: { charges: 2 } };
    const check = function (op: any, value: unknown): boolean {
      return evaluateConditions(
        { conditions: [{ field: "state.charges", op: op, value: value }] },
        item,
      ).ok;
    };
    expect(check("eq", 2)).toBe(true);
    expect(check("eq", 3)).toBe(false);
    expect(check("ne", 3)).toBe(true);
    expect(check("gt", 1)).toBe(true);
    expect(check("gt", 2)).toBe(false);
    expect(check("lt", 3)).toBe(true);
    expect(check("gte", 2)).toBe(true);
    expect(check("lte", 2)).toBe(true);
    expect(check("lte", 1)).toBe(false);
  });

  test("eq is strict, so a stored number never equals its string form", () => {
    expect(
      evaluateConditions(
        { conditions: [{ field: "state.charges", op: "eq", value: "2" }] },
        { state: { charges: 2 } },
      ).ok,
    ).toBe(false);
  });

  test("an unknown operator fails closed", () => {
    expect(
      evaluateConditions(
        {
          conditions: [{ field: "state.charges", op: "wat" as any, value: 2 }],
        },
        { state: { charges: 2 } },
      ).ok,
    ).toBe(false);
  });

  test("the first failing condition supplies the message", () => {
    const result = evaluateConditions(
      {
        conditions: [
          { field: "state.charges", op: "gt", value: 0, errorMessage: "empty" },
          { field: "state.charges", op: "gt", value: 99, errorMessage: "huge" },
        ],
      },
      { state: { charges: 1 } },
    );
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe("huge");
  });

  test("a condition without a message still explains itself", () => {
    const result = evaluateConditions(
      { conditions: [{ field: "state.charges", op: "gt", value: 5 }] },
      { state: { charges: 1 } },
    );
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBeTruthy();
  });

  test("only state is in scope, so other item fields are invisible", () => {
    expect(
      evaluateConditions(
        { conditions: [{ field: "type", op: "eq", value: "axe" }] },
        { type: "axe", state: { charges: 1 } },
      ).ok,
    ).toBe(false);
  });
});

describe("entity conditions", () => {
  const npc = {
    type: "wolf",
    class_id: "npc_wolf",
    state: { tamed: false },
    values: { currentHitPoints: 4, maxHitPoints: 10 },
  };

  test("no conditions means the action is offered", () => {
    expect(evaluateEntityConditions(undefined, npc).ok).toBe(true);
    expect(evaluateEntityConditions([], npc).ok).toBe(true);
  });

  test("type and class_id are in scope, unlike item conditions", () => {
    expect(
      evaluateEntityConditions(
        [{ field: "type", op: "eq", value: "wolf" }],
        npc,
      ).ok,
    ).toBe(true);
    expect(
      evaluateEntityConditions(
        [{ field: "class_id", op: "eq", value: "npc_bear" }],
        npc,
      ).ok,
    ).toBe(false);
  });

  test("a ref compares two live fields instead of a literal", () => {
    expect(
      evaluateEntityConditions(
        [
          {
            field: "values.currentHitPoints",
            op: "lt",
            ref: "values.maxHitPoints",
          },
        ],
        npc,
      ).ok,
    ).toBe(true);
  });

  test("a ref wins over a value when both are given", () => {
    // ref -> 10, value -> 0. Only the ref reading passes.
    expect(
      evaluateEntityConditions(
        [
          {
            field: "values.currentHitPoints",
            op: "lt",
            value: 0,
            ref: "values.maxHitPoints",
          },
        ],
        npc,
      ).ok,
    ).toBe(true);
  });

  test("an entity without state or values reads as empty, not as a crash", () => {
    expect(
      evaluateEntityConditions(
        [{ field: "values.currentHitPoints", op: "eq", value: undefined }],
        { type: "rock" },
      ).ok,
    ).toBe(true);
  });

  test("a malformed state field is replaced by an empty object", () => {
    expect(
      evaluateEntityConditions(
        [{ field: "state.tamed", op: "eq", value: undefined }],
        { type: "wolf", state: "broken" as any },
      ).ok,
    ).toBe(true);
  });

  test("the target shorthand is the boolean of the same evaluation", () => {
    const conditions = [
      { field: "state.tamed", op: "eq" as const, value: true },
    ];
    expect(evaluateTargetConditions(conditions, npc)).toBe(false);
    expect(
      evaluateTargetConditions(conditions, {
        type: "wolf",
        state: { tamed: true },
      }),
    ).toBe(true);
  });
});

describe("effects", () => {
  test("no effects returns the item untouched", () => {
    const item = { state: { charges: 1 } };
    expect(applyEffects({}, item)).toBe(item);
    expect(applyEffects({ effects: [] }, item)).toBe(item);
  });

  test("applying effects does not mutate the item it was given", () => {
    const item = { type: "torch", state: { charges: 2 } };
    const next = applyEffects(
      { effects: [{ field: "state.charges", op: "sub", value: 1 }] },
      item,
    );
    expect(item.state.charges).toBe(2);
    expect(next.state).toEqual({ charges: 1 });
    expect(next.type).toBe("torch");
  });

  test("set replaces the value whatever its type", () => {
    const next = applyEffects(
      { effects: [{ field: "state.lit", op: "set", value: true }] },
      { state: { lit: false } },
    );
    expect(next.state).toEqual({ lit: true });
  });

  test("add and sub treat a missing field as zero", () => {
    const added = applyEffects(
      { effects: [{ field: "state.charges", op: "add", value: 3 }] },
      {},
    );
    expect(added.state).toEqual({ charges: 3 });
    const subtracted = applyEffects(
      { effects: [{ field: "state.charges", op: "sub", value: 3 }] },
      {},
    );
    expect(subtracted.state).toEqual({ charges: -3 });
  });

  test("effects run in order and see each other's writes", () => {
    const next = applyEffects(
      {
        effects: [
          { field: "state.charges", op: "set", value: 10 },
          { field: "state.charges", op: "sub", value: 4 },
        ],
      },
      { state: { charges: 0 } },
    );
    expect(next.state).toEqual({ charges: 6 });
  });

  test("arithmetic on a non-numeric field yields NaN rather than a string", () => {
    // Worth pinning: a class that stores a label where a counter is expected
    // corrupts the state instead of failing loudly.
    const next = applyEffects(
      { effects: [{ field: "state.charges", op: "add", value: 1 }] },
      { state: { charges: "many" } },
    );
    expect(Number.isNaN(Number(next.state && next.state.charges))).toBe(true);
  });

  test("an effect can create a nested field that did not exist", () => {
    const next = applyEffects(
      { effects: [{ field: "state.fuel.level", op: "set", value: 2 }] },
      { state: {} },
    );
    expect(next.state).toEqual({ fuel: { level: 2 } });
  });

  test("an unknown operator falls back to set", () => {
    const next = applyEffects(
      { effects: [{ field: "state.charges", op: "mul" as any, value: 7 }] },
      { state: { charges: 1 } },
    );
    expect(next.state).toEqual({ charges: 7 });
  });
});
