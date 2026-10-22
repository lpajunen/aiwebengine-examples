import {
  attributeModifier,
  getPlayerClass,
  PLAYER_ATTRIBUTES,
} from "./player-classes.ts";
import { loadPlayerInventory, savePlayerInventory } from "./item-storage.ts";
import { getPlayerWorld } from "./player-persistence.ts";
import { broadcastPlayerValuesChanged } from "./stream-broadcast.ts";

// What a new level brings: attribute points to spend, and hit points rolled on
// the class's hit die. advance_level's progression raises the level; this is
// what makes the level count for something.
//
// Hit points gained are kept as the player's own `hitPointBonus`, added to the
// class's maxHitPoints when values are read (normalizeLivingValues), because
// maxHitPoints itself belongs to the class.

/** No attribute is raised past this, as in D&D. */
export const ATTRIBUTE_MAX = 20;

/** The die a player without a chosen class rolls for hit points. */
const NEWCOMER_HIT_DIE = 8;

/** Attribute points a level gives: one, and two on every fourth level. */
export function attributePointsForLevel(level: number): number {
  return Math.floor(level) % 4 === 0 ? 2 : 1;
}

/**
 * Hit points a level gives: the class's hit die plus the Kestävyys modifier,
 * never less than one.
 */
export function rollHitPointGain(
  classId: string,
  values: Record<string, unknown>,
  random: () => number = Math.random,
): number {
  const cls = getPlayerClass(classId);
  const die = cls ? cls.hitDie : NEWCOMER_HIT_DIE;
  const rolled = 1 + Math.floor(random() * die);
  const modifier = attributeModifier(Number(values.kestavyys) || 10);
  return Math.max(1, rolled + modifier);
}

/**
 * Applies what reaching `level` brings to a player's values, in place:
 * attribute points to spend, and a roll of hit points that raises both the
 * maximum and the current. Returns what was gained.
 */
export function applyLevelGains(
  classId: string,
  values: Record<string, unknown>,
  level: number,
  random: () => number = Math.random,
): { attributePoints: number; hitPoints: number } {
  const points = attributePointsForLevel(level);
  const hitPoints = rollHitPointGain(classId, values, random);
  values.attributePoints = (Number(values.attributePoints) || 0) + points;
  values.hitPointBonus = (Number(values.hitPointBonus) || 0) + hitPoints;
  values.maxHitPoints = (Number(values.maxHitPoints) || 0) + hitPoints;
  values.currentHitPoints = (Number(values.currentHitPoints) || 0) + hitPoints;
  return { attributePoints: points, hitPoints: hitPoints };
}

/**
 * Spends one attribute point on `attribute`. Returns the error key when it
 * cannot, or null when it did.
 */
export function raiseAttribute(
  values: Record<string, unknown>,
  attribute: string,
): string | null {
  if ((PLAYER_ATTRIBUTES as readonly string[]).indexOf(attribute) === -1) {
    return "error.unknown_attribute";
  }
  if (!((Number(values.attributePoints) || 0) >= 1)) {
    return "error.no_attribute_points";
  }
  const current = Number(values[attribute]) || 10;
  if (current >= ATTRIBUTE_MAX) return "error.attribute_at_maximum";
  values[attribute] = current + 1;
  values.attributePoints = Number(values.attributePoints) - 1;
  return null;
}

/** The raise-attribute route: spends a point and tells the world. */
export function raiseAttributeForUser(
  userId: string,
  attribute: string,
): { ok: boolean; error?: string; inventory?: unknown } {
  const inv = loadPlayerInventory(userId);
  const error = raiseAttribute(inv.values, String(attribute || ""));
  if (error) return { ok: false, error: error };
  savePlayerInventory(userId, inv);
  const worldId = getPlayerWorld(userId);
  if (worldId) broadcastPlayerValuesChanged(worldId, userId, inv.values);
  return { ok: true, inventory: inv };
}
