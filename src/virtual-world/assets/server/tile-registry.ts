import { VWORLD_TILE_CLASS_TABLE } from "./runtime-config.ts";
import { vwLog } from "./diagnostics.ts";
import {
  deleteTileClassRow,
  loadAllTileClassRows,
  upsertTileClassRow,
} from "./tile-class-storage.ts";
import { ClassLabels, normalizeClassLabels } from "./class-labels.ts";

// Tile types, as a class repository like items, actions, livings and worlds.
// They used to be a closed enum: a set of string constants, a union type and a
// literal table in world-domain.ts, which meant the one content vocabulary the
// map is actually made of was the only one a creator could not extend.
//
// The numeric `value` is a runtime encoding only — maps are regenerated from a
// world's seed and world mods store the tile *name* — so values are free to be
// assigned per class without rewriting anything stored.

export const TILE_LAYER_TERRAIN = "terrain";
export const TILE_LAYER_OBJECT = "object";

// How the client draws a tile: a style naming one of its mesh recipes, the
// colors to paint it and the height it sits at. See TILE_VISUAL_STYLE_SPECS in
// client-world-render.js — the recipes are a fixed menu the data picks from,
// as with item and living visual styles.
export type TileVisualStyle = "floor" | "water" | "rock" | "mountain" | "fence";

export const TILE_VISUAL_STYLES: TileVisualStyle[] = [
  "floor",
  "water",
  "rock",
  "mountain",
  "fence",
];

export interface TileVisual {
  style: TileVisualStyle;
  color?: number;
  // The other parity shade for "floor", the rails for "fence".
  colorAlt?: number;
  y?: number;
}

// What the built-in table declares. A stored row carries owners and labels on
// top of this.
interface TileClassSeed {
  value: number;
  walkable: boolean;
  layer: string;
  // Missing means the tile is drawn by a pass of its own rather than by the
  // generic dispatcher: plain ground is the base floor, and spruce_thicket,
  // pine_tree and house each have their own pass with behaviour the recipes
  // cannot express.
  visual?: TileVisual;
}

export interface TileClassRecord extends TileClassSeed {
  id: string;
  ownerIds: string[];
  labels: ClassLabels;
}

const DEFAULT_TILE_CLASSES: Record<string, TileClassSeed> = {
  ground: { value: 0, walkable: true, layer: TILE_LAYER_TERRAIN },
  spruce_thicket: {
    value: 1,
    walkable: false,
    layer: TILE_LAYER_TERRAIN,
  },
  pine_tree: { value: 2, walkable: false, layer: TILE_LAYER_OBJECT },
  house: { value: 3, walkable: false, layer: TILE_LAYER_OBJECT },
  ocean: {
    value: 4,
    walkable: false,
    layer: TILE_LAYER_TERRAIN,
    visual: { style: "water", color: 0x2f6fa3, y: -0.055 },
  },
  lake: {
    value: 5,
    walkable: false,
    layer: TILE_LAYER_TERRAIN,
    visual: { style: "water", color: 0x4f91c9, y: -0.05 },
  },
  river: {
    value: 6,
    walkable: false,
    layer: TILE_LAYER_TERRAIN,
    visual: { style: "water", color: 0x62b9d9, y: -0.045 },
  },
  rock: {
    value: 7,
    walkable: false,
    layer: TILE_LAYER_TERRAIN,
    visual: { style: "rock", color: 0x7f8892 },
  },
  mountain: {
    value: 8,
    walkable: false,
    layer: TILE_LAYER_TERRAIN,
    visual: { style: "mountain", color: 0x8a8178 },
  },
  sand: {
    value: 9,
    walkable: true,
    layer: TILE_LAYER_TERRAIN,
    visual: { style: "floor", color: 0xd7c182, colorAlt: 0xcbb170 },
  },
  cave_floor: {
    value: 10,
    walkable: true,
    layer: TILE_LAYER_TERRAIN,
    visual: { style: "floor", color: 0x6a6b72, colorAlt: 0x5a5c63 },
  },
  wood_floor: {
    value: 11,
    walkable: true,
    layer: TILE_LAYER_TERRAIN,
    visual: { style: "floor", color: 0x9b6c3f, colorAlt: 0x835730 },
  },
  stick_fence: {
    value: 12,
    walkable: false,
    layer: TILE_LAYER_TERRAIN,
    visual: { style: "fence", color: 0x8a6239, colorAlt: 0x9c7444 },
  },
  bridge: {
    value: 13,
    walkable: true,
    layer: TILE_LAYER_TERRAIN,
    visual: { style: "floor", color: 0xb08a55, colorAlt: 0x9a7447, y: 0.03 },
  },
};

