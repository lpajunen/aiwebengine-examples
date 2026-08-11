import { getEffectiveMap, getWorldClassForWorld } from "./world-bootstrap.ts";
import { loadWorldPlayers } from "./player-snapshots.ts";
import {
  loadWorldPlacementInstances,
  saveWorldPlacementInstance,
} from "./world-placement-instances.ts";
import { isReservedTile } from "./world-reservations.ts";
import { RESERVATION_BLOCK_RANDOM_SPAWN } from "./runtime-config.ts";
import {
  VWORLD_NPC_ACTIVE_WORLD_TABLE,
  VWORLD_NPC_TABLE,
  VWORLD_NPC_TICK_TABLE,
} from "./runtime-config.ts";
import {
  createEmptyLivingState,
  createLivingSlotsFromDefinitions,
  fromStoredWorldTimestamp,
  isWorldTileWalkable,
  LivingIdentity,
  normalizeLivingIdentity,
  normalizeLivingState,
  PublicLivingSnapshot,
  resolveNPCDisplayName,
  stripClassOwnedLivingState,
  toPublicLivingSnapshot,
  toStoredWorldTimestamp,
} from "./world-domain.ts";
import {
  getDefaultNPCLivingClassId,
  getLivingClass,
} from "./living-registry.ts";
import { getItemStateTemplate } from "./item-registry.ts";
import { nextWorldItemId } from "./item-storage.ts";
import {
  insertWorldRow,
  updateWorldRow,
  deleteWorldRow,
  deleteWorldRowsWhere,
  querySingleWorldRow,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

type NPCState = {
  row?: unknown;
  col?: unknown;
  seq?: unknown;
  rotation?: unknown;
  state?: unknown;
  ts?: unknown;
  class_id?: unknown;
  slots?: unknown;
  bag?: unknown;
  values?: unknown;
  identity?: LivingIdentity;
};

function normalizeSafeInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.floor(numeric);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

export function loadWorldNPCs(worldId: string): Record<string, any> {
  const rows = queryWorldRows(
    VWORLD_NPC_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    1000,
    "id",
    "asc",
  );
  if (rows.length > 0) {
    const fromRows: Record<string, any> = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.npc_id) continue;
      const classId =
        typeof row.living_class_id === "string" && row.living_class_id
          ? String(row.living_class_id)
          : getDefaultNPCLivingClassId();
      const livingClass = getLivingClass(classId);
      let living = createEmptyLivingState(classId);
      try {
        if (livingClass) {
          living = normalizeLivingState(
            {
              class_id: classId,
              slots: row.slots_json ? JSON.parse(row.slots_json) : {},
              bag: row.bag_json ? JSON.parse(row.bag_json) : [],
              values: row.values_json ? JSON.parse(row.values_json) : {},
            },
            livingClass,
          );
        }
      } catch (e) {}
      const safeRow = normalizeSafeInt(row.row, 1, 0, 99);
      const safeCol = normalizeSafeInt(row.col, 1, 0, 99);
      const safeSeq = normalizeSafeInt(row.seq, 0, 0, 2147483647);
      const npc: any = {
        row: safeRow,
        col: safeCol,
        seq: safeSeq,
        rotation: Number.isFinite(Number(row.rotation))
          ? Number(row.rotation)
          : 0,
        state: typeof row.state === "string" ? row.state : "idle",
        ts: fromStoredWorldTimestamp(row.ts),
        class_id: living.class_id || classId,
        slots: living.slots,
        bag: living.bag,
        values: living.values,
      };
      // Normalized once here, so every reader downstream (and the display-name
      // resolver in particular, which runs per NPC per snapshot) can trust the
      // shape without re-parsing.
      const identity = normalizeLivingIdentity(row.identity_json);
      if (identity) npc.identity = identity;
      fromRows[String(row.npc_id)] = npc;
    }
    return fromRows;
  }
  return {};
}

