# Example Scripts

This folder contains working example JavaScript scripts for aiwebengine.

## Quick Start

Deploy scripts using the deployer tool:

```bash
cargo run --bin deployer --uri "https://example.com/blog" --file "src/blog.js"
```

Or upload via the built-in editor at [https://softagen.com/editor](https://softagen.com/editor)

Or use MCP to upload scripts directly to your aiwebengine instance.

## Available Scripts

- **blog.js** - Sample blog with modern styling
- **feedback.js** - Interactive feedback form with GET/POST handling
- **graphql_subscription_demo.js** - GraphQL subscription example using Server-Sent Events (SSE)
- **graphql_ws_demo.js** - GraphQL subscription example using WebSocket (graphql-transport-ws protocol)
- **script_updates_demo.js** - Script update demonstration

## Security Note

⚠️ **Important:** When working with OAuth tokens:

- **Never commit `schemas/token.json`** - This file contains OAuth access tokens and is automatically generated locally
- The `.gitignore` file is configured to exclude this file, but always verify before pushing
- Use `scripts/oauth_pkce_token.js` to generate OAuth tokens for local development only
- Tokens are session-specific and should not be shared or committed to version control

## Documentation

For complete documentation, see:

- [Example Scripts Reference](https://softagen.com/engine/docs/examples/index.md)
- [Deployer Tool Guide](https://softagen.com/engine/docs/examples/deployer.md)
- [MCP Tool Guide](https://softagen.com/engine/docs/mcp/index.md)
- [Built-in Editor Guide](https://softagen.com/engine/docs/editor/index.md)
- [aiwebengine Documentation](https://softagen.com/engine/docs/index.md)
