type SchemaLogFn = (msg: string, obj?: unknown) => void;
type ParseFn = (raw: string) => any;
type SchemaCollector = Array<any> | undefined;

type WorldSchemaTables = {
  worldType: string;
  npc: string;
  npcActiveWorld: string;
  npcTick: string;
  npcTickLease: string;
  playerHeartbeat: string;
  playerMoveLease: string;
  onlinePresence: string;
  playerNick: string;
  playerWorld: string;
  playerPosition: string;
  playerInventory: string;
  worldMod: string;
  worldItem: string;
  worldItemMeta: string;
  itemClass: string;
  actionClass: string;
  livingClass: string;
  eventSeq: string;
};

type ChatSchemaTables = {
  chat: string;
  dm: string;
  dmIndex: string;
};

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
  log: SchemaLogFn,
): void {
  if (isBenignSchemaResult(result)) return;
  log(scope + " schema setup failed", {
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
  parse: ParseFn,
  log: SchemaLogFn,
): any {
  let result = null;
  try {
    result = parse(run());
  } catch (e) {
    result = { error: "threw: " + String(e) };
  }
  reportSchemaResult(scope, op, tableName, result, columnName, log);
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
  parseWorldDbResult: ParseFn,
  log: SchemaLogFn,
  columnName?: string,
  collector?: Array<any>,
): any {
  return executeSchemaStep(
    "world",
    op,
    tableName,
    run,
    columnName,
    collector,
    parseWorldDbResult,
    log,
  );
}

export function runChatSchemaStep(
  op: string,
  tableName: string,
  run: () => string,
  parseChatDbResult: ParseFn,
  log: SchemaLogFn,
  columnName?: string,
  collector?: Array<any>,
): any {
  return executeSchemaStep(
    "chat",
    op,
    tableName,
    run,
    columnName,
    collector,
    parseChatDbResult,
    log,
  );
}

export function ensureLateWorldDatabaseSchema(
  tables: Pick<
    WorldSchemaTables,
    "worldType" | "npc" | "npcActiveWorld" | "npcTick" | "npcTickLease"
  >,
  parseWorldDbResult: ParseFn,
  log: SchemaLogFn,
  collector?: Array<any>,
): void {
  runWorldSchemaStep(
    "createTable",
    tables.worldType,
    function () {
      return database.createTable(tables.worldType);
    },
    parseWorldDbResult,
    log,
    undefined,
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    tables.worldType,
    function () {
      return database.addTextColumn(tables.worldType, "world_id", false);
    },
    parseWorldDbResult,
    log,
    "world_id",
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    tables.worldType,
    function () {
      return database.addTextColumn(tables.worldType, "world_type", false);
    },
    parseWorldDbResult,
    log,
    "world_type",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    tables.worldType,
    function () {
      return database.addIntegerColumn(tables.worldType, "updated_ts", false);
    },
    parseWorldDbResult,
    log,
    "updated_ts",
    collector,
  );
  runWorldSchemaStep(
    "addUniqueIndex",
    tables.worldType,
    function () {
      return database.addUniqueIndex(
        tables.worldType,
        JSON.stringify(["world_id"]),
      );
    },
    parseWorldDbResult,
    log,
    undefined,
    collector,
  );

  runWorldSchemaStep(
    "createTable",
    tables.npc,
    function () {
      return database.createTable(tables.npc);
    },
    parseWorldDbResult,
    log,
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
      tables.npc,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.npc,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.npc,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      parseWorldDbResult,
      log,
      String(entry[1]),
      collector,
    );
  });
  runWorldSchemaStep(
    "addUniqueIndex",
    tables.npc,
    function () {
      return database.addUniqueIndex(tables.npc, JSON.stringify(["npc_id"]));
    },
    parseWorldDbResult,
    log,
    undefined,
    collector,
  );

  runWorldSchemaStep(
    "createTable",
    tables.npcActiveWorld,
    function () {
      return database.createTable(tables.npcActiveWorld);
    },
    parseWorldDbResult,
    log,
    undefined,
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    tables.npcActiveWorld,
    function () {
      return database.addTextColumn(tables.npcActiveWorld, "world_id", false);
    },
    parseWorldDbResult,
    log,
    "world_id",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    tables.npcActiveWorld,
    function () {
      return database.addIntegerColumn(
        tables.npcActiveWorld,
        "last_active_ts",
        false,
      );
    },
    parseWorldDbResult,
    log,
    "last_active_ts",
    collector,
  );
  runWorldSchemaStep(
    "addUniqueIndex",
    tables.npcActiveWorld,
    function () {
      return database.addUniqueIndex(
        tables.npcActiveWorld,
        JSON.stringify(["world_id"]),
      );
    },
    parseWorldDbResult,
    log,
    undefined,
    collector,
  );

  runWorldSchemaStep(
    "createTable",
    tables.npcTick,
    function () {
      return database.createTable(tables.npcTick);
    },
    parseWorldDbResult,
    log,
    undefined,
    collector,
  );
  runWorldSchemaStep(
    "addTextColumn",
    tables.npcTick,
    function () {
      return database.addTextColumn(tables.npcTick, "world_id", false);
    },
    parseWorldDbResult,
    log,
    "world_id",
    collector,
  );
  runWorldSchemaStep(
    "addIntegerColumn",
    tables.npcTick,
    function () {
      return database.addIntegerColumn(tables.npcTick, "last_tick_ts", false);
    },
    parseWorldDbResult,
    log,
    "last_tick_ts",
    collector,
  );
  runWorldSchemaStep(
    "addUniqueIndex",
    tables.npcTick,
    function () {
      return database.addUniqueIndex(
        tables.npcTick,
        JSON.stringify(["world_id"]),
      );
    },
    parseWorldDbResult,
    log,
    undefined,
    collector,
  );

  runWorldSchemaStep(
    "createLeaseTable",
    tables.npcTickLease,
    function () {
      return database.createLeaseTable(tables.npcTickLease);
    },
    parseWorldDbResult,
    log,
    undefined,
    collector,
  );
}

