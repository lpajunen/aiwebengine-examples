/// <reference types="node" />
// Remembers the dynamically registered OAuth client between logins.
//
// Registration is open, so `oauth_pkce_token.js` could simply register a fresh
// client on every run -- and used to. The cost is the consent screen: the
// engine records what you approved per (user, client) in `oauth_client_grants`,
// so a new client_id each time is a new grant each time, and you approve the
// same scopes again at every login.
//
// Caching the client_id makes that a one-time approval. What has to hold for
// the cached id to be usable is the redirect URI: the engine compares it byte
// for byte against what the client registered (RFC 6749 3.1.2.3), so a client
// registered for one callback port is worthless on another. That is why the
// entry stores the redirect_uri it was registered for and is ignored when the
// callback server ends up somewhere else, and why the login now asks for a
// fixed port instead of any free one.
//
// Entries are keyed by issuer, so switching between a local engine and the
// deployed one keeps a usable client for each rather than re-registering on
// every switch. A public client has no secret -- `token_endpoint_auth_method`
// is "none" -- so nothing here is a credential; the file is untracked anyway.

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const CLIENT_PATH = path.join(repoRoot, "schemas", "oauth-client.json");

/**
 * @typedef {{ client_id: string, redirect_uri: string }} CachedClient
 * @typedef {Record<string, CachedClient>} ClientCache
 */

/** @returns {string} */
function clientPath() {
  return CLIENT_PATH;
}

/** @returns {ClientCache} */
function readCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CLIENT_PATH, "utf8"));
    // A hand-edited or truncated file should cost a re-registration, not a
    // crash: the whole point of this cache is that it is disposable.
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Missing, unreadable or malformed -- treat as empty.
  }
  return {};
}

/**
 * The client registered for this issuer *and* this exact redirect URI.
 *
 * @param {string} issuer
 * @param {string} redirectUri
 * @returns {string | null}
 */
function cachedClientId(issuer, redirectUri) {
  const entry = readCache()[issuer];
  if (!entry || typeof entry.client_id !== "string") return null;
  if (entry.redirect_uri !== redirectUri) return null;
  return entry.client_id;
}

/**
 * @param {string} issuer
 * @param {string} redirectUri
 * @param {string} clientId
 * @returns {void}
 */
function rememberClientId(issuer, redirectUri, clientId) {
  const cache = readCache();
  cache[issuer] = { client_id: clientId, redirect_uri: redirectUri };
  fs.mkdirSync(path.dirname(CLIENT_PATH), { recursive: true });
  fs.writeFileSync(CLIENT_PATH, JSON.stringify(cache, null, 2), "utf8");
}

/**
 * Drop the entry for one issuer, so the next login registers again.
 *
 * @param {string} issuer
 * @returns {boolean} whether there was an entry to forget
 */
function forgetClientId(issuer) {
  const cache = readCache();
  if (!(issuer in cache)) return false;
  delete cache[issuer];
  fs.writeFileSync(CLIENT_PATH, JSON.stringify(cache, null, 2), "utf8");
  return true;
}

module.exports = {
  cachedClientId,
  clientPath,
  forgetClientId,
  rememberClientId,
};
