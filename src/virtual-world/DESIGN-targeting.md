# Design — a unified targeting / aiming system

Status of this document: design from August 2026, **largely implemented**.
It replaced the tile-exact selection model with a data-driven **targeting
spec** per action, from which the client derives an **aiming mode**. The goal
was one system serving manipulation (poke, fix, pick), single-target ranged
(bow, firebolt), and area attacks (fireball), without the UI exploding into
an item × action grid.

Steps 1, 2, 3 and 5 of the landing order are done; step 4 is done for both
`line` and `radius` attacks, with three gaps left (item-derived range,
action-first aiming for `line`, PvP area effects). Per-step notes below say
what landed and where it lives. The sections before the landing order are
kept as the reasoning behind the design; where the implementation diverged
from what they proposed, a note says so.

## Motivation

Selection used to be stricter than the action it fed:

- A click raycast the flat ground plane → `selectTile(row, col)`
  (`assets/public/client-tile-detail.js`), and the detail panel listed only
  entities whose `row/col` **exactly** matched the selected tile.
- But `fight`/`follow` ("nearby" actions) already worked anywhere within
  `NEARBY_TARGET_TILE_DISTANCE = 5` tiles; only plain actions like `poke`
  required the same tile.

So selection was tile-exact while the action was not. When an NPC moved
between the click and the action press, the panel went stale/empty — the
player had to click the square and then race the NPC to press Fight. That
mismatch was the root problem, and steps 1–2 removed it: the tile inspector
now gates each button by that action's own `actionEffectiveRange`, and an
out-of-range target for a `walk_adjacent` action makes the actor close the
gap instead of refusing.

The design leaned on infrastructure that already existed rather than
inventing it — all four of these are now load-bearing:

- The player's `rotation` and `getTargetTileFromRotation()` / `facing_tile`
  in `assets/server/current-world-state.ts` — "the tile I'm looking at".
- Item-targeted actions round-tripping a specific id (`data-target-item-id`
  → `postItemTargetedAction`, `data-target-living-id` →
  `postLivingTargetedAction`); the MCP `virtualWorldAct` tool forwards both
  too, so the tool path aims like the browser does.
- `pending-action-storage.ts`, the generic delayed-action queue — now also
  the home of "walk into range, then act".
- `action-logic-interpreter.ts` (+ `action-registry`, `action-class-storage`)
  for per-action condition/effect logic — now also "when is this action
  offered" (`validWhen`).

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

**As built**, the eight fields did not end up in one object. `ActionTargeting`
(stored in `targeting_json`) holds the six middle rows — `range`,
`rangeShape`, `approach`, `areaRadius`, `rangeFrom`, `targetScope`. The other
two are siblings on `ActionDefinition`: `targetKind` predates this design and
kept its own field, and `validWhen` got `valid_when_json` of its own because
it is a condition list evaluated by the same machinery as `actorConditions` /
`targetConditions`, not a reach parameter. The split is worth knowing when
reading `resolveActionTargeting`, which resolves only the six.

`targetKind`'s real vocabulary is also wider than the sketch above:
`self`, `current_tile`, `facing_tile`, `facing_or_current_tile`, `item`,
`living`, `item_nearby`, `living_nearby`, `point`, `inventory`. The
`*_nearby` pair is what "aim at a thing up to 5 tiles away" desugars to, and
`point` was added by step 4 for reticle-placed area attacks.

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
| poke / fix an item          | `item, range 5, adjacent, walk_adjacent` | out-of-range → enqueue _path-adjacent → execute_ via `pending-action-storage`          |
| pick one item (vs pick all) | `item, range 5, walk_adjacent`           | per-item button already emits `data-target-item-id`; keep a bulk "pick all" separately |
| firebolt / bow on an NPC    | `living, range from item, line, none`    | action-first aiming; in-range livings highlight                                        |
| fireball on a location      | `point, radius, areaRadius N, none`      | reticle + ring preview; hits all livings in radius                                     |
| longbow > shortbow          | same `attack`, `rangeFrom: "item"`       | range pulled off the weapon item class                                                 |

The two `walk_adjacent` rows shipped at range 5, not the range 1 sketched
here: the point of walking into range is that you may point at something
far away, so the reach that matters is how far you may _choose_ from, and
`adjacent` describes where the action resolves. Rows 3 and 5 remain
partly unbuilt — see step 4's remaining list.

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

