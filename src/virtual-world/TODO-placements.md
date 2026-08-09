# Data-Driven World Placements

## Goal

Make Birdhaven and Adventurers' Guild editable entirely through the World
Types editor. A creator making a new world must be able to configure its
dimensions, terrain preset, random population, landmarks, structures,
protected areas, and linked destinations without changing JavaScript or
TypeScript.

Code changes remain acceptable for new engine capabilities, such as a new
terrain generator, interaction primitive, visual recipe, or combat rule. The
goal is specifically that a creator can compose existing capabilities into a
complete world through data.

## Current State

`WorldClassRecord` already stores the properties that describe a repeatable
world class:

- `baseType`, `rows`, and `cols`
- `itemSpawns` for randomly placed, repeatable item population
- `npcSpawns` for randomly placed NPC population
- labels and ownership

Birdhaven and Adventurers' Guild do not fit into those random spawn manifests:

- Birdhaven's old oak has a fixed location and a protected clearing.
- The guild house/door has a fixed location and blocks movement.
- The guild destination is a deliberate linked world, not a random portal.
- The guild world has fixed room fixtures and an entry/return position.

Those facts are currently special-cased through named world IDs and constants
in the world domain/bootstrap path. The result is that the editor can change
Birdhaven's population but cannot fully describe Birdhaven itself.

## Design Decision

Keep random population manifests and add a separate deterministic placement
manifest to a world class. Do not overload `itemSpawns`.

`itemSpawns` and `npcSpawns` answer: "What repeatable population should be
randomly distributed across eligible tiles?"

`placements` answers: "What authored things must exist, where, and what rules
do they impose on this world?"

One placement system should cover landmarks, terrain/object modifications,
structures, fixed fixtures, portals, and fixed NPCs. It should not introduce
separate old-oak and house spawning subsystems.

## Placement Data Model

Extend `WorldClassRecord` with a persisted `placements` field. Start with a
small, explicit schema rather than a generic arbitrary object model.

```ts
type WorldClassPlacement = {
  id: string;
  kind: "item" | "npc" | "terrain" | "structure" | "fixture" | "portal";
  classId: string;
  position: PlacementPosition;
  state?: Record<string, unknown>;
  reservations?: PlacementReservation[];
};

type PlacementPosition =
  | { strategy: "exact"; row: number; col: number }
  | { strategy: "random"; count: number }
  | {
      strategy: "near_placement";
      placementId: string;
      rowOffset: number;
      colOffset: number;
    };

type PlacementReservation = {
  kind: "circle" | "rectangle";
  row?: number;
  col?: number;
  radius?: number;
  rows?: number;
  cols?: number;
  rules: PlacementReservationRule[];
};

// Deliberately an open string set validated against a server-side registry
// rather than a closed union. The oak clearing alone already carries six
// distinct rules today, and adding a seventh must not require a column
// migration. Unknown rules are rejected at save time, not at read time.
type PlacementReservationRule = string;
```

Rules in the initial registry. Every one but the last replaces a hard-coded
check that already exists:

| Rule                    | Replaces                                                                         |
| ----------------------- | -------------------------------------------------------------------------------- |
| `block_plant`           | `oak_clearing` blocked zone on `plant`/`grow_pine_tree`, and the NPC plant check |
| `block_build`           | `oak_clearing` blocked zone on `build_house`                                     |
| `protect_landmark`      | `oak_center` blocked zone on `cut`, and the NPC cut check                        |
| `block_terrain_feature` | `avoidOakClearing` river shift in `world-map.ts`                                 |
| `spawn_area`            | `getOakClearingTiles` in `player-snapshots.ts`                                   |
| `block_random_spawn`    | nothing — see below                                                              |

Two rules from the first draft of this plan did not survive contact with the
code:

- **`block_random_spawn` has no existing implementation.** Random item and NPC
  population does not avoid the oak clearing today; nothing checks it. Making
  population respect reservations is a genuine behavior change, so the rule is
  declared but inert until phase 3.
