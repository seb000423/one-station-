# EGR welding module line — CAD → GLB

The five cell models in `assets/models/egr-weld-module/` come from the line builder's STEP files (Inventor, AP214, mm, Z up).
The STEP files themselves stay off the repo (customer data); the pipeline runs on the Ubuntu PC with the `~/.venvs/one-station`
venv (cadquery-ocp 8.0) and the realvirtual-WEB checkout (three 0.185, Playwright, Chrome) next to this repo.

1. `step-tree.py file.stp depth out.json` — prints the assembly tree with every subassembly's placement (origin, extents in mm),
   to pick the cells and read their CAD coordinates for the layout.
2. `step2glb.py file.stp outdir lin_mm min_part_mm ang_rad` — XCAF read, prunes components smaller than `min_part_mm` (fasteners),
   meshes everything once, renames every label generically (part numbers and vendor names never reach the GLB) and writes one GLB
   per top-level child of the root assembly (`st00.glb` …, with `stations.json` listing index, original name and bbox).
   Used: `4 25 0.9`.
3. `glb-simplify.mjs outdir ratio error budget mindiag in.glb …` (`MERGE=name` merges the inputs into one file) — drops CAD wire
   edges and meshes smaller than `mindiag` m, simplifies every mesh with meshopt (regular, then sloppy when the target is missed),
   merges per material, rotates Z up → Y up and re-exports. Used: `0.3 1.0 300000 0.04` per line cell, `250000` for the merged
   leak test cell. The result boxes (metres, CAD frame) are in `summary.json` and are what `tools/egr-weld-module-layout.py` places.

| GLB | CAD cell | tris |
|---|---|---|
| cell_paste.glb | A core-assy loading & Ni paste apply (2 lanes) | 311 k |
| cell_tank.glb | B end-tank assembly + scan laser welding | 364 k |
| cell_weld.glb | C tack welding (4 MIG robots, jig transfer, manual MIG) | 430 k |
| cell_cf.glb | D C/F check, external paste, manual check, unloading | 324 k |
| cell_leak.glb | E leak test (28 sub-stations merged) | 238 k |

The GLBs are uncompressed (no gltfpack on this PC yet); `gltfpack -cc` would cut them to roughly a quarter.
