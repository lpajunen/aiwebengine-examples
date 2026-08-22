# Engine dev-support APIs — proposal

Status: proposal, mostly shipped. §1, §2, §3, §4 and §6 are live on
`MANAGE_HOST` as `POST /engine/check`, `POST /engine/eval`,
`POST /engine/assets/batch`, `PATCH /engine/assets` and the
`/engine/script_logs` filters and SSE tail; §7 shipped in part. All of it is
also reachable over MCP now. Everything else is still unimplemented.

Scope: engine-wide additions to the `/engine/...` management API and the
`aiwebengine-mcp` tool set. The proposals are engine-level, but the motivating
workload is `src/virtual-world/` — the only example in this repo under active,
multi-file development.

Goal: move as much of the develop → check → deploy → inspect loop onto the
server as possible, so a session working through MCP alone can do real
development instead of only deploying artifacts a local checkout produced.

Last surveyed against the live server 2026-08-22 (second pass), by deploying a
throwaway probe script, exercising each surface, and deleting it again.

## Where the loop stands today

The server now covers the whole loop except one step. `/engine/...` handles
asset and script CRUD, batched and patched writes, search, checks, evaluation,
test runs, filtered logs and a log tail, init status, route listing, secrets,
owners, and host binding.

**The MCP tool set exposes all of it** — 31 tools, including `write_assets`
(§3), `edit_asset` (§4, with `base_sha256` and `reinit`), `read_asset` with
`lines`/`grep` returning the sha256 that feeds the next patch, `check_script`
(§1, with candidate `content`), `eval_script` (§2), `run_tests`, `read_logs`
with every filter, and `prune_logs`. The doc used to warn that an MCP-only
session might be unable to reach any of the shipped endpoints. It can reach all
of them.

What still pins work to a local machine:

1. **`make format lint typecheck`.** `CLAUDE.md` requires it after every change
   and there is still no server equivalent — `check` reports engine semantics,
   never types. It needs `node_modules`, so it is the hardest local dependency
   in the loop, and now the **only** one. See §1.
2. ~~**Ad-hoc inspection.**~~ Closed by §2, and closed further than the first
   pass recorded: `eval` now imports the script's own modules, so the whole
   server tree is reachable from a snippet.
3. ~~**Batching.**~~ Closed by §3.
4. ~~**Whole-file rewrites.**~~ Closed by §4.
5. **History and rollback.** Assets still have no versions. Git is the only
   undo and it lives locally — and §4 being MCP-exposed makes that worse, not
   better: a session can now edit prod faster than it can see what it did.
6. **Log ergonomics.** ~~`GET /engine/script_logs` accepts only `uri`.~~ Fixed —
   `since`, `level`, `limit`, `contains`, `request_id`, `kind`, `route`,
   `after_seq` and an SSE tail all exist. What remains, re-verified today, is
   that **HTTP route handlers write no logs at all**.

Each proposal below targets one of those six.

## 1. `POST /engine/check` — server-side check — SHIPPED

Addresses (1). Implemented; `make check-virtual-world` calls it via
`scripts/check-script.js`.

The shipped endpoint goes further than proposed here: rather than static
analysis, it runs the script's `init()` in a sandbox and reports what it would
do if deployed, with database writes rolled back by default. It also accepts
candidate content in the request body, answering the open question below — a
check can run before the code is deployed. Also on MCP, as `check_script`.

Verified again 2026-08-22 against a probe script: `missing-handler` fires
correctly on a route whose delegate is not a global, `no-registrations` warns
when `init()` registers nothing, and the report carries
`init: { ran, durationMs, budgetMs: 10000, ceilingMs: 40000, timedOut }`.

**What did _not_ ship is the part item (1) actually needs: `checks=types`.**
There is no type checking anywhere on the server. The engine transpiles
TypeScript by stripping annotations, so a type error in an asset is invisible
until the code runs — and a TS annotation in a _root_ script is a plain syntax
error (`const s: string = 42;` in candidate content comes back as
`init-failed: missing initializer for variable`, not as a type diagnostic).
For a session editing 1400-line `.ts` assets through `edit_asset`, nothing
between the edit and a runtime failure looks at types at all.