- **`block_npc_wander` does not exist and was a misreading.** The clearing
  check in `npc-tick-helpers.ts` guards NPC _tree planting_, not NPC movement;
  NPCs walk through the clearing freely. It is `block_plant` applied to an NPC
  actor, not a separate rule.

`protect_landmark` covers the landmark's own tile — distinct from the
reservation area around it, which excludes that tile.

### Why these fields

- `id` is stable, human-authored identity. It permits references between
  placements and makes reruns idempotent.
- `kind` selects existing engine behavior; it is intentionally a closed set
  until a new engine primitive is implemented.
- `classId` references an item, living, terrain, or structure class rather
  than embedding a copy of its properties.
- `position` supports exact coordinates now, with a constrained way to place
  related fixtures such as a door adjacent to a house.
- `state` carries only class-owned instance state, such as a door's initial
  open state or a portal destination reference.
- `reservations` replace named special cases such as `oak_clearing` with data
  owned by the landmark that requires the protected area.

The initial release does not need all position strategies. `exact` is required
for Birdhaven and the guild. Add `near_placement` only when it has a concrete
editor workflow. Continue using `itemSpawns`/`npcSpawns` for random population
instead of adding `random` prematurely.

## World Instance Data

World classes are templates; a placement is instantiated into a particular
world. Persist a placement instance marker with at least:

```ts
type WorldPlacementInstance = {
  worldId: string;
  placementId: string;
  placementKind: WorldClassPlacement["kind"];
  classId: string;
  revision: string;
  data: Record<string, unknown>;
};
```

Use `(world_id, placement_id)` as the unique identity. The bootstrap operation
must be idempotent: loading a world repeatedly must not create another oak,
house, door, or fixed NPC.

For items and NPCs, store the generated item/NPC instance ID in `data`. For
terrain or structures, store the affected object/terrain world-mod keys. This
lets the bootstrap code update or remove only what it owns without deleting
creator- or player-created content.

## Placement Semantics

### Item and fixture placements

Use an item class when the thing is a single-tile interactable object and its
existing class behavior is sufficient. A door can remain item-backed, but is
created by an exact placement rather than the random item manifest.

`state` must be normalized through the existing item-class owned-state rules.
The placement system must not allow arbitrary state keys to bypass class
ownership or action validation.

### NPC placements

Use a fixed NPC placement for named guards, quest NPCs, or scenery animals.
Random `npcSpawns` remain responsible for the ambient population. Fixed NPCs
need a persistent identity and must not be consumed by the generic inactive
world cleanup or respawn policy unless their placement explicitly opts in.

### Terrain and structure placements

Use world mods, not ground items, for anything that changes collision, has a
footprint, or alters terrain. A house therefore belongs to `structure` and
should create object-layer mods that the effective-map calculation already
understands.

The first implementation may limit structures to one tile. Add a `footprint`
field when multi-tile houses or walls are actually needed; do not encode a
multi-tile building as unrelated individual placements.

### Spawn positions

Default spawn resolution is oak-special-cased today:
`player-snapshots.ts:192-239` derives the spawn tile from
`getOakClearingTiles` and falls back to `OAK_CENTER_ROW + 1`. The guild's
`entryPlacementId` is not enough on its own — the _generic_ spawn resolver
must become placement-driven for every world:

1. if the world declares `spawn_area` reservations, pick a free tile inside
   one;
2. otherwise fall back to the existing random-walkable-tile search.

### Client rendering of authored landmarks

The old oak's mesh is selected by coordinate, not by class. `OAK_CENTER_ROW` /
`OAK_CENTER_COL` are injected into browser globals in
`page-bootstrap.ts:207-208,595-596`, declared in
`virtual-world-browser-globals.d.ts:22-23`, and consumed by
`client-world-render.js:124,188` (which draws the giant oak) and
`client-tile-detail.js:345`.

A placement-driven oak therefore requires the renderer to key its built-in
oak recipe off the item class/type carried in the tile payload instead of off
a pair of injected coordinates. This is _not_ covered by the
"no creator-authored mesh recipes" non-goal: the recipe stays built in, only
its selection changes. Once that lands, the two coordinate globals can be
removed from the page state entirely.

### Reservations

Reservations are evaluated as part of the effective world rules:

