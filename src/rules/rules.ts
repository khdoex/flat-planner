// Layout rules. Pure functions of (flat, items), shared by the UI, `npm run check` and the optimiser.
import * as pc from '../geometry/clip';
import type { MultiPolygon, Polygon } from 'polygon-clipping';
import type { Fixture, Flat, Item, Opening, Room, V2 } from '../geometry/types';
import { footprint, shapeArea, bbox } from '../geometry/poly';
import { isObstacle, backDir } from '../geometry/align';
import { doorSwing } from '../geometry/doors';
import { Grid, distanceTo, flood } from './grid';

export type Severity = 'error' | 'warn';
export interface Zone { shape: MultiPolygon; tone: 'red' | 'amber' }
export interface Violation { rule: string; severity: Severity; room: string; items: string[]; msg: string; zones: Zone[] }
export interface WalkMap { grid: Grid; room: Uint8Array; narrow: Uint8Array } // narrow = passable at 60 cm but not at 80 cm
export interface RuleResult { violations: Violation[]; passed: Record<string, number>; walk: WalkMap; ms: number }

export const LIMITS = {
  walkWarn: 60, walkGood: 80, // walkway widths, cm
  radiatorClear: 20, boilerClear: 60, switchClear: 30, // in front of radiators, wall boilers and light switches
  socketReach: 150, // cm from nightstand to socket: a typical lamp or charger cable
  accessDepth: 60, // depth of the zone a person stands in to use a piece
  cell: 2.5,
};

const CHAIRS = new Set(['chair', 'markus']);
const TABLES = new Set(['table', 'desk']);
const blocks = (it: Item) => it.h > 2 && !(it.y && it.y > 0); // stands on the floor
const name = (it: Item) => it.name;
const r0 = (v: number) => Math.round(v);
const poly = (p: V2[]): Polygon => [p as [number, number][]];
// Typical thickness of an overlap region: 2 * area / perimeter (exact for long thin strips, half the side for squares).
const thin = (m: MultiPolygon) => {
  let per = 0;
  for (const p of m) for (const ring of p) for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return per ? (2 * shapeArea(m)) / per : 0;
};
const TOL = 0.5; // cm; thinner overlaps are below tape-measure precision

// Rectangle in an item's local frame (u across the width, v front-back, +v = front) mapped to flat coordinates.
function localRect(it: Item, room: Room, u0: number, u1: number, v0: number, v1: number): V2[] {
  const t = (it.rotation * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), cx = room.origin[0] + it.x, cz = room.origin[1] + it.z;
  return ([[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as V2[]).map(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c]);
}
const front = (it: Item, room: Room, depth: number) => localRect(it, room, -it.w / 2, it.w / 2, it.d / 2, it.d / 2 + depth);

// Doors and drawers of a piece: what opens toward the front and how far.
function opensFront(it: Item): { depth: number; what: string } | null {
  if (it.kind === 'wardrobe') return { depth: Math.min(it.w / 3, 60), what: 'doors' };
  if (['chest', 'dresser', 'nightstand'].includes(it.kind)) return { depth: it.d - 8, what: 'drawers' };
  return null;
}

// Strip in front of a fixture or opening, on the room side of the nearest wall.
function stripInFront(p: V2[], room: Room, depth: number): V2[] {
  const c: V2 = [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
  const w = room.walls.filter((x) => !x.open).sort((a, b) => wallDist(c, a.a, a.b) - wallDist(c, b.a, b.b))[0];
  const u: V2 = [(w.b[0] - w.a[0]) / w.len, (w.b[1] - w.a[1]) / w.len];
  const ts = p.map((q) => (q[0] - w.a[0]) * u[0] + (q[1] - w.a[1]) * u[1]);
  const ss = p.map((q) => (q[0] - w.a[0]) * w.n[0] + (q[1] - w.a[1]) * w.n[1]);
  const t0 = Math.min(...ts), t1 = Math.max(...ts), s0 = Math.min(0, Math.min(...ss)), s1 = s0 - depth;
  const at = (t: number, s: number): V2 => [w.a[0] + u[0] * t + w.n[0] * s, w.a[1] + u[1] * t + w.n[1] * s];
  return [at(t0, s0), at(t1, s0), at(t1, s1), at(t0, s1)];
}
function wallDist(p: V2, a: V2, b: V2) {
  const ab: V2 = [b[0] - a[0], b[1] - a[1]], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2)));
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t);
}
function polyDist(p: V2[], q: V2[]): number {
  if (shapeArea(pc.intersection(poly(p), poly(q))) > 0) return 0;
  let d = Infinity;
  for (const [A, B] of [[p, q], [q, p]]) for (const v of A) for (let i = 0; i < B.length; i++) d = Math.min(d, wallDist(v, B[i], B[(i + 1) % B.length]));
  return d;
}

