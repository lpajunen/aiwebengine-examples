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
  blessing_place: {
    id: "blessing_place",
    deltaKind: "add",
  },
};

export function getItemChangeDefinition(
  itemChangeId: string | null | undefined,
): ItemChangeDefinition | null {
  return ITEM_CHANGE_DEFINITIONS[String(itemChangeId || "")] || null;
}
