# Design — a unified targeting / aiming system

Status of this document: design proposal (August 2026). Not yet
implemented. It replaces the current tile-exact selection model with a
data-driven **targeting spec** per action, from which the client derives an
**aiming mode**. The goal is one system that serves manipulation (poke,
fix, pick), single-target ranged (bow, firebolt), and area attacks
(fireball), while keeping the UI from exploding into an item × action grid.

## Motivation

**Today** selection is stricter than action:

- A click raycasts the flat ground plane → `selectTile(row, col)`
  (`assets/public/client-tile-detail.js`), and the detail panel lists only
  entities whose `row/col` **exactly** match the selected tile
  (`renderTileDetailPanel`, the `na.row === row && na.col === col` loops).
- But `fight`/`follow` ("nearby" actions) already work anywhere within
  `NEARBY_ACTION_TILE_DISTANCE = 5` tiles (`tiles-and-items.js`,
  `isWithinTileDistance` in `assets/server/tree-action-helpers.ts`); only
  plain actions like `poke` require the same tile.

So selection is tile-exact while the action it feeds is not. When an NPC
moves between the click and the action press, the panel goes stale/empty —
the player has to click the square and then race the NPC to press Fight.
That mismatch is the root problem this design removes.

There is also latent infrastructure this design leans on rather than
inventing:

- The player already has a `rotation`; `getTargetTileFromRotation()` /
  `facing_tile` in `assets/server/current-world-state.ts` already computes
  "the tile I'm looking at" (nothing consumes it on the client yet).
- Item-targeted actions already round-trip a specific id: the panel emits
  `data-target-item-id` → `postItemTargetedAction`, and
  `data-target-living-id` → `postLivingTargetedAction`. Per-entity
  targeting is already half-wired.
- `pending-action-storage.ts` is a generic delayed-action queue (used by
  follow, tree-actions, NPC orchestration) — the natural home for
  "walk into range, then act".
- `action-logic-interpreter.ts` (+ `action-registry`, `action-class-storage`)
  already evaluates per-action condition/effect logic — the natural home
  for "when is this action offered / effective".

## Core model: a `targeting` spec per action

Every action class gains a targeting descriptor. It is **data** on the
action (and, where noted, the granting item) — no per-name branches, in
keeping with the generalize-hardcoded-behavior initiative.

| field        | meaning                                  | examples                                               |
| ------------ | ---------------------------------------- | ------------------------------------------------------ |
| `targetKind` | what you aim at                          | `self` · `item` · `living` · `tile` · `point`          |
| `range`      | reach, in tiles                          | poke/fix = 1, bow = 6, longbow = 10                    |
| `rangeShape` | how range is measured & drawn            | `adjacent` · `line` (ranged single) · `radius` (AoE)   |
| `approach`   | walk into range before acting?           | `walk_adjacent` (melee/manipulate) · `none` (ranged)   |
| `areaRadius` | for AoE, tiles affected around the point | fireball = 2                                           |
| `rangeFrom`  | who supplies `range`                     | `action` · `item` (longbow overrides bow)              |
| `validWhen`  | precondition for **offering** the action | item is damaged, target is a living, target below X HP |

Coverage:

- `range` / `rangeShape` / `areaRadius` / `approach` express all four
  interaction modes below.
- `rangeFrom: "item"` resolves **longbow vs shortbow**: range is a stat on
  the weapon's item class, and the action reads it at aim time.
- `validWhen` is the lever for both **UI scalability** and
  **discoverability** (see those sections).

Range is always resolved server-side at action time and is the authority;
the client's aiming preview is advisory. The server already re-validates
distance for nearby actions, so this is a generalization of existing
behavior, not new trust surface.

## Two aiming flows, chosen by the spec

### Target-first (inspect → act)

The current click-a-place flow, for manipulation and exploration. Best for
`approach: walk_adjacent` (poke, fix, pick). You click the **place or
thing**; if it is out of the action's melee range, the living pathfinds
adjacent and then acts. You never aim a reticle for these.

### Action-first (arm → aim)

Pick the action from a small hotbar first; the game then enters an aiming
mode driven by `rangeShape`:

- `line` (bow, firebolt): valid livings within `range` highlight; tap one,
  or tab/cycle through them. Facing narrows the candidate set so a moving
  target stays "in front of you".
- `radius` (fireball): a reticle placed on a tile; the affected `areaRadius`
  previews as a ring; confirm → every living inside is hit.

