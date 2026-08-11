import {
  deleteFightState,
  loadActiveFightsForWorld,
  saveFightState,
  FightStateRow,
} from "./fight-storage.ts";
import { deleteFollowState } from "./follow-storage.ts";
import {
  loadPlayerInventory,
  nextWorldItemId,
  savePlayerInventory,
  upsertWorldItem,
} from "./item-storage.ts";
import { ActionLivingEffect } from "./action-registry.ts";
import {
  evaluateEntityConditions,
  getFieldValue,
  setFieldValue,
} from "./action-logic-interpreter.ts";
import { getActionDefinition, getItemStateTemplate } from "./item-registry.ts";
import {
  getLivingClassWithRefresh,
  isCombatantClass,
} from "./living-registry.ts";
import { deleteNPCById, loadWorldNPCs, saveWorldNPCs } from "./npc-storage.ts";
import {
  buildOccupiedNPCMap,
  buildOccupiedPlayerMap,
} from "./npc-tick-helpers.ts";
import { loadWorldPlayers } from "./player-snapshots.ts";
import { NPC_AGGRO_CHANCE } from "./runtime-config.ts";
import { scheduleRespawnIfManifestTracked } from "./spawn-timers.ts";
import { getEffectiveNick } from "./social-state.ts";
import {
  broadcastItemChange,
  broadcastNPCValuesChanged,
  broadcastPlayerValuesChanged,
  sendRecipientScopedStreamEvent,
  sendWorldScopedStreamEvent,
} from "./stream-broadcast.ts";
import { getEffectiveMap } from "./world-bootstrap.ts";
import { runInWorldTransaction } from "./world-db.ts";
import { isWorldTileWalkable, resolveNPCDisplayName } from "./world-domain.ts";

function directionToRotation(dr: number, dc: number): number {
  if (dr > 0) return 0;
  if (dr < 0) return Math.PI;
  if (dc > 0) return Math.PI / 2;
  if (dc < 0) return -Math.PI / 2;
  return 0;
}

// ── Wielded-weapon combat stats ───────────────────────────────────────────
// A living's effective weapon class and attack range come from the weapon held
// in a hand slot (an item with state.weaponClass > 0); unarmed falls back to the
// living's own weaponClass value and same-tile reach.

/** @returns the stronger hand-slot weapon, or null when unarmed. */
export function wieldedWeapon(living: any): any | null {
  const slots = living && living.slots;
  if (!slots || typeof slots !== "object") return null;
  let best: any = null;
  ["left_hand", "right_hand"].forEach(function (hand) {
    const item = slots[hand];
    const wc = item && item.state ? Number(item.state.weaponClass) || 0 : 0;
    if (
      item &&
      wc > 0 &&
      (!best || wc > (Number(best.state.weaponClass) || 0))
    ) {
      best = item;
    }
  });
  return best;
}

/** Effective weapon class (damage) — wielded weapon's, else the living's own. */
export function effectiveWeaponClass(living: any): number {
  const weapon = wieldedWeapon(living);
  if (weapon) return Math.max(1, Number(weapon.state.weaponClass) || 0);
  return Math.max(
    1,
    Number((living && living.values && living.values.weaponClass) || 0),
  );
}

/**
 * Attack range in tiles: the wielded weapon's weaponRange (1 = melee/adjacent,
 * larger = ranged), or 0 (same tile) when unarmed.
 */
export function attackRange(living: any): number {
  const weapon = wieldedWeapon(living);
  if (weapon && weapon.state) {
    const wr = Number(weapon.state.weaponRange);
    if (Number.isFinite(wr) && wr > 0) return wr;
  }
  return 0;
}

function chebyshev(
  aRow: number,
  aCol: number,
  bRow: number,
  bCol: number,
): number {
  return Math.max(Math.abs(aRow - bRow), Math.abs(aCol - bCol));
}

