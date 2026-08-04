// Display size shared by item and living classes.
//
// Purely visual: the client multiplies a class's mesh scale by
// CLASS_SIZE_SCALES[size] (see classSizeScale() in tiles-and-items.js), so a
// "large" living renders at twice the height of a "medium" one and a "tiny"
// item at a quarter. Nothing on the server reads size — reach, blocking,
// combat and inventory rules are size-agnostic.
//
// "medium" is the neutral value every pre-size class keeps, so rows written
// before this column existed (which read back as "") look exactly as before.
export type ClassSize = "tiny" | "small" | "medium" | "large" | "huge";

export const CLASS_SIZES: ClassSize[] = [
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
];

export const DEFAULT_CLASS_SIZE: ClassSize = "medium";

// Accepts anything (a DB column, an editor field, a tool argument) and returns
// a known size id, falling back to "medium" for empty/unknown values.
export function normalizeClassSize(
  raw: unknown,
  fallback: ClassSize = DEFAULT_CLASS_SIZE,
): ClassSize {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  return CLASS_SIZES.indexOf(value as ClassSize) === -1
    ? fallback
    : (value as ClassSize);
}
