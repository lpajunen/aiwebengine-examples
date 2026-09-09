// Logging and diagnostics helpers shared by all server modules.

const VW_DEBUG = false;
const VW_INSTANCE_ID =
  "inst_" +
  Date.now().toString(36) +
  "_" +
  Math.random().toString(36).slice(2, 8);
let VW_DIAG_COUNTER = 0;

export function vwLog(msg: string, obj?: unknown): void {
  if (!VW_DEBUG) return;
  try {
    if (obj !== undefined) {
      console.log("[vworld] " + msg + " " + JSON.stringify(obj));
    } else {
      console.log("[vworld] " + msg);
    }
  } catch (e) {
    console.log("[vworld] " + msg);
  }
}

export function nextDiagRequestId(): string {
  VW_DIAG_COUNTER += 1;
  return VW_INSTANCE_ID + "_" + String(VW_DIAG_COUNTER);
}

export function summarizeInventory(inventory: any): {
  class_id: string;
  slot_count: number;
  occupied_slots: string[];
  bag_count: number;
  bag_types: Record<string, number>;
} {
  const inv = inventory && typeof inventory === "object" ? inventory : {};
  const slots = inv.slots && typeof inv.slots === "object" ? inv.slots : {};
  const slotIds = Object.keys(slots);
  const occupiedSlots: string[] = [];
  for (let i = 0; i < slotIds.length; i++) {
    const slotId = slotIds[i];
    const item = slots[slotId];
    if (item && item.type) occupiedSlots.push(slotId + ":" + String(item.type));
  }
  const bag = Array.isArray(inv.bag) ? inv.bag : [];
  const bagTypes: Record<string, number> = {};
  for (let j = 0; j < bag.length; j++) {
    const t = bag[j] && bag[j].type ? String(bag[j].type) : "unknown";
    bagTypes[t] = Number(bagTypes[t] || 0) + 1;
  }
  return {
    class_id: inv.class_id ? String(inv.class_id) : "",
    slot_count: slotIds.length,
    occupied_slots: occupiedSlots,
    bag_count: bag.length,
    bag_types: bagTypes,
  };
}

export function summarizeItems(items: any): {
  count: number;
  by_type: Record<string, number>;
} {
  const arr = Array.isArray(items) ? items : [];
  const byType: Record<string, number> = {};
  for (let i = 0; i < arr.length; i++) {
    const type = arr[i] && arr[i].type ? String(arr[i].type) : "unknown";
    byType[type] = Number(byType[type] || 0) + 1;
  }
  return { count: arr.length, by_type: byType };
}

export function vwDiag(eventName: string, details: unknown): void {
  vwLog("diag." + eventName, {
    instance_id: VW_INSTANCE_ID,
    ts: Date.now(),
    details: details || {},
  });
}
