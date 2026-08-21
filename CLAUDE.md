# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Scope

This repository contains example scripts for **aiwebengine**, a JS/TS scripting platform where scripts are uploaded to a remote server and export an `init()` function that registers HTTP routes, GraphQL resolvers, or streams. There is no local server to run — scripts execute remotely after upload.

Three hosts are involved, and they are not interchangeable:

- **`MANAGE_HOST`** (default `https://manage.softagen.com`) — the management surface: the engine HTTP API under `/engine/...` (upload, assets, logs, tests), the MCP endpoint `/mcp`, the authenticated `/graphql` endpoint, and OAuth discovery. Every tooling script in `scripts/` talks to this host. `/engine/*` **404s on softagen.com**.
- **`SERVER_HOST`** (default `https://softagen.com`) — the engine's default host for deployed solutions; where the example scripts' registered routes are served.
- **`WORLD_HOST`** (default `world.softagen.com`) — the hostname the `virtual-world` example is published on, bound with `make set-script-hosts`.

The primary development focus is **`src/virtual-world/`**, a multiplayer world/game example. Other directories under `src/` (`blog`, `feedback`, `chat_app`, `hello`, `mcp_tools_demo`, etc.) are small standalone single-file examples. Keep changes scoped to the relevant example directory unless explicitly asked to work across them.

## Commands

Run after every code change — no exceptions:

```bash
make format lint typecheck
# equivalent to: npm run format && npm run lint && npm run typecheck
```

- `format` — Prettier, writes `**/*.js **/*.ts **/*.json **/*.md`
- `lint` — markdownlint on `**/*.md`
- `typecheck` — runs both `tsc -p tsconfig.json` (TS/TSX files) and `tsc -p jsconfig.json` (checked JS files); there is no test suite

`npm run verify` (`format-check` + `lint` + `typecheck`, no writes) is the CI-safe variant used to check without mutating files.

