# Dynamic Living Types

## Status: migration complete (2026-07-17)

Players and NPCs share one dynamic living-type model — a living registry
parallel to the item registry, with class definitions (`slotDefinitions`,
`valueTemplate`, `valueSchema`) and per-instance `slots` + `bag` + `values`
state. This replaced the old hardcoded `left_hand`/`right_hand`/`inventory`
shape everywhere it appeared: persistence, action logic, NPC ticking,
crafting, and the client inventory UI. See `living-registry.ts`,
`living-class-storage.ts`, the living-state helpers in `world-domain.ts`,
and the "Living types" editor panel (`page-bootstrap.ts`,
`client-editors.js`). The full phase-by-phase build log (P0-P3) lives in
git history for this file, not here.

## Inventory Selector Contract

A "selector" addresses either a specific living slot or the bag:

- A living slot: any string matching a slot id on the living's `slots` map
  (e.g. `left_hand`, `right_hand`).
- The bag: `"inventory"` (canonical/documented) or `"bag"` (equivalent
  alias, kept indefinitely — not scheduled for deprecation). Both are
  accepted everywhere a selector is read (`isBagSelector` in
  `assets/server/item-action-helpers.ts`).

Every response that includes a living's `inventory` (or, for NPCs,
top-level `slots`/`bag`) also includes `inventory_slot_ids` (the living's
current slot ids) and `inventory_selectors` (`inventory_slot_ids` +
`["inventory", "bag"]`), built by the shared `buildInventorySelectors`
helper in `assets/server/world-domain.ts`.

## Remaining / deferred ideas

Nothing here blocks anything else; revisit if a concrete need shows up.

- Slot-tag-based capability checks — `getSlotIdsWithTag`/
  `getItemsInSlotsWithTag` already exist in `world-domain.ts` but aren't
  wired into any gameplay eligibility check yet (e.g. requiring an axe to
  be in a `hand`-tagged slot to chop). Today any item works identically
  whether it's in the bag or equipped.
- Item-side tag/capability equip validation (matching an item's tags
  against a slot's `accepts`) has no data model yet — neither built-in
  living class uses `accepts`.
- Canonical class-definition-order slot ordering — slots list
  alphabetically today; only matters once a living class has slots whose
  natural order isn't alphabetical.
- Visual equipped-item indicators on NPC avatars (players already show
  this on their own avatar; NPCs don't).
- Per-class inventory panel layouts / slot grouping (e.g. body vs. pack).
- Advanced value effects — fatigue affecting move speed, warmth affecting
  world interactions. Only `fatigue` exists as a living value today and
  nothing reads it yet.
- Collapsible/grouped NPC value display — deferred until a living class
  has enough slots/values to need it (today: 2 slots + 1 value).
