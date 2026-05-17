/// <reference path="../../../../types/virtual-world-browser-globals.d.ts" />

/**
 * @param {{ rows: number, cols: number, tile: number, targetX: number, targetZ: number }} config
 * @returns {any}
 */
function initializeRenderScene(config) {
  var app = getVirtualWorldApp();
  var renderState = app.render;
  if (renderState.renderer && renderState.scene && renderState.camera) {
    return renderState;
  }

  renderState.renderer = new THREE.WebGLRenderer({ antialias: true });
  renderState.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderState.renderer.setSize(window.innerWidth, window.innerHeight);
  renderState.renderer.shadowMap.enabled = true;
  renderState.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderState.renderer.domElement);

  renderState.scene = new THREE.Scene();
  renderState.scene.background = new THREE.Color(0x87ceeb);
  renderState.scene.fog = new THREE.FogExp2(0x87ceeb, 0.018);

  renderState.mapCX = (config.cols * config.tile) / 2;
  renderState.mapCZ = (config.rows * config.tile) / 2;
  renderState.camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.1,
    300,
  );
  renderState.orbit = {
    radius: 50,
    theta: Math.PI / 4,
    phi: 0.67,
  };
  renderState.updateCamera =
    /** @param {number} avatarX @param {number} avatarZ */ function (
      avatarX,
      avatarZ,
    ) {
      renderState.camera.position.set(
        avatarX +
          renderState.orbit.radius *
            Math.cos(renderState.orbit.phi) *
            Math.sin(renderState.orbit.theta),
        renderState.orbit.radius * Math.sin(renderState.orbit.phi),
        avatarZ +
          renderState.orbit.radius *
            Math.cos(renderState.orbit.phi) *
            Math.cos(renderState.orbit.theta),
      );
      renderState.camera.lookAt(avatarX, 0, avatarZ);
    };
  renderState.handleResize = function () {
    renderState.camera.aspect = window.innerWidth / window.innerHeight;
    renderState.camera.updateProjectionMatrix();
    renderState.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  renderState.camera.position.set(
    config.targetX +
      renderState.orbit.radius *
        Math.cos(renderState.orbit.phi) *
        Math.sin(renderState.orbit.theta),
    renderState.orbit.radius * Math.sin(renderState.orbit.phi),
    config.targetZ +
      renderState.orbit.radius *
        Math.cos(renderState.orbit.phi) *
        Math.cos(renderState.orbit.theta),
  );
  renderState.camera.lookAt(config.targetX, 0, config.targetZ);

  renderState.ambient = new THREE.AmbientLight(0xfff8e7, 0.55);
  renderState.scene.add(renderState.ambient);

  renderState.sun = new THREE.DirectionalLight(0xffe8c0, 1.0);
  renderState.sun.position.set(-12, 22, -8);
  renderState.sun.castShadow = true;
  renderState.sun.shadow.mapSize.width = 2048;
  renderState.sun.shadow.mapSize.height = 2048;
  renderState.sun.shadow.camera.near = 0.5;
  renderState.sun.shadow.camera.far = 120;
  renderState.sun.shadow.camera.left = -50;
  renderState.sun.shadow.camera.right = 50;
  renderState.sun.shadow.camera.top = 50;
  renderState.sun.shadow.camera.bottom = -50;
  renderState.sun.shadow.bias = -0.0005;
  renderState.scene.add(renderState.sun);
  renderState.scene.add(renderState.sun.target);

  renderState.fill = new THREE.DirectionalLight(0xc8e8ff, 0.3);
  renderState.fill.position.set(14, 10, 14);
  renderState.scene.add(renderState.fill);
  renderState.scene.add(renderState.fill.target);

  renderState.bgGeo = new THREE.PlaneGeometry(800, 800);
  renderState.bgMat = new THREE.MeshLambertMaterial({ color: 0x4a7028 });
  renderState.bgPlane = new THREE.Mesh(renderState.bgGeo, renderState.bgMat);
  renderState.bgPlane.rotation.x = -Math.PI / 2;
  renderState.bgPlane.position.set(renderState.mapCX, -0.26, renderState.mapCZ);
  renderState.bgPlane.receiveShadow = true;
  renderState.scene.add(renderState.bgPlane);

  return renderState;
}
