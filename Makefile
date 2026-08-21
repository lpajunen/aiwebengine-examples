.PHONY: all fetch-types fetch-openapi fetch-graphql-schema oauth-login upload-virtual-world upload-virtual-world-dry-run deploy-changed deploy-changed-dry-run set-script-hosts set-script-hosts-dry-run install outdated format format-check lint typecheck check-virtual-world check-virtual-world-candidate test test-list verify

# Host configuration (can be overridden via environment variables)
# SERVER_HOST is the engine's default host for deployed solutions; MANAGE_HOST
# serves the engine management API (/engine/...) and MCP (/mcp); WORLD_HOST is
# the hostname the virtual-world example is published on.
export SERVER_HOST ?= https://softagen.com
export MANAGE_HOST ?= https://manage.softagen.com
export WORLD_HOST ?= world.softagen.com

# Default target: fetch types, OpenAPI, and GraphQL schema
all:
	npm run all

fetch-types:
	npm run fetch-types

fetch-openapi:
	npm run fetch-openapi

fetch-graphql-schema:
	npm run fetch-graphql-schema

oauth-login:
	npm run oauth-login

upload-virtual-world:
	npm run upload-virtual-world

upload-virtual-world-dry-run:
	npm run upload-virtual-world-dry-run

# Deploy only changed virtual-world files (git-detected, or pass FILES="a b").
# Per-file upsert + sha256 read-back verify — see scripts/deploy-assets.js.
deploy-changed:
	node scripts/deploy-assets.js $(FILES)

deploy-changed-dry-run:
	node scripts/deploy-assets.js --dry-run $(FILES)

# Publish virtual-world on WORLD_HOST (run once after deploying it; admin only)
set-script-hosts:
	npm run set-script-hosts

set-script-hosts-dry-run:
	npm run set-script-hosts-dry-run

install:
	npm run install

outdated:
	npm run outdated

format:
	npm run format

format-check:
	npm run format-check

lint:
	npm run lint

typecheck:
	npm run typecheck

# Ask the server what virtual-world would do if deployed (POST /engine/check).
# Catches what the local toolchain cannot see: circular asset-backed imports,
# route handler names the entrypoint never defines, and an init() over budget.
# Checks the *deployed* copy; needs `make oauth-login`.
# KNOWN: this currently times out on virtual-world itself — its init() calls the
# schema migration entry points, which stall the check sandbox. See CLAUDE.md.
check-virtual-world:
	npm run check-virtual-world

# Same, but check the local entrypoint before deploying it. Only the entrypoint
# is sent — assets/ modules still come from the server, so deploy those first.
check-virtual-world-candidate:
	npm run check-virtual-world-candidate

# Run every example's test modules on the server (POST /engine/run_tests).
# Tests the *deployed* copy, so deploy first; needs `make oauth-login`.
test:
	npm run test

# Show which scripts and test modules `make test` would run, calling nothing.
test-list:
	npm run test-list

verify:
	npm run verify
