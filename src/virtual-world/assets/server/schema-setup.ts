import { vwLog } from "./diagnostics.ts";
import { parseWorldDbResult } from "./world-db.ts";
import {
  VWORLD_ACTION_CLASS_TABLE,
  VWORLD_CHAT_TABLE,
  VWORLD_DM_INDEX_TABLE,
  VWORLD_DM_TABLE,
  VWORLD_EVENT_SEQ_TABLE,
  VWORLD_ITEM_CLASS_TABLE,
  VWORLD_LIVING_CLASS_TABLE,
  VWORLD_NPC_ACTIVE_WORLD_TABLE,
  VWORLD_NPC_TABLE,
  VWORLD_NPC_TICK_LEASE_TABLE,
  VWORLD_NPC_TICK_TABLE,
  VWORLD_ONLINE_PRESENCE_TABLE,
  VWORLD_PLAYER_HEARTBEAT_TABLE,
  VWORLD_PLAYER_INVENTORY_TABLE,
  VWORLD_PLAYER_MOVE_LEASE_TABLE,
  VWORLD_PLAYER_NICK_TABLE,
  VWORLD_PLAYER_POSITION_TABLE,
  VWORLD_PLAYER_WORLD_TABLE,
  VWORLD_WORLD_CLASS_TABLE,
  VWORLD_WORLD_ITEM_META_TABLE,
  VWORLD_WORLD_ITEM_TABLE,
  VWORLD_WORLD_MOD_TABLE,
  VWORLD_WORLD_TYPE_TABLE,
} from "./runtime-config.ts";
type SchemaCollector = Array<any> | undefined;

function isBenignSchemaResult(result: any): boolean {
  if (!result || !result.error) return true;
  const msg = String(result.error || "").toLowerCase();
  return (
    msg.indexOf("already exists") !== -1 || msg.indexOf("duplicate") !== -1
  );
}

function reportSchemaResult(
  scope: "world" | "chat",
  op: string,
  tableName: string,
  result: any,
  columnName: string | undefined,
): void {
  if (isBenignSchemaResult(result)) return;
  vwLog(scope + " schema setup failed", {
    op: op,
    table: tableName,
    column: columnName || "",
    error: String(result && result.error ? result.error : "unknown"),
  });
}

function executeSchemaStep(
  scope: "world" | "chat",
  op: string,
  tableName: string,
  run: () => string,
  columnName: string | undefined,
  collector: SchemaCollector,
): any {
  let result = null;
  try {
    result = parseWorldDbResult(run());
  } catch (e) {
    result = { error: "threw: " + String(e) };
  }
  reportSchemaResult(scope, op, tableName, result, columnName);
  if (collector) {
    collector.push({
      scope: scope,
      op: op,
      table: tableName,
      column: columnName || "",
      ok: !result || !result.error,
      error: result && result.error ? String(result.error) : "",
    });
  }
  return result;
}

export function runWorldSchemaStep(
  op: string,
  tableName: string,
  run: () => string,
  columnName?: string,
  collector?: Array<any>,
): any {
  return executeSchemaStep("world", op, tableName, run, columnName, collector);
}

export function runChatSchemaStep(
  op: string,
  tableName: string,
  run: () => string,
  columnName?: string,
  collector?: Array<any>,
): any {
  return executeSchemaStep("chat", op, tableName, run, columnName, collector);
}

