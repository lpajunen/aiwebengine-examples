.PHONY: all fetch-types fetch-openapi fetch-graphql-schema oauth-login install outdated format lint

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

install:
	npm run install

outdated:
	npm run outdated

format:
	npm run format

lint:
	npm run lint