// NPCs whose living class has the "aggressive" flag set (see
// LivingClassRecord.aggressive in world-domain.ts) start a fight on their own
// against any player found standing on their tile, mirroring the same-tile
// co-location convention a player's own "fight"/"poke"/"follow" actions use.
// Once started, the fight is processed identically to a player-initiated one
// for the rest of its lifetime.
function maybeStartNPCAggression(
  worldId: string,
  npcs: Record<string, any>,
  players: Record<string, any>,
  alreadyFighting: Set<string>,
): FightStateRow[] {
  const started: FightStateRow[] = [];
  Object.keys(npcs).forEach(function (npcId) {
    const npc = npcs[npcId];
    if (!npc || alreadyFighting.has(npcId)) return;
    const livingClass = getLivingClassWithRefresh(String(npc.class_id || ""));
    if (!livingClass || !livingClass.aggressive) return;
    // Engage a player within the NPC's weapon attack range: 0 (same tile) for
    // an unarmed/melee NPC keeps the original co-location behavior, while an
    // NPC wielding a bow opens fire from up to its weaponRange away.
    const reach = attackRange(npc);
    const targetPlayerId = Object.keys(players).find(function (pid) {
      const p = players[pid];
      return p && chebyshev(p.row, p.col, npc.row, npc.col) <= reach;
    });
    if (!targetPlayerId) return;
    // A non-combatant class cannot be fought — including being aggro'd by a
    // hostile NPC. That is what keeps a dead player (a ghost) out of combat.
    if (!isCombatantClass(loadPlayerInventory(targetPlayerId).class_id)) {
      return;
    }
    if (Math.random() >= NPC_AGGRO_CHANCE) return;

    saveFightState(npcId, "npc", worldId, targetPlayerId, "player");
    alreadyFighting.add(npcId);
    started.push({
      attacker_id: npcId,
      attacker_type: "npc",
      world_id: worldId,
      target_id: targetPlayerId,
      target_type: "player",
      created_ts: Date.now(),
    });
  });
  return started;
}

// tickFollowForWorld chases a *player* attacker into range every tick.
// NPC attackers have no follow row, so they need their own one-tile-per-tick
// greedy step toward the target here — same algorithm as tickFollowForWorld,
// adapted to write through the NPC store instead of player position storage.
function stepNPCTowardTarget(
  worldId: string,
  now: number,
  npcId: string,
  npc: any,
  target: { row: number; col: number },
  players: Record<string, any>,
  npcs: Record<string, any>,
): void {
  const map = getEffectiveMap(worldId);
  const rows = map.length;
  const cols = map[0] ? map[0].length : 0;
  const occupiedPlayers = buildOccupiedPlayerMap(players);
  const occupiedNPCs = buildOccupiedNPCMap(npcs);

  const dr = target.row - npc.row;
  const dc = target.col - npc.col;
  const candidates: Array<{ dr: number; dc: number }> = [];
  if (Math.abs(dr) >= Math.abs(dc)) {
    if (dr !== 0) candidates.push({ dr: dr > 0 ? 1 : -1, dc: 0 });
    if (dc !== 0) candidates.push({ dr: 0, dc: dc > 0 ? 1 : -1 });
  } else {
    if (dc !== 0) candidates.push({ dr: 0, dc: dc > 0 ? 1 : -1 });
    if (dr !== 0) candidates.push({ dr: dr > 0 ? 1 : -1, dc: 0 });
  }
  [
    { dr: 1, dc: 0 },
    { dr: -1, dc: 0 },
    { dr: 0, dc: 1 },
    { dr: 0, dc: -1 },
  ].forEach(function (dir) {
    if (
      !candidates.some(function (c) {
        return c.dr === dir.dr && c.dc === dir.dc;
      })
    ) {
      candidates.push(dir);
    }
  });

  const targetKey = target.row + "_" + target.col;
  let step: { row: number; col: number; rotation: number } | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const nr = npc.row + candidates[i].dr;
    const nc = npc.col + candidates[i].dc;
    const key = nr + "_" + nc;
    const walkable =
      nr >= 0 &&
      nr < rows &&
      nc >= 0 &&
      nc < cols &&
      isWorldTileWalkable(map[nr][nc]);
    if (!walkable) continue;
    if (key !== targetKey) {
      if (occupiedPlayers[key]) continue;
      if (occupiedNPCs[key]) continue;
    }
    step = {
      row: nr,
      col: nc,
      rotation: directionToRotation(candidates[i].dr, candidates[i].dc),
    };
    break;
  }
  if (!step) return;
  const resolvedStep = step;

  runInWorldTransaction("fight_chase:" + npcId, function () {
    npc.row = resolvedStep.row;
    npc.col = resolvedStep.col;
    npc.rotation = resolvedStep.rotation;
    npc.seq = Number(npc.seq || 0) + 1;
    npc.state = "moving";
    npc.ts = now;
    saveWorldNPCs(worldId, { [npcId]: npc });
    sendWorldScopedStreamEvent(String(worldId), "npc_moved", {
      npc_id: npcId,
      display_name: resolveNPCDisplayName(worldId, npcId, npc),
      class_id: npc.class_id,
      row: npc.row,
      col: npc.col,
      seq: npc.seq,
      rotation: npc.rotation,
      state: npc.state,
      values: npc.values,
    });
  });
}

