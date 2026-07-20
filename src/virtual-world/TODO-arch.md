# Architectural TODO — from example to a real world platform

Status of this document: findings from an architecture review (July 2026).
The module-level design (dependency-injected server modules, lease-based
multi-instance coordination, data-driven content classes) is sound and
survives all of the changes below. What does **not** carry to platform scale
is the interaction model: per-step HTTP requests, full-state DB round trips
per request, regenerate-the-map-per-call, and broadcast-everything events.

Several of the changes cannot be made in game code alone — they depend on new
runtime (aiwebengine) primitives. Those are collected in the
[runtime capabilities](#capabilities-expected-from-the-runtime) section so
game-side needs can drive runtime development.

## Architectural changes needed

Ordered roughly cheapest-first; this is also the suggested landing order.

### 1. Versioned event protocol with a single resync path

**Status: implemented (July 2026).** All world- and recipient-scoped events
carry `{scope, seq}` allocated from `vworld_event_seqs` (transactional
read-increment in `event-seq.ts`; falls back to unversioned on failure —
fail-open, delivery is never blocked). The client (`trackEventSeq`) drops
duplicates, applies-then-resyncs on gaps, and all healing paths converge on
one debounced `requestResync()` hitting `GET /virtual-world/resync`, which
returns scope seqs (read before the snapshots so concurrent events re-apply
idempotently) plus players/NPCs/world-state snapshots. Remaining gaps:
per-emit seq allocation adds a DB read+write (folds into item 2's in-memory
world state), resync does not replay missed chat/DM events (chat relies on
its history endpoints), and payload schemas are still not shared with the
client (item 6).

**Original problem:** SSE events are ad-hoc, unversioned JSON blobs per type
(`player_moved`, `item_changed`, …), each carrying whatever fields its emit
site happened to include. The client compensates with healing hacks —
re-fetching snapshots on SSE errors, or the debounced `/players` re-fetch
added to fill in missing slot data. Each event type effectively invents its
own consistency model.

**Needed:** a defined state-sync protocol:

- Per-scope (world, recipient) monotonic sequence numbers stamped on **all**
  events, not just player moves.
- Client-side gap detection: if event N+2 arrives after N, request a resync
  instead of silently drifting.
- One resync path (full snapshot + resume-from-seq) shared by all event
  types, replacing the per-feature snapshot healing.
- Event payload schemas defined in one shared module (see item 6) so the
  emitting server code and the consuming client code cannot drift apart.

### 2. Authoritative in-memory world state (stop re-deriving per request)

**Today:** every request re-derives world state from the DB:

- `getEffectiveMap` regenerates the 100×100 map from the seed **and**
  re-loads world mods from the DB on every call — and it is called on every
  move, every NPC tick, every world-state fetch (9 call sites).
- Every move runs `loadWorldPlayers`, a query of up to 1000 rows.
- The NPC tick reloads NPCs, items, trees, and players per world every 500 ms.

**Needed:** an authoritative world instance that lives in memory — an
actor/room model where one owner process holds a world's state, applies
mutations, and persists write-behind. Short of that, aggressive caching of
derived state (effective map, player map) with an explicit coherence story
across runtime instances. This is the single biggest scalability change and
depends on runtime support (pinned per-world workers, or a supported
in-process cache with known instance lifetime).

### 3. Atomic item/inventory operations (economy integrity)

**Status: implemented (July 2026).** Two mechanisms:

- **Claim by delete** — `deleteWorldRowsWhere` now returns rows-affected,
  `deleteWorldItems` returns the subset of items the caller actually
  claimed, and both player pickup (`item-action-helpers.ts`) and NPC pickup
  (`npc-tick-helpers.ts`) only grant claimed items. This kills the headline
  dupe (two concurrent pickups both succeeding) regardless of transaction
  isolation, because the row delete itself is atomic.
- **Transactional flows** — `runInWorldTransaction` in `world-db.ts`
  (savepoint-aware, fail-open if begin fails) wraps item actions, crafting,
  tree actions, cheat grants, and the per-world NPC tick body (the tick
  lease is acquired outside the transaction so its visibility does not wait
  for commit), so multi-write sequences like drop
  (inventory save + world-item upsert) are all-or-nothing.

Remaining gaps: the player-inventory row is still last-write-wins per user —
two concurrent requests _by the same user_ can lose an inventory update or
double-spend craft ingredients if the backend's isolation level does not
lock the read (needs versioned rows/CAS, runtime capability 2); item-seq
allocation (`nextWorldItemId`) has the same read-modify-write shape but now
runs inside the craft transaction.

**Original problem:** item pickup, drop, crafting, and NPC item interactions are
load → modify → delete/upsert sequences with no transaction or
compare-and-swap. Leases and seq numbers narrow race windows but do not
close them: two concurrent pickups of the same item can both succeed, and
crafting can dupe or lose items under concurrency.

**Needed:** every mutation that transfers or consumes an item must be
atomic — versioned rows with compare-and-swap semantics, or real
transactions in the DB API (runtime capability). Until then, treat the item
economy as best-effort and avoid features (trading, currency) that make
dupes valuable.

### 4. Movement as sessions or batched intents, not per-tile POSTs

**Status: implemented via batched intents (July 2026).** The client sends
its whole pending queue as one POST (`steps: [{row, col, rotation}, ...]`,
capped at 60 server-side); `movePlayerForUser` validates the longest
applicable prefix as a unit against one map build, consumes one seq per
applied step (so snapshot comparisons are unchanged), writes only the
moving player's position row (the old code rewrote every player's row per
move, which could clobber concurrent moves with stale reads), and
broadcasts a single `player_moved` carrying the applied `path` — remote
clients walk avatars through those waypoints instead of lerping through
walls. Partial application (`applied_count < requested_count`) makes the
client snap to the server position and rebase queued moves. Legacy
single-step bodies (`toRow`/`toCol`, used by the MCP move tool) still work.
This work also retired the duplicated inline move logic in
`virtual-world.js`, which had never actually delegated to
`move-player.ts`. WebSockets (the session variant) remain future work
gated on runtime capability 3.

