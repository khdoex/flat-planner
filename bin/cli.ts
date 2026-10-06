// flat-planner command line: one entry point for the planner, the survey and the rules.
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { initData } from '../server/plugin';
import { dev } from '../scripts/dev';
import { check } from '../scripts/check';
import { survey } from '../scripts/survey';
import { snap } from '../scripts/snap';
import { optimiseCmd } from '../scripts/optimise';

const HELP = `flat-planner <command>   (run it in the folder that holds your plan)

  init                       create ./data with the demo flat to start from
  setup                      download the headless Chromium that snap needs (once, about 95 MB)
  dev [--port 5173]          open the planner; browser and files stay in sync
  survey                     failing cross-checks, then what to measure next
  check [--layout data/layouts/x.json]
                             rule violations for a layout
  optimise --room <id> [--layout ...] [--iters 3000] [--restarts 3] [--seed 1] [--keep id,id]
                             search arrangements of one room; best 3 go to data/layouts/opt-<room>-<n>.json
  snap --view top|3d --room <id>|flat [--layout ...] [--out file.png] [--crop]
                             render the plan to snapshots/ (run setup once first)

Your plan lives in ./data (or $PLANNER_DATA). File format: https://github.com/khdoex/flat-planner/blob/main/docs/format.md`;

const [cmd, ...args] = process.argv.slice(2), home = process.cwd();
switch (cmd) {
  case 'init': console.log(initData(home) ? `created ${join(home, 'data')} from the demo flat` : 'a plan already exists here; nothing to do'); break;
  case 'setup': { // use the Playwright this package depends on, so the browser build matches
    const cli = join(dirname(createRequire(import.meta.url).resolve('playwright/package.json')), 'cli.js');
    process.exitCode = spawnSync(process.execPath, [cli, 'install', 'chromium-headless-shell'], { stdio: 'inherit' }).status ?? 1;
    break;
  }
  case 'dev': await dev(args, home); break;
  case 'survey': survey(home); break;
  case 'check': check(args, home); break;
  case 'snap': await snap(args, home); break;
  case 'optimise': case 'optimize': optimiseCmd(args, home); break;
  default: console.log(HELP); if (cmd && cmd !== 'help' && cmd !== '--help') process.exitCode = 1;
}
