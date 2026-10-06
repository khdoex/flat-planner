// npm run snap -- --view top|3d --room <room id>|flat [--layout data/layouts/x.json] [--out file.png] [--crop]
// Starts its own dev server, renders the page in headless Chromium (SwiftShader WebGL), saves a PNG to snapshots/.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({
  options: {
    view: { type: 'string', default: '3d' }, room: { type: 'string', default: 'flat' },
    layout: { type: 'string' }, out: { type: 'string' }, crop: { type: 'boolean', default: false }, width: { type: 'string', default: '1440' }, height: { type: 'string', default: '1000' },
  },
});
if (!['3d', 'top'].includes(a.view!)) throw new Error('--view must be 3d or top');

const root = resolve(import.meta.dirname, '..');
const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const base = server.resolvedUrls!.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: +a.width!, height: +a.height! } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const q = new URLSearchParams({ room: a.room!, view: a.view!, snap: '1', ...(a.layout ? { layout: a.layout } : {}) });
  await page.goto(`${base}?${q}`);
  await page.waitForFunction(() => (window as unknown as { __plannerReady?: boolean }).__plannerReady === true, null, { timeout: 60000 });
  mkdirSync(resolve(root, 'snapshots'), { recursive: true });
  const out = resolve(root, a.out ?? `snapshots/${a.room}-${a.view}.png`);
  if (a.crop) await page.locator('#stage').screenshot({ path: out }); // the plan only, no side panel
  else await page.screenshot({ path: out });
  const shown = await page.evaluate(() => [document.getElementById('sync')?.textContent, document.getElementById('errors')?.textContent].join(' | '));
  console.log(out);
  console.log(`page: ${shown}`);
  if (errors.length) console.log(`console errors:\n${errors.join('\n')}`);
} finally {
  await browser.close();
  await server.close();
}
