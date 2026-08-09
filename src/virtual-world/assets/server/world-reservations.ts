// Tile reservations — "what rules does this tile carry in this world".
//
// Phase 3 of TODO-placements.md. The answers now come from the world class's
// placement data (see world-placements.ts): each placement may declare
// reservations, and a reservation is a circle or rectangle carrying a set of
// rules. Phase 2 introduced this same API backed by hard-coded Birdhaven oak
// constants; every consumer already asks the general question, so this file is
// the only one that changed when the backing did.
//
// Resolved reservations are memoized per world. isReservedTile is called per
// candidate tile inside the NPC tick, so re-reading the world row and walking
// the class's placements on every call would be far too hot.

import {
  isWorldTileWalkable,
  worldTileValueForName,
  WORLD_TILE_DEFS,
} from "./world-domain.ts";
import {
  getWorldClassCacheGeneration,
  getWorldClassForWorldId,
} from "./world-class-storage.ts";
import {
  isReservationRule,
  RESERVATION_BLOCK_BUILD,
  RESERVATION_BLOCK_PLANT,
  RESERVATION_BLOCK_RANDOM_SPAWN,
  RESERVATION_BLOCK_TERRAIN_FEATURE,
  RESERVATION_CLEAR_TERRAIN,
  RESERVATION_PROTECT_LANDMARK,
  RESERVATION_RULES,
  RESERVATION_SPAWN_AREA,
} from "./runtime-config.ts";

export {
  isReservationRule,
  RESERVATION_BLOCK_BUILD,
  RESERVATION_BLOCK_PLANT,
  RESERVATION_BLOCK_RANDOM_SPAWN,
  RESERVATION_BLOCK_TERRAIN_FEATURE,
  RESERVATION_CLEAR_TERRAIN,
  RESERVATION_PROTECT_LANDMARK,
  RESERVATION_RULES,
  RESERVATION_SPAWN_AREA,
};

// Action classes are seeded into the database, and the seeder shallow-merges
// only validation keys the stored row is *missing* (see seedActionClassDefaults
// in item-registry.ts). Deployed rows already have a `blockedZones` key, so
// they keep their old zone kinds indefinitely — these aliases are what makes
// those rows keep working, not a temporary shim.
//
// Now that per-rule geometries *can* diverge (a creator may give block_plant
// and block_build different areas), the aliases are a compatibility floor
// rather than a faithful mapping: a stored `oak_clearing` resolves to
// block_plant, so an action relying on it would miss a build-only area. The
// built-in definitions in action-registry.ts name the rules directly; only
// rows seeded before that change still take this path.
const LEGACY_ZONE_KIND_RULES: Record<string, string> = {
  oak_clearing: RESERVATION_BLOCK_PLANT,
  oak_center: RESERVATION_PROTECT_LANDMARK,
};

export type ReservationTile = { row: number; col: number };

export type ReservationBounds = {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
};

// Accepts both current rule names and the legacy blocked-zone kinds still
// present in seeded action-class rows. Returns "" for anything unrecognized.
export function normalizeReservationRule(rule: unknown): string {
  const name = String(rule || "");
  if (isReservationRule(name)) return name;
  return LEGACY_ZONE_KIND_RULES[name] || "";
}

// A reservation flattened into the shape the lookups below need: an area, the
// rules it carries, and the placement that owns it (for landmark tiles).
type ResolvedReservation = {
  kind: string;
  row: number;
  col: number;
  radius: number;
  rows: number;
  cols: number;
  rules: string[];
};

type ResolvedWorldReservations = {
  reservations: ResolvedReservation[];
  // Tiles occupied by a placement itself, which carry protect_landmark.
  landmarkTiles: ReservationTile[];
  // Terrain-kind placements: tile value keyed by "row_col". Painted onto the
  // effective map after mods, so a landmark's footprint survives them.
  terrainTiles: Record<string, number>;
};

const EMPTY_RESOLVED: ResolvedWorldReservations = {
  reservations: [],
  landmarkTiles: [],
  terrainTiles: {},
};

type MemoEntry = {
  generation: number;
  ts: number;
  data: ResolvedWorldReservations;
};
const _memo: Record<string, MemoEntry> = {};
// Backstop for the one input the class-cache generation does not cover: a
// world's *class assignment* can change (world switch, saveWorldType) without
// any class record being written.
const MEMO_TTL_MS = 5000;