export function saveWorldNPCs(
  worldId: string,
  npcs: Record<string, any>,
): void {
  Object.keys(npcs && typeof npcs === "object" ? npcs : {}).forEach(
    function (npcId) {
      const npc = npcs[npcId] as NPCState;
      if (!npc || typeof npc !== "object") return;
      const classId =
        typeof npc.class_id === "string" && npc.class_id
          ? String(npc.class_id)
          : getDefaultNPCLivingClassId();
      const livingClass = getLivingClass(classId);
      const living = livingClass
        ? normalizeLivingState(npc, livingClass)
        : createEmptyLivingState(classId);

      const safeRow = normalizeSafeInt(npc.row, 1, 0, 99);
      const safeCol = normalizeSafeInt(npc.col, 1, 0, 99);
      const safeSeq = normalizeSafeInt(npc.seq, 0, 0, 2147483647);

      // Persist only what the instance owns — class tuning knobs are
      // re-resolved from the living/item class on every load.
      const persisted = stripClassOwnedLivingState(living);

      const rowData = {
        npc_id: String(npcId),
        world_id: String(worldId),
        row: safeRow,
        col: safeCol,
        seq: safeSeq,
        rotation: Number.isFinite(Number(npc.rotation))
          ? Number(npc.rotation)
          : 0,
        state: typeof npc.state === "string" ? npc.state : "idle",
        ts: toStoredWorldTimestamp(
          Number.isFinite(Number(npc.ts)) ? Number(npc.ts) : Date.now(),
        ),
        living_class_id: living.class_id || classId,
        slots_json: JSON.stringify(persisted.slots),
        bag_json: JSON.stringify(persisted.bag),
        values_json: JSON.stringify(persisted.values),
        // "" rather than null: the column is nullable text, but an empty
        // string round-trips through normalizeLivingIdentity to "no identity"
        // and keeps every row the same shape.
        identity_json: npc.identity ? JSON.stringify(npc.identity) : "",
      };
      const existingRow = querySingleWorldRow(
        VWORLD_NPC_TABLE,
        JSON.stringify({ npc_id: String(npcId) }),
      );
      if (existingRow && Number.isFinite(Number(existingRow.id))) {
        updateWorldRow(VWORLD_NPC_TABLE, Number(existingRow.id), rowData);
      } else {
        insertWorldRow(VWORLD_NPC_TABLE, rowData);
      }
    },
  );
}

/**
 * The name of one NPC given only its id — for callers that hold a reference to
 * an NPC (a fight row, a follow row) rather than a loaded world. Reads the one
 * row instead of every NPC in the world, and falls back to the hashed name
 * exactly as the in-memory resolver does.
 */
export function loadNPCDisplayName(worldId: string, npcId: string): string {
  const row = querySingleWorldRow(
    VWORLD_NPC_TABLE,
    JSON.stringify({ npc_id: String(npcId) }),
  );
  const identity = row ? normalizeLivingIdentity(row.identity_json) : null;
  return resolveNPCDisplayName(worldId, npcId, { identity: identity });
}

/**
 * How many NPCs of each living class a world currently holds. Reads the rows
 * without building living state — the respawn guard only needs a headcount,
 * and this runs on the tick.
 */
export function countNPCsByClass(worldId: string): Record<string, number> {
  const rows = queryWorldRows(
    VWORLD_NPC_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    1000,
    "id",
    "asc",
  );
  const counts: Record<string, number> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.npc_id) continue;
    const classId =
      typeof row.living_class_id === "string" && row.living_class_id
        ? String(row.living_class_id)
        : getDefaultNPCLivingClassId();
    counts[classId] = (counts[classId] || 0) + 1;
  }
  return counts;
}

export function deleteNPCById(npcId: string): void {
  deleteWorldRowsWhere(
    VWORLD_NPC_TABLE,
    JSON.stringify({ npc_id: String(npcId) }),
  );
}

