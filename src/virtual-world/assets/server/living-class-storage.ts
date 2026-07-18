import {
  deleteWorldRowsWhere,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

type WorldDbLogFn = (msg: string, obj?: unknown) => void;

export function loadAllLivingClassRows(
  livingClassTable: string,
  log: WorldDbLogFn,
): any[] {
  return queryWorldRows(
    livingClassTable,
    JSON.stringify({}),
    1000,
    "class_id",
    "asc",
    log,
  );
}

export function upsertLivingClassRow(
  row: {
    class_id: string;
    kind: string;
    label_key: string;
    fallback_label: string;
    slot_definitions_json: string;
    value_template_json: string;
    value_schema_json: string;
    created_at: number;
    updated_at: number;
  },
  livingClassTable: string,
  log: WorldDbLogFn,
): any | null {
  return upsertWorldRow(livingClassTable, ["class_id"], row, log);
}

export function deleteLivingClassRow(
  classId: string,
  livingClassTable: string,
  log: WorldDbLogFn,
): void {
  if (!classId) return;
  deleteWorldRowsWhere(
    livingClassTable,
    JSON.stringify({ class_id: String(classId) }),
    log,
  );
}
