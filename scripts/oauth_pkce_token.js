/// <reference types="node" />
require("dotenv").config();
// OAuth2 Authorization Code with PKCE helper for softagen.com
// - Discovers endpoints via /.well-known/oauth-authorization-server
// - Optionally performs dynamic client registration if CLIENT_ID not provided
// - Launches a local HTTP callback server and opens default browser for login
// - Exchanges authorization code for access token and saves to schemas/token.json
// Usage:
//   node scripts/oauth_pkce_token.js
// Env:
//   OAUTH_ISSUER (default: https://softagen.com)
//   OAUTH_CLIENT_ID (optional; if absent, tries dynamic registration)
//   OAUTH_SCOPE (default: "openid")
//   OAUTH_REDIRECT_PORT (default: 53134)
//   OAUTH_REDIRECT_HOST (default: 127.0.0.1)

const http = require("http");
const { URL, URLSearchParams } = require("url");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const issuer = process.env.OAUTH_ISSUER || "https://softagen.com";
const metadataUrl = new URL(
  "/.well-known/oauth-authorization-server",
  issuer,
).toString();
const redirectHost = process.env.OAUTH_REDIRECT_HOST || "127.0.0.1";
let redirectPort = parseInt(process.env.OAUTH_REDIRECT_PORT || "0", 10); // Use 0 for dynamic port allocation
let redirectUri = `http://${redirectHost}:${redirectPort}/callback`;
const scope = process.env.OAUTH_SCOPE || "openid";

/**
 * @param {Buffer | string} input
 * @returns {string}
 */
function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest(),
  );
  return { verifier, challenge, method: "S256" };
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`,
    );
  }
  return res.json();
}

/**
 * @param {string} registerUrl
 * @returns {Promise<any>}
 */
async function dynamicRegisterClient(registerUrl) {
  const body = {
    redirect_uris: [redirectUri],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
    scope,
  };
  const res = await fetch(registerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(
      `Client registration failed: ${res.status} ${res.statusText}: ${t}`,
    );
  }
  return res.json();
}

async function main() {
  console.log(`Discovering OAuth metadata from ${metadataUrl}`);
  const meta = await fetchJson(metadataUrl);
  const authorizationUrl = new URL(
    meta.authorization_endpoint || "/oauth2/authorize",
    issuer,
  ).toString();
  const tokenUrl = new URL(
    meta.token_endpoint || "/oauth2/token",
    issuer,
  ).toString();
  const registerUrl = meta.registration_endpoint
    ? new URL(meta.registration_endpoint, issuer).toString()
    : null;

  let clientId = process.env.OAUTH_CLIENT_ID;
  if (!clientId) {
    if (!registerUrl) {
      throw new Error(
        "OAUTH_CLIENT_ID not set and registration_endpoint not available. Provide a client ID.",
      );
    }
    console.log("Registering a dynamic client...");
    const registration = await dynamicRegisterClient(registerUrl);
    clientId = registration.client_id;
    if (!clientId) {
      throw new Error(
        `Dynamic registration succeeded but no client_id returned: ${JSON.stringify(registration)}`,
      );
    }
    console.log(`Registered client_id: ${clientId}`);
  }
  if (!clientId) {
    throw new Error(
      "client_id is undefined; cannot proceed with authorization.",
    );
  }

  const state = base64url(crypto.randomBytes(16));
  const pkce = createPkce();

  const srv = http.createServer(async (req, res) => {
    try {
      if (req.url && req.url.startsWith("/callback")) {
        const u = new URL(req.url, `http://${req.headers.host}`);
        const code = u.searchParams.get("code");
        const returnedState = u.searchParams.get("state");
        if (!code) throw new Error("Missing authorization code");
        if (returnedState !== state) throw new Error("State mismatch");

        const tokenBody = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: pkce.verifier,
          client_id: clientId,
        });

        const tokenRes = await fetch(tokenUrl, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: tokenBody.toString(),
        });
        if (!tokenRes.ok) {
          const t = await tokenRes.text();
          throw new Error(
            `Token exchange failed: ${tokenRes.status} ${tokenRes.statusText}: ${t}`,
          );
        }
        const token = await tokenRes.json();

        // Persist token
        const outDir = path.join(__dirname, "..", "schemas");
        await fs.promises.mkdir(outDir, { recursive: true });
        const tokenPath = path.join(outDir, "token.json");
        const expiresAt = token.expires_in
          ? Date.now() + token.expires_in * 1000
          : null;
        const payload = { ...token, expires_at: expiresAt };
        await fs.promises.writeFile(
          tokenPath,
          JSON.stringify(payload, null, 2),
          "utf8",
        );

        res.statusCode = 200;
        res.setHeader("content-type", "text/html");
        res.end("<h1>Login complete</h1><p>You may close this window.</p>");

        console.log(
          `Saved token to ${path.relative(process.cwd(), tokenPath)}`,
        );
        console.log("Quick use:");
        console.log(`  export OAUTH_TOKEN="${token.access_token}"`);
        console.log("Then run:");
        console.log("  npm run fetch-graphql-schema");

        srv.close();
      } else {
        res.statusCode = 404;
        res.end("Not Found");
      }
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain");
      const errMsg = err instanceof Error ? err.message : String(err);
      res.end(`Error: ${errMsg}`);
      console.error(err);
      srv.close();
    }
  });

  srv.listen(redirectPort, redirectHost, () => {
    const addr = srv.address();
    const actualPort =
      addr && typeof addr !== "string" ? addr.port : redirectPort;
    redirectPort = actualPort;
    redirectUri = `http://${redirectHost}:${actualPort}/callback`;

    // Build auth URL with actual port
    const authParams = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge: pkce.challenge,
      code_challenge_method: pkce.method,
    });
    const fullAuthUrl = `${authorizationUrl}?${authParams.toString()}`;

    // Validate URL construction
    const parsedUrl = new URL(fullAuthUrl);
    const hasClientId = parsedUrl.searchParams.has("client_id");
    if (!hasClientId) {
      console.error(
        "ERROR: client_id not found in constructed URL. URL construction failed.",
      );
      console.error(`Built URL: ${fullAuthUrl}`);
      srv.close();
      process.exit(1);
    }

    console.log(`\nCallback server on ${redirectUri}`);
    console.log(
      `\nAuthorization URL (copy-paste if browser does not open):\n${fullAuthUrl}\n`,
    );

    // Try to open in browser, but provide fallback
    let browserOpened = false;
    const isMac = process.platform === "darwin";
    const opener = isMac
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

    const child = require("child_process").spawn(opener, [fullAuthUrl], {
      stdio: "ignore",
      shell: false, // Don't use shell to avoid URL truncation
    });

    const timeoutHandle = setTimeout(() => {
      if (!browserOpened) {
        console.log(
          "Browser did not open. Copy and paste the URL above into your browser.",
        );
      }
    }, 2000);

    child.on("error", (e) => {
      clearTimeout(timeoutHandle);
      console.error(`Failed to open browser: ${e.message}`);
      console.log("Copy and paste the URL above into your browser manually.");
    });

    child.on("close", (code) => {
      clearTimeout(timeoutHandle);
      browserOpened = true;
    });
  });
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