export function loadNPCActiveWorlds(): Record<string, number> {
  const rows = queryWorldRows(
    VWORLD_NPC_ACTIVE_WORLD_TABLE,
    JSON.stringify({}),
    1000,
    "last_active_ts",
    "desc",
  );
  if (rows.length > 0) {
    const worlds: Record<string, number> = {};
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i] || !rows[i].world_id) continue;
      worlds[String(rows[i].world_id)] = fromStoredWorldTimestamp(
        rows[i].last_active_ts,
      );
    }
    return worlds;
  }
  return {};
}

export function saveNPCActiveWorlds(worlds: Record<string, number>): void {
  const existingRows = queryWorldRows(
    VWORLD_NPC_ACTIVE_WORLD_TABLE,
    JSON.stringify({}),
    1000,
    "id",
    "desc",
  );
  const existingByWorldId: Record<string, any> = {};
  for (let i = 0; i < existingRows.length; i++) {
    if (existingRows[i] && existingRows[i].world_id) {
      existingByWorldId[String(existingRows[i].world_id)] = existingRows[i];
    }
  }

  Object.keys(worlds && typeof worlds === "object" ? worlds : {}).forEach(
    function (worldId) {
      upsertWorldRow(VWORLD_NPC_ACTIVE_WORLD_TABLE, ["world_id"], {
        world_id: String(worldId),
        last_active_ts: toStoredWorldTimestamp(
          Number.isFinite(Number(worlds[worldId]))
            ? Number(worlds[worldId])
            : 0,
        ),
      });
      delete existingByWorldId[worldId];
    },
  );

  Object.keys(existingByWorldId).forEach(function (worldId) {
    const row = existingByWorldId[worldId];
    if (!row || !Number.isFinite(Number(row.id))) return;
    deleteWorldRow(VWORLD_NPC_ACTIVE_WORLD_TABLE, Number(row.id));
  });
}

export function markNPCWorldActive(worldId: string): void {
  upsertWorldRow(VWORLD_NPC_ACTIVE_WORLD_TABLE, ["world_id"], {
    world_id: String(worldId),
    last_active_ts: toStoredWorldTimestamp(Date.now()),
  });
}

export function loadNPCLastTick(worldId: string): number {
  const row = querySingleWorldRow(
    VWORLD_NPC_TICK_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
  );
  if (!row) return 0;
  return fromStoredWorldTimestamp(row.last_tick_ts);
}

export function saveNPCLastTick(worldId: string, lastTickTs: number): void {
  upsertWorldRow(VWORLD_NPC_TICK_TABLE, ["world_id"], {
    world_id: String(worldId),
    last_tick_ts: toStoredWorldTimestamp(lastTickTs),
  });
}

export function buildWorldNPCSnapshot(
  worldId: string,
  npcs: Record<string, any>,
): PublicLivingSnapshot[] {
  return Object.keys(npcs).map(function (npcId) {
    const n = npcs[npcId] || {};
    const classId =
      typeof n.class_id === "string" && n.class_id
        ? String(n.class_id)
        : getDefaultNPCLivingClassId();
    const livingClass = getLivingClass(classId);
    return toPublicLivingSnapshot({
      id: npcId,
      kind: "npc",
      displayName: resolveNPCDisplayName(worldId, npcId, n),
      row: Number(n.row),
      col: Number(n.col),
      seq: Number(n.seq || 0),
      rotation: Number.isFinite(Number(n.rotation)) ? Number(n.rotation) : 0,
      living: n,
      livingClass: livingClass,
    });
  });
}

