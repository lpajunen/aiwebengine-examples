# Engine dev-support APIs — proposal

Status: proposal. §1, §2, §3 and §4 have since shipped, as `POST /engine/check`,
`POST /engine/eval`, `POST /engine/assets/batch` and `PATCH /engine/assets` —
see below. Everything else is still unimplemented on `MANAGE_HOST`.

Scope: engine-wide additions to the `/engine/...` management API and the
`aiwebengine-mcp` tool set. The proposals are engine-level, but the motivating
workload is `src/virtual-world/` — the only example in this repo under active,
multi-file development.

Goal: move as much of the develop → check → deploy → inspect loop onto the
server as possible, so a session working through MCP alone can do real
development instead of only deploying artifacts a local checkout produced.

## Where the loop stands today

The server already covers more than the `Makefile` suggests. `/engine/...` and
the `softagen-manage` MCP tools handle asset and script CRUD, search, test runs,
logs, init status, route listing, secrets, owners, and host binding. Deploy and
test are, in principle, already server-side operations.

What still pins work to a local machine:

1. **`make format lint typecheck`.** `CLAUDE.md` requires it after every change
   and there is no server equivalent. It needs `node_modules`, so it is the
   hardest local dependency in the loop.
2. **Ad-hoc inspection.** Reading a `vworld_*` table or calling one server
   function means authoring a `*.test.ts`, deploying it, and running the suite.
   The harness captures no console output, so results have to be smuggled out
   through assertion failure messages.
3. **Batching.** `POST /engine/assets` writes one file per request and each
   write re-runs `init()`. A full virtual-world push is ~70 re-inits against a
   5000 ms budget, which is why `scripts/deploy-assets.js` exists.
4. **Whole-file rewrites.** There is no patch endpoint, so every edit ships the
   entire file as inline base64.
5. **History and rollback.** Assets have no versions. Git is the only undo and
   it lives locally — uncomfortable given that prod doubles as the test
   environment here.
6. **Log ergonomics.** `GET /engine/script_logs` accepts only `uri`: no
   `since`, `level`, `limit`, `contains`, and no stream.

Each proposal below targets one of those six.

## 1. `POST /engine/check` — server-side check — SHIPPED

Addresses (1). Implemented; `make check-virtual-world` calls it via
`scripts/check-script.js`.

The shipped endpoint goes further than proposed here: rather than static
analysis, it runs the script's `init()` in a sandbox and reports what it would
do if deployed, with database writes rolled back by default. It also accepts
candidate content in the request body, answering the open question below — a
check can run before the code is deployed. The `checks=` grouping and the
prettier/lint parity described below did not ship and may not need to.

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

**One limitation worth closing:** the snippet's scope is exactly the
_entrypoint's_ top-level bindings plus engine globals, and `import` is not
supported, static or dynamic. Against a deliberately thin entrypoint like
virtual-world's that hides most of the codebase — `VWORLD_NPC_TABLE` resolves
because `virtual-world.js` imports it, `VWORLD_PLAYER_POSITION_TABLE` does not.
Letting a snippet import from the script's own asset modules would make this
reach the whole server tree instead of one file's import list.

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
`PATCH /engine/assets` closes that. Whether it makes MCP-only deploys practical
still depends on the `aiwebengine-mcp` tool set exposing batch and patch; only
the REST endpoints have been verified here.

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

**Unrelated finding, worth a decision.** Asset reads on virtual-world need no
authentication at all — `GET /engine/assets` returns 200 with no token and with
a garbage one. That predates §4 and `grep=` leaks nothing a whole-file download
did not, but it does upgrade anonymous access from "fetch the file" to "search
the tree", which is a different thing to have pointed at a script that may
carry embedded credentials.

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

## 5. Asset versions and rollback

Addresses (5). The server-side substitute for the safety net git provides.

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

## 6. Log filtering and an SSE tail

Addresses (6).

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

## 7. Test harness upgrades

Addresses (2) from the other side.

- **Return captured console per case.** Today the harness prints nothing, so
  every diagnostic has to be encoded into an assertion message.
- **Per-case timing.** The suite runs against a 120 s budget; knowing which case
  is eating it currently requires bisecting by `filter`.
- **Accept an inline test module** in the `run_tests` body, so a throwaway case
  runs without deploying a file and without leaving one behind on failure.

With (2) and this, "deploy something to ask the server a question" stops being
the only mechanism.

## 8. Read-only database introspection

```
GET /engine/db/tables?uri=…                → [{ name, columns, row_count }]
GET /engine/db/rows?uri=…&table=vworld_npcs&filter=…&limit=…&order=…
```

Strictly scoped to tables owned by the calling script, read-only. Largely
subsumed by (2), but cheap and safe enough to hand to an agent without the
blast radius of arbitrary evaluation — and most virtual-world debugging really
is "what is actually in `vworld_*` right now".

## 9. Runtime and route diagnostics

Extensions to what `/engine/script_init_status` and `/engine/routes` already
report:

- Per-phase `init()` timing and the last error with a stack.
- Route listing annotated with whether each handler name actually resolves in
  the entrypoint scope — the same footgun as in (1), but observable
  post-deploy rather than statically.
- Registered streams, scheduled jobs, and MCP tools, so a deploy can be
  verified as complete rather than merely accepted.

## 10. A single `deploy` MCP tool

Chains batch-write → wait for `init()` → report init status and any route that
stopped resolving, in one call. Collapses the `deploy-verify` skill's several
round trips into one, which matters when the caller is paying per tool call.

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

## Priority

| Rank | Proposal                       | What it unblocks                |
| ---- | ------------------------------ | ------------------------------- |
| —    | §2 `POST /engine/eval`         | shipped                         |
| —    | §1 `POST /engine/check`        | shipped                         |
| —    | §3 `POST /engine/assets/batch` | shipped                         |
| —    | §4 `PATCH /engine/assets`      | shipped                         |
| 1    | §6 log filtering and tail      | debugging ticks and streams     |
| 2    | §5 versions and snapshots      | working unattended against prod |
| 3    | §7–§12                         | incremental                     |

The four shipped endpoints close "edit affordably over MCP" end to end: `check`
and `eval` removed the round trip of deploying code just to ask the server a
question, `batch` made a multi-file push one atomic init, and `patch` made each
file in that push cost its diff instead of its size. What remains is not
capability but safety — a session can now edit prod from the server side
faster than it can see what it did. §5 (versions and snapshots) is the real
counterweight and arguably now outranks §6: `base_sha256` prevents clobbering a
write you did not see, but nothing yet lets you undo one you did.

The remaining gap in the shipped set is reach, not affordance. `eval` cannot
`import` the script's own modules, `check` swaps in candidate content only for
the entrypoint, and neither `batch` nor `patch` is confirmed to be exposed
through `aiwebengine-mcp` — so an MCP-only session may still be unable to
reach any of this.

## Out of scope — stays local

- Git history, branching, and commits.
- A human looking at the actual 3D client.

## Open questions

- Does `eval` need a separate permission from `run_tests`, or is
  owner-or-administrator sufficient? It is strictly more powerful than what a
  deployed test module can already do — but only barely, since a test module
  can do anything too.
- ~~Should `check` run against the deployed tree only, or accept a candidate set
  of files so it can be run _before_ deploying?~~ Answered by the shipped
  endpoint: it takes candidate content in the body. It replaces the entrypoint
  only, though — asset modules still resolve to the deployed copies, so a
  candidate check of a multi-file change is still a mixture. Extending
  candidate content to a set of assets is the remaining gap.
- Do asset versions need a retention policy, or is unbounded history fine at
  this scale?