- plant and build actions reject tiles marked `block_plant` and `block_build`,
  whether the actor is a player or an NPC;
- actions that would destroy a landmark reject its `protect_landmark` tile;
- terrain generation routes linear features around `block_terrain_feature`
  tiles;
- default spawn resolution prefers `spawn_area` tiles when a world declares
  them;
- random item/NPC spawning excludes `block_random_spawn` tiles (phase 3 —
  no such exclusion exists today).

This is the replacement for world-ID checks and the `oak_clearing` /
`oak_center` validation enum. The old oak itself can be protected through its
own reservation rather than through a globally recognized oak-world rule.

Terrain generation is explicitly **not** independent of reservations. The
river generator in `world-map.ts:182-200` currently shifts its column away
from the oak clearing under `avoidOakClearing = isOakWorld(worldId)`. Deleting
that world-ID check without a `block_terrain_feature` rule puts a river
through Birdhaven's clearing. Reservations must therefore be resolvable before
map generation runs, not only after.

Rendering does remain independent: reservations have no client-visible
geometry of their own.

## Linked Worlds

Do not make a placement's destination a literal reserved world ID such as
`"10001"`. A creator needs to be able to clone a world class and configure a
different linked interior.

Add a declarative destination field for portals/doors, for example:

```ts
state: {
  destination: {
    mode: "ensure_world_class" | "existing_world";
    worldClassId?: string;
    worldId?: string;
    entryPlacementId?: string;
  };
}
```

`ensure_world_class` resolves a stable destination world instance for the
source world and placement. It creates that instance from the selected world
class on first use and reuses it later. `entryPlacementId` identifies where a
traveller appears in the destination world.

This makes a Birdhaven-like exterior and its guild interior a reusable
configuration pattern, rather than a pair of system IDs.

### Reuse the existing portal path

Most of this already exists and must not be reimplemented in parallel.
`tree-action-helpers.ts:2340-2460` (the `portal_builder` item) already:

- accepts a `destination_world_class_id`;
- creates the destination world from that class;
- writes `destination_world_id` / `destination_world_type` /
  `destination_world_rows` / `destination_world_cols` and
  `destination_row` / `destination_col` onto the portal item;
- creates the matching return portal in the new world.

A portal placement must materialize through that same code path. Two things
are genuinely new:

1. **Idempotence.** The player-facing builder creates a fresh world on every
   use. `ensure_world_class` must resolve one stable destination instance per
   `(world_id, placement_id)` and reuse it.
2. **Entry resolution.** The existing convention hard-codes an entry of
   `(1, 1)`. `entryPlacementId` needs a resolution step from placement id to
   coordinates in the destination world, evaluated at travel time so that
   moving the entry placement moves where travellers arrive.

## Birdhaven as Data

After this work, the `birdhaven` world class should be ordinary editor data:

- base type: `village`
- dimensions: `30 x 30`
- normal item and NPC spawn manifests: as selected by the creator
- `old-oak` fixture at the desired tile
- a circular reservation around `old-oak` blocking random population, planting,
  and construction as desired
- `adventurers-guild-house` structure at the desired tile
- `adventurers-guild-door` fixture/portal linked to the guild world class

The old oak should have an item/fixture or structure class that describes its
appearance and supported actions. It must not be represented as a normal pine
tree, because it has a stable identity and a different lifecycle.

This is closer to done than it reads: `old_oak` already exists as an item type
(`item-registry.ts:328`). The work is promoting it to a fixture-kind class
whose class id drives rendering, not creating it from nothing.

## Adventurers' Guild as Data

The `adventurers_guild` world class should likewise be ordinary editor data:

- base type: `building`
- dimensions: `10 x 10`
- fixed floor/wall/object placements for the room
- a stable entry placement, for example `guild-entry`
- a return-door placement whose destination resolves back to the source
  Birdhaven placement
- deliberately empty or editor-defined random spawn manifests

The UI should expose an explicit entry-placement selection for linked doors;
it should not force creators to derive a spawn coordinate from a world ID.

## Editor Requirements

Extend the existing World Types editor rather than creating a separate
Birdhaven-only editor.

