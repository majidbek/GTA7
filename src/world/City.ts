import * as THREE from 'three';
import { AABB, aabbFromBox } from '../game/Collision';

export interface CityData {
  group: THREE.Group;
  colliders: AABB[];
  sidewalks: AABB[];
  roadWaypoints: THREE.Vector3[];
  pedestrianPaths: THREE.Vector3[][];
  spawnPoint: THREE.Vector3;
  parkedSpots: { position: THREE.Vector3; rotation: number }[];
  missionCarSpot: { position: THREE.Vector3; rotation: number };
  deliverySpot: THREE.Vector3;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
}

const BUILDING_COLORS = [0x4a5568, 0x5a6a7a, 0x3d4a5c, 0x6b5b4f, 0x556b5a, 0x5c4a5c];
const ROAD = 0x2a2a32;
const SIDEWALK = 0x6a6a72;
const GRASS = 0x3a5a3a;

function makeBuilding(
  w: number,
  h: number,
  d: number,
  color: number
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Window strips
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x88aacc,
    emissive: 0x223344,
    roughness: 0.4,
  });
  const floors = Math.max(1, Math.floor(h / 3));
  for (let f = 0; f < floors; f++) {
    const y = -h / 2 + 1.5 + f * 3;
    for (const side of [
      { sx: w / 2 + 0.02, sz: 0, rw: 0.05, rd: d * 0.7 },
      { sx: -w / 2 - 0.02, sz: 0, rw: 0.05, rd: d * 0.7 },
      { sx: 0, sz: d / 2 + 0.02, rw: w * 0.7, rd: 0.05 },
      { sx: 0, sz: -d / 2 - 0.02, rw: w * 0.7, rd: 0.05 },
    ]) {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(side.rw, 1.2, side.rd),
        winMat
      );
      win.position.set(side.sx, y, side.sz);
      mesh.add(win);
    }
  }
  return mesh;
}

function makeLamp(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 5, 6),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  pole.position.y = 2.5;
  pole.castShadow = true;
  g.add(pole);
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0xffffaa,
      emissive: 0xffaa44,
      emissiveIntensity: 0.8,
    })
  );
  light.position.y = 5.1;
  g.add(light);
  g.position.set(x, 0, z);
  return g;
}

function makeTree(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.25, 1.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a3020 })
  );
  trunk.position.y = 0.75;
  trunk.castShadow = true;
  g.add(trunk);
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 2.5, 7),
    new THREE.MeshStandardMaterial({ color: 0x2d6a3a, flatShading: true })
  );
  leaves.position.y = 2.5;
  leaves.castShadow = true;
  g.add(leaves);
  g.position.set(x, 0, z);
  return g;
}

function makeBench(x: number, z: number, rot: number): THREE.Group {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.15, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x6b4423 })
  );
  seat.position.y = 0.45;
  g.add(seat);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.5, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x6b4423 })
  );
  back.position.set(0, 0.75, -0.2);
  g.add(back);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return g;
}

