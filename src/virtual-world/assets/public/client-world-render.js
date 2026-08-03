/// <reference path="virtual-world-browser-globals.d.ts" />
// World rendering: constants, scene init, terrain/tree/house/ground-item meshes.

// ── Constants ─────────────────────────────────────────────────────────────
// World dimensions come from the server-injected MAP; worlds are no longer
// all 100×100.
var ROWS = MAP.length;
var COLS = MAP[0] ? MAP[0].length : 0;
var TILE = 2; // world units per tile
var MOVE_INTERVAL = 160; // ms between steps
var MAX_PENDING_MOVES = 40;

var avatarRow = INIT_ROW;
var avatarCol = INIT_COL;
var targetX = avatarCol * TILE + TILE / 2;
var targetZ = avatarRow * TILE + TILE / 2;
var moveSeq = INIT_SEQ; // last confirmed server sequence number

appState.world = {
  rows: ROWS,
  cols: COLS,
  tile: TILE,
};

appRender = initializeRenderScene({
  rows: ROWS,
  cols: COLS,
  tile: TILE,
  targetX: targetX,
  targetZ: targetZ,
});

// ── Renderer / scene state ───────────────────────────────────────────────
var renderer = appRender.renderer;
var scene = appRender.scene;
var mapCX = appRender.mapCX;
var mapCZ = appRender.mapCZ;
var camera = appRender.camera;
var cameraOrbit = appRender.orbit;
var ambient = appRender.ambient;
var sun = appRender.sun;
var fill = appRender.fill;
var bgPlane = appRender.bgPlane;

function updateCamera() {
  appRender.updateCamera(avatar.position.x, avatar.position.z);
}

// ── Reusable geometries and materials ────────────────────────────────────
var geoGround = new THREE.BoxGeometry(TILE, 0.25, TILE);
var geoFloorOverlay = new THREE.BoxGeometry(TILE, 0.05, TILE);
var matGroundA = new THREE.MeshLambertMaterial({ color: 0x7ab648 });
var matGroundB = new THREE.MeshLambertMaterial({ color: 0x6da040 });
var matSandA = new THREE.MeshLambertMaterial({ color: 0xd7c182 });
var matSandB = new THREE.MeshLambertMaterial({ color: 0xcbb170 });
var matCaveFloorA = new THREE.MeshLambertMaterial({ color: 0x6a6b72 });
var matCaveFloorB = new THREE.MeshLambertMaterial({ color: 0x5a5c63 });
var matWoodFloorA = new THREE.MeshLambertMaterial({ color: 0x9b6c3f });
var matWoodFloorB = new THREE.MeshLambertMaterial({ color: 0x835730 });
var matBridgeA = new THREE.MeshLambertMaterial({ color: 0xb08a55 });
var matBridgeB = new THREE.MeshLambertMaterial({ color: 0x9a7447 });

var geoSpruceTrunk = new THREE.CylinderGeometry(0.11, 0.16, 0.95, 6);
var geoSpruceCanopyLow = new THREE.ConeGeometry(0.78, 1.5, 8);
var geoSpruceCanopyMid = new THREE.ConeGeometry(0.58, 1.15, 8);
var geoSpruceCanopyTop = new THREE.ConeGeometry(0.36, 0.8, 8);
var matSpruceTrunk = new THREE.MeshLambertMaterial({ color: 0x6d4726 });
var matSpruceLow = new THREE.MeshLambertMaterial({ color: 0x2b5730 });
var matSpruceMid = new THREE.MeshLambertMaterial({ color: 0x36673a });
var matSpruceTop = new THREE.MeshLambertMaterial({ color: 0x447b45 });

var geoPineTrunk = new THREE.CylinderGeometry(0.09, 0.14, 1.05, 6);
var geoPineCanopyLow = new THREE.ConeGeometry(0.48, 1.05, 8);
var geoPineCanopyMid = new THREE.ConeGeometry(0.34, 0.8, 8);
var geoPineCanopyTop = new THREE.ConeGeometry(0.2, 0.52, 8);
var matPineTrunk = new THREE.MeshLambertMaterial({ color: 0x7d4f2a });
var matPineLow = new THREE.MeshLambertMaterial({ color: 0x2d8a3e });
var matPineMid = new THREE.MeshLambertMaterial({ color: 0x3c9f4b });
var matPineTop = new THREE.MeshLambertMaterial({ color: 0x56bf62 });

