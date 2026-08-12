# TODO — storytelling and interaction

What is left of the storytelling work started on 2026-08-12, which asked what
options there were for richer NPC interaction: roles, conversation, giving an
item for a hint, places with histories.

What shipped that day: authored NPC identity (names, descriptions, per-locale,
following placement edits), NPCs answering in the player's language, speech
bubbles, livings that hold a post or flee, dialogue trees with per-placement
overrides, and `livingEffect.affects: "actor"` — the quest flag that lets a
conversation remember anything at all.

This file is what did **not** get built, plus the caveats the work left behind.
Nothing here is blocking. Ordered roughly cheapest-first within each section.

Neighbouring documents, so this one stays about storytelling:

- [DOC-authoring-worlds.md](DOC-authoring-worlds.md) — how to author
  placements, identities, posts and linked worlds without code.
- [TODO.md](TODO.md) — the general backlog.
- [TODO-arch.md](TODO-arch.md) — scalability and runtime primitives.
- [DESIGN-targeting.md](DESIGN-targeting.md) — targeting and aiming.

## Authoring gaps (a feature exists, but only through the API)

Each of these has bitten already: the save reports success and the creator
cannot see, or cannot reach, what they just changed. Three separate instances
were fixed on 2026-08-12 (`execution`/`cost` missing from the action editor,
`dialogue` missing from the living editor, `behavior` present but never
loaded). These are the ones still open.

### Placement dialogue has no editor field

A placement's own conversation is authorable through the world-class CRUD route
and `virtualWorldManageWorldClasses`, but the placement row in the World Types
editor has no box for it — the same gap the living editor had before its
`dialogue` box. The row already renders identity fields for `npc` placements;
this belongs beside them.

### The action editor still exposes about half of an action class

Present: id, label, target kind, source items, logicSpec, livingEffect,
execution, cost, produces, experience, messages.

Absent: `validWhen`, `validation`, `targeting`, `durationMs`, `fatigueCost`,
`removes`, `itemEffect`, `progression`, `linkedWorld`, `canonicalId`.

`validWhen` is the one a story wants next: it gates an action on _who_ the
target is, which is how "this only works on the gatekeeper" is expressed
without a code branch.

### Creator actions all land in the `misc` category

The action palette groups by a server-assigned `category`, and only the
built-ins have one — so every authored action lands in `misc` together. A
`category` field on the action class, offered as a picker in the editor, is
the whole fix.

## Storytelling features not built

### Shops

Now a small step: a dialogue node whose choices are cost/produces pairs
already works, because a choice runs an ordinary action. What is missing is
_stock_ — a vendor should sell from what it carries rather than from thin air.
That wants a `produces[].source: "target_bag"` mode (and the matching
`cost[].destination`), so a trade moves items between two inventories instead
of creating and destroying them.

### Patrol

The one movement policy from the original list that was not built.
`roamRadius` keeps a living near a post and `movement: "flee"` steps it away
from a player, but neither walks a route. Patrol needs per-placement waypoints
and, unlike the others, real pathfinding: the walk-home step is greedy and
demonstrably cannot route around a river (see the caveat below).

### Houses with histories

From the original question, and still unaddressed. A house is a tile mod with
a `sourceKind`, and a tile mod has nowhere to hang text. The cheap path is a
`fixture` item placed inside — a hearth, a sign, a chest — carrying the
history in its state, which also gives the player something to examine.

That depends on the next item.

### Nothing authored can be examined

`examine` reports an item's class label and its stats. There is no authored
text anywhere in the item vocabulary: an item class has no `description`, and
examine has no path that would show one. This is the counterpart of the NPC
`identity.description` that shipped, and it is what "a place with a history"
would actually read.

### World descriptions are generated, not authored

The original question said "worlds can have descriptions". They cannot: the
world info panel shows a flavour line picked by `hashString(worldId) % 4` from
four hardcoded strings in `world-domain.ts`. A world class carries no
description field at all, so two worlds of the same authored class get
different randomly-assigned prose, and a creator cannot say anything about the
place they built. A `description`/`descriptions` pair on `WorldClassRecord`,
shaped exactly like the NPC identity block, replaces the hash.

