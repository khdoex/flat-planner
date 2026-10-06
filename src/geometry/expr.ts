// Small arithmetic evaluator for the expressions in data/flat.json.
// Only names from the scope or FUNCS are allowed, so file content cannot reach globals.

export type Expr = string | number;

function circ(x1: number, z1: number, r1: number, x2: number, z2: number, r2: number): [number, number] {
  const dx = x2 - x1, dz = z2 - z1, d = Math.hypot(dx, dz);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h2 = r1 * r1 - a * a;
  if (!(d > 0) || h2 < 0) throw new Error(`circles do not meet (centres ${d.toFixed(1)} apart, radii ${r1} and ${r2})`);
  const h = Math.sqrt(h2), mx = x1 + (a * dx) / d, mz = z1 + (a * dz) / d;
  const p: [number, number] = [mx - (h * dz) / d, mz + (h * dx) / d];
  const q: [number, number] = [mx + (h * dz) / d, mz - (h * dx) / d];
  return p[0] >= q[0] ? p : q; // the intersection with the larger x
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  lerp: (a, b, t) => a + (b - a) * t,
  sqrt: Math.sqrt,
  hypot: Math.hypot,
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  circX: (x1, z1, r1, x2, z2, r2) => circ(x1, z1, r1, x2, z2, r2)[0],
  circZ: (x1, z1, r1, x2, z2, r2) => circ(x1, z1, r1, x2, z2, r2)[1],
};

export function evaluate(e: Expr, scope: Record<string, number>): number {
  if (typeof e === 'number') return e;
  if (!/^[\w\s.+\-*/(),]*$/.test(e)) throw new Error(`bad characters in "${e}"`);
  for (const id of e.match(/[A-Za-z_]\w*/g) ?? [])
    if (!(id in scope) && !(id in FUNCS)) throw new Error(`unknown name "${id}" in "${e}"`);
  const names = [...Object.keys(FUNCS), ...Object.keys(scope)];
  const args = names.map((n) => (n in FUNCS ? FUNCS[n] : scope[n]));
  const v = new Function(...names, `"use strict"; return (${e});`)(...args);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`"${e}" is not a finite number`);
  return v;
}
