/**
 * Tests for the origin check that guards the state-changing routes.
 *
 * Everything here is pure — a fake context is enough, since the guard reads
 * only `request.url` and two headers — so the suite says something useful
 * about a fresh deployment before any world exists.
 */

import { isAllowedRequestOrigin, parseOrigin } from "./request-guard.ts";

const OURS = "https://world.softagen.com";
const PLAY_URL = OURS + "/virtual-world/chat";

/**
 * @param {Record<string, string>} headers
 * @param {string} url
 * @returns {*}
 */
function fakeContext(headers: Record<string, string>, url: string = PLAY_URL) {
  return {
    request: {
      url: url,
      method: "POST",
      path: "/virtual-world/chat",
      headers: headers,
    },
  };
}

describe("parseOrigin", () => {
  test("keeps scheme, host and port, and drops everything after them", () => {
    expect(
      parseOrigin("https://world.softagen.com/virtual-world/play?x=1"),
    ).toBe(OURS);
    expect(parseOrigin("http://localhost:8080/a")).toBe(
      "http://localhost:8080",
    );
    expect(parseOrigin("HTTPS://World.Softagen.Com")).toBe(OURS);
  });

  test("an opaque or relative value has no origin", () => {
    // `Origin: null` is what a sandboxed iframe sends; treating it as an empty
    // origin is what makes the caller refuse it rather than wave it through.
    expect(parseOrigin("null")).toBe("");
    expect(parseOrigin("/virtual-world/play")).toBe("");
    expect(parseOrigin("")).toBe("");
    expect(parseOrigin(null)).toBe("");
    expect(parseOrigin(undefined)).toBe("");
  });
});

describe("origin check", () => {
  test("our own page is allowed", () => {
    expect(isAllowedRequestOrigin(fakeContext({ origin: OURS }))).toBe(true);
  });

  test("another origin is refused", () => {
    expect(
      isAllowedRequestOrigin(fakeContext({ origin: "https://evil.example" })),
    ).toBe(false);
  });

  test("a sibling host on the same site is refused", () => {
    // The case SameSite=Lax cannot see: softagen.com and world.softagen.com
    // share a registrable domain, so the session cookie rides along.
    expect(
      isAllowedRequestOrigin(fakeContext({ origin: "https://softagen.com" })),
    ).toBe(false);
  });

  test("a host that merely starts the same is refused", () => {
    expect(
      isAllowedRequestOrigin(
        fakeContext({ origin: "https://world.softagen.com.evil.example" }),
      ),
    ).toBe(false);
    expect(
      isAllowedRequestOrigin(
        fakeContext({ origin: "http://world.softagen.com" }),
      ),
    ).toBe(false);
  });

  test("an opaque origin is refused", () => {
    expect(isAllowedRequestOrigin(fakeContext({ origin: "null" }))).toBe(false);
  });

  test("the header name is matched case-insensitively", () => {
    // The foreign Referer is what makes the first case mean something: a
    // lookup that fails to find `Origin` falls through to Referer and refuses,
    // so answering true can only come from having actually read the header.
    expect(
      isAllowedRequestOrigin(
        fakeContext({ Origin: OURS, referer: "https://evil.example/x" }),
      ),
    ).toBe(true);
    expect(
      isAllowedRequestOrigin(fakeContext({ Origin: "https://evil.example" })),
    ).toBe(false);
    expect(
      isAllowedRequestOrigin(
        fakeContext({ REFERER: "https://evil.example/x" }),
      ),
    ).toBe(false);
  });

  test("a Headers-style object is read through get()", () => {
    const context = {
      request: {
        url: PLAY_URL,
        headers: {
          get: function (name: string) {
            return name.toLowerCase() === "origin"
              ? "https://evil.example"
              : null;
          },
        },
      },
    };
    expect(isAllowedRequestOrigin(context)).toBe(false);
  });

  test("Referer stands in when Origin is absent", () => {
    expect(
      isAllowedRequestOrigin(
        fakeContext({ referer: OURS + "/virtual-world/play" }),
      ),
    ).toBe(true);
    expect(
      isAllowedRequestOrigin(
        fakeContext({ referer: "https://evil.example/x" }),
      ),
    ).toBe(false);
  });

  test("Origin wins over Referer when both are present", () => {
    expect(
      isAllowedRequestOrigin(
        fakeContext({ origin: OURS, referer: "https://evil.example/x" }),
      ),
    ).toBe(true);
  });

  test("a caller that states no origin at all is allowed", () => {
    // curl and server-to-server callers send neither header and carry no
    // ambient cookie; some browsers also omit Origin on same-origin posts.
    expect(isAllowedRequestOrigin(fakeContext({}))).toBe(true);
  });

  test("the expected origin follows the host the request arrived on", () => {
    // The same code has to be right on whatever host the script is bound to.
    const onMainHost = fakeContext(
      { origin: "https://softagen.com" },
      "https://softagen.com/virtual-world/chat",
    );
    expect(isAllowedRequestOrigin(onMainHost)).toBe(true);
  });

  test("a request with no usable url falls back to allowing", () => {
    expect(
      isAllowedRequestOrigin(
        fakeContext({ origin: "https://evil.example" }, ""),
      ),
    ).toBe(true);
    expect(isAllowedRequestOrigin({})).toBe(true);
    expect(isAllowedRequestOrigin(null)).toBe(true);
  });
});
