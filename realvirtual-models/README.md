# realvirtual models

`station.glb` is console 1's station (console.html, default settings: tube product, 6 slots)
exported by `tools/export-station-glb.cjs`, including console 1's full 9-step cycle as a
realvirtual drive recording that plays on load and loops. Rerun the script after changing
the station or the cycle in console.html:

    node tools/export-station-glb.cjs

What the export contains:

- Robots R1/R2 as FR5 DH joint chains (`R1_J1`…`R1_J6`), R1 rail on `R1_Handler`, gripper
  fingers, positioner tilt/rotary and clamps, door leaves, and a 6-axis rig per product
  (`PartN_TX`…`PartN_RZ`) so the products follow the gripper and the positioner — 57 drives.
- `DrivesRecorder` + `DrivesRecording_compact` on `ONE_STATION`: one 40 ms frame per 160 ms of
  console 1 sim time, so 1x playback matches console 1 on its default SIM 4x (~7.3 min loop for
  the ~29 min cycle).
- Not included: paste beads (console 1 grows them with drawRange), tower lamp / START button
  light states, the scale LCD values, and console 1's floor, grid and lights.

`station-timeline.json` comes from the same recording run: what console 1's HUD and result table
show at every frame (phase, robot step labels, current step, clock, joint readout, results) plus the
static panel content. console2.html reads realvirtual's playback frame from the iframe and renders
console 1's panels from it. Math.random is seeded in the export, so DMC codes, weights and simulated
faults are the same on every run.

console.html's '홈 복귀' segment leaves R1's joints NaN at the end of the cycle (its begin() never
sets dq); the export eases R1 back to the home pose there instead.

They are kept outside `realvirtual/` so updating the realvirtual WEB build does not overwrite them.
