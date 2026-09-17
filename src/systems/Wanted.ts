import * as THREE from 'three';
import { Vehicle } from '../vehicles/Vehicle';
import { AABB, distance2D } from '../game/Collision';
import { CityData } from '../world/City';

export class WantedSystem {
  stars = 0;
  heat = 0; // 0–100
  private decayTimer = 0;
  private police: Vehicle[] = [];
  private spawnCooldown = 0;
  private lastPlayerPos = new THREE.Vector3();

  getPolice(): Vehicle[] {
    return this.police;
  }

  addMayhem(amount: number): void {
    this.heat = Math.min(100, this.heat + amount);
    this.decayTimer = 0;
    this.updateStars();
  }

  private updateStars(): void {
    if (this.heat >= 70) this.stars = 3;
    else if (this.heat >= 40) this.stars = 2;
    else if (this.heat >= 15) this.stars = 1;
    else this.stars = 0;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerSpeed: number,
    inVehicle: boolean,
    city: CityData,
    scene: THREE.Scene,
    colliders: AABB[],
    onHitPlayer: (dmg: number) => void
  ): void {
    // Raise heat from reckless driving
    if (inVehicle && Math.abs(playerSpeed) > 18) {
      this.addMayhem(dt * 2);
    }

    // Decay when clean
    this.decayTimer += dt;
    if (this.decayTimer > 4 && this.heat > 0) {
      this.heat = Math.max(0, this.heat - dt * 4);
      this.updateStars();
    }

    this.spawnCooldown = Math.max(0, this.spawnCooldown - dt);

    // Spawn police based on stars
    const desired = this.stars;
    while (this.police.length < desired && this.spawnCooldown <= 0) {
      this.spawnPolice(playerPos, city, scene);
      this.spawnCooldown = 3;
    }

    // Despawn excess / far
    for (let i = this.police.length - 1; i >= 0; i--) {
      const p = this.police[i];
      if (this.stars === 0) {
        scene.remove(p.mesh);
        this.police.splice(i, 1);
        continue;
      }
      const dist = distance2D(
        p.position.x,
        p.position.z,
        playerPos.x,
        playerPos.z
      );
      if (dist > 120) {
        scene.remove(p.mesh);
        this.police.splice(i, 1);
      }
    }

    // Chase
    for (const p of this.police) {
      const wp = { i: 0 };
      p.updateAI(dt, playerPos, city.roadWaypoints, wp, colliders, true);
      const dist = distance2D(
        p.position.x,
        p.position.z,
        playerPos.x,
        playerPos.z
      );
      if (dist < 2.8) {
        onHitPlayer(8 * dt);
        this.addMayhem(dt * 3);
      }
    }

    this.lastPlayerPos.copy(playerPos);
  }

  private spawnPolice(
    playerPos: THREE.Vector3,
    city: CityData,
    scene: THREE.Scene
  ): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 35 + Math.random() * 15;
    const pos = new THREE.Vector3(
      playerPos.x + Math.cos(angle) * dist,
      0,
      playerPos.z + Math.sin(angle) * dist
    );
    // Snap near a road waypoint if possible
    if (city.roadWaypoints.length) {
      const wp =
        city.roadWaypoints[Math.floor(Math.random() * city.roadWaypoints.length)];
      pos.set(wp.x + (Math.random() - 0.5) * 8, 0, wp.z + (Math.random() - 0.5) * 8);
    }
    const yaw = Math.atan2(-(playerPos.x - pos.x), -(playerPos.z - pos.z));
    const car = new Vehicle(pos, yaw, 'police');
    scene.add(car.mesh);
    this.police.push(car);
  }

  /** Call when player hits NPC or crashes hard. */
  reportCrime(severity: number): void {
    this.addMayhem(severity);
  }

  /** Clear heat, stars, and remove police from the scene. */
  reset(scene: THREE.Scene): void {
    this.stars = 0;
    this.heat = 0;
    this.decayTimer = 0;
    this.spawnCooldown = 0;
    for (const p of this.police) {
      scene.remove(p.mesh);
    }
    this.police.length = 0;
  }
}
