// What the built-in item and world classes say about themselves: the text
// `examine` shows for an item and the world panel shows for a world. Seed
// data, like the classes it belongs to; a creator's class carries its own
// `description` and `descriptions` instead.
//
// Data only, with no imports, so the registries can all read it.

export interface BuiltinDescription {
  en: string;
  fi: string;
}

export const ITEM_DESCRIPTIONS: Record<string, BuiltinDescription> = {
  saw: {
    en: "A toothed blade for cutting timber to length.",
    fi: "Hammastettu terä puun katkomiseen.",
  },
  knife: {
    en: "A puukko, the one tool nobody in the north goes without.",
    fi: "Puukko, jota ilman ei pohjolassa kukaan kulje.",
  },
  sword: {
    en: "A blade of forged iron. Iron was born from the milk of three maidens, the songs say.",
    fi: "Taottua rautaa. Rauta syntyi kolmen neidon maidosta, sanovat laulut.",
  },
  shortbow: {
    en: "A short hunting bow of juniper.",
    fi: "Lyhyt metsästysjousi katajasta.",
  },
  longbow: {
    en: "A tall bow only a woodsman can draw full.",
    fi: "Pitkä jousi, jonka vain eränkävijä jännittää täyteen.",
  },
  flower: {
    en: "A forest flower. It changes nothing, and is kept for that.",
    fi: "Metsän kukka. Se ei muuta mitään, ja siksi se säilytetään.",
  },
  tree_planter: {
    en: "Pine saplings in a bark basket, ready for the ground.",
    fi: "Männyntaimia tuohikorissa, valmiina maahan.",
  },
  portal_builder: {
    en: "Chalk and rune-staves for raising a gate to another land.",
    fi: "Liitua ja riimusauvoja portin nostamiseen toiseen maahan.",
  },
  kantele: {
    en: "Five strings on a pike's jawbone, as Väinämöinen first made it.",
    fi: "Viisi kieltä hauen leukaluussa, niin kuin Väinämöinen sen ensin teki.",
  },
  rowan_charm: {
    en: "Red rowan berries on a thread. The rowan keeps ill things away.",
    fi: "Pihlajanmarjoja langassa. Pihlaja pitää pahat loitolla.",
  },
  rune_stone: {
    en: "A stone cut with runes nobody living can read aloud.",
    fi: "Kivi, johon on hakattu riimuja, joita kukaan elävä ei osaa lausua.",
  },
  juniper_bundle: {
    en: "Juniper twigs bound together, sharp-scented and good for smoke.",
    fi: "Katajanoksia sidottuna, kirpeän tuoksuisia ja hyviä savuun.",
  },
  birch_bark_letter: {
    en: "A strip of birch bark with words pressed into it. The elder takes them as payment for what he knows.",
    fi: "Tuohikaistale, johon on painettu sanoja. Vanhin ottaa niitä maksuksi tiedoistaan.",
  },
  hammer: {
    en: "A builder's hammer, for raising houses and doors.",
    fi: "Rakentajan vasara talojen ja ovien nostamiseen.",
  },
  door: {
    en: "A plank door on wooden hinges.",
    fi: "Lankkuovi puusaranoilla.",
  },
  portal: {
    en: "A rune gate. Step through, and the land is another.",
    fi: "Riimuportti. Astu läpi, niin maa on toinen.",
  },
  spellbook: {
    en: "A book of spells from before the elder taught origins. The words have gone still.",
    fi: "Loitsukirja ajalta ennen kuin vanhin opetti synnyt. Sanat ovat hiljenneet.",
  },
  shaman_talisman: {
    en: "A talisman of carved bone and copper, which mends and harms.",
    fi: "Luusta ja kuparista veistetty kalu, joka parantaa ja vahingoittaa.",
  },
  starter_kit: {
    en: "Your bundle: what every traveller carries.",
    fi: "Nyyttisi: mitä jokainen kulkija kantaa mukanaan.",
  },
  blessing_marker: {
    en: "A rowan blessing set on the ground.",
    fi: "Maahan asetettu pihlajan siunaus.",
  },
  creator_stone: {
    en: "A violet stone that lets its holder shape kinds of things.",
    fi: "Violetti kivi, jonka haltija voi muovata olioiden lajeja.",
  },
  old_oak: {
    en: "The old oak of Väinölä. Pray here, and the dead return.",
    fi: "Väinölän vanha tammi. Rukoile tässä, niin kuolleet palaavat.",
  },
  training_dummy: {
    en: "The wrestling ground of the tupa, where experience becomes strength.",
    fi: "Tuvan painikenttä, jossa kokemus muuttuu voimaksi.",
  },
  npc_corpse: {
    en: "What is left when a living thing falls.",
    fi: "Mitä jää, kun elävä kaatuu.",
  },
  sotka_nest: {
    en: "The nest of the scaup, from whose egg the world was made.",
    fi: "Sotkan pesä, jonka munasta maailma tehtiin.",
  },
  seed_pouch: {
    en: "Sampsa Pellervoinen's seeds, for sowing the first tree.",
    fi: "Sampsa Pellervoisen siemeniä ensimmäisen puun kylvämiseen.",
  },
  pike_jawbone: {
    en: "The jawbone of a great pike, the frame of the first kantele.",
    fi: "Suuren hauen leukaluu, ensimmäisen kanteleen runko.",
  },
  stone: {
    en: "A grey stone that fits the hand.",
    fi: "Harmaa kivi, joka sopii käteen.",
  },
  branch: {
    en: "A straight branch, good for a haft.",
    fi: "Suora oksa, hyvä varreksi.",
  },
  stone_axe: {
    en: "A stone bound to a branch: enough to fell a tree.",
    fi: "Kivi sidottuna oksaan: riittää puun kaatamiseen.",
  },
  log: {
    en: "A felled trunk, ready to be shaped.",
    fi: "Kaadettu runko, valmis muotoiltavaksi.",
  },
  boat: {
    en: "A boat carved from a single trunk, as Väinämöinen sang his into being.",
    fi: "Yhdestä rungosta veistetty vene, niin kuin Väinämöinen omansa lauloi.",
  },
  chest: {
    en: "A wooden chest with an iron hasp.",
    fi: "Puuarkku rautaisella säpillä.",
  },
  sea_shell: {
    en: "A shell from Väinölä's shore. Held to the ear, it sounds like someone small calling from the sea.",
    fi: "Simpukka Väinölän rannalta. Korvalla se kuulostaa kuin joku pieni huutaisi mereltä.",
  },
  oak_branch: {
    en: "A branch of the great oak. Whoever took a branch took everlasting luck.",
    fi: "Ison tammen oksa. Kenpä siitä oksan otti, se otti ikuisen onnen.",
  },
  oak_leaf: {
    en: "A leaf of the great oak. Whoever took a leaf took everlasting love.",
    fi: "Ison tammen lehvä. Kenpä lehvästä lehvähti, lehvähti ikuisen lemmen.",
  },
};

