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
import { getItemStateTemplate } from "./item-registry.ts";
import { AGGRESSIVE_NPC_LIVING_CLASS_IDS } from "./living-registry.ts";
import { deleteNPCById, loadWorldNPCs, saveWorldNPCs } from "./npc-storage.ts";
import {
  buildOccupiedNPCMap,
  buildOccupiedPlayerMap,
} from "./npc-tick-helpers.ts";
import { loadWorldPlayers } from "./player-snapshots.ts";
import { NPC_AGGRO_CHANCE } from "./runtime-config.ts";
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

// Aggressive NPC classes (see AGGRESSIVE_NPC_LIVING_CLASS_IDS) start a fight
// on their own against any player found standing on their tile, mirroring
// the same-tile co-location convention a player's own "fight"/"poke"/"follow"
// actions use. Once started, the fight is processed identically to a
// player-initiated one for the rest of its lifetime.
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
    if (
      AGGRESSIVE_NPC_LIVING_CLASS_IDS.indexOf(String(npc.class_id || "")) === -1
    ) {
      return;
    }
    const targetPlayerId = Object.keys(players).find(function (pid) {
      const p = players[pid];
      return p && p.row === npc.row && p.col === npc.col;
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
  npc: { row: number; col: number },
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

function resolveCombatHit(
  worldId: string,
  fight: FightStateRow,
  attacker: any,
  target: any,
  npcs: Record<string, any>,
): void {
  const attackerWeaponClass =
    fight.attacker_type === "npc"
      ? Math.max(
          1,
          Number((attacker.values && attacker.values.weaponClass) || 0),
        )
      : Math.max(
          1,
          Number(
            (loadPlayerInventory(fight.attacker_id).values || {}).weaponClass ||
              0,
          ),
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
    sendRecipientScopedStreamEvent(fight.attacker_id, "fight_tick", {
      result: "kill",
      target_label: targetLabel,
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
      sendRecipientScopedStreamEvent(fight.attacker_id, "follow_ended", {
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
    return;
  }
  if (
    fight.target_type === "player" &&
    loadPlayerInventory(fight.target_id).class_id === "player_ghost"
  ) {
    deleteFightState(fight.attacker_id);
    if (fight.attacker_type === "player") {
      deleteFollowState(fight.attacker_id);
      sendRecipientScopedStreamEvent(fight.attacker_id, "follow_ended", {
        reason: "target_gone",
      });
    }
    return;
  }

  const coLocated = attacker.row === target.row && attacker.col === target.col;
  if (!coLocated) {
    // Player attackers are chased into range by tickFollowForWorld (started
    // alongside this fight); only NPC attackers need to step here.
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
