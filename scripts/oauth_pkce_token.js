/// <reference types="node" />
require("dotenv").config();
// OAuth2 Authorization Code with PKCE helper for the AI Web Engine management API
// - Discovers endpoints via <issuer>/.well-known/oauth-authorization-server
//   (the discovered authorization/token endpoints may live on another host —
//   the metadata document decides, not this script)
// - Optionally performs dynamic client registration if CLIENT_ID not provided
// - Launches a local HTTP callback server and opens default browser for login
// - Exchanges authorization code for access token and saves to schemas/token.json
// Usage:
//   node scripts/oauth_pkce_token.js
// Env:
//   OAUTH_ISSUER (default: MANAGE_HOST, i.e. https://manage.softagen.com)
//   OAUTH_CLIENT_ID (optional; if absent, tries dynamic registration)
//   OAUTH_SCOPE (default: "openid")
//   OAUTH_REDIRECT_PORT (default: 53134; 0 means any free port)
//   OAUTH_REDIRECT_HOST (default: 127.0.0.1)
// Flags:
//   --forget-client  re-register instead of reusing the cached client_id,
//                    which also means approving the consent screen again

const http = require("http");
const { URL, URLSearchParams } = require("url");
const crypto = require("crypto");
const path = require("path");
const tokenStore = require("./lib/token.js");
const clientStore = require("./lib/client.js");

const issuer =
  process.env.OAUTH_ISSUER ||
  process.env.MANAGE_HOST ||
  "https://manage.softagen.com";
const metadataUrl = new URL(
  "/.well-known/oauth-authorization-server",
  issuer,
).toString();
const redirectHost = process.env.OAUTH_REDIRECT_HOST || "127.0.0.1";
// A fixed port by default, because the registered client is only reusable for
// the exact redirect URI it was registered with. Asking the OS for any free
// port would mean a new URI, so a new client, so the consent screen again on
// every login. Set OAUTH_REDIRECT_PORT=0 to opt back into an ephemeral port.
const DEFAULT_REDIRECT_PORT = 53134;
let redirectPort = Number.parseInt(
  process.env.OAUTH_REDIRECT_PORT || String(DEFAULT_REDIRECT_PORT),
  10,
);
if (
  !Number.isInteger(redirectPort) ||
  redirectPort < 0 ||
  redirectPort > 65535
) {
  throw new Error(
    `OAUTH_REDIRECT_PORT must be a port number, got "${process.env.OAUTH_REDIRECT_PORT}"`,
  );
}
let redirectUri = `http://${redirectHost}:${redirectPort}/callback`;
const scope = process.env.OAUTH_SCOPE || "openid";
const forgetClient = process.argv.includes("--forget-client");

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

/**
 * Success page shown in the browser after the callback succeeds. It counts down
 * and then tries to close its own tab; browsers that refuse to close a tab the
 * user opened themselves fall back to a "you may close this window" message.
 * @param {number} closeAfterSeconds
 * @returns {string}
 */
