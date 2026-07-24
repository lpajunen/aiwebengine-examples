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
      creator_stone: { name: "Creator's stone" },
      old_oak: { name: "Old oak" },
      npc_corpse: { name: "Corpse" },
      unknown: { name: "Unknown item" },
      value: {
        max_hit_points: "Max hit points",
        current_hit_points: "Hit points",
        armor_class: "Armor class",
        weapon_class: "Weapon class",
      },
    },
    tree_action: {
      plant: "Plant pine sapling",
      cut: "Use woodsman's saw",
      build_house: "Use hammer (build house)",
      destroy_house: "Use hammer (destroy house)",
      build_portal: "Raise rune gate",
      build_portal_forest: "Raise rune gate to forest world",
      build_portal_island: "Raise rune gate to island world",
      build_portal_cave: "Raise rune gate to cave world",
      build_portal_building: "Raise rune gate to house world",
      remove_portal: "Close rune gate",
      tune: "Tune kantele",
      play_tune: "Play kantele tune",
      place_blessing: "Place rowan blessing",
      portal_travel: "Enter rune gate",
      return_home: "Travel to the old oak",
      pray: "Pray",
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
      backpack_empty: "Backpack empty",
      items_suffix: "items",
      drop: "Drop",
      store: "Store",
    },
    stats: {
      empty: "No statistics.",
    },
    living: {
      class: {
        player_human: "Human",
        player_elf: "Elf",
        player_hobbit: "Hobbit",
        player_ghost: "Ghost",
        npc_human: "Human",
        npc_wolf: "Wolf",
        npc_bear: "Bear",
      },
      slot: {
        left_hand: "Left Hand",
        right_hand: "Right Hand",
        left_leg: "Left Leg",
        right_leg: "Right Leg",
        front_left_leg: "Front Left Leg",
        front_right_leg: "Front Right Leg",
        back_left_leg: "Back Left Leg",
        back_right_leg: "Back Right Leg",
      },
      value: {
        fatigue: "Fatigue",
        warmth: "Warmth",
        max_hit_points: "Max hit points",
        current_hit_points: "Hit points",
        armor_class: "Armor class",
        weapon_class: "Weapon class",
      },
    },
    hud: {
      title: "Virtual World",
      rename: "Rename",
      switch_language: "Switch language",
      save: "Save",
      cancel: "Cancel",
      world_label: "World:",
      position_label: "Position:",
      held_left: "L:",
      held_right: "R:",
      use: "Use",
      pick: "Pick",
      items: "Items",
      stats: "Stats",
      players: "Players",
      chat: "Chat",
      item_types: "Item types",
      action_types: "Action types",
      living_types: "Living types",
      world_types: "World types",
    },
    legend: {
      title: "Legend",
      forest_floor: "Forest Floor",
      spruce_thicket: "Spruce Thicket",
      pine_tree: "Pine Tree",
      water: "Water",
      rock_mountain: "Rock / Mountain",
      you: "You",
    },
    controls: {
      move_label: "Move:",
      or: "or",
      camera_label: "Camera:",
      to_orbit: "to orbit",
      to_zoom: "to zoom",
    },
    panel: {
      close: "Close",
      choose_action: "Choose Action",
      inventory: "Inventory",
      statistics: "Statistics",
      players_online: "Players Online",
      chat: "Chat",
      item_types: "Item Types",
      action_types: "Action Types",
      living_types: "Living Types",
      world_types: "World Types",
    },
    players: {
      name: "Name",
      world: "World",
      online_since: "Online since",
      last_active: "Last active",
      seconds_ago: "s ago",
      minutes_ago: "m ago",
      hours_ago: "h ago",
      days_ago: "d ago",
      no_players_online: "No players online",
      you_badge: "(you)",
      in_your_world: "In your world",
      dm_button: "DM",
    },
    chat: {
      world_tab: "World",
      dm_tab: "Direct Messages",
      no_conversations:
        "No conversations yet. Click 💬 DM next to a player to start one.",
      no_messages: "No messages yet.",
      say_something: "Say something…",
      send: "Send",
      back: "← Back",
      dm_placeholder: "Send a direct message…",
    },
    class_editor: {
      new_item_type: "New item type",
      new_action_type: "New action type",
      new_living_type: "New living type",
      new_world_type: "New world type",
      base_type_label: "Base type",
      rows_label: "Rows (8-200)",
      cols_label: "Cols (8-200)",
      id_label: "ID",
      label_label: "Label",
      kind_label: "Kind",
      target_kind_label: "Target kind",
      spawnable: "Spawnable",
      extra: "Extra",
      non_droppable: "Non-droppable",
      non_pickable: "Non-pickable",
      action_ids_label: "Action IDs (comma-sep)",
      state_template_label: "State template (JSON)",
      source_items_label: "Source items (comma-sep)",
      logic_spec_label: "Logic spec (JSON)",
      slot_definitions_label: "Slot definitions (JSON)",
      value_template_label: "Value template (JSON)",
      value_schema_label: "Value schema (JSON)",
      save: "Save",
      cancel: "Cancel",
      edit_button: "Edit",
      del_button: "Del",
      edit_prefix: "Edit:",
      failed_to_load_list: "Failed to load.",
      no_custom_item_types: "No custom item types yet.",
      no_custom_action_types: "No custom action types yet.",
      no_custom_living_types: "No custom living types yet.",
      no_world_types: "No world types yet.",
      item_not_found: "Item type not found",
      action_not_found: "Action type not found",
      living_not_found: "Living type not found",
      world_not_found: "World type not found",
      failed_to_load_item_type: "Failed to load item type",
      failed_to_load_action_type: "Failed to load action type",
      failed_to_load_living_type: "Failed to load living type",
      failed_to_load_world_type: "Failed to load world type",
      item_id_required: "Item type ID is required",
      action_id_required: "Action type ID is required",
      living_id_required: "Living type ID is required",
      world_id_required: "World type ID is required",
      invalid_state_template_json: "Invalid state template JSON",
      invalid_logic_spec_json: "Invalid logic spec JSON",
      invalid_slot_definitions_json: "Invalid slot definitions JSON",
      slot_definitions_must_be_array: "Slot definitions must be a JSON array",
      invalid_value_template_json: "Invalid value template JSON",
      invalid_value_schema_json: "Invalid value schema JSON",
      save_failed: "Save failed",
      saved: "Saved!",
      delete_failed: "Delete failed",
      deleted_prefix: "Deleted",
    },
    tile: {
      square: "Square",
      terrain_section: "Terrain",
      built_by: "Built by",
      items_section: "Items",
      leads_to: "Leads to",
      people_section: "People",
      you_label: "You",
      class_label: "Class:",
      npcs_section: "NPCs",
      bag_items: "Bag items:",
      none: "None",
    },
    nick: {
      redirecting_to_logout: "Redirecting to logout...",
      logout_hint: 'Triple click "You" to log out',
      changed_name_to: "Changed name to",
    },
    poke: {
      pokes_you: "pokes you.",
      you_poke_prefix: "You poke",
    },
    fight: {
      you_missed: "You missed",
      you_defeated: "You defeated",
      you_hit: "You hit",
      hits_you_for: "hits you for",
      something: "Something",
      you_died: "You have died and become a ghost.",
    },
    world_type: {
      island: "Island",
      cave: "Cave",
      building: "House",
      forest: "Forest",
      world_suffix: "world",
    },
    world: {
      flavor_text_0: "A low rune-song lingers between the spruce boughs.",
      flavor_text_1: "Rowan charms sway softly where the pine paths meet.",
      flavor_text_2:
        "The forest floor feels old here, as if someone just finished a quiet verse.",
      flavor_text_3:
        "Juniper smoke and birdsong drift through this hidden clearing.",
    },
    auth: {
      session_expired_redirecting: "Session expired. Redirecting to login...",
      session_expired_reconnecting: "Session expired, trying to reconnect...",
    },
    world_class: {
      forest: { name: "Forest" },
      island: { name: "Island" },
      cave: { name: "Cave" },
      building: { name: "Building" },
    },
    error: {
      editing_rights_required: "Editing rights required",
      missing_id: "Missing id",
      invalid_json_body: "Invalid JSON body",
      item_class_not_found: "Item class not found",
      action_class_not_found: "Action class not found",
      living_class_not_found: "Living class not found",
      item_class_upsert_failed: "Item class upsert failed",
      action_class_upsert_failed: "Action class upsert failed",
      living_class_upsert_failed: "Living class upsert failed",
      world_class_not_found: "World class not found",
      world_class_upsert_failed: "World class upsert failed",
      world_class_builtin: "Built-in world types cannot be deleted",
      no_world_found: "No world found",
      missing_required_ingredients: "Missing required ingredients",
      target_out_of_bounds: "Target out of bounds",
      crafting_removed:
        "Crafting has been replaced by actions — use the equivalent item action instead",
      invalid_action: "Invalid action",
      missing_required_item_for_action: "Missing required item for action",
      blessing_already_rests_here: "A blessing already rests here",
      action_not_allowed_here: "Action not allowed here",
      action_condition_not_met: "Action condition not met",
      nickname_empty: "Nickname cannot be empty",
      not_in_world: "Not in a world",
      message_empty: "Message cannot be empty",
      recipient_required: "Recipient required",
      cannot_dm_self: "Cannot DM yourself",
      with_param_required: "with param required",
      invalid_drop_source: "Invalid drop source",
      item_cannot_be_dropped: "Item cannot be dropped",
      no_item_to_equip: "No item to equip",
      item_cannot_be_equipped: "Item cannot be equipped to destination slot",
      invalid_destination_slot: "Invalid destination slot",
      unknown_action: "Unknown action",
      invalid_move_payload: "Invalid move payload",
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
      creator_stone: { name: "Luojan kivi" },
      old_oak: { name: "Vanha tammi" },
      npc_corpse: { name: "Ruumis" },
      unknown: { name: "Tuntematon esine" },
      value: {
        max_hit_points: "Suurin osumapisteet",
        current_hit_points: "Osumapisteet",
        armor_class: "Panssariluokka",
        weapon_class: "Aseluokka",
      },
    },
    tree_action: {
      plant: "Istuta männyn taimi",
      cut: "Käytä metsurin sahaa",
      build_house: "Käytä vasaraa (rakenna talo)",
      destroy_house: "Käytä vasaraa (pura talo)",
      build_portal: "Nosta riimuportti",
      build_portal_forest: "Nosta riimuportti metsämaailmaan",
      build_portal_island: "Nosta riimuportti saareen",
      build_portal_cave: "Nosta riimuportti luolaan",
      build_portal_building: "Nosta riimuportti taloon",
      remove_portal: "Sulje riimuportti",
      tune: "Viritä kantele",
      play_tune: "Soita kanteleen sävel",
      place_blessing: "Aseta pihlajansiunaus",
      portal_travel: "Astu riimuporttiin",
      return_home: "Matkaa vanhalle tammelle",
      pray: "Rukoile",
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
      backpack_empty: "Reppu on tyhjä",
      items_suffix: "esinettä",
      drop: "Pudota",
      store: "Säilytä",
    },
    stats: {
      empty: "Ei tilastoja.",
    },
    living: {
      class: {
        player_human: "Ihminen",
        player_elf: "Haltia",
        player_hobbit: "Hobitti",
        player_ghost: "Aave",
        npc_human: "Ihminen",
        npc_wolf: "Susi",
        npc_bear: "Karhu",
      },
      slot: {
        left_hand: "Vasen käsi",
        right_hand: "Oikea käsi",
        left_leg: "Vasen jalka",
        right_leg: "Oikea jalka",
        front_left_leg: "Etuvasen jalka",
        front_right_leg: "Etuoikea jalka",
        back_left_leg: "Takavasen jalka",
        back_right_leg: "Takaoikea jalka",
      },
      value: {
        fatigue: "Väsymys",
        warmth: "Lämpö",
        max_hit_points: "Suurin osumapisteet",
        current_hit_points: "Osumapisteet",
        armor_class: "Panssariluokka",
        weapon_class: "Aseluokka",
      },
    },
    hud: {
      title: "Virtuaalimaailma",
      rename: "Nimeä uudelleen",
      switch_language: "Vaihda kieltä",
      save: "Tallenna",
      cancel: "Peruuta",
      world_label: "Maailma:",
      position_label: "Sijainti:",
      held_left: "V:",
      held_right: "O:",
      use: "Käytä",
      pick: "Poimi",
      items: "Tavarat",
      stats: "Tilastot",
      players: "Pelaajat",
      chat: "Keskustelu",
      item_types: "Esinetyypit",
      action_types: "Toimintotyypit",
      living_types: "Olentotyypit",
      world_types: "Maailmatyypit",
    },
    legend: {
      title: "Selite",
      forest_floor: "Metsäpohja",
      spruce_thicket: "Kuusitiheikkö",
      pine_tree: "Mänty",
      water: "Vesi",
      rock_mountain: "Kivikko / Vuori",
      you: "Sinä",
    },
    controls: {
      move_label: "Liiku:",
      or: "tai",
      camera_label: "Kamera:",
      to_orbit: "kierrä",
      to_zoom: "zoomaa",
    },
    panel: {
      close: "Sulje",
      choose_action: "Valitse toiminto",
      inventory: "Reppu",
      statistics: "Tilastot",
      players_online: "Pelaajat verkossa",
      chat: "Keskustelu",
      item_types: "Esinetyypit",
      action_types: "Toimintotyypit",
      living_types: "Olentotyypit",
      world_types: "Maailmatyypit",
    },
    players: {
      name: "Nimi",
      world: "Maailma",
      online_since: "Kirjautunut",
      last_active: "Viimeksi aktiivinen",
      seconds_ago: " s sitten",
      minutes_ago: " min sitten",
      hours_ago: " t sitten",
      days_ago: " pv sitten",
      no_players_online: "Ei pelaajia verkossa",
      you_badge: "(sinä)",
      in_your_world: "Maailmassasi",
      dm_button: "Viesti",
    },
    chat: {
      world_tab: "Maailma",
      dm_tab: "Yksityisviestit",
      no_conversations:
        "Ei vielä keskusteluja. Aloita klikkaamalla 💬 Viesti pelaajan kohdalla.",
      no_messages: "Ei vielä viestejä.",
      say_something: "Sano jotain…",
      send: "Lähetä",
      back: "← Takaisin",
      dm_placeholder: "Lähetä yksityisviesti…",
    },
    class_editor: {
      new_item_type: "Uusi esinetyyppi",
      new_action_type: "Uusi toimintotyyppi",
      new_living_type: "Uusi olentotyyppi",
      new_world_type: "Uusi maailmatyyppi",
      base_type_label: "Perustyyppi",
      rows_label: "Rivit (8-200)",
      cols_label: "Sarakkeet (8-200)",
      id_label: "Tunniste",
      label_label: "Nimi",
      kind_label: "Laji",
      target_kind_label: "Kohteen tyyppi",
      spawnable: "Ilmestyy",
      extra: "Erikois",
      non_droppable: "Ei pudotettavissa",
      non_pickable: "Ei poimittavissa",
      action_ids_label: "Toimintotunnisteet (pilkulla erotettu)",
      state_template_label: "Tilamalli (JSON)",
      source_items_label: "Lähde-esineet (pilkulla erotettu)",
      logic_spec_label: "Logiikkamäärittely (JSON)",
      slot_definitions_label: "Paikkamäärittelyt (JSON)",
      value_template_label: "Arvomalli (JSON)",
      value_schema_label: "Arvokaavio (JSON)",
      save: "Tallenna",
      cancel: "Peruuta",
      edit_button: "Muokkaa",
      del_button: "Poista",
      edit_prefix: "Muokkaa:",
      failed_to_load_list: "Lataus epäonnistui.",
      no_custom_item_types: "Ei mukautettuja esinetyyppejä vielä.",
      no_custom_action_types: "Ei mukautettuja toimintotyyppejä vielä.",
      no_custom_living_types: "Ei mukautettuja olentotyyppejä vielä.",
      no_world_types: "Ei maailmatyyppejä vielä.",
      item_not_found: "Esinetyyppiä ei löytynyt",
      action_not_found: "Toimintotyyppiä ei löytynyt",
      living_not_found: "Olentotyyppiä ei löytynyt",
      world_not_found: "Maailmatyyppiä ei löytynyt",
      failed_to_load_item_type: "Esinetyypin lataus epäonnistui",
      failed_to_load_action_type: "Toimintotyypin lataus epäonnistui",
      failed_to_load_living_type: "Olentotyypin lataus epäonnistui",
      failed_to_load_world_type: "Maailmatyypin lataus epäonnistui",
      item_id_required: "Esinetyypin tunniste vaaditaan",
      action_id_required: "Toimintotyypin tunniste vaaditaan",
      living_id_required: "Olentotyypin tunniste vaaditaan",
      world_id_required: "Maailmatyypin tunniste vaaditaan",
      invalid_state_template_json: "Virheellinen tilamallin JSON",
      invalid_logic_spec_json: "Virheellinen logiikkamäärittelyn JSON",
      invalid_slot_definitions_json: "Virheellinen paikkamäärittelyjen JSON",
      slot_definitions_must_be_array:
        "Paikkamäärittelyjen tulee olla JSON-taulukko",
      invalid_value_template_json: "Virheellinen arvomallin JSON",
      invalid_value_schema_json: "Virheellinen arvokaavion JSON",
      save_failed: "Tallennus epäonnistui",
      saved: "Tallennettu!",
      delete_failed: "Poisto epäonnistui",
      deleted_prefix: "Poistettu",
    },
    tile: {
      square: "Ruutu",
      terrain_section: "Maasto",
      built_by: "Rakentanut",
      items_section: "Esineet",
      leads_to: "Vie kohteeseen",
      people_section: "Ihmiset",
      you_label: "Sinä",
      class_label: "Laji:",
      npcs_section: "NPC:t",
      bag_items: "Reppuesineitä:",
      none: "Ei mitään",
    },
    nick: {
      redirecting_to_logout: "Ohjataan uloskirjautumiseen...",
      logout_hint: 'Kirjaudu ulos klikkaamalla "Sinä" kolmesti',
      changed_name_to: "Nimi vaihdettu:",
    },
    poke: {
      pokes_you: "tökkää sinua.",
      you_poke_prefix: "Tökkäät",
    },
    fight: {
      you_missed: "Osuit huti",
      you_defeated: "Voitit vastustajan",
      you_hit: "Osuit vastustajaan",
      hits_you_for: "osuu sinuun",
      something: "Joku",
      you_died: "Olet kuollut ja muuttunut aaveeksi.",
    },
    world_type: {
      island: "Saari",
      cave: "Luola",
      building: "Talo",
      forest: "Metsä",
      world_suffix: "maailma",
    },
    world: {
      flavor_text_0: "Hiljainen riimulaulu leijuu kuusten oksien lomassa.",
      flavor_text_1:
        "Pihlajan suoja-amuletit huojuvat hiljaa siellä, missä männikköpolut kohtaavat.",
      flavor_text_2:
        "Metsän pohja tuntuu täällä vanhalta, ikään kuin joku olisi juuri lausunut hiljaisen säkeen.",
      flavor_text_3:
        "Katajan savu ja lintujen laulu leijuvat tässä piilotetussa aukiossa.",
    },
    auth: {
      session_expired_redirecting:
        "Istunto vanhentui. Ohjataan kirjautumissivulle...",
      session_expired_reconnecting:
        "Istunto vanhentui, yritetään yhdistää uudelleen...",
    },
    world_class: {
      forest: { name: "Metsä" },
      island: { name: "Saari" },
      cave: { name: "Luola" },
      building: { name: "Rakennus" },
    },
    error: {
      editing_rights_required: "Muokkausoikeudet vaaditaan",
      missing_id: "Tunniste puuttuu",
      invalid_json_body: "Virheellinen JSON-pyyntö",
      item_class_not_found: "Esinetyyppiä ei löytynyt",
      action_class_not_found: "Toimintotyyppiä ei löytynyt",
      living_class_not_found: "Olentotyyppiä ei löytynyt",
      item_class_upsert_failed: "Esinetyypin tallennus epäonnistui",
      action_class_upsert_failed: "Toimintotyypin tallennus epäonnistui",
      living_class_upsert_failed: "Olentotyypin tallennus epäonnistui",
      world_class_not_found: "Maailmatyyppiä ei löytynyt",
      world_class_upsert_failed: "Maailmatyypin tallennus epäonnistui",
      world_class_builtin: "Sisäänrakennettuja maailmatyyppejä ei voi poistaa",
      no_world_found: "Maailmaa ei löytynyt",
      missing_required_ingredients: "Tarvittavat ainekset puuttuvat",
      target_out_of_bounds: "Kohde on alueen ulkopuolella",
      crafting_removed:
        "Valmistus on korvattu toiminnoilla — käytä vastaavaa esinetoimintoa",
      invalid_action: "Virheellinen toiminto",
      missing_required_item_for_action: "Toimintoon vaadittava esine puuttuu",
      blessing_already_rests_here: "Siunaus lepää jo täällä",
      action_not_allowed_here: "Toiminto ei ole sallittu täällä",
      action_condition_not_met: "Toiminnon ehto ei täyty",
      nickname_empty: "Nimimerkki ei voi olla tyhjä",
      not_in_world: "Et ole maailmassa",
      message_empty: "Viesti ei voi olla tyhjä",
      recipient_required: "Vastaanottaja vaaditaan",
      cannot_dm_self: "Et voi lähettää viestiä itsellesi",
      with_param_required: "with-parametri vaaditaan",
      invalid_drop_source: "Virheellinen pudotuslähde",
      item_cannot_be_dropped: "Esinettä ei voi pudottaa",
      no_item_to_equip: "Ei varustettavaa esinettä",
      item_cannot_be_equipped: "Esinettä ei voi varustaa kohdepaikkaan",
      invalid_destination_slot: "Virheellinen kohdepaikka",
      unknown_action: "Tuntematon toiminto",
      invalid_move_payload: "Virheellinen siirtopyyntö",
    },
  },
});

