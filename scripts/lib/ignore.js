/// <reference types="node" />
// Which files under a script directory are not assets.
//
// The engine reads `.aiwebengineignore` when it pushes a script to a
// repository -- what the file excludes is left alone in the repo rather than
// overwritten -- and this repo is laid out the way a pull reads it back: every
// top-level directory holding `main.*` is a script, and everything else under
// it is one of its assets at the same relative path.
//
// That makes an ignore file load-bearing locally too. Without one, uploading a
// script would sweep up whatever else lives beside its code -- virtual-world's
// TODO and DESIGN notes, a stray .DS_Store -- and deploy it as an asset. The
// tooling therefore reads the same file the engine does, so that what `make
// upload-virtual-world` sends and what a push would write stay the same set.
//
// The supported subset of gitignore syntax is what this repo's file uses:
// blank lines and `#` comments are skipped, a leading `/` anchors a pattern to
// the repository root, a pattern without a slash matches any path segment
// (`.DS_Store`), and globs are matched with minimatch (`/virtual-world/*.md`).
// Negation (`!`) is not supported; nothing here needs it, and quietly ignoring
// a `!` line would be worse than not offering it.

const fs = require("fs");
const path = require("path");
const { minimatch } = require("minimatch");

const repoRoot = path.join(__dirname, "..", "..");
const IGNORE_FILE = ".aiwebengineignore";

/**
 * @param {string} [rootDir] repository root holding the ignore file
 * @returns {string[]} patterns, in file order
 */
function loadIgnorePatterns(rootDir) {
  const file = path.join(rootDir || repoRoot, IGNORE_FILE);
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .filter((line) => {
      if (line.startsWith("!")) {
        console.warn(
          `${IGNORE_FILE}: ignoring unsupported negation pattern "${line}"`,
        );
        return false;
      }
      return true;
    });
}

/**
 * @param {string} repoRelativePath path from the repository root, "/" separated
 * @param {string} pattern
 * @returns {boolean}
 */
function matchesPattern(repoRelativePath, pattern) {
  const anchored = pattern.startsWith("/");
  const cleaned = (anchored ? pattern.slice(1) : pattern).replace(/\/$/, "");
  if (!cleaned) return false;

  const candidates = anchored
    ? [repoRelativePath]
    : // An unanchored pattern matches at any depth, the way gitignore reads it.
      repoRelativePath
        .split("/")
        .map((_, i) => repoRelativePath.split("/").slice(i).join("/"));

  for (const candidate of candidates) {
    if (candidate === cleaned) return true;
    // A directory pattern covers everything below it.
    if (candidate.startsWith(`${cleaned}/`)) return true;
    if (minimatch(candidate, cleaned)) return true;
  }
  return false;
}

/**
 * @param {string[]} patterns
 * @returns {(repoRelativePath: string) => boolean} true when the path is ignored
 */
function makeIgnoreFilter(patterns) {
  return (repoRelativePath) => {
    const normalised = repoRelativePath.split(path.sep).join("/");
    return patterns.some((pattern) => matchesPattern(normalised, pattern));
  };
}

module.exports = {
  IGNORE_FILE,
  loadIgnorePatterns,
  makeIgnoreFilter,
  matchesPattern,
};
