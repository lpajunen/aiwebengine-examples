.PHONY: fetch-types

fetch-types:
	@mkdir -p types
	curl https://softagen.com/api/types/v0.1.0/aiwebengine.d.ts -o types/aiwebengine.d.ts
	@echo "✓ Type definitions updated"
