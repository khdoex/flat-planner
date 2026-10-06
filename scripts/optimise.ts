// flat-planner optimise --room <id> [--layout data/layouts/x.json] [--iters 3000] [--restarts 3] [--seed 1] [--keep id,id] [--top 3]
// Searches arrangements of one room against the rules and writes the best candidates to data/layouts/opt-<room>-<n>.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { resolveFlat } from '../src/geometry/flat';
import { optimise } from '../src/optimise/optimise';
import { readState } from '../server/plugin';
import { realPath } from '../shared/paths';
import { formatJson } from '../shared/jsonfmt';
import type { FlatFile, LayoutFile } from '../src/geometry/types';

export function optimiseCmd(args: string[], home: string) {
  const { values: a } = parseArgs({
    args,
    options: {
      room: { type: 'string' }, layout: { type: 'string' }, iters: { type: 'string', default: '3000' }, restarts: { type: 'string', default: '3' },
      seed: { type: 'string', default: '1' }, keep: { type: 'string', default: '' }, top: { type: 'string', default: '3' },
    },
  });
  if (!a.room) throw new Error('--room <id> is required');
  const layoutPath = a.layout ?? readState(home).layout;
  const flat = resolveFlat(JSON.parse(readFileSync(realPath(home, 'data/flat.json')!, 'utf8')) as FlatFile);
  const layout = JSON.parse(readFileSync(realPath(home, layoutPath)!, 'utf8')) as LayoutFile;
  const opts = { room: a.room, iters: +a.iters!, restarts: +a.restarts!, seed: +a.seed!, keep: a.keep!.split(',').filter(Boolean), top: +a.top! };
  console.log(`optimising ${a.room} from ${layoutPath}: ${opts.restarts} × ${opts.iters} steps, seed ${opts.seed}`);
  const t0 = performance.now();
  const { baseline, top } = optimise(flat, layout.items, opts, (s) => console.log('  ' + s));
  console.log(`done in ${((performance.now() - t0) / 1000).toFixed(1)} s\n`);

  const row = (name: string, c: { errors: number; warnings: number; soft: number }) => console.log(`  ${name.padEnd(28)} ${String(c.errors).padStart(6)} ${String(c.warnings).padStart(8)} ${c.soft.toFixed(0).padStart(6)}`);
  console.log(`  ${'layout'.padEnd(28)} ${'errors'.padStart(6)} ${'warnings'.padStart(8)} ${'soft'.padStart(6)}`);
  row(`${layoutPath.replace(/^data\//, '')} (now)`, baseline);
  top.forEach((c, i) => {
    const path = `data/layouts/opt-${a.room}-${i + 1}.json`, abs = realPath(home, path)!;
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, formatJson({
      name: `opt-${a.room}-${i + 1}`,
      note: `Optimiser candidate ${i + 1} for ${a.room} (seed ${opts.seed}): ${c.errors} errors, ${c.warnings} warnings. Other rooms as in ${layoutPath}.`,
      items: c.items,
    }));
    row(path.replace(/^data\//, ''), c);
  });
  console.log('\nsoft = how far backs are from walls and nightstands from the bed head (lower is better); errors and warnings come from `check`.');
  for (const [i, c] of top.entries()) if (c.violations.length) console.log(`\nopt-${a.room}-${i + 1}:\n${c.violations.map((v) => `  ${v.severity === 'error' ? 'ERROR' : 'warn '}  ${v.msg}`).join('\n')}`);
}
