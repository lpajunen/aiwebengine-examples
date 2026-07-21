// Creator class CRUD HTTP handlers (item/action/living/world classes).
import {
  deleteActionClass,
  deleteItemClass,
  getActionClass,
  getAllActionClasses,
  getAllItemClasses,
  getItemClass,
  refreshActionClassCache,
  refreshItemClassCache,
  upsertActionClass,
  upsertItemClass,
} from "./item-registry.ts";
import {
  deleteLivingClass,
  getLivingClass,
  refreshLivingClassCache,
  upsertLivingClass,
} from "./living-registry.ts";
import {
  deleteWorldClass,
  getAllWorldClasses,
  getWorldClass,
  isBuiltinWorldClassId,
  normalizeWorldClassRecord,
  refreshWorldClassCache,
  upsertWorldClass,
} from "./world-class-storage.ts";
import { userHasCreatorStone } from "./http-handler-helpers.ts";
import { getAllLivingClasses } from "./living-registry.ts";

/**
 * @param {*} context
 */
export function itemClassesHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  if (!userHasCreatorStone(userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  refreshItemClassCache();
  var classes = getAllItemClasses();
  return ResponseBuilder.json({ ok: true, item_classes: classes });
}

/**
 * @param {*} context
 */
export function createItemClassHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var id = String((body && body.id) || "").trim();
  if (!id) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var record = {
    id: id,
    kind: String((body && body.kind) || "tool"),
    spawnable: !!(body && body.spawnable),
    extra: !!(body && body.extra),
    nonDroppable: !!(body && body.nonDroppable),
    nonPickable: !!(body && body.nonPickable),
    visuals: {
      color: Number((body && body.visuals && body.visuals.color) || 0),
      labelKey: String((body && body.visuals && body.visuals.labelKey) || ""),
      fallbackLabel: String(
        (body && body.visuals && body.visuals.fallbackLabel) || id,
      ),
    },
    actionIds: Array.isArray(body && body.actionIds) ? body.actionIds : [],
    stateTemplate:
      body && body.stateTemplate && typeof body.stateTemplate === "object"
        ? body.stateTemplate
        : {},
  };
  var itemCreateWrite = upsertItemClass(record);
  if (!itemCreateWrite || !itemCreateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.item_class_upsert_failed" +
          (itemCreateWrite && itemCreateWrite.error
            ? ": " + String(itemCreateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, item_class: record });
}

/**
 * @param {*} context
 */
export function updateItemClassHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var classId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!classId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var existing = getItemClass(classId);
  if (!existing) {
    return ResponseBuilder.json(
      { ok: false, error: "error.item_class_not_found" },
      404,
    );
  }
  var record = {
    id: classId,
    kind: String((body && body.kind) || existing.kind),
    spawnable:
      body && body.spawnable !== undefined
        ? !!body.spawnable
        : existing.spawnable,
    extra: body && body.extra !== undefined ? !!body.extra : existing.extra,
    nonDroppable:
      body && body.nonDroppable !== undefined
        ? !!body.nonDroppable
        : existing.nonDroppable,
    nonPickable:
      body && body.nonPickable !== undefined
        ? !!body.nonPickable
        : existing.nonPickable,
    visuals: {
      color: Number(
        body && body.visuals && body.visuals.color !== undefined
          ? body.visuals.color
          : existing.visuals.color,
      ),
      labelKey: String(
        (body && body.visuals && body.visuals.labelKey) ||
          existing.visuals.labelKey,
      ),
      fallbackLabel: String(
        (body && body.visuals && body.visuals.fallbackLabel) ||
          existing.visuals.fallbackLabel,
      ),
    },
    actionIds: Array.isArray(body && body.actionIds)
      ? body.actionIds
      : existing.actionIds,
    stateTemplate:
      body && body.stateTemplate && typeof body.stateTemplate === "object"
        ? body.stateTemplate
        : existing.stateTemplate,
  };
  var itemUpdateWrite = upsertItemClass(record);
  if (!itemUpdateWrite || !itemUpdateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.item_class_upsert_failed" +
          (itemUpdateWrite && itemUpdateWrite.error
            ? ": " + String(itemUpdateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, item_class: record });
}

/**
 * @param {*} context
 */
export function deleteItemClassHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var classId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!classId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  deleteItemClass(classId);
  return ResponseBuilder.json({ ok: true, deleted_id: classId });
}

/**
 * @param {*} context
 */
