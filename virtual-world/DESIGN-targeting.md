# Design — targeting and aiming

How a player points an action at something. Every action class carries a
data-driven **targeting spec**, and the client derives an **aiming mode** from
it. One system serves manipulation (poke, fix, pick), single-target ranged
attacks (firebolt) and area attacks (fireball), without the UI becoming an
item × action grid. What is not built yet is in [TODO.md](TODO.md).

## Why reach belongs to the action

Selection is not tile-exact. If it were, a target that moved between the click
and the button press would leave the panel stale and the player racing it. So
the tile inspector gates each button by that action's own effective range, and
an out-of-range target for a `walk_adjacent` action makes the actor close the
gap rather than refusing.

The design rests on pieces that serve other purposes too:

- The player's `rotation` and `getTargetTileFromRotation()` / `facing_tile`
  in `server/current-world-state.ts` — "the tile I'm looking at".
- Entity-targeted actions round-tripping a specific id (`data-target-item-id`
  → `postItemTargetedAction`, `data-target-living-id` →
  `postLivingTargetedAction`); the MCP `virtualWorldAct` tool forwards both, so
  the tool path aims like the browser does.
- `pending-action-storage.ts`, the delayed-action queue — also the home of
  "walk into range, then act".
- `action-logic-interpreter.ts` (with `action-registry` and
  `action-class-storage`) for per-action conditions and effects — also "when is
  this action offered" (`validWhen`).

## The targeting spec

| field         | meaning                                  | examples                                              |
| ------------- | ---------------------------------------- | ----------------------------------------------------- |
| `targetKind`  | what you aim at                          | `self` · `item` · `living` · `point` · …              |
| `range`       | reach, in tiles                          | poke/fix = 5, firebolt = 8                            |
| `rangeShape`  | how range is measured and drawn          | `adjacent` · `line` (ranged single) · `radius` (area) |
| `approach`    | walk into range before acting?           | `walk_adjacent` (melee, manipulate) · `none` (ranged) |
| `areaRadius`  | for an area action, tiles affected       | fireball = 2                                          |
| `rangeFrom`   | who supplies `range`                     | `action` · `item` (a weapon's own range)              |
| `targetScope` | where an item target may live            | `world` (default) · `inventory` · `any` (examine)     |
| `validWhen`   | precondition for **offering** the action | item is damaged, target is a corpse                   |

`ActionTargeting` (stored in `targeting_json`) holds `range`, `rangeShape`,
`approach`, `areaRadius`, `rangeFrom` and `targetScope`;
`resolveActionTargeting` / `resolveEffectiveActionRange` in
`action-registry.ts` resolve them, with a default derived from the action's
`targetKind`. `targetKind` and `validWhen` are fields of `ActionDefinition`
itself: `validWhen` (`valid_when_json`) is a condition list evaluated by the
same machinery as `actorConditions`/`targetConditions`, not a reach parameter.

`targetKind`'s full vocabulary is `self`, `current_tile`, `facing_tile`,
`facing_or_current_tile`, `item`, `living`, `item_nearby`, `living_nearby`,
`point` and `inventory`. The `*_nearby` pair is "aim at a thing within reach";
`point` is a reticle-placed area target.

Range is resolved server-side at action time and is the authority; the client's
aiming preview is advisory.

## Two aiming flows

**You commit to one axis before seeing the other**, so the client never
renders items × actions at once.

- **Target-first (inspect → act)** — for manipulation and exploration. Click a
  place or thing; the tile inspector lists that target's valid actions. For a
  `walk_adjacent` action out of reach, the actor walks there and acts:
  `resolvePendingActionsForWorld` steps it toward the target's current tile
  each world tick (`pursuit-movement.ts`) and re-runs the action on arrival,
  bounded by `APPROACH_ACTION_MAX_MS`. An approach shows in the active-actions
  panel with a Stop button (`cancel_approach`). Picking one item is `pick_item`;
  the tile-level "pick all" stays a HUD button.
- **Action-first (arm → aim)** — for area attacks. The aim row
  (`client-aiming.js`) lists point-targeted actions; arming one shows a reticle
  with a disc sized to `areaRadius`, clamped to range; click casts, Esc or
  right-click cancels. The row grows a **Bag** button for inventory-scoped
  targets.

Ranged single-target attacks (`line`, firebolt) are target-first: click the
living, press the action. `applyRangedHitToLiving` (`fight-helpers.ts`) applies
one strike with the fight tick's per-round math, so the fight loop is
untouched; fireball applies it to every NPC within `areaRadius` (Chebyshev) of
the reticle and aggregates hits, kills and XP into one toast.

## Examining

`examine` is the read-only verb. It answers with the facts the tile inspector
shows — class label, kind, hit points, armor and weapon class, container fill,
portal destination — as `examined_item` (`buildItemInspection` in
`item-registry.ts`), rendered by `showExaminedItemPanel`. It declares
`targetScope: "any"` (`resolveTargetedItem` in `tree-action-helpers.ts` searches
the tile, the tiles within reach, then the actor's slots and bag) and
`approach: "none"`, because fixtures — the old oak, a door in a wall, a portal
on a blocked square — sit on non-walkable tiles that an approach could never
reach. The inventory panel offers inventory-scoped actions per carried item
(`inventoryTargetActionsForItem`).

## Keeping the UI small

- **`validWhen` gating** offers only actions whose preconditions hold: Fix on a
  damaged item, Bury on a corpse. It is evaluated client-side
  (`actionValidForTarget` mirrors the server's `evaluateTargetConditions`) to
  hide buttons; the action's handler stays the authority. New situations reveal
  new verbs, so the gating is also how actions are discovered.
- **Commit-one-axis**, as above.
- **Highlights** surface opportunities without a menu: `updateItemHighlights`
  rings world items an applicable action targets, and
  `updateAimTargetHighlights` pulses every valid target while an action is
  armed.
- **Result toasts** (`livingEffect.toasts`, localized `toast_message_key`)
  carry hit, kill and miss feedback.

## Disambiguation

Two different problems, needing different UI:

- **Which tile** (things spread across space) → direction and facing. A
  sector view keyed off `facing_tile` would keep a moving target in scope while
  it is roughly in front of the player.
- **Which of several on one tile** → a list, ideally grouped (`3× goblin`).

Reach comes from ranges and approaches, so neither is needed yet: nothing on
the client consumes `facing_tile`, and the tile inspector's list is ungrouped.
