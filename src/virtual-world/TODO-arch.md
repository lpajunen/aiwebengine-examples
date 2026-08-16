# Architectural TODO — from example to a real world platform

Status of this document: remaining work from an architecture review (July
2026), re-checked against the code in August 2026. The module-level design
(small server modules importing their siblings directly, lease-based
multi-instance coordination, data-driven content classes) is sound and
survives all of the changes below. What does **not** carry to platform scale
is the interaction model: per-step HTTP requests, full-state DB round trips
per request, regenerate-the-map-per-call, and broadcast-everything events.

Items that have since been implemented are trimmed to their remaining gaps;
item numbers are preserved so cross-references stay stable. Several changes
cannot be made in game code alone — they depend on new runtime (aiwebengine)
primitives, collected in the
[runtime capabilities](#capabilities-expected-from-the-runtime) section so
game-side needs can drive runtime development.

## Architectural changes needed

Ordered roughly cheapest-first; this is also the suggested landing order.

### 1. Versioned event protocol with a single resync path

The `{scope, seq}` protocol and single `/virtual-world/resync` path are in
place. Remaining gaps:

- Per-emit seq allocation adds a DB read+write per event; this should fold
  into item 2's in-memory world state.
- Resync does not replay missed chat/DM events (chat relies on its history
  endpoints).
- Event payload schemas are still not shared with the client (item 6), so
  emitting server code and consuming client code can still drift.

### 2. Authoritative in-memory world state (stop re-deriving per request)

**Today:** every request re-derives world state from the DB:

- `getEffectiveMap` regenerates the whole map (up to 200×200) from the
  world class's generation spec and the seed **and** re-loads world mods
  from the DB on every call — and it is called on every move, every NPC
  tick, every world-state fetch (23 call sites, up from 9 as more
  systems — placements, reservations, pursuit — started asking the map
  questions).
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

Claim-by-delete pickup and `runInWorldTransaction`-wrapped multi-write flows
are in place. Remaining gaps:

- The player-inventory row is still last-write-wins per user — two concurrent
  requests _by the same user_ can lose an inventory update or double-spend
  craft ingredients if the backend's isolation level does not lock the read.
  Needs versioned rows/compare-and-swap (runtime capability 2).
- `nextWorldItemId` item-seq allocation has the same read-modify-write shape
  (now runs inside the craft transaction, but still not CAS-protected).

Until CAS lands, treat the item economy as best-effort and avoid features
(trading, currency) that make dupes valuable.

### 4. Movement as sessions or batched intents, not per-tile POSTs

Batched-intent movement (one POST for the whole pending queue, longest-prefix
validation against one map build, single `player_moved` with the applied
path) is in place. Remaining work:

- **The session variant** — a bidirectional session (WebSocket or equivalent
  runtime stream) where the client sends movement intents and the server
  paces and validates. Gated on runtime capability 3. Server-side validation
  (single-step, walkable, seq-gated) must remain authoritative in either
  model.

### 5. Interest management (stop broadcasting and rendering everything)

**Today:** every world event is delivered to every client in the world (SSE
filtered by `world_id` only), and the client holds and renders the full
world map. Cost grows O(players × events) per world, and O(tiles) per
client — a 200×200 world is four times the render load of the 100×100
default.

**Needed:** spatial interest areas — clients subscribe to a region around
their avatar; events outside it are not delivered; crossing region
boundaries triggers a partial snapshot. Requires richer stream filtering
than exact-match key/value (runtime capability), plus a client that can load
and unload map regions.

### 6. Shared typed protocol module (client/server drift)

Tile values are no longer duplicated: tiles became a class repository, so
the page ships the tile registry as `WORLD_TILE_DEFS` and the client reads
values from it (`clientTileValueForName`) rather than from a hand-written
copy. `ROWS`/`COLS` likewise derive from the map the client is handed.
Remaining gap:

- **Event payload shapes** are still duplicated by convention between
  emitting server modules and consuming `client-*.js` files, with only the
  browser globals `.d.ts` to keep them honest. One shared module defining
  event types, payload schemas, and API request/response shapes, imported
  by both sides (client side via bundling, see item 8), is still wanted.

### 7. Composition-root cleanup of `virtual-world.js`

Done, though not the way this item proposed. Rather than building a runtime
context object, dependency injection was removed outright: server modules
import their siblings directly, shared constants live in `runtime-config.ts`,
and the entrypoint shrank from 3.6k lines to ~650 — imports, `init()`, and
one-line named delegates that exist only because the runtime resolves
handlers by name in the entrypoint's scope. Adding a module no longer means
editing wiring blocks.

One constraint this bought, worth knowing before restructuring imports: the
engine FATALs on circular imports between asset-backed modules even where
`tsc` accepts them, which takes down every route. Shared constants go in
`runtime-config.ts` instead of being imported back across a cycle.

### 8. Client modularization and asset pipeline

**Today:** the client is split into fourteen plain-JS `client-*.js` feature
files plus five shared foundation files (global scope, load order defined in
`page-bootstrap.ts`) with hardcoded geometry, uploaded as static assets. No
bundler, no shared modules with the server, no code splitting.

**Needed:** a build step (bundler) producing the deployed client from
modular sources, enabling the shared protocol module (item 6), region-based
map loading (item 5), and eventually an asset pipeline for models/textures
instead of hardcoded box geometry.

### 9. Abuse controls for user-generated content

An owner-or-admin permission model (`ownerIds` on classes, DB-only
`vworld_admins`) replaces the single creator's-stone gate for class
mutation. Still missing:

- Per-user rate limits on mutating endpoints (moves, chat, class edits).
- Quotas on user-created classes/items.
- Validation limits on interpreter programs (size, step count).
- A moderator role between player and DB-admin.

### 10. Tests and observability

**Today:** the runtime has a test harness — assets named `*.test.ts` beside
the module they cover, run with `make test` (`POST /engine/run_tests`) — and
eight suites use it: pure ones for the domain helpers
(`world-domain.test.ts`), the interpreter that runs user-authored programs
(`action-logic-interpreter.test.ts`), targeting resolution
(`action-targeting.test.ts`), the generation spec
(`world-generation.test.ts`) and placements (`world-placements.test.ts`);
database-backed ones for the move endpoint (`move-player.test.ts`), pursuit
stepping (`pursuit-movement.test.ts`) and the transaction helper
(`world-db.test.ts`). `test-fixtures.ts` holds the shared world/player
fixtures. Observability is still `vwLog` lines only.

Writing them turned up two real defects, both now fixed and pinned:
`allocateEventSeq` rolled back on failure while running inside a caller's
transaction, which discarded the caller's writes (the engine has no
savepoints, so an inner rollback discards the whole transaction);
`runInWorldTransaction` now tracks depth and inner calls join the open
transaction instead of opening or ending one. And
`resolveApproachTargetTile` turned an absent body into tile (0, 0) via
`Number(null)`, sending the actor to the map corner.

