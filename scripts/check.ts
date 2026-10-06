// flat-planner check [--layout data/layouts/x.json]: lists rule violations for a layout.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { resolveFlat } from '../src/geometry/flat';
import { checkLayout } from '../src/rules/rules';
import { readState } from '../server/plugin';
import { realPath } from '../shared/paths';
import type { FlatFile, LayoutFile } from '../src/geometry/types';

export function check(args: string[], home: string) {
  const { values: a } = parseArgs({ args, options: { layout: { type: 'string' } } });
  const layoutPath = a.layout ?? readState(home).layout;
  const flat = resolveFlat(JSON.parse(readFileSync(realPath(home, 'data/flat.json')!, 'utf8')) as FlatFile);
  const layout = JSON.parse(readFileSync(realPath(home, layoutPath)!, 'utf8')) as LayoutFile;
  const res = checkLayout(flat, layout.items);

  console.log(`${layoutPath}: ${layout.items.length} items, checked in ${res.ms.toFixed(0)} ms`);
  for (const r of flat.rooms) {
    const vs = res.violations.filter((v) => v.room === r.id).sort((p, q) => (p.severity === q.severity ? 0 : p.severity === 'error' ? -1 : 1));
    if (!vs.length) continue;
    console.log(`\n${r.name}`);
    for (const v of vs) console.log(`  ${v.severity === 'error' ? 'ERROR' : 'warn '}  ${v.rule.padEnd(9)} ${v.msg}`);
  }
  const n = (s: string) => res.violations.filter((v) => v.severity === s).length;
  console.log(`\n${n('error')} errors, ${n('warn')} warnings; passed: ${Object.entries(res.passed).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
