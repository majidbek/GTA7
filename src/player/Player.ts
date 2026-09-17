import * as THREE from 'three';
import { Input } from '../game/Input';
import { AABB, resolveAgainstWorld, clamp } from '../game/Collision';

export class Player {
  mesh: THREE.Group;
  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0.25;
  health = 100;
  hunger = 100;
  energy = 100;
  onGround = true;
  radius = 0.4;
  height = 1.7;
  inVehicle = false;
  /** While > 0, player is resting in place. */
  restTimer = 0;
  private spawn: THREE.Vector3;
  private bodyMat: THREE.MeshStandardMaterial;
  private walkPhase = 0;
  /** True this frame if player was sprinting while moving. */
  wasSprinting = false;

  constructor(spawn: THREE.Vector3) {
    this.spawn = spawn.clone();
    this.mesh = new THREE.Group();
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2a6aad,
      roughness: 0.7,
    });
    // Torso
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.7, 0.3),
      this.bodyMat
    );
    torso.position.y = 1.15;
    torso.castShadow = true;
    this.mesh.add(torso);
    // Head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xe8c4a0, roughness: 0.8 })
    );
    head.position.y = 1.7;
    head.castShadow = true;
    this.mesh.add(head);
    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a40 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.22), legMat);
    legL.position.set(-0.12, 0.4, 0);
    legL.name = 'legL';
    this.mesh.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.22), legMat);
    legR.position.set(0.12, 0.4, 0);
    legR.name = 'legR';
    this.mesh.add(legR);
    // Arms
    const armL = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.5, 0.18),
      this.bodyMat
    );
    armL.position.set(-0.35, 1.15, 0);
    this.mesh.add(armL);
    const armR = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.5, 0.18),
      this.bodyMat
    );
    armR.position.set(0.35, 1.15, 0);
    this.mesh.add(armR);

    this.position.copy(spawn);
    this.position.y = 0;
    this.syncMesh();
  }

  syncMesh(): void {
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    this.mesh.rotation.y = this.yaw;
  }

  takeDamage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
  }

  heal(amount: number): void {
    this.health = Math.min(100, this.health + amount);
  }

  /** Soft reset on death: health/hunger/energy/position; money kept by Game. */
  respawn(): void {
    this.health = 100;
    this.hunger = 100;
    this.energy = 100;
    this.velocity.set(0, 0, 0);
    this.restTimer = 0;
    this.wasSprinting = false;
    this.inVehicle = false;
    this.onGround = true;
    this.position.copy(this.spawn);
    this.position.y = 0;
    this.yaw = 0;
    this.pitch = 0.25;
    this.mesh.visible = true;
    this.syncMesh();
  }

  startRest(): void {
    if (this.restTimer > 0 || this.inVehicle) return;
    this.restTimer = 2;
    this.energy = Math.min(100, this.energy + 40);
    this.hunger = Math.max(0, this.hunger - 8);
    this.velocity.set(0, 0, 0);
  }

  eatSnack(): boolean {
    this.hunger = Math.min(100, this.hunger + 35);
    return true;
  }

  update(
    dt: number,
    input: Input,
    colliders: AABB[],
    camera: THREE.PerspectiveCamera
  ): void {
    this.wasSprinting = false;

    if (this.inVehicle) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    if (this.restTimer > 0) {
      this.restTimer = Math.max(0, this.restTimer - dt);
      this.velocity.set(0, 0, 0);
      this.syncMesh();
      this.updateCamera(camera);
      return;
    }

    const mouse = input.consumeMouse();
    this.yaw -= mouse.dx * 0.0025;
    this.pitch = clamp(this.pitch - mouse.dy * 0.002, 0.05, 1.2);

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    let mx = 0;
    let mz = 0;
    if (input.isDown('KeyW')) {
      mx += forward.x;
      mz += forward.z;
    }
    if (input.isDown('KeyS')) {
      mx -= forward.x;
      mz -= forward.z;
    }
    if (input.isDown('KeyA')) {
      mx -= right.x;
      mz -= right.z;
    }
    if (input.isDown('KeyD')) {
      mx += right.x;
      mz += right.z;
    }

    const len = Math.hypot(mx, mz);
    const wantSprint =
      (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) &&
      this.energy > 0;
    const walkSpeed = this.energy <= 0 ? 3.2 : 5.5;
    const sprint = wantSprint && this.energy > 0;
    const speed = sprint ? 9 : walkSpeed;

    if (len > 0.001) {
      mx = (mx / len) * speed;
      mz = (mz / len) * speed;
      if (sprint) this.wasSprinting = true;
      this.walkPhase += dt * (sprint ? 14 : 10);
      const legL = this.mesh.getObjectByName('legL');
      const legR = this.mesh.getObjectByName('legR');
      if (legL && legR) {
        legL.rotation.x = Math.sin(this.walkPhase) * 0.5;
        legR.rotation.x = Math.sin(this.walkPhase + Math.PI) * 0.5;
      }
    } else {
      const legL = this.mesh.getObjectByName('legL');
      const legR = this.mesh.getObjectByName('legR');
      if (legL && legR) {
        legL.rotation.x *= 0.8;
        legR.rotation.x *= 0.8;
      }
    }

    this.velocity.x = mx;
    this.velocity.z = mz;

    // Jump / gravity
    if (this.onGround && input.wasPressed('Space')) {
      this.velocity.y = 7.5;
      this.onGround = false;
    }
    this.velocity.y -= 22 * dt;
    this.position.y += this.velocity.y * dt;
    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      this.onGround = true;
    }

    const nx = this.position.x + this.velocity.x * dt;
    const nz = this.position.z + this.velocity.z * dt;
    const resolved = resolveAgainstWorld(nx, nz, this.radius, colliders);
    this.position.x = resolved.x;
    this.position.z = resolved.z;

    this.syncMesh();
    this.updateCamera(camera);
  }

  updateCamera(camera: THREE.PerspectiveCamera): void {
    const dist = 6;
    const height = 2.2;
    const ox = Math.sin(this.yaw) * dist * Math.cos(this.pitch);
    const oy = Math.sin(this.pitch) * dist + height;
    const oz = Math.cos(this.yaw) * dist * Math.cos(this.pitch);
    const target = new THREE.Vector3(
      this.position.x,
      this.position.y + 1.4,
      this.position.z
    );
    const desired = new THREE.Vector3(
      this.position.x + ox,
      this.position.y + oy,
      this.position.z + oz
    );
    camera.position.lerp(desired, 0.15);
    camera.lookAt(target);
  }

  /** Camera while driving — called by vehicle. */
  drivingCamera(
    camera: THREE.PerspectiveCamera,
    carPos: THREE.Vector3,
    carYaw: number
  ): void {
    const dist = 9;
    const height = 4;
    const ox = Math.sin(carYaw) * dist;
    const oz = Math.cos(carYaw) * dist;
    const desired = new THREE.Vector3(
      carPos.x + ox,
      carPos.y + height,
      carPos.z + oz
    );
    camera.position.lerp(desired, 0.12);
    camera.lookAt(carPos.x, carPos.y + 1, carPos.z);
    this.yaw = carYaw;
  }
}
