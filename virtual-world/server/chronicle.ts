import { VWORLD_CHRONICLE_TABLE } from "./runtime-config.ts";
import { getEffectiveNick } from "./social-state.ts";
import {
  deleteWorldRowsWhere,
  insertWorldRow,
  queryWorldRows,
} from "./world-db.ts";

// The world's chronicle (DESIGN-kalevala.md, section 6): what happened in it
// and who did it, kept as rows and told in verse. Events write a line — the
// great oak's felling and everyone who struck it — and so do notable things
// players do: rowing ashore at Väinölä, building a house, raising a gate.
//
// The verse is templates in the Kalevala's metre, eight syllables a line, in
// Finnish and English; no model writes it. A line names its actors by their
// nicknames as they are when it is read, so a renamed player is told by their
// new name.

export type ChronicleKind =
  "arrival" | "house_built" | "portal_raised" | "oak_felled";

const CHRONICLE_TEMPLATES: Record<
  ChronicleKind,
  { en: string[]; fi: string[] }
> = {
  arrival: {
    en: [
      "Came a stranger over water,",
      "rowed ashore at Väinölä:",
      "{actors}.",
    ],
    fi: [
      "Saapui vieras vettä myöten,",
      "souti rantahan Väinölän:",
      "{actors}.",
    ],
  },
  house_built: {
    en: [
      "Rose a house of fresh-hewn timber,",
      "log on log was laid together;",
      "{actors} built it.",
    ],
    fi: [
      "Nousi tupa tuoreheksi,",
      "salvettihin uusi salvos;",
      "sen rakensi {actors}.",
    ],
  },
  portal_raised: {
    en: [
      "Rose a gate to lands of strangers,",
      "runes that part the borders open;",
      "{actors} raised it.",
    ],
    fi: [
      "Nousi portti vierahalle,",
      "riimuin raotti rajoja;",
      "sen nostatti {actors}.",
    ],
  },
  oak_felled: {
    en: [
      "Fell the oak that hid the heavens,",
      "fell the great one in Väinölä;",
      "those who struck it down with axes:",
      "{actors}.",
    ],
    fi: [
      "Kaatui tammi kasvanehe,",
      "sorti suuri Väinölässä;",
      "sen kaatoivat kirvehillä",
      "{actors}.",
    ],
  },
};

/** How many lines a world keeps; the oldest go first. */
const CHRONICLE_KEPT = 500;

export interface ChronicleEntry {
  at: number;
  kind: ChronicleKind;
  lines: { en: string[]; fi: string[] };
}

/** Names as a list a reader would say: "A, B and C" / "A, B ja C". */
export function joinNames(names: string[], and: string): string {
  if (names.length <= 1) return names.join("");
  return (
    names.slice(0, -1).join(", ") + " " + and + " " + names[names.length - 1]
  );
}

/** The verse for one entry, with its actors named. */
export function renderChronicle(
  kind: ChronicleKind,
  actorNames: string[],
): { en: string[]; fi: string[] } {
  const template = CHRONICLE_TEMPLATES[kind];
  const fill = function (lines: string[], and: string): string[] {
    const actors = joinNames(actorNames, and);
    return lines.map(function (line) {
      return line.split("{actors}").join(actors);
    });
  };
  return { en: fill(template.en, "and"), fi: fill(template.fi, "ja") };
}

/** Writes a line in the world's chronicle. */
export function writeChronicle(
  worldId: string,
  kind: ChronicleKind,
  actorIds: string[],
): void {
  if (actorIds.length === 0) return;
  insertWorldRow(VWORLD_CHRONICLE_TABLE, {
    world_id: String(worldId),
    at: Math.floor(Date.now() / 1000),
    kind: kind,
    actors_json: JSON.stringify(actorIds.map(String)),
  });
  const rows = queryWorldRows(
    VWORLD_CHRONICLE_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    CHRONICLE_KEPT + 50,
    "id",
    "desc",
  );
  rows.slice(CHRONICLE_KEPT).forEach(function (row: any) {
    deleteWorldRowsWhere(VWORLD_CHRONICLE_TABLE, { id: row.id });
  });
}

/** The world's latest lines, newest first, told in both languages. */
export function readChronicle(worldId: string, limit = 10): ChronicleEntry[] {
  return queryWorldRows(
    VWORLD_CHRONICLE_TABLE,
    JSON.stringify({ world_id: String(worldId) }),
    limit,
    "id",
    "desc",
  ).map(function (row: any) {
    let actorIds: string[] = [];
    try {
      actorIds = JSON.parse(String(row.actors_json || "[]"));
    } catch (e) {
      actorIds = [];
    }
    const kind = String(row.kind) as ChronicleKind;
    return {
      at: Number(row.at || 0) * 1000,
      kind: kind,
      lines: CHRONICLE_TEMPLATES[kind]
        ? renderChronicle(kind, actorIds.map(getEffectiveNick))
        : { en: [], fi: [] },
    };
  });
}
