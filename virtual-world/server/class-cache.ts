// Keeping this instance's class caches from going stale.
//
// Each class repository (item, action, living, tile, world) holds its rows in
// a module-level cache built once and then trusted forever. In a
// multi-instance deployment that is wrong: a class edited through the CRUD
// route or the MCP tool is written by whichever instance served that request,
// and every other instance keeps serving the old record — including the one
// running the NPC tick.
//
// Two things this deliberately does NOT do, both learned the expensive way:
//
// 1. It does not call the repositories' refresh*Cache(). Those bootstrap as
//    well as load, upserting every unowned built-in row, so calling them
//    periodically would mean a steady stream of writes. The reload*Cache()
//    functions are the read-only half, and they are what this calls.
//
// 2. It does not put the staleness check inside getItemClass/getLivingClass/
//    getActionClass. That was the first attempt, and it took a world-state
//    request from ~1s to ~5s: those getters are called per item, per action
//    and per living all over the codebase, and a Date.now() apiece is not free
//    in this engine. So the check lives at a few coarse entry points instead —
//    once per tick, once per action, once per state build — where one host
//    call is nothing and the freshness is just as good.
//
// A time window rather than a version row in the database: the repositories
// hold tens of rows each, so re-reading one costs about what checking a
// version would, and nothing new has to be kept in sync. The cost is that an
// edit takes up to CLASS_CACHE_TTL_MS to reach another instance, which for
// authoring content is imperceptible.

import {
  reloadActionClassCache,
  reloadItemClassCache,
} from "./item-registry.ts";
import { reloadLivingClassCache } from "./living-registry.ts";
import { reloadTileClassCache } from "./tile-registry.ts";
import { reloadWorldClassCache } from "./world-class-storage.ts";

// Long enough that a busy tick pays for at most one reload per window, short
// enough that a creator editing a class sees it take effect before they have
// finished wondering whether it worked.
export const CLASS_CACHE_TTL_MS = 15000;

let lastReloadAt = 0;

/**
 * Re-reads every class repository, at most once per CLASS_CACHE_TTL_MS. Call
 * it at the top of an operation, never inside a per-entity loop.
 *
 * Claims the window before doing the work, so a reload that throws costs one
 * attempt per window rather than one per call.
 */
export function maybeReloadClassCaches(): void {
  const now = Date.now();
  if (now - lastReloadAt < CLASS_CACHE_TTL_MS) return;
  lastReloadAt = now;
  reloadItemClassCache();
  reloadActionClassCache();
  reloadLivingClassCache();
  reloadTileClassCache();
  reloadWorldClassCache();
}
