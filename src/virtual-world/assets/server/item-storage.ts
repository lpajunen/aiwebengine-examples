import {
  getItemClass,
  getItemStateTemplate,
  normalizeItemState,
  stripClassOwnedItemState,
} from "./item-registry.ts";
import {
  createWorldOfType,
  getEffectiveMap,
  getWorldClassForWorld,
  getWorldInfo,
  resolvePortalDestinationWorldType,
} from "./world-bootstrap.ts";
import { loadWorldHouses, saveWorldHouses } from "./world-mod-storage.ts";
import { getWorldClassWithRefresh } from "./world-class-storage.ts";
import {
  deleteWorldPlacementInstances,
  loadWorldPlacementInstances,
  saveWorldPlacementInstance,
  SOURCE_WORLD_LINK_ID,
} from "./world-placement-instances.ts";
import { WorldClassPlacement } from "./world-placements.ts";
import {
  VWORLD_PLAYER_INVENTORY_TABLE,
  VWORLD_WORLD_ITEM_META_TABLE,
  VWORLD_WORLD_ITEM_TABLE,
} from "./runtime-config.ts";
import {
  createEmptyLivingState,
  isValidItem,
  isWorldTileWalkable,
  LivingState,
  normalizeLivingState,
  normalizeWorldType,
  stripClassOwnedLivingState,
  toStoredWorldTimestamp,
  fromStoredWorldTimestamp,
} from "./world-domain.ts";
import {
  getDefaultPlayerLivingClassId,
  getLivingClass,
} from "./living-registry.ts";
import {
  deleteWorldRowsWhere,
  querySingleWorldRow,
  queryWorldRows,
  runInWorldTransaction,
  upsertWorldRow,
} from "./world-db.ts";
import { ensureWorldItemSchema } from "./schema-setup.ts";

// init()'s full schema migration can time out before finishing the world-item
// table (see ensureWorldItemSchema) — self-heal on first write per process,
// the same pattern follow/fight storage use, so the destination_row/col
// columns that upsertWorldItem writes always exist.
let itemSchemaEnsured = false;
function ensureItemSchema(): void {
  if (itemSchemaEnsured) return;
  ensureWorldItemSchema();
  itemSchemaEnsured = true;
}

export function loadPlayerInventory(userId: string): LivingState {
  const normalizeRawToLiving = function (raw: unknown, classId: string) {
    const livingClass = getLivingClass(classId);
    if (!livingClass) {
      return createEmptyLivingState(classId);
    }
    return normalizeLivingState(raw, livingClass);
  };

  const row = querySingleWorldRow(
    VWORLD_PLAYER_INVENTORY_TABLE,
    JSON.stringify({ user_id: String(userId) }),
  );
  if (row) {
    const classId =
      typeof row.living_class_id === "string" && row.living_class_id
        ? String(row.living_class_id)
        : getDefaultPlayerLivingClassId();
    try {
      return normalizeRawToLiving(
        {
          class_id: classId,
          slots: row.slots_json ? JSON.parse(row.slots_json) : {},
          bag: row.bag_json ? JSON.parse(row.bag_json) : [],
          values: row.values_json ? JSON.parse(row.values_json) : {},
        },
        classId,
      );
    } catch (e) {
      return normalizeRawToLiving({}, classId);
    }
  }
  return normalizeRawToLiving({}, getDefaultPlayerLivingClassId());
}

export function savePlayerInventory(userId: string, inventory: unknown): void {
  const incoming =
    inventory && typeof inventory === "object"
      ? (inventory as Record<string, unknown>)
      : {};
  const classId =
    typeof incoming.class_id === "string" && incoming.class_id
      ? incoming.class_id
      : getDefaultPlayerLivingClassId();
  const livingClass = getLivingClass(classId);
  const normalized = livingClass
    ? normalizeLivingState(incoming, livingClass)
    : createEmptyLivingState(classId);

  // Persist only what the instance owns — class tuning knobs are re-resolved
  // from the living/item class on every load (see stripClassOwnedLivingState).
  const persisted = stripClassOwnedLivingState(normalized);

  upsertWorldRow(VWORLD_PLAYER_INVENTORY_TABLE, ["user_id"], {
    user_id: String(userId),
    living_class_id: String(normalized.class_id || classId),
    slots_json: JSON.stringify(persisted.slots),
    bag_json: JSON.stringify(persisted.bag),
    values_json: JSON.stringify(persisted.values),
    updated_ts: toStoredWorldTimestamp(Date.now()),
  });
}

