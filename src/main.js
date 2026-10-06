import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CHAIR_MODELS, loadDentalChair } from './dentalChairModel.js';
import { setupAR } from './ar.js';

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e1e24);

// Camera
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(-2.4, 1.7, 2.6); // front-left, same angle as the reference photo

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.xr.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

// Soft studio reflections so the model's PBR materials don't look flat
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.8, 0);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.2));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 8, 5);
dirLight.castShadow = true;
// Fit the shadow camera tightly around the ~2.7 m unit and bias it, otherwise surfaces
// shadow themselves and show striped "shadow acne" bands
dirLight.shadow.mapSize.set(2048, 2048);
Object.assign(dirLight.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 4, far: 18 });
dirLight.shadow.bias = -0.0005;
dirLight.shadow.normalBias = 0.02;
scene.add(dirLight);

// Floor
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x444450 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(20, 20, 0x666666, 0x333333);
scene.add(grid);

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Dental chair (public/chair3.glb); switch to CHAIR_MODELS.dentalchair1 for the older model
const loading = document.createElement('div');
loading.className = 'loading';
loading.textContent = 'Loading chair…';
document.body.append(loading);

const chair = await loadDentalChair(CHAIR_MODELS.chair3, (e) => {
  if (e.total) loading.textContent = `Loading chair… ${Math.round((e.loaded / e.total) * 100)}%`;
}).catch((err) => {
  console.error(err);
  loading.textContent = 'Could not load the chair model';
  throw err;
});
loading.remove();
scene.add(chair);

// The light (and its tight shadow camera) follow the chair when AR moves it around the room
chair.add(dirLight);
dirLight.target = chair;

// Colour button (bottom-left): cycles the upholstery colour of the chair and the stool
const UPHOLSTERY_COLORS = [
  { name: 'Blue', hex: null }, // the model's own shades
  { name: 'Sky Blue', hex: 0x5aa9e6 },
  { name: 'Navy Blue', hex: 0x14215e },
  { name: 'Cyan', hex: 0x16b3c4 },
  { name: 'Teal', hex: 0x0f6e6e },
  { name: 'Green', hex: 0x0e5a2c },
  { name: 'Mint Green', hex: 0x7fd1ae },
  { name: 'Yellow', hex: 0xe8c31a },
  { name: 'Golden', hex: 0xc9971c },
  { name: 'Orange', hex: 0xb4500a },
  { name: 'Red', hex: 0x7a0f14 },
  { name: 'Coral', hex: 0xe5664f },
  { name: 'Pink', hex: 0xe88aaa },
  { name: 'Magenta', hex: 0xb3166e },
  { name: 'Purple', hex: 0x4a1470 },
  { name: 'Violet', hex: 0x6b3fc0 },
  { name: 'Lavender', hex: 0xb39ddb },
  { name: 'Brown', hex: 0x5a3420 },
  { name: 'Black', hex: 0x141416 },
  { name: 'White', hex: 0xeeeeea },
  { name: 'Grey', hex: 0x77797d },
];
const upholsteryMaterials = chair.userData.upholsteryMaterials ?? [];
if (upholsteryMaterials.length) {
  let colorIndex = 0;
  const colorButton = document.createElement('button');
  colorButton.className = 'color-button';
  const showColor = () => {
    const { name, hex } = UPHOLSTERY_COLORS[colorIndex];
    const swatch = hex === null ? upholsteryMaterials[0].userData.originalColor : new THREE.Color(hex);
    colorButton.textContent = name;
    colorButton.style.setProperty('--swatch', `#${swatch.getHexString()}`);
  };
  colorButton.addEventListener('click', () => {
    colorIndex = (colorIndex + 1) % UPHOLSTERY_COLORS.length;
    const { hex } = UPHOLSTERY_COLORS[colorIndex];
    upholsteryMaterials.forEach((m) => m.color.copy(hex === null ? m.userData.originalColor : new THREE.Color(hex)));
    showColor();
  });
  showColor();
  document.body.append(colorButton);
}

// AR button (top-left); floor and grid are hidden while in AR
const ar = setupAR({ renderer, scene, controls, chair, sceneDecor: [floor, grid] });

// Loop
renderer.setAnimationLoop((time, frame) => {
  ar.update(frame);
  controls.update();
  renderer.render(scene, camera);
});
