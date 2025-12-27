.PHONY: all fetch-types fetch-openapi

# Default target: fetch both types and OpenAPI
all: fetch-types fetch-openapi

fetch-types:
	@mkdir -p types
	curl https://softagen.com/api/types/v0.1.0/aiwebengine.d.ts -o types/aiwebengine.d.ts
	curl https://softagen.com/api/types/v0.1.0/aiwebengine-priv.d.ts -o types/aiwebengine-priv.d.ts
	@echo "✓ Type definitions updated"

fetch-openapi:
	@mkdir -p apis
	curl https://softagen.com/engine/openapi.json -o apis/openapi.json
	@echo "✓ OpenAPI description downloaded to apis/openapi.json"
