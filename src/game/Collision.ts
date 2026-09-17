import * as THREE from 'three';

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
}

export function aabbFromBox(
  x: number,
  z: number,
  w: number,
  d: number,
  y = 0,
  h = 10
): AABB {
  return {
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    minY: y,
    maxY: y + h,
  };
}

export function circleHitsAABB(
  cx: number,
  cz: number,
  radius: number,
  box: AABB
): boolean {
  const nearestX = Math.max(box.minX, Math.min(cx, box.maxX));
  const nearestZ = Math.max(box.minZ, Math.min(cz, box.maxZ));
  const dx = cx - nearestX;
  const dz = cz - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}

/** Push circle out of AABB; returns corrected position. */
export function resolveCircleAABB(
  cx: number,
  cz: number,
  radius: number,
  box: AABB
): { x: number; z: number; hit: boolean } {
  const nearestX = Math.max(box.minX, Math.min(cx, box.maxX));
  const nearestZ = Math.max(box.minZ, Math.min(cz, box.maxZ));
  let dx = cx - nearestX;
  let dz = cz - nearestZ;
  const distSq = dx * dx + dz * dz;
  if (distSq >= radius * radius || distSq === 0) {
    // If inside box, push to nearest edge
    if (
      cx > box.minX &&
      cx < box.maxX &&
      cz > box.minZ &&
      cz < box.maxZ
    ) {
      const left = cx - box.minX;
      const right = box.maxX - cx;
      const top = cz - box.minZ;
      const bottom = box.maxZ - cz;
      const m = Math.min(left, right, top, bottom);
      if (m === left) return { x: box.minX - radius, z: cz, hit: true };
      if (m === right) return { x: box.maxX + radius, z: cz, hit: true };
      if (m === top) return { x: cx, z: box.minZ - radius, hit: true };
      return { x: cx, z: box.maxZ + radius, hit: true };
    }
    return { x: cx, z: cz, hit: false };
  }
  const dist = Math.sqrt(distSq);
  const push = (radius - dist) / dist;
  return { x: cx + dx * push, z: cz + dz * push, hit: true };
}

export function resolveAgainstWorld(
  x: number,
  z: number,
  radius: number,
  colliders: AABB[]
): { x: number; z: number; hit: boolean } {
  let hit = false;
  let px = x;
  let pz = z;
  for (let i = 0; i < 3; i++) {
    for (const box of colliders) {
      const r = resolveCircleAABB(px, pz, radius, box);
      if (r.hit) {
        hit = true;
        px = r.x;
        pz = r.z;
      }
    }
  }
  return { x: px, z: pz, hit };
}

export function pointInAABB(x: number, z: number, box: AABB): boolean {
  return x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;
}

export function distance2D(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
