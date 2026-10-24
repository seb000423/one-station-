import{fh as Pt,fi as ue,fj as T,fk as N,fl as Be,fm as Vt,fn as Ae,c7 as ht,fo as pt,c8 as _e,fp as Me,fq as Te,fr as Se,fs as De,ft as Rt,fu as Pe,fv as Ee,fw as Fe,fx as Ne,fy as He,fz as Ve}from"./index-BJA5YrME.js";import{fA as Xn,fB as Yn,fC as $n,fD as jn,fE as Kn,fF as Zn,fG as Jn}from"./index-BJA5YrME.js";import{f as D,R as yt,V as b,k as O,eK as Re,a as et,B as C,a1 as de,K as ze,au as ke,fL as X,d as tt,a6 as Et,G as Ce,aL as Oe,M as We,A as Le,L as G,eO as fe,eN as he,eJ as pe,a0 as me,dy as qe,F as J,aG as ft,U as Q,l as Mt,bn as U,o as zt,aJ as Ue,aI as kt,aH as Ge,n as mt,m as Tt,bu as ye,p as Xe,aM as Ye,aF as $e,g as je,e as Ft}from"./three-DU3Pq3qW.js";/*! @license realvirtual WEB | AGPL-3.0-only | Copyright (C) 2025 realvirtual GmbH | https://realvirtual.io */const Ct=new D,W=new yt,Ot=new ue(()=>new Re),xt=new b,Wt=new b,it=new O,vt=new b,Lt=["getX","getY","getZ"];class Ke extends Pt{get primitiveStride(){return 2}writePrimitiveBounds(e,t,n){const i=this._indirectBuffer,{geometry:r,primitiveStride:c}=this,u=r.attributes.position,l=r.index,o=l?l.count:u.count;let s=(i?i[e]:e)*c,f=(s+1)%o;l&&(s=l.getX(s),f=l.getX(f));for(let h=0;h<3;h++){const p=u[Lt[h]](s),m=u[Lt[h]](f),y=p<m?p:m,x=p>m?p:m;t[n+h]=y,t[n+h+3]=x}return t}shapecast(e){const t=Ot.getPrimitive(),n=super.shapecast({...e,intersectsPrimitive:e.intersectsLine,scratchPrimitive:t,iterate:Je});return Ot.releasePrimitive(t),n}raycastObject3D(e,t,n=[]){const{matrixWorld:i}=e,{firstHitOnly:r}=t;Ct.copy(i).invert(),W.copy(t.ray).applyMatrix4(Ct);const u=t.params.Line.threshold/((e.scale.x+e.scale.y+e.scale.z)/3),l=u*u;let o=null,d=1/0;return this.shapecast({boundsTraverseOrder:s=>s.distanceToPoint(W.origin),intersectsBounds:s=>{if(it.copy(s).expandByScalar(u),r){if(!W.intersectBox(it,vt))return T;let f;return it.containsPoint(W.origin)?f=0:(vt.applyMatrix4(i),f=t.ray.origin.distanceTo(vt)),f<d?N:T}else return W.intersectsBox(it)?N:T},intersectsLine:(s,f)=>{if(W.distanceSqToSegment(s.start,s.end,xt,Wt)>l)return;xt.applyMatrix4(e.matrixWorld);const p=t.ray.origin.distanceTo(xt);p<t.near||p>t.far||r&&p>=d||(d=p,f=this.resolvePrimitiveIndex(f),o={distance:p,point:Wt.clone().applyMatrix4(i),index:f*this.primitiveStride,face:null,faceIndex:null,barycoord:null,object:e},r||n.push(o))}}),r&&o&&n.push(o),n}}class Ze extends Ke{get primitiveStride(){return 1}constructor(e,t={}){t={...t,indirect:!0},super(e,t)}}class Bn extends Ze{getRootRanges(...e){const t=super.getRootRanges(...e);return t.forEach(n=>n.count--),t}}function Je(a,e,t,n,i,r,c){const{geometry:u,primitiveStride:l}=t,{index:o}=u,d=u.attributes.position,s=o?o.count:d.count;for(let f=a,h=e+a;f<h;f++){let m=t.resolvePrimitiveIndex(f)*l,y=(m+1)%s;if(o&&(m=o.getX(m),y=o.getX(y)),c.start.fromBufferAttribute(d,m),c.end.fromBufferAttribute(d,y),n(c,f,i,r))return!0}return!1}const qt=new D,H=new yt,Ut=new ue(()=>new b),st=new O,gt=new b;class An extends Pt{get primitiveStride(){return 1}writePrimitiveBounds(e,t,n){const i=this._indirectBuffer,{geometry:r}=this,c=r.attributes.position,u=r.index;let l=i?i[e]:e;u&&(l=u.getX(l));const o=c.getX(l),d=c.getY(l),s=c.getZ(l);return t[n+0]=o,t[n+1]=d,t[n+2]=s,t[n+3]=o,t[n+4]=d,t[n+5]=s,t}shapecast(e){const t=Ut.getPrimitive(),n=super.shapecast({...e,intersectsPrimitive:e.intersectsPoint,scratchPrimitive:t,iterate:Qe});return Ut.releasePrimitive(t),n}raycastObject3D(e,t,n=[]){const{geometry:i}=this,{matrixWorld:r}=e,{firstHitOnly:c}=t;qt.copy(r).invert(),H.copy(t.ray).applyMatrix4(qt);const l=t.params.Points.threshold/((e.scale.x+e.scale.y+e.scale.z)/3),o=l*l;let d=null,s=1/0;return this.shapecast({boundsTraverseOrder:f=>f.distanceToPoint(H.origin),intersectsBounds:f=>{if(st.copy(f).expandByScalar(l),c){if(!H.intersectBox(st,gt))return T;let h;return st.containsPoint(H.origin)?h=0:(gt.applyMatrix4(r),h=t.ray.origin.distanceTo(gt)),h<s?N:T}else return H.intersectsBox(st)?N:T},intersectsPoint:(f,h)=>{const p=H.distanceSqToPoint(f);if(p<o){const m=new b;H.closestPointToPoint(f,m),m.applyMatrix4(r);const y=t.ray.origin.distanceTo(m);if(y<t.near||y>t.far||c&&y>=s)return;s=y,h=this.resolvePrimitiveIndex(h),d={distance:y,distanceToRay:Math.sqrt(p),point:m,index:i.index?i.index.getX(h):h,face:null,faceIndex:null,barycoord:null,object:e},c||n.push(d)}}}),c&&d&&n.push(d),n}}function Qe(a,e,t,n,i,r,c){const{geometry:u}=t,{index:l}=u,o=u.attributes.position;for(let d=a,s=e+a;d<s;d++){const f=t.resolvePrimitiveIndex(d),h=l?l.array[f]:f;if(c.fromBufferAttribute(o,h),n(c,d,i,r))return!0}return!1}const _=new C,w=new D,Y=new D,Gt=new O,L=new de,E=new b,$=new yt,M=new et,Xt={};class _n extends Be{constructor(e,t={}){t={precise:!1,includeInstances:!0,matrixWorld:Array.isArray(e)?new D:e.matrixWorld,targetLeafSize:1,...t},super();const n=new Set;xe(e,n);const i=Array.from(n),r=Math.ceil(Math.log2(i.length)),c=(1<<r)-1;this.objects=i,this.idBits=r,this.idMask=c,this.primitiveBuffer=null,this.primitiveBufferStride=1,this.precise=t.precise,this.includeInstances=t.includeInstances,this.matrixWorld=t.matrixWorld,this.init(t)}getObjectFromId(e){const{idMask:t,objects:n}=this,i=St(e,t);return n[i]}getInstanceFromId(e){const{idMask:t,idBits:n}=this;return Dt(e,n,t)}init(e){const{objects:t,idBits:n,matrixWorld:i}=this;Y.copy(i).invert(),this.primitiveBuffer=new Uint32Array(this._countPrimitives(t)),this._fillPrimitiveBuffer(t,n,this.primitiveBuffer),super.init(e)}refit(...e){Y.copy(this.matrixWorld).invert(),super.refit(...e)}writePrimitiveBounds(e,t,n){const{primitiveBuffer:i}=this;this._getPrimitiveBoundingBox(i[e],Y,Gt);const{min:r,max:c}=Gt;t[n+0]=r.x,t[n+1]=r.y,t[n+2]=r.z,t[n+3]=c.x,t[n+4]=c.y,t[n+5]=c.z}getRootRanges(){return[{offset:0,count:this.primitiveBuffer.length}]}shapecast(e){return super.shapecast({...e,intersectsPrimitive:e.intersectsObject,scratchPrimitive:null,iterate:tn})}raycast(e,t=[]){const{matrixWorld:n,includeInstances:i}=this,{firstHitOnly:r}=e,c=[];Y.copy(n).invert(),$.copy(e.ray).applyMatrix4(Y);let u=1/0,l=null;return this.shapecast({boundsTraverseOrder:o=>o.distanceToPoint($.origin),intersectsBounds:o=>{if(r){if(!$.intersectBox(o,E))return T;let d;return o.containsPoint($.origin)?d=0:(E.applyMatrix4(n),d=e.ray.origin.distanceTo(E)),d<u?N:T}else return $.intersectsBox(o)?N:T},intersectsObject(o,d){if(o.visible){if(c.length=0,o.isInstancedMesh&&i)M.geometry=o.geometry,M.material=o.material,o.getMatrixAt(d,M.matrixWorld),M.matrixWorld.premultiply(o.matrixWorld),M.raycast(e,c),c.forEach(s=>{s.object=o,s.instanceId=d}),M.material=null;else if(o.isBatchedMesh&&i){if(!o.getVisibleAt(d))return;const s=o.getGeometryIdAt(d),f=o.getGeometryRangeAt(s,Xt);_.index=o.geometry.index,_.attributes=o.geometry.attributes,_.setDrawRange(f.start,f.count),M.geometry=_,M.material=o.material,o.getMatrixAt(d,M.matrixWorld),M.matrixWorld.premultiply(o.matrixWorld),M.raycast(e,c),c.forEach(h=>{h.object=o,h.batchId=d}),M.material=null,_.index=null,_.attributes=null,_.setDrawRange(0,1/0)}else o.raycast(e,c);r?c.forEach(s=>{s.distance<u&&(u=s.distance,l=s)}):t.push(...c)}}}),r&&l&&t.push(l),t}_getPrimitiveBoundingBox(e,t,n){const{objects:i,idMask:r,idBits:c,precise:u,includeInstances:l}=this,o=St(e,r),d=Dt(e,c,r),s=i[o];if(!l&&(s.isInstancedMesh||s.isBatchedMesh))s.boundingBox||s.computeBoundingBox(),s.boundingSphere||s.computeBoundingSphere(),w.copy(s.matrixWorld).premultiply(t),L.copy(s.boundingSphere).applyMatrix4(w),n.copy(s.boundingBox).applyMatrix4(w),bt(n,L);else if(u)if(s.isInstancedMesh)s.getMatrixAt(d,w),w.premultiply(s.matrixWorld).premultiply(t),Yt(s.geometry,w,n);else if(s.isBatchedMesh){const f=s.getGeometryIdAt(d),h=s.getGeometryRangeAt(f,Xt);_.index=s.geometry.index,_.attributes=s.geometry.attributes,_.setDrawRange(h.start,h.count),s.getMatrixAt(d,w),w.premultiply(s.matrixWorld).premultiply(t),Yt(_,w,n),_.attributes=null}else w.copy(s.matrixWorld).premultiply(t),n.setFromObject(s,!0).applyMatrix4(t);else if(s.isInstancedMesh)s.geometry.boundingBox||s.geometry.computeBoundingBox(),s.geometry.boundingSphere||s.geometry.computeBoundingSphere(),s.getMatrixAt(d,w),w.premultiply(s.matrixWorld).premultiply(t),L.copy(s.geometry.boundingSphere).applyMatrix4(w),n.copy(s.geometry.boundingBox).applyMatrix4(w),bt(n,L);else if(s.isBatchedMesh){const f=s.getGeometryIdAt(d);s.getMatrixAt(d,w),w.premultiply(s.matrixWorld).premultiply(t),s.getBoundingSphereAt(f,L).applyMatrix4(w),s.getBoundingBoxAt(f,n).applyMatrix4(w),bt(n,L)}else n.setFromObject(s,!1).applyMatrix4(t)}_countPrimitives(e){const{includeInstances:t}=this;let n=0;return e.forEach(i=>{if(i.isInstancedMesh&&t)n+=i.count;else if(i.isBatchedMesh&&t){if(!("instanceCount"in i))throw new Error("ObjectBVH: Three.js revision >= r169 is required to use BatchedMesh.");n+=i.instanceCount}else n++}),n}_fillPrimitiveBuffer(e,t,n){const{includeInstances:i}=this;let r=0;e.forEach((c,u)=>{if(c.isInstancedMesh&&i){const l=c.count;for(let o=0;o<l;o++)n[r]=o<<t|u,r++}else if(c.isBatchedMesh&&i){const{instanceCount:l,maxInstanceCount:o}=c;let d=0,s=0;for(;d<l&&s<o;){try{c.getVisibleAt(s),n[r]=s<<t|u,d++,r++}catch{}s++}}else n[r]=u,r++})}}function St(a,e){return a&e}function Dt(a,e,t){return(a&~t)>>>e}function xe(a,e=new Set){Array.isArray(a)?a.forEach(t=>xe(t,e)):a.traverse(t=>{(t.isMesh||t.isLine||t.isPoints)&&e.add(t)})}function Yt(a,e,t){t.makeEmpty();const n=a.drawRange,i=a.index,r=a.attributes.position,c=n.start,u=i?i.count:r.count,l=Math.min(u-c,n.count);for(let o=c,d=c+l;o<d;o++){let s=o;i&&(s=i.getX(s)),E.fromBufferAttribute(r,s).applyMatrix4(e),t.expandByPoint(E)}return t}function tn(a,e,t,n,i,r){const{primitiveBuffer:c,objects:u,idMask:l,idBits:o}=t;for(let d=a,s=e+a;d<s;d++){const f=c[d],h=St(f,l),p=Dt(f,o,l),m=u[h];if(n(m,p,i,r))return!0}return!1}function bt(a,e){E.copy(e.center).addScalar(-e.radius),a.min.max(E),E.copy(e.center).addScalar(e.radius),a.max.min(E)}const $t=new b,jt=new b,Kt=new b,P=new yt,Zt=new D,V=new b,It=new b,en=["x","y","z"],ot=parseInt(Et)>=169,nn=parseInt(Et)<=161,rt=new tt,at=new tt,ct=new tt,Jt=new b,Qt=new b,te=new b;class Mn extends Pt{get primitiveStride(){return 3}constructor(e,t={}){if(!e.isMesh)throw new Error("SkinnedMeshBVH: First argument must be a Mesh.");super(e.geometry,{...t,[Vt]:!0}),this.mesh=e,t[Vt]||this.init(t)}writePrimitiveBounds(e,t,n){const{mesh:i,geometry:r}=this,c=this._indirectBuffer,u=r.index?r.index.array:null,o=(c?c[e]:e)*3;let d=o+0,s=o+1,f=o+2;u&&(d=u[d],s=u[s],f=u[f]),i.getVertexPosition(d,$t),i.getVertexPosition(s,jt),i.getVertexPosition(f,Kt);for(let h=0;h<3;h++){const p=en[h],m=$t[p],y=jt[p],x=Kt[p];let g=m;y<g&&(g=y),x<g&&(g=x);let v=m;y>v&&(v=y),x>v&&(v=x),t[n+h]=g,t[n+h+3]=v}return t}shapecast(e){const t=new Ae;return super.shapecast({...e,intersectsPrimitive:e.intersectsTriangle,scratchPrimitive:t,iterate:sn})}raycastObject3D(e,t,n=[]){const{material:i}=e;if(i===void 0)return;const{matrixWorld:r}=e,{firstHitOnly:c}=t;Zt.copy(r).invert(),P.copy(t.ray).applyMatrix4(Zt);let u=null,l=1/0;return this.shapecast({boundsTraverseOrder:o=>o.distanceToPoint(P.origin),intersectsBounds:o=>{if(c){if(!P.intersectBox(o,It))return T;let d;return o.containsPoint(P.origin)?d=0:(It.applyMatrix4(r),d=t.ray.origin.distanceTo(It)),d<l?N:T}else return P.intersectsBox(o)?N:T},intersectsTriangle:(o,d)=>{let s=null;if(i.side===ze?s=P.intersectTriangle(o.a,o.b,o.c,!0,V):i.side===ke?s=P.intersectTriangle(o.c,o.b,o.a,!0,V):s=P.intersectTriangle(o.a,o.b,o.c,!1,V),!s)return;s=s.clone().applyMatrix4(r);const f=t.ray.origin.distanceTo(s);if(f>=t.near&&f<=t.far){if(c&&f>=l)return;const{geometry:h}=this,{index:p}=h,m=this.resolvePrimitiveIndex(d),y=m*3;let x=y+0,g=y+1,v=y+2;p&&(x=p.array[x],g=p.array[g],v=p.array[v]);const I={distance:f,point:s.clone(),object:e,uv:null,uv1:null,normal:null,face:{a:x,b:g,c:v,normal:X.getNormal(o.a,o.b,o.c,new b),materialIndex:0},faceIndex:m};if(ot){const F=new b;X.getBarycoord(V,o.a,o.b,o.c,F),I.barycoord=F}const A=h.attributes.uv,S=h.attributes.uv1,nt=h.attributes.normal;if(A){rt.fromBufferAttribute(A,x),at.fromBufferAttribute(A,g),ct.fromBufferAttribute(A,v),I.uv=new tt;const F=X.getInterpolation(V,o.a,o.b,o.c,rt,at,ct,I.uv);ot||(I.uv=F)}if(S){rt.fromBufferAttribute(S,x),at.fromBufferAttribute(S,g),ct.fromBufferAttribute(S,v),I.uv1=new tt;const F=X.getInterpolation(V,o.a,o.b,o.c,rt,at,ct,I.uv1);ot||(I.uv1=F),nn&&(I.uv2=I.uv1)}if(nt){Jt.fromBufferAttribute(nt,x),Qt.fromBufferAttribute(nt,g),te.fromBufferAttribute(nt,v),I.normal=new b;const F=X.getInterpolation(V,o.a,o.b,o.c,Jt,Qt,te,I.normal);I.normal.dot(P.direction)>0&&I.normal.multiplyScalar(-1),ot||(I.normal=F)}l=I.distance,u=I,c||n.push(I)}}}),c&&u&&n.push(u),n}}function sn(a,e,t,n,i,r,c){const{mesh:u,geometry:l}=t,o=l.index?l.index.array:null;for(let d=a,s=e+a;d<s;d++){const f=t.resolvePrimitiveIndex(d);let h=3*f+0,p=3*f+1,m=3*f+2;if(o&&(h=o[h],p=o[p],m=o[m]),u.getVertexPosition(h,c.a),u.getVertexPosition(p,c.b),u.getVertexPosition(m,c.c),c.needsUpdate=!0,n(c,d,i,r))return!0}return!1}const ee=new O,ne=new D,wt=new b;class on extends Le{get isMesh(){return!this.displayEdges}get isLineSegments(){return this.displayEdges}get isLine(){return this.displayEdges}getVertexPosition(...e){return et.prototype.getVertexPosition.call(this,...e)}constructor(e,t,n=10,i=0){super(),this.material=t,this.geometry=new C,this.name="BVHRootHelper",this.depth=n,this.displayParents=!1,this.bvh=e,this.displayEdges=!0,this._group=i}raycast(){}update(){const e=this.bvh;this.geometry.dispose(),this.visible=!1,e&&(this.geometry=this.getGeometry(e),this.visible=!0)}getGeometry(e){const t=this._group;let n=null;if(t!==-1)n=this.getBVHBoundPositions(e,t);else{const c=e._roots.map((o,d)=>this.getBVHBoundPositions(e,d)),u=c.reduce((o,d)=>o+d.length,0);n=new Float32Array(u);let l=0;c.forEach(o=>{n.set(o,l),l+=o.length})}const i=this.getBVHBoundIndices(n),r=new C;return r.setIndex(new G(i,1,!1)),r.setAttribute("position",new G(n,3,!1)),r}getBVHBoundIndices(e){const t=e.length/24;let n,i;this.displayEdges?i=new Uint8Array([0,4,1,5,2,6,3,7,0,2,1,3,4,6,5,7,0,1,2,3,4,5,6,7]):i=new Uint8Array([0,1,2,2,1,3,4,6,5,6,7,5,1,4,5,0,4,1,2,3,6,3,7,6,0,2,4,2,6,4,1,5,3,3,5,7]),e.length>65535?n=new Uint32Array(i.length*t):n=new Uint16Array(i.length*t);const r=i.length;for(let c=0;c<t;c++){const u=c*8,l=c*r;for(let o=0;o<r;o++)n[l+o]=u+i[o]}return n}getBVHBoundPositions(e,t=0,n=null){const i=this.depth-1,r=this.displayParents;let c=0;e.traverse((o,d)=>{if(o>=i||d)return c++,!0;r&&c++},t);let u=0;const l=new Float32Array(24*c);return e.traverse((o,d,s)=>{const f=o>=i||d;if(f||r){pt(0,s,ee);const{min:h,max:p}=ee;for(let m=-1;m<=1;m+=2){const y=m<0?h.x:p.x;for(let x=-1;x<=1;x+=2){const g=x<0?h.y:p.y;for(let v=-1;v<=1;v+=2){const I=v<0?h.z:p.z;wt.set(y,g,I),n&&wt.applyMatrix4(n),wt.toArray(l,u),u+=3}}}return f}},t),l}}class Nt extends Ce{get color(){return this.edgeMaterial.color}get opacity(){return this.edgeMaterial.opacity}set opacity(e){this.edgeMaterial.opacity=e,this.meshMaterial.opacity=e}get objectIndex(){return console.warn('BVHHelper: "objectIndex" has been renamed "instanceId".'),this.instanceId}set objectIndex(e){console.warn('BVHHelper: "objectIndex" has been renamed "instanceId".'),this.instanceId=e}constructor(e=null,t=null,n=10){e instanceof ht&&(n=t||10,t=e,e=null),typeof t=="number"&&(n=t,t=null),super(),this.name="BVHHelper",this.depth=n,this.mesh=e,this.bvh=t,this.displayParents=!1,this.displayEdges=!0,this.instanceId=0,this._roots=[];const i=new Oe({color:65416,transparent:!0,opacity:.3,depthWrite:!1}),r=new We({color:65416,transparent:!0,opacity:.3,depthWrite:!1});r.color=i.color,this.edgeMaterial=i,this.meshMaterial=r,this.update()}update(){const e=this.mesh,t=this.instanceId;let n=this.bvh||e.boundsTree||e.geometry&&e.geometry.boundsTree||null;if(e&&e.isBatchedMesh&&e.boundsTrees&&!n&&t>=0){const r=e._drawInfo[t];r&&(n=e.boundsTrees[r.geometryIndex]||n)}const i=n?n._roots.length:0;for(;this._roots.length>i;){const r=this._roots.pop();r.geometry.dispose(),this.remove(r)}for(let r=0;r<i;r++){const{depth:c,edgeMaterial:u,meshMaterial:l,displayParents:o,displayEdges:d}=this;if(r>=this._roots.length){const f=new on(n,u,c,r);this.add(f),this._roots.push(f)}const s=this._roots[r];s.bvh=n,s.depth=c,s.displayParents=o,s.displayEdges=d,s.material=d?u:l,s.update()}}updateMatrixWorld(...e){const t=this.mesh,n=this.parent,i=this.instanceId;t!==null&&(t.updateWorldMatrix(!0,!1),n?this.matrix.copy(n.matrixWorld).invert().multiply(t.matrixWorld):this.matrix.copy(t.matrixWorld),(t.isInstancedMesh||t.isBatchedMesh)&&i>=0&&(t.getMatrixAt(i,ne),this.matrix.multiply(ne)),this.matrix.decompose(this.position,this.quaternion,this.scale)),super.updateMatrixWorld(...e)}copy(e){this.depth=e.depth,this.mesh=e.mesh,this.bvh=e.bvh,this.opacity=e.opacity,this.color.copy(e.color)}clone(){return new Nt().copy(this)}dispose(){this.edgeMaterial.dispose(),this.meshMaterial.dispose();const e=this.children;for(let t=0,n=e.length;t<n;t++)e[t].geometry.dispose()}}class Tn extends Nt{constructor(...e){console.warn("MeshBVHHelper: Class has been deprecated. Use BVHHelper instead."),super(...e)}}const Bt=new O,j=new O;function ie(a){switch(typeof a){case"number":return 8;case"string":return a.length*2;case"boolean":return 4;default:return 0}}function rn(a){return/(Uint|Int|Float)(8|16|32)Array/.test(a.constructor.name)}function an(a,e){const t={nodeCount:0,leafNodeCount:0,depth:{min:1/0,max:-1/0},primitives:{min:1/0,max:-1/0},splits:[0,0,0],surfaceAreaScore:0};return a.traverse((n,i,r,c,u)=>{const l=r[3]-r[0],o=r[4]-r[1],d=r[5]-r[2],s=2*(l*o+o*d+d*l);t.nodeCount++,i?(t.leafNodeCount++,t.depth.min=Math.min(n,t.depth.min),t.depth.max=Math.max(n,t.depth.max),t.primitives.min=Math.min(u,t.primitives.min),t.primitives.max=Math.max(u,t.primitives.max),t.surfaceAreaScore+=s*Me*u):(t.splits[c]++,t.surfaceAreaScore+=s*Te)},e),t.primitives.min===1/0&&(t.primitives.min=0,t.primitives.max=0),t.depth.min===1/0&&(t.depth.min=0,t.depth.max=0),t}function Sn(a){return a._roots.map((e,t)=>an(a,t))}function Dn(a){const e=new Set,t=[a];let n=0;for(;t.length;){const i=t.pop();if(!e.has(i)){e.add(i);for(let r in i){if(!Object.hasOwn(i,r))continue;n+=ie(r);const c=i[r];c&&(typeof c=="object"||typeof c=="function")?rn(c)||_e()&&c instanceof SharedArrayBuffer||c instanceof ArrayBuffer?n+=c.byteLength:t.push(c):n+=ie(c)}}}return n}function Pn(a){const e=[],t=new Float32Array(6);let n=!0;return a.traverse((i,r,c,u,l)=>{const o={depth:i,isLeaf:r,boundingData:c,offset:u,count:l};e[i]=o,pt(0,c,Bt);const d=e[i-1];if(r){a.writePrimitiveRangeBounds(u,l,t,0),j.min.set(t[0],t[1],t[2]),j.max.set(t[3],t[4],t[5]);const s=Bt.containsBox(j);console.assert(s,"Leaf bounds does not fully contain primitives."),n=n&&s}if(d){pt(0,d.boundingData,j);const s=j.containsBox(Bt);console.assert(s,"Parent bounds does not fully contain child."),n=n&&s}}),n}function En(a){const e=[];return a.traverse((t,n,i,r,c)=>{const u={bounds:pt(0,i,new O)};n?(u.count=c,u.offset=r):(u.left=null,u.right=null),e[t]=u;const l=e[t-1];l&&(l.left===null?l.left=u:l.right=u)}),e[0]}const cn=parseInt(Et)>=166,q={Mesh:et.prototype.raycast,Line:pe.prototype.raycast,LineSegments:fe.prototype.raycast,LineLoop:he.prototype.raycast,Points:me.prototype.raycast,BatchedMesh:qe.prototype.raycast},B=new et,lt=[];function Fn(a,e){if(this.isBatchedMesh)ln.call(this,a,e);else{const{geometry:t}=this;if(t.boundsTree)t.boundsTree.raycastObject3D(this,a,e);else{let n;if(this instanceof et)n=q.Mesh;else if(this instanceof fe)n=q.LineSegments;else if(this instanceof he)n=q.LineLoop;else if(this instanceof pe)n=q.Line;else if(this instanceof me)n=q.Points;else throw new Error("BVH: Fallback raycast function not found.");n.call(this,a,e)}}}function ln(a,e){if(this.boundsTrees){const t=this.boundsTrees,n=this._drawInfo||this._instanceInfo,i=this._drawRanges||this._geometryInfo,r=this.matrixWorld;B.material=this.material,B.geometry=this.geometry;const c=B.geometry.boundsTree,u=B.geometry.drawRange;B.geometry.boundingSphere===null&&(B.geometry.boundingSphere=new de);for(let l=0,o=n.length;l<o;l++){if(!this.getVisibleAt(l))continue;const d=n[l].geometryIndex;if(B.geometry.boundsTree=t[d],this.getMatrixAt(l,B.matrixWorld).premultiply(r),!B.geometry.boundsTree){this.getBoundingBoxAt(d,B.geometry.boundingBox),this.getBoundingSphereAt(d,B.geometry.boundingSphere);const s=i[d];B.geometry.setDrawRange(s.start,s.count)}B.raycast(a,lt);for(let s=0,f=lt.length;s<f;s++){const h=lt[s];h.object=this,h.batchId=l,e.push(h)}lt.length=0}B.geometry.boundsTree=c,B.geometry.drawRange=u,B.material=null,B.geometry=null}else q.BatchedMesh.call(this,a,e)}function Nn(a={}){const{type:e=ht}=a;return this.boundsTree=new e(this,a),this.boundsTree}function Hn(){this.boundsTree=null}function Vn(a=-1,e={}){if(!cn)throw new Error("BatchedMesh: Three r166+ is required to compute bounds trees.");e={...e,range:null};const t=this._drawRanges||this._geometryInfo,n=this._geometryCount;this.boundsTrees||(this.boundsTrees=new Array(n).fill(null));const i=this.boundsTrees;for(;i.length<n;)i.push(null);if(a<0){for(let r=0;r<n;r++)e.range=t[r],i[r]=new ht(this.geometry,e);return i}else return a<t.length&&(e.range=t[a],i[a]=new ht(this.geometry,e)),i[a]||null}function Rn(a=-1){a<0?this.boundsTrees.fill(null):a<this.boundsTrees.length&&(this.boundsTrees[a]=null)}function un(a){switch(a){case 1:return"R";case 2:return"RG";case 3:return"RGBA";case 4:return"RGBA"}throw new Error}function dn(a){switch(a){case 1:return $e;case 2:return Ye;case 3:return mt;case 4:return mt}}function se(a){switch(a){case 1:return Xe;case 2:return ye;case 3:return Tt;case 4:return Tt}}class Ht extends Mt{constructor(){super(),this.minFilter=U,this.magFilter=U,this.generateMipmaps=!1,this.overrideItemSize=null,this._forcedType=null}updateFrom(e){const t=this.overrideItemSize,n=e.itemSize,i=e.count;if(t!==null){if(n*i%t!==0)throw new Error("VertexAttributeTexture: overrideItemSize must divide evenly into buffer length.");e.itemSize=t,e.count=i*n/t}const r=e.itemSize,c=e.count,u=e.normalized,l=e.array.constructor,o=l.BYTES_PER_ELEMENT;let d=this._forcedType,s=r;if(d===null)switch(l){case Float32Array:d=J;break;case Uint8Array:case Uint16Array:case Uint32Array:d=Q;break;case Int8Array:case Int16Array:case Int32Array:d=ft;break}let f,h,p,m,y=un(r);switch(d){case J:p=1,h=dn(r),u&&o===1?(m=l,y+="8",l===Uint8Array?f=zt:(f=kt,y+="_SNORM")):(m=Float32Array,y+="32F",f=J);break;case ft:y+=o*8+"I",p=u?Math.pow(2,l.BYTES_PER_ELEMENT*8-1):1,h=se(r),o===1?(m=Int8Array,f=kt):o===2?(m=Int16Array,f=Ge):(m=Int32Array,f=ft);break;case Q:y+=o*8+"UI",p=u?Math.pow(2,l.BYTES_PER_ELEMENT*8-1):1,h=se(r),o===1?(m=Uint8Array,f=zt):o===2?(m=Uint16Array,f=Ue):(m=Uint32Array,f=Q);break}s===3&&(h===mt||h===Tt)&&(s=4);const x=Math.ceil(Math.sqrt(c))||1,g=s*x*x,v=new m(g),I=e.normalized;e.normalized=!1;for(let A=0;A<c;A++){const S=s*A;v[S]=e.getX(A)/p,r>=2&&(v[S+1]=e.getY(A)/p),r>=3&&(v[S+2]=e.getZ(A)/p,s===4&&(v[S+3]=1)),r>=4&&(v[S+3]=e.getW(A)/p)}e.normalized=I,this.internalFormat=y,this.format=h,this.type=f,this.image.width=x,this.image.height=x,this.image.data=v,this.needsUpdate=!0,this.dispose(),e.itemSize=n,e.count=i}}class fn extends Ht{constructor(){super(),this._forcedType=Q}}class zn extends Ht{constructor(){super(),this._forcedType=ft}}class hn extends Ht{constructor(){super(),this._forcedType=J}}class kn{constructor(){this.index=new fn,this.position=new hn,this.bvhBounds=new Mt,this.bvhContents=new Mt,this._cachedIndexAttr=null,this.index.overrideItemSize=3}updateFrom(e){const{geometry:t}=e;if(mn(e,this.bvhBounds,this.bvhContents),this.position.updateFrom(t.attributes.position),e.indirect){const n=e._indirectBuffer;if(this._cachedIndexAttr===null||this._cachedIndexAttr.count!==n.length)if(t.index)this._cachedIndexAttr=t.index.clone();else{const i=Se(De(t));this._cachedIndexAttr=new G(i,1,!1)}pn(t,n,this._cachedIndexAttr),this.index.updateFrom(this._cachedIndexAttr)}else this.index.updateFrom(t.index)}dispose(){const{index:e,position:t,bvhBounds:n,bvhContents:i}=this;e&&e.dispose(),t&&t.dispose(),n&&n.dispose(),i&&i.dispose()}}function pn(a,e,t){const n=t.array,i=a.index?a.index.array:null;for(let r=0,c=e.length;r<c;r++){const u=3*r,l=3*e[r];for(let o=0;o<3;o++)n[u+o]=i?i[l+o]:l+o}}function mn(a,e,t){const n=a._roots;if(n.length!==1)throw new Error("MeshBVHUniformStruct: Multi-root BVHs not supported.");const i=n[0],r=new Uint16Array(i),c=new Uint32Array(i),u=new Float32Array(i),l=i.byteLength/Rt,o=2*Math.ceil(Math.sqrt(l/2)),d=new Float32Array(4*o*o),s=Math.ceil(Math.sqrt(l)),f=new Uint32Array(2*s*s);for(let h=0;h<l;h++){const p=h*Rt/4,m=p*2,y=He(p);for(let x=0;x<3;x++)d[8*h+0+x]=u[y+0+x],d[8*h+4+x]=u[y+3+x];if(Pe(m,r)){const x=Ee(m,r),g=Fe(p,c),v=Ve|x;f[h*2+0]=v,f[h*2+1]=g}else{const x=c[p+6],g=Ne(p,c);f[h*2+0]=g,f[h*2+1]=x}}e.image.data=d,e.image.width=o,e.image.height=o,e.format=mt,e.type=J,e.internalFormat="RGBA32F",e.minFilter=U,e.magFilter=U,e.generateMipmaps=!1,e.needsUpdate=!0,e.dispose(),t.image.data=f,t.image.width=s,t.image.height=s,t.format=ye,t.type=Q,t.internalFormat="RG32UI",t.minFilter=U,t.magFilter=U,t.generateMipmaps=!1,t.needsUpdate=!0,t.dispose()}const R=new b,z=new b,k=new b,oe=new Ft,ut=new b,At=new b,re=new Ft,ae=new Ft,dt=new D,ce=new D;function K(a,e){if(!a&&!e)return;const t=a.count===e.count,n=a.normalized===e.normalized,i=a.array.constructor===e.array.constructor,r=a.itemSize===e.itemSize;if(!t||!n||!i||!r)throw new Error}function Z(a,e=null){const t=a.array.constructor,n=a.normalized,i=a.itemSize,r=e===null?a.count:e;return new G(new t(i*r),i,n)}function ve(a,e,t=0){if(a.isInterleavedBufferAttribute){const n=a.itemSize;for(let i=0,r=a.count;i<r;i++){const c=i+t;e.setX(c,a.getX(i)),n>=2&&e.setY(c,a.getY(i)),n>=3&&e.setZ(c,a.getZ(i)),n>=4&&e.setW(c,a.getW(i))}}else{const n=e.array,i=n.constructor,r=n.BYTES_PER_ELEMENT*a.itemSize*t;new i(n.buffer,r,a.array.length).set(a.array)}}function yn(a,e,t){const n=a.elements,i=e.elements;for(let r=0,c=i.length;r<c;r++)n[r]+=i[r]*t}function le(a,e,t){const n=a.skeleton,i=a.geometry,r=n.bones,c=n.boneInverses;re.fromBufferAttribute(i.attributes.skinIndex,e),ae.fromBufferAttribute(i.attributes.skinWeight,e),dt.elements.fill(0);for(let u=0;u<4;u++){const l=ae.getComponent(u);if(l!==0){const o=re.getComponent(u);ce.multiplyMatrices(r[o].matrixWorld,c[o]),yn(dt,ce,l)}}return dt.multiply(a.bindMatrix).premultiply(a.bindMatrixInverse),t.transformDirection(dt),t}function _t(a,e,t,n,i){ut.set(0,0,0);for(let r=0,c=a.length;r<c;r++){const u=e[r],l=a[r];u!==0&&(At.fromBufferAttribute(l,n),t?ut.addScaledVector(At,u):ut.addScaledVector(At.sub(i),u))}i.add(ut)}function xn(a,e={useGroups:!1,updateIndex:!1,skipAttributes:[]},t=new C){const n=a[0].index!==null,{useGroups:i=!1,updateIndex:r=!1,skipAttributes:c=[]}=e,u=new Set(Object.keys(a[0].attributes)),l={};let o=0;t.clearGroups();for(let d=0;d<a.length;++d){const s=a[d];let f=0;if(n!==(s.index!==null))throw new Error("StaticGeometryGenerator: All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.");for(const h in s.attributes){if(!u.has(h))throw new Error('StaticGeometryGenerator: All geometries must have compatible attributes; make sure "'+h+'" attribute exists among all geometries, or in none of them.');l[h]===void 0&&(l[h]=[]),l[h].push(s.attributes[h]),f++}if(f!==u.size)throw new Error("StaticGeometryGenerator: Make sure all geometries have the same number of attributes.");if(i){let h;if(n)h=s.index.count;else if(s.attributes.position!==void 0)h=s.attributes.position.count;else throw new Error("StaticGeometryGenerator: The geometry must have either an index or a position attribute");t.addGroup(o,h,d),o+=h}}if(n){let d=!1;if(!t.index){let s=0;for(let f=0;f<a.length;++f)s+=a[f].index.count;t.setIndex(new G(new Uint32Array(s),1,!1)),d=!0}if(r||d){const s=t.index;let f=0,h=0;for(let p=0;p<a.length;++p){const m=a[p],y=m.index;if(c[p]!==!0)for(let x=0;x<y.count;++x)s.setX(f,y.getX(x)+h),f++;h+=m.attributes.position.count}}}for(const d in l){const s=l[d];if(!(d in t.attributes)){let p=0;for(const m in s)p+=s[m].count;t.setAttribute(d,Z(l[d][0],p))}const f=t.attributes[d];let h=0;for(let p=0,m=s.length;p<m;p++){const y=s[p];c[p]!==!0&&ve(y,f,h),h+=y.count}}return t}function vn(a,e){if(a===null||e===null)return a===e;if(a.length!==e.length)return!1;for(let t=0,n=a.length;t<n;t++)if(a[t]!==e[t])return!1;return!0}function gn(a){const{index:e,attributes:t}=a;if(e)for(let n=0,i=e.count;n<i;n+=3){const r=e.getX(n),c=e.getX(n+2);e.setX(n,c),e.setX(n+2,r)}else for(const n in t){const i=t[n],r=i.itemSize;for(let c=0,u=i.count;c<u;c+=3)for(let l=0;l<r;l++){const o=i.getComponent(c,l),d=i.getComponent(c+2,l);i.setComponent(c,l,d),i.setComponent(c+2,l,o)}}return a}class bn{constructor(e){this.matrixWorld=new D,this.geometryHash=null,this.boneMatrices=null,this.primitiveCount=-1,this.mesh=e,this.update()}update(){const e=this.mesh,t=e.geometry,n=e.skeleton,i=(t.index?t.index.count:t.attributes.position.count)/3;if(this.matrixWorld.copy(e.matrixWorld),this.geometryHash=t.attributes.position.version,this.primitiveCount=i,n){n.boneTexture||n.computeBoneTexture(),n.update();const r=n.boneMatrices;!this.boneMatrices||this.boneMatrices.length!==r.length?this.boneMatrices=r.slice():this.boneMatrices.set(r)}else this.boneMatrices=null}didChange(){const e=this.mesh,t=e.geometry,n=(t.index?t.index.count:t.attributes.position.count)/3;return!(this.matrixWorld.equals(e.matrixWorld)&&this.geometryHash===t.attributes.position.version&&vn(e.skeleton&&e.skeleton.boneMatrices||null,this.boneMatrices)&&this.primitiveCount===n)}}class Cn{constructor(e){Array.isArray(e)||(e=[e]);const t=[];e.forEach(n=>{n.traverseVisible(i=>{i.isMesh&&t.push(i)})}),this.meshes=t,this.useGroups=!0,this.applyWorldTransforms=!0,this.attributes=["position","normal","color","tangent","uv","uv2"],this._intermediateGeometry=new Array(t.length).fill().map(()=>new C),this._diffMap=new WeakMap}getMaterials(){const e=[];return this.meshes.forEach(t=>{Array.isArray(t.material)?e.push(...t.material):e.push(t.material)}),e}generate(e=new C){let t=[];const{meshes:n,useGroups:i,_intermediateGeometry:r,_diffMap:c}=this;for(let u=0,l=n.length;u<l;u++){const o=n[u],d=r[u],s=c.get(o);!s||s.didChange(o)?(this._convertToStaticGeometry(o,d),t.push(!1),s?s.update():c.set(o,new bn(o))):t.push(!0)}if(r.length===0){e.setIndex(null);const u=e.attributes;for(const l in u)e.deleteAttribute(l);for(const l in this.attributes)e.setAttribute(this.attributes[l],new G(new Float32Array(0),4,!1))}else xn(r,{useGroups:i,skipAttributes:t},e);for(const u in e.attributes)e.attributes[u].needsUpdate=!0;return e}_convertToStaticGeometry(e,t=new C){const n=e.geometry,i=this.applyWorldTransforms,r=this.attributes.includes("normal"),c=this.attributes.includes("tangent"),u=n.attributes,l=t.attributes;!t.index&&n.index&&(t.index=n.index.clone()),l.position||t.setAttribute("position",Z(u.position)),r&&!l.normal&&u.normal&&t.setAttribute("normal",Z(u.normal)),c&&!l.tangent&&u.tangent&&t.setAttribute("tangent",Z(u.tangent)),K(n.index,t.index),K(u.position,l.position),r&&K(u.normal,l.normal),c&&K(u.tangent,l.tangent);const o=u.position,d=r?u.normal:null,s=c?u.tangent:null,f=n.morphAttributes.position,h=n.morphAttributes.normal,p=n.morphAttributes.tangent,m=n.morphTargetsRelative,y=e.morphTargetInfluences,x=new je;x.getNormalMatrix(e.matrixWorld),n.index&&t.index.array.set(n.index.array);for(let g=0,v=u.position.count;g<v;g++)R.fromBufferAttribute(o,g),d&&z.fromBufferAttribute(d,g),s&&(oe.fromBufferAttribute(s,g),k.fromBufferAttribute(s,g)),y&&(f&&_t(f,y,m,g,R),h&&_t(h,y,m,g,z),p&&_t(p,y,m,g,k)),e.isSkinnedMesh&&(e.applyBoneTransform(g,R),d&&le(e,g,z),s&&le(e,g,k)),i&&R.applyMatrix4(e.matrixWorld),l.position.setXYZ(g,R.x,R.y,R.z),d&&(i&&z.applyNormalMatrix(x),l.normal.setXYZ(g,z.x,z.y,z.z)),s&&(i&&k.transformDirection(e.matrixWorld),l.tangent.setXYZW(g,k.x,k.y,k.z,oe.w));for(const g in this.attributes){const v=this.attributes[g];v==="position"||v==="tangent"||v==="normal"||!(v in u)||(l[v]||t.setAttribute(v,Z(u[v])),K(u[v],l[v]),ve(u[v],l[v]))}return e.matrixWorld.determinant()<0&&gn(t),t}}const ge=`

// A stack of uint32 indices can can store the indices for
// a perfectly balanced tree with a depth up to 31. Lower stack
// depth gets higher performance.
//
// However not all trees are balanced. Best value to set this to
// is the trees max depth.
#ifndef BVH_STACK_DEPTH
#define BVH_STACK_DEPTH 60
#endif

#ifndef INFINITY
#define INFINITY 1e20
#endif

// Utilities
uvec4 uTexelFetch1D( usampler2D tex, uint index ) {

	uint width = uint( textureSize( tex, 0 ).x );
	uvec2 uv;
	uv.x = index % width;
	uv.y = index / width;

	return texelFetch( tex, ivec2( uv ), 0 );

}

ivec4 iTexelFetch1D( isampler2D tex, uint index ) {

	uint width = uint( textureSize( tex, 0 ).x );
	uvec2 uv;
	uv.x = index % width;
	uv.y = index / width;

	return texelFetch( tex, ivec2( uv ), 0 );

}

vec4 texelFetch1D( sampler2D tex, uint index ) {

	uint width = uint( textureSize( tex, 0 ).x );
	uvec2 uv;
	uv.x = index % width;
	uv.y = index / width;

	return texelFetch( tex, ivec2( uv ), 0 );

}

vec4 textureSampleBarycoord( sampler2D tex, vec3 barycoord, uvec3 faceIndices ) {

	return
		barycoord.x * texelFetch1D( tex, faceIndices.x ) +
		barycoord.y * texelFetch1D( tex, faceIndices.y ) +
		barycoord.z * texelFetch1D( tex, faceIndices.z );

}

void ndcToCameraRay(
	vec2 coord, mat4 cameraWorld, mat4 invProjectionMatrix,
	out vec3 rayOrigin, out vec3 rayDirection
) {

	// get camera look direction and near plane for camera clipping
	vec4 lookDirection = cameraWorld * vec4( 0.0, 0.0, - 1.0, 0.0 );
	vec4 nearVector = invProjectionMatrix * vec4( 0.0, 0.0, - 1.0, 1.0 );
	float near = abs( nearVector.z / nearVector.w );

	// get the camera direction and position from camera matrices
	vec4 origin = cameraWorld * vec4( 0.0, 0.0, 0.0, 1.0 );
	vec4 direction = invProjectionMatrix * vec4( coord, 0.5, 1.0 );
	direction /= direction.w;
	direction = cameraWorld * direction - origin;

	// slide the origin along the ray until it sits at the near clip plane position
	origin.xyz += direction.xyz * near / dot( direction, lookDirection );

	rayOrigin = origin.xyz;
	rayDirection = direction.xyz;

}
`,be=`

float dot2( vec3 v ) {

	return dot( v, v );

}

// implementation from https://www.shadertoy.com/view/ttfGWl, though method 2 has been removed
// and is now available at this fork: https://www.shadertoy.com/view/WlB3zW
vec3 closestPointToTriangle( vec3 p, vec3 v0, vec3 v1, vec3 v2, out vec3 barycoord ) {

    vec3 v10 = v1 - v0;
    vec3 v21 = v2 - v1;
    vec3 v02 = v0 - v2;

	vec3 p0 = p - v0;
	vec3 p1 = p - v1;
	vec3 p2 = p - v2;

    vec3 nor = cross( v10, v02 );

    // method 2, in barycentric space
    vec3  q = cross( nor, p0 );
    float d = 1.0 / dot2( nor );
    float u = d * dot( q, v02 );
    float v = d * dot( q, v10 );
    float w = 1.0 - u - v;

	if( u < 0.0 ) {

		w = clamp( dot( p2, v02 ) / dot2( v02 ), 0.0, 1.0 );
		u = 0.0;
		v = 1.0 - w;

	} else if( v < 0.0 ) {

		u = clamp( dot( p0, v10 ) / dot2( v10 ), 0.0, 1.0 );
		v = 0.0;
		w = 1.0 - u;

	} else if( w < 0.0 ) {

		v = clamp( dot( p1, v21 ) / dot2( v21 ), 0.0, 1.0 );
		w = 0.0;
		u = 1.0 - v;

	}

	// output the barycoord in v0, v1, v2 weight order
	barycoord = vec3( w, u, v );
    return u * v1 + v * v2 + w * v0;

}

float distanceToTriangles(
	// geometry info and triangle range
	sampler2D positionAttr, usampler2D indexAttr, uint offset, uint count,

	// point and cut off range
	vec3 point, float closestDistanceSquared,

	// outputs
	inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord, inout float side, inout vec3 outPoint
) {

	bool found = false;
	vec3 localBarycoord;
	for ( uint i = offset, l = offset + count; i < l; i ++ ) {

		uvec3 indices = uTexelFetch1D( indexAttr, i ).xyz;
		vec3 a = texelFetch1D( positionAttr, indices.x ).rgb;
		vec3 b = texelFetch1D( positionAttr, indices.y ).rgb;
		vec3 c = texelFetch1D( positionAttr, indices.z ).rgb;

		// get the closest point and barycoord
		vec3 closestPoint = closestPointToTriangle( point, a, b, c, localBarycoord );
		vec3 delta = point - closestPoint;
		float sqDist = dot2( delta );
		if ( sqDist < closestDistanceSquared ) {

			// set the output results
			closestDistanceSquared = sqDist;
			faceIndices = uvec4( indices.xyz, i );
			faceNormal = normalize( cross( a - b, b - c ) );
			barycoord = localBarycoord;
			outPoint = closestPoint;
			side = sign( dot( faceNormal, delta ) );

		}

	}

	return closestDistanceSquared;

}

float distanceSqToBounds( vec3 point, vec3 boundsMin, vec3 boundsMax ) {

	vec3 clampedPoint = clamp( point, boundsMin, boundsMax );
	vec3 delta = point - clampedPoint;
	return dot( delta, delta );

}

float distanceSqToBVHNodeBoundsPoint( vec3 point, sampler2D bvhBounds, uint currNodeIndex ) {

	uint cni2 = currNodeIndex * 2u;
	vec3 boundsMin = texelFetch1D( bvhBounds, cni2 ).xyz;
	vec3 boundsMax = texelFetch1D( bvhBounds, cni2 + 1u ).xyz;
	return distanceSqToBounds( point, boundsMin, boundsMax );

}

// use a macro to hide the fact that we need to expand the struct into separate fields
#define	bvhClosestPointToPoint(		bvh,		point, maxDistance, faceIndices, faceNormal, barycoord, side, outPoint	)	_bvhClosestPointToPoint(		bvh.position, bvh.index, bvh.bvhBounds, bvh.bvhContents,		point, maxDistance, faceIndices, faceNormal, barycoord, side, outPoint	)

float _bvhClosestPointToPoint(
	// bvh info
	sampler2D bvh_position, usampler2D bvh_index, sampler2D bvh_bvhBounds, usampler2D bvh_bvhContents,

	// point to check
	vec3 point, float maxDistance,

	// output variables
	inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord,
	inout float side, inout vec3 outPoint
 ) {

	// stack needs to be twice as long as the deepest tree we expect because
	// we push both the left and right child onto the stack every traversal
	int pointer = 0;
	uint stack[ BVH_STACK_DEPTH ];
	stack[ 0 ] = 0u;

	float closestDistanceSquared = maxDistance * maxDistance;
	bool found = false;
	while ( pointer > - 1 && pointer < BVH_STACK_DEPTH ) {

		uint currNodeIndex = stack[ pointer ];
		pointer --;

		// check if we intersect the current bounds
		float boundsHitDistance = distanceSqToBVHNodeBoundsPoint( point, bvh_bvhBounds, currNodeIndex );
		if ( boundsHitDistance > closestDistanceSquared ) {

			continue;

		}

		uvec2 boundsInfo = uTexelFetch1D( bvh_bvhContents, currNodeIndex ).xy;
		bool isLeaf = bool( boundsInfo.x & 0xffff0000u );
		if ( isLeaf ) {

			uint count = boundsInfo.x & 0x0000ffffu;
			uint offset = boundsInfo.y;
			closestDistanceSquared = distanceToTriangles(
				bvh_position, bvh_index, offset, count, point, closestDistanceSquared,

				// outputs
				faceIndices, faceNormal, barycoord, side, outPoint
			);

		} else {

			uint leftIndex = currNodeIndex + 1u;
			uint splitAxis = boundsInfo.x & 0x0000ffffu;
			uint rightIndex = currNodeIndex + boundsInfo.y;
			bool leftToRight = distanceSqToBVHNodeBoundsPoint( point, bvh_bvhBounds, leftIndex ) < distanceSqToBVHNodeBoundsPoint( point, bvh_bvhBounds, rightIndex );//rayDirection[ splitAxis ] >= 0.0;
			uint c1 = leftToRight ? leftIndex : rightIndex;
			uint c2 = leftToRight ? rightIndex : leftIndex;

			// set c2 in the stack so we traverse it later. We need to keep track of a pointer in
			// the stack while we traverse. The second pointer added is the one that will be
			// traversed first
			pointer ++;
			stack[ pointer ] = c2;
			pointer ++;
			stack[ pointer ] = c1;

		}

	}

	return sqrt( closestDistanceSquared );

}
`,Ie=`

#ifndef TRI_INTERSECT_EPSILON
#define TRI_INTERSECT_EPSILON 1e-5
#endif

// Raycasting
bool intersectsBounds( vec3 rayOrigin, vec3 rayDirection, vec3 boundsMin, vec3 boundsMax, out float dist ) {

	// https://www.reddit.com/r/opengl/comments/8ntzz5/fast_glsl_ray_box_intersection/
	// https://tavianator.com/2011/ray_box.html
	vec3 invDir = 1.0 / rayDirection;

	// find intersection distances for each plane
	vec3 tMinPlane = invDir * ( boundsMin - rayOrigin );
	vec3 tMaxPlane = invDir * ( boundsMax - rayOrigin );

	// get the min and max distances from each intersection
	vec3 tMinHit = min( tMaxPlane, tMinPlane );
	vec3 tMaxHit = max( tMaxPlane, tMinPlane );

	// get the furthest hit distance
	vec2 t = max( tMinHit.xx, tMinHit.yz );
	float t0 = max( t.x, t.y );

	// get the minimum hit distance
	t = min( tMaxHit.xx, tMaxHit.yz );
	float t1 = min( t.x, t.y );

	// set distance to 0.0 if the ray starts inside the box
	dist = max( t0, 0.0 );

	return t1 >= dist;

}

bool intersectsTriangle(
	vec3 rayOrigin, vec3 rayDirection, vec3 a, vec3 b, vec3 c,
	out vec3 barycoord, out vec3 norm, out float dist, out float side
) {

	// https://stackoverflow.com/questions/42740765/intersection-between-line-and-triangle-in-3d
	vec3 edge1 = b - a;
	vec3 edge2 = c - a;
	norm = cross( edge1, edge2 );

	float det = - dot( rayDirection, norm );
	float invdet = 1.0 / det;

	vec3 AO = rayOrigin - a;
	vec3 DAO = cross( AO, rayDirection );

	vec4 uvt;
	uvt.x = dot( edge2, DAO ) * invdet;
	uvt.y = - dot( edge1, DAO ) * invdet;
	uvt.z = dot( AO, norm ) * invdet;
	uvt.w = 1.0 - uvt.x - uvt.y;

	// set the hit information
	barycoord = uvt.wxy; // arranged in A, B, C order
	dist = uvt.z;
	side = sign( det );
	norm = side * normalize( norm );

	// add an epsilon to avoid misses between triangles
	uvt += vec4( TRI_INTERSECT_EPSILON );

	return all( greaterThanEqual( uvt, vec4( 0.0 ) ) );

}

bool intersectTriangles(
	// geometry info and triangle range
	sampler2D positionAttr, usampler2D indexAttr, uint offset, uint count,

	// ray
	vec3 rayOrigin, vec3 rayDirection,

	// outputs
	inout float minDistance, inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord,
	inout float side, inout float dist
) {

	bool found = false;
	vec3 localBarycoord, localNormal;
	float localDist, localSide;
	for ( uint i = offset, l = offset + count; i < l; i ++ ) {

		uvec3 indices = uTexelFetch1D( indexAttr, i ).xyz;
		vec3 a = texelFetch1D( positionAttr, indices.x ).rgb;
		vec3 b = texelFetch1D( positionAttr, indices.y ).rgb;
		vec3 c = texelFetch1D( positionAttr, indices.z ).rgb;

		if (
			intersectsTriangle( rayOrigin, rayDirection, a, b, c, localBarycoord, localNormal, localDist, localSide )
			&& localDist < minDistance
		) {

			found = true;
			minDistance = localDist;

			faceIndices = uvec4( indices.xyz, i );
			faceNormal = localNormal;

			side = localSide;
			barycoord = localBarycoord;
			dist = localDist;

		}

	}

	return found;

}

bool intersectsBVHNodeBounds( vec3 rayOrigin, vec3 rayDirection, sampler2D bvhBounds, uint currNodeIndex, out float dist ) {

	uint cni2 = currNodeIndex * 2u;
	vec3 boundsMin = texelFetch1D( bvhBounds, cni2 ).xyz;
	vec3 boundsMax = texelFetch1D( bvhBounds, cni2 + 1u ).xyz;
	return intersectsBounds( rayOrigin, rayDirection, boundsMin, boundsMax, dist );

}

// use a macro to hide the fact that we need to expand the struct into separate fields
#define	bvhIntersectFirstHit(		bvh,		rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist	)	_bvhIntersectFirstHit(		bvh.position, bvh.index, bvh.bvhBounds, bvh.bvhContents,		rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist	)

bool _bvhIntersectFirstHit(
	// bvh info
	sampler2D bvh_position, usampler2D bvh_index, sampler2D bvh_bvhBounds, usampler2D bvh_bvhContents,

	// ray
	vec3 rayOrigin, vec3 rayDirection,

	// output variables split into separate variables due to output precision
	inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord,
	inout float side, inout float dist
) {

	// stack needs to be twice as long as the deepest tree we expect because
	// we push both the left and right child onto the stack every traversal
	int pointer = 0;
	uint stack[ BVH_STACK_DEPTH ];
	stack[ 0 ] = 0u;

	float triangleDistance = INFINITY;
	bool found = false;
	while ( pointer > - 1 && pointer < BVH_STACK_DEPTH ) {

		uint currNodeIndex = stack[ pointer ];
		pointer --;

		// check if we intersect the current bounds
		float boundsHitDistance;
		if (
			! intersectsBVHNodeBounds( rayOrigin, rayDirection, bvh_bvhBounds, currNodeIndex, boundsHitDistance )
			|| boundsHitDistance > triangleDistance
		) {

			continue;

		}

		uvec2 boundsInfo = uTexelFetch1D( bvh_bvhContents, currNodeIndex ).xy;
		bool isLeaf = bool( boundsInfo.x & 0xffff0000u );

		if ( isLeaf ) {

			uint count = boundsInfo.x & 0x0000ffffu;
			uint offset = boundsInfo.y;

			found = intersectTriangles(
				bvh_position, bvh_index, offset, count,
				rayOrigin, rayDirection, triangleDistance,
				faceIndices, faceNormal, barycoord, side, dist
			) || found;

		} else {

			uint leftIndex = currNodeIndex + 1u;
			uint splitAxis = boundsInfo.x & 0x0000ffffu;
			uint rightIndex = currNodeIndex + boundsInfo.y;

			bool leftToRight = rayDirection[ splitAxis ] >= 0.0;
			uint c1 = leftToRight ? leftIndex : rightIndex;
			uint c2 = leftToRight ? rightIndex : leftIndex;

			// set c2 in the stack so we traverse it later. We need to keep track of a pointer in
			// the stack while we traverse. The second pointer added is the one that will be
			// traversed first
			pointer ++;
			stack[ pointer ] = c2;

			pointer ++;
			stack[ pointer ] = c1;

		}

	}

	return found;

}
`,we=`
struct BVH {

	usampler2D index;
	sampler2D position;

	sampler2D bvhBounds;
	usampler2D bvhContents;

};
`,On=Object.freeze(Object.defineProperty({__proto__:null,bvh_distance_functions:be,bvh_ray_functions:Ie,bvh_struct_definitions:we,common_functions:ge},Symbol.toStringTag,{value:"Module"})),Wn=we,Ln=be,qn=`
	${ge}
	${Ie}
`;export{Xn as AVERAGE,Be as BVH,Nt as BVHHelper,On as BVHShaderGLSL,Yn as CENTER,$n as CONTAINED,Ae as ExtendedTriangle,hn as FloatVertexAttributeTexture,Pt as GeometryBVH,N as INTERSECTED,zn as IntVertexAttributeTexture,Bn as LineBVH,Ze as LineLoopBVH,Ke as LineSegmentsBVH,ht as MeshBVH,Tn as MeshBVHHelper,kn as MeshBVHUniformStruct,T as NOT_INTERSECTED,_n as ObjectBVH,jn as OrientedBox,An as PointsBVH,Kn as SAH,Vt as SKIP_GENERATION,Mn as SkinnedMeshBVH,Cn as StaticGeometryGenerator,fn as UIntVertexAttributeTexture,Ht as VertexAttributeTexture,Fn as acceleratedRaycast,Vn as computeBatchedBoundsTree,Nn as computeBoundsTree,Rn as disposeBatchedBoundsTree,Hn as disposeBoundsTree,Dn as estimateMemoryInBytes,Zn as generateIndirectBuffer,Sn as getBVHExtremes,En as getJSONStructure,Jn as getTriangleHitPointInfo,Ln as shaderDistanceFunction,qn as shaderIntersectFunction,Wn as shaderStructs,Pn as validateBounds};
