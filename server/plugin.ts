// Dev-server side of the shared plan: read/write the plan's JSON files, push file changes to pages.
// Pages and scripts address files as "data/<file>"; shared/paths.ts maps that to the real data folder.
// On first start the server copies examples/demo into <home>/data, so edits never touch the shipped example.
import { readFileSync, writeFileSync, renameSync, readdirSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { join, resolve, relative, sep, dirname } from 'node:path';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { formatJson } from '../shared/jsonfmt';
import { appRoot, dataDirOf, realPath } from '../shared/paths';

const STATE_FILE = '.planner-state.json'; // which layout file the UI has open (kept out of git)

export function readState(home: string): { layout: string } {
  try {
    const s = JSON.parse(readFileSync(join(home, STATE_FILE), 'utf8'));
    if (existsSync(realPath(home, s.layout) ?? '')) return s;
  } catch { /* no state yet */ }
  return { layout: 'data/layout.json' };
}

export function initData(home: string): boolean {
  if (process.env.PLANNER_DATA || existsSync(join(home, 'data', 'flat.json'))) return false;
  cpSync(join(appRoot(), 'examples', 'demo'), join(home, 'data'), { recursive: true });
  return true;
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => ok(s)); req.on('error', fail); });
}

export function plannerPlugin(home = process.cwd()): Plugin {
  return {
    name: 'planner-data',
    configureServer(server) {
      initData(home);
      const dataDir = dataDirOf(home);
      const clients = new Set<ServerResponse>();
      const lastWritten = new Map<string, string>(); // our own writes, so the watcher does not echo them back

      // Only .json files inside the data folder are readable or writable.
      const safePath = (p: string | null) => realPath(home, p);
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
              writeFileSync(join(home, STATE_FILE), formatJson({ layout: s.layout }));
              return send(res, 200, { ok: true });
            }
            return send(res, 200, readState(home));
          }
          send(res, 404, { error: 'unknown endpoint' });
        } catch (e) {
          send(res, 400, { error: (e as Error).message });
        }
      });
    },
  };
}
