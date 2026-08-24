/// <reference types="node" />
require("dotenv").config();
// Renew the saved access token without the interactive browser login.
//
// The tooling scripts already do this for themselves when they find an expired
// token, so this is mainly for checking the setup and for reviving a session
// by hand. It reports what it did rather than staying silent, and never prints
// the token itself.
//
// Usage:
//   node scripts/refresh-token.js          # renew if expired
//   node scripts/refresh-token.js --force  # renew even if still valid
//   node scripts/refresh-token.js --status # report only, change nothing

const {
  isExpired,
  readToken,
  refreshAccessToken,
  tokenPath,
} = require("./lib/token.js");

/** @param {number} ms */
function humanize(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** @param {import("./lib/token.js").StoredToken} token */
function describe(token) {
  if (!token.expires_at) return "no expiry recorded";
  const remaining = token.expires_at - Date.now();
  return remaining > 0
    ? `valid for another ${humanize(remaining)}`
    : `expired ${humanize(-remaining)} ago`;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const statusOnly = args.includes("--status");

  const token = readToken();
  console.log(`Token: ${tokenPath()}`);
  console.log(`Status: ${describe(token)}`);
  if (!token.refresh_token) console.log("Refresh token: absent");
  if (!token.client_id) {
    console.log(
      "client_id: absent — this token predates refresh support, so it cannot\n" +
        "be renewed. Run 'make oauth-login' once and later expiries will renew.",
    );
  }

  if (statusOnly) return;
  if (!force && !isExpired(token)) {
    console.log("Still valid; nothing to do. Use --force to renew anyway.");
    return;
  }

  const refreshed = await refreshAccessToken(token);
  console.log(`Renewed: ${describe(refreshed)}`);
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
