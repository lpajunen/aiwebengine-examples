# AI Agent Instructions

## Scope

This repository contains example scripts for aiwebengine. The primary development focus is the **Virtual World** example.

Primary code area: `virtual-world/`

The other script directories are standalone examples. Keep changes scoped to the relevant example unless explicitly asked to work across them.

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

Deploys `virtual-world/main.js` and every other file under `virtual-world/` as its assets, through the
management API at `https://manage.softagen.com/` (`MANAGE_HOST`). The deployed game is served from
`https://world.softagen.com/virtual-world` (`WORLD_HOST`); other examples are served from
`https://softagen.com/` (`SERVER_HOST`), the engine's default host.

If you get `Token has expired`, re-authenticate first:

```bash
make oauth-login
make upload-virtual-world
```

A dry-run is available: `make upload-virtual-world-dry-run`.

Publishing virtual-world on `world.softagen.com` is a one-time binding (administrators only):

```bash
make set-script-hosts        # or make set-script-hosts-dry-run to preview
```

Alternatively, use `aiwebengine-mcp` server tools for deployment and log retrieval when available.

## Repo Structure

- one top-level directory per script: `main.*` is the entrypoint, everything else under it is an asset at the same relative path
- `.aiwebengineignore` — what is not part of any script (tooling, metadata, virtual-world's notes)
- `scripts/` — tooling: OAuth login, upload, deploy, revisions, git sync, tests
- `types/` — fetched aiwebengine type definitions (gitignored; run `make fetch-types`)
- `apis/` — fetched OpenAPI spec (gitignored; run `make fetch-openapi`)
- `schemas/token.json` — OAuth tokens (gitignored, never commit)

## Virtual World Conventions

- `virtual-world/main.js` is the entrypoint, deployed as a single script.
- `virtual-world/server/` contains TypeScript server-side modules, deployed as assets under `server/`.
- `virtual-world/public/virtual-world-browser-globals.d.ts` defines browser-global types; keep in sync with runtime usage.
- JSX uses `h`/`Fragment` (configured in `tsconfig.json`).
