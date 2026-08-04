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

| field         | meaning                                  | examples                                               |
| ------------- | ---------------------------------------- | ------------------------------------------------------ |
| `targetKind`  | what you aim at                          | `self` · `item` · `living` · `tile` · `point`          |
| `range`       | reach, in tiles                          | poke/fix = 1, bow = 6, longbow = 10                    |
| `rangeShape`  | how range is measured & drawn            | `adjacent` · `line` (ranged single) · `radius` (AoE)   |
| `approach`    | walk into range before acting?           | `walk_adjacent` (melee/manipulate) · `none` (ranged)   |
| `areaRadius`  | for AoE, tiles affected around the point | fireball = 2                                           |
| `rangeFrom`   | who supplies `range`                     | `action` · `item` (longbow overrides bow)              |
| `targetScope` | where an item target may live            | `world` (default) · `inventory` · `any` (examine)      |
| `validWhen`   | precondition for **offering** the action | item is damaged, target is a living, target below X HP |

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

### 1. Add the `targeting` spec to action classes ✅ done

Added the descriptor above (`targeting_json` column, `resolveActionTargeting`
/ `resolveEffectiveActionRange` in `action-registry.ts`), with a
behavior-preserving default derived from each action's `targetKind` and a
backfill that both seeds it and later adopts a newly-declared built-in
targeting over that derived default (the class-DB-persistence gotcha). Range
resolves from the granting item when `rangeFrom: "item"`.

### 2. Auto-walk-then-act for `approach: walk_adjacent` ✅ done

An out-of-range target chosen for a `walk_adjacent` action enqueues an
approach on `pending-action-storage`; `resolvePendingActionsForWorld` steps
the actor toward the target's current tile each world tick (shared stepper in
`pursuit-movement.ts`) and re-runs the action on arrival, bounded by
`APPROACH_ACTION_MAX_MS`. `poke` and the item-targeted actions
`fix`/`break`/`bury` are flipped to `walk_adjacent` (range 5) via a
shared `WALK_ADJACENT_TARGETING` — "point at a moving NPC or a distant item,
the game closes the gap and acts"; the client offers same-tile
`walk_adjacent` actions at nearby distance too. Individual item pick is a
second `pick_item` action-class (walk to one chosen item and take just it)
alongside the unchanged tile-level "pick all" HUD button. An in-flight
approach is cancelable: it shows in the active-actions panel (like
follow/fight) with a Stop button that posts `cancel_approach`, which deletes
the pending row and halts the per-tick stepping. The approach row is enqueued
once as always-due and left in place while walking (deleted only on
arrival/abandon/cancel), so cancelling is race-free like stopping a follow.

### 3. `validWhen` gating + valid-target highlight ✅ done

