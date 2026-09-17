import * as THREE from 'three';
import { Input } from '../game/Input';
import { AABB, resolveAgainstWorld, clamp, distance2D } from '../game/Collision';

export type VehicleKind = 'civilian' | 'police' | 'mission';

export class Vehicle {
  mesh: THREE.Group;
  position = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  occupied = false;
  kind: VehicleKind;
  radius = 1.4;
  maxSpeed = 28;
  accel = 18;
  brake = 28;
  turnRate = 2.2;
  color: number;
  destroyed = false;
  private body: THREE.Mesh;

  constructor(
    pos: THREE.Vector3,
    yaw: number,
    kind: VehicleKind = 'civilian',
    color?: number
  ) {
    this.kind = kind;
    this.yaw = yaw;
    this.position.copy(pos);
    if (kind === 'police') {
      this.color = 0x1a3a8a;
      this.maxSpeed = 30;
      this.accel = 20;
    } else if (kind === 'mission') {
      this.color = color ?? 0xe8a020;
      this.maxSpeed = 26;
    } else {
      this.color = color ?? [0xc0392b, 0x27ae60, 0x8e44ad, 0xf39c12, 0x3498db][
        Math.floor(Math.random() * 5)
      ];
    }

    this.mesh = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.45,
      metalness: 0.3,
    });
    this.body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 4.2), bodyMat);
    this.body.position.y = 0.55;
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.mesh.add(this.body);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.65, 2.2),
      new THREE.MeshStandardMaterial({
        color: 0x88aacc,
        transparent: true,
        opacity: 0.75,
        roughness: 0.2,
        metalness: 0.5,
      })
    );
    cabin.position.set(0, 1.15, -0.2);
    cabin.castShadow = true;
    this.mesh.add(cabin);

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10);
    const offsets: [number, number, number][] = [
      [-1.05, 0.35, 1.3],
      [1.05, 0.35, 1.3],
      [-1.05, 0.35, -1.3],
      [1.05, 0.35, -1.3],
    ];
    for (const [wx, wy, wz] of offsets) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, wy, wz);
      this.mesh.add(w);
    }

    if (kind === 'police') {
      const lightBar = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.2, 0.4),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0x2244ff,
          emissiveIntensity: 0.9,
        })
      );
      lightBar.position.set(0, 1.55, -0.2);
      lightBar.name = 'lightBar';
      this.mesh.add(lightBar);
    }

    if (kind === 'mission') {
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.4, 0.8, 4),
        new THREE.MeshStandardMaterial({
          color: 0xffdd00,
          emissive: 0xaa8800,
        })
      );
      marker.position.y = 2.4;
      marker.rotation.x = Math.PI;
      marker.name = 'missionMarker';
      this.mesh.add(marker);
    }

    this.syncMesh();
  }

  syncMesh(): void {
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    this.mesh.rotation.y = this.yaw;
  }

  getExitPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.position.x + Math.cos(this.yaw) * 2.2,
      0,
      this.position.z - Math.sin(this.yaw) * 2.2
    );
  }

  updatePlayerDrive(dt: number, input: Input, colliders: AABB[]): void {
    let throttle = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) throttle = 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) throttle = -0.6;

    const braking = input.isDown('Space');
    if (braking) {
      this.speed *= Math.max(0, 1 - this.brake * dt * 0.08);
      if (Math.abs(this.speed) < 0.5) this.speed = 0;
    } else if (throttle !== 0) {
      this.speed += throttle * this.accel * dt;
    } else {
      this.speed *= 1 - 1.5 * dt;
    }
    this.speed = clamp(this.speed, -this.maxSpeed * 0.4, this.maxSpeed);

    const steer =
      (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) -
      (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);
    if (Math.abs(this.speed) > 0.5) {
      const turn =
        steer * this.turnRate * dt * Math.sign(this.speed) *
        Math.min(1, Math.abs(this.speed) / 8);
      this.yaw += turn;
    }

    const nx = this.position.x - Math.sin(this.yaw) * this.speed * dt;
    const nz = this.position.z - Math.cos(this.yaw) * this.speed * dt;
    const resolved = resolveAgainstWorld(nx, nz, this.radius, colliders);
    if (resolved.hit) {
      this.speed *= 0.4;
    }
    this.position.x = resolved.x;
    this.position.z = resolved.z;
    this.syncMesh();
  }

  /** AI chase or traffic follow. */
  updateAI(
    dt: number,
    target: THREE.Vector3 | null,
    waypoints: THREE.Vector3[],
    wpIndex: { i: number },
    colliders: AABB[],
    chase: boolean
  ): void {
    let desiredYaw = this.yaw;
    if (chase && target) {
      const dx = target.x - this.position.x;
      const dz = target.z - this.position.z;
      desiredYaw = Math.atan2(-dx, -dz);
      this.speed = clamp(this.speed + this.accel * 0.7 * dt, 0, this.maxSpeed * 0.85);
    } else if (waypoints.length > 0) {
      const wp = waypoints[wpIndex.i % waypoints.length];
      const dx = wp.x - this.position.x;
      const dz = wp.z - this.position.z;
      if (Math.hypot(dx, dz) < 4) {
        wpIndex.i = (wpIndex.i + 1) % waypoints.length;
      }
      desiredYaw = Math.atan2(-dx, -dz);
      this.speed = clamp(this.speed + this.accel * 0.35 * dt, 0, 12);
    }

    let dy = desiredYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += clamp(dy, -this.turnRate * dt, this.turnRate * dt);

    const nx = this.position.x - Math.sin(this.yaw) * this.speed * dt;
    const nz = this.position.z - Math.cos(this.yaw) * this.speed * dt;
    const resolved = resolveAgainstWorld(nx, nz, this.radius, colliders);
    if (resolved.hit) this.speed *= 0.5;
    this.position.x = resolved.x;
    this.position.z = resolved.z;

    // Police light blink
    if (this.kind === 'police') {
      const bar = this.mesh.getObjectByName('lightBar') as THREE.Mesh | undefined;
      if (bar && bar.material instanceof THREE.MeshStandardMaterial) {
        const t = performance.now() * 0.008;
        bar.material.emissive.set(Math.sin(t) > 0 ? 0xff2222 : 0x2244ff);
      }
    }

    // Bob mission marker
    if (this.kind === 'mission') {
      const m = this.mesh.getObjectByName('missionMarker');
      if (m) m.position.y = 2.4 + Math.sin(performance.now() * 0.005) * 0.25;
    }

    this.syncMesh();
  }

  isNear(x: number, z: number, dist = 3.5): boolean {
    return distance2D(this.position.x, this.position.z, x, z) < dist;
  }
}
