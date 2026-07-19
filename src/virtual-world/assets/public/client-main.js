/// <reference path="virtual-world-browser-globals.d.ts" />
// Main loop: animate(), startup calls, window resize.

// ── Game loop ────────────────────────────────────────────────────────────
var moveTimer = 0;
var clock = new THREE.Clock();
var walkTime = 0;

function animate() {
  requestAnimationFrame(animate);
  var dt = clock.getDelta() * 1000; // ms

  // Step timer
  moveTimer -= dt;
  if (moveTimer <= 0) {
    var moved = false;

    // Check joystick input first (for touch devices)
    if (
      joystickActive &&
      (Math.abs(joystickDirection.x) > 0.15 ||
        Math.abs(joystickDirection.y) > 0.15)
    ) {
      moved = tryMoveCameraRelative(joystickDirection.x, -joystickDirection.y);
    }
    // Fallback to keyboard input (camera-relative)
    else {
      var inputX = 0;
      var inputY = 0;
      if (keys["ArrowUp"] || keys["w"] || keys["W"]) inputY += 1;
      if (keys["ArrowDown"] || keys["s"] || keys["S"]) inputY -= 1;
      if (keys["ArrowLeft"] || keys["a"] || keys["A"]) inputX -= 1;
      if (keys["ArrowRight"] || keys["d"] || keys["D"]) inputX += 1;
      if (inputX !== 0 || inputY !== 0)
        moved = tryMoveCameraRelative(inputX, inputY);
      else {
        lastMoveIntentKey = null;
        lastMoveAxis = null;
      }
    }

    if (moved) moveTimer = MOVE_INTERVAL;
  }

  // Smooth lerp toward target position
  var lerp = 1 - Math.exp((-15 * dt) / 1000);
  avatar.position.x += (targetX - avatar.position.x) * lerp;
  avatar.position.z += (targetZ - avatar.position.z) * lerp;

  // Walking bob
  var dist =
    Math.abs(avatar.position.x - targetX) +
    Math.abs(avatar.position.z - targetZ);
  if (dist > 0.05) {
    walkTime += dt;
    avatar.position.y = Math.abs(Math.sin(walkTime * 0.012)) * 0.1;
  } else {
    walkTime = 0;
    avatar.position.y += (0 - avatar.position.y) * lerp;
  }

  // Lerp remote avatars toward their targets, advancing through any queued
  // batched-move waypoints so paths are walked tile by tile.
  for (var pid in remoteAvatars) {
    var ra = remoteAvatars[pid];
    if (ra.waypoints && ra.waypoints.length > 0) {
      var waypointDist =
        Math.abs(ra.group.position.x - ra.targetX) +
        Math.abs(ra.group.position.z - ra.targetZ);
      if (waypointDist < 0.1) {
        var nextWaypoint = ra.waypoints.shift();
        ra.targetX = nextWaypoint.x;
        ra.targetZ = nextWaypoint.z;
        if (isFinite(nextWaypoint.rot)) ra.targetRot = nextWaypoint.rot;
      }
    }
    ra.group.position.x += (ra.targetX - ra.group.position.x) * lerp;
    ra.group.position.z += (ra.targetZ - ra.group.position.z) * lerp;
    var rotDelta = ra.targetRot - ra.group.rotation.y;
    while (rotDelta > Math.PI) rotDelta -= 2 * Math.PI;
    while (rotDelta < -Math.PI) rotDelta += 2 * Math.PI;
    ra.group.rotation.y += rotDelta * lerp;
  }

  // Lerp NPC avatars toward their targets
  for (var npcId in npcAvatars) {
    var na = npcAvatars[npcId];
    na.group.position.x += (na.targetX - na.group.position.x) * lerp;
    na.group.position.z += (na.targetZ - na.group.position.z) * lerp;
    var npcRotDelta = na.targetRot - na.group.rotation.y;
    while (npcRotDelta > Math.PI) npcRotDelta -= 2 * Math.PI;
    while (npcRotDelta < -Math.PI) npcRotDelta += 2 * Math.PI;
    na.group.rotation.y += npcRotDelta * lerp;
  }

  // Keep background plane centered under avatar
  bgPlane.position.x = avatar.position.x;
  bgPlane.position.z = avatar.position.z;

  // Track avatar so sun shadows and highlights cover current location
  sun.position.set(avatar.position.x - 12, 22, avatar.position.z - 8);
  sun.target.position.set(avatar.position.x, 0, avatar.position.z);
  sun.target.updateMatrixWorld();
  fill.position.set(avatar.position.x + 14, 10, avatar.position.z + 14);
  fill.target.position.set(avatar.position.x, 0, avatar.position.z);
  fill.target.updateMatrixWorld();

  // Update target indicator position based on player rotation
  var angle = avatar.rotation.y;
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;

  var targetRow = avatarRow;
  var targetCol = avatarCol;
  if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
    targetRow = avatarRow + 1; // South
  } else if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) {
    targetCol = avatarCol + 1; // East
  } else if (angle >= (3 * Math.PI) / 4 || angle < (-3 * Math.PI) / 4) {
    targetRow = avatarRow - 1; // North
  } else {
    targetCol = avatarCol - 1; // West
  }

  targetIndicator.position.x = tileX(targetCol);
  targetIndicator.position.z = tileZ(targetRow);

  updateCamera();
  renderer.render(scene, camera);
}

animate();
initMultiplayer();

// ── Resize ───────────────────────────────────────────────────────────────
window.addEventListener("resize", function () {
  appRender.handleResize();
});
