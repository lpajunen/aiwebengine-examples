export interface ActionCondition {
  field: string;
  op: "eq" | "ne" | "gt" | "lt" | "gte" | "lte";
  // Compare `field` against this literal, OR — when `ref` is set — against the
  // value at another field path (e.g. currentHitPoints < maxHitPoints). `ref`
  // takes precedence over `value` when both are present.
  value?: unknown;
  ref?: string;
  errorMessage?: string;
}

export interface ActionEffect {
  field: string;
  op: "set" | "add" | "sub";
  value: unknown;
}

export interface ActionLogicSpec {
  conditions?: ActionCondition[];
  effects?: ActionEffect[];
}

export function getFieldValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (let i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined || typeof cur !== "object") {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[parts[i]];
  }
  return cur;
}

export function setFieldValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (
      cur[key] === null ||
      cur[key] === undefined ||
      typeof cur[key] !== "object"
    ) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function evaluateConditions(
  spec: ActionLogicSpec,
  item: { state?: Record<string, unknown>; [key: string]: unknown },
): { ok: boolean; errorMessage?: string } {
  const conditions = spec.conditions;
  if (!conditions || conditions.length === 0) return { ok: true };

  // Skip condition check if item has no initialized state (legacy items)
  if (
    !item.state ||
    typeof item.state !== "object" ||
    Object.keys(item.state).length === 0
  ) {
    return { ok: true };
  }

  const context: Record<string, unknown> = { state: item.state };

  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];
    const actual = getFieldValue(context, cond.field);
    let pass = false;
    switch (cond.op) {
      case "eq":
        pass = actual === cond.value;
        break;
      case "ne":
        pass = actual !== cond.value;
        break;
      case "gt":
        pass = Number(actual) > Number(cond.value);
        break;
      case "lt":
        pass = Number(actual) < Number(cond.value);
        break;
      case "gte":
        pass = Number(actual) >= Number(cond.value);
        break;
      case "lte":
        pass = Number(actual) <= Number(cond.value);
        break;
      default:
        pass = false;
    }
    if (!pass) {
      return {
        ok: false,
        errorMessage: cond.errorMessage || "Action condition not met",
      };
    }
  }
  return { ok: true };
}

// Evaluates a condition list against an *entity* (a world item or a living),
// used both for `validWhen` preconditions (DESIGN-targeting.md step 3) and for
// a livingEffect's actor/target gates. Unlike evaluateConditions (which reads
// only item.state and skips stateless items), the context here also exposes the
// entity's `type`, `class_id` and living `values`, and each condition may
// compare `field` to a literal `value` or — via `ref` — to another field.
// Returns the first failing condition's errorMessage so a caller that rejects
// the action can say why. Pure and dependency-free so the browser client can
// mirror it in evaluateActionValidWhen (tiles-and-items.js).
export function evaluateEntityConditions(
  conditions: ActionCondition[] | undefined,
  entity: {
    type?: unknown;
    class_id?: unknown;
    state?: Record<string, unknown>;
    values?: Record<string, unknown>;
    [key: string]: unknown;
  },
): { ok: boolean; errorMessage?: string } {
  if (!conditions || conditions.length === 0) return { ok: true };
  const context: Record<string, unknown> = {
    type: entity.type,
    class_id: entity.class_id,
    state: entity.state && typeof entity.state === "object" ? entity.state : {},
    values:
      entity.values && typeof entity.values === "object" ? entity.values : {},
  };
  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];
    const actual = getFieldValue(context, cond.field);
    const expected =
      cond.ref !== undefined ? getFieldValue(context, cond.ref) : cond.value;
    let pass = false;
    switch (cond.op) {
      case "eq":
        pass = actual === expected;
        break;
      case "ne":
        pass = actual !== expected;
        break;
      case "gt":
        pass = Number(actual) > Number(expected);
        break;
      case "lt":
        pass = Number(actual) < Number(expected);
        break;
      case "gte":
        pass = Number(actual) >= Number(expected);
        break;
      case "lte":
        pass = Number(actual) <= Number(expected);
        break;
      default:
        pass = false;
    }
    if (!pass) {
      return {
        ok: false,
        errorMessage: cond.errorMessage || "Action condition not met",
      };
    }
  }
  return { ok: true };
}

// Boolean shorthand over evaluateEntityConditions for the `validWhen` callers,
// which only ever ask "is this action offered against this target?".
export function evaluateTargetConditions(
  conditions: ActionCondition[] | undefined,
  target: {
    type?: unknown;
    class_id?: unknown;
    state?: Record<string, unknown>;
    values?: Record<string, unknown>;
    [key: string]: unknown;
  },
): boolean {
  return evaluateEntityConditions(conditions, target).ok;
}

export function applyEffects(
  spec: ActionLogicSpec,
  item: { state?: Record<string, unknown>; [key: string]: unknown },
): { state?: Record<string, unknown>; [key: string]: unknown } {
  const effects = spec.effects;
  if (!effects || effects.length === 0) return item;

  const newState: Record<string, unknown> = Object.assign(
    {},
    item.state && typeof item.state === "object" ? item.state : {},
  );
  const context: Record<string, unknown> = { state: newState };

  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    const current = getFieldValue(context, effect.field);
    let newValue: unknown;
    switch (effect.op) {
      case "set":
        newValue = effect.value;
        break;
      case "add":
        newValue = Number(current || 0) + Number(effect.value);
        break;
      case "sub":
        newValue = Number(current || 0) - Number(effect.value);
        break;
      default:
        newValue = effect.value;
    }
    setFieldValue(context, effect.field, newValue);
  }

  const result: { state?: Record<string, unknown>; [key: string]: unknown } =
    Object.assign({}, item);
  result.state = context.state as Record<string, unknown>;
  return result;
}
