// Deterministic world-class placements — see TODO-placements.md.
//
// `itemSpawns`/`npcSpawns` answer "what repeatable population should be
// scattered at random?". Placements answer "what authored things must exist,
// where, and what rules do they impose on this world?" — the old oak, the
// guild house and its door, a protected clearing.
//
// Phase 1 persists and validates the schema. Nothing materializes placements
// into worlds yet; that is phase 3.
//
// Two entry points with deliberately different strictness:
//
// - normalizeWorldClassPlacements is lenient and never throws. It runs on the
//   DB read path, where a malformed stored row must still yield a loadable
//   world class rather than taking the whole class repository down.
// - validateWorldClassPlacements is strict and reports every problem it finds.
//   It runs on the write path (HTTP CRUD + MCP tool), so a creator gets told
//   what is wrong instead of silently losing a placement.

import { getItemClass } from "./item-registry.ts";
import { getLivingClass } from "./living-registry.ts";
import {
  DialogueSpec,
  LivingIdentity,
  normalizeDialogueSpec,
  normalizeLivingIdentity,
  validateDialogueSpec,
  WORLD_TILE_DEFS,
} from "./world-domain.ts";
import { isReservationRule } from "./runtime-config.ts";

// Closed set until a new engine primitive exists to back a new member.
export const PLACEMENT_KINDS = [
  "item",
  "fixture",
  "npc",
  "terrain",
  "structure",
  "portal",
];

// Which class registry a placement's `classId` is resolved against.
// terrain/structure name a world tile rather than a class, because they write
// map mods (collision, footprint) instead of placing an item entity.
const ITEM_BACKED_KINDS = ["item", "fixture", "portal"];
const TILE_BACKED_KINDS = ["terrain", "structure"];

export const PLACEMENT_DESTINATION_MODES = [
  // Resolve (and on first use create) one stable destination world per
  // (source world, placement) from `worldClassId`.
  "ensure_world_class",
  // Point at one specific already-existing world by `worldId`.
  "existing_world",
  // Lead back to whichever world the traveller came from. Required for return
  // doors: a class template cannot name its own callers, so an interior's exit
  // cannot be expressed with either mode above.
  "source_world",
];

export type PlacementDestination = {
  mode: string;
  worldClassId?: string;
  worldId?: string;
  entryPlacementId?: string;
};

export type PlacementPosition = {
  // Only "exact" is supported. "random" stays the job of itemSpawns/npcSpawns,
  // and "near_placement" waits for a concrete editor workflow.
  strategy: string;
  row: number;
  col: number;
};

export type PlacementReservation = {
  kind: string;
  row: number;
  col: number;
  radius?: number;
  rows?: number;
  cols?: number;
  rules: string[];
};

