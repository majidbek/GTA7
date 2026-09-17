import * as THREE from 'three';
import { AABB, resolveAgainstWorld, distance2D } from '../game/Collision';

const NPC_COLORS = [0xc0392b, 0x27ae60, 0x8e44ad, 0xe67e22, 0x1abc9c, 0x34495e];

export class Pedestrian {
  mesh: THREE.Group;
  position = new THREE.Vector3();
  path: THREE.Vector3[];
  pathIndex = 0;
  speed = 1.4 + Math.random() * 0.8;
  yaw = 0;
  radius = 0.35;
  scared = 0;

  constructor(path: THREE.Vector3[], startIndex = 0) {
    this.path = path;
    this.pathIndex = startIndex % path.length;
    this.position.copy(path[this.pathIndex]);
    this.position.x += (Math.random() - 0.5) * 2;
    this.position.z += (Math.random() - 0.5) * 2;

    this.mesh = new THREE.Group();
    const color = NPC_COLORS[Math.floor(Math.random() * NPC_COLORS.length)];
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.6, 0.25),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
    );
    body.position.y = 1.05;
    body.castShadow = true;
    this.mesh.add(body);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xe8c4a0 })
    );
    head.position.y = 1.5;
    this.mesh.add(head);
    const legs = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.5, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x2c3e50 })
    );
    legs.position.y = 0.35;
    this.mesh.add(legs);
    this.sync();
  }

  sync(): void {
    this.mesh.position.set(this.position.x, 0, this.position.z);
    this.mesh.rotation.y = this.yaw;
  }

  update(
    dt: number,
    colliders: AABB[],
    playerPos: THREE.Vector3,
    playerSpeed: number,
    onHit: () => void
  ): void {
    if (this.scared > 0) {
      this.scared -= dt;
      // Run away from player
      const dx = this.position.x - playerPos.x;
      const dz = this.position.z - playerPos.z;
      const len = Math.hypot(dx, dz) || 1;
      this.yaw = Math.atan2(-dx, -dz);
      const nx = this.position.x + (dx / len) * 5 * dt;
      const nz = this.position.z + (dz / len) * 5 * dt;
      const r = resolveAgainstWorld(nx, nz, this.radius, colliders);
      this.position.x = r.x;
      this.position.z = r.z;
      this.sync();
      return;
    }

    const target = this.path[this.pathIndex];
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.5) {
      this.pathIndex = (this.pathIndex + 1) % this.path.length;
    } else {
      this.yaw = Math.atan2(-dx, -dz);
      const nx = this.position.x + (dx / dist) * this.speed * dt;
      const nz = this.position.z + (dz / dist) * this.speed * dt;
      const r = resolveAgainstWorld(nx, nz, this.radius, colliders);
      this.position.x = r.x;
      this.position.z = r.z;
    }

    // Hit by fast player/vehicle
    const pd = distance2D(
      this.position.x,
      this.position.z,
      playerPos.x,
      playerPos.z
    );
    if (pd < 1.6 && Math.abs(playerSpeed) > 6) {
      this.scared = 3;
      onHit();
    }

    this.sync();
  }
}

export class TrafficCar {
  vehicle: import('../vehicles/Vehicle').Vehicle;
  wpIndex = { i: 0 };

  constructor(
    VehicleClass: typeof import('../vehicles/Vehicle').Vehicle,
    waypoints: THREE.Vector3[],
    start: number
  ) {
    this.wpIndex.i = start % waypoints.length;
    const p = waypoints[this.wpIndex.i].clone();
    p.x += (Math.random() - 0.5) * 3;
    const next = waypoints[(this.wpIndex.i + 1) % waypoints.length];
    const yaw = Math.atan2(-(next.x - p.x), -(next.z - p.z));
    this.vehicle = new VehicleClass(p, yaw, 'civilian');
    this.vehicle.maxSpeed = 14;
  }

  update(dt: number, waypoints: THREE.Vector3[], colliders: AABB[]): void {
    this.vehicle.updateAI(dt, null, waypoints, this.wpIndex, colliders, false);
  }
}

export function spawnPedestrians(
  paths: THREE.Vector3[][],
  scene: THREE.Scene,
  count = 12
): Pedestrian[] {
  const list: Pedestrian[] = [];
  for (let i = 0; i < count; i++) {
    const path = paths[i % paths.length];
    const ped = new Pedestrian(path, i);
    scene.add(ped.mesh);
    list.push(ped);
  }
  return list;
}

export function spawnTraffic(
  VehicleClass: typeof import('../vehicles/Vehicle').Vehicle,
  waypoints: THREE.Vector3[],
  scene: THREE.Scene,
  count = 4
): TrafficCar[] {
  const list: TrafficCar[] = [];
  for (let i = 0; i < count; i++) {
    const t = new TrafficCar(VehicleClass, waypoints, i);
    scene.add(t.vehicle.mesh);
    list.push(t);
  }
  return list;
}
