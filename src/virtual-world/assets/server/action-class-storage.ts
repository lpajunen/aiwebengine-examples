import {
  deleteWorldRowsWhere,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

type WorldDbLogFn = (msg: string, obj?: unknown) => void;

export function loadAllActionClassRows(
  actionClassTable: string,
  log: WorldDbLogFn,
): any[] {
  return queryWorldRows(
    actionClassTable,
    JSON.stringify({}),
    1000,
    "action_id",
    "asc",
    log,
  );
}

export function upsertActionClassRow(
  row: {
    action_id: string;
    label_key: string;
    fallback_label: string;
    target_kind: string;
    source_item_ids_json: string;
    canonical_id: string;
    execution_json: string;
    validation_json: string;
    logic_spec_json: string;
    created_at: number;
    updated_at: number;
  },
  actionClassTable: string,
  log: WorldDbLogFn,
): void {
  upsertWorldRow(actionClassTable, ["action_id"], row, log);
}

export function deleteActionClassRow(
  actionId: string,
  actionClassTable: string,
  log: WorldDbLogFn,
): void {
  if (!actionId) return;
  deleteWorldRowsWhere(
    actionClassTable,
    JSON.stringify({ action_id: String(actionId) }),
    log,
  );
}
