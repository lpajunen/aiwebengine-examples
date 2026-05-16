.PHONY: all fetch-types fetch-openapi fetch-graphql-schema oauth-login upload-virtual-world upload-virtual-world-dry-run install outdated format format-check lint typecheck verify

# Server host configuration (can be overridden via environment variable)
export SERVER_HOST ?= https://softagen.com

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

verify:
	npm run verify
