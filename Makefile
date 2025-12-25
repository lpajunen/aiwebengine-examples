.PHONY: fetch-types

fetch-types:
	@mkdir -p types
	curl https://softagen.com/api/types/v0.1.0/aiwebengine.d.ts -o types/aiwebengine.d.ts
	curl https://softagen.com/api/types/v0.1.0/aiwebengine-priv.d.ts -o types/aiwebengine-priv.d.ts
	@echo "✓ Type definitions updated"
