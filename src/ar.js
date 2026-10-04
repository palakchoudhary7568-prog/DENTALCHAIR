import * as THREE from 'three';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';

/**
 * Adds a "View in AR" button that uses the best AR available on the device:
 *  - 'webxr'     Android Chrome (ARCore): live surface detection, tap to place.
 *  - 'quicklook' iOS Safari: Apple AR Quick Look with a USDZ export of the chair.
 *  - 'camera'    Anything else with a camera: chair overlaid on the camera feed (no tracking).
 * Returns update(frame), which must be called from the render loop.
 */
export function setupAR({ renderer, scene, controls, chair, sceneDecor }) {
  const ui = buildUI();
  let mode = null;

  // Shadow under the chair so it sits on the real floor
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 5),
    new THREE.ShadowMaterial({ opacity: 0.3 })
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = 0.001;
  shadowCatcher.receiveShadow = true;

  // --- Shared enter / exit of the AR look ---
  let savedBackground = null;

  function enterARLook() {
    savedBackground = scene.background;
    scene.background = null;
    sceneDecor.forEach((o) => (o.visible = false));
    chair.add(shadowCatcher);
    ui.button.hidden = true;
    ui.overlay.hidden = false;
  }

  function exitARLook() {
    scene.background = savedBackground;
    sceneDecor.forEach((o) => (o.visible = true));
    chair.remove(shadowCatcher);
    chair.position.set(0, 0, 0);
    chair.rotation.set(0, 0, 0);
    chair.visible = true;
    controls.enabled = true;
    ui.button.hidden = false;
    ui.overlay.hidden = true;
  }

  // --- WebXR (Android) ---
  // Hit tests are only used to learn the floor height. Placement is a ray from the
  // camera (or the tapped point) onto that floor plane, so the chair can go anywhere
  // on the floor, not just where the phone recognised a clear flat surface.
  let hitTestSource = null;
  let detectedFloorY = null; // lowest upward-facing surface seen so far
  let assumedFloorY = 0; // used until a real floor is detected

  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Ray();
  const MAX_PLACE_DISTANCE = 8;

  function floorY() {
    return detectedFloorY ?? assumedFloorY;
  }

  // Intersect a ray from a matrixWorld's origin along its -z axis with the floor
  function aimAtFloor(matrixWorld, out) {
    ray.origin.setFromMatrixPosition(matrixWorld);
    ray.direction.set(0, 0, -1).transformDirection(matrixWorld);
    floorPlane.constant = -floorY();
    const hit = ray.intersectPlane(floorPlane, out);
    return hit && hit.distanceTo(ray.origin) < MAX_PLACE_DISTANCE ? hit : null;
  }

  const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.15, 32).rotateX(-Math.PI / 2),
    reticleMaterial
  );
  reticle.visible = false;
  scene.add(reticle);

  const target = new THREE.Vector3();
  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', () => {
    // Use the tapped screen point when available, otherwise the screen centre
    const aim = controller.visible ? controller.matrixWorld : renderer.xr.getCamera().matrixWorld;
    if (!aimAtFloor(aim, target)) return;

    chair.position.copy(target);
    // Turn the chair's front (+z) toward the user
    const cam = new THREE.Vector3().setFromMatrixPosition(renderer.xr.getCamera().matrixWorld);
    chair.rotation.y = Math.atan2(cam.x - chair.position.x, cam.z - chair.position.z);
    chair.visible = true;
    ui.setHint('Tap anywhere on the floor to move the chair');
  });
  scene.add(controller);

  async function startWebXR() {
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor'],
      domOverlay: { root: ui.overlay },
    });
    enterARLook();
    chair.visible = false;
    controls.enabled = false;
    detectedFloorY = null;

    // 'local-floor' puts the floor at y = 0; otherwise guess it's 1.4 m below the phone
    let spaceType = 'local-floor';
    try {
      await session.requestReferenceSpace('local-floor');
    } catch {
      spaceType = 'local';
    }
    assumedFloorY = spaceType === 'local-floor' ? 0 : -1.4;
    renderer.xr.setReferenceSpaceType(spaceType);
    await renderer.xr.setSession(session);

    // Include feature points so textured / cluttered floors are detected too
    const viewerSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session
      .requestHitTestSource({ space: viewerSpace, entityTypes: ['plane', 'point'] })
      .catch(() => session.requestHitTestSource({ space: viewerSpace }));

    session.addEventListener('end', () => {
      hitTestSource = null;
      reticle.visible = false;
      exitARLook();
    });
    ui.setHint('Point at the floor and tap where you want the chair');
  }

  const hitUp = new THREE.Vector3();
  const hitQuat = new THREE.Quaternion();

  function updateFloorEstimate(frame) {
    const refSpace = renderer.xr.getReferenceSpace();
    const camY = renderer.xr.getCamera().matrixWorld.elements[13];
    for (const result of frame.getHitTestResults(hitTestSource)) {
      const { position, orientation } = result.getPose(refSpace).transform;
      hitQuat.set(orientation.x, orientation.y, orientation.z, orientation.w);
      hitUp.set(0, 1, 0).applyQuaternion(hitQuat);
      // Upward-facing surfaces well below the phone; the lowest one is the floor
      if (hitUp.y > 0.9 && position.y < camY - 0.5) {
        detectedFloorY = Math.min(detectedFloorY ?? Infinity, position.y);
      }
    }
  }

  // --- AR Quick Look (iOS) ---
  let usdzUrl = null;

  async function prepareQuickLook() {
    chair.updateMatrixWorld(true);
    const data = await new USDZExporter().parseAsync(chair, { quickLookCompatible: true });
    usdzUrl = URL.createObjectURL(new Blob([data], { type: 'model/vnd.usdz+zip' }));
  }

  function openQuickLook() {
    // Quick Look requires an <a rel="ar"> whose only child is an image
    const a = document.createElement('a');
    a.rel = 'ar';
    a.href = `${usdzUrl}#allowsContentScaling=0`;
    a.appendChild(document.createElement('img'));
    a.click();
  }

  // --- Camera overlay fallback ---
  let stream = null;

  async function startCamera() {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    ui.video.srcObject = stream;
    ui.video.hidden = false;
    await ui.video.play();
    enterARLook();
    ui.setHint('Preview mode (this phone has no AR tracking). Drag to rotate, pinch to resize.');
  }

  function stopCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    ui.video.srcObject = null;
    ui.video.hidden = true;
    exitARLook();
  }

  // --- Wiring ---
  ui.exit.addEventListener('click', () => {
    if (renderer.xr.isPresenting) renderer.xr.getSession().end();
    else stopCamera();
  });

  ui.button.addEventListener('click', async () => {
    try {
      if (mode === 'webxr') await startWebXR();
      else if (mode === 'quicklook') openQuickLook();
      else if (mode === 'camera') await startCamera();
    } catch (err) {
      console.error(err);
      ui.setStatus(`Could not start AR: ${err.message}`);
    }
  });

  detectMode().then(async (m) => {
    mode = m;
    if (!mode) {
      ui.setStatus(window.isSecureContext ? 'AR is not supported on this device' : 'AR needs HTTPS');
      return;
    }
    if (mode === 'quicklook') {
      ui.button.textContent = 'Preparing AR…';
      await prepareQuickLook();
    }
    ui.button.textContent = mode === 'camera' ? 'View on camera' : 'View in AR';
    ui.button.disabled = false;
  });

  return {
    update(frame) {
      if (!frame || !hitTestSource) return;
      updateFloorEstimate(frame);
      // Reticle shows where a centre tap would land; yellow until the real floor is found
      reticle.visible = !!aimAtFloor(renderer.xr.getCamera().matrixWorld, reticle.position);
      reticleMaterial.color.set(detectedFloorY === null ? 0xffd54f : 0xffffff);
    },
  };
}