Two further gaps in what did ship:

- **Candidate content covers the entrypoint only.** Asset modules still resolve
  to the deployed copies, so a candidate check of a multi-file change is a
  mixture. Worse, unknown body fields are **silently ignored** — sending
  `assets:` or `files:` alongside `content` returns a clean `ok: true` that
  says nothing about the files the caller thought they were checking. Either
  accept candidate assets or reject the field.
- **Path-collision detection does not fire.** `check_script`'s description
  advertises catching "paths another script already claims", but a candidate
  registering `/docs` and `/admin` — both owned by other scripts on the default
  host — returned `ok: true` with no diagnostics.

**The defect recorded here is resolved.** The check used to time out on
virtual-world, and bisecting `init()` put it on the two schema migration entry
points — `ensureWorldDatabaseSchema` and `ensureChatDatabaseSchema` appeared to
stall the sandbox indefinitely. That diagnosis was wrong: they were blocking on
wedged database relations, not on a sandbox limitation, and recreating the
server cleared it. `make check-virtual-world` now answers in well under a
second (`init()` 542ms of the 10000ms budget, no diagnostics). If it hangs
again, suspect the database rather than the endpoint.

The original proposal follows.

Runs the equivalent of `make format lint typecheck` over a script's deployed
asset tree, using the engine's own module resolution.

```
POST /engine/check?uri=https://example.com/virtual-world
  &checks=types,format,lint,engine     (default: all)
→ 200 {
    success: false,
    diagnostics: [
      { file, line, column, severity: "error"|"warning", code, message }
    ]
  }
```

Value beyond replacing the local step: the server can diagnose things local
`tsc` cannot, because they depend on engine semantics rather than TypeScript
semantics. In this repo those have each cost a debugging session:

- **Circular asset-backed imports.** `tsc` accepts them; the engine FATALs at
  load and every route on the script breaks.
- **Unresolved handler-name delegates.** The runtime resolves handlers by name
  string in the entrypoint scope. A route registered for a name that is not
  defined in `virtual-world.js` typechecks fine and 404s at runtime.
- **`init()` budget.** A static estimate, or a measured cold-start timing, of
  `init()` against the 5000 ms cutoff — past which the engine registers nothing.

The `engine` check group is the novel part; `types`/`format`/`lint` are
convenience parity with the local toolchain.

## 2. `POST /engine/eval` — run a snippet in the script's sandbox — SHIPPED

Addresses (2). Implemented and verified working 2026-08-21; `make eval` calls
it via `scripts/eval-script.js`.

It shipped essentially as proposed, including the console capture and the
rollback default. Verified: values come back structured with a `valueType`,
`console` entries carry levels, `rollback=true` really rolls an insert back,
`timeout_ms` is enforced to the millisecond (`"interrupted"`), a throw gives
`ok: false` plus a stack at HTTP 200, and it works on virtual-world in ~0.15s
because it does not run `init()`.

**The limitation recorded here is closed.** A snippet can now import the
script's own asset modules, and the reach is the entrypoint's whole transitive
graph rather than its import list. Verified 2026-08-22:
`import { VWORLD_PLAYER_POSITION_TABLE } from "./server/runtime-config.ts"`
resolves even though the entrypoint does not import that binding, and
`import { loadActiveFightsForWorld } from "./server/fight-storage.ts"` resolves
even though nothing in `virtual-world.js` mentions `fight-storage` — it is
reached only through `fight-helpers.ts`. This is what makes `eval` an
inspection tool for the whole server tree instead of a window onto one file.
Also on MCP, as `eval_script`.

Two rough edges in the import support:

- `import * as ns from "./server/m.ts"` is rejected; only default, named,
  default-plus-named and bare-side-effect forms are accepted.
- `require()` and `import` disagree on the path. `require("server/x.ts")`
  works, `require("./server/x.ts")` answers `Unknown asset module` — the exact
  spelling `import` demands. One of the two should learn the other's form.

The original proposal follows.

```
POST /engine/eval?uri=…&rollback=true&timeout_ms=5000
  body: JS source, evaluated with the script's globals and modules in scope
→ 200 { value, console: [{level, message, ts}], duration_ms, rolled_back }
```

So this:

