import './style.css';
import { resolveFlat } from './geometry/flat';
import { roomAt } from './geometry/poly';
import { alignToWall } from './geometry/align';
import type { Flat, FlatFile, Item, LayoutFile, Room, V2 } from './geometry/types';
import { PlanScene } from './render/scene';
import { attachInteraction } from './interaction/drag';
import { readFile, writeFile, listLayouts, getState, setState, onFileEvent, Writer, mergeLayout, mergeFlat } from './persistence/sync';
import { renderSelected, renderItems, renderMeasurements, renderRules } from './ui/panel';
import { checkLayout, type RuleResult } from './rules/rules';

const PRESETS: Record<string, Omit<Item, 'id' | 'room' | 'x' | 'z' | 'rotation'>> = {
  sofa: { kind: 'sofa', name: 'Sofa', w: 220, d: 90, h: 85, color: '#A65E36' },
  armchair: { kind: 'armchair', name: 'Armchair', w: 80, d: 80, h: 85, color: '#8C8A78' },
  table: { kind: 'table', name: 'Dining table', w: 120, d: 75, h: 75, color: '#B08D62' },
  chair: { kind: 'chair', name: 'Chair', w: 43, d: 50, h: 95, color: '#B08D62' },
  desk: { kind: 'desk', name: 'Desk', w: 126, d: 70, h: 75, color: '#4A3426' },
  shelf: { kind: 'shelf', name: 'Bookshelf', w: 80, d: 30, h: 200, color: '#CFC6B6' },
  coffee: { kind: 'coffee', name: 'Coffee table', w: 100, d: 55, h: 40, color: '#A88B66' },
  rug: { kind: 'rug', name: 'Rug', w: 160, d: 230, h: 1, color: '#D8CDB8' },
  bed: { kind: 'bed', name: 'Bed', w: 130, d: 210, h: 100, color: '#8E9AA6' },
  nightstand: { kind: 'nightstand', name: 'Nightstand', w: 45, d: 40, h: 55, color: '#CFC6B6' },
  wardrobe: { kind: 'wardrobe', name: 'Wardrobe', w: 155, d: 60, h: 220, color: '#E3DED3', style: 'oak' },
  chest: { kind: 'chest', name: 'Chest of drawers', w: 80, d: 48, h: 78, color: '#F2F1EC' },
  lamp: { kind: 'lamp', name: 'Floor lamp', w: 35, d: 35, h: 165, color: '#3A3530' },
  plant: { kind: 'plant', name: 'Plant', w: 40, d: 40, h: 120, color: '#5B7F52' },
  box: { kind: 'box', name: 'Box', w: 60, d: 60, h: 60, color: '#9A8FB0' },
};

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const snapMode = params.has('snap');

let flatFile: FlatFile, flat: Flat, layout: LayoutFile, layoutPath = '';
let view = params.get('room') ?? '';
let cam: '3d' | 'top' = params.get('view') === 'top' ? 'top' : '3d';
let selected: string | null = null;
let labels = true;
let showRules = true;
let rules: RuleResult | null = null;
let rulesTimer: ReturnType<typeof setTimeout> | null = null;

const setSync = (s: string) => { $('sync').textContent = s; };
const showErrors = (errs: string[]) => { const el = $('errors'); el.hidden = !errs.length; el.textContent = errs.join('\n'); };

const canvas = $('view') as HTMLCanvasElement;
const ps = new PlanScene(canvas);
if (snapMode) ps.fadeRate = 1;
const layoutW = new Writer('', () => layout, setSync);
const flatW = new Writer('data/flat.json', () => flatFile, setSync);

const visibleRooms = (): Room[] => (view === 'flat' ? flat.rooms : flat.rooms.filter((r) => r.id === view));
const roomOf = (it: Item) => flat.rooms.find((r) => r.id === it.room);
const itemById = (id: string | null) => layout.items.find((i) => i.id === id);

function applyFlat(): boolean {
  try { flat = resolveFlat(flatFile); } catch (e) { showErrors([`flat.json: ${(e as Error).message}`]); return false; }
  if (view !== 'flat' && !flat.rooms.some((r) => r.id === view)) view = flat.rooms[0]?.id ?? 'flat';
  showErrors(flat.errors);
  return true;
}