`validWhen` is a list of `ActionCondition`s on the _target_ (extended with an
optional `ref` so a field can be compared to another field, e.g.
currentHitPoints < maxHitPoints). Stored in `valid_when_json`, shipped in the
class bootstrap, and evaluated client-side (`actionValidForTarget` mirrors the
server's `evaluateTargetConditions`) to hide inapplicable buttons: Fix shows
only on a damaged item, Bury only on a corpse. The action's own handler
remains the server-side authority — validWhen is client gating, not
enforcement. The **valid-target highlight** is a pulsing gold ring on the
ground under any world item a satisfied-validWhen action currently applies to
(damaged item → Fix, corpse → Bury; `itemHasContextualAction` +
`updateItemHighlights` in client-world-render.js) so the opportunity is
discoverable without opening the panel. The panel is context-ranked too
(`rankActionsByContext`): a validWhen-gated action, present only when relevant,
floats above the always-available verbs (Fix ahead of Examine/Break on a
damaged item).

### 4. Ranged `line` / area `radius` attacks 🚧 line + radius done

**Done — ranged single-target (`line`):** `firebolt` is a one-shot ranged
attack (targetKind `living_nearby`, targeting `range 8 / line / approach none`,
granted by starter_kit). Its handler resolves a living within the action's
effective range and applies a single strike via `applyRangedHitToLiving`
(fight-helpers.ts) — a standalone mirror of the fight tick's per-round math
(d20 vs armorClass, weaponClass damage, corpse/ghost death, level-scaled kill
XP) so the fight loop is untouched. The tile inspector now gates every action
button by its own `actionEffectiveRange` (targeting.range) instead of one fixed
5-tile radius, so a ranged action's button shows out to its range. Target-first
aiming (click the living → Firebolt) is the interaction; it resolves from the
caster's tile with no walking.

**Done — area `radius` + action-first aiming:** `fireball` is a point-targeted
area attack (new `point` targetKind, targeting `range 8 / radius / areaRadius 2
/ approach none`, granted by starter_kit). Its handler validates the reticle
tile is within casting range and strikes every NPC within `areaRadius` (Chebyshev)
of it via `applyRangedHitToLiving`, aggregating hits/kills/XP into one toast;
`resolveActionTarget` handles `point` from body.row/col. The client
(`client-aiming.js`) is the action-first path: a **cast bar** lists the player's
point-targeted actions, arming one enters aiming mode with a ground **reticle**
(target ring + translucent area disc sized to areaRadius) that follows the
pointer clamped to range; tap/click casts, Esc/right-click/Cancel aborts. Wired
through client-input.js (pointer positions the reticle, click/tap confirms).

**Remaining:**

- **Item-derived range (`rangeFrom: "item"`, longbow > shortbow):** the client
  `actionEffectiveRange` still reads the action's own range; wire it to the held
  weapon's range stat, and add a bow/wand item that carries one.
- **Action-first aiming for `line`:** firebolt is target-first today; the
  highlight-and-tap/cycle aiming mode for single-target ranged is not built.
- **Player friendly-fire / PvP AoE:** fireball hits NPCs only for now.

### 5. Inspecting a target: `examine` + inventory-scoped targeting ✅ done

`examine` is the read-only verb of the targeting system: it resolves the chosen
item server-side and answers with the same facts the tile inspector shows for a
square's contents — class label, item kind, hit points / armor class / weapon
class (plus any other scalar state key), container fill, portal destination —
as a structured `examined_item` (`buildItemInspection` in `item-registry.ts`).
The client renders it in the tile detail panel (`showExaminedItemPanel`), which
now shares its stat-row rendering with the tile inspector, so "what is this
thing" always appears in the same place.

Targets are no longer world-only. `targeting.targetScope` (`world` | `inventory`
| `any`) says where an item-targeted action may look; `examine` declares `any`,
so it reads a rock underfoot and the sword in your bag alike (`resolveTargetedItem`
in `tree-action-helpers.ts` searches the resolved tile, then every tile within
the action's reach, then the actor's slots and bag).

Examining is also a **look, not a touch**: `LOOK_AT_TARGETING` gives it
`approach: "none"` at the nearby range, so it resolves from where the actor
stands instead of walking. That is what makes fixtures examinable at all — the
old oak, a door on a wall, a portal on a blocked square all sit on non-walkable
tiles, so a `walk_adjacent` approach could never arrive and would burn
`APPROACH_ACTION_MAX_MS` before giving up. The tile-range search in
`resolveTargetedItem` only ever runs for such no-approach actions; the
walk-then-act ones are intercepted by `maybeBeginApproachAction` first.

Two client paths reach a carried item, since it has no tile to tap: the
inventory panel renders a per-item button for every inventory-scoped action
valid for that item (`inventoryTargetActionsForItem`), and the armed-action aim
row grows a **Bag** button that lists the carried candidates
(`collectInventoryAimTargets` → the existing target chooser). The MCP
`virtualWorldAct` tool now also forwards `target_item_id`/`target_living_id`, so
every entity-targeted action is drivable from the tool path.

Steps 1–2 are the highest leverage: together they make the whole interaction
"point at a place or thing; the game resolves reach and pathing", which is
what the manipulation cases need and what eliminates the moving-target race,
before any combat-aiming UI exists.