### NPC barks

Speech bubbles come only from world chat, so anything an NPC says goes in the
chat log forever. An idle remark as a player passes — the thing that makes a
village feel inhabited — would flood it. Needs a speech path that reaches the
bubble without the log, which is a new stream event rather than a new
vocabulary.

### Reputation and factions

Falls out of what already exists: a per-faction value on the player, written by
`livingEffect.affects: "actor"`, read by `validWhen` and dialogue conditions.
No engine work identified — it wants authoring and a decision about naming
conventions for the values, not code.

### A journal, and resetting a quest

A player's quest flags are living values with no names and no listing, so a
player cannot see what they have started, and nothing can reset one. Both want
the same thing: a quest registry giving flags identity (name, description,
states). That is a fifth class repository and the heaviest item here — worth it
once several quests exist, not before.

Concretely today: `quest_gate` is set on the test player and there is no way to
clear it in game, so Aino greets them post-quest forever.

### NPC routines and a day cycle

Waypoints with times of day — the shopkeeper opens, the guard changes watch.
Wants patrol first, and a world clock, which does not exist.

### LLM-driven dialogue

Genuinely available here, and the natural fallback for free text an authored
tree does not match. Two constraints: it must run out of the NPC tick (an
async pending action — the tick has been killed by less), and the authored
tree should keep owning anything that grants an item or sets a flag, so a
model cannot be talked into paying out.

## Caveats left behind

### Dialogue

- **Conversation state is client-side** and re-validated per step. Nothing is
  stored, which is what makes a reload harmless, but it also means a
  conversation cannot span a session or remember anything the quest flags do
  not.
- **Every line in a node is spoken by the NPC.** There is no per-node speaker,
  so a narrator line ("the door groans open") has nowhere to live.
- **A choice runs exactly one action.** Two effects in one choice needs an
  action that does both.

### Movement

- **The walk home is greedy**, so a leashed living cannot route around terrain
  it did not cross. Aino spent an afternoon on the far bank of a river.
  Loading the world puts an out-of-radius authored living back on its post,
  which is the backstop rather than a fix.
- **`roamRadius` is class-level.** A placement can override a living's name and
  its conversation but not its post size.

### Ownership

- **Editing a built-in class claims it** (2026-08-12), and there is no way to
  release it. An empty `ownerIds` means "no opinion" on purpose, so a client
  round-tripping a record cannot accidentally disown it — which leaves no verb
  for deliberately handing a class back to the code definition. Wants one if it
  ever matters.
- **`npc_human` is currently creator-owned**, a side effect of testing
  class-level dialogue on 2026-08-12. It works, but no longer picks up code-side
  changes on deploy. Releasing it needs the verb above or a direct DB edit.

### Things verified less than they look

- **The editor field audit was static.** Every submitted field is loaded, no
  record key is a constant, every update handler preserves what the client
  omits — all read from the code, not exercised in a browser. A field loaded
  into the wrong element would still escape it.
- **Cross-instance class-cache freshness is reasoned, not demonstrated.** On a
  single-process deployment the writing instance patches its own cache, which
  is indistinguishable from the 15s reload actually working.

### Population

- **Ambient population is never trimmed.** The seeding race is fixed and
  respawn is capped, but a world that already grew past its manifest stays
  that way. Birdhaven ran at four times its manifest until the database was
  recreated. Trimming ambient livings to the manifest belongs in the per-world
  reconcile, which already knows how to remove what a class no longer declares.
- **A burst of first visitors to a fresh large world 504s.** Eight concurrent
  requests to an unseeded 100×100 world all hit the 10s script timeout;
  generation plus seeding is simply heavy. Pre-existing, and more an
  architecture item ([TODO-arch.md](TODO-arch.md)) than a storytelling one.
