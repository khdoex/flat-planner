// Side panel: selected item fields, furniture list, measurements with their status, checks.
import type { Flat, FlatFile, Item, Room } from '../geometry/types';
import type { Violation } from '../rules/rules';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const r0 = (v: number) => Math.round(v * 10) / 10;

export function renderSelected(it: Item | undefined, rooms: Room[], onChange: (patch: Partial<Item>) => void, onDelete: () => void) {
  const el = $('selected');
  if (!it) { el.className = 'note'; el.textContent = 'Click a piece to edit it.'; return; }
  el.className = '';
  const num = (k: keyof Item, label: string, step = 1) =>
    `<label class="field">${label}<input type="number" data-k="${k}" step="${step}" value="${it[k] ?? 0}"></label>`;
  el.innerHTML = `
    <div class="sec">
      <div class="row"><input type="text" data-k="name" value="${esc(it.name)}" aria-label="Name"><button id="selDel" aria-label="Remove ${esc(it.name)}">Remove</button></div>
      <div class="grid2">
        <label class="field">Room<select data-k="room">${rooms.map((r) => `<option value="${r.id}"${r.id === it.room ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
        <label class="field">Colour<input type="color" data-k="color" value="${it.color}"></label>
      </div>
      <div class="grid3">${num('x', 'x (cm)')}${num('z', 'z (cm)')}${num('rotation', 'Rotation (°)', 1)}</div>
      <div class="grid3">${num('w', 'Width')}${num('d', 'Depth')}${num('h', 'Height')}</div>
      <div class="grid3">${num('y', 'Raised by')}</div>
      <div class="note">x and z are measured from the room's origin corner. id <code>${esc(it.id)}</code>, kind ${esc(it.kind)}.</div>
    </div>`;
  el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((inp) => inp.addEventListener('change', () => {
    const k = inp.dataset.k as keyof Item;
    if (inp.type === 'number') { const v = parseFloat(inp.value); if (Number.isFinite(v)) onChange({ [k]: v } as Partial<Item>); }
    else onChange({ [k]: inp.value } as Partial<Item>);
  }));
  $('selDel').onclick = onDelete;
}

export function renderItems(items: Item[], rooms: Room[], grouped: boolean, selected: string | null, onPick: (id: string) => void) {
  const el = $('items');
  el.innerHTML = '';
  for (const r of rooms) {
    const list = items.filter((i) => i.room === r.id);
    if (!list.length) continue;
    if (grouped) { const g = document.createElement('div'); g.className = 'group'; g.textContent = r.name; el.appendChild(g); }
    for (const it of list) {
      const d = document.createElement('div');
      d.className = 'item' + (it.id === selected ? ' sel' : '');
      d.innerHTML = `<span>${esc(it.name)}</span><span class="sz">${it.w}×${it.d}×${it.h}</span>`;
      d.onclick = () => onPick(it.id);
      el.appendChild(d);
    }
  }
}

export function renderMeasurements(file: FlatFile, flat: Flat, roomIds: string[], onDim: (key: string, v: number) => void) {
  const groups = [...roomIds, 'flat'];
  const names: Record<string, string> = Object.fromEntries(flat.rooms.map((r) => [r.id, r.name]));
  names.flat = 'Whole flat';
  let flagged = 0;
  const dimsEl = $('dims');
  dimsEl.innerHTML = '';
  for (const g of groups) {
    const keys = Object.keys(file.dims).filter((k) => file.dims[k].room === g);
    if (!keys.length) continue;
    const box = document.createElement('div');
    box.className = 'dgroup';
    box.innerHTML = `<div class="lab">${esc(names[g] ?? g)}</div>`;
    for (const k of keys) {
      const d = file.dims[k], flag = d.status !== 'tape';
      if (flag) flagged++;
      const row = document.createElement('label');
      row.className = `dim${flag ? ' flag' : ''}${d.status === 'uncertain' ? ' uncertain' : ''}`;
      row.title = `${k}: ${file.status?.[d.status] ?? d.status}`;
      row.innerHTML = `<span>${esc(d.label)}${flag ? `<em class="tag">${d.status}</em>` : ''}</span>
        <input type="number" step="1" value="${d.v}" aria-label="${esc(d.label)}">
        ${d.note ? `<span class="dn">${esc(d.note)}</span>` : ''}`;
      const inp = row.querySelector('input')!;
      inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) onDim(k, v); else inp.value = String(d.v); });
      box.appendChild(row);
    }
    dimsEl.appendChild(box);
  }
  $('flagCount').textContent = flagged ? `${flagged} not tape-measured` : '';
  $('checks').innerHTML = flat.checks.filter((c) => groups.includes(c.room)).map((c) =>
    `<div class="check${c.ok ? '' : ' bad'}">${esc(c.label)}: <b>${r0(c.a)}</b> vs <b>${r0(c.b)}</b>${c.ok ? '' : ` (off by ${r0(Math.abs(c.a - c.b))})`}</div>`).join('');
}

export function renderRules(vs: Violation[], selected: string | null, onPick: (v: Violation) => void) {
  const el = $('rules'), sorted = [...vs].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  const errs = vs.filter((v) => v.severity === 'error').length;
  $('ruleCount').textContent = vs.length ? `${errs} errors, ${vs.length - errs} warnings` : '';
  el.innerHTML = sorted.length ? '' : '<div class="note">No problems in this view.</div>';
  for (const v of sorted) {
    const d = document.createElement('div');
    d.className = `rule ${v.severity}${selected && v.items.includes(selected) ? ' sel' : ''}`;
    d.innerHTML = `<span class="dot"></span><span>${esc(v.msg)}</span>`;
    d.title = v.rule;
    d.onclick = () => onPick(v);
    el.appendChild(d);
  }
}