export function ensureLateWorldDatabaseSchema(collector?: Array<any>): void {
  runWorldSchemaStep(
    "createTable",
    VWORLD_WORLD_TYPE_TABLE,
    function () {
      return database.createTable(VWORLD_WORLD_TYPE_TABLE);
    },
    undefined,
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_WORLD_TYPE_TABLE,
    function () {
      return database.addTextColumn(VWORLD_WORLD_TYPE_TABLE, "world_id", false);
    },
    "world_id",
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_WORLD_TYPE_TABLE,
    function () {
      return database.addTextColumn(
        VWORLD_WORLD_TYPE_TABLE,
        "world_type",
        false,
      );
    },
    "world_type",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    VWORLD_WORLD_TYPE_TABLE,
    function () {
      return database.addIntegerColumn(VWORLD_WORLD_TYPE_TABLE, "rows", true);
    },
    "rows",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    VWORLD_WORLD_TYPE_TABLE,
    function () {
      return database.addIntegerColumn(VWORLD_WORLD_TYPE_TABLE, "cols", true);
    },
    "cols",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    VWORLD_WORLD_TYPE_TABLE,
    function () {
      return database.addIntegerColumn(
        VWORLD_WORLD_TYPE_TABLE,
        "updated_ts",
        false,
      );
    },
    "updated_ts",
    collector,
  );
  runWorldSchemaStep(
    "addUniqueIndex",
    VWORLD_WORLD_TYPE_TABLE,
    function () {
      return database.addUniqueIndex(
        VWORLD_WORLD_TYPE_TABLE,
        JSON.stringify(["world_id"]),
      );
    },
    undefined,
    collector,
  );

  runWorldSchemaStep(
    "createTable",
    VWORLD_NPC_TABLE,
    function () {
      return database.createTable(VWORLD_NPC_TABLE);
    },
    undefined,
    collector,
  );
  [
    ["addTextColumn", "npc_id", false],
    ["addTextColumn", "world_id", false],
    ["addIntegerColumn", "row", false],
    ["addIntegerColumn", "col", false],
    ["addIntegerColumn", "seq", false],
    ["addIntegerColumn", "rotation", false],
    ["addTextColumn", "state", true],
    ["addIntegerColumn", "ts", false],
    ["addTextColumn", "living_class_id", true],
    ["addTextColumn", "slots_json", true],
    ["addTextColumn", "bag_json", true],
    ["addTextColumn", "values_json", true],
  ].forEach(function (entry) {
    runWorldSchemaStep(
      String(entry[0]),
      VWORLD_NPC_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_NPC_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_NPC_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
      collector,
    );
  });
  runWorldSchemaStep(
    "addUniqueIndex",
    VWORLD_NPC_TABLE,
    function () {
      return database.addUniqueIndex(
        VWORLD_NPC_TABLE,
        JSON.stringify(["npc_id"]),
      );
    },
    undefined,
    collector,
  );

  runWorldSchemaStep(
    "createTable",
    VWORLD_NPC_ACTIVE_WORLD_TABLE,
    function () {
      return database.createTable(VWORLD_NPC_ACTIVE_WORLD_TABLE);
    },
    undefined,
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_NPC_ACTIVE_WORLD_TABLE,
    function () {
      return database.addTextColumn(
        VWORLD_NPC_ACTIVE_WORLD_TABLE,
        "world_id",
        false,
      );
    },
    "world_id",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    VWORLD_NPC_ACTIVE_WORLD_TABLE,
    function () {
      return database.addIntegerColumn(
        VWORLD_NPC_ACTIVE_WORLD_TABLE,
        "last_active_ts",
        false,
      );
    },
    "last_active_ts",
    collector,
  );
  runWorldSchemaStep(
    "addUniqueIndex",
    VWORLD_NPC_ACTIVE_WORLD_TABLE,
    function () {
      return database.addUniqueIndex(
        VWORLD_NPC_ACTIVE_WORLD_TABLE,
        JSON.stringify(["world_id"]),
      );
    },
    undefined,
    collector,
  );

  runWorldSchemaStep(
    "createTable",
    VWORLD_NPC_TICK_TABLE,
    function () {
      return database.createTable(VWORLD_NPC_TICK_TABLE);
    },
    undefined,
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    VWORLD_NPC_TICK_TABLE,
    function () {
      return database.addTextColumn(VWORLD_NPC_TICK_TABLE, "world_id", false);
    },
    "world_id",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    VWORLD_NPC_TICK_TABLE,
    function () {
      return database.addIntegerColumn(
        VWORLD_NPC_TICK_TABLE,
        "last_tick_ts",
        false,
      );
    },
    "last_tick_ts",
    collector,
  );
  runWorldSchemaStep(
    "addUniqueIndex",
    VWORLD_NPC_TICK_TABLE,
    function () {
      return database.addUniqueIndex(
        VWORLD_NPC_TICK_TABLE,
        JSON.stringify(["world_id"]),
      );
    },
    undefined,
    collector,
  );

  runWorldSchemaStep(
    "createLeaseTable",
    VWORLD_NPC_TICK_LEASE_TABLE,
    function () {
      return database.createLeaseTable(VWORLD_NPC_TICK_LEASE_TABLE);
    },
    undefined,
    collector,
  );
}

