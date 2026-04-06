/// <reference path="../types/aiwebengine.d.ts" />

// Virtual World - 2.5D block world with Three.js
// Move with WASD or arrow keys. Walls and trees block movement.

// ── Server-side world generation ─────────────────────────────────────────────
var ROWS = 100;
var COLS = 100;
var LEASE_TTL_MS = 30000;

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateMap(worldId) {
  var seed = parseInt(String(worldId), 10);
  var rand = mulberry32(seed);
  var map = [];
  for (var r = 0; r < ROWS; r++) {
    map[r] = [];
    for (var c = 0; c < COLS; c++) map[r][c] = 0;
  }
  // Solid border
  for (var r = 0; r < ROWS; r++) {
    map[r][0] = 1;
    map[r][COLS - 1] = 1;
  }
  for (var c = 0; c < COLS; c++) {
    map[0][c] = 1;
    map[ROWS - 1][c] = 1;
  }

  // Rectangular room outlines, each with a door on all four sides
  for (var i = 0; i < 30; i++) {
    var rr = 3 + Math.floor(rand() * (ROWS - 18));
    var cc = 3 + Math.floor(rand() * (COLS - 18));
    var rh = 4 + Math.floor(rand() * 9);
    var rw = 4 + Math.floor(rand() * 9);
    for (var dr = 0; dr <= rh; dr++) {
      for (var dc = 0; dc <= rw; dc++) {
        if (
          (dr === 0 || dr === rh || dc === 0 || dc === rw) &&
          map[rr + dr][cc + dc] === 0
        )
          map[rr + dr][cc + dc] = 1;
      }
    }
    var mh = Math.floor(rh / 2),
      mw = Math.floor(rw / 2);
    map[rr][cc + mw] = 0;
    map[rr + rh][cc + mw] = 0;
    map[rr + mh][cc] = 0;
    map[rr + mh][cc + rw] = 0;
  }

  // Wall segments with a gap
  for (var i = 0; i < 40; i++) {
    if (rand() > 0.5) {
      var r0 = 2 + Math.floor(rand() * (ROWS - 4));
      var c0 = 2 + Math.floor(rand() * (COLS - 20));
      var len = 6 + Math.floor(rand() * 14);
      var gap = Math.floor(rand() * len);
      for (var k = 0; k < len; k++)
        if (k !== gap && c0 + k < COLS - 1 && map[r0][c0 + k] === 0)
          map[r0][c0 + k] = 1;
    } else {
      var r0 = 2 + Math.floor(rand() * (ROWS - 20));
      var c0 = 2 + Math.floor(rand() * (COLS - 4));
      var len = 6 + Math.floor(rand() * 14);
      var gap = Math.floor(rand() * len);
      for (var k = 0; k < len; k++)
        if (k !== gap && r0 + k < ROWS - 1 && map[r0 + k][c0] === 0)
          map[r0 + k][c0] = 1;
    }
  }

  // Scatter trees in open ground
  for (var i = 0; i < 500; i++) {
    var r = 1 + Math.floor(rand() * (ROWS - 2));
    var c = 1 + Math.floor(rand() * (COLS - 2));
    if (map[r][c] === 0) map[r][c] = 2;
  }

  // Always keep spawn area clear
  map[1][1] = 0;
  map[1][2] = 0;
  map[2][1] = 0;
  return map;
}

function getOrCreatePlayerWorld(userId) {
  var key = "vworld_current:" + userId;
  var worldId = sharedStorage.getItem(key);
  if (!worldId) {
    worldId = String(Math.floor(Math.random() * 999999) + 1);
    sharedStorage.setItem(key, worldId);
  }
  return worldId;
}

function getVirtualWorldPage(context) {
  const req = context.request;
  if (!req.auth || !req.auth.isAuthenticated) {
    return ResponseBuilder.redirect(
      "/auth/login?redirect=" + encodeURIComponent("/virtual-world"),
    );
  }
  const userId = req.auth.userId;
  const authName = req.auth.userName || "";
  const authEmail =
    req.auth.userEmail && req.auth.userEmail !== authName
      ? req.auth.userEmail
      : "";

  // ── Server-side state ─────────────────────────────────────────────────────
  const worldId = getOrCreatePlayerWorld(userId);
  const map = generateMap(worldId);
  // Read last known position from dedicated storage (survives page refresh).
  // Falls back to spawn (1,1) only when the player enters a fresh new world.
  const savedPosRaw = sharedStorage.getItem("vworld_pos:" + userId);
  const savedPos = savedPosRaw ? JSON.parse(savedPosRaw) : null;
  const initRow = savedPos ? savedPos.row : 1;
  const initCol = savedPos ? savedPos.col : 1;
  const initSeq = savedPos ? savedPos.seq || 0 : 0;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Virtual World</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      background: #000; 
      overflow: hidden; 
      font-family: 'Segoe UI', sans-serif;
      touch-action: none;
      -webkit-user-select: none;
      user-select: none;
      overscroll-behavior: none;
    }
    canvas { 
      display: block;
      touch-action: none;
    }

    .hud {
      position: absolute;
      color: #fff;
      background: rgba(0,0,0,0.55);
      border-radius: 8px;
      padding: 10px 14px;
      pointer-events: none;
      user-select: none;
      border: 1px solid rgba(255,255,255,0.15);
      backdrop-filter: blur(4px);
    }

    #hud-pos {
      top: 14px; left: 14px;
      font-size: 13px;
      line-height: 1.7;
    }
    #hud-pos strong { font-size: 15px; display: block; margin-bottom: 4px; color: #a8d8ff; }

    #hud-legend {
      top: 14px; right: 14px;
      font-size: 12px;
      line-height: 1.9;
    }
    #hud-legend strong { display: block; margin-bottom: 4px; color: #a8d8ff; font-size: 13px; }
    .leg { display: flex; align-items: center; gap: 8px; }
    .leg-box {
      width: 16px; height: 16px; border-radius: 3px; flex-shrink: 0;
      border: 1px solid rgba(255,255,255,0.25);
    }

    #hud-keys {
      bottom: 14px; left: 50%; transform: translateX(-50%);
      font-size: 12px; color: #ccc; white-space: nowrap;
      text-align: center;
    }
    #hud-keys kbd {
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 11px;
      font-family: inherit;
    }

    #hud-portal {
      bottom: 60px; right: 14px;
      pointer-events: auto;
    }
    #hud-portal button {
      background: rgba(255,130,0,0.82);
      border: 1px solid rgba(255,200,80,0.45);
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      padding: 9px 18px;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
    }
    #hud-portal button:hover { background: rgba(255,160,0,1); }

    #joystick-container {
      position: absolute;
      bottom: 14px;
      left: 14px;
      width: 140px;
      height: 140px;
      pointer-events: auto;
      touch-action: auto;
      display: block; /* Always visible for debugging */
      z-index: 1000;
    }
    #joystick-base {
      position: absolute;
      width: 140px;
      height: 140px;
      background: rgba(0,0,0,0.4);
      border: 3px solid rgba(255,255,255,0.4);
      border-radius: 50%;
      backdrop-filter: blur(4px);
      touch-action: auto;
    }
    #joystick-stick {
      position: absolute;
      width: 50px;
      height: 50px;
      background: rgba(255,255,255,0.6);
      border: 2px solid rgba(255,255,255,0.8);
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      transition: all 0.1s ease-out;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    #joystick-stick.active {
      background: rgba(41,128,185,0.8);
      border-color: rgba(41,128,185,1);
    }

    /* Joystick always visible, can hide keyboard hints on touch devices */
    @media (hover: none) and (pointer: coarse) {
      #hud-keys { display: none; }
    }
  </style>