### Form capabilities

The editor needs to support:

- listing placements in stable display order;
- adding, editing, duplicating, and deleting one placement;
- selecting a placement kind and a compatible class ID;
- selecting an exact grid coordinate within the configured dimensions;
- editing class-owned initial state through constrained controls or validated
  JSON where no structured editor exists yet;
- adding/removing reservations and their affected rules;
- selecting a destination world class and entry placement for door/portal
  placements;
- validation feedback before save for duplicate IDs, out-of-bounds coordinates,
  missing class IDs, incompatible kinds, and invalid linked destinations.

The current raw JSON inputs for random item and NPC spawn manifests may remain
initially. Placements should not _ship_ as a third opaque JSON textarea if a
small list editor is feasible. Coordinate mistakes are too easy and too costly
in authored landmarks.

### Authoring must exist from Phase 1

The list editor is Phase 5 work, but Phases 1-4 need some way to author and
inspect placements or they cannot be tested at all. Ship a validated JSON
textarea in Phase 1 — matching how `itemSpawns`/`npcSpawns` are edited today
(`client-editors.js:1300-1310,1375-1410`) — and treat the structured editor as
the replacement for it, not as the first authoring surface.

### MCP parity comes for free

`virtualWorldManageWorldClasses` already exists as a registered MCP tool. Once
`placements` is a normalized field on `WorldClassRecord`, an MCP client can
create and manipulate worlds through it with no additional tool work. This is
half of the stated goal and it is satisfied by Phase 1 alone — so it should be
verified as a Phase 1 exit criterion rather than deferred to the editor phase.

### Preview and safety

Provide a lightweight world-class preview using the configured dimensions,
base terrain, and placements. It does not need full game rendering in phase
one, but must make coordinates, collision-bearing structures, and reservations
visible before creators publish a class.

Saving a class changes a template, not every existing world instance
immediately. The UI should offer an explicit reconciliation action for a
selected world instance once reconciliation is implemented.

## Bootstrap and Reconciliation

Implement the lifecycle in this order:

1. On first creation/loading of a world instance, load its world class.
2. Apply deterministic placements before random item/NPC population.
3. Record placement instances transactionally.
4. Exclude reservations and structure collision tiles from random population.
5. On later loads, ensure every current placement has an instance without
   duplicating it.

World class edits require an explicit policy. Do not silently rewrite player
worlds merely because a creator edited a template.

Add a `placementRevision` or content hash to each class and provide these
operations:

- **Preview:** no persistent change.
- **Apply to new worlds:** default behavior after a class edit.
- **Reconcile an existing world:** create missing placements, update
  placement-owned state where safe, and report conflicts.
- **Remove obsolete placement:** only delete the recorded placement-owned
  instance; never delete a matching player-created object.

For the migration, explicitly reconcile the existing Birdhaven and guild
instances after the records are seeded. Do not rely on a hidden self-healing
branch once the new system exists.

### Conflicts with the existing reseed path

Placement instance rows will be silently invalidated by machinery that
already exists, unless materialization is made aware of it:

- `item-storage.ts:447-470` scans for _all_ `old_oak` items and deletes every
  one except the centre tile. A placement-owned oak must either be exempt from
  that dedupe or become its replacement.
- `world-bootstrap.ts:74-85` deletes every world item and item-meta row when a
  world's stored shape changes, so the world reseeds from scratch. Placement
  instances pointing at those items become orphans. Materialization must run
  after that reseed, or the reseed must clear placement instances too.
- `item-storage.ts:576` caches guild world configuration in a process-level
  `guildWorldConfigEnsured` flag. That flag has to go with the special case,
  not survive it.

### Seeded action classes keep the legacy zone kinds

`seedActionClassDefaults` in `item-registry.ts:1290-1321` shallow-merges only
validation keys a stored row is _missing_. Deployed action-class rows already
have a `blockedZones` key, so renaming the zone kinds in `ACTION_DEFINITIONS`
never reaches them — they keep `oak_clearing` / `oak_center` forever.