export function actionClassesHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  refreshActionClassCache();
  var classes = getAllActionClasses();
  return ResponseBuilder.json({ ok: true, action_classes: classes });
}

/**
 * @param {*} context
 */
export function createActionClassHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var id = String((body && body.id) || "").trim();
  if (!id) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var record = {
    id: id,
    labelKey: String((body && body.labelKey) || ""),
    fallbackLabel: String((body && body.fallbackLabel) || id),
    targetKind: String((body && body.targetKind) || "self"),
    sourceItemIds: Array.isArray(body && body.sourceItemIds)
      ? body.sourceItemIds
      : [],
    canonicalId:
      body && body.canonicalId ? String(body.canonicalId) : undefined,
    execution: body && body.execution ? body.execution : undefined,
    validation: body && body.validation ? body.validation : undefined,
    logicSpec: body && body.logicSpec ? body.logicSpec : undefined,
  };
  var actionCreateWrite = upsertActionClass(record);
  if (!actionCreateWrite || !actionCreateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.action_class_upsert_failed" +
          (actionCreateWrite && actionCreateWrite.error
            ? ": " + String(actionCreateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, action_class: record });
}

/**
 * @param {*} context
 */
export function updateActionClassHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var actionId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!actionId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var existing = getActionClass(actionId);
  if (!existing) {
    return ResponseBuilder.json(
      { ok: false, error: "error.action_class_not_found" },
      404,
    );
  }
  var record = {
    id: actionId,
    labelKey: String(body && body.labelKey ? body.labelKey : existing.labelKey),
    fallbackLabel: String(
      body && body.fallbackLabel ? body.fallbackLabel : existing.fallbackLabel,
    ),
    targetKind: String(
      body && body.targetKind ? body.targetKind : existing.targetKind,
    ),
    sourceItemIds: Array.isArray(body && body.sourceItemIds)
      ? body.sourceItemIds
      : existing.sourceItemIds,
    canonicalId:
      body && body.canonicalId !== undefined
        ? body.canonicalId
          ? String(body.canonicalId)
          : undefined
        : existing.canonicalId,
    execution:
      body && body.execution !== undefined
        ? body.execution
        : existing.execution,
    validation:
      body && body.validation !== undefined
        ? body.validation
        : existing.validation,
    logicSpec:
      body && body.logicSpec !== undefined
        ? body.logicSpec
        : existing.logicSpec,
  };
  var actionUpdateWrite = upsertActionClass(record);
  if (!actionUpdateWrite || !actionUpdateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.action_class_upsert_failed" +
          (actionUpdateWrite && actionUpdateWrite.error
            ? ": " + String(actionUpdateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, action_class: record });
}

/**
 * @param {*} context
 */
export function deleteActionClassHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var actionId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!actionId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  deleteActionClass(actionId);
  return ResponseBuilder.json({ ok: true, deleted_id: actionId });
}

/**
 * @param {*} context
 */
export function livingClassesHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  refreshLivingClassCache();
  var classes = getAllLivingClasses();
  return ResponseBuilder.json({ ok: true, living_classes: classes });
}

/**
 * @param {*} value
 * @param {"player" | "npc" | "creature"} fallback
 * @returns {"player" | "npc" | "creature"}
 */
export function normalizeLivingKind(value: any, fallback: any) {
  var kind = String(value || "");
  if (kind === "player" || kind === "npc" || kind === "creature") return kind;
  return fallback;
}

/**
 * @param {*} context
 */
export function createLivingClassHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var id = String((body && body.id) || "").trim();
  if (!id) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var record = {
    id: id,
    kind: normalizeLivingKind(body && body.kind, "creature"),
    labelKey: String((body && body.labelKey) || ""),
    fallbackLabel: String((body && body.fallbackLabel) || id),
    slotDefinitions: Array.isArray(body && body.slotDefinitions)
      ? body.slotDefinitions
      : [],
    valueTemplate:
      body && body.valueTemplate && typeof body.valueTemplate === "object"
        ? body.valueTemplate
        : {},
    valueSchema:
      body && body.valueSchema && typeof body.valueSchema === "object"
        ? body.valueSchema
        : undefined,
  };
  var livingCreateWrite = upsertLivingClass(record);
  if (!livingCreateWrite || !livingCreateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.living_class_upsert_failed" +
          (livingCreateWrite && livingCreateWrite.error
            ? ": " + String(livingCreateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, living_class: record });
}

/**
 * @param {*} context
 */