To typecheck/lint a single file, invoke the underlying tools directly, e.g. `./node_modules/.bin/tsc -p tsconfig.json --noEmit` (project-wide only — `tsc` config here doesn't support single-file checking) or `./node_modules/.bin/prettier --check path/to/file.ts`.

### Fetching remote metadata (gitignored, regenerate as needed)

```bash
make fetch-types           # types/aiwebengine.d.ts
make fetch-openapi         # apis/openapi.json
make fetch-graphql-schema  # schemas/schema.json
make all                   # all of the above + format
```

### Deployment

```bash
make oauth-login                    # re-authenticate if you get "Token has expired"
make upload-virtual-world           # deploys virtual-world.js + assets/ via https://manage.softagen.com
make upload-virtual-world-dry-run   # dry run, no upload
```

`upload-virtual-world` runs `scripts/upload-script.js` with `--script-path src/virtual-world/virtual-world.js --script-uri https://example.com/virtual-world --assets-dir src/virtual-world/assets`. There's a parallel `npm run upload-import-example` for `src/import_example/`. Other example scripts have no dedicated upload target — use `scripts/upload-script.js` directly with `--script-path` and `--script-uri`, or upload via the editor at `https://manage.softagen.com/editor` or `aiwebengine-mcp` MCP server tools when available.

The deployed virtual-world is served from `https://world.softagen.com/virtual-world`; the other examples from `https://softagen.com/<name>`.

```bash
make set-script-hosts               # bind virtual-world to WORLD_HOST (admin only, one-time)
make set-script-hosts-dry-run       # preview
```

`scripts/set-script-hosts.js` calls `POST $MANAGE_HOST/engine/script_hosts?uri=…&hosts=…` (administrators only; `GET` reads the current binding, `DELETE` clears it back to the default host). `--hosts` takes a comma-separated host list, `*` for every configured host, or empty for the engine's default host; it defaults to `SERVER_HOST`'s hostname, and the `make` target passes `WORLD_HOST`.

`MANAGE_HOST` overrides where the tooling sends its `/engine/...` calls (types/openapi/graphql fetch, uploads, per-file deploys, test runs); `SERVER_HOST` and `WORLD_HOST` only affect where the docs/tooling say a deployed script is served.

### Checking a script on the server

```bash
make check-virtual-world             # POST /engine/check for the deployed copy
make check-virtual-world-candidate   # check the local entrypoint before deploying
```

`scripts/check-script.js` asks the engine what the script would do if deployed: it runs `init()` in a sandbox (database writes rolled back unless you pass `--no-rollback`) and reports diagnostics. It catches what `make format lint typecheck` structurally cannot — circular asset-backed imports (which `tsc` accepts and the engine FATALs on), route handler names the entrypoint never defines, and an `init()` over the engine's startup budget. Needs `make oauth-login`, and the caller must own the script or be an administrator.

`--candidate` sends the local entrypoint instead of the deployed one, but **only** the entrypoint — modules under `assets/` still come from the server, so deploy those first or you are checking a mixture. Use `--script-uri`/`--script-path` to point it at another example, `--timeout <seconds>` to bound the wait (default 60; a healthy check answers well inside the engine's own 10s `init()` budget), and `--json` for the raw report.

**Known limitation — this cannot currently check virtual-world itself.** Its `init()` calls the schema migration entry points (`ensureWorldDatabaseSchema`, `ensureChatDatabaseSchema`) and those stall the check sandbox indefinitely, the same way they blow the test harness's budget. Every other phase of virtual-world's `init()` passes in about a second, and the other deployed scripts check in ~0.2s, so the target and the endpoint are both sound — the migration entry points are the blocker. Until that is fixed server-side, `make check-virtual-world` times out (default 60s, `--timeout` to change).

The report carries `diagnostics` (each with `severity`, `code`, `message`, `source`), an `init` block with the measured `durationMs` against the engine's `budgetMs`, and `registrations` — every route, stream, and tool the script would register. The `missing-handler` diagnostic is the one that matters most here: virtual-world's thin entrypoint delegates by name string, and this is what catches a delegate that was never defined.

### Evaluating a snippet on the server

```bash
make eval SRC='JSON.parse(database.query("vworld_npcs", "{}", 3))'
make eval FILE=snippet.js                # snippet from a file (needs single quotes, etc.)
make eval SRC='…' ROLLBACK=false         # keep the database writes
make eval SRC='…' URI=https://example.com/docs
```

`scripts/eval-script.js` posts a snippet to `POST /engine/eval`, which runs it inside a deployed script's sandbox and returns the value, everything it logged, and the duration. Database writes roll back unless you pass `ROLLBACK=false`; asset writes, secret writes and outbound HTTP are real either way. It exits 1 when the snippet throws. Needs `make oauth-login`, and the caller must own the script or be an administrator.

This replaces "write a `*.test.ts`, deploy it, run the suite, read the answer out of an assertion message" for one-off questions — reading a table, calling one server function, checking what a helper returns. Unlike `make check-virtual-world` it works fine on virtual-world, because eval does not run `init()`.

**Scope:** the snippet sees the _entrypoint's_ top-level bindings plus the engine globals, and `import` is not supported (static or dynamic). For virtual-world that means only what `virtual-world.js` itself imports is reachable — `VWORLD_NPC_TABLE` yes, `VWORLD_PLAYER_POSITION_TABLE` no. Use the literal table name for anything the entrypoint does not import.

`SRC` is single-quoted inside the recipe, so double quotes in a snippet are safe and single quotes are not — use `FILE` for those. `scripts/eval-script.js` additionally takes `--file -` (stdin), `--timeout <seconds>` and `--json`.

### Tests

```bash
make test        # run every example's test modules on the server
make test-list   # show which scripts and test modules would run, call nothing
```

A test module is an asset named `*.test.ts` (or .js/.jsx/.tsx) sitting beside the code it covers — see `src/virtual-world/assets/server/world-domain.test.ts`. `scripts/run-tests.js` scans `src/*/assets/` for them, then asks the server to run each owning script's suite via `POST /engine/run_tests`. Nothing runs locally: the engine executes the tests in the same sandbox that serves the script, so they exercise the real engine globals.

It therefore tests the **deployed** copy. Deploy first (`make deploy-changed`) or a green run may be describing an older version of the file. Needs `make oauth-login`, and the caller must own the script or be an administrator.

Script URIs are derived from the directory name (`src/foo_bar` → `https://example.com/foo-bar`); exceptions live in `SCRIPT_URI_OVERRIDES` in `scripts/run-tests.js`. Database writes a test makes are rolled back unless you pass `--no-rollback`; asset writes, secret writes, and outbound HTTP are real.

## Architecture

### Script model

Every deployed script is a single JS/TS entrypoint that must export `init()`. `init()` registers routes/resolvers/streams against globals declared in `types/aiwebengine.d.ts` (`routeRegistry`, `graphQLRegistry`, `ResponseBuilder`, etc. — fetch this file locally with `make fetch-types` before working on type-checked code; it's gitignored). Handlers receive a `HandlerContext` with `context.request` (path, method, headers, query, params, form, body, files, auth).

### Virtual World: server/ vs assets/server/ split

`src/virtual-world/virtual-world.js` is the single deployed entrypoint, kept deliberately thin (~600 lines): imports, `init()`, and one-line named delegate functions for every route/tool/stream handler — the aiwebengine runtime resolves handlers by name string in the entrypoint's scope, so those names must stay defined there even though the bodies live in server modules. It imports server-side modules from `./server/*.ts`, but **those files are one-line re-export shims**:

```ts
// src/virtual-world/server/chat-storage.ts
export * from "../assets/server/chat-storage.ts";
```

The actual implementation lives in `src/virtual-world/assets/server/*.ts` (same filenames, real content). `src/virtual-world/assets/` is uploaded as the assets directory alongside the script (`--assets-dir src/virtual-world/assets`), so the real modules must physically live under `assets/` to be deployed — the `server/` shims exist purely so `virtual-world.js`'s relative imports resolve locally/for typechecking. **When editing virtual-world server logic, edit the file under `assets/server/`, not the shim under `server/`.** Keep both directories' filenames in sync when adding a new module (add the real file under `assets/server/`, add a matching one-line re-export shim under `server/`).

Server modules under `assets/server/`, by feature — go straight to the right file instead of grepping:

- Wiring: `runtime-registration.ts` (all route/asset/stream/tool registration), `runtime-config.ts` (DB table names, tick/lease timing, stream path — shared constants imported everywhere), `diagnostics.ts` (`vwLog`/`vwDiag`, inventory/item summaries), `route-handlers.ts` (game HTTP route handlers, page handler, SSE stream customizer), `class-crud-handlers.ts` (creator class CRUD HTTP handlers), `tool-handlers.ts` (MCP `virtualWorld*` tool handlers), `http-handler-helpers.ts` (per-route handler logic: nickname, chat/DM, presence, heartbeat; auth + creator-stone/owner-or-admin permission checks), `admin-storage.ts` (DB-only `vworld_admins` lookup — no route/tool, by design; the override authority behind the owner-scoped class permissions), `page-bootstrap.ts` (game page HTML + initial page state, script-tag load order), `schema-setup.ts` (DB schema creation/migration)
- Worlds: `world-domain.ts` (dimensions, tile constants/rules), `world-map.ts` (terrain generation, applying world mods to maps), `world-bootstrap.ts` (create/lookup worlds, world types, effective map, portal destinations), `world-switch.ts` (moving players between worlds), `world-mod-storage.ts` (persisted trees/houses/tile mods), `world-db.ts` (low-level DB row helpers, transactions), `world-class-storage.ts` (world class records + cache — size, base generation preset, spawn manifests), `world-events.ts` (world event definitions)
- Players: `move-player.ts` (movement), `player-persistence.ts` (positions, move leases), `player-snapshots.ts` (per-world player lists, canonical state, spawn positions), `social-state.ts` (nicknames, online presence + presence stream events), `chat-storage.ts` (world chat + DMs), `current-world-state.ts` (state snapshot for client/tools, move options)
- Items & actions: `item-registry.ts` (item definitions + item classes), `item-class-storage.ts` (item class rows), `item-storage.ts` (inventories, world items), `item-action-helpers.ts` (pick/drop/equip/use, container put/get for `kind: "container"` items like `chest`), `tree-action-helpers.ts`, `action-registry.ts` + `action-class-storage.ts` + `action-logic-interpreter.ts` (creator-defined action classes and their condition/effect logic — crafting is just an action whose effect `produces` an item, no separate crafting module), `item-events.ts` (item change definitions), `spawn-timer-storage.ts` + `spawn-timers.ts` (respawn timer rows and the tick that respawns items/NPCs when a timer expires)
- NPCs: `living-registry.ts` + `living-class-storage.ts` (living classes for players/NPCs), `npc-storage.ts` (NPC rows, tick bookkeeping, world NPC seeding), `npc-tick-helpers.ts` (NPC movement/item/tree behavior), `npc-orchestration.ts` (tick scheduling + lease, NPC snapshots)
- Active player actions: `active-actions.ts` (merged, sorted follow+fight list for the HUD's active-actions panel), `follow-helpers.ts` + `follow-storage.ts` (follow a player/NPC), `fight-helpers.ts` + `fight-storage.ts` (fight a player/NPC), `pending-action-storage.ts` (generic delayed-action queue used by follow/tree-action/NPC-orchestration code) — follow/fight are ticked per-world from `npc-orchestration.ts`
- Realtime: `stream-broadcast.ts` (SSE send/broadcast helpers), `event-seq.ts` (event sequence numbers/scopes)

Server modules import each other directly (no dependency injection) — table names and timing constants come from `runtime-config.ts`, logging from `diagnostics.ts`. Don't add deps-object parameters; import the sibling module instead.

`src/virtual-world/assets/public/` is browser-side JS served as static assets:

- `virtual-world-browser-globals.d.ts` defines browser-global types — keep in sync with runtime usage in the client `.js` files.
- All public `.js` files are plain global scripts (no modules) with JSDoc types, referencing the globals file. They share one global scope; load order is the script-tag order in `page-bootstrap.ts`, and each file also needs a `safeRegisterAssetRoute` entry in `runtime-registration.ts`.
- Shared foundation files: `app-state.js`, `auth.js`, `i18n.js`, `scene.js`, `tiles-and-items.js`.
- The game client is split into `client-*.js` feature files — find code by feature: `client-core.js` (shared state, HUD pickers/toast), `client-world-render.js` (terrain/tree/house/item meshes), `client-avatars.js` (player/remote/NPC avatars), `client-net.js` (sync, heartbeat, SSE), `client-actions.js` (movement, tree actions), `client-panels.js` (inventory/players panels), `client-container-panel.js` (container panel: open a chest from bag or the ground, put/take items), `client-chat.js` (chat/DM), `client-item-actions.js` (pick/drop/equip), `client-tile-detail.js` (tile inspector), `client-input.js` (keyboard/touch/joystick), `client-editors.js` (creator class editors), `client-main.js` (game loop, startup).

JSX in this repo uses `h`/`Fragment` factories (configured via `jsxFactory`/`jsxFragmentFactory` in `tsconfig.json`), not React's default `React.createElement`.

### Type checking split

- `tsconfig.json` covers `.ts`/`.tsx`/`.jsx` files (strict is not set; `checkJs: false`).
- `jsconfig.json` covers `.js` files under `src/` with `checkJs: true` and `strict: true` — plain JS example scripts are still fully type-checked via JSDoc annotations, so add `@param`/`@returns` JSDoc when writing new `.js` example scripts.
- Both include `types/**/*.d.ts`, so `make fetch-types` must be run before typecheck will resolve `HandlerContext`, `ResponseBuilder`, etc.

### Repo layout

- `src/` — one directory per example script; `virtual-world` is the actively developed one, others are static reference examples
- `scripts/` — tooling: `oauth_pkce_token.js` (OAuth login), `upload-script.js` (deploy), `deploy-assets.js` (per-file deploy), `set-script-hosts.js` (publish a script on a given host), `run-tests.js`, `fetch-graphql-schema.js`
- `types/`, `apis/`, `schemas/` — fetched/gitignored metadata from the remote server (never hand-edit; regenerate via `make fetch-*`)
- `schemas/token.json` — OAuth tokens (issued by `MANAGE_HOST`), gitignored, never commit

## Security

- Never commit `schemas/token.json` (OAuth tokens) or a populated `.env`.
- See `SECURITY.md` for the project's vulnerability-reporting policy.
