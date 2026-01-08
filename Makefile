.PHONY: all fetch-types fetch-openapi fetch-graphql-schema oauth-login install outdated format

# Default target: fetch types, OpenAPI, and GraphQL schema
all: fetch-types fetch-openapi fetch-graphql-schema format

fetch-types:
	@mkdir -p types
	curl https://softagen.com/api/types/v0.1.0/aiwebengine.d.ts -o types/aiwebengine.d.ts
	curl https://softagen.com/api/types/v0.1.0/aiwebengine-priv.d.ts -o types/aiwebengine-priv.d.ts
	@echo "✓ Type definitions updated"

fetch-openapi:
	@mkdir -p apis
	curl https://softagen.com/engine/openapi.json -o apis/openapi.json
	@echo "✓ OpenAPI description downloaded to apis/openapi.json"

fetch-graphql-schema:
	@mkdir -p schemas
	node scripts/fetch-graphql-schema.js
	@echo "✓ GraphQL schema downloaded to schemas/schema.json"

oauth-login:
	npm run oauth-login

install:
	npm install
	@echo "✓ Dependencies installed"

outdated:
	-npm outdated || true
	@echo "✓ Checked for outdated packages"

format:
	./node_modules/.bin/prettier --write "**/*.js" "**/*.ts" "**/*.json" "**/*.md"
	@echo "✓ JavaScript files formatted"
