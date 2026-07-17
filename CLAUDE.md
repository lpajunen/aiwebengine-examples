# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Scope

This repository contains example scripts for **aiwebengine**, a JS/TS scripting platform where scripts are uploaded to a remote server (default `https://softagen.com`) and export an `init()` function that registers HTTP routes, GraphQL resolvers, or streams. There is no local server to run — scripts execute remotely after upload.

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
make fetch-types           # types/aiwebengine.d.ts, types/aiwebengine-priv.d.ts
make fetch-openapi         # apis/openapi.json
make fetch-graphql-schema  # schemas/schema.json
make all                   # all of the above + format
```

### Deployment

```bash
make oauth-login                    # re-authenticate if you get "Token has expired"
make upload-virtual-world           # deploys virtual-world.js + assets/ to https://softagen.com
make upload-virtual-world-dry-run   # dry run, no upload
```

`upload-virtual-world` runs `scripts/upload-script.js` with `--script-path src/virtual-world/virtual-world.js --script-uri https://example.com/virtual-world --assets-dir src/virtual-world/assets`. There's a parallel `npm run upload-import-example` for `src/import_example/`. Other example scripts have no dedicated upload target — use `scripts/upload-script.js` directly with `--script-path` and `--script-uri`, or upload via the editor at `https://softagen.com/editor` or `aiwebengine-mcp` MCP server tools when available.

`SERVER_HOST` env var overrides the default server for all of the above (types/openapi/graphql fetch and uploads).

## Architecture

### Script model

Every deployed script is a single JS/TS entrypoint that must export `init()`. `init()` registers routes/resolvers/streams against globals declared in `types/aiwebengine.d.ts` (`routeRegistry`, `graphQLRegistry`, `ResponseBuilder`, etc. — fetch this file locally with `make fetch-types` before working on type-checked code; it's gitignored). Handlers receive a `HandlerContext` with `context.request` (path, method, headers, query, params, form, body, files, auth).

### Virtual World: server/ vs assets/server/ split

`src/virtual-world/virtual-world.js` is the single deployed entrypoint. It imports server-side modules from `./server/*.ts`, but **those files are one-line re-export shims**:

```ts
// src/virtual-world/server/chat-storage.ts
export * from "../assets/server/chat-storage.ts";
```

The actual implementation lives in `src/virtual-world/assets/server/*.ts` (same filenames, real content). `src/virtual-world/assets/` is uploaded as the assets directory alongside the script (`--assets-dir src/virtual-world/assets`), so the real modules must physically live under `assets/` to be deployed — the `server/` shims exist purely so `virtual-world.js`'s relative imports resolve locally/for typechecking. **When editing virtual-world server logic, edit the file under `assets/server/`, not the shim under `server/`.** Keep both directories' filenames in sync when adding a new module (add the real file under `assets/server/`, add a matching one-line re-export shim under `server/`).

`src/virtual-world/assets/public/` is browser-side JS served as static assets:
- `virtual-world-browser-globals.d.ts` defines browser-global types — keep in sync with runtime usage in `client.js`, `scene.js`, etc.
- `client.js`, `scene.js`, `app-state.js`, `auth.js`, `i18n.js`, `tiles-and-items.js` are plain JS with JSDoc types, referencing the globals file.

JSX in this repo uses `h`/`Fragment` factories (configured via `jsxFactory`/`jsxFragmentFactory` in `tsconfig.json`), not React's default `React.createElement`.

### Type checking split

- `tsconfig.json` covers `.ts`/`.tsx`/`.jsx` files (strict is not set; `checkJs: false`).
- `jsconfig.json` covers `.js` files under `src/` with `checkJs: true` and `strict: true` — plain JS example scripts are still fully type-checked via JSDoc annotations, so add `@param`/`@returns` JSDoc when writing new `.js` example scripts.
- Both include `types/**/*.d.ts`, so `make fetch-types` must be run before typecheck will resolve `HandlerContext`, `ResponseBuilder`, etc.

### Repo layout

- `src/` — one directory per example script; `virtual-world` is the actively developed one, others are static reference examples
- `scripts/` — tooling: `oauth_pkce_token.js` (OAuth login), `upload-script.js` (deploy), `fetch-graphql-schema.js`
- `types/`, `apis/`, `schemas/` — fetched/gitignored metadata from the remote server (never hand-edit; regenerate via `make fetch-*`)
- `schemas/token.json` — OAuth tokens, gitignored, never commit

## Security

- Never commit `schemas/token.json` (OAuth tokens) or a populated `.env`.
- See `SECURITY.md` for the project's vulnerability-reporting policy.
