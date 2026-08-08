# Unified Public Living Contract

## Goal

Players and NPCs should be mechanically equivalent living entities. Their
differences belong at the ownership, control, spawning, and lifecycle
boundaries, not in the observable gameplay data contract.

The public representation must expose only state needed to render or interact
with a living in the world. Private bags, owner-only progression, session
state, and controller internals must remain private.

## Target Contract

Add shared types and public-projection helpers in
`assets/server/world-domain.ts`:

```ts
type PublicLivingKind = "player" | "npc";

type PublicEquippedItem = {
  id: string;
  type: string;
  state?: Record<string, unknown>;
};

type PublicLivingSnapshot = {
  id: string;
  kind: PublicLivingKind;
  display_name: string;
  row: number;
  col: number;
  seq: number;
  rotation: number;
  class_id: string;
  slots: Record<string, PublicEquippedItem | null>;
  values: Record<string, unknown>;
};
```

Do not include `bag`, `inventory`, `inventory_count`,
`inventory_slot_ids`, `inventory_selectors`, `left_hand`, `right_hand`,
`session_id`, heartbeats, leases, owner/world assignment metadata, or raw
unfiltered item state.

`slots` is the only public source of equipped-item information. The former
`left_hand` and `right_hand` fields are redundant projections of slots, and
bag-derived counts or selectors reveal private inventory information.

## Implementation Steps

1. Define the common public types and projection helpers.

   - Add `toPublicEquippedItem(item)` to return only safe visual/public item
     fields.
   - Add `toPublicLivingValues(living, livingClass)` to filter living values.
   - Add `toPublicLivingSnapshot(...)` to assemble the common entity shape.

2. Define visibility rules for living values.

   - Extend `LivingValueSchema` with `visibility?: "public" | "owner"`.
   - Start conservatively: health, fatigue, level, and combat-visible values
     are public; `experience`, `totalExperience`, and unknown creator-defined
     values are owner-only by default.
   - Make creator-defined values opt-in to public visibility rather than
     accidentally public.

3. Define safe public item-state projection.

   - Audit item state in `item-registry.ts` and container handling.
   - Always expose equipped item `id` and `type`.
   - Only expose explicitly public item-state keys when client rendering or
     gameplay observation needs them.
   - Never expose container contents, private custom state, or ownership data
     through an equipped slot.

4. Migrate player and NPC snapshot builders.

   - Update `player-snapshots.ts`, `npc-storage.ts`, and
     `http-handler-helpers.ts` to build the common public snapshot through the
     shared helper.
   - Player identity uses the authenticated user ID, kind `"player"`, and
     `getEffectiveNick(userId)` for the display name.
   - NPC identity uses its generated NPC ID, kind `"npc"`, and
     `getNPCDisplayName(worldId, npcId)`.
   - Remove public player `session_id` and all NPC bag-derived fields.

5. Add a unified world snapshot endpoint.

   Introduce `GET /virtual-world/livings`:

   ```ts
   { livings: PublicLivingSnapshot[] }
   ```

   It combines active players and world NPCs. Keep `/virtual-world/players`
   and `/virtual-world/npcs` temporarily only when compatibility requires it;
   both should internally use the same projection while they remain.

6. Unify live world events.

   Add shared events:

   - `living_moved`: `id`, `kind`, position, sequence, rotation, optional
     movement path.
   - `living_updated`: `id`, `kind`, and changed public fields such as name,
     class, slots, or values.
   - `living_removed`: `id`, `kind`, and a removal reason if the client needs
     one.

   Migrate the move, NPC tick, follow, fight, respawn, death, leave, and
   world-switch emitters. Compatibility events may coexist during the client
   transition.

7. Introduce a common client living store.

   - In `assets/public/client-net.js`, consume `/virtual-world/livings` and
     `living_*` events into a shared `livingById` model.
   - In `client-avatars.js`, use the same `class_id`, `slots`, and public
     `values` shape for remote players and NPCs.
   - In `client-tile-detail.js`, render the shared contract and group by
     `kind` only as a presentation choice.
   - Keep local `playerInventory` separate: it is the owner-private state with
     full bag contents and controls.

8. Keep player presence separate from living state.

   Preserve the player-only social contract for online state, nick updates,
   chat, DMs, and last activity:

   ```ts
   type PlayerPresence = {
     player_id: string;
     nick: string;
     world_id: string;
     last_active: number;
   };
   ```

   NPCs do not need invented equivalents for sessions, online status, login
   time, or direct-message identity.

9. Migrate bootstrap and resync payloads.

   - Add `livings` to the page-bootstrap and resync payloads.
   - Remove separate public `players` and `npcs` payloads once the client is
     fully migrated.
   - Keep owner-private `playerInventory` unchanged.

## Contract Mismatches To Resolve

- Players use `player_id`; NPCs use `npc_id`. Use common `id` plus `kind`.
- NPCs have `display_name`; players rely on a separate presence lookup. Put a
  display name in the public living snapshot for both.
- Player public snapshots include `session_id`, which is control metadata and
  must become owner-private.
- NPC snapshots expose `inventory_count`, selectors, and redundant hand
  fields. Remove all of them from public data.
- Both paths currently expose raw `values`; filter values through schema
  visibility so progression and unknown custom state do not leak.
- Both paths currently expose raw slot items; project items to prevent
  container/private state leakage.
- Player and NPC movement events expose different names and different partial
  entity fields. Replace them with common living event payloads.
- NPC `state` is an AI implementation detail today. Include it only if a
  shared, defined living action/animation state is introduced; otherwise keep
  it internal or derive UI activity from active actions.

## Delivery Order

1. Shared types, visibility metadata, and public projection helpers.
2. Migrate existing player/NPC snapshot builders to the shared projection.
3. Add `/virtual-world/livings` and migrate client snapshot handling.
4. Add shared live events and migrate all server emitters/client consumers.
5. Update bootstrap and resync payloads.
6. Remove legacy public fields, endpoints, and events after the client no
   longer uses them.

## Validation

After every code change, run:

```sh
make format lint typecheck
```

Before considering the migration complete, deploy and verify that:

- Players and NPCs render from the same public living contract.
- Equipment, class changes, combat values, movement, follow, fighting, death,
  spawning, despawning, leaving, and world switches stay synchronized.
- A player can see another living's public slots and public values but never
  bag contents, bag-derived metadata, private item state, experience,
  session IDs, heartbeat state, or leases.
- The owning player retains full private inventory and container behavior.
