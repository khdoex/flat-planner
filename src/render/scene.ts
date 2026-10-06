// three.js scene: structure from the resolved flat, furniture from the layout, camera, wall fade.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MultiPolygon } from 'polygon-clipping';
import type { Flat, Item, Room, V2 } from '../geometry/types';
import { bbox } from '../geometry/poly';
import { computeWalls, openingFootprint } from './walls';
import { doorSwing } from '../geometry/doors';
import { makeItem } from './furniture';
import { makeLabel } from './labels';
import type { Zone, WalkMap } from '../rules/rules';

const FLOOR: Record<string, number> = {
  'laminate-dark': 0x5c3e2e, 'laminate-wood': 0x8a6346, tile: 0xd6d1c6, marble: 0xcfccc6, bath: 0x5f5d5a,
};
const WALL = 0xe9e3d2;

function fixtureMat(kind: string): THREE.Material {
  switch (kind) {
    case 'wall': return new THREE.MeshStandardMaterial({ color: WALL, roughness: 0.95 });
    case 'radiator': return new THREE.MeshStandardMaterial({ color: 0xf3f2ee, roughness: 0.6 });
    case 'plate': return new THREE.MeshBasicMaterial({ color: 0xe09a2b });
    case 'cabinet': return new THREE.MeshStandardMaterial({ color: 0xedeae3, roughness: 0.7 });
    case 'metal': return new THREE.MeshStandardMaterial({ color: 0x8e9196, roughness: 0.3 });
    case 'glass': return new THREE.MeshStandardMaterial({ color: 0xbfd6e2, transparent: true, opacity: 0.3, depthWrite: false });
    default: return new THREE.MeshStandardMaterial({ color: 0xfafaf8, roughness: 0.5 });
  }
}

