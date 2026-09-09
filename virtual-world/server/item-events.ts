export type ItemChangeDeltaKind = "add" | "remove" | "snapshot";

export interface ItemChangeDefinition {
  id: string;
  deltaKind: ItemChangeDeltaKind;
}

export const ITEM_CHANGE_DEFINITIONS: Record<string, ItemChangeDefinition> = {
  pick: {
    id: "pick",
    deltaKind: "remove",
  },
  drop: {
    id: "drop",
    deltaKind: "add",
  },
  portal_create: {
    id: "portal_create",
    deltaKind: "add",
  },
  portal_remove: {
    id: "portal_remove",
    deltaKind: "remove",
  },
  door_create: {
    id: "door_create",
    deltaKind: "add",
  },
  door_remove: {
    id: "door_remove",
    deltaKind: "remove",
  },
  door_state: {
    id: "door_state",
    deltaKind: "snapshot",
  },
  blessing_place: {
    id: "blessing_place",
    deltaKind: "add",
  },
  item_break_destroy: {
    id: "item_break_destroy",
    deltaKind: "remove",
  },
  item_break_damage: {
    id: "item_break_damage",
    deltaKind: "snapshot",
  },
  item_fix: {
    id: "item_fix",
    deltaKind: "snapshot",
  },
  item_bury_destroy: {
    id: "item_bury_destroy",
    deltaKind: "remove",
  },
  npc_died: {
    id: "npc_died",
    deltaKind: "add",
  },
  item_respawn: {
    id: "item_respawn",
    deltaKind: "add",
  },
  ingredient_consume: {
    id: "ingredient_consume",
    deltaKind: "remove",
  },
  container_put: {
    id: "container_put",
    deltaKind: "snapshot",
  },
  container_get: {
    id: "container_get",
    deltaKind: "snapshot",
  },
};

export function getItemChangeDefinition(
  itemChangeId: string | null | undefined,
): ItemChangeDefinition | null {
  return ITEM_CHANGE_DEFINITIONS[String(itemChangeId || "")] || null;
}
