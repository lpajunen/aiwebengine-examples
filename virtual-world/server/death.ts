// What death costs a player who returns as the same character: a tenth of
// the spendable experience, and half an hour of being wounded. Attributes,
// skills and levels are never lost, and totalExperience is not touched.
//
// The wound is the player's own value `woundedUntil` (milliseconds). While it
// is set, normalizeLivingValues takes a fifth off maxHitPoints and the
// heartbeat recovers fatigue at half the rate; the heartbeat clears it once
// the time has passed.

/** The share of spendable experience a return costs. */
export const RETURN_EXPERIENCE_TOLL = 0.1;

/** How long a returned player stays wounded. */
export const WOUNDED_MS = 30 * 60 * 1000;

/** The maximum hit points of a wounded living: a fifth down, at least one. */
export function woundedMaxHitPoints(max: number): number {
  return Math.max(1, max - Math.floor(max / 5));
}

/** Whether the values carry a wound, expired or not. */
export function hasWound(values: Record<string, unknown>): boolean {
  return Number(values.woundedUntil) > 0;
}

/** Whether a wound has run its course by `now`. */
export function woundHasHealed(
  values: Record<string, unknown>,
  now: number,
): boolean {
  return hasWound(values) && Number(values.woundedUntil) <= now;
}

/**
 * Takes the toll of returning from the values, in place, and returns the
 * experience lost.
 */
export function applyReturnToll(
  values: Record<string, unknown>,
  now: number,
): number {
  const experience = Math.max(0, Number(values.experience) || 0);
  const lost = Math.floor(experience * RETURN_EXPERIENCE_TOLL);
  values.experience = experience - lost;
  values.woundedUntil = now + WOUNDED_MS;
  return lost;
}