```js
JSON.stringify(database.query("vworld_players", '{"world_id":3}', 20));
```

replaces: author a test file → deploy it → run the suite → decode the answer out
of an assertion message → delete the test file.

Notes:

- `rollback` defaults to `true`, wrapping the evaluation in a transaction, so
  mutation experiments are cheap to try. Asset writes, secret writes, and
  outbound HTTP stay real, same caveat as `run_tests`.
- Owner-or-administrator only, same authorization as `run_tests`.
- Console capture is the point as much as the return value.

## 3. `POST /engine/assets/batch` — atomic multi-file write — SHIPPED

Addresses (3). Implemented and verified 2026-08-22; both uploaders now use it —
`scripts/deploy-assets.js` (`make deploy-changed`) and `scripts/upload-script.js`
(`make upload-virtual-world`), so the ~70-re-init full push described above is
gone: virtual-world's 103 assets go up as one 2.1 MB request and one `init()`.

It shipped as proposed, with `mimetype` added per file, `script` accepted in
the body as well as the query string, and `written` plus `timestamp` alongside
the proposed response fields. Verified against virtual-world: a 2-file write
answers in ~1s with a single `init: { ran: true, success: true, durationMs:
834 }`; a batch containing one malformed entry returns 400 and writes
_nothing_ (the valid sibling 404s on read-back, so the transaction claim
holds); a wrong `sha256` is rejected the same way, so the digest is checked
rather than merely echoed; identical content comes back `status: "unchanged"`
with `written: 0`; and `reinit: "never"` reports `init: { ran: false, reason:
"reinit=never" }`.

Both uploaders use that last switch to get down to exactly one `init()`.
`deploy-assets.js` asks for `reinit=never` when the entrypoint is part of the
same push and lets the trailing `upsert_script` supply the init, so the new
modules and the new entrypoint are never initialized apart. `upload-script.js`
chunks a large tree under a payload cap and marks every chunk but the last
`reinit=never`, so the init never runs against a tree still missing files.
Both close the non-atomicity window the per-file loop had, where a scheduler
tick could observe a half-uploaded tree.

The one ordering constraint: assets carry a foreign key to the script row, so
a batch against a URI that does not exist yet fails on
`fk_assets_script_uri`. `upsert_script` has to come first for a new script,
which is why a full bundle push costs two `init()`s (one from the script
upsert, one from the batch) rather than one — `upsert_script` has no
`reinit` switch of its own. Worth adding if §3 gets a follow-up.

**What it did not close, and §4 since did:** batch content is inline base64
only, so a one-line change to a 900-line module still shipped the whole file.
`PATCH /engine/assets` closes that. And the MCP question is settled — the tool
set exposes this as `write_assets`, with the same `reinit` switch and the same
atomicity, so MCP-only deploys are practical.

The original proposal follows.

```
POST /engine/assets/batch?script=…
  body: { files: [{ name, content_base64, sha256? }], reinit: "after"|"never" }
→ 200 { results: [{ name, sha256, bytes, status }], init: {…} }
```

One request, one `init()` at the end, per-file sha256 echoed back so the caller
can verify without a read-back round trip. This is what makes MCP-only deploys
practical; today the batching lives in `scripts/deploy-assets.js` and therefore
requires a checkout.

## 4. `PATCH /engine/assets` — edit without resending the file — SHIPPED

Addresses (4). Implemented and verified 2026-08-22, against
`server/world-domain.ts` (1392 lines, 49305 bytes) on virtual-world.

It shipped as proposed, plus two things the proposal did not ask for:

- **`base_sha256`**, an optional precondition on the stored content. A
  mismatch is **409** and writes nothing, so an edit is a change to a known
  version rather than to whatever happens to be stored — the concurrent-write
  answer the proposal had none for.
- **`reinit: "after" | "never"`**, matching the batch switch, so a run of edits
  across several modules can collapse to one `init()` instead of one per file.

The paired scoped read shipped too: `lines=120-180` (also `120-` and `120`) and
`grep=<regex>`, which answers with matching line numbers and `match_count`
instead of the file. Both read forms also return the whole-file `sha256`, which
is exactly what feeds the next call's `base_sha256`, so the read → edit loop
closes without a separate round trip.

