/// <reference types="node" />
// Shared OAuth token handling for the tooling scripts.
//
// The access token the engine issues lives about an hour, and every script
// here used to do the same thing when it ran out: refuse to work and tell you
// to run `make oauth-login` again. That login is interactive -- it opens a
// browser and waits -- so a long session got interrupted repeatedly.
//
// The token file already carries a refresh token. Spending it needs the
// client_id the login registered, which is why `oauth_pkce_token.js` now
// persists client_id, token_endpoint and issuer next to the token. With those,
// `loadAccessToken()` renews the token in place and the interactive login is
// only needed when the refresh token itself is gone or rejected.

const fs = require("fs");
const path = require("path");
const { URL, URLSearchParams } = require("url");

const repoRoot = path.join(__dirname, "..", "..");
const TOKEN_PATH = path.join(repoRoot, "schemas", "token.json");

// Renew slightly early: a token that expires midway through a deploy is as
// unhelpful as one that had already expired when the script started.
const EXPIRY_MARGIN_MS = 60000;

/**
 * @typedef {{
 *   access_token: string,
 *   refresh_token?: string,
 *   token_type?: string,
 *   scope?: string,
 *   expires_in?: number,
 *   expires_at?: number | null,
 *   client_id?: string,
 *   token_endpoint?: string,
 *   issuer?: string,
 * }} StoredToken
 */

/** @returns {string} */
function tokenPath() {
  return TOKEN_PATH;
}

/** @returns {StoredToken} */
function readToken() {
  let raw;
  try {
    raw = fs.readFileSync(TOKEN_PATH, "utf8");
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT") {
      throw new Error("Token not found. Run 'make oauth-login' first.");
    }
    throw err;
  }
  return JSON.parse(raw);
}

/**
 * Write the token file, stamping `expires_at` from `expires_in`.
 *
 * @param {StoredToken} token
 * @returns {StoredToken}
 */
function writeToken(token) {
  const stamped = {
    ...token,
    expires_at: token.expires_in
      ? Date.now() + token.expires_in * 1000
      : (token.expires_at ?? null),
  };
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(stamped, null, 2), "utf8");
  return stamped;
}

/**
 * @param {StoredToken} token
 * @returns {boolean}
 */
function isExpired(token) {
  if (!token.expires_at) return false;
  return Date.now() > token.expires_at - EXPIRY_MARGIN_MS;
}

/**
 * The token endpoint, from the token file or rediscovered from the issuer.
 *
 * @param {StoredToken} token
 * @returns {Promise<string>}
 */
async function resolveTokenEndpoint(token) {
  if (token.token_endpoint) return token.token_endpoint;
  const issuer =
    token.issuer ||
    process.env.OAUTH_ISSUER ||
    process.env.MANAGE_HOST ||
    "https://manage.softagen.com";
  const metadataUrl = new URL(
    "/.well-known/oauth-authorization-server",
    issuer,
  ).toString();
  const res = await fetch(metadataUrl);
  if (!res.ok) {
    throw new Error(
      `OAuth discovery failed (HTTP ${res.status}) at ${metadataUrl}`,
    );
  }
  const metadata = await res.json();
  if (!metadata.token_endpoint) {
    throw new Error(`No token_endpoint in metadata at ${metadataUrl}`);
  }
  return metadata.token_endpoint;
}

/**
 * Spend the refresh token for a new access token and save it.
 *
 * The response need not carry a new refresh token; when it does not, the
 * existing one stays valid and is kept. The fields that make refreshing
 * possible at all -- client_id, token_endpoint, issuer -- are likewise carried
 * forward, since the response never contains them.
 *
 * @param {StoredToken} token
 * @returns {Promise<StoredToken>}
 */
async function refreshAccessToken(token) {
  if (!token.refresh_token) {
    throw new Error(
      "Token has expired and carries no refresh token. Run 'make oauth-login' again.",
    );
  }
  if (!token.client_id) {
    throw new Error(
      "Token has expired and predates refresh support (no client_id saved).\n" +
        "Run 'make oauth-login' once; later expiries will refresh on their own.",
    );
  }

  const endpoint = await resolveTokenEndpoint(token);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: token.client_id,
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    let detail = body.slice(0, 200);
    try {
      const parsed = JSON.parse(body);
      detail =
        parsed.message || parsed.error_description || parsed.error || detail;
    } catch {
      // Not JSON; the raw body is the best detail available.
    }
    throw new Error(
      `Could not refresh the token (HTTP ${res.status}: ${detail}).\n` +
        "Run 'make oauth-login' again.",
    );
  }

  const fresh = JSON.parse(body);
  return writeToken({
    ...fresh,
    refresh_token: fresh.refresh_token || token.refresh_token,
    client_id: token.client_id,
    token_endpoint: endpoint,
    issuer: token.issuer,
  });
}

/**
 * The access token to send, renewed first if it is spent.
 *
 * `OAUTH_TOKEN` in the environment wins and is used as-is, which keeps CI and
 * one-off overrides working without a token file.
 *
 * @param {{ quiet?: boolean }} [options]
 * @returns {Promise<string>}
 */
async function loadAccessToken(options) {
  const quiet = !!(options && options.quiet);
  if (process.env.OAUTH_TOKEN) return process.env.OAUTH_TOKEN;

  const token = readToken();
  if (!isExpired(token)) return token.access_token;

  const refreshed = await refreshAccessToken(token);
  if (!quiet) console.log("Refreshed the access token.");
  return refreshed.access_token;
}

module.exports = {
  EXPIRY_MARGIN_MS,
  isExpired,
  loadAccessToken,
  readToken,
  refreshAccessToken,
  tokenPath,
  writeToken,
};
