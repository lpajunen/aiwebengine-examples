import {
  getItemClass,
  getItemStateTemplate,
  normalizeItemState,
  stripClassOwnedItemState,
} from "./item-registry.ts";
import {
  getEffectiveMap,
  getWorldClassForWorld,
  getWorldInfo,
  resolvePortalDestinationWorldType,
  saveWorldType,
} from "./world-bootstrap.ts";
import { loadWorldHouses, saveWorldHouses } from "./world-mod-storage.ts";
import {
  adventurersGuildWorldClassRecord,
  getWorldClassWithRefresh,
  upsertWorldClass,
} from "./world-class-storage.ts";
import {
  VWORLD_PLAYER_INVENTORY_TABLE,
  VWORLD_WORLD_ITEM_META_TABLE,
  VWORLD_WORLD_ITEM_TABLE,
} from "./runtime-config.ts";
import {
  createEmptyLivingState,
  GUILD_CENTER_COL,
  GUILD_CENTER_ROW,
  GUILD_SPAWN_COL,
  GUILD_SPAWN_ROW,
  GUILD_WORLD_CLASS_ID,
  GUILD_WORLD_COLS,
  GUILD_WORLD_ID,
  GUILD_WORLD_ROWS,
  isGuildWorld,
  isOakWorld,
  isValidItem,
  isWorldTileWalkable,
  OAK_CENTER_COL,
  OAK_CENTER_ROW,
  OAK_WORLD_ID,
  LivingState,
  normalizeLivingState,
  normalizeWorldType,
  stripClassOwnedLivingState,
  toStoredWorldTimestamp,
  fromStoredWorldTimestamp,
  VILLAGE_GUILD_APPROACH_COL,
  VILLAGE_GUILD_APPROACH_ROW,
  VILLAGE_GUILD_DOOR_COL,
  VILLAGE_GUILD_DOOR_ROW,
  WORLD_TYPE_BUILDING,
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

export function ensureOldOakItem(worldId: string): void {
  if (!isOakWorld(worldId)) return;
  const items = loadWorldItems(worldId);
  const found: Array<{ item: any; tileKey: string }> = [];
  for (const tileKey of Object.keys(items)) {
    for (const item of items[tileKey]) {
      if (item && item.type === "old_oak") found.push({ item, tileKey });
    }
  }

  // Self-heal: concurrent requests racing to seed the singleton oak on a
  // fresh world can each insert their own copy; keep the lowest id (oldest)
  // and delete any others so exactly one old_oak item ever survives.
  found.sort(function (a, b) {
    return String(a.item.id).localeCompare(String(b.item.id));
  });
  const canonical = found.length > 0 ? found[0] : null;
  for (let i = 1; i < found.length; i++) {
    deleteWorldItemById(String(found[i].item.id));
  }

  const centerTileKey = OAK_CENTER_ROW + "_" + OAK_CENTER_COL;
  if (canonical && canonical.tileKey === centerTileKey) return;

  upsertWorldItem(worldId, OAK_CENTER_ROW, OAK_CENTER_COL, {
    id: canonical
      ? canonical.item.id
      : "w" + worldId + "_i" + nextWorldItemId(worldId),
    type: "old_oak",
    created_at: Date.now(),
    non_droppable: true,
  });
}

// Ensures exactly one world item matching `matchFn` exists in `worldId`, sitting
// at (row,col). Self-heals duplicates (keeps the lowest/oldest id, deletes the
// rest) the same way ensureOldOakItem does for the oak singleton, but matches on
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
): void {
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
  if (canonical && canonical.tileKey === targetTileKey) return;

  const base = buildItem();
  upsertWorldItem(
    worldId,
    row,
    col,
    Object.assign(
      {
        id: canonical
          ? canonical.item.id
          : "w" + worldId + "_i" + nextWorldItemId(worldId),
        created_at: Date.now(),
      },
      base,
    ),
  );
}

function isGuildDoorFixture(item: any, fixture: string): boolean {
  return (
    !!item &&
    item.type === "door" &&
    !!item.state &&
    item.state.fixture === fixture
  );
}

