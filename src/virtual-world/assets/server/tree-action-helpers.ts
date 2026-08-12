import { appendWorldChatMessage, ChatSenderKind } from "./chat-storage.ts";
import { maybeReloadClassCaches } from "./class-cache.ts";
import { getTargetTileFromRotation } from "./current-world-state.ts";
import {
  grantAllItemsForUser,
  handleItemActionForUser,
} from "./item-action-helpers.ts";
import {
  deleteWorldItemById,
  deleteWorldItems,
  ensureWorldItems,
  loadPlayerInventory,
  loadWorldItems,
  nextWorldItemId,
  savePlayerInventory,
  saveWorldItems,
  spawnItemsForUser,
  spawnItemsOnTile,
  upsertWorldItem,
} from "./item-storage.ts";
import { getPlayerWorld } from "./player-persistence.ts";
import { deleteFollowState, saveFollowState } from "./follow-storage.ts";
import { deleteFightState, saveFightState } from "./fight-storage.ts";
import { applyLivingEffect, wieldedWeapon } from "./fight-helpers.ts";
import {
  getLivingClassWithRefresh,
  isCombatantClass,
} from "./living-registry.ts";
import {
  addPendingAction,
  deletePendingAction,
  loadDuePendingActions,
  loadUserApproachActions,
} from "./pending-action-storage.ts";
import {
  getCanonicalPlayerState,
  getDefaultSpawnPosition,
  loadWorldPlayers,
} from "./player-snapshots.ts";
import { getEffectiveNick } from "./social-state.ts";
import { loadExistingNPCDisplayName, loadWorldNPCs } from "./npc-storage.ts";
import {
  APPROACH_ACTION_MAX_MS,
  NEARBY_TARGET_TILE_DISTANCE,
  START_WORLD_ID,
} from "./runtime-config.ts";
import {
  resolveActionTargeting,
  resolveEffectiveActionRange,
  targetingAllowsInventory,
  targetingAllowsWorld,
} from "./action-registry.ts";
import {
  resolveApproachTargetTile,
  stepActorTowardTile,
} from "./pursuit-movement.ts";
import {
  buildItemInspection,
  getActionDefinition,
  getItemDefinition,
  getSourceItemIdsForAction,
  isPickableWorldItem,
} from "./item-registry.ts";
import { ActionDefinition } from "./action-registry.ts";
import { scheduleRespawnIfManifestTracked } from "./spawn-timers.ts";
import {
  broadcastItemChange,
  broadcastPlayerValuesChanged,
  sendRecipientScopedStreamEvent,
  sendWorldScopedStreamEvent,
} from "./stream-broadcast.ts";
import {
  createWorldOfType,
  getEffectiveMap,
  getWorldDimensions,
} from "./world-bootstrap.ts";
import { getWorldClassWithRefresh } from "./world-class-storage.ts";
import {
  canInventoryUseTreeAction,
  canTileItemsUseTreeAction,
  getNearbyTileItems,
  getNearbyTileKeys,
  isWithinTileDistance,
  isWorldTileWalkable,
  normalizeWorldType,
} from "./world-domain.ts";
import { isReservedTile } from "./world-reservations.ts";
import { applyTileMod, loadTileModsOfKind } from "./world-mod-storage.ts";
import { switchUserWorld } from "./world-switch.ts";
import { runInWorldTransaction } from "./world-db.ts";
import { getItemChangeDefinition } from "./item-events.ts";
import { getWorldEventDefinition } from "./world-events.ts";
import {
  evaluateConditions,
  evaluateEntityConditions,
  applyEffects,
  getFieldValue,
  setFieldValue,
} from "./action-logic-interpreter.ts";
import {
  WORLD_TILE_GROUND,
  WORLD_TILE_HOUSE,
  WORLD_TILE_PINE_TREE,
  consumeLivingItemsByType,
  worldTileValueForName,
  countItemsByType,
  countLivingItemsByType,
  findFirstLivingItemByTypes,
  findLivingItemById,
  resolveNPCDisplayName,
  isValidItem,
  LivingState,
  replaceLivingItemById,
} from "./world-domain.ts";

// Where a linkedWorld action's traveller arrives in the world it creates, and
// the anchor its return item is offset from. A freshly created world carries no
// spawn reservations, so getDefaultSpawnPosition falls through to (1, 1) for
// it — this mirrors that rather than querying it, because the world is seeded
// after the destination is written onto the item.
const LINKED_WORLD_SPAWN_ROW = 1;
const LINKED_WORLD_SPAWN_COL = 1;

// Build the toast fields for a payload: the i18n key the client localizes,
// plus the pre-assembled English string as the fallback, and any {token}
// params the localized template interpolates. Handlers that assemble a toast
// inline (dynamic labels, level numbers) use this so the client can localize
// it — the declarative execution.toastMessage path uses withConfiguredToastMessage.
function toastFields(
  key: string,
  english: string,
  params?: Record<string, unknown>,
): {
  toast_message: string;
  toast_message_key: string;
  toast_message_params?: Record<string, unknown>;
} {
  return {
    toast_message: english,
    toast_message_key: key,
    ...(params ? { toast_message_params: params } : {}),
  };
}

