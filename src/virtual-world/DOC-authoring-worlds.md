# Authoring a world without touching code

A world class is a template. It says how big a world is, which terrain preset
it generates from, what ambient population gets scattered into it, and — the
part this document is about — which **placements** it authors: the landmarks,
structures, fixed NPCs and doors that must exist at known coordinates.

Everything below is doable from the World Types editor in the game, or from an
MCP client through `virtualWorldManageWorldClasses`. Neither path needs a
deploy.

## The two manifests, and which one you want

| You want                                                            | Use                        |
| ------------------------------------------------------------------- | -------------------------- |
| "scatter 5 wolves and 3 saws somewhere"                             | `itemSpawns` / `npcSpawns` |
| "an ancient oak at the centre, with a clearing nobody may build in" | `placements`               |

Random population is re-rolled per world. Placements are authored: same id,
same tile, every world of that class, and reconcilable later.

## Placement kinds

- `item` — an ordinary world item.
- `fixture` — an item that belongs to the world rather than to loot. Materialized
  non-droppable, so nobody walks off with the landmark.
- `terrain` — paints one map tile. This is how a landmark gets a footprint: the
  old oak is a `fixture` (the thing you can examine) _plus_ a `terrain`
  placement of `pine_tree` on the same tile (the thing you cannot walk through).
- `structure` — an object-layer world mod. Today that means `house`.
- `npc` — a fixed living. Ambient wildlife belongs in `npcSpawns` instead.
- `portal` — an item with a linked destination. See below.

`classId` is resolved against a different registry per kind: an item class for
`item`/`fixture`/`portal`, a living class for `npc`, a world tile name for
`terrain`/`structure`. The editor's picker only offers valid options; a
mismatch is rejected on save with the placement's index.

## Naming an NPC

An ambient NPC gets a name hashed from its id — "Kylli Salo" — which is fine
for wildlife and useless for a character anyone is meant to remember. Give an
`npc` placement an `identity` and it becomes somebody:

```json
{
  "id": "gate_guard",
  "kind": "npc",
  "classId": "npc_human",
  "position": { "strategy": "exact", "row": 12, "col": 40 },
  "identity": {
    "name": "Aino the Gatekeeper",
    "labels": { "fi": "Portinvartija Aino" },
    "description": "Has kept this gate since the rowan was a sapling.",
    "descriptions": { "fi": "On vartioinut porttia pihlajan taimesta asti." }
  }
}
```

- `name` is the canonical text. It replaces the generated name everywhere the
  NPC is referred to: nameplate, tile inspector, combat messages, the active
  actions panel.
- `labels` / `descriptions` are per-locale overrides, keyed the same way class
  labels are (`fi` today). The server sends the canonical text and the map; the
  client picks.
- `description` is the lore line shown under the name in the tile inspector.
  This is where a character's history goes — nothing else displays it yet.

Names are copied onto the NPC when its placement materializes, so renaming the
guard in the class updates the guard standing in every existing world of that
class the next time it loads. Only placements can name an NPC; random spawns
keep their hashed names, which is what tells the two apart at a glance.

## Reservations: rules a landmark imposes on its surroundings

A placement may reserve an area — a circle or rectangle — carrying rules:

| Rule                    | Effect                                                   |
| ----------------------- | -------------------------------------------------------- |
| `block_plant`           | planting is rejected there, by players and NPCs          |
| `block_build`           | building is rejected there                               |
| `block_terrain_feature` | generation routes rivers around the area                 |
| `clear_terrain`         | generated trees/rocks are cleared back to walkable floor |
| `spawn_area`            | arriving players prefer these tiles                      |
| `protect_landmark`      | the placement's own tile resists destruction             |
| `block_random_spawn`    | reserved for random population (not yet consumed)        |

Omit a reservation's `row`/`col` and it centres on the placement that owns it,
which is what you want almost always.

A protected clearing is therefore one placement with one reservation — not a
world-ID conditional in the engine, which is what it used to be.