// Deletes the NPC row, drops an npc_corpse item at its last position, and
// broadcasts both so connected clients despawn the NPC and see the corpse
// appear without waiting for the next /npcs poll.
// Builds the corpse a dying living leaves behind, or null when its class
// names no corpseItemId — the item type is class data, so a wolf can rot into
// a pelt and a construct into scrap without touching this function.
function buildCorpseItem(
  worldId: string,
  classId: unknown,
): { id: string; type: string; created_at: number; state: any } | null {
  const cls = getLivingClassWithRefresh(String(classId || ""));
  const corpseItemId = cls ? String(cls.corpseItemId || "") : "";
  if (!corpseItemId) return null;
  return {
    id: "w" + worldId + "_i" + nextWorldItemId(worldId),
    type: corpseItemId,
    created_at: Date.now(),
    state: getItemStateTemplate(corpseItemId),
  };
}

function resolveNPCDeath(
  worldId: string,
  npcId: string,
  npc: { row: number; col: number; class_id?: unknown },
): void {
  deleteNPCById(npcId);
  sendWorldScopedStreamEvent(String(worldId), "npc_moved", {
    npc_id: npcId,
    despawn: true,
  });
  const corpseItem = buildCorpseItem(worldId, npc.class_id);
  if (corpseItem) {
    upsertWorldItem(worldId, npc.row, npc.col, corpseItem);
    broadcastItemChange(worldId, "npc", npcId, "npc_died", npc.row, npc.col, [
      corpseItem,
    ]);
  }
  if (typeof npc.class_id === "string" && npc.class_id) {
    scheduleRespawnIfManifestTracked(worldId, "npc", npc.class_id);
  }
}

// Resolves a defeated player through their class's `deathClassId` — the
// built-in player classes name player_ghost, so the player keeps their
// inventory and lingers as a ghost rather than being removed from the world.
// A class that names no deathClassId simply revives in place at full health:
// a player cannot be despawned the way an NPC can, so there is nothing else
// for "no transformation" to mean. A corpseItemId, if the class carries one,
// is dropped either way.
function resolvePlayerDeath(
  worldId: string,
  playerId: string,
  playerPos: { row: number; col: number; seq: number; rotation: number },
  inv: any,
): void {
  const corpseItem = buildCorpseItem(worldId, inv.class_id);
  const deathClass = getLivingClassWithRefresh(String(inv.class_id || ""));
  const deathClassId = deathClass ? String(deathClass.deathClassId || "") : "";
  if (deathClassId) inv.class_id = deathClassId;
  inv.values = Object.assign({}, inv.values, {
    currentHitPoints: inv.values.maxHitPoints,
  });
  savePlayerInventory(playerId, inv);
  if (corpseItem) {
    upsertWorldItem(worldId, playerPos.row, playerPos.col, corpseItem);
    broadcastItemChange(
      worldId,
      "player",
      playerId,
      "npc_died",
      playerPos.row,
      playerPos.col,
      [corpseItem],
    );
  }
  sendWorldScopedStreamEvent(String(worldId), "player_moved", {
    player_id: playerId,
    row: playerPos.row,
    col: playerPos.col,
    seq: playerPos.seq,
    rotation: playerPos.rotation,
    class_id: inv.class_id,
    values: inv.values,
  });
  sendRecipientScopedStreamEvent(playerId, "player_died", {
    class_id: inv.class_id,
    values: inv.values,
  });
}