export function performTreeActionForUser(
  userId: string,
  body: any,
  options?: { resuming?: boolean },
): { status: number; payload: any } {
  // Before resolving the action: a creator who just edited it expects the
  // next attempt to use the new definition, whichever instance stored it.
  maybeReloadClassCaches();
  const rawAction = body && body.action;
  const action = String(rawAction || "");
  const actionDefinition = getActionDefinition(action);
  const requestedPortalWorldType = normalizeWorldType(
    body && body.destination_world_type,
  );
  const requestedPortalRows = Number(body && body.destination_world_rows);
  const requestedPortalCols = Number(body && body.destination_world_cols);
  const requestedPortalDimensions =
    isFinite(requestedPortalRows) || isFinite(requestedPortalCols)
      ? {
          rows: isFinite(requestedPortalRows) ? requestedPortalRows : undefined,
          cols: isFinite(requestedPortalCols) ? requestedPortalCols : undefined,
        }
      : undefined;
  const requestedWorldClassId = String(
    (body && body.destination_world_class_id) || "",
  ).trim();

  if (
    action === "pick" ||
    action === "drop" ||
    action === "equip" ||
    action === "container_put" ||
    action === "container_get"
  ) {
    return handleItemActionForUser(userId, body || {});
  }

  if (action === "cheat_grant_all") {
    return { status: 200, payload: grantAllItemsForUser(userId) };
  }

  if (!actionDefinition) {
    return {
      status: 400,
      payload: { ok: false, error: "error.invalid_action" },
    };
  }

  const worldId = getPlayerWorld(userId);
  if (!worldId) {
    return {
      status: 200,
      payload: { ok: false, error: "error.no_world_found" },
    };
  }
  ensureWorldItems(worldId);

  const inv = loadPlayerInventory(userId);
  const canonical = getCanonicalPlayerState(worldId, userId);
  const playerRow = Number.isFinite(Number(body && body.row))
    ? Number(body.row)
    : canonical.row;
  const playerCol = Number.isFinite(Number(body && body.col))
    ? Number(body.col)
    : canonical.col;
  const rotation = Number.isFinite(Number(body && body.rotation))
    ? Number(body.rotation)
    : canonical.rotation;
  const worldItems = loadWorldItems(worldId);

  // XP awarded on this action's completion, if the action is configured with a
  // (non-onKill) `experience` amount. Tracked in the closure so it runs exactly
  // once per action even though buildConfiguredSuccessPayload — the shared
  // success choke point — is reached from many different return branches.
  let experienceAwarded = false;
  let experienceGained = 0;
  function maybeAwardActionExperience(): void {
    if (experienceAwarded) return;
    experienceAwarded = true;
    const exp = actionDefinition && actionDefinition.experience;
    // onKill actions (fight) award via the combat resolver, scaled by the
    // slain target's level — never on the action's own completion.
    if (!exp || exp.onKill) return;
    const amount = Math.floor(Number(exp.amount || 0));
    if (!(amount > 0)) return;
    inv.values.experience =
      Math.floor(Number(inv.values.experience || 0)) + amount;
    inv.values.totalExperience =
      Math.floor(Number(inv.values.totalExperience || 0)) + amount;
    savePlayerInventory(userId, inv);
    broadcastPlayerValuesChanged(worldId, userId, inv.values);
    experienceGained = amount;
  }

  function getTileItemsSnapshot(row: number, col: number): any[] {
    const key = row + "_" + col;
    return Array.isArray(worldItems[key]) ? worldItems[key] : [];
  }

  // Locates the item an item-targeted action was aimed at, honouring the
  // action's targeting scope (see ActionTargeting.targetScope): a "world"
  // target lies on the action's resolved tile, an "inventory" target is
  // carried in an equipped slot or the bag. Returns null when the id matches
  // nothing the scope allows, so callers report target_item_not_found.
  function resolveTargetedItem(targetItemId: string): {
    item: any;
    source: "tile" | "inventory";
    row?: number;
    col?: number;
    slotId?: string;
  } | null {
    const id = String(targetItemId || "");
    if (!id) return null;
    const targeting = actionDefinition
      ? resolveActionTargeting(actionDefinition)
      : null;
    const allowWorld = !targeting || targetingAllowsWorld(targeting);
    const allowInventory = !!targeting && targetingAllowsInventory(targeting);
    if (allowWorld) {
      const itemsHere = getTileItemsSnapshot(
        resolvedTarget.row,
        resolvedTarget.col,
      );
      const found = itemsHere.find(function (item) {
        return item && String(item.id) === id;
      });
      if (found) {
        return {
          item: found,
          source: "tile",
          row: resolvedTarget.row,
          col: resolvedTarget.col,
        };
      }
      // Not underfoot: search every tile within the action's reach. Actions
      // that walk to their target (approach "walk_adjacent") never get here —
      // maybeBeginApproachAction intercepts them first — so this is the reach
      // of the act-from-where-you-stand actions like examine, which must work
      // across a gap: an item on a non-walkable tile (the old oak, a door on a
      // wall, a portal on a blocked square) has no tile to walk onto.
      const reach = targeting
        ? resolveEffectiveActionRange(targeting, wieldedWeapon(inv))
        : 0;
      if (reach > 0) {
        const tileKeys = Object.keys(worldItems);
        for (let i = 0; i < tileKeys.length; i++) {
          const parts = String(tileKeys[i]).split("_");
          const tileRow = Number(parts[0]);
          const tileCol = Number(parts[1]);
          if (!Number.isFinite(tileRow) || !Number.isFinite(tileCol)) continue;
          if (
            !isWithinTileDistance(
              tileRow,
              tileCol,
              canonical.row,
              canonical.col,
              reach,
            )
          ) {
            continue;
          }
          const tileItems = worldItems[tileKeys[i]];
          if (!Array.isArray(tileItems)) continue;
          const nearby = tileItems.find(function (item) {
            return item && String(item.id) === id;
          });
          if (nearby) {
            return {
              item: nearby,
              source: "tile",
              row: tileRow,
              col: tileCol,
            };
          }
        }
      }
    }
    if (allowInventory) {
      const carried = findLivingItemById(inv, id);
      if (carried) {
        const slotIds = Object.keys(inv.slots || {});
        let slotId = "";
        for (let i = 0; i < slotIds.length; i++) {
          const slotItem = inv.slots[slotIds[i]];
          if (slotItem && String(slotItem.id) === id) {
            slotId = slotIds[i];
            break;
          }
        }
        return { item: carried, source: "inventory", slotId: slotId };
      }
    }
    return null;
  }

  // The action's execution config, straight from the class row. Typed off
  // ActionDefinition rather than restating its shape here — this used to be a
  // second copy of that type, which is how worldMutation could drift.
  function getActionExecutionConfig(): ActionDefinition["execution"] | null {
    return actionDefinition && actionDefinition.execution
      ? actionDefinition.execution
      : null;
  }

  /**
   * Who an action's configured chat line is attributed to. The default is the
   * actor, which is what every line authored before NPCs could speak means.
   *
   * `worldChatSpeaker: "target"` hands the line to the living the action was
   * aimed at — but only when that living is an NPC. A player target falls back
   * to the actor deliberately: an action that could put authored words in
   * another person's mouth is a griefing tool, and no story needs it.
   */
  function resolveConfiguredChatSpeaker(): {
    id: string;
    nick: string;
    kind: ChatSenderKind;
  } {
    const actor = {
      id: userId,
      nick: getEffectiveNick(userId),
      kind: "player" as ChatSenderKind,
    };
    const execution = getActionExecutionConfig();
    if (!execution || execution.worldChatSpeaker !== "target") return actor;

    const targetId = String((body && body.target_living_id) || "");
    if (!targetId || targetId === userId) return actor;
    const npcName = loadExistingNPCDisplayName(worldId, targetId);
    if (!npcName) return actor;
    return { id: targetId, nick: npcName, kind: "npc" };
  }

  function maybeAppendConfiguredWorldChatMessage(): void {
    const execution = getActionExecutionConfig();
    if (!execution || !execution.worldChatText) return;

    const speaker = resolveConfiguredChatSpeaker();
    const chatMsg = {
      id:
        "wc-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2),
      sender_id: speaker.id,
      sender_nick: speaker.nick,
      sender_kind: speaker.kind,
      text: execution.worldChatText,
      ...(execution.worldChatTextKey
        ? { text_key: execution.worldChatTextKey }
        : {}),
      ts: Date.now(),
    };
    appendWorldChatMessage(worldId, chatMsg);
    sendWorldScopedStreamEvent(String(worldId), "chat_message", chatMsg);
  }

  function withConfiguredToastMessage(payload: any): any {
    const execution = getActionExecutionConfig();
    if (!execution || !execution.toastMessage) return payload;
    return {
      ...payload,
      toast_message: execution.toastMessage,
      // The client localizes toast_message_key, falling back to the English
      // toast_message above when the key is absent or unknown.
      ...(execution.toastMessageKey
        ? { toast_message_key: execution.toastMessageKey }
        : {}),
    };
  }

  function buildConfiguredSuccessPayload(overrides?: any): any {
    // Award XP first so any inventory this payload carries back to the client
    // (includeInventory, or the always-attached copy below) reflects the new
    // experience values.
    maybeAwardActionExperience();
    const execution = getActionExecutionConfig();
    const payload: any = {
      ok: true,
      action: action,
      ...(overrides || {}),
    };
    if (experienceGained > 0) {
      payload.experience_gained = experienceGained;
      // Ensure the acting client always sees the updated experience/HP even
      // for actions that don't otherwise return inventory — the world-scoped
      // player_values_changed broadcast is ignored by the actor's own client.
      if (payload.inventory == null) payload.inventory = inv;
    }

    if (!execution || !execution.successPayload) {
      return withConfiguredToastMessage(payload);
    }

    const successPayload = execution.successPayload;

    if (successPayload.includeTargetPosition) {
      payload.row = resolvedTarget.row;
      payload.col = resolvedTarget.col;
    }

    if (successPayload.includeWorldId && payload.world_id == null) {
      payload.world_id = String(worldId);
    }

    if (successPayload.includeInventory && payload.inventory == null) {
      payload.inventory = inv;
    }

    if (successPayload.includeTileItems && payload.tile_items == null) {
      payload.tile_items = getTileItemsSnapshot(
        resolvedTarget.row,
        resolvedTarget.col,
      );
    }

    if (successPayload.includeSwitchedWorld && payload.switched_world == null) {
      payload.switched_world = true;
    }

    return withConfiguredToastMessage(payload);
  }

  function maybeSendConfiguredWorldEvent(
    row: number,
    col: number,
    mutation?: { sourceKind: string; tileType: string },
  ): void {
    const execution = getActionExecutionConfig();
    if (!execution || !execution.worldEvent) return;
    const worldEvent = getWorldEventDefinition(execution.worldEvent.eventId);
    if (!worldEvent) return;

    sendWorldScopedStreamEvent(String(worldId), worldEvent.eventType, {
      action: execution.worldEvent.actionId || action,
      row: row,
      col: col,
      actor_type: "player",
      actor_id: userId,
      player_id: userId,
      // The mod itself, so a client repaints the square from the event without
      // having to know which action produced it.
      ...(mutation
        ? { source_kind: mutation.sourceKind, tile_type: mutation.tileType }
        : {}),
    });
  }

  // Broadcasts one item-change event by id, if the id names a known
  // definition. The itemEffect block names its own ids per outcome (damaged
  // vs destroyed), which execution.itemChange's single id cannot express.
  function broadcastConfiguredItemChangeById(
    eventId: string,
    row: number,
    col: number,
    items: any[],
  ): void {
    const itemChange = getItemChangeDefinition(eventId);
    if (!itemChange) return;
    broadcastItemChange(
      worldId,
      "player",
      userId,
      itemChange.id,
      row,
      col,
      items,
    );
  }

  function maybeBroadcastConfiguredItemChange(
    row: number,
    col: number,
    items: any[],
  ): void {
    const execution = getActionExecutionConfig();
    if (!execution || !execution.itemChange) return;
    broadcastConfiguredItemChangeById(
      execution.itemChange.eventId,
      row,
      col,
      items,
    );
  }

  // Resolves the action's worldMutation to the tile mod it writes. Rows seeded
  // before sourceKind existed carry the old closed enum instead — those four
  // built-in ids are named here, in the one place that has to understand the
  // old shape, rather than back in the handlers they came from. The bootstrap
  // migration in item-registry.ts rewrites them, so this is a safety net for
  // any row it does not reach (a creator-owned one).
  function resolveWorldMutation(
    cfg: NonNullable<ActionDefinition["execution"]>["worldMutation"],
  ): { sourceKind: string; tileType: string } | null {
    if (!cfg) return null;
    if (cfg.sourceKind) {
      return {
        sourceKind: String(cfg.sourceKind),
        tileType: String(cfg.tileType || ""),
      };
    }
    if (cfg.storage === "trees") {
      const treeAction = cfg.treeAction || (action === "cut" ? "cut" : "plant");
      return {
        sourceKind: "tree",
        tileType:
          treeAction === "cut" ? WORLD_TILE_GROUND : WORLD_TILE_PINE_TREE,
      };
    }
    if (cfg.storage === "houses") {
      const houseAction =
        cfg.houseAction ||
        (action === "destroy_house" ? "destroy_house" : "build_house");
      return {
        sourceKind: "house",
        tileType: houseAction === "destroy_house" ? "" : WORLD_TILE_HOUSE,
      };
    }
    return null;
  }

  function maybePersistConfiguredWorldMutation(row: number, col: number): void {
    const execution = getActionExecutionConfig();
    const mutation = resolveWorldMutation(
      execution ? execution.worldMutation : undefined,
    );
    if (!mutation) return;
    const mods = loadTileModsOfKind(worldId, mutation.sourceKind);
    applyTileMod(
      worldId,
      userId,
      "player",
      row,
      col,
      mutation.sourceKind,
      mutation.tileType,
      mods,
    );
    maybeSendConfiguredWorldEvent(row, col, mutation);
  }

  function maybePersistConfiguredItemMutation(
    row: number,
    col: number,
    itemsState: Record<string, any[]>,
    changedItems: any[],
  ): boolean {
    const execution = getActionExecutionConfig();
    if (!execution || !execution.itemMutation) return false;

    if (execution.itemMutation.saveWorldItems) {
      saveWorldItems(worldId, itemsState);
      maybeBroadcastConfiguredItemChange(row, col, changedItems);
      return true;
    }

    return false;
  }

  function getBlockedZoneError(row: number, col: number): string | null {
    const validation = actionDefinition && actionDefinition.validation;
    const blockedZones =
      validation && Array.isArray(validation.blockedZones)
        ? validation.blockedZones
        : [];

    for (let i = 0; i < blockedZones.length; i++) {
      const blockedZone = blockedZones[i];
      if (!blockedZone || typeof blockedZone.kind !== "string") continue;

      if (isReservedTile(worldId, row, col, blockedZone.kind)) {
        return blockedZone.errorMessage || "error.action_not_allowed_here";
      }
    }

    return null;
  }

  function getActionValidationError(
    row: number,
    col: number,
    map: number[][],
  ): string | null {
    const validation = actionDefinition && actionDefinition.validation;
    if (!validation) return null;

    if (
      validation.requireWalkableTile &&
      map[row] &&
      !isWorldTileWalkable(map[row][col])
    ) {
      return validation.requireWalkableTile.errorMessage;
    }

    // Tile-state rules, in the order the action lists them, so a specific
    // rule claims its own message before a general one fires.
    const tileRules = resolveTileStateRules(validation);
    for (let i = 0; i < tileRules.length; i++) {
      const rule = tileRules[i];
      const matches = tileStateMatches(rule, row, col, map);
      if (rule.kind === "present" && !matches) return rule.errorMessage;
      if (rule.kind === "absent" && matches) return rule.errorMessage;
    }

    if (validation.requireItemState) {
      const tileItems = getTileItemsSnapshot(row, col);
      const requiredItemId = validation.requireItemState.itemId;
      const hasItem = tileItems.some(function (item) {
        return item && item.type === requiredItemId;
      });
      if (validation.requireItemState.kind === "present" && !hasItem) {
        return validation.requireItemState.errorMessage;
      }
      if (validation.requireItemState.kind === "absent" && hasItem) {
        return validation.requireItemState.errorMessage;
      }
    }

    return null;
  }

  type TileStateRule = {
    tileType: string;
    kind: "present" | "absent";
    errorMessage: string;
    sourceKind?: string;
  };

  // The action's tile-state rules, translating the legacy tree/house pair for
  // rows written before requireTileState existed. Those two said exactly what
  // the rules below say; keeping the translation here means the check itself
  // never has to know what a tree or a house is.
  function resolveTileStateRules(
    validation: NonNullable<ActionDefinition["validation"]>,
  ): TileStateRule[] {
    if (Array.isArray(validation.requireTileState)) {
      return validation.requireTileState as TileStateRule[];
    }
    const rules: TileStateRule[] = [];
    const tree = validation.requireTreeState;
    if (tree && tree.kind === "plantable") {
      rules.push({
        tileType: WORLD_TILE_PINE_TREE,
        kind: "absent",
        errorMessage: tree.conflictErrorMessage || "Already exists",
      });
      rules.push({
        tileType: WORLD_TILE_GROUND,
        kind: "present",
        errorMessage: tree.missingErrorMessage || "Cannot use here",
      });
    }
    if (tree && tree.kind === "cuttable") {
      rules.push({
        sourceKind: "tree",
        tileType: WORLD_TILE_GROUND,
        kind: "absent",
        errorMessage: tree.conflictErrorMessage || "Already removed",
      });
      rules.push({
        tileType: WORLD_TILE_PINE_TREE,
        kind: "present",
        errorMessage: tree.missingErrorMessage || "Nothing to cut",
      });
    }
    if (validation.requireHouseState) {
      rules.push({
        tileType: WORLD_TILE_HOUSE,
        kind: validation.requireHouseState.kind,
        errorMessage: validation.requireHouseState.errorMessage,
      });
    }
    return rules;
  }

  /**
   * Whether the target tile currently looks like the rule's tileType. Without
   * a sourceKind this reads the effective tile — generated terrain with world
   * mods painted over it — so a planted pine and a generated one match alike
   * and a cut one does not. With a sourceKind it asks specifically whether a
   * mod of that kind is showing that tile type, which is what tells "already
   * cut" apart from "there was never a tree here".
   */
  function tileStateMatches(
    rule: TileStateRule,
    row: number,
    col: number,
    map: number[][],
  ): boolean {
    if (rule.sourceKind) {
      const mods = loadTileModsOfKind(worldId, rule.sourceKind);
      const mod = mods[row + "_" + col];
      return !!mod && String(mod.tile_type || "") === rule.tileType;
    }
    return !!map[row] && map[row][col] === worldTileValueForName(rule.tileType);
  }

  function resolveActionTarget(): {
    row: number;
    col: number;
    inBounds: boolean;
  } {
    const targetKind =
      actionDefinition && typeof actionDefinition.targetKind === "string"
        ? actionDefinition.targetKind
        : "facing_tile";

    if (
      targetKind === "self" ||
      targetKind === "current_tile" ||
      targetKind === "item" ||
      targetKind === "living" ||
      targetKind === "item_nearby" ||
      targetKind === "living_nearby" ||
      targetKind === "inventory"
    ) {
      return {
        row: canonical.row,
        col: canonical.col,
        inBounds: true,
      };
    }

    // A client-placed point (area attacks): the reticle tile from body.row/col.
    if (targetKind === "point") {
      const pr = Number(body && body.row);
      const pc = Number(body && body.col);
      const dims = getWorldDimensions(worldId);
      return {
        row: pr,
        col: pc,
        inBounds:
          Number.isFinite(pr) &&
          Number.isFinite(pc) &&
          pr >= 0 &&
          pr < dims.rows &&
          pc >= 0 &&
          pc < dims.cols,
      };
    }

    const targetTile = getTargetTileFromRotation(
      playerRow,
      playerCol,
      rotation,
    );

    // A door hangs on a (non-walkable) wall tile that may be beside the player
    // rather than the exact tile they face. For open/close_door, prefer the
    // faced tile if it holds a door, otherwise snap to an adjacent tile that
    // does — so the toggle works from any orientation, matching door_travel.
    if (action === "open_door" || action === "close_door") {
      const doorTile = findAdjacentDoorTile(targetTile.row, targetTile.col);
      if (doorTile) {
        return { row: doorTile.row, col: doorTile.col, inBounds: true };
      }
    }

    const worldDims = getWorldDimensions(worldId);
    return {
      row: targetTile.row,
      col: targetTile.col,
      inBounds:
        targetTile.row >= 0 &&
        targetTile.row < worldDims.rows &&
        targetTile.col >= 0 &&
        targetTile.col < worldDims.cols,
    };
  }

  // Find the door tile to open/close: the faced tile if it has a door, else
  // the first tile in the player's 8-neighbourhood that does. Returns null
  // when no door is adjacent (validation then reports "No door here").
  function findAdjacentDoorTile(
    facedRow: number,
    facedCol: number,
  ): { row: number; col: number } | null {
    const tileHasDoor = function (r: number, c: number): boolean {
      const items = worldItems[r + "_" + c];
      return (
        Array.isArray(items) &&
        items.some(function (it) {
          return isValidItem(it) && it.type === "door";
        })
      );
    };
    if (tileHasDoor(facedRow, facedCol)) {
      return { row: facedRow, col: facedCol };
    }
    const keys = getNearbyTileKeys(canonical.row, canonical.col);
    for (let i = 0; i < keys.length; i++) {
      const parts = String(keys[i]).split("_");
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      if (Number.isFinite(r) && Number.isFinite(c) && tileHasDoor(r, c)) {
        return { row: r, col: c };
      }
    }
    return null;
  }

  const resolvedTarget = resolveActionTarget();
  const nearbyTileItems = getNearbyTileItems(
    worldItems,
    canonical.row,
    canonical.col,
  );
  const canUseAction =
    canInventoryUseTreeAction(inv, action) ||
    canTileItemsUseTreeAction(nearbyTileItems, action);

  function maybeApplyLogicEffects(): void {
    if (
      !logicSourceItem ||
      !actionDefinition ||
      !actionDefinition.logicSpec ||
      !actionDefinition.logicSpec.effects ||
      actionDefinition.logicSpec.effects.length === 0
    ) {
      return;
    }
    const updated = applyEffects(actionDefinition.logicSpec, logicSourceItem);
    if (isValidItem(updated)) {
      replaceLivingItemById(inv, String(logicSourceItem.id || ""), updated);
    }
    savePlayerInventory(userId, inv);
  }

  // Removes up to `count` items of `itemId` from the tiles surrounding the
  // living (current tile + 8 neighbors), deleting the underlying world-item
  // rows and broadcasting the removal per affected tile. Returns how many it
  // actually removed, which may be less than `count`.
  function consumeCostItemFromNearbyTiles(
    itemId: string,
    count: number,
  ): number {
    let remaining = Number(count || 0);
    if (remaining <= 0) return 0;
    const tileKeys = getNearbyTileKeys(canonical.row, canonical.col);
    for (let k = 0; k < tileKeys.length && remaining > 0; k++) {
      const tileKey = tileKeys[k];
      const tileItems = worldItems[tileKey];
      if (!Array.isArray(tileItems)) continue;
      const removedFromTile: any[] = [];
      for (let i = tileItems.length - 1; i >= 0 && remaining > 0; i--) {
        const item = tileItems[i];
        if (isValidItem(item) && String(item.type || "") === itemId) {
          tileItems.splice(i, 1);
          deleteWorldItemById(String(item.id));
          removedFromTile.push(item);
          remaining--;
        }
      }
      if (tileItems.length === 0) delete worldItems[tileKey];
      if (removedFromTile.length > 0) {
        const parts = tileKey.split("_");
        broadcastItemChange(
          worldId,
          "player",
          userId,
          "ingredient_consume",
          Number(parts[0]),
          Number(parts[1]),
          removedFromTile,
        );
      }
    }
    return Number(count || 0) - remaining;
  }

  // Consumes actionDefinition.cost/fatigueCost when the action is about to
  // execute. Callers must invoke this exactly once per action, right before
  // the action's effects — tile-targeted actions call it after tile
  // validation (below); self/inventory-targeted actions with a dedicated
  // early-return branch call it for themselves since they never reach that
  // shared call site.
  //
  // Ingredients are sourced from the surrounding tiles first (current tile +
  // 8 neighbors) and only fall back to the living's inventory for whatever
  // count the tiles didn't cover, so picking ingredients up isn't required
  // before crafting/using an action on the spot.
  function applyActionStartCosts(): { status: number; payload: any } | null {
    let inventoryMutatedByCost = false;

    if (
      actionDefinition &&
      actionDefinition.cost &&
      actionDefinition.cost.length > 0
    ) {
      const heldCounts = countLivingItemsByType(inv);
      const tileCounts = countItemsByType(nearbyTileItems);
      const costItems = actionDefinition.cost;
      for (let i = 0; i < costItems.length; i++) {
        const need = Number(costItems[i].count || 0);
        const available =
          (tileCounts[costItems[i].itemId] || 0) +
          (heldCounts[costItems[i].itemId] || 0);
        if (available < need) {
          return {
            status: 200,
            payload: { ok: false, error: "error.missing_required_ingredients" },
          };
        }
      }
      for (let i = 0; i < costItems.length; i++) {
        const need = Number(costItems[i].count || 0);
        const takenFromTiles = consumeCostItemFromNearbyTiles(
          costItems[i].itemId,
          need,
        );
        const stillNeeded = need - takenFromTiles;
        if (stillNeeded > 0) {
          consumeLivingItemsByType(inv, costItems[i].itemId, stillNeeded);
        }
      }
      inventoryMutatedByCost = true;
    }

    if (actionDefinition && Number(actionDefinition.fatigueCost || 0) > 0) {
      inv.values.fatigue = Math.max(
        0,
        Number(inv.values.fatigue || 0) + Number(actionDefinition.fatigueCost),
      );
      inventoryMutatedByCost = true;
    }

    if (inventoryMutatedByCost) {
      savePlayerInventory(userId, inv);
      broadcastPlayerValuesChanged(worldId, userId, inv.values);
    }
    return null;
  }

  // Wraps applyActionStartCosts(): on a fresh (non-resumed) call to a
  // durationMs action, charges costs/fatigue immediately, persists a pending
  // action to be replayed later, and returns a "started" response instead of
  // letting the caller proceed to apply effects/produces right away. On a
  // resumed call (options.resuming), costs were already charged at start, so
  // this is a no-op and the caller proceeds straight to effects/produces —
  // the same code path instant actions already use.
  function applyActionStartCostsOrDefer(): {
    status: number;
    payload: any;
  } | null {
    if (options && options.resuming) return null;

    const costError = applyActionStartCosts();
    if (costError) return costError;

    if (actionDefinition && Number(actionDefinition.durationMs || 0) > 0) {
      const readyAt = Date.now() + Number(actionDefinition.durationMs);
      addPendingAction(
        worldId,
        userId,
        action,
        {
          ...body,
          row: resolvedTarget.row,
          col: resolvedTarget.col,
          rotation: rotation,
        },
        readyAt,
      );
      const startMessage =
        actionDefinition.execution &&
        actionDefinition.execution.startToastMessage;
      const startMessageKey =
        actionDefinition.execution &&
        actionDefinition.execution.startToastMessageKey;
      return {
        status: 200,
        payload: {
          ok: true,
          action: action,
          started: true,
          ready_at: readyAt,
          ...(startMessage ? { toast_message: startMessage } : {}),
          ...(startMessageKey ? { toast_message_key: startMessageKey } : {}),
        },
      };
    }

    return null;
  }

  if (!canUseAction) {
    return {
      status: 200,
      payload: {
        ok: false,
        error: "error.missing_required_item_for_action",
      },
    };
  }

  // Walk-then-act (DESIGN-targeting.md step 2): for an action whose targeting
  // approach is "walk_adjacent", a target chosen up to `range` tiles away but
  // not yet on the actor's tile is pursued instead of rejected — enqueue an
  // approach that steps the actor toward it each world tick and re-runs the
  // action on arrival (see resolvePendingActionsForWorld). Skipped when
  // resuming an approach step, so the on-arrival re-run executes normally.
  function maybeBeginApproachAction(): { status: number; payload: any } | null {
    if (options && options.resuming) return null;
    if (body && body.__approach) return null;
    if (!actionDefinition) return null;
    const targeting = resolveActionTargeting(actionDefinition);
    if (targeting.approach !== "walk_adjacent") return null;
    const targetTile = resolveApproachTargetTile(worldId, body);
    // No locatable target (or the target is already on the actor's tile): let
    // the action's own handler run now and respond.
    if (!targetTile) return null;
    if (targetTile.row === canonical.row && targetTile.col === canonical.col) {
      return null;
    }
    const reach = resolveEffectiveActionRange(targeting, null);
    if (
      !isWithinTileDistance(
        targetTile.row,
        targetTile.col,
        canonical.row,
        canonical.col,
        reach,
      )
    ) {
      // Out of reach — fall through so the handler reports its own
      // target-not-found/out-of-range error.
      return null;
    }
    const targetLabel = resolveApproachTargetLabel();
    addPendingAction(
      worldId,
      userId,
      action,
      {
        ...body,
        __approach: true,
        __approach_deadline: Date.now() + APPROACH_ACTION_MAX_MS,
        __approach_label: targetLabel,
      },
      Date.now(),
    );
    return {
      status: 200,
      payload: {
        ok: true,
        action: action,
        approaching: true,
        approach_target_label: targetLabel,
        ...toastFields(
          "tree_action.approaching_toast",
          "You move toward the target.",
        ),
      },
    };
  }

  // Best-effort display name for the approach target, resolved once at enqueue
  // and stored in the pending body so the active-actions panel (client and
  // getActiveActionsForUser) can label the in-flight approach: a living by its
  // nick/NPC name, a world item by its type's label.
  function resolveApproachTargetLabel(): string {
    const livingId =
      body && body.target_living_id ? String(body.target_living_id) : "";
    if (livingId) {
      const npcs = loadWorldNPCs(worldId);
      if (npcs[livingId]) {
        return resolveNPCDisplayName(worldId, livingId, npcs[livingId]);
      }
      return getEffectiveNick(livingId);
    }
    const itemId =
      body && body.target_item_id ? String(body.target_item_id) : "";
    if (itemId) {
      const keys = Object.keys(worldItems);
      for (let i = 0; i < keys.length; i++) {
        const arr = worldItems[keys[i]];
        if (!Array.isArray(arr)) continue;
        const found = arr.find(function (it) {
          return it && String(it.id) === itemId;
        });
        if (found) {
          const def = getItemDefinition(String(found.type || ""));
          return def ? def.visuals.fallbackLabel : String(found.type || "");
        }
      }
    }
    return "";
  }

  const approachStart = maybeBeginApproachAction();
  if (approachStart) return approachStart;

  // Evaluate item-state conditions (logicSpec) and collect the source item
  let logicSourceItem: any | null = null;
  if (actionDefinition && actionDefinition.logicSpec) {
    const logicSpec = actionDefinition.logicSpec;
    logicSourceItem = findFirstLivingItemByTypes(
      inv,
      getSourceItemIdsForAction(action),
    );
    if (logicSourceItem) {
      const condResult = evaluateConditions(logicSpec, logicSourceItem);
      if (!condResult.ok) {
        return {
          status: 200,
          payload: {
            ok: false,
            error: condResult.errorMessage || "error.action_condition_not_met",
          },
        };
      }
    }
  }

  if (action === "return_home") {
    switchUserWorld(
      userId,
      START_WORLD_ID,
      getDefaultSpawnPosition(START_WORLD_ID, userId),
    );
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        action: "return_home",
        world_id: START_WORLD_ID,
      }),
    };
  }

  if (action === "portal_travel" || action === "door_travel") {
    // A door and a rune gate travel identically — read the destination off the
    // faced/underfoot portal-kind item (door_travel's source is ["door"],
    // portal_travel's is ["portal"]) and switch worlds.
    const portalItemIds = getSourceItemIdsForAction(action);
    const portalEntry = nearbyTileItems.find(function (item) {
      return isValidItem(item) && portalItemIds.indexOf(item.type) !== -1;
    });
    if (!portalEntry) {
      return {
        status: 200,
        payload: { ok: false, error: "error.missing_required_item_for_action" },
      };
    }
    // A closed door blocks passage (rune gates have no open state, so this
    // only gates doors). Missing state is treated as closed for safety.
    if (
      isValidItem(portalEntry) &&
      portalEntry.type === "door" &&
      !(portalEntry.state && portalEntry.state.open === true)
    ) {
      return {
        status: 200,
        payload: { ok: false, error: "error.door_closed" },
      };
    }
    const newWorldId =
      isValidItem(portalEntry) && portalEntry.destination_world_id
        ? String(portalEntry.destination_world_id)
        : "10000";
    const destinationRow = isValidItem(portalEntry)
      ? Number(portalEntry.destination_row)
      : NaN;
    const destinationCol = isValidItem(portalEntry)
      ? Number(portalEntry.destination_col)
      : NaN;
    const destinationSpawn =
      Number.isFinite(destinationRow) && Number.isFinite(destinationCol)
        ? { row: destinationRow, col: destinationCol }
        : undefined;
    switchUserWorld(userId, newWorldId, destinationSpawn);
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        world_id: newWorldId,
      }),
    };
  }

  if (action === "pray") {
    // Praying revives whatever class declares a reviveClassId — the inverse
    // of the deathClassId that put the player in it. No class is named here,
    // so a creator's own death form is revived by the same handler.
    const prayClass = getLivingClassWithRefresh(String(inv.class_id || ""));
    const reviveClassId = prayClass
      ? String(prayClass.reviveClassId || "")
      : "";
    if (reviveClassId) {
      inv.class_id = reviveClassId;
      inv.values = Object.assign({}, inv.values, {
        currentHitPoints: inv.values.maxHitPoints,
      });
      savePlayerInventory(userId, inv);
      sendWorldScopedStreamEvent(String(worldId), "player_moved", {
        player_id: userId,
        row: canonical.row,
        col: canonical.col,
        seq: canonical.seq,
        rotation: canonical.rotation,
        class_id: inv.class_id,
        values: inv.values,
      });
      return {
        status: 200,
        payload: buildConfiguredSuccessPayload({
          ...toastFields(
            "tree_action.pray_revived_toast",
            "You feel alive again! You are human once more.",
          ),
          inventory: inv,
        }),
      };
    }
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        ...toastFields("tree_action.pray_toast", "You pray hard!"),
      }),
    };
  }

  // Declarative progression (action-registry.ts `progression`): spend one
  // living value to raise another by one. advance_level was the only instance
  // and its escalating cost was a constant in runtime-config.ts, which meant
  // the game had exactly one progression curve and no way to price a second.
  const progression = actionDefinition ? actionDefinition.progression : null;
  if (progression) {
    const context: Record<string, unknown> = { values: inv.values };
    const currentValue = Math.max(
      1,
      Math.floor(Number(getFieldValue(context, progression.field) || 1)),
    );
    if (
      progression.maxValue !== undefined &&
      currentValue >= Number(progression.maxValue)
    ) {
      return {
        status: 200,
        payload: { ok: false, error: "error.progression_at_maximum" },
      };
    }
    const cost =
      Math.floor(Number(progression.costBase || 0)) +
      currentValue * Math.floor(Number(progression.costPerStep || 0));
    const available = Math.floor(
      Number(getFieldValue(context, progression.costField) || 0),
    );
    if (available < cost) {
      return {
        status: 200,
        payload: {
          ok: false,
          error:
            progression.insufficientErrorMessage ||
            "error.not_enough_experience",
          required_experience: cost,
          current_experience: available,
        },
      };
    }
    const nextValue = currentValue + 1;
    setFieldValue(context, progression.costField, available - cost);
    setFieldValue(context, progression.field, nextValue);
    inv.values = context.values as Record<string, unknown>;
    savePlayerInventory(userId, inv);
    broadcastPlayerValuesChanged(worldId, userId, inv.values);
    const toast = progression.toast;
    let toastPayload: Record<string, unknown> = {};
    if (toast) {
      const english = String(toast.message || "")
        .split("{level}")
        .join(String(nextValue));
      toastPayload = toastFields(String(toast.messageKey || ""), english, {
        level: nextValue,
      });
    }
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        ...toastPayload,
        inventory: inv,
        new_level: nextValue,
        spent_experience: cost,
      }),
    };
  }

  if (action === "examine") {
    // Examine reports what the tile inspector would show for the item — class,
    // kind, combat stats, container fill, portal destination — for an item on
    // the ground *or* one the examiner carries (targeting targetScope "any").
    const targetItemId = String((body && body.target_item_id) || "");
    if (!targetItemId) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_item_required" },
      };
    }
    const located = resolveTargetedItem(targetItemId);
    if (!located) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_item_not_found" },
      };
    }
    const inspection = buildItemInspection(located.item, {
      source: located.source,
      row: located.row,
      col: located.col,
      slotId: located.slotId,
    });
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        ...toastFields(
          "tree_action.examine_toast",
          "You examine " + inspection.fallback_label + ".",
          { target: inspection.fallback_label },
        ),
        target_item_id: targetItemId,
        examined_item: inspection,
      }),
    };
  }

  // Declarative item effects (action-registry.ts `itemEffect`). break and fix
  // were two handlers doing the same arithmetic on an item's
  // state.currentHitPoints that heal and harm do on a living's values; both
  // are data now, and a creator's "sharpen" or "corrode" needs no code.
  const itemEffect = actionDefinition ? actionDefinition.itemEffect : null;
  if (itemEffect) {
    const targetItemId = String((body && body.target_item_id) || "");
    if (!targetItemId) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_item_required" },
      };
    }
    const effectTileKey = resolvedTarget.row + "_" + resolvedTarget.col;
    const targetItem = getTileItemsSnapshot(
      resolvedTarget.row,
      resolvedTarget.col,
    ).find(function (item) {
      return item && String(item.id) === targetItemId;
    });
    if (!targetItem) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_item_not_found" },
      };
    }

    const itemGate = evaluateEntityConditions(
      itemEffect.targetConditions,
      targetItem,
    );
    if (!itemGate.ok) {
      return {
        status: 200,
        payload: {
          ok: false,
          error: itemGate.errorMessage || "error.action_condition_not_met",
        },
      };
    }

    const targetItemDef = getItemDefinition(String(targetItem.type || ""));
    const targetItemLabel = targetItemDef
      ? targetItemDef.visuals.fallbackLabel
      : String(targetItem.type || "item");
    const itemState =
      targetItem.state && typeof targetItem.state === "object"
        ? targetItem.state
        : {};

    function itemEffectToast(
      variant: "hit" | "destroy" | "miss" | "none",
    ): Record<string, unknown> {
      const toasts = itemEffect ? itemEffect.toasts : undefined;
      const spec = toasts ? toasts[variant] : undefined;
      if (!spec) return {};
      const params = { target: targetItemLabel };
      let english = String(spec.message || "");
      Object.keys(params).forEach(function (name) {
        english = english
          .split("{" + name + "}")
          .join(String((params as Record<string, unknown>)[name]));
      });
      return toastFields(String(spec.messageKey || ""), english, params);
    }

    // Magnitude: the flat configured amount, or a rolled swing that can miss
    // outright and scales with what the actor is wielding.
    let magnitude = Math.floor(Number(itemEffect.amount || 0));
    if (itemEffect.roll === "attack_roll") {
      const armorClass = Number(itemState.armorClass) || 0;
      const attackRoll = 1 + Math.floor(Math.random() * 20);
      const isHit =
        attackRoll === 20 || (attackRoll !== 1 && attackRoll > armorClass);
      if (!isHit) {
        return {
          status: 200,
          payload: buildConfiguredSuccessPayload({
            ...itemEffectToast("miss"),
            target_item_id: targetItemId,
            result: "miss",
          }),
        };
      }
      magnitude =
        1 +
        Math.floor(
          Math.random() *
            Math.max(1, Number((inv.values && inv.values.weaponClass) || 0)),
        );
    }

    const context: Record<string, unknown> = {
      state: Object.assign({}, itemState),
    };
    const current = Number(getFieldValue(context, itemEffect.field) || 0);
    let next =
      itemEffect.op === "set"
        ? magnitude
        : itemEffect.op === "add"
          ? current + magnitude
          : current - magnitude;
    if (itemEffect.maxField) {
      const cap = Number(getFieldValue(context, itemEffect.maxField));
      if (Number.isFinite(cap)) next = Math.min(next, cap);
    }
    if (itemEffect.destroyAtZero) next = Math.max(0, next);
    setFieldValue(context, itemEffect.field, next);
    const delta = next - current;

    // A clamped no-op is not a failure — repairing an undamaged item is a
    // remark, not an error.
    if (delta === 0) {
      return {
        status: 200,
        payload: buildConfiguredSuccessPayload({
          ...itemEffectToast("none"),
          target_item_id: targetItemId,
          result: "none",
        }),
      };
    }

    if (itemEffect.destroyAtZero && next <= 0) {
      if (Array.isArray(worldItems[effectTileKey])) {
        worldItems[effectTileKey] = worldItems[effectTileKey].filter(function (
          item: any,
        ) {
          return item && String(item.id) !== targetItemId;
        });
        if (worldItems[effectTileKey].length === 0) {
          delete worldItems[effectTileKey];
        }
      }
      deleteWorldItemById(String(targetItem.id));
      if (itemEffect.destroyEventId) {
        broadcastConfiguredItemChangeById(
          itemEffect.destroyEventId,
          resolvedTarget.row,
          resolvedTarget.col,
          [targetItem],
        );
      }
      return {
        status: 200,
        payload: buildConfiguredSuccessPayload({
          ...itemEffectToast("destroy"),
          target_item_id: targetItemId,
          result: "destroy",
          delta: delta,
          tile_items: getTileItemsSnapshot(
            resolvedTarget.row,
            resolvedTarget.col,
          ),
        }),
      };
    }

    targetItem.state = context.state as Record<string, unknown>;
    upsertWorldItem(
      worldId,
      resolvedTarget.row,
      resolvedTarget.col,
      targetItem,
    );
    if (itemEffect.changeEventId) {
      broadcastConfiguredItemChangeById(
        itemEffect.changeEventId,
        resolvedTarget.row,
        resolvedTarget.col,
        getTileItemsSnapshot(resolvedTarget.row, resolvedTarget.col),
      );
    }
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        ...itemEffectToast("hit"),
        target_item_id: targetItemId,
        result: "hit",
        delta: delta,
        tile_items: getTileItemsSnapshot(
          resolvedTarget.row,
          resolvedTarget.col,
        ),
      }),
    };
  }

  if (action === "bury") {
    const targetItemId = String((body && body.target_item_id) || "");
    if (!targetItemId) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_item_required" },
      };
    }
    const buryTileKey = resolvedTarget.row + "_" + resolvedTarget.col;
    const itemsHere = getTileItemsSnapshot(
      resolvedTarget.row,
      resolvedTarget.col,
    );
    const targetItem = itemsHere.find(function (item) {
      return item && String(item.id) === targetItemId;
    });
    if (!targetItem) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_item_not_found" },
      };
    }
    // What is buriable is the action's own validWhen precondition — the same
    // data the client uses to decide whether to offer the button — rather
    // than a second copy of "npc_corpse" here. Retarget bury at gravestones
    // by editing the action row; this handler stays a generic "destroy the
    // targeted world item".
    const buryGate = evaluateEntityConditions(
      actionDefinition ? actionDefinition.validWhen : undefined,
      targetItem,
    );
    if (!buryGate.ok) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_item_not_buriable" },
      };
    }

    if (Array.isArray(worldItems[buryTileKey])) {
      worldItems[buryTileKey] = worldItems[buryTileKey].filter(function (
        item: any,
      ) {
        return item && String(item.id) !== targetItemId;
      });
      if (worldItems[buryTileKey].length === 0) {
        delete worldItems[buryTileKey];
      }
    }
    deleteWorldItemById(String(targetItem.id));
    broadcastItemChange(
      worldId,
      "player",
      userId,
      "item_bury_destroy",
      resolvedTarget.row,
      resolvedTarget.col,
      [targetItem],
    );
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        ...toastFields("tree_action.bury_toast", "You bury the corpse."),
        target_item_id: targetItemId,
        tile_items: getTileItemsSnapshot(
          resolvedTarget.row,
          resolvedTarget.col,
        ),
      }),
    };
  }

  if (action === "pick_item") {
    const targetItemId = String((body && body.target_item_id) || "");
    if (!targetItemId) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_item_required" },
      };
    }
    const pickTileKey = resolvedTarget.row + "_" + resolvedTarget.col;
    const targetItem = getTileItemsSnapshot(
      resolvedTarget.row,
      resolvedTarget.col,
    ).find(function (item) {
      return item && String(item.id) === targetItemId;
    });
    if (!targetItem) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_item_not_found" },
      };
    }
    if (!isPickableWorldItem(targetItem)) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_item_not_pickable" },
      };
    }
    // Claim by delete (same as the tile-level "pick all") so a concurrent
    // pickup of the same item cannot dupe it: only grant the item if this
    // request's delete actually removed its row.
    const claimed = deleteWorldItems([targetItem]);
    if (claimed.length === 0) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_item_not_found" },
      };
    }
    const claimedItem = claimed[0];
    if (Array.isArray(worldItems[pickTileKey])) {
      worldItems[pickTileKey] = worldItems[pickTileKey].filter(function (item) {
        return item && String(item.id) !== targetItemId;
      });
      if (worldItems[pickTileKey].length === 0) {
        delete worldItems[pickTileKey];
      }
    }
    inv.bag.push(claimedItem);
    savePlayerInventory(userId, inv);
    const pickChange = getItemChangeDefinition("pick");
    broadcastItemChange(
      worldId,
      "player",
      userId,
      pickChange ? pickChange.id : "pick",
      resolvedTarget.row,
      resolvedTarget.col,
      [claimedItem],
    );
    scheduleRespawnIfManifestTracked(
      worldId,
      "item",
      String(claimedItem.type || ""),
    );
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        ...toastFields("tree_action.pick_item_toast", "You pick up the item."),
        target_item_id: targetItemId,
        inventory: inv,
        tile_items: getTileItemsSnapshot(
          resolvedTarget.row,
          resolvedTarget.col,
        ),
      }),
    };
  }

  if (action === "poke") {
    const targetLivingId = String((body && body.target_living_id) || "");
    if (!targetLivingId) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_living_required" },
      };
    }
    const npcsHere = loadWorldNPCs(worldId);
    const targetNpc = npcsHere[targetLivingId];
    let targetLivingLabel = "";
    let targetFound = false;
    if (
      targetNpc &&
      targetNpc.row === resolvedTarget.row &&
      targetNpc.col === resolvedTarget.col
    ) {
      targetLivingLabel = resolveNPCDisplayName(
        worldId,
        targetLivingId,
        targetNpc,
      );
      targetFound = true;
    } else {
      const worldPlayers = loadWorldPlayers(worldId);
      const targetPlayer = worldPlayers[targetLivingId];
      if (
        targetPlayer &&
        targetPlayer.row === resolvedTarget.row &&
        targetPlayer.col === resolvedTarget.col
      ) {
        targetLivingLabel = getEffectiveNick(targetLivingId);
        targetFound = true;
        sendRecipientScopedStreamEvent(targetLivingId, "poked", {
          poker_id: userId,
          poker_nick: getEffectiveNick(userId),
        });
      } else if (
        targetLivingId === userId &&
        canonical.row === resolvedTarget.row &&
        canonical.col === resolvedTarget.col
      ) {
        targetLivingLabel = getEffectiveNick(userId);
        targetFound = true;
      }
    }
    if (!targetFound) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_living_not_found" },
      };
    }
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        ...toastFields(
          "tree_action.poke_toast",
          "You poke " + targetLivingLabel + ".",
          { target: targetLivingLabel },
        ),
        target_living_id: targetLivingId,
        target_living_label: targetLivingLabel,
      }),
    };
  }

  if (action === "follow") {
    const targetLivingId = String((body && body.target_living_id) || "");
    if (!targetLivingId || targetLivingId === userId) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_living_required" },
      };
    }
    const npcsHere = loadWorldNPCs(worldId);
    const targetNpc = npcsHere[targetLivingId];
    let targetLivingLabel = "";
    let targetKind: "player" | "npc" | null = null;
    if (
      targetNpc &&
      isWithinTileDistance(
        targetNpc.row,
        targetNpc.col,
        canonical.row,
        canonical.col,
        NEARBY_TARGET_TILE_DISTANCE,
      )
    ) {
      targetLivingLabel = resolveNPCDisplayName(
        worldId,
        targetLivingId,
        targetNpc,
      );
      targetKind = "npc";
    } else {
      const worldPlayers = loadWorldPlayers(worldId);
      const targetPlayer = worldPlayers[targetLivingId];
      if (
        targetPlayer &&
        isWithinTileDistance(
          targetPlayer.row,
          targetPlayer.col,
          canonical.row,
          canonical.col,
          NEARBY_TARGET_TILE_DISTANCE,
        )
      ) {
        targetLivingLabel = getEffectiveNick(targetLivingId);
        targetKind = "player";
      }
    }
    if (!targetKind) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_living_not_found" },
      };
    }
    saveFollowState(userId, worldId, targetLivingId, targetKind);
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        ...toastFields(
          "tree_action.follow_toast",
          "You start following " + targetLivingLabel + ".",
          { target: targetLivingLabel },
        ),
        target_living_id: targetLivingId,
        target_living_label: targetLivingLabel,
      }),
    };
  }

  if (action === "stop_follow") {
    deleteFollowState(userId);
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        ...toastFields("tree_action.stop_follow_toast", "You stop following."),
      }),
    };
  }

  if (action === "cancel_approach") {
    // Stop any in-flight walk-then-act approach: deleting the pending rows
    // halts the per-tick stepping (the approach's own row is what keeps it
    // walking — see advanceApproachAction), like stop_follow deletes the
    // follow row.
    const approaches = loadUserApproachActions(worldId, userId);
    for (let i = 0; i < approaches.length; i++) {
      deletePendingAction(approaches[i].id);
    }
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        ...toastFields(
          "tree_action.cancel_approach_toast",
          "You stop moving toward the target.",
        ),
        cancelled_count: approaches.length,
      }),
    };
  }

  if (action === "fight") {
    if (!isCombatantClass(inv.class_id)) {
      return {
        status: 200,
        payload: { ok: false, error: "error.ghost_cannot_fight" },
      };
    }
    const targetLivingId = String((body && body.target_living_id) || "");
    if (!targetLivingId || targetLivingId === userId) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_living_required" },
      };
    }
    // Engagement range is weapon-derived: a bow lets you open the fight from
    // farther away (rangeFrom "item"), a melee weapon keeps the base reach.
    const fightReach = actionDefinition
      ? resolveEffectiveActionRange(
          resolveActionTargeting(actionDefinition),
          wieldedWeapon(inv),
        )
      : NEARBY_TARGET_TILE_DISTANCE;
    const npcsHere = loadWorldNPCs(worldId);
    const targetNpc = npcsHere[targetLivingId];
    let targetLivingLabel = "";
    let targetKind: "player" | "npc" | null = null;
    if (
      targetNpc &&
      isWithinTileDistance(
        targetNpc.row,
        targetNpc.col,
        canonical.row,
        canonical.col,
        fightReach,
      )
    ) {
      targetLivingLabel = resolveNPCDisplayName(
        worldId,
        targetLivingId,
        targetNpc,
      );
      targetKind = "npc";
    } else {
      const worldPlayers = loadWorldPlayers(worldId);
      const targetPlayer = worldPlayers[targetLivingId];
      if (
        targetPlayer &&
        isWithinTileDistance(
          targetPlayer.row,
          targetPlayer.col,
          canonical.row,
          canonical.col,
          fightReach,
        )
      ) {
        targetLivingLabel = getEffectiveNick(targetLivingId);
        targetKind = "player";
      }
    }
    if (!targetKind) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_living_not_found" },
      };
    }
    if (
      targetKind === "player" &&
      !isCombatantClass(loadPlayerInventory(targetLivingId).class_id)
    ) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_is_ghost" },
      };
    }
    // Fighting also follows the target so the attacker chases it into
    // range every tick (see tickFollowForWorld); tickFightForWorld lands a
    // hit whenever attacker and target end up co-located.
    saveFightState(userId, "player", worldId, targetLivingId, targetKind);
    saveFollowState(userId, worldId, targetLivingId, targetKind);
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        ...toastFields(
          "tree_action.fight_toast",
          "You start fighting " + targetLivingLabel + ".",
          { target: targetLivingLabel },
        ),
        target_living_id: targetLivingId,
        target_living_label: targetLivingLabel,
      }),
    };
  }

  if (action === "stop_fight") {
    deleteFightState(userId);
    deleteFollowState(userId);
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        ...toastFields("tree_action.stop_fight_toast", "You stop fighting."),
      }),
    };
  }

  // Declarative living effects (action-registry.ts `livingEffect`). One block
  // serves every spell: firebolt, fireball, heal and harm are now four rows of
  // data rather than four handlers, and a creator's new spell needs no code at
  // all. This block owns *targeting* — who is in reach, and whether the actor
  // may act — while applyLivingEffect owns the mutation, death and broadcasts.
  const livingEffect = actionDefinition ? actionDefinition.livingEffect : null;
  if (livingEffect) {
    const actorGate = evaluateEntityConditions(livingEffect.actorConditions, {
      class_id: inv.class_id,
      values: inv.values,
    });
    if (!actorGate.ok) {
      return {
        status: 200,
        payload: {
          ok: false,
          error: actorGate.errorMessage || "error.action_condition_not_met",
        },
      };
    }

    const effectTargeting = resolveActionTargeting(actionDefinition);
    const reach = resolveEffectiveActionRange(effectTargeting, null);
    const allowedKinds = Array.isArray(livingEffect.targetKinds)
      ? livingEffect.targetKinds
      : ["player", "npc"];
    const allowsNPCs = allowedKinds.indexOf("npc") !== -1;
    const allowsPlayers = allowedKinds.indexOf("player") !== -1;
    const allowSelf = livingEffect.allowSelf !== false;
    // Kill XP: the action's configured base, scaled per victim by their level
    // inside applyLivingEffect — the same deal a won fight gets.
    const killBase =
      actionDefinition.experience && actionDefinition.experience.onKill
        ? Math.floor(Number(actionDefinition.experience.amount || 0))
        : 0;

    function livingEffectToast(
      variant: "hit" | "kill" | "miss",
      params: Record<string, unknown>,
    ): Record<string, unknown> {
      const toasts = livingEffect ? livingEffect.toasts : undefined;
      const spec = toasts ? toasts[variant] : undefined;
      if (!spec) return {};
      // Substitute the tokens into the English fallback too: a spec with no
      // messageKey never reaches the client's tFormat, which only formats when
      // a key is present.
      let english = String(spec.message || "");
      Object.keys(params).forEach(function (name) {
        english = english.split("{" + name + "}").join(String(params[name]));
      });
      return toastFields(String(spec.messageKey || ""), english, params);
    }

    if (livingEffect.affects === "area") {
      if (!resolvedTarget.inBounds) {
        return {
          status: 200,
          payload: { ok: false, error: "error.target_out_of_bounds" },
        };
      }
      // The reticle tile must itself be within casting range of the actor;
      // areaRadius then spreads outward from the reticle, not from the actor.
      if (
        !isWithinTileDistance(
          resolvedTarget.row,
          resolvedTarget.col,
          canonical.row,
          canonical.col,
          reach,
        )
      ) {
        return {
          status: 200,
          payload: { ok: false, error: "error.target_out_of_range" },
        };
      }
      const areaRadius = Math.max(
        0,
        Math.floor(Number(effectTargeting.areaRadius) || 0),
      );
      // Candidate ids are captured up front; a lethal strike removes its
      // target, which the next strike's fresh load simply won't find.
      const areaTargets: Array<{ id: string; kind: "player" | "npc" }> = [];
      if (allowsNPCs) {
        const npcsInBlast = loadWorldNPCs(worldId);
        Object.keys(npcsInBlast).forEach(function (npcId) {
          const npc = npcsInBlast[npcId];
          if (!npc) return;
          if (
            isWithinTileDistance(
              npc.row,
              npc.col,
              resolvedTarget.row,
              resolvedTarget.col,
              areaRadius,
            )
          ) {
            areaTargets.push({ id: npcId, kind: "npc" });
          }
        });
      }
      if (allowsPlayers) {
        const playersInBlast = loadWorldPlayers(worldId);
        Object.keys(playersInBlast).forEach(function (playerId) {
          if (!allowSelf && playerId === userId) return;
          const player = playersInBlast[playerId];
          if (!player) return;
          if (
            isWithinTileDistance(
              player.row,
              player.col,
              resolvedTarget.row,
              resolvedTarget.col,
              areaRadius,
            )
          ) {
            areaTargets.push({ id: playerId, kind: "player" });
          }
        });
      }

      let struckCount = 0;
      let killCount = 0;
      let totalDelta = 0;
      let totalXp = 0;
      let latestValues: Record<string, unknown> | undefined;
      for (let ai = 0; ai < areaTargets.length; ai++) {
        const outcome = applyLivingEffect(
          worldId,
          userId,
          areaTargets[ai].id,
          areaTargets[ai].kind,
          livingEffect,
          killBase,
        );
        // A blocked target failed its own gate (a ghost caught in the blast);
        // in area mode that is a skip, not an error for the whole cast.
        if (outcome.result === "hit" || outcome.result === "kill") {
          struckCount++;
          totalDelta += outcome.delta;
        }
        if (outcome.result === "kill") {
          killCount++;
          if (outcome.experience_gained) {
            totalXp += outcome.experience_gained;
            latestValues = outcome.values;
          }
        }
      }
      const areaParams = {
        struck: String(struckCount),
        kills: String(killCount),
      };
      return {
        status: 200,
        payload: buildConfiguredSuccessPayload({
          ...livingEffectToast(struckCount > 0 ? "hit" : "miss", areaParams),
          result: struckCount > 0 ? "hit" : "miss",
          struck_count: struckCount,
          kill_count: killCount,
          total_damage: totalDelta < 0 ? -totalDelta : 0,
          ...(totalXp > 0
            ? { experience_gained: totalXp, values: latestValues }
            : {}),
        }),
      };
    }

    const targetLivingId = String((body && body.target_living_id) || "");
    if (!targetLivingId || (!allowSelf && targetLivingId === userId)) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_living_required" },
      };
    }
    // NPCs are looked up first so an id that somehow names both resolves the
    // same way it did before, then players. Either lookup only happens when
    // the effect admits that kind at all.
    let targetKind: "player" | "npc" | null = null;
    if (allowsNPCs) {
      const targetNpc = loadWorldNPCs(worldId)[targetLivingId];
      if (
        targetNpc &&
        isWithinTileDistance(
          targetNpc.row,
          targetNpc.col,
          canonical.row,
          canonical.col,
          reach,
        )
      ) {
        targetKind = "npc";
      }
    }
    if (!targetKind && allowsPlayers) {
      const targetPlayer = loadWorldPlayers(worldId)[targetLivingId];
      if (
        targetPlayer &&
        isWithinTileDistance(
          targetPlayer.row,
          targetPlayer.col,
          canonical.row,
          canonical.col,
          reach,
        )
      ) {
        targetKind = "player";
      }
    }
    if (!targetKind) {
      return {
        status: 200,
        payload: { ok: false, error: "error.target_living_not_found" },
      };
    }

    const outcome = applyLivingEffect(
      worldId,
      userId,
      targetLivingId,
      targetKind,
      livingEffect,
      killBase,
    );
    if (outcome.result === "blocked") {
      return {
        status: 200,
        payload: {
          ok: false,
          error: outcome.errorMessage || "error.action_condition_not_met",
        },
      };
    }
    const toastVariant =
      outcome.result === "kill"
        ? "kill"
        : outcome.result === "miss"
          ? "miss"
          : "hit";
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload({
        ...livingEffectToast(toastVariant, { target: outcome.target_label }),
        target_living_id: targetLivingId,
        target_living_label: outcome.target_label,
        result: outcome.result,
        delta: outcome.delta,
        damage: outcome.delta < 0 ? -outcome.delta : 0,
        ...(outcome.experience_gained
          ? {
              experience_gained: outcome.experience_gained,
              values: outcome.values,
            }
          : {}),
      }),
    };
  }

  const targetRow = resolvedTarget.row;
  const targetCol = resolvedTarget.col;

  if (!resolvedTarget.inBounds) {
    return {
      status: 200,
      payload: { ok: false, error: "error.target_out_of_bounds" },
    };
  }

  const blockedZoneError = getBlockedZoneError(targetRow, targetCol);
  if (blockedZoneError) {
    return {
      status: 200,
      payload: { ok: false, error: blockedZoneError },
    };
  }

  const map = getEffectiveMap(worldId);

  const actionValidationError = getActionValidationError(
    targetRow,
    targetCol,
    map,
  );

  if (actionValidationError) {
    return {
      status: 200,
      payload: { ok: false, error: actionValidationError },
    };
  }

  const actionStartCostError = applyActionStartCostsOrDefer();
  if (actionStartCostError) return actionStartCostError;

  if (action === "open_door" || action === "close_door") {
    // Toggle the faced door's open state and persist it on the world item.
    // requireItemState (door present) already ran in validation above, so a
    // door is on the target tile.
    const doorTileKey = targetRow + "_" + targetCol;
    const doorTileItems = Array.isArray(worldItems[doorTileKey])
      ? worldItems[doorTileKey]
      : [];
    const doorEntry = doorTileItems.find(function (item) {
      return isValidItem(item) && item.type === "door";
    });
    if (!doorEntry) {
      return {
        status: 200,
        payload: { ok: false, error: "error.missing_required_item_for_action" },
      };
    }
    const shouldOpen = action === "open_door";
    const isOpen = !!(doorEntry.state && doorEntry.state.open === true);
    if (isOpen === shouldOpen) {
      return {
        status: 200,
        payload: {
          ok: false,
          error: shouldOpen
            ? "error.door_already_open"
            : "error.door_already_closed",
        },
      };
    }
    doorEntry.state = Object.assign({}, doorEntry.state, { open: shouldOpen });
    upsertWorldItem(worldId, targetRow, targetCol, doorEntry);
    maybePersistConfiguredItemMutation(targetRow, targetCol, worldItems, [
      doorEntry,
    ]);
    return {
      status: 200,
      payload: buildConfiguredSuccessPayload(),
    };
  }

  // Linked worlds (action-registry.ts `linkedWorld`): build a brand-new world
  // and a matched pair of items joining this tile to it. build_portal and
  // build_door were near-identical copies of this — the only real differences
  // were which item to plant, where the destination comes from, and whether
  // the far-side twin sits underfoot or on the wall — so all three are data
  // now and a third way in needs no code.
  const linkedWorld = actionDefinition ? actionDefinition.linkedWorld : null;
  if (linkedWorld) {
    let destWorldType = String(linkedWorld.worldType || "");
    let destWorldClassId = String(linkedWorld.worldClassId || "");
    let destDimensions: { rows?: number; cols?: number } | undefined =
      linkedWorld.rows !== undefined || linkedWorld.cols !== undefined
        ? { rows: linkedWorld.rows, cols: linkedWorld.cols }
        : undefined;

    if (linkedWorld.destinationFrom === "request") {
      destWorldType = requestedPortalWorldType;
      destDimensions = requestedPortalDimensions;
      destWorldClassId = requestedWorldClassId;
      // A world class (creator-defined world type) supplies the base preset
      // and default size; explicit rows/cols in the request still win.
      if (requestedWorldClassId) {
        const worldClass = getWorldClassWithRefresh(requestedWorldClassId);
        if (!worldClass) {
          return {
            status: 200,
            payload: { ok: false, error: "error.world_class_not_found" },
          };
        }
        destWorldType = normalizeWorldType(worldClass.baseType);
        destDimensions = {
          rows:
            destDimensions && destDimensions.rows !== undefined
              ? destDimensions.rows
              : worldClass.rows,
          cols:
            destDimensions && destDimensions.cols !== undefined
              ? destDimensions.cols
              : worldClass.cols,
        };
      }
    }

    const createdWorld = createWorldOfType(
      destWorldType,
      destDimensions,
      destWorldClassId || destWorldType,
    );

    const targetTileKey = targetRow + "_" + targetCol;
    const linkedItem: Record<string, any> = {
      id: "w" + worldId + "_i" + nextWorldItemId(worldId),
      type: linkedWorld.itemId,
      created_at: Date.now(),
      destination_world_id: createdWorld.world_id,
      destination_world_type: createdWorld.world_type,
      destination_world_rows: createdWorld.rows,
      destination_world_cols: createdWorld.cols,
      // Where the traveller lands: the new world's default spawn tile (see
      // getDefaultSpawnPosition — 1,1 for a world with no spawn reservations,
      // which a freshly created one never has).
      destination_row: LINKED_WORLD_SPAWN_ROW,
      destination_col: LINKED_WORLD_SPAWN_COL,
    };
    if (linkedWorld.itemState) {
      linkedItem.state = Object.assign({}, linkedWorld.itemState);
    }
    // Informational only (nothing reads it back): record the class when one
    // was actually chosen, rather than when it merely echoes the world type.
    if (destWorldClassId && destWorldClassId !== createdWorld.world_type) {
      linkedItem.destination_world_class_id = destWorldClassId;
    }
    if (!worldItems[targetTileKey]) worldItems[targetTileKey] = [];
    worldItems[targetTileKey].push(linkedItem);
    upsertWorldItem(worldId, targetRow, targetCol, linkedItem);
    maybePersistConfiguredItemMutation(targetRow, targetCol, worldItems, [
      linkedItem,
    ]);

    // Seed the destination's item manifest FIRST, then plant the return item
    // on top. ensureWorldItems wipes and reseeds any world whose `seeded`
    // marker is stale (a brand-new world's is 0), so a return item planted
    // before the world was seeded would be deleted by the first visitor's
    // reseed. Seeding here marks the world current, so what we add below
    // survives.
    ensureWorldItems(createdWorld.world_id);

    // The twin, pointing back at this exact tile so whoever steps through is
    // not stranded and returns to where they built rather than to the spawn.
    const returnItem: Record<string, any> = {
      id:
        "w" +
        createdWorld.world_id +
        "_i" +
        nextWorldItemId(createdWorld.world_id),
      type: linkedWorld.itemId,
      created_at: Date.now(),
      destination_world_id: worldId,
      destination_row: targetRow,
      destination_col: targetCol,
    };
    if (linkedWorld.itemState) {
      returnItem.state = Object.assign({}, linkedWorld.itemState);
    }
    const returnOffset = linkedWorld.returnOffset;
    upsertWorldItem(
      createdWorld.world_id,
      LINKED_WORLD_SPAWN_ROW + (returnOffset ? Number(returnOffset.row) : 0),
      LINKED_WORLD_SPAWN_COL + (returnOffset ? Number(returnOffset.col) : 0),
      returnItem,
    );

    return {
      status: 200,
      payload: buildConfiguredSuccessPayload(),
    };
  }

  maybePersistConfiguredWorldMutation(targetRow, targetCol);

  let removedCount: number | undefined;

  if (actionDefinition && actionDefinition.removes) {
    const removedItemIds = actionDefinition.removes.map(function (entry) {
      return entry.itemId;
    });
    const removeTileKey = targetRow + "_" + targetCol;
    const tileItemsAtTarget = Array.isArray(worldItems[removeTileKey])
      ? worldItems[removeTileKey]
      : [];
    const keptItems: any[] = [];
    const removedItems: any[] = [];
    tileItemsAtTarget.forEach(function (item) {
      if (item && removedItemIds.indexOf(item.type) !== -1) {
        removedItems.push(item);
      } else {
        keptItems.push(item);
      }
    });

    if (keptItems.length > 0) worldItems[removeTileKey] = keptItems;
    else delete worldItems[removeTileKey];
    deleteWorldItems(removedItems);
    maybePersistConfiguredItemMutation(
      targetRow,
      targetCol,
      worldItems,
      removedItems,
    );
    removedCount = removedItems.length;
  }

  if (
    actionDefinition &&
    actionDefinition.produces &&
    actionDefinition.produces.length > 0
  ) {
    const inventoryProduces = actionDefinition.produces.filter(
      function (entry) {
        return (entry.placement || "inventory") === "inventory";
      },
    );
    const tileProduces = actionDefinition.produces.filter(function (entry) {
      return entry.placement === "target_tile";
    });

    if (inventoryProduces.length > 0) {
      spawnItemsForUser(worldId, userId, inv, inventoryProduces);
      savePlayerInventory(userId, inv);
    }

    if (tileProduces.length > 0) {
      const placedItems = spawnItemsOnTile(worldId, userId, tileProduces);
      const targetTileKey = targetRow + "_" + targetCol;
      if (!worldItems[targetTileKey]) worldItems[targetTileKey] = [];
      placedItems.forEach(function (placedItem) {
        worldItems[targetTileKey].push(placedItem);
        upsertWorldItem(worldId, targetRow, targetCol, placedItem);
      });
      maybePersistConfiguredItemMutation(
        targetRow,
        targetCol,
        worldItems,
        placedItems,
      );
    }
  }

  maybeAppendConfiguredWorldChatMessage();
  maybeApplyLogicEffects();

  return {
    status: 200,
    payload: buildConfiguredSuccessPayload(
      removedCount !== undefined ? { removed_count: removedCount } : undefined,
    ),
  };
}

