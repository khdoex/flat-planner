# Agent guide

This repo is a furniture planner for a real flat. The user's flat lives in `data/` (gitignored). On the first `npm run dev`, the made-up `examples/demo` is copied into `data/` (marked `"demo": true`). Never edit `examples/` for a user.

## Procedures

Follow these files as step-by-step procedures (Claude Code loads them as skills; other agents should read them):

- `.claude/skills/survey/SKILL.md`: drawing, then photos, then tape, into `data/flat.json`
- `.claude/skills/layout/SKILL.md`: arranging furniture and comparing alternatives against the rules
- `.claude/skills/present/SKILL.md`: room-by-room images and comparisons

The file format is in `docs/format.md`.

## Commands

- `npm run survey`: what to measure next
- `npm run check [-- --layout data/layouts/x.json]`: rule violations
- `npm run snap -- --view top|3d --room <id>|flat --crop`: render to `snapshots/`. Open the image and look at it before you describe the plan.
- `npm run typecheck`

## Ground rules

- Never invent a fact about the user's home. Tag every number with its source (`status`). Use `assumed` for typical values nobody gave.
- When a cross-check fails, ask for a re-measure. Do not change a number to make it pass.
- The user may be editing in the browser at the same time. Re-read a file right before you edit it, and change only what you mean to.
- Do not overwrite the user's layout to try an idea. Save it as `data/layouts/<idea>.json`.
- Keep the user's data, photos and snapshots out of git and out of anything public.
