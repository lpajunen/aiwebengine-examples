# Shared aiwebengine tooling targets.
#
# This file and everything under scripts/ is kept identical across the
# repositories that use it; `make check-tooling` fails when it is not. Anything
# repository-specific therefore lives elsewhere: per-script defaults in
# aiwebengine.config.json, upload targets and host bindings in the Makefile
# that includes this file.
#
# Include it from a repository Makefile:
#
#   include scripts/tooling.mk
#
# Engine operations call node directly rather than going through package.json,
# so this file works in any repository that has scripts/ and node, regardless
# of what its npm scripts are named.

.PHONY: sync-tooling check-tooling fetch-types fetch-openapi fetch-graphql-schema \
        oauth-login oauth-relogin refresh-token token-status \
        set-git-credentials git-credentials forget-git-credentials git-pull git-push \
        deploy-changed deploy-changed-dry-run check-head eval test test-list test-head \
        status revisions revision-diff pin unpin promote revert label \
        install outdated format format-check lint typecheck verify

# SERVER_HOST is the engine's default host for deployed solutions; MANAGE_HOST
# serves the engine management API (/engine/...) and MCP (/mcp).
export SERVER_HOST ?= https://softagen.com
export MANAGE_HOST ?= https://manage.softagen.com

# Where the shared tooling comes from, and what counts as shared.
TOOLING_SOURCE ?= ../aiwebengine-examples
TOOLING_FILES ?= scripts tsconfig.json jsconfig.json

# Copy the tooling from the source repository over this one's. Directories are
# mirrored rather than merged, so a file deleted upstream disappears here too.
sync-tooling:
	@if [ ! -d "$(TOOLING_SOURCE)" ]; then \
	  echo "no tooling source at $(TOOLING_SOURCE)"; exit 1; \
	elif [ "$$(cd "$(TOOLING_SOURCE)" && pwd)" = "$$(pwd)" ]; then \
	  echo "$(TOOLING_SOURCE) is this repository — nothing to sync"; \
	else \
	  for f in $(TOOLING_FILES); do \
	    if [ -d "$(TOOLING_SOURCE)/$$f" ]; then \
	      rsync -a --delete "$(TOOLING_SOURCE)/$$f/" "$$f/"; \
	    else \
	      cp "$(TOOLING_SOURCE)/$$f" "$$f"; \
	    fi; \
	    echo "  synced $$f"; \
	  done; \
	  echo "✓ tooling synced from $(TOOLING_SOURCE)"; \
	fi

# Report any drift against the source repository, and fail if there is some.
# Run it in CI, or before trusting that a fix made in one repository is here.
check-tooling:
	@if [ ! -d "$(TOOLING_SOURCE)" ]; then \
	  echo "no tooling source at $(TOOLING_SOURCE) — skipping"; \
	elif [ "$$(cd "$(TOOLING_SOURCE)" && pwd)" = "$$(pwd)" ]; then \
	  echo "✓ this repository is the tooling source"; \
	else \
	  drift=0; \
	  for f in $(TOOLING_FILES); do \
	    if ! diff -r -q "$(TOOLING_SOURCE)/$$f" "$$f" >/dev/null 2>&1; then \
	      echo "drift in $$f:"; \
	      diff -r -u "$(TOOLING_SOURCE)/$$f" "$$f" | head -40; \
	      drift=1; \
	    fi; \
	  done; \
	  if [ $$drift -eq 0 ]; then \
	    echo "✓ tooling matches $(TOOLING_SOURCE)"; \
	  else \
	    echo ""; echo "run 'make sync-tooling' to take the source version"; exit 1; \
	  fi; \
	fi

# --- Remote metadata -------------------------------------------------------

fetch-types:
	@mkdir -p types && curl -sS $(MANAGE_HOST)/engine/types/v0.1.0/aiwebengine.d.ts \
	  -o types/aiwebengine.d.ts && echo '✓ Type definitions updated'

fetch-openapi:
	@mkdir -p apis && curl -sS $(MANAGE_HOST)/engine/openapi.json \
	  -o apis/openapi.json && echo '✓ OpenAPI description downloaded to apis/openapi.json'

fetch-graphql-schema:
	@mkdir -p schemas && node scripts/fetch-graphql-schema.js \
	  && echo '✓ GraphQL schema downloaded to schemas/schema.json'

# --- Authentication --------------------------------------------------------

oauth-login:
	@node scripts/oauth_pkce_token.js

# Register a new OAuth client instead of reusing the cached one. The engine
# records consent per (user, client), so this is also what makes the consent
# screen appear again -- use it if the saved client was removed server-side.
oauth-relogin:
	@node scripts/oauth_pkce_token.js --forget-client

# Renew the saved token without the browser login. The tooling does this for
# itself when it finds an expired token; these are for checking.
refresh-token:
	@node scripts/refresh-token.js

token-status:
	@node scripts/refresh-token.js --status

# --- Git credentials and sync ----------------------------------------------