export function buildCity(scene: THREE.Scene): CityData {
  const group = new THREE.Group();
  const colliders: AABB[] = [];
  const sidewalks: AABB[] = [];

  // Sky
  scene.background = new THREE.Color(0x87b8e0);
  scene.fog = new THREE.Fog(0x87b8e0, 80, 180);

  // Lighting
  const hemi = new THREE.HemisphereLight(0xb8d4ff, 0x445533, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff5e0, 1.1);
  sun.position.set(40, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 150;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0x404050, 0.35);
  scene.add(ambient);

  // Ground / grass
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: GRASS, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // City grid: 3x3 blocks, roads between
  // Block centers at roughly ±18, roads ~8m wide
  const blockSize = 22;
  const roadW = 10;
  const halfCity = blockSize * 1.5 + roadW;

  // Main roads (cross pattern + outer)
  const roadMat = new THREE.MeshStandardMaterial({ color: ROAD, roughness: 0.95 });
  const sideMat = new THREE.MeshStandardMaterial({ color: SIDEWALK, roughness: 0.9 });

  function addRoad(x: number, z: number, w: number, d: number) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    // Center line
    if (w > d) {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.9, 0.15),
        new THREE.MeshStandardMaterial({ color: 0xcccc66 })
      );
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.03, z);
      group.add(line);
    } else {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, d * 0.9),
        new THREE.MeshStandardMaterial({ color: 0xcccc66 })
      );
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.03, z);
      group.add(line);
    }
  }

  function addSidewalk(x: number, z: number, w: number, d: number) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), sideMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.04, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    sidewalks.push(aabbFromBox(x, z, w, d, 0, 0.5));
  }

  // Horizontal roads (along X)
  for (const z of [-blockSize - roadW / 2, 0, blockSize + roadW / 2]) {
    addRoad(0, z, halfCity * 2 + 20, roadW);
  }
  // Vertical roads (along Z)
  for (const x of [-blockSize - roadW / 2, 0, blockSize + roadW / 2]) {
    addRoad(x, 0, roadW, halfCity * 2 + 20);
  }

  // Building blocks in the 4 quadrants + corners pattern (8 blocks around center)
  const blockCenters: [number, number][] = [
    [-blockSize - roadW / 2 - blockSize / 2, -blockSize - roadW / 2 - blockSize / 2],
    [blockSize + roadW / 2 + blockSize / 2, -blockSize - roadW / 2 - blockSize / 2],
    [-blockSize - roadW / 2 - blockSize / 2, blockSize + roadW / 2 + blockSize / 2],
    [blockSize + roadW / 2 + blockSize / 2, blockSize + roadW / 2 + blockSize / 2],
    [-blockSize - roadW / 2 - blockSize / 2, 0],
    [blockSize + roadW / 2 + blockSize / 2, 0],
    [0, -blockSize - roadW / 2 - blockSize / 2],
    [0, blockSize + roadW / 2 + blockSize / 2],
  ];

  let colorIdx = 0;
  for (const [bx, bz] of blockCenters) {
    // Sidewalk ring around block
    const pad = blockSize / 2 + 1.5;
    addSidewalk(bx, bz, blockSize + 3, blockSize + 3);

    // 2–4 buildings per block
    const layouts = [
      { ox: -5, oz: -5, w: 8, d: 8, h: 12 + (colorIdx % 3) * 4 },
      { ox: 5, oz: -4, w: 7, d: 6, h: 8 + (colorIdx % 4) * 3 },
      { ox: -4, oz: 5, w: 6, d: 7, h: 10 + (colorIdx % 2) * 5 },
      { ox: 5, oz: 5, w: 7, d: 7, h: 6 + (colorIdx % 5) * 2 },
    ];
    const count = 2 + (colorIdx % 3);
    for (let i = 0; i < count; i++) {
      const L = layouts[i];
      const color = BUILDING_COLORS[colorIdx % BUILDING_COLORS.length];
      colorIdx++;
      const b = makeBuilding(L.w, L.h, L.d, color);
      b.position.set(bx + L.ox, L.h / 2, bz + L.oz);
      group.add(b);
      colliders.push(aabbFromBox(bx + L.ox, bz + L.oz, L.w, L.d, 0, L.h));
    }

    // Props
    group.add(makeTree(bx - 9, bz - 9));
    group.add(makeTree(bx + 9, bz + 8));
    group.add(makeLamp(bx - pad + 0.5, bz));
    group.add(makeLamp(bx + pad - 0.5, bz));
    group.add(makeBench(bx, bz - pad + 1, 0));
  }

  // Invisible walls at city edge
  const edge = 85;
  colliders.push(aabbFromBox(0, -edge - 2, 180, 4, 0, 20));
  colliders.push(aabbFromBox(0, edge + 2, 180, 4, 0, 20));
  colliders.push(aabbFromBox(-edge - 2, 0, 4, 180, 0, 20));
  colliders.push(aabbFromBox(edge + 2, 0, 4, 180, 0, 20));

  // Road waypoints for traffic (loop around main roads)
  const roadWaypoints: THREE.Vector3[] = [
    new THREE.Vector3(-blockSize - roadW / 2, 0, -blockSize - roadW / 2),
    new THREE.Vector3(blockSize + roadW / 2, 0, -blockSize - roadW / 2),
    new THREE.Vector3(blockSize + roadW / 2, 0, blockSize + roadW / 2),
    new THREE.Vector3(-blockSize - roadW / 2, 0, blockSize + roadW / 2),
  ];

  // Pedestrian paths along sidewalks
  const pedestrianPaths: THREE.Vector3[][] = [
    [
      new THREE.Vector3(-30, 0, -18),
      new THREE.Vector3(30, 0, -18),
      new THREE.Vector3(30, 0, 18),
      new THREE.Vector3(-30, 0, 18),
    ],
    [
      new THREE.Vector3(-18, 0, -35),
      new THREE.Vector3(-18, 0, 35),
      new THREE.Vector3(18, 0, 35),
      new THREE.Vector3(18, 0, -35),
    ],
    [
      new THREE.Vector3(40, 0, -10),
      new THREE.Vector3(40, 0, 25),
      new THREE.Vector3(-40, 0, 25),
      new THREE.Vector3(-40, 0, -10),
    ],
  ];

  const parkedSpots = [
    { position: new THREE.Vector3(8, 0, -blockSize - roadW / 2 - 3), rotation: Math.PI / 2 },
    { position: new THREE.Vector3(-12, 0, blockSize + roadW / 2 + 3), rotation: -Math.PI / 2 },
    { position: new THREE.Vector3(blockSize + roadW / 2 + 3, 0, 10), rotation: 0 },
  ];

  const missionCarSpot = {
    position: new THREE.Vector3(-25, 0, -blockSize - roadW / 2 - 3.5),
    rotation: Math.PI / 2,
  };

  const deliverySpot = new THREE.Vector3(35, 0, 35);

  // Delivery marker pad
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 0.1, 24),
    new THREE.MeshStandardMaterial({
      color: 0x22cc66,
      emissive: 0x116633,
      transparent: true,
      opacity: 0.7,
    })
  );
  pad.position.set(deliverySpot.x, 0.08, deliverySpot.z);
  group.add(pad);

  scene.add(group);

  return {
    group,
    colliders,
    sidewalks,
    roadWaypoints,
    pedestrianPaths,
    spawnPoint: new THREE.Vector3(0, 0, 15),
    parkedSpots,
    missionCarSpot,
    deliverySpot,
    hemi,
    sun,
    ambient,
  };
}
