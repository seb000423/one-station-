# realvirtual models

`station.glb` is console 1's station (console.html, default settings: tube product, 6 slots,
idle home pose), exported by `tools/export-station-glb.cjs`. Rerun that script after changing
the station in console.html:

    node tools/export-station-glb.cjs

It is kept outside `realvirtual/` so updating the realvirtual WEB build does not overwrite it.
Stage 1: geometry only, no realvirtual drives/sensors/logic yet.
