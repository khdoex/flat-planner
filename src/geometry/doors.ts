import type { Opening, V2 } from './types';

// Hinge pivot, closed-leaf direction and open-leaf direction of a door, in flat coordinates.
export function doorSwing(o: Opening, T: number): { P: V2; closed: V2; into: V2; arc: V2[] } {
  const n = o.wall.n;
  const into: V2 = o.swing === 'in' ? [-n[0], -n[1]] : n;
  const face = o.swing === 'in' ? 0 : T;
  const h0 = o.hinge === 'start' ? o.a : o.b, other = o.hinge === 'start' ? o.b : o.a;
  const P: V2 = [h0[0] + n[0] * face, h0[1] + n[1] * face];
  const closed: V2 = [(other[0] - h0[0]) / o.width, (other[1] - h0[1]) / o.width];
  // quarter disc swept by the leaf, as a polygon
  const arc: V2[] = [P];
  for (let k = 0; k <= 16; k++) {
    const t = (k / 16) * (Math.PI / 2), c = Math.cos(t), s = Math.sin(t);
    arc.push([P[0] + o.width * (closed[0] * c + into[0] * s), P[1] + o.width * (closed[1] * c + into[1] * s)]);
  }
  return { P, closed, into, arc };
}
