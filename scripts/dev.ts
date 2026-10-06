// flat-planner dev [--port 5173]: the planner in the browser, live-synced with the plan files.
import { createServer, type InlineConfig, type Plugin } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { plannerPlugin } from '../server/plugin';
import { appRoot, dataDirOf } from '../shared/paths';

// The app is served from the package folder; the plan files come from the work folder via the plugin.
export function viteConfig(plugin: Plugin): InlineConfig {
  return {
    root: appRoot(), configFile: false, plugins: [plugin],
    cacheDir: join(tmpdir(), 'flat-planner-vite'), // the package folder may not be writable
    server: { watch: { ignored: ['**/snapshots/**'] } },
  };
}

export async function dev(args: string[], home: string) {
  const { values: a } = parseArgs({ args, options: { port: { type: 'string', default: '5173' } } });
  const server = await createServer({ ...viteConfig(plannerPlugin(home)), server: { port: +a.port!, watch: { ignored: ['**/snapshots/**'] } } });
  await server.listen();
  console.log(`flat-planner: ${server.resolvedUrls!.local[0]}  (plan files in ${dataDirOf(home)})`);
}