function resolveWorldReservations(
  worldId: string | number,
): ResolvedWorldReservations {
  const key = String(worldId || "");
  if (!key) return EMPTY_RESOLVED;
  const generation = getWorldClassCacheGeneration();
  const now = Date.now();
  const cached = _memo[key];
  if (
    cached &&
    cached.generation === generation &&
    now - cached.ts < MEMO_TTL_MS
  ) {
    return cached.data;
  }

  const worldClass = getWorldClassForWorldId(key);
  const placements =
    worldClass && Array.isArray(worldClass.placements)
      ? worldClass.placements
      : [];

  const resolved: ResolvedWorldReservations = {
    reservations: [],
    landmarkTiles: [],
    terrainTiles: {},
  };

  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    if (!placement || !placement.position) continue;
    const row = Number(placement.position.row);
    const col = Number(placement.position.col);
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue;

    resolved.landmarkTiles.push({ row: row, col: col });

    if (placement.kind === "terrain") {
      const tileName = String(placement.classId || "");
      if ((WORLD_TILE_DEFS as Record<string, unknown>)[tileName]) {
        resolved.terrainTiles[row + "_" + col] =
          worldTileValueForName(tileName);
      }
    }

    const reservations = Array.isArray(placement.reservations)
      ? placement.reservations
      : [];
    for (let r = 0; r < reservations.length; r++) {
      const reservation = reservations[r];
      if (!reservation) continue;
      const rules: string[] = [];
      const rawRules = Array.isArray(reservation.rules)
        ? reservation.rules
        : [];
      for (let k = 0; k < rawRules.length; k++) {
        const rule = normalizeReservationRule(rawRules[k]);
        if (rule && rules.indexOf(rule) === -1) rules.push(rule);
      }
      if (rules.length === 0) continue;
      resolved.reservations.push({
        kind: String(reservation.kind || ""),
        row: Number.isFinite(Number(reservation.row))
          ? Number(reservation.row)
          : row,
        col: Number.isFinite(Number(reservation.col))
          ? Number(reservation.col)
          : col,
        radius: Number.isFinite(Number(reservation.radius))
          ? Number(reservation.radius)
          : 0,
        rows: Number.isFinite(Number(reservation.rows))
          ? Number(reservation.rows)
          : 0,
        cols: Number.isFinite(Number(reservation.cols))
          ? Number(reservation.cols)
          : 0,
        rules: rules,
      });
    }
  }

  _memo[key] = { generation: generation, ts: now, data: resolved };
  return resolved;
}

function reservationCoversTile(
  reservation: ResolvedReservation,
  row: number,
  col: number,
): boolean {
  if (reservation.kind === "circle") {
    const dr = row - reservation.row;
    const dc = col - reservation.col;
    return dr * dr + dc * dc <= reservation.radius * reservation.radius;
  }
  if (reservation.kind === "rectangle") {
    return (
      row >= reservation.row &&
      row < reservation.row + reservation.rows &&
      col >= reservation.col &&
      col < reservation.col + reservation.cols
    );
  }
  return false;
}

function reservationBounds(
  reservation: ResolvedReservation,
): ReservationBounds {
  if (reservation.kind === "circle") {
    return {
      minRow: reservation.row - reservation.radius,
      maxRow: reservation.row + reservation.radius,
      minCol: reservation.col - reservation.radius,
      maxCol: reservation.col + reservation.radius,
    };
  }
  return {
    minRow: reservation.row,
    maxRow: reservation.row + reservation.rows - 1,
    minCol: reservation.col,
    maxCol: reservation.col + reservation.cols - 1,
  };
}

export function isReservedTile(
  worldId: string | number,
  row: number,
  col: number,
  rule: string,
): boolean {
  const normalized = normalizeReservationRule(rule);
  if (!normalized) return false;
  const resolved = resolveWorldReservations(worldId);

  if (normalized === RESERVATION_PROTECT_LANDMARK) {
    for (let i = 0; i < resolved.landmarkTiles.length; i++) {
      const tile = resolved.landmarkTiles[i];
      if (tile.row === Number(row) && tile.col === Number(col)) return true;
    }
    return false;
  }

  for (let i = 0; i < resolved.reservations.length; i++) {
    const reservation = resolved.reservations[i];
    if (reservation.rules.indexOf(normalized) === -1) continue;
    if (reservationCoversTile(reservation, Number(row), Number(col))) {
      return true;
    }
  }
  return false;
}