Phase 2 handles this with permanent aliases in `world-reservations.ts`. Those
aliases stop being sufficient the moment a creator can give `block_plant` and
`block_build` different areas, because `oak_clearing` cannot distinguish them.
Phase 3 must therefore rewrite the seeded rows explicitly.

### Seeding placements onto already-seeded class rows

The system-class backfill in `world-class-storage.ts:326-350` only patches
labels and `fallbackLabel` on a row that already exists. Adding `placements`
to `birdhavenWorldClassRecord()` will therefore **not** reach the deployed
Birdhaven record. Class updates are full-replace rather than merge, so the
backfill needs an explicit revision/version marker on the record and a
"desired revision is newer than stored revision" branch that rewrites it.

## Implementation Plan

Sizing note: roughly 98 references to the oak/guild constants exist across 17
files, 41 of them in `world-domain.ts` alone. The riskiest part of this work
is not the new storage — it is migrating that many consumers. Phase 2 exists
to separate those two risks so neither has to be debugged through the other.

### Phase 1: Persist the schema

Status: **done**.

`assets/server/world-placements.ts` holds the schema, with two entry points at
deliberately different strictness: `normalizeWorldClassPlacements` is lenient
and runs on the DB read path (a malformed stored row must still yield a
loadable class), `validateWorldClassPlacements` is strict and runs on the write
path, reporting every problem with its array index rather than silently
dropping placements.

1. `placements` and `placementRevision` on `WorldClassRecord`, with
   normalization.
2. `placements_json` + `placement_revision` columns (the integer one nullable,
   so it can be added to a populated table; writes always supply a number).
3. Serialization, cache refresh, HTTP CRUD, MCP tool, and public API responses.
4. Validation of ids, kinds, coordinates, position strategy, class/tile
   references, reservation shapes, reservation rule names, and destinations.
   `validateWorldClassPlacementsForWrite` in `world-class-storage.ts` adds the
   one check `world-placements.ts` cannot make without a cycle: that an
   `ensure_world_class` destination names an existing class.
5. Rule registry reused from `world-reservations.ts` (phase 2).
6. `SYSTEM_PLACEMENT_REVISION` plus a revision-aware branch in the
   system-class backfill, so seeded placements reach already-deployed rows.
   Creator edits preserve the stored revision, so only a code-side bump
   reclaims a row.
7. Birdhaven (`old-oak` + clearing reservation, `guild-house`, `guild-door`)
   and Adventurers' Guild (`guild-training-post`, `guild-return-door`) seeded.
   `ensureAdventurersGuildWorld` in `item-storage.ts` now writes through the
   same factory, so the legacy path can no longer wipe the guild's placements.
8. Validated JSON textarea in the World Types editor; per-placement server
   errors are surfaced to the creator instead of a generic save failure.

Two things worth carrying forward:

- A third destination mode, `source_world`, was unavoidable. A return door
  leads back to whichever world the traveller came from, and a class template
  cannot name its own callers — the guild's exit is inexpressible with
  `ensure_world_class` or `existing_world` alone.
- Placements are validated against the record's _new_ dimensions, so shrinking
  a class below an existing placement's coordinate is rejected rather than
  silently orphaning a landmark off the map.

### Phase 2: Reservation façade over the existing constants

Status: **done**.

No behavior change, no new storage. `assets/server/world-reservations.ts`
exposes `isReservedTile`, `getReservedTiles`, `getReservationBounds`,
`getSpawnFallbackTile` and `applyWorldReservationsToMap`, all still answered by
the oak constants in `world-domain.ts`. Migrated consumers:

1. `tree-action-helpers.ts` — `getBlockedZoneError` resolves any zone kind
   through `isReservedTile` instead of branching on two hard-coded kinds.
2. `action-registry.ts` — built-in blocked zones name rules (`block_plant`,
   `block_build`, `protect_landmark`); `kind` is typed as a rule name rather
   than a two-value union.
3. `npc-tick-helpers.ts` / `npc-orchestration.ts` — the two injected oak
   predicates are gone, replaced by a direct `isReservedTile` import per the
   repo's no-dependency-injection convention.