var geoOakTrunk = new THREE.CylinderGeometry(0.18, 0.28, 1.3, 8);
var geoOakCanopyCore = new THREE.SphereGeometry(0.58, 10, 10);
var geoOakCanopySide = new THREE.SphereGeometry(0.42, 10, 10);
var matOakTrunk = new THREE.MeshLambertMaterial({ color: 0x6c4729 });
var matOakCore = new THREE.MeshLambertMaterial({ color: 0x4f8b42 });
var matOakSide = new THREE.MeshLambertMaterial({ color: 0x6aa651 });
var geoWaterTile = new THREE.BoxGeometry(TILE, 0.12, TILE);
var geoRock = new THREE.DodecahedronGeometry(0.42, 0);
var geoMountain = new THREE.ConeGeometry(0.78, 1.9, 7);
var matOcean = new THREE.MeshLambertMaterial({ color: 0x2f6fa3 });
var matLake = new THREE.MeshLambertMaterial({ color: 0x4f91c9 });
var matRiver = new THREE.MeshLambertMaterial({ color: 0x62b9d9 });
var matRock = new THREE.MeshLambertMaterial({ color: 0x7f8892 });
var matMountain = new THREE.MeshLambertMaterial({ color: 0x8a8178 });
var geoFencePost = new THREE.CylinderGeometry(0.05, 0.07, 0.85, 6);
var geoFenceRailX = new THREE.BoxGeometry(TILE * 0.85, 0.09, 0.09);
var geoFenceRailZ = new THREE.BoxGeometry(0.09, 0.09, TILE * 0.85);
var matFencePost = new THREE.MeshLambertMaterial({ color: 0x8a6239 });
var matFenceRail = new THREE.MeshLambertMaterial({ color: 0x9c7444 });
var geoHouseFloor = new THREE.BoxGeometry(1.82, 0.16, 1.82);
var geoHouseBody = new THREE.BoxGeometry(1.56, 1.18, 1.56);
var geoHouseWallNorthSouth = new THREE.BoxGeometry(1.62, 1.06, 0.12);
var geoHouseWallEastWest = new THREE.BoxGeometry(0.12, 1.06, 1.62);
var geoHouseRoofCore = new THREE.BoxGeometry(1.74, 0.28, 1.74);
var geoHouseRoofNorthSouth = new THREE.BoxGeometry(1.9, 0.14, 0.28);
var geoHouseRoofEastWest = new THREE.BoxGeometry(0.28, 0.14, 1.9);
var geoHouseDoor = new THREE.BoxGeometry(0.34, 0.72, 0.08);
var geoHouseChimney = new THREE.BoxGeometry(0.22, 0.62, 0.22);
var matHouseFloor = new THREE.MeshLambertMaterial({ color: 0x8c6b49 });
var matHouseBody = new THREE.MeshLambertMaterial({ color: 0xcaa476 });
var matHouseWall = new THREE.MeshLambertMaterial({ color: 0x845c3b });
var matHouseRoof = new THREE.MeshLambertMaterial({ color: 0x81503c });
var matHouseDoor = new THREE.MeshLambertMaterial({ color: 0x4e311f });
var matHouseChimney = new THREE.MeshLambertMaterial({ color: 0x6a6767 });

/**
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
function isOldOakTile(row, col) {
  return (
    String(worldId) === "10000" &&
    row === OAK_CENTER_ROW &&
    col === OAK_CENTER_COL
  );
}

// ── Build tiles with InstancedMesh (efficient for large worlds) ────────────
/** @param {number} col */
function tileX(col) {
  return col * TILE + TILE / 2;
}
/** @param {number} row */
function tileZ(row) {
  return row * TILE + TILE / 2;
}

var dummy = new THREE.Object3D();
dummy.rotation.set(0, 0, 0);
dummy.scale.set(1, 1, 1);

/**
 * @param {any} mesh
 * @param {number} index
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} [scaleX]
 * @param {number} [scaleY]
 * @param {number} [scaleZ]
 */
function setInstanceTransform(mesh, index, x, y, z, scaleX, scaleY, scaleZ) {
  dummy.position.set(x, y, z);
  dummy.scale.set(scaleX || 1, scaleY || 1, scaleZ || 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

/** @param {any} mesh */
function finalizeInstancedMesh(mesh) {
  if (!mesh) return;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
}

/** @param {any[]} meshes */
function disposeInstancedMeshes(meshes) {
  for (var i = 0; i < meshes.length; i++) {
    if (meshes[i]) meshes[i].dispose();
  }
}

/** @param {boolean} visible */
function setTreeMeshVisibility(visible) {
  var display = !!visible;
  iPineTrunk.visible = display;
  iPineCanopyLow.visible = display;
  iPineCanopyMid.visible = display;
  iPineCanopyTop.visible = display;
  if (oakGroup) oakGroup.visible = display;
}

function buildOakGroup() {
  if (String(worldId) !== "10000") return null;
  var group = new THREE.Group();
  var oakX = tileX(OAK_CENTER_COL);
  var oakZ = tileZ(OAK_CENTER_ROW);

  var oakTrunk = new THREE.Mesh(geoOakTrunk, matOakTrunk);
  oakTrunk.position.set(oakX, 0.65, oakZ);
  oakTrunk.castShadow = true;
  oakTrunk.receiveShadow = true;
  group.add(oakTrunk);

  var canopyCore = new THREE.Mesh(geoOakCanopyCore, matOakCore);
  canopyCore.position.set(oakX, 1.95, oakZ);
  canopyCore.scale.set(1.2, 0.95, 1.15);
  canopyCore.castShadow = true;
  canopyCore.receiveShadow = true;
  group.add(canopyCore);

  var canopyLeft = new THREE.Mesh(geoOakCanopySide, matOakSide);
  canopyLeft.position.set(oakX - 0.38, 1.82, oakZ + 0.1);
  canopyLeft.scale.set(1.05, 0.9, 1);
  canopyLeft.castShadow = true;
  canopyLeft.receiveShadow = true;
  group.add(canopyLeft);

  var canopyRight = new THREE.Mesh(geoOakCanopySide, matOakSide);
  canopyRight.position.set(oakX + 0.36, 1.78, oakZ - 0.08);
  canopyRight.scale.set(0.98, 0.86, 0.96);
  canopyRight.castShadow = true;
  canopyRight.receiveShadow = true;
  group.add(canopyRight);

  var canopyFront = new THREE.Mesh(geoOakCanopySide, matOakSide);
  canopyFront.position.set(oakX + 0.05, 1.7, oakZ + 0.42);
  canopyFront.scale.set(0.88, 0.76, 0.92);
  canopyFront.castShadow = true;
  canopyFront.receiveShadow = true;
  group.add(canopyFront);

  return group;
}

/** @param {number} tileValue */
function countTilesByValue(tileValue) {
  var count = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      if (MAP[row][col] === tileValue) count++;
    }
  }
  return count;
}

