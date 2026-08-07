/// <reference path="virtual-world-browser-globals.d.ts" />
// Avatars: local player mesh, target indicator, remote players, NPCs.

// ── Avatar parts ─────────────────────────────────────────────────────────
/**
 * @param {number} w
 * @param {number} h
 * @param {number} d
 * @param {number | string | any} color
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @param {boolean} [isEye] tags this mesh for setAvatarGhostly's eye-glow treatment
 * @returns {any}
 */
function makePart(w, h, d, color, px, py, pz, isEye) {
  var geo = new THREE.BoxGeometry(w, h, d);
  var mat = new THREE.MeshLambertMaterial({ color: color });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(px, py, pz);
  mesh.castShadow = true;
  // Tags this as a body-part mesh (as opposed to an equip-item mesh added
  // later by syncAvatarEquippedItems) so setAvatarGhostly knows which
  // children to recolor and how to restore the original color.
  mesh.userData.baseColor = new THREE.Color(color);
  mesh.userData.isEye = !!isEye;
  return mesh;
}

// ── Visual styles ────────────────────────────────────────────────────────
// Every living class names one of these mesh recipes (visualStyle) and may
// pin its primary body/fur/feather color; see class-visual.ts server-side.
// Drawing a new silhouette means adding a spec here, but a class that reuses
// an existing one (a donkey on the horse recipe) needs no client change at
// all — it just picks the style, a size and a color in the living type
// editor. A class that leaves the color blank keeps the pre-color behaviour:
// the style hashes the living's id into its own palette, so a pack of wolves
// still comes out in slightly different greys.

/**
 * @param {string} seedId
 * @returns {number}
 */