## Linking an exterior to an interior

Give a `portal` placement a destination:

```json
{
  "id": "guild-door",
  "kind": "portal",
  "classId": "door",
  "position": { "strategy": "exact", "row": 21, "col": 15 },
  "state": {
    "open": true,
    "fixture": "guild_entrance",
    "destination": {
      "mode": "ensure_world_class",
      "worldClassId": "adventurers_guild",
      "entryPlacementId": "guild-return-door"
    }
  }
}
```

- `ensure_world_class` — creates one interior per (world, placement) from the
  named class the first time it is used, then reuses it. Two worlds of the same
  exterior class get their _own_ interiors; reloading one does not create a
  second.
- `existing_world` — points at one specific world by id.
- `source_world` — leads back to whichever world linked here. This is what a
  return door uses: a class cannot name its own callers, so the exterior records
  the relationship when it creates the interior.

`entryPlacementId` names a placement **in the destination class** whose tile the
traveller arrives on. The guild's return door doubles as its entry point, which
is why the exterior door names it.

### The full pattern, end to end

1. Create the interior class (`building` base type, empty spawn manifests).
   Give it a `portal` placement with `destination.mode = source_world` — the way
   out.
2. Create the exterior class. Give it a `portal` placement with
   `destination.mode = ensure_world_class`, `worldClassId` = the interior, and
   `entryPlacementId` = the interior's return door.
3. Optionally add a `structure` placement (`house`) on the exterior door's tile,
   so the door hangs on a wall rather than in open air.

`fixture` tags matter here: set `state.fixture` to something distinctive on
authored doors. It is what lets materialization tell your door from a
player-built one on the same tile, and adopt the right one.

## Applying a class edit to worlds that already exist

Saving a class changes the **template**. Worlds built from it are not touched,
deliberately — a creator editing a template should not silently rewrite
somebody's world.

Use **Apply to world** (or `POST /virtual-world/reconcile-world` with
`{"world_id": "..."}`) to reconcile one world:

- placements you added get created;
- placements you removed get their object deleted — _only_ the object that
  placement created, tracked per world by placement id;
- an object that merely shares a class id with a removed placement is somebody's
  property and is left alone;
- a structure a player has since rebuilt is reported as a conflict rather than
  bulldozed.

## Validation

Saves are rejected with one message per problem, each carrying its index:
duplicate or malformed ids, out-of-bounds coordinates, unknown class/tile
references, unknown reservation rules, unsupported position strategies, and
portals pointing at a class that does not exist. Shrinking a class below an
existing placement's coordinate is rejected too, rather than silently orphaning
a landmark off the map.

## What still needs code

Placements compose existing engine capabilities; they do not add new ones. A
new terrain generator, a new interaction primitive, a new mesh recipe or a new
combat rule is still a code change. What no longer is: where things are, what
they are, what they protect, and where they lead.

## Deliberately not built yet

Kept small on purpose — each of these is easy to add when something concrete
needs it, and speculative to add before then.

- **`near_placement` and `random` position strategies.** Only `exact` is
  supported; validation rejects the others by name. Random population is what
  `itemSpawns`/`npcSpawns` are for, and relative positioning needs a real
  editor workflow before it earns a schema.
- **Multi-tile structures.** A `structure` covers one tile. A `footprint` field
  belongs here when multi-tile buildings are actually wanted — a multi-tile
  building must not be encoded as unrelated single placements.
- **Structures other than `house`.** The object layer has one mod kind today. A
  structure naming another tile records its instance and paints nothing.
- **More than one reservation per placement in the editor.** The stored schema
  allows several and the server honours all of them; the panel edits the first
  and preserves the rest untouched, so extras stay MCP-editable.
- **Legacy blocked-zone aliases.** `oak_clearing`/`oak_center` still resolve in
  `world-reservations.ts`. No seeded row uses them any more (the seeder rewrites
  them from the definition), so they can go once you are confident nothing
  copied one before that migration ran.
