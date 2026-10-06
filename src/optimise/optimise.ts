// Search furniture arrangements for one room by simulated annealing over the rule score.
// Pieces that belong together (a monitor on its desk, chairs at their table, a rug under its coffee table)
// move as one group. Moves: put a group against a wall, nudge, turn, swap two groups, align to a wall.
import type { Flat, Item, Room, V2 } from '../geometry/types';
import { footprint, inside } from '../geometry/poly';
import { alignToWall, backDir } from '../geometry/align';
import { checkLayout, otherRoom, type RuleResult } from '../rules/rules';

export interface OptimiseOptions { room: string; iters: number; restarts: number; seed: number; keep: string[]; top: number }
export interface Candidate { items: Item[]; score: number; errors: number; warnings: number; soft: number }

const WEIGHT = { error: 1000, warn: 100 };
const SEARCH_CELL = 5; // cm; candidates are re-checked at the normal 2.5 cm afterwards
// cost per cm between a piece's back and the nearest wall; a bed off the wall reads as wrong, so it costs most.
// For scale: one warning costs 100, about 30 cm of gap for most pieces.
const BACK_TO_WALL: Record<string, number> = { bed: 8, wardrobe: 3, chest: 3, dresser: 3, shelf: 3, desk: 3, sofa: 3, nightstand: 2 };
const NIGHTSTAND_TO_BED = 3; // cost per cm between a nightstand and its place beside the bed head

// mulberry32: small seeded random generator, so runs are reproducible
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const segDist = (p: V2, a: V2, b: V2) => {
  const ab: V2 = [b[0] - a[0], b[1] - a[1]], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2)));
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t);
};
const polyDist = (p: V2, poly: V2[]) => (inside(p, poly) ? 0 : Math.min(...poly.map((a, i) => segDist(p, a, poly[(i + 1) % poly.length]))));

// The room alone, with its doors as entrances: walkways are judged from where you enter the room.
function roomFlat(flat: Flat, room: Room): Flat {
  return {
    ...flat, rooms: [room], checks: [],
    openings: flat.openings.filter((o) => o.room === room.id || otherRoom(flat, o) === room.id),
    fixtures: flat.fixtures.filter((f) => f.room === room.id),
  };
}

interface Member { it: Item; du: number; dv: number; drot: number }
interface Group { base: Item; members: Member[]; vmin: number }

function toLocal(base: Item, x: number, z: number): [number, number] {
  const t = (base.rotation * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), dx = x - base.x, dz = z - base.z;
  return [dx * c + dz * s, -dx * s + dz * c];
}

function buildGroups(items: Item[], room: Room, keep: Set<string>): Group[] {
  const fp = new Map(items.map((it) => [it.id, footprint(it, room)]));
  const centre = (it: Item): V2 => [room.origin[0] + it.x, room.origin[1] + it.z];
  const parent = new Map<string, Item>();
  for (const it of items) {
    if (keep.has(it.id)) continue;
    const floor = items.filter((o) => o !== it && !(o.y && o.y > 0) && o.h > 2);
    let p: Item | undefined;
    if (it.y && it.y > 0) p = floor.find((o) => inside(centre(it), fp.get(o.id)!)); // sits on it
    else if (['chair', 'markus'].includes(it.kind)) // tucked at a table or desk
      p = floor.filter((o) => ['table', 'desk'].includes(o.kind)).map((o) => ({ o, d: polyDist(centre(it), fp.get(o.id)!) })).filter((x) => x.d <= 45).sort((a, b) => a.d - b.d)[0]?.o;
    else if (it.h <= 2) // a rug follows what stands on its middle
      p = ['coffee', 'bed', 'table', 'sofa'].map((k) => floor.find((o) => o.kind === k && inside(centre(o), fp.get(it.id)!))).find(Boolean);
    if (p && !keep.has(p.id)) parent.set(it.id, p);
  }
  const groups: Group[] = [];
  for (const base of items) {
    if (keep.has(base.id) || parent.has(base.id) || base.h <= 2) continue; // lone rugs stay put
    const members = items.filter((m) => parent.get(m.id) === base).map((it) => { const [du, dv] = toLocal(base, it.x, it.z); return { it, du, dv, drot: it.rotation - base.rotation }; });
    // how far the group reaches behind the base centre (rugs excluded: they may slide under things)
    let vmin = -base.d / 2;
    for (const m of members) if (m.it.h > 2) for (const q of footprint(m.it, room)) vmin = Math.min(vmin, toLocal(base, q[0] - room.origin[0], q[1] - room.origin[1])[1]);
    groups.push({ base, members, vmin });
  }
  return groups;
}

