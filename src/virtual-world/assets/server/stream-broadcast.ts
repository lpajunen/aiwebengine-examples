type WorldDbLogFn = (msg: string, obj?: unknown) => void;

export function sendVirtualWorldStreamEvent(
  streamPath: string,
  type: string,
  payload: unknown,
  filter: Record<string, string>,
  log: WorldDbLogFn,
): void {
  try {
    const message = JSON.stringify({
      type: String(type),
      payload: payload,
    });
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
      log("stream broadcast returned error", {
        type: String(type),
        filter: JSON.stringify(filter || {}),
        result: result,
      });
    }
  } catch (e) {
    log("stream broadcast failed", {
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
  log: WorldDbLogFn,
): void {
  if (!recipientId) return;
  sendVirtualWorldStreamEvent(
    streamPath,
    type,
    payload,
    {
      recipient_id: String(recipientId),
    },
    log,
  );
}

export function sendWorldScopedStreamEvent(
  streamPath: string,
  worldId: string,
  type: string,
  payload: unknown,
  log: WorldDbLogFn,
): void {
  if (!worldId) return;
  sendVirtualWorldStreamEvent(
    streamPath,
    type,
    payload,
    {
      world_id: String(worldId),
    },
    log,
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