Verified: a `grep` for `export function` returned 51 numbered matches and
`total_lines` without transferring the module; a real edit reported
`replacements: 1` with bytes 49305 → 49317 and `init: { ran: false, reason:
"reinit=never" }`; the revert restored the file **byte-exact** with
`init: { ran: true, success: true, durationMs: 652 }`. `replace_all: true`
counted exactly the 51 sites `grep` had predicted and reverted byte-exact.

The failure modes all reject cleanly and write **nothing** — sha256 confirmed
unmoved after each:

- an `old_string` that is not present → 400
- an `old_string` matching 51 times without `replace_all` → 400, naming the
  count and telling the caller to add surrounding text or pass `replace_all`
- a stale `base_sha256` → 409, echoing both expected and stored digests
- a multi-edit batch whose second edit is bogus → 400, and the valid first edit
  is **not** applied, so `edits` is atomic. The error reads "as the earlier
  edits left it", so edits apply sequentially, each against the previous one's
  output — same semantics as a local multi-edit.
- an identity edit (`old_string == new_string`) → 400 rather than a silent no-op

Why it matters here, measured: across the last 40 commits, 88 asset-file edits
changed 7685 lines in files totalling 71873 lines — about **11%** of a touched
file. Seven assets exceed 49 KB (`tree-action-helpers.ts` 88 KB,
`client-editors.js` 85 KB). Every one of those edits used to ship whole, so
roughly 89% of each push was retransmitted unchanged bytes.

Note the win lands on the MCP/agent path, not on the `Makefile` loop:
`make deploy-changed` already sends only changed _files_ in one batched
transaction, so a local session was never paying the whole-file cost twice.
§4 is what makes a **server-side** edit loop cost about what a local `Edit`
costs.

Also on MCP, as `edit_asset` — with `base_sha256` and `reinit` both exposed —
alongside `read_asset`, which takes `lines` and `grep` and returns the
whole-file sha256 that feeds the next patch. The server-side edit loop is
therefore complete over MCP: locate with `grep`, read the range, patch against
the digest you read.

**The security finding recorded here is fixed.** Anonymous asset reads on
virtual-world now fail: whole-file, `lines=` and `grep=` all answer 404 with no
token and with a garbage one. An unauthenticated listing returns 200 with an
empty `assets` array rather than the tree — masking rather than rejecting, but
nothing leaks.

One rough edge: an out-of-range `lines=99999-100000` answers 200 with empty
content and `end_line` clamped to `total_lines` (below `start_line`), rather
than the 400 the spec's "unreadable range" suggests.

The original proposal follows.

```
PATCH /engine/assets?script=…&asset=server/move-player.ts
  body: { edits: [{ old_string, new_string, replace_all? }] }   // or a unified diff
→ 200 { sha256, bytes, replacements }
```

Paired with a scoped read on `GET /engine/assets`:

- `lines=120-180` to fetch a range
- `grep=<pattern>` to locate without downloading

Together with (3), an agent's server-side edit loop costs about what a local
`Edit` costs. Without it, every one-line change to a 900-line module is a full
base64 upload.

## 5. Asset versions and rollback — NOT SHIPPED

Addresses (5). The server-side substitute for the safety net git provides.
Confirmed absent 2026-08-22: `/engine/assets/history` 404s, and no snapshot
route exists in the OpenAPI document or the MCP tool set.

This is now the largest _unshipped_ item, and §4 shipping is what promoted it.
`base_sha256` stops an edit clobbering a write the caller never saw; nothing
undoes a write the caller made and regretted. With `edit_asset` on MCP, an
agent can rewrite prod modules without a checkout — and without a checkout
there is no `git checkout` either.

```
GET  /engine/assets/history?script=…&asset=…   → [{ version, sha256, bytes, at, by }]
GET  /engine/assets?script=…&asset=…&version=N
POST /engine/assets/revert?script=…&asset=…&version=N
POST /engine/snapshots?script=…&label=before-fight-refactor
POST /engine/snapshots/restore?script=…&label=…
```

Labelled whole-script snapshots matter more than per-file history: the risky
changes in this codebase are cross-module (a schema step plus the modules that
read it), and reverting them one file at a time reintroduces the inconsistent
state you were escaping.