/** @type {any} */ var iOcean = null;
/** @type {any} */ var iLake = null;
/** @type {any} */ var iRiver = null;
/** @type {any} */ var iRock = null;
/** @type {any} */ var iMountain = null;
/** @type {any} */ var iFencePost = null;
/** @type {any} */ var iFenceRailX = null;
/** @type {any} */ var iFenceRailZ = null;
/** @type {any} */ var iSandA = null;
/** @type {any} */ var iSandB = null;
/** @type {any} */ var iCaveFloorA = null;
/** @type {any} */ var iCaveFloorB = null;
/** @type {any} */ var iWoodFloorA = null;
/** @type {any} */ var iWoodFloorB = null;
/** @type {any} */ var iBridgeA = null;
/** @type {any} */ var iBridgeB = null;
// Ground/spruce/oak meshes are rebuilt from scratch on each world load (boot
// and in-place world swap) by buildStaticWorldMeshes(), so they are mutable
// module holders rather than build-once locals.
/** @type {any} */ var iGroundA = null;
/** @type {any} */ var iGroundB = null;
/** @type {any} */ var iSpruceTrunk = null;
/** @type {any} */ var iSpruceCanopyLow = null;
/** @type {any} */ var iSpruceCanopyMid = null;
/** @type {any} */ var iSpruceCanopyTop = null;
/** @type {any} */ var iPineTrunk = null;
/** @type {any} */ var iPineCanopyLow = null;
/** @type {any} */ var iPineCanopyMid = null;
/** @type {any} */ var iPineCanopyTop = null;
/** @type {any} */ var oakGroup = null;

/**
 * @param {string} tileName
 * @param {number} parity
 * @returns {number}
 */
function countParityTiles(tileName, parity) {
  var tileValue = clientTileValueForName(tileName);
  var count = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      if (((row + col) & 1) !== parity) continue;
      if (MAP[row][col] === tileValue) count++;
    }
  }
  return count;
}

function rebuildFloorOverlayMeshes() {
  scene.remove(
    iSandA,
    iSandB,
    iCaveFloorA,
    iCaveFloorB,
    iWoodFloorA,
    iWoodFloorB,
    iBridgeA,
    iBridgeB,
  );
  disposeInstancedMeshes([
    iSandA,
    iSandB,
    iCaveFloorA,
    iCaveFloorB,
    iWoodFloorA,
    iWoodFloorB,
    iBridgeA,
    iBridgeB,
  ]);

  iSandA = new THREE.InstancedMesh(
    geoFloorOverlay,
    matSandA,
    countParityTiles("sand", 0),
  );
  iSandB = new THREE.InstancedMesh(
    geoFloorOverlay,
    matSandB,
    countParityTiles("sand", 1),
  );
  iCaveFloorA = new THREE.InstancedMesh(
    geoFloorOverlay,
    matCaveFloorA,
    countParityTiles("cave_floor", 0),
  );
  iCaveFloorB = new THREE.InstancedMesh(
    geoFloorOverlay,
    matCaveFloorB,
    countParityTiles("cave_floor", 1),
  );
  iWoodFloorA = new THREE.InstancedMesh(
    geoFloorOverlay,
    matWoodFloorA,
    countParityTiles("wood_floor", 0),
  );
  iWoodFloorB = new THREE.InstancedMesh(
    geoFloorOverlay,
    matWoodFloorB,
    countParityTiles("wood_floor", 1),
  );
  iBridgeA = new THREE.InstancedMesh(
    geoFloorOverlay,
    matBridgeA,
    countParityTiles("bridge", 0),
  );
  iBridgeB = new THREE.InstancedMesh(
    geoFloorOverlay,
    matBridgeB,
    countParityTiles("bridge", 1),
  );

  var sandAIdx = 0;
  var sandBIdx = 0;
  var caveAIdx = 0;
  var caveBIdx = 0;
  var woodAIdx = 0;
  var woodBIdx = 0;
  var bridgeAIdx = 0;
  var bridgeBIdx = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      var tileValue = MAP[row][col];
      var x = tileX(col);
      var z = tileZ(row);
      var parity = (row + col) & 1;
      if (tileValue === clientTileValueForName("sand")) {
        setInstanceTransform(
          parity === 0 ? iSandA : iSandB,
          parity === 0 ? sandAIdx++ : sandBIdx++,
          x,
          0.01,
          z,
          1,
          1,
          1,
        );
      } else if (tileValue === clientTileValueForName("cave_floor")) {
        setInstanceTransform(
          parity === 0 ? iCaveFloorA : iCaveFloorB,
          parity === 0 ? caveAIdx++ : caveBIdx++,
          x,
          0.01,
          z,
          1,
          1,
          1,
        );
      } else if (tileValue === clientTileValueForName("wood_floor")) {
        setInstanceTransform(
          parity === 0 ? iWoodFloorA : iWoodFloorB,
          parity === 0 ? woodAIdx++ : woodBIdx++,
          x,
          0.01,
          z,
          1,
          1,
          1,
        );
      } else if (tileValue === clientTileValueForName("bridge")) {
        setInstanceTransform(
          parity === 0 ? iBridgeA : iBridgeB,
          parity === 0 ? bridgeAIdx++ : bridgeBIdx++,
          x,
          0.03,
          z,
          1,
          1,
          1,
        );
      }
    }
  }

  finalizeInstancedMesh(iSandA);
  finalizeInstancedMesh(iSandB);
  finalizeInstancedMesh(iCaveFloorA);
  finalizeInstancedMesh(iCaveFloorB);
  finalizeInstancedMesh(iWoodFloorA);
  finalizeInstancedMesh(iWoodFloorB);
  finalizeInstancedMesh(iBridgeA);
  finalizeInstancedMesh(iBridgeB);
  scene.add(
    iSandA,
    iSandB,
    iCaveFloorA,
    iCaveFloorB,
    iWoodFloorA,
    iWoodFloorB,
    iBridgeA,
    iBridgeB,
  );
}

