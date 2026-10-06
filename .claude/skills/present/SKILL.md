---
name: present
description: Produce room-by-room images and a short comparison of layout alternatives for the user, or for someone they want to show the plan to. Use when the user asks to see the plan, wants screenshots, or wants alternatives compared side by side.
---

# Present a plan

## Setup

Commands are `npx flat-planner <command>`, run in the folder that holds the user's plan (the folder with `data/` in it). For a new plan, ask the user where to keep it, then run `npx flat-planner init` there; `npx flat-planner dev` opens the planner in the browser. Inside a git checkout of flat-planner itself, `npm run <command> --` does the same. Snapshots need a headless Chromium, installed once with `npx playwright install chromium`.

## Images

For each room that has furniture, take a top view and a 3D view. Take a top view of the whole flat as well:

```bash
npx flat-planner snap --view top --room flat --crop --out snapshots/rooms/flat-top.png
npx flat-planner snap --view top --room <id> --crop --out snapshots/rooms/<id>-top.png
npx flat-planner snap --view 3d  --room <id> --crop --out snapshots/rooms/<id>-3d.png
```

Add `--layout data/layouts/<name>.json` to render an alternative. Run the commands one after another, not in parallel: each starts its own server. **Open and look at every image** before sending it. Check that no label hides the piece being discussed, and that nothing important is cut off.

## Comparison

When comparing alternatives, run `npx flat-planner check --layout ...` for each, and show:

1. One line per alternative: its name, and its errors and warnings as counts.
2. The differences that matter, in plain words. Say what each option gains and what it costs.
3. A recommendation, with the reason first, and the regime where it holds ("if you work at the desk most evenings...").

Use the numbers the rules give (cm, degrees), not adjectives.

## Privacy

These are pictures of someone's home. Keep them in `snapshots/` (gitignored). Share them only where the user asks. For anything public, such as a README or a post, render `examples/demo` instead.
