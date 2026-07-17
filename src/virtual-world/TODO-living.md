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

### P1 - Behavior Correctness and Slot Semantics

- Add slot-tag query helpers usage in behavior paths so actions can require capabilities (for example any `hand` slot) instead of literal slot IDs.
- Expand equip validation beyond `accepts` item type checks to support tag/capability constraints where needed.
- Ensure all action-condition source-item resolution consistently uses shared living item helper functions.
- Add regression coverage for action flows where item state mutates (logic effects) and must be persisted back to slot or bag correctly.

### P1 - API Contract Cleanup

- Define one explicit selector contract (`inventory` alias vs `bag`) and document it in runtime schema + README notes.
- Ensure every HTTP/MCP response that includes inventory includes selector metadata (double-check infrequent/admin/debug paths).
- Decide whether to keep legacy selector aliases indefinitely or schedule deprecation.

### P2 - UI Quality and Clarity

- Improve living values rendering in `src/virtual-world/assets/public/client.js`:
  - schema-aware formatting
  - min/max progress rendering for numeric values
  - optional grouping/prioritization of critical values
- Add explicit i18n entries for any newly introduced living values and slot labels.
- Improve NPC detail panel readability when many slots/values exist (collapsible groups or compact rows).

### P2 - Internationalization / Labels

- Add missing `living.value.*` keys for future value fields in `src/virtual-world/assets/public/i18n.js`.
- Add/verify `living.slot.*` keys where slot labels are expected to be localized.
- Ensure fallback labels from living class schema are respected everywhere.

### P3 - Technical Debt and Consistency

- Reduce duplicated inventory-shape normalization helpers across server modules.
- Introduce shared utility for deriving canonical slot order (class definition order + stable fallback).
- Consider introducing stricter types for dynamic inventory payloads in handler return types (currently many `any` payloads).

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
2. Complete P1 behavior correctness and API contract cleanup.
3. Improve P2 UI/i18n quality.
4. Address P3 debt and then pursue Nice-to-Have ideas.