// Plan coordinates (x, z) to a shape in the XY plane; rotating by -90 deg about X maps it back to (x, y=0, z).
function toShapes(m: MultiPolygon): THREE.Shape[] {
  return m.map((poly) => {
    const s = new THREE.Shape(poly[0].map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const hole of poly.slice(1)) s.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
    return s;
  });
}
function prism(shape: MultiPolygon, y0: number, y1: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(toShapes(shape), { depth: Math.max(y1 - y0, 0.1), bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = y0;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

interface FadeRec { mats: THREE.Material[]; base: number[]; n: V2; mid: V2 }

export class PlanScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 5, 30000);
  controls: OrbitControls;
  sun = new THREE.DirectionalLight(0xffffff, 2.0);
  structure = new THREE.Group();
  furniture = new THREE.Group();
  overlay = new THREE.Group();
  meshes = new Map<string, THREE.Group>();
  fades: FadeRec[] = [];
  bounds = { x0: 0, z0: 0, x1: 500, z1: 500 };
  showLabels = true;
  fadeRate = 0.2; // 1 = instant, used by snapshots
  selected: string | null = null;
  private anim: { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number } | null = null;
  private ray = new THREE.Raycaster();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.minDistance = 150; this.controls.maxDistance = 20000;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5a4a, 2.2));
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(this.sun, this.sun.target, this.structure, this.furniture, this.overlay);
    this.setBackground();
  }

  setBackground() {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--scene').trim() || '#E4E8E6';
    this.scene.background = new THREE.Color(c);
  }

  build(flat: Flat, visible: Room[], whole: boolean) {
    this.structure.clear(); this.fades = [];
    const ids = new Set(visible.map((r) => r.id));
    this.bounds = bbox(visible.flatMap((r) => r.poly));
    const fadeFor = new Map<string, FadeRec>();
    const rec = (key: string, n: V2, mid: V2) => {
      let r = fadeFor.get(key);
      if (!r) { r = { mats: [], base: [], n, mid }; fadeFor.set(key, r); this.fades.push(r); }
      return r;
    };
    const fadeMat = (r: FadeRec, m: THREE.Material, base: number) => { m.transparent = true; m.opacity = base; r.mats.push(m); r.base.push(base); return m; };

    for (const r of visible) {
      const f = prism([[r.poly]], -0.5, 0, new THREE.MeshStandardMaterial({ color: FLOOR[r.floor] ?? 0x999999, roughness: 0.8 }));
      f.castShadow = false; this.structure.add(f);
      if (whole) {
        const c = bbox(r.poly), l = makeLabel(r.name, 30);
        l.position.set((c.x0 + c.x1) / 2, 40, (c.z0 + c.z1) / 2); this.structure.add(l);
      }
    }

    for (const p of computeWalls(flat, visible)) {
      const w = p.wall, key = `${w.room}/${w.id}/${w.n.join(',')}`;
      const r = rec(key, w.n, [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]);
      this.structure.add(prism(p.shape, p.y0, p.y1, fadeMat(r, new THREE.MeshStandardMaterial({ color: WALL, roughness: 0.95 }), 1)));
    }

    for (const o of flat.openings) {
      if (!ids.has(o.room)) continue;
      const w = o.wall, u: V2 = [(o.b[0] - o.a[0]) / o.width, (o.b[1] - o.a[1]) / o.width];
      const r = rec(`${w.room}/${w.id}/${w.n.join(',')}`, w.n, [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]);
      const ang = Math.atan2(-u[1], u[0]);
      const mx = (o.a[0] + o.b[0]) / 2 + (w.n[0] * flat.T) / 2, mz = (o.a[1] + o.b[1]) / 2 + (w.n[1] * flat.T) / 2;
      if (o.kind === 'window') {
        const h = o.y1 - o.y0, ym = (o.y0 + o.y1) / 2;
        const glass = new THREE.Mesh(new THREE.BoxGeometry(o.width, h, 2), fadeMat(r, new THREE.MeshStandardMaterial({ color: 0x9ccbe6, roughness: 0.1 }), 0.35));
        glass.position.set(mx, ym, mz); glass.rotation.y = ang; this.structure.add(glass);
        const frame = fadeMat(r, new THREE.MeshStandardMaterial({ color: 0x6b4a36 }), 1);
        for (let k = 1; k < o.mullions; k++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(5, h, 6), frame), s = (o.width * k) / o.mullions - o.width / 2;
          m.position.set(mx + u[0] * s, ym, mz + u[1] * s); m.rotation.y = ang; this.structure.add(m);
        }
      } else {
        // door: open leaf at 90 degrees plus the swing arc on the floor
        const { P, closed, into } = doorSwing(o, flat.T);
        const leafMat = new THREE.MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.6, transparent: true, opacity: 0.35, depthWrite: false });
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(o.width, o.y1, 4), leafMat);
        leaf.position.set(P[0] + (into[0] * o.width) / 2, o.y1 / 2, P[1] + (into[1] * o.width) / 2);
        leaf.rotation.y = Math.atan2(-into[1], into[0]); this.structure.add(leaf);
        const tc = Math.atan2(-closed[1], closed[0]), ti = Math.atan2(-into[1], into[0]);
        let dt = ti - tc; while (dt > Math.PI) dt -= 2 * Math.PI; while (dt < -Math.PI) dt += 2 * Math.PI;
        const arc = new THREE.Mesh(new THREE.RingGeometry(o.width - 1, o.width + 1, 32, 1, dt > 0 ? tc : ti, Math.abs(dt)),
          new THREE.MeshBasicMaterial({ color: 0x8a6a55, side: THREE.DoubleSide }));
        arc.rotation.x = -Math.PI / 2; arc.position.set(P[0], 0.6, P[1]); this.structure.add(arc);
        // threshold so the floor reads as continuous through the doorway
        const th = prism([openingFootprint(o, flat.T)], -0.5, 0.2,
          new THREE.MeshStandardMaterial({ color: FLOOR[flat.rooms.find((x) => x.id === o.room)?.floor ?? ''] ?? 0x999999, roughness: 0.8 }));
        th.castShadow = false; this.structure.add(th);
      }
    }

    for (const fx of flat.fixtures) {
      if (!ids.has(fx.room)) continue;
      const m = prism([[fx.poly]], fx.y0, fx.y0 + fx.h, fixtureMat(fx.mat));
      if (fx.mat === 'glass' || fx.mat === 'plate') m.castShadow = false;
      this.structure.add(m);
      if (fx.label && !whole) {
        const c = bbox(fx.poly), l = makeLabel(fx.name, 13);
        l.position.set((c.x0 + c.x1) / 2, Math.min(fx.y0 + fx.h, flat.H) + 14, (c.z0 + c.z1) / 2); this.structure.add(l);
      }
    }

    const { x0, z0, x1, z1 } = this.bounds, s = Math.max(x1 - x0, z1 - z0);
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 10, far: 4000 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.applyLabelVisibility();
  }

  setItems(items: Item[], rooms: Room[], labels: boolean) {
    this.furniture.clear(); this.meshes.clear();
    for (const it of items) {
      const room = rooms.find((r) => r.id === it.room);
      if (!room) continue;
      const g = makeItem(it, labels);
      this.place(g, it, room);
      this.furniture.add(g); this.meshes.set(it.id, g);
    }
    this.highlight(); this.applyLabelVisibility();
  }

  place(g: THREE.Object3D, it: Item, room: Room) {
    g.position.set(room.origin[0] + it.x, it.y ?? 0, room.origin[1] + it.z);
    g.rotation.y = (-it.rotation * Math.PI) / 180;
  }

  highlight() {
    this.meshes.forEach((g, id) => g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!(o as THREE.Mesh).isMesh || !m?.emissive || o.userData.glow) return;
      m.emissive.setHex(id === this.selected ? 0x2f6f8f : 0); m.emissiveIntensity = id === this.selected ? 0.35 : 0;
    }));
  }

  // Rule zones (red = error, amber = warning) and cells passable at 60 cm but not at 80 cm.
  setOverlay(zones: Zone[], walk: WalkMap | null, roomIdx: Set<number>) {
    this.overlay.clear();
    const mat = { red: new THREE.MeshBasicMaterial({ color: 0xd0402b, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
      amber: new THREE.MeshBasicMaterial({ color: 0xe8a33a, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }) };
    for (const z of zones) {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(toShapes(z.shape)), mat[z.tone]);
      m.rotation.x = -Math.PI / 2; m.position.y = 1.5; m.renderOrder = 5; this.overlay.add(m);
    }
    if (!walk) return;
    const g = walk.grid, data = new Uint8Array(g.nx * g.nz * 4);
    for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
      const k = j * g.nx + i;
      if (!walk.narrow[k] || !roomIdx.has(walk.room[k])) continue;
      const o = ((g.nz - 1 - j) * g.nx + i) * 4; // texture row 0 is the far (max z) edge after the plane is laid flat
      data[o] = 232; data[o + 1] = 163; data[o + 2] = 58; data[o + 3] = 110;
    }
    const tex = new THREE.DataTexture(data, g.nx, g.nz); tex.needsUpdate = true;
    const W = g.nx * g.cell, L = g.nz * g.cell;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2; plane.position.set(g.x0 + W / 2, 1.2, g.z0 + L / 2); plane.renderOrder = 4;
    this.overlay.add(plane);
  }

  setLabels(on: boolean) { this.showLabels = on; this.applyLabelVisibility(); }
  private applyLabelVisibility() { this.scene.traverse((o) => { if (o.userData.label) o.visible = this.showLabels; }); }

  frame(mode: '3d' | 'top', animate: boolean) {
    const { x0, z0, x1, z1 } = this.bounds, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0, L = z1 - z0;
    this.controls.target.set(cx, mode === 'top' ? 0 : 60, cz);
    // narrow lens for the plan view, so walls barely lean
    this.camera.fov = mode === 'top' ? 12 : 45; this.camera.updateProjectionMatrix();
    let to: THREE.Vector3;
    if (mode === 'top') {
      const half = Math.tan((this.camera.fov * Math.PI) / 360);
      const dist = (Math.max(L, W / this.camera.aspect) * 1.22) / (2 * half);
      to = new THREE.Vector3(cx, dist, cz + 0.01); // windows at the top of the screen
    } else {
      const s = Math.max(W, L, 480);
      to = new THREE.Vector3(cx + 1.05 * s, 0.78 * s + 60, cz + 1.05 * s);
    }
    const dur = animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 600 : 0;
    if (!dur) { this.camera.position.copy(to); this.anim = null; this.controls.update(); return; }
    this.anim = { from: this.camera.position.clone(), to, t0: performance.now(), dur };
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  private ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  floorHit(e: PointerEvent): V2 | null {
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? [p.x, p.z] : null;
  }

  // Topmost item under the pointer; rugs only win when nothing else is hit.
  pick(e: PointerEvent, isRug: (id: string) => boolean): string | null {
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const targets: THREE.Object3D[] = [];
    this.furniture.traverse((o) => { if ((o as THREE.Mesh).isMesh) targets.push(o); });
    const ids = this.ray.intersectObjects(targets, false).map((h) => {
      let o: THREE.Object3D | null = h.object; while (o && !o.userData.id) o = o.parent; return o?.userData.id as string | undefined;
    }).filter((x): x is string => !!x);
    return ids.find((id) => !isRug(id)) ?? ids[0] ?? null;
  }

  tick(t: number) {
    if (this.anim) {
      const a = this.anim, k = Math.min(1, (t - a.t0) / a.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.camera.position.lerpVectors(a.from, a.to, e);
      if (k >= 1) this.anim = null;
    }
    this.controls.update();
    const { x0, z0, x1, z1 } = this.bounds, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const dx = this.camera.position.x - cx, dz = this.camera.position.z - cz, dl = Math.hypot(dx, dz) || 1;
    const topish = this.controls.getPolarAngle() < 0.35;
    for (const f of this.fades) {
      const facing = f.n[0] * dx / dl + f.n[1] * dz / dl > 0.25;
      const near = (f.mid[0] - cx) * dx / dl + (f.mid[1] - cz) * dz / dl > 0;
      const fade = !topish && facing && near;
      f.mats.forEach((m, i) => { const target = fade ? 0.08 : f.base[i]; m.opacity += (target - m.opacity) * this.fadeRate; m.depthWrite = m.opacity > 0.9; });
    }
    this.sun.position.set(cx - 250, 700, cz - 350); this.sun.target.position.set(cx, 0, cz);
    this.renderer.render(this.scene, this.camera);
  }
}