// ── Declarative living effects ────────────────────────────────────────────
// The engine behind ActionLivingEffect (action-registry.ts): one strike or
// blessing against one living, described entirely by the action's data. This
// replaced the hand-written firebolt/fireball/heal/harm handlers — the per-hit
// math still mirrors resolveCombatHit (d20 vs armorClass, 1..weaponClass
// damage, corpse/ghost death, level-scaled kill XP) but which of those steps
// run, and on what field, now comes from the action class row.
//
// The actor is always a player. `field` addresses a path inside the living and
// must sit under `values.` — that is the part of a living this function
// persists; a path anywhere else resolves to undefined and writes nothing.
// The caller resolves *who* is in range (see the livingEffect block in
// tree-action-helpers.ts) and evaluates the actor gate once; this function owns
// the per-target gate, the mutation, the death flow and the broadcasts.
export interface LivingEffectOutcome {
  // "blocked" means a targetConditions gate rejected this target and
  // errorMessage says which; single-target callers surface it, area callers
  // skip the target and keep going.
  result: "miss" | "hit" | "kill" | "blocked";
  errorMessage?: string;
  // Signed change actually written to `field` (negative for damage).
  delta: number;
  target_label: string;
  experience_gained?: number;
  values?: Record<string, unknown>;
}

export function applyLivingEffect(
  worldId: string,
  actorId: string,
  targetId: string,
  targetType: "npc" | "player",
  effect: ActionLivingEffect,
  killExperienceBase: number,
): LivingEffectOutcome {
  const npcs = targetType === "npc" ? loadWorldNPCs(worldId) : {};
  const targetNpc = targetType === "npc" ? npcs[targetId] : null;
  const targetLabel =
    targetType === "npc"
      ? resolveNPCDisplayName(worldId, targetId, targetNpc)
      : getEffectiveNick(targetId);
  const targetInv =
    targetType === "player" ? loadPlayerInventory(targetId) : null;
  if (!targetNpc && !targetInv) {
    return {
      result: "blocked",
      errorMessage: "error.target_living_not_found",
      delta: 0,
      target_label: targetLabel,
    };
  }
  const targetValues: Record<string, unknown> = targetInv
    ? targetInv.values || {}
    : targetNpc
      ? targetNpc.values || {}
      : {};
  const targetClassId = targetInv
    ? targetInv.class_id
    : targetNpc
      ? targetNpc.class_id
      : "";

  const gate = evaluateEntityConditions(effect.targetConditions, {
    class_id: targetClassId,
    values: targetValues,
  });
  if (!gate.ok) {
    return {
      result: "blocked",
      errorMessage: gate.errorMessage,
      delta: 0,
      target_label: targetLabel,
    };
  }

  // Magnitude: either the flat configured amount, or a rolled attack that can
  // miss outright and scales with the caster's wielded weapon.
  let magnitude = Math.floor(Number(effect.amount || 0));
  if (effect.roll === "attack_roll") {
    const armorClass = Number(targetValues.armorClass) || 0;
    const attackRoll = 1 + Math.floor(Math.random() * 20);
    const isHit =
      attackRoll === 20 || (attackRoll !== 1 && attackRoll > armorClass);
    if (!isHit) {
      return { result: "miss", delta: 0, target_label: targetLabel };
    }
    magnitude =
      1 +
      Math.floor(
        Math.random() * effectiveWeaponClass(loadPlayerInventory(actorId)),
      );
  }

  const context: Record<string, unknown> = {
    values: Object.assign({}, targetValues),
  };
  const current = Number(getFieldValue(context, effect.field) || 0);
  let next =
    effect.op === "set"
      ? magnitude
      : effect.op === "add"
        ? current + magnitude
        : current - magnitude;
  if (effect.maxField) {
    const cap = Number(getFieldValue(context, effect.maxField));
    if (Number.isFinite(cap)) next = Math.min(next, cap);
  }
  // Only a lethal effect floors at zero; a non-lethal one leaves the value
  // wherever the arithmetic lands, since an arbitrary living value has no
  // reason to treat zero as a boundary.
  if (effect.lethal) next = Math.max(0, next);
  setFieldValue(context, effect.field, next);
  const nextValues = context.values as Record<string, unknown>;
  const delta = next - current;

  const isDeath = Boolean(effect.lethal) && next <= 0 && delta < 0;

  if (!isDeath) {
    if (targetNpc) {
      targetNpc.values = nextValues;
      saveWorldNPCs(worldId, { [targetId]: targetNpc });
      broadcastNPCValuesChanged(
        worldId,
        targetId,
        targetNpc.values,
        targetNpc.class_id,
      );
    } else if (targetInv) {
      targetInv.values = nextValues;
      savePlayerInventory(targetId, targetInv);
      broadcastPlayerValuesChanged(worldId, targetId, targetInv.values);
      if (delta < 0) {
        sendRecipientScopedStreamEvent(targetId, "fight_hit_taken", {
          attacker_label: getEffectiveNick(actorId),
          damage: -delta,
        });
      }
    }
    return { result: "hit", delta: delta, target_label: targetLabel };
  }

  // Lethal: award level-scaled kill XP, then resolve the death.
  let experienceGained = 0;
  let actorValues: Record<string, unknown> | undefined;
  if (killExperienceBase > 0) {
    const targetLevel = Math.max(
      1,
      Math.floor(Number(targetValues.level || 1)),
    );
    experienceGained = killExperienceBase * targetLevel;
    const actorInv = loadPlayerInventory(actorId);
    actorInv.values.experience =
      Math.floor(Number(actorInv.values.experience || 0)) + experienceGained;
    actorInv.values.totalExperience =
      Math.floor(Number(actorInv.values.totalExperience || 0)) +
      experienceGained;
    savePlayerInventory(actorId, actorInv);
    broadcastPlayerValuesChanged(worldId, actorId, actorInv.values);
    actorValues = actorInv.values;
  }
  if (targetNpc) {
    resolveNPCDeath(worldId, targetId, targetNpc);
  } else if (targetInv) {
    const players = loadWorldPlayers(worldId);
    const pos = players[targetId] || { row: 0, col: 0, seq: 0, rotation: 0 };
    resolvePlayerDeath(worldId, targetId, pos, targetInv);
  }
  return {
    result: "kill",
    delta: delta,
    target_label: targetLabel,
    ...(experienceGained > 0
      ? { experience_gained: experienceGained, values: actorValues }
      : {}),
  };
}

