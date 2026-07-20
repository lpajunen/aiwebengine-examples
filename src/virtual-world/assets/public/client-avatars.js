/// <reference path="virtual-world-browser-globals.d.ts" />
// Avatars: local player mesh, target indicator, remote players, NPCs.

// ── Avatar ───────────────────────────────────────────────────────────────
var avatar = new THREE.Group();

/**
 * @param {number} w
 * @param {number} h
 * @param {number} d
 * @param {number | string | any} color
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @returns {any}
 */
function makePart(w, h, d, color, px, py, pz) {
  var geo = new THREE.BoxGeometry(w, h, d);
  var mat = new THREE.MeshLambertMaterial({ color: color });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(px, py, pz);
  mesh.castShadow = true;
  return mesh;
}

// Legs
avatar.add(makePart(0.2, 0.35, 0.22, 0x1a252f, -0.14, 0.175, 0));
avatar.add(makePart(0.2, 0.35, 0.22, 0x1a252f, 0.14, 0.175, 0));
// Body
avatar.add(makePart(0.55, 0.65, 0.4, 0x2980b9, 0, 0.525, 0));
// Head
avatar.add(makePart(0.45, 0.45, 0.45, 0xf4c78c, 0, 0.975, 0));
// Eyes (on +Z face of head)
avatar.add(makePart(0.09, 0.09, 0.06, 0x222222, -0.11, 0.995, 0.225));
avatar.add(makePart(0.09, 0.09, 0.06, 0x222222, 0.11, 0.995, 0.225));

avatar.position.set(targetX, 0, targetZ);
avatar.rotation.y = INIT_ROTATION;
scene.add(avatar);

// Tracks equip meshes attached to the local player's own avatar group, kept
// in sync with playerInventory.slots via syncLocalAvatarEquippedItems()
// (called from updateHeldHud() in client-core.js whenever the inventory
// changes) for visual parity with how remote/NPC avatars render slots.
var localAvatarEquipEntry = { group: avatar, equipMeshes: {} };

function syncLocalAvatarEquippedItems() {
  syncAvatarEquippedItems(
    localAvatarEquipEntry,
    playerInventory && playerInventory.slots,
  );
}

// ── Target indicator (shows where tree actions will occur) ───────────────
var targetIndicatorGeo = new THREE.BoxGeometry(TILE * 0.9, 0.3, TILE * 0.9);
var targetIndicatorMat = new THREE.MeshBasicMaterial({
  color: 0x00ff00,
  transparent: true,
  opacity: 0.3,
  side: THREE.DoubleSide,
});
var targetIndicator = new THREE.Mesh(targetIndicatorGeo, targetIndicatorMat);
targetIndicator.position.set(targetX, 0.15, targetZ);
scene.add(targetIndicator);

// ── Remote players ───────────────────────────────────────────────────────
/** @type {Record<string, any>} */
var remoteAvatars = {}; // { pid: { group, targetX, targetZ, targetRot, seq } }
/** @type {Record<string, any>} */
var npcAvatars = {}; // { npcId: { group, targetX, targetZ, targetRot, seq } }

// ── Equipped-slot visuals ───────────────────────────────────────────────
// Slots are public and drive outside appearance: an item equipped in a slot
// renders as a small box near that slot's approximate body position, using
// the same per-type color as ground/inventory item meshes (getItemMaterial,
// defined in client-world-render.js, loaded before this file).
var equipItemGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
/** @type {Record<string, {x: number, y: number, z: number}>} */
var SLOT_ATTACH_POINTS = {
  left_hand: { x: -0.32, y: 0.55, z: 0.15 },
  right_hand: { x: 0.32, y: 0.55, z: 0.15 },
  left_leg: { x: -0.14, y: 0.05, z: 0 },
  right_leg: { x: 0.14, y: 0.05, z: 0 },
  front_left_leg: { x: -0.14, y: 0.05, z: 0.15 },
  front_right_leg: { x: 0.14, y: 0.05, z: 0.15 },
  back_left_leg: { x: -0.14, y: 0.05, z: -0.15 },
  back_right_leg: { x: 0.14, y: 0.05, z: -0.15 },
};
var DEFAULT_SLOT_ATTACH_POINT = { x: 0, y: 0.7, z: 0 };

/**
 * Adds/updates/removes small item meshes on an avatar group to reflect its
 * currently equipped slots. Called whenever a `slots` payload is applied to
 * a remote player, NPC, or the local player avatar.
 * @param {any} entry - an object with a THREE.Group `group` and an
 *   `equipMeshes` map this function owns (created on first use).
 * @param {Record<string, any>} slots
 */