async function detectMode() {
  if (navigator.xr) {
    try {
      if (await navigator.xr.isSessionSupported('immersive-ar')) return 'webxr';
    } catch {
      // fall through to the other modes
    }
  }
  if (document.createElement('a').relList?.supports?.('ar')) return 'quicklook';
  if (navigator.mediaDevices?.getUserMedia) return 'camera';
  return null;
}

function buildUI() {
  const button = document.createElement('button');
  button.className = 'ar-button';
  button.textContent = 'Checking AR…';
  button.disabled = true;

  const status = document.createElement('div');
  status.className = 'ar-status';

  const overlay = document.createElement('div');
  overlay.className = 'ar-overlay';
  overlay.hidden = true;

  const exit = document.createElement('button');
  exit.className = 'ar-exit';
  exit.textContent = '✕ Exit AR';

  const hint = document.createElement('div');
  hint.className = 'ar-hint';

  overlay.append(exit, hint);

  // Taps on overlay controls must not also place the chair in WebXR
  exit.addEventListener('beforexrselect', (e) => e.preventDefault());

  const video = document.createElement('video');
  video.className = 'ar-video';
  video.playsInline = true;
  video.muted = true;
  video.hidden = true;

  document.body.prepend(video);
  document.body.append(button, status, overlay);

  return {
    button,
    overlay,
    exit,
    video,
    setHint: (text) => (hint.textContent = text),
    setStatus: (text) => (status.textContent = text),
  };
}