function syncUrl() {
  const u = new URL(location.href);
  u.searchParams.set('room', view); u.searchParams.set('view', cam);
  history.replaceState(null, '', u);
}

function renderHeader() {
  const rooms = $('rooms');
  rooms.innerHTML = '';
  for (const [id, name] of [...flat.rooms.map((r) => [r.id, r.name]), ['flat', 'Whole flat']]) {
    const b = document.createElement('button');
    b.textContent = name; b.classList.toggle('on', id === view);
    b.onclick = () => switchView(id);
    rooms.appendChild(b);
  }
  const vis = visibleRooms();
  $('dimtxt').textContent = view === 'flat' ? 'Whole flat' : vis[0].name;
  $('areatxt').textContent = `${(vis.reduce((s, r) => s + r.area, 0) / 1e4).toFixed(1)} m²`;
  $('b3d').classList.toggle('on', cam === '3d'); $('btop').classList.toggle('on', cam === 'top');
}

function renderPanel() {
  const vis = visibleRooms();
  const shown = layout.items.filter((i) => vis.some((r) => r.id === i.room));
  renderSelected(itemById(selected), flat.rooms, updateSelected, removeSelected);
  renderItems(shown, vis, view === 'flat', selected, select);
  renderMeasurements(flatFile, flat, vis.map((r) => r.id), setDim);
  drawRules();
  $('roomNote').textContent = vis.map((r) => r.note).filter(Boolean).join(' ');
  $('layoutNote').textContent = layout.note ?? '';
}

function runRules() {
  rules = checkLayout(flat, layout.items);
  drawRules();
}
function scheduleRules() {
  if (rulesTimer) clearTimeout(rulesTimer);
  rulesTimer = setTimeout(runRules, 120);
}
function drawRules() {
  if (!rules) return;
  const vis = visibleRooms(), ids = new Set(vis.map((r) => r.id));
  const vs = rules.violations.filter((v) => ids.has(v.room));
  const idx = new Set(flat.rooms.map((r, i) => (ids.has(r.id) ? i + 1 : -1)));
  ps.setOverlay(showRules ? vs.flatMap((v) => v.zones) : [], showRules ? rules.walk : null, idx);
  renderRules(vs, selected, (v) => { if (v.items[0]) select(v.items[0]); });
}

function rebuildItems() {
  const vis = new Set(visibleRooms().map((r) => r.id));
  ps.setItems(layout.items.filter((i) => vis.has(i.room)), flat.rooms, view !== 'flat');
  scheduleRules();
}

function renderAll(reframe: boolean) {
  ps.build(flat, visibleRooms(), view === 'flat');
  rebuildItems();
  renderHeader(); renderPanel();
  if (reframe) ps.frame(cam, !snapMode);
}

function switchView(id: string) {
  view = id; selected = null; ps.selected = null;
  syncUrl(); renderAll(true);
}

function select(id: string | null) {
  selected = id; ps.selected = id; ps.highlight();
  renderPanel();
}

function changed(it: Item) { layoutW.touch(it.id); scheduleRules(); }

function updateSelected(patch: Partial<Item>) {
  const it = itemById(selected);
  if (!it) return;
  if (patch.room && patch.room !== it.room) {
    // moving to another room through the panel: keep the flat position if it lies inside, else centre it
    const from = roomOf(it)!, to = flat.rooms.find((r) => r.id === patch.room)!;
    const g: V2 = [from.origin[0] + it.x, from.origin[1] + it.z];
    const c = roomAt(g, [to]) ? g : [(Math.min(...to.poly.map((p) => p[0])) + Math.max(...to.poly.map((p) => p[0]))) / 2, (Math.min(...to.poly.map((p) => p[1])) + Math.max(...to.poly.map((p) => p[1]))) / 2];
    patch.x = Math.round(c[0] - to.origin[0]); patch.z = Math.round(c[1] - to.origin[1]);
  }
  Object.assign(it, patch);
  if (it.y === 0) delete it.y;
  changed(it); rebuildItems(); renderPanel();
}

function rotate(delta: number) {
  const it = itemById(selected);
  if (it) updateSelected({ rotation: Math.round(((((it.rotation + delta) % 360) + 360) % 360) * 10) / 10 });
}

