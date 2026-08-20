---
name: deploy-verify
description: Deploy virtual-world via manage.softagen.com and verify it on world.softagen.com. Use after any code change to virtual-world, when asked to deploy/upload/verify, or when debugging why a deployed change misbehaves.
---

# Deploy via manage.softagen.com, verify on world.softagen.com

The engine serves three hosts, and they are not interchangeable:

- `https://manage.softagen.com` — the management API: everything under
  `/engine/...`, plus `/mcp`, `/graphql` and OAuth. Deploys, log reads and
  test runs go here. `/engine/*` **404s on softagen.com**.
- `https://world.softagen.com` — where the virtual-world game is published;
  verify the deployed game here.
- `https://softagen.com` — the engine's default host for deployed solutions
  (the other examples).

softagen.com is nominally "production" but it is the owner's hobby/learning
server and doubles as the test environment. **Always deploy there to test —
no staging, no local server.** After any virtual-world change, deploy and
verify; do not leave changes undeployed.

## Steps

1. `make format lint typecheck` must pass first (CLAUDE.md rule).
2. Deploy: `make upload-virtual-world`
   (use `make upload-virtual-world-dry-run` first only when the asset file
   set changed — new/renamed/deleted files.)
3. If the upload fails with an expired/invalid token: run `make oauth-login`.
   It opens a browser for the OAuth flow. If renewal doesn't complete
   automatically, the user must click a button in the browser — tell them
   and wait. If running it from the agent fails because it is interactive,
   ask the user to run `! make oauth-login` themselves.
4. Verify (see below). **Known server quirk:** sometimes a deploy reports
   success but the server still serves stale content — e.g. newly added
   asset files 404 or changed files show old content. When that happens,
   run `make upload-virtual-world` once more and re-verify; the second
   deploy reliably fixes it. Only escalate if it is still wrong after the
   second deploy.
5. On success, report what was verified and what still needs a browser check.

## Verification

Bearer token for authenticated endpoints:

```bash
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('schemas/token.json','utf8')).access_token)")
```

- Server up: `curl -s https://world.softagen.com/health` → 200.
- Public pages/assets (no auth needed):
  `https://world.softagen.com/virtual-world` → 200; spot-check changed static
  assets, e.g.
  `curl -sI https://world.softagen.com/virtual-world/client-core.js` → 200
  with `content-type: application/javascript`.
- **Script errors** (most important — catches transpilation/runtime failures):

  ```bash
  curl -s -H "Authorization: Bearer $TOKEN" \
    "https://manage.softagen.com/engine/script_logs?uri=https://example.com/virtual-world"
  ```

  Look for FATAL/ERROR entries with timestamps (ms since epoch) _after_ the
  deploy; older entries are historical noise. To trigger fresh logs, hit the
  routes the change touched (curl the relevant `/virtual-world/...`
  endpoints), then re-fetch the logs.

- `/virtual-world/play` uses session-cookie auth: a CLI request gets a 302
  redirect even with a valid bearer token, and that 302 is itself the
  expected result. For UI/gameplay changes, ask the user to open
  `https://world.softagen.com/virtual-world/play` in their browser and
  confirm.

## MCP server alternative

`https://manage.softagen.com/mcp` hosts an MCP server with tools for deploying,
watching logs, and other testing. If it is connected in the current session
(MCP tools available), prefer its log-watching tools over raw curl. It is
not reachable via plain curl with the `schemas/token.json` bearer token —
it requires its own MCP OAuth session, e.g.
`claude mcp add --transport http softagen https://manage.softagen.com/mcp` and
authenticating via `/mcp`. The curl-based workflow above needs no MCP setup.

## If things break

- Broken deploy: revert the working tree to the last good state
  (`git stash`, or `git checkout <last-good-commit> -- <files>`) and deploy
  again with `make upload-virtual-world` to restore the server, then debug
  locally at leisure.
- Server completely crashed or hung (`/health` not responding, uploads
  hanging): **stop and tell the user** — they restart the server manually.
  Do not retry in a loop.
