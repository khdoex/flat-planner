// polygon-clipping can fail on nearly parallel edges. Retry with coordinates snapped to a small grid:
// 0.01 cm, then 0.1 cm, far below tape-measure precision.
import pc from 'polygon-clipping';
import type { Geom, MultiPolygon } from 'polygon-clipping';

const snap = (g: Geom, q: number): Geom => JSON.parse(JSON.stringify(g), (_, v) => (typeof v === 'number' ? Math.round(v / q) * q : v));

function robust(op: (g: Geom, ...gs: Geom[]) => MultiPolygon) {
  return (g: Geom, ...gs: Geom[]): MultiPolygon => {
    try { return op(g, ...gs); } catch (first) {
      for (const q of [0.01, 0.1]) { try { return op(snap(g, q), ...gs.map((x) => snap(x, q))); } catch { /* next grid */ } }
      throw first;
    }
  };
}

export const union = robust(pc.union), intersection = robust(pc.intersection), difference = robust(pc.difference);