// Called from the NPC tick loop (npc-orchestration.ts), which already runs
// on a lease-guarded per-world cadence — reused here so only one server
// instance ever resolves a given world's due pending (durationMs) actions.
export function resolvePendingActionsForWorld(
  worldId: string,
  now: number,
): void {
  const due = loadDuePendingActions(worldId, now);
  due.forEach(function (row) {
    let body: any = {};
    try {
      body = JSON.parse(row.body_json || "{}");
    } catch (e) {
      body = {};
    }
    if (getPlayerWorld(row.user_id) !== worldId) {
      // Player left this world before the action resolved; drop it rather
      // than resolve it somewhere the player no longer is.
      deletePendingAction(row.id);
      return;
    }
    if (body && body.__approach) {
      // A walk-then-act approach (DESIGN-targeting.md step 2), not a
      // durationMs resume — step toward the target and re-run on arrival.
      advanceApproachAction(worldId, row, body, now);
      return;
    }
    const result = runInWorldTransaction(
      "pending_action:" + String(row.id),
      function () {
        return performTreeActionForUser(row.user_id, body, { resuming: true });
      },
    );
    deletePendingAction(row.id);
    sendRecipientScopedStreamEvent(
      row.user_id,
      "action_completed",
      result.payload,
    );
  });
}