export const WORLD_DESCRIPTIONS: Record<string, BuiltinDescription> = {
  forest: {
    en: "Spruce and pine as far as the eye goes. Somewhere in here is Tapio's realm.",
    fi: "Kuusta ja mäntyä silmänkantamattomiin. Jossain täällä on Tapion valtakunta.",
  },
  island: {
    en: "A wind-scoured island out on the open sea.",
    fi: "Tuulten piiskaama saari ulapalla.",
  },
  cave: {
    en: "Stone halls under the earth, where Vipunen sleeps.",
    fi: "Kivisalit maan alla, missä Vipunen nukkuu.",
  },
  building: {
    en: "Walls of hewn logs under a smoke-blackened roof.",
    fi: "Hirsiseinät savun mustaaman katon alla.",
  },
  village: {
    en: "Smoke from the saunas, and cows at the edge of the field.",
    fi: "Saunojen savua ja lehmiä pellon laidalla.",
  },
  birdhaven: {
    en: "Väinölä, the land of the old sage, where every traveller comes ashore. The old oak stands at its heart.",
    fi: "Väinölä, vanhan tietäjän maa, jonne jokainen kulkija nousee maihin. Vanha tammi seisoo sen sydämessä.",
  },
  home_island: {
    en: "Your own island in the sea, bare until you sow it.",
    fi: "Oma saaresi meressä, paljas kunnes kylvät sen.",
  },
  adventurers_guild: {
    en: "Väinölä's tupa, the long house where the village gathers. The wrestling ground is at its centre.",
    fi: "Väinölän tupa, pitkä talo, jossa kylä kokoontuu. Painikenttä on sen keskellä.",
  },
};
