// Per-locale display names for creator classes (item/action/living/world).
//
// The canonical English name stays in each class's `fallbackLabel`; this map
// holds the additional locale overrides a creator enters in the editors (today
// just Finnish, keyed "fi"). The client's localizeLabel() prefers a matching
// locale entry here and otherwise falls back to t(labelKey, fallbackLabel), so
// built-in classes — which carry no labels map and translate via labelKey —
// keep working unchanged.
export type ClassLabels = Record<string, string>;

// Accepts either a parsed object or a JSON string (a DB `labels_json` column),
// and returns a clean { locale: name } map with only non-empty string values.
export function normalizeClassLabels(raw: unknown): ClassLabels {
  if (!raw) return {};
  let source: unknown = raw;
  if (typeof raw === "string") {
    try {
      source = JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }
  if (!source || typeof source !== "object") return {};
  const out: ClassLabels = {};
  Object.keys(source as Record<string, unknown>).forEach(function (locale) {
    const value = (source as Record<string, unknown>)[locale];
    const key = String(locale || "").trim();
    if (key && typeof value === "string" && value.trim()) {
      out[key] = value.trim();
    }
  });
  return out;
}