export function ensureWorldNPCs(worldId: string): Record<string, any> {
  const existing = loadWorldNPCs(worldId);
  if (existing && Object.keys(existing).length > 0) {
    let hasNormalizationChanges = false;
    Object.keys(existing).forEach((npcId) => {
      const npc = existing[npcId];
      if (!npc || typeof npc !== "object") {
        existing[npcId] = {
          row: 1,
          col: 1,
          seq: 0,
          rotation: 0,
          state: "idle",
          ts: Date.now(),
          class_id: getDefaultNPCLivingClassId(),
          slots: {},
          bag: [],
          values: {},
        };
        hasNormalizationChanges = true;
        return;
      }

      if (
        typeof npc.class_id !== "string" ||
        !npc.class_id ||
        !npc.slots ||
        typeof npc.slots !== "object" ||
        !Array.isArray(npc.bag)
      ) {
        if (typeof npc.class_id !== "string" || !npc.class_id) {
          npc.class_id = getDefaultNPCLivingClassId();
        }
        if (!npc.slots || typeof npc.slots !== "object") {
          const cls = getLivingClass(String(npc.class_id));
          npc.slots = cls
            ? createLivingSlotsFromDefinitions(cls.slotDefinitions)
            : {};
        }
        if (!Array.isArray(npc.bag)) npc.bag = [];
        if (!npc.values || typeof npc.values !== "object") npc.values = {};
        hasNormalizationChanges = true;
      }
    });

    if (hasNormalizationChanges) {
      saveWorldNPCs(worldId, existing);
    }
    materializeWorldNPCPlacements(worldId, existing);
    return existing;
  }

  const map = getEffectiveMap(worldId);
  const mapRows = map.length;
  const mapCols = map[0] ? map[0].length : 0;
  const players = loadWorldPlayers(worldId);
  const occupied: Record<string, boolean> = {};
  Object.keys(players).forEach((playerId) => {
    const player = players[playerId];
    if (
      !player ||
      !isFinite(Number(player.row)) ||
      !isFinite(Number(player.col))
    ) {
      return;
    }
    occupied[player.row + "_" + player.col] = true;
  });

  const worldClass = getWorldClassForWorld(worldId);
  const npcSpawns = worldClass ? worldClass.npcSpawns : [];
  const npcs: Record<string, any> = {};
  let nextIndex = 1;

  npcSpawns.forEach(function (entry) {
    if (!getLivingClass(entry.id)) return;
    for (let count = 0; count < entry.count; count++) {
      const placed = placeNPCAtRandomTile(
        worldId,
        map,
        mapRows,
        mapCols,
        occupied,
        entry.id,
        nextIndex,
      );
      if (!placed) continue;
      nextIndex++;
      npcs[placed.npcId] = placed.npc;
    }
  });

  saveWorldNPCs(worldId, npcs);
  materializeWorldNPCPlacements(worldId, npcs);
  return npcs;
}

// Materializes the world class's `npc` placements — named guards, quest NPCs,
// scenery animals — as opposed to the random npcSpawns population above.
// Lives here rather than beside the item/structure materialization in
// item-storage.ts because NPC rows belong to this module, and importing it
// there would close a cycle (npc-storage already imports item-storage).
//
// Idempotent by (world_id, placement_id): the instance row holds the NPC id,
// so a fixed NPC is re-adopted rather than duplicated. A fixed NPC that was
// killed and swept from the world does come back on the next load, which is
// the point — an authored guard is part of the world, not ambient population.
// Copies a placement's authored identity onto the NPC it owns, and reports
// whether anything changed so the caller can decide to persist. Compared by
// serialized value, which is safe because both sides come out of
// normalizeLivingIdentity and so carry their keys in the same order.
function applyPlacementIdentity(
  npc: any,
  identity: LivingIdentity | undefined,
): boolean {
  const desired = identity ? JSON.stringify(identity) : "";
  const current = npc && npc.identity ? JSON.stringify(npc.identity) : "";
  if (desired === current) return false;
  if (identity) npc.identity = identity;
  else delete npc.identity;
  return true;
}

