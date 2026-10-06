// Parametric furniture meshes. Local frame: x along w, z along d, back at -z, front at +z.
import * as THREE from 'three';
import type { Item } from '../geometry/types';
import { makeLabel } from './labels';

const OAK = '#C49A6C', GREY = 0x4a4d50;

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = h / 2, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function makeItem(it: Item, withLabel: boolean): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(it.color), roughness: 0.85 });
  const { w, d, h } = it;
  const add = (m: THREE.Object3D) => g.add(m);
  switch (it.kind) {
    case 'sofa': case 'armchair': {
      add(box(w, Math.min(45, h), d - 20, mat, 0, Math.min(45, h) / 2, 10));
      add(box(w, h, 20, mat, 0, h / 2, -d / 2 + 10));
      const aw = Math.min(18, w / 6);
      for (const s of [-1, 1]) add(box(aw, 60, d, mat, s * (w / 2 - aw / 2), 30));
      break;
    }
    case 'chair': case 'markus': {
      add(box(w, 6, d, mat, 0, 45));
      add(box(w, h - 48, 4, mat, 0, 48 + (h - 48) / 2, -d / 2 + 2));
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(box(4, 42, 4, mat, a * (w / 2 - 3), 21, b * (d / 2 - 3)));
      break;
    }
    case 'desk': case 'table': case 'coffee': {
      if (it.panels) { // closed sides and back panel
        add(box(w, 3, d, mat, 0, h - 1.5));
        for (const s of [-1, 1]) add(box(2, h - 3, d, mat, s * (w / 2 - 1), (h - 3) / 2));
        add(box(w - 4, h - 3, 2, mat, 0, (h - 3) / 2, -d / 2 + 1));
      } else {
        add(box(w, 4, d, mat, 0, h - 2));
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(box(5, h - 4, 5, mat, a * (w / 2 - 5), (h - 4) / 2, b * (d / 2 - 5)));
      }
      break;
    }
    case 'nightstand': {
      if (it.style !== 'oak') { add(box(w, h, d, mat)); break; }
      const grey = new THREE.MeshStandardMaterial({ color: GREY, roughness: 0.7 });
      mat.color.set(OAK);
      for (const a of [-1, 1]) add(box(w - 6, 12, 4, grey, 0, 6, a * (d / 2 - 4)));
      add(box(w, h - 12, d, mat, 0, 12 + (h - 12) / 2));
      add(box(18, 2, 1.5, grey, 0, 12 + (h - 12) * 0.3, d / 2 + 0.8));
      break;
    }
    case 'wardrobe': {
      if (it.style !== 'oak') { add(box(w, h, d, mat)); break; }
      const grey = new THREE.MeshStandardMaterial({ color: GREY, roughness: 0.7 });
      mat.color.set(OAK);
      add(box(w, h, d - 2, grey, 0, h / 2, -1));
      const fw = (w - 8) / 3, hi = h - 4 - 95 - 14 - 4;
      for (let i = 0; i < 3; i++) {
        const x = -w / 2 + 4 + fw * (i + 0.5);
        add(box(fw - 1, 95, 2, mat, x, 4 + 47.5, d / 2));
        add(box(fw - 1, hi, 2, mat, x, 4 + 95 + 14 + hi / 2, d / 2));
        add(box(fw - 1, 14, 2.5, grey, x, 4 + 95 + 7, d / 2 + 0.3));
      }
      break;
    }
    case 'bed': {
      add(box(w, 45, d - 8, mat, 0, 22.5, 4));
      add(box(w, h, 8, mat, 0, h / 2, -d / 2 + 4));
      break;
    }
    case 'lamp': {
      add(box(w * 0.8, 3, d * 0.8, mat, 0, 1.5));
      add(box(3, h - 30, 3, mat, 0, (h - 30) / 2));
      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.35, w / 2, 30, 20, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xf3e6cf, emissive: 0xffd9a0, emissiveIntensity: 0.6, side: THREE.DoubleSide }),
      );
      shade.position.y = h - 15; shade.userData.glow = true; add(shade);
      const light = new THREE.PointLight(0xffc98a, 1.6, 300, 1);
      light.position.y = h - 20; add(light);
      break;
    }
    case 'plant': {
      add(box(w * 0.7, 35, d * 0.7, new THREE.MeshStandardMaterial({ color: 0xb8a48c }), 0, 17.5));
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 12, 10), mat);
      leaf.scale.y = (h - 35) / w; leaf.position.y = 35 + (h - 35) / 2; leaf.castShadow = true; add(leaf);
      break;
    }
    case 'rug': {
      const r = box(w, Math.max(h, 1), d, mat, 0, Math.max(h, 1) / 2);
      r.castShadow = false; add(r);
      break;
    }
    default:
      add(box(w, Math.max(h, 1), d, mat, 0, Math.max(h, 1) / 2));
  }
  if (withLabel) {
    const l = makeLabel(it.name);
    l.position.set(0, (it.kind === 'rug' ? 2 : h) + 22, 0);
    g.add(l);
  }
  g.userData.id = it.id;
  return g;
}
