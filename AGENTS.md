# AI Agent Instructions

## Scope

These instructions apply when developing the Virtual World example in this repository.

Primary code areas:

- `src/virtual-world/`
- `types/virtual-world-browser-globals.d.ts`

## Development Guidelines

- Keep changes focused on the Virtual World example unless the task explicitly requires broader edits.
- Preserve existing architecture and naming conventions in `src/virtual-world/`.
- Keep browser-global type definitions in `types/virtual-world-browser-globals.d.ts` in sync with runtime usage.
- Prefer small, incremental edits that are easy to validate and review.

## Required Validation After Changes

After making code changes, run:

```bash
make format lint typecheck
```

Do not skip this step.

## Deployment to Test Server (CLI)

Primary deployment command:

```bash
make upload-virtual-world
```

If deployment fails with:

```text
Error: Token has expired. Please run 'make oauth-login' again.
```

Then run:

```bash
make oauth-login
make upload-virtual-world
```

## Deployment/Operations via MCP

As an alternative to CLI deployment, you can use the `aiwebengine-mcp` server tools.

Use MCP tools for tasks such as:

- Deploying updated code/scripts
- Fetching runtime logs for debugging

When available, MCP-based deployment and log retrieval can be used instead of shell commands.
