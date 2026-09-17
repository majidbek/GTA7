import * as THREE from 'three';
import { Input } from './Input';
import { buildCity, CityData } from '../world/City';
import { Player } from '../player/Player';
import { Vehicle } from '../vehicles/Vehicle';
import { WantedSystem } from '../systems/Wanted';
import { Mission, MISSION_REWARD } from '../systems/Mission';
import { HUD } from '../ui/HUD';
import {
  Pedestrian,
  TrafficCar,
  spawnPedestrians,
  spawnTraffic,
} from '../world/NPC';
import { distance2D } from './Collision';

const DAY_CYCLE_SEC = 300; // ~5 min full day/night
const SNACK_COST = 15;
const HUNGER_DRAIN = 0.35; // per second → ~4.7 min to empty
const ENERGY_IDLE = 0.4;
const ENERGY_SPRINT = 6;
const ENERGY_DRIVE = 2.2;
const HUNGER_ZERO_HP = 2.5; // health drain /s when starving

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private input: Input;
  private city!: CityData;
  private player!: Player;
  private vehicles: Vehicle[] = [];
  private currentVehicle: Vehicle | null = null;
  private wanted = new WantedSystem();
  private mission!: Mission;
  private pedestrians: Pedestrian[] = [];
  private traffic: TrafficCar[] = [];
  private hud: HUD;
  private clock = new THREE.Clock();
  private started = false;
  private dead = false;
  private lastCrashSpeed = 0;
  private money = 500;
  /** 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset */
  private dayPhase = 0.3;
  private snackHintTimer = 0;
  private tmpSky = new THREE.Color();
  private tmpFog = new THREE.Color();

  constructor(private container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      300
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.input = new Input(this.renderer.domElement);
    this.hud = new HUD(container);
    this.hud.setRestartHandler(() => this.restartFromDeath());

    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('click', () => {
      if (!this.started) {
        this.started = true;
        this.hud.hideOverlay();
      }
    });

    this.initWorld();
    this.applyDayNight();
    this.loop();
  }

  private initWorld(): void {
    this.city = buildCity(this.scene);
    this.player = new Player(this.city.spawnPoint);
    this.scene.add(this.player.mesh);

    // Parked cars
    for (const spot of this.city.parkedSpots) {
      const v = new Vehicle(spot.position.clone(), spot.rotation, 'civilian');
      this.scene.add(v.mesh);
      this.vehicles.push(v);
    }

    this.mission = new Mission(this.city, this.scene);
    this.vehicles.push(this.mission.car);

    this.pedestrians = spawnPedestrians(this.city.pedestrianPaths, this.scene, 14);
    this.traffic = spawnTraffic(Vehicle, this.city.roadWaypoints, this.scene, 5);

    this.camera.position.set(0, 8, 25);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private nearestVehicle(maxDist = 3.5): Vehicle | null {
    let best: Vehicle | null = null;
    let bestD = maxDist;
    const px = this.currentVehicle
      ? this.currentVehicle.position.x
      : this.player.position.x;
    const pz = this.currentVehicle
      ? this.currentVehicle.position.z
      : this.player.position.z;
    for (const v of this.vehicles) {
      if (v === this.currentVehicle) continue;
      const d = distance2D(v.position.x, v.position.z, px, pz);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  private tryEnterExit(): void {
    if (this.currentVehicle) {
      const exit = this.currentVehicle.getExitPosition();
      this.currentVehicle.occupied = false;
      this.currentVehicle.speed = 0;
      this.player.position.copy(exit);
      this.player.position.y = 0;
      this.player.inVehicle = false;
      this.player.yaw = this.currentVehicle.yaw;
      this.currentVehicle = null;
      return;
    }
    const near = this.nearestVehicle();
    if (!near) return;
    if (Math.abs(near.speed) > 3 && near.kind === 'civilian') {
      // still allow if nearly stopped
    }
    near.occupied = true;
    near.speed = 0;
    this.currentVehicle = near;
    this.player.inVehicle = true;
    this.player.position.copy(near.position);
  }

  private exitVehicleOnly(): void {
    if (!this.currentVehicle) return;
    this.currentVehicle.occupied = false;
    this.currentVehicle.speed = 0;
    this.player.inVehicle = false;
    this.currentVehicle = null;
  }

  private restartFromDeath(): void {
    this.dead = false;
    this.hud.hideDeath();
    this.exitVehicleOnly();
    this.player.respawn();
    this.wanted.reset(this.scene);
    this.mission.reset(() => this.exitVehicleOnly());
    this.lastCrashSpeed = 0;
    this.snackHintTimer = 0;
    // money kept
  }

  private tryEat(): void {
    if (this.player.inVehicle || this.player.restTimer > 0) return;
    if (this.money < SNACK_COST) {
      this.snackHintTimer = 2.5;
      return;
    }
    this.money -= SNACK_COST;
    this.player.eatSnack();
    this.snackHintTimer = 0;
  }

  private tryRest(): void {
    if (this.player.inVehicle) return;
    this.player.startRest();
  }

  private updateVitals(dt: number): void {
    // Hunger always drains while playing
    this.player.hunger = Math.max(0, this.player.hunger - HUNGER_DRAIN * dt);

    let energyDrain = ENERGY_IDLE;
    if (this.currentVehicle) {
      energyDrain = ENERGY_DRIVE;
    } else if (this.player.wasSprinting) {
      energyDrain = ENERGY_SPRINT;
    } else if (this.player.restTimer > 0) {
      energyDrain = 0;
    }
    this.player.energy = Math.max(0, this.player.energy - energyDrain * dt);

    if (this.player.hunger <= 0) {
      this.player.takeDamage(HUNGER_ZERO_HP * dt);
    }
  }

  private updateDayNight(dt: number): void {
    this.dayPhase = (this.dayPhase + dt / DAY_CYCLE_SEC) % 1;
    this.applyDayNight();
  }

  private applyDayNight(): void {
    const t = this.dayPhase;
    // dayFactor: 0 night, 1 noon — smooth with sun elevation
    const sunAngle = t * Math.PI * 2 - Math.PI / 2; // 0 at sunrise-ish
    const elev = Math.sin(sunAngle); // -1..1
    const dayFactor = Math.max(0, elev);

    const nightSky = new THREE.Color(0x0a1028);
    const daySky = new THREE.Color(0x87b8e0);
    const duskSky = new THREE.Color(0xc07040);
    const dawnSky = new THREE.Color(0xffb080);

    // Blend sky: night ↔ dawn/dusk ↔ day
    if (dayFactor > 0.15) {
      this.tmpSky.copy(daySky);
    } else if (elev > 0) {
      // dawn/dusk near horizon
      const k = dayFactor / 0.15;
      const warm = t < 0.5 ? dawnSky : duskSky;
      this.tmpSky.copy(nightSky).lerp(warm, 0.55).lerp(daySky, k);
    } else {
      this.tmpSky.copy(nightSky);
    }

    this.scene.background = this.tmpSky;
    if (this.scene.fog instanceof THREE.Fog) {
      this.tmpFog.copy(this.tmpSky);
      this.scene.fog.color.copy(this.tmpFog);
      this.scene.fog.near = 60 + dayFactor * 30;
      this.scene.fog.far = 140 + dayFactor * 50;
    }

    const sun = this.city.sun;
    const radius = 70;
    sun.position.set(
      Math.cos(sunAngle) * radius,
      Math.max(4, elev * 60 + 8),
      Math.sin(sunAngle) * radius * 0.35
    );
    sun.intensity = 0.15 + dayFactor * 1.05;
    sun.color.set(dayFactor > 0.2 ? 0xfff5e0 : 0xff9944);

    this.city.hemi.intensity = 0.12 + dayFactor * 0.5;
    this.city.hemi.color.set(dayFactor > 0.3 ? 0xb8d4ff : 0x334466);
    this.city.ambient.intensity = 0.12 + dayFactor * 0.28;
  }

  private formatClock(): string {
    const minutesTotal = Math.floor(this.dayPhase * 24 * 60);
    const hh = Math.floor(minutesTotal / 60) % 24;
    const mm = minutesTotal % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.started && !this.dead) {
      this.update(dt);
    } else if (this.started && this.dead) {
      // Keep day cycle ticking slowly while dead? optional — skip
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      return;
    }

    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };

  private update(dt: number): void {
    if (this.input.wasPressed('KeyE')) {
      this.tryEnterExit();
    }
    if (this.input.wasPressed('KeyF')) {
      this.tryEat();
    }
    if (this.input.wasPressed('KeyR')) {
      this.tryRest();
    }

    const playerPos = this.currentVehicle
      ? this.currentVehicle.position
      : this.player.position;
    const playerSpeed = this.currentVehicle
      ? this.currentVehicle.speed
      : Math.hypot(this.player.velocity.x, this.player.velocity.z);

    // Crash mayhem
    if (this.currentVehicle) {
      const prev = this.lastCrashSpeed;
      this.currentVehicle.updatePlayerDrive(dt, this.input, this.city.colliders);
      if (prev > 12 && Math.abs(this.currentVehicle.speed) < prev * 0.4) {
        this.wanted.reportCrime(12);
      }
      this.lastCrashSpeed = Math.abs(this.currentVehicle.speed);
      this.player.position.copy(this.currentVehicle.position);
      this.player.drivingCamera(
        this.camera,
        this.currentVehicle.position,
        this.currentVehicle.yaw
      );
    } else {
      this.lastCrashSpeed = 0;
      this.player.update(dt, this.input, this.city.colliders, this.camera);
    }

    this.updateVitals(dt);
    this.updateDayNight(dt);

    // Pedestrians
    for (const ped of this.pedestrians) {
      ped.update(
        dt,
        this.city.colliders,
        playerPos,
        playerSpeed,
        () => this.wanted.reportCrime(18)
      );
    }

    // Traffic (skip if occupied by player)
    for (const t of this.traffic) {
      if (t.vehicle.occupied) continue;
      t.update(dt, this.city.roadWaypoints, this.city.colliders);
    }

    // Wanted / police
    this.wanted.update(
      dt,
      playerPos,
      playerSpeed,
      !!this.currentVehicle,
      this.city,
      this.scene,
      this.city.colliders,
      (dmg) => {
        this.player.takeDamage(dmg);
      }
    );

    // Mission
    const inMissionCar = this.currentVehicle === this.mission.car;
    this.mission.update(inMissionCar, playerPos);
    if (this.mission.justCompleted) {
      this.money += MISSION_REWARD;
    }

    if (this.player.health <= 0) {
      this.dead = true;
      this.hud.showDeath();
    }

    if (this.snackHintTimer > 0) this.snackHintTimer -= dt;

    // HUD hints
    let hint =
      'WASD · Sichqoncha · Space · Shift · E mashina · F ovqat · R dam';
    const near = !this.currentVehicle ? this.nearestVehicle() : null;
    if (this.snackHintTimer > 0) {
      hint = `Pul yetarli emas! Ovqat −$${SNACK_COST} (Pul: $${Math.round(this.money)})`;
    } else if (this.player.restTimer > 0) {
      hint = `Dam olyapsiz… (${this.player.restTimer.toFixed(1)}s)`;
    } else if (this.currentVehicle) {
      hint = 'Haydash: WASD · Space tormoz · E chiqish';
    } else if (near) {
      hint = 'E — mashinaga o‘tirish';
    }

    this.hud.update({
      health: this.player.health,
      hunger: this.player.hunger,
      energy: this.player.energy,
      money: this.money,
      clock: this.formatClock(),
      stars: this.wanted.stars,
      speedKmh: this.currentVehicle
        ? Math.abs(this.currentVehicle.speed) * 3.6
        : null,
      hint: this.dead ? "Halok — «Qayta boshlash» bosing" : hint,
      mission: this.dead
        ? 'Halok bo‘ldingiz'
        : this.mission.message,
    });
  }
}