**Neither half is built.** Reach came from ranges and approaches instead, so
the pressure that motivated a facing-sector view never arrived — nothing on
the client consumes `facing_tile` to this day. Picking within a tile is a
plain ungrouped list in the tile inspector; it stays usable only because no
world yet piles enough identical entities on one square to need collapsing.
Both remain the right answer if that changes.

## Keeping the UI from exploding

Layered, each cutting the item × action cross-product:

1. **`validWhen` gating** — offer only actions whose preconditions hold
   (evaluated by `action-logic-interpreter`). Most of the grid vanishes:
   `fix` appears only on a damaged item, `attack` only on a living in
   range. ✅ step 3.
2. **Commit-one-axis** — one list at a time (see the two flows). ✅ the tile
   inspector is target-first, the aim row action-first; neither renders the
   other axis.
3. **Group & collapse** identical entities, expand on demand. ❌ not built.
4. **A small action hotbar** for the few armed/combat actions, so combat
   never scans the detail panel. ✅ shipped as the armed-action aim row
   (`aimActiveRowHtml` in `client-aiming.js`), which lists point-targeted
   actions and grows a Bag button for inventory-scoped targets.

## Discoverability — surface affordances, don't list them

"The player discovers that this action works well here" is the same
`validWhen` / effectiveness data, expressed as **feedback** instead of a
**menu**:

- **Highlight valid targets** for the armed/held action — a damaged item
  pulses while the repair hammer is held; an in-range living outlines for
  the bow; low-HP enemies glow for a finisher. ✅ two highlighters landed:
  `updateItemHighlights` rings world items a satisfied-`validWhen` action
  applies to, and `updateAimTargetHighlights` pulses every valid target
  while an action is armed. Effectiveness-based highlighting (the finisher
  glow) is not built — it needs a notion of effectiveness beyond
  "applicable", which no action carries yet.
- **Context-rank** the panel — float `fix` to the top when the item is
  damaged; mark `firebolt` "effective" when the target is weak to fire.
  ⚠️ ranking landed as `rankActionsByContext`, then regressed: demoting the
  tile dialog removed its only caller and the function was pruned with it.
  The palette groups by category and ranks nothing. See TODO.md. The
  "effective" marking has the same missing prerequisite as the finisher glow.
- **Reveal-on-condition** — actions hidden until relevant double as both the
  discovery mechanism and the scalability mechanism: the list stays short
  because it shows only what currently applies, and new situations reveal
  new verbs. ✅ this is what `validWhen` gating does in practice.
- **Result hints via toasts** — the localized `toast_message_key` system can
  carry "super-effective"-style feedback, closing the learn-by-doing loop.
  ✅ the mechanism is in place and used for hit/kill/miss variants
  (`livingEffect.toasts`); nothing yet phrases a hint as guidance.

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
enforcement. (The context-ranking part of this step has since regressed —
see the discoverability note above and TODO.md.) The **valid-target
highlight** is a pulsing gold ring on the
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

Steps 1–2 were the highest leverage, and landing them first proved out: they
made the whole interaction "point at a place or thing; the game resolves
reach and pathing", which is what the manipulation cases needed and what
eliminated the moving-target race — before any combat-aiming UI existed.

## What is left

Consolidated from the steps above, roughly in order of how much each is
missed:

- **Item-derived range** (`rangeFrom: "item"`). The server resolves it
  (`resolveEffectiveActionRange`); the client's `actionEffectiveRange` still
  reads the action's own range, and no item carries a range stat — so no
  longbow-beats-shortbow yet. This is the one field of the core model that
  is specified, half-wired, and unused.
- **Action-first aiming for `line`.** Firebolt is target-first (click the
  living, press the button). The highlight-and-tap/cycle mode described
  under "Two aiming flows" exists only for `radius`.
- **PvP and friendly fire.** Fireball hits NPCs only; area effects have no
  story for players yet, and `livingEffect.targetKinds` / `allowSelf` are
  the levers when they do.
- **Grouping a crowded tile**, and the facing-sector disambiguation it pairs
  with — both unbuilt, neither yet needed.
- **Effectiveness**, as distinct from applicability: the finisher glow, the
  "super-effective" mark, and guidance toasts all wait on actions carrying
  some notion of how well they suit a target.