## 6. Log filtering and an SSE tail — SHIPPED, with one gap

Addresses (6). Verified 2026-08-22 against a throwaway probe script
(`https://example.com/logprobe`, deployed and deleted for the test).

Both endpoints exist and work as proposed, and the listing shipped with more
filters than were asked for:

```
GET /engine/script_logs?uri=…&level=…&since=…&after_seq=N&contains=…
  &request_id=…&kind=…&route=…&limit=…
GET /engine/script_logs/stream?…same filters…&after_seq=N&backlog=N   (SSE)
DELETE /engine/script_logs?uri=…                    (clear one script, or prune all)
```

`uri` is optional on both — omit it to read or tail every script at once.

Each entry is `{ scriptUri, message, level, timestamp, seq, requestId, kind,
route }`. The request-id correlation the proposal asked for is real end to end:
every HTTP response carries an `x-request-id` header, and `request_id=` returns
exactly the lines that one invocation emitted. `seq` is the cursor — `after_seq`
reads forward on the listing and resumes the stream without a gap, and the SSE
`open` event hands you the starting seq.

Verified working: `level` (LOG/WARN/ERROR each isolated correctly), `contains`,
`since`, `after_seq`, `request_id`, `kind`, `route`, `limit`, `backlog`, the
live tail (a filtered tail picked up new entries as they were written, not just
replay), and `DELETE`. The stream polls the database rather than the write path,
so it sees the whole cluster's committed output.

**The gap: `console.*` from an HTTP route handler is never persisted.** Only the
invocation kinds that are not HTTP routes make it into the log store. A probe
whose handler logged three lines and returned 200 wrote nothing; the same script
logging from `init()` and from a `schedulerService` job wrote everything, with
`kind: "scheduled"`, `route` set to the job name, and one `requestId` per tick.
So the machinery is complete and correct — it just is not wired to the
`httpRoute` path, which makes `kind=httpRoute` and `route=/virtual-world/move`
return nothing today.

That is the case §6 was written for. Virtual-world's per-world tick runs under
the request that triggers it, so the tick/lease/SSE debugging this section
exists to enable is precisely what is still unreachable.

One related rough edge: an uncaught handler error _is_ logged, as `FATAL` with
the handler name and a stack, but with `kind`, `route` and `requestId` all
`null` — so a 500 cannot be tied back to the request that caused it, even though
that request had an `x-request-id`.

**Re-verified 2026-08-22, second pass: both are unchanged.** A fresh probe
registering `GET /logprobe/ping` logged one line at each of LOG, WARN and ERROR
and returned 200 with `x-request-id: req_1787425016082_3400`; `script_logs` for
that script contained only the `init` lines, nothing from the handler, at any
level. A second route that logged and then threw produced exactly one entry —
`FATAL`, `kind: null`, `route: null`, `requestId: null` — and the `console.log`
that ran immediately before the throw was dropped along with the rest.

This is still the highest-value _wiring_ change on the list. Every other way of
watching the engine work now exists; this is the one execution context none of
them can see into, and it is the context virtual-world's ticks, leases and SSE
customizers run in.

The original proposal follows.

```
GET /engine/script_logs?uri=…&since=<ts|cursor>&level=error&contains=vwDiag
  &route=/virtual-world/move&limit=200
GET /engine/script_logs/stream?uri=…&level=…            (SSE)
```

Plus a request id correlating a route invocation with the log lines it emitted.
The tick/lease/SSE paths in virtual-world are the hardest thing to debug here
precisely because their output is interleaved with every other request in one
undifferentiated dump. A live tail also lets a session watch a real play session
while a human drives the client.

## 7. Test harness upgrades — PARTLY SHIPPED

Addresses (2) from the other side.

- ~~**Per-case timing.**~~ Shipped. Every case now reports
  `{ name, file, status, durationMs }`, and a failure adds `error` with a
  stack. Full virtual-world suite 2026-08-22: 321/321 in 29966ms, with the
  slowest cases immediately visible instead of bisected out by `filter`.
