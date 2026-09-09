import { VWORLD_ADMIN_TABLE } from "./runtime-config.ts";
import { queryWorldRows } from "./world-db.ts";

// vworld_admins has no CRUD route or MCP tool — rows are inserted directly
// via the DB by an operator. Checked live (no cache) since this is the
// override authority for class-editing permissions.
export function isAdminUser(userId: string): boolean {
  const id = String(userId || "");
  if (!id) return false;
  const rows = queryWorldRows(
    VWORLD_ADMIN_TABLE,
    JSON.stringify({ user_id: id }),
    1,
    "user_id",
    "asc",
  );
  return rows.length > 0;
}
