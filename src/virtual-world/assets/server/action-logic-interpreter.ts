export interface ActionCondition {
  field: string;
  op: "eq" | "ne" | "gt" | "lt" | "gte" | "lte";
  value: unknown;
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

function getFieldValue(obj: Record<string, unknown>, path: string): unknown {
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

function setFieldValue(
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