export function loadWorldItemMeta(worldId: string): {
  next_item_seq: number;
  seeded: number;
  updated_ts: number;
} {
  const row = querySingleWorldRow(
    VWORLD_WORLD_ITEM_META_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
  );
  if (row) {
    return {
      next_item_seq: Number.isFinite(Number(row.next_item_seq))
        ? Number(row.next_item_seq)
        : 0,
      seeded: Number.isFinite(Number(row.seeded)) ? Number(row.seeded) : 0,
      updated_ts: fromStoredWorldTimestamp(row.updated_ts),
    };
  }
  return { next_item_seq: 0, seeded: 0, updated_ts: 0 };
}

export function saveWorldItemMeta(
  worldId: string,
  meta: { next_item_seq: number; seeded: number; updated_ts?: number },
): void {
  upsertWorldRow(VWORLD_WORLD_ITEM_META_TABLE, ["world_id"], {
    world_id: String(worldId),
    next_item_seq: Number.isFinite(Number(meta.next_item_seq))
      ? Number(meta.next_item_seq)
      : 0,
    seeded: Number.isFinite(Number(meta.seeded)) ? Number(meta.seeded) : 0,
    updated_ts: toStoredWorldTimestamp(
      Number.isFinite(Number(meta.updated_ts))
        ? Number(meta.updated_ts)
        : Date.now(),
    ),
  });
}

export function loadWorldItems(worldId: string): Record<string, any[]> {
  const rows = queryWorldRows(
    VWORLD_WORLD_ITEM_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    5000,
    "id",
    "asc",
  );
  if (rows.length > 0) {
    const fromRows: Record<string, any[]> = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.item_id) continue;
      const tileKey = String(row.row) + "_" + String(row.col);
      if (!fromRows[tileKey]) fromRows[tileKey] = [];
      fromRows[tileKey].push({
        id: String(row.item_id),
        type: String(row.type || ""),
        created_at: fromStoredWorldTimestamp(row.created_at),
        destination_world_id:
          typeof row.destination_world_id === "string"
            ? row.destination_world_id
            : undefined,
        destination_world_type: resolvePortalDestinationWorldType({
          destination_world_id:
            typeof row.destination_world_id === "string"
              ? row.destination_world_id
              : undefined,
          destination_world_type:
            typeof row.destination_world_type === "string"
              ? row.destination_world_type
              : undefined,
        }),
        destination_row:
          row.destination_row === null || row.destination_row === undefined
            ? undefined
            : Number(row.destination_row),
        destination_col:
          row.destination_col === null || row.destination_col === undefined
            ? undefined
            : Number(row.destination_col),
        state: normalizeItemState(
          String(row.type || ""),
          (function () {
            if (typeof row.state_json !== "string" || !row.state_json)
              return undefined;
            try {
              return JSON.parse(row.state_json);
            } catch (e) {
              return undefined;
            }
          })(),
        ),
      });
    }
    return fromRows;
  }
  return {};
}

export function saveWorldItems(
  worldId: string,
  items: Record<string, any[]>,
): void {
  ensureItemSchema();
  const normalized: Record<string, any[]> = {};
  if (items && typeof items === "object") {
    Object.keys(items).forEach(function (tileKey) {
      const arr = items[tileKey];
      if (!Array.isArray(arr)) return;
      const filtered = arr.filter(isValidItem);
      if (filtered.length > 0) normalized[tileKey] = filtered;
    });
  }

  Object.keys(normalized).forEach(function (tileKey) {
    const parts = tileKey.split("_");
    const row = Number(parts[0]);
    const col = Number(parts[1]);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;
    normalized[tileKey].forEach(function (item) {
      if (!isValidItem(item)) return;
      upsertWorldRow(VWORLD_WORLD_ITEM_TABLE, ["item_id"], {
        item_id: String(item.id),
        world_id: String(worldId),
        row: row,
        col: col,
        type: String(item.type),
        created_at: toStoredWorldTimestamp(
          Number.isFinite(Number(item.created_at))
            ? Number(item.created_at)
            : Date.now(),
        ),
        destination_world_id:
          typeof item.destination_world_id === "string"
            ? item.destination_world_id
            : null,
        destination_world_type:
          typeof item.destination_world_type === "string"
            ? normalizeWorldType(item.destination_world_type)
            : null,
        state_json: (function () {
          const owned = stripClassOwnedItemState(item.state);
          return owned ? JSON.stringify(owned) : null;
        })(),
      });
    });
  });
}