function rebuildTerrainFeatureMeshes() {
  scene.remove(
    iOcean,
    iLake,
    iRiver,
    iRock,
    iMountain,
    iFencePost,
    iFenceRailX,
    iFenceRailZ,
  );
  disposeInstancedMeshes([
    iOcean,
    iLake,
    iRiver,
    iRock,
    iMountain,
    iFencePost,
    iFenceRailX,
    iFenceRailZ,
  ]);

  iOcean = new THREE.InstancedMesh(
    geoWaterTile,
    matOcean,
    countTilesByValue(clientTileValueForName("ocean")),
  );
  iLake = new THREE.InstancedMesh(
    geoWaterTile,
    matLake,
    countTilesByValue(clientTileValueForName("lake")),
  );
  iRiver = new THREE.InstancedMesh(
    geoWaterTile,
    matRiver,
    countTilesByValue(clientTileValueForName("river")),
  );
  iRock = new THREE.InstancedMesh(
    geoRock,
    matRock,
    countTilesByValue(clientTileValueForName("rock")),
  );
  iMountain = new THREE.InstancedMesh(
    geoMountain,
    matMountain,
    countTilesByValue(clientTileValueForName("mountain")),
  );
  var fenceCount = countTilesByValue(clientTileValueForName("stick_fence"));
  iFencePost = new THREE.InstancedMesh(geoFencePost, matFencePost, fenceCount);
  iFenceRailX = new THREE.InstancedMesh(
    geoFenceRailX,
    matFenceRail,
    fenceCount,
  );
  iFenceRailZ = new THREE.InstancedMesh(
    geoFenceRailZ,
    matFenceRail,
    fenceCount,
  );

  var oceanIdx = 0;
  var lakeIdx = 0;
  var riverIdx = 0;
  var rockIdx = 0;
  var mountainIdx = 0;
  var fenceIdx = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      var tileValue = MAP[row][col];
      var x = tileX(col);
      var z = tileZ(row);
      if (tileValue === clientTileValueForName("ocean")) {
        setInstanceTransform(iOcean, oceanIdx++, x, -0.055, z, 1, 1, 1);
      } else if (tileValue === clientTileValueForName("lake")) {
        setInstanceTransform(iLake, lakeIdx++, x, -0.05, z, 1, 1, 1);
      } else if (tileValue === clientTileValueForName("river")) {
        setInstanceTransform(iRiver, riverIdx++, x, -0.045, z, 1, 1, 1);
      } else if (tileValue === clientTileValueForName("rock")) {
        setInstanceTransform(iRock, rockIdx++, x, 0.2, z, 1, 1, 1);
      } else if (tileValue === clientTileValueForName("mountain")) {
        setInstanceTransform(iMountain, mountainIdx++, x, 0.92, z, 1, 1, 1);
      } else if (tileValue === clientTileValueForName("stick_fence")) {
        setInstanceTransform(iFencePost, fenceIdx, x, 0.42, z, 1, 1, 1);
        setInstanceTransform(iFenceRailX, fenceIdx, x, 0.5, z, 1, 1, 1);
        setInstanceTransform(iFenceRailZ, fenceIdx, x, 0.5, z, 1, 1, 1);
        fenceIdx++;
      }
    }
  }

  finalizeInstancedMesh(iOcean);
  finalizeInstancedMesh(iLake);
  finalizeInstancedMesh(iRiver);
  finalizeInstancedMesh(iRock);
  finalizeInstancedMesh(iMountain);
  finalizeInstancedMesh(iFencePost);
  finalizeInstancedMesh(iFenceRailX);
  finalizeInstancedMesh(iFenceRailZ);
  scene.add(
    iOcean,
    iLake,
    iRiver,
    iRock,
    iMountain,
    iFencePost,
    iFenceRailX,
    iFenceRailZ,
  );
}