// cell: walkway grid size in cm (the optimiser searches on a coarser grid, then re-checks at the default)
export function checkLayout(flat: Flat, items: Item[], cell: number = LIMITS.cell): RuleResult {
  const t0 = performance.now();
  const V: Violation[] = [], passed: Record<string, number> = {};
  const ok = (rule: string) => { passed[rule] = (passed[rule] ?? 0) + 1; };
  const roomOf = new Map(flat.rooms.map((r) => [r.id, r]));
  const placed = items.filter((it) => roomOf.has(it.room)).map((it) => ({ it, room: roomOf.get(it.room)!, fp: footprint(it, roomOf.get(it.room)!) }));
  const obstacles = flat.fixtures.filter(isObstacle);
  const portals = flat.openings.filter((o) => o.kind === 'door').map((o) => openingRect(o, flat.T));
  const free = pc.difference(pc.union([], ...flat.rooms.map((r) => poly(r.poly)), ...portals.map(poly)), ...obstacles.map((f) => poly(f.poly)));

  // 1. pieces overlapping each other (chairs may tuck under tables and desks; raised pieces sit on others)
  for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) {
    const A = placed[a], B = placed[b];
    if (A.it.h <= 2 || B.it.h <= 2) continue;
    const ba = bbox(A.fp), bb = bbox(B.fp);
    if (ba.x1 <= bb.x0 || bb.x1 <= ba.x0 || ba.z1 <= bb.z0 || bb.z1 <= ba.z0) { ok('overlap'); continue; }
    const ya = A.it.y ?? 0, yb = B.it.y ?? 0;
    if (ya >= yb + B.it.h || yb >= ya + A.it.h) continue;
    if ((CHAIRS.has(A.it.kind) && TABLES.has(B.it.kind)) || (CHAIRS.has(B.it.kind) && TABLES.has(A.it.kind))) continue;
    const x = pc.intersection(poly(A.fp), poly(B.fp));
    if (thin(x) > TOL) V.push({ rule: 'overlap', severity: 'error', room: A.it.room, items: [A.it.id, B.it.id], msg: `${name(A.it)} overlaps ${name(B.it)} by ${r0(thin(x))} cm`, zones: [{ shape: x, tone: 'red' }] });
    else ok('overlap');
  }

  // 2. pieces running into walls, columns or fixed fittings
  for (const P of placed) {
    if (P.it.h <= 2 && !(P.it.y && P.it.y > 0)) { ok('wall'); continue; } // rugs may run under things
    const out = pc.difference(poly(P.fp), free);
    if (thin(out) <= TOL) { ok('wall'); continue; }
    const hit = obstacles.find((f) => thin(pc.intersection(poly(P.fp), poly(f.poly))) > TOL);
    V.push({ rule: 'wall', severity: 'error', room: P.it.room, items: [P.it.id], msg: `${name(P.it)} runs into ${hit ? `the ${hit.name.toLowerCase()}` : 'a wall'} by ${r0(thin(out))} cm`, zones: [{ shape: out, tone: 'red' }] });
  }

  // 3. door swings, wardrobe doors and drawers kept clear
  for (const o of flat.openings) {
    if (o.kind !== 'door') continue;
    const sw = doorSwing(o, flat.T).arc, room = o.swing === 'in' ? o.room : otherRoom(flat, o);
    let clear = true;
    for (const P of placed) {
      if (!blocks(P.it)) continue;
      const x = pc.intersection(poly(sw), poly(P.fp));
      if (thin(x) > TOL) { clear = false; V.push({ rule: 'door', severity: 'error', room: room ?? o.room, items: [P.it.id], msg: `${name(P.it)} blocks the ${doorName(o)} swing`, zones: [{ shape: pc.union(poly(sw)), tone: 'red' }] }); }
    }
    if (clear) ok('door');
  }
  for (const P of placed) {
    const f = opensFront(P.it);
    if (!f) continue;
    const zone = front(P.it, P.room, f.depth);
    const intoWall = pc.difference(poly(zone), free);
    const hits = placed.filter((Q) => Q !== P && blocks(Q.it) && thin(pc.intersection(poly(zone), poly(Q.fp))) > TOL);
    if (thin(intoWall) > TOL) V.push({ rule: 'opening', severity: 'error', room: P.it.room, items: [P.it.id], msg: `${name(P.it)}: ${f.what} (${r0(f.depth)} cm) hit a wall or fitting`, zones: [{ shape: pc.union(poly(zone)), tone: 'red' }] });
    for (const Q of hits) V.push({
      rule: 'opening', severity: CHAIRS.has(Q.it.kind) ? 'warn' : 'error', room: P.it.room, items: [P.it.id, Q.it.id],
      msg: `${name(P.it)}: ${f.what} (${r0(f.depth)} cm) hit ${name(Q.it)}`, zones: [{ shape: pc.union(poly(zone)), tone: 'red' }],
    });
    if (thin(intoWall) <= TOL && !hits.length) ok('opening');
  }

  // 4. radiators, wall boilers and light switches need clear space in front
  for (const f of flat.fixtures) {
    const depth = f.kind === 'radiator' ? LIMITS.radiatorClear : f.kind === 'boiler' || f.kind === 'kombi' ? LIMITS.boilerClear : f.kind === 'switch' ? LIMITS.switchClear : 0;
    const room = roomOf.get(f.room);
    if (!depth || !room) continue;
    const zone = stripInFront(f.poly, room, depth);
    // a light switch is only blocked by pieces that reach up to it
    const tall = (P: Placed) => f.kind !== 'switch' || (P.it.y ?? 0) + P.it.h > f.y0 - 10;
    const hits = placed.filter((P) => blocks(P.it) && tall(P) && thin(pc.intersection(poly(zone), poly(P.fp))) > TOL);
    for (const P of hits) V.push({ rule: 'clearance', severity: 'warn', room: f.room, items: [P.it.id], msg: f.kind === 'switch' ? `${name(P.it)} blocks the ${f.name.toLowerCase()}` : `${name(P.it)} is within ${depth} cm in front of the ${f.name.toLowerCase()}`, zones: [{ shape: pc.union(poly(zone)), tone: 'amber' }] });
    if (!hits.length) ok('clearance');
  }

  // 5. nightstands near a socket
  for (const P of placed.filter((p) => p.it.kind === 'nightstand')) {
    const sockets = flat.fixtures.filter((f) => f.kind === 'socket' && f.room === P.it.room);
    const d = Math.min(...sockets.map((s) => polyDist(P.fp, s.poly)));
    if (d <= LIMITS.socketReach) ok('socket');
    else V.push({ rule: 'socket', severity: 'warn', room: P.it.room, items: [P.it.id], msg: `${name(P.it)} is ${Number.isFinite(d) ? r0(d) + ' cm' : 'far'} from the nearest socket (limit ${LIMITS.socketReach})`, zones: [] });
  }

  // 6. desk and daylight: the user looks toward the desk's back
  for (const P of placed.filter((p) => p.it.kind === 'desk')) {
    const look = backDir(P.it.rotation), c: V2 = [P.room.origin[0] + P.it.x, P.room.origin[1] + P.it.z];
    const wins = flat.openings.filter((o) => o.kind === 'window' && o.room === P.it.room).map((o) => {
      const m: V2 = [(o.a[0] + o.b[0]) / 2 - c[0], (o.a[1] + o.b[1]) / 2 - c[1]], l = Math.hypot(...m);
      return { o, deg: (Math.acos((m[0] * look[0] + m[1] * look[1]) / l) * 180) / Math.PI, dist: l };
    });
    const bad = wins.filter((w) => w.deg < 45 || w.deg > 135);
    for (const w of bad) V.push({
      rule: 'daylight', severity: 'warn', room: P.it.room, items: [P.it.id],
      msg: `${name(P.it)}: the ${w.o.id.replace(/-/g, ' ')} is ${w.deg < 45 ? 'in front of you' : 'behind you'} (${r0(w.deg)}° from your view, ${r0(w.dist)} cm away)`, zones: [],
    });
    if (!bad.length) ok('daylight');
  }

  // 7. walkways: flood from the entrance at 60 and 80 cm body width
  const walk = walkways(flat, placed, obstacles, V, ok, cell);
  return { violations: V, passed, walk, ms: performance.now() - t0 };
}