function avatarSeedHash(seedId) {
  var h = 0;
  var id = String(seedId || "");
  for (var i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Same hue/saturation, lightness shifted by `delta` (in 0..1 units) — how the
 * quadruped styles derive their darker leg color from the primary one.
 * @param {any} color
 * @param {number} delta
 * @returns {any}
 */
function shadeColor(color, delta) {
  var hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return new THREE.Color().setHSL(
    hsl.h,
    hsl.s,
    Math.max(0, Math.min(1, hsl.l + delta)),
  );
}

/**
 * Two-legged upright body: the player/NPC silhouette.
 * @param {any} bodyColor
 * @param {number | string | any} legColor
 * @param {number | string | any} skinColor
 * @returns {any}
 */
function makeHumanoidBody(bodyColor, legColor, skinColor) {
  var g = new THREE.Group();
  // Legs
  g.add(makePart(0.2, 0.35, 0.22, legColor, -0.14, 0.175, 0));
  g.add(makePart(0.2, 0.35, 0.22, legColor, 0.14, 0.175, 0));
  // Body
  g.add(makePart(0.55, 0.65, 0.4, bodyColor, 0, 0.525, 0));
  // Head
  g.add(makePart(0.45, 0.45, 0.45, skinColor, 0, 0.975, 0));
  // Eyes (on +Z face of head)
  g.add(makePart(0.09, 0.09, 0.06, 0x222222, -0.11, 0.995, 0.225, true));
  g.add(makePart(0.09, 0.09, 0.06, 0x222222, 0.11, 0.995, 0.225, true));
  return g;
}

/** @type {Record<string, any>} */
var LIVING_VISUAL_STYLE_SPECS = {
  humanoid: {
    // Players and NPCs share the mesh but not the palette, so a stranger on
    // the next tile still reads as a player at a glance.
    /**
     * @param {number} hash
     * @param {boolean} [isPlayer]
     * @returns {any}
     */
    autoColor: function (hash, isPlayer) {
      if (!isPlayer) {
        return new THREE.Color("hsl(" + (25 + (hash % 80)) + ",65%,52%)");
      }
      var hue = hash % 360;
      // Shift away from ~200-240 (local avatar blue)
      if (hue >= 200 && hue <= 240) hue = (hue + 80) % 360;
      return new THREE.Color("hsl(" + hue + ",70%,55%)");
    },
    /**
     * @param {any} primary
     * @param {boolean} [isPlayer]
     * @returns {any}
     */
    build: function (primary, isPlayer) {
      return makeHumanoidBody(
        primary,
        isPlayer ? 0x1a252f : 0x5c4033,
        isPlayer ? 0xf4c78c : 0xd9b38c,
      );
    },
  },
  wolfish: {
    /**
     * @param {number} hash
     * @returns {any}
     */
    autoColor: function (hash) {
      return new THREE.Color("hsl(210,10%," + (32 + (hash % 18)) + "%)");
    },
    /**
     * @param {any} primary
     * @returns {any}
     */
    build: function (primary) {
      return makeQuadrupedBody({
        furColor: primary,
        legColor: shadeColor(primary, -0.08),
        snoutColor: 0x1c1c1c,
        bodyW: 0.4,
        bodyH: 0.4,
        bodyL: 0.75,
        legW: 0.16,
        legH: 0.4,
        headSize: 0.32,
        snoutLen: 0.22,
        earSize: 0.13,
        tailLen: 0.35,
      });
    },
  },
  bearish: {
    /**
     * @param {number} hash
     * @returns {any}
     */
    autoColor: function (hash) {
      return new THREE.Color("hsl(25,35%," + (20 + (hash % 12)) + "%)");
    },
    /**
     * @param {any} primary
     * @returns {any}
     */
    build: function (primary) {
      return makeQuadrupedBody({
        furColor: primary,
        legColor: shadeColor(primary, -0.06),
        snoutColor: 0x2b2018,
        bodyW: 0.62,
        bodyH: 0.55,
        bodyL: 0.85,
        legW: 0.24,
        legH: 0.42,
        headSize: 0.42,
        snoutLen: 0.12,
        earSize: 0.14,
        tailLen: 0,
      });
    },
  },
  doggish: {
    /**
     * @param {number} hash
     * @returns {any}
     */
    autoColor: function (hash) {
      return new THREE.Color(
        "hsl(" + (25 + (hash % 30)) + ",45%," + (42 + (hash % 14)) + "%)",
      );
    },
    /**
     * @param {any} primary
     * @returns {any}
     */
    build: function (primary) {
      return makeQuadrupedBody({
        furColor: primary,
        legColor: shadeColor(primary, -0.08),
        snoutColor: 0x2b2018,
        bodyW: 0.3,
        bodyH: 0.3,
        bodyL: 0.55,
        legW: 0.11,
        legH: 0.3,
        headSize: 0.24,
        snoutLen: 0.15,
        earSize: 0.1,
        tailLen: 0.22,
      });
    },
  },
  birdlike: {
    /**
     * @param {number} hash
     * @returns {any}
     */
    autoColor: function (hash) {
      return new THREE.Color("hsl(40,20%," + (82 + (hash % 12)) + "%)");
    },
    /**
     * @param {any} primary
     * @returns {any}
     */
    build: function (primary) {
      return makeBirdBody(primary);
    },
  },
  // Long legs, a raised neck and a dropped tail: the horse/donkey/mule
  // silhouette. A class picks it and its own color; nothing here is
  // species-specific.
  equine: {
    /**
     * @param {number} hash
     * @returns {any}
     */
    autoColor: function (hash) {
      // Bay/chestnut browns, so an unconfigured herd still varies.
      return new THREE.Color(
        "hsl(" + (18 + (hash % 20)) + ",42%," + (26 + (hash % 16)) + "%)",
      );
    },
    /**
     * @param {any} primary
     * @returns {any}
     */
    build: function (primary) {
      return makeQuadrupedBody({
        furColor: primary,
        legColor: shadeColor(primary, -0.06),
        snoutColor: shadeColor(primary, -0.09),
        maneColor: shadeColor(primary, -0.15),
        bodyW: 0.42,
        bodyH: 0.48,
        bodyL: 0.95,
        legW: 0.13,
        legH: 0.62,
        headSize: 0.26,
        snoutLen: 0.26,
        earSize: 0.09,
        neckLen: 0.42,
        tailLen: 0.34,
        tailTilt: 0.9,
      });
    },
  },
};

/**
 * @param {string} classId
 * @returns {any}
 */
function livingVisualStyleSpec(classId) {
  var spec = LIVING_VISUAL_STYLE_SPECS[livingVisualStyle(classId)];
  return spec || LIVING_VISUAL_STYLE_SPECS.humanoid;
}

/**
 * Builds the body meshes a living class calls for: its visual style picks the
 * recipe, its color paints the primary surface. `fallbackColor` stands in for
 * the style's hashed auto shade on the local player's own humanoid body,
 * which stays a steady blue rather than varying per account.
 * @param {string} classId
 * @param {string} seedId living id (player or NPC) the auto shade hashes
 * @param {boolean} isPlayer
 * @param {number} [fallbackColor]
 * @returns {any}
 */
function makeLivingAvatarGroup(classId, seedId, isPlayer, fallbackColor) {
  var spec = livingVisualStyleSpec(classId);
  var classColor = livingClassColor(classId);
  var primary;
  if (classColor) {
    primary = new THREE.Color(classColor);
  } else if (
    fallbackColor !== undefined &&
    fallbackColor !== null &&
    livingVisualStyle(classId) === "humanoid"
  ) {
    primary = new THREE.Color(fallbackColor);
  } else {
    primary = spec.autoColor(avatarSeedHash(seedId), isPlayer);
  }
  return spec.build(primary, isPlayer);
}

/**
 * Swaps an avatar's body meshes for the ones its (new) living class calls for,
 * keeping the same THREE.Group — position, rotation and the movement lerp all
 * live on that object, so a class change must not replace it. Equipped-item
 * meshes are rebuilt from the entry's slots afterwards.
 * @param {any} entry an object with `group`, `equipMeshes` and `slots`
 * @param {string} classId
 * @param {string} seedId
 * @param {boolean} isPlayer
 * @param {number} [fallbackColor]
 */
function rebuildAvatarBody(entry, classId, seedId, isPlayer, fallbackColor) {
  if (!entry || !entry.group) return;
  var group = entry.group;
  while (group.children.length > 0) group.remove(group.children[0]);
  entry.equipMeshes = {};
  var built = makeLivingAvatarGroup(classId, seedId, isPlayer, fallbackColor);
  while (built.children.length > 0) {
    var part = built.children[0];
    built.remove(part);
    group.add(part);
  }
  syncAvatarEquippedItems(entry, entry.slots);
  setAvatarSizeFromClass(group, classId);
  setAvatarGhostly(group, classId === "player_ghost");
}

// ── Local avatar ─────────────────────────────────────────────────────────
// The local player's own body keeps one steady color instead of a hashed one
// — you always look like yourself — unless the class pins a color.
var LOCAL_PLAYER_BODY_COLOR = 0x2980b9;

/** @returns {string} */
function localPlayerClassId() {
  return playerInventory && playerInventory.class_id
    ? String(playerInventory.class_id)
    : "";
}

var avatar = makeLivingAvatarGroup(
  localPlayerClassId(),
  playerId,
  true,
  LOCAL_PLAYER_BODY_COLOR,
);
avatar.position.set(targetX, 0, targetZ);
avatar.rotation.y = INIT_ROTATION;
scene.add(avatar);

// Tracks equip meshes attached to the local player's own avatar group, kept
// in sync with playerInventory.slots via syncLocalAvatarEquippedItems()
// (called from updateStatsHud() in client-core.js whenever the inventory
// changes) for visual parity with how remote/NPC avatars render slots.
var localAvatarEquipEntry = { group: avatar, equipMeshes: {}, slots: {} };

// The living class the current body meshes were built for, so a class change
// (dying into player_ghost, a creator handing out a wolfish body) rebuilds
// them and nothing else does.
var localAvatarBodyClassId = localPlayerClassId();

/**
 * Rebuilds the local body when the player's living class changes — the class
 * carries the visual style and color. Called from updateStatsHud() ahead of
 * the other playerInventory-changed avatar hooks.
 */
function syncLocalAvatarBody() {
  var classId = localPlayerClassId();
  if (classId === localAvatarBodyClassId) return;
  localAvatarBodyClassId = classId;
  localAvatarEquipEntry.slots =
    playerInventory && playerInventory.slots ? playerInventory.slots : {};
  rebuildAvatarBody(
    localAvatarEquipEntry,
    classId,
    playerId,
    true,
    LOCAL_PLAYER_BODY_COLOR,
  );
}

function syncLocalAvatarEquippedItems() {
  localAvatarEquipEntry.slots =
    playerInventory && playerInventory.slots ? playerInventory.slots : {};
  syncAvatarEquippedItems(localAvatarEquipEntry, localAvatarEquipEntry.slots);
}

/**
 * Applies the ghost look to the local avatar when the player's living
 * class is player_ghost (see fight-helpers.ts resolvePlayerDeath /
 * tree-action-helpers.ts's "pray" revival). Called from updateStatsHud()
 * alongside syncLocalAvatarEquippedItems(), the shared "playerInventory
 * changed" hook.
 */
function syncLocalAvatarGhostVisual() {
  setAvatarGhostly(avatar, localPlayerClassId() === "player_ghost");
}

/**
 * Keeps the local avatar's scale in step with its living class's size (a
 * player_giant body is twice the height of a player_human one). Called from
 * updateStatsHud() alongside the other playerInventory-changed avatar hooks.
 */
function syncLocalAvatarSize() {
  setAvatarSizeFromClass(avatar, localPlayerClassId());
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
// renders near that slot's approximate body position, built from the same
// visual-style recipe as the ground mesh (makeItemObject, defined in
// client-world-render.js, loaded before this file) so a wielded sword reads
// as a sword rather than a coloured cube.
// Recipes are authored small (see ITEM_WORLD_SCALE in client-world-render.js);
// a held one is scaled against the wielder's body instead, and hung from its
// middle rather than standing on the attach point.
var EQUIPPED_ITEM_SCALE = 0.9;
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
    var mesh = makeItemObject(itemType);
    // The item's own class size; the wielder's size then scales this along
    // with the rest of the avatar group, so a giant's sword reads as giant.
    var itemScale = itemSizeScale(itemType) * EQUIPPED_ITEM_SCALE;
    mesh.scale.setScalar(itemScale);
    // Recipes stand on y=0; drop the mesh by half its (scaled) height so it
    // hangs at the attach point rather than sprouting upward from it.
    mesh.position.set(point.x, point.y - 0.18 * itemScale, point.z);
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
 * Scales a whole avatar group (body parts and any equipped-item meshes) by its
 * living class's size, so one mesh recipe covers e.g. npc_human and the
 * double-scale npc_giant. A "medium" class — every class that predates sizes —
 * scales by 1 and renders exactly as before.
 * @param {any} group
 * @param {string} classId
 */
function setAvatarSizeFromClass(group, classId) {
  if (!group) return;
  group.scale.setScalar(livingSizeScale(classId));
}

var GHOST_BODY_COLOR = 0xdbeeff;
var GHOST_EYE_COLOR = 0xffffff;
var GHOST_EYE_GLOW = 0xaee4ff;
var GHOST_OPACITY = 0.45;

/**
 * Toggles a humanoid avatar group (local player or remote player — NPCs are
 * never ghosts, see DEFAULT_LIVING_CLASSES in living-registry.ts, where
 * player_ghost is a player-only living class)
 * between its normal opaque look and a translucent pale "ghost" look.
 * Only touches body-part meshes tagged with userData.baseColor at creation
 * (makePart/rp) — equip-item meshes added by syncAvatarEquippedItems are
 * left untouched.
 * @param {any} group
 * @param {boolean} isGhost
 */
function setAvatarGhostly(group, isGhost) {
  if (!group) return;
  for (var i = 0; i < group.children.length; i++) {
    var child = group.children[i];
    if (!child || !child.userData || !child.userData.baseColor) continue;
    var mat = child.material;
    if (!mat) continue;
    if (isGhost) {
      mat.color.set(child.userData.isEye ? GHOST_EYE_COLOR : GHOST_BODY_COLOR);
      if (child.userData.isEye) {
        if (!mat.emissive) mat.emissive = new THREE.Color(0);
        mat.emissive.set(GHOST_EYE_GLOW);
      }
      mat.transparent = true;
      mat.opacity = GHOST_OPACITY;
    } else {
      mat.color.copy(child.userData.baseColor);
      if (mat.emissive) mat.emissive.set(0x000000);
      mat.transparent = false;
      mat.opacity = 1;
    }
    mat.needsUpdate = true;
  }
}

/**
 * @param {string} pid
 * @param {string} [classId]
 * @returns {any}
 */
function makeRemoteAvatar(pid, classId) {
  return makeLivingAvatarGroup(String(classId || ""), pid, true);
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
    var initialPlayerClassId =
      playerData && typeof playerData.class_id === "string"
        ? playerData.class_id
        : "";
    var g = makeRemoteAvatar(pid, initialPlayerClassId);
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
      class_id: initialPlayerClassId,
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
    setAvatarGhostly(g, remoteAvatars[pid].class_id === "player_ghost");
    setAvatarSizeFromClass(g, remoteAvatars[pid].class_id);
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
    if (
      playerData &&
      typeof playerData.class_id === "string" &&
      playerData.class_id !== remoteAvatars[pid].class_id
    ) {
      remoteAvatars[pid].class_id = playerData.class_id;
      appliedLivingData = true;
      // The class carries the visual style and color, so its body has to be
      // rebuilt — ghost look and size are reapplied as part of that.
      rebuildAvatarBody(remoteAvatars[pid], playerData.class_id, pid, true);
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
 * Builds a four-legged animal silhouette (body/head running along +Z,
 * legs at the same x/z offsets as SLOT_ATTACH_POINTS' front/back leg
 * slots) shared by the quadruped visual styles (wolfish, bearish, doggish,
 * equine).
 *
 * The last three fields are what separate a horse from a wolf: with
 * `neckLen` the head rides on a raised neck instead of sitting straight in
 * front of the chest, `maneColor` runs a stripe down that neck, and
 * `tailTilt` swings the tail down off the rump. All three default to
 * off/zero, so the styles that predate them are unchanged.
 * @param {{
 *   furColor: number | string | any,
 *   legColor: number | string | any,
 *   snoutColor: number | string | any,
 *   bodyW: number, bodyH: number, bodyL: number,
 *   legW: number, legH: number,
 *   headSize: number, snoutLen: number,
 *   earSize: number, tailLen: number,
 *   neckLen?: number,
 *   maneColor?: number | string | any,
 *   tailTilt?: number,
 * }} spec
 * @returns {any}
 */
function makeQuadrupedBody(spec) {
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
    return makePart(w, h, d, color, px, py, pz);
  }
  var legY = spec.legH / 2;
  var bodyY = spec.legH + spec.bodyH / 2;
  var legX = spec.bodyW / 2 - spec.legW / 2;
  // Match SLOT_ATTACH_POINTS' front/back leg z-signs so equipped leg
  // items line up with the visible legs.
  var frontZ = spec.bodyL / 2 - spec.legW / 2;
  var backZ = -frontZ;
  g.add(
    np(spec.legW, spec.legH, spec.legW, spec.legColor, -legX, legY, frontZ),
  );
  g.add(np(spec.legW, spec.legH, spec.legW, spec.legColor, legX, legY, frontZ));
  g.add(np(spec.legW, spec.legH, spec.legW, spec.legColor, -legX, legY, backZ));
  g.add(np(spec.legW, spec.legH, spec.legW, spec.legColor, legX, legY, backZ));
  g.add(np(spec.bodyW, spec.bodyH, spec.bodyL, spec.furColor, 0, bodyY, 0));
  var headZ = spec.bodyL / 2 + spec.headSize / 2;
  var headY = bodyY + spec.bodyH * 0.15;
  var neckLen = Number(spec.neckLen || 0);
  if (neckLen > 0) {
    // Leans forward over the chest: local +Y maps to (0, cos, sin) under a
    // positive X rotation, so the same angle places the neck's center and
    // carries the head to its far end.
    var neckTilt = 0.34;
    var neckW = spec.bodyW * 0.42;
    var neckD = spec.bodyW * 0.5;
    var neckBaseY = bodyY + spec.bodyH * 0.35;
    var neckBaseZ = spec.bodyL / 2 - neckD * 0.3;
    var neckRise = Math.cos(neckTilt) * neckLen;
    var neckReach = Math.sin(neckTilt) * neckLen;
    var neck = np(
      neckW,
      neckLen,
      neckD,
      spec.furColor,
      0,
      neckBaseY + neckRise / 2,
      neckBaseZ + neckReach / 2,
    );
    neck.rotation.x = neckTilt;
    g.add(neck);
    if (spec.maneColor) {
      var mane = np(
        neckW * 0.4,
        neckLen * 0.95,
        neckD * 0.35,
        spec.maneColor,
        0,
        neckBaseY + neckRise / 2 + neckW * 0.12,
        neckBaseZ + neckReach / 2 - neckD * 0.4,
      );
      mane.rotation.x = neckTilt;
      g.add(mane);
    }
    headY = neckBaseY + neckRise + spec.headSize * 0.25;
    headZ = neckBaseZ + neckReach + spec.headSize * 0.25;
  }
  g.add(
    np(
      spec.headSize,
      spec.headSize,
      spec.headSize,
      spec.furColor,
      0,
      headY,
      headZ,
    ),
  );
  if (spec.snoutLen > 0) {
    g.add(
      np(
        spec.headSize * 0.55,
        spec.headSize * 0.4,
        spec.snoutLen,
        spec.snoutColor,
        0,
        headY - spec.headSize * 0.1,
        headZ + spec.headSize / 2 + spec.snoutLen / 2,
      ),
    );
  }
  var earSize = spec.earSize;
  g.add(
    np(
      earSize,
      earSize,
      earSize * 0.6,
      spec.furColor,
      -spec.headSize * 0.25,
      headY + spec.headSize / 2 + earSize / 2,
      headZ,
    ),
  );
  g.add(
    np(
      earSize,
      earSize,
      earSize * 0.6,
      spec.furColor,
      spec.headSize * 0.25,
      headY + spec.headSize / 2 + earSize / 2,
      headZ,
    ),
  );
  if (spec.tailLen > 0) {
    // Straight out behind by default; tailTilt swings it down off the rump
    // (local +Z maps to (0, -sin, cos) under a positive X rotation).
    var tailTilt = Number(spec.tailTilt || 0);
    var tailColor = spec.maneColor || spec.furColor;
    var tail = np(
      spec.legW * 0.6,
      spec.legW * 0.6,
      spec.tailLen,
      tailColor,
      0,
      bodyY + spec.bodyH * 0.2 - (Math.sin(tailTilt) * spec.tailLen) / 2,
      -spec.bodyL / 2 - (Math.cos(tailTilt) * spec.tailLen) / 2,
    );
    tail.rotation.x = tailTilt;
    g.add(tail);
  }
  return g;
}

/**
 * Builds a small two-legged bird silhouette (the birdlike style).
 * @param {number | string | any} featherColor
 * @returns {any}
 */
function makeBirdBody(featherColor) {
  var g = new THREE.Group();
  /**
   * @param {number} w
   * @param {number} h2
   * @param {number} d
   * @param {number | string | any} color
   * @param {number} px
   * @param {number} py
   * @param {number} pz
   * @returns {any}
   */
  function np(w, h2, d, color, px, py, pz) {
    return makePart(w, h2, d, color, px, py, pz);
  }
  var legY = 0.11;
  g.add(np(0.05, 0.22, 0.05, 0xd98c3a, -0.07, legY, 0));
  g.add(np(0.05, 0.22, 0.05, 0xd98c3a, 0.07, legY, 0));
  var bodyY = 0.22 + 0.17;
  g.add(np(0.3, 0.32, 0.38, featherColor, 0, bodyY, 0));
  var headY = bodyY + 0.28;
  var headZ = 0.24;
  g.add(np(0.18, 0.18, 0.18, featherColor, 0, headY, headZ));
  g.add(np(0.08, 0.06, 0.09, 0xd9862b, 0, headY - 0.02, headZ + 0.13));
  g.add(np(0.1, 0.08, 0.03, 0xc23b2b, 0, headY + 0.11, headZ - 0.01));
  return g;
}

/**
 * @param {string} npcId
 * @param {string} [classId]
 * @returns {any}
 */
function makeNPCAvatar(npcId, classId) {
  return makeLivingAvatarGroup(String(classId || ""), npcId, false);
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
    var initialClassId =
      npcData && typeof npcData.class_id === "string" ? npcData.class_id : "";
    var g = makeNPCAvatar(npcId, initialClassId);
    g.position.set(tx, 0, tz);
    g.rotation.y = hasIncomingRot ? incomingRot : 0;
    setAvatarSizeFromClass(g, initialClassId);
    scene.add(g);
    npcAvatars[npcId] = {
      group: g,
      meshClassId: initialClassId,
      targetX: tx,
      targetZ: tz,
      targetRot: hasIncomingRot ? incomingRot : 0,
      seq: incomingSeq !== null ? incomingSeq : 0,
      row: Number(row),
      col: Number(col),
      displayName: displayName || shortenId(npcId),
      class_id: initialClassId,
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
    }
    if (npcData && npcData.values && typeof npcData.values === "object") {
      npcAvatars[npcId].values = npcData.values;
    }
    if (
      npcData &&
      typeof npcData.class_id === "string" &&
      npcData.class_id !== npcAvatars[npcId].meshClassId
    ) {
      // The class carries the visual style, color and size, so its body has
      // to be rebuilt — in place, since the group holds the movement lerp.
      var entry = npcAvatars[npcId];
      entry.class_id = npcData.class_id;
      entry.meshClassId = npcData.class_id;
      rebuildAvatarBody(entry, npcData.class_id, npcId, false);
    } else if (npcData && npcData.slots && typeof npcData.slots === "object") {
      syncAvatarEquippedItems(npcAvatars[npcId], npcData.slots);
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
