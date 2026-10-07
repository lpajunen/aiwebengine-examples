/// <reference types="node" />
// Per-repository defaults for the shared tooling.
//
// `scripts/` is kept identical across the repositories that use this tooling
// (`make check-tooling` fails when it is not), which only works if nothing
// repository-specific is baked into it. Repository defaults -- which script
// `make eval` talks to, what `make deploy-changed` deploys -- live in
// `aiwebengine.config.json` at the repository root.
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
 *   scriptNames?: Record<string, string>,
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

/** @returns {Record<string, string>} directory name -> script name */
function scriptNameOverrides() {
  return repoConfig().scriptNames || {};
}

/**
 * The name a project directory is deployed under: a slug, with no origin and
 * no extension. Directories use snake_case or kebab-case and names are
 * kebab-case; anything that deviates belongs in `scriptNames` in the config.
 * @param {string} projectDir
 * @returns {string}
 */
function scriptNameFor(projectDir) {
  return (
    scriptNameOverrides()[projectDir] ||
    projectDir.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  );
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
  scriptNameFor,
};