function syncAvatarEquippedItems(entry, slots) {
  if (!entry || !entry.group) return;
  if (!entry.equipMeshes) entry.equipMeshes = {};
  var occupiedSlots =
    slots && typeof slots === "object" ? Object.keys(slots) : [];
  var seen = /** @type {Record<string, boolean>} */ ({});
  for (var i = 0; i < occupiedSlots.length; i++) {
    var slotId = occupiedSlots[i];
    var item = slots[slotId];
    var itemType = item && item.type ? String(item.type) : "";
    if (!itemType) continue;
    seen[slotId] = true;
    var existing = entry.equipMeshes[slotId];
    if (existing && existing.itemType === itemType) continue;
    if (existing) entry.group.remove(existing.mesh);
    var point = SLOT_ATTACH_POINTS[slotId] || DEFAULT_SLOT_ATTACH_POINT;
    var mesh = new THREE.Mesh(equipItemGeo, getItemMaterial(itemType));
    mesh.position.set(point.x, point.y, point.z);
    entry.group.add(mesh);
    entry.equipMeshes[slotId] = { mesh: mesh, itemType: itemType };
  }
  for (var knownSlotId in entry.equipMeshes) {
    if (seen[knownSlotId]) continue;
    entry.group.remove(entry.equipMeshes[knownSlotId].mesh);
    delete entry.equipMeshes[knownSlotId];
  }
}

/**
 * @param {string} pid
 * @returns {any}
 */
function avatarBodyColor(pid) {
  var h = 0;
  for (var i = 0; i < pid.length; i++)
    h = (Math.imul(31, h) + pid.charCodeAt(i)) | 0;
  var hue = (h >>> 0) % 360;
  // Shift away from ~200-240 (local avatar blue)
  if (hue >= 200 && hue <= 240) hue = (hue + 80) % 360;
  return new THREE.Color("hsl(" + hue + ",70%,55%)");
}

/**
 * @param {string} pid
 * @returns {any}
 */
function makeRemoteAvatar(pid) {
  var g = new THREE.Group();
  /**
   * @param {number} w
   * @param {number} h
   * @param {number} d
   * @param {number | string | any} color
   * @param {number} px
   * @param {number} py
   * @param {number} pz
   * @returns {any}
   */
  function rp(w, h, d, color, px, py, pz) {
    var mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: color }),
    );
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    return mesh;
  }
  var bc = avatarBodyColor(pid);
  g.add(rp(0.2, 0.35, 0.22, 0x1a252f, -0.14, 0.175, 0));
  g.add(rp(0.2, 0.35, 0.22, 0x1a252f, 0.14, 0.175, 0));
  g.add(rp(0.55, 0.65, 0.4, bc, 0, 0.525, 0));
  g.add(rp(0.45, 0.45, 0.45, 0xf4c78c, 0, 0.975, 0));
  g.add(rp(0.09, 0.09, 0.06, 0x222222, -0.11, 0.995, 0.225));
  g.add(rp(0.09, 0.09, 0.06, 0x222222, 0.11, 0.995, 0.225));
  return g;
}

/**
 * @param {string} pid
 * @param {number} row
 * @param {number} col
 * @param {number | null | undefined} seq
 * @param {number | null | undefined} rotation
 * @param {any} [playerData]
 * @param {any[]} [path] ordered waypoints of a batched move, for animation
 */