export function upsertWorldItem(
  worldId: string,
  row: number,
  col: number,
  item: unknown,
): void {
  if (
    !isValidItem(item) ||
    !Number.isFinite(Number(row)) ||
    !Number.isFinite(Number(col))
  ) {
    return;
  }
  ensureItemSchema();
  // The DB layer rejects a null written to an INTEGER column ("integer but
  // expression is of type text"), so destination_row/destination_col — which
  // are only meaningful for portals — must be OMITTED entirely when absent
  // rather than sent as null. (Nullable TEXT columns like destination_world_id
  // accept null fine.) Sending null here was silently failing every non-portal
  // upsertWorldItem write — drops and the oak singleton — while saveWorldItems,
  // which never sends these keys, persisted normally.
  const row_data: Record<string, unknown> = {
    item_id: String(item.id),
    world_id: String(worldId),
    row: Number(row),
    col: Number(col),
    type: String(item.type),
    created_at: toStoredWorldTimestamp(
      Number.isFinite(Number(item.created_at))
        ? Number(item.created_at)
        : Date.now(),
    ),
    destination_world_id:
      typeof item.destination_world_id === "string"
        ? item.destination_world_id
        : null,
    destination_world_type:
      typeof item.destination_world_type === "string"
        ? normalizeWorldType(item.destination_world_type)
        : null,
    state_json: (function () {
      const owned = stripClassOwnedItemState(item.state);
      return owned ? JSON.stringify(owned) : null;
    })(),
  };
  if (Number.isFinite(Number(item.destination_row))) {
    row_data.destination_row = Number(item.destination_row);
  }
  if (Number.isFinite(Number(item.destination_col))) {
    row_data.destination_col = Number(item.destination_col);
  }
  upsertWorldRow(VWORLD_WORLD_ITEM_TABLE, ["item_id"], row_data);
}

/**
 * Delete a world item row; returns true only when this call actually
 * removed the row. Under concurrent pickups exactly one caller gets true —
 * that caller owns the item.
 */
export function deleteWorldItemById(itemId: string): boolean {
  if (!itemId) return false;
  return (
    deleteWorldRowsWhere(
      VWORLD_WORLD_ITEM_TABLE,
      JSON.stringify({ item_id: String(itemId) }),
    ) > 0
  );
}

/**
 * Delete the given items and return the subset this caller actually claimed
 * (rows it deleted). Callers must only grant claimed items to inventories.
 */
export function deleteWorldItems(items: any[]): any[] {
  const claimed: any[] = [];
  if (!Array.isArray(items)) return claimed;
  for (let i = 0; i < items.length; i++) {
    if (!items[i] || typeof items[i].id !== "string") continue;
    if (deleteWorldItemById(String(items[i].id))) {
      claimed.push(items[i]);
    }
  }
  return claimed;
}

export function nextWorldItemId(worldId: string): number {
  const meta = loadWorldItemMeta(worldId);
  const nextSeq = Number(meta.next_item_seq || 0) + 1;
  saveWorldItemMeta(worldId, {
    next_item_seq: nextSeq,
    seeded: meta.seeded,
    updated_ts: Date.now(),
  });
  return nextSeq;
}

// Shared by any action with a `produces` effect (e.g. craft_kantele) —
// creates the listed items and adds them to the user's bag.
export function spawnItemsForUser(
  worldId: string,
  userId: string,
  inv: LivingState,
  produces: Array<{ itemId: string; count: number }>,
): any[] {
  const createdItems: any[] = [];
  for (let i = 0; i < produces.length; i++) {
    const entry = produces[i];
    for (let count = 0; count < Number(entry.count || 0); count++) {
      const newItem = {
        id: "w" + worldId + "_i" + nextWorldItemId(worldId),
        type: entry.itemId,
        created_at: Date.now(),
        crafted_by: userId,
        state: getItemStateTemplate(entry.itemId),
      };
      inv.bag.push(newItem);
      createdItems.push(newItem);
    }
  }
  return createdItems;
}

