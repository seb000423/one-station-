"""STEP -> one GLB per top-level station (XCAF), every node renamed generically, small parts dropped.
usage: [DEPTH=2] python -I step2glb.py file.stp outdir [lin_defl_mm] [min_part_mm]   (DEPTH=2: one GLB per station inside each cell)
Prints a JSON list of exported stations (index, original name, glb, bbox) to outdir/stations.json."""
import sys, os, json, time, re
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString, TCollection_AsciiString
from OCP.XCAFDoc import XCAFDoc_DocumentTool
from OCP.TDF import TDF_Label
from OCP.collections import Sequence_TDF_Label as TDF_LabelSequence, Map_TCollection_AsciiString, IndexedDataMap_TCollection_AsciiString_TCollection_AsciiString as MetaMap
from OCP.TDataStd import TDataStd_Name
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.RWGltf import RWGltf_CafWriter, RWGltf_WriterTrsfFormat
from OCP.RWMesh import RWMesh_CoordinateSystem
from OCP.Message import Message_ProgressRange
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.IFSelect import IFSelect_RetDone
from OCP.Interface import Interface_Static

src, out = sys.argv[1], sys.argv[2]
LIN = float(sys.argv[3]) if len(sys.argv) > 3 else 1.5
MINP = float(sys.argv[4]) if len(sys.argv) > 4 else 12.0
ANG = float(sys.argv[5]) if len(sys.argv) > 5 else 0.8
os.makedirs(out, exist_ok=True)
t0 = time.time()
Interface_Static.SetIVal_s("read.stepcaf.subshapes.name", 0)
doc = TDocStd_Document(TCollection_ExtendedString("doc"))
rd = STEPCAFControl_Reader(); rd.SetNameMode(True); rd.SetColorMode(True); rd.SetLayerMode(False)
if rd.ReadFile(src) != IFSelect_RetDone: sys.exit("read failed")
rd.Transfer(doc)
print("read+transfer %.0fs" % (time.time() - t0), flush=True)
st = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
roots = TDF_LabelSequence(); st.GetFreeShapes(roots)

def lname(l):
    n = TDataStd_Name(); return n.Get().ToExtString() if l.FindAttribute(TDataStd_Name.GetID_s(), n) else ""

# rename every label generically (names in the STEP carry part numbers and vendor names)
cnt = [0]
def rename_all(l):
    cnt[0] += 1
    TDataStd_Name.Set_s(l, TCollection_ExtendedString("n%d" % cnt[0]))
    for i in range(1, l.NbChildren() + 1):
        rename_all(l.FindChild(i, False))
# children of top-level stations: collect first (before renaming) with original names
def kids(l):
    seq = TDF_LabelSequence()
    if st.IsReference_s(l):
        ref = TDF_Label(); st.GetReferredShape_s(l, ref); st.GetComponents_s(ref, seq)
    else: st.GetComponents_s(l, seq)
    return [seq.Value(i) for i in range(1, seq.Length() + 1)]

# drop tiny parts (fasteners): remove components whose shape bbox diagonal < MINP (mm)
def diag(l):
    b = Bnd_Box(); BRepBndLib.Add_s(st.GetShape_s(l), b, False)
    if b.IsVoid(): return 0
    a, c = b.CornerMin(), b.CornerMax(); x0, y0, z0, x1, y1, z1 = a.X(), a.Y(), a.Z(), c.X(), c.Y(), c.Z(); return ((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2) ** .5
removed = [0]
def prune(l, seen):
    ref = l
    if st.IsReference_s(l): ref = TDF_Label(); st.GetReferredShape_s(l, ref)
    key = ref.Tag(), ref.Depth(), ref.Father().Tag()
    if key in seen: return
    seen.add(key)
    seq = TDF_LabelSequence(); st.GetComponents_s(ref, seq)
    for i in range(1, seq.Length() + 1):
        c = seq.Value(i)
        if diag(c) < MINP:
            st.RemoveComponent(c); removed[0] += 1
        else: prune(c, seen)

stations = []
DEPTH = int(os.environ.get('DEPTH', '1'))   # 1: one GLB per cell (root child); 2: one GLB per station inside a cell (root grandchild)
def level(r):
    cs = kids(r)
    return cs if DEPTH < 2 else [g for c in cs for g in kids(c)]
for i in range(1, roots.Length() + 1):
    r = roots.Value(i)
    for j, c in enumerate(level(r)):
        b = Bnd_Box(); BRepBndLib.Add_s(st.GetShape_s(c), b, False)
        bb = [b.CornerMin().X(), b.CornerMin().Y(), b.CornerMin().Z(), b.CornerMax().X(), b.CornerMax().Y(), b.CornerMax().Z()] if not b.IsVoid() else None
        stations.append(dict(root=i, idx=j, name=lname(c), nkids=len(kids(c)), bbox=bb, label=c))
print(len(stations), "stations; pruning tiny parts...", flush=True)
seen = set()
for s in stations: prune(s['label'], seen)
print("removed", removed[0], "tiny components", flush=True)
st.UpdateAssemblies()

# mesh everything once
for i in range(1, roots.Length() + 1):
    BRepMesh_IncrementalMesh(st.GetShape_s(roots.Value(i)), LIN, False, ANG, True)
print("meshed %.0fs" % (time.time() - t0), flush=True)

# rename after meshing (names are only metadata)
for i in range(1, roots.Length() + 1): rename_all(roots.Value(i))
# also rename referred prototypes
allsh = TDF_LabelSequence(); st.GetShapes(allsh)
for i in range(1, allsh.Length() + 1): TDataStd_Name.Set_s(allsh.Value(i), TCollection_ExtendedString("p%d" % i))

meta = MetaMap(); nofilter = Map_TCollection_AsciiString()
for k, s in enumerate(stations):
    fn = os.path.join(out, "st%02d.glb" % k)
    w = RWGltf_CafWriter(TCollection_AsciiString(fn), True)
    w.SetTransformationFormat(RWGltf_WriterTrsfFormat.RWGltf_WriterTrsfFormat_Compact)
    w.SetMergeFaces(True); w.SetSplitIndices16(False)
    w.SetToEmbedTexturesInGlb(True)
    w.CoordinateSystemConverter().SetInputLengthUnit(0.001)
    w.CoordinateSystemConverter().SetInputCoordinateSystem(RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Zup)
    w.CoordinateSystemConverter().SetOutputLengthUnit(1.0)
    w.CoordinateSystemConverter().SetOutputCoordinateSystem(RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_glTF)
    seq = TDF_LabelSequence(); seq.Append(s['label'])
    ok = w.Perform(doc, seq, None, meta, Message_ProgressRange())
    s['glb'] = os.path.basename(fn); s['ok'] = bool(ok); s['kb'] = os.path.getsize(fn) // 1024 if os.path.exists(fn) else 0
    print("%s %-50s %6d KB" % (s['glb'], s['name'][:50], s['kb']), flush=True)
for s in stations: del s['label']
json.dump(stations, open(os.path.join(out, "stations.json"), "w"), ensure_ascii=False, indent=1)
print("done %.0fs" % (time.time() - t0))