</head>
<body>
  <div class="hud" id="hud-pos">
    <strong>Virtual World</strong>
    ${authName ? `${authName}<br>` : ""}
    ${authEmail ? `<span style="font-size:11px;opacity:0.7;">${authEmail}</span><br>` : ""}
    World: ${worldId}<br>
    Position: <span id="pos-col">${initCol}</span>, <span id="pos-row">${initRow}</span>
  </div>

  <div class="hud" id="hud-legend">
    <strong>Legend</strong>
    <div class="leg"><div class="leg-box" style="background:#7ab648;"></div> Ground</div>
    <div class="leg"><div class="leg-box" style="background:#9e9e9e;"></div> Wall</div>
    <div class="leg"><div class="leg-box" style="background:#2d8a3e;"></div> Tree</div>
    <div class="leg"><div class="leg-box" style="background:#2980b9;"></div> You</div>
  </div>

  <div class="hud" id="hud-keys">
    Move: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> &nbsp;or&nbsp; <kbd>&uarr;</kbd><kbd>&larr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd>
    &nbsp;&nbsp;|&nbsp;&nbsp; Camera: <kbd>drag</kbd> to orbit &nbsp; <kbd>scroll</kbd> to zoom
  </div>

  <div class="hud" id="hud-portal">
    <button onclick="goToNewWorld()">&#9654; New World</button>
  </div>

  <div id="joystick-container">
    <div id="joystick-base"></div>
    <div id="joystick-stick"></div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script>
    // ── Server-injected game state ────────────────────────────────────────────
    var MAP      = ${JSON.stringify(map)};
    var worldId  = ${JSON.stringify(worldId)};
    var playerId = ${JSON.stringify(userId)};

    function createSessionId() {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
      return 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    }
    var sessionId = createSessionId();

    // ── Constants ─────────────────────────────────────────────────────────────
    var ROWS = 100;
    var COLS = 100;
    var TILE = 2;            // world units per tile
    var MOVE_INTERVAL = 160; // ms between steps
    var MAX_PENDING_MOVES = 40;

    var avatarRow = ${initRow};
    var avatarCol = ${initCol};
    var targetX = avatarCol * TILE + TILE / 2;
    var targetZ = avatarRow * TILE + TILE / 2;
    var moveSeq = ${initSeq};  // last confirmed server sequence number

    // ── Renderer ─────────────────────────────────────────────────────────────
    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // ── Scene ────────────────────────────────────────────────────────────────
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.018);

    // ── Camera ───────────────────────────────────────────────────────────────
    var mapCX = (COLS * TILE) / 2;
    var mapCZ = (ROWS * TILE) / 2;
    var camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 300);

    // Camera orbit state (spherical coordinates around map centre)
    var camR     = 50;           // distance
    var camTheta = Math.PI / 4;  // azimuth (horizontal rotation)
    var camPhi   = 0.67;         // elevation above horizontal (radians)

    function updateCamera() {
      var ax = avatar.position.x;
      var az = avatar.position.z;
      camera.position.set(
        ax + camR * Math.cos(camPhi) * Math.sin(camTheta),
        camR * Math.sin(camPhi),
        az + camR * Math.cos(camPhi) * Math.cos(camTheta)
      );
      camera.lookAt(ax, 0, az);
    }
    // Seed initial camera position using spawn coords (avatar not yet created here)
    camera.position.set(
      targetX + camR * Math.cos(camPhi) * Math.sin(camTheta),
      camR * Math.sin(camPhi),
      targetZ + camR * Math.cos(camPhi) * Math.cos(camTheta)
    );
    camera.lookAt(targetX, 0, targetZ);

    // ── Lighting ─────────────────────────────────────────────────────────────
    var ambient = new THREE.AmbientLight(0xfff8e7, 0.55);
    scene.add(ambient);

    var sun = new THREE.DirectionalLight(0xffe8c0, 1.0);
    sun.position.set(-12, 22, -8);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    scene.add(sun.target); // must be in scene for target.position updates to take effect

    // Secondary fill light from the opposite side
    var fill = new THREE.DirectionalLight(0xc8e8ff, 0.3);
    fill.position.set(14, 10, 14);
    scene.add(fill);
    scene.add(fill.target);

    // ── Large background ground plane ─────────────────────────────────────────
    var bgGeo = new THREE.PlaneGeometry(800, 800);
    var bgMat = new THREE.MeshLambertMaterial({ color: 0x4a7028 });
    var bgPlane = new THREE.Mesh(bgGeo, bgMat);
    bgPlane.rotation.x = -Math.PI / 2;
    bgPlane.position.set(mapCX, -0.26, mapCZ);
    bgPlane.receiveShadow = true;
    scene.add(bgPlane);

    // ── Reusable geometries and materials ────────────────────────────────────
    var geoGround = new THREE.BoxGeometry(TILE, 0.25, TILE);
    var matGroundA = new THREE.MeshLambertMaterial({ color: 0x7ab648 });
    var matGroundB = new THREE.MeshLambertMaterial({ color: 0x6da040 });

    var geoWall = new THREE.BoxGeometry(TILE, 1.7, TILE);
    var matWallSides = new THREE.MeshLambertMaterial({ color: 0x9e9e9e });
    var matWallTop  = new THREE.MeshLambertMaterial({ color: 0xc8c8c8 });
    // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
    var matWall = [matWallSides, matWallSides, matWallTop, matWallSides, matWallSides, matWallSides];

    var geoTrunk = new THREE.BoxGeometry(0.28, 0.9, 0.28);
    var matTrunk = new THREE.MeshLambertMaterial({ color: 0x7d4f2a });

    var geoFoliage1 = new THREE.BoxGeometry(1.1, 0.85, 1.1);
    var geoFoliage2 = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    var matFoliage1 = new THREE.MeshLambertMaterial({ color: 0x2d8a3e });
    var matFoliage2 = new THREE.MeshLambertMaterial({ color: 0x3dba4e });

    // ── Build tiles with InstancedMesh (efficient for large worlds) ────────────
    function tileX(col) { return col * TILE + TILE / 2; }
    function tileZ(row) { return row * TILE + TILE / 2; }

    var dummy = new THREE.Object3D();
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);

    // Count instances
    var cntA = 0, cntB = 0, cntWall = 0, cntTree = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if ((r + c) % 2 === 0) cntA++; else cntB++;
        if (MAP[r][c] === 1) cntWall++;
        if (MAP[r][c] === 2) cntTree++;
      }
    }

    var iGroundA  = new THREE.InstancedMesh(geoGround,   matGroundA,  cntA);
    var iGroundB  = new THREE.InstancedMesh(geoGround,   matGroundB,  cntB);
    var iWall     = new THREE.InstancedMesh(geoWall,     matWall,     cntWall);
    var iTrunk    = new THREE.InstancedMesh(geoTrunk,    matTrunk,    cntTree);
    var iFoliage1 = new THREE.InstancedMesh(geoFoliage1, matFoliage1, cntTree);
    var iFoliage2 = new THREE.InstancedMesh(geoFoliage2, matFoliage2, cntTree);

    iGroundA.receiveShadow = true;
    iGroundB.receiveShadow = true;
    iWall.castShadow = true;     iWall.receiveShadow = true;
    iTrunk.castShadow = true;    iFoliage1.castShadow = true;    iFoliage2.castShadow = true;

    var idxA = 0, idxB = 0, idxW = 0, idxT = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var tx = tileX(c), tz = tileZ(r);

        dummy.position.set(tx, -0.125, tz);
        dummy.updateMatrix();
        if ((r + c) % 2 === 0) iGroundA.setMatrixAt(idxA++, dummy.matrix);
        else                    iGroundB.setMatrixAt(idxB++, dummy.matrix);

        if (MAP[r][c] === 1) {
          dummy.position.set(tx, 0.85, tz);
          dummy.updateMatrix();
          iWall.setMatrixAt(idxW++, dummy.matrix);
        } else if (MAP[r][c] === 2) {
          dummy.position.set(tx, 0.45,  tz); dummy.updateMatrix(); iTrunk.setMatrixAt(idxT, dummy.matrix);
          dummy.position.set(tx, 1.1,   tz); dummy.updateMatrix(); iFoliage1.setMatrixAt(idxT, dummy.matrix);
          dummy.position.set(tx, 1.78,  tz); dummy.updateMatrix(); iFoliage2.setMatrixAt(idxT, dummy.matrix);
          idxT++;
        }
      }
    }

    iGroundA.instanceMatrix.needsUpdate  = true;
    iGroundB.instanceMatrix.needsUpdate  = true;
    iWall.instanceMatrix.needsUpdate     = true;
    iTrunk.instanceMatrix.needsUpdate    = true;
    iFoliage1.instanceMatrix.needsUpdate = true;
    iFoliage2.instanceMatrix.needsUpdate = true;

    scene.add(iGroundA, iGroundB, iWall, iTrunk, iFoliage1, iFoliage2);

    // ── Avatar ───────────────────────────────────────────────────────────────
    var avatar = new THREE.Group();

    function makePart(w, h, d, color, px, py, pz) {
      var geo = new THREE.BoxGeometry(w, h, d);
      var mat = new THREE.MeshLambertMaterial({ color: color });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      return mesh;
    }

    // Legs
    avatar.add(makePart(0.20, 0.35, 0.22, 0x1a252f, -0.14, 0.175, 0));
    avatar.add(makePart(0.20, 0.35, 0.22, 0x1a252f,  0.14, 0.175, 0));
    // Body
    avatar.add(makePart(0.55, 0.65, 0.40, 0x2980b9, 0, 0.525, 0));
    // Head
    avatar.add(makePart(0.45, 0.45, 0.45, 0xf4c78c, 0, 0.975, 0));
    // Eyes (on +Z face of head)
    avatar.add(makePart(0.09, 0.09, 0.06, 0x222222, -0.11, 0.995, 0.225));
    avatar.add(makePart(0.09, 0.09, 0.06, 0x222222,  0.11, 0.995, 0.225));

    avatar.position.set(targetX, 0, targetZ);
    scene.add(avatar);

    // ── Remote players ───────────────────────────────────────────────────────
    var remoteAvatars = {}; // { pid: { group, targetX, targetZ, seq } }

    function avatarBodyColor(pid) {
      var h = 0;
      for (var i = 0; i < pid.length; i++) h = (Math.imul(31, h) + pid.charCodeAt(i)) | 0;
      var hue = (h >>> 0) % 360;
      // Shift away from ~200-240 (local avatar blue)
      if (hue >= 200 && hue <= 240) hue = (hue + 80) % 360;
      return new THREE.Color('hsl(' + hue + ',70%,55%)');
    }

    function makeRemoteAvatar(pid) {
      var g = new THREE.Group();
      function rp(w, h, d, color, px, py, pz) {
        var mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color: color })
        );
        mesh.position.set(px, py, pz);
        mesh.castShadow = true;
        return mesh;
      }
      var bc = avatarBodyColor(pid);
      g.add(rp(0.20, 0.35, 0.22, 0x1a252f, -0.14, 0.175, 0));
      g.add(rp(0.20, 0.35, 0.22, 0x1a252f,  0.14, 0.175, 0));
      g.add(rp(0.55, 0.65, 0.40, bc,         0,   0.525, 0));
      g.add(rp(0.45, 0.45, 0.45, 0xf4c78c,   0,   0.975, 0));
      g.add(rp(0.09, 0.09, 0.06, 0x222222, -0.11, 0.995, 0.225));
      g.add(rp(0.09, 0.09, 0.06, 0x222222,  0.11, 0.995, 0.225));
      return g;
    }

    function upsertRemoteAvatar(pid, row, col, seq) {
      if (pid === playerId) return;
      var tx = tileX(col), tz = tileZ(row);
      var incomingSeq = (seq !== undefined && seq !== null) ? Number(seq) : null;
      if (incomingSeq !== null && !isFinite(incomingSeq)) incomingSeq = null;
      if (!remoteAvatars[pid]) {
        var g = makeRemoteAvatar(pid);
        g.position.set(tx, 0, tz);
        scene.add(g);
        remoteAvatars[pid] = {
          group: g,
          targetX: tx,
          targetZ: tz,
          seq: incomingSeq !== null ? incomingSeq : 0,
        };
      } else {
        var knownSeq = Number(remoteAvatars[pid].seq || 0);
        if (incomingSeq !== null && incomingSeq <= knownSeq) return;
        remoteAvatars[pid].targetX = tx;
        remoteAvatars[pid].targetZ = tz;
        if (incomingSeq !== null) remoteAvatars[pid].seq = incomingSeq;
      }
    }

    function removeRemoteAvatar(pid) {
      if (remoteAvatars[pid]) {
        scene.remove(remoteAvatars[pid].group);
        delete remoteAvatars[pid];
      }
    }

    var pendingMoves = [];   // FIFO queue of {row,col,seq} — one entry per step
    var moveInFlight = false;

    function flushMove() {
      if (moveInFlight || pendingMoves.length === 0) return;
      var payload = pendingMoves.shift();
      moveInFlight = true;
      fetch('/virtual-world/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // world_id and player_id are determined server-side from auth session
        body: JSON.stringify({
          row: payload.row,
          col: payload.col,
          seq: payload.seq,
          session_id: sessionId,
        })
      }).then(function(res) { return res.json(); }).then(function(result) {
        moveInFlight = false;
        if (!result.ok) {
          if (result.stale) {
            // Another tab took over — our queued moves are based on an old seq.
            // Reconcile to server canonical state, then discard queue.
            if (typeof result.row === 'number' && typeof result.col === 'number') {
              avatarRow = result.row;
              avatarCol = result.col;
              targetX = tileX(avatarCol);
              targetZ = tileZ(avatarRow);
              document.getElementById('pos-col').textContent = avatarCol;
              document.getElementById('pos-row').textContent = avatarRow;
            }
            if (typeof result.seq === 'number' && isFinite(result.seq)) {
              moveSeq = result.seq;
            }
            pendingMoves = [];
          } else {
            // Server rejected the move (wall/bounds) — snap back to canonical position
            // and discard queue since remaining steps are based on the invalid position.
            avatarRow = result.row;
            avatarCol = result.col;
            targetX = tileX(avatarCol);
            targetZ = tileZ(avatarRow);
            document.getElementById('pos-col').textContent = avatarCol;
            document.getElementById('pos-row').textContent = avatarRow;
            pendingMoves = [];
          }
        } else {
          // Confirmed — advance the local sequence number
          moveSeq = result.seq;
        }
        flushMove(); // drain next step if any
      }).catch(function() {
        moveInFlight = false;
        // Put the failed step back at the front and retry after 500 ms
        pendingMoves.unshift(payload);
        setTimeout(flushMove, 500);
      });
    }

    function postMove(row, col) {
      // Each optimistic step gets the next expected seq number.
      // Never silently drop steps: if queue is full, caller must not move locally.
      if (pendingMoves.length >= MAX_PENDING_MOVES) return false;
      moveSeq++;
      pendingMoves.push({ row: row, col: col, seq: moveSeq });
      flushMove();
      return true;
    }

    function postLeave() {
      // world_id and player_id are determined server-side from auth session
      navigator.sendBeacon('/virtual-world/leave',
        new Blob(['{}'], { type: 'application/json' }));
    }

    function fetchSnapshot() {
      fetch('/virtual-world/players')
        .then(function(r) { return r.json(); })
        .then(function(players) {
          players.forEach(function(p) {
            if (p.player_id === playerId) {
              var snapSeq = Number(p.seq || 0);
              // Snapshot healing for same-user tabs when SSE is delayed/flaky.
              if (!moveInFlight && pendingMoves.length === 0) {
                avatarRow = p.row;
                avatarCol = p.col;
                targetX = tileX(avatarCol);
                targetZ = tileZ(avatarRow);
                moveSeq = snapSeq;
                document.getElementById('pos-col').textContent = avatarCol;
                document.getElementById('pos-row').textContent = avatarRow;
              }
            } else {
              upsertRemoteAvatar(p.player_id, p.row, p.col, p.seq);
            }
          });
        }).catch(function() {});
    }

    function initMultiplayer() {
      fetchSnapshot();

      // Subscribe to real-time moves via GraphQL SSE
      // world_id is resolved server-side from the authenticated user's current world
      var query = 'subscription{worldPlayerMoved}';
      var sseUrl = '/graphql/sse?query=' + encodeURIComponent(query);
      var reconnectTimer = null;

      function openSSE() {
        var es = new EventSource(sseUrl);
        es.onmessage = function(evt) {
          try {
            var obj = JSON.parse(evt.data);
            var raw = obj.data.worldPlayerMoved;
            var payload = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            if (payload.leaving) {
              removeRemoteAvatar(payload.player_id);
            } else if (payload.player_id === playerId) {
              var incomingSeq = Number(payload.seq);
              var hasIncomingSeq = isFinite(incomingSeq);
              // Another tab moved us — sync local state ONLY when this tab has
              // no moves in flight or queued. If we are in the middle of
              // optimistic prediction, applying an SSE for an older step would
              // snap the position back and cause the very jump we want to fix.
              // Idle tabs (no moves queued) always accept the update, so they
              // are ready with the correct position when the user switches to them.
              if (!moveInFlight && pendingMoves.length === 0) {
                avatarRow = payload.row;
                avatarCol = payload.col;
                targetX = tileX(avatarCol);
                targetZ = tileZ(avatarRow);
                if (hasIncomingSeq) moveSeq = incomingSeq;
                document.getElementById('pos-col').textContent = avatarCol;
                document.getElementById('pos-row').textContent = avatarRow;
              }
            } else {
              upsertRemoteAvatar(
                payload.player_id,
                payload.row,
                payload.col,
                payload.seq,
              );
            }
          } catch(e) {}
        };
        es.onerror = function() {
          es.close();
          // Immediate healing snapshot, then short reconnect retry.
          if (reconnectTimer) clearTimeout(reconnectTimer);
          fetchSnapshot();
          reconnectTimer = setTimeout(openSSE, 1000);
        };
        return es;
      }

      openSSE();

      // Announce departure
      window.addEventListener('beforeunload', postLeave);

      // Heartbeat — keep presence alive and resync snapshot every 15 s
      setInterval(function() {
        // Use dedicated heartbeat endpoint: only refreshes the presence TTL
        // without sending a position, so idle tabs can't overwrite a moving tab.
        fetch('/virtual-world/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        }).catch(function() {});
        fetchSnapshot();
      }, 5000);
    }

    // ── Collision & movement ─────────────────────────────────────────────────
    function isWalkable(r, c) {
      return r >= 0 && r < ROWS && c >= 0 && c < COLS && MAP[r][c] === 0;
    }

    function tryMove(dr, dc, angle) {
      var nr = avatarRow + dr;
      var nc = avatarCol + dc;
      if (isWalkable(nr, nc)) {
        if (!postMove(nr, nc)) return false;
        // Optimistic client-side prediction — server may still reject
        avatarRow = nr;
        avatarCol = nc;
        targetX = tileX(nc);
        targetZ = tileZ(nr);
        avatar.rotation.y = angle;
        document.getElementById('pos-col').textContent = nc;
        document.getElementById('pos-row').textContent = nr;
        return true;
      }
      return false;
    }

    function goToNewWorld() {
      fetch('/virtual-world/new-world', { method: 'POST' })
        .then(function() { window.location.href = '/virtual-world'; })
        .catch(function() { window.location.href = '/virtual-world'; });
    }

    // ── Input ────────────────────────────────────────────────────────────────
    var keys = {};
    var MOVE_KEYS = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'];

    document.addEventListener('keydown', function(e) {
      keys[e.key] = true;
      if (MOVE_KEYS.indexOf(e.key) !== -1) e.preventDefault();
    });
    document.addEventListener('keyup', function(e) {
      keys[e.key] = false;
    });

    // ── Camera orbit controls (drag + scroll) ────────────────────────────────
    var isDragging = false;
    var lastMouseX = 0, lastMouseY = 0;
    var lastTouchX = 0, lastTouchY = 0;
    var lastTouchDist = 0;

    // Mouse controls (desktop)
    document.addEventListener('mousedown', function(e) {
      if (e.button === 0) {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }
    });
    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var dx = e.clientX - lastMouseX;
      var dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      camTheta -= dx * 0.005;
      camPhi = Math.max(0.15, Math.min(1.4, camPhi - dy * 0.004));
    });
    document.addEventListener('mouseup',    function() { isDragging = false; });
    document.addEventListener('mouseleave', function() { isDragging = false; });

    document.addEventListener('wheel', function(e) {
      e.preventDefault();
      camR = Math.max(10, Math.min(150, camR + e.deltaY * 0.05));
    }, { passive: false });

    // ── Joystick element references (must be defined before touch handlers) ──
    var joystickBase = document.getElementById('joystick-base');
    var joystickStick = document.getElementById('joystick-stick');
    var joystickActive = false;
    var joystickMouseActive = false; // separate flag for mouse vs touch
    var joystickDirection = { x: 0, y: 0 }; // normalized direction

    // Touch controls (mobile) - for camera rotation and pinch-to-zoom
    var isTouchRotating = false;
    
    function isTouchOnJoystick(touch) {
      if (!joystickBase) return false;
      var joystickRect = joystickBase.getBoundingClientRect();
      return (
        touch.clientX >= joystickRect.left &&
        touch.clientX <= joystickRect.right &&
        touch.clientY >= joystickRect.top &&
        touch.clientY <= joystickRect.bottom
      );
    }

    document.addEventListener('touchstart', function(e) {
      // Ignore if touching the joystick
      if (e.touches.length === 1 && !isTouchOnJoystick(e.touches[0])) {
        e.preventDefault();
        isTouchRotating = true;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        e.preventDefault();
        // Pinch to zoom
        isTouchRotating = false;
        var dx = e.touches[1].clientX - e.touches[0].clientX;
        var dy = e.touches[1].clientY - e.touches[0].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: false });

    document.addEventListener('touchmove', function(e) {
      if (e.touches.length === 1 && isTouchRotating) {
        e.preventDefault();
        // Single finger drag for camera rotation
        var dx = e.touches[0].clientX - lastTouchX;
        var dy = e.touches[0].clientY - lastTouchY;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        camTheta -= dx * 0.005;
        camPhi = Math.max(0.15, Math.min(1.4, camPhi - dy * 0.004));
      } else if (e.touches.length === 2) {
        e.preventDefault();
        // Pinch to zoom
        var dx = e.touches[1].clientX - e.touches[0].clientX;
        var dy = e.touches[1].clientY - e.touches[0].clientY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var delta = lastTouchDist - dist;
        lastTouchDist = dist;
        camR = Math.max(10, Math.min(150, camR + delta * 0.2));
      }
    }, { passive: false });

    document.addEventListener('touchend', function(e) {
      if (e.touches.length === 0) {
        isTouchRotating = false;
      } else if (e.touches.length === 1 && !isTouchOnJoystick(e.touches[0])) {
        // Continuing with one finger after lifting second
        isTouchRotating = true;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      }
    }, { passive: false });

    // ── Joystick control functions ───────────────────────────────────────────
    function updateJoystick(touchX, touchY) {
      var rect = joystickBase.getBoundingClientRect();
      var centerX = rect.left + rect.width / 2;
      var centerY = rect.top + rect.height / 2;
      var dx = touchX - centerX;
      var dy = touchY - centerY;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var maxDistance = 35; // max offset from center

      if (distance > maxDistance) {
        dx = (dx / distance) * maxDistance;
        dy = (dy / distance) * maxDistance;
      }

      joystickStick.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
      
      // Normalize direction
      if (distance > 10) { // dead zone
        joystickDirection.x = dx / maxDistance;
        joystickDirection.y = dy / maxDistance;
      } else {
        joystickDirection.x = 0;
        joystickDirection.y = 0;
      }
    }

    function resetJoystick() {
      joystickStick.style.transform = 'translate(-50%, -50%)';
      joystickDirection.x = 0;
      joystickDirection.y = 0;
      joystickActive = false;
      joystickStick.classList.remove('active');
    }

    joystickBase.addEventListener('touchstart', function(e) {
      e.preventDefault();
      e.stopPropagation();
      joystickActive = true;
      joystickStick.classList.add('active');
      updateJoystick(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    joystickBase.addEventListener('touchmove', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (joystickActive) {
        updateJoystick(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    joystickBase.addEventListener('touchend', function(e) {
      e.preventDefault();
      e.stopPropagation();
      resetJoystick();
    }, { passive: false });

    joystickBase.addEventListener('touchcancel', function(e) {
      e.preventDefault();
      e.stopPropagation();
      resetJoystick();
    }, { passive: false });

    // Mouse event handlers for desktop
    joystickBase.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      joystickActive = true;
      joystickMouseActive = true;
      joystickStick.classList.add('active');
      updateJoystick(e.clientX, e.clientY);
    });

    document.addEventListener('mousemove', function(e) {
      if (joystickMouseActive) {
        e.preventDefault();
        updateJoystick(e.clientX, e.clientY);
      }
    });

    document.addEventListener('mouseup', function(e) {
      if (joystickMouseActive) {
        e.preventDefault();
        joystickMouseActive = false;
        resetJoystick();
      }
    });

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
        if (joystickActive && (Math.abs(joystickDirection.x) > 0.15 || Math.abs(joystickDirection.y) > 0.15)) {
          // Determine primary direction based on joystick angle
          if (Math.abs(joystickDirection.y) > Math.abs(joystickDirection.x)) {
            if (joystickDirection.y < 0) { moved = tryMove(-1, 0, Math.PI); } // Up
            else { moved = tryMove(1, 0, 0); } // Down
          } else {
            if (joystickDirection.x < 0) { moved = tryMove(0, -1, Math.PI / 2); } // Left
            else { moved = tryMove(0, 1, -Math.PI / 2); } // Right
          }
        }
        // Fallback to keyboard input
        else if (keys['ArrowUp']    || keys['w'] || keys['W']) { moved = tryMove(-1,  0, Math.PI); }
        else if (keys['ArrowDown']  || keys['s'] || keys['S']) { moved = tryMove( 1,  0, 0); }
        else if (keys['ArrowLeft']  || keys['a'] || keys['A']) { moved = tryMove( 0, -1, Math.PI / 2); }
        else if (keys['ArrowRight'] || keys['d'] || keys['D']) { moved = tryMove( 0,  1, -Math.PI / 2); }

        if (moved) moveTimer = MOVE_INTERVAL;
      }

      // Smooth lerp toward target position
      var lerp = 1 - Math.exp(-15 * dt / 1000);
      avatar.position.x += (targetX - avatar.position.x) * lerp;
      avatar.position.z += (targetZ - avatar.position.z) * lerp;

      // Walking bob
      var dist = Math.abs(avatar.position.x - targetX) + Math.abs(avatar.position.z - targetZ);
      if (dist > 0.05) {
        walkTime += dt;
        avatar.position.y = Math.abs(Math.sin(walkTime * 0.012)) * 0.1;
      } else {
        walkTime = 0;
        avatar.position.y += (0 - avatar.position.y) * lerp;
      }

      // Lerp remote avatars toward their targets
      for (var pid in remoteAvatars) {
        var ra = remoteAvatars[pid];
        ra.group.position.x += (ra.targetX - ra.group.position.x) * lerp;
        ra.group.position.z += (ra.targetZ - ra.group.position.z) * lerp;
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

      updateCamera();
      renderer.render(scene, camera);
    }

    animate();
    initMultiplayer();

    // ── Resize ───────────────────────────────────────────────────────────────
    window.addEventListener('resize', function() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  </script>
</body>
</html>`;

  return ResponseBuilder.html(html);
}

function loadWorldPlayers(worldId) {
  var raw = sharedStorage.getItem("vworld:" + worldId);
  return raw ? JSON.parse(raw) : {};
}

function saveWorldPlayers(worldId, players) {
  sharedStorage.setItem("vworld:" + worldId, JSON.stringify(players));
}

var VW_DEBUG = false;

function vwLog(msg, obj) {
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

function moveHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var body;
  try {
    body = JSON.parse(context.request.body || "{}");
  } catch (e) {
    return ResponseBuilder.json({ error: "Invalid JSON body" }, 400);
  }
  var row = Number(body.row);
  var col = Number(body.col);
  // Backward compatible fallback keeps legacy tabs functional.
  var sessionId = body.session_id ? String(body.session_id) : "legacy";

  // Derive world from server-side storage — never trust client for this
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) {
    return ResponseBuilder.json({ ok: false, row: 1, col: 1 });
  }

  var leaseKey = "vworld_lease:" + userId;
  var leaseRaw = sharedStorage.getItem(leaseKey);
  var lease = null;
  if (leaseRaw) {
    try {
      lease = JSON.parse(leaseRaw);
    } catch (e) {
      lease = null;
    }
  }
  var now = Date.now();
  var leaseValid =
    lease &&
    typeof lease.session_id === "string" &&
    Number(lease.expires_at || 0) > now;
  if (leaseValid && lease.session_id !== sessionId) {
    vwLog("move taking over lease", {
      user_id: userId,
      world_id: worldId,
      previous_session: lease.session_id,
      session_id: sessionId,
    });
  }
  // Acquire or renew writer lease for this session before processing move.
  sharedStorage.setItem(
    leaseKey,
    JSON.stringify({ session_id: sessionId, expires_at: now + LEASE_TTL_MS }),
  );

  var players = loadWorldPlayers(worldId);
  // When players[userId] is absent (player reconnected after a refresh — leaveHandler
  // removed the presence entry on the previous page close), restore from the persisted
  // position key so the adjacency check doesn't incorrectly snap back to (1,1).
  var cur = players[userId];
  if (!cur) {
    var savedPosRaw = sharedStorage.getItem("vworld_pos:" + userId);
    var savedPos = savedPosRaw ? JSON.parse(savedPosRaw) : { row: 1, col: 1 };
    cur = {
      row: savedPos.row,
      col: savedPos.col,
      seq: savedPos.seq || 0,
      session_id: savedPos.session_id || "",
    };
  }

  // Server-authoritative validation
  var dr = Math.abs(row - cur.row);
  var dc = Math.abs(col - cur.col);
  var map = generateMap(worldId);
  var withinBounds = row >= 0 && row < ROWS && col >= 0 && col < COLS;
  var singleStep = dr + dc === 1;
  var walkable = withinBounds && map[row][col] === 0;

  // Reject stale moves from a tab that is no longer the active mover.
  // A stale move has a seq that doesn't continue from the stored seq.
  // This is distinct from a wall/bounds rejection — the client should
  // silently discard its queue rather than snapping back.
  var expectedSeq = cur.seq + 1;
  var clientSeq = body.seq !== undefined ? Number(body.seq) : expectedSeq;
  if (clientSeq !== expectedSeq) {
    vwLog("move rejected: stale seq", {
      user_id: userId,
      world_id: worldId,
      session_id: sessionId,
      expected_seq: expectedSeq,
      client_seq: clientSeq,
      cur_row: cur.row,
      cur_col: cur.col,
      req_row: row,
      req_col: col,
    });
    return ResponseBuilder.json({
      ok: false,
      stale: true,
      row: cur.row,
      col: cur.col,
      seq: cur.seq,
    });
  }

  if (!singleStep || !walkable) {
    vwLog("move rejected: invalid step", {
      user_id: userId,
      world_id: worldId,
      session_id: sessionId,
      from_row: cur.row,
      from_col: cur.col,
      to_row: row,
      to_col: col,
      single_step: singleStep,
      walkable: walkable,
    });
    // Reject — return the canonical position so the client can snap back
    return ResponseBuilder.json({
      ok: false,
      stale: false,
      row: cur.row,
      col: cur.col,
    });
  }

  players[userId] = {
    row: row,
    col: col,
    seq: cur.seq + 1,
    session_id: sessionId,
    ts: Date.now(),
  };
  saveWorldPlayers(worldId, players);
  // Persist position independently so page refresh restores it.
  sharedStorage.setItem(
    "vworld_pos:" + userId,
    JSON.stringify({
      row: row,
      col: col,
      seq: cur.seq + 1,
      session_id: sessionId,
    }),
  );
  var msg = JSON.stringify({
    player_id: userId,
    row: row,
    col: col,
    seq: cur.seq + 1,
  });
  graphQLRegistry.sendSubscriptionMessageFiltered(
    "worldPlayerMoved",
    msg,
    JSON.stringify({ world_id: worldId }),
  );
  vwLog("move accepted", {
    user_id: userId,
    world_id: worldId,
    session_id: sessionId,
    row: row,
    col: col,
    seq: cur.seq + 1,
  });
  return ResponseBuilder.json({
    ok: true,
    row: row,
    col: col,
    seq: cur.seq + 1,
  });
}

function leaveHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  // Derive world from storage. newWorldHandler already broadcasts the leave when
  // switching worlds, so by the time this fires after a New World navigation the
  // player is no longer recorded in the new world — making this a safe no-op.
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) return ResponseBuilder.json({ ok: true });
  var players = loadWorldPlayers(worldId);
  if (!players[userId]) return ResponseBuilder.json({ ok: true });
  delete players[userId];
  saveWorldPlayers(worldId, players);
  sharedStorage.removeItem("vworld_hb:" + userId);
  sharedStorage.removeItem("vworld_lease:" + userId);
  var msg = JSON.stringify({ player_id: userId, leaving: true });
  graphQLRegistry.sendSubscriptionMessageFiltered(
    "worldPlayerMoved",
    msg,
    JSON.stringify({ world_id: worldId }),
  );
  return ResponseBuilder.json({ ok: true });
}

function heartbeatHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) return ResponseBuilder.json({ ok: true });

  var sessionId = "";
  try {
    var body = JSON.parse(context.request.body || "{}");
    sessionId = body.session_id ? String(body.session_id) : "";
  } catch (e) {}

  if (sessionId) {
    var leaseKey = "vworld_lease:" + userId;
    var leaseRaw = sharedStorage.getItem(leaseKey);
    var lease = null;
    if (leaseRaw) {
      try {
        lease = JSON.parse(leaseRaw);
      } catch (e) {
        lease = null;
      }
    }
    var now = Date.now();
    var leaseValid =
      lease &&
      typeof lease.session_id === "string" &&
      Number(lease.expires_at || 0) > now;
    // Heartbeat must not steal another tab's active writer lease.
    // It can only renew if this session already owns the lease,
    // or claim it when no valid lease exists.
    if (!leaseValid || lease.session_id === sessionId) {
      sharedStorage.setItem(
        leaseKey,
        JSON.stringify({
          session_id: sessionId,
          expires_at: now + LEASE_TTL_MS,
        }),
      );
    } else {
      vwLog("heartbeat ignored: lease owned by other session", {
        user_id: userId,
        world_id: worldId,
        lease_session: lease.session_id,
        session_id: sessionId,
      });
    }
  }

  // Write ONLY to a separate per-user timestamp key — never read-modify-write
  // the shared players object.  A concurrent moveHandler write would otherwise
  // be clobbered by this handler writing back a stale row/col, causing the
  // server's canonical position to regress and the next move to be rejected.
  sharedStorage.setItem("vworld_hb:" + userId, String(Date.now()));
  return ResponseBuilder.json({ ok: true });
}

function newWorldHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;

  // Broadcast leave from the current world before switching.
  // This must happen here because leaveHandler derives worldId from storage:
  // by the time beforeunload fires after navigation, vworld_current already
  // points to the new world, so the beacon would be a no-op there.
  var oldWorldId = sharedStorage.getItem("vworld_current:" + userId);
  if (oldWorldId) {
    var oldPlayers = loadWorldPlayers(oldWorldId);
    if (oldPlayers[userId]) {
      delete oldPlayers[userId];
      saveWorldPlayers(oldWorldId, oldPlayers);
      sharedStorage.removeItem("vworld_hb:" + userId);
      sharedStorage.removeItem("vworld_lease:" + userId);
      graphQLRegistry.sendSubscriptionMessageFiltered(
        "worldPlayerMoved",
        JSON.stringify({ player_id: userId, leaving: true }),
        JSON.stringify({ world_id: oldWorldId }),
      );
    }
  }

  var newWorldId = String(Math.floor(Math.random() * 999999) + 1);
  sharedStorage.setItem("vworld_current:" + userId, newWorldId);
  sharedStorage.removeItem("vworld_lease:" + userId);
  // Clear persisted position so the player spawns at (1,1) in the new world.
  sharedStorage.removeItem("vworld_pos:" + userId);
  return ResponseBuilder.json({ ok: true });
}

function playersHandler(context) {
  if (!context.request.auth || !context.request.auth.isAuthenticated) {
    return ResponseBuilder.json({ error: "Authentication required" }, 401);
  }
  var userId = context.request.auth.userId;
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) return ResponseBuilder.json([]);
  var players = loadWorldPlayers(worldId);
  if (!players || typeof players !== "object") {
    vwLog("playersHandler recovered malformed players payload", {
      user_id: userId,
      world_id: worldId,
      type: typeof players,
    });
    players = {};
  }
  var now = Date.now();
  var active = Object.keys(players)
    .filter(function (pid) {
      if (!players[pid] || typeof players[pid] !== "object") {
        vwLog("playersHandler skipped malformed player entry", {
          user_id: userId,
          world_id: worldId,
          player_id: pid,
        });
        return false;
      }
      // A player is active if either their last move OR their last heartbeat
      // is within the TTL window.  Heartbeat ts is stored separately to avoid
      // racing with the move handler's write to the players object.
      var hbTs = Number(sharedStorage.getItem("vworld_hb:" + pid) || 0);
      return now - Math.max(players[pid].ts, hbTs) < 30000;
    })
    .map(function (pid) {
      return {
        player_id: pid,
        row: players[pid].row,
        col: players[pid].col,
        seq: players[pid].seq || 0,
      };
    });
  return ResponseBuilder.json(active);
}

function worldPlayerMovedResolver(context) {
  var userId =
    context.request && context.request.auth && context.request.auth.userId;
  if (!userId) return {};
  var worldId = sharedStorage.getItem("vworld_current:" + userId);
  if (!worldId) return {};
  return { world_id: worldId };
}

function init() {
  routeRegistry.registerRoute("/virtual-world", "getVirtualWorldPage", "GET", {
    summary: "2.5D Virtual World",
    description:
      "Interactive 2.5D block world rendered with Three.js. Navigate with WASD or arrow keys.",
    tags: ["Demo"],
  });
  routeRegistry.registerRoute("/virtual-world/move", "moveHandler", "POST");
  routeRegistry.registerRoute("/virtual-world/leave", "leaveHandler", "POST");
  routeRegistry.registerRoute(
    "/virtual-world/new-world",
    "newWorldHandler",
    "POST",
  );
  routeRegistry.registerRoute(
    "/virtual-world/players",
    "playersHandler",
    "GET",
  );
  routeRegistry.registerRoute(
    "/virtual-world/heartbeat",
    "heartbeatHandler",
    "POST",
  );
  graphQLRegistry.registerSubscription(
    "worldPlayerMoved",
    "type Subscription { worldPlayerMoved: String }",
    "worldPlayerMovedResolver",
    "external",
  );
}
