import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TARGET_HEIGHT = 2.0; // meters to the top of the lamp arm, same as the procedural chair

// Finish per GLB material name for dentalchair1.glb, matched to the reference photo: blue
// leather upholstery, glossy white plastic body, grey armrests, dark control panel, orange +
// white lamp LEDs. Its materials were exported as fully metallic white, hence metalness 0.
const WHITE_PLASTIC = { color: 0xf3f4f5, roughness: 0.3 };
const CHAIR1_FINISHES = {
  'Material.001': { color: 0x3152b4, roughness: 0.55 }, // seat, backrest, headrest, stool cushions
  'Material.002': { color: 0x2c4aa8, roughness: 0.55 }, // headrest / lumbar pillows
  'chair handle': { color: 0x8e939b, roughness: 0.35, metalness: 0.3 }, // armrests
  'chair bottom': WHITE_PLASTIC, // chair base, lamp pole and arms, tray arm
  'Material.011': WHITE_PLASTIC, // instrument tray body
  Housing_ABS_Plastic: WHITE_PLASTIC, // spittoon cabinet
  Console_Panel_Plastic: WHITE_PLASTIC,
  'Material.007': WHITE_PLASTIC, // handpiece holder
  Ceramic_Bowl_Gloss: { color: 0xfafafa, roughness: 0.12 }, // spittoon bowl, lamp housing, foot pedal
  '': { color: 0xdfe1e4, roughness: 0.4 }, // lamp neck, water tubes
  Dark_Trim_Plastic: { color: 0x3a3d43, roughness: 0.35 }, // cabinet top, spittoon trim
  'Material.009': { color: 0xd3d6da, roughness: 0.5 }, // tray top mat
  'Material.010': { color: 0x2a2e35, roughness: 0.3 }, // control panel
  'Material.005': { color: 0x1c2533, roughness: 0.2, emissive: 0x1d3f8f, emissiveIntensity: 0.6 }, // panel screen
  'Material.017': { color: 0x1c2533, roughness: 0.2, emissive: 0x274a9c, emissiveIntensity: 0.6 }, // panel screen
  'Material.006': { color: 0x9a9ea5, roughness: 0.4 }, // small fittings
  wire: { color: 0x9a9da3, roughness: 0.45 }, // handpiece hoses
  'Material.004': { color: 0x2b2d31, roughness: 0.5 }, // stool base
  'Material.015': { color: 0x1b1e24, roughness: 0.4 }, // lamp face
  'Material.008': { color: 0x000000, emissive: 0xff9a1f, emissiveIntensity: 1.5 }, // orange lamp LEDs
  'Material.014': { color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1.5 }, // white lamp LEDs
};

// chair3.glb lamp head, matched to the reference photo: glowing orange centre LEDs,
// bright white corner LEDs, dark strip across the face
const CHAIR3_FINISHES = {
  'Material.008': { color: 0xff7a00, emissive: 0xff5a00, emissiveIntensity: 1.1, roughness: 0.2 }, // centre LEDs
  'Material.014': { color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 1.6, roughness: 0.2 }, // corner LEDs
  'Material.015': { color: 0x22252b, roughness: 0.3 }, // face strip
  // Royal-blue leatherette upholstery, as in the photo (the file's own is dark navy-purple and matte)
  chair: { color: 0x3f5fc0, roughness: 0.6 }, // stool backrest
  chair2: { color: 0x3f5fc0, roughness: 0.6 }, // chair cushions, stool seat
  pillow: { color: 0x3a58b8, roughness: 0.6 }, // head and lumbar pillows
};

/**
 * The GLBs are whole Blender scenes, so each entry says which part is the dental unit:
 * meshes whose centre lies inside `unitBox` (model units), minus `excludeBoxes`, and no
 * larger than `maxPartSize`. Both models have the headrest toward +z, hence `turn`.
 */
export const CHAIR_MODELS = {
  dentalchair1: {
    url: '/dentalchair1.glb',
    unitBox: new THREE.Box3(new THREE.Vector3(-4, -2, -16), new THREE.Vector3(18, 18, 8)),
    maxPartSize: 20, // the room's floor and walls are bigger than this
    turn: Math.PI,
    finishes: CHAIR1_FINISHES,
  },
  chair3: {
    url: '/chair3.glb',
    unitBox: new THREE.Box3(new THREE.Vector3(-30, -2, -40), new THREE.Vector3(50, 60, 40)),
    excludeBoxes: [new THREE.Box3(new THREE.Vector3(32, 0, -33), new THREE.Vector3(35, 2, -20))], // stray bits
    turn: Math.PI,
    // Already finished in the file (blue upholstery, white body) apart from the lamp LEDs
    finishes: CHAIR3_FINISHES,
    // Cushions of the patient chair (x ≈ 9) and the stool (x ≈ 25); the lamp's dark-blue strip is left out
    upholstery: {
      materials: ['chair', 'chair2', 'pillow'],
      box: new THREE.Box3(new THREE.Vector3(0, 0, -15), new THREE.Vector3(35, 20, 30)),
    },
  },
};