**Original problem:** the client queues one HTTP POST per tile step (`pendingMoves`),
sent serially. Each step costs a lease read/write, a full player-map load,
two position writes, and a broadcast. Movement throughput is bound by
request latency and write-amplified roughly 5× per step.

**Needed:** either

- a bidirectional session (WebSocket or equivalent runtime stream) where the
  client sends movement intents and the server paces and validates, or
- batched intents ("path to (row, col)") validated server-side as a unit,
  with intermediate positions interpolated client-side.

Server-side validation (single-step, walkable, seq-gated) must remain
authoritative in either model.

### 5. Interest management (stop broadcasting and rendering everything)

**Today:** every world event is delivered to every client in the world (SSE
filtered by `world_id` only), and the client holds and renders the full
100×100 world. Cost grows O(players × events) per world.

**Needed:** spatial interest areas — clients subscribe to a region around
their avatar; events outside it are not delivered; crossing region
boundaries triggers a partial snapshot. Requires richer stream filtering
than exact-match key/value (runtime capability), plus a client that can load
and unload map regions.

### 6. Shared typed protocol module (client/server drift)

**Today:** constants (`ROWS`, `COLS`, tile values) and event payload shapes
are duplicated between server modules and the browser client (`client-*.js`),
kept in sync by convention (`clientTileValueForName`, the browser globals
`.d.ts`).

**Needed:** one shared module defining tile values, event types, payload
schemas, and API request/response shapes, imported by both sides (client
side via bundling, see item 8).

### 7. Composition-root cleanup of `virtual-world.js`

**Today:** the 3.6k-line entrypoint hand-wires dependencies into every
module, re-declaring the same dep lists in five-plus separate literal
objects (e.g. `NPC_TICK_LEASE_MS` is wired into six). Adding a module means
editing several giant wiring blocks.

**Needed:** build one runtime context object (storage, events, config,
constants) once and pass it through; modules can `Pick<>` what they need, as
they already do. Pure refactor, no behavior change — but it is the tax paid
on every new module until done.

### 8. Client modularization and asset pipeline

**Today:** the client is split into twelve plain-JS `client-*.js` feature
files (global scope, load order defined in `page-bootstrap.ts`) with
hardcoded geometry, uploaded as static assets. No bundler, no shared modules
with the server, no code splitting.

**Needed:** a build step (bundler) producing the deployed client from
modular sources, enabling the shared protocol module (item 6), region-based
map loading (item 5), and eventually an asset pipeline for models/textures
instead of hardcoded box geometry.

### 9. Abuse controls for user-generated content

**Today:** in-game editing of item/action/living classes is gated by the
creator's stone, and user-authored action logic runs through the data-driven
`action-logic-interpreter.ts` (correctly, no `eval`). But there is no rate
limiting (moves, chat, class edits), no quotas on created content, and no
moderation or permission model beyond the single gate item.

**Needed:** per-user rate limits on mutating endpoints, quotas on
user-created classes/items, validation limits on interpreter programs
(size, step count), and a permission/roles model (world owner, moderator,
player) replacing the single creator's-stone gate.

### 10. Tests and observability

**Today:** no test suite exists, and observability is `vwLog` lines only.
The DI design makes unit tests nearly free.

**Needed:** unit tests first for the code that silently regresses — move
seq/lease logic, crafting, and especially the action-logic interpreter
(which executes user-authored programs). Operationally: metrics (request
rates, tick durations, DB error rates) and some tracing story from the
runtime.

