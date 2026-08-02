// Creator class CRUD HTTP handlers (item/action/living/world classes).
import {
  deleteActionClass,
  deleteItemClass,
  getActionClassWithRefresh,
  getAllActionClasses,
  getAllItemClasses,
  getItemClassWithRefresh,
  refreshActionClassCache,
  refreshItemClassCache,
  upsertActionClass,
  upsertItemClass,
} from "./item-registry.ts";
import {
  deleteLivingClass,
  getLivingClassWithRefresh,
  refreshLivingClassCache,
  upsertLivingClass,
} from "./living-registry.ts";
import {
  deleteWorldClass,
  getAllWorldClasses,
  getWorldClassWithRefresh,
  isBuiltinWorldClassId,
  normalizeWorldClassRecord,
  refreshWorldClassCache,
  upsertWorldClass,
} from "./world-class-storage.ts";
import {
  canManageClass,
  normalizeOwnerIdsInput,
  userHasCreatorStone,
} from "./http-handler-helpers.ts";
import { getAllLivingClasses } from "./living-registry.ts";
import { normalizeClassLabels } from "./class-labels.ts";

const CLASS_OWNER_ERROR = { error: "error.not_class_owner" };

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
    ownerIds: [context.request.auth.userId],
    labels: normalizeClassLabels(body && body.labels),
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
  var existing = getItemClassWithRefresh(classId);
  if (!existing) {
    return ResponseBuilder.json(
      { ok: false, error: "error.item_class_not_found" },
      404,
    );
  }
  if (!canManageClass(context.request.auth.userId, existing.ownerIds)) {
    return ResponseBuilder.json(CLASS_OWNER_ERROR, 403);
  }
  var record = {
    id: classId,
    kind: String((body && body.kind) || existing.kind),
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
    ownerIds:
      normalizeOwnerIdsInput(body && body.ownerIds) || existing.ownerIds,
    labels:
      body && body.labels !== undefined
        ? normalizeClassLabels(body.labels)
        : existing.labels,
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
  var existing = getItemClassWithRefresh(classId);
  if (
    existing &&
    !canManageClass(context.request.auth.userId, existing.ownerIds)
  ) {
    return ResponseBuilder.json(CLASS_OWNER_ERROR, 403);
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
    targeting: body && body.targeting ? body.targeting : undefined,
    cost: body && body.cost ? body.cost : undefined,
    produces: body && body.produces ? body.produces : undefined,
    removes: body && body.removes ? body.removes : undefined,
    fatigueCost:
      body && body.fatigueCost !== undefined
        ? Number(body.fatigueCost)
        : undefined,
    durationMs:
      body && body.durationMs !== undefined
        ? Number(body.durationMs)
        : undefined,
    ownerIds: [context.request.auth.userId],
    labels: normalizeClassLabels(body && body.labels),
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
  var existing = getActionClassWithRefresh(actionId);
  if (!existing) {
    return ResponseBuilder.json(
      { ok: false, error: "error.action_class_not_found" },
      404,
    );
  }
  if (!canManageClass(context.request.auth.userId, existing.ownerIds)) {
    return ResponseBuilder.json(CLASS_OWNER_ERROR, 403);
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
    targeting:
      body && body.targeting !== undefined
        ? body.targeting
        : existing.targeting,
    cost: body && body.cost !== undefined ? body.cost : existing.cost,
    produces:
      body && body.produces !== undefined ? body.produces : existing.produces,
    removes:
      body && body.removes !== undefined ? body.removes : existing.removes,
    fatigueCost:
      body && body.fatigueCost !== undefined
        ? Number(body.fatigueCost)
        : existing.fatigueCost,
    durationMs:
      body && body.durationMs !== undefined
        ? Number(body.durationMs)
        : existing.durationMs,
    ownerIds:
      normalizeOwnerIdsInput(body && body.ownerIds) || existing.ownerIds,
    labels:
      body && body.labels !== undefined
        ? normalizeClassLabels(body.labels)
        : existing.labels,
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
  var existing = getActionClassWithRefresh(actionId);
  if (
    existing &&
    !canManageClass(context.request.auth.userId, existing.ownerIds)
  ) {
    return ResponseBuilder.json(CLASS_OWNER_ERROR, 403);
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
    aggressive: !!(body && body.aggressive),
    ownerIds: [context.request.auth.userId],
    labels: normalizeClassLabels(body && body.labels),
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
  var existing = getLivingClassWithRefresh(classId);
  if (!existing) {
    return ResponseBuilder.json(
      { ok: false, error: "error.living_class_not_found" },
      404,
    );
  }
  if (!canManageClass(context.request.auth.userId, existing.ownerIds)) {
    return ResponseBuilder.json(CLASS_OWNER_ERROR, 403);
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
    aggressive:
      body && body.aggressive !== undefined
        ? !!body.aggressive
        : existing.aggressive,
    ownerIds:
      normalizeOwnerIdsInput(body && body.ownerIds) || existing.ownerIds,
    labels:
      body && body.labels !== undefined
        ? normalizeClassLabels(body.labels)
        : existing.labels,
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
  var existing = getLivingClassWithRefresh(classId);
  if (
    existing &&
    !canManageClass(context.request.auth.userId, existing.ownerIds)
  ) {
    return ResponseBuilder.json(CLASS_OWNER_ERROR, 403);
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
    itemSpawns: body && body.itemSpawns,
    npcSpawns: body && body.npcSpawns,
    ownerIds: [context.request.auth.userId],
    labels: body && body.labels,
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
  var existing = getWorldClassWithRefresh(classId);
  if (!existing) {
    return ResponseBuilder.json(
      { ok: false, error: "error.world_class_not_found" },
      404,
    );
  }
  if (!canManageClass(context.request.auth.userId, existing.ownerIds)) {
    return ResponseBuilder.json(CLASS_OWNER_ERROR, 403);
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
    itemSpawns:
      body && body.itemSpawns !== undefined
        ? body.itemSpawns
        : existing.itemSpawns,
    npcSpawns:
      body && body.npcSpawns !== undefined
        ? body.npcSpawns
        : existing.npcSpawns,
    ownerIds:
      body && body.ownerIds !== undefined ? body.ownerIds : existing.ownerIds,
    labels: body && body.labels !== undefined ? body.labels : existing.labels,
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
  var existing = getWorldClassWithRefresh(classId);
  if (
    existing &&
    !canManageClass(context.request.auth.userId, existing.ownerIds)
  ) {
    return ResponseBuilder.json(CLASS_OWNER_ERROR, 403);
  }
  deleteWorldClass(classId);
  return ResponseBuilder.json({ ok: true, deleted_id: classId });
}