- **Return captured console per case.** Still not shipped, and it is worse than
  "the result omits it" — a probe case that called `console.log` and passed,
  and a second that logged and then threw, produced no console output anywhere:
  not in the case object, and not in `script_logs` under `kind: "test"` either.
  The output is discarded, so encoding diagnostics into assertion messages
  remains the only channel out of a test.
- **Accept an inline test module** in the `run_tests` body, so a throwaway case
  runs without deploying a file and without leaving one behind on failure.
  Not shipped — `run_tests` takes only `uri`, `filter` and `rollback`. Much
  less pressing now that §2 covers the one-off question, which was most of the
  motivation.

One misleading message, worth a one-line fix: when `filter` matches no case,
`run_tests` answers `total: 0` with `"No test modules found. Tests are assets
named '*.test.ts'…"` — which describes a completely different failure and sends
the caller looking for a discovery bug. `filter=producing` returned 4 cases and
`filter=nonexistentzzz` returned that message.

## 8. Read-only database introspection — NOT SHIPPED, and largely moot

Confirmed absent 2026-08-22. But §2 gaining module imports has taken most of
the value with it: `eval` can now call any storage helper in the tree by name,
which is a better answer to "what is in `vworld_npcs` right now" than a generic
row browser would be. Keep it only for the blast-radius argument below.

```
GET /engine/db/tables?uri=…                → [{ name, columns, row_count }]
GET /engine/db/rows?uri=…&table=vworld_npcs&filter=…&limit=…&order=…
```

Strictly scoped to tables owned by the calling script, read-only. Largely
subsumed by (2), but cheap and safe enough to hand to an agent without the
blast radius of arbitrary evaluation — and most virtual-world debugging really
is "what is actually in `vworld_*` right now".

## 9. Runtime and route diagnostics — NOT SHIPPED

`GET /engine/script_init_status` still returns only
`{ scriptName, initialized, initError, lastInitTime, createdAt, updatedAt }` —
no phase breakdown, no duration, no stack. `check` reports `durationMs`
against the budget, but only for a sandbox run, not for the deploy that is
actually live.

Extensions to what `/engine/script_init_status` and `/engine/routes` already
report:

- Per-phase `init()` timing and the last error with a stack.
- Route listing annotated with whether each handler name actually resolves in
  the entrypoint scope — the same footgun as in (1), but observable
  post-deploy rather than statically.
- Registered streams, scheduled jobs, and MCP tools, so a deploy can be
  verified as complete rather than merely accepted.

## 10. A single `deploy` MCP tool — MOSTLY COVERED

`write_assets` and `edit_asset` both run `init()` and return its outcome
inline — `init: { ran, success, durationMs, error }` — so a deploy is already
one call that reports whether startup survived it. What the proposed tool would
still add is the verification half: re-running `check`'s `missing-handler` pass
after the write, so a deploy that registers a route the new entrypoint no
longer defines is caught by the deploy itself rather than by the next request.
Low priority now.

## 11. Client-side verification

The genuinely hard one, since `assets/public/*.js` runs in a browser.

- **Cheap version:** static check that every global referenced in a
  `public/*.js` file is defined by an earlier script tag in the load order
  declared in `page-bootstrap.ts`, and that each file has a matching
  `safeRegisterAssetRoute` entry in `runtime-registration.ts`. That catches the
  two failure modes this split has actually produced.
- **Expensive version:** headless page load reporting console errors and failed
  asset fetches.

The cheap version is worth doing as part of (1)'s `engine` check group. The
expensive version probably is not worth building into the engine.

## 12. Dev-side virtual-world MCP tools

The `virtualWorld*` tools cover gameplay. Development needs a different set:

- `virtualWorldSeedFixture` — deterministic world + players + items
- `virtualWorldSnapshot` / `virtualWorldRestore` — world state checkpoints
- `virtualWorldForceTick` — drive NPC, follow/fight, and respawn ticks without
  waiting on wall-clock timers
- a scripted bot player for end-to-end behavior checks

This is the only proposal that belongs to this example rather than the engine.
It makes behavioral testing possible without a browser and without waiting on
lease and respawn timing.

## Known defects and rough edges

Small, found while surveying; none of them block anything, all of them cost a
reader a wrong guess.

