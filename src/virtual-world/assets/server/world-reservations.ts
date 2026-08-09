// Tile reservations — "what rules does this tile carry in this world".
//
// Phase 2 of TODO-placements.md. Every consumer that used to ask an
// oak-specific question ("is this the oak clearing?") now asks the general
// one ("does this tile block planting?"), but the answers still come from the
// hard-coded Birdhaven oak constants in world-domain.ts. Behavior is
// deliberately unchanged.
//
// Phase 3 repoints the lookups below at world-class placement data. Because
// every consumer already asks the question the placement model answers, that
// swap should touch this file and nothing else.

import {
  applyOakReservation,
  COLS,
  getOakClearingTiles,
  isOakCenterTile,
  isOakClearingTile,
  isOakWorld,
  OAK_CENTER_COL,
  OAK_CENTER_ROW,
  OAK_CLEAR_RADIUS,
  ROWS,
} from "./world-domain.ts";
import {
  RESERVATION_BLOCK_BUILD,
  RESERVATION_BLOCK_PLANT,
  RESERVATION_BLOCK_RANDOM_SPAWN,
  RESERVATION_BLOCK_TERRAIN_FEATURE,
  RESERVATION_PROTECT_LANDMARK,
  RESERVATION_SPAWN_AREA,
} from "./runtime-config.ts";

// Rule names are an open, registry-validated set rather than a closed union:
// placement authors will add rules without a schema migration. Validation
// rejects unknown names at save time; lookups treat them as unreserved.
//
// The names themselves are defined in runtime-config.ts (see the cycle note
// there) and re-exported here so callers have one import site for both the
// names and the lookups.
export {
  RESERVATION_BLOCK_BUILD,
  RESERVATION_BLOCK_PLANT,
  RESERVATION_BLOCK_RANDOM_SPAWN,
  RESERVATION_BLOCK_TERRAIN_FEATURE,
  RESERVATION_PROTECT_LANDMARK,
  RESERVATION_SPAWN_AREA,
};

export const RESERVATION_RULES: string[] = [
  RESERVATION_BLOCK_PLANT,
  RESERVATION_BLOCK_BUILD,
  RESERVATION_BLOCK_TERRAIN_FEATURE,
  RESERVATION_SPAWN_AREA,
  RESERVATION_PROTECT_LANDMARK,
  RESERVATION_BLOCK_RANDOM_SPAWN,
];

// Action classes are seeded into the database, and the seeder shallow-merges
// only validation keys the stored row is *missing* (see
// seedActionClassDefaults in item-registry.ts). Deployed rows already have a
// `blockedZones` key, so they keep their old zone kinds indefinitely — these
// aliases are what makes those rows keep working, not a temporary shim.
//
// Phase 3 must rewrite the seeded rows before per-rule geometries can diverge:
// `oak_clearing` cannot distinguish block_plant from block_build once a
// creator can give the two different areas.
const LEGACY_ZONE_KIND_RULES: Record<string, string> = {
  oak_clearing: RESERVATION_BLOCK_PLANT,
  oak_center: RESERVATION_PROTECT_LANDMARK,
};

// Rules carried by the oak clearing itself. In phase 2 they all share one
// geometry, which is exactly what makes the legacy aliases above safe.
const CLEARING_RULES: string[] = [
  RESERVATION_BLOCK_PLANT,
  RESERVATION_BLOCK_BUILD,
  RESERVATION_BLOCK_TERRAIN_FEATURE,
  RESERVATION_SPAWN_AREA,
];

export type ReservationTile = { row: number; col: number };

export type ReservationBounds = {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
};

export function isReservationRule(rule: string): boolean {
  return RESERVATION_RULES.indexOf(String(rule)) !== -1;
}

// Accepts both current rule names and the legacy blocked-zone kinds still
// present in seeded action-class rows. Returns "" for anything unrecognized.
export function normalizeReservationRule(rule: unknown): string {
  const name = String(rule || "");
  if (isReservationRule(name)) return name;
  return LEGACY_ZONE_KIND_RULES[name] || "";
}

export function isReservedTile(
  worldId: string | number,
  row: number,
  col: number,
  rule: string,
): boolean {
  const normalized = normalizeReservationRule(rule);
  if (!normalized) return false;
  if (normalized === RESERVATION_PROTECT_LANDMARK) {
    return isOakCenterTile(worldId, row, col);
  }
  if (CLEARING_RULES.indexOf(normalized) !== -1) {
    return isOakClearingTile(worldId, row, col);
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
  if (normalized === RESERVATION_PROTECT_LANDMARK) {
    if (!isOakWorld(worldId)) return [];
    if (OAK_CENTER_ROW < 0 || OAK_CENTER_ROW >= ROWS) return [];
    if (OAK_CENTER_COL < 0 || OAK_CENTER_COL >= COLS) return [];
    return [{ row: OAK_CENTER_ROW, col: OAK_CENTER_COL }];
  }
  if (CLEARING_RULES.indexOf(normalized) !== -1) {
    return getOakClearingTiles(worldId);
  }
  return [];
}

// Bounding box of the tiles carrying `rule`, or null when the world has no
// such reservation. Terrain generation needs the extent rather than a
// per-tile test, because it routes linear features around the whole area.
export function getReservationBounds(
  worldId: string | number,
  rule: string,
): ReservationBounds | null {
  const normalized = normalizeReservationRule(rule);
  if (!normalized || !isOakWorld(worldId)) return null;
  if (normalized === RESERVATION_PROTECT_LANDMARK) {
    return {
      minRow: OAK_CENTER_ROW,
      maxRow: OAK_CENTER_ROW,
      minCol: OAK_CENTER_COL,
      maxCol: OAK_CENTER_COL,
    };
  }
  if (CLEARING_RULES.indexOf(normalized) === -1) return null;
  return {
    minRow: OAK_CENTER_ROW - OAK_CLEAR_RADIUS,
    maxRow: OAK_CENTER_ROW + OAK_CLEAR_RADIUS,
    minCol: OAK_CENTER_COL - OAK_CLEAR_RADIUS,
    maxCol: OAK_CENTER_COL + OAK_CLEAR_RADIUS,
  };
}

// Where to put an arriving player when no spawn_area tile is usable — today
// the tile just south of the old oak. Phase 3 resolves this from the world's
// entry placement instead. Null when the world declares no spawn area.
export function getSpawnFallbackTile(
  worldId: string | number,
): ReservationTile | null {
  if (!isOakWorld(worldId)) return null;
  return { row: OAK_CENTER_ROW + 1, col: OAK_CENTER_COL };
}

// Paints reservation-owned terrain (the oak itself, the cleared ring around
// it) over a freshly generated map.
export function applyWorldReservationsToMap(
  map: number[][],
  worldId: string | number,
): number[][] {
  return applyOakReservation(map, worldId);
}
