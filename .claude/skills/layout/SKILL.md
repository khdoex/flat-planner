---
name: layout
description: Arrange furniture in a surveyed flat and compare arrangements by hard rules - overlaps, walls, door swings, drawer and door clearance, radiators, walkways of 60 and 80 cm, bed access, sockets, desk daylight. Use when the user wants to place, move or fit furniture, asks whether something fits, or wants alternatives compared.
---

# Arrange furniture

Furniture lives in `data/layout.json` and in named alternatives in `data/layouts/<name>.json`. The item format is in `docs/format.md`. The user may have the planner open (`npm run dev`) and be dragging things while you work. Their edits are written to disk within about 0.3 s, so **re-read a layout file right before you edit it**, and change only the items you mean to change.

## Loop

1. **Look first.** Run `npm run check` and `npm run snap -- --view top --room <room> --crop`, and read the image.
2. **Start from what is fixed.** Doors and their swings, windows, radiators, the boiler, sockets, columns. Then place the pieces with the fewest options: bed, wardrobe, desk, sofa. Then the rest.
3. **Place pieces with their back to a wall.** At `rotation: 0` a piece's back faces `-z`. In rooms with slanted walls, a piece standing against a wall should be parallel to that wall. That is the angle the UI's Align button (key A) produces: the rotation that turns the piece's back to the wall's outward normal. For a piece that only sits beside a wall, parallel to the wall you see most is usually calmer.
4. **Check after every change** with `npm run check -- --layout data/layouts/<name>.json`. Errors are hard failures. Warnings are trade-offs to explain, not to hide.
5. **Snapshot and look** before telling the user something is better.

## Rules (what `npm run check` tests)

- Pieces overlapping each other. Chairs may tuck under tables and desks. Pieces with `y > 0` sit on others.
- Pieces running into walls, columns or fitted units.
- Room-door swings kept clear; wardrobe doors and drawers able to open.
- 20 cm clear in front of radiators, 60 cm in front of a wall boiler.
- Walkways: a 2.5 cm floor grid is flooded from the front door with a 60 cm and an 80 cm wide body. Every door, window front, wardrobe, chest, shelf and desk front must be reachable, and so must seats (from the front or a side) and at least one long side of each bed. Reachable only at 60 cm is a warning; not at all is an error.
- Nightstands within 150 cm of a socket. A desk should not face a window or have one behind you; side light is best.
- Overlaps thinner than 0.5 cm are ignored, as below tape precision.

The rules measure clearances, not taste. Say which is which when you recommend something.

## Alternatives

- Never overwrite the user's own arrangement to try an idea. Copy it to `data/layouts/<idea>.json` first, or ask.
- Compare alternatives by their check output: errors, warnings, and which ones. Then by the trade-offs the rules cannot see: view from the sofa, light at the desk, colour and wood tones, what you see when you open the door.
- If the user's choice beats your idea on the numbers, say so plainly.

## Changing the flat

If a piece cannot fit and the cause is a measurement, not the furniture, go back to the survey skill. Do not edit `flat.json` geometry to make a layout pass.