function alignSelected() {
  const it = itemById(selected);
  if (it) updateSelected(alignToWall(it, roomOf(it)!, flat.fixtures));
}

// Right-click size editor. With "keep proportions", changing one side scales the other two by the same factor.
const sizer = $('sizer') as HTMLFormElement;
const sizeInput = (k: 'w' | 'd' | 'h') => sizer.elements.namedItem(k) as HTMLInputElement;
const lockInput = sizer.elements.namedItem('lock') as HTMLInputElement;
let sizerBase: { w: number; d: number; h: number } | null = null;
function openSizer(id: string, cx: number, cy: number) {
  const it = itemById(id);
  if (!it) return;
  sizerBase = { w: it.w, d: it.d, h: it.h };
  $('sizerName').textContent = it.name;
  for (const k of ['w', 'd', 'h'] as const) sizeInput(k).value = String(it[k]);
  const r = $('stage').getBoundingClientRect();
  sizer.style.left = `${Math.min(cx - r.left, r.width - 260)}px`; sizer.style.top = `${Math.min(cy - r.top, r.height - 200)}px`;
  sizer.hidden = false; sizeInput('w').focus(); sizeInput('w').select();
}
for (const k of ['w', 'd', 'h'] as const) sizeInput(k).addEventListener('input', () => {
  const v = parseFloat(sizeInput(k).value);
  if (!lockInput.checked || !sizerBase || !(v > 0)) return;
  const f = v / sizerBase[k];
  for (const o of ['w', 'd', 'h'] as const) if (o !== k) sizeInput(o).value = String(Math.round(sizerBase[o] * f));
});
sizer.onsubmit = (e) => {
  e.preventDefault();
  const patch: Partial<Item> = {};
  for (const k of ['w', 'd', 'h'] as const) { const v = parseFloat(sizeInput(k).value); if (v > 0) patch[k] = Math.round(v * 10) / 10; }
  updateSelected(patch);
  sizer.hidden = true;
};
$('sizerClose').onclick = () => { sizer.hidden = true; };
sizer.addEventListener('keydown', (e) => { if (e.key === 'Escape') sizer.hidden = true; });

function removeSelected() {
  if (!selected) return;
  layout.items = layout.items.filter((i) => i.id !== selected);
  layoutW.remove(selected);
  select(null); rebuildItems();
}

function setDim(key: string, v: number) {
  const old = flatFile.dims[key].v;
  flatFile.dims[key].v = v;
  if (!applyFlat()) { flatFile.dims[key].v = old; applyFlat(); renderPanel(); return; }
  flatW.touch(key);
  renderAll(false);
}

attachInteraction(ps, canvas, {
  isRug: (id) => itemById(id)?.kind === 'rug',
  itemPos: (id) => { const it = itemById(id), r = it && roomOf(it); return it && r ? [r.origin[0] + it.x, r.origin[1] + it.z] : null; },
  select,
  move: (id, pos) => {
    const it = itemById(id);
    if (!it) return;
    // only the whole-flat view lets a piece change rooms
    const room = (view === 'flat' && roomAt(pos, flat.rooms)) || roomOf(it)!;
    it.room = room.id;
    it.x = Math.round((pos[0] - room.origin[0]) / 5) * 5;
    it.z = Math.round((pos[1] - room.origin[1]) / 5) * 5;
    const g = ps.meshes.get(id);
    if (g) ps.place(g, it, room);
    changed(it);
  },
  turn: (id, deg) => {
    const it = itemById(id), g = ps.meshes.get(id);
    if (!it) return;
    it.rotation = deg;
    if (g) ps.place(g, it, roomOf(it)!);
    changed(it);
  },
  drop: () => renderPanel(),
  rotate,
  align: alignSelected,
  menu: openSizer,
  remove: removeSelected,
});

async function loadLayout(path: string) {
  if (layoutW.pending) await layoutW.flush();
  layout = await readFile<LayoutFile>(path);
  layoutPath = path; layoutW.path = path;
}

async function refreshLayoutList() {
  const sel = $('layoutSel') as HTMLSelectElement;
  const files = await listLayouts();
  sel.innerHTML = files.map((f) => `<option value="${f}"${f === layoutPath ? ' selected' : ''}>${f.replace(/^data\//, '')}</option>`).join('');
}

