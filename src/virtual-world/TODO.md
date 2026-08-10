# TODO — virtual world backlog

This file consolidates three lists that used to live separately: item-class
visual customization (`TODO.md`), dynamic living types (`TODO-living.md`),
and the targeting/combat/UI follow-ups (`TODO-followups.md`). Statuses were
re-checked against the code on 2026-08-10; items that had since been
implemented are dropped, and the ones below are what survived that check.

Nothing here is blocking. It is the honest set of open caveats, deferred
features, and things worth eyes-on, ordered roughly by how concrete and
cheap each is to address.

Neighbouring documents, so this one stays a backlog rather than a
catch-all:

- [TODO-arch.md](TODO-arch.md) — scalability and platform architecture,
  plus the runtime primitives that work depends on.
- [DESIGN-targeting.md](DESIGN-targeting.md) — the targeting/aiming design
  and its own remaining steps.
- [DOC-authoring-worlds.md](DOC-authoring-worlds.md) — authoring placements
  and linked worlds without code.

## Highest priority (concrete, low-effort)

### Panel context-ranking regression

`DESIGN-targeting.md` step 3 added `rankActionsByContext` — float a
`validWhen`-gated action (present only when relevant) to the top of the
action list. When the tile dialog was demoted (UI phase 3) that was its only
caller, and the function was pruned with it; a grep for the name now returns
nothing anywhere in the client. The action palette groups by category but no
longer surfaces the contextually-relevant action first. Restore it inside the
palette's per-category ordering.

### `wieldedWeapon` hardcodes `left_hand`/`right_hand`

`wieldedWeapon` in `fight-helpers.ts` scans a literal
`["left_hand", "right_hand"]` for a weapon, so all of combat — effective
weapon class, attack range, the ranged/melee split — silently assumes the
built-in biped slot layout. A creator's quadruped, bird, or any class whose
hand-equivalent slots are named otherwise can never wield anything.

The fix already exists and is unused: `getSlotIdsWithTag(livingClass, "hand")`
and `getItemsInSlotsWithTag` in `world-domain.ts` answer exactly this
question from slot tags, which every built-in slot definition already
carries. This is the clearest remaining instance of the
generalize-hardcoded-behavior initiative, and it is a small change.

### Browser pass over the UI

Most of the UI work was verified only headlessly (data + code) because
`/virtual-world/play` needs session-cookie auth. Phase 3 already surfaced one
real regression this way (the `bury` bug). Still unconfirmed in a real
browser:

- Action palette: grouping, 🎯 aim badges, arm → glowing target → tap, the
  target chooser on a crowded tile, the demoted (inspector-only) tile dialog.
- The reticle aiming (fireball), the aim-target highlight rings, and the aim
  banner folded into the active-actions panel (phase 4).
- The valid-target highlight (damaged item / corpse glow) and its pulse.

## Combat paths never observed live

- **Fireball multi-target** — only ever hit one NPC; a 2+ blast was never
  staged.
- **Melee weapon (sword, range 1)** and **unarmed** fight paths — only the
  ranged longbow was driven end to end.
- **Ranged NPC engagement** — fresh archers are confirmed armed (shortbow
  weaponClass 3 / weaponRange 5), but an archer aggroing at range and
  shooting a player was never observed (spawn distances didn't cooperate).

## Deferred features

### Combat and targeting

- **Existing worlds don't pick up NPC/manifest changes.** `npc_archer` only
  appears in freshly-seeded worlds; existing worlds keep their saved NPCs
  (including the pre-fix unarmed archers). A self-healing "re-equip a class's
  `defaultItems` weapons on NPC load if missing from its slots" backfill
  would fix both — same pattern as other self-healing backfills in the
  codebase. Related: a world reset (TODO-arch item 13) would subsume it.
- **Action-first aiming for `line`.** `firebolt` is still target-first; the
  design's highlight-and-tab single-target aiming mode was not built.
- **PvP / friendly-fire.** `fireball` strikes NPCs only; players in the blast
  are not hit. `livingEffect.targetKinds` / `allowSelf` are the levers.
- **NPCs don't retaliate when attacked.** Only `aggressive` classes
  initiate; a peaceful NPC you attack won't fight back. The `combatant`
  class flag governs whether a living may fight at all, but nothing turns
  "was hit" into "now fighting".
- **Two pick paths.** The palette's individual `pick_item` and the 📦 Pick
  HUD button (pick-all) coexist — intended, but redundant.

### Item class visuals

Item classes pick a visual **style** from a fixed menu of client mesh
recipes (`ITEM_VISUAL_STYLE_SPECS`), plus a size and a color — which is what
the original phase-2 list mostly wanted, achieved without creator-authored
geometry: a new sabre is `blade` in another color, no client work. What that
approach still cannot express:

- Parametric primitives (Box/Sphere/Cylinder with creator-set dimensions)
  rather than a fixed recipe menu.
- Composite shapes assembled from parts (flower = stem + head).
- Uploaded icons, images, textures, or 3D models — this one needs the asset
  pipeline from TODO-arch item 8 before it is even reachable.

Each new _style_ is still a client code change; only style/size/color
combinations are free. That tradeoff has held up well so far — revisit if
creators start asking for shapes the menu cannot approximate.

### Living classes

- **Slot-tag capability gating.** Beyond the `wieldedWeapon` bug above,
  nothing gates gameplay on _where_ an item sits: an axe chops identically
  from the bag or a hand. Requiring a `hand`-tagged slot would make equipping
  meaningful, and the helpers already exist.
- **Item-side equip validation is modelled but unused.** `accepts` on a slot
  definition, `slotAcceptsItemType` and `canEquipItemInSlot` all exist and
  are wired into the equip path (`item-action-helpers.ts`) — but no built-in
  living class declares `accepts`, so every slot accepts everything in
  practice. Matching an item's own tags against a slot (rather than listing
  item types) has no data model yet.
