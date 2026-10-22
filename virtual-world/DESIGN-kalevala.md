# Design — a Kalevala world that players grow

The plan for turning the virtual world into what its welcome page promises: a
world drawn from the Kalevala and Finnish nature, which the players themselves
grow. Nothing here is built yet. When a part is built, it moves into the
README and its open caveats into [TODO.md](TODO.md).

Neighbouring documents:

- [TODO-storytelling.md](TODO-storytelling.md) — dialogue, quests and the
  authoring gaps this plan leans on (authored descriptions, a journal).
- [DOC-authoring-worlds.md](DOC-authoring-worlds.md) — placements,
  reservations and linked worlds, which most of the content below is.
- [TODO-arch.md](TODO-arch.md) — the persistence tiers and timed actions that
  events touch.

## Principles

**One shared world, no phases.** Every player is in the same world, and a
player may start at any time. Nothing in the world is unlocked once for
everyone, and nothing gives the players who came first a lasting advantage over
those who come later. What persists is what players _built_ — forests, houses,
paths — and the world's chronicle of what happened. A late arrival walks into a
world that has grown, and that is the point.

**Creation is personal.** The Kalevala's creation — a bare island, the first
trees sown, a boat built — is something each player lives through once, on an
island of their own, before rowing to the shared land.

**Events, not stages.** The shared world changes through recurring events —
felling the great oak, a song that gathers the animals. Anyone present may take
part, every participant is rewarded, and every event comes round again.

**Classes in the spirit of D&D.** Players pick a class. Each is good at some
things and poor at others, nobody is best at everything, and abilities grow by
playing. The very strongest verbs — the greatest spells, the greatest weapons —
belong to one class each. Death offers a way back as the same character, at a
cost, or a fresh start with a new choice of class. Events are designed so that a mixed group does better than a group of
one class.

**Horizontal rewards.** Rewards are titles, cosmetics, origin lore (_synnyt_)
and materials — breadth, not power that compounds. A veteran can do more kinds
of things than a newcomer, but is not unbeatable at any one.

## Where the code stands

- A new player wakes on a home island of their own and rows to the start
  world, Väinölä (`START_WORLD_ID = "10000"`, class `birdhaven`), by boat.
- Every world switch goes through `switchUserWorld` in `world-switch.ts`. Its
  callers are `return_home`, the boat and portal/door travel in
  `tree-action-helpers.ts`, and the two routes in `route-handlers.ts` (`switchUserToNewWorld`,
  `switchUserToStartWorld`).
- Player classes (`player_human`, `player_elf`, `player_hobbit`,
  `player_giant`) differ only in looks. Every living has the same combat
  values; players add `level`, `experience` and `totalExperience`, and
  `advance_level` at the training post trades experience for a level that
  changes nothing else.
- `player_ghost.reviveClassId` is `player_human`, so a dead elf comes back as a
  human.
- Usable as they are: `linkedWorld` and `createWorldOfType`, timed actions
  (`durationMs`, `pending-action-storage.ts`), respawn timers
  (`spawn-timers.ts`), quest flags (`livingEffect.affects: "actor"`),
  `validWhen` and `actorConditions`, dialogue trees, the NPC tick, world chat,
  and a global stream scope (`sendGlobalPresenceEvent`).
- Missing: any notion of a skill or ability, an event state machine, authored
  item and world descriptions.

## 1. The home island

A new player wakes on a small island of their own, learns the game's verbs by
retelling the opening of the Kalevala, and rows to Väinölä.

### Built

The island, the onboarding path, the boat and the entry guard are in place;
the README's "Home islands and the boat" describes them. Where the build
departed from the first plan:

- Progress is not stored. The client works out the step from what the player
  carries and whether a tree grows on the island, so it cannot drift from what
  the player has.
- `return_home` still leads to the old oak; the boat is the way to the island.
  Every player past onboarding is given one.
- The island is 14×14 open water with a round patch of sand and heather. The
  pouch, stone and branch are placements, so one taken is back the next time
  the island loads and nobody can be stranded. `sow_tree` therefore works only
  on a home island (`validation.requireWorldClass`).
- No backfill: a player with no home row predates home islands and counts as
  past onboarding.
