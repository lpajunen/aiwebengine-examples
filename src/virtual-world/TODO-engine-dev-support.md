# Engine dev-support APIs — proposal

Status: proposal. §1 has since shipped as `POST /engine/check` — see below.
Everything else is still unimplemented on `MANAGE_HOST`.

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

**Open defect blocking its use here:** the check cannot run against
virtual-world. Bisecting `init()` phase by phase against the live endpoint puts
it on the two schema migration entry points — `ensureWorldDatabaseSchema` and
`ensureChatDatabaseSchema` stall the sandbox indefinitely, while
`registerVirtualWorldRuntimeImpl` (1.5s), `bootstrapTileClassesImpl` (1.1s),
the full 35-import module graph (1.3s), and a lone `database.createTable`
(49ms) all pass. Other deployed scripts check in ~0.2s. This is the same
limitation already recorded for `*.test.ts` — migration entry points cannot run
in these sandboxes — so fixing it once would unblock both. Until then the
target exists but times out on the one script that most needs it.

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

## 2. `POST /engine/eval` — run a snippet in the script's sandbox

Addresses (2). Highest round-trip savings of anything here.

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

## 3. `POST /engine/assets/batch` — atomic multi-file write

Addresses (3).

```
POST /engine/assets/batch?script=…
  body: { files: [{ name, content_base64, sha256? }], reinit: "after"|"never" }
→ 200 { results: [{ name, sha256, bytes, status }], init: {…} }
```

One request, one `init()` at the end, per-file sha256 echoed back so the caller
can verify without a read-back round trip. This is what makes MCP-only deploys
practical; today the batching lives in `scripts/deploy-assets.js` and therefore
requires a checkout.

## 4. `PATCH /engine/assets` — edit without resending the file

Addresses (4).

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

| Rank | Proposal                      | What it unblocks                |
| ---- | ----------------------------- | ------------------------------- |
| 1    | §2 `POST /engine/eval`        | inspection without deploying    |
| 2    | §1 `POST /engine/check`       | the mandatory local step        |
| 3    | §3 + §4 batch write and patch | editing affordably over MCP     |
| 4    | §6 log filtering and tail     | debugging ticks and streams     |
| 5    | §5 versions and snapshots     | working unattended against prod |
| 6    | §7–§12                        | incremental                     |

The first three ranks remove the mandatory local step, remove the round trip of
deploying code just to ask the server a question, and make asset editing cheap
enough to work entirely through MCP. Ranks 4 and 5 then make working that way
safe.

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
