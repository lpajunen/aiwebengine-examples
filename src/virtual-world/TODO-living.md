# Dynamic Living Types Plan

## Goal

Continue the dynamic type system beyond items and actions so players and NPCs can both use dynamic living types. A living type should define:

- which equipment or body slots a living instance has
- which mutable living values the instance tracks, such as tiredness
- defaults and validation rules for those values

The design should reuse the same class-vs-instance split already used by dynamic item types.

## Current Constraint

The current model is still hard-coded around:

- `left_hand`
- `right_hand`
- `inventory`

That shape appears in shared domain helpers, player persistence, NPC persistence, server action logic, and client UI. Adding dynamic living types only at the behavior layer would not be enough, because persistence and normalization would still collapse everything back into the old fixed slot model.

## Target Model

Introduce a first-class living registry, parallel to the item registry.

Example class shape:

```ts
type LivingClassRecord = {
  id: string;
  kind: "player" | "npc" | "creature";
  slotDefinitions: Array<{
    id: string;
    labelKey: string;
    fallbackLabel: string;
    accepts?: string[];
    tags?: string[];
  }>;
  valueTemplate: Record<string, unknown>;
  valueSchema?: Record<
    string,
    { kind: "number" | "string" | "boolean"; min?: number; max?: number }
  >;
};

type LivingInstance = {
  class_id: string;
  slots: Record<string, InventoryItem | null>;
  bag: InventoryItem[];
  values: Record<string, unknown>;
};
```

This mirrors the existing item system:

- class definitions provide defaults and metadata
- instances carry mutable runtime state

## Design Principles

### 1. Use class definitions for anatomy and stats

The living class should define:

- available slots
- default values
- validation rules

Example:

```ts
human.valueTemplate = {
  fatigue: 0,
  warmth: 100,
};

human.valueSchema = {
  fatigue: { kind: "number", min: 0, max: 100 },
  warmth: { kind: "number", min: 0, max: 100 },
};
```

This gives predictable initialization, validation, and future editor/admin UI support.

### 2. Use instance values for mutable living state

Living instances should store current values separately from class defaults. For example:

- current fatigue
- current warmth
- future mood, hunger, focus, injuries, and similar values

This is directly analogous to item instance state such as a kantele tracking how many times it has been played.

### 3. Use generic slots, not fixed columns

Do not model new anatomy by adding fields like:

- `third_hand`
- `front_leg`
- `back_leg`

Dynamic slot sets belong in JSON-backed slot maps because the set of slots depends on the living type and may change over time.

### 4. Use slot tags for gameplay logic

Slots should support tags so behavior can depend on capability instead of anatomy-specific names.

Example:

```ts
slotDefinitions: [
  { id: "left_hand", tags: ["hand", "manipulator"] },
  { id: "right_hand", tags: ["hand", "manipulator"] },
  { id: "back", tags: ["carry"] },
];
```

Then actions can ask for an item in a `hand` slot instead of directly checking `left_hand` and `right_hand`.

## Storage Direction

Add generic persistence fields for both players and NPCs:

- `living_class_id`
- `slots_json`
- `bag_json`
- `values_json`

Do not try to represent dynamic slots as individual table columns.

Do not add compatibility logic for the old fixed-slot model. The target system should assume the new dynamic living model is the only supported shape.

If the database is empty, bootstrap the living classes and default seeded values from the built-in definitions in code, in the same spirit as the current seeded item and world setup.

## Shared Abstractions To Add

Add a living registry similar to the item registry.

Suggested responsibilities:

- built-in living classes such as `human`, `villager`, `wolf`, or similar defaults
- dynamic loading and persistence of living class rows
- lookup helpers for slot definitions and value templates

Add shared domain helpers for normalized living state.

Suggested helper responsibilities:

- normalize living instances
- build default slots from class definitions
- seed default slots and values from class definitions when no stored instance exists yet
- expose equipped items generically
- query slots by tag or slot id

## Bootstrap Strategy

On an empty database:

- seed built-in living class rows from code
- create player and NPC living instances using class-defined default slots and values
- seed any initial NPC classes and NPC living state from the currently implemented world bootstrap logic

The database should be treated as disposable during this change. No legacy read path or old-schema adapter is required.

## Implementation Path

### Phase 1: Living registry

Add `living-registry.ts` and define the built-in default living classes.

### Phase 2: Shared living-state shape

Introduce a new normalized living-state abstraction in shared domain code and remove the old fixed-slot assumptions.

### Phase 3: Persistence rewrite

Update player and NPC persistence to store:

- class id
- slot map
- bag items
- living values

