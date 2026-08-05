// Visual style + color shared by living classes.
//
// A visual style names one of the avatar mesh recipes the client can build
// (see LIVING_VISUAL_STYLE_SPECS in client-avatars.js). Designing a new
// silhouette — a horse, say — still means writing a recipe there, but every
// class after that (a donkey) is just an existing style plus a size and a
// color, no client work at all.
//
// Like class sizes this is purely cosmetic: nothing on the server reads the
// style or the color, and "humanoid" is the neutral value every class that
// predates the field keeps.
export type LivingVisualStyle =
  "humanoid" | "wolfish" | "bearish" | "doggish" | "birdlike" | "equine";

export const LIVING_VISUAL_STYLES: LivingVisualStyle[] = [
  "humanoid",
  "wolfish",
  "bearish",
  "doggish",
  "birdlike",
  "equine",
];

export const DEFAULT_LIVING_VISUAL_STYLE: LivingVisualStyle = "humanoid";

// Accepts anything (a DB column, an editor field, a tool argument) and returns
// a known style id, falling back to "humanoid" for empty/unknown values.
export function normalizeLivingVisualStyle(
  raw: unknown,
  fallback: LivingVisualStyle = DEFAULT_LIVING_VISUAL_STYLE,
): LivingVisualStyle {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  return LIVING_VISUAL_STYLES.indexOf(value as LivingVisualStyle) === -1
    ? fallback
    : (value as LivingVisualStyle);
}

// Class colors are stored as "#rrggbb" text (or "" for "let the client pick"),
// not as an integer column, so that "no color chosen" survives a round trip —
// see the null-into-INTEGER note in living-class-storage.ts's sibling tables.
// Accepts "#rrggbb", "rrggbb", "#rgb" and plain numbers (0x8b5a2b).
export function normalizeClassColor(raw: unknown, fallback = ""): string {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const clamped = Math.max(0, Math.min(0xffffff, Math.floor(raw)));
    return "#" + ("000000" + clamped.toString(16)).slice(-6);
  }
  const value = String(raw === null || raw === undefined ? "" : raw)
    .trim()
    .toLowerCase()
    .replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(value)) {
    return (
      "#" + value[0] + value[0] + value[1] + value[1] + value[2] + value[2]
    );
  }
  if (/^[0-9a-f]{6}$/.test(value)) return "#" + value;
  return fallback;
}
