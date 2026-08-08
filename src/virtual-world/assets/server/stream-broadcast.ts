import { vwLog } from "./diagnostics.ts";
import {
  allocateEventSeq,
  recipientEventScope,
  worldEventScope,
} from "./event-seq.ts";
import { VIRTUAL_WORLD_EVENTS_STREAM_PATH } from "./runtime-config.ts";
import { toPublicLivingValues } from "./world-domain.ts";

export function sendVirtualWorldStreamEvent(
  type: string,
  payload: unknown,
  filter: Record<string, string>,
  scope?: string,
  seq?: number,
): void {
  try {
    const envelope: Record<string, unknown> = {
      type: String(type),
      payload: payload,
    };
    // seq 0 means allocation failed — send unversioned rather than not at all.
    if (scope && typeof seq === "number" && seq > 0) {
      envelope.scope = String(scope);
      envelope.seq = seq;
    }
    const message = JSON.stringify(envelope);
    const hasFilter = !!filter && Object.keys(filter).length > 0;
    const result = hasFilter
      ? routeRegistry.sendStreamMessageFiltered(
          VIRTUAL_WORLD_EVENTS_STREAM_PATH,
          message,
          JSON.stringify(filter),
          "overlap",
        )
      : routeRegistry.sendStreamMessage(
          VIRTUAL_WORLD_EVENTS_STREAM_PATH,
          message,
        );
    if (
      typeof result === "string" &&
      (result.indexOf("Error:") === 0 || result.indexOf("Failed") === 0)
    ) {
      vwLog("stream broadcast returned error", {
        type: String(type),
        filter: JSON.stringify(filter || {}),
        result: result,
      });
    }
  } catch (e) {
    vwLog("stream broadcast failed", {
      type: String(type),
      filter: JSON.stringify(filter || {}),
      error: String(e),
    });
  }
}

export function sendRecipientScopedStreamEvent(
  recipientId: string,
  type: string,
  payload: unknown,
): void {
  if (!recipientId) return;
  const scope = recipientEventScope(recipientId);
  sendVirtualWorldStreamEvent(
    type,
    payload,
    {
      recipient_id: String(recipientId),
    },
    scope,
    allocateEventSeq(scope),
  );
}

function sendWorldScopedEvent(
  worldId: string,
  type: string,
  payload: unknown,
): void {
  if (!worldId) return;
  const scope = worldEventScope(worldId);
  sendVirtualWorldStreamEvent(
    type,
    payload,
    {
      world_id: String(worldId),
    },
    scope,
    allocateEventSeq(scope),
  );
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Existing gameplay modules still emit actor-specific movement/value events.
// Normalize them at the stream boundary so every client receives one public
// living contract without duplicating controller-specific event construction.
export function sendWorldScopedStreamEvent(
  worldId: string,
  type: string,
  payload: unknown,
): void {
  const isPlayer = type === "player_moved" || type === "player_values_changed";
  const isNPC = type === "npc_moved" || type === "npc_values_changed";
  if (!isPlayer && !isNPC) {
    sendWorldScopedEvent(worldId, type, payload);
    return;
  }
  if (!isRecordLike(payload)) return;

  const kind = isPlayer ? "player" : "npc";
  const rawId = isPlayer ? payload.player_id : payload.npc_id;
  if (typeof rawId !== "string" || !rawId) return;

  if (
    (isPlayer && payload.leaving === true) ||
    (isNPC && payload.despawn === true)
  ) {
    sendWorldScopedEvent(worldId, "living_removed", {
      id: rawId,
      kind: kind,
      switched_world: isPlayer && payload.switched_world === true,
    });
    return;
  }

  if (type === "player_moved" || type === "npc_moved") {
    sendWorldScopedEvent(worldId, "living_moved", {
      id: rawId,
      kind: kind,
      row: payload.row,
      col: payload.col,
      seq: payload.seq,
      rotation: payload.rotation,
      path: Array.isArray(payload.path) ? payload.path : undefined,
    });
  }

  const values = toPublicLivingValues({ values: payload.values });
  if (typeof payload.class_id === "string" || Object.keys(values).length > 0) {
    sendWorldScopedEvent(worldId, "living_updated", {
      id: rawId,
      kind: kind,
      class_id:
        typeof payload.class_id === "string" ? payload.class_id : undefined,
      values: values,
    });
  }
}

export function broadcastPlayerValuesChanged(
  worldId: string,
  userId: string,
  values: Record<string, unknown>,
): void {
  sendWorldScopedStreamEvent(String(worldId), "player_values_changed", {
    player_id: String(userId),
    values: values,
  });
}

export function broadcastNPCValuesChanged(
  worldId: string,
  npcId: string,
  values: Record<string, unknown>,
): void {
  sendWorldScopedStreamEvent(String(worldId), "npc_values_changed", {
    npc_id: String(npcId),
    values: values,
  });
}

export function broadcastItemChange(
  worldId: string,
  actorType: string,
  actorId: string,
  action: string,
  row: number,
  col: number,
  items: any[],
): void {
  sendWorldScopedStreamEvent(String(worldId), "item_changed", {
    actor_type: actorType,
    actor_id: actorId,
    action: action,
    row: row,
    col: col,
    items: Array.isArray(items)
      ? items.map(function (item) {
          return {
            id: item.id,
            type: item.type,
            destination_world_id: item.destination_world_id,
            destination_world_type: item.destination_world_type,
            state: item.state,
          };
        })
      : [],
  });
}
