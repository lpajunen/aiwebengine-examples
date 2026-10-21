// The player classes of DESIGN-kalevala.md section 2: what a player chooses to
// be on arriving in Väinölä, from the elder's conversation. Data only; the
// living classes are built from it in living-registry.ts, and the choice is
// the choose_class_* actions in tree-action-helpers.ts.
//
// A newcomer is player_human until they choose. A class is kept for the
// character's whole life, and is what they return as after death.

/** The five attributes every player has, by their value keys. */
export const PLAYER_ATTRIBUTES = [
  "voima",
  "ketteryys",
  "kestavyys",
  "tieto",
  "sana",
] as const;

export type PlayerAttribute = (typeof PLAYER_ATTRIBUTES)[number];

/** The skills, by their value keys. Each grows by use (see skills.ts). */
export const PLAYER_SKILLS = [
  "puutyo",
  "takominen",
  "metsastys",
  "synnyt",
  "soitto",
  "lahitaistelu",
  "jousi",
  "parannus",
] as const;

export type PlayerSkill = (typeof PLAYER_SKILLS)[number];

// How far a skill can grow: its class's main skills to 100, its secondary ones
// to 60, and everything else — and everything for a newcomer — to 30.
export const SKILL_CAP_MAIN = 100;
export const SKILL_CAP_SECONDARY = 60;
export const SKILL_CAP_OTHER = 30;

/** The class a new player starts as, and the only one a class is chosen from. */
export const NEWCOMER_CLASS_ID = "player_human";

/** Earlier body types, replaced by the classes; their players become newcomers. */
export const RETIRED_PLAYER_CLASS_IDS = [
  "player_elf",
  "player_hobbit",
  "player_giant",
];

export interface PlayerClassDefinition {
  // The living class id, "player_" + the choice's suffix.
  id: string;
  fallbackLabel: string;
  fiLabel: string;
  color: string;
  // Starting attributes: two favoured, the rest 8–12, each set summing to 58.
  attributes: Record<PlayerAttribute, number>;
  // Hit points at the start, and the die they grow by with levels (not yet
  // rolled: levels do not change hit points yet).
  maxHitPoints: number;
  hitDie: number;
  mainSkills: PlayerSkill[];
  secondarySkills: PlayerSkill[];
}

export const PLAYER_CLASSES: PlayerClassDefinition[] = [
  {
    id: "player_tietaja",
    fallbackLabel: "Sage",
    fiLabel: "Tietäjä",
    color: "#3b4f8f",
    attributes: { voima: 8, ketteryys: 10, kestavyys: 12, tieto: 15, sana: 13 },
    maxHitPoints: 8,
    hitDie: 6,
    mainSkills: ["synnyt", "parannus"],
    secondarySkills: ["soitto", "puutyo"],
  },
  {
    id: "player_seppa",
    fallbackLabel: "Smith",
    fiLabel: "Seppä",
    color: "#6b4a2f",
    attributes: { voima: 15, ketteryys: 8, kestavyys: 13, tieto: 12, sana: 10 },
    maxHitPoints: 12,
    hitDie: 10,
    mainSkills: ["takominen", "puutyo"],
    secondarySkills: ["lahitaistelu"],
  },
  {
    id: "player_laulaja",
    fallbackLabel: "Singer",
    fiLabel: "Laulaja",
    color: "#7a3b6e",
    attributes: { voima: 8, ketteryys: 13, kestavyys: 10, tieto: 12, sana: 15 },
    maxHitPoints: 8,
    hitDie: 6,
    mainSkills: ["soitto"],
    secondarySkills: ["synnyt", "parannus", "metsastys"],
  },
  {
    id: "player_erankavija",
    fallbackLabel: "Woodsman",
    fiLabel: "Eränkävijä",
    color: "#3f6b3a",
    attributes: { voima: 12, ketteryys: 15, kestavyys: 13, tieto: 10, sana: 8 },
    maxHitPoints: 10,
    hitDie: 8,
    mainSkills: ["jousi", "metsastys"],
    secondarySkills: ["puutyo", "lahitaistelu"],
  },
  {
    id: "player_urho",
    fallbackLabel: "Hero",
    fiLabel: "Urho",
    color: "#8f2f2f",
    attributes: { voima: 15, ketteryys: 12, kestavyys: 13, tieto: 8, sana: 10 },
    maxHitPoints: 12,
    hitDie: 10,
    mainSkills: ["lahitaistelu"],
    secondarySkills: ["jousi", "metsastys"],
  },
];

/** The attributes of a player who has not chosen yet: all ordinary. */
export function newcomerAttributes(): Record<PlayerAttribute, number> {
  return { voima: 10, ketteryys: 10, kestavyys: 10, tieto: 10, sana: 10 };
}

/** The action that chooses a class: "choose_class_" + the id's suffix. */
export function chooseClassActionId(classId: string): string {
  return "choose_class_" + String(classId).replace(/^player_/, "");
}

/** The class a choose_class_* action makes the player, or null. */
export function playerClassForChoiceAction(
  actionId: string,
): PlayerClassDefinition | null {
  for (let i = 0; i < PLAYER_CLASSES.length; i++) {
    if (chooseClassActionId(PLAYER_CLASSES[i].id) === actionId) {
      return PLAYER_CLASSES[i];
    }
  }
  return null;
}

/** An attribute's D&D modifier: floor((value − 10) / 2). */
export function attributeModifier(value: number): number {
  return Math.floor((Number(value) - 10) / 2);
}

export function getPlayerClass(classId: string): PlayerClassDefinition | null {
  for (let i = 0; i < PLAYER_CLASSES.length; i++) {
    if (PLAYER_CLASSES[i].id === classId) return PLAYER_CLASSES[i];
  }
  return null;
}

/** How far a player of this class can take the skill. */
export function skillCap(classId: string, skill: string): number {
  const cls = getPlayerClass(classId);
  if (!cls) return SKILL_CAP_OTHER;
  if ((cls.mainSkills as string[]).indexOf(skill) !== -1) return SKILL_CAP_MAIN;
  if ((cls.secondarySkills as string[]).indexOf(skill) !== -1) {
    return SKILL_CAP_SECONDARY;
  }
  return SKILL_CAP_OTHER;
}
