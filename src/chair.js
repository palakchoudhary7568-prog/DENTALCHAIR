import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Materials
const upholstery = new THREE.MeshStandardMaterial({ color: 0x2bb3a3, roughness: 0.6 });
const frame = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35 });
const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.8, roughness: 0.3 });
const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7 });

function roundedBox(w, h, d, radius, material) {
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, radius), material);
}

// Cylinder spanning two points
function rod(a, b, radius, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 16), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/**
 * Builds a dental chair. Units are meters; the patient's feet point toward +z.
 * Returns the group plus the pivots so recline / leg angle can be animated.
 */
export function createDentalChair() {
  const chair = new THREE.Group();

  // --- Base & hydraulic column ---
  const base = roundedBox(0.6, 0.08, 0.9, 0.03, frame);
  base.position.set(0, 0.04, 0.05);
  chair.add(base);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.38, 32), metal);
  column.position.y = 0.27;
  chair.add(column);

  const columnCover = roundedBox(0.3, 0.06, 0.3, 0.02, frame);
  column.add(columnCover);
  columnCover.position.y = 0.19;

  // --- Seat ---
  const seat = new THREE.Group();
  seat.position.y = 0.52;
  chair.add(seat);

  const seatFrame = roundedBox(0.5, 0.05, 0.5, 0.02, frame);
  seat.add(seatFrame);

  const seatCushion = roundedBox(0.58, 0.1, 0.55, 0.045, upholstery);
  seatCushion.position.y = 0.07;
  seat.add(seatCushion);

  // Armrests
  for (const side of [-1, 1]) {
    const x = side * 0.34;
    seat.add(rod(new THREE.Vector3(side * 0.24, 0.02, -0.12), new THREE.Vector3(x, 0.24, -0.08), 0.015, metal));
    seat.add(rod(new THREE.Vector3(side * 0.24, 0.02, 0.12), new THREE.Vector3(x, 0.24, 0.12), 0.015, metal));
    const armrest = roundedBox(0.07, 0.05, 0.42, 0.024, upholstery);
    armrest.position.set(x, 0.26, 0.02);
    seat.add(armrest);
  }

  // --- Leg rest (pivots at the front of the seat) ---
  const legPivot = new THREE.Group();
  legPivot.position.set(0, 0.07, 0.275);
  legPivot.rotation.x = 0.35; // tilt down toward the floor
  seat.add(legPivot);

  const legRest = roundedBox(0.52, 0.1, 0.72, 0.045, upholstery);
  legRest.position.z = 0.36;
  legPivot.add(legRest);

  const footPlate = roundedBox(0.42, 0.14, 0.03, 0.012, frame);
  footPlate.position.set(0, 0.03, 0.74);
  legPivot.add(footPlate);

  // --- Backrest (pivots at the back of the seat) ---
  const backPivot = new THREE.Group();
  backPivot.position.set(0, 0.07, -0.275);
  backPivot.rotation.x = 1.0; // recline angle (radians up from horizontal)
  seat.add(backPivot);

  const backShell = roundedBox(0.5, 0.06, 0.74, 0.025, frame);
  backShell.position.set(0, -0.05, -0.37);
  backPivot.add(backShell);

  const backCushion = roundedBox(0.56, 0.1, 0.76, 0.045, upholstery);
  backCushion.position.z = -0.38;
  backPivot.add(backCushion);

  // Headrest on a short neck
  const headPivot = new THREE.Group();
  headPivot.position.z = -0.76;
  backPivot.add(headPivot);

  headPivot.add(rod(new THREE.Vector3(0, -0.04, 0), new THREE.Vector3(0, -0.04, -0.12), 0.025, metal));

  const headrest = roundedBox(0.28, 0.09, 0.22, 0.04, upholstery);
  headrest.position.set(0, 0, -0.2);
  headPivot.add(headrest);

  // --- Side unit with spittoon ---
  const sideUnit = new THREE.Group();
  sideUnit.position.set(-0.6, 0, -0.15);
  chair.add(sideUnit);

  const sideBody = roundedBox(0.22, 0.85, 0.22, 0.04, frame);
  sideBody.position.y = 0.425;
  sideUnit.add(sideBody);

  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.07, 0.1, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe8f4f8, roughness: 0.15, side: THREE.DoubleSide })
  );
  bowl.position.set(0.04, 0.9, 0.04);
  sideUnit.add(bowl);

  const spout = rod(new THREE.Vector3(-0.06, 0.85, -0.06), new THREE.Vector3(-0.06, 1.02, -0.06), 0.012, metal);
  sideUnit.add(spout);
  sideUnit.add(rod(new THREE.Vector3(-0.06, 1.02, -0.06), new THREE.Vector3(0.03, 1.0, 0.03), 0.012, metal));

  // --- Dental lamp ---
  const lampPoleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.04, 32), dark);
  lampPoleBase.position.set(-0.7, 0.02, -0.85);
  chair.add(lampPoleBase);

  const poleTop = new THREE.Vector3(-0.7, 1.95, -0.85);
  const elbow = new THREE.Vector3(-0.25, 1.95, -0.55);
  const headPos = new THREE.Vector3(0, 1.7, -0.25);
  chair.add(rod(new THREE.Vector3(-0.7, 0.04, -0.85), poleTop, 0.03, metal));
  chair.add(rod(poleTop, elbow, 0.022, frame));
  chair.add(rod(elbow, headPos, 0.02, frame));

  // Aim the lamp head at the patient's mouth
  const mouth = new THREE.Vector3(0, 1.25, -0.82);
  const lampHead = new THREE.Group();
  lampHead.position.copy(headPos);
  lampHead.lookAt(mouth);
  chair.add(lampHead);

  lampHead.add(roundedBox(0.32, 0.12, 0.1, 0.04, frame));
  const lens = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 2 })
  );
  lens.position.z = 0.051;
  lampHead.add(lens);

  const spot = new THREE.SpotLight(0xfff6e0, 8, 3, Math.PI / 7, 0.4);
  spot.position.copy(headPos);
  spot.target.position.copy(mouth);
  spot.castShadow = true;
  chair.add(spot, spot.target);

  chair.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return { chair, backPivot, legPivot, headPivot, seat };
}