var VW_LOCALE_STORAGE_KEY = "vw_locale";

/** @type {string | null} */
var activeLocale = null;

/** @returns {string} */
function resolveLocale() {
  if (activeLocale) return activeLocale;
  var stored = null;
  try {
    stored = window.localStorage.getItem(VW_LOCALE_STORAGE_KEY);
  } catch (e) {
    stored = null;
  }
  if (stored && I18N_MESSAGES[stored]) {
    activeLocale = stored;
    return activeLocale;
  }
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
 */
function setLocale(locale) {
  if (!I18N_MESSAGES[locale]) return;
  activeLocale = locale;
  try {
    window.localStorage.setItem(VW_LOCALE_STORAGE_KEY, locale);
  } catch (e) {
    // localStorage may be unavailable (private browsing, etc.) - locale
    // still applies for the current page load via activeLocale.
  }
}

/** @returns {string} */
function getOtherLocale() {
  var current = resolveLocale();
  var locales = Object.keys(I18N_MESSAGES);
  for (var i = 0; i < locales.length; i++) {
    if (locales[i] !== current) return locales[i];
  }
  return current;
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

function applyStaticTranslations() {
  var textEls = document.querySelectorAll("[data-i18n-key]");
  for (var i = 0; i < textEls.length; i++) {
    var el = textEls[i];
    var key = el.getAttribute("data-i18n-key");
    if (key) el.textContent = t(key, el.textContent || "");
  }
  var placeholderEls = document.querySelectorAll("[data-i18n-placeholder]");
  for (var j = 0; j < placeholderEls.length; j++) {
    var pEl = placeholderEls[j];
    var pKey = pEl.getAttribute("data-i18n-placeholder");
    if (pKey && pEl instanceof HTMLInputElement) {
      pEl.placeholder = t(pKey, pEl.placeholder || "");
    }
  }
  var titleEls = document.querySelectorAll("[data-i18n-title]");
  for (var k = 0; k < titleEls.length; k++) {
    var tEl = titleEls[k];
    var tKey = tEl.getAttribute("data-i18n-title");
    if (tKey)
      tEl.setAttribute("title", t(tKey, tEl.getAttribute("title") || ""));
  }
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
 * @param {string} msg
 * @returns {string}
 */
function translateServerMessage(msg) {
  var raw = String(msg || "");
  if (raw.indexOf("error.") !== 0) return raw;
  var colonIdx = raw.indexOf(": ");
  var key = colonIdx === -1 ? raw : raw.slice(0, colonIdx);
  var suffix = colonIdx === -1 ? "" : raw.slice(colonIdx);
  var lastPart = key.split(".").pop() || key;
  return t(key, humanizeType(lastPart)) + suffix;
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
  if (type === "creator_stone") return "item.creator_stone.name";
  if (type === "old_oak") return "item.old_oak.name";
  return "item.unknown.name";
}
