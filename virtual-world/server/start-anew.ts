import { getItemClass } from "./item-registry.ts";
import { loadPlayerInventory, savePlayerInventory } from "./item-storage.ts";
import { getLivingClassWithRefresh } from "./living-registry.ts";
import { NEWCOMER_CLASS_ID } from "./player-classes.ts";
import { getArrivalSpawnPosition } from "./player-snapshots.ts";
import { VWORLD_PLAYER_CHARACTER_TABLE } from "./runtime-config.ts";
import { ensurePlayerHomeWorld } from "./world-bootstrap.ts";
import { deleteWorldRowsWhere } from "./world-db.ts";
import {
  getAllLivingItems,
  InventoryItem,
  LivingState,
} from "./world-domain.ts";
import { switchUserWorld } from "./world-switch.ts";

// Starting anew: a dead player gives up their character and wakes on their
// home island as a newcomer, to choose a class again from the elder.
//
// What affects play is reset, what does not is kept. Reset: class, level,
// experience, attributes, skills, origin and quest flags (all living values),
// and every item that is not a keepsake. Kept: keepsake items (an item class's
// `keepsake`), the tools every player carries, the home island and what is
// built on it, and the nickname, which live outside the character.

/** Carried by every player past onboarding, and given back if lost. */
const ALWAYS_CARRIED = ["starter_kit", "boat"];

function isKept(item: InventoryItem): boolean {
  const type = String((item && item.type) || "");
  if (ALWAYS_CARRIED.indexOf(type) !== -1) return true;
  const cls = getItemClass(type);
  return !!(cls && cls.keepsake);
}

/**
 * The character a player starts anew as: a newcomer with no values of their
 * own, carrying only what is kept, in the bag.
 */
export function freshCharacter(inv: LivingState): LivingState {
  return {
    class_id: NEWCOMER_CLASS_ID,
    slots: {},
    bag: getAllLivingItems(inv).filter(isKept),
    values: {},
  };
}

/**
 * Starts the player anew if they are dead — in a class that can be revived
 * from — and sends them to their home island. Returns the island's world id,
 * or an error key.
 */
export function startAnewForUser(
  userId: string,
): { ok: true; worldId: string } | { ok: false; error: string } {
  const inv = loadPlayerInventory(userId);
  const deathClass = getLivingClassWithRefresh(String(inv.class_id || ""));
  if (!deathClass || !deathClass.reviveClassId) {
    return { ok: false, error: "error.only_the_dead_start_anew" };
  }
  savePlayerInventory(userId, freshCharacter(inv));
  deleteWorldRowsWhere(VWORLD_PLAYER_CHARACTER_TABLE, {
    user_id: String(userId),
  });
  const homeWorldId = ensurePlayerHomeWorld(userId);
  switchUserWorld(
    userId,
    homeWorldId,
    getArrivalSpawnPosition(homeWorldId, userId),
  );
  return { ok: true, worldId: homeWorldId };
}
