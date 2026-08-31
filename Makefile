.PHONY: all fetch-types fetch-openapi fetch-graphql-schema oauth-login oauth-relogin refresh-token token-status upload-virtual-world upload-virtual-world-dry-run deploy-changed deploy-changed-dry-run set-script-hosts set-script-hosts-dry-run install outdated format format-check lint typecheck check-virtual-world check-virtual-world-candidate check-head eval test test-list test-head status revisions revision-diff pin unpin promote revert label verify

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

# Register a new OAuth client instead of reusing the cached one. The engine
# records consent per (user, client), so this is also what makes the consent
# screen appear again -- use it if the saved client was removed server-side.
oauth-relogin:
	npm run oauth-login -- --forget-client

# Renew the saved token without the browser login. The tooling does this
# for itself when it finds an expired token; these are for checking.
refresh-token:
	npm run refresh-token

token-status:
	npm run token-status

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

# Check the newest revision rather than the one being served — the check to run
# after writing to a pinned script, since a revision that has never run reports
# an `initOk` that measured nothing. REV=<n|head|last-good|label> to pick one.
check-head:
	@node scripts/check-script.js --revision $(or $(REV),head) \
	  $(if $(URI),--script-uri "$(URI)")

# Evaluate a snippet inside virtual-world's sandbox (POST /engine/eval), for
# reading a table or calling one server function without deploying a test.
# Database writes roll back unless you pass ROLLBACK=false.
#   make eval SRC='JSON.parse(database.query("vworld_npcs", "{}", 3))'
#   make eval FILE=snippet.js
# SRC is single-quoted in the recipe, so double quotes inside it are safe and
# single quotes are not — use FILE for a snippet that needs them.
# The snippet sees only what virtual-world.js itself imports — no `import`.
eval:
	@node scripts/eval-script.js $(if $(FILE),--file "$(FILE)") \
	  $(if $(filter false,$(ROLLBACK)),--no-rollback) \
	  $(if $(URI),--script-uri "$(URI)") $(if $(SRC),'$(SRC)')

# Run every example's test modules on the server (POST /engine/run_tests).
# Tests the *deployed* copy, so deploy first; needs `make oauth-login`.
test:
	npm run test

# Show which scripts and test modules `make test` would run, calling nothing.
test-list:
	npm run test-list

# Run the suite against the newest revision instead of the served one.
#   make test-head            # every script with tests, at head
#   make test-head REV=last-good URI=https://example.com/virtual-world
test-head:
	@node scripts/run-tests.js --revision $(or $(REV),head) \
	  $(if $(URI),--script-uri "$(URI)")

# Revisions (scripts/revisions.js). Every write records one; a *pinned* script
# keeps serving the revision it is pinned to while writes advance head behind
# it, which is what makes it possible to deploy into production without
# production moving. All of these default to virtual-world; URI=... to retarget.
#
#   make status                       # serving vs head
#   make pin                          # freeze what is running now
#   make deploy-changed               # push freely — prod does not move
#   make check-head && make test-head # vet the newest revision
#   make promote                      # serve it
#   make unpin                        # or follow head again
status:
	@node scripts/revisions.js status $(if $(URI),--script-uri "$(URI)")

# History, newest first. ASSET=<path> for one file's history, LIMIT=<n>.
revisions:
	@node scripts/revisions.js list $(if $(URI),--script-uri "$(URI)") \
	  $(if $(ASSET),--asset "$(ASSET)") $(if $(LIMIT),--limit $(LIMIT))

# What changed. Defaults to the newest change; FROM=/TO= to pick sides.
revision-diff:
	@node scripts/revisions.js diff $(if $(URI),--script-uri "$(URI)") \
	  $(if $(FROM),--from "$(FROM)") $(if $(TO),--to "$(TO)")

# Pin. Without REV this freezes whatever is being served right now.
pin:
	@node scripts/revisions.js pin $(REV) $(if $(URI),--script-uri "$(URI)")

# Serve the newest revision, staying pinned there.
promote:
	@node scripts/revisions.js pin head $(if $(URI),--script-uri "$(URI)")

unpin:
	@node scripts/revisions.js unpin $(if $(URI),--script-uri "$(URI)")

# Restore the files a revision held, as a new revision. DRY=true to preview.
#   make revert REV=last-good
revert:
	@node scripts/revisions.js revert $(REV) \
	  $(if $(filter true,$(DRY)),--dry-run) $(if $(URI),--script-uri "$(URI)")

# Name a revision, so it survives retention and can be deployed by name.
#   make label REV=42 LABEL=before-npc-rework
label:
	@node scripts/revisions.js label $(REV) $(LABEL) \
	  $(if $(URI),--script-uri "$(URI)")

verify:
	npm run verify