// Advances one walk-then-act approach by a single tick: locate the target's
// current tile, and either run the action (arrived), abandon it (target gone or
// the give-up deadline passed), or take one step toward the target. The pending
// row is enqueued once as always-due (ready_at in the past) and left in place
// while walking, then deleted only on completion/abandon — so it is advanced
// once per tick with no re-enqueue churn, and deleting the row (see the
// cancel_approach handler, or the player leaving the world) cleanly stops it,
// exactly like a follow row. Called only from resolvePendingActionsForWorld,
// itself lease-guarded per world.
function advanceApproachAction(
  worldId: string,
  row: { id: number; user_id: string; action: string },
  body: any,
  now: number,
): void {
  const userId = String(row.user_id);

  const targetTile = resolveApproachTargetTile(worldId, body);
  if (!targetTile) {
    deletePendingAction(row.id);
    sendRecipientScopedStreamEvent(userId, "action_completed", {
      ok: false,
      action: row.action,
      error: "error.approach_target_gone",
    });
    return;
  }

  const canonical = getCanonicalPlayerState(worldId, userId);
  if (targetTile.row === canonical.row && targetTile.col === canonical.col) {
    // Arrived. Re-run the action for real; the __approach marker stays in the
    // body so this run does not start a fresh approach (maybeBeginApproachAction
    // is a no-op for it) even if the target drifts a tile as we act.
    deletePendingAction(row.id);
    const result = runInWorldTransaction(
      "approach_action:" + String(row.id),
      function () {
        return performTreeActionForUser(userId, body, {});
      },
    );
    sendRecipientScopedStreamEvent(userId, "action_completed", result.payload);
    return;
  }

  const deadline = Number(body.__approach_deadline || 0);
  if (deadline && now > deadline) {
    deletePendingAction(row.id);
    sendRecipientScopedStreamEvent(userId, "action_completed", {
      ok: false,
      action: row.action,
      error: "error.could_not_reach_target",
    });
    return;
  }

  // Still walking: step one tile and leave the row in place for next tick.
  stepActorTowardTile(worldId, userId, targetTile.row, targetTile.col, now);
}
