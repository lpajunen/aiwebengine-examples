import { vwLog } from "./diagnostics.ts";
import { recipientEventScope, worldEventScope } from "./event-seq.ts";

type AllocateSeqFn = (scopeKey: string) => number;

export function sendVirtualWorldStreamEvent(
  streamPath: string,
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
          streamPath,
          message,
          JSON.stringify(filter),
          "overlap",
        )
      : routeRegistry.sendStreamMessage(streamPath, message);
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
  streamPath: string,
  recipientId: string,
  type: string,
  payload: unknown,
  allocateSeq?: AllocateSeqFn,
): void {
  if (!recipientId) return;
  const scope = recipientEventScope(recipientId);
  sendVirtualWorldStreamEvent(
    streamPath,
    type,
    payload,
    {
      recipient_id: String(recipientId),
    },
    scope,
    allocateSeq ? allocateSeq(scope) : 0,
  );
}

export function sendWorldScopedStreamEvent(
  streamPath: string,
  worldId: string,
  type: string,
  payload: unknown,
  allocateSeq?: AllocateSeqFn,
): void {
  if (!worldId) return;
  const scope = worldEventScope(worldId);
  sendVirtualWorldStreamEvent(
    streamPath,
    type,
    payload,
    {
      world_id: String(worldId),
    },
    scope,
    allocateSeq ? allocateSeq(scope) : 0,
  );
}

export function broadcastItemChange(
  worldId: string,
  actorType: string,
  actorId: string,
  action: string,
  row: number,
  col: number,
  items: any[],
  sendWorldScopedStreamEvent: (
    worldId: string,
    type: string,
    payload: unknown,
  ) => void,
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
          };
        })
      : [],
  });
}