// Seeds the Adventurer's guild room's fixtures: a training post at the centre
// (its advance_level action lets a player spend experience to level up) and a
// return door at the spawn tile leading back to the village clearing. Called
// from ensureWorldItems, so both survive the guild world's periodic reseed.
export function ensureGuildRoomItems(worldId: string): void {
  if (!isGuildWorld(worldId)) return;
  // Guarantee the type/dimension row exists even if the guild is somehow loaded
  // before the village writes it (self-corrects the map on the next load).
  ensureAdventurersGuildWorld();
  ensureSingletonWorldItem(
    worldId,
    GUILD_CENTER_ROW,
    GUILD_CENTER_COL,
    function (item) {
      return item.type === "training_dummy";
    },
    function () {
      return { type: "training_dummy", non_droppable: true };
    },
  );
  ensureSingletonWorldItem(
    worldId,
    GUILD_SPAWN_ROW,
    GUILD_SPAWN_COL,
    function (item) {
      return isGuildDoorFixture(item, "guild_return");
    },
    function () {
      return {
        type: "door",
        state: { open: true, fixture: "guild_return" },
        destination_world_id: OAK_WORLD_ID,
        destination_row: VILLAGE_GUILD_APPROACH_ROW,
        destination_col: VILLAGE_GUILD_APPROACH_COL,
      };
    },
  );
}

// Writes the guild world's class + type/dimensions rows once per process so the
// village door below points at a real building world with empty spawn manifests
// (its room fixtures seed lazily on first entry, via ensureGuildRoomItems inside
// ensureWorldItems).
let guildWorldConfigEnsured = false;
function ensureAdventurersGuildWorld(): void {
  if (guildWorldConfigEnsured) return;
  // A dedicated world class with empty item/NPC spawns keeps the room clean
  // rather than inheriting the busy default building preset. The English name is
  // in fallbackLabel and the Finnish name in the labels map (so the world-type
  // editor's "Name (Finnish)" field shows/round-trips it — that field reads
  // only labels.fi, not the i18n bundle). Re-upsert when either drifts so an
  // already-seeded row self-heals.
  // Same factory the class repository seeds from, so this legacy path and the
  // system-class backfill can never write conflicting records — in particular
  // this one must not drop the guild's placements on the floor.
  const desiredGuildClass = adventurersGuildWorldClassRecord();
  const existingGuildClass = getWorldClassWithRefresh(GUILD_WORLD_CLASS_ID);
  if (
    !existingGuildClass ||
    existingGuildClass.fallbackLabel !== desiredGuildClass.fallbackLabel ||
    !existingGuildClass.labels ||
    existingGuildClass.labels.fi !== desiredGuildClass.labels.fi
  ) {
    upsertWorldClass(desiredGuildClass);
  }
  const info = getWorldInfo(GUILD_WORLD_ID);
  if (
    info.world_type !== WORLD_TYPE_BUILDING ||
    info.rows !== GUILD_WORLD_ROWS ||
    info.cols !== GUILD_WORLD_COLS ||
    info.world_class_id !== GUILD_WORLD_CLASS_ID
  ) {
    saveWorldType(
      GUILD_WORLD_ID,
      WORLD_TYPE_BUILDING,
      { rows: GUILD_WORLD_ROWS, cols: GUILD_WORLD_COLS },
      GUILD_WORLD_CLASS_ID,
    );
  }
  guildWorldConfigEnsured = true;
}

// Seeds the village-side guild entrance: a house wall just south of the oak
// clearing with a door hung on it that leads into the Adventurer's guild.
// Called from ensureWorldItems for the oak world so it self-heals like the oak.
export function ensureVillageGuildEntrance(worldId: string): void {
  if (!isOakWorld(worldId)) return;
  ensureAdventurersGuildWorld();

  // Merge the entrance house into the existing house mods rather than replacing
  // them, so player-built village houses are preserved.
  const doorTileKey = VILLAGE_GUILD_DOOR_ROW + "_" + VILLAGE_GUILD_DOOR_COL;
  const houses = loadWorldHouses(worldId);
  if (!houses[doorTileKey]) {
    houses[doorTileKey] = {
      built_by: undefined,
      actor_type: undefined,
      timestamp: Date.now(),
    };
    saveWorldHouses(worldId, houses);
  }

  ensureSingletonWorldItem(
    worldId,
    VILLAGE_GUILD_DOOR_ROW,
    VILLAGE_GUILD_DOOR_COL,
    function (item) {
      return isGuildDoorFixture(item, "guild_entrance");
    },
    function () {
      return {
        type: "door",
        state: { open: true, fixture: "guild_entrance" },
        destination_world_id: GUILD_WORLD_ID,
        destination_row: GUILD_SPAWN_ROW,
        destination_col: GUILD_SPAWN_COL,
      };
    },
  );
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
  ensureOldOakItem(worldId);
  // Self-heal the reserved-world fixtures every call (each no-ops unless it's
  // the world it belongs to), so the guild room and village entrance appear on
  // already-seeded worlds without needing a seed-version bump — same rationale
  // as the unconditional ensureOldOakItem above.
  ensureGuildRoomItems(worldId);
  ensureVillageGuildEntrance(worldId);

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
    ensureOldOakItem(worldId);
    ensureGuildRoomItems(worldId);
    ensureVillageGuildEntrance(worldId);

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