The harness turned out to be stronger than this item originally assumed. A
test does **not** have to stand in for a module's imports: the database is
real and synchronous inside a case, and the run's writes are rolled back
afterwards, so a case can create a world, place a player, call
`movePlayerForUser`, and assert on the rows that came out. `Date.now` can be
replaced and imported modules see the stub, which is how lease, heartbeat
and timer logic gets tested without waiting. Handler-level code takes a
plain `context` object, so route and tool handlers are directly callable.

What the harness does not give (see
[runtime capabilities](#capabilities-expected-from-the-runtime) item 10):

- **No async**, so SSE delivery, scheduler-driven ticks and any concurrency
  (two move leases racing, two tick leases racing) cannot be asserted — the
  parts items 1–5 are about. Tick functions can still be called directly.
- **Rollback is per run, not per case**: cases share one transaction, so
  every case must mint its own ids and never assert on global row counts.
- **Rollback only holds until the code under test commits.** The first
  script-level transaction of a run collides with the harness's own:
  committing it discards everything the run has written so far (a case's
  setup rows included), and everything written afterwards is real, not
  rolled back. `test-fixtures.ts` spends that collision on an empty priming
  transaction before any fixture row exists, and every database-backed suite
  deletes its own rows in an `afterEach` rather than trusting the rollback.
- **Rollback is DB-only** — asset writes, secret writes and outbound HTTP
  are real, so class CRUD paths that write assets must be avoided.
- **No module stubbing**, no `beforeAll`/`afterAll`, no coverage, no
  `only`/`skip` (the `filter` substring on the run is the only selector).
- **No output channel**: `console.log` from a case goes nowhere, so the
  assertion message has to carry the diagnosis. To print a value, fail on
  purpose: `expect(JSON.stringify(report)).toBe("PRINT")`.
- **No local run** — tests execute the deployed copy, so `make deploy-changed`
  first or a green run describes an older file, and there is no CI gate that
  does not deploy.
- **No client-side testing at all**: `assets/public/client-*.js` has no
  harness, which is the largest untested surface in the project.

**Needed next**, in rough order — the reservation rules
(`world-reservations.ts`, which needs a world class with placements behind
it) and map determinism (`world-map.ts`). Then the remaining stateful
paths: item pick/drop/equip and container moves as an
inventory-conservation check (item 3's integrity, expressed as a test),
action costs/produces plus XP, class upsert/read-back/cache-refresh
(including "every built-in seed row still exists", which is otherwise only
caught in production), and spawn timers/NPC ticks driven by a stubbed clock.
Handler contracts with fake contexts come last: unauthenticated shapes,
creator-stone and owner-or-admin checks, and `schema-setup` idempotence.
Operationally, unchanged: metrics (request rates, tick durations, DB error
rates) and some tracing story from the runtime.

## Domain-model goals

Added July 2026, from the concept description in [README.md](README.md).
Unlike items 1–10 these are feature goals, not scalability fixes, but they
land in the same modules and are tracked here so the two lists get
sequenced together. Numbering continues from the list above.

### 11. Container items (items inside items)

The `chest` container item and `container_put`/`container_get` actions are in
place. Remaining gap:

- Built-in world-class database records seed one `chest` through their
  `itemSpawns` manifests, but `ensureWorldItems` only seeds a world once
  (`meta.seeded`), so worlds created before this change never retroactively
  get one — reachable today only via the `cheat` grant-all nickname or the
  item class editor.

### 12. Slot/bag visibility semantics

Bag contents are now server-side private (only `slots` + `inventory_count`
ship for other livings), and equipped slot items render on remote/NPC/local
avatars. Remaining gap:

- Slot-to-body-position mapping is a hardcoded client-side table
  (`SLOT_ATTACH_POINTS`) mirroring `living-registry.ts`'s slot IDs rather
  than data driven from the slot definitions themselves — a creator-defined
  living class with custom slot IDs falls back to one default attachment
  point. Pairs with the interest-management filtering of item 5.

### 13. Persistence tiers and the 30-minute world reset

**Today:** the depletion half of this is solved, the accumulation half is
not. Consuming or killing something that came from a spawn manifest writes a
respawn timer (`spawn-timers.ts`, `RESPAWN_DELAY_MS` = 30 minutes), and the
world tick spawns it again when the timer is due — so a stripped forest
regrows without a reset. What still has no expiry is everything players
_add_: dropped litter, built houses, planted trees, world mods generally, and
NPC/item rows outside any manifest. Player inventory is per-user durable
(correct, keep).

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

Note the interaction with placements: authored placements are part of the
world definition, like spawn rules, and a reset must re-materialize them
rather than treat their objects as ephemeral litter. The per-world placement
instance records already distinguish the two, so a reset should reuse the
reconciliation path (`world-placement-reconcile.ts`) rather than invent a
second notion of "baseline".

### 14. Timed actions (durations and started-action state)

Durations are in place. An action class carries `durationMs` (editable
through the class CRUD path, so a creator can set one); starting such an
action charges its costs and fatigue immediately, enqueues a pending action
with a `ready_at`, and returns `started: true` plus a start toast instead of
applying effects. A leased per-world sweep replays the action when due,
through the same code path instant actions take. `craft_kantele` is the
built-in example at 5 s.

What is missing is everything that makes a started action a _thing in the
world_ rather than a private timer:

- **No live record.** The pending row carries a ready-at timestamp, not
  values tracking remaining time, so nothing can read progress.
- **Not observable.** Only the actor learns an action started; nearby
  clients see nothing until the effect lands. Needs
  start/progress/complete/cancel events on the versioned protocol (item 1).
- **No interruption rules.** Moving away, the target vanishing, or the actor
  dying mid-craft does not cancel it — the action still resolves when due,
  and costs are already spent either way. (`cancel_approach` cancels a
  walk-then-act approach, which is a different queue entry.)
- **No cooldowns.**
- Completion effects are not wrapped in the item 3 transactions, and
  interpreter validation limits from item 9 should apply to duration values.

### 15. Per-world size and creator-defined world types

Per-world `rows`/`cols` and world classes are in place, and the idea went
further than this item asked: tiles became a fifth class repository
(`tile-registry.ts`, with its own editor panel), terrain generation became a
data spec on the world class rather than a preset pick
(`world-generation.ts`), and authored placements with reservations landed on
top (`world-placements.ts`, see [DOC-authoring-worlds.md](DOC-authoring-worlds.md)).
Remaining gaps:

- The world-class cache refreshes per-instance on CRUD/list calls only —
  cross-instance staleness until item 2's world-state story lands. The
  reservation cache keys off the same generation counter and inherits the
  problem.
- The portal picker's registry snapshot refreshes on page load only.
- World classes have no quotas (item 9).
- Placement position strategies are `exact` only; `near_placement`/`random`
  and multi-tile structure footprints are deliberately unbuilt (see the
  authoring doc's closing section).

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
10. **Transactions that nest** — `beginTransaction` documents "or create a
    savepoint if already in a transaction", but a nested begin starts
    nothing, a rollback from inside discards the entire transaction
    (including work from before that begin), and the outer commit then
    reports "No active transaction to commit". Real savepoints would let a
    helper protect its own work without endangering its caller's; today
    every helper has to know whether someone above it opened a transaction.
11. **Test harness gaps** — the `*.test.ts` runner covers pure code and
    DB-backed scenarios well (item 10). Missing, roughly in order of what
    would buy the most: a run-scoped rollback that survives the script
    committing its own transactions (today the first commit ends the run's
    rollback and everything after it is written for real), async cases (so
    SSE delivery and scheduled ticks can be asserted at all), per-case
    rather than per-run isolation, a way to drive two concurrent callers so
    lease and seq races can be tested, an output channel from a case (today
    the only way to print is to fail an assertion), and module stubbing for
    the few seams where a real DB is the wrong tool. A local or CI-side
    runner would remove "deploy before you can test"; a browser-side harness
    would reach `assets/public/`.

## What explicitly does _not_ need changing

- The `assets/server/` module decomposition — one module per feature, each
  importing its siblings directly. Keep it; it is what makes the above
  changes incremental instead of a rewrite. (The dependency injection this
  list originally endorsed is gone — see item 7.)
- The lease-based multi-instance coordination (NPC tick lease, move lease) —
  it becomes less load-bearing once items 2–3 land, but the pattern is
  correct today.
- The data-driven content-class system and interpreter — this is the seed of
  the platform; the work is hardening (item 9), not redesign.
- The idempotent `schema-setup.ts` migration pattern.
