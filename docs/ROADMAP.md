# Roadmap

## Done
- Flat model: measurements with sources, formulas for slanted and non-square rooms, cross-checks
- Live two-way sync between the browser and the JSON files; snapshots for agents
- Rules: overlaps, walls, door and drawer swings, radiator and boiler clearance, walkways at 60 and 80 cm, bed access, sockets, desk daylight
- Skills: survey, layout, present; `npm run survey`

## Next
1. **Optimiser.** `npm run optimise -- --room <id>`: search positions and rotations against a score built from the rules, and write the top 3 candidates to `data/layouts/`.
2. **Config, not code.** Move rule limits and furniture kinds to a file the user can edit.
3. **Tests.** Unit tests for the geometry and the rules, run on `examples/demo`.
4. **Photos in the plan.** A product photo as the texture of a rug or a piece of furniture.
5. **Realism.** Better materials and window light; GLTF models as an option.
6. **Packaging.** A Claude Code plugin, so the skills can be installed without cloning.