## Domain-model goals

Added July 2026, from the concept description in [README.md](README.md).
Unlike items 1–10 these are feature goals, not scalability fixes, but they
land in the same modules and are tracked here so the two lists get
sequenced together. Numbering continues from the list above.

### 11. Container items (items inside items)

**Today:** containment is one level deep and only living objects contain
things: an item lives on a tile, in a slot, or in a bag (`slots_json` /
`bag_json` flat structures in `item-storage.ts`). Items have no contents of
their own.

**Needed:** an item can contain other items — a chest holding a sword and a
helmet — with contents moving along when the container is picked up,
dropped, or transferred. Requires a recursive item representation (contents
list on the item record), depth/count limits to keep payloads and the
interpreter bounded, and pickup/drop/craft flows that treat a container and
its contents as one atomic unit (extends the claim-by-delete and
transaction work in item 3).

### 12. Slot/bag visibility semantics

**Status: implemented (July 2026).** Server-side: `buildWorldNPCSnapshot`
(`npc-storage.ts`) no longer includes `bag` in the per-NPC snapshot consumed
by the NPC list route, resync, and initial page bootstrap — only `slots`
(public) and `inventory_count` (size, not contents) ship; the player list
path (`listPlayersForUser`) already omitted `bag` and needed no change. The
one broadcast leak found — `setNicknameHandler`'s cheat-grant path put the
acting player's full inventory (including bag) into a `presence_update`
event sent via `sendGlobalPresenceEvent` with an empty (world-wide) filter —
is now delivered via `sendRecipientScopedStreamEvent` so only the acting
client's own SSE subscription receives it. The owner-scoped paths
(`getCurrentWorldStateForUser`, `listItemsForUser`, item/craft/cheat HTTP
responses) were already correctly full-bag and are unchanged. Client-side:
`client-avatars.js` renders equipped slot items as small colored boxes
(reusing `getItemMaterial`'s per-item-type color) attached at
slot-appropriate positions on remote player, NPC, and the local player's own
avatar group, via `syncAvatarEquippedItems`, hooked into
`upsertRemoteAvatar`/`upsertNPCAvatar` (on slot changes) and
`updateHeldHud` (for the local avatar). `client-tile-detail.js`'s NPC panel
now shows bag count from `inventory_count` instead of reading (no longer
present) raw bag contents.

**Original problem:** the storage split already existed — living classes
define slot layouts (`living-registry.ts`) and per-living state is
`slots + bag + values` — but visibility did not: NPC bag contents were
shipped to every client, and slot contents only surfaced in the local UI's
held-item labels, not on other players' avatars.

Remaining gap: slot-to-body-position mapping is a hardcoded client-side
table (`SLOT_ATTACH_POINTS`) mirroring `living-registry.ts`'s slot IDs
rather than data driven from the slot definitions themselves — a
creator-defined living class with custom slot IDs falls back to one default
attachment point. Pairs with the interest-management filtering of item 5.

### 13. Persistence tiers and the 30-minute world reset

**Today:** everything persists forever. Player inventory is already
per-user durable (correct, keep), but world items, NPCs, and world mods
also accumulate indefinitely — nothing expires, so worlds silt up with
litter and depleted state.

**Needed:** three explicit tiers:

- **Permanent** — player data: values plus slot/bag items and those items'
  own values and contents.
- **Ephemeral (default)** — NPCs, world items not contained by a player,
  and other world data reset roughly every 30 minutes back to the baseline
  the spawn rules describe (spawn rules themselves are part of the world
  definition, not the ephemeral state).
- **Extended (opt-in)** — creator-marked data that survives resets, e.g. a
  shop's sellable stock.

Implies a persistence-tier marker on stored rows, a reset job (the
scheduler tick or a dedicated cron) that clears ephemeral rows and
re-seeds from spawn rules, and reset events so connected clients resync
cleanly (rides on the item 1 resync path). A DB TTL/expiry primitive would
help (add to runtime capability 9's DB asks) but a lease-guarded sweep can
do it in game code.

### 14. Timed actions (durations and started-action state)

**Today:** all actions resolve instantly inside one request; action classes
(`action-class-storage.ts`, `action-logic-interpreter.ts`) have no duration
or cooldown fields and no in-flight state.

**Needed:** an action type can declare a duration (chop a tree: one
minute); performing one creates a **started action** — a live record whose
values track remaining time — with effects applied on completion, progress
observable by nearby clients, and interruption rules (mover cancels,
target vanished, actor left). Needs a persisted started-actions store
driven by the scheduler tick (same lease pattern as the NPC tick),
start/progress/complete/cancel events on the versioned protocol (item 1),
and completion effects wrapped in the item 3 transactions. Interpreter
validation limits from item 9 apply to duration values too.

### 15. Per-world size and creator-defined world types

**Status: implemented (July 2026).** Stage 1: worlds store `rows`/`cols`
next to `world_type` (default 100×100, clamped 8–200 by
`normalizeWorldDimension`); `generateWorldMap` is parameterized and scales
features by area; server modules derive bounds from the effective map; the
client derives dimensions from the injected `MAP`. Stage 2: world classes
are the fourth content class (`world-class-storage.ts`, the four presets
seeded as built-ins), managed via the creator's-stone-gated World Types
panel, `/virtual-world/world-classes` CRUD, and the
`virtualWorldManageWorldClasses` MCP tool; portal builds open a
destination picker over `WORLD_CLASS_REGISTRY` and send
`destination_world_class_id`. Remaining gaps: the world-class cache
refreshes per-instance on CRUD/list calls only (cross-instance staleness
until item 2's world-state story), the portal picker's registry snapshot
refreshes on page load only, and world classes have no quotas (item 9).

**Original problem:** every world was 100×100. `ROWS`/`COLS` were constants
in `world-domain.ts`, injected into most server modules, imported directly
by `world-map.ts`, and hardcoded again in the client. World "types" were
the four generation presets, chosen by the portal builder's four
`build_portal_<type>` actions; `createWorldOfType` stored only
`world_type`. A portal to a small house still opened a full 100×100 world.

**Needed**, in two stages:

- **Stage 1 — per-world dimensions.** Store `rows`/`cols` next to
  `world_type` at world creation (existing worlds default to 100 via the
  idempotent `schema-setup.ts` pattern) and make every consumer per-world:
  parameterize `generateWorldMap`, derive bounds from the effective map (or
  an injected dimension lookup) in movement/crafting/spawn/NPC code, and
  ship dimensions to the client in the world-state payload instead of the
  hardcoded 100s (overlaps the shared-protocol work, item 6). Server-side
  min/max validation on size (map cost, NPC-tick cost, snapshot size —
  the item 9 quota concerns apply). The oak home world stays 100×100.
- **Stage 2 — world types as the fourth content class.** A world-class
  store (id, base generation preset, rows×cols, appearance parameters)
  managed in the existing creator's-stone-gated class editor, with the
  portal builder listing the creator's world types instead of the four
  hardcoded actions. This is the README's "creator creates a world type"
  goal and the successor to the fixed presets.

## Capabilities expected from the runtime

The game-side changes above assume the aiwebengine runtime grows these
primitives. Roughly in order of leverage:

1. **Stateful world sessions** — a way to pin a world to one worker/instance
   with in-memory state and write-behind persistence (actor/room model), or
   at minimum: documented script-instance lifetime plus an in-process cache
   API with TTL and cross-instance invalidation. Unblocks item 2.
2. **Transactions or compare-and-swap in the `database` API** — versioned
   rows with conditional update, or multi-operation transactions. The
   current `upsert` + lease pattern cannot protect an item economy.
   Unblocks item 3.
3. **Bidirectional streams (WebSocket-equivalent)** — today the model is
   HTTP request in, SSE out. Movement and future real-time interactions need
   client→server messages on a persistent connection with per-connection
   server-side state. Unblocks item 4.
4. **Richer stream filtering** — beyond exact-match key/value
   (`world_id`, `recipient_id`): predicate or region-based subscription
   (e.g. numeric range on row/col), and server-side fan-out that scales with
   subscribers per region rather than per world. Unblocks item 5.
5. **Stream delivery guarantees** — per-subscription ordering and either
   at-least-once delivery with client-side dedupe by seq, or an explicit
   "gap possible, resync from seq N" signal. Complements item 1.
6. **Scheduler improvements** — the 500 ms recurring NPC tick works; a real
   platform wants per-world timers with jitter control, and a way for a tick
   to know its own lateness (for catch-up simulation).
7. **Rate limiting / quota primitives** — per-user token buckets usable from
   handlers, so every script does not hand-roll abuse controls. Unblocks
   item 9.
8. **Observability** — structured metrics counters/histograms from scripts,
   plus request/stream tracing, beyond string logging.
9. **DB indexing and query controls** — declared indexes on filter columns
   (e.g. `world_id`, `user_id`), and pagination beyond the fixed
   1000-row-limit query pattern, so hot queries like `loadWorldPlayers`
   scale past small worlds.

## What explicitly does _not_ need changing

- The `assets/server/` module decomposition and dependency-injection style —
  keep it; it is what makes the above changes incremental instead of a
  rewrite.
- The lease-based multi-instance coordination (NPC tick lease, move lease) —
  it becomes less load-bearing once items 2–3 land, but the pattern is
  correct today.
- The data-driven content-class system and interpreter — this is the seed of
  the platform; the work is hardening (item 9), not redesign.
- The idempotent `schema-setup.ts` migration pattern.
