/// <reference types="node" />
// Per-repository defaults for the shared tooling.
//
// `scripts/` is kept identical across the repositories that use this tooling
// (`make check-tooling` fails when it is not), which only works if nothing
// repository-specific is baked into it. The defaults that used to be constants
// -- which script `make eval` talks to, what `make deploy-changed` deploys --
// live in `aiwebengine.config.json` at the repository root instead.
//
// Everything here is optional. A repository without the file, or with an
// incomplete one, simply has no defaults: the scripts that need a script URI
// then require --script-uri instead of guessing, which is the honest failure
// mode for a tool that could otherwise deploy to the wrong place.

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const CONFIG_FILE = "aiwebengine.config.json";

/**
 * @typedef {{
 *   uri?: string,
 *   path?: string,
 *   dir?: string,
 * }} DefaultScript
 * @typedef {{
 *   defaultScript?: DefaultScript,
 *   scriptUriOverrides?: Record<string, string>,
 *   uriOrigin?: string,
 * }} RepoConfig
 */

/** @type {RepoConfig | null} */
let cached = null;

/** @returns {RepoConfig} */
function repoConfig() {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(repoRoot, CONFIG_FILE), "utf8"),
    );
    cached = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Missing or malformed: no defaults, rather than a crash in every command.
    cached = {};
  }
  return cached;
}

/** @returns {string} the script URI commands default to, or "" if unset */
function defaultScriptUri() {
  return repoConfig().defaultScript?.uri || "";
}

/** @returns {string} the entrypoint commands default to, or "" if unset */
function defaultScriptPath() {
  return repoConfig().defaultScript?.path || "";
}

/** @returns {string} the assets root commands default to, or "" if unset */
function defaultScriptDir() {
  return repoConfig().defaultScript?.dir || "";
}

/**
 * The origin script URIs are built from when derived from a directory name.
 * @returns {string}
 */
function uriOrigin() {
  return repoConfig().uriOrigin || "https://example.com";
}

/** @returns {Record<string, string>} directory name -> script URI */
function scriptUriOverrides() {
  return repoConfig().scriptUriOverrides || {};
}

/**
 * Fail with a usable message rather than deploying somewhere unintended.
 * @param {string} what
 * @returns {string}
 */
function requireDefaultScriptUri(what) {
  const uri = defaultScriptUri();
  if (!uri) {
    throw new Error(
      `No --script-uri given and no defaultScript.uri in ${CONFIG_FILE}, so ${what} has no target`,
    );
  }
  return uri;
}

module.exports = {
  CONFIG_FILE,
  defaultScriptDir,
  defaultScriptPath,
  defaultScriptUri,
  repoConfig,
  requireDefaultScriptUri,
  scriptUriOverrides,
  uriOrigin,
};
