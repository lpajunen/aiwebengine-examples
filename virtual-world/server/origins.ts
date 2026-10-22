// Origins (synnyt): in the Kalevala, a tietäjä has power over a thing by
// knowing how it came to be. Here an origin is a player value, set once it is
// learned, and the spells that need it read it through their actorConditions.
//
// The elder teaches them. A Tietäjä learns for nothing; anyone else pays with
// a birch-bark letter. Both are ordinary actions built from this list
// (action-registry.ts), offered as choices in the elder's dialogue
// (living-registry.ts).
//
// Data only, with no imports, so the registries can all read it.

export interface Origin {
  id: string;
  // The player value that records it: "synty_" + id.
  valueKey: string;
  fallbackLabel: string;
  // What learning it costs anyone but the classes in freeForClassIds.
  costItemId: string;
  freeForClassIds: string[];
  // What the elder says as he teaches it.
  learnedText: string;
}

export const ORIGINS: Origin[] = [
  {
    id: "tuli",
    valueKey: "synty_tuli",
    fallbackLabel: "The origin of fire",
    costItemId: "birch_bark_letter",
    freeForClassIds: ["player_tietaja"],
    learnedText:
      "Fire was struck by Ukko in the heavens, from the edge of his sword. Speak to it of its birth, and it will hear you.",
  },
  {
    // What calls the small man from the sea to fell the great oak
    // (great-oak.ts).
    id: "tammi",
    valueKey: "synty_tammi",
    fallbackLabel: "The origin of the oak",
    costItemId: "birch_bark_letter",
    freeForClassIds: ["player_tietaja"],
    learnedText:
      "Sampsa sowed the oak, and it grew until it hid the sun and the moon. Only a small man from the sea could fell it. Bring him a shell, and call him.",
  },
];

/** The action that teaches an origin, at a price or (`free`) without. */
export function learnOriginActionId(originId: string, free: boolean): string {
  return "learn_synty_" + originId + (free ? "_free" : "");
}

export const ORIGIN_LEARN_ACTION_IDS: string[] = ORIGINS.reduce(function (
  ids: string[],
  origin,
) {
  return ids.concat([
    learnOriginActionId(origin.id, false),
    learnOriginActionId(origin.id, true),
  ]);
}, []);
