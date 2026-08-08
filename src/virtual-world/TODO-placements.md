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
  rules: Array<"block_random_spawn" | "block_plant" | "block_build">;
};
```

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

### Reservations

Reservations are evaluated as part of the effective world rules:

- random item/NPC spawning excludes `block_random_spawn` tiles;
- plant and build actions reject tiles marked `block_plant` and `block_build`;
- map generation/rendering remains independent unless a placement also writes
  terrain/object mods.

This is the replacement for world-ID checks and the `oak_clearing` /
`oak_center` validation enum. The old oak itself can be protected through its
own reservation rather than through a globally recognized oak-world rule.

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
initially. Placements should not be introduced as a third opaque JSON textarea
if a small list editor is feasible. Coordinate mistakes are too easy and too
costly in authored landmarks.

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

## Implementation Plan

### Phase 1: Persist the schema

1. Add `placements` to `WorldClassRecord` and normalization.
2. Add a `placements_json` column to the world-class table setup/migration.
3. Extend database serialization, cache refresh, CRUD handlers, and public
   API responses.
4. Add strict server validation for placement IDs, kinds, coordinates, class
   references, state ownership, reservation shapes, and destinations.
5. Seed Birdhaven and Adventurers' Guild class records with placement data.

### Phase 2: Materialize placements

1. Add world-placement instance storage with a unique `(world_id, placement_id)`
   constraint.
2. Implement idempotent placement materialization in world bootstrap.
3. Materialize fixture/item, NPC, terrain, and one-tile structure placements.
4. Apply reservation rules to random spawning and action validation.
5. Replace hard-coded Birdhaven/guild fixture seeding with materialization.

### Phase 3: Remove special cases

1. Remove forced Birdhaven dimensions/class assignment from the normal world
   bootstrap path.
2. Remove old-oak coordinates, clearing radius, and `oak_clearing`/
   `oak_center` checks from the generic world domain/action logic.
3. Remove fixed guild world ID, fixed door coordinates, and hard-coded spawn
   location branches.
4. Make the default starting world configurable as runtime deployment
   configuration or a small admin-selected world instance, separate from world
   class content.

The start-world selector is deliberately outside `WorldClassRecord`: a class
is reusable, while the deployment needs one concrete initial world instance.

### Phase 4: Editor and reconciliation

1. Add the placement list/editor to the World Types panel.
2. Add a visual preview and structured destination editor.
3. Add controlled reconciliation for existing worlds, beginning with
   Birdhaven and Adventurers' Guild.
4. Document creator workflow for creating an exterior, linked interior, and
   return door entirely in the UI.

## Acceptance Criteria

The work is complete when all of the following are true:

- A creator can create a new world class in the editor with exact fixtures,
  structures, reservations, and an editor-selected linked interior.
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
