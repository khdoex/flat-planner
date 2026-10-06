// Wall solids as 2D footprints. Each wall gets a band of thickness T outside its room.
// Bands minus all room floors give the wall material; walls shared by two rooms are drawn once.
import * as pc from '../geometry/clip';
import type { MultiPolygon, Polygon } from 'polygon-clipping';
import type { Flat, Opening, Room, V2, Wall } from '../geometry/types';
import { shapeArea } from '../geometry/poly';

export interface WallPiece { wall: Wall; shape: MultiPolygon; y0: number; y1: number }

const quad = (p: V2, q: V2, n: V2, t0: number, t1: number): Polygon => [[
  [p[0] + n[0] * t0, p[1] + n[1] * t0], [q[0] + n[0] * t0, q[1] + n[1] * t0],
  [q[0] + n[0] * t1, q[1] + n[1] * t1], [p[0] + n[0] * t1, p[1] + n[1] * t1],
]];

function band(w: Wall, T: number): Polygon {
  const u: V2 = [(w.b[0] - w.a[0]) / w.len, (w.b[1] - w.a[1]) / w.len];
  const p: V2 = [w.a[0] - u[0] * T, w.a[1] - u[1] * T], q: V2 = [w.b[0] + u[0] * T, w.b[1] + u[1] * T];
  return quad(p, q, w.n, 0, T);
}

export function openingFootprint(o: Opening, T: number): Polygon {
  return quad(o.a, o.b, o.wall.n, -1, T + 1);
}

// visible: rooms whose walls are drawn. All rooms still carve their floors out of the walls.
export function computeWalls(flat: Flat, visible: Room[]): WallPiece[] {
  const { T, H } = flat;
  const floors = pc.union([], ...flat.rooms.map((r) => [r.poly] as Polygon));
  const holes = flat.openings.map((o) => openingFootprint(o, T));
  const pieces: WallPiece[] = [];
  let taken: MultiPolygon = [];
  for (const r of visible) for (const w of r.walls) {
    if (w.open) continue;
    const solid = pc.difference(band(w, T), floors, taken);
    if (shapeArea(solid) < 1) continue;
    taken = pc.union(taken, solid);
    const shape = holes.length ? pc.difference(solid, ...holes) : solid;
    if (shapeArea(shape) >= 1) pieces.push({ wall: w, shape, y0: 0, y1: H });
  }
  // sill and lintel blocks over each opening, wherever a visible wall was cut
  for (const o of flat.openings) {
    const cut = pc.intersection(openingFootprint(o, T), taken);
    if (shapeArea(cut) < 1) continue;
    const hostVisible = visible.some((r) => r.id === o.room);
    const wall = hostVisible ? o.wall : { ...o.wall, n: [-o.wall.n[0], -o.wall.n[1]] as V2 };
    if (o.y0 > 0) pieces.push({ wall, shape: cut, y0: 0, y1: o.y0 });
    if (o.y1 < H) pieces.push({ wall, shape: cut, y0: o.y1, y1: H });
  }
  return pieces;
}