- World ids are now drawn until one names no existing world; with an island per
  player, a random id landing on someone's world was no longer a remote chance.

### Arrival, welcome and the pike — built

- The arrival shore is a 5×3 strip of sand on the river's west bank, east of
  the oak, with a new reservation rule `arrival_area`. The boat lands there
  (`getArrivalSpawnPosition`); `return_home` still leads to the oak. The strip
  names its tiles, because the river is where the village preset draws it for
  Väinölä's world.
- The newcomer window is read from `onboardingDoneAt`, which is already the
  arrival time, so there is no separate `arrived_at`. A public living value
  `newcomer` is set on first arrival and cleared by the heartbeat once the 15
  minutes have passed, so `welcome_newcomer`'s `validWhen` offers it only on
  newcomers. The greeter earns 25 experience, once per pair
  (`vworld_welcomes`), and the newcomer is told who welcomed them.
- `fish` is the boat's action, on any faced ocean, lake or river tile
  (`requireTileState` gained `tileTypes`, any of several). `craft_kantele` now
  costs a `pike_jawbone`, a birch-bark letter and a juniper bundle (the rune
  stone dropped out), and sets `values.synty_kantele`. A built-in's cost now
  follows the code for a row nobody owns, so a recipe can change.

### Still to build

- The class choice from the elder on arrival (see 2).

### Visiting another's island — built

Nobody can go to another player's island on their own; a host invites them.
The README's "Home islands and the boat" describes how it works. Where the
build departed from the plan:

- Invites are issued from the players panel through a route of their own
  (`/virtual-world/island-invite`), not as actions: a host picks a player from
  a list rather than facing one, and the player is usually in another world.
  `row_to_island` is the boat's action, and without a host named it rows on
  the latest open invite.
- "On the island" means the island is the host's current world and they have
  been heard from — a heartbeat or a move — within two minutes. A host who
  closed the game is still recorded on their island, so the world alone is
  not enough.
- What a guest may do is data: `guestAllowed` on an action class, off by
  default, so an action a creator adds is held to the guest rule until they say
  otherwise. Picking up and taking from containers are refused outright; a
  guest may drop things as gifts.
- The client still offers a guest the actions they cannot use; the server
  refuses them with `error.not_as_a_guest`.

## 2. Classes and abilities

Every player has a class, a handful of attributes, and skills that grow with
use. A class decides where a player starts and how far each skill can go.

### Built so far

All of it but titles: classes, attributes, the choice, skills, class-only
verbs, levels that do something, the toll of returning from death and
starting anew. Where the build departed from the
plan:

- The classes are data in `player-classes.ts`, one living class each
  (`player_tietaja`, `player_seppa`, `player_laulaja`, `player_erankavija`,
  `player_urho`). The attributes are player values (`voima`, `ketteryys`,
  `kestavyys`, `tieto`, `sana`), public, starting from each class's array
  (two favoured, each set summing to 58); a newcomer has 10 in each.
- The elder is Väinämöinen, an `npc_elder` placed at the head of the arrival
  shore. His conversation asks a newcomer what they are; each answer runs a
  `choose_class_*` action, offered only beside him and only once.
- Hit points start at the class's 8, 10 or 12. `maxHitPoints` stays
  class-owned; what levels add is the player's own `hitPointBonus`, added to
  it when values are read, so a class can still be retuned. Each level rolls
  the class's hit die plus the Kestävyys modifier, at least 1 (a newcomer
  rolls a d8), and raises the current hit points as well.
- A level gives `attributePoints`, one and two on every fourth, spent one at
  a time with the "+" beside an attribute in the statistics panel
  (`POST /virtual-world/raise-attribute`), to at most 20. Raising Kestävyys
  does not add hit points for levels already taken. The logic is
  `levels.ts`.
- The chosen class is kept in `vworld_player_characters`, so a dead player
  prays back to it rather than to a newcomer.
- Returning takes its toll in `death.ts`. The wound is the player's own
  `woundedUntil` (milliseconds) rather than a `wounded` state: while it is
  set, `normalizeLivingValues` takes a fifth off `maxHitPoints` and the
  heartbeat halves fatigue recovery, and the heartbeat clears it once the
  time has passed. The statistics panel shows it as minutes left.