function resolveCombatHit(
  worldId: string,
  fight: FightStateRow,
  attacker: any,
  target: any,
  npcs: Record<string, any>,
): void {
  const attackerWeaponClass = effectiveWeaponClass(
    fight.attacker_type === "npc"
      ? attacker
      : loadPlayerInventory(fight.attacker_id),
  );

  const targetInv =
    fight.target_type === "player"
      ? loadPlayerInventory(fight.target_id)
      : null;
  const targetValues = targetInv ? targetInv.values || {} : target.values || {};
  const armorClass = Number(targetValues.armorClass) || 0;

  // Same d20-vs-armor-class hit roll as the "break" item-damage action.
  const attackRoll = 1 + Math.floor(Math.random() * 20);
  const isHit =
    attackRoll === 20 || (attackRoll !== 1 && attackRoll > armorClass);

  const targetLabel =
    fight.target_type === "npc"
      ? resolveNPCDisplayName(worldId, fight.target_id, target)
      : getEffectiveNick(fight.target_id);

  if (!isHit) {
    if (fight.attacker_type === "player") {
      sendRecipientScopedStreamEvent(fight.attacker_id, "fight_tick", {
        result: "miss",
        target_label: targetLabel,
      });
    }
    return;
  }

  const damage = 1 + Math.floor(Math.random() * attackerWeaponClass);
  const currentHitPoints = Number(targetValues.currentHitPoints) || 0;
  const nextHitPoints = Math.max(0, currentHitPoints - damage);

  if (nextHitPoints > 0) {
    if (fight.target_type === "npc") {
      target.values = Object.assign({}, targetValues, {
        currentHitPoints: nextHitPoints,
      });
      saveWorldNPCs(worldId, { [fight.target_id]: target });
      broadcastNPCValuesChanged(
        worldId,
        fight.target_id,
        target.values,
        target.class_id,
      );
    } else if (targetInv) {
      const attackerLabel =
        fight.attacker_type === "npc"
          ? resolveNPCDisplayName(worldId, fight.attacker_id, attacker)
          : getEffectiveNick(fight.attacker_id);
      targetInv.values = Object.assign({}, targetValues, {
        currentHitPoints: nextHitPoints,
      });
      savePlayerInventory(fight.target_id, targetInv);
      broadcastPlayerValuesChanged(worldId, fight.target_id, targetInv.values);
      sendRecipientScopedStreamEvent(fight.target_id, "fight_hit_taken", {
        attacker_label: attackerLabel,
        damage: damage,
      });
    }
    if (fight.attacker_type === "player") {
      sendRecipientScopedStreamEvent(fight.attacker_id, "fight_tick", {
        result: "hit",
        target_label: targetLabel,
        damage: damage,
      });
    }
    return;
  }

  // Lethal hit: the attacker's fight (and follow, if any) ends here — the
  // target no longer exists to keep fighting.
  deleteFightState(fight.attacker_id);
  if (fight.attacker_type === "player") deleteFollowState(fight.attacker_id);
  if (fight.attacker_type === "player") {
    // Award kill XP to the player attacker: the "fight" action's configured
    // base amount scaled by the slain target's level, so higher-level targets
    // are worth proportionally more (a level-3 wolf gives 3x a level-1 wolf).
    const fightActionDef = getActionDefinition("fight");
    const killExp = fightActionDef ? fightActionDef.experience : undefined;
    const baseAmount = killExp ? Math.floor(Number(killExp.amount || 0)) : 0;
    let experienceGained = 0;
    let attackerValues: Record<string, unknown> | undefined;
    if (baseAmount > 0) {
      const targetLevel = Math.max(
        1,
        Math.floor(Number(targetValues.level || 1)),
      );
      experienceGained = baseAmount * targetLevel;
      const attackerInv = loadPlayerInventory(fight.attacker_id);
      attackerInv.values.experience =
        Math.floor(Number(attackerInv.values.experience || 0)) +
        experienceGained;
      attackerInv.values.totalExperience =
        Math.floor(Number(attackerInv.values.totalExperience || 0)) +
        experienceGained;
      savePlayerInventory(fight.attacker_id, attackerInv);
      broadcastPlayerValuesChanged(
        worldId,
        fight.attacker_id,
        attackerInv.values,
      );
      attackerValues = attackerInv.values;
    }
    sendRecipientScopedStreamEvent(fight.attacker_id, "fight_tick", {
      result: "kill",
      target_label: targetLabel,
      ...(experienceGained > 0
        ? { experience_gained: experienceGained, values: attackerValues }
        : {}),
    });
    sendRecipientScopedStreamEvent(fight.attacker_id, "fight_ended", {
      reason: "killed",
    });
  }

  if (fight.target_type === "npc") {
    resolveNPCDeath(worldId, fight.target_id, target);
    // Local map entry must be dropped too so any other attacker's fight
    // targeting this NPC in the same tick sees it as gone (self-heals next
    // check) instead of hitting a row that's already been deleted from DB.
    delete npcs[fight.target_id];
  } else {
    resolvePlayerDeath(
      worldId,
      fight.target_id,
      target,
      targetInv || loadPlayerInventory(fight.target_id),
    );
  }
}