let _tileClassCache: Record<string, TileClassRecord> | null = null;
// value -> id, rebuilt with the cache: worldTileNameForValue runs per tile per
// walkability check, which is per step and per NPC per tick.
let _tileNameByValue: Record<number, string> = {};
// Values already looked up and not found. An instance that booted before a
// class was created has a stale cache, so a miss refreshes once — but only
// once per value, or a tile painted by a since-deleted class would hit the
// database on every walkability check.
let _missedTileValues: Record<number, boolean> = {};
let _missedTileNames: Record<string, boolean> = {};

function tileClassFromDbRow(row: any): TileClassRecord {
  let visual: TileVisual | undefined;
  try {
    const parsed = JSON.parse(row.visual_json || "null");
    if (parsed && typeof parsed === "object" && parsed.style) {
      visual = parsed as TileVisual;
    }
  } catch (e) {
    visual = undefined;
  }
  return {
    id: String(row.class_id || ""),
    value: Math.floor(Number(row.tile_value) || 0),
    walkable: row.walkable === 1 || row.walkable === true,
    layer: String(row.layer || TILE_LAYER_TERRAIN),
    visual: visual,
    ownerIds: (function () {
      try {
        const parsed = JSON.parse(row.owner_ids_json || "[]");
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch (e) {
        return [];
      }
    })(),
    labels: normalizeClassLabels(row.labels_json),
  };
}

function tileClassToDbRow(record: TileClassRecord, now: number) {
  const storedTs = Math.floor(now / 1000);
  return {
    class_id: record.id,
    tile_value: Math.floor(Number(record.value) || 0),
    walkable: record.walkable ? 1 : 0,
    layer: String(record.layer || TILE_LAYER_TERRAIN),
    visual_json: record.visual ? JSON.stringify(record.visual) : "",
    owner_ids_json: JSON.stringify(record.ownerIds || []),
    labels_json: JSON.stringify(normalizeClassLabels(record.labels)),
    created_at: storedTs,
    updated_at: storedTs,
  };
}

function builtInTileClass(classId: string): TileClassRecord | null {
  const seed = DEFAULT_TILE_CLASSES[String(classId || "")];
  if (!seed) return null;
  return {
    id: classId,
    value: seed.value,
    walkable: seed.walkable,
    layer: seed.layer,
    visual: seed.visual ? Object.assign({}, seed.visual) : undefined,
    ownerIds: [],
    labels: {},
  };
}

export function bootstrapTileClasses(): void {
  const rows = loadAllTileClassRows();
  const cache: Record<string, TileClassRecord> = {};
  const now = Date.now();
  for (let i = 0; i < rows.length; i++) {
    const record = tileClassFromDbRow(rows[i]);
    if (record.id) cache[record.id] = record;
  }

  // A built-in nobody owns is resynced to the code definition, so a changed
  // colour or a new field reaches rows seeded by an older deploy. A row an
  // admin has taken ownership of is theirs — the rule every other class
  // repository uses.
  const ids = Object.keys(DEFAULT_TILE_CLASSES);
  let written = 0;
  for (let i = 0; i < ids.length; i++) {
    const existing = cache[ids[i]];
    if (
      existing &&
      Array.isArray(existing.ownerIds) &&
      existing.ownerIds.length > 0
    ) {
      continue;
    }
    const record = builtInTileClass(ids[i]);
    if (!record) continue;
    upsertTileClassRow(tileClassToDbRow(record, now));
    cache[record.id] = record;
    written++;
  }
  if (written > 0) {
    vwLog("tile class repository seeded", { count: written });
  }
  _tileClassCache = cache;
  _tileNameByValue = {};
  Object.keys(cache).forEach(function (id) {
    _tileNameByValue[cache[id].value] = id;
  });
  _missedTileValues = {};
  _missedTileNames = {};
}

export function refreshTileClassCache(): void {
  bootstrapTileClasses();
}

export function getAllTileClasses(): TileClassRecord[] {
  if (!_tileClassCache) refreshTileClassCache();
  const cache = _tileClassCache || {};
  return Object.keys(cache).map(function (id) {
    return cache[id];
  });
}

export function getTileClass(classId: string): TileClassRecord | null {
  if (!_tileClassCache) refreshTileClassCache();
  const id = String(classId || "");
  const hit = (_tileClassCache || {})[id];
  if (hit) return hit;
  // A class another instance created after this one built its cache. Same
  // cache-miss-tolerant retry the other class repositories do, bounded so an
  // id that genuinely does not exist is only paid for once.
  if (_missedTileNames[id]) return null;
  _missedTileNames[id] = true;
  refreshTileClassCache();
  return (_tileClassCache || {})[id] || null;
}

// The registry keyed by id, in the shape the client and the rest of the server
// read (`{ value, walkable, layer, visual }` per tile id).
export function getTileDefs(): Record<string, TileClassSeed> {
  const out: Record<string, TileClassSeed> = {};
  getAllTileClasses().forEach(function (cls) {
    out[cls.id] = {
      value: cls.value,
      walkable: cls.walkable,
      layer: cls.layer,
      visual: cls.visual,
    };
  });
  return out;
}

const FALLBACK_TILE: TileClassSeed = {
  value: 0,
  walkable: true,
  layer: TILE_LAYER_TERRAIN,
};

export function getWorldTileDef(tileName: string): TileClassSeed {
  const cls = getTileClass(String(tileName || ""));
  if (!cls) return FALLBACK_TILE;
  return {
    value: cls.value,
    walkable: cls.walkable,
    layer: cls.layer,
    visual: cls.visual,
  };
}

export function worldTileNameForValue(tileValue: number): string {
  if (!_tileClassCache) refreshTileClassCache();
  const wanted = Number(tileValue);
  const hit = _tileNameByValue[wanted];
  if (hit) return hit;
  if (!_missedTileValues[wanted]) {
    _missedTileValues[wanted] = true;
    refreshTileClassCache();
    const retry = _tileNameByValue[wanted];
    if (retry) return retry;
  }
  return "ground";
}

export function worldTileValueForName(tileName: string): number {
  return getWorldTileDef(tileName).value;
}

export function isWorldTileWalkable(tileValue: number): boolean {
  return !!getWorldTileDef(worldTileNameForValue(tileValue)).walkable;
}

/** The lowest tile value not already taken, for a newly created class. */
export function nextFreeTileValue(): number {
  const used: Record<number, boolean> = {};
  getAllTileClasses().forEach(function (cls) {
    used[cls.value] = true;
  });
  let value = 0;
  while (used[value]) value++;
  return value;
}

export function upsertTileClass(record: TileClassRecord): {
  ok: boolean;
  error?: string;
} {
  // A duplicate value would make two tile ids indistinguishable in a map
  // array, so the second one would silently render and behave as the first.
  const clash = getAllTileClasses().find(function (cls) {
    return cls.value === record.value && cls.id !== record.id;
  });
  if (clash) {
    return {
      ok: false,
      error: "tile value " + record.value + " is taken by " + clash.id,
    };
  }
  const result = upsertTileClassRow(tileClassToDbRow(record, Date.now()));
  if (result && result.error) {
    return { ok: false, error: String(result.error) };
  }
  refreshTileClassCache();
  return { ok: true };
}

export function deleteTileClass(classId: string): void {
  deleteTileClassRow(classId);
  refreshTileClassCache();
}

export function isBuiltinTileClassId(classId: string): boolean {
  return !!DEFAULT_TILE_CLASSES[String(classId || "")];
}
