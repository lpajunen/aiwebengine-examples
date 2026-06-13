import {
  deleteWorldRowsWhere,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

type WorldDbLogFn = (msg: string, obj?: unknown) => void;

export function loadAllItemClassRows(
  itemClassTable: string,
  log: WorldDbLogFn,
): any[] {
  return queryWorldRows(
    itemClassTable,
    JSON.stringify({}),
    1000,
    "class_id",
    "asc",
    log,
  );
}

export function upsertItemClassRow(
  row: {
    class_id: string;
    kind: string;
    spawnable: number;
    extra: number;
    non_droppable: number;
    color: number;
    label_key: string;
    fallback_label: string;
    action_ids_json: string;
    state_template_json: string;
    created_at: number;
    updated_at: number;
  },
  itemClassTable: string,
  log: WorldDbLogFn,
): void {
  upsertWorldRow(itemClassTable, ["class_id"], row, log);
}

export function deleteItemClassRow(
  classId: string,
  itemClassTable: string,
  log: WorldDbLogFn,
): void {
  if (!classId) return;
  deleteWorldRowsWhere(
    itemClassTable,
    JSON.stringify({ class_id: String(classId) }),
    log,
  );
}