export function materializeWorldNPCPlacements(
  worldId: string,
  npcs: Record<string, any>,
): void {
  const worldClass = getWorldClassForWorld(worldId);
  const placements =
    worldClass && Array.isArray(worldClass.placements)
      ? worldClass.placements
      : [];
  if (placements.length === 0) return;
  const revision = worldClass ? Number(worldClass.placementRevision || 0) : 0;
  const instances = loadWorldPlacementInstances(worldId);
  let changed = false;

  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    if (!placement || placement.kind !== "npc" || !placement.position) continue;
    const classId = String(placement.classId || "");
    if (!getLivingClass(classId)) continue;
    const row = Number(placement.position.row);
    const col = Number(placement.position.col);
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue;

    const existing = instances[placement.id];
    const recordedNpcId =
      existing && existing.data ? String(existing.data.npcId || "") : "";
    if (recordedNpcId && npcs[recordedNpcId]) {
      // The NPC is already here, so materialization has nothing to create —
      // but its identity is authored on the class, and a creator who renames
      // the gatekeeper expects the guard standing in every existing world to
      // answer to the new name. Cheap to check: this loop already holds both
      // sides.
      if (applyPlacementIdentity(npcs[recordedNpcId], placement.identity)) {
        changed = true;
      }
      continue;
    }

    const npcId = recordedNpcId || "placement_" + String(placement.id);
    const built = buildNPCAtTile(worldId, row, col, classId);
    if (!built) continue;
    applyPlacementIdentity(built, placement.identity);
    npcs[npcId] = built;
    changed = true;
    saveWorldPlacementInstance({
      worldId: String(worldId),
      placementId: String(placement.id),
      placementKind: "npc",
      classId: classId,
      revision: revision,
      data: { npcId: npcId },
    });
  }

  if (changed) saveWorldNPCs(worldId, npcs);
}

// Finds a random walkable+unoccupied tile and builds a fresh NPC of classId
// there, marking the tile occupied. Shared by the initial world seed loop
// and the respawn-timer single-NPC spawn.
// Distributes a class's defaultItems onto a freshly-spawned NPC: a weapon
// (state.weaponClass > 0) is auto-wielded into a free hand/manipulator slot,
// an item a slot explicitly `accepts` goes to that slot, and everything else
// (or a weapon with no free hand) lands in the bag. So a class-level loadout
// gives the NPC the same wielded-weapon combat stats a player would have (see
// fight-helpers.ts). Mutates `slots` and returns the bag.
function applyNPCDefaultItems(
  worldId: string,
  livingClass: any,
  slots: Record<string, any>,
): any[] {
  const bag: any[] = [];
  const itemTypes =
    livingClass && Array.isArray(livingClass.defaultItems)
      ? livingClass.defaultItems
      : [];
  const slotDefs =
    livingClass && Array.isArray(livingClass.slotDefinitions)
      ? livingClass.slotDefinitions
      : [];
  itemTypes.forEach(function (itemType: unknown) {
    const type = String(itemType || "");
    if (!type) return;
    const state = getItemStateTemplate(type);
    const item = {
      id: "w" + worldId + "_i" + nextWorldItemId(worldId),
      type: type,
      created_at: Date.now(),
      state: state,
    };
    const isWeapon = Number(state.weaponClass) > 0;
    let targetSlot: string | null = null;
    for (let i = 0; i < slotDefs.length; i++) {
      const sd = slotDefs[i];
      const sid = String(sd && sd.id);
      if (!sid || slots[sid]) continue;
      const explicitlyAccepts =
        Array.isArray(sd.accepts) && sd.accepts.indexOf(type) !== -1;
      const isHand =
        Array.isArray(sd.tags) &&
        (sd.tags.indexOf("hand") !== -1 ||
          sd.tags.indexOf("manipulator") !== -1);
      if (explicitlyAccepts || (isWeapon && isHand)) {
        targetSlot = sid;
        break;
      }
    }
    if (targetSlot) slots[targetSlot] = item;
    else bag.push(item);
  });
  return bag;
}

