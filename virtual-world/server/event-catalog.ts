// Every event the game has. Each module registers its own definition in
// EVENT_DEFINITIONS (event-registry.ts) as it loads; importing this module is
// what loads them, so every runtime that ticks, starts, shows or rewards an
// event imports it. event-registry.ts cannot import them itself: each event
// module imports events.ts, which imports the registry.
import "./great-oak.ts";
import "./kantele-concert.ts";
