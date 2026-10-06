// Pointer and keyboard handling: click selects, drag moves along the floor, Alt+drag turns the piece
// to face the pointer, R/Q/E rotate, A aligns to the nearest wall, Delete removes.
import type { PlanScene } from '../render/scene';
import type { V2 } from '../geometry/types';

export interface DragHandlers {
  isRug(id: string): boolean;
  itemPos(id: string): V2 | null; // flat coordinates of the item centre
  select(id: string | null): void;
  move(id: string, pos: V2): void;
  turn(id: string, degrees: number): void; // set absolute rotation
  align(): void;
  drop(id: string): void;
  rotate(delta: number): void;
  remove(): void;
  menu(id: string, clientX: number, clientY: number): void; // right-click on a piece
}

export function attachInteraction(ps: PlanScene, canvas: HTMLCanvasElement, h: DragHandlers) {
  let drag: { id: string; off: V2; moved: boolean; turn: boolean } | null = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // right button: orbit controls pan, contextmenu opens the size editor
    const id = ps.pick(e, h.isRug);
    if (!id) return;
    h.select(id);
    const hit = ps.floorHit(e), p = h.itemPos(id);
    drag = { id, off: hit && p ? [p[0] - hit[0], p[1] - hit[1]] : [0, 0], moved: false, turn: e.altKey };
    ps.controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const hit = ps.floorHit(e);
    if (!hit) return;
    drag.moved = true;
    if (drag.turn) {
      // the piece's front (+z) points at the cursor; 5 degree steps, Shift for free angles
      const c = h.itemPos(drag.id);
      if (!c) return;
      let deg = (Math.atan2(-(hit[0] - c[0]), hit[1] - c[1]) * 180) / Math.PI;
      deg = e.shiftKey ? Math.round(deg * 10) / 10 : Math.round(deg / 5) * 5;
      h.turn(drag.id, ((deg % 360) + 360) % 360);
    } else h.move(drag.id, [hit[0] + drag.off[0], hit[1] + drag.off[1]]);
  });

  const end = () => {
    if (!drag) return;
    if (drag.moved) h.drop(drag.id);
    drag = null; ps.controls.enabled = true;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('contextmenu', (e) => {
    const id = ps.pick(e as PointerEvent, h.isRug);
    if (!id) return;
    e.preventDefault();
    h.select(id);
    h.menu(id, e.clientX, e.clientY);
  });

  addEventListener('keydown', (e) => {
    const t = (e.target as HTMLElement).tagName;
    if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 'r') { h.rotate(e.shiftKey ? -90 : 90); e.preventDefault(); }
    if (k === 'e') { h.rotate(e.shiftKey ? 1 : 15); e.preventDefault(); }
    if (k === 'q') { h.rotate(e.shiftKey ? -1 : -15); e.preventDefault(); }
    if (k === 'a') { h.align(); e.preventDefault(); }
    if (e.key === 'Delete' || e.key === 'Backspace') { h.remove(); e.preventDefault(); }
    if (e.key === 'Escape') h.select(null);
  });
}