function placeNPCAtRandomTile(
  worldId: string,
  map: number[][],
  mapRows: number,
  mapCols: number,
  occupied: Record<string, boolean>,
  classId: string,
  index: number,
): { npcId: string; npc: any } | null {
  let attempts = 0;
  const maxAttempts = 4000;
  while (attempts < maxAttempts) {
    attempts++;
    const row = 1 + Math.floor(Math.random() * (mapRows - 2));
    const col = 1 + Math.floor(Math.random() * (mapCols - 2));
    const tileKey = row + "_" + col;
    // Any walkable terrain, not just plain forest ground: a cave is paved in
    // cave_floor, an island in sand, a building in wood_floor, so a
    // ground-only test left every non-forest world with zero NPCs however
    // full its spawn manifest was. Matches the walkability rule NPC movement
    // and world-item spawning already use.
    if (!isWorldTileWalkable(map[row][col]) || occupied[tileKey]) continue;
    // Same rule the random item scatter honours: an authored area can refuse
    // ambient population without refusing fixed NPC placements.
    if (isReservedTile(worldId, row, col, RESERVATION_BLOCK_RANDOM_SPAWN)) {
      continue;
    }
    occupied[tileKey] = true;
    const npcId =
      "npc_" + worldId + "_" + index + "_" + Date.now().toString(36);
    const livingClass = getLivingClass(classId);
    const slots = livingClass
      ? createLivingSlotsFromDefinitions(livingClass.slotDefinitions)
      : {};
    const bag = livingClass
      ? applyNPCDefaultItems(worldId, livingClass, slots)
      : [];
    return {
      npcId: npcId,
      npc: {
        row,
        col,
        seq: 0,
        rotation: 0,
        state: "idle",
        ts: Date.now(),
        class_id: classId,
        slots: slots,
        bag: bag,
        values: livingClass
          ? Object.assign({}, livingClass.valueTemplate || {})
          : {},
      },
    };
  }
  return null;
}

// Builds an NPC of classId standing on an exact tile — the placement
// counterpart to placeNPCAtRandomTile, sharing its class loadout handling.
function buildNPCAtTile(
  worldId: string,
  row: number,
  col: number,
  classId: string,
): any | null {
  const livingClass = getLivingClass(classId);
  if (!livingClass) return null;
  const slots = createLivingSlotsFromDefinitions(livingClass.slotDefinitions);
  const bag = applyNPCDefaultItems(worldId, livingClass, slots);
  return {
    row: row,
    col: col,
    seq: 0,
    rotation: 0,
    state: "idle",
    ts: Date.now(),
    class_id: classId,
    slots: slots,
    bag: bag,
    values: Object.assign({}, livingClass.valueTemplate || {}),
  };
}

// Spawns a single replacement NPC of classId into worldId at a random
// walkable empty tile — used by spawn-timers.ts when a manifest-tracked
// NPC's respawn timer comes due. Returns the placed npc (with id) or null if
// no empty tile could be found.
export function spawnSingleWorldNPC(
  worldId: string,
  classId: string,
): { npcId: string; npc: any } | null {
  const map = getEffectiveMap(worldId);
  const mapRows = map.length;
  const mapCols = map[0] ? map[0].length : 0;
  const existing = loadWorldNPCs(worldId);
  const occupied: Record<string, boolean> = {};
  Object.keys(existing).forEach(function (npcId) {
    const npc = existing[npcId];
    if (npc) occupied[npc.row + "_" + npc.col] = true;
  });
  const placed = placeNPCAtRandomTile(
    worldId,
    map,
    mapRows,
    mapCols,
    occupied,
    classId,
    Object.keys(existing).length + 1,
  );
  if (!placed) return null;
  saveWorldNPCs(worldId, { [placed.npcId]: placed.npc });
  return placed;
}
