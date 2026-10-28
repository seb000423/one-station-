import re,sys,collections,json
import numpy as np
f=sys.argv[1]; depth=int(sys.argv[2])
def dec(s):
    s=s.replace("''","'")
    def r(m):
        h=m.group(1); return ''.join(chr(int(h[i:i+4],16)) for i in range(0,len(h),4))
    s=re.sub(r'\\X2\\([0-9A-F]+)\\X0\\',r,s)
    s=re.sub(r'\\X\\([0-9A-F]{2})',lambda m:bytes([int(m[1],16)]).decode('latin1'),s)
    return s
refs=lambda s:[int(x) for x in re.findall(r'#(\d+)',s)]
strs=lambda s:re.findall(r"'((?:[^']|'')*)'",s)
T1=('PRODUCT(','PRODUCT_DEFINITION_FORMATION','PRODUCT_DEFINITION(','NEXT_ASSEMBLY_USAGE_OCCURRENCE(','PRODUCT_DEFINITION_SHAPE(','CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(','ITEM_DEFINED_TRANSFORMATION(','REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION')
def stream(pred):
    buf=[]
    with open(f,'r',errors='replace') as fh:
        for line in fh:
            buf.append(line.rstrip('\n'))
            if line.rstrip().endswith(';'):
                s=''.join(buf); buf=[]
                if s.startswith('#'):
                    i=s.index('=')
                    k=int(s[1:i]); body=s[i+1:]
                    r=pred(k,body)
                    if r: yield k,body
E={}
for k,b in stream(lambda k,b: b.startswith(T1) or ('REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION' in b and b.startswith('('))): E[k]=b
prod={};pdf={};pd={};nauo={};pds={};cdsr={};idt={};rr={}
for k,b in E.items():
    if b.startswith('PRODUCT('): prod[k]=dec(strs(b)[0])
    elif b.startswith('PRODUCT_DEFINITION_FORMATION'): pdf[k]=refs(b)[0]
    elif b.startswith('PRODUCT_DEFINITION('): pd[k]=refs(b)[0]
    elif b.startswith('NEXT_ASSEMBLY'): r=refs(b); nauo[k]=(r[0],r[1],dec(strs(b)[0]) if strs(b) else '')
    elif b.startswith('PRODUCT_DEFINITION_SHAPE('): r=refs(b); pds[k]=r[-1]
    elif b.startswith('CONTEXT_DEPENDENT'): r=refs(b); cdsr[r[1]]=r[0]
    elif b.startswith('ITEM_DEFINED'): r=refs(b); idt[k]=(r[0],r[1])
    elif 'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION' in b:
        m=re.search(r'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION\(\s*#(\d+)',b); rr[k]=int(m[1])
# nauo -> idt
pds_by_nauo={v:k for k,v in pds.items()}
occ_idt={}
for n in nauo:
    p=pds_by_nauo.get(n); r=cdsr.get(p) if p else None
    if r in rr and rr[r] in idt: occ_idt[n]=idt[rr[r]]
need=set(a for pr in occ_idt.values() for a in pr)
A={}
for k,b in stream(lambda k,b: k in need): A[k]=refs(b)
need2=set(x for v in A.values() for x in v)
P={}
for k,b in stream(lambda k,b: k in need2):
    m=re.search(r'\(([-\d.,E+e\s]+)\)\s*\)',b)
    P[k]=np.array([float(x) for x in m[1].split(',')]) if m else np.array([0.,0.,0.])
def frame(a):
    r=A[a]; o=P[r[0]]; z=P[r[1]] if len(r)>1 else np.array([0,0,1.]); x=P[r[2]] if len(r)>2 else np.array([1,0,0.])
    z=z/np.linalg.norm(z); x=x-z*np.dot(x,z); x/=np.linalg.norm(x); y=np.cross(z,x)
    M=np.eye(4); M[:3,0]=x;M[:3,1]=y;M[:3,2]=z;M[:3,3]=o; return M
def occM(n):
    if n not in occ_idt: return np.eye(4)
    a1,a2=occ_idt[n]; return frame(a2)@np.linalg.inv(frame(a1))
name=lambda d: prod.get(pdf.get(pd.get(d)),'?')
ch=collections.defaultdict(list); kids=set()
for n,(p,c,_) in nauo.items(): ch[p].append((c,n)); kids.add(c)
roots=[d for d in pd if d not in kids and ch[d]]
# subtree origin extent
def origins(d,M,out,lv=0):
    out.append(M[:3,3])
    for c,n in ch[d]: origins(c,M@occM(n),out,lv+1)
res=[]
def show(d,M,lv,path):
    for c,n in ch[d]:
        W=M@occM(n); pts=[]; origins(c,W,pts); pts=np.array(pts)
        lo=pts.min(0); hi=pts.max(0)
        rec=dict(path=path+[name(c)],lv=lv,origin=W[:3,3].round(0).tolist(),xaxis=W[:3,0].round(3).tolist(),lo=lo.round(0).tolist(),hi=hi.round(0).tolist(),nkids=len(ch[c]))
        res.append(rec)
        print('  '*lv+f"{name(c)} | o={W[:3,3].round(0).tolist()} ext=[{lo[0]:.0f},{lo[1]:.0f},{lo[2]:.0f}]..[{hi[0]:.0f},{hi[1]:.0f},{hi[2]:.0f}] kids={len(ch[c])}")
        if lv<depth: show(c,W,lv+1,path+[name(c)])
for r in roots:
    print('ROOT',name(r)); show(r,np.eye(4),1,[name(r)])
json.dump(res,open(sys.argv[3],'w'),ensure_ascii=False,indent=0)