- `start_anew` is `classes: ["player_ghost"]`, so the palette offers it to
  ghosts only, and the handler also requires a class with a `reviveClassId`.
  It keeps the keepsakes and the bundle and boat every player carries, clears
  every living value and the `vworld_player_characters` row, and rows the
  player to their island. The built-in keepsakes are the creator's stone and
  the flower. A keepsake inside a container that is not one is lost with it.
- Titles are not built: nothing earns one yet. `vworld_player_titles` comes
  with the first reward that gives a title (the oak's leaf).
- Skills are owner-visible player values, absent until first used. Each
  class has main skills (cap 100) and secondary ones (cap 60), listed in
  `player-classes.ts`; the rest cap at 30. A use gains `gain × (cap −
skill) / cap`, so growth is quick at first and slows near the top; the cap
  is the affinity, with no separate multiplier. The arithmetic is
  `skills.ts`.
- `skill` is stored in its own column and resynced from the code for rows
  nobody owns. `roll` adds the attribute modifier and skill / 20 to the d20,
  for spells and for the fight tick, where each hit trains melee.
  `duration` shortens to half at 100; `yield` adds one item per 50 points.
  `min` is checked by the server and hides the action in the palette.
- Built-ins with a skill: planting, sowing, cutting, felling and carving
  (`puutyo`), fishing (`metsastys`, yield), tuning and playing (`soitto`),
  healing (`parannus`), firebolt, fireball and harm (`synnyt`, roll), and
  fighting (`lahitaistelu`, roll). Nothing uses `takominen` or `jousi` yet,
  and no built-in has a `min`: those wait for forging and the bows.
- `classes` on an action class and `wieldClasses` on an item class are
  built, each in its own column and resynced from the code for rows nobody
  owns. The server checks `classes` beside the skill minimum, and the palette
  hides what the class may not use; `wieldClasses` is checked when an item
  goes into a slot tagged `hand`, and only for players. The two built-in
  examples are `fireball` (the sage's) and the longbow (the woodsman's). The
  rest of the table above waits for its content: there are no great weapons,
  forging, group songs or snares yet.
- Elf, hobbit and giant are retired: a player still in one becomes a
  newcomer when the page loads. The living classes stay in the code so their
  rows remain valid.

### Classes

Chosen on arrival in Väinölä, from the elder's dialogue. Until then a player is
a newcomer (`player_human`, relabelled, stays the default class). Each class is
a living class with its own look, so `player_elf`, `player_hobbit` and
`player_giant` are replaced. The class is kept for the character's whole life;
the only way to choose again is to start anew after death (below).

| Class      | Kalevala figure        | Good at                                         | Poor at           | Hit die |
| ---------- | ---------------------- | ----------------------------------------------- | ----------------- | ------- |
| Tietäjä    | Väinämöinen            | Origins (_synnyt_), healing, spells             | Melee, heavy work | d6      |
| Seppä      | Ilmarinen              | Smithing, building, armour; strong but slow     | Ranged, songs     | d10     |
| Laulaja    | the singers            | Kantele, songs that help a whole group, animals | Smithing, melee   | d6      |
| Eränkävijä | the hunters of Hiisi   | Bows, tracking, woodcraft, moving fast          | Spells, smithing  | d8      |
| Urho       | Kullervo, Lemminkäinen | Melee, endurance, defending others              | Origins, songs    | d10     |

### Attributes

Five, D&D-like, with Finnish names: **Voima** (strength), **Ketteryys**
(dexterity), **Kestävyys** (constitution), **Tieto** (lore and wisdom) and
**Sana** (presence and song).

- Each class starts from a fixed array that favours two attributes, e.g.
  Tietäjä Tieto 15, Sana 13, the rest 8–12.
- A modifier is `floor((value − 10) / 2)`, as in D&D.
- Every new level gives one attribute point, and every fourth level two.
  Hit points grow by the class's hit die plus the Kestävyys modifier.
- `advance_level` keeps its experience cost; what changes is that a level now
  does something.

### Skills

Skills grow by doing: `puutyö` (woodcraft), `takominen` (smithing),
`metsästys` (hunting), `synnyt` (origins and spells), `soitto` (playing and
songs), `lähitaistelu` (melee), `jousi` (archery), `parannus` (healing).

- Each skill is a player value from 0 to the class's cap: **100** for its main
  skills, **60** for its secondary skills, **30** for the rest. A Seppä can
  learn to play the kantele, but never as well as a Laulaja.
- Each use gains a little, scaled by the class's affinity and slowing as the
  skill nears its cap.
- Nobody reaches every cap. A player's whole career is a mix of what their
  class does best and the breadth they choose to pick up.

### Class-only verbs

Shared skills give breadth; the summit of each craft belongs to one class.
Some actions are open to one class only, and some items can be wielded by one
class only:

| Class      | Only this class may                                                    |
| ---------- | ---------------------------------------------------------------------- |
| Tietäjä    | Cast the strongest spells (`fireball`, raising the dead), bind origins |
| Seppä      | Forge iron and steel, mend metal gear, build the strongest structures  |
| Laulaja    | Sing the group songs, calm and call animals                            |
| Eränkävijä | Draw the longbow, track game, set snares                               |
| Urho       | Wield the great weapons (two-handed sword, great axe), shield others   |

- An action class gains `classes?: string[]`. When set, the action is offered
  only to those classes. It is enforced where `actorConditions` is, so the
  client's offer and the server's check cannot disagree.
- An item class gains `wieldClasses?: string[]`, checked when the item goes
  into a hand slot. Others may still carry it, trade it and hand it on.
- Each class's exclusives are its best tools, not its only ones: a Tietäjä
  still shoots a shortbow at jousi 30.
- No event needs a particular class to succeed. A class-only verb is a role
  that makes a mixed group stronger, never a gate.

### What actions read

A new, optional block on an action class:

```ts
skill?: {
  id: string;              // "puutyö"
  attribute?: string;      // "Voima": its modifier is added as well
  min?: number;            // below it, the action is not offered
  gain: number;            // skill points per success, before scaling
  affects?: "roll" | "duration" | "yield";
}
```

- `roll`: the existing d20 attack roll adds the attribute modifier and a skill
  bonus (`floor(skill / 20)`), so combat becomes d20 + modifiers against the
  armour class.
- `duration`: a skilled player finishes sooner (felling, carving, forging).
- `yield`: a skilled player gets more or better material.
- `min` is how expert actions appear: forging an iron axe needs takominen 40.

The block is data, so a creator can give their own actions a skill, and the
action editor gets the field.

### Death: return, or start anew

A player who dies becomes a ghost, as now, and chooses between two ways back.

**Return** as the same character, somewhat worse for it:

- Back as their own class. `reviveClassId` stays the default for NPCs, but a
  player keeps a value `baseClassId`, and the revive path prefers it — today a
  dead elf comes back as a human.
- The toll: a tenth of the spendable `experience` (never `totalExperience`, so
  no level is lost), and a `wounded` state for 30 minutes — maximum hit points
  down by a fifth and fatigue recovering more slowly. Attributes and skills
  are never lost.
- Returning is the existing `pray` at the old oak, so the ghost walks there
  first.

**Start anew** as a new character:

- `start_anew`, offered to a ghost anywhere. It cannot be undone, so the client
  confirms it.
- The rule: **what affects play is reset, what does not is kept.**
- Reset: level, experience, attributes, skills, origin flags, quest flags, and
  every item in the slots and bag that is not a keepsake.
- Kept: titles, keepsake items (cosmetics), the home island and what is built
  on it, the nickname, and the player's lines in the chronicle.
- Which items are keepsakes is data, not a list in code: an item class gains
  `keepsake?: boolean`, and a keepsake must not change any value an action
  reads. `start_anew` keeps exactly the keepsake items, so a new reward
  follows the rule by how it is defined.
- Titles live on the account, not the character: a table
  `vworld_player_titles` (`user_id`, `title_id`, `earned_at`, `source`), with
  the chosen title shown beside the nickname.
- They wake on their island as a newcomer, already past onboarding and with a
  boat, and choose a class again from the elder on the shore.

A Tuonela to cross on the way back — a world of its own between death and
return — fits here later, without changing either choice.

**Tests:** class choice and its starting values, the modifier, skill gain and
caps, each `affects` mode, `min` gating, `classes` and `wieldClasses` (offer,
server check, carry-but-not-wield), level-up effects; return to own class with
its toll and its expiry; start anew resets the character and keeps the island,
the titles and exactly the keepsake items.

## 3. Kalevala vocabulary

Mostly data and translation, so it can run beside 1 and 2.

- NPCs: `npc_giant` becomes Antero Vipunen or Iku-Turso; chickens and donkeys
  give way to reindeer, cows and elk (`equine`/`bearish`), swans and cuckoos
  (`birdlike`). **Built:** `npc_giant` is Antero Vipunen, huge and mostly
  asleep, one per wild world. The reindeer, cow, elk, swan and cuckoo are
  classes of their own; the elk, swan and cuckoo keep away from people
  (`movement: "flee"`). A saved chicken loads as a cuckoo and a donkey as a
  cow (`RETIRED_NPC_CLASS_IDS`), so existing worlds change too, and the
  spawn manifests of built-in world classes nobody owns now follow the code.
  Forests have elk and cuckoos instead of horses; the horse class stays.
- Items: `spellbook` goes, replaced by learned origins. The adventurers' guild
  becomes Väinölä's tupa, and the training post a wrestling ground.
- Authored descriptions: `description`/`descriptions` on item classes, shown by
  `examine`, and the same on world classes, replacing the four hash-picked
  flavour lines in `world-domain.ts`. Both are open items in
  TODO-storytelling, and the chronicle (6) needs them.

## 4. The event framework

Every event is one entry in a registry and runs on one state machine.

### Definition

At first in code, `server/event-registry.ts`, shaped like `item-registry.ts`:

```ts
{
  id: string;
  anchorPlacementId: string;
  ready:
    | { kind: "cycle"; afterMs: number }                       // e.g. a week after the last one
    | { kind: "random"; meanIntervalMs: number; minIntervalMs: number }
    | { kind: "always" };
  start:
    | { kind: "auto" }                                         // starts by itself when ready
    | { kind: "player"; actionId: string; cooldownMs?: number }; // a player starts it
  gatherMs: number;
  activeMs: number;
  rewardWindowMs: number;
  minParticipants: number;
  roles?: { classId: string; bonus: string }[];
  rewards: EventReward[];
}
```

The two axes cover the cases wanted:

- **Cycle + player:** the great oak. It grows for about a week, then waits
  until someone with the right lore starts it.
- **Random + auto:** Louhi hides the sun at unpredictable times.
- **Always + player, with a cooldown:** a kantele concert, whenever a player
  decides to give one.

### State

- `vworld_events`: `event_id`, `world_id`, `kind`, `state`, `anchor`,
  `started_by`, `phase_ends_at`, `ready_at`, `progress` (json), `version` for
  optimistic locking.
- `vworld_event_participants`: `event_id`, `user_id`, `class_id`,
  `contribution`, `reward_choice`, `rewarded_at`; unique on
  (`event_id`, `user_id`).

### The state machine

`waiting → ready → gathering → active → rewarding → waiting`

- Transitions are pure functions, so they are unit-tested on their own.
- `processDueEvents(worldId, now)` runs from the world tick, beside
  `processDueSpawnTimers`, under a lease so two instances never move the same
  event.
- `random` readiness rolls each tick against the mean interval, never sooner
  than the minimum.
- If gathering ends below `minParticipants`, the event lapses back to `ready`
  and the starter's item is returned.

### Announcements

- Server-wide, on the global stream scope: every player hears an event start
  wherever they are, their home island included. A new stream event,
  `world_event`, carries the state and the time left.
- The client shows a banner and a countdown in the active-actions panel, with a
  way to row to Väinölä from an island.
- The same line goes to Väinölä's world chat.

### Roles

An event names what each class brings, and the event's own actions read the
participant's class and skills. A group with several classes succeeds sooner
and earns more; a group of one class still succeeds.

## 5. The great oak

The first event on the framework. The Kalevala's second poem: the oak grows
until it hides the sun and the moon, and a small man risen from the sea fells
it.

### Growth

- `old_oak` gains a state `growth`, 0–100.
- It grows in the tick: slowly with time, faster for every tree planted in
  Väinölä — the players' own sowing feeds it. Full growth takes about a week.
- The client scales the `broadleaf` mesh by `growth`, and at 100 darkens the
  tiles within a radius.

### Starting it (`ready: cycle`, `start: player`)

- The starter needs the origin flag `synty_tammi` and a `sea_shell`.
- The flag comes from the elder in Väinölä: a dialogue choice that costs a
  birch-bark letter. Any class can learn it; a Tietäjä learns it without the
  letter.
- Shells come from Väinölä's shore through its spawn manifest, so there are
  always some.
- `call_small_man` is offered only at `growth = 100` while the event is
  `ready`.

### Gathering (10 minutes)

- `npc_small_man` rises from the sea: small, `combatant: false`,
  `roamRadius: 0`.
- Announced everywhere: "A small man rose from the sea — the oak falls in ten
  minutes."

### Felling

- `strike_oak` (`itemEffect sub` on the oak's state, `fatigueCost`) needs an
  axe, a saw or a knife and reads `puutyö` with Voima (`affects: "roll"`).
  Every strike adds to the striker's `contribution`.
- The oak's toughness is set when gathering ends, from the number of
  participants, so felling takes about five minutes.
- Roles: an Urho or a Seppä strikes hardest; a Laulaja's work song lowers every
  participant's fatigue; an Eränkävijä clears the fallen branches, which speeds
  the strikes; a Tietäjä's origin of the oak keeps it from closing its wounds.

### Rewards

The small man offers each participant, once, the Kalevala's choice:

> _Kenpä siitä oksan otti, se otti ikuisen onnen;_
> _ken siitä latvan taittoi, se taittoi tiedon taidon;_
> _kenpä lehvästä lehvähti, lehvähti ikuisen lemmen._

| Choice            | Item         | Effect, all horizontal                                             |
| ----------------- | ------------ | ------------------------------------------------------------------ |
| Branch — luck     | `oak_branch` | A small bonus to finds; does not stack                             |
| Crown — knowledge | `oak_crown`  | Teaches a random origin the player lacks, even outside their class |
| Leaf — love       | `oak_leaf`   | A cosmetic and a title                                             |

Everyone who struck at least once may choose, whatever their contribution.
The leaf is a keepsake and its title is the account's, so both outlast a fresh
start; the branch and the crown affect play and go with the old character.

### Afterwards

An acorn is left where the oak stood, and `growth` starts again from zero.

**Tests:** each transition, the lapse below the minimum, the reward chosen
once, a tick under the lease, roles adding up as intended.

## 6. The chronicle

- A table `vworld_chronicle`: `world_id`, `at`, `kind`, `actors`, `params`.
- Events write a line — the oak's felling and who took part — and so do
  notable things players build.
- Lines are rendered from templates in Kalevala metre, in Finnish and English.
  Templates keep the text in hand; no model writes the chronicle.
- It is read by examining the rune stone, and from the welcome page. Needs the
  authored descriptions from 3.

## 7. More events

On the same framework, cheapest first:

| Event               | Ready / start             | Taking part                                          | Reward                                 |
| ------------------- | ------------------------- | ---------------------------------------------------- | -------------------------------------- |
| Kantele concert     | always / player, cooldown | Listening nearby; animals gather as for Väinämöinen  | A short blessing, a rare animal nearby |
| The elk of Hiisi    | cycle / player            | Chasing it down together (`movement: "flee"` exists) | Elk hide, a hunter's title             |
| The great ox        | cycle / player            | Felling the ox and the feast                         | A feast meal, cosmetics                |
| Louhi hides the sun | random / auto             | Smiths forge a new sun, or the hidden one is sought  | Smithing materials, a badge of honour  |

Once there are several, the registry should move into the database as a sixth
class repository with its own MCP tool, like the other five.

## Order

| #   | Piece                             | Size     | Needs                  |
| --- | --------------------------------- | -------- | ---------------------- |
| 1   | Home island, onboarding, visiting | L        | —                      |
| 2   | Classes, attributes, skills       | L        | —                      |
| 3   | Vocabulary and descriptions       | M        | —                      |
| 4   | Event framework                   | L        | —                      |
| 5   | The great oak                     | M        | 2, 4; the elder from 3 |
| 6   | Chronicle                         | S        | 3, 5                   |
| 7   | More events                       | S–M each | 4                      |

1–4 can proceed side by side. Each is its own series of conventional commits,
with the README and TODO files updated as it lands.
