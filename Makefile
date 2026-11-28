# Repository-specific targets. Everything generic lives in scripts/tooling.mk,
# which is shared verbatim with the other repositories that use this tooling
# (`make check-tooling`); per-script defaults live in aiwebengine.config.json.
# Formatting, linting and typechecking are the engine's script kit
# (.aiwebengine/verify.mk, `make check-kit`).
#
# This repository is the tooling source, so sync-tooling and check-tooling are
# no-ops here and do the copying in the repositories that consume it.

.PHONY: all sync-inbox-kit check-inbox-kit upload-virtual-world upload-virtual-world-dry-run upload-import-example \
        set-script-hosts set-script-hosts-dry-run \
        check-virtual-world check-virtual-world-candidate

# Fetch types and the OpenAPI description, then format.
all: types fetch-openapi format

include .aiwebengine/verify.mk
include scripts/tooling.mk

# The agent inbox kit: one source in inbox-kit/, copied verbatim into each
# producer's server/ (scripts cannot import from one another). Change the
# source, then sync; verify fails on a copy that drifted.
INBOX_KIT_FILES = inbox_kit.ts inbox_kit.test.ts
INBOX_PRODUCERS = news-digest stock-monitor backlog-groomer document-writer chess

sync-inbox-kit:
	@for d in $(INBOX_PRODUCERS); do \
	  for f in $(INBOX_KIT_FILES); do cp inbox-kit/$$f $$d/server/$$f; done; \
	done; echo "✓ inbox kit copied to $(INBOX_PRODUCERS)"

check-inbox-kit:
	@status=0; for d in $(INBOX_PRODUCERS); do \
	  for f in $(INBOX_KIT_FILES); do \
	    cmp -s inbox-kit/$$f $$d/server/$$f || { echo "✗ $$d/server/$$f differs from inbox-kit/$$f (make sync-inbox-kit)"; status=1; }; \
	  done; \
	done; [ $$status -eq 0 ] && echo "✓ Inbox kit"; exit $$status

verify: check-inbox-kit

# WORLD_HOST is the hostname the virtual-world example is published on.
export WORLD_HOST ?= world.softagen.com

# Deploy the whole script: virtual-world/main.js plus every other file under
# virtual-world/ as its assets, minus what .aiwebengineignore excludes.
upload-virtual-world:
	@node scripts/upload-script.js --script-path virtual-world/main.js \
	  --script-uri virtual-world --assets-dir virtual-world

upload-virtual-world-dry-run:
	@node scripts/upload-script.js --script-path virtual-world/main.js \
	  --script-uri virtual-world --assets-dir virtual-world --dry-run

upload-import-example:
	@node scripts/upload-script.js --script-path import_example/main.ts \
	  --script-uri import-example --assets-dir import_example

# Publish virtual-world on WORLD_HOST (run once after deploying it; admin only)
set-script-hosts:
	@node scripts/set-script-hosts.js --script-uri virtual-world \
	  --hosts $(WORLD_HOST)

set-script-hosts-dry-run:
	@node scripts/set-script-hosts.js --script-uri virtual-world \
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