4. `world-map.ts` — the river band derives from
   `getReservationBounds(..., block_terrain_feature)`; `rand()` call order is
   preserved so seeded maps still generate identically.
5. `player-snapshots.ts` — spawn tiles come from
   `getReservedTiles(..., spawn_area)`, with `getSpawnFallbackTile` as the
   anchor.
6. `world-bootstrap.ts` / `world-map.ts` — `applyOakReservation` is reached
   through `applyWorldReservationsToMap`.

Random item/NPC population was _not_ migrated: it never consulted the clearing,
so there was nothing to route through the façade.

`world-domain.ts` keeps its oak exports as the façade's private backing. Phase 3
removes them; nothing outside `world-reservations.ts` reads them now.

### Phase 3: Materialize placements

Status: **done**.

1. `world-placement-instances.ts` + a `vworld_world_placements` table keyed
   `(world_id, placement_id)`.
2. `materializeWorldPlacements` in `item-storage.ts`, called from
   `ensureWorldItems` — replacing the three world-ID-gated seeders.
3. item/fixture/portal and one-tile structure materialize there; `npc`
   materializes in `npc-storage.ts` (it owns NPC rows, and importing it from
   item-storage would close a cycle); `terrain` needs no instance, since
   `world-reservations.ts` paints it onto the map.
4. Portal placements resolve `ensure_world_class` to one stable destination
   world per (source world, placement), recorded on the instance, and
   `entryPlacementId` to a tile in the destination class.
5. Façade repointed at placement data.
6. The reseed drops placement instances before re-materializing, so the
   landmarks the wipe removed come back.
7. `ensureOldOakItem`, `ensureGuildRoomItems`, `ensureVillageGuildEntrance`
   deleted. `item-storage.ts` no longer imports a single oak or guild constant.

Notes worth carrying:

- **Adoption, not recreation.** Before an instance row exists, a placement
  matches an existing object by class id plus fixture tag. That is what let the
  live start world migrate without growing a second oak: the deployed oak and
  guild door kept their original item ids and destinations. Player-built
  objects of the same class are untouched, because authored ones carry the tag.
- **`generateWorldMap` was gating the reservation paint on `worldId === "10000"`.**
  The page state's `map` is the _raw generated_ map (the client applies world
  mods itself), so authored terrain has to be painted during generation to be
  visible at all — which meant only Birdhaven ever got any. Now applied to
  every world; a class with no placements resolves to nothing.
- **`source_world` needs a recorded back-link.** A class cannot name its own
  callers, so the exterior writes a `__source_world__` instance row into the
  interior when it creates it. That row survives the reseed wipe, since nothing
  else in the world knows the relationship existed. Return doors resolve the
  world but deliberately not a tile: the exterior's portal tile is usually a
  wall, so the traveller lands on that world's default spawn.
- **Seeded action rows still carry oak-specific text.** Blocking a build inside
  a creator's own clearing reports `error.oak_clearing_must_stay_open`. The
  geometry is fully data-driven; only the message name is legacy. Rewriting
  those seeded rows belongs to phase 4.

### Phase 4: Remove special cases

Status: **done**.

1. The start world's forced config is gone. `ensureOakWorldConfig` rewrote
   type, dimensions and class on _every_ load, which meant the start world
   could not be reconfigured at all — the next page load undid it. Replaced by
   `ensureStartWorldRow`, which creates the row from the configured class only
   when none exists.
2. `world-domain.ts` has no oak or guild knowledge left: coordinates, clearing
   radius, `isOakWorld`/`isGuildWorld`, `OakTile` and the world-id branches in
   `getDefaultWorldTypeForWorldId` are all gone. The geometry now lives in
   `world-class-storage.ts` as what it always was — seed data for two
   authored worlds.
3. Seeded action rows migrated off `oak_clearing`/`oak_center` to rule names,
   with generic messages (`error.area_is_protected`,
   `error.landmark_stands_firm`).
4. The old oak renders from the tile its `old_oak` item occupies, found in the
   world's items. `OAK_CENTER_ROW`/`COL` are gone from page state, browser
   globals, `client-world-render.js` and `client-tile-detail.js`.
