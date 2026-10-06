// Dev-server side of the shared plan: read/write the plan's JSON files, push file changes to pages.
// Pages and scripts address files as "data/<file>"; that prefix maps to the real data folder:
// $PLANNER_DATA if set, else ./data. On first start the dev server copies examples/demo into ./data,
// so edits never touch the shipped example; read-only scripts fall back to examples/demo directly.
import { readFileSync, writeFileSync, renameSync, readdirSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { join, resolve, relative, sep, dirname } from 'node:path';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { formatJson } from '../shared/jsonfmt';

const STATE_FILE = '.planner-state.json'; // which layout file the UI has open (gitignored)

export function dataDirOf(root: string): string {
  if (process.env.PLANNER_DATA) return resolve(root, process.env.PLANNER_DATA);
  return existsSync(join(root, 'data', 'flat.json')) ? resolve(root, 'data') : resolve(root, 'examples', 'demo');
}

// "data/x.json" -> absolute path inside the data folder, or null if it would leave it.
export function realPath(root: string, virtual: string | null): string | null {
  if (!virtual || !virtual.startsWith('data/')) return null;
  const dir = dataDirOf(root), abs = resolve(dir, virtual.slice(5));
  return abs.startsWith(dir + sep) && abs.endsWith('.json') ? abs : null;
}

export function readState(root: string): { layout: string } {
  try {
    const s = JSON.parse(readFileSync(join(root, STATE_FILE), 'utf8'));
    if (existsSync(realPath(root, s.layout) ?? '')) return s;
  } catch { /* no state yet */ }
  return { layout: 'data/layout.json' };
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => ok(s)); req.on('error', fail); });
}

export function plannerPlugin(): Plugin {
  return {
    name: 'planner-data',
    configureServer(server) {
      const root = server.config.root;
      if (!process.env.PLANNER_DATA && !existsSync(join(root, 'data', 'flat.json'))) cpSync(join(root, 'examples', 'demo'), join(root, 'data'), { recursive: true });
      const dataDir = dataDirOf(root);
      const clients = new Set<ServerResponse>();
      const lastWritten = new Map<string, string>(); // our own writes, so the watcher does not echo them back

      // Only .json files inside the data folder are readable or writable.
      const safePath = (p: string | null) => realPath(root, p);
      const virtualOf = (abs: string) => 'data/' + relative(dataDir, abs).split(sep).join('/');
      const send = (res: ServerResponse, code: number, data: unknown) => {
        res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data));
      };
      const broadcast = (msg: object) => { for (const c of clients) c.write(`data: ${JSON.stringify(msg)}\n\n`); };

      server.watcher.add(dataDir);
      server.watcher.on('all', (ev, file) => {
        const abs = resolve(file);
        if (!abs.startsWith(dataDir + sep) || !abs.endsWith('.json')) return;
        const rel = virtualOf(abs);
        if (ev === 'change' || ev === 'add') {
          let txt = '';
          try { txt = readFileSync(abs, 'utf8'); } catch { return; }
          if (lastWritten.get(rel) === txt) return;
          lastWritten.delete(rel);
        }
        broadcast({ type: ev, path: rel });
      });

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x');
        if (!url.pathname.startsWith('/api/')) return next();
        try {
          if (url.pathname === '/api/events') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
            res.write(': connected\n\n');
            clients.add(res);
            req.on('close', () => clients.delete(res));
            return;
          }
          if (url.pathname === '/api/file') {
            const abs = safePath(url.searchParams.get('path'));
            if (!abs) return send(res, 400, { error: 'path must be data/<file>.json' });
            if (req.method === 'GET') {
              if (!existsSync(abs)) return send(res, 404, { error: 'not found' });
              res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
              return res.end(readFileSync(abs, 'utf8'));
            }
            if (req.method === 'POST') {
              const txt = formatJson(JSON.parse(await body(req)));
              lastWritten.set(virtualOf(abs), txt);
              mkdirSync(dirname(abs), { recursive: true });
              writeFileSync(abs + '.tmp', txt); renameSync(abs + '.tmp', abs); // atomic, so readers never see half a file
              return send(res, 200, { ok: true });
            }
          }
          if (url.pathname === '/api/layouts') {
            const dir = join(dataDir, 'layouts');
            const extra = (existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith('.json')).sort().map((f) => `data/layouts/${f}`);
            return send(res, 200, ['data/layout.json', ...extra]);
          }
          if (url.pathname === '/api/state') {
            if (req.method === 'POST') {
              const s = JSON.parse(await body(req));
              if (!safePath(s.layout)) return send(res, 400, { error: 'bad layout path' });
              writeFileSync(join(root, STATE_FILE), formatJson({ layout: s.layout }));
              return send(res, 200, { ok: true });
            }
            return send(res, 200, readState(root));
          }
          send(res, 404, { error: 'unknown endpoint' });
        } catch (e) {
          send(res, 400, { error: (e as Error).message });
        }
      });
    },
  };
}
