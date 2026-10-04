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

// AR button (top-left); floor and grid are hidden while in AR
const ar = setupAR({ renderer, scene, controls, chair, sceneDecor: [floor, grid] });

// Loop
renderer.setAnimationLoop((time, frame) => {
  ar.update(frame);
  controls.update();
  renderer.render(scene, camera);
});