Initialize these from living class defaults whenever the database has no instance row yet.

### Phase 4: Behavior rewrite

Replace direct slot access with generic helpers such as:

- `getEquippedItems(living)`
- `getItemsInSlotsWithTag(living, "hand")`
- `hasEquippedActionSource(living, actionId)`

This should cover both player actions and NPC behavior.

### Phase 5: Client UI migration

Render slots dynamically in the inventory UI instead of assuming exactly two equipped hands.

## Refactoring Targets

These areas are likely to need changes first:

- shared domain normalization
- player inventory persistence
- NPC persistence
- item action helpers
- NPC tick helpers
- current-world snapshot building
- client inventory normalization
- client inventory rendering

## Things To Avoid

- Do not add more fixed slot columns to the schema.
- Do not keep action logic tied to literal slot names.
- Do not fork separate living-state models for players and NPCs.

Players and NPCs should share one living-state abstraction, with different class ids and behavior layered on top.

## Smallest Safe First Implementation

Implement in this order:

1. Add the living registry and a built-in human class.
2. Add shared living-state normalizers and default seeding helpers.
3. Add `living_class_id`, `slots_json`, `bag_json`, and `values_json` to player and NPC storage.
4. Seed built-in living classes and default player/NPC living state when the database is empty.
5. Rewrite server action resolution to generic equipped-item helpers.
6. Migrate the client inventory UI to render dynamic slots.

This keeps the model coherent on the server before widening the UI changes.

## Pause Snapshot (2026-07-16)

Implementation has progressed substantially, but the migration is not complete.
Use this section as the resume backlog.

### Already Landed (High-Level)

- Living class registry, slot/value templates, and persisted living fields are in place.
- Server item/tree action paths now support dynamic `slots` + `bag` inventory shape.
- Client inventory panel renders dynamic slots and bag items (no fixed two-hand-only rendering).
- NPC client state and tile detail now include dynamic slots/bag/values.
- MCP and HTTP responses now include `inventory_slot_ids` and `inventory_selectors` in core world and action flows.

### Remaining Issues

- Dynamic slot/tag semantics are only partially enforced in gameplay logic; most behavior still checks item presence rather than slot capability tags.
- Living values are displayed, but there is no schema-driven formatting/units/ranges or UX for important stats.
- Runtime/tool contracts still have some legacy naming semantics (`inventory` selector alias) that should be normalized/documented clearly for long-term API stability.

## Resume Backlog

### P0 - Finish Core Dynamic Model — DONE (2026-07-17)

All four items landed. `slots` + `bag` (+ `values`) is now the only living-state shape produced or accepted anywhere on the server; the `left_hand`/`right_hand`/`inventory` alias fields are gone from every load/save/tick/response path (the string literals `"left_hand"`/`"right_hand"` that remain are legitimate slot IDs — in `living-registry.ts` class definitions, i18n keys, and generic slot lookups like `slots.left_hand` — not fixed fields). Two new shared helpers landed in `src/virtual-world/assets/server/world-domain.ts`: `consumeLivingItemsByType` and `buildInventorySelectors`.

- [x] Removed fixed-slot assumptions from crafting logic in `src/virtual-world/assets/server/crafting-helpers.ts` — now uses `getAllLivingItems`/`consumeLivingItemsByType` from `world-domain.ts`. Also fixed a latent bug where crafted outputs were pushed to `.inventory` instead of `.bag` (previously masked by the alias).
- [x] Removed legacy alias writes (`left_hand`, `right_hand`, `inventory`) from `item-storage.ts`, `npc-storage.ts`, `npc-tick-helpers.ts`, `world-bootstrap.ts`, `page-bootstrap.ts`, `item-action-helpers.ts`, `current-world-state.ts` — `slots` + `bag` is now the only authoritative state read or written anywhere.
- [x] Audited and tightened NPC normalization paths in `npc-storage.ts` and `npc-tick-helpers.ts`. `npc-tick-helpers.ts` was the worst offender (hardcoded two-hand shape rebuilt every tick, no living-class awareness at all) — it now imports `getLivingClass`/`createLivingSlotsFromDefinitions`/`normalizeLivingState` and normalizes per-tick state the same class-aware way `npc-storage.ts` already did at load/save time. `world-bootstrap.ts`'s `ensureWorldNPCs` (upstream NPC seeding/repair path, not literally named in the original bullet but independently reintroducing the same anti-pattern) was cleaned up too.
- [x] Consolidated selector-building logic into `buildInventorySelectors` in `world-domain.ts`, replacing four independent copies in `current-world-state.ts`, `http-handler-helpers.ts`, `tool-handlers.ts`, and `virtual-world.js` (`withInventorySelectors`).

