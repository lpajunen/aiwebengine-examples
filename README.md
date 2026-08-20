# Example Scripts

This folder contains working example JavaScript scripts for aiwebengine.

## Quick Start

Deploy scripts using the deployer tool:

```bash
cargo run --bin deployer --uri "https://example.com/blog" --file "src/blog.js"
```

Or upload via the built-in editor at [https://manage.softagen.com/editor](https://manage.softagen.com/editor)

Or use MCP to upload scripts directly to your aiwebengine instance.

## Hosts

The engine serves three hosts:

- `https://manage.softagen.com` — management surface: the engine HTTP API (`/engine/...`),
  the MCP endpoint (`/mcp`), the authenticated GraphQL endpoint and OAuth. All deploys,
  type/OpenAPI fetches and test runs go here (`MANAGE_HOST`).
- `https://softagen.com` — the engine's default host for deployed solutions, where these
  examples' routes are served (`SERVER_HOST`).
- `https://world.softagen.com` — where the `virtual-world` example is published
  (`WORLD_HOST`, bound with `make set-script-hosts`).

## Available Scripts

- **blog.js** - Sample blog with modern styling
- **feedback.js** - Interactive feedback form with GET/POST handling
- **graphql_subscription_demo.js** - GraphQL subscription example using Server-Sent Events (SSE)
- **graphql_ws_demo.js** - GraphQL subscription example using WebSocket (graphql-transport-ws protocol)
- **script_updates_demo.js** - Script update demonstration
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
