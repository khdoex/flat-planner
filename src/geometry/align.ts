// Turn an item so its back (local -z) is parallel to a wall, and push it flush when it is close.
import type { Fixture, Item, Room, V2 } from './types';

const FLUSH_WITHIN = 25; // cm of back gap under which the item is pushed against the wall

const dot = (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1];

export function backDir(rotation: number): V2 {
  const t = (rotation * Math.PI) / 180;
  return [Math.sin(t), -Math.cos(t)];
}

function segDist(p: V2, a: V2, b: V2): number {
  const ab: V2 = [b[0] - a[0], b[1] - a[1]], ap: V2 = [p[0] - a[0], p[1] - a[1]];
  const t = Math.max(0, Math.min(1, dot(ap, ab) / dot(ab, ab)));
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t);
}

// Fixtures that stand on the floor and block furniture.
export const isObstacle = (f: Fixture) => f.y0 < 50 && !['socket', 'switch', 'glass'].includes(f.kind);

export function alignToWall(it: Item, room: Room, fixtures: Fixture[]): Partial<Item> {
  const c: V2 = [room.origin[0] + it.x, room.origin[1] + it.z], back = backDir(it.rotation);
  const walls = room.walls.filter((w) => !w.open);
  // wall with the smallest gap to the item's nearest side; a 40 cm bonus for the wall it already backs onto
  const side: V2 = [-back[1], back[0]];
  const gapTo = (w: (typeof walls)[0]) => {
    const s = dot([c[0] - w.a[0], c[1] - w.a[1]], w.n), ext = (Math.abs(dot(w.n, side)) * it.w + Math.abs(dot(w.n, back)) * it.d) / 2;
    return Math.max(0, -s - ext) + (segDist(c, w.a, w.b) > -s + 1 ? 1e4 : 0) - (dot(w.n, back) > Math.SQRT1_2 ? 40 : 0);
  };
  const w = walls.sort((p, q) => gapTo(p) - gapTo(q))[0];
  let rotation = (Math.atan2(w.n[0], -w.n[1]) * 180) / Math.PI;
  rotation = Math.round((((rotation % 360) + 360) % 360) * 10) / 10;

  const u: V2 = [(w.b[0] - w.a[0]) / w.len, (w.b[1] - w.a[1]) / w.len];
  const s = dot([c[0] - w.a[0], c[1] - w.a[1]], w.n); // signed distance of the centre from the wall (negative inside)
  // stop at the deepest floor fixture (column, radiator) behind the item's width, else at the wall
  const t = dot([c[0] - w.a[0], c[1] - w.a[1]], u), t0 = t - it.w / 2, t1 = t + it.w / 2;
  let stop = 0;
  for (const f of fixtures) {
    if (f.room !== room.id || !isObstacle(f)) continue;
    const ts = f.poly.map((v) => dot([v[0] - w.a[0], v[1] - w.a[1]], u));
    const ss = f.poly.map((v) => dot([v[0] - w.a[0], v[1] - w.a[1]], w.n));
    if (Math.max(...ts) <= t0 || Math.min(...ts) >= t1 || Math.max(...ss) < -it.d - 5) continue;
    stop = Math.min(stop, Math.min(...ss));
  }
  const gap = stop - (s + it.d / 2); // from the item's back to what it would rest against
  let pos = c;
  if (gap < FLUSH_WITHIN) {
    const shift = stop - it.d / 2 - s;
    pos = [c[0] + w.n[0] * shift, c[1] + w.n[1] * shift];
  }
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { rotation, x: r1(pos[0] - room.origin[0]), z: r1(pos[1] - room.origin[1]) };
}
