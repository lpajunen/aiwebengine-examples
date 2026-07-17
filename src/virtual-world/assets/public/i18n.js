/// <reference path="virtual-world-browser-globals.d.ts" />

// ── Lightweight i18n for UI labels ─────────────────────────────────────
var I18N_MESSAGES = /** @type {Record<string, any>} */ ({
  en: {
    item: {
      saw: { name: "Woodsman's saw" },
      knife: { name: "Puukko knife" },
      flower: { name: "Forest flower" },
      tree_planter: { name: "Pine sapling" },
      portal_builder: { name: "Rune gate charm" },
      portal: { name: "Rune gate" },
      starter_kit: { name: "Wanderer's bundle" },
      kantele: { name: "Kantele" },
      rowan_charm: { name: "Rowan charm" },
      rune_stone: { name: "Rune stone" },
      juniper_bundle: { name: "Juniper bundle" },
      birch_bark_letter: { name: "Birch-bark letter" },
      blessing_marker: { name: "Rowan blessing" },
      unknown: { name: "Unknown item" },
    },
    tree_action: {
      plant: "Plant pine sapling",
      cut: "Use woodsman's saw",
      build_portal: "Raise rune gate",
      build_portal_forest: "Raise rune gate to forest world",
      build_portal_island: "Raise rune gate to island world",
      build_portal_cave: "Raise rune gate to cave world",
      build_portal_building: "Raise rune gate to house world",
      remove_portal: "Close rune gate",
      play_tune: "Play kantele tune",
      place_blessing: "Place rowan blessing",
      portal_travel: "Enter rune gate",
      return_home: "Travel to the old oak",
    },
    terrain: {
      wall: "Spruce thicket",
      house: "House wall",
      tree: "Pine tree",
      tree_planted: "Pine tree (planted)",
      old_oak: "Old oak",
      ocean: "Ocean",
      lake: "Lake",
      river: "River",
      rock: "Rock field",
      mountain: "Mountain",
      sand: "Sand",
      cave_floor: "Cave floor",
      wood_floor: "Wood floor",
      ground_tree_cut: "Forest floor (pine cut)",
      ground: "Forest floor",
    },
    inventory: {
      empty: "empty",
      left_hand: "Left Hand",
      right_hand: "Right Hand",
      backpack_empty: "Backpack empty",
      values: "Living values",
      items_suffix: "items",
    },
    living: {
      slot: {
        left_hand: "Left Hand",
        right_hand: "Right Hand",
      },
      value: {
        fatigue: "Fatigue",
        warmth: "Warmth",
      },
    },
  },
  fi: {
    item: {
      saw: { name: "Metsurin saha" },
      knife: { name: "Puukko" },
      flower: { name: "Metsakukka" },
      tree_planter: { name: "Männyn taimi" },
      portal_builder: { name: "Riimuportin amuletti" },
      portal: { name: "Riimuportti" },
      starter_kit: { name: "Kulkijan nyytti" },
      kantele: { name: "Kantele" },
      rowan_charm: { name: "Pihlajakoriste" },
      rune_stone: { name: "Riimukivi" },
      juniper_bundle: { name: "Katajanippu" },
      birch_bark_letter: { name: "Tuohikirje" },
      blessing_marker: { name: "Pihlajansiunaus" },
      unknown: { name: "Tuntematon esine" },
    },
    tree_action: {
      plant: "Istuta männyn taimi",
      cut: "Käytä metsurin sahaa",
      build_portal: "Nosta riimuportti",
      build_portal_forest: "Nosta riimuportti metsämaailmaan",
      build_portal_island: "Nosta riimuportti saareen",
      build_portal_cave: "Nosta riimuportti luolaan",
      build_portal_building: "Nosta riimuportti taloon",
      remove_portal: "Sulje riimuportti",
      play_tune: "Soita kanteleen sävel",
      place_blessing: "Aseta pihlajansiunaus",
      portal_travel: "Astu riimuporttiin",
      return_home: "Matkaa vanhalle tammelle",
    },
    terrain: {
      wall: "Kuusitiheikkö",
      house: "Talon seinä",
      tree: "Mänty",
      tree_planted: "Mänty (istutettu)",
      old_oak: "Vanha tammi",
      ocean: "Meri",
      lake: "Järvi",
      river: "Joki",
      rock: "Kivikko",
      mountain: "Vuori",
      sand: "Hiekka",
      cave_floor: "Luolan lattia",
      wood_floor: "Puutaso",
      ground_tree_cut: "Metsäpohja (mänty kaadettu)",
      ground: "Metsäpohja",
    },
    inventory: {
      empty: "tyhjä",
      left_hand: "Vasen käsi",
      right_hand: "Oikea käsi",
      backpack_empty: "Reppu on tyhjä",
      values: "Olennon arvot",
      items_suffix: "esinettä",
    },
    living: {
      slot: {
        left_hand: "Vasen käsi",
        right_hand: "Oikea käsi",
      },
      value: {
        fatigue: "Väsymys",
        warmth: "Lämpö",
      },
    },
  },
});

/** @type {string | null} */
var activeLocale = null;

/** @returns {string} */
function resolveLocale() {
  if (activeLocale) return activeLocale;
  var raw =
    (navigator.languages && navigator.languages.length > 0
      ? navigator.languages[0]
      : navigator.language) || "en";
  var normalized = String(raw).toLowerCase();
  if (I18N_MESSAGES[normalized]) {
    activeLocale = normalized;
    return activeLocale;
  }
  var base = normalized.split("-")[0];
  activeLocale = I18N_MESSAGES[base] ? base : "en";
  return activeLocale;
}

/**
 * @param {string} locale
 * @param {string} key
 * @returns {string | null}
 */
function getMessageByKey(locale, key) {
  var dict = I18N_MESSAGES[locale];
  if (!dict) return null;
  var parts = String(key || "").split(".");
  var cur = dict;
  for (var i = 0; i < parts.length; i++) {
    if (!cur || typeof cur !== "object" || !(parts[i] in cur)) return null;
    cur = cur[parts[i]];
  }
  return typeof cur === "string" ? cur : null;
}

/**
 * @param {string} key
 * @param {string} [fallback]
 * @returns {string}
 */
function t(key, fallback) {
  var locale = resolveLocale();
  var localized = getMessageByKey(locale, key);
  if (localized !== null) return localized;
  var english = getMessageByKey("en", key);
  if (english !== null) return english;
  return fallback || key;
}

/**
 * @param {string} type
 * @returns {string}
 */
function humanizeType(type) {
  return String(type || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, function (ch) {
      return ch.toUpperCase();
    });
}

/**
 * @param {string} type
 * @returns {string}
 */
function itemTypeToLabelKey(type) {
  if (type === "saw") return "item.saw.name";
  if (type === "hammer") return "item.hammer.name";
  if (type === "knife") return "item.knife.name";
  if (type === "flower") return "item.flower.name";
  if (type === "tree_planter") return "item.tree_planter.name";
  if (type === "portal_builder") return "item.portal_builder.name";
  if (type === "kantele") return "item.kantele.name";
  if (type === "rowan_charm") return "item.rowan_charm.name";
  if (type === "rune_stone") return "item.rune_stone.name";
  if (type === "juniper_bundle") return "item.juniper_bundle.name";
  if (type === "birch_bark_letter") return "item.birch_bark_letter.name";
  if (type === "blessing_marker") return "item.blessing_marker.name";
  if (type === "portal") return "item.portal.name";
  if (type === "starter_kit") return "item.starter_kit.name";
  return "item.unknown.name";
}