function countRenderablePines() {
  var count = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      if (
        MAP[row][col] === clientTileValueForName("pine_tree") &&
        !isOldOakTile(row, col)
      ) {
        count++;
      }
    }
  }
  return count;
}

/**
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
function hasHouseAt(row, col) {
  return (
    row >= 0 &&
    row < ROWS &&
    col >= 0 &&
    col < COLS &&
    MAP[row][col] === clientTileValueForName("house")
  );
}

/**
 * @param {number} row
 * @param {number} col
 * @returns {any}
 */
function buildHouseTile(row, col) {
  var group = new THREE.Group();
  var x = tileX(col);
  var z = tileZ(row);
  var north = hasHouseAt(row - 1, col);
  var east = hasHouseAt(row, col + 1);
  var south = hasHouseAt(row + 1, col);
  var west = hasHouseAt(row, col - 1);

  var floor = new THREE.Mesh(geoHouseFloor, matHouseFloor);
  floor.position.set(x, 0.08, z);
  floor.castShadow = true;
  floor.receiveShadow = true;
  group.add(floor);

  var body = new THREE.Mesh(geoHouseBody, matHouseBody);
  body.position.set(x, 0.74, z);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  var roof = new THREE.Mesh(geoHouseRoofCore, matHouseRoof);
  roof.position.set(x, 1.48, z);
  roof.rotation.y = north || south ? 0 : Math.PI / 4;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  /**
   * @param {any} geometry
   * @param {any} material
   * @param {number} px
   * @param {number} py
   * @param {number} pz
   */
  function addWall(geometry, material, px, py, pz) {
    var mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  /**
   * @param {any} geometry
   * @param {number} px
   * @param {number} py
   * @param {number} pz
   */
  function addRoofTrim(geometry, px, py, pz) {
    var mesh = new THREE.Mesh(geometry, matHouseRoof);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  if (!north) {
    addWall(geoHouseWallNorthSouth, matHouseWall, x, 0.75, z - 0.77);
    addRoofTrim(geoHouseRoofNorthSouth, x, 1.62, z - 0.92);
  }
  if (!south) {
    addWall(geoHouseWallNorthSouth, matHouseWall, x, 0.75, z + 0.77);
    addRoofTrim(geoHouseRoofNorthSouth, x, 1.62, z + 0.92);
  }
  if (!east) {
    addWall(geoHouseWallEastWest, matHouseWall, x + 0.77, 0.75, z);
    addRoofTrim(geoHouseRoofEastWest, x + 0.92, 1.62, z);
  }
  if (!west) {
    addWall(geoHouseWallEastWest, matHouseWall, x - 0.77, 0.75, z);
    addRoofTrim(geoHouseRoofEastWest, x - 0.92, 1.62, z);
  }

  if (!south) {
    var door = new THREE.Mesh(geoHouseDoor, matHouseDoor);
    door.position.set(x, 0.49, z + 0.79);
    door.castShadow = true;
    door.receiveShadow = true;
    group.add(door);
  }

  if (!north && !west) {
    var chimney = new THREE.Mesh(geoHouseChimney, matHouseChimney);
    chimney.position.set(x - 0.42, 1.82, z - 0.42);
    chimney.castShadow = true;
    chimney.receiveShadow = true;
    group.add(chimney);
  }

  return group;
}

var houseMeshGroup = new THREE.Group();
scene.add(houseMeshGroup);

function clearHouseMeshes() {
  while (houseMeshGroup.children.length > 0) {
    houseMeshGroup.remove(
      houseMeshGroup.children[houseMeshGroup.children.length - 1],
    );
  }
}

function rebuildHouseMeshes() {
  clearHouseMeshes();
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      if (!hasHouseAt(row, col)) continue;
      houseMeshGroup.add(buildHouseTile(row, col));
    }
  }
}

function rebuildPineInstances() {
  scene.remove(iPineTrunk, iPineCanopyLow, iPineCanopyMid, iPineCanopyTop);
  disposeInstancedMeshes([
    iPineTrunk,
    iPineCanopyLow,
    iPineCanopyMid,
    iPineCanopyTop,
  ]);

  var pineCount = countRenderablePines();
  iPineTrunk = new THREE.InstancedMesh(geoPineTrunk, matPineTrunk, pineCount);
  iPineCanopyLow = new THREE.InstancedMesh(
    geoPineCanopyLow,
    matPineLow,
    pineCount,
  );
  iPineCanopyMid = new THREE.InstancedMesh(
    geoPineCanopyMid,
    matPineMid,
    pineCount,
  );
  iPineCanopyTop = new THREE.InstancedMesh(
    geoPineCanopyTop,
    matPineTop,
    pineCount,
  );

  var pineIdx = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      if (
        MAP[row][col] !== clientTileValueForName("pine_tree") ||
        isOldOakTile(row, col)
      ) {
        continue;
      }
      var pineX = tileX(col);
      var pineZ = tileZ(row);
      setInstanceTransform(iPineTrunk, pineIdx, pineX, 0.52, pineZ, 1, 1, 1);
      setInstanceTransform(
        iPineCanopyLow,
        pineIdx,
        pineX,
        1.12,
        pineZ,
        1,
        1,
        1,
      );
      setInstanceTransform(
        iPineCanopyMid,
        pineIdx,
        pineX,
        1.62,
        pineZ,
        1,
        1,
        1,
      );
      setInstanceTransform(iPineCanopyTop, pineIdx, pineX, 2.0, pineZ, 1, 1, 1);
      pineIdx++;
    }
  }

  finalizeInstancedMesh(iPineTrunk);
  finalizeInstancedMesh(iPineCanopyLow);
  finalizeInstancedMesh(iPineCanopyMid);
  finalizeInstancedMesh(iPineCanopyTop);
  scene.add(iPineTrunk, iPineCanopyLow, iPineCanopyMid, iPineCanopyTop);
}