// Shared by any action with a `produces` effect entry configured with
// placement: "target_tile" (e.g. place_blessing) — creates the listed items
// for the caller to add to the target tile's world-items entry, instead of
// the actor's bag. non_droppable is copied from the item's class here
// because pick/drop (see item-action-helpers.ts) checks that flag on the
// item instance, not the class.
export function spawnItemsOnTile(
  worldId: string,
  userId: string,
  produces: Array<{ itemId: string; count: number }>,
): any[] {
  const createdItems: any[] = [];
  for (let i = 0; i < produces.length; i++) {
    const entry = produces[i];
    const itemClass = getItemClass(entry.itemId);
    for (let count = 0; count < Number(entry.count || 0); count++) {
      const newItem: Record<string, unknown> = {
        id: "w" + worldId + "_i" + nextWorldItemId(worldId),
        type: entry.itemId,
        created_at: Date.now(),
        placed_by: userId,
        state: getItemStateTemplate(entry.itemId),
      };
      if (itemClass && itemClass.nonDroppable) newItem.non_droppable = true;
      createdItems.push(newItem);
    }
  }
  return createdItems;
}

// Ensures exactly one world item matching `matchFn` exists in `worldId`, sitting
// at (row,col). Self-heals duplicates (keeps the lowest/oldest id, deletes the
// rest) the way the old hard-coded oak seeding did, but matches on
// a predicate rather than a bare type so a fixture (e.g. a tagged guild door)
// can coexist with player-built items of the same type without clobbering them.
// A matching item already on the target tile is left untouched, preserving any
// state a player has toggled on it (e.g. a closed door).
function ensureSingletonWorldItem(
  worldId: string,
  row: number,
  col: number,
  matchFn: (item: any) => boolean,
  buildItem: () => Record<string, unknown>,
): string {
  const items = loadWorldItems(worldId);
  const found: Array<{ item: any; tileKey: string }> = [];
  for (const tileKey of Object.keys(items)) {
    for (const item of items[tileKey]) {
      if (item && matchFn(item)) found.push({ item, tileKey });
    }
  }
  found.sort(function (a, b) {
    return String(a.item.id).localeCompare(String(b.item.id));
  });
  const canonical = found.length > 0 ? found[0] : null;
  for (let i = 1; i < found.length; i++) {
    deleteWorldItemById(String(found[i].item.id));
  }

  const targetTileKey = row + "_" + col;
  if (canonical && canonical.tileKey === targetTileKey) {
    return String(canonical.item.id);
  }

  const base = buildItem();
  const itemId = canonical
    ? String(canonical.item.id)
    : "w" + worldId + "_i" + nextWorldItemId(worldId);
  upsertWorldItem(
    worldId,
    row,
    col,
    Object.assign({ id: itemId, created_at: Date.now() }, base),
  );
  return itemId;
}

// Materializes a world class's authored placements into one world — the
// data-driven replacement for the old ensureOldOakItem / ensureGuildRoomItems /
// ensureVillageGuildEntrance trio, which hard-coded Birdhaven's and the guild's
// contents behind world-ID checks.
//
// Idempotent by (world_id, placement_id): the instance row records which item
// or tile a placement created, so re-running adopts that object instead of
// creating a second one. NPC placements are materialized in npc-storage.ts (it
// owns NPC rows, and importing it here would close a cycle); terrain
// placements need no instance, since world-reservations.ts paints them onto
// the effective map.
export function materializeWorldPlacements(worldId: string): void {
  const worldClass = getWorldClassForWorld(worldId);
  const placements =
    worldClass && Array.isArray(worldClass.placements)
      ? worldClass.placements
      : [];
  if (placements.length === 0) return;
  const revision = worldClass ? Number(worldClass.placementRevision || 0) : 0;
  const instances = loadWorldPlacementInstances(worldId);

  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    if (!placement || !placement.position) continue;
    const row = Number(placement.position.row);
    const col = Number(placement.position.col);
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue;
    const existing = instances[placement.id];

    if (placement.kind === "structure") {
      materializeStructurePlacement(worldId, placement, row, col, revision);
      continue;
    }
    if (
      placement.kind !== "item" &&
      placement.kind !== "fixture" &&
      placement.kind !== "portal"
    ) {
      continue;
    }

    const recordedItemId =
      existing && existing.data ? String(existing.data.itemId || "") : "";
    // The fixture tag distinguishes an authored door from a player-built one
    // of the same class, so adoption cannot swallow player property.
    const fixtureTag =
      placement.state && typeof placement.state.fixture === "string"
        ? String(placement.state.fixture)
        : "";
    const itemId = ensureSingletonWorldItem(
      worldId,
      row,
      col,
      function (item) {
        if (!item) return false;
        // Once an instance exists the match is exact; before that (a world
        // seeded by the old hard-coded path, or a fresh reseed) fall back to
        // class + fixture tag so the existing object is adopted rather than
        // duplicated.
        if (recordedItemId) return String(item.id) === recordedItemId;
        if (String(item.type || "") !== String(placement.classId)) return false;
        if (!fixtureTag) return true;
        return !!item.state && item.state.fixture === fixtureTag;
      },
      function () {
        return buildPlacementItem(worldId, placement);
      },
    );

    saveWorldPlacementInstance({
      worldId: String(worldId),
      placementId: String(placement.id),
      placementKind: String(placement.kind),
      classId: String(placement.classId),
      revision: revision,
      data: { itemId: itemId },
    });
  }
}

