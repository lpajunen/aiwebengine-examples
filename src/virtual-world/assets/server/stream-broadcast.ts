import { loadWorldPlayers } from "./player-snapshots.ts";

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
    const result = routeRegistry.sendStreamMessageFiltered(
      streamPath,
      message,
      JSON.stringify(filter || {}),
    );
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
  playerPositionTable: string,
  log: WorldDbLogFn,
): void {
  if (!worldId) return;
  const players = loadWorldPlayers(String(worldId), playerPositionTable, log);
  const playerIds = Object.keys(players || {});
  for (let i = 0; i < playerIds.length; i++) {
    sendRecipientScopedStreamEvent(
      streamPath,
      playerIds[i],
      type,
      payload,
      log,
    );
  }
}
