// Floor grid for walkway checks: rasterised polygons, Euclidean distance transform, flood fill.
import type { V2 } from '../geometry/types';

export class Grid {
  nx: number; nz: number;
  constructor(public x0: number, public z0: number, x1: number, z1: number, public cell: number) {
    this.nx = Math.ceil((x1 - x0) / cell); this.nz = Math.ceil((z1 - z0) / cell);
  }
  get size() { return this.nx * this.nz; }
  centre(k: number): V2 { return [this.x0 + ((k % this.nx) + 0.5) * this.cell, this.z0 + (Math.floor(k / this.nx) + 0.5) * this.cell]; }

  // Calls fn for every cell whose centre lies inside the polygon (even-odd scanline).
  fill(poly: V2[], fn: (k: number) => void) {
    const { nx, nz, x0, z0, cell } = this;
    const zs = poly.map((p) => p[1]);
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((Math.max(...zs) - z0) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * cell, xs: number[] = [];
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const [xa, za] = poly[a], [xb, zb] = poly[b];
        if (za > z !== zb > z) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
      }
      xs.sort((p, q) => p - q);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        const i0 = Math.max(0, Math.ceil((xs[m] - x0) / cell - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[m + 1] - x0) / cell - 0.5));
        for (let i = i0; i <= i1; i++) fn(j * nx + i);
      }
    }
  }
}

// Felzenszwalb-Huttenlocher squared distance transform along one line.
function dt1(f: Float64Array, n: number, out: Float64Array) {
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; out[q] = (q - v[k]) ** 2 + f[v[k]]; }
}

// Distance in cm from every cell centre to the nearest cell where seed[k] is set.
export function distanceTo(g: Grid, seed: (k: number) => boolean): Float64Array {
  const { nx, nz } = g, INF = 1e20, d = new Float64Array(g.size);
  for (let k = 0; k < g.size; k++) d[k] = seed(k) ? 0 : INF;
  const f = new Float64Array(Math.max(nx, nz)), o = new Float64Array(Math.max(nx, nz));
  for (let i = 0; i < nx; i++) { for (let j = 0; j < nz; j++) f[j] = d[j * nx + i]; dt1(f, nz, o); for (let j = 0; j < nz; j++) d[j * nx + i] = o[j]; }
  for (let j = 0; j < nz; j++) { for (let i = 0; i < nx; i++) f[i] = d[j * nx + i]; dt1(f, nx, o); for (let i = 0; i < nx; i++) d[j * nx + i] = o[i]; }
  for (let k = 0; k < g.size; k++) d[k] = Math.sqrt(d[k]) * g.cell;
  return d;
}

// 4-neighbour flood from the start cells through cells where ok(k) holds.
export function flood(g: Grid, starts: number[], ok: (k: number) => boolean): Uint8Array {
  const seen = new Uint8Array(g.size), q = new Int32Array(g.size);
  let head = 0, tail = 0;
  for (const s of starts) if (ok(s) && !seen[s]) { seen[s] = 1; q[tail++] = s; }
  while (head < tail) {
    const k = q[head++], i = k % g.nx;
    for (const n of [k - g.nx, k + g.nx, i > 0 ? k - 1 : -1, i < g.nx - 1 ? k + 1 : -1])
      if (n >= 0 && n < g.size && !seen[n] && ok(n)) { seen[n] = 1; q[tail++] = n; }
  }
  return seen;
}