function processFight(
  worldId: string,
  now: number,
  fight: FightStateRow,
  players: Record<string, any>,
  npcs: Record<string, any>,
): void {
  const attacker =
    fight.attacker_type === "npc"
      ? npcs[fight.attacker_id]
      : players[fight.attacker_id];
  if (!attacker) {
    deleteFightState(fight.attacker_id);
    if (fight.attacker_type === "player") deleteFollowState(fight.attacker_id);
    return;
  }

  const target =
    fight.target_type === "npc"
      ? npcs[fight.target_id]
      : players[fight.target_id];
  if (!target) {
    deleteFightState(fight.attacker_id);
    if (fight.attacker_type === "player") {
      deleteFollowState(fight.attacker_id);
      sendRecipientScopedStreamEvent(fight.attacker_id, "fight_ended", {
        reason: "target_gone",
      });
    }
    return;
  }

  // A non-combatant cannot fight — neither as attacker nor as opponent. This
  // can only be reached if a living changed into one after the fight started
  // (starting a new fight against/as a non-combatant is already rejected up
  // front in tree-action-helpers.ts and maybeStartNPCAggression above), which
  // in practice means dying into a ghost, so treat it the same as the
  // target/attacker having left the world.
  if (
    fight.attacker_type === "player" &&
    !isCombatantClass(loadPlayerInventory(fight.attacker_id).class_id)
  ) {
    deleteFightState(fight.attacker_id);
    deleteFollowState(fight.attacker_id);
    sendRecipientScopedStreamEvent(fight.attacker_id, "fight_ended", {
      reason: "ghost",
    });
    return;
  }
  if (
    fight.target_type === "player" &&
    !isCombatantClass(loadPlayerInventory(fight.target_id).class_id)
  ) {
    deleteFightState(fight.attacker_id);
    if (fight.attacker_type === "player") {
      deleteFollowState(fight.attacker_id);
      sendRecipientScopedStreamEvent(fight.attacker_id, "fight_ended", {
        reason: "target_gone",
      });
    }
    return;
  }

  // Strike when the target is within the attacker's weapon attack range (0 =
  // same tile for unarmed, 1 for a melee weapon, more for a bow); otherwise
  // close the distance. Player attackers are chased into range by
  // tickFollowForWorld (started alongside this fight, and stopped at attack
  // range there); only NPC attackers step here.
  const attackerLiving =
    fight.attacker_type === "npc"
      ? attacker
      : loadPlayerInventory(fight.attacker_id);
  const reach = attackRange(attackerLiving);
  const withinReach =
    chebyshev(attacker.row, attacker.col, target.row, target.col) <= reach;
  if (!withinReach) {
    if (fight.attacker_type === "npc") {
      stepNPCTowardTarget(
        worldId,
        now,
        fight.attacker_id,
        attacker,
        target,
        players,
        npcs,
      );
    }
    return;
  }

  runInWorldTransaction("fight_tick:" + fight.attacker_id, function () {
    resolveCombatHit(worldId, fight, attacker, target, npcs);
  });
}

