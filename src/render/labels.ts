import * as THREE from 'three';

export function makeLabel(text: string, size = 22): THREE.Sprite {
  const c = document.createElement('canvas'), ctx = c.getContext('2d')!, f = 40;
  const font = `500 ${f}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  c.width = w; c.height = f + 22;
  ctx.font = font;
  ctx.fillStyle = 'rgba(20,26,24,0.78)';
  ctx.beginPath(); ctx.roundRect(0, 0, w, c.height, 12); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, 14, c.height / 2 + 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set((size * w) / c.height, size, 1);
  s.renderOrder = 10;
  s.userData.label = true;
  return s;
}