function place(g: Group, x: number, z: number, rotation: number) {
  const r = ((rotation % 360) + 360) % 360, t = (r * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  Object.assign(g.base, { x, z, rotation: r });
  for (const m of g.members) Object.assign(m.it, { x: x + m.du * c - m.dv * s, z: z + m.du * s + m.dv * c, rotation: (((r + m.drot) % 360) + 360) % 360 });
}

function soft(items: Item[], room: Room, original: Map<string, Item>): number {
  let p = 0;
  const walls = room.walls.filter((w) => !w.open);
  for (const it of items) {
    if (BACK_TO_WALL[it.kind] && !(it.y && it.y > 0)) {
      const b = backDir(it.rotation), c: V2 = [room.origin[0] + it.x + b[0] * it.d / 2, room.origin[1] + it.z + b[1] * it.d / 2];
      p += Math.min(150, Math.min(...walls.map((w) => segDist(c, w.a, w.b)))) * BACK_TO_WALL[it.kind];
    }
    const o = original.get(it.id)!;
    p += Math.hypot(it.x - o.x, it.z - o.z) * 0.01; // among equals, prefer fewer changes
  }
  // nightstands beside the bed head, one per side
  const bed = items.find((i) => i.kind === 'bed');
  if (bed) {
    const t = (bed.rotation * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const slots = [1, -1].map((side) => ({ side, used: false }));
    for (const n of items.filter((i) => i.kind === 'nightstand')) {
      let best = Infinity, which = slots[0];
      for (const sl of slots) {
        if (sl.used) continue;
        const u = sl.side * (bed.w / 2 + n.w / 2 + 2), v = -bed.d / 2 + n.d / 2 + 5;
        const d = Math.hypot(bed.x + u * c - v * s - n.x, bed.z + u * s + v * c - n.z);
        if (d < best) { best = d; which = sl; }
      }
      if (Number.isFinite(best)) { which.used = true; p += best * NIGHTSTAND_TO_BED; }
    }
  }
  return p;
}

function score(sub: Flat, items: Item[], room: Room, original: Map<string, Item>, cell: number): Candidate & { res: RuleResult } {
  const res = checkLayout(sub, items, cell);
  const errors = res.violations.filter((v) => v.severity === 'error').length, warnings = res.violations.length - errors;
  const sf = soft(items, room, original);
  return { items, res, errors, warnings, soft: sf, score: errors * WEIGHT.error + warnings * WEIGHT.warn + sf };
}

const clone = (items: Item[]) => items.map((i) => ({ ...i }));
const signature = (items: Item[]) => items.map((i) => `${i.id}:${Math.round(i.x / 30)},${Math.round(i.z / 30)},${Math.round(i.rotation / 45) % 8}`).join('|');

export function optimise(flat: Flat, layout: Item[], o: OptimiseOptions, log: (s: string) => void = () => {}) {
  const found = flat.rooms.find((r) => r.id === o.room);
  if (!found) throw new Error(`no room "${o.room}" (rooms: ${flat.rooms.map((r) => r.id).join(', ')})`);
  const room: Room = found, sub = roomFlat(flat, room), keep = new Set(o.keep);
  const start = layout.filter((i) => i.room === room.id);
  const original = new Map(start.map((i) => [i.id, { ...i }]));
  const rand = rng(o.seed), walls = room.walls.filter((w) => !w.open);
  const current = score(sub, clone(start), room, original, SEARCH_CELL);
  const pool: Candidate[] = [];
  const remember = (c: Candidate) => {
    const sig = signature(c.items), same = pool.findIndex((p) => signature(p.items) === sig);
    if (same >= 0) { if (pool[same].score > c.score) pool[same] = { ...c, items: clone(c.items) }; return; }
    pool.push({ ...c, items: clone(c.items) }); pool.sort((a, b) => a.score - b.score); pool.length = Math.min(pool.length, 40);
  };

  for (let r = 0; r < o.restarts; r++) {
    const items = clone(start), groups = buildGroups(items, room, keep);
    if (r > 0) for (const g of groups) wallMove(g); // later restarts begin from a random arrangement
    let cur = score(sub, items, room, original, SEARCH_CELL);
    remember(cur);
    for (let k = 0; k < o.iters; k++) {
      const T = 300 * Math.pow(2 / 300, k / o.iters);
      const saved = clone(items);
      const g = groups[Math.floor(rand() * groups.length)], m = rand();
      if (!g) break;
      if (m < 0.35) wallMove(g);
      else if (m < 0.65) place(g, g.base.x + gauss() * 15, g.base.z + gauss() * 15, g.base.rotation);
      else if (m < 0.8) place(g, g.base.x, g.base.z, g.base.rotation + [90, 180, 270][Math.floor(rand() * 3)]);
      else if (m < 0.9 && groups.length > 1) {
        const h = groups[Math.floor(rand() * groups.length)];
        const [x, z, rot] = [g.base.x, g.base.z, g.base.rotation];
        place(g, h.base.x, h.base.z, h.base.rotation); place(h, x, z, rot);
      } else { const a = alignToWall(g.base, room, flat.fixtures); place(g, a.x!, a.z!, a.rotation!); }
      const next = score(sub, items, room, original, SEARCH_CELL);
      if (next.score <= cur.score || rand() < Math.exp((cur.score - next.score) / T)) { cur = next; remember(cur); }
      else { items.forEach((it, i) => Object.assign(it, saved[i])); }
    }
    log(`restart ${r + 1}/${o.restarts}: best so far ${pool[0]?.score.toFixed(0)}`);
  }

  function wallMove(g: Group) { // back of the group against a random wall, parallel and flush
    const w = walls[Math.floor(rand() * walls.length)], t = rand() * w.len;
    const u: V2 = [(w.b[0] - w.a[0]) / w.len, (w.b[1] - w.a[1]) / w.len], dist = -g.vmin + 0.5;
    const cx = w.a[0] + u[0] * t - w.n[0] * dist - room.origin[0], cz = w.a[1] + u[1] * t - w.n[1] * dist - room.origin[1];
    place(g, cx, cz, (Math.atan2(w.n[0], -w.n[1]) * 180) / Math.PI);
  }
  function gauss() { return Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand()); }

  // re-check the best distinct candidates at full precision, inside the whole flat
  const others = layout.filter((i) => i.room !== room.id);
  const final = (items: Item[]) => {
    const all = [...others, ...items.map((i) => ({ ...i, x: Math.round(i.x * 10) / 10, z: Math.round(i.z * 10) / 10, rotation: Math.round(i.rotation * 10) / 10 }))];
    const res = checkLayout(flat, all).violations.filter((v) => v.room === room.id);
    const errors = res.filter((v) => v.severity === 'error').length, warnings = res.length - errors;
    const sf = soft(all.filter((i) => i.room === room.id), room, original);
    return { items: all, errors, warnings, soft: sf, score: errors * WEIGHT.error + warnings * WEIGHT.warn + sf, violations: res };
  };
  const baseline = final(start);
  const top: ReturnType<typeof final>[] = [];
  for (const c of pool) {
    if (top.length >= o.top) break;
    const f = final(c.items);
    // keep candidates that differ from each other in at least one group by 40 cm or a turn
    // only real improvements on the current layout, each different from the others
    if (f.score >= baseline.score || !differs(baseline.items, f.items) || top.some((t) => !differs(t.items, f.items))) continue;
    top.push(f);
  }
  top.sort((a, b) => a.score - b.score);
  return { baseline, top, start: current };

  function differs(a: Item[], b: Item[]) {
    return a.some((x) => { const y = b.find((i) => i.id === x.id); return y && x.room === room.id && (Math.hypot(x.x - y.x, x.z - y.z) > 40 || Math.abs(((x.rotation - y.rotation + 540) % 360) - 180) > 45); });
  }
}