// Resolves a portal placement's linked destination to a concrete world and
// entry tile. Reuses the same world-from-class creation the player-facing
// portal_builder performs (see tree-action-helpers.ts); the difference is that
// this must be stable — one destination world per (source world, placement),
// recorded on the instance, rather than a fresh world per use.
function resolvePlacementDestination(
  worldId: string,
  placement: WorldClassPlacement,
): { worldId: string; row?: number; col?: number } | null {
  const raw = placement.state && placement.state.destination;
  if (!raw || typeof raw !== "object") return null;
  const destination = raw as Record<string, unknown>;
  const mode = String(destination.mode || "");

  // A return door leads back to whichever world linked here, recorded by that
  // world when it created this one. Deliberately no row/col: the exterior's
  // portal tile is usually a wall the traveller cannot stand on, so the
  // traveller lands on the source world's default spawn instead of risking a
  // blocked tile. Without a recorded link there is nothing to resolve, and
  // door_travel's own fallback applies.
  if (mode === "source_world") {
    const link = loadWorldPlacementInstances(worldId)[SOURCE_WORLD_LINK_ID];
    const sourceWorldId =
      link && link.data ? String(link.data.sourceWorldId || "") : "";
    return sourceWorldId ? { worldId: sourceWorldId } : null;
  }

  const entryPlacementId = String(destination.entryPlacementId || "");

  if (mode === "existing_world") {
    const targetWorldId = String(destination.worldId || "");
    if (!targetWorldId) return null;
    const entry = resolveEntryTile(targetWorldId, entryPlacementId);
    return { worldId: targetWorldId, row: entry.row, col: entry.col };
  }

  if (mode !== "ensure_world_class") return null;
  const destinationClassId = String(destination.worldClassId || "");
  if (!destinationClassId) return null;

  // Stable per (source world, placement): reuse the world recorded on this
  // placement's instance, and only create one the first time.
  const instances = loadWorldPlacementInstances(worldId);
  const existing = instances[String(placement.id)];
  let targetWorldId =
    existing && existing.data
      ? String(existing.data.destinationWorldId || "")
      : "";
  if (!targetWorldId) {
    const destinationClass = getWorldClassWithRefresh(destinationClassId);
    if (!destinationClass) return null;
    const created = createWorldOfType(
      destinationClass.baseType,
      { rows: destinationClass.rows, cols: destinationClass.cols },
      destinationClassId,
    );
    targetWorldId = created.world_id;
    // Back-link, so the new world's return doors know where they lead.
    saveWorldPlacementInstance({
      worldId: targetWorldId,
      placementId: SOURCE_WORLD_LINK_ID,
      placementKind: "link",
      classId: "",
      revision: 0,
      data: { sourceWorldId: String(worldId) },
    });
    saveWorldPlacementInstance({
      worldId: String(worldId),
      placementId: String(placement.id),
      placementKind: String(placement.kind),
      classId: String(placement.classId),
      revision: 0,
      data: Object.assign({}, existing ? existing.data : {}, {
        destinationWorldId: targetWorldId,
      }),
    });
  }
  const entry = resolveEntryTile(targetWorldId, entryPlacementId);
  return { worldId: targetWorldId, row: entry.row, col: entry.col };
}

