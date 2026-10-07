# Example Scripts

Working example scripts for aiwebengine. The catalogue, with what each one
shows, is in `aiwebengine-dev`'s `docs/examples/index.md`.

## Layout

Every top-level directory holding `main.*` is one script; everything else under
it is one of that script's files, at the same relative path. That is the layout
the engine's git sync reads and writes, so the repository can be pulled into any
engine:

```text
pull_from_git(repo: "lpajunen/aiwebengine-examples", prefix: "demo")
```

## Deploying from a checkout

```bash
make oauth-login                                       # once
node scripts/upload-script.js --script-path blog/main.js --script-uri blog
make deploy-changed                                    # changed files of the default script
```

Or paste a script into the editor at `/editor`, or write it over MCP.

## Hosts

- `https://manage.softagen.com` — the management surface: `/engine/...`, `/mcp`
  and OAuth (`MANAGE_HOST`). Deploys, type and OpenAPI fetches and test runs go
  here.
- `https://softagen.com` — the default host for deployed solutions, where these
  examples' routes are served (`SERVER_HOST`).
- `https://world.softagen.com` — where `virtual-world` is published
  (`WORLD_HOST`, bound with `make set-script-hosts`).

## Tokens

`schemas/token.json` holds an OAuth access token, written by
`make oauth-login`. It is gitignored; never commit it.