function upsertRemoteAvatar(pid, row, col, seq, rotation, playerData, path) {
  if (pid === playerId) return;
  var tx = tileX(col),
    tz = tileZ(row);
  var incomingRot = Number(rotation);
  var hasIncomingRot = isFinite(incomingRot);
  var incomingSeq = seq !== undefined && seq !== null ? Number(seq) : null;
  if (incomingSeq !== null && !isFinite(incomingSeq)) incomingSeq = null;
  if (!remoteAvatars[pid]) {
    var g = makeRemoteAvatar(pid);
    g.position.set(tx, 0, tz);
    g.rotation.y = hasIncomingRot ? incomingRot : 0;
    scene.add(g);
    remoteAvatars[pid] = {
      group: g,
      targetX: tx,
      targetZ: tz,
      targetRot: hasIncomingRot ? incomingRot : 0,
      seq: incomingSeq !== null ? incomingSeq : 0,
      row: Number(row),
      col: Number(col),
      class_id:
        playerData && typeof playerData.class_id === "string"
          ? playerData.class_id
          : "",
      slots:
        playerData && playerData.slots && typeof playerData.slots === "object"
          ? playerData.slots
          : {},
      values:
        playerData && playerData.values && typeof playerData.values === "object"
          ? playerData.values
          : {},
      hasLivingData: !!(
        playerData &&
        playerData.slots &&
        typeof playerData.slots === "object"
      ),
      waypoints: [],
    };
    syncAvatarEquippedItems(remoteAvatars[pid], remoteAvatars[pid].slots);
  } else {
    var knownSeq = Number(remoteAvatars[pid].seq || 0);
    // Position updates are seq-gated, but inventory payloads (e.g. from a
    // healing snapshot re-fetch) carry the same seq as the last move and
    // must still be applied.
    var seqAdvanced = incomingSeq === null || incomingSeq > knownSeq;
    if (seqAdvanced) {
      // A batched move carries its intermediate waypoints; walk the avatar
      // through them instead of lerping straight to the final tile (which
      // would cut corners through walls).
      var waypoints = [];
      if (Array.isArray(path) && path.length > 1) {
        for (var wi = 0; wi < path.length; wi++) {
          if (!path[wi]) continue;
          waypoints.push({
            x: tileX(Number(path[wi].col)),
            z: tileZ(Number(path[wi].row)),
            rot: Number(path[wi].rotation),
          });
        }
      }
      if (waypoints.length > 1) {
        var firstWaypoint = waypoints[0];
        remoteAvatars[pid].targetX = firstWaypoint.x;
        remoteAvatars[pid].targetZ = firstWaypoint.z;
        if (isFinite(firstWaypoint.rot)) {
          remoteAvatars[pid].targetRot = firstWaypoint.rot;
        }
        remoteAvatars[pid].waypoints = waypoints.slice(1);
      } else {
        remoteAvatars[pid].targetX = tx;
        remoteAvatars[pid].targetZ = tz;
        if (hasIncomingRot) remoteAvatars[pid].targetRot = incomingRot;
        remoteAvatars[pid].waypoints = [];
      }
      if (incomingSeq !== null) remoteAvatars[pid].seq = incomingSeq;
      remoteAvatars[pid].row = Number(row);
      remoteAvatars[pid].col = Number(col);
    }
    var appliedLivingData = false;
    if (
      playerData &&
      playerData.slots &&
      typeof playerData.slots === "object"
    ) {
      remoteAvatars[pid].slots = playerData.slots;
      remoteAvatars[pid].hasLivingData = true;
      appliedLivingData = true;
      syncAvatarEquippedItems(remoteAvatars[pid], playerData.slots);
    }
    if (
      playerData &&
      playerData.values &&
      typeof playerData.values === "object"
    ) {
      remoteAvatars[pid].values = playerData.values;
      appliedLivingData = true;
    }
    if (playerData && typeof playerData.class_id === "string") {
      remoteAvatars[pid].class_id = playerData.class_id;
      appliedLivingData = true;
    }
    if (seqAdvanced || appliedLivingData) refreshTileDetailIfOpen();
  }
  if (!remoteAvatars[pid].hasLivingData) {
    requestResync();
  }
}

/** @param {string} pid */
function removeRemoteAvatar(pid) {
  if (remoteAvatars[pid]) {
    scene.remove(remoteAvatars[pid].group);
    delete remoteAvatars[pid];
    refreshTileDetailIfOpen();
  }
}

/**
 * @param {string} npcId
 * @returns {any}
 */
function npcBodyColor(npcId) {
  var h = 0;
  for (var i = 0; i < npcId.length; i++) {
    h = (Math.imul(31, h) + npcId.charCodeAt(i)) | 0;
  }
  var hue = 25 + ((h >>> 0) % 80);
  return new THREE.Color("hsl(" + hue + ",65%,52%)");
}

/**
 * @param {string} npcId
 * @returns {any}
 */
function makeNPCAvatar(npcId) {
  var g = new THREE.Group();
  /**
   * @param {number} w
   * @param {number} h
   * @param {number} d
   * @param {number | string | any} color
   * @param {number} px
   * @param {number} py
   * @param {number} pz
   * @returns {any}
   */
  function np(w, h, d, color, px, py, pz) {
    var mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: color }),
    );
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    return mesh;
  }
  var bc = npcBodyColor(npcId);
  g.add(np(0.2, 0.35, 0.22, 0x5c4033, -0.14, 0.175, 0));
  g.add(np(0.2, 0.35, 0.22, 0x5c4033, 0.14, 0.175, 0));
  g.add(np(0.55, 0.65, 0.4, bc, 0, 0.525, 0));
  g.add(np(0.45, 0.45, 0.45, 0xd9b38c, 0, 0.975, 0));
  g.add(np(0.09, 0.09, 0.06, 0x222222, -0.11, 0.995, 0.225));
  g.add(np(0.09, 0.09, 0.06, 0x222222, 0.11, 0.995, 0.225));
  return g;
}