5. `START_WORLD_ID` / `START_WORLD_CLASS_ID` in `runtime-config.ts` — one
   place to move the deployment's front door. `switchUserToStartWorld` takes
   only a user id and no longer rewrites the world it sends them to.

Worth carrying:

- **The definition is authoritative for blocked zones**, unlike every other
  validation key. They are not exposed by any editor, so there is no creator
  customization to preserve, and a stale kind is actively wrong. A generic
  legacy mapping was not enough: `oak_clearing` cannot distinguish
  `block_plant` from `block_build`, so migrating it by alias left `build_house`
  checking the planting rule. `syncBlockedZonesWithDefinition` replaces them
  from `ACTION_DEFINITIONS` whenever they differ.
- The legacy aliases in `world-reservations.ts` are now unused by any seeded
  row, but stay as a safety net for rows copied from a built-in before the
  migration ran.

### Phase 5: Editor and reconciliation

Status: **done**, apart from a browser pass over the new panel.

1. The JSON textarea is replaced by a placement list editor: per-placement id,
   kind, class picker (fed from the registry the kind resolves against, so it
   cannot offer something the save will reject), coordinates, duplicate and
   delete. Held as state and re-rendered rather than parsed back out of the
   DOM — a placement is a nested shape, and round-tripping that through form
   fields per keystroke is where coordinate mistakes come from.
2. A canvas preview draws placements and reserved areas to the configured
   dimensions, and outlines the map when a placement falls outside it.
   Structured destination editor for portals: mode, destination class or world
   id, entry placement.
3. `POST /virtual-world/reconcile-world` and an **Apply to world** control.
   Explicit and per-world: saving a class edits a template, and rewriting live
   worlds is a separate decision.
4. `DOC-authoring-worlds.md` documents the exterior / linked interior / return
   door pattern end to end.

Reconciliation's removal half is what the instance rows were for. It deletes
the object a removed placement created and nothing else — an object that merely
shares a class id is somebody's property. A structure a player has since
rebuilt is reported as a conflict rather than bulldozed.

Verified live: adding a placement to Birdhaven and reconciling materialized it;
removing it and reconciling deleted exactly that item, leaving the player-built
door and both portals untouched.

**Admin override confirmed working.** System classes have empty `ownerIds`, so
`canManageClass` falls through to `isAdminUser`. With a row in `vworld_admins`,
Birdhaven and the guild are editable through the same editor as any other class
— which was the goal at the top of this document.

## Acceptance Criteria

The work is complete when all of the following are true:

- A creator can create a new world class in the editor with exact fixtures,
  structures, reservations, and an editor-selected linked interior.
- An MCP client can do all of the same through
  `virtualWorldManageWorldClasses`, without an editor session.
- A creator can configure an old-oak-style landmark and protected clearing
  without adding a world-ID conditional to code.
- A creator can configure a house and door to a linked world without adding a
  world-ID conditional or coordinate constant to code.
- Birdhaven and Adventurers' Guild are seeded records that can be inspected and
  changed through the same World Types editor as any other class.
- Loading a world multiple times does not duplicate placement-owned objects.
- Reconciliation never removes player-created content or arbitrary objects that
  merely share a class ID with a placement.
- Random item/NPC population respects collision and reservation rules.
- Terrain generation routes around reserved tiles, so Birdhaven's river still
  misses the clearing with no world-ID check anywhere in `world-map.ts`.
- The old oak renders from its class, and no coordinate constant for it reaches
  the browser.
- Loading Birdhaven does not resurrect a second oak through the world-item
  reseed or dedupe paths.
- Existing item, action, NPC, world-mod, and rendering ownership checks remain
  authoritative; placements compose those systems rather than bypass them.

## Non-Goals for the First Version

- A creator-defined terrain generator or arbitrary terrain tile type.
- Creator-authored mesh recipes, body morphologies, or executable scripts.
- Arbitrary placement expressions or a general scripting language.
- Automatic, unreviewed migration of every existing world when its class is
  edited.

Those are possible later engine features. Keeping the first placement schema
small makes it safe enough for the editor while still removing the Birdhaven
and Adventurers' Guild special cases.
