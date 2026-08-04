# TODO — targeting / combat / UI follow-ups

Backlog captured at the end of the targeting → combat → UI-simplification →
weapons work. None of this is blocking; it is the honest set of open caveats,
deferred features, and things worth eyes-on. Ordered roughly by how concrete
and cheap each is to address. See `DESIGN-targeting.md` for the design these
built on.

## Highest priority (concrete, low-effort)

### Panel context-ranking regression

Step 3 added `rankActionsByContext` — float a `validWhen`-gated action (present
only when relevant) to the top of the action list. When the tile dialog was
demoted (UI phase 3) that was its only caller, so it was pruned. The action
palette now groups by category but no longer surfaces the contextually-relevant
action first. That capability quietly disappeared and should be restored inside
the palette's per-category ordering.

### Browser pass over the UI

Most of the UI work was verified only headlessly (data + code) because
`/virtual-world/play` needs session-cookie auth. Phase 3 already surfaced one
real regression this way (the `bury` bug). Still unconfirmed in a real browser:

- Action palette: grouping, 🎯 aim badges, arm → glowing target → tap, the
  target chooser on a crowded tile, the demoted (inspector-only) tile dialog.
- The reticle aiming (fireball), the aim-target highlight rings, and the aim
  banner folded into the active-actions panel (phase 4).
- The valid-target highlight (damaged item / corpse glow) and its pulse.

## Combat paths never observed live

- **Fireball multi-target** — only ever hit one NPC; a 2+ blast was never staged.
- **Melee weapon (sword, range 1)** and **unarmed** fight paths — only the ranged
  longbow was driven end to end.
- **Ranged NPC engagement** — fresh archers are confirmed armed (shortbow
  weaponClass 3 / weaponRange 5), but an archer aggroing at range and shooting a
  player was never observed (spawn distances didn't cooperate).

## Deferred features

- **Existing worlds don't pick up NPC/manifest changes.** `npc_archer` only
  appears in freshly-seeded worlds; existing worlds keep their saved NPCs
  (including the pre-fix unarmed archers). A self-healing "re-equip a class's
  `defaultItems` weapons on NPC load if missing from its slots" backfill would
  fix both — same pattern as other self-healing backfills in the codebase.
- **Action-first aiming for `line`.** `firebolt` is still target-first; the
  design's highlight-and-tab single-target aiming mode was not built.
- **PvP / friendly-fire.** `fireball` strikes NPCs only; players in the blast are
  not hit.
- **Two pick paths.** The palette's individual `pick_item` and the 📦 Pick HUD
  button (pick-all) coexist — intended, but redundant.

## Design tradeoffs / smaller limitations

- **Touch actions can't reach an item on a non-walkable tile.** `walk_adjacent`
  resolves the target only once the actor stands on the item's own tile, so the
  old oak, a door on a wall, a portal on a blocked square and every other
  fixture is unreachable for fix/break/bury — the approach walks until
  `APPROACH_ACTION_MAX_MS` and gives up. `examine` was fixed by making it a
  no-approach action that resolves any item within reach; the touch actions
  would need approach to stop at an _adjacent_ tile rather than the target's
  own tile.
- **NPCs don't retaliate when attacked.** Only `aggressive` classes initiate; a
  peaceful NPC you attack won't fight back.
- **`defaultItems` "wieldable" is weapon-only.** Weapons auto-equip to a hand
  slot; every non-weapon default item goes to the bag (no armor→leg, etc.).
- **`rangeFrom: "item"` is wired only for `fight`.** Other actions could derive
  range from a held item but don't.
- **Tile dialog still shows the container "Open" button** — a small
  inconsistency with "pure inspector."
- **Two separate ground-ring highlight systems** (contextual glow + aim targets)
  that could visually overlap.
- **Mis-tap while aiming is silent** — tapping an empty tile stays armed with no
  "nothing there" feedback.

## Recurring operational friction (not code bugs)

- **Init-timeout self-heal on every deploy** — routes 404/flap for a bit before
  warming (aiwebengine's 5s init limit); slows verification. Each new DB column
  (`targeting_json`, `valid_when_json`, `default_items_json`) adds to it.
- **Frequent bearer-token expiry** and intermittent `/play` cookie-auth made
  headless read-back flaky throughout.
- **Class-DB-persistence handled inconsistently.** The built-in-class code →
  DB-seeded-row reconciliation uses four different patterns: adopt-over-derived
  (action targeting), fill-if-missing (validWhen), full resync (living classes),
  and manifest merge (world classes). It works, but a creator customizing a
  built-in could hit surprising interactions; worth unifying someday.

## Unbalanced / placeholder values

Not tuned, just chosen to make features work:

- Weapon stats — sword/shortbow/longbow weaponClass 4/3/4, weaponRange 1/5/10.
- Fireball areaRadius 2, range 8; firebolt range 8.
- `npc_archer` — count 5, aggressive, in every wild-world manifest (5 aggressive
  archers per world may be a lot).