- **Slot ordering** is alphabetical; class-definition order would be better
  once a class has slots whose natural order isn't alphabetical.
- **Per-class inventory panel layouts** / slot grouping (body vs. pack).
- **Advanced value effects** — fatigue affecting move speed, warmth
  affecting world interactions. `fatigue` is written (follow costs 1/tick,
  actions can declare `fatigueCost`) but nothing _reads_ it to change
  behavior.
- **Collapsible/grouped NPC value display** — deferred until a living class
  has enough slots/values to need it.

## Design tradeoffs / smaller limitations

- **Touch actions can't reach an item on a non-walkable tile.**
  `walk_adjacent` resolves the target only once the actor stands on the
  item's own tile, so the old oak, a door on a wall, a portal on a blocked
  square and every other fixture is unreachable for fix/break/bury — the
  approach walks until `APPROACH_ACTION_MAX_MS` and gives up. `examine` was
  fixed by making it a no-approach action that resolves any item within
  reach; the touch actions would need approach to stop at an _adjacent_ tile
  rather than the target's own tile.
- **`rangeFrom: "item"` is wired only for `fight`.** Other actions could
  derive range from a held item but don't, and the client's
  `actionEffectiveRange` still reads the action's own range regardless — so
  there is no longbow-beats-shortbow anywhere yet.
- **`defaultItems` "wieldable" is weapon-only.** Weapons auto-equip to a hand
  slot; every non-weapon default item goes to the bag (no armor→leg, etc.).
- **Tile dialog still shows the container "Open" button** — a small
  inconsistency with "pure inspector."
- **Two separate ground-ring highlight systems** (contextual glow + aim
  targets) that could visually overlap.
- **Mis-tap while aiming is silent** — tapping an empty tile stays armed with
  no "nothing there" feedback.

## Recurring operational friction (not code bugs)

- **Init-timeout self-heal on every deploy** — routes 404/flap for a bit
  before warming (aiwebengine's 5s init limit); slows verification. Each new
  DB column (`targeting_json`, `valid_when_json`, `default_items_json`) adds
  to it.
- **Frequent bearer-token expiry** and intermittent `/play` cookie-auth made
  headless read-back flaky throughout.
- **Class-DB-persistence handled inconsistently.** The built-in-class code →
  DB-seeded-row reconciliation uses four different patterns:
  adopt-over-derived (action targeting), fill-if-missing (validWhen), full
  resync (living classes), and manifest merge (world classes). It works, but
  a creator customizing a built-in could hit surprising interactions; worth
  unifying someday.

## Unbalanced / placeholder values

Not tuned, just chosen to make features work:

- Weapon stats — sword/shortbow/longbow weaponClass 4/3/4, weaponRange
  1/5/10.
- Fireball areaRadius 2, range 8; firebolt range 8.
- `npc_archer` — count 5, aggressive, in every wild-world manifest (5
  aggressive archers per world may be a lot).
- Level cost — a level costs its own number × 1000 experience, against
  action awards of 3–30 per success.

## Appendix: the inventory selector contract

Not a TODO — a contract worth keeping written down, carried over from
`TODO-living.md`.

A "selector" addresses either a specific living slot or the bag:

- A living slot: any string matching a slot id on the living's `slots` map
  (e.g. `left_hand`, `right_hand`).
- The bag: `"inventory"` (canonical/documented) or `"bag"` (equivalent
  alias, kept indefinitely — not scheduled for deprecation). Both are
  accepted everywhere a selector is read (`isBagSelector` in
  `assets/server/item-action-helpers.ts`).

Every response that includes a living's `inventory` (or, for NPCs, top-level
`slots`/`bag`) also includes `inventory_slot_ids` (the living's current slot
ids) and `inventory_selectors` (`inventory_slot_ids` + `["inventory",
"bag"]`), built by the shared `buildInventorySelectors` helper in
`assets/server/world-domain.ts`.
