---
name: survey
description: Turn a real flat into data/flat.json, step by step - hand drawing first, then photos, then a tape measure - with every number tagged by where it came from. Use when the user wants to model their home, room or flat, add or fix measurements, or asks what to measure next.
---

# Survey a flat

The goal is a `data/flat.json` that is honest about what is known. It should always render, even when half the numbers are rough, and it should always be clear which number to measure next. Read `docs/format.md` before writing the file. If `data/flat.json` has `"demo": true`, it is the copy of the bundled example: rename `data/` to `data-demo/` (keep it, so the user can still look at it), and start a new `data/` folder.

The user is the bottleneck: they hold the tape and stand in the flat. Ask for one thing at a time and make every request count. Never invent a fact about their home. If a number is needed and nobody gave it, use a typical value with `"status": "assumed"`, and say so.

## Stage 1: drawing (the layout of rooms, no numbers needed)

Ask for a hand sketch, as a photo or a scan, or a spoken description. From it, get:
- which rooms exist and which walls they share;
- where every door and window is, and roughly how wide;
- which walls are clearly not square (slanted walls, steps, columns, alcoves).

Write a first `flat.json` straight away. Use numbers read off the sketch, with `"status": "sketch"`. Choose the frame (see `docs/format.md`) and write it into `frame`. Then run `npm run snap -- --view top --room flat --crop` and **look at the image before replying**. Show the user the snapshot and ask only whether the layout of rooms is right: which room touches which, and where the doors are. Fix it before going on.

## Stage 2: photos (fittings and facts people forget to measure)

Ask for photos of each room: from the doorway, and from the opposite corner. From them, add:
- radiators, the wall boiler, columns, built-in cupboards and kitchen units, as `fixtures` with the right `kind`;
- sockets and switches, which matter for the nightstand and desk rules;
- for each door, which jamb carries the hinges and which way it swings (`hinge`, `swing`);
- window sill heights.

Estimate sizes against things of known size in the same photo, and say which you used. Standard references: interior door leaf 80 to 90 cm wide and about 200 cm high; socket plate about 8 cm; floor tiles (ask their size); A4 paper 21 × 29.7 cm. Mark these numbers `"status": "photo"`. Photos of how a previous tenant furnished the rooms are worth saving as their own layout file, as a starting point to compare against.

Snapshot again and check the image against the photos.

## Stage 3: tape (only the numbers that matter)

Run `npm run survey`. It lists the cross-checks that disagree, then every measurement that is not tape-measured: weakest evidence first, and within that, the ones that move the most of the plan. Ask for measurements in that order, a few at a time, grouped by room so the user does not walk back and forth.

How to ask so that one tape reading cannot quietly break the plan:
- **Measure totals and parts.** If a wall has a window, ask for the full wall and for each part (corner to window, window, window to corner). Add a `checks` entry so that the parts must add up to the total.
- **Rooms that are not rectangular need more than four sides.** Four side lengths do not fix a shape. Ask for one diagonal, or a width at both ends, and add a check. Use `lerp` for a slanted wall and `circX`/`circZ` for a free corner (see `docs/format.md`).
- **Measure at floor level, along the wall,** from corner to corner, ignoring skirting boards. Measure columns and steps as "from the corner, length, depth".
- **Readings in doubt** (measured over furniture, or once only) get `"status": "uncertain"` and a `note`.

After each batch: update `v` and `status` to `tape`, run `npm run survey` and `npm run snap`, and look at the image. **When a check fails, do not adjust a number to make it pass.** Tell the user which numbers disagree and by how much, mark the suspects `uncertain`, and ask for a re-measure.

## Stage 4: furniture

List the user's furniture with real sizes: width across the front, depth front to back, height. For products, look up the maker's dimensions and say where they came from. Put the pieces in `data/layout.json` (see the layout skill) with a `kind` that matches what they are, since the rules depend on it.

## Done means

- `npm run survey` shows no failing checks, and only measurements the user has chosen to leave rough;
- `npm run check` runs without `flat.json problems`;
- the user has seen a snapshot of every room and agrees it looks like their home.

## Privacy

This is the user's home. Floor plans, photos and the street name do not belong in a public repo. `data/` is gitignored for that reason. Do not move the user's data into `examples/`, and do not upload snapshots anywhere without asking.