/**
 * @param {string} npcId
 * @returns {string}
 */
function npcDisplayName(npcId) {
  if (npcAvatars[npcId] && npcAvatars[npcId].displayName) {
    return npcAvatars[npcId].displayName;
  }
  return shortenId(npcId);
}

/**
 * @param {string} npcId
 * @param {number} row
 * @param {number} col
 * @param {number | null | undefined} seq
 * @param {number | null | undefined} rotation
 * @param {string | undefined} displayName
 * @param {any} [npcData]
 */
function upsertNPCAvatar(npcId, row, col, seq, rotation, displayName, npcData) {
  if (!npcId || !isFinite(Number(row)) || !isFinite(Number(col))) return;
  var tx = tileX(Number(col));
  var tz = tileZ(Number(row));
  var incomingRot = Number(rotation);
  var hasIncomingRot = isFinite(incomingRot);
  var incomingSeq = seq !== undefined && seq !== null ? Number(seq) : null;
  if (incomingSeq !== null && !isFinite(incomingSeq)) incomingSeq = null;

  if (!npcAvatars[npcId]) {
    var g = makeNPCAvatar(npcId);
    g.position.set(tx, 0, tz);
    g.rotation.y = hasIncomingRot ? incomingRot : 0;
    scene.add(g);
    npcAvatars[npcId] = {
      group: g,
      targetX: tx,
      targetZ: tz,
      targetRot: hasIncomingRot ? incomingRot : 0,
      seq: incomingSeq !== null ? incomingSeq : 0,
      row: Number(row),
      col: Number(col),
      displayName: displayName || shortenId(npcId),
      class_id:
        npcData && typeof npcData.class_id === "string" ? npcData.class_id : "",
      slots:
        npcData && npcData.slots && typeof npcData.slots === "object"
          ? npcData.slots
          : {},
      values:
        npcData && npcData.values && typeof npcData.values === "object"
          ? npcData.values
          : {},
    };
    syncAvatarEquippedItems(npcAvatars[npcId], npcAvatars[npcId].slots);
  } else {
    var knownSeq = Number(npcAvatars[npcId].seq || 0);
    if (incomingSeq !== null && incomingSeq <= knownSeq) return;
    npcAvatars[npcId].targetX = tx;
    npcAvatars[npcId].targetZ = tz;
    if (hasIncomingRot) npcAvatars[npcId].targetRot = incomingRot;
    if (incomingSeq !== null) npcAvatars[npcId].seq = incomingSeq;
    npcAvatars[npcId].row = Number(row);
    npcAvatars[npcId].col = Number(col);
    if (displayName) npcAvatars[npcId].displayName = displayName;
    if (npcData && npcData.slots && typeof npcData.slots === "object") {
      npcAvatars[npcId].slots = npcData.slots;
      syncAvatarEquippedItems(npcAvatars[npcId], npcData.slots);
    }
    if (npcData && npcData.values && typeof npcData.values === "object") {
      npcAvatars[npcId].values = npcData.values;
    }
    if (npcData && typeof npcData.class_id === "string") {
      npcAvatars[npcId].class_id = npcData.class_id;
    }
    refreshTileDetailIfOpen();
  }
}

/** @param {string} npcId */
function removeNPCAvatar(npcId) {
  if (npcAvatars[npcId]) {
    scene.remove(npcAvatars[npcId].group);
    delete npcAvatars[npcId];
    refreshTileDetailIfOpen();
  }
}

/** @param {any[]} npcs */
function syncNPCSnapshot(npcs) {
  if (!Array.isArray(npcs)) return;
  var seen = /** @type {Record<string, boolean>} */ ({});
  for (var i = 0; i < npcs.length; i++) {
    var n = npcs[i];
    if (!n || typeof n.npc_id !== "string") continue;
    seen[n.npc_id] = true;
    upsertNPCAvatar(
      n.npc_id,
      n.row,
      n.col,
      n.seq,
      n.rotation,
      n.display_name,
      n,
    );
  }
  for (var npcId in npcAvatars) {
    if (!seen[npcId]) removeNPCAvatar(npcId);
  }
}
