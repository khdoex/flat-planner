// Two folders: the app (this package: index.html, src/, examples/) and the work folder the user runs
// it in (their data/, snapshots/, .planner-state.json). In a git checkout they are the same folder.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

let app: string | null = null;
export function appRoot(): string {
  if (app) return app;
  for (let d = dirname(fileURLToPath(import.meta.url)); d !== dirname(d); d = dirname(d)) {
    const p = join(d, 'package.json');
    if (existsSync(p) && JSON.parse(readFileSync(p, 'utf8')).name === 'flat-planner') return (app = d);
  }
  throw new Error('flat-planner: cannot find the package folder');
}

// $PLANNER_DATA, else <home>/data, else the bundled demo (read-only use)
export function dataDirOf(home: string): string {
  if (process.env.PLANNER_DATA) return resolve(home, process.env.PLANNER_DATA);
  return existsSync(join(home, 'data', 'flat.json')) ? resolve(home, 'data') : join(appRoot(), 'examples', 'demo');
}

// "data/x.json" -> absolute path inside the data folder, or null if it would leave it.
export function realPath(home: string, virtual: string | null): string | null {
  if (!virtual || !virtual.startsWith('data/')) return null;
  const dir = dataDirOf(home), abs = resolve(dir, virtual.slice(5));
  return abs.startsWith(dir + sep) && abs.endsWith('.json') ? abs : null;
}