export function updateLivingClassHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var classId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!classId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var existing = getLivingClass(classId);
  if (!existing) {
    return ResponseBuilder.json(
      { ok: false, error: "error.living_class_not_found" },
      404,
    );
  }
  var record = {
    id: classId,
    kind: normalizeLivingKind(body && body.kind, existing.kind),
    labelKey:
      body && body.labelKey !== undefined
        ? String(body.labelKey || "")
        : existing.labelKey,
    fallbackLabel:
      body && body.fallbackLabel
        ? String(body.fallbackLabel)
        : existing.fallbackLabel,
    slotDefinitions: Array.isArray(body && body.slotDefinitions)
      ? body.slotDefinitions
      : existing.slotDefinitions,
    valueTemplate:
      body && body.valueTemplate && typeof body.valueTemplate === "object"
        ? body.valueTemplate
        : existing.valueTemplate,
    valueSchema:
      body && body.valueSchema && typeof body.valueSchema === "object"
        ? body.valueSchema
        : existing.valueSchema,
  };
  var livingUpdateWrite = upsertLivingClass(record);
  if (!livingUpdateWrite || !livingUpdateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.living_class_upsert_failed" +
          (livingUpdateWrite && livingUpdateWrite.error
            ? ": " + String(livingUpdateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, living_class: record });
}

/**
 * @param {*} context
 */
export function deleteLivingClassHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var classId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!classId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  deleteLivingClass(classId);
  return ResponseBuilder.json({ ok: true, deleted_id: classId });
}

/**
 * @param {*} context
 */
export function worldClassesHandler(context: any) {
  // Listing is not stone-gated: any player building a portal needs the world
  // type list. Mutations below remain creator's-stone only.
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  refreshWorldClassCache();
  return ResponseBuilder.json({
    ok: true,
    world_classes: getAllWorldClasses(),
  });
}

/**
 * @param {*} context
 */
export function createWorldClassHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var id = String((body && body.id) || "").trim();
  if (!id) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var record = normalizeWorldClassRecord({
    id: id,
    baseType: body && body.baseType,
    rows: body && body.rows,
    cols: body && body.cols,
    labelKey: body && body.labelKey,
    fallbackLabel: body && body.fallbackLabel,
  });
  var worldCreateWrite = upsertWorldClass(record);
  if (!worldCreateWrite || !worldCreateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.world_class_upsert_failed" +
          (worldCreateWrite && worldCreateWrite.error
            ? ": " + String(worldCreateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, world_class: record });
}

/**
 * @param {*} context
 */
export function updateWorldClassHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var classId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!classId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "error.invalid_json_body" }, 400);
  }
  var existing = getWorldClass(classId);
  if (!existing) {
    return ResponseBuilder.json(
      { ok: false, error: "error.world_class_not_found" },
      404,
    );
  }
  var record = normalizeWorldClassRecord({
    id: classId,
    baseType:
      body && body.baseType !== undefined ? body.baseType : existing.baseType,
    rows: body && body.rows !== undefined ? body.rows : existing.rows,
    cols: body && body.cols !== undefined ? body.cols : existing.cols,
    labelKey:
      body && body.labelKey !== undefined ? body.labelKey : existing.labelKey,
    fallbackLabel:
      body && body.fallbackLabel !== undefined
        ? body.fallbackLabel
        : existing.fallbackLabel,
  });
  var worldUpdateWrite = upsertWorldClass(record);
  if (!worldUpdateWrite || !worldUpdateWrite.ok) {
    return ResponseBuilder.json(
      {
        ok: false,
        error:
          "error.world_class_upsert_failed" +
          (worldUpdateWrite && worldUpdateWrite.error
            ? ": " + String(worldUpdateWrite.error)
            : ""),
      },
      500,
    );
  }
  return ResponseBuilder.json({ ok: true, world_class: record });
}

/**
 * @param {*} context
 */
export function deleteWorldClassHandler(context: any) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  if (!userHasCreatorStone(context.request.auth.userId)) {
    return ResponseBuilder.json(
      { error: "error.editing_rights_required" },
      403,
    );
  }
  var classId = String(
    (context.request.params && context.request.params.id) || "",
  );
  if (!classId) {
    return ResponseBuilder.json({ ok: false, error: "error.missing_id" }, 400);
  }
  if (isBuiltinWorldClassId(classId)) {
    return ResponseBuilder.json(
      { ok: false, error: "error.world_class_builtin" },
      400,
    );
  }
  deleteWorldClass(classId);
  return ResponseBuilder.json({ ok: true, deleted_id: classId });
}