// Where a traveller lands in the destination world: the tile of the named
// entry placement in that world's class, or (1,1) — the convention the
// player-facing portal builder already uses — when none is named.
function resolveEntryTile(
  destinationWorldId: string,
  entryPlacementId: string,
): { row: number; col: number } {
  if (entryPlacementId) {
    const destinationClass = getWorldClassForWorld(destinationWorldId);
    const placements =
      destinationClass && Array.isArray(destinationClass.placements)
        ? destinationClass.placements
        : [];
    for (let i = 0; i < placements.length; i++) {
      const candidate = placements[i];
      if (candidate && String(candidate.id) === entryPlacementId) {
        return {
          row: Number(candidate.position.row),
          col: Number(candidate.position.col),
        };
      }
    }
  }
  return { row: 1, col: 1 };
}

// Builds the world item an item/fixture/portal placement stands for. State
// goes through the item class's owned-state rules, so a placement cannot smuggle
// in keys the class does not own.
function buildPlacementItem(
  worldId: string,
  placement: WorldClassPlacement,
): Record<string, unknown> {
  const itemClass = getItemClass(String(placement.classId));
  const state = Object.assign(
    {},
    getItemStateTemplate(String(placement.classId)),
  );
  const rawState = placement.state || {};
  for (const key of Object.keys(rawState)) {
    // `destination` is placement wiring, not item state — resolved below.
    if (key === "destination") continue;
    state[key] = rawState[key] as any;
  }

  const item: Record<string, unknown> = {
    type: String(placement.classId),
    state: normalizeItemState(String(placement.classId), state),
  };
  // Authored fixtures are part of the world, not loot: without this a player
  // could pick the old oak up and walk off with it.
  if (!itemClass || itemClass.nonDroppable !== false) {
    item.non_droppable = true;
  }

  const destination = resolvePlacementDestination(worldId, placement);
  if (destination) {
    item.destination_world_id = destination.worldId;
    if (destination.row !== undefined && destination.col !== undefined) {
      item.destination_row = destination.row;
      item.destination_col = destination.col;
    }
  }
  return item;
}

// Writes the object-layer world mod a structure placement stands for. Only the
// house layer exists today, so a structure naming any other tile records its
// instance without a mod rather than failing the whole materialization.
function materializeStructurePlacement(
  worldId: string,
  placement: WorldClassPlacement,
  row: number,
  col: number,
  revision: number,
): void {
  const tileKey = row + "_" + col;
  if (String(placement.classId) === "house") {
    const houses = loadWorldHouses(worldId);
    if (!houses[tileKey]) {
      houses[tileKey] = {
        built_by: undefined,
        actor_type: undefined,
        timestamp: Date.now(),
      };
      saveWorldHouses(worldId, houses);
    }
  }
  saveWorldPlacementInstance({
    worldId: String(worldId),
    placementId: String(placement.id),
    placementKind: String(placement.kind),
    classId: String(placement.classId),
    revision: revision,
    data: { tileKey: tileKey },
  });
}

// Finds a random walkable+empty tile and places one instance of itemType
// there, mutating `items` (tileKey -> item[]) in place. Shared by the initial
// world seed loop and the respawn-timer single-item spawn.
function placeItemAtRandomTile(
  worldId: string,
  map: number[][],
  items: Record<string, any[]>,
  itemType: string,
): { id: string; type: string; row: number; col: number } | null {
  const mapRows = map.length;
  const mapCols = map[0] ? map[0].length : 0;
  let attempts = 0;
  while (attempts < 1000) {
    attempts++;
    const row = 1 + Math.floor(Math.random() * (mapRows - 2));
    const col = 1 + Math.floor(Math.random() * (mapCols - 2));
    // Any walkable floor is a valid drop spot — checking the tile's
    // walkability (not a hardcoded ground==0) lets non-forest worlds whose
    // floor is sand/cave_floor/wood_floor/bridge seed items too, instead of
    // spinning all 1000 attempts and placing nothing.
    if (!isWorldTileWalkable(map[row][col])) continue;
    const tileKey = row + "_" + col;
    if (!items[tileKey]) items[tileKey] = [];
    const newItem = {
      id: "w" + worldId + "_i" + nextWorldItemId(worldId),
      type: itemType,
      created_at: Date.now(),
      state: getItemStateTemplate(itemType),
    };
    items[tileKey].push(newItem);
    return { id: newItem.id, type: newItem.type, row: row, col: col };
  }
  return null;
}

