// flat-planner command line: one entry point for the planner, the survey and the rules.
import { join } from 'node:path';
import { initData } from '../server/plugin';
import { dev } from '../scripts/dev';
import { check } from '../scripts/check';
import { survey } from '../scripts/survey';
import { snap } from '../scripts/snap';

const HELP = `flat-planner <command>   (run it in the folder that holds your plan)

  init                       create ./data with the demo flat to start from
  dev [--port 5173]          open the planner; browser and files stay in sync
  survey                     failing cross-checks, then what to measure next
  check [--layout data/layouts/x.json]
                             rule violations for a layout
  snap --view top|3d --room <id>|flat [--layout ...] [--out file.png] [--crop]
                             render the plan to snapshots/ (needs: npx playwright install chromium)

Your plan lives in ./data (or $PLANNER_DATA). File format: https://github.com/khdoex/flat-planner/blob/main/docs/format.md`;

const [cmd, ...args] = process.argv.slice(2), home = process.cwd();
switch (cmd) {
  case 'init': console.log(initData(home) ? `created ${join(home, 'data')} from the demo flat` : 'a plan already exists here; nothing to do'); break;
  case 'dev': await dev(args, home); break;
  case 'survey': survey(home); break;
  case 'check': check(args, home); break;
  case 'snap': await snap(args, home); break;
  default: console.log(HELP); if (cmd && cmd !== 'help' && cmd !== '--help') process.exitCode = 1;
}
