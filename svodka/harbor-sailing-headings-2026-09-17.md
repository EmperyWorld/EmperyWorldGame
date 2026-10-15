# Haven sailing fleet — 8-way headings, no oars

## Scheme
- Headings: `e se s sw w nw n ne` (screen +x east, +y south).
- Hulls: brig, cog, ferry, barge, fishing, caravel, skiff.
- Galley/rowboat dropped. Placement ids stay unsuffixed; art is `prop_ship_<hull>_<heading>`.
- Chandler is land, not a hull.

## Media
- Profile `ship_sprite` (top-down ship portrait, no oars in prompt/negative).
- 63/63 WebP generated (7×9). Atlas `empery_haven` 283 frames, no leftover.
- In-game: brig `e`→`sw`, barge/cog/caravel `s`→`e`→`w`. Berthed skiff/fishing stay `s`.

## Incomplete
- Some south views leaked hull lettering (`SOUSTH`). Prompt words softened; not re-forced.
- Flux headings are 3/4 museum views, not flat deck-plans. Bow still changes with the leg.
- `keysray`/`Zebra` is not the live password; verify used `shipqa`.