// Remove + dispose the ground/spruce/oak meshes from a previous world load so
// an in-place world swap doesn't leak the outgoing world's terrain.
function disposeStaticWorldMeshes() {
  scene.remove(
    iGroundA,
    iGroundB,
    iSpruceTrunk,
    iSpruceCanopyLow,
    iSpruceCanopyMid,
    iSpruceCanopyTop,
  );
  disposeInstancedMeshes([
    iGroundA,
    iGroundB,
    iSpruceTrunk,
    iSpruceCanopyLow,
    iSpruceCanopyMid,
    iSpruceCanopyTop,
  ]);
  if (oakGroup) {
    scene.remove(oakGroup);
    oakGroup = null;
  }
}

// (Re)build every world-scoped mesh from the current MAP/*_MODS globals. Called
// once at boot and again on each in-place world swap; recomputes ROWS/COLS so
// worlds of a different size render correctly.
function buildStaticWorldMeshes() {
  ROWS = MAP.length;
  COLS = MAP[0] ? MAP[0].length : 0;
  appState.world.rows = ROWS;
  appState.world.cols = COLS;

  disposeStaticWorldMeshes();

  // Count instances
  var cntA = 0,
    cntB = 0,
    cntSpruce = 0;
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      if ((r + c) % 2 === 0) cntA++;
      else cntB++;
      if (MAP[r][c] === clientTileValueForName("spruce_thicket")) cntSpruce++;
    }
  }

  iGroundA = new THREE.InstancedMesh(geoGround, matGroundA, cntA);
  iGroundB = new THREE.InstancedMesh(geoGround, matGroundB, cntB);
  iSpruceTrunk = new THREE.InstancedMesh(
    geoSpruceTrunk,
    matSpruceTrunk,
    cntSpruce,
  );
  iSpruceCanopyLow = new THREE.InstancedMesh(
    geoSpruceCanopyLow,
    matSpruceLow,
    cntSpruce,
  );
  iSpruceCanopyMid = new THREE.InstancedMesh(
    geoSpruceCanopyMid,
    matSpruceMid,
    cntSpruce,
  );
  iSpruceCanopyTop = new THREE.InstancedMesh(
    geoSpruceCanopyTop,
    matSpruceTop,
    cntSpruce,
  );
  oakGroup = buildOakGroup();

  iGroundA.receiveShadow = true;
  iGroundB.receiveShadow = true;
  finalizeInstancedMesh(iSpruceTrunk);
  finalizeInstancedMesh(iSpruceCanopyLow);
  finalizeInstancedMesh(iSpruceCanopyMid);
  finalizeInstancedMesh(iSpruceCanopyTop);

  var idxA = 0,
    idxB = 0,
    idxW = 0;
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      var tx = tileX(col),
        tz = tileZ(row);

      dummy.position.set(tx, -0.125, tz);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      if ((row + col) % 2 === 0) iGroundA.setMatrixAt(idxA++, dummy.matrix);
      else iGroundB.setMatrixAt(idxB++, dummy.matrix);

      if (MAP[row][col] === clientTileValueForName("spruce_thicket")) {
        setInstanceTransform(iSpruceTrunk, idxW, tx, 0.48, tz, 1, 1, 1);
        setInstanceTransform(iSpruceCanopyLow, idxW, tx, 1.08, tz, 1, 1, 1);
        setInstanceTransform(iSpruceCanopyMid, idxW, tx, 1.62, tz, 1, 1, 1);
        setInstanceTransform(iSpruceCanopyTop, idxW, tx, 2.04, tz, 1, 1, 1);
        idxW++;
      }
    }
  }

  iGroundA.instanceMatrix.needsUpdate = true;
  iGroundB.instanceMatrix.needsUpdate = true;
  iSpruceTrunk.instanceMatrix.needsUpdate = true;
  iSpruceCanopyLow.instanceMatrix.needsUpdate = true;
  iSpruceCanopyMid.instanceMatrix.needsUpdate = true;
  iSpruceCanopyTop.instanceMatrix.needsUpdate = true;

  scene.add(
    iGroundA,
    iGroundB,
    iSpruceTrunk,
    iSpruceCanopyLow,
    iSpruceCanopyMid,
    iSpruceCanopyTop,
  );
  if (oakGroup) scene.add(oakGroup);

  rebuildFloorOverlayMeshes();
  rebuildTerrainFeatureMeshes();
  rebuildPineInstances();
  rebuildHouseMeshes();
  rebuildItemMeshes();
}

