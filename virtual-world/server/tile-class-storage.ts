import { VWORLD_TILE_CLASS_TABLE } from "./runtime-config.ts";
import {
  deleteWorldRowsWhere,
  queryWorldRows,
  upsertWorldRow,
} from "./world-db.ts";

export function loadAllTileClassRows(): any[] {
  return queryWorldRows(
    VWORLD_TILE_CLASS_TABLE,
    JSON.stringify({}),
    1000,
    "class_id",
    "asc",
  );
}

export function upsertTileClassRow(row: {
  class_id: string;
  tile_value: number;
  walkable: number;
  layer: string;
  visual_json: string;
  owner_ids_json: string;
  labels_json: string;
  created_at: number;
  updated_at: number;
}): any | null {
  return upsertWorldRow(VWORLD_TILE_CLASS_TABLE, ["class_id"], row);
}

export function deleteTileClassRow(classId: string): void {
  if (!classId) return;
  deleteWorldRowsWhere(
    VWORLD_TILE_CLASS_TABLE,
    JSON.stringify({ class_id: String(classId) }),
  );
}