/**
 * Advances every active fight in worldId by one tick: aggressive NPCs may
 * start new fights against a co-located player, attackers chase targets
 * that aren't yet co-located (NPC attackers only — player attackers reuse
 * tickFollowForWorld), and co-located pairs roll a hit. Called from the same
 * lease-guarded, NPC_TICK_MS-cadence hook as tickFollowForWorld (see
 * npc-orchestration.ts) rather than its own scheduler.
 *
 * Self-healing: an attacker or target no longer present in this world's
 * player/NPC snapshot is treated as gone — no explicit cleanup hook is
 * needed elsewhere.
 */
export function tickFightForWorld(worldId: string, now: number): void {
  const existingFights = loadActiveFightsForWorld(worldId);
  const players = loadWorldPlayers(worldId);
  const npcs = loadWorldNPCs(worldId);

  const attackerIdsFighting = new Set(
    existingFights.map(function (f) {
      return f.attacker_id;
    }),
  );
  const startedFights = maybeStartNPCAggression(
    worldId,
    npcs,
    players,
    attackerIdsFighting,
  );
  const fights = existingFights.concat(startedFights);
  if (fights.length === 0) return;

  fights.forEach(function (fight) {
    processFight(worldId, now, fight, players, npcs);
  });
}

/** NPCs currently attacking as part of an active fight, so tickWorldNPCs can
 * skip their normal wander/forage behavior while they're engaged in combat. */
export function loadActiveNPCFighterIds(worldId: string): Set<string> {
  const fights = loadActiveFightsForWorld(worldId);
  const ids = new Set<string>();
  fights.forEach(function (f) {
    if (f.attacker_type === "npc") ids.add(f.attacker_id);
  });
  return ids;
}
