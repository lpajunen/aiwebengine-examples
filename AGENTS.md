# AI Agent Instructions

## Scope

This repository contains example scripts for aiwebengine. The primary development focus is the **Virtual World** example.

Primary code area: `src/virtual-world/`

Other directories under `src/` are standalone examples. Keep changes scoped to the relevant example unless explicitly asked to work across them.

## Validation After Changes

Run after every code change — no exceptions:

```bash
make format lint typecheck
```

This runs Prettier, markdownlint, and TypeScript checks (both `tsconfig.json` for TS and `jsconfig.json` for JS). There is no test suite.

## Deployment (CLI)

```bash
make upload-virtual-world
```

Deploys `src/virtual-world/virtual-world.js` and assets from `src/virtual-world/assets/` to `https://softagen.com/`.

If you get `Token has expired`, re-authenticate first:

```bash
make oauth-login
make upload-virtual-world
```

A dry-run is available: `make upload-virtual-world-dry-run`.

Alternatively, use `aiwebengine-mcp` server tools for deployment and log retrieval when available.

## Repo Structure

- `src/` — example scripts, each in its own directory
- `scripts/` — tooling: OAuth login, upload, GraphQL schema fetch
- `types/` — fetched aiwebengine type definitions (gitignored; run `make fetch-types`)
- `apis/` — fetched OpenAPI spec (gitignored; run `make fetch-openapi`)
- `schemas/` — fetched GraphQL schema (gitignored; run `make fetch-graphql-schema`)
- `schemas/token.json` — OAuth tokens (gitignored, never commit)

## Virtual World Conventions

- `src/virtual-world/virtual-world.js` is the entrypoint, deployed as a single script.
- `src/virtual-world/server/` contains TypeScript server-side modules.
- `src/virtual-world/assets/public/virtual-world-browser-globals.d.ts` defines browser-global types; keep in sync with runtime usage.
- JSX uses `h`/`Fragment` (configured in `tsconfig.json`).