- **`missing-handler`'s message is garbled.** It reads "The route '/x'
  delegates to 'foo', but 'foo' is defined, but it is a undefined." The
  negative branch of the template is broken; it should say the name is not
  defined. §1.
- **`init-failed` puts a stack in the `file` field.** `file` comes back as
  `"Stack:     at https://example.com/virtual-world"` instead of the script
  URI, while the message carries the stack as well. §1.
- **`check` silently ignores unknown body fields.** `assets:`/`files:` next to
  `content` produce a clean pass that checked neither. §1.
- **`check` does not report path collisions** it advertises catching. §1.
- **`run_tests` reports "No test modules found" when a filter matched nothing.**
  §7.
- **`eval` rejects `import * as ns`, and `require()` wants a different path
  spelling than `import`.** §2.

## Priority

| Rank | Proposal                           | What it unblocks                |
| ---- | ---------------------------------- | ------------------------------- |
| —    | §2 `POST /engine/eval` (+ imports) | shipped                         |
| —    | §1 `POST /engine/check`            | shipped (engine checks only)    |
| —    | §3 `POST /engine/assets/batch`     | shipped                         |
| —    | §4 `PATCH /engine/assets`          | shipped                         |
| —    | §6 log filtering and tail          | shipped (route logs still lost) |
| —    | §7 per-case timing                 | shipped                         |
| —    | MCP exposure of all of the above   | shipped                         |
| 1    | §1 follow-up: `checks=types`       | the last local-only step        |
| 2    | §6 follow-up: log route calls      | debugging ticks and streams     |
| 3    | §5 versions and snapshots          | working unattended against prod |
| 4    | §7 console per case                | reading a test's own output     |
| 5    | §8–§12                             | incremental                     |

**§1's type-checking group has overtaken §6 as the top item, precisely because
everything else shipped.** Edit, deploy, check, inspect and test are all
server-side and all MCP-reachable now; `make format lint typecheck` is the only
step in `CLAUDE.md`'s mandatory loop that still needs `node_modules` and a
checkout. A session working over MCP can `edit_asset` a type error into a
1400-line `.ts` module and get a green `check` for it, because nothing between
the edit and the runtime failure looks at types. Format and lint parity matter
much less — they are cosmetic, and their absence does not produce a broken
deploy.

**§6 keeps rank 2 on its original argument, re-verified.** Route handlers still
persist nothing, so virtual-world's per-world ticks, move leases and SSE
customizers — all of which run under an HTTP request — remain the one execution
context no tool can see into. It is a wiring change, not a new endpoint.

**§5 rises because §4 shipped to MCP.** The shipped set closed "edit affordably
from the server side" end to end; what it did not close is undo. `base_sha256`
prevents clobbering a write you never saw, but nothing reverses one you made.
An agent editing prod without a checkout has no `git checkout` behind it.

The reach complaints in the previous revision are resolved: `eval` imports the
whole module graph, and `batch`, `patch`, `check` and `eval` are all exposed as
MCP tools. What is left of that theme is `check`'s candidate content covering
the entrypoint only.

## Out of scope — stays local

- Git history, branching, and commits.
- A human looking at the actual 3D client.

## Open questions

- Does `eval` need a separate permission from `run_tests`, or is
  owner-or-administrator sufficient? Sharper now that a snippet can import the
  whole module tree: `eval` reaches every server function the script has,
  which a test module could also do, but with far more ceremony.
- ~~Should `check` run against the deployed tree only, or accept a candidate set
  of files so it can be run _before_ deploying?~~ Answered by the shipped
  endpoint: it takes candidate content in the body. It replaces the entrypoint
  only, though — asset modules still resolve to the deployed copies, so a
  candidate check of a multi-file change is still a mixture. Extending
  candidate content to a set of assets is the remaining gap.
- Where should a server-side typecheck get its ambient types from? The engine
  serves `aiwebengine.d.ts` itself, so the globals are covered, but this repo's
  split (`tsconfig.json` for `.ts`, `jsconfig.json` with `checkJs`+`strict` for
  `.js`) is a local convention the server knows nothing about. A single
  strictness setting for everyone is probably the honest answer.
- Do asset versions need a retention policy, or is unbounded history fine at
  this scale?
