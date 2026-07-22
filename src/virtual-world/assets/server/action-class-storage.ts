import { VWORLD_ACTION_CLASS_TABLE } from "./runtime-config.ts";
import {
  deleteWorldRowsWhere,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

export function loadAllActionClassRows(): any[] {
  return queryWorldRows(
    VWORLD_ACTION_CLASS_TABLE,
    JSON.stringify({}),
    1000,
    "action_id",
    "asc",
  );
}

export function upsertActionClassRow(row: {
  action_id: string;
  label_key: string;
  fallback_label: string;
  target_kind: string;
  source_item_ids_json: string;
  canonical_id: string;
  execution_json: string;
  validation_json: string;
  logic_spec_json: string;
  cost_json: string;
  produces_json: string;
  created_at: number;
  updated_at: number;
}): any | null {
  return upsertWorldRow(VWORLD_ACTION_CLASS_TABLE, ["action_id"], row);
}

export function deleteActionClassRow(actionId: string): void {
  if (!actionId) return;
  deleteWorldRowsWhere(
    VWORLD_ACTION_CLASS_TABLE,
    JSON.stringify({ action_id: String(actionId) }),
  );
}