// Bump when the built-in item spawn manifest changes, or to force a one-time
// reseed after a broken/partial seed. A world whose stored marker is older
// than this reseeds once on next load. Persisted in the world-item meta's
// `seeded` field, which used to be a 0/1 flag — so version 1 is exactly the
// old "already seeded" state, and any pre-existing world reseeds once here.
export const WORLD_ITEM_SEED_VERSION = 4;

export function ensureWorldItems(worldId: string): void {
  // Self-heal authored placements on every call (a no-op for a world whose
  // class declares none), so landmarks appear on already-seeded worlds without
  // needing a seed-version bump.
  materializeWorldPlacements(worldId);

  const meta = loadWorldItemMeta(worldId);
  if (meta.seeded === WORLD_ITEM_SEED_VERSION) return;

  // Reseed inside a transaction: this path can run from a GET handler
  // (listItemsForUser, page load) that isn't already transactional, and the
  // deploy runtime restarts between requests, so an unwrapped batch of
  // upserts can be partially discarded — leaving a world with a handful of
  // items and no oak. runInWorldTransaction commits them atomically (and
  // nests as a savepoint when a POST caller already opened a transaction).
  runInWorldTransaction("seed_world_items", function () {
    // Clear existing world items first so the reseed replaces the manifest
    // rather than stacking a second copy (and drops items stranded off-map by
    // a world that shrank), then restore the oak singleton the wipe removed.
    deleteWorldRowsWhere(
      VWORLD_WORLD_ITEM_TABLE,
      JSON.stringify({ world_id: String(worldId) }),
    );
    // The wipe above deleted the items the placement instances point at, so
    // those rows are dangling: drop them or materialization would consider its
    // work done and skip re-creating the landmarks that just vanished.
    deleteWorldPlacementInstances(worldId);
    materializeWorldPlacements(worldId);

    const worldClass = getWorldClassForWorld(worldId);
    const itemSpawns = worldClass ? worldClass.itemSpawns : [];
    const map = getEffectiveMap(worldId);
    const items = loadWorldItems(worldId);
    for (let i = 0; i < itemSpawns.length; i++) {
      const entry = itemSpawns[i];
      if (!getItemClass(entry.id)) continue;
      for (let count = 0; count < entry.count; count++) {
        placeItemAtRandomTile(worldId, map, items, entry.id);
      }
    }

    saveWorldItems(worldId, items);
    saveWorldItemMeta(worldId, {
      next_item_seq: loadWorldItemMeta(worldId).next_item_seq,
      seeded: WORLD_ITEM_SEED_VERSION,
      updated_ts: Date.now(),
    });
  });
}

// Spawns a single replacement instance of itemType into worldId at a random
// walkable empty tile — used by spawn-timers.ts when a manifest-tracked
// item's respawn timer comes due. Returns the placed item (with position) or
// null if no empty tile could be found.
export function spawnSingleWorldItem(
  worldId: string,
  itemType: string,
): { id: string; type: string; row: number; col: number } | null {
  const map = getEffectiveMap(worldId);
  const items = loadWorldItems(worldId);
  const placed = placeItemAtRandomTile(worldId, map, items, itemType);
  if (!placed) return null;
  saveWorldItems(worldId, items);
  return placed;
}

export function flattenWorldItems(itemsByTile: Record<string, any[]>): Array<{
  id: string;
  type: string;
  row: number;
  col: number;
  destination_world_id?: string;
  destination_world_type?: string;
  state?: Record<string, unknown>;
}> {
  const out: Array<{
    id: string;
    type: string;
    row: number;
    col: number;
    destination_world_id?: string;
    destination_world_type?: string;
    state?: Record<string, unknown>;
  }> = [];
  if (!itemsByTile || typeof itemsByTile !== "object") return out;
  Object.keys(itemsByTile).forEach(function (tileKey) {
    const parts = tileKey.split("_");
    const row = Number(parts[0]);
    const col = Number(parts[1]);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;
    const arr = itemsByTile[tileKey];
    if (!Array.isArray(arr)) return;
    arr.forEach(function (item) {
      if (!isValidItem(item)) return;
      out.push({
        id: item.id,
        type: item.type,
        row: row,
        col: col,
        destination_world_id:
          typeof item.destination_world_id === "string"
            ? item.destination_world_id
            : undefined,
        destination_world_type: resolvePortalDestinationWorldType(item),
        state: item.state,
      });
    });
  });
  return out;
}
