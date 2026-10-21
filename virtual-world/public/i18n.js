/// <reference path="virtual-world-browser-globals.d.ts" />

// ── Lightweight i18n for UI labels ─────────────────────────────────────
var I18N_MESSAGES = /** @type {Record<string, any>} */ ({
  en: {
    item: {
      sotka_nest: { name: "Sotka's nest" },
      seed_pouch: { name: "Sampsa's seed pouch" },
      stone: { name: "Stone" },
      branch: { name: "Branch" },
      stone_axe: { name: "Stone axe" },
      pike_jawbone: { name: "Pike's jawbone" },
      log: { name: "Log" },
      boat: { name: "Boat" },
      saw: { name: "Woodsman's saw" },
      knife: { name: "Knife" },
      sword: { name: "Sword" },
      shortbow: { name: "Shortbow" },
      longbow: { name: "Longbow" },
      hammer: { name: "Hammer" },
      flower: { name: "Forest flower" },
      tree_planter: { name: "Pine sapling" },
      portal_builder: { name: "Rune gate charm" },
      portal: { name: "Rune gate" },
      door: { name: "Door" },
      spellbook: { name: "Spellbook" },
      shaman_talisman: { name: "Shaman's talisman" },
      starter_kit: { name: "Wanderer's bundle" },
      kantele: { name: "Kantele" },
      rowan_charm: { name: "Rowan charm" },
      rune_stone: { name: "Rune stone" },
      juniper_bundle: { name: "Juniper bundle" },
      birch_bark_letter: { name: "Birch-bark letter" },
      blessing_marker: { name: "Rowan blessing" },
      creator_stone: { name: "Creator's stone" },
      old_oak: { name: "Old oak" },
      training_dummy: { name: "Training post" },
      npc_corpse: { name: "Corpse" },
      chest: { name: "Wooden chest" },
      unknown: { name: "Unknown item" },
      value: {
        max_hit_points: "Max hit points",
        current_hit_points: "Hit points",
        armor_class: "Armor class",
        weapon_class: "Weapon class",
        weapon_range: "Weapon range",
      },
      kind: {
        tool: "Tool",
        artifact: "Artifact",
        world_item: "Part of the world",
        placeable: "Placeable",
        consumable: "Consumable",
        container: "Container",
      },
    },
    examine: {
      title: "Examined",
      item_section: "Item",
      properties_section: "Properties",
      kind_label: "Kind:",
      size_label: "Size:",
      contents_label: "Contents:",
      no_properties: "Nothing else stands out.",
      on_ground: "On the ground",
      on_ground_at: "On the ground at ({col}, {row})",
      in_bag: "Carried in your bag",
      equipped: "Equipped in {slot}",
      choose_carried: "Choose a carried item",
    },
    tree_action: {
      sow_tree: "Sow a tree",
      sow_tree_start_toast: "You sow the seed. Something stirs in the sand.",
      sow_tree_toast: "A pine has grown where you sowed.",
      craft_stone_axe_start_toast: "You bind the stone to the branch.",
      craft_stone_axe_toast: "You have a stone axe.",
      fell_tree: "Fell the tree",
      fell_tree_start_toast: "You swing the axe.",
      fell_tree_toast: "The tree falls, and you take its trunk.",
      craft_boat_start_toast: "You start hollowing out the trunk.",
      craft_boat_toast: "Your boat is ready.",
      row_to_vainola: "Row to Väinölä",
      row_home: "Row home",
      row_to_island: "Row to a friend's island",
      fish: "Fish",
      fish_start_toast: "You cast a line into the water.",
      fish_toast: "A great pike! Its jawbone is yours.",
      welcome_newcomer: "Welcome",
      welcome_newcomer_toast: "You welcome {target} to Väinölä.",
      skip_onboarding: "I know the way — give me a boat",
      skip_onboarding_toast: "You find a boat and an axe beside the nest.",
      plant: "Plant pine sapling",
      cut: "Use woodsman's saw",
      build_house: "Use hammer (build house)",
      destroy_house: "Use hammer (destroy house)",
      build_door: "Hang a door",
      remove_door: "Take down door",
      open_door: "Open door",
      close_door: "Close door",
      open_door_toast: "The door swings open.",
      close_door_toast: "You pull the door shut.",
      tune_toast: "The kantele strings ring clear and ready.",
      play_tune_toast: "A kantele tune carries across the clearing.",
      place_blessing_toast: "A rowan blessing now marks this place.",
      summon_knife_toast: "A knife appears in your bag.",
      summon_weapons_toast:
        "A sword, a shortbow and a longbow appear in your bag.",
      craft_kantele_start_toast: "You start crafting a Kantele.",
      craft_kantele_toast: "You finished crafting a Kantele.",
      pray_revived_toast: "You feel alive again!",
      choose_class_tietaja: "Become a sage",
      choose_class_seppa: "Become a smith",
      choose_class_laulaja: "Become a singer",
      choose_class_erankavija: "Become a woodsman",
      choose_class_urho: "Become a hero",
      class_chosen: {
        tietaja: "You are now a sage: lore and spells are yours.",
        seppa: "You are now a smith: iron and building are yours.",
        laulaja: "You are now a singer: song and the animals are yours.",
        erankavija: "You are now a woodsman: the bow and the wilds are yours.",
        urho: "You are now a hero: the fight and the shield are yours.",
      },
      pray_toast: "You pray hard!",
      advance_level_toast: "You advance to level {level}!",
      examine_toast: "You examine {target}.",
      attack_miss_toast: "You missed.",
      attack_destroy_toast: "You hit. You destroyed {target}.",
      attack_hit_toast: "You hit.",
      fix_full_toast: "{target} is already at full health.",
      fix_toast: "You fix {target}.",
      bury_toast: "You bury the corpse.",
      poke_toast: "You poke {target}.",
      approaching_toast: "You move toward the target.",
      follow_toast: "You start following {target}.",
      stop_follow_toast: "You stop following.",
      fight_toast: "You start fighting {target}.",
      stop_fight_toast: "You stop fighting.",
      firebolt: "Firebolt",
      firebolt_hit_toast: "Your firebolt scorches {target}.",
      firebolt_miss_toast: "Your firebolt fizzles past {target}.",
      firebolt_kill_toast: "Your firebolt burns {target} to ash!",
      fireball: "Fireball",
      fireball_toast: "Your fireball erupts — {struck} struck, {kills} slain.",
      fireball_miss_toast: "Your fireball scorches empty ground.",
      heal: "Heal",
      heal_toast: "You heal {target}.",
      harm: "Harm",
      harm_toast: "Your harm spell wounds {target}.",
      harm_kill_toast: "Your harm spell destroys {target}.",
      cancel_approach: "Stop moving",
      cancel_approach_toast: "You stop moving toward the target.",
      door_travel: "Enter door",
      build_portal: "Raise rune gate",
      remove_portal: "Close rune gate",
      tune: "Tune kantele",
      play_tune: "Play kantele tune",
      place_blessing: "Place rowan blessing",
      portal_travel: "Enter rune gate",
      return_home: "Travel to the old oak",
      pray: "Pray",
      advance_level: "Advance level",
      stop_follow: "Stop following",
      stop_fight: "Stop fighting",
      summon_knife: "Summon knife",
      summon_weapons: "Summon weapons",
      examine: "Examine",
      break: "Break",
      fix: "Fix",
      bury: "Bury",
      pick_item: "Pick up",
      pick_item_toast: "You pick up the item.",
      poke: "Poke",
      follow: "Follow",
      fight: "Fight",
    },
    recipe: {
      craft_stone_axe: "Make a stone axe",
      craft_boat: "Carve a boat",
      craft_kantele: "Craft kantele",
      grow_pine_tree: "Grow pine tree",
    },
    terrain: {
      heather: "Heather",
      wall: "Spruce thicket",
      house: "House wall",
      tree: "Pine tree",
      tree_planted: "Pine tree (planted)",
      ocean: "Ocean",
      lake: "Lake",
      river: "River",
      rock: "Rock field",
      mountain: "Mountain",
      sand: "Sand",
      cave_floor: "Cave floor",
      wood_floor: "Wood floor",
      bridge: "Bridge",
      ground_tree_cut: "Forest floor (pine cut)",
      ground: "Forest floor",
    },
    inventory: {
      empty: "empty",
      backpack_empty: "Backpack empty",
      items_suffix: "items",
      drop: "Drop",
      store: "Store",
      open: "Open",
      take: "Take",
      put_in_chest: "Put in chest",
    },
    stats: {
      empty: "No statistics.",
    },
    // Class sizes (item + living), see class-size.ts.
    size: {
      tiny: "Tiny",
      small: "Small",
      medium: "Medium",
      large: "Large",
      huge: "Huge",
    },
    // Living visual styles (avatar mesh recipes), see class-visual.ts.
    visual_style: {
      humanoid: "Humanoid (two legs)",
      wolfish: "Wolfish (lean four legs)",
      bearish: "Bearish (bulky four legs)",
      doggish: "Doggish (small four legs)",
      birdlike: "Birdlike (two-legged bird)",
      equine: "Equine (horse-like)",
    },
    // Item mesh recipes, see class-visual.ts.
    item_style: {
      block: "Block (cube)",
      blade: "Blade (knife, sword)",
      bow: "Bow",
      chest: "Chest",
      door: "Door",
      staff: "Staff (hammer, tool)",
      orb: "Orb (charm, stone)",
      plant: "Plant (flower, sapling)",
      scroll: "Scroll",
      book: "Book",
    },
    living: {
      class: {
        player_human: "Newcomer",
        player_tietaja: "Sage",
        player_seppa: "Smith",
        player_laulaja: "Singer",
        player_erankavija: "Woodsman",
        player_urho: "Hero",
        npc_elder: "Elder",
        player_elf: "Elf",
        player_hobbit: "Hobbit",
        player_ghost: "Ghost",
        player_giant: "Giant",
        npc_human: "Human",
        npc_giant: "Giant",
        npc_archer: "Archer",
        npc_wolf: "Wolf",
        npc_bear: "Bear",
        npc_dog: "Dog",
        npc_horse: "Horse",
        npc_donkey: "Donkey",
        npc_chicken: "Chicken",
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
        voima: "Strength (Voima)",
        ketteryys: "Dexterity (Ketteryys)",
        kestavyys: "Constitution (Kestävyys)",
        tieto: "Lore (Tieto)",
        sana: "Presence (Sana)",
        puutyo: "Woodcraft (Puutyö)",
        takominen: "Smithing (Takominen)",
        metsastys: "Hunting (Metsästys)",
        synnyt: "Origins (Synnyt)",
        soitto: "Playing (Soitto)",
        lahitaistelu: "Melee (Lähitaistelu)",
        jousi: "Archery (Jousi)",
        parannus: "Healing (Parannus)",
        level: "Level",
        experience: "Experience",
        total_experience: "Total experience",
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
      world_info: "World info",
      stats_label: "Stats:",
      level_abbr: "Lvl:",
      hp_abbr: "HP:",
      ac_abbr: "AC:",
      wc_abbr: "WC:",
      fatigue_abbr: "F:",
      xp_abbr: "XP:",
      use: "Actions",
      pick: "Pick",
      items: "Items",
      stats: "Stats",
      players: "Players",
      chat: "Chat",
      item_types: "Item types",
      action_types: "Action types",
      living_types: "Living types",
      world_types: "World types",
      tile_types: "Tile types",
      following_prefix: "Following",
      fighting_prefix: "Fighting",
      approaching_prefix: "Approaching",
      stop_action: "Stop",
      aim_hint: "tap a tile to cast",
      aim_hint_target: "tap a highlighted target",
      aim_hint_target_or_bag: "tap a target, or pick from your bag",
      aim_bag: "Bag",
    },
    action_category: {
      combat: "Combat",
      magic: "Magic",
      build: "Build",
      craft: "Craft",
      gather: "Gather",
      travel: "Travel",
      misc: "Other",
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
      world_info: "World Info",
      inventory: "Inventory",
      container: "Container",
      statistics: "Statistics",
      players_online: "Players Online",
      chat: "Chat",
      item_types: "Item Types",
      action_types: "Action Types",
      living_types: "Living Types",
      world_types: "World Types",
      tile_types: "Tile Types",
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
      invite_button: "Invite",
      revoke_button: "Uninvite",
      send_home_button: "Send away",
    },
    chat: {
      arrived_in_vainola: "rowed ashore at Väinölä for the first time.",
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
      label_label: "Name (English)",
      name_fi_label: "Name (Finnish)",
      kind_label: "Kind",
      size_label: "Size",
      visual_style_label: "Visual style",
      color_label: "Color (blank = automatic)",
      color_pick: "Pick a color",
      color_auto: "Auto",
      target_kind_label: "Target kind",
      non_droppable: "Non-droppable",
      non_pickable: "Non-pickable",
      action_ids_label: "Action IDs (comma-sep)",
      state_template_label: "State template (JSON)",
      source_items_label: "Source items (comma-sep)",
      logic_spec_label: "Logic spec (JSON)",
      living_effect_label: "Living effect (JSON)",
      execution_label: "Execution (JSON)",
      behavior_label:
        "Behaviour (JSON: idleChance, pickUpChance, dropChance, forageChance, roamRadius, movement)",
      dialogue_label: "Dialogue (JSON: what it says when talked to)",
      cost_label: "Cost (JSON)",
      produces_label: "Produces (JSON)",
      experience_label: "Experience (JSON)",
      messages_label: "Messages (JSON, per locale)",
      slot_definitions_label: "Slot definitions (JSON)",
      value_template_label: "Value template (JSON)",
      value_schema_label: "Value schema (JSON)",
      aggressive: "Aggressive (NPC auto-attacks players on its tile)",
      default_items_label:
        "Default items (comma-separated types; weapons are auto-wielded)",
      death_class_label:
        "Death class (becomes this when killed; blank = despawn)",
      corpse_item_label: "Corpse item (left on the death tile; blank = none)",
      revive_class_label:
        "Revive class (what praying restores; blank = cannot revive)",
      combatant: "Combatant (may fight and be fought)",
      item_spawns_label: "Item spawns (JSON)",
      npc_spawns_label: "NPC spawns (JSON)",
      placements_label: "Placements",
      add_placement: "Add placement",
      reservation: "reserve area",
      preview_hint:
        "Placements and reserved areas, drawn to the configured dimensions.",
      reconcile: "Apply to world",
      reconciled: "Reconciled",
      reconcile_failed: "Reconcile failed",
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
      no_tile_types: "No tile types yet.",
      generation_label: "Generation (JSON; blank = the base type's preset)",
      invalid_generation_json: "Invalid generation JSON",
      new_tile_type: "New tile type",
      tile_not_found: "Tile type not found",
      failed_to_load_tile_type: "Failed to load tile type",
      invalid_tile_visual_json: "Invalid visual JSON",
      tile_value_label: "Map value (blank = next free; must be unique)",
      tile_walkable: "Walkable (livings can stand on it)",
      tile_walkable_short: "walkable",
      tile_blocking_short: "blocks",
      tile_layer_label: "World-mod layer",
      tile_visual_label: "Visual (JSON; blank = drawn by its own pass)",
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
      invalid_living_effect_json: "Invalid living effect JSON",
      invalid_execution_json: "Invalid execution JSON",
      invalid_behavior_json: "Invalid behaviour JSON",
      invalid_dialogue_json: "Invalid dialogue JSON",
      invalid_field_json: "Invalid JSON in",
      claimed_ownership:
        "Saved. This built-in type is yours now — deploys will no longer change it.",
      invalid_slot_definitions_json: "Invalid slot definitions JSON",
      slot_definitions_must_be_array: "Slot definitions must be a JSON array",
      invalid_value_template_json: "Invalid value template JSON",
      invalid_value_schema_json: "Invalid value schema JSON",
      invalid_item_spawns_json: "Invalid item spawns JSON",
      invalid_npc_spawns_json: "Invalid NPC spawns JSON",
      invalid_placements_json: "Invalid placements JSON",
      save_failed: "Save failed",
      saved: "Saved!",
      delete_failed: "Delete failed",
      deleted_prefix: "Deleted",
    },
    tile: {
      square: "Square",
      choose_target: "Choose target",
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
      talk: "Talk",
    },
    nick: {
      redirecting_to_logout: "Redirecting to logout...",
      logout_hint: 'Triple click "You" to log out',
      changed_name_to: "Changed name to",
    },
    poke: {
      pokes_you: "pokes you.",
    },
    fight: {
      you_missed: "You missed",
      you_defeated: "You defeated",
      you_hit: "You hit",
      hits_you_for: "hits you for",
      something: "Something",
      you_died: "You have died and become a ghost.",
      gained_xp: "gained",
      xp_suffix: "XP",
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
      traveling: "Traveling…",
    },
    auth: {
      session_expired_redirecting: "Session expired. Redirecting to login...",
      session_expired_reconnecting: "Session expired, trying to reconnect...",
    },
    world_class: {
      home_island: { name: "Home island" },
      forest: { name: "Forest" },
      island: { name: "Island" },
      cave: { name: "Cave" },
      building: { name: "Building" },
      village: { name: "Village" },
      birdhaven: { name: "Väinölä" },
      adventurers_guild: { name: "Adventurers' guild" },
    },
    onboarding: {
      step: {
        pouch: "Pick up the seed pouch on the sand.",
        sow: "Face open sand and sow a tree with the seed pouch.",
        axe: "Make a stone axe from the stone and the branch.",
        fell: "Fell your tree with the stone axe.",
        carve: "Carve a boat from the trunk.",
        row: "Row to Väinölä, where everyone else is.",
      },
      skip: "Know the game already? The sotka's nest will give you a boat.",
    },
    welcome: {
      welcomed_you: "{nick} welcomes you to Väinölä!",
    },
    dialogue: {
      elder: {
        newcomer:
          "You have come across the water. Every one of us here is something — who are you?",
        choose: {
          tietaja: "A sage, who knows how things came to be.",
          seppa: "A smith, who forges and builds.",
          laulaja: "A singer, whose songs the animals heed.",
          erankavija: "A woodsman, at home in the wilds with a bow.",
          urho: "A hero, who stands in front when it comes to a fight.",
        },
        chosen: "Go, then, and grow this land. It is yours as much as mine.",
      },
    },
    island: {
      invited_you: "{nick} invites you to their island.",
      invite_row: "{nick} invites you to their island · {min} min left",
      row_there: "Row there",
      invite_sent: "{nick} may row to your island for the next 15 minutes.",
      invite_revoked: "Invite withdrawn.",
      guest_sent_home: "Your guest was rowed back to Väinölä.",
      visit_ended: {
        host_left: "{nick} left their island, and you rowed back to Väinölä.",
        sent_home: "{nick} sent you back to Väinölä.",
        revoked: "{nick} withdrew the invite, and you rowed back to Väinölä.",
      },
    },
    error: {
      sow_only_on_home_island: "The seed only takes on your home island.",
      finish_island_first:
        "Make your boat first: it is the way off your island.",
      already_in_vainola: "You are already in Väinölä.",
      already_home: "You are already home.",
      onboarding_already_done: "The nest has nothing more to give you.",
      not_your_island: "That is someone else's island.",
      not_as_a_guest: "A guest cannot do that on someone else's island.",
      fish_needs_water: "Face open water to fish.",
      class_already_chosen: "You have already chosen what you are.",
      skill_too_low: "You are not skilled enough for that yet.",
      ask_the_elder: "Ask the elder in Väinölä.",
      not_a_newcomer: "They are not new here any more.",
      already_welcomed: "You have already welcomed them.",
      no_island_invite: "Nobody has invited you to their island.",
      host_not_on_island: "Your host is not on their island just now.",
      already_on_that_island: "You are already on that island.",
      invite_whom: "Choose someone else to invite.",
      unknown_player: "There is no such player.",
      invite_from_your_island:
        "You can invite people only from your own island.",
      not_your_guest: "They are not a guest on your island.",
      editing_rights_required: "Editing rights required",
      not_class_owner: "You do not have edit rights for this item",
      missing_id: "Missing id",
      invalid_json_body: "Invalid JSON body",
      invalid_placements: "Invalid placements",
      missing_world_id: "World id is required",
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
      approach_target_gone: "The target is no longer there",
      could_not_reach_target: "You could not reach the target",
      target_item_not_pickable: "That item cannot be picked up",
      target_out_of_range: "That is out of range",
      blessing_already_rests_here: "A blessing already rests here",
      door_closed: "The door is closed",
      door_already_open: "The door is already open",
      door_already_closed: "The door is already closed",
      no_door_here: "No door here",
      door_needs_wall: "A door must be hung on a house wall",
      door_already_hangs: "A door already hangs here",
      no_door_to_remove: "No door to take down",
      cannot_plant_here: "Cannot plant here",
      tree_already_exists: "Tree already exists",
      area_is_protected: "This area is protected",
      landmark_stands_firm: "It stands firm",
      no_tree_to_cut: "No tree to cut",
      tree_already_cut: "Tree already cut",
      old_oak_stands_firm: "The old oak stands firm",
      cannot_build_house_here: "Cannot build house here",
      house_already_exists: "House already exists",
      no_house_to_destroy: "No house to destroy",
      cannot_build_portal_here: "Cannot build portal here",
      portal_already_exists: "Portal already exists",
      no_portal_to_remove: "No portal to remove",
      kantele_needs_tuning: "The kantele needs tuning first",
      action_not_allowed_here: "Action not allowed here",
      action_condition_not_met: "Action condition not met",
      not_enough_experience: "Not enough experience to advance",
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
      container_not_found: "Container not found",
      not_a_container: "That item is not a container",
      no_item_to_put: "No item to put in the container",
      container_cannot_nest: "A container cannot hold another container",
      item_cannot_be_stored: "This item cannot be stored",
      container_full: "The container is full",
      invalid_container_item: "Invalid container item",
    },
  },
  fi: {
    item: {
      sotka_nest: { name: "Sotkan pesä" },
      seed_pouch: { name: "Sampsan siemenpussi" },
      stone: { name: "Kivi" },
      branch: { name: "Oksa" },
      stone_axe: { name: "Kivikirves" },
      pike_jawbone: { name: "Hauen leukaluu" },
      log: { name: "Puunrunko" },
      boat: { name: "Vene" },
      saw: { name: "Metsurin saha" },
      knife: { name: "Puukko" },
      sword: { name: "Miekka" },
      shortbow: { name: "Lyhytjousi" },
      longbow: { name: "Pitkäjousi" },
      hammer: { name: "Vasara" },
      flower: { name: "Metsakukka" },
      tree_planter: { name: "Männyn taimi" },
      portal_builder: { name: "Riimuportin amuletti" },
      portal: { name: "Riimuportti" },
      door: { name: "Ovi" },
      spellbook: { name: "Loitsukirja" },
      shaman_talisman: { name: "Shamaanin talismaani" },
      starter_kit: { name: "Kulkijan nyytti" },
      kantele: { name: "Kantele" },
      rowan_charm: { name: "Pihlajakoriste" },
      rune_stone: { name: "Riimukivi" },
      juniper_bundle: { name: "Katajanippu" },
      birch_bark_letter: { name: "Tuohikirje" },
      blessing_marker: { name: "Pihlajansiunaus" },
      creator_stone: { name: "Luojan kivi" },
      old_oak: { name: "Vanha tammi" },
      training_dummy: { name: "Harjoituspaalu" },
      npc_corpse: { name: "Ruumis" },
      chest: { name: "Puuarkku" },
      unknown: { name: "Tuntematon esine" },
      value: {
        max_hit_points: "Suurin osumapisteet",
        current_hit_points: "Osumapisteet",
        armor_class: "Panssariluokka",
        weapon_class: "Aseluokka",
        weapon_range: "Aseen kantama",
      },
      kind: {
        tool: "Työkalu",
        artifact: "Artefakti",
        world_item: "Osa maailmaa",
        placeable: "Aseteltava",
        consumable: "Kulutettava",
        container: "Säiliö",
      },
    },
    examine: {
      title: "Tutkittu",
      item_section: "Esine",
      properties_section: "Ominaisuudet",
      kind_label: "Laji:",
      size_label: "Koko:",
      contents_label: "Sisältö:",
      no_properties: "Muuta erikoista ei ole.",
      on_ground: "Maassa",
      on_ground_at: "Maassa kohdassa ({col}, {row})",
      in_bag: "Mukanasi repussa",
      equipped: "Varusteena: {slot}",
      choose_carried: "Valitse mukana oleva esine",
    },
    tree_action: {
      sow_tree: "Kylvä puu",
      sow_tree_start_toast: "Kylvät siemenen. Hiekassa jokin liikahtaa.",
      sow_tree_toast: "Kylvämääsi kohtaan on kasvanut mänty.",
      craft_stone_axe_start_toast: "Sidot kiven oksaan.",
      craft_stone_axe_toast: "Sinulla on kivikirves.",
      fell_tree: "Kaada puu",
      fell_tree_start_toast: "Heilautat kirvestä.",
      fell_tree_toast: "Puu kaatuu, ja otat sen rungon.",
      craft_boat_start_toast: "Alat kovertaa runkoa veneeksi.",
      craft_boat_toast: "Veneesi on valmis.",
      row_to_vainola: "Souda Väinölään",
      row_home: "Souda kotiin",
      row_to_island: "Souda ystävän saarelle",
      fish: "Kalasta",
      fish_start_toast: "Lasket siiman veteen.",
      fish_toast: "Suuri hauki! Sen leukaluu on sinun.",
      welcome_newcomer: "Toivota tervetulleeksi",
      welcome_newcomer_toast:
        "Toivotat pelaajan {target} tervetulleeksi Väinölään.",
      skip_onboarding: "Osaan jo — anna vene",
      skip_onboarding_toast: "Pesän vierestä löytyy vene ja kirves.",
      plant: "Istuta männyn taimi",
      cut: "Käytä metsurin sahaa",
      build_house: "Käytä vasaraa (rakenna talo)",
      destroy_house: "Käytä vasaraa (pura talo)",
      build_door: "Ripusta ovi",
      remove_door: "Irrota ovi",
      open_door: "Avaa ovi",
      close_door: "Sulje ovi",
      open_door_toast: "Ovi avautuu.",
      close_door_toast: "Vedät oven kiinni.",
      tune_toast: "Kanteleen kielet soivat kirkkaina ja valmiina.",
      play_tune_toast: "Kanteleen sävel kantautuu yli aukion.",
      place_blessing_toast: "Pihlajan siunaus merkitsee nyt tätä paikkaa.",
      summon_knife_toast: "Veitsi ilmestyy laukkuusi.",
      summon_weapons_toast:
        "Miekka, lyhytjousi ja pitkäjousi ilmestyvät laukkuusi.",
      craft_kantele_start_toast: "Alat valmistaa kanteletta.",
      craft_kantele_toast: "Sait kanteleen valmiiksi.",
      pray_revived_toast: "Tunnet elävyyden taas!",
      choose_class_tietaja: "Ryhdy tietäjäksi",
      choose_class_seppa: "Ryhdy sepäksi",
      choose_class_laulaja: "Ryhdy laulajaksi",
      choose_class_erankavija: "Ryhdy eränkävijäksi",
      choose_class_urho: "Ryhdy urhoksi",
      class_chosen: {
        tietaja: "Olet nyt tietäjä: synnyt ja loitsut ovat sinun.",
        seppa: "Olet nyt seppä: rauta ja rakentaminen ovat sinun.",
        laulaja: "Olet nyt laulaja: laulu ja eläimet ovat sinun.",
        erankavija: "Olet nyt eränkävijä: jousi ja erämaa ovat sinun.",
        urho: "Olet nyt urho: taistelu ja kilpi ovat sinun.",
      },
      pray_toast: "Rukoilet hartaasti!",
      advance_level_toast: "Nouset tasolle {level}!",
      examine_toast: "Tutkit kohdetta {target}.",
      attack_miss_toast: "Löit huti.",
      attack_destroy_toast: "Osut. Tuhosit kohteen {target}.",
      attack_hit_toast: "Osut.",
      fix_full_toast: "{target} on jo täydessä kunnossa.",
      fix_toast: "Korjaat kohteen {target}.",
      bury_toast: "Hautaat ruumiin.",
      poke_toast: "Tökkäät kohdetta {target}.",
      approaching_toast: "Siirryt kohti kohdetta.",
      follow_toast: "Alat seurata kohdetta {target}.",
      stop_follow_toast: "Lopetat seuraamisen.",
      cancel_approach: "Lopeta liikkuminen",
      cancel_approach_toast: "Lopetat liikkumisen kohdetta kohti.",
      fight_toast: "Alat taistella kohdetta {target} vastaan.",
      stop_fight_toast: "Lopetat taistelun.",
      firebolt: "Tulinuoli",
      firebolt_hit_toast: "Tulinuolesi kärventää kohdetta {target}.",
      firebolt_miss_toast: "Tulinuolesi suhahtaa kohteen {target} ohi.",
      firebolt_kill_toast: "Tulinuolesi polttaa kohteen {target} tuhkaksi!",
      fireball: "Tulipallo",
      fireball_toast: "Tulipallosi räjähtää — {struck} osumaa, {kills} kaatui.",
      fireball_miss_toast: "Tulipallosi kärventää tyhjää maata.",
      heal: "Paranna",
      heal_toast: "Parannat kohdetta {target}.",
      harm: "Vahingoita",
      harm_toast: "Vahingoitusloitsusi haavoittaa kohdetta {target}.",
      harm_kill_toast: "Vahingoitusloitsusi tuhoaa kohteen {target}.",
      door_travel: "Astu ovesta",
      build_portal: "Nosta riimuportti",
      remove_portal: "Sulje riimuportti",
      tune: "Viritä kantele",
      play_tune: "Soita kanteleen sävel",
      place_blessing: "Aseta pihlajansiunaus",
      portal_travel: "Astu riimuporttiin",
      return_home: "Matkaa vanhalle tammelle",
      pray: "Rukoile",
      advance_level: "Nouse tasolla",
      stop_follow: "Lopeta seuraaminen",
      stop_fight: "Lopeta taistelu",
      summon_knife: "Kutsu puukko",
      summon_weapons: "Kutsu aseet",
      examine: "Tutki",
      break: "Riko",
      fix: "Korjaa",
      bury: "Hautaa",
      pick_item: "Poimi",
      pick_item_toast: "Poimit esineen.",
      poke: "Tökkää",
      follow: "Seuraa",
      fight: "Taistele",
    },
    recipe: {
      craft_stone_axe: "Tee kivikirves",
      craft_boat: "Veistä vene",
      craft_kantele: "Rakenna kantele",
      grow_pine_tree: "Kasvata mänty",
    },
    terrain: {
      heather: "Kanervikko",
      wall: "Kuusitiheikkö",
      house: "Talon seinä",
      tree: "Mänty",
      tree_planted: "Mänty (istutettu)",
      ocean: "Meri",
      lake: "Järvi",
      river: "Joki",
      rock: "Kivikko",
      mountain: "Vuori",
      sand: "Hiekka",
      cave_floor: "Luolan lattia",
      wood_floor: "Puutaso",
      bridge: "Silta",
      ground_tree_cut: "Metsäpohja (mänty kaadettu)",
      ground: "Metsäpohja",
    },
    inventory: {
      empty: "tyhjä",
      backpack_empty: "Reppu on tyhjä",
      items_suffix: "esinettä",
      drop: "Pudota",
      store: "Säilytä",
      open: "Avaa",
      take: "Ota",
      put_in_chest: "Laita arkkuun",
    },
    stats: {
      empty: "Ei tilastoja.",
    },
    size: {
      tiny: "Pikkuruinen",
      small: "Pieni",
      medium: "Keskikokoinen",
      large: "Suuri",
      huge: "Valtava",
    },
    visual_style: {
      humanoid: "Ihmismäinen (kaksi jalkaa)",
      wolfish: "Sutimainen (hoikka nelijalkainen)",
      bearish: "Karhumainen (tanakka nelijalkainen)",
      doggish: "Koiramainen (pieni nelijalkainen)",
      birdlike: "Linnunkaltainen (kaksijalkainen lintu)",
      equine: "Hevosmainen",
    },
    item_style: {
      block: "Kuutio",
      blade: "Terä (puukko, miekka)",
      bow: "Jousi",
      chest: "Arkku",
      door: "Ovi",
      staff: "Varsi (vasara, työkalu)",
      orb: "Pallo (amuletti, kivi)",
      plant: "Kasvi (kukka, taimi)",
      scroll: "Kääry",
      book: "Kirja",
    },
    living: {
      class: {
        player_human: "Tulokas",
        player_tietaja: "Tietäjä",
        player_seppa: "Seppä",
        player_laulaja: "Laulaja",
        player_erankavija: "Eränkävijä",
        player_urho: "Urho",
        npc_elder: "Vanhin",
        player_elf: "Haltia",
        player_hobbit: "Hobitti",
        player_ghost: "Aave",
        player_giant: "Jättiläinen",
        npc_human: "Ihminen",
        npc_giant: "Jättiläinen",
        npc_archer: "Jousimies",
        npc_wolf: "Susi",
        npc_bear: "Karhu",
        npc_dog: "Koira",
        npc_horse: "Hevonen",
        npc_donkey: "Aasi",
        npc_chicken: "Kana",
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
        voima: "Voima",
        ketteryys: "Ketteryys",
        kestavyys: "Kestävyys",
        tieto: "Tieto",
        sana: "Sana",
        puutyo: "Puutyö",
        takominen: "Takominen",
        metsastys: "Metsästys",
        synnyt: "Synnyt",
        soitto: "Soitto",
        lahitaistelu: "Lähitaistelu",
        jousi: "Jousi",
        parannus: "Parannus",
        level: "Taso",
        experience: "Kokemus",
        total_experience: "Kokonaiskokemus",
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
      world_info: "Maailman tiedot",
      stats_label: "Tilastot:",
      level_abbr: "Taso:",
      hp_abbr: "OP:",
      ac_abbr: "PL:",
      wc_abbr: "AL:",
      fatigue_abbr: "V:",
      xp_abbr: "KP:",
      use: "Toiminnot",
      pick: "Poimi",
      items: "Tavarat",
      stats: "Tilastot",
      players: "Pelaajat",
      chat: "Keskustelu",
      item_types: "Esinetyypit",
      action_types: "Toimintotyypit",
      living_types: "Olentotyypit",
      world_types: "Maailmatyypit",
      tile_types: "Ruututyypit",
      following_prefix: "Seuraat:",
      fighting_prefix: "Taistelet:",
      approaching_prefix: "Lähestyt:",
      stop_action: "Lopeta",
      aim_hint: "napauta ruutua ampuaksesi",
      aim_hint_target: "napauta korostettua kohdetta",
      aim_hint_target_or_bag: "napauta kohdetta tai valitse repusta",
      aim_bag: "Reppu",
    },
    action_category: {
      combat: "Taistelu",
      magic: "Taika",
      build: "Rakenna",
      craft: "Valmista",
      gather: "Kerää",
      travel: "Matkusta",
      misc: "Muut",
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
      world_info: "Maailman tiedot",
      inventory: "Reppu",
      container: "Säiliö",
      statistics: "Tilastot",
      players_online: "Pelaajat verkossa",
      chat: "Keskustelu",
      item_types: "Esinetyypit",
      action_types: "Toimintotyypit",
      living_types: "Olentotyypit",
      world_types: "Maailmatyypit",
      tile_types: "Ruututyypit",
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
      invite_button: "Kutsu",
      revoke_button: "Peru kutsu",
      send_home_button: "Lähetä pois",
    },
    chat: {
      arrived_in_vainola: "souti Väinölän rantaan ensimmäistä kertaa.",
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
      label_label: "Nimi (englanti)",
      name_fi_label: "Nimi (suomi)",
      kind_label: "Laji",
      size_label: "Koko",
      visual_style_label: "Ulkoasu",
      color_label: "Väri (tyhjä = automaattinen)",
      color_pick: "Valitse väri",
      color_auto: "Auto",
      target_kind_label: "Kohteen tyyppi",
      non_droppable: "Ei pudotettavissa",
      non_pickable: "Ei poimittavissa",
      action_ids_label: "Toimintotunnisteet (pilkulla erotettu)",
      state_template_label: "Tilamalli (JSON)",
      source_items_label: "Lähde-esineet (pilkulla erotettu)",
      logic_spec_label: "Logiikkamäärittely (JSON)",
      living_effect_label: "Olentovaikutus (JSON)",
      execution_label: "Suoritus (JSON)",
      behavior_label:
        "Käyttäytyminen (JSON: idleChance, pickUpChance, dropChance, forageChance, roamRadius, movement)",
      dialogue_label: "Vuoropuhelu (JSON: mitä se sanoo puhuteltaessa)",
      cost_label: "Hinta (JSON)",
      produces_label: "Tuottaa (JSON)",
      experience_label: "Kokemus (JSON)",
      messages_label: "Viestit (JSON, kielikohtaiset)",
      slot_definitions_label: "Paikkamäärittelyt (JSON)",
      value_template_label: "Arvomalli (JSON)",
      value_schema_label: "Arvokaavio (JSON)",
      aggressive: "Aggressiivinen (NPC hyökkää pelaajien kimppuun ruudullaan)",
      default_items_label:
        "Oletusesineet (pilkuin erotellut tyypit; aseet otetaan käyttöön)",
      death_class_label:
        "Kuolemanluokka (muuttuu tähän kuollessa; tyhjä = katoaa)",
      corpse_item_label: "Ruumisesine (jää kuolinruudulle; tyhjä = ei mitään)",
      revive_class_label:
        "Herätysluokka (mihin rukoilu palauttaa; tyhjä = ei herätettävissä)",
      combatant: "Taistelija (voi taistella ja olla kohteena)",
      item_spawns_label: "Esineiden ilmestyminen (JSON)",
      npc_spawns_label: "NPC:iden ilmestyminen (JSON)",
      placements_label: "Sijoittelut",
      add_placement: "Lisää sijoittelu",
      reservation: "varaa alue",
      preview_hint: "Sijoittelut ja varatut alueet valituissa mitoissa.",
      reconcile: "Päivitä maailmaan",
      reconciled: "Päivitetty",
      reconcile_failed: "Päivitys epäonnistui",
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
      no_tile_types: "Ei ruututyyppejä vielä.",
      generation_label: "Generointi (JSON; tyhjä = perustyypin oletus)",
      invalid_generation_json: "Virheellinen generoinnin JSON",
      new_tile_type: "Uusi ruututyyppi",
      tile_not_found: "Ruututyyppiä ei löytynyt",
      failed_to_load_tile_type: "Ruututyypin lataus epäonnistui",
      invalid_tile_visual_json: "Virheellinen ulkoasun JSON",
      tile_value_label: "Kartta-arvo (tyhjä = seuraava vapaa; oltava uniikki)",
      tile_walkable: "Kuljettava (olennot voivat seistä)",
      tile_walkable_short: "kuljettava",
      tile_blocking_short: "estää",
      tile_layer_label: "Maailmamuokkauksen kerros",
      tile_visual_label: "Ulkoasu (JSON; tyhjä = piirretään omalla tavallaan)",
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
      invalid_living_effect_json: "Virheellinen olentovaikutuksen JSON",
      invalid_execution_json: "Virheellinen suorituksen JSON",
      invalid_behavior_json: "Virheellinen käyttäytymisen JSON",
      invalid_dialogue_json: "Virheellinen vuoropuhelun JSON",
      invalid_field_json: "Virheellinen JSON kentässä",
      claimed_ownership:
        "Tallennettu. Tämä sisäänrakennettu tyyppi on nyt sinun — julkaisut eivät enää muuta sitä.",
      invalid_slot_definitions_json: "Virheellinen paikkamäärittelyjen JSON",
      slot_definitions_must_be_array:
        "Paikkamäärittelyjen tulee olla JSON-taulukko",
      invalid_value_template_json: "Virheellinen arvomallin JSON",
      invalid_value_schema_json: "Virheellinen arvokaavion JSON",
      invalid_item_spawns_json: "Virheellinen esineiden ilmestymisen JSON",
      invalid_npc_spawns_json: "Virheellinen NPC:iden ilmestymisen JSON",
      invalid_placements_json: "Virheellinen sijoittelujen JSON",
      save_failed: "Tallennus epäonnistui",
      saved: "Tallennettu!",
      delete_failed: "Poisto epäonnistui",
      deleted_prefix: "Poistettu",
    },
    tile: {
      square: "Ruutu",
      choose_target: "Valitse kohde",
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
      talk: "Puhu",
    },
    nick: {
      redirecting_to_logout: "Ohjataan uloskirjautumiseen...",
      logout_hint: 'Kirjaudu ulos klikkaamalla "Sinä" kolmesti',
      changed_name_to: "Nimi vaihdettu:",
    },
    poke: {
      pokes_you: "tökkää sinua.",
    },
    fight: {
      you_missed: "Osuit huti",
      you_defeated: "Voitit vastustajan",
      you_hit: "Osuit vastustajaan",
      hits_you_for: "osuu sinuun",
      something: "Joku",
      you_died: "Olet kuollut ja muuttunut aaveeksi.",
      gained_xp: "sait",
      xp_suffix: "KP",
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
      traveling: "Matkalla…",
    },
    auth: {
      session_expired_redirecting:
        "Istunto vanhentui. Ohjataan kirjautumissivulle...",
      session_expired_reconnecting:
        "Istunto vanhentui, yritetään yhdistää uudelleen...",
    },
    world_class: {
      home_island: { name: "Kotisaari" },
      forest: { name: "Metsä" },
      island: { name: "Saari" },
      cave: { name: "Luola" },
      building: { name: "Rakennus" },
      village: { name: "Kylä" },
      birdhaven: { name: "Väinölä" },
      adventurers_guild: { name: "Seikkailijoiden kilta" },
    },
    onboarding: {
      step: {
        pouch: "Poimi siemenpussi hiekalta.",
        sow: "Käänny kohti tyhjää hiekkaa ja kylvä puu siemenpussilla.",
        axe: "Tee kivikirves kivestä ja oksasta.",
        fell: "Kaada puusi kivikirveellä.",
        carve: "Veistä rungosta vene.",
        row: "Souda Väinölään, jossa muut ovat.",
      },
      skip: "Osaatko jo pelin? Sotkan pesältä saat veneen.",
    },
    welcome: {
      welcomed_you: "{nick} toivottaa sinut tervetulleeksi Väinölään!",
    },
    dialogue: {
      elder: {
        newcomer:
          "Tulit vetten takaa. Jokainen meistä täällä on jotakin — kuka sinä olet?",
        choose: {
          tietaja: "Tietäjä, joka tuntee asioiden synnyt.",
          seppa: "Seppä, joka takoo ja rakentaa.",
          laulaja: "Laulaja, jonka laulua eläimet kuuntelevat.",
          erankavija: "Eränkävijä, joka on kotonaan erämaassa jousi kädessä.",
          urho: "Urho, joka seisoo edessä, kun tulee taisto.",
        },
        chosen:
          "Mene siis ja kasvata tätä maata. Se on yhtä lailla sinun kuin minun.",
      },
    },
    island: {
      invited_you: "{nick} kutsuu sinut saarelleen.",
      invite_row: "{nick} kutsuu sinut saarelleen · {min} min jäljellä",
      row_there: "Souda sinne",
      invite_sent: "{nick} voi soutaa saarellesi seuraavan vartin ajan.",
      invite_revoked: "Kutsu peruttu.",
      guest_sent_home: "Vieraasi soudettiin takaisin Väinölään.",
      visit_ended: {
        host_left: "{nick} lähti saareltaan, ja soudit takaisin Väinölään.",
        sent_home: "{nick} lähetti sinut takaisin Väinölään.",
        revoked: "{nick} perui kutsun, ja soudit takaisin Väinölään.",
      },
    },
    error: {
      sow_only_on_home_island: "Siemen itää vain omalla kotisaarellasi.",
      finish_island_first: "Tee ensin vene: sillä pääset pois saareltasi.",
      already_in_vainola: "Olet jo Väinölässä.",
      already_home: "Olet jo kotona.",
      onboarding_already_done: "Pesällä ei ole sinulle enää annettavaa.",
      not_your_island: "Se on jonkun toisen saari.",
      not_as_a_guest: "Vieraana et voi tehdä sitä toisen saarella.",
      fish_needs_water: "Käänny kohti avovettä kalastaaksesi.",
      class_already_chosen: "Olet jo valinnut, mikä olet.",
      skill_too_low: "Taitosi ei vielä riitä siihen.",
      ask_the_elder: "Kysy Väinölän vanhimmalta.",
      not_a_newcomer: "Hän ei ole enää tulokas.",
      already_welcomed: "Olet jo toivottanut hänet tervetulleeksi.",
      no_island_invite: "Kukaan ei ole kutsunut sinua saarelleen.",
      host_not_on_island: "Isäntäsi ei ole juuri nyt saarellaan.",
      already_on_that_island: "Olet jo sillä saarella.",
      invite_whom: "Valitse joku muu kutsuttavaksi.",
      unknown_player: "Sellaista pelaajaa ei ole.",
      invite_from_your_island: "Voit kutsua vain omalta saareltasi.",
      not_your_guest: "Hän ei ole vieraana saarellasi.",
      editing_rights_required: "Muokkausoikeudet vaaditaan",
      not_class_owner: "Sinulla ei ole muokkausoikeutta tähän",
      missing_id: "Tunniste puuttuu",
      invalid_json_body: "Virheellinen JSON-pyyntö",
      invalid_placements: "Virheelliset sijoittelut",
      missing_world_id: "Maailman tunnus puuttuu",
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
      approach_target_gone: "Kohdetta ei ole enää siellä",
      could_not_reach_target: "Et päässyt kohteen luo",
      target_item_not_pickable: "Sitä esinettä ei voi poimia",
      target_out_of_range: "Kohde on kantaman ulkopuolella",
      blessing_already_rests_here: "Siunaus lepää jo täällä",
      door_closed: "Ovi on kiinni",
      door_already_open: "Ovi on jo auki",
      door_already_closed: "Ovi on jo kiinni",
      no_door_here: "Täällä ei ole ovea",
      door_needs_wall: "Ovi täytyy ripustaa talon seinään",
      door_already_hangs: "Täällä roikkuu jo ovi",
      no_door_to_remove: "Ei ovea poistettavaksi",
      cannot_plant_here: "Tähän ei voi istuttaa",
      tree_already_exists: "Tässä on jo puu",
      area_is_protected: "Tämä alue on suojeltu",
      landmark_stands_firm: "Se pysyy järkkymättä",
      no_tree_to_cut: "Ei kaadettavaa puuta",
      tree_already_cut: "Puu on jo kaadettu",
      old_oak_stands_firm: "Vanha tammi seisoo lujana",
      cannot_build_house_here: "Tähän ei voi rakentaa taloa",
      house_already_exists: "Tässä on jo talo",
      no_house_to_destroy: "Ei purettavaa taloa",
      cannot_build_portal_here: "Tähän ei voi rakentaa riimuporttia",
      portal_already_exists: "Tässä on jo riimuportti",
      no_portal_to_remove: "Ei poistettavaa riimuporttia",
      kantele_needs_tuning: "Kantele täytyy ensin virittää",
      action_not_allowed_here: "Toiminto ei ole sallittu täällä",
      action_condition_not_met: "Toiminnon ehto ei täyty",
      not_enough_experience: "Ei tarpeeksi kokemusta tasonnousuun",
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
      container_not_found: "Säiliötä ei löytynyt",
      not_a_container: "Tämä esine ei ole säiliö",
      no_item_to_put: "Ei säiliöön laitettavaa esinettä",
      container_cannot_nest: "Säiliö ei voi sisältää toista säiliötä",
      item_cannot_be_stored: "Tätä esinettä ei voi säilyttää",
      container_full: "Säiliö on täynnä",
      invalid_container_item: "Virheellinen säiliön esine",
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
// Per-locale text a creator authored on their action classes, shipped in the
// item registry (see getBootstrapRegistry). Consulted before the built-in
// bundle and keyed by the whole dotted key rather than walked as a tree, so a
// creator can name a message anything without colliding with our namespaces.
/**
 * @param {string} locale
 * @returns {Record<string, string> | null}
 */
function creatorMessagesForLocale(locale) {
  if (typeof ITEM_REGISTRY === "undefined" || !ITEM_REGISTRY) return null;
  var byLocale = ITEM_REGISTRY.messages;
  if (!byLocale || typeof byLocale !== "object") return null;
  return byLocale[locale] || null;
}

/**
 * @param {string} locale
 * @param {string} key
 * @returns {string | null}
 */
function getMessageByKey(locale, key) {
  var authored = creatorMessagesForLocale(locale);
  if (authored && typeof authored[key] === "string" && authored[key]) {
    return authored[key];
  }
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
 * Resolve a creator class's display name, preferring a per-locale override in
 * its `labels` map (e.g. { fi: "Miekka" }) and otherwise falling back to
 * t(labelKey, fallback). Built-in classes carry no labels map and translate
 * through their static labelKey, so they keep working unchanged.
 * @param {Record<string, string> | null | undefined} labels
 * @param {string} [labelKey]
 * @param {string} [fallback]
 * @returns {string}
 */
function localizeLabel(labels, labelKey, fallback) {
  var locale = resolveLocale();
  if (labels && typeof labels === "object") {
    var direct = labels[locale];
    if (typeof direct === "string" && direct) return direct;
  }
  return t(labelKey || "", fallback);
}

/**
 * Like t(), but substitutes {name} placeholders from params. Used for server
 * toasts whose message carries dynamic values (a level number, a target's
 * name) — the server sends a key plus a params map, the localized template
 * fills them in. Missing keys fall back to the pre-assembled English string.
 * @param {string} key
 * @param {string} [fallback]
 * @param {Record<string, unknown> | null} [params]
 * @returns {string}
 */
function tFormat(key, fallback, params) {
  var msg = t(key, fallback);
  if (params && typeof params === "object") {
    Object.keys(params).forEach(function (name) {
      msg = msg.split("{" + name + "}").join(String(params[name]));
    });
  }
  return msg;
}

/**
 * Localize a server action/stream result's toast. Prefers toast_message_key
 * (+ optional toast_message_params) and falls back to the English
 * toast_message the server always includes. Returns "" when there's no toast.
 * @param {{ toast_message?: string, toast_message_key?: string, toast_message_params?: Record<string, unknown> } | null | undefined} result
 * @returns {string}
 */
function localizeResultToast(result) {
  if (!result) return "";
  if (result.toast_message_key) {
    return tFormat(
      result.toast_message_key,
      result.toast_message || "",
      result.toast_message_params,
    );
  }
  return result.toast_message || "";
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

// Built-in door validation messages are DB-seeded as plain English (the
// action-class backfill can't rewrite an already-seeded nested errorMessage),
// so bridge those legacy strings to their error.* keys here. Fresh seeds emit
// the key directly and skip this map. Extend only for messages the server
// still sends as English.
var LEGACY_SERVER_MESSAGE_KEYS = /** @type {Record<string, string>} */ ({
  "No door here": "error.no_door_here",
  "A door must be hung on a house wall": "error.door_needs_wall",
  "A door already hangs here": "error.door_already_hangs",
  "No door to take down": "error.no_door_to_remove",
  "Cannot plant here": "error.cannot_plant_here",
  "Tree already exists": "error.tree_already_exists",
  "This area is protected": "error.area_is_protected",
  "No tree to cut": "error.no_tree_to_cut",
  "Tree already cut": "error.tree_already_cut",
  "The old oak stands firm": "error.old_oak_stands_firm",
  "Cannot build house here": "error.cannot_build_house_here",
  "House already exists": "error.house_already_exists",
  "No house to destroy": "error.no_house_to_destroy",
  "Cannot build portal here": "error.cannot_build_portal_here",
  "Portal already exists": "error.portal_already_exists",
  "No portal to remove": "error.no_portal_to_remove",
  "The kantele needs tuning first": "error.kantele_needs_tuning",
});

/**
 * @param {string} msg
 * @returns {string}
 */
function translateServerMessage(msg) {
  var raw = String(msg || "");
  if (Object.prototype.hasOwnProperty.call(LEGACY_SERVER_MESSAGE_KEYS, raw)) {
    raw = LEGACY_SERVER_MESSAGE_KEYS[raw];
  }
  if (raw.indexOf("error.") !== 0) return raw;
  var colonIdx = raw.indexOf(": ");
  var key = colonIdx === -1 ? raw : raw.slice(0, colonIdx);
  var suffix = colonIdx === -1 ? "" : raw.slice(colonIdx);
  var lastPart = key.split(".").pop() || key;
  return t(key, humanizeType(lastPart)) + suffix;
}
