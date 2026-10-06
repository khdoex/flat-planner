---
name: present
description: Produce room-by-room images and a short comparison of layout alternatives for the user, or for someone they want to show the plan to. Use when the user asks to see the plan, wants screenshots, or wants alternatives compared side by side.
---

# Present a plan

## Setup

The commands below run inside a flat-planner workspace: a folder with `scripts/survey.ts` in it. If the current folder is not one (for example, when this skill came from the plugin), ask the user where to put it, then:

```bash
git clone https://github.com/khdoex/flat-planner.git <folder> && cd <folder> && npm install
```

Work from that folder from then on. Snapshots also need a Playwright Chromium (`npx playwright install chromium`).

## Images

For each room that has furniture, take a top view and a 3D view. Take a top view of the whole flat as well:

```bash
npm run snap -- --view top --room flat --crop --out snapshots/rooms/flat-top.png
npm run snap -- --view top --room <id> --crop --out snapshots/rooms/<id>-top.png
npm run snap -- --view 3d  --room <id> --crop --out snapshots/rooms/<id>-3d.png
```

Add `--layout data/layouts/<name>.json` to render an alternative. Run the commands one after another, not in parallel: each starts its own server. **Open and look at every image** before sending it. Check that no label hides the piece being discussed, and that nothing important is cut off.

## Comparison

When comparing alternatives, run `npm run check -- --layout ...` for each, and show:

1. One line per alternative: its name, and its errors and warnings as counts.
2. The differences that matter, in plain words. Say what each option gains and what it costs.
3. A recommendation, with the reason first, and the regime where it holds ("if you work at the desk most evenings...").

Use the numbers the rules give (cm, degrees), not adjectives.

## Privacy

These are pictures of someone's home. Keep them in `snapshots/` (gitignored). Share them only where the user asks. For anything public, such as a README or a post, render `examples/demo` instead.