**The scalability principle is structural: you commit to one axis before
seeing the other.** Target-first shows targets, then that target's valid
actions; action-first shows one action, then its valid targets. The client
never renders items × actions simultaneously.

## The interaction cases, mapped

| case                        | spec                                     | notes                                                                                  |
| --------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| poke / fix an item          | `item, range 1, adjacent, walk_adjacent` | out-of-range → enqueue _path-adjacent → execute_ via `pending-action-storage`          |
| pick one item (vs pick all) | `item, range 1, walk_adjacent`           | per-item button already emits `data-target-item-id`; keep a bulk "pick all" separately |
| firebolt / bow on an NPC    | `living, range from item, line, none`    | action-first aiming; in-range livings highlight                                        |
| fireball on a location      | `point, radius, areaRadius N, none`      | reticle + ring preview; hits all livings in radius                                     |
| longbow > shortbow          | same `attack`, `rangeFrom: "item"`       | range pulled off the weapon item class                                                 |

## Disambiguation is two different problems

These are routinely conflated; they need different UI:

- **Which tile** (things spread across space) → **direction / facing**. A
  sector view keyed off `facing_tile` keeps a moving NPC in scope as long
  as it is roughly in front of the player. Direction cannot pick between
  two things on the _same_ tile.
- **Which of several on one tile** (a crowded stack) → a **list**. Collapse
  identical entities (`3× goblin`, `5× coin`), tap a group to expand, or
  tap the tile repeatedly to cycle the top entity.

The system needs both: direction to reach the tile, a compact grouped list
to pick within it.

## Keeping the UI from exploding

Layered, each cutting the item × action cross-product:

1. **`validWhen` gating** — offer only actions whose preconditions hold
   (evaluated by `action-logic-interpreter`). Most of the grid vanishes:
   `fix` appears only on a damaged item, `attack` only on a living in
   range.
2. **Commit-one-axis** — one list at a time (see the two flows).
3. **Group & collapse** identical entities, expand on demand.
4. **A small action hotbar** for the few armed/combat actions, so combat
   never scans the detail panel.

## Discoverability — surface affordances, don't list them

"The player discovers that this action works well here" is the same
`validWhen` / effectiveness data, expressed as **feedback** instead of a
**menu**:

- **Highlight valid targets** for the armed/held action — a damaged item
  pulses while the repair hammer is held; an in-range living outlines for
  the bow; low-HP enemies glow for a finisher.
- **Context-rank** the panel — float `fix` to the top when the item is
  damaged; mark `firebolt` "effective" when the target is weak to fire.
- **Reveal-on-condition** — actions hidden until relevant double as both the
  discovery mechanism and the scalability mechanism: the list stays short
  because it shows only what currently applies, and new situations reveal
  new verbs.
- **Result hints via toasts** — the localized `toast_message_key` system can
  carry "super-effective"-style feedback, closing the learn-by-doing loop.

## Suggested landing order

Ordered highest-leverage-first; also the suggested implementation order.

### 1. Add the `targeting` spec to action classes

Add the descriptor above to `action-class-storage`, resolve `range` from the
granting item when `rangeFrom: "item"`. Nothing visible yet, but every step
below keys off it. Built-in classes are DB-seeded, so seeding/migration must
set defaults on existing actions (poke/fix → `walk_adjacent`, range 1).

### 2. Auto-walk-then-act for `approach: walk_adjacent`

Selecting an out-of-range `item`/`tile`/`living` target enqueues
_pathfind-adjacent → execute action_ on `pending-action-storage`. This alone
fixes poke, fix and individual-pick, and makes tile-clicking forgiving —
"point at a place/thing, the game figures out reach and pathing". Removes
the click-then-race-the-NPC problem for melee/manipulation without building
any combat aiming yet.

### 3. `validWhen` gating + valid-target highlight

Shrinks the panel and delivers discoverability in one move. Purely a
consumer of data added in step 1 plus existing condition logic.

### 4. Action-first aiming mode for `line` / `radius`

Unlocks bow, firebolt and fireball as pure content (new item/action classes)
with no further engine changes: highlight-and-tap for `line`, reticle + ring
for `radius`. Variable range (longbow) is already covered by `rangeFrom` from
step 1.

Steps 1–2 are the highest leverage: together they make the whole interaction
"point at a place or thing; the game resolves reach and pathing", which is
what the manipulation cases need and what eliminates the moving-target race,
before any combat-aiming UI exists.