Deliberately deferred (not part of this pass, tracked below): full slot-tag-based capability logic, canonical class-definition-order slot sorting (still alphabetical), and NPC-snapshot/client UI changes — client-side files were not touched since they already prefer `slots`/`bag` and only fell back to the legacy fields when `slots` was absent, which no longer happens.

### P1 - Behavior Correctness and Slot Semantics — DONE (2026-07-17)

The audit behind this pass found the backlog's premise didn't quite match the code: no action anywhere hardcoded a literal slot ID for eligibility — an item works identically whether it's in the bag or equipped, because no capability restriction exists at all. So "un-hardcoding" wasn't the actual gap; the real gap was that the query plumbing for capability-based checks didn't exist yet.

- [x] Added `getSlotIdsWithTag`/`getItemsInSlotsWithTag` to `src/virtual-world/assets/server/world-domain.ts` — generic slot-tag query helpers, following the existing `canEquipItemInSlot`-style convention of taking `livingClass` as a parameter. **Deliberately not wired into any gameplay eligibility check in this pass** — doing so (e.g. requiring tree/kantele actions' source item to be in a `hand`-tagged slot) would be a real gameplay behavior change, not a refactor, and needs its own review when there's an actual design for it.
- [x] Gave the new helper one safe, non-gameplay caller: `buildWorldNPCSnapshot` in `npc-storage.ts` now derives its `left_hand`/`right_hand` display fields via `getItemsInSlotsWithTag(..., "hand")` instead of hardcoding `slots.left_hand`/`slots.right_hand` — same output today, but no longer silently blind to a living class with different or additional hand-tagged slots.
- [x] Consolidated three call sites that duplicated `getAllLivingItems`'s slots+bag iteration inline: `current-world-state.ts`'s `getAvailableWorldActions`, `page-bootstrap.ts`'s `ensureStarterKit`, and `item-action-helpers.ts`'s `grantAllItemsForUser`. Behavior-equivalent, pure de-duplication.
- [x] Fixed a real bug found while scoping "regression coverage for logic-effect mutation flows": `grantAllItemsForUser` (the `/virtual-world/cheat-items` admin action) created items with no `state` field, unlike the crafting and normal item-spawn paths. `action-logic-interpreter.ts` skips all condition checks when `item.state` is missing, so a cheat-granted kantele bypassed the `tuned`/`playsLeft` checks and playing it corrupted state to `playsLeft: -1`. Fixed by seeding `state` via `getItemStateTemplate`, matching `crafting-helpers.ts`/`item-storage.ts`.

Deliberately deferred, not part of this pass:

- **Item-side tag/capability equip validation** — neither built-in living class (`player_human`, `npc_human`) sets `accepts` on any slot, and there's no item-side tag/capability field to match against. Building this out now would mean inventing a data model with zero current consumers; revisit if/when a concrete need shows up.
- **A test framework** — this repo has no test infrastructure at all (confirmed: no framework in `package.json`, no test files anywhere). The one concrete bug the audit surfaced was fixed directly instead of building test scaffolding around it.

### P1 - API Contract Cleanup — DONE (2026-07-17)

- [x] Both `"inventory"` and `"bag"` are kept indefinitely as equivalent bag-selector aliases (already true server-side via `isBagSelector` in `item-action-helpers.ts` — no deprecation, cheap to keep). `"inventory"` is the documented/canonical one. `buildInventorySelectors` in `world-domain.ts` now advertises both (`inventory_selectors` = slot ids + `["inventory", "bag"]`), and the MCP tool-schema descriptions in `runtime-registration.ts` now mention both.
- [x] Closed the two response-path gaps the audit found where `inventory` was returned without selector metadata: the cheat-nickname `presence_update` stream broadcast (both the HTTP path in `virtual-world.js`'s `setNicknameHandler` and the MCP path in `tool-handlers.ts`'s `virtualWorldSetNicknameToolHandler`), and the `/virtual-world/npcs` endpoint (`buildWorldNPCSnapshot` in `npc-storage.ts` now includes `inventory_slot_ids`/`inventory_selectors` per NPC, additive fields alongside the existing `slots`/`bag`).
- [x] Documented the contract — see "Inventory Selector Contract" below.

### P2 - UI Quality and Clarity — DONE (2026-07-17)

The audit behind this pass found `LIVING_REGISTRY` (including each value's `kind`/`min`/`max`) already reaches the client via `page-bootstrap.ts`, but nothing ever read `min`/`max` — `formatLivingValue()` just type-sniffed the raw value, and no meter/progress CSS existed anywhere.

- [x] Schema-aware formatting + min/max meter: added `getLivingValueSchemaEntry`/`renderLivingValueDisplay` to `src/virtual-world/assets/public/client.js` — numeric values with both `min` and `max` defined render as a compact meter (track + fill + `value/max` text), everything else falls back to the existing plain-text `formatLivingValue`. New CSS in `src/virtual-world/assets/public/styles.css` (`.living-value-meter*`). Wired into both the player inventory panel and the NPC tile-detail panel's value rows.
- [x] i18n entries — see "Internationalization / Labels" below.
- [x] NPC detail panel readability: each NPC's rows (name, class, slots, bag count, values) are now wrapped in a `.tile-npc-entry` block with its own `.tile-npc-name` header, visually separated by a top border — fixes the real issue (multiple NPCs on one tile concatenating into one undifferentiated list). **Not built: collapsible/expand-toggle groups** — deliberately skipped. Today's living classes have only 2 slots + 1 value each; collapse/toggle interactivity for that little content would be over-engineering. Revisit if a living class grows substantially more complex.
- **Deliberately deferred**: grouping/prioritization of critical values. Only one living value (`fatigue`) exists anywhere in the registry today — there's nothing to group or prioritize yet. Revisit once a second value type is actually added.

### P2 - Internationalization / Labels — DONE (2026-07-17)

- [x] `living.value.*` — audited, nothing was missing: `fatigue` (the only value key any living class defines) and `warmth` (pre-added, forward-looking) were already present in both `en`/`fi`.
- [x] `living.slot.*` — these were completely absent from `src/virtual-world/assets/public/i18n.js` despite `living-registry.ts` referencing exactly those `labelKey`s (`living.slot.left_hand`/`living.slot.right_hand`). Added for both `en`/`fi`, reusing the wording from the old (unused) `inventory.left_hand`/`inventory.right_hand` keys. Nothing was broken before this — slot labels were already silently falling back to the server-supplied `fallbackLabel` — but they weren't actually localized.
- [x] Fallback labels respected everywhere: slots already worked end-to-end (`slotDef.fallbackLabel` correctly threaded through `t()`). Values did not — `livingValueLabel()` in `client.js` already tried to read `schemaEntry.labelKey`/`fallbackLabel`, but `LivingValueSchemaEntry` (`src/virtual-world/assets/server/world-domain.ts`) had no such fields. Added optional `labelKey?`/`fallbackLabel?` to the type (mirroring `LivingSlotDefinition`) and populated them for `fatigue` on both living classes in `living-registry.ts`.
- **Noted, not fixed**: the old `inventory.left_hand`/`inventory.right_hand` i18n keys are now fully unused (nothing reads them) — left in place since removing unused keys is a lower-risk, separate cleanup; candidate for the P3 pass below.

### P3 - Technical Debt and Consistency — DONE (2026-07-17)

- [x] Deleted dead legacy normalization code in `src/virtual-world/assets/server/world-domain.ts`: the fixed-shape `Inventory` type, `createEmptyInventory()`, and `normalizeInventory()`, plus the legacy `left_hand`/`right_hand`/`inventory`-array fallback branches in `getEquippedItems`, `getBagItems`, `getInventoryTreeActions`, and `replaceLivingItemById`. All confirmed traceably unreachable — every real caller already guarantees a `.slots`/`.bag` shape via `normalizeLivingState` before reaching these functions. Also deleted `item-action-helpers.ts`'s `normalizeLivingInventoryShape`, a redundant third re-implementation of the same defensive coercion, on data that was already normalized by `loadPlayerInventory`.
- [x] Consolidated the real remaining duplication: `savePlayerInventory` (`item-storage.ts`) and `saveWorldNPCs` (`npc-storage.ts`) both manually coerced `slots`/`bag`/`values` before calling `normalizeLivingState` — turns out `normalizeLivingState` already performs the identical defensive coercion internally, so the inline pre-coercion was fully redundant, not just duplicated. Deleted it at both sites (simpler outcome than the originally-planned shared `coerceLivingStateInput` helper — no new abstraction needed). `loadWorldNPCs`'s JSON-parsing-from-DB-row logic is a different shape of problem (parses `slots_json`/`bag_json` strings, not an in-memory coercion) and wasn't part of this duplication.
- [x] Tightened ~15 `any`-typed inventory signatures across 8 server files to the existing exported `LivingState` type (`world-domain.ts`): all `loadPlayerInventory` dependency redeclarations (`current-world-state.ts`, `crafting-helpers.ts`, `http-handler-helpers.ts`, `item-action-helpers.ts`, `page-bootstrap.ts` ×2, `tree-action-helpers.ts`, plus the real implementation in `item-storage.ts`), the read-only consumers (`countItemsByType`, `canInventoryUseTreeAction`, `getInventoryTreeActions` in both `npc-orchestration.ts`/`npc-tick-helpers.ts`, `getAvailableWorldActions`), and the 3 `inventory: any` return fields (`grantAllItemsForUser`, `listItemsForUser`, `getCurrentWorldStateForUser`). Standardized `savePlayerInventory`'s parameter to `unknown` everywhere it's redeclared (was inconsistently `any`/`unknown`) — kept loose on purpose, since it's a genuine domain boundary accepting possibly-malformed input before normalizing.
- [x] Removed the now-fully-unused legacy `inventory.left_hand`/`inventory.right_hand` i18n keys (`en`/`fi`) — confirmed dead since P2 added the real `living.slot.*` keys.
- **Deliberately deferred**: the "canonical slot order" utility. It's a no-op with today's data (both living classes have only `left_hand`/`right_hand`, where alphabetical already matches class-definition order), and implementing it generically means threading `livingClass`/`class_id` through `buildInventorySelectors`'s ~8 call sites plus a signature change to `npc-tick-helpers.ts`'s `getOrderedSlotIds` — real churn for zero visible behavior change today. Revisit once a living class actually needs non-alphabetical slot ordering. (Note: `tiles-and-items.js`'s client-side `getInventorySlotIds` already implements exactly this pattern — class-definition order + alphabetical fallback — and is the reference implementation to follow when this is picked back up.)
- **Explicitly out of scope, follow-up candidates**: `npc-storage.ts`'s composite NPC-plus-living-state records (would need a new `NPCRecord = NPCState & LivingState`-style type, not a drop-in `LivingState` swap) and `tool-handlers.ts`'s generic `context`/`body`/`payload: any` (external tool-call/HTTP envelope types, not inventory-shaped — would need modeling a large per-action response union for comparatively low payoff).

## Inventory Selector Contract

A "selector" addresses either a specific living slot or the bag:

- A living slot: any string matching a slot id on the living's `slots` map (e.g. `left_hand`, `right_hand`).
- The bag: `"inventory"` (canonical/documented) or `"bag"` (equivalent alias, kept indefinitely — not scheduled for deprecation). Both are accepted everywhere a selector is read (`isBagSelector` in `src/virtual-world/assets/server/item-action-helpers.ts`).

Every response that includes a living's `inventory` (or, for NPCs, top-level `slots`/`bag`) also includes `inventory_slot_ids` (the living's current slot ids) and `inventory_selectors` (`inventory_slot_ids` + `["inventory", "bag"]`), built by the single shared `buildInventorySelectors` helper in `src/virtual-world/assets/server/world-domain.ts`. This includes the player world-state/items/item-action/craft/cheat responses (HTTP + MCP), the cheat-nickname `presence_update` stream broadcast, and the `/virtual-world/npcs` snapshot.

## Concrete File Targets To Revisit

- `src/virtual-world/assets/server/crafting-helpers.ts`
- `src/virtual-world/assets/server/npc-storage.ts`
- `src/virtual-world/assets/server/npc-tick-helpers.ts`
- `src/virtual-world/assets/server/current-world-state.ts`
- `src/virtual-world/assets/server/http-handler-helpers.ts`
- `src/virtual-world/assets/server/tool-handlers.ts`
- `src/virtual-world/assets/server/world-domain.ts`
- `src/virtual-world/assets/server/item-action-helpers.ts`
- `src/virtual-world/assets/public/client.js`
- `src/virtual-world/assets/public/i18n.js`
- `src/virtual-world/virtual-world.js`

## Nice-to-Have Ideas (Post-Migration)

- Living class editor UI for slot definitions/value schema in admin panels.
- Visual equipped-item indicators on NPC avatars (not only textual tile detail).
- Per-class inventory panel layouts and slot grouping (for example body/utility/pack).
- Advanced value effects (fatigue impacts move speed, warmth affects world interactions).

## Suggested Resume Order

1. ~~Complete P0 model cleanup and helper consolidation.~~ Done (2026-07-17).
2. ~~Complete P1 behavior correctness and API contract cleanup.~~ Done (2026-07-17).
3. ~~Improve P2 UI/i18n quality.~~ Done (2026-07-17).
4. ~~Address P3 debt.~~ Done (2026-07-17). All of the core dynamic-living-types migration backlog (P0-P3) is now complete; only the deliberately-deferred items noted above and the "Nice-to-Have Ideas" below remain.