export function ensureWorldDatabaseSchema(): void {
  const step = function (
    op: string,
    tableName: string,
    run: () => string,
    columnName?: string,
  ) {
    const result = (() => {
      try {
        return parseWorldDbResult(run());
      } catch (e) {
        return { error: "threw: " + String(e) };
      }
    })();
    reportSchemaResult("world", op, tableName, result, columnName);
  };

  step("createTable", VWORLD_PLAYER_HEARTBEAT_TABLE, function () {
    return database.createTable(VWORLD_PLAYER_HEARTBEAT_TABLE);
  });
  step(
    "addTextColumn",
    VWORLD_PLAYER_HEARTBEAT_TABLE,
    function () {
      return database.addTextColumn(
        VWORLD_PLAYER_HEARTBEAT_TABLE,
        "user_id",
        false,
      );
    },
    "user_id",
  );
  step(
    "addIntegerColumn",
    VWORLD_PLAYER_HEARTBEAT_TABLE,
    function () {
      return database.addIntegerColumn(
        VWORLD_PLAYER_HEARTBEAT_TABLE,
        "heartbeat_ts",
        false,
      );
    },
    "heartbeat_ts",
  );
  step("addUniqueIndex", VWORLD_PLAYER_HEARTBEAT_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_PLAYER_HEARTBEAT_TABLE,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", VWORLD_EVENT_SEQ_TABLE, function () {
    return database.createTable(VWORLD_EVENT_SEQ_TABLE);
  });
  step(
    "addTextColumn",
    VWORLD_EVENT_SEQ_TABLE,
    function () {
      return database.addTextColumn(VWORLD_EVENT_SEQ_TABLE, "scope_key", false);
    },
    "scope_key",
  );
  step(
    "addIntegerColumn",
    VWORLD_EVENT_SEQ_TABLE,
    function () {
      return database.addIntegerColumn(VWORLD_EVENT_SEQ_TABLE, "seq", false);
    },
    "seq",
  );
  step("addUniqueIndex", VWORLD_EVENT_SEQ_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_EVENT_SEQ_TABLE,
      JSON.stringify(["scope_key"]),
    );
  });

  step("createTable", VWORLD_PLAYER_MOVE_LEASE_TABLE, function () {
    return database.createTable(VWORLD_PLAYER_MOVE_LEASE_TABLE);
  });
  step(
    "addTextColumn",
    VWORLD_PLAYER_MOVE_LEASE_TABLE,
    function () {
      return database.addTextColumn(
        VWORLD_PLAYER_MOVE_LEASE_TABLE,
        "user_id",
        false,
      );
    },
    "user_id",
  );
  step(
    "addTextColumn",
    VWORLD_PLAYER_MOVE_LEASE_TABLE,
    function () {
      return database.addTextColumn(
        VWORLD_PLAYER_MOVE_LEASE_TABLE,
        "session_id",
        false,
      );
    },
    "session_id",
  );
  step(
    "addIntegerColumn",
    VWORLD_PLAYER_MOVE_LEASE_TABLE,
    function () {
      return database.addIntegerColumn(
        VWORLD_PLAYER_MOVE_LEASE_TABLE,
        "expires_ts",
        false,
      );
    },
    "expires_ts",
  );
  step("addUniqueIndex", VWORLD_PLAYER_MOVE_LEASE_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_PLAYER_MOVE_LEASE_TABLE,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", VWORLD_ONLINE_PRESENCE_TABLE, function () {
    return database.createTable(VWORLD_ONLINE_PRESENCE_TABLE);
  });
  [
    ["addTextColumn", "user_id", false],
    ["addTextColumn", "world_id", false],
    ["addTextColumn", "nick", false],
    ["addIntegerColumn", "login_at", false],
    ["addIntegerColumn", "last_active_ts", false],
    ["addTextColumn", "session_id", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_ONLINE_PRESENCE_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_ONLINE_PRESENCE_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_ONLINE_PRESENCE_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_ONLINE_PRESENCE_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_ONLINE_PRESENCE_TABLE,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", VWORLD_PLAYER_NICK_TABLE, function () {
    return database.createTable(VWORLD_PLAYER_NICK_TABLE);
  });
  [
    ["addTextColumn", "user_id", false],
    ["addTextColumn", "nick", false],
    ["addIntegerColumn", "updated_ts", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_PLAYER_NICK_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_PLAYER_NICK_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_PLAYER_NICK_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_PLAYER_NICK_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_PLAYER_NICK_TABLE,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", VWORLD_PLAYER_WORLD_TABLE, function () {
    return database.createTable(VWORLD_PLAYER_WORLD_TABLE);
  });
  [
    ["addTextColumn", "user_id", false],
    ["addTextColumn", "world_id", false],
    ["addIntegerColumn", "updated_ts", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_PLAYER_WORLD_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_PLAYER_WORLD_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_PLAYER_WORLD_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_PLAYER_WORLD_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_PLAYER_WORLD_TABLE,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", VWORLD_PLAYER_POSITION_TABLE, function () {
    return database.createTable(VWORLD_PLAYER_POSITION_TABLE);
  });
  [
    ["addTextColumn", "user_id", false],
    ["addTextColumn", "world_id", false],
    ["addIntegerColumn", "row", false],
    ["addIntegerColumn", "col", false],
    ["addIntegerColumn", "seq", false],
    ["addIntegerColumn", "rotation", false],
    ["addTextColumn", "session_id", true],
    ["addIntegerColumn", "updated_ts", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_PLAYER_POSITION_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_PLAYER_POSITION_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_PLAYER_POSITION_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_PLAYER_POSITION_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_PLAYER_POSITION_TABLE,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", VWORLD_PLAYER_INVENTORY_TABLE, function () {
    return database.createTable(VWORLD_PLAYER_INVENTORY_TABLE);
  });
  [
    ["addTextColumn", "user_id", false],
    ["addTextColumn", "living_class_id", true],
    ["addTextColumn", "slots_json", true],
    ["addTextColumn", "bag_json", true],
    ["addTextColumn", "values_json", true],
    ["addIntegerColumn", "updated_ts", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_PLAYER_INVENTORY_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_PLAYER_INVENTORY_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_PLAYER_INVENTORY_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_PLAYER_INVENTORY_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_PLAYER_INVENTORY_TABLE,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", VWORLD_WORLD_MOD_TABLE, function () {
    return database.createTable(VWORLD_WORLD_MOD_TABLE);
  });
  [
    ["addTextColumn", "world_id", false],
    ["addTextColumn", "tile_key", false],
    ["addIntegerColumn", "row", false],
    ["addIntegerColumn", "col", false],
    ["addTextColumn", "layer", false],
    ["addTextColumn", "tile_type", false],
    ["addTextColumn", "actor_id", true],
    ["addTextColumn", "actor_type", true],
    ["addIntegerColumn", "timestamp", false],
    ["addTextColumn", "payload_json", true],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_WORLD_MOD_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_WORLD_MOD_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_WORLD_MOD_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_WORLD_MOD_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_WORLD_MOD_TABLE,
      JSON.stringify(["world_id", "tile_key", "layer"]),
    );
  });

  step("createTable", VWORLD_WORLD_ITEM_TABLE, function () {
    return database.createTable(VWORLD_WORLD_ITEM_TABLE);
  });
  [
    ["addTextColumn", "item_id", false],
    ["addTextColumn", "world_id", false],
    ["addIntegerColumn", "row", false],
    ["addIntegerColumn", "col", false],
    ["addTextColumn", "type", false],
    ["addIntegerColumn", "created_at", false],
    ["addTextColumn", "destination_world_id", true],
    ["addTextColumn", "destination_world_type", true],
    ["addTextColumn", "state_json", true],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_WORLD_ITEM_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_WORLD_ITEM_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_WORLD_ITEM_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_WORLD_ITEM_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_WORLD_ITEM_TABLE,
      JSON.stringify(["item_id"]),
    );
  });

  step("createTable", VWORLD_WORLD_ITEM_META_TABLE, function () {
    return database.createTable(VWORLD_WORLD_ITEM_META_TABLE);
  });
  step(
    "addTextColumn",
    VWORLD_WORLD_ITEM_META_TABLE,
    function () {
      return database.addTextColumn(
        VWORLD_WORLD_ITEM_META_TABLE,
        "world_id",
        false,
      );
    },
    "world_id",
  );
  step(
    "addIntegerColumn",
    VWORLD_WORLD_ITEM_META_TABLE,
    function () {
      return database.addIntegerColumn(
        VWORLD_WORLD_ITEM_META_TABLE,
        "next_item_seq",
        false,
        "0",
      );
    },
    "next_item_seq",
  );
  step(
    "addIntegerColumn",
    VWORLD_WORLD_ITEM_META_TABLE,
    function () {
      return database.addIntegerColumn(
        VWORLD_WORLD_ITEM_META_TABLE,
        "seeded",
        false,
        "0",
      );
    },
    "seeded",
  );
  step(
    "addIntegerColumn",
    VWORLD_WORLD_ITEM_META_TABLE,
    function () {
      return database.addIntegerColumn(
        VWORLD_WORLD_ITEM_META_TABLE,
        "updated_ts",
        false,
      );
    },
    "updated_ts",
  );
  step("addUniqueIndex", VWORLD_WORLD_ITEM_META_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_WORLD_ITEM_META_TABLE,
      JSON.stringify(["world_id"]),
    );
  });

  step("createTable", VWORLD_ITEM_CLASS_TABLE, function () {
    return database.createTable(VWORLD_ITEM_CLASS_TABLE);
  });
  [
    ["addTextColumn", "class_id", false],
    ["addTextColumn", "kind", false],
    ["addIntegerColumn", "spawnable", false],
    ["addIntegerColumn", "extra", false],
    ["addIntegerColumn", "non_droppable", false],
    ["addIntegerColumn", "color", false],
    ["addTextColumn", "label_key", false],
    ["addTextColumn", "fallback_label", false],
    ["addTextColumn", "action_ids_json", false],
    ["addTextColumn", "state_template_json", false],
    ["addIntegerColumn", "created_at", false],
    ["addIntegerColumn", "updated_at", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_ITEM_CLASS_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_ITEM_CLASS_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_ITEM_CLASS_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_ITEM_CLASS_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_ITEM_CLASS_TABLE,
      JSON.stringify(["class_id"]),
    );
  });

  step("createTable", VWORLD_ACTION_CLASS_TABLE, function () {
    return database.createTable(VWORLD_ACTION_CLASS_TABLE);
  });
  [
    ["addTextColumn", "action_id", false],
    ["addTextColumn", "label_key", false],
    ["addTextColumn", "fallback_label", false],
    ["addTextColumn", "target_kind", false],
    ["addTextColumn", "source_item_ids_json", false],
    ["addTextColumn", "canonical_id", true],
    ["addTextColumn", "execution_json", true],
    ["addTextColumn", "validation_json", true],
    ["addTextColumn", "logic_spec_json", true],
    ["addIntegerColumn", "created_at", false],
    ["addIntegerColumn", "updated_at", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_ACTION_CLASS_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_ACTION_CLASS_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_ACTION_CLASS_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_ACTION_CLASS_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_ACTION_CLASS_TABLE,
      JSON.stringify(["action_id"]),
    );
  });

  step("createTable", VWORLD_LIVING_CLASS_TABLE, function () {
    return database.createTable(VWORLD_LIVING_CLASS_TABLE);
  });
  [
    ["addTextColumn", "class_id", false],
    ["addTextColumn", "kind", false],
    ["addTextColumn", "label_key", false],
    ["addTextColumn", "fallback_label", false],
    ["addTextColumn", "slot_definitions_json", false],
    ["addTextColumn", "value_template_json", false],
    ["addTextColumn", "value_schema_json", false],
    ["addIntegerColumn", "created_at", false],
    ["addIntegerColumn", "updated_at", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_LIVING_CLASS_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_LIVING_CLASS_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_LIVING_CLASS_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_LIVING_CLASS_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_LIVING_CLASS_TABLE,
      JSON.stringify(["class_id"]),
    );
  });

  step("createTable", VWORLD_WORLD_CLASS_TABLE, function () {
    return database.createTable(VWORLD_WORLD_CLASS_TABLE);
  });
  [
    ["addTextColumn", "class_id", false],
    ["addTextColumn", "base_type", false],
    ["addIntegerColumn", "rows", false],
    ["addIntegerColumn", "cols", false],
    ["addTextColumn", "label_key", false],
    ["addTextColumn", "fallback_label", false],
    ["addIntegerColumn", "created_at", false],
    ["addIntegerColumn", "updated_at", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_WORLD_CLASS_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_WORLD_CLASS_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_WORLD_CLASS_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_WORLD_CLASS_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_WORLD_CLASS_TABLE,
      JSON.stringify(["class_id"]),
    );
  });

  ensureLateWorldDatabaseSchema();
}

