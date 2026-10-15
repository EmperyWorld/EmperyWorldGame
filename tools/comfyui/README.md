# ComfyUI terrain tools

Container: `podman ps` → `comfyui` (`:31003→3000`).
Models/outputs: `~/podryad/models/comfyui`, `~/podryad/outputs/comfyui`.

## Batch

```bash
pnpm --filter @empery/shared build && pnpm --filter @empery/media build
pnpm tsx scripts/comfy-terrain-tool.ts   # health + dump API graphs
pnpm generate:media:terrain              # tile_haven_* via SD1.5 + pack
pnpm bake:terrain:haven                  # reliable fine strip (ship this if Comfy is noisy)
```

## Scale rule

Each 64px cell must show **≥10–16** cobbles across — not 2–4 giant slabs.

## Notes

- Flux Klein distilled → noise on terrain; terrain profiles force **SD1.5** txt2img.
- Custom nodes available in container: `ImageTile+`, `TilePreprocessor`, etc. (see tool output).
- API dumps: `tile_haven_*.api.json` from `buildWorkflowForJob`.
