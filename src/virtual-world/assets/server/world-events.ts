export interface WorldEventDefinition {
  id: string;
  eventType: string;
}

export const WORLD_EVENT_DEFINITIONS: Record<string, WorldEventDefinition> = {
  // One event for every tile mod, whatever kind of thing wrote it: the payload
  // carries source_kind and tile_type, so a client repaints the square without
  // knowing which action caused it. tree_changed/house_changed are the two
  // names this replaced; they stay declared so rows (and browser tabs) that
  // still name them keep working — the client routes all three to the same
  // handler.
  world_mod_changed: {
    id: "world_mod_changed",
    eventType: "world_mod_changed",
  },
  tree_changed: {
    id: "tree_changed",
    eventType: "tree_changed",
  },
  house_changed: {
    id: "house_changed",
    eventType: "house_changed",
  },
};

export function getWorldEventDefinition(
  worldEventId: string | null | undefined,
): WorldEventDefinition | null {
  return WORLD_EVENT_DEFINITIONS[String(worldEventId || "")] || null;
}
