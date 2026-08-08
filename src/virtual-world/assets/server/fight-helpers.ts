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
import { getActionDefinition, getItemStateTemplate } from "./item-registry.ts";
import { getLivingClassWithRefresh } from "./living-registry.ts";
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
import { getNPCDisplayName, isWorldTileWalkable } from "./world-domain.ts";

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
    // Ghosts cannot be fought — including being aggro'd by a hostile NPC.
    if (loadPlayerInventory(targetPlayerId).class_id === "player_ghost") {
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
      display_name: getNPCDisplayName(worldId, npcId),
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
  const corpseItem = {
    id: "w" + worldId + "_i" + nextWorldItemId(worldId),
    type: "npc_corpse",
    created_at: Date.now(),
    state: getItemStateTemplate("npc_corpse"),
  };
  upsertWorldItem(worldId, npc.row, npc.col, corpseItem);
  broadcastItemChange(worldId, "npc", npcId, "npc_died", npc.row, npc.col, [
    corpseItem,
  ]);
  if (typeof npc.class_id === "string" && npc.class_id) {
    scheduleRespawnIfManifestTracked(worldId, "npc", npc.class_id);
  }
}

// Flips the defeated player's living class to player_ghost and heals them
// to full ghost HP (per design: keep inventory, respawn in place as a
// ghost) rather than removing them from the world.
function resolvePlayerDeath(
  worldId: string,
  playerId: string,
  playerPos: { row: number; col: number; seq: number; rotation: number },
  inv: any,
): void {
  inv.class_id = "player_ghost";
  inv.values = Object.assign({}, inv.values, {
    currentHitPoints: inv.values.maxHitPoints,
  });
  savePlayerInventory(playerId, inv);
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

// One-shot ranged hit for line-shape attacks (firebolt/bow): a single strike
// resolved from the caster's current tile with no persistent fight and no
// pursuit. The per-strike math mirrors resolveCombatHit (d20 vs armorClass,
// 1..weaponClass damage, corpse/ghost death, level-scaled kill XP) but stands
// alone so the fight tick is untouched. Attacker is always a player; the caller
// has already validated the target exists and is within range.
export function applyRangedHitToLiving(
  worldId: string,
  attackerId: string,
  targetId: string,
  targetType: "npc" | "player",
  killExperienceBase: number,
): {
  result: "miss" | "hit" | "kill";
  damage: number;
  target_label: string;
  experience_gained?: number;
  values?: Record<string, unknown>;
} {
  const attackerWeaponClass = effectiveWeaponClass(
    loadPlayerInventory(attackerId),
  );
  const targetLabel =
    targetType === "npc"
      ? getNPCDisplayName(worldId, targetId)
      : getEffectiveNick(targetId);

  const npcs = targetType === "npc" ? loadWorldNPCs(worldId) : {};
  const targetNpc = targetType === "npc" ? npcs[targetId] : null;
  const targetInv =
    targetType === "player" ? loadPlayerInventory(targetId) : null;
  const targetValues = targetInv
    ? targetInv.values || {}
    : targetNpc
      ? targetNpc.values || {}
      : {};
  const armorClass = Number(targetValues.armorClass) || 0;

  const attackRoll = 1 + Math.floor(Math.random() * 20);
  const isHit =
    attackRoll === 20 || (attackRoll !== 1 && attackRoll > armorClass);
  if (!isHit) {
    return { result: "miss", damage: 0, target_label: targetLabel };
  }

  const damage = 1 + Math.floor(Math.random() * attackerWeaponClass);
  const currentHitPoints = Number(targetValues.currentHitPoints) || 0;
  const nextHitPoints = Math.max(0, currentHitPoints - damage);

  if (nextHitPoints > 0) {
    if (targetType === "npc" && targetNpc) {
      targetNpc.values = Object.assign({}, targetValues, {
        currentHitPoints: nextHitPoints,
      });
      saveWorldNPCs(worldId, { [targetId]: targetNpc });
      broadcastNPCValuesChanged(worldId, targetId, targetNpc.values);
    } else if (targetInv) {
      targetInv.values = Object.assign({}, targetValues, {
        currentHitPoints: nextHitPoints,
      });
      savePlayerInventory(targetId, targetInv);
      broadcastPlayerValuesChanged(worldId, targetId, targetInv.values);
      sendRecipientScopedStreamEvent(targetId, "fight_hit_taken", {
        attacker_label: getEffectiveNick(attackerId),
        damage: damage,
      });
    }
    return { result: "hit", damage: damage, target_label: targetLabel };
  }

  // Lethal strike: award level-scaled kill XP, then resolve the death.
  let experienceGained = 0;
  let attackerValues: Record<string, unknown> | undefined;
  if (killExperienceBase > 0) {
    const targetLevel = Math.max(
      1,
      Math.floor(Number(targetValues.level || 1)),
    );
    experienceGained = killExperienceBase * targetLevel;
    const attackerInv = loadPlayerInventory(attackerId);
    attackerInv.values.experience =
      Math.floor(Number(attackerInv.values.experience || 0)) + experienceGained;
    attackerInv.values.totalExperience =
      Math.floor(Number(attackerInv.values.totalExperience || 0)) +
      experienceGained;
    savePlayerInventory(attackerId, attackerInv);
    broadcastPlayerValuesChanged(worldId, attackerId, attackerInv.values);
    attackerValues = attackerInv.values;
  }
  if (targetType === "npc" && targetNpc) {
    resolveNPCDeath(worldId, targetId, targetNpc);
  } else if (targetInv) {
    const players = loadWorldPlayers(worldId);
    const pos = players[targetId] || { row: 0, col: 0, seq: 0, rotation: 0 };
    resolvePlayerDeath(worldId, targetId, pos, targetInv);
  }
  return {
    result: "kill",
    damage: damage,
    target_label: targetLabel,
    ...(experienceGained > 0
      ? { experience_gained: experienceGained, values: attackerValues }
      : {}),
  };
}

// Applies a spell effect with no attack roll or weapon scaling. This keeps
// fixed-damage spells independent of the wielder's combat stats.
export function applyFixedDamageToNPC(
  worldId: string,
  targetId: string,
  damage: number,
): { result: "hit" | "kill"; damage: number; target_label: string } | null {
  const npcs = loadWorldNPCs(worldId);
  const targetNpc = npcs[targetId];
  if (!targetNpc) return null;

  const actualDamage = Math.max(1, Math.floor(damage));
  const targetValues = targetNpc.values || {};
  const nextHitPoints = Math.max(
    0,
    (Number(targetValues.currentHitPoints) || 0) - actualDamage,
  );
  const targetLabel = getNPCDisplayName(worldId, targetId);

  if (nextHitPoints > 0) {
    targetNpc.values = Object.assign({}, targetValues, {
      currentHitPoints: nextHitPoints,
    });
    saveWorldNPCs(worldId, { [targetId]: targetNpc });
    broadcastNPCValuesChanged(worldId, targetId, targetNpc.values);
    return { result: "hit", damage: actualDamage, target_label: targetLabel };
  }

  resolveNPCDeath(worldId, targetId, targetNpc);
  return { result: "kill", damage: actualDamage, target_label: targetLabel };
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
      ? getNPCDisplayName(worldId, fight.target_id)
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
      broadcastNPCValuesChanged(worldId, fight.target_id, target.values);
    } else if (targetInv) {
      const attackerLabel =
        fight.attacker_type === "npc"
          ? getNPCDisplayName(worldId, fight.attacker_id)
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

  // Ghosts cannot fight — neither as attacker nor as opponent. This can
  // only be reached if a living became a ghost after the fight started
  // (starting a new fight against/as a ghost is already rejected up front
  // in tree-action-helpers.ts and maybeStartNPCAggression above), so treat
  // it the same as the target/attacker having left the world.
  if (
    fight.attacker_type === "player" &&
    loadPlayerInventory(fight.attacker_id).class_id === "player_ghost"
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
    loadPlayerInventory(fight.target_id).class_id === "player_ghost"
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
