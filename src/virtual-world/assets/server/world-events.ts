export interface WorldEventDefinition {
  id: string;
  eventType: string;
}

export const WORLD_EVENT_DEFINITIONS: Record<string, WorldEventDefinition> = {
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
