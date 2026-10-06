// Turns data/flat.json (measurements + expressions) into flat-coordinate polygons.
import { evaluate, type Expr } from './expr';
import { area, inside } from './poly';
import type { FlatFile, Flat, Room, Wall, Opening, Fixture, CheckResult, V2 } from './types';

export function resolveFlat(f: FlatFile): Flat {
  const errors: string[] = [];
  const scope: Record<string, number> = {};
  for (const [k, d] of Object.entries(f.dims)) scope[k] = d.v;
  // dims and derived values are required: a failure here throws and the caller keeps the old plan
  for (const [k, e] of Object.entries(f.derived)) scope[k] = evaluate(e, scope);
  const ev = (e: Expr) => evaluate(e, scope);
  const pt = (p: [Expr, Expr]): V2 => [ev(p[0]), ev(p[1])];

  const rooms: Room[] = [];
  for (const rd of f.rooms) {
    try {
      const poly = rd.walls.map((w) => pt(w.from));
      const walls: Wall[] = rd.walls.map((w, i) => {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let n: V2 = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
        const mid: V2 = [(a[0] + b[0]) / 2 + n[0] * 0.5, (a[1] + b[1]) / 2 + n[1] * 0.5];
        if (inside(mid, poly)) n = [-n[0], -n[1]]; // n points out of the room
        return { room: rd.id, id: w.id, name: w.name, a, b, open: !!w.open, n, len };
      });
      rooms.push({ id: rd.id, name: rd.name, floor: rd.floor, note: rd.note, origin: pt(rd.origin), poly, walls, area: area(poly) });
    } catch (e) { errors.push(`room ${rd.id}: ${(e as Error).message}`); }
  }

  const openings: Opening[] = [];
  for (const od of f.openings) {
    try {
      const wall = rooms.find((r) => r.id === od.room)?.walls.find((w) => w.id === od.wall);
      if (!wall) throw new Error(`wall ${od.room}/${od.wall} not found`);
      const from = ev(od.from), width = ev(od.width);
      if (from < -0.5 || from + width > wall.len + 0.5) throw new Error(`does not fit on ${wall.name} (${from.toFixed(0)}+${width.toFixed(0)} > ${wall.len.toFixed(0)})`);
      const u: V2 = [(wall.b[0] - wall.a[0]) / wall.len, (wall.b[1] - wall.a[1]) / wall.len];
      const at = (s: number): V2 => [wall.a[0] + u[0] * s, wall.a[1] + u[1] * s];
      openings.push({
        id: od.id, kind: od.kind, name: od.name, room: od.room, wall, a: at(from), b: at(from + width), width,
        y0: od.y0 === undefined ? 0 : ev(od.y0), y1: ev(od.y1), mullions: od.mullions ?? 2,
        hinge: od.hinge ?? 'start', swing: od.swing ?? 'in', guess: od.guess,
      });
    } catch (e) { errors.push(`opening ${od.id}: ${(e as Error).message}`); }
  }

  const fixtures: Fixture[] = [];
  for (const fd of f.fixtures) {
    try {
      let poly: V2[];
      if (fd.rect) { const [x0, z0, x1, z1] = fd.rect.map(ev); poly = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
      else if (fd.poly) poly = fd.poly.map(pt);
      else throw new Error('needs rect or poly');
      fixtures.push({ id: fd.id, kind: fd.kind, room: fd.room, name: fd.name, poly, y0: fd.y0 === undefined ? 0 : ev(fd.y0), h: ev(fd.h), mat: fd.mat ?? 'white', label: !!fd.label, guess: fd.guess });
    } catch (e) { errors.push(`fixture ${fd.id}: ${(e as Error).message}`); }
  }

  const checks: CheckResult[] = [];
  for (const c of f.checks) {
    try { const a = ev(c.a), b = ev(c.b); checks.push({ label: c.label, room: c.room, a, b, ok: Math.abs(a - b) <= (c.tol ?? 2) }); }
    catch (e) { errors.push(`check "${c.label}": ${(e as Error).message}`); }
  }

  return { values: scope, T: scope.T, H: scope.H, rooms, openings, fixtures, checks, errors };
}