// ── Function to rebuild tree instances after tree modifications ───────────
function updateTreeInstances() {
  rebuildPineInstances();
}

function updateHouseMeshes() {
  rebuildHouseMeshes();
}

function updateTerrainFeatureMeshes() {
  rebuildFloorOverlayMeshes();
  rebuildTerrainFeatureMeshes();
}

// ── Ground items (MVP visuals) ─────────────────────────────────────────
var itemGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
// A door reads as a tall thin panel standing on its tile, rather than the
// small ground-item cube used for everything else.
var doorGeo = new THREE.BoxGeometry(0.72, 1.0, 0.16);
/** @type {Record<string, any>} */
var itemMatCache = {};
var itemMeshGroup = new THREE.Group();
scene.add(itemMeshGroup);

// Contextual-action highlight (DESIGN-targeting.md step 3): a pulsing ring on
// the ground under any world item that an available validWhen-gated action
// currently applies to — a damaged item (Fix) or a corpse (Bury) — so the
// opportunity is discoverable in the world without opening the tile panel.
var highlightMeshGroup = new THREE.Group();
scene.add(highlightMeshGroup);
var highlightRingGeo = new THREE.RingGeometry(0.3, 0.44, 28);
var highlightRingMat = new THREE.MeshBasicMaterial({
  color: 0xffd54a,
  transparent: true,
  opacity: 0.5,
  side: THREE.DoubleSide,
  depthWrite: false,
});
/** @type {any[]} */
var itemHighlightMeshes = [];

function clearItemHighlights() {
  while (highlightMeshGroup.children.length > 0) {
    var child = highlightMeshGroup.children.pop();
    if (child) highlightMeshGroup.remove(child);
  }
  itemHighlightMeshes = [];
}

/**
 * Whether an available item-targeted action carrying a validWhen precondition
 * currently applies to this world item (Fix on a damaged item, Bury on a
 * corpse). Distance-agnostic: an out-of-reach match still glows, since
 * walk-then-act will close the gap when the player acts.
 * @param {any} item
 * @returns {boolean}
 */
function itemHasContextualAction(item) {
  if (!item) return false;
  var actionIds = actionsAvailableForTargetKind("item", false);
  var target = { type: item.type, state: item.state };
  for (var i = 0; i < actionIds.length; i++) {
    var def = getRegistryActionDef(actionIds[i]);
    if (!def || !Array.isArray(def.valid_when) || def.valid_when.length === 0)
      continue;
    if (actionValidForTarget(actionIds[i], target)) return true;
  }
  return false;
}

/**
 * @param {number} x
 * @param {number} z
 */
function addItemHighlightAt(x, z) {
  var ring = new THREE.Mesh(highlightRingGeo, highlightRingMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.06, z);
  highlightMeshGroup.add(ring);
  itemHighlightMeshes.push(ring);
}

/**
 * Breathes the shared highlight material's opacity so the rings pulse. Called
 * each frame from the game loop; a no-op when nothing is highlighted.
 * @param {number} nowMs
 */
function updateItemHighlights(nowMs) {
  if (itemHighlightMeshes.length === 0) return;
  highlightRingMat.opacity = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(nowMs * 0.005));
}

/**
 * @param {string} type
 * @returns {number}
 */
function itemTypeColor(type) {
  var registryItem =
    ITEM_REGISTRY && ITEM_REGISTRY.items
      ? ITEM_REGISTRY.items[String(type || "")]
      : null;
  if (registryItem && Number.isFinite(Number(registryItem.color))) {
    return Number(registryItem.color);
  }
  if (type === "saw") return 0xbfc6d0;
  if (type === "hammer") return 0x8f7f6d;
  if (type === "knife") return 0xd8dee8;
  if (type === "flower") return 0xec6ea4;
  if (type === "tree_planter") return 0x54d08a;
  if (type === "portal_builder") return 0xff9f1c;
  if (type === "kantele") return 0xc58d52;
  if (type === "rowan_charm") return 0xc73a32;
  if (type === "rune_stone") return 0x7b7f8a;
  if (type === "juniper_bundle") return 0x51764f;
  if (type === "birch_bark_letter") return 0xe4d2a0;
  if (type === "blessing_marker") return 0xb54434;
  if (type === "portal") return 0x5ad7ff;
  if (type === "door") return 0x9c6b3f;
  if (type === "training_dummy") return 0xb08968;
  return 0xf3ca40;
}

/**
 * @param {string} type
 * @returns {any}
 */
function getItemMaterial(type) {
  if (!itemMatCache[type]) {
    itemMatCache[type] = new THREE.MeshLambertMaterial({
      color: itemTypeColor(type),
    });
  }
  return itemMatCache[type];
}

// Doors render darker when shut and lighter/ajar when open, so their state is
// legible at a glance (open doors can be walked through; see door_travel).
/** @type {Record<string, any>} */
var doorMatCache = {};
/**
 * @param {boolean} isOpen
 * @returns {any}
 */
function getDoorMaterial(isOpen) {
  var key = isOpen ? "open" : "closed";
  if (!doorMatCache[key]) {
    doorMatCache[key] = new THREE.MeshLambertMaterial({
      color: isOpen ? 0xb98a5a : 0x6f4a2a,
    });
  }
  return doorMatCache[key];
}