export function ensureChatDatabaseSchema(collector?: Array<any>): void {
  const step = function (
    op: string,
    tableName: string,
    run: () => string,
    columnName?: string,
  ) {
    runChatSchemaStep(op, tableName, run, columnName, collector);
  };

  step("createTable", VWORLD_CHAT_TABLE, function () {
    return database.createTable(VWORLD_CHAT_TABLE);
  });
  [
    ["addTextColumn", "message_id", false],
    ["addTextColumn", "world_id", false],
    ["addTextColumn", "sender_id", false],
    ["addTextColumn", "sender_nick", false],
    ["addTextColumn", "text", false],
    ["addIntegerColumn", "ts", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_CHAT_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_CHAT_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_CHAT_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_CHAT_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_CHAT_TABLE,
      JSON.stringify(["message_id"]),
    );
  });

  step("createTable", VWORLD_DM_TABLE, function () {
    return database.createTable(VWORLD_DM_TABLE);
  });
  [
    ["addTextColumn", "message_id", false],
    ["addTextColumn", "conversation_key", false],
    ["addTextColumn", "sender_id", false],
    ["addTextColumn", "sender_nick", false],
    ["addTextColumn", "recipient_id", false],
    ["addTextColumn", "text", false],
    ["addIntegerColumn", "ts", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_DM_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_DM_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_DM_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_DM_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_DM_TABLE,
      JSON.stringify(["message_id"]),
    );
  });

  step("createTable", VWORLD_DM_INDEX_TABLE, function () {
    return database.createTable(VWORLD_DM_INDEX_TABLE);
  });
  [
    ["addTextColumn", "user_id", false],
    ["addTextColumn", "other_user_id", false],
    ["addIntegerColumn", "last_ts", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      VWORLD_DM_INDEX_TABLE,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              VWORLD_DM_INDEX_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              VWORLD_DM_INDEX_TABLE,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", VWORLD_DM_INDEX_TABLE, function () {
    return database.addUniqueIndex(
      VWORLD_DM_INDEX_TABLE,
      JSON.stringify(["user_id", "other_user_id"]),
    );
  });
}
