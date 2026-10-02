# Repository-specific targets. Everything generic lives in scripts/tooling.mk,
# which is shared verbatim with the other repositories that use this tooling
# (`make check-tooling`); per-script defaults live in aiwebengine.config.json.
#
# This repository is the tooling source, so sync-tooling and check-tooling are
# no-ops here and do the copying in the repositories that consume it.

.PHONY: all upload-virtual-world upload-virtual-world-dry-run upload-import-example \
        set-script-hosts set-script-hosts-dry-run \
        check-virtual-world check-virtual-world-candidate

# Fetch types and the OpenAPI description, then format.
all: fetch-types fetch-openapi format

include scripts/tooling.mk

# WORLD_HOST is the hostname the virtual-world example is published on.
export WORLD_HOST ?= world.softagen.com

# Deploy the whole script: virtual-world/main.js plus every other file under
# virtual-world/ as its assets, minus what .aiwebengineignore excludes.
upload-virtual-world:
	@node scripts/upload-script.js --script-path virtual-world/main.js \
	  --script-uri https://example.com/virtual-world --assets-dir virtual-world

upload-virtual-world-dry-run:
	@node scripts/upload-script.js --script-path virtual-world/main.js \
	  --script-uri https://example.com/virtual-world --assets-dir virtual-world --dry-run

upload-import-example:
	@node scripts/upload-script.js --script-path import_example/main.ts \
	  --script-uri https://example.com/import-example --assets-dir import_example

# Publish virtual-world on WORLD_HOST (run once after deploying it; admin only)
set-script-hosts:
	@node scripts/set-script-hosts.js --script-uri https://example.com/virtual-world \
	  --hosts $(WORLD_HOST)

set-script-hosts-dry-run:
	@node scripts/set-script-hosts.js --script-uri https://example.com/virtual-world \
	  --hosts $(WORLD_HOST) --dry-run

# Ask the server what virtual-world would do if deployed (POST /engine/check_script).
# Catches what the local toolchain cannot see: circular asset-backed imports,
# route handler names the entrypoint never defines, and an init() over budget.
# Checks the *deployed* copy; needs `make oauth-login`.
check-virtual-world:
	@node scripts/check-script.js

# Same, but check the local entrypoint before deploying it. Only the entrypoint
# is sent — assets/ modules still come from the server, so deploy those first.
check-virtual-world-candidate:
	@node scripts/check-script.js --candidate