export function ensureWorldDatabaseSchema(
  tables: WorldSchemaTables,
  parseWorldDbResult: ParseFn,
  log: SchemaLogFn,
): void {
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
    reportSchemaResult("world", op, tableName, result, columnName, log);
  };

  step("createTable", tables.playerHeartbeat, function () {
    return database.createTable(tables.playerHeartbeat);
  });
  step(
    "addTextColumn",
    tables.playerHeartbeat,
    function () {
      return database.addTextColumn(tables.playerHeartbeat, "user_id", false);
    },
    "user_id",
  );
  step(
    "addIntegerColumn",
    tables.playerHeartbeat,
    function () {
      return database.addIntegerColumn(
        tables.playerHeartbeat,
        "heartbeat_ts",
        false,
      );
    },
    "heartbeat_ts",
  );
  step("addUniqueIndex", tables.playerHeartbeat, function () {
    return database.addUniqueIndex(
      tables.playerHeartbeat,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", tables.eventSeq, function () {
    return database.createTable(tables.eventSeq);
  });
  step(
    "addTextColumn",
    tables.eventSeq,
    function () {
      return database.addTextColumn(tables.eventSeq, "scope_key", false);
    },
    "scope_key",
  );
  step(
    "addIntegerColumn",
    tables.eventSeq,
    function () {
      return database.addIntegerColumn(tables.eventSeq, "seq", false);
    },
    "seq",
  );
  step("addUniqueIndex", tables.eventSeq, function () {
    return database.addUniqueIndex(
      tables.eventSeq,
      JSON.stringify(["scope_key"]),
    );
  });

  step("createTable", tables.playerMoveLease, function () {
    return database.createTable(tables.playerMoveLease);
  });
  step(
    "addTextColumn",
    tables.playerMoveLease,
    function () {
      return database.addTextColumn(tables.playerMoveLease, "user_id", false);
    },
    "user_id",
  );
  step(
    "addTextColumn",
    tables.playerMoveLease,
    function () {
      return database.addTextColumn(
        tables.playerMoveLease,
        "session_id",
        false,
      );
    },
    "session_id",
  );
  step(
    "addIntegerColumn",
    tables.playerMoveLease,
    function () {
      return database.addIntegerColumn(
        tables.playerMoveLease,
        "expires_ts",
        false,
      );
    },
    "expires_ts",
  );
  step("addUniqueIndex", tables.playerMoveLease, function () {
    return database.addUniqueIndex(
      tables.playerMoveLease,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", tables.onlinePresence, function () {
    return database.createTable(tables.onlinePresence);
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
      tables.onlinePresence,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.onlinePresence,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.onlinePresence,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", tables.onlinePresence, function () {
    return database.addUniqueIndex(
      tables.onlinePresence,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", tables.playerNick, function () {
    return database.createTable(tables.playerNick);
  });
  [
    ["addTextColumn", "user_id", false],
    ["addTextColumn", "nick", false],
    ["addIntegerColumn", "updated_ts", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      tables.playerNick,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.playerNick,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.playerNick,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", tables.playerNick, function () {
    return database.addUniqueIndex(
      tables.playerNick,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", tables.playerWorld, function () {
    return database.createTable(tables.playerWorld);
  });
  [
    ["addTextColumn", "user_id", false],
    ["addTextColumn", "world_id", false],
    ["addIntegerColumn", "updated_ts", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      tables.playerWorld,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.playerWorld,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.playerWorld,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", tables.playerWorld, function () {
    return database.addUniqueIndex(
      tables.playerWorld,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", tables.playerPosition, function () {
    return database.createTable(tables.playerPosition);
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
      tables.playerPosition,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.playerPosition,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.playerPosition,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", tables.playerPosition, function () {
    return database.addUniqueIndex(
      tables.playerPosition,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", tables.playerInventory, function () {
    return database.createTable(tables.playerInventory);
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
      tables.playerInventory,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.playerInventory,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.playerInventory,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", tables.playerInventory, function () {
    return database.addUniqueIndex(
      tables.playerInventory,
      JSON.stringify(["user_id"]),
    );
  });

  step("createTable", tables.worldMod, function () {
    return database.createTable(tables.worldMod);
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
      tables.worldMod,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.worldMod,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.worldMod,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", tables.worldMod, function () {
    return database.addUniqueIndex(
      tables.worldMod,
      JSON.stringify(["world_id", "tile_key", "layer"]),
    );
  });

  step("createTable", tables.worldItem, function () {
    return database.createTable(tables.worldItem);
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
      tables.worldItem,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.worldItem,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.worldItem,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", tables.worldItem, function () {
    return database.addUniqueIndex(
      tables.worldItem,
      JSON.stringify(["item_id"]),
    );
  });

  step("createTable", tables.worldItemMeta, function () {
    return database.createTable(tables.worldItemMeta);
  });
  step(
    "addTextColumn",
    tables.worldItemMeta,
    function () {
      return database.addTextColumn(tables.worldItemMeta, "world_id", false);
    },
    "world_id",
  );
  step(
    "addIntegerColumn",
    tables.worldItemMeta,
    function () {
      return database.addIntegerColumn(
        tables.worldItemMeta,
        "next_item_seq",
        false,
        "0",
      );
    },
    "next_item_seq",
  );
  step(
    "addIntegerColumn",
    tables.worldItemMeta,
    function () {
      return database.addIntegerColumn(
        tables.worldItemMeta,
        "seeded",
        false,
        "0",
      );
    },
    "seeded",
  );
  step(
    "addIntegerColumn",
    tables.worldItemMeta,
    function () {
      return database.addIntegerColumn(
        tables.worldItemMeta,
        "updated_ts",
        false,
      );
    },
    "updated_ts",
  );
  step("addUniqueIndex", tables.worldItemMeta, function () {
    return database.addUniqueIndex(
      tables.worldItemMeta,
      JSON.stringify(["world_id"]),
    );
  });

  step("createTable", tables.itemClass, function () {
    return database.createTable(tables.itemClass);
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
      tables.itemClass,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.itemClass,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.itemClass,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", tables.itemClass, function () {
    return database.addUniqueIndex(
      tables.itemClass,
      JSON.stringify(["class_id"]),
    );
  });

  step("createTable", tables.actionClass, function () {
    return database.createTable(tables.actionClass);
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
      tables.actionClass,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.actionClass,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.actionClass,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", tables.actionClass, function () {
    return database.addUniqueIndex(
      tables.actionClass,
      JSON.stringify(["action_id"]),
    );
  });

  step("createTable", tables.livingClass, function () {
    return database.createTable(tables.livingClass);
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
      tables.livingClass,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.livingClass,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.livingClass,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", tables.livingClass, function () {
    return database.addUniqueIndex(
      tables.livingClass,
      JSON.stringify(["class_id"]),
    );
  });

  ensureLateWorldDatabaseSchema(
    {
      worldType: tables.worldType,
      npc: tables.npc,
      npcActiveWorld: tables.npcActiveWorld,
      npcTick: tables.npcTick,
      npcTickLease: tables.npcTickLease,
    },
    parseWorldDbResult,
    log,
  );
}

export function ensureChatDatabaseSchema(
  tables: ChatSchemaTables,
  parseChatDbResult: ParseFn,
  log: SchemaLogFn,
  collector?: Array<any>,
): void {
  const step = function (
    op: string,
    tableName: string,
    run: () => string,
    columnName?: string,
  ) {
    runChatSchemaStep(
      op,
      tableName,
      run,
      parseChatDbResult,
      log,
      columnName,
      collector,
    );
  };

  step("createTable", tables.chat, function () {
    return database.createTable(tables.chat);
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
      tables.chat,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.chat,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.chat,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", tables.chat, function () {
    return database.addUniqueIndex(tables.chat, JSON.stringify(["message_id"]));
  });

  step("createTable", tables.dm, function () {
    return database.createTable(tables.dm);
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
      tables.dm,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.dm,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.dm,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", tables.dm, function () {
    return database.addUniqueIndex(tables.dm, JSON.stringify(["message_id"]));
  });

  step("createTable", tables.dmIndex, function () {
    return database.createTable(tables.dmIndex);
  });
  [
    ["addTextColumn", "user_id", false],
    ["addTextColumn", "other_user_id", false],
    ["addIntegerColumn", "last_ts", false],
  ].forEach(function (entry) {
    step(
      String(entry[0]),
      tables.dmIndex,
      function () {
        return entry[0] === "addIntegerColumn"
          ? database.addIntegerColumn(
              tables.dmIndex,
              String(entry[1]),
              Boolean(entry[2]),
            )
          : database.addTextColumn(
              tables.dmIndex,
              String(entry[1]),
              Boolean(entry[2]),
            );
      },
      String(entry[1]),
    );
  });
  step("addUniqueIndex", tables.dmIndex, function () {
    return database.addUniqueIndex(
      tables.dmIndex,
      JSON.stringify(["user_id", "other_user_id"]),
    );
  });
}
