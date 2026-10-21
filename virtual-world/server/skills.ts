import { attributeModifier, skillCap } from "./player-classes.ts";

// What a skill does for an action, and how a skill grows. An action names its
// skill in a `skill` block (ActionSkill, action-registry.ts); this module
// turns the player's values into the number that block asks for.
//
// Skills are player values from 0 up to the class's cap (player-classes.ts).
// A skill a player has never used has no value yet and reads as 0.

export interface ActionSkill {
  // The skill the action uses and trains: "puutyo", "jousi", …
  id: string;
  // An attribute whose modifier counts as well, for "roll".
  attribute?: string;
  // Below this, the action is neither offered nor allowed.
  min?: number;
  // Skill points a use gains before slowing toward the cap.
  gain: number;
  // What the skill improves: the d20 attack roll, how long the action takes,
  // or how much it yields. Absent: only trained, nothing changes yet.
  affects?: "roll" | "duration" | "yield";
}

export function skillValue(
  values: Record<string, unknown>,
  id: string,
): number {
  const n = Number(values && values[id]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The skill after one use: `gain` scaled by how much room is left below the
 * cap, so growth is quick at first and slows near the top. A skill already at
 * or over its cap stays where it is. Kept to one decimal.
 */
export function grownSkill(current: number, gain: number, cap: number): number {
  if (!(cap > 0) || current >= cap) return current;
  const next = current + Math.max(0, gain) * ((cap - current) / cap);
  return Math.min(cap, Math.round(next * 10) / 10);
}

/** Trains the action's skill on the player's values; returns the gain. */
export function trainSkill(
  values: Record<string, unknown>,
  classId: string,
  skill: ActionSkill,
): number {
  const before = skillValue(values, skill.id);
  const after = grownSkill(
    before,
    Number(skill.gain || 0),
    skillCap(classId, skill.id),
  );
  if (after !== before) values[skill.id] = after;
  return Math.round((after - before) * 10) / 10;
}

/** Added to a d20 attack roll: the attribute's modifier, and skill / 20. */
export function rollBonus(
  values: Record<string, unknown>,
  skill: ActionSkill,
): number {
  const attribute = skill.attribute
    ? attributeModifier(Number(values && values[skill.attribute]) || 10)
    : 0;
  return attribute + Math.floor(skillValue(values, skill.id) / 20);
}

/** A duration shortened by skill: down to half at 100. */
export function skilledDuration(
  durationMs: number,
  skillPoints: number,
): number {
  const cut = Math.min(0.5, Math.max(0, skillPoints) / 200);
  return Math.round(durationMs * (1 - cut));
}

/** Extra items a skilled use yields: one more per 50 points. */
export function extraYield(skillPoints: number): number {
  return Math.floor(Math.max(0, skillPoints) / 50);
}

/** Whether the player is skilled enough for the action to be offered. */
export function meetsSkillMin(
  values: Record<string, unknown>,
  skill: ActionSkill | undefined,
): boolean {
  if (!skill || !(Number(skill.min) > 0)) return true;
  return skillValue(values, skill.id) >= Number(skill.min);
}