export type WorldClassPlacement = {
  id: string;
  kind: string;
  classId: string;
  position: PlacementPosition;
  state: Record<string, unknown>;
  reservations: PlacementReservation[];
  // Who this placement *is*, as opposed to what class it instantiates — the
  // difference between "a human stands here" and "Aino the Gatekeeper stands
  // here". Consumed today by `npc` placements, which copy it onto the NPC they
  // materialize (see materializeWorldNPCPlacements); the block itself is not
  // NPC-specific, so a named fixture can use it when a reader for that exists.
  // Absent for the ordinary case, which keeps the hashed name.
  identity?: LivingIdentity;
  // What *this* living says, overriding whatever its class says. A class's
  // dialogue is what every gatekeeper has in common; this is what only the one
  // standing at this gate knows.
  //
  // Unlike `identity` it is not copied onto the NPC when it materializes: a
  // conversation runs to kilobytes and an NPC row is rewritten every tick, so
  // it stays here and is read when someone actually talks. See
  // resolveDialogueTarget in dialogue-helpers.ts.
  dialogue?: DialogueSpec;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asInteger(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

// ---------------------------------------------------------------- normalize

function normalizeReservation(
  raw: unknown,
  fallbackRow: number,
  fallbackCol: number,
): PlacementReservation | null {
  const obj = asObject(raw);
  if (!obj) return null;
  const kind = String(obj.kind || "");
  if (kind !== "circle" && kind !== "rectangle") return null;

  const rules: string[] = [];
  if (Array.isArray(obj.rules)) {
    for (let i = 0; i < obj.rules.length; i++) {
      const rule = String(obj.rules[i] || "");
      if (rule && rules.indexOf(rule) === -1) rules.push(rule);
    }
  }

  // A reservation with no row/col is centred on the placement that owns it —
  // the common case, since the landmark is what requires the protected area.
  const row = obj.row === undefined ? fallbackRow : asInteger(obj.row);
  const col = obj.col === undefined ? fallbackCol : asInteger(obj.col);
  if (row === null || col === null) return null;

  const reservation: PlacementReservation = {
    kind: kind,
    row: row,
    col: col,
    rules: rules,
  };
  if (kind === "circle") {
    const radius = asInteger(obj.radius);
    if (radius === null || radius < 0) return null;
    reservation.radius = radius;
  } else {
    const rows = asInteger(obj.rows);
    const cols = asInteger(obj.cols);
    if (rows === null || cols === null || rows < 1 || cols < 1) return null;
    reservation.rows = rows;
    reservation.cols = cols;
  }
  return reservation;
}

function normalizePlacement(raw: unknown): WorldClassPlacement | null {
  const obj = asObject(raw);
  if (!obj) return null;
  const id = String(obj.id || "").trim();
  if (!id) return null;
  const kind = String(obj.kind || "");
  if (PLACEMENT_KINDS.indexOf(kind) === -1) return null;
  const classId = String(obj.classId || "").trim();
  if (!classId) return null;

  const positionObj = asObject(obj.position);
  if (!positionObj) return null;
  const row = asInteger(positionObj.row);
  const col = asInteger(positionObj.col);
  if (row === null || col === null) return null;

  const reservations: PlacementReservation[] = [];
  if (Array.isArray(obj.reservations)) {
    for (let i = 0; i < obj.reservations.length; i++) {
      const reservation = normalizeReservation(obj.reservations[i], row, col);
      if (reservation) reservations.push(reservation);
    }
  }

  const placement: WorldClassPlacement = {
    id: id,
    kind: kind,
    classId: classId,
    position: {
      strategy: String(positionObj.strategy || "exact"),
      row: row,
      col: col,
    },
    state: asObject(obj.state) || {},
    reservations: reservations,
  };
  const identity = normalizeLivingIdentity(obj.identity);
  if (identity) placement.identity = identity;
  const dialogue = normalizeDialogueSpec(obj.dialogue);
  if (dialogue) placement.dialogue = dialogue;
  return placement;
}

export function normalizeWorldClassPlacements(
  raw: unknown,
): WorldClassPlacement[] {
  if (!Array.isArray(raw)) return [];
  const out: WorldClassPlacement[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < raw.length; i++) {
    const placement = normalizePlacement(raw[i]);
    if (!placement || seen[placement.id]) continue;
    seen[placement.id] = true;
    out.push(placement);
  }
  return out;
}

// ----------------------------------------------------------------- validate

function validateDestination(
  destination: Record<string, unknown>,
  prefix: string,
  errors: string[],
): void {
  const mode = String(destination.mode || "");
  if (PLACEMENT_DESTINATION_MODES.indexOf(mode) === -1) {
    errors.push(
      prefix +
        ": destination.mode must be one of " +
        PLACEMENT_DESTINATION_MODES.join(", "),
    );
    return;
  }
  if (
    mode === "ensure_world_class" &&
    !String(destination.worldClassId || "")
  ) {
    errors.push(
      prefix + ": destination.worldClassId is required for ensure_world_class",
    );
  }
  if (mode === "existing_world" && !String(destination.worldId || "")) {
    errors.push(
      prefix + ": destination.worldId is required for existing_world",
    );
  }
  if (
    destination.entryPlacementId !== undefined &&
    !String(destination.entryPlacementId || "")
  ) {
    errors.push(
      prefix + ": destination.entryPlacementId must be a non-empty id",
    );
  }
}

function validateClassReference(
  kind: string,
  classId: string,
  prefix: string,
  errors: string[],
): void {
  if (ITEM_BACKED_KINDS.indexOf(kind) !== -1) {
    if (!getItemClass(classId)) {
      errors.push(prefix + ': unknown item class "' + classId + '"');
    }
    return;
  }
  if (kind === "npc") {
    if (!getLivingClass(classId)) {
      errors.push(prefix + ': unknown living class "' + classId + '"');
    }
    return;
  }
  if (TILE_BACKED_KINDS.indexOf(kind) !== -1) {
    if (!(WORLD_TILE_DEFS as Record<string, unknown>)[classId]) {
      errors.push(
        prefix +
          ': unknown world tile "' +
          classId +
          '" (' +
          kind +
          " placements name a tile, not a class)",
      );
    }
  }
}

function validateReservation(
  raw: unknown,
  prefix: string,
  dims: { rows: number; cols: number },
  errors: string[],
): void {
  const obj = asObject(raw);
  if (!obj) {
    errors.push(prefix + ": reservation must be an object");
    return;
  }
  const kind = String(obj.kind || "");
  if (kind !== "circle" && kind !== "rectangle") {
    errors.push(prefix + ': reservation kind must be "circle" or "rectangle"');
    return;
  }
  if (kind === "circle") {
    const radius = asInteger(obj.radius);
    if (radius === null || radius < 0) {
      errors.push(prefix + ": circle reservation needs a radius >= 0");
    }
  } else {
    const rows = asInteger(obj.rows);
    const cols = asInteger(obj.cols);
    if (rows === null || rows < 1 || cols === null || cols < 1) {
      errors.push(
        prefix + ": rectangle reservation needs rows >= 1, cols >= 1",
      );
    }
  }
  for (const key of ["row", "col"]) {
    if (obj[key] === undefined) continue;
    const value = asInteger(obj[key]);
    const limit = key === "row" ? dims.rows : dims.cols;
    if (value === null || value < 0 || value >= limit) {
      errors.push(
        prefix + ": reservation " + key + " must be within 0.." + (limit - 1),
      );
    }
  }
  if (!Array.isArray(obj.rules) || obj.rules.length === 0) {
    errors.push(prefix + ": reservation needs at least one rule");
    return;
  }
  for (let i = 0; i < obj.rules.length; i++) {
    const rule = String(obj.rules[i] || "");
    if (!isReservationRule(rule)) {
      errors.push(prefix + ': unknown reservation rule "' + rule + '"');
    }
  }
}

// A name has to fit a nameplate and a description a tile-inspector line, so
// both are bounded here rather than letting a paste of prose through to every
// client in the world.
const MAX_IDENTITY_NAME_LENGTH = 60;
const MAX_IDENTITY_DESCRIPTION_LENGTH = 500;

function validateIdentityTextMap(
  raw: unknown,
  field: string,
  maxLength: number,
  prefix: string,
  errors: string[],
): void {
  const map = asObject(raw);
  if (!map) {
    errors.push(prefix + ": identity." + field + " must be an object");
    return;
  }
  for (const locale of Object.keys(map)) {
    const value = map[locale];
    if (typeof value !== "string") {
      errors.push(
        prefix + ": identity." + field + "." + locale + " must be a string",
      );
    } else if (value.length > maxLength) {
      errors.push(
        prefix +
          ": identity." +
          field +
          "." +
          locale +
          " must be at most " +
          maxLength +
          " characters",
      );
    }
  }
}

function validateIdentity(
  raw: unknown,
  prefix: string,
  errors: string[],
): void {
  const obj = asObject(raw);
  if (!obj) {
    errors.push(prefix + ": identity must be an object");
    return;
  }
  const texts: Array<[string, number]> = [
    ["name", MAX_IDENTITY_NAME_LENGTH],
    ["description", MAX_IDENTITY_DESCRIPTION_LENGTH],
  ];
  for (const [field, maxLength] of texts) {
    if (obj[field] === undefined) continue;
    if (typeof obj[field] !== "string") {
      errors.push(prefix + ": identity." + field + " must be a string");
    } else if (String(obj[field]).length > maxLength) {
      errors.push(
        prefix +
          ": identity." +
          field +
          " must be at most " +
          maxLength +
          " characters",
      );
    }
  }
  if (obj.labels !== undefined) {
    validateIdentityTextMap(
      obj.labels,
      "labels",
      MAX_IDENTITY_NAME_LENGTH,
      prefix,
      errors,
    );
  }
  if (obj.descriptions !== undefined) {
    validateIdentityTextMap(
      obj.descriptions,
      "descriptions",
      MAX_IDENTITY_DESCRIPTION_LENGTH,
      prefix,
      errors,
    );
  }
}

// Returns one message per problem found — empty means the placements are safe
// to persist. Never throws; callers surface the list to the creator.
export function validateWorldClassPlacements(
  raw: unknown,
  dims: { rows: number; cols: number },
): string[] {
  const errors: string[] = [];
  if (raw === undefined || raw === null) return errors;
  if (!Array.isArray(raw)) {
    errors.push("placements must be an array");
    return errors;
  }

  const seen: Record<string, boolean> = {};
  for (let i = 0; i < raw.length; i++) {
    const prefix = "placements[" + i + "]";
    const obj = asObject(raw[i]);
    if (!obj) {
      errors.push(prefix + ": must be an object");
      continue;
    }

    const id = String(obj.id || "").trim();
    if (!id) {
      errors.push(prefix + ": id is required");
    } else if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
      errors.push(
        prefix +
          ': id "' +
          id +
          '" must be lowercase alphanumeric with - or _ separators',
      );
    } else if (seen[id]) {
      errors.push(prefix + ': duplicate placement id "' + id + '"');
    } else {
      seen[id] = true;
    }

    const kind = String(obj.kind || "");
    if (PLACEMENT_KINDS.indexOf(kind) === -1) {
      errors.push(
        prefix + ": kind must be one of " + PLACEMENT_KINDS.join(", "),
      );
    }

    const classId = String(obj.classId || "").trim();
    if (!classId) {
      errors.push(prefix + ": classId is required");
    } else if (PLACEMENT_KINDS.indexOf(kind) !== -1) {
      validateClassReference(kind, classId, prefix, errors);
    }

    const positionObj = asObject(obj.position);
    if (!positionObj) {
      errors.push(prefix + ": position is required");
    } else {
      const strategy = String(positionObj.strategy || "exact");
      if (strategy !== "exact") {
        errors.push(
          prefix +
            ': position.strategy "' +
            strategy +
            '" is not supported yet (use "exact"; random population belongs in itemSpawns/npcSpawns)',
        );
      }
      const row = asInteger(positionObj.row);
      const col = asInteger(positionObj.col);
      if (row === null || row < 0 || row >= dims.rows) {
        errors.push(
          prefix + ": position.row must be within 0.." + (dims.rows - 1),
        );
      }
      if (col === null || col < 0 || col >= dims.cols) {
        errors.push(
          prefix + ": position.col must be within 0.." + (dims.cols - 1),
        );
      }
    }

    if (obj.identity !== undefined) {
      validateIdentity(obj.identity, prefix, errors);
    }

    if (obj.dialogue !== undefined) {
      validateDialogueSpec(obj.dialogue, prefix + ".dialogue").forEach(
        function (message) {
          errors.push(prefix + ": " + message);
        },
      );
    }

    if (obj.state !== undefined) {
      const state = asObject(obj.state);
      if (!state) {
        errors.push(prefix + ": state must be an object");
      } else if (state.destination !== undefined) {
        const destination = asObject(state.destination);
        if (!destination) {
          errors.push(prefix + ": state.destination must be an object");
        } else {
          validateDestination(destination, prefix, errors);
        }
      }
    }

    if (obj.reservations !== undefined) {
      if (!Array.isArray(obj.reservations)) {
        errors.push(prefix + ": reservations must be an array");
      } else {
        for (let r = 0; r < obj.reservations.length; r++) {
          validateReservation(
            obj.reservations[r],
            prefix + ".reservations[" + r + "]",
            dims,
            errors,
          );
        }
      }
    }
  }

  // Cross-references are checked after every id is known, so order in the
  // array does not matter.
  for (let i = 0; i < raw.length; i++) {
    const obj = asObject(raw[i]);
    if (!obj) continue;
    const state = asObject(obj.state);
    const destination = state ? asObject(state.destination) : null;
    if (!destination) continue;
    const entryPlacementId = String(destination.entryPlacementId || "");
    // An entry in *this* class is only meaningful for a destination that is
    // this same class; for other modes the entry names a placement in the
    // destination class, which we cannot resolve from here.
    if (
      entryPlacementId &&
      String(destination.mode || "") === "source_world" &&
      !seen[entryPlacementId]
    ) {
      errors.push(
        "placements[" +
          i +
          ']: entryPlacementId "' +
          entryPlacementId +
          '" does not match any placement in this class',
      );
    }
  }

  return errors;
}
