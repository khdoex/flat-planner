# File format

A plan is two kinds of JSON file in the data folder (`data/`, or `$PLANNER_DATA`, or the bundled `examples/demo`):

- `flat.json`: the flat itself. Rooms, walls, doors, windows and fixed fittings.
- `layout.json` and `layouts/*.json`: furniture. One file per arrangement you want to compare.

All lengths are centimetres. Pages and scripts call these files `data/flat.json`, `data/layouts/x.json` and so on, wherever the folder really is.

## Coordinates

`x` and `z` are the floor plane and `y` is up. You choose where `x = 0` and `z = 0` are. A good choice is one inside corner of the main room, with `z` running away from its window wall. Write the choice in the `frame` field so the next reader knows.

## Measurements: `dims`

Every number the user gives goes in `dims`, with a name, a value and where it came from:

```json
"l_far": {"v": 380, "status": "uncertain", "room": "living", "label": "Width at the far wall", "note": "measured once, across the sofa"}
```

`status` is one of these, from strongest to weakest evidence:

| status | meaning |
|---|---|
| `tape` | tape-measured |
| `uncertain` | tape-measured, but the reading is in doubt |
| `guess` | the owner's estimate |
| `photo` | estimated from a photo against something of known size |
| `sketch` | read off a hand drawing |
| `assumed` | not given at all; a typical value |

Anything that is not `tape` is highlighted in the UI and listed by `npm run survey`. `room` groups the field in the UI (`flat` for whole-flat values). Names must be letters, digits and `_`.

`T` (wall thickness) and `H` (ceiling height) are required dims.

## Expressions

Every coordinate, and every value in `derived`, may be a number or an expression over dim names and earlier `derived` names:

```json
"derived": { "h_z0": "l_len + T" }
```

Allowed: numbers, names, `+ - * / ( )`, and the functions `lerp(a, b, t)`, `sqrt`, `hypot`, `min`, `max`, `abs`, `circX(...)`, `circZ(...)`.

- **Slanted wall.** A point on a straight wall that runs from width `a` (at `z = 0`) to width `b` (at `z = L`) is at `x = lerp(a, b, z / L)`.
- **Four-sided room with no right angle.** Measure the four sides and assume one right angle, or better, measure one diagonal. The free corner is where two circles meet. `circX(x1, z1, r1, x2, z2, r2)` and `circZ(...)` give that point; of the two intersections, they return the one with the larger `x`.

## Rooms

```json
{"id": "living", "name": "Living room", "floor": "laminate-wood", "origin": [0, 0], "note": "...",
 "walls": [
   {"id": "window", "name": "Window wall", "from": [0, 0]},
   {"id": "east", "name": "East wall", "from": ["l_win", 0]},
   {"id": "far", "name": "Far wall", "from": ["l_far", "l_len"]},
   {"id": "west", "name": "West wall", "from": [0, "l_len"]}
 ]}
```

- The room is the polygon through the walls' `from` points, in order. Each wall runs from its own `from` point to the next wall's `from` point.
- Leave a gap of `T` between rooms that share a wall. The wall is drawn once, in the gap.
- A wall with `"open": true` is a room boundary with no wall, such as an alcove opening.
- `origin` is the corner that furniture positions in this room are measured from.
- `floor` is one of `laminate-dark`, `laminate-wood`, `tile`, `marble`, `bath`.

## Openings

```json
{"id": "living-door", "name": "living-room door", "kind": "door", "room": "living", "wall": "far",
 "from": "l_doorGap", "width": "l_door", "y1": "doorH", "hinge": "start", "swing": "in"}
```

- `from` is the distance along the wall, from the wall's start, to the near edge of the opening.
- Windows take `y0` (sill height) and `y1` (head height).
- For doors, `hinge` is `start` or `end`: which jamb carries the hinges, counted along the wall's direction. `swing` is `in` (into `room`) or `out` (into the room on the other side).
- Define each door once, in the room it opens into. It cuts the wall on both sides.
- The flat's front door is found automatically: it is the one door with no room behind it. Walkways are measured from there.

## Fixtures

Fixed things that furniture must respect. Each is a prism with a `rect: [x0, z0, x1, z1]` or a `poly`, a base height `y0` and a height `h`:

```json
{"id": "living-radiator", "kind": "radiator", "room": "living", "name": "Radiator", "rect": ["(l_win - l_rad) / 2", 1, "(l_win + l_rad) / 2", 11], "y0": 15, "h": 60, "mat": "radiator"}
```

`kind` matters to the rules:

| kind | rule |
|---|---|
| `radiator` | keep 20 cm clear in front |
| `boiler` (also `kombi`) | keep 60 cm clear in front |
| `socket` | nightstands should be within 150 cm of one |
| `column`, `builtin`, `counter`, `fridge`, `shower`, `toilet`, anything else standing below 50 cm | furniture may not overlap it |
| `switch` | no piece taller than the switch within 30 cm in front |
| `glass`, anything with `y0` of 50 or more | drawn only |

`mat` is one of `wall`, `radiator`, `plate` (sockets), `cabinet`, `metal`, `glass`, `white`. Set `"label": true` to show `name` in room views.

## Checks

Redundant measurements that should agree. They catch misread tapes:

```json
{"label": "Bedroom window wall: parts add up to the width", "room": "bed", "a": "b_winTail + b_winW + b_winHead", "b": "b_w", "tol": 2}
```

Add one whenever the user measures both a total and its parts, or a wall both directly and indirectly. `tol` defaults to 2 cm.

## Furniture: layout files

```json
{"name": "demo", "note": "...", "items": [
  {"id": "sofa", "kind": "sofa", "name": "Sofa", "room": "living", "x": 150, "z": 470, "rotation": 180, "w": 220, "d": 90, "h": 85, "color": "#7A8B6F"}
]}
```

- `x`, `z` is the centre, measured from the room's `origin`.
- `w` is across the front, `d` is front to back, `h` is height.
- `rotation` is in degrees, any value. At `rotation: 0` the back faces `-z`.
- `y` raises a piece onto another one, for example a monitor at `y: 75` on a desk.
- `kind` sets the 3D shape and the rules. Kinds with their own shapes: `sofa`, `armchair`, `chair`, `markus` (office chair), `desk` (`"panels": true` for closed sides), `table`, `coffee`, `bed` (headboard at the back), `nightstand`, `wardrobe` (`"style": "oak"` for doors), `lamp` (gives light), `plant`, `rug`. Any other kind is a box. Rules also know `chest`, `dresser` (drawers), `shelf` and `monitor`.