function clearItemMeshes() {
  while (itemMeshGroup.children.length > 0) {
    var child = itemMeshGroup.children.pop();
    if (child) itemMeshGroup.remove(child);
  }
}

/**
 * Hang a door flush on the exposed ("front") wall of its house tile instead
 * of floating in the middle of the tile — its back sits on the wall, matching
 * the cosmetic house door. Returns true when the door was placed (its tile is
 * a house tile with at least one exposed wall); false lets the caller fall
 * back to centred placement (e.g. a door on open ground).
 * @param {any} mesh
 * @param {number} row
 * @param {number} col
 * @param {boolean} isOpen
 * @returns {boolean}
 */
function placeDoorOnWall(mesh, row, col, isOpen) {
  if (!hasHouseAt(row, col)) return false;
  // Same priority the house mesh uses for its cosmetic door: front (south)
  // first, then north, east, west. n = outward wall normal, t = along-wall
  // tangent, base = closed-door Y rotation.
  var walls = [
    { open: !hasHouseAt(row + 1, col), nx: 0, nz: 1, tx: 1, tz: 0, base: 0 },
    { open: !hasHouseAt(row - 1, col), nx: 0, nz: -1, tx: 1, tz: 0, base: 0 },
    {
      open: !hasHouseAt(row, col + 1),
      nx: 1,
      nz: 0,
      tx: 0,
      tz: 1,
      base: Math.PI / 2,
    },
    {
      open: !hasHouseAt(row, col - 1),
      nx: -1,
      nz: 0,
      tx: 0,
      tz: 1,
      base: Math.PI / 2,
    },
  ];
  var wall = null;
  for (var i = 0; i < walls.length; i++) {
    if (walls[i].open) {
      wall = walls[i];
      break;
    }
  }
  if (!wall) return false;
  // 0.79 places the door just proud of the house wall (walls sit at ±0.77).
  var wallOffset = 0.79;
  var px = tileX(col) + wall.nx * wallOffset;
  var pz = tileZ(row) + wall.nz * wallOffset;
  if (!isOpen) {
    mesh.position.set(px, 0.5, pz);
    mesh.rotation.y = wall.base;
    return true;
  }
  // Open: swing ~70° about the hinge at one end of the wall, choosing the
  // rotation sign that carries the free edge outward (away from the house).
  var halfW = 0.36;
  var swing = Math.PI * 0.39;
  var a = swing;
  var freeX = wall.tx * Math.cos(a) + wall.tz * Math.sin(a);
  var freeZ = -wall.tx * Math.sin(a) + wall.tz * Math.cos(a);
  if (freeX * wall.nx + freeZ * wall.nz < 0) a = -swing;
  var hingeX = px - wall.tx * halfW;
  var hingeZ = pz - wall.tz * halfW;
  var offX = wall.tx * halfW * Math.cos(a) + wall.tz * halfW * Math.sin(a);
  var offZ = -wall.tx * halfW * Math.sin(a) + wall.tz * halfW * Math.cos(a);
  mesh.position.set(hingeX + offX, 0.5, hingeZ + offZ);
  mesh.rotation.y = wall.base + a;
  return true;
}

function rebuildItemMeshes() {
  clearItemMeshes();
  clearItemHighlights();
  for (var tileKey in worldItemsByTile) {
    var parts = tileKey.split("_");
    var row = Number(parts[0]);
    var col = Number(parts[1]);
    if (!isFinite(row) || !isFinite(col)) continue;
    var arr = worldItemsByTile[tileKey];
    if (!Array.isArray(arr)) continue;
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      if (item.type === "old_oak") continue;
      var isDoor = item.type === "door";
      var doorOpen = isDoor && !!(item.state && item.state.open === true);
      var mesh = new THREE.Mesh(
        isDoor ? doorGeo : itemGeo,
        isDoor ? getDoorMaterial(doorOpen) : getItemMaterial(item.type),
      );
      if (isDoor && placeDoorOnWall(mesh, row, col, doorOpen)) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        itemMeshGroup.add(mesh);
        continue;
      }
      var ox = isDoor ? 0 : ((i % 3) - 1) * 0.2;
      var oz = isDoor ? 0 : ((Math.floor(i / 3) % 3) - 1) * 0.2;
      var oy = isDoor ? 0.5 : 0.2 + Math.floor(i / 9) * 0.16;
      mesh.position.set(tileX(col) + ox, oy, tileZ(row) + oz);
      // An open door not hung on a house wall swings ~70° ajar and shifts to
      // its hinge edge; a shut one sits flush across the tile.
      if (isDoor && doorOpen) {
        mesh.rotation.y = Math.PI * 0.39;
        mesh.position.x -= 0.28;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      itemMeshGroup.add(mesh);
      if (itemHasContextualAction(item)) {
        addItemHighlightAt(tileX(col) + ox, tileZ(row) + oz);
      }
    }
  }
}

// Boot: build the initial world. buildStaticWorldMeshes() also rebuilds floor
// overlays, terrain features, pines, houses and ground items, so it fully
// replaces the previous per-mesh boot calls. Deferred to end-of-file so
// itemMeshGroup / worldItemsByTile are already initialized.
buildStaticWorldMeshes();