function applyFinish(material, finishes) {
  const finish = finishes?.[material.name];
  if (!finish) return;
  const { color, emissive, ...rest } = finish;
  material.color.set(color);
  if (emissive !== undefined) material.emissive.set(emissive);
  Object.assign(material, { metalness: 0, ...rest });
}

// Bakes a mesh's world transform into an indexed copy of its geometry
function bakeGeometry(mesh) {
  const geometry = mesh.geometry.clone();
  if (!geometry.index) {
    const count = geometry.attributes.position.count;
    geometry.setIndex(Array.from({ length: count }, (_, i) => i));
  }
  geometry.applyMatrix4(mesh.matrixWorld);
  // A mirrored transform flips the triangle winding; swap it back so faces aren't culled
  if (mesh.matrixWorld.determinant() < 0) {
    const index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  }
  return geometry;
}

function attributeSignature(geometry) {
  return Object.entries(geometry.attributes)
    .map(([name, a]) => `${name}:${a.itemSize}:${a.array.constructor.name}:${a.normalized}`)
    .sort()
    .join('|');
}

/**
 * Merges meshes that share a material (and vertex layout) into one mesh each.
 * The GLBs hold thousands of tiny parts; one draw call per part is far too slow on phones.
 */
function mergeByMaterial(meshes) {
  const groups = new Map();
  for (const mesh of meshes) {
    const geometry = bakeGeometry(mesh);
    const key = `${mesh.material.uuid}#${attributeSignature(geometry)}`;
    if (!groups.has(key)) groups.set(key, { material: mesh.material, geometries: [] });
    groups.get(key).geometries.push(geometry);
  }

  const merged = [];
  for (const { material, geometries } of groups.values()) {
    const geometry = geometries.length > 1 ? mergeGeometries(geometries) : geometries[0];
    if (geometry) {
      merged.push(new THREE.Mesh(geometry, material));
    } else {
      // Incompatible layouts: keep the parts separate rather than drop them
      geometries.forEach((g) => merged.push(new THREE.Mesh(g, material)));
    }
    if (geometries.length > 1) geometries.forEach((g) => g !== geometry && g.dispose());
  }
  return merged;
}

/**
 * Loads a dental unit and normalises it like the procedural chair:
 * real-world meters, standing on y = 0, centred on the origin, patient's feet toward +z.
 */
export async function loadDentalChair(config, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(config.url, onProgress);
  const source = gltf.scene;
  source.updateMatrixWorld(true);

  const maxPartSize = config.maxPartSize ?? Infinity;
  const partBox = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const kept = [];

  source.traverse((obj) => {
    if (!obj.isMesh) return;
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    partBox.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
    partBox.getSize(size);
    partBox.getCenter(center);

    const inUnit = config.unitBox.containsPoint(center) && !config.excludeBoxes?.some((b) => b.containsPoint(center));
    if (inUnit && Math.max(size.x, size.y, size.z) < maxPartSize) kept.push(obj);
  });

  new Set(kept.map((m) => m.material)).forEach((material) => applyFinish(material, config.finishes));

  // The chair's upholstery gets its own identical material copies, so recolouring it
  // can't affect other parts that share the source material (e.g. the stool)
  const upholstery = new Map();
  for (const mesh of config.upholstery ? kept : []) {
    if (!config.upholstery.materials.includes(mesh.material.name)) continue;
    partBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    if (!config.upholstery.box.containsPoint(partBox.getCenter(center))) continue;
    if (!upholstery.has(mesh.material)) {
      const copy = mesh.material.clone();
      copy.userData.originalColor = copy.color.clone();
      upholstery.set(mesh.material, copy);
    }
    mesh.material = upholstery.get(mesh.material);
  }

  const model = new THREE.Group();
  for (const mesh of mergeByMaterial(kept)) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    model.add(mesh);
  }
  source.traverse((obj) => obj.isMesh && obj.geometry.dispose());

  // Scale to real size and stand the unit on the floor, centred on the origin
  const unitBox = new THREE.Box3().setFromObject(model);
  const scale = TARGET_HEIGHT / unitBox.getSize(size).y;
  unitBox.getCenter(center);
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -unitBox.min.y * scale, -center.z * scale);

  // Turn it so the feet face +z like the procedural chair. The outer group stays
  // un-rotated so AR placement can set its position / rotation freely.
  const turn = new THREE.Group();
  turn.rotation.y = config.turn ?? 0;
  turn.add(model);

  const chair = new THREE.Group();
  chair.name = 'DentalChair';
  chair.userData.upholsteryMaterials = [...upholstery.values()];
  chair.add(turn);
  return chair;
}
