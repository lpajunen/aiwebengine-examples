/// <reference path="../types/aiwebengine.d.ts" />

// Virtual World - 2.5D block world with Three.js
// Move with WASD or arrow keys. Walls and trees block movement.

function getVirtualWorldPage(context) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Virtual World</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; font-family: 'Segoe UI', sans-serif; }
    canvas { display: block; }

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
  </style>
</head>
<body>
  <div class="hud" id="hud-pos">
    <strong>Virtual World</strong>
    Position: <span id="pos-col">1</span>, <span id="pos-row">1</span>
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

  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script>
    // ── World map (procedurally generated 100×100) ───────────────────────────
    // 0 = ground   1 = wall   2 = tree
    var ROWS = 100;
    var COLS = 100;
    var TILE = 2;            // world units per tile
    var MOVE_INTERVAL = 160; // ms between steps

    function generateMap() {
      var map = [];
      for (var r = 0; r < ROWS; r++) {
        map[r] = [];
        for (var c = 0; c < COLS; c++) map[r][c] = 0;
      }
      // Solid border
      for (var r = 0; r < ROWS; r++) { map[r][0] = 1; map[r][COLS-1] = 1; }
      for (var c = 0; c < COLS; c++) { map[0][c] = 1; map[ROWS-1][c] = 1; }

      // Rectangular room outlines, each with a door on all four sides
      for (var i = 0; i < 30; i++) {
        var rr = 3 + Math.floor(Math.random() * (ROWS - 18));
        var cc = 3 + Math.floor(Math.random() * (COLS - 18));
        var rh = 4 + Math.floor(Math.random() * 9);
        var rw = 4 + Math.floor(Math.random() * 9);
        for (var dr = 0; dr <= rh; dr++) {
          for (var dc = 0; dc <= rw; dc++) {
            if ((dr === 0 || dr === rh || dc === 0 || dc === rw) && map[rr+dr][cc+dc] === 0)
              map[rr+dr][cc+dc] = 1;
          }
        }
        var mh = Math.floor(rh / 2), mw = Math.floor(rw / 2);
        map[rr][cc + mw] = 0;       // top door
        map[rr + rh][cc + mw] = 0;  // bottom door
        map[rr + mh][cc] = 0;       // left door
        map[rr + mh][cc + rw] = 0;  // right door
      }

      // Wall segments with a gap
      for (var i = 0; i < 40; i++) {
        if (Math.random() > 0.5) {
          var r0 = 2 + Math.floor(Math.random() * (ROWS - 4));
          var c0 = 2 + Math.floor(Math.random() * (COLS - 20));
          var len = 6 + Math.floor(Math.random() * 14);
          var gap = Math.floor(Math.random() * len);
          for (var k = 0; k < len; k++)
            if (k !== gap && c0+k < COLS-1 && map[r0][c0+k] === 0) map[r0][c0+k] = 1;
        } else {
          var r0 = 2 + Math.floor(Math.random() * (ROWS - 20));
          var c0 = 2 + Math.floor(Math.random() * (COLS - 4));
          var len = 6 + Math.floor(Math.random() * 14);
          var gap = Math.floor(Math.random() * len);
          for (var k = 0; k < len; k++)
            if (k !== gap && r0+k < ROWS-1 && map[r0+k][c0] === 0) map[r0+k][c0] = 1;
        }
      }

      // Scatter trees in open ground
      for (var i = 0; i < 500; i++) {
        var r = 1 + Math.floor(Math.random() * (ROWS - 2));
        var c = 1 + Math.floor(Math.random() * (COLS - 2));
        if (map[r][c] === 0) map[r][c] = 2;
      }

      // Always keep spawn area clear
      map[1][1] = 0; map[1][2] = 0; map[2][1] = 0;
      return map;
    }
    var MAP = generateMap();

    var avatarRow = 1;
    var avatarCol = 1;
    var targetX = avatarCol * TILE + TILE / 2;
    var targetZ = avatarRow * TILE + TILE / 2;

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

    // ── Collision & movement ─────────────────────────────────────────────────
    function isWalkable(r, c) {
      return r >= 0 && r < ROWS && c >= 0 && c < COLS && MAP[r][c] === 0;
    }

    function tryMove(dr, dc, angle) {
      var nr = avatarRow + dr;
      var nc = avatarCol + dc;
      if (isWalkable(nr, nc)) {
        avatarRow = nr;
        avatarCol = nc;
        targetX = tileX(nc);
        targetZ = tileZ(nr);
        avatar.rotation.y = angle;
        document.getElementById('pos-col').textContent = nc;
        document.getElementById('pos-row').textContent = nr;
      }
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
        if (keys['ArrowUp']    || keys['w'] || keys['W']) { tryMove(-1,  0, Math.PI);      moved = true; }
        else if (keys['ArrowDown']  || keys['s'] || keys['S']) { tryMove( 1,  0, 0);             moved = true; }
        else if (keys['ArrowLeft']  || keys['a'] || keys['A']) { tryMove( 0, -1, Math.PI / 2);   moved = true; }
        else if (keys['ArrowRight'] || keys['d'] || keys['D']) { tryMove( 0,  1, -Math.PI / 2);  moved = true; }

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

function init() {
  routeRegistry.registerRoute("/virtual-world", "getVirtualWorldPage", "GET", {
    summary: "2.5D Virtual World",
    description: "Interactive 2.5D block world rendered with Three.js. Navigate with WASD or arrow keys.",
    tags: ["Demo"]
  });
}