// Tiles carrying `rule`, nearest-first from the reservation's centre so that
// spawn selection stays deterministic and clustered.
export function getReservedTiles(
  worldId: string | number,
  rule: string,
): ReservationTile[] {
  const normalized = normalizeReservationRule(rule);
  if (!normalized) return [];
  const resolved = resolveWorldReservations(worldId);

  if (normalized === RESERVATION_PROTECT_LANDMARK) {
    return resolved.landmarkTiles.map(function (tile) {
      return { row: tile.row, col: tile.col };
    });
  }

  const tiles: Array<ReservationTile & { dist2: number }> = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < resolved.reservations.length; i++) {
    const reservation = resolved.reservations[i];
    if (reservation.rules.indexOf(normalized) === -1) continue;
    const bounds = reservationBounds(reservation);
    for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
      if (row < 0) continue;
      for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
        if (col < 0) continue;
        if (!reservationCoversTile(reservation, row, col)) continue;
        const key = row + "_" + col;
        if (seen[key]) continue;
        seen[key] = true;
        const dr = row - reservation.row;
        const dc = col - reservation.col;
        tiles.push({ row: row, col: col, dist2: dr * dr + dc * dc });
      }
    }
  }
  tiles.sort(function (a, b) {
    if (a.dist2 !== b.dist2) return a.dist2 - b.dist2;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
  return tiles.map(function (tile) {
    return { row: tile.row, col: tile.col };
  });
}

// Bounding box over every reservation carrying `rule`, or null when the world
// has none. Terrain generation needs the extent rather than a per-tile test,
// because it routes linear features around the whole area.
export function getReservationBounds(
  worldId: string | number,
  rule: string,
): ReservationBounds | null {
  const normalized = normalizeReservationRule(rule);
  if (!normalized) return null;
  const resolved = resolveWorldReservations(worldId);
  let out: ReservationBounds | null = null;
  for (let i = 0; i < resolved.reservations.length; i++) {
    const reservation = resolved.reservations[i];
    if (reservation.rules.indexOf(normalized) === -1) continue;
    const bounds = reservationBounds(reservation);
    if (!out) {
      out = bounds;
      continue;
    }
    out = {
      minRow: Math.min(out.minRow, bounds.minRow),
      maxRow: Math.max(out.maxRow, bounds.maxRow),
      minCol: Math.min(out.minCol, bounds.minCol),
      maxCol: Math.max(out.maxCol, bounds.maxCol),
    };
  }
  return out;
}

// Where to put an arriving player when no spawn_area tile is usable: the tile
// just south of the spawn area's centre, which is the landmark's own tile and
// therefore normally blocked. Null when the world declares no spawn area.
export function getSpawnFallbackTile(
  worldId: string | number,
): ReservationTile | null {
  const resolved = resolveWorldReservations(worldId);
  for (let i = 0; i < resolved.reservations.length; i++) {
    const reservation = resolved.reservations[i];
    if (reservation.rules.indexOf(RESERVATION_SPAWN_AREA) === -1) continue;
    return { row: reservation.row + 1, col: reservation.col };
  }
  return null;
}

// Whether a terrain placement claims this tile, so generation-time fixups
// (the walkable spawn corner) can yield to authored terrain instead of
// punching a hole through it.
export function isTerrainPlacementTile(
  worldId: string | number,
  row: number,
  col: number,
): boolean {
  const resolved = resolveWorldReservations(worldId);
  return resolved.terrainTiles[row + "_" + col] !== undefined;
}

// Paints placement-owned terrain over a generated map: first the clear_terrain
// reservations (so a clearing is actually clear of generated trees/rocks),
// then terrain placements (so a landmark's own footprint survives its own
// clearing). Runs after world mods, so authored terrain also outranks
// player-built changes on the tiles it owns.
export function applyWorldReservationsToMap(
  map: number[][],
  worldId: string | number,
): number[][] {
  const resolved = resolveWorldReservations(worldId);
  if (
    resolved.reservations.length === 0 &&
    Object.keys(resolved.terrainTiles).length === 0
  ) {
    return map;
  }
  const mapRows = map.length;

  for (let i = 0; i < resolved.reservations.length; i++) {
    const reservation = resolved.reservations[i];
    if (reservation.rules.indexOf(RESERVATION_CLEAR_TERRAIN) === -1) continue;
    const bounds = reservationBounds(reservation);
    for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
      if (row < 0 || row >= mapRows || !map[row]) continue;
      const mapCols = map[row].length;
      for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
        if (col < 0 || col >= mapCols) continue;
        if (!reservationCoversTile(reservation, row, col)) continue;
        // Only unwalkable scenery is cleared. Water and other deliberate
        // terrain the generator routed around the area stays put.
        if (isWorldTileWalkable(map[row][col])) continue;
        map[row][col] = worldTileValueForName("ground");
      }
    }
  }

  for (const key of Object.keys(resolved.terrainTiles)) {
    const parts = key.split("_");
    const row = Number(parts[0]);
    const col = Number(parts[1]);
    if (row < 0 || row >= mapRows || !map[row]) continue;
    if (col < 0 || col >= map[row].length) continue;
    map[row][col] = resolved.terrainTiles[key];
  }

  return map;
}
