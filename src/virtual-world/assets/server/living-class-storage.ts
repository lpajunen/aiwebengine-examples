import { VWORLD_LIVING_CLASS_TABLE } from "./runtime-config.ts";
import {
  deleteWorldRowsWhere,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

export function loadAllLivingClassRows(): any[] {
  return queryWorldRows(
    VWORLD_LIVING_CLASS_TABLE,
    JSON.stringify({}),
    1000,
    "class_id",
    "asc",
  );
}

export function upsertLivingClassRow(row: {
  class_id: string;
  kind: string;
  label_key: string;
  fallback_label: string;
  slot_definitions_json: string;
  value_template_json: string;
  value_schema_json: string;
  created_at: number;
  updated_at: number;
}): any | null {
  return upsertWorldRow(VWORLD_LIVING_CLASS_TABLE, ["class_id"], row);
}

export function deleteLivingClassRow(classId: string): void {
  if (!classId) return;
  deleteWorldRowsWhere(
    VWORLD_LIVING_CLASS_TABLE,
    JSON.stringify({ class_id: String(classId) }),
  );
}
