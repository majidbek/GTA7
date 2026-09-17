import * as THREE from 'three';
import { Vehicle } from '../vehicles/Vehicle';
import { CityData } from '../world/City';
import { distance2D } from '../game/Collision';

export type MissionState = 'idle' | 'steal' | 'deliver' | 'done';

export const MISSION_REWARD = 800;

export class Mission {
  state: MissionState = 'steal';
  message = 'Steal the marked orange car';
  car: Vehicle;
  rewardPaid = false;
  private delivery: THREE.Vector3;
  private city: CityData;
  /** True for one frame when reward is granted. */
  justCompleted = false;

  constructor(city: CityData, scene: THREE.Scene) {
    this.city = city;
    this.delivery = city.deliverySpot.clone();
    this.car = new Vehicle(
      city.missionCarSpot.position.clone(),
      city.missionCarSpot.rotation,
      'mission',
      0xe8a020
    );
    scene.add(this.car.mesh);
  }

  update(playerInThisCar: boolean, playerPos: THREE.Vector3): void {
    this.justCompleted = false;
    if (this.state === 'done') return;

    if (this.state === 'steal') {
      if (playerInThisCar) {
        this.state = 'deliver';
        this.message = 'Deliver the car to the green pad';
      } else {
        this.message = 'Steal the marked orange car (press E near it)';
      }
    } else if (this.state === 'deliver') {
      if (!playerInThisCar) {
        this.message = 'Get back in the orange car';
        return;
      }
      const d = distance2D(
        playerPos.x,
        playerPos.z,
        this.delivery.x,
        this.delivery.z
      );
      if (d < 4) {
        this.state = 'done';
        if (!this.rewardPaid) {
          this.rewardPaid = true;
          this.justCompleted = true;
          this.message = 'Mission complete! +$800';
        } else {
          this.message = 'Mission complete!';
        }
      } else {
        this.message = `Deliver to green pad (${d.toFixed(0)}m)`;
      }
    }
  }

  /** Reset mission progress and car; keep rewardPaid so pay is once per run. */
  reset(exitVehicleIfOccupied: () => void): void {
    exitVehicleIfOccupied();
    this.state = 'steal';
    this.message = 'Steal the marked orange car';
    this.justCompleted = false;
    this.car.occupied = false;
    this.car.speed = 0;
    this.car.position.copy(this.city.missionCarSpot.position);
    this.car.yaw = this.city.missionCarSpot.rotation;
    this.car.syncMesh();
  }
}