# Store a personal access token for a git host. The token is prompted for --
# never echoed, never in shell history -- and the engine checks it against the
# host before storing it. HOST= for a host other than github.com.
set-git-credentials:
	@node scripts/git-credentials.js set $(if $(HOST),--host "$(HOST)") \
	  $(if $(filter true,$(STDIN)),--token-stdin) \
	  $(if $(TOKEN_ENV),--token-env "$(TOKEN_ENV)")

git-credentials:
	@node scripts/git-credentials.js list

forget-git-credentials:
	@node scripts/git-credentials.js delete $(if $(HOST),--host "$(HOST)")

# Pull a GitHub repository into the engine as scripts. A directory holding
# main.ts/.js/.tsx/.jsx is a script; everything beside it is its assets.
#   make git-pull REPO=owner/repo [BRANCH=] [PREFIX=] [FORCE=true] [DRY=true]
git-pull:
	@node scripts/git-sync.js pull --repo "$(REPO)" \
	  $(if $(BRANCH),--branch "$(BRANCH)") $(if $(PREFIX),--prefix "$(PREFIX)") \
	  $(if $(filter true,$(FORCE)),--force) $(if $(filter true,$(DRY)),--dry-run)

# Publish a script's files to GitHub as one commit. Needs a stored credential,
# and refuses when both sides have moved since the last sync.
#   make git-push REPO=owner/repo [SCRIPT=] [BRANCH=] [MSG=] [FORCE=true] [DRY=true]
git-push:
	@node scripts/git-sync.js push $(if $(SCRIPT),--script "$(SCRIPT)") \
	  $(if $(REPO),--repo "$(REPO)") $(if $(BRANCH),--branch "$(BRANCH)") \
	  $(if $(MSG),--message "$(MSG)") \
	  $(if $(filter true,$(FORCE)),--force) $(if $(filter true,$(DRY)),--dry-run)

# --- Deploying and inspecting ----------------------------------------------

# Deploy only changed files (git-detected, or pass FILES="a b"), per-file
# upsert with a sha256 read-back verify. Defaults come from
# aiwebengine.config.json; URI=/DIR= to retarget.
deploy-changed:
	@node scripts/deploy-assets.js $(if $(URI),--script-uri "$(URI)") $(FILES)

deploy-changed-dry-run:
	@node scripts/deploy-assets.js --dry-run $(if $(URI),--script-uri "$(URI)") $(FILES)

# Ask the server what a script would do if deployed, against a revision that is
# not being served -- the only trustworthy verdict on a pinned script's head.
check-head:
	@node scripts/check-script.js --revision $(or $(REV),head) \
	  $(if $(URI),--script-uri "$(URI)")

# Evaluate a snippet inside a deployed script's sandbox. Database writes roll
# back unless ROLLBACK=false. SRC is single-quoted in the recipe, so double
# quotes inside it are safe and single quotes are not -- use FILE for those.
eval:
	@node scripts/eval-script.js $(if $(FILE),--file "$(FILE)") \
	  $(if $(filter false,$(ROLLBACK)),--no-rollback) \
	  $(if $(URI),--script-uri "$(URI)") $(if $(SRC),'$(SRC)')

# Run every script's test modules on the server. Tests the *deployed* copy, so
# deploy first.
test:
	@node scripts/run-tests.js

test-list:
	@node scripts/run-tests.js --list

test-head:
	@node scripts/run-tests.js --revision $(or $(REV),head) \
	  $(if $(URI),--script-uri "$(URI)")

# --- Revisions -------------------------------------------------------------
#
#   make status                       # serving vs head
#   make pin                          # freeze what is running now
#   make deploy-changed               # push freely -- prod does not move
#   make check-head && make test-head # vet the newest revision
#   make promote                      # serve it
#   make unpin                        # or follow head again

status:
	@node scripts/revisions.js status $(if $(URI),--script-uri "$(URI)")

revisions:
	@node scripts/revisions.js list $(if $(URI),--script-uri "$(URI)") \
	  $(if $(ASSET),--asset "$(ASSET)") $(if $(LIMIT),--limit $(LIMIT))

revision-diff:
	@node scripts/revisions.js diff $(if $(URI),--script-uri "$(URI)") \
	  $(if $(FROM),--from "$(FROM)") $(if $(TO),--to "$(TO)")

pin:
	@node scripts/revisions.js pin $(REV) $(if $(URI),--script-uri "$(URI)")

promote:
	@node scripts/revisions.js pin head $(if $(URI),--script-uri "$(URI)")

unpin:
	@node scripts/revisions.js unpin $(if $(URI),--script-uri "$(URI)")

revert:
	@node scripts/revisions.js revert $(REV) \
	  $(if $(filter true,$(DRY)),--dry-run) $(if $(URI),--script-uri "$(URI)")

label:
	@node scripts/revisions.js label $(REV) $(LABEL) \
	  $(if $(URI),--script-uri "$(URI)")

# --- Local checks ----------------------------------------------------------

install:
	npm install

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
