// Plan data lives in JSON files on disk. The page reads them, writes edits back after a short
// debounce, and listens for changes made on disk by anyone else.
import type { FlatFile, LayoutFile } from '../geometry/types';

export async function readFile<T>(path: string): Promise<T> {
  const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return JSON.parse(await r.text()) as T;
}

export async function writeFile(path: string, data: unknown): Promise<void> {
  const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`, { method: 'POST', body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`${path}: ${(await r.json()).error}`);
}

export async function listLayouts(): Promise<string[]> { return (await fetch('/api/layouts')).json(); }
export async function getState(): Promise<{ layout: string }> { return (await fetch('/api/state')).json(); }
export async function setState(s: { layout: string }) { await fetch('/api/state', { method: 'POST', body: JSON.stringify(s) }); }

export function onFileEvent(fn: (e: { type: string; path: string }) => void) {
  new EventSource('/api/events').onmessage = (m) => fn(JSON.parse(m.data));
}

// Debounced writer that remembers which keys were changed locally and are not yet on disk.
export class Writer {
  dirty = new Set<string>();
  removed = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(public path: string, private get: () => unknown, private status: (s: string) => void, private delay = 300) {}

  touch(key: string) { this.dirty.add(key); this.schedule(); }
  remove(key: string) { this.dirty.delete(key); this.removed.add(key); this.schedule(); }
  get pending() { return this.dirty.size + this.removed.size > 0; }

  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
  }

  async flush() {
    this.timer = null;
    const dirty = new Set(this.dirty), removed = new Set(this.removed);
    this.dirty.clear(); this.removed.clear();
    try { await writeFile(this.path, this.get()); this.status('Saved'); }
    catch (e) {
      dirty.forEach((k) => this.dirty.add(k)); removed.forEach((k) => this.removed.add(k));
      this.status(`Save failed: ${(e as Error).message}`);
    }
  }
}

// Disk version wins, except for items changed here and not yet written.
export function mergeLayout(disk: LayoutFile, local: LayoutFile, w: Writer): LayoutFile {
  const mine = new Map(local.items.map((i) => [i.id, i]));
  const items = disk.items.filter((i) => !w.removed.has(i.id)).map((i) => (w.dirty.has(i.id) && mine.get(i.id)) || i);
  for (const id of w.dirty) if (!disk.items.some((i) => i.id === id) && mine.has(id)) items.push(mine.get(id)!);
  return { ...disk, items };
}

export function mergeFlat(disk: FlatFile, local: FlatFile, w: Writer): FlatFile {
  for (const k of w.dirty) if (disk.dims[k] && local.dims[k]) disk.dims[k].v = local.dims[k].v;
  return disk;
}
