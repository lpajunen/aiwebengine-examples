# Example Scripts

This folder contains working example JavaScript scripts for aiwebengine.

## Quick Start

Every script is a top-level directory holding `main.*`; everything else under it is
deployed as one of that script's assets, at the same relative path. That is the layout
the engine's git API reads and writes, so a repository laid out this way can be pulled
into any engine.

Deploy one with the upload script:

```bash
node scripts/upload-script.js --script-path blog/main.js --script-uri "blog"
```

Or upload via the built-in editor at [https://manage.softagen.com/editor](https://manage.softagen.com/editor)

Or use MCP to upload scripts directly to your aiwebengine instance.

## Hosts

The engine serves three hosts:

- `https://manage.softagen.com` — management surface: the engine HTTP API (`/engine/...`),
  the MCP endpoint (`/mcp`) and OAuth. All deploys, type/OpenAPI fetches and test
  runs go here (`MANAGE_HOST`).
- `https://softagen.com` — the engine's default host for deployed solutions, where these
  examples' routes are served (`SERVER_HOST`).
- `https://world.softagen.com` — where the `virtual-world` example is published
  (`WORLD_HOST`, bound with `make set-script-hosts`).

## Available Scripts

- **blog.js** - Sample blog with modern styling
- **feedback.js** - Interactive feedback form with GET/POST handling
- **chat_app.js** - Real-time chat over a JSON API plus a per-channel SSE stream
- **file-upload.js** - Handling multipart file uploads (base64 data with metadata)
- **github_mcp_issues.js** - Using McpClient to fetch GitHub issues via GitHub's MCP server
- **transaction-demo.js** - Atomic database operations with transaction support
- **transaction-tests.js** - Demonstrates and tests transaction commit/rollback/savepoint behavior

## Security Note

⚠️ **Important:** When working with OAuth tokens:

- **Never commit `schemas/token.json`** - This file contains OAuth access tokens and is automatically generated locally
- The `.gitignore` file is configured to exclude this file, but always verify before pushing
- Use `scripts/oauth_pkce_token.js` to generate OAuth tokens for local development only
- Tokens are session-specific and should not be shared or committed to version control

## Documentation

For complete documentation, see:

- [Example Scripts Reference](https://manage.softagen.com/engine/docs/examples/index.md)
- [Deployer Tool Guide](https://manage.softagen.com/engine/docs/examples/deployer.md)
- [MCP Tool Guide](https://manage.softagen.com/engine/docs/mcp/index.md)
- [Built-in Editor Guide](https://manage.softagen.com/engine/docs/editor/index.md)
- [aiwebengine Documentation](https://manage.softagen.com/engine/docs/index.md)