($('layoutSel') as HTMLSelectElement).onchange = async (e) => {
  const path = (e.target as HTMLSelectElement).value;
  await loadLayout(path); await setState({ layout: path });
  select(null); rebuildItems(); renderPanel();
};
$('saveAs').onclick = async () => {
  const name = prompt('Name for the copy (saved under data/layouts/)', layout.name ?? '');
  const slug = name?.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return;
  const path = `data/layouts/${slug}.json`;
  await writeFile(path, { ...layout, name: slug });
  await loadLayout(path); await setState({ layout: path }); await refreshLayoutList(); renderPanel();
};
$('b3d').onclick = () => { cam = '3d'; syncUrl(); renderHeader(); ps.frame(cam, true); };
$('btop').onclick = () => { cam = 'top'; syncUrl(); renderHeader(); ps.frame(cam, true); };
$('brules').onclick = () => { showRules = !showRules; $('brules').classList.toggle('on', showRules); drawRules(); };
$('blabels').onclick = () => { labels = !labels; $('blabels').classList.toggle('on', labels); ps.setLabels(labels); };
$('brot').onclick = () => rotate(90);
$('brotL').onclick = () => rotate(-15);
$('brotR').onclick = () => rotate(15);
$('balign').onclick = alignSelected;

const presetSel = $('preset') as HTMLSelectElement;
presetSel.innerHTML = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.name} (${p.w}×${p.d})</option>`).join('');
$('badd').onclick = () => {
  const p = PRESETS[presetSel.value], room = view === 'flat' ? flat.rooms[0] : visibleRooms()[0];
  const xs = room.poly.map((q) => q[0]), zs = room.poly.map((q) => q[1]);
  const it: Item = {
    id: `${p.kind}-${Math.random().toString(36).slice(2, 6)}`, ...p, room: room.id, rotation: 0,
    x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2 - room.origin[0]), z: Math.round((Math.min(...zs) + Math.max(...zs)) / 2 - room.origin[1]),
  };
  layout.items.push(it); changed(it); rebuildItems(); select(it.id);
};

onFileEvent(async (e) => {
  try {
    if (e.path === layoutPath && e.type !== 'unlink') {
      layout = mergeLayout(await readFile<LayoutFile>(layoutPath), layout, layoutW);
      if (layoutW.pending) layoutW.schedule();
      rebuildItems(); renderPanel(); setSync(`Updated from disk ${new Date().toLocaleTimeString()}`);
    } else if (e.path === 'data/flat.json' && e.type !== 'unlink') {
      const next = mergeFlat(await readFile<FlatFile>('data/flat.json'), flatFile, flatW), prev = flatFile;
      flatFile = next;
      if (!applyFlat()) { flatFile = prev; return; }
      if (flatW.pending) flatW.schedule();
      renderAll(false); setSync(`Updated from disk ${new Date().toLocaleTimeString()}`);
    }
    if (e.path.startsWith('data/layouts/')) await refreshLayoutList();
  } catch (err) {
    showErrors([`${e.path}: ${(err as Error).message} (keeping the last good version)`]);
  }
});

new ResizeObserver(() => ps.resize()).observe($('stage'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => ps.setBackground());

async function start() {
  flatFile = await readFile<FlatFile>('data/flat.json');
  if (!applyFlat()) return;
  await loadLayout(params.get('layout') ?? (await getState()).layout);
  await refreshLayoutList();
  ps.resize();
  renderAll(true);
  syncUrl();
  setSync(`Live: ${layoutPath.replace(/^data\//, '')}`);
  const loop = (t: number) => { ps.tick(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  await document.fonts.ready;
  rebuildItems(); ps.build(flat, visibleRooms(), view === 'flat'); // labels again with the web font
  runRules();
  requestAnimationFrame(() => requestAnimationFrame(() => { (window as unknown as { __plannerReady: boolean }).__plannerReady = true; }));
}
// read-only hook for snapshots and debugging
(window as unknown as { __planner: object }).__planner = { layout: () => layout, flat: () => flat, path: () => layoutPath };
start().catch((e) => showErrors([String(e)]));
