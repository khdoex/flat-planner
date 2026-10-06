// npm run survey: what to measure next. Lists failing cross-checks, then every measurement that is
// not tape-measured, weakest evidence first, with the parts of the plan that depend on it.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveFlat } from '../src/geometry/flat';
import { realPath } from '../server/plugin';
import type { FlatFile, Status } from '../src/geometry/types';

const root = resolve(import.meta.dirname, '..');
const file = JSON.parse(readFileSync(realPath(root, 'data/flat.json')!, 'utf8')) as FlatFile;
const flat = resolveFlat(file);
const RANK: Status[] = ['uncertain', 'sketch', 'photo', 'guess', 'assumed'];
const names = (e: unknown): string[] => (typeof e === 'string' ? e.match(/[A-Za-z_]\w*/g) ?? [] : []);

// which dims each derived value rests on, followed through other derived values
const base = new Map<string, Set<string>>();
for (const [k, e] of Object.entries(file.derived)) {
  const s = new Set<string>();
  for (const n of names(e)) { if (n in file.dims) s.add(n); base.get(n)?.forEach((x) => s.add(x)); }
  base.set(k, s);
}
const dimsOf = (exprs: unknown[]) => {
  const s = new Set<string>();
  for (const e of exprs) for (const n of names(e)) { if (n in file.dims) s.add(n); base.get(n)?.forEach((x) => s.add(x)); }
  return s;
};

// parts of the plan that move when a dim changes
const users = new Map<string, string[]>(Object.keys(file.dims).map((k) => [k, []]));
const use = (exprs: unknown[], what: string) => dimsOf(exprs).forEach((k) => users.get(k)?.push(what));
for (const r of file.rooms) use(r.walls.flatMap((w) => w.from), `${r.name} walls`);
for (const o of file.openings) { // an opening moves with its own numbers and with the two ends of its wall
  const ws = file.rooms.find((r) => r.id === o.room)!.walls, i = ws.findIndex((w) => w.id === o.wall);
  use([o.from, o.width, o.y0, o.y1, ...ws[i].from, ...ws[(i + 1) % ws.length].from], o.name ?? o.id);
}
for (const f of file.fixtures) use([...(f.rect ?? []), ...(f.poly ?? []).flat(), f.y0, f.h], f.name);

const r0 = (v: number) => Math.round(v * 10) / 10;
const bad = flat.checks.filter((c) => !c.ok);
if (bad.length) {
  console.log('Cross-checks that disagree (re-measure every part named in them):');
  for (const c of bad) console.log(`  ${c.label}: ${r0(c.a)} vs ${r0(c.b)}, off by ${r0(Math.abs(c.a - c.b))} cm`);
  console.log('');
}
const todo = Object.entries(file.dims)
  .filter(([, d]) => d.status !== 'tape')
  .map(([k, d]) => ({ k, d, used: [...new Set(users.get(k))] }))
  .sort((a, b) => RANK.indexOf(a.d.status) - RANK.indexOf(b.d.status) || b.used.length - a.used.length);
console.log(`Measurements to take (${todo.length} of ${Object.keys(file.dims).length} are not tape-measured):`);
for (const t of todo) {
  const room = flat.rooms.find((r) => r.id === t.d.room)?.name ?? t.d.room;
  console.log(`  ${t.d.status.padEnd(9)} ${room}: ${t.d.label} = ${t.d.v} cm${t.d.note ? ` (${t.d.note})` : ''}`);
  console.log(`            moves: ${t.used.length ? t.used.join(', ') : 'nothing yet'}  [${t.k}]`);
}
if (flat.errors.length) console.log(`\nflat.json problems:\n  ${flat.errors.join('\n  ')}`);