function successPage(closeAfterSeconds) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Login complete</title>
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        margin: 4rem auto;
        max-width: 32rem;
        text-align: center;
        color: #1f2933;
      }
      p { color: #52606d; }
      @media (prefers-color-scheme: dark) {
        body { background: #12161c; color: #e4e7eb; }
        p { color: #9aa5b1; }
      }
    </style>
  </head>
  <body>
    <h1>Login complete</h1>
    <p id="status">Closing this tab in ${closeAfterSeconds} seconds…</p>
    <script>
      (function () {
        var remaining = ${closeAfterSeconds};
        var status = document.getElementById("status");
        var timer = setInterval(function () {
          remaining -= 1;
          if (remaining > 0) {
            status.textContent =
              "Closing this tab in " + remaining + " second" +
              (remaining === 1 ? "" : "s") + "…";
            return;
          }
          clearInterval(timer);
          status.textContent = "Closing…";
          try {
            window.close();
          } catch (e) {}
          setTimeout(function () {
            status.textContent = "You may close this window.";
          }, 500);
        }, 1000);
      })();
    </script>
  </body>
</html>`;
}

async function main() {
  console.log(`Discovering OAuth metadata from ${metadataUrl}`);
  const meta = await fetchJson(metadataUrl);
  const authorizationUrl = new URL(
    meta.authorization_endpoint || "/auth/oauth2/authorize",
    issuer,
  ).toString();
  const tokenUrl = new URL(
    meta.token_endpoint || "/auth/oauth2/token",
    issuer,
  ).toString();
  const registerUrl = meta.registration_endpoint
    ? new URL(meta.registration_endpoint, issuer).toString()
    : null;

  // Registration is deferred until the callback server has a port — see the
  // bind below. The engine compares redirect_uri byte for byte (RFC 6749
  // §3.1.2.3), so the URI registered here has to be the exact string the
  // authorization request will carry.
  let clientId = process.env.OAUTH_CLIENT_ID;

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

        // Persist the token, plus what renewing it later needs: the response
        // carries a refresh token but not the client_id it must be spent
        // with, nor where to spend it. Without these, every expiry meant
        // another interactive login. See scripts/lib/token.js.
        const savedPath = tokenStore.tokenPath();
        tokenStore.writeToken({
          ...token,
          client_id: clientId,
          token_endpoint: tokenUrl,
          issuer: issuer,
        });

        res.statusCode = 200;
        res.setHeader("content-type", "text/html");
        res.end(successPage(5));

        // Deliberately not echoing the access token: it used to be printed as
        // a ready-to-paste `export`, which put a live credential into terminal
        // scrollback and any transcript of the session. The tooling reads the
        // file, so nothing needed it on screen.
        console.log(
          `Saved token to ${path.relative(process.cwd(), savedPath)}`,
        );
        console.log(
          "It renews itself from here on; log in again only if that fails.",
        );

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

  // Bind before registering: the real port is known only once the socket is
  // listening, and the client has to be registered for the URI the
  // authorization request will actually carry. Registering first published
  // `http://127.0.0.1:0/callback` while the request named the port the OS had
  // handed out, and the engine rejected the mismatch with "redirect_uri does
  // not match a URI this client registered".
  /**
   * @param {number} port
   * @returns {Promise<void>}
   */
  function bind(port) {
    return new Promise((resolve, reject) => {
      srv.once("error", reject);
      srv.listen(port, redirectHost, () => {
        srv.removeListener("error", reject);
        resolve(undefined);
      });
    });
  }

  let portFallback = false;
  try {
    await bind(redirectPort);
  } catch (err) {
    // Something else holds the preferred port -- often a login from an earlier
    // run that never exited. Any free port still completes a login; it just
    // registers a client that the cache cannot reuse next time.
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== "EADDRINUSE") {
      throw err;
    }
    console.log(
      `Port ${redirectPort} is in use; falling back to any free port. ` +
        "This login registers a client that will not be reused, so the consent " +
        "screen appears again.",
    );
    portFallback = true;
    await bind(0);
  }

  {
    const addr = srv.address();
    const actualPort =
      addr && typeof addr !== "string" ? addr.port : redirectPort;
    redirectPort = actualPort;
    redirectUri = `http://${redirectHost}:${actualPort}/callback`;

    if (forgetClient && clientStore.forgetClientId(issuer)) {
      console.log(`Forgot the cached client for ${issuer}.`);
    }

    // Reuse the client registered for this issuer and this exact callback URI.
    // The engine records consent per (user, client), so reusing the id is what
    // makes the consent screen a one-time approval rather than a per-login one.
    if (!clientId && !forgetClient) {
      clientId = clientStore.cachedClientId(issuer, redirectUri) || undefined;
      if (clientId) {
        const cacheFile = path.relative(
          process.cwd(),
          clientStore.clientPath(),
        );
        console.log(
          `Reusing client_id ${clientId} from ${cacheFile} ` +
            "(delete it, or pass --forget-client, to register a new one)",
        );
      }
    }

    if (!clientId) {
      if (!registerUrl) {
        srv.close();
        throw new Error(
          "OAUTH_CLIENT_ID not set and registration_endpoint not available. Provide a client ID.",
        );
      }
      console.log(`Registering a dynamic client for ${redirectUri}`);
      const registration = await dynamicRegisterClient(registerUrl);
      clientId = registration.client_id;
      if (!clientId) {
        srv.close();
        throw new Error(
          `Dynamic registration succeeded but no client_id returned: ${JSON.stringify(registration)}`,
        );
      }
      console.log(`Registered client_id: ${clientId}`);
      // Remembered only when this script registered it: an OAUTH_CLIENT_ID from
      // the environment is the caller's to manage, not ours to cache. A client
      // registered against a fallback port is not worth remembering either --
      // the port was borrowed for this run, so the entry could never match
      // again, and writing it would discard a good entry over a port that
      // happened to be busy once.
      if (!portFallback) {
        clientStore.rememberClientId(issuer, redirectUri, clientId);
      }
    }

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
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