function openingRect(o: Opening, T: number): V2[] { // the doorway through the wall, T deep
  const n = o.wall.n;
  return [o.a, o.b, [o.b[0] + n[0] * T, o.b[1] + n[1] * T], [o.a[0] + n[0] * T, o.a[1] + n[1] * T]];
}
export function otherRoom(flat: Flat, o: Opening): string | undefined {
  const m: V2 = [(o.a[0] + o.b[0]) / 2 + o.wall.n[0] * (flat.T + 5), (o.a[1] + o.b[1]) / 2 + o.wall.n[1] * (flat.T + 5)];
  return flat.rooms.find((r) => insidePoly(m, r.poly))?.id;
}
function insidePoly(pt: V2, p: V2[]) {
  let r = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if (p[i][1] > pt[1] !== p[j][1] > pt[1] && pt[0] < ((p[j][0] - p[i][0]) * (pt[1] - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) r = !r;
  return r;
}
const doorName = (o: Opening) => o.name ?? o.id.replace(/-/g, ' ');

type Placed = { it: Item; room: Room; fp: V2[] };

function walkways(flat: Flat, placed: Placed[], obstacles: Fixture[], V: Violation[], ok: (r: string) => void, cell: number): WalkMap {
  const all = flat.rooms.flatMap((r) => r.poly), b = bbox(all), pad = flat.T + 110;
  const g = new Grid(b.x0 - pad, b.z0 - pad, b.x1 + pad, b.z1 + pad, cell);
  const room = new Uint8Array(g.size), portal = new Uint8Array(g.size), structural = new Uint8Array(g.size), free = new Uint8Array(g.size);
  flat.rooms.forEach((r, i) => g.fill(r.poly, (k) => { room[k] = i + 1; structural[k] = 1; }));
  const doors = flat.openings.filter((o) => o.kind === 'door');
  // the flat's front door: the door with no room on its far side; a 100 cm landing outside it is open floor
  const entrance = doors.find((o) => !otherRoom(flat, o)) ?? doors[0];
  for (const o of doors) g.fill(openingRect(o, o === entrance ? flat.T + 100 : flat.T), (k) => { portal[k] = 1; structural[k] = 1; });
  for (const f of obstacles) g.fill(f.poly, (k) => { structural[k] = 0; });
  free.set(structural);
  for (const P of placed) if (blocks(P.it) && !CHAIRS.has(P.it.kind)) g.fill(P.fp, (k) => { free[k] = 0; }); // chairs move out of the way
  const clear = distanceTo(g, (k) => !free[k]);
  const pass = (w: number) => (k: number) => !!free[k] && (!!portal[k] || clear[k] >= w / 2 - 0.5);
  const starts: number[] = [];
  g.fill(openingRect(entrance, flat.T + 100), (k) => starts.push(k));
  const reach60 = flood(g, starts, pass(LIMITS.walkWarn)), reach80 = flood(g, starts, pass(LIMITS.walkGood));
  // narrow passages: 60 cm walker positions that no 80 cm walker covers, widened to the 60 cm body
  const swept80 = distanceTo(g, (k) => !!reach80[k]);
  const tight = distanceTo(g, (k) => !!reach60[k] && swept80[k] > LIMITS.walkGood / 2);
  const narrow = new Uint8Array(g.size);
  for (let k = 0; k < g.size; k++) if (free[k] && room[k] && tight[k] <= LIMITS.walkWarn / 2) narrow[k] = 1;

  // places a person must be able to reach
  // a target is reached when any of its zones is; seats can be reached from the front or either side
  const targets: { label: string; room: string; items: string[]; zone: V2[]; alt?: V2[][]; fail: Severity }[] = [];
  for (const o of doors) for (const rid of [o.room, otherRoom(flat, o)]) {
    const r = flat.rooms.find((x) => x.id === rid);
    if (!r || o === entrance) continue;
    targets.push({ label: `${doorName(o)} (${r.name.toLowerCase()} side)`, room: r.id, items: [], zone: stripInFront([o.a, o.b], r, LIMITS.accessDepth), fail: 'error' });
  }
  for (const o of flat.openings.filter((x) => x.kind === 'window')) {
    const r = flat.rooms.find((x) => x.id === o.room)!;
    targets.push({ label: o.id.replace(/-/g, ' '), room: r.id, items: [], zone: stripInFront([o.a, o.b], r, LIMITS.accessDepth), fail: 'warn' });
  }
  for (const P of placed) {
    const D = LIMITS.accessDepth, { w, d } = P.it;
    if (['wardrobe', 'chest', 'dresser', 'shelf', 'desk'].includes(P.it.kind))
      targets.push({ label: `front of ${name(P.it)}`, room: P.it.room, items: [P.it.id], zone: front(P.it, P.room, D), fail: 'error' });
    if (['sofa', 'armchair'].includes(P.it.kind))
      targets.push({ label: name(P.it), room: P.it.room, items: [P.it.id], zone: front(P.it, P.room, D), fail: 'error',
        alt: [localRect(P.it, P.room, w / 2, w / 2 + D, -d / 2, d / 2), localRect(P.it, P.room, -w / 2 - D, -w / 2, -d / 2, d / 2)] });
  }
  const status = (zone: V2[]): 0 | 1 | 2 | -1 => { // 2 good, 1 narrow only, 0 unreachable, -1 nothing to reach
    let any = false, s: 0 | 1 | 2 = 0;
    g.fill(zone, (k) => { if (!structural[k]) return; any = true; if (reach80[k]) s = 2; else if (reach60[k] && s < 1) s = 1; });
    return any ? s : -1;
  };
  for (const t of targets) {
    const s = Math.max(status(t.zone), ...(t.alt ?? []).map(status)) as ReturnType<typeof status>;
    if (s === 2 || s === -1) { ok('walkway'); continue; }
    V.push({
      rule: 'walkway', severity: s === 1 ? 'warn' : t.fail, room: t.room, items: t.items,
      msg: s === 1 ? `${cap(t.label)}: reachable only through a passage narrower than ${LIMITS.walkGood} cm` : `${cap(t.label)}: no ${LIMITS.walkWarn} cm path from the entrance`,
      zones: [{ shape: pc.union(poly(t.zone)), tone: s === 1 || t.fail === 'warn' ? 'amber' : 'red' }],
    });
  }
  // the bed needs one long side a person can reach
  for (const P of placed.filter((p) => p.it.kind === 'bed')) {
    const { w, d } = P.it, D = LIMITS.accessDepth;
    const sides = [localRect(P.it, P.room, w / 2, w / 2 + D, -d / 2 + 30, d / 2), localRect(P.it, P.room, -w / 2 - D, -w / 2, -d / 2 + 30, d / 2)];
    const st = sides.map(status), best = Math.max(...st);
    if (best === 2) { ok('bed'); continue; }
    V.push({
      rule: 'bed', severity: best === 1 ? 'warn' : 'error', room: P.it.room, items: [P.it.id],
      msg: best === 1 ? `${name(P.it)}: long sides reachable only through a passage narrower than ${LIMITS.walkGood} cm` : `${name(P.it)}: neither long side can be reached at ${LIMITS.walkWarn} cm`,
      zones: sides.map((s, i) => ({ shape: pc.union(poly(s)), tone: (st[i] === 1 ? 'amber' : 'red') as Zone['tone'] })),
    });
  }
  return { grid: g, room, narrow };
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
