import { VWORLD_ITEM_CLASS_TABLE } from "./runtime-config.ts";
import {
  deleteWorldRowsWhere,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

export function loadAllItemClassRows(): any[] {
  return queryWorldRows(
    VWORLD_ITEM_CLASS_TABLE,
    JSON.stringify({}),
    1000,
    "class_id",
    "asc",
  );
}

export function upsertItemClassRow(row: {
  class_id: string;
  kind: string;
  spawnable: number;
  extra: number;
  non_droppable: number;
  non_pickable: number;
  color: number;
  label_key: string;
  fallback_label: string;
  action_ids_json: string;
  state_template_json: string;
  created_at: number;
  updated_at: number;
}): any | null {
  return upsertWorldRow(VWORLD_ITEM_CLASS_TABLE, ["class_id"], row);
}

export function deleteItemClassRow(classId: string): void {
  if (!classId) return;
  deleteWorldRowsWhere(
    VWORLD_ITEM_CLASS_TABLE,
    JSON.stringify({ class_id: String(classId) }),
  );
}
