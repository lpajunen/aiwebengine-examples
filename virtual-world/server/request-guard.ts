// Origin checks for the state-changing HTTP routes.
//
// Every write route here authenticates from the `aiwebengine_session` cookie
// alone, and the browser attaches that cookie by destination rather than by who
// initiated the request. `SameSite=Lax` stops a genuinely cross-site POST, but
// "site" means registrable domain: a page served from softagen.com counts as
// same-site with world.softagen.com, so its form submissions arrive carrying a
// visiting player's session. The engine hosts other people's scripts on that
// domain, which leaves the cookie policy unable to separate our own UI from
// theirs.
//
// `Origin` closes that gap. The browser sets it on cross-origin writes and page
// JS cannot override it, so a request whose `Origin` is not ours did not come
// from our page whatever cookie it carries. The expected value is derived from
// the URL the request arrived on rather than hardcoded, so the same code is
// correct on world.softagen.com, on softagen.com, and on any host the script is
// later bound to with `make set-script-hosts`.
import { vwLog } from "./diagnostics.ts";

const ORIGIN_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i;

/**
 * Scheme and authority of an absolute URL, lowercased — "" when the value is
 * missing or not absolute. `Origin: null` (a sandboxed iframe, or a redirected
 * cross-origin post) has no scheme and so lands here as "", which the caller
 * treats as a mismatch rather than as an absent header: an opaque origin is
 * still not ours.
 *
 * @param {*} value
 * @returns {string}
 */
export function parseOrigin(value: any): string {
  const match = ORIGIN_PATTERN.exec(String(value === null ? "" : value).trim());
  if (!match) return "";
  return (match[1] + "://" + match[2]).toLowerCase();
}

/**
 * `request.headers` is a `Headers` that still reads as the plain object it used
 * to be, so `get()` answers first. The fallback is for a context that supplies
 * only the object — a test's fake — and has to compare keys case-insensitively
 * itself, because a client picks the capitalisation and `Origin` and `origin`
 * name the same header.
 *
 * @param {*} request
 * @param {string} name
 * @returns {string}
 */
function readHeader(request: any, name: string): string {
  const headers = request && request.headers;
  if (!headers) return "";
  if (typeof headers.get === "function") {
    const found = headers.get(name);
    if (found) return String(found);
  }
  const wanted = name.toLowerCase();
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() !== wanted) continue;
    const value = headers[keys[i]];
    if (value) return String(value);
  }
  return "";
}

/**
 * Whether a state-changing request may proceed.
 *
 * A request is refused only when the browser told us where it came from and
 * that is somewhere else. Two cases deliberately pass:
 *
 * - **Neither `Origin` nor `Referer`.** Non-browser callers (curl, a server
 *   calling the API with an explicit credential) send neither, and they carry
 *   no ambient cookie for an attacker to ride. Some browsers also omit `Origin`
 *   on *same*-origin posts, so refusing here would break the game itself.
 * - **No parseable `request.url`.** Only HTTP routes have one; if the engine
 *   ever stops providing it we cannot name our own origin, and failing closed
 *   would take every write down. The cookie's `SameSite` still applies.
 *
 * @param {*} context
 * @returns {boolean}
 */
export function isAllowedRequestOrigin(context: any): boolean {
  const request = context && context.request;
  if (!request) return true;
  const expected = parseOrigin(request.url);
  if (!expected) return true;

  const originHeader = readHeader(request, "origin");
  if (originHeader) return parseOrigin(originHeader) === expected;

  // No `Origin`: `Referer` is the older, weaker witness of the same fact. Only
  // its origin is compared, never its path.
  const refererHeader = readHeader(request, "referer");
  if (refererHeader) return parseOrigin(refererHeader) === expected;

  return true;
}

/**
 * The 403 to return from a write handler, or null when the request may go on.
 *
 * Call this ahead of the handler's authentication check so a forged request is
 * refused before anything reads the session or touches the world — and so the
 * control can be verified from outside without a session, by watching an
 * unauthenticated post answer 403 for a foreign origin and 401 for ours.
 *
 * @param {*} context
 * @returns {*} a ResponseBuilder response, or null
 */
export function crossOriginRejection(context: any): any {
  if (isAllowedRequestOrigin(context)) return null;
  const request = context && context.request;
  vwLog("request_guard.cross_origin_blocked", {
    path: request && request.path ? String(request.path) : "",
    method: request && request.method ? String(request.method) : "",
    origin: readHeader(request, "origin"),
    referer: readHeader(request, "referer"),
  });
  return ResponseBuilder.json({ error: "error.cross_origin_blocked" }, 403);
}
