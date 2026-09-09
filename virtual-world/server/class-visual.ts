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

// The same idea for item classes: a style names one of the client's item mesh
// recipes (see ITEM_VISUAL_STYLE_SPECS in client-world-render.js), so a new
// sabre is the `blade` recipe in another color and size rather than new
// geometry. "block" is the plain cube every item rendered as before styles
// existed, and stays the neutral default.
export type ItemVisualStyle =
  | "block"
  | "blade"
  | "bow"
  | "chest"
  | "door"
  | "staff"
  | "orb"
  | "plant"
  | "scroll"
  | "book"
  // A landmark rather than a carryable: an item with a fixture style renders
  // as its own standalone mesh at the centre of its tile and takes the place
  // of whatever terrain feature the map would draw there (a broadleaf stands
  // instead of the pine on its square). See ITEM_FIXTURE_STYLE_BUILDERS in
  // client-world-render.js.
  | "broadleaf";

export const ITEM_VISUAL_STYLES: ItemVisualStyle[] = [
  "block",
  "blade",
  "bow",
  "chest",
  "door",
  "staff",
  "orb",
  "plant",
  "scroll",
  "book",
  "broadleaf",
];

export const DEFAULT_ITEM_VISUAL_STYLE: ItemVisualStyle = "block";

export function normalizeItemVisualStyle(
  raw: unknown,
  fallback: ItemVisualStyle = DEFAULT_ITEM_VISUAL_STYLE,
): ItemVisualStyle {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  return ITEM_VISUAL_STYLES.indexOf(value as ItemVisualStyle) === -1
    ? fallback
    : (value as ItemVisualStyle);
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

// Item classes predate the text column and store their color as an integer
// (0xrrggbb), so this is the numeric counterpart of normalizeClassColor:
// accepts the same "#rrggbb"/"rgb"/number inputs and returns 0 — the value
// the client reads as "automatic" — for anything it can't parse.
export function normalizeColorNumber(raw: unknown, fallback = 0): number {
  if (typeof raw === "number") {
    return Number.isFinite(raw)
      ? Math.max(0, Math.min(0xffffff, Math.floor(raw)))
      : fallback;
  }
  const hex = normalizeClassColor(raw, "");
  return hex ? parseInt(hex.slice(1), 16) : fallback;
}
