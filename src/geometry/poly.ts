import type { MultiPolygon } from 'polygon-clipping';
import type { V2, Item, Room } from './types';

export function area(p: V2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length]; a += x0 * z1 - x1 * z0; }
  return Math.abs(a) / 2;
}

export function inside(pt: V2, p: V2[]): boolean {
  const [x, z] = pt; let r = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r;
  }
  return r;
}

export function bbox(ps: V2[]): { x0: number; z0: number; x1: number; z1: number } {
  const xs = ps.map((p) => p[0]), zs = ps.map((p) => p[1]);
  return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
}

// Item corners in flat coordinates. Same convention as the mesh: rotation.y = -rotation (degrees).
export function footprint(it: Item, room: Room): V2[] {
  const t = (it.rotation * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const cx = room.origin[0] + it.x, cz = room.origin[1] + it.z, hw = it.w / 2, hd = it.d / 2;
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as V2[]).map(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c]);
}

export function roomAt(pt: V2, rooms: Room[]): Room | undefined {
  return rooms.find((r) => inside(pt, r.poly));
}

export function shapeArea(m: MultiPolygon): number {
  let a = 0;
  for (const poly of m) poly.forEach((ring, i) => {
    let s = 0;
    for (let k = 0; k < ring.length; k++) { const [x0, z0] = ring[k], [x1, z1] = ring[(k + 1) % ring.length]; s += x0 * z1 - x1 * z0; }
    a += (i === 0 ? 1 : -1) * Math.abs(s) / 2;
  });
  return a;
}
