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

**Today:** item pickup, drop, crafting, and NPC item interactions are
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

**Today:** the client queues one HTTP POST per tile step (`pendingMoves`),
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
are duplicated between server modules and the 5.4k-line `client.js`, kept in
sync by convention (`clientTileValueForName`, the browser globals `.d.ts`).

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

**Today:** `client.js` is a single 5.4k-line plain-JS file with hardcoded
geometry, uploaded as a static asset. No bundler, no shared modules with the
server, no code splitting.

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
