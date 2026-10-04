import{u as Ye,j as e,L as K,s as H,r as A,w as Je,a as Xe,e as ee,d as we,m as qe,b as Me,n as _e,v as Ge}from"./index-sPiXCj20.js";import{u as He,m as Ke,a as We,t as Ze,h as Qe,C as ne,R as ze}from"./RasterPreview-C3itZWhd.js";import{l as Re,R as en}from"./ReviewCard-CITi2ccT.js";import{M as he,r as Ve}from"./index-Bvl4yCMY.js";import{l as nn,a as sn,s as ke,S as Ne}from"./scaffold-8jNMQKTe.js";import{r as tn,l as Se,p as rn}from"./relatedLessons-jK1o99NX.js";import"./theme-DG4w92gX.js";function an({lesson:n}){const s=Ye();return e.jsx(ln,{owner:s.user?.id??"guest",lesson:n},s.user?.id??"guest")}function ln({owner:n,lesson:s}){const a=He(n),r=Ke.find(l=>l.lesson===s),t=We(a.project.installed),i=a.project.installed.includes(r.id),d=r.deps.every(l=>t.includes(l));return e.jsxs("aside",{className:"renderer-lesson-bridge",children:[e.jsxs("div",{children:[e.jsx("span",{className:"eyebrow",children:"这节课属于同一台 Renderer"}),e.jsxs("p",{children:[r.name," · ",r.effect]})]}),e.jsxs("div",{className:"toolbar",children:[e.jsx("button",{disabled:a.blocked||i||!d,onClick:()=>a.write(Ze(a.project,r.id)),children:i?"参考部件已装配":d?"把参考部件接入我的 Renderer":"先在装配台连接依赖"}),e.jsx(K,{to:"/renderlab/build",children:"返回我的装配台 →"})]})]})}const Q=(n,s)=>[n[0]-s[0],n[1]-s[1],n[2]-s[2]],re=(n,s)=>n[0]*s[0]+n[1]*s[1]+n[2]*s[2],ie=(n,s)=>[n[1]*s[2]-n[2]*s[1],n[2]*s[0]-n[0]*s[2],n[0]*s[1]-n[1]*s[0]],q=n=>{const s=Math.hypot(...n);return s>1e-12?n.map(a=>a/s):[0,0,0]};function J(n,s){return[0,1,2,3].map(a=>n[a]*s[0]+n[4+a]*s[1]+n[8+a]*s[2]+n[12+a]*s[3])}function le(n,s){return Array.from({length:16},(a,r)=>{const t=r%4,i=Math.floor(r/4);return[0,1,2,3].reduce((d,l)=>d+n[l*4+t]*s[i*4+l],0)})}function pe(n,s,a,r){const t=1/Math.tan(n/2);return[t/s,0,0,0,0,t,0,0,0,0,(r+a)/(a-r),-1,0,0,2*r*a/(a-r),0]}function ue(n,s){const a=q(Q(n,s)),r=q(ie([0,1,0],a)),t=ie(a,r);return[r[0],t[0],a[0],0,r[1],t[1],a[1],0,r[2],t[2],a[2],0,-re(r,n),-re(t,n),-re(a,n),1]}function Be(n){const s=Math.cos(n),a=Math.sin(n);return[s,0,-a,0,0,1,0,0,a,0,s,0,0,0,0,1]}const on=(n,s,a)=>{const r=(t,i)=>t.map((d,l)=>d+(i[l]-d)*a);return{clip:r(n.clip,s.clip),world:r(n.world,s.world),normal:r(n.normal,s.normal),uv:r(n.uv,s.uv)}};function cn(n){let s=n;for(const r of[t=>t[3]+t[0],t=>t[3]-t[0],t=>t[3]+t[1],t=>t[3]-t[1],t=>t[3]+t[2],t=>t[3]-t[2]]){const t=[];for(let i=0;i<s.length;i++){const d=s[i],l=s[(i+1)%s.length],c=r(d.clip),m=r(l.clip);c>=0&&t.push(d),c>=0!=m>=0&&t.push(on(d,l,c/(c-m)))}s=t}const a=[];for(let r=1;r+1<s.length;r++)a.push([s[0],s[r],s[r+1]]);return a}const se=(n,s,a)=>(s[0]-n[0])*(a[1]-n[1])-(s[1]-n[1])*(a[0]-n[0]),dn=(n,s)=>s[1]<n[1]||s[1]===n[1]&&s[0]<n[0];function hn(n,s,a,r){const t=r?a.reduce((i,d,l)=>i+d/s[l],0):1;return a.reduce((i,d,l)=>i+d*n[l]/(r?s[l]:1),0)/t}function xe(n,s,a="nearest"){const r=(p,f)=>((Math.floor(p/4)+Math.floor(f/4))%2+2)%2===0?[.27,.31,.46]:[.88,.85,.78];if(a!=="linear")return r(Math.floor(n*32),Math.floor(s*32));const t=n*32-.5,i=s*32-.5,d=Math.floor(t),l=Math.floor(i),c=t-d,m=i-l,x=r(d,l),v=r(d+1,l),h=r(d,l+1),j=r(d+1,l+1);return x.map((p,f)=>(x[f]*(1-c)+v[f]*c)*(1-m)+(h[f]*(1-c)+j[f]*c)*m)}function pn(n){if(new TextEncoder().encode(n).length>65536)throw Error("OBJ 超过 64 KiB");const s=[],a=[],r=[],t=[],i=(d,l)=>{if(!/^-?\d+$/.test(l)||Number(l)===0)throw Error("OBJ 索引必须为非零整数");const c=Number(l),m=c>0?c-1:d.length+c;if(m<0||m>=d.length)throw Error("OBJ 索引越界");return d[m]};for(const[d,l]of n.split(/\r?\n/).entries()){const c=l.split("#")[0].trim().split(/\s+/),m=c.shift();if(m)try{if(["v","vt","vn"].includes(m)){const x=m==="vt"?2:3,v=c.map(Number);if(c.length!==x||v.some(h=>!Number.isFinite(h)))throw Error("不支持的属性或非有限数");m==="v"?s.push(v):m==="vt"?a.push(v):r.push(q(v))}else if(m==="f"){if(c.length<3||c.length>32)throw Error("面需要 3–32 个角点");const x=c.map(v=>{const h=v.split("/");if(h.length>3)throw Error("面角格式错误");return{position:i(s,h[0]),uv:h[1]?i(a,h[1]):[0,0],normal:h[2]?i(r,h[2]):void 0}});for(let v=1;v+1<x.length;v++){const h=[x[0],x[v],x[v+1]],j=q(ie(Q(h[1].position,h[0].position),Q(h[2].position,h[0].position)));t.push(h.map(p=>({...p,normal:p.normal??j})))}}else throw Error(`不支持的 OBJ 语句 ${m}`)}catch(x){throw Error(`OBJ 第 ${d+1} 行：${String(x)}`)}}if(!t.length)throw Error("OBJ 没有面");return t}const ae=[];for(let n=32;n>=1;n/=2){const s=[];for(let a=0;a<n;a++)for(let r=0;r<n;r++)if(n===32)s.push(xe((r+.5)/32,(a+.5)/32));else{const t=ae[ae.length-1],i=n*2,d=[t[a*2*i+r*2],t[a*2*i+r*2+1],t[(a*2+1)*i+r*2],t[(a*2+1)*i+r*2+1]];s.push([0,1,2].map(l=>d.reduce((c,m)=>c+m[l],0)/4))}ae.push(s)}function Te(n,s,a){const r=Math.max(0,Math.min(5,a)),t=m=>{const x=32/2**m,v=ae[m],h=n*x-.5,j=s*x-.5,p=Math.floor(h),f=Math.floor(j),M=h-p,w=j-f,y=(V,g)=>v[(g%x+x)%x*x+(V%x+x)%x],P=y(p,f),E=y(p+1,f),D=y(p,f+1),I=y(p+1,f+1);return P.map((V,g)=>(P[g]*(1-M)+E[g]*M)*(1-w)+(D[g]*(1-M)+I[g]*M)*w)},i=Math.floor(r),d=r-i,l=t(i),c=t(Math.min(5,i+1));return l.map((m,x)=>m*(1-d)+c[x]*d)}function un(n,s,a,r,t,i,d){const l=d==="pcf3"?1:0;let c=0,m=0;for(let x=-l;x<=l;x++)for(let v=-l;v<=l;v++){const h=a+v,j=r+x;m++,h>=0&&j>=0&&h<s&&j<s&&t-i>n[j*s+h]&&c++}return 1-.75*c/m}function Ee(n){const s=(i,d,l)=>({position:i,normal:d,uv:l});if(n==="model")return pn(Qe);if(n==="triangle")return[[s([-.9,-.65,0],[0,0,1],[0,0]),s([.9,-.65,-1],[0,0,1],[1,0]),s([0,.9,0],[0,0,1],[.5,1])]];const a=[],r=(i,d,l=1)=>{const c=[[0,0],[l,0],[l,l],[0,l]];for(const m of[[0,1,2],[0,2,3]])a.push(m.map(x=>s(i[x],d,c[x])))};if(n==="atelier"){const i=(d,l,c,m)=>{const x=(v,h,j)=>[d+h*Math.cos(j*2*Math.PI/m),v,l+h*Math.sin(j*2*Math.PI/m)];for(let v=0;v<c.length-1;v++)for(let h=0;h<m;h++){const j=x(...c[v],h),p=x(...c[v+1],h),f=x(...c[v+1],h+1),M=x(...c[v],h+1),w=q(ie(Q(p,j),Q(f,j)));r([j,p,f,M],w)}};i(0,0,[[-.65,.5],[-.5,.5],[-.5,.28],[.15,.58],[.8,.32],[1.18,0]],8);for(const[d,l,c]of[[-.95,-.65,.25],[.9,-.65,.5],[-.8,.7,-.1],[.85,.75,.05]])i(d,l,[[-.7,.25],[c,.25],[c+.22,0]],6);return r([[-2,-.72,2],[2,-.72,2],[2,-.72,-2],[-2,-.72,-2]],[0,1,0],4),a}const t=.55;return r([[-t,-t,t],[t,-t,t],[t,t,t],[-t,t,t]],[0,0,1]),r([[t,-t,-t],[-t,-t,-t],[-t,t,-t],[t,t,-t]],[0,0,-1]),r([[t,-t,t],[t,-t,-t],[t,t,-t],[t,t,t]],[1,0,0]),r([[-t,-t,-t],[-t,-t,t],[-t,t,t],[-t,t,-t]],[-1,0,0]),r([[-t,t,t],[t,t,t],[t,t,-t],[-t,t,-t]],[0,1,0]),r([[-t,-t,-t],[t,-t,-t],[t,-t,t],[-t,-t,t]],[0,-1,0]),r([[-1.8,-.9,1.8],[1.8,-.9,1.8],[1.8,-.55,-1.8],[-1.8,-.55,-1.8]],[0,1,.0972],3),a}function Ce(n,s,a){const r=s.size,t=new Uint8ClampedArray(r*r*4),i=new Float64Array(r*r),d=new Uint8ClampedArray(r*r),l=new Uint8ClampedArray(r*r*4),c=new Uint8ClampedArray(r*r*4);i.fill(1);for(let f=0;f<r*r;f++)t.set([8,8,11,255],f*4);let m=0,x=0,v=0;const h=[],j=[],p={hit:!1};for(const f of n){const M=s.clip?cn(f):[f];for(let w of M){if(w.some(g=>g.clip[3]<=1e-8))continue;let y=w.map(g=>[(g.clip[0]/g.clip[3]+1)*r/2,(g.clip[1]/g.clip[3]+1)*r/2,g.clip[2]/g.clip[3]]),P=se(y[0],y[1],y[2]);if(Math.abs(P)<1e-10||s.cull&&P<=0)continue;if(P<0&&(w=[w[0],w[2],w[1]],y=[y[0],y[2],y[1]],P=-P),v++,h.push(y),s.renderMode==="vertices"||s.renderMode==="wireframe"){const g=(z,u)=>{z=Math.round(z),u=Math.round(u),z>=0&&z<r&&u>=0&&u<r&&t.set([85,240,214,255],((r-1-u)*r+z)*4)};for(const z of y)for(let u=-1;u<=1;u++)for(let N=-1;N<=1;N++)g(z[0]+u,z[1]+N);if(s.renderMode==="wireframe")for(let z=0;z<3;z++){const u=y[z],N=y[(z+1)%3],B=N[0]-u[0],O=N[1]-u[1];let k=0,T=1,W=!0;for(const[R,S]of[[-B,u[0]],[B,r-1-u[0]],[-O,u[1]],[O,r-1-u[1]]])if(R===0)S<0&&(W=!1);else{const Y=S/R;R<0?k=Math.max(k,Y):T=Math.min(T,Y)}if(W&&k<=T){const R=Math.max(1,Math.ceil(Math.max(Math.abs(B),Math.abs(O))*(T-k)));for(let S=0;S<=R;S++){const Y=k+(T-k)*S/R;g(u[0]+B*Y,u[1]+O*Y)}}}continue}const E=Math.max(0,Math.ceil(Math.min(...y.map(g=>g[0]))-.5)),D=Math.min(r-1,Math.floor(Math.max(...y.map(g=>g[0]))-.5)),I=Math.max(0,Math.ceil(Math.min(...y.map(g=>g[1]))-.5)),V=Math.min(r-1,Math.floor(Math.max(...y.map(g=>g[1]))-.5));for(let g=I;g<=V;g++)for(let z=E;z<=D;z++){const u=[z+.5,g+.5],N=[se(y[1],y[2],u),se(y[2],y[0],u),se(y[0],y[1],u)];if(N.some(($,X)=>$<0||$===0&&!dn(y[(X+1)%3],y[(X+2)%3])))continue;m++;const B=(r-1-g)*r+z;d[B]=Math.min(255,d[B]+1);const O=N.map($=>$/P),k=(O.reduce(($,X,F)=>$+X*y[F][2],0)+1)/2;if(s.clip&&(k<0||k>1))continue;const T=(r-1-g)*r+z;if(s.depth&&k>=i[T])continue;x++,i[T]=k;const W=w.map($=>$.clip[3]),R=($,X)=>hn(w.map(F=>F[$][X]),W,O,s.perspective),S={clip:[0,0,k,1],world:[R("world",0),R("world",1),R("world",2)],normal:q([R("normal",0),R("normal",1),R("normal",2)]),uv:[R("uv",0),R("uv",1)]},Y=a?a(S,k):s.filter==="mip"?Te(...S.uv,s.lod):xe(...S.uv,s.filter);l.set([Math.round((S.uv[0]-Math.floor(S.uv[0]))*255),Math.round((S.uv[1]-Math.floor(S.uv[1]))*255),0,255],T*4),c.set([...S.normal.map($=>Math.round(($+1)*127.5)),255],T*4);for(let $=0;$<3;$++)t[T*4+$]=Math.round(Math.max(0,Math.min(1,Y[$]))*255);z===s.probeX&&r-1-g===s.probeY&&Object.assign(p,{hit:!0,depth:k,b0:O[0],b1:O[1],b2:O[2],u:S.uv[0],v:S.uv[1],normalX:S.normal[0],normalY:S.normal[1],normalZ:S.normal[2]})}}}if(n[0]){const f=n[0][0];j.push(`首顶点世界坐标 ${f.world.map(M=>M.toFixed(4)).join(", ")}`,`齐次坐标 ${f.clip.map(M=>M.toFixed(4)).join(", ")}`,`透视除法 w=${f.clip[3].toFixed(4)}`)}return j.push(`输入 ${n.length}，裁剪／剔除后 ${v} 个三角形`,`覆盖 ${m} 次，深度通过 ${x} 次`,`检查像素 (${s.probeX}, ${s.probeY})：${JSON.stringify(p)}`),{pixels:t,depth:i,coverage:d,uvPixels:l,normalPixels:c,width:r,triangles:h,trace:j,probe:p,metrics:{inputTriangles:n.length,rasterTriangles:v,coveredSamples:m,depthPassed:x,visiblePixels:Array.from(i).filter(f=>f<1).length}}}function me(n,s){if(n.aa==="ssaa2"){const h=me({...n,aa:"none"}),j=me({...n,aa:"none",size:n.size*2,probeX:n.probeX*2,probeY:n.probeY*2});for(let p=0;p<n.size;p++)for(let f=0;f<n.size;f++)for(let M=0;M<3;M++){let w=0;for(let y=0;y<2;y++)for(let P=0;P<2;P++)w+=j.pixels[((p*2+y)*j.width+f*2+P)*4+M];h.pixels[(p*n.size+f)*4+M]=Math.round(w/4)}return Object.assign(h.metrics,{sampleResolution:j.width,sampleCoveredSamples:j.metrics.coveredSamples,resolvedPixels:n.size*n.size}),h.trace.push("2×2 SSAA 颜色 resolve；深度、UV、法线和 probe 保留中心样本诊断"),h}const a=Be(n.angle*Math.PI/180),r=ue([0,.6,n.distance],[0,-.1,0]),t=pe(Math.PI/3,1,.3,20),i=le(t,r),l=Ee(n.scene).map(h=>h.map(j=>{const p=J(a,[...j.position,1]),f=J(a,[...j.normal,0]);return{world:p.slice(0,3),normal:q(f.slice(0,3)),uv:j.uv,clip:J(i,p)}})),c=[2,3,2],m=le(pe(Math.PI/2,1,.3,15),ue(c,[0,0,0])),x=n.shadows?Ce(l.map(h=>h.map(j=>({...j,clip:J(m,[...j.world,1])}))),{...n,clip:!0,depth:!0,cull:!1,perspective:!0},()=>[0,0,0]):void 0,v=Ce(l,n,(h,j)=>{let p=1;if(x){const w=J(m,[...h.world,1]),y=w[0]/w[3],P=w[1]/w[3],E=(w[2]/w[3]+1)/2;if(w[3]>0&&Math.abs(y)<1&&Math.abs(P)<1&&E>=0&&E<=1){const D=Math.floor((y+1)*n.size/2),I=n.size-1-Math.floor((P+1)*n.size/2);p=un(x.depth,n.size,D,I,E,n.bias,n.shadowFilter)}}const f=n.lighting?.18+.82*Math.max(0,re(h.normal,q(Q(c,h.world))))*p:1;return(n.texturing===!1?[.35,.8,.72]:n.filter==="mip"?Te(...h.uv,n.lod):xe(...h.uv,n.filter)).map(w=>w*f)});return x&&(v.metrics.shadowPassTriangles=x.metrics.rasterTriangles,v.shadowDepth=x.depth),v.trace.push(n.shadows?`光源深度比较，bias=${n.bias}，filter=${n.shadowFilter}`:"未启用阴影 pass"),v}function Fe(n){const s=(a,r,t,i)=>{const d=Number(n[a]??r);return Number.isFinite(d)?Math.max(t,Math.min(i,d)):r};return{renderMode:n.renderMode==="vertices"||n.renderMode==="wireframe"?n.renderMode:"filled",texturing:n.texturing!==!1,size:Math.round(s("resolution",128,32,384)),angle:s("angle",25,-180,180),distance:s("distance",3,.35,6),clip:n.clip!==!1,depth:n.depth!==!1,perspective:n.perspective!==!1,lighting:n.lighting!==!1,shadows:!!n.shadows,bias:s("bias",.005,0,.05),cull:n.cull!==!1,filter:String(n.filter??"nearest"),scene:String(n.scene??"cube"),lod:s("lod",0,0,5),aa:String(n.aa??"none"),shadowFilter:String(n.shadowFilter??"hard"),probeX:Math.floor(s("probeX",64,0,383)),probeY:Math.floor(s("probeY",64,0,383))}}function De({params:n}){const s=Fe(n),a=[...Ee(s.scene)[0][0].position,1],r=Be(s.angle*Math.PI/180),t=ue([0,.6,s.distance],[0,-.1,0]),i=pe(Math.PI/3,1,.3,20),d=J(r,a),l=J(t,d),c=J(i,l),m=Math.abs(c[3])>1e-8,x=m?c.slice(0,3).map(p=>p/c[3]):[],v=m?[(x[0]+1)*s.size/2,(x[1]+1)*s.size/2]:[],h=[["物体","原始位置，w=1",a],["世界","M × p",d],["观察","V × world",l],["裁剪","P × view",c],["NDC","xyz / w（先核对裁剪）",x],["像素","(ndc.xy+1) × size/2",v]],j=c[3]>0&&c.slice(0,3).every(p=>Math.abs(p)<=c[3]);return e.jsxs("div",{className:"coordinate-walkthrough",children:[e.jsx("h4",{children:"当前参数：首顶点的数值推演"}),e.jsx("p",{children:"改变左侧旋转角或相机距离，逐级核对下表。V × M 与 M × V 的结果不同。"}),e.jsx("div",{className:"table-scroll",children:e.jsxs("table",{children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"空间"}),e.jsx("th",{children:"操作"}),e.jsx("th",{children:"坐标"})]})}),e.jsx("tbody",{children:h.map(([p,f,M])=>e.jsxs("tr",{children:[e.jsx("th",{children:p}),e.jsx("td",{children:f}),e.jsx("td",{children:e.jsx("code",{children:M.length?M.map(w=>w.toFixed(4)).join(", "):"w≈0，不能除法"})})]},p))})]})}),e.jsx("p",{children:j?"首顶点位于六平面内。":"首顶点在裁剪范围外；下表投影仅用于说明，不能跳过裁剪。"}),e.jsx("p",{children:"这里计算连续像素位置；覆盖在像素中心检查，最终 Canvas 再翻转 Y。"}),e.jsxs("small",{children:["矩阵组合校验：",J(le(i,le(t,r)),a).map(p=>p.toFixed(4)).join(", ")]})]})}function mn({lab:n,params:s,onExplore:a}){const r=Re[n.id],t=i=>{i.currentTarget.open&&a()};return e.jsxs("div",{className:"lesson-reading",children:[e.jsx("h3",{children:"本课目标"}),e.jsx("ul",{children:r.objectives.map(i=>e.jsx("li",{children:i},i))}),e.jsxs("details",{children:[e.jsx("summary",{children:"先修知识与术语"}),e.jsx("ul",{children:r.knowledge.map(i=>e.jsx("li",{children:i},i))})]}),e.jsx("h3",{children:"本课原理"}),e.jsx(he,{remarkPlugins:[Ve],children:r.theory}),e.jsxs("details",{className:"lesson-derivation",children:[e.jsx("summary",{children:"展开推导与数据流"}),e.jsx(he,{remarkPlugins:[Ve],children:r.derivation}),n.id==="raster-coordinates"&&e.jsx(De,{params:s})]}),e.jsx("p",{className:"challenge",children:r.gotcha}),e.jsx("h3",{children:"逐步练习"}),e.jsx("ol",{className:"lesson-tasks",children:r.tasks.map(i=>e.jsxs("li",{children:[e.jsx("strong",{children:i.title}),e.jsx("p",{children:i.instructions}),e.jsxs("details",{onToggle:t,children:[e.jsx("summary",{children:"核对预期现象（记录辅助）"}),e.jsx("p",{children:i.expected})]})]},i.title))}),e.jsxs("details",{onToggle:t,children:[e.jsx("summary",{children:"错误案例与修复路径（记录辅助）"}),r.pitfalls.map(i=>e.jsxs("div",{children:[e.jsx("h4",{children:i.symptom}),e.jsxs("p",{children:["原因：",i.cause]}),e.jsxs("p",{children:["修复：",i.fix]})]},i.symptom))]}),e.jsxs("details",{children:[e.jsx("summary",{children:"本课验收与交付"}),e.jsx("ul",{children:r.rubric.map(i=>e.jsx("li",{children:i},i))}),e.jsx("p",{children:"这些是人工核对要求；阅读、测试通过或查看参考都不会自动更新掌握状态。"})]}),e.jsxs("details",{children:[e.jsx("summary",{children:"带着问题读原资料"}),e.jsxs("a",{href:r.reading.url,target:"_blank",rel:"noreferrer",children:[r.reading.section," ↗"]}),e.jsx("p",{children:r.reading.question}),e.jsx("small",{children:"本页为原创中文教学，原文通过链接阅读。"})]}),n.id==="raster-engine"&&e.jsxs("p",{children:["CPU → GPU 对照：",e.jsx(K,{to:"/experiment/render-draws",children:"实际 DrawCall"})," ·"," ",e.jsx(K,{to:"/experiment/render-state",children:"状态与 Pass"})," ·"," ",e.jsx(K,{to:"/experiment/render-batch",children:"实例化提交"})," ·"," ",e.jsx(K,{to:"/experiment/shader-urp",children:"Unity Frame Debugger 实战"})]})]})}const xn={"shader-uv":["把连续渐变变成四条色带","在 color 的红通道试试 floor(uv.x * 4.0) / 3.0；固定为 A，再换成正弦条纹。"],"shader-shapes":["做一个边缘平滑、厚度可调的圆环","从已有的圆开始，改变距离表达式；比较圆心、边缘和圆外的像素。"],"shader-patterns":["做一张会旋转的重复图案","先改重复次数，再交换旋转与 fract 的顺序；观察每个小格子的变化。"],"shader-texture":["让同一张棋盘纹理有两种亮度处理","固定 A，在 B 中改变线性化与调亮的顺序，先看画面，再解释中间值。"],"shader-noise":["把云状噪声变成可调阈值的流动图案","开启动画，修改噪声坐标和颜色；暂停后保存自己喜欢的一版。"],"shader-vertex":["让网格起伏，而不只让表面颜色动起来","展开顶点 Shader，在 position 进入世界变换前加入位移；转到球体检查轮廓。"],"shader-light":["做出柔和与尖锐两种高光","先调高光指数并固定对照，再单独修改漫反射、镜面与边缘项。"],"shader-project":["做一个自己能解释的溶解材质","改变阈值、噪声尺度和边缘颜色，保存两个关键版本，再在 Unity 复现。"],"shader-normal":["让平坦轮廓看起来有凹凸","先观察起始光照，接入 mapped 的 TBN 转换；对照明暗与物体轮廓。"],"shader-alpha":["做出两种等价的半透明颜色","打开全部参数，组合 straight 与 premultiplied；观察错误配对产生的亮边。"],"shader-post":["把一张场景图变成自己的屏幕效果","从采样 u_scene 开始改颜色或邻近采样；比较材质 UV 与屏幕图像处理。"],"shader-multipass":["用横向、纵向两个小步骤完成模糊","先尝试一次与两次 pass，再改 stepUV 与采样权重；比较模糊方向。"],"shader-pbr":["做出粗糙塑料与光滑金属的差异","打开全部参数，分别改粗糙度与金属度，保存独立对照再拆 D/G/F。"],"shader-urp":["把网页溶解材质带到真实主光与阴影中","网页先选阈值；去本机迁移，观察 Unity 物体与投影是否一起裁剪。"],"raster-coordinates":["追踪首顶点如何落到屏幕","切到投影顶点，改变旋转和距离；在代码区核对六个坐标空间。"],"raster-clipping":["找到跨越近面的三角形为何变形","选择 triangle 场景并拉近相机，切换裁剪与边界；定位错误发生在除 w 之前还是之后。"],"raster-coverage":["检查两个相邻三角形如何共享一条边","先看覆盖次数，再点选共边附近的像素；把颜色改成红色只检查覆盖形状。"],"raster-depth":["找到谁覆盖了当前像素","关闭与开启深度测试，查看深度缓冲和同一像素；比较颜色变化与几何不变。"],"raster-interpolation":["定位斜面棋盘的扭曲来自哪里","把颜色写成 fract(u) / fract(v)，切换透视插值，再对照相同位置的 UV。"],"raster-shading":["让同一组覆盖与深度产生不同颜色","把 RGB 改为 UV、法线或深度；在诊断视图中确认几何和属性没有随配色改变。"],"raster-shadows":["在倾斜接收面上定位阴影误差","对照光源深度与着色，改变 bias；点选阴影边缘，再到 C++ 重建深度比较。"],"raster-project":["拆开完整管线，再独立重建核心函数","从最终图往前切换各缓冲，固定一个版本；选择一个错误做修复对照。"],"raster-model":["让同一个 OBJ 模型显出 UV 与面绕序","先看模型与边界，再用 UV/法线配色；本机检查独立顶点索引。"],"raster-cull":["观察剔除消除了哪些三角形","切换剔除，看覆盖次数与实际工作量；不要把面绕序与光照法线混为一谈。"],"raster-lod":["让远处棋盘在不同 mip 层中变平稳","固定视角，改变显式 LOD 与过滤；比较细节消失和噪声减少。"],"raster-aa":["看清多个样本怎样改善边缘","对照 none / ssaa2，再用纯色表达式隔离纹理影响；核对输出与采样分辨率。"],"raster-pcf":["把硬阴影边界变成过滤后的边界","固定 light/bias 后比较 hard / pcf3；把效果变化追到九次深度比较。"],"raster-engine":["做一组能复现的完整渲染器版本","组合 OBJ、mip、SSAA 和 PCF；用 A/B 隔离一个条件，再提交本机实现与证据。"]},Pe=`r = baseR;
g = baseG;
b = baseB;`,Ie=`r = fract(u);
g = fract(v);
b = 0.25;`,te=(n,s,a=.05)=>Math.abs(n/255-s)<=a,Ae=n=>s=>s.scene===n?void 0:`先把「预览场景」切到 ${n}`,fn=n=>Math.abs(n[0]-9)<=5&&Math.abs(n[1]-19)<=5&&Math.abs(n[2]-26)<=5,ce=[8,8,11];function $e(n,s,a){return()=>{const r=H(n);if(!r.fragment.includes(s))throw Error(`目标画面与起始代码不一致：${n}`);return{...r,fragment:r.fragment.replace(s,a)}}}const gn=n=>Array.from({length:n},(s,a)=>[.5+.5*a/(n-1),.5]),bn=n=>Array.from({length:n*n},(s,a)=>[.04+.92*(a%n)/(n-1),.04+.92*Math.floor(a/n)/(n-1)]),vn={"shader-uv":{prompts:[{label:"UV=(0.25, 0.75) 时红色通道",answer:.25,tol:.01},{label:"交换 uv.xy 之后，红色通道",answer:.75,tol:.01}],shader:[{label:"红色随 uv.x 反向，绿色随 uv.y 上升",needs:Ae("plane"),samples:[[.25,.75],[.75,.25]],test:([n,s])=>te(n[0],.75)&&te(n[1],.75)&&te(s[0],.25)&&te(s[1],.25)}],diagnostic:"触发并读到一次编译诊断",target:$e("shader-uv","vec3(uv, 0.5+0.5*sin(u_time))","vec3(1.0-uv.x, uv.y, 0.5+0.5*sin(u_time))")},"shader-shapes":{prompts:[{label:"amount=0.4，p=(0,0) 的距离",answer:-.4,tol:.01},{label:"p=(0.4,0) 的距离",answer:0,tol:.01},{label:"p=(0.6,0) 的距离",answer:.2,tol:.01}],shader:[{label:"中心不被覆盖，往外出现一圈环，最外侧也不被覆盖",needs:Ae("plane"),samples:gn(41),test:n=>n[0][1]/255<.35&&n[n.length-1][1]/255<.35&&n.slice(1,-1).some(s=>s[1]/255>.6)}],target:$e("shader-shapes","float d = length(p)-u_amount;","float d = abs(length(p)-u_amount)-0.06;")},"shader-patterns":{prompts:[{label:"a=π/2，p=(1,0) 旋转后的 x",answer:0,tol:.01},{label:"旋转后的 y",answer:-1,tol:.01},{label:"fract(-0.2)",answer:.8,tol:.01}]},"shader-texture":{prompts:[{label:"线性空间里 0 与 1 各占一半的结果",answer:.5,tol:.01},{label:"0.5 的 Gamma 编码值（约）",answer:.73,tol:.01}]},"shader-noise":{prompts:[{label:"四层振幅 0.5、0.25、0.125、0.0625 的和",answer:.9375,tol:.001}]},"shader-vertex":{prompts:[{label:"amount=0.5，y=0 的 X 位移",answer:0,tol:.005},{label:"y=π/10 的 X 位移",answer:.1,tol:.005}]},"shader-light":{prompts:[{label:"0.8 的 8 次幂",answer:.168,tol:.005},{label:"0.8 的 64 次幂（接近多少？）",answer:0,tol:.001}]},"shader-project":{shader:[{label:"阈值大于 0.25 时，有一部分片元被丢弃",needs:n=>n.scene!=="plane"?"先把「预览场景」切到 plane":Number(n.amount)<.25?"先把「强度／阈值」调到 0.25 以上":void 0,samples:bn(8),test:n=>{const s=n.filter(fn).length/n.length;return s>.05&&s<.95}}],target:()=>H("shader-project",!0)},"raster-clipping":{prompts:[{label:"da=1、db=-3 的交点系数 t",answer:.25,tol:.005}]},"raster-coverage":{prompts:[{label:"内部点的第一个重心坐标",answer:.5,tol:.01},{label:"第二个",answer:.25,tol:.01},{label:"第三个",answer:.25,tol:.01}],raster:[{label:"每个被覆盖的像素都是纯红（只看覆盖形状）",test:n=>{let s=0;for(let a=0;a<n.pixels.length;a+=4){const[r,t,i]=[n.pixels[a],n.pixels[a+1],n.pixels[a+2]];if(!(r===ce[0]&&t===ce[1]&&i===ce[2]))if(r>=250&&t<=5&&i<=5)s++;else return!1}return s>=20}}],target:()=>({language:"raster",text:`r = 1;
g = 0;
b = 0;`})},"raster-depth":{prompts:[{label:"0.6 → 0.3 的提交顺序，通过几次？",answer:2,tol:0},{label:"0.3 → 0.6 的提交顺序，通过几次？",answer:1,tol:0},{label:"两种顺序最终的深度值",answer:.3,tol:.001}]},"raster-interpolation":{prompts:[{label:"透视修正后的插值结果",answer:1/3,tol:.01},{label:"仿射插值的结果",answer:.5,tol:.01}],raster:[{label:"颜色等于 fract(u)、fract(v)：和 UV 视图的红绿通道一致",test:n=>{let s=0,a=0;for(let r=0;r<n.uvPixels.length;r+=4)n.uvPixels[r+3]!==0&&(s++,Math.abs(n.pixels[r]-n.uvPixels[r])<=2&&Math.abs(n.pixels[r+1]-n.uvPixels[r+1])<=2&&a++);return s>=20&&a/s>=.97}}],target:()=>({language:"raster",text:Ie})}};function jn(n){return(n?.shader??[]).flatMap(s=>s.samples)}function yn(n,s,a){let r=0;return(n?.shader??[]).map(t=>{const i=a?.slice(r,r+t.samples.length);r+=t.samples.length;const d=t.needs?.(s);return d?{label:t.label,state:"blocked",note:d}:!i||i.length!==t.samples.length?{label:t.label,state:"pending",note:"等待固定时间的一帧"}:{label:t.label,state:t.test(i)?"pass":"fail"}})}function wn(n,s,a){return(n?.raster??[]).map(r=>{const t=r.needs?.(s);return t?{label:r.label,state:"blocked",note:t}:a?{label:r.label,state:r.test(a)?"pass":"fail"}:{label:r.label,state:"pending",note:"等待渲染完成"}})}function Mn(n,s){const a=Number(s);return s.trim()===""||!Number.isFinite(a)?"empty":Math.abs(a-n.answer)<=n.tol?"pass":"fail"}const zn={pass:"✓",fail:"✗",blocked:"·",pending:"…"},Vn={pass:"已达成",fail:"还没达成",blocked:"",pending:""};function kn({labId:n,brief:s,tasks:a,checks:r,states:t,runtimeError:i,targetOn:d,onTarget:l,scaffold:c,onMoreHint:m,onExplore:x}){const v=t.length>0?1:0,[h,j]=A.useState(v),[p,f]=A.useState([]),[M,w]=A.useState([]),[y,P]=A.useState(!1);A.useEffect(()=>{j(v),f([]),w([]),P(!1)},[n]),A.useEffect(()=>{i&&P(!0)},[i]);const E=r?.prompts??[],D=a[h],I=[...t,...r?.diagnostic?[{label:r.diagnostic,state:y?"pass":"fail"}]:[]];return e.jsxs("aside",{className:"task-card","aria-label":"本课任务",children:[s&&e.jsxs("header",{children:[e.jsxs("strong",{children:["目标：",s[0]]}),e.jsx("p",{children:s[1]})]}),c&&e.jsxs("div",{className:"task-scaffold","aria-label":"脚手架",children:[e.jsxs("b",{title:sn[c.level],children:["提示 ","●".repeat(4-c.level),"○".repeat(c.level-1)," · ",nn[c.level]]}),e.jsxs("span",{children:["起点给出：",c.given]}),e.jsxs("span",{children:["你来写：",c.yours]}),m&&e.jsx("button",{onClick:m,children:"需要更多提示：换成补全 TODO 版"})]}),e.jsx("nav",{className:"task-steps","aria-label":"任务步骤",children:a.map((V,g)=>e.jsxs("button",{"aria-pressed":h===g,onClick:()=>j(g),children:[e.jsx("span",{children:g+1}),V.title]},V.title))}),D&&e.jsxs("div",{className:"task-body",children:[e.jsx("p",{children:D.instructions}),h===0&&E.length>0&&e.jsx("div",{className:"task-prompts",children:E.map((V,g)=>{const z=M[g]?Mn(V,p[g]??""):"empty";return e.jsxs("label",{children:[V.label,e.jsxs("span",{children:[e.jsx("input",{type:"number",step:"any",inputMode:"decimal",value:p[g]??"","aria-label":V.label,onChange:u=>{const N=p.slice();N[g]=u.target.value,f(N);const B=M.slice();B[g]=!1,w(B)},onBlur:()=>{const u=M.slice();u[g]=!0,w(u)},onKeyDown:u=>{if(u.key!=="Enter")return;const N=M.slice();N[g]=!0,w(N)}}),e.jsx("b",{className:`check-${z}`,role:"status",children:z==="pass"?"✓ 对了":z==="fail"?"✗ 再算一遍":""})]})]},V.label)})}),e.jsxs("details",{onToggle:V=>{V.currentTarget.open&&x()},children:[e.jsx("summary",{children:"核对预期现象（记录辅助）"}),e.jsx("p",{children:D.expected})]})]}),I.length>0&&e.jsxs("div",{className:"task-checks",children:[e.jsx("h4",{children:"页面里的任务检查"}),e.jsx("ul",{children:I.map(V=>e.jsxs("li",{className:`check-${V.state}`,children:[e.jsx("b",{"aria-hidden":"true",children:zn[V.state]}),e.jsx("span",{children:V.label}),e.jsx("small",{children:V.note??Vn[V.state]})]},V.label))}),l&&e.jsx("button",{onClick:l,children:d?"收起目标画面":"叠加目标画面（只看画面，不含代码）"}),e.jsx("p",{children:"任务检查只说明这一次的结果，不代表掌握，也不会写入你的记录。"})]})]})}function Nn({labId:n}){const s=tn(n),a=rn(n);return!s.length&&!a?null:e.jsxs("details",{className:"lesson-links","aria-label":"相关课与双线路径",children:[e.jsxs("summary",{children:[s.length>0?"另一边也在讲这件事":"双线路径",a&&` · 双线路径 ${a.step} / ${a.total}`]}),s.length>0&&e.jsx("ul",{children:s.map(r=>e.jsxs("li",{children:[e.jsxs(K,{to:`/experiment/${r.id}`,children:[Se(r.id)," ↗"]}),e.jsx("span",{children:r.why})]},r.id))}),a?.next&&e.jsx("p",{className:"path-next",children:e.jsxs(K,{to:`/experiment/${a.next}`,children:["下一步：",Se(a.next)," →"]})})]})}const oe=["投影顶点","三角形边界","覆盖次数","深度缓冲","插值 UV","插值法线","着色结果","光源深度"],Sn=[{id:"depth-off",symptom:"远处的面盖住了近处的面",fault:{depth:!1},variants:[{scene:"cube",angle:25,distance:3},{scene:"cube",angle:-40,distance:3.5}],stage:3,why:"深度测试被关闭：几何、边界和覆盖次数都没变，但深度缓冲没有被写入，后提交的三角形直接盖住前面的。"},{id:"affine",symptom:"斜面上的棋盘格被拉扭了",fault:{perspective:!1},variants:[{scene:"triangle",angle:25,distance:3},{scene:"triangle",angle:-35,distance:2.4}],stage:4,why:"属性按屏幕空间线性插值而不是除以 w：覆盖和深度完全一致，只有插值得到的 UV 变了，纹理随之扭曲。"},{id:"no-light",symptom:"整个物体看起来是平的，没有明暗",fault:{lighting:!1},variants:[{scene:"cube",angle:25,distance:3},{scene:"cube",angle:60,distance:3}],stage:6,why:"漫反射光照被关闭：UV 和法线缓冲都和正确渲染一致，只有最后的着色结果缺少 N·L。"},{id:"zero-bias",symptom:"接收面上出现条纹状的黑斑",fault:{shadows:!0,bias:0},variants:[{scene:"cube",angle:25,distance:3},{scene:"cube",angle:-30,distance:3}],stage:6,why:"阴影比较的 bias 为 0：光源深度缓冲本身是对的，但倾斜面拿自己的深度和自己比较，在着色时出现自遮挡条纹。"}],Cn={"raster-depth":["depth-off"],"raster-interpolation":["affine"],"raster-shading":["no-light"],"raster-shadows":["zero-bias"],"raster-project":["depth-off","affine","no-light","zero-bias"]};function Pn(n,s,a){const r=s.variants[a%s.variants.length],t={...n,...r,shadows:!1,bias:.005},i={...t,...s.fault};return s.fault.shadows&&(t.shadows=!0),{correct:t,faulty:i}}const G=(n,s,a=0)=>{const r=Math.max(n.length,s.length);let t=0;for(let i=0;i<r;i++)(i>=n.length||i>=s.length||Math.abs(n[i]-s[i])>a)&&t++;return t};function An(n,s){const a=t=>t.triangles.flat(2);return[G(a(n),a(s),1e-6),Math.abs(n.triangles.length-s.triangles.length)+n.triangles.reduce((t,i,d)=>t+(s.triangles[d]?.length===i.length?0:1),0),G(n.coverage,s.coverage),G(n.depth,s.depth,1e-9),G(n.uvPixels,s.uvPixels),G(n.normalPixels,s.normalPixels),G(n.pixels,s.pixels),n.shadowDepth&&s.shadowDepth?G(n.shadowDepth,s.shadowDepth,1e-9):n.shadowDepth||s.shadowDepth?(n.shadowDepth??s.shadowDepth).length:0]}const $n=n=>n.findIndex(s=>s>0);function On(n,s){const a=$n(s);return n===a?{kind:"right"}:n<a?{kind:"early",message:`「${oe[n]}」和正确渲染逐项一致（差异 0），错误出现在它后面。`}:{kind:"late",message:`在「${oe[n]}」之前，已经有阶段的缓冲和正确渲染不同，往前逐个看。`}}function Rn({offered:n,active:s,onStart:a,onAnswer:r,onStop:t}){const[i,d]=A.useState();return A.useEffect(()=>d(void 0),[s?.symptom,s?.tries]),n.length?s?e.jsxs("aside",{className:"bug-hunt is-active","aria-label":"排错挑战",children:[e.jsx("h4",{children:"排错挑战"}),e.jsxs("p",{children:["症状：",e.jsx("strong",{children:s.symptom}),"。切换预览上方的阶段，找出最先和正确渲染不同的那一个。"]}),!s.solved&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"hunt-stages",role:"radiogroup","aria-label":"最先出错的阶段",children:oe.map((l,c)=>e.jsx("button",{role:"radio","aria-checked":i===c,onClick:()=>d(c),children:l},l))}),e.jsxs("div",{className:"toolbar",children:[e.jsx("button",{className:"primary",disabled:i===void 0,onClick:()=>i!==void 0&&r(i),children:"提交答案"}),e.jsx("button",{onClick:t,children:"放弃这道题"})]}),s.verdict==="waiting"&&e.jsx("p",{role:"status",children:"画面还在更新，稍等一下再提交。"}),s.verdict&&s.verdict!=="waiting"&&e.jsxs("p",{className:"hunt-miss",role:"status",children:["✗ ",s.verdict.kind==="right"?"":s.verdict.message]})]}),s.solved&&e.jsxs("div",{role:"status",children:[e.jsxs("p",{className:"hunt-right",children:["✓ 对了（第 ",s.tries," 次提交）。",s.why]}),e.jsxs("table",{className:"hunt-diffs",children:[e.jsx("caption",{children:"每个阶段的缓冲和正确渲染有多少处不同"}),e.jsx("tbody",{children:oe.map((l,c)=>e.jsxs("tr",{className:s.diffs?.[c]?"differs":void 0,children:[e.jsx("th",{scope:"row",children:l}),e.jsx("td",{children:s.diffs?.[c]??0})]},l))})]}),e.jsx("p",{children:"预览里的 A 是正确渲染，拖动分割线对比；切换阶段时两边会一起换。"}),e.jsxs("div",{className:"toolbar",children:[e.jsx("button",{onClick:a,children:"再来一题"}),e.jsx("button",{onClick:t,children:"结束挑战"})]})]})]}):e.jsxs("aside",{className:"bug-hunt","aria-label":"排错挑战",children:[e.jsx("h4",{children:"排错挑战"}),e.jsx("p",{children:"页面会放进一处真实的错误，你用阶段条逐个查看缓冲，找出最先和正确渲染不同的阶段。"}),e.jsx("button",{onClick:a,children:n.length>1?"随机出一道题":"出一道题"})]}):null}const de=`// Original teaching implementation. Column-major matrices, OpenGL clip space,
// bottom-left raster coordinates; only the framebuffer output flips Y.
import houseOBJ from "./house.obj?raw";
export type V3 = [number, number, number];
export type V4 = [number, number, number, number];
export type Mat4 = number[];
export type Vertex = { clip: V4; world: V3; normal: V3; uv: [number, number] };
export type RasterOptions = {
  size: number;
  angle: number;
  distance: number;
  clip: boolean;
  depth: boolean;
  perspective: boolean;
  lighting: boolean;
  shadows: boolean;
  bias: number;
  cull: boolean;
  filter: string;
  scene: string;
  probeX: number;
  probeY: number;
  lod: number;
  aa: string;
  shadowFilter: string;
  renderMode?: "vertices" | "wireframe" | "filled";
  texturing?: boolean;
};
export const add = (a: V3, b: V3): V3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const sub = (a: V3, b: V3): V3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const normalize = (a: V3): V3 => {
  const n = Math.hypot(...a);
  return n > 1e-12 ? (a.map((x) => x / n) as V3) : [0, 0, 0];
};
export const identity = (): Mat4 => [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
];
export function transform(m: Mat4, v: V4): V4 {
  return [0, 1, 2, 3].map(
    (r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3],
  ) as V4;
}
export function multiply(a: Mat4, b: Mat4): Mat4 {
  return Array.from({ length: 16 }, (_, i) => {
    const r = i % 4,
      c = Math.floor(i / 4);
    return [0, 1, 2, 3].reduce(
      (sum, k) => sum + a[k * 4 + r] * b[c * 4 + k],
      0,
    );
  });
}
export function perspective(
  fov: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1 / Math.tan(fov / 2);
  return [
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) / (near - far),
    -1,
    0,
    0,
    (2 * far * near) / (near - far),
    0,
  ];
}
export function lookAt(eye: V3, target: V3): Mat4 {
  const z = normalize(sub(eye, target)),
    x = normalize(cross([0, 1, 0], z)),
    y = cross(z, x);
  return [
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dot(x, eye),
    -dot(y, eye),
    -dot(z, eye),
    1,
  ];
}
export function rotationY(angle: number): Mat4 {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}
const mixVertex = (a: Vertex, b: Vertex, t: number): Vertex => {
  const mix = (x: number[], y: number[]) => x.map((v, i) => v + (y[i] - v) * t);
  return {
    clip: mix(a.clip, b.clip) as V4,
    world: mix(a.world, b.world) as V3,
    normal: mix(a.normal, b.normal) as V3,
    uv: mix(a.uv, b.uv) as [number, number],
  };
};
export function clipTriangle(tri: Vertex[]): Vertex[][] {
  let poly = tri;
  for (const plane of [
    (p: V4) => p[3] + p[0],
    (p: V4) => p[3] - p[0],
    (p: V4) => p[3] + p[1],
    (p: V4) => p[3] - p[1],
    (p: V4) => p[3] + p[2],
    (p: V4) => p[3] - p[2],
  ]) {
    const next: Vertex[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        da = plane(a.clip),
        db = plane(b.clip);
      if (da >= 0) next.push(a);
      if (da >= 0 !== db >= 0) next.push(mixVertex(a, b, da / (da - db)));
    }
    poly = next;
  }
  const result: Vertex[][] = [];
  for (let i = 1; i + 1 < poly.length; i++)
    result.push([poly[0], poly[i], poly[i + 1]]);
  return result;
}
export const edge = (a: number[], b: number[], p: number[]) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const topLeft = (a: number[], b: number[]) =>
  b[1] < a[1] || (b[1] === a[1] && b[0] < a[0]);
export function barycentric(
  a: number[],
  b: number[],
  c: number[],
  p: number[],
): V3 | null {
  const area = edge(a, b, c);
  return Math.abs(area) < 1e-12
    ? null
    : [edge(b, c, p) / area, edge(c, a, p) / area, edge(a, b, p) / area];
}
export function interpolate(
  values: number[],
  w: number[],
  weights: V3,
  correct: boolean,
) {
  const denominator = correct
    ? weights.reduce((s, x, i) => s + x / w[i], 0)
    : 1;
  return (
    weights.reduce((s, x, i) => s + (x * values[i]) / (correct ? w[i] : 1), 0) /
    denominator
  );
}
export function checker(u: number, v: number, filter = "nearest"): V3 {
  const texel = (x: number, y: number): V3 =>
    (((Math.floor(x / 4) + Math.floor(y / 4)) % 2) + 2) % 2 === 0
      ? [0.27, 0.31, 0.46]
      : [0.88, 0.85, 0.78];
  if (filter !== "linear") return texel(Math.floor(u * 32), Math.floor(v * 32));
  const x = u * 32 - 0.5,
    y = v * 32 - 0.5,
    ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const a = texel(ix, iy),
    b = texel(ix + 1, iy),
    c = texel(ix, iy + 1),
    d = texel(ix + 1, iy + 1);
  return a.map(
    (_, i) =>
      (a[i] * (1 - fx) + b[i] * fx) * (1 - fy) +
      (c[i] * (1 - fx) + d[i] * fx) * fy,
  ) as V3;
}
type MeshVertex = { position: V3; normal: V3; uv: [number, number] };
export function parseOBJ(text: string): MeshVertex[][] {
  if (new TextEncoder().encode(text).length > 65536)
    throw Error("OBJ 超过 64 KiB");
  const positions: V3[] = [],
    uvs: [number, number][] = [],
    normals: V3[] = [],
    triangles: MeshVertex[][] = [];
  const get = <T>(list: T[], raw: string): T => {
    if (!/^-?\\d+$/.test(raw) || Number(raw) === 0)
      throw Error("OBJ 索引必须为非零整数");
    const n = Number(raw),
      i = n > 0 ? n - 1 : list.length + n;
    if (i < 0 || i >= list.length) throw Error("OBJ 索引越界");
    return list[i];
  };
  for (const [lineIndex, line] of text.split(/\\r?\\n/).entries()) {
    const parts = line.split("#")[0].trim().split(/\\s+/),
      kind = parts.shift();
    if (!kind) continue;
    try {
      if (["v", "vt", "vn"].includes(kind)) {
        const length = kind === "vt" ? 2 : 3,
          n = parts.map(Number);
        if (parts.length !== length || n.some((x) => !Number.isFinite(x)))
          throw Error("不支持的属性或非有限数");
        if (kind === "v") positions.push(n as V3);
        else if (kind === "vt") uvs.push(n as [number, number]);
        else normals.push(normalize(n as V3));
      } else if (kind === "f") {
        if (parts.length < 3 || parts.length > 32)
          throw Error("面需要 3–32 个角点");
        const face = parts.map((raw) => {
          const ids = raw.split("/");
          if (ids.length > 3) throw Error("面角格式错误");
          return {
            position: get(positions, ids[0]),
            uv: ids[1] ? get(uvs, ids[1]) : ([0, 0] as [number, number]),
            normal: ids[2] ? get(normals, ids[2]) : undefined,
          };
        });
        for (let i = 1; i + 1 < face.length; i++) {
          const tri = [face[0], face[i], face[i + 1]],
            n = normalize(
              cross(
                sub(tri[1].position, tri[0].position),
                sub(tri[2].position, tri[0].position),
              ),
            );
          triangles.push(tri.map((v) => ({ ...v, normal: v.normal ?? n })));
        }
      } else throw Error(\`不支持的 OBJ 语句 \${kind}\`);
    } catch (error) {
      throw Error(\`OBJ 第 \${lineIndex + 1} 行：\${String(error)}\`);
    }
  }
  if (!triangles.length) throw Error("OBJ 没有面");
  return triangles;
}
const mipLevels: V3[][] = [];
for (let size = 32; size >= 1; size /= 2) {
  const level: V3[] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (size === 32) level.push(checker((x + 0.5) / 32, (y + 0.5) / 32));
      else {
        const prev = mipLevels[mipLevels.length - 1],
          stride = size * 2;
        const samples = [
          prev[y * 2 * stride + x * 2],
          prev[y * 2 * stride + x * 2 + 1],
          prev[(y * 2 + 1) * stride + x * 2],
          prev[(y * 2 + 1) * stride + x * 2 + 1],
        ];
        level.push(
          [0, 1, 2].map(
            (c) => samples.reduce((sum, p) => sum + p[c], 0) / 4,
          ) as V3,
        );
      }
    }
  mipLevels.push(level);
}
export function sampleMip(u: number, v: number, lod: number): V3 {
  const l = Math.max(0, Math.min(5, lod));
  const sample = (index: number): V3 => {
    const size = 32 / 2 ** index,
      data = mipLevels[index],
      x = u * size - 0.5,
      y = v * size - 0.5,
      ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy;
    const texel = (x: number, y: number) =>
      data[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
    const a = texel(ix, iy),
      b = texel(ix + 1, iy),
      c = texel(ix, iy + 1),
      d = texel(ix + 1, iy + 1);
    return a.map(
      (_, i) =>
        (a[i] * (1 - fx) + b[i] * fx) * (1 - fy) +
        (c[i] * (1 - fx) + d[i] * fx) * fy,
    ) as V3;
  };
  const lo = Math.floor(l),
    t = l - lo,
    a = sample(lo),
    b = sample(Math.min(5, lo + 1));
  return a.map((x, i) => x * (1 - t) + b[i] * t) as V3;
}
export function shadowVisibility(
  depth: Float64Array,
  size: number,
  x: number,
  y: number,
  z: number,
  bias: number,
  filter: string,
): number {
  const radius = filter === "pcf3" ? 1 : 0;
  let blocked = 0,
    count = 0;
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const sx = x + dx,
        sy = y + dy;
      count++;
      if (
        sx >= 0 &&
        sy >= 0 &&
        sx < size &&
        sy < size &&
        z - bias > depth[sy * size + sx]
      )
        blocked++;
    }
  return 1 - (0.75 * blocked) / count;
}
export function mesh(
  scene: string,
): { position: V3; normal: V3; uv: [number, number] }[][] {
  const vertex = (p: V3, n: V3, uv: [number, number]) => ({
    position: p,
    normal: n,
    uv,
  });
  if (scene === "model") return parseOBJ(houseOBJ);
  if (scene === "triangle")
    return [
      [
        vertex([-0.9, -0.65, 0], [0, 0, 1], [0, 0]),
        vertex([0.9, -0.65, -1], [0, 0, 1], [1, 0]),
        vertex([0, 0.9, 0], [0, 0, 1], [0.5, 1]),
      ],
    ];
  const tris: ReturnType<typeof mesh> = [];
  const quad = (p: V3[], n: V3, tiling = 1) => {
    const uv: [number, number][] = [
      [0, 0],
      [tiling, 0],
      [tiling, tiling],
      [0, tiling],
    ];
    for (const idx of [
      [0, 1, 2],
      [0, 2, 3],
    ])
      tris.push(idx.map((i) => vertex(p[i], n, uv[i])));
  };
  if (scene === "atelier") {
    const ringMesh = (
      cx: number,
      cz: number,
      levels: [number, number][],
      sides: number,
    ) => {
      const ring = (y: number, r: number, i: number): V3 => [
        cx + r * Math.cos((i * 2 * Math.PI) / sides),
        y,
        cz + r * Math.sin((i * 2 * Math.PI) / sides),
      ];
      for (let k = 0; k < levels.length - 1; k++)
        for (let i = 0; i < sides; i++) {
          const a = ring(...levels[k], i),
            b = ring(...levels[k + 1], i),
            c = ring(...levels[k + 1], i + 1),
            d = ring(...levels[k], i + 1);
          const n = normalize(cross(sub(b, a), sub(c, a)));
          quad([a, b, c, d], n);
        }
    };
    ringMesh(
      0,
      0,
      [
        [-0.65, 0.5],
        [-0.5, 0.5],
        [-0.5, 0.28],
        [0.15, 0.58],
        [0.8, 0.32],
        [1.18, 0],
      ],
      8,
    );
    for (const [x, z, h] of [
      [-0.95, -0.65, 0.25],
      [0.9, -0.65, 0.5],
      [-0.8, 0.7, -0.1],
      [0.85, 0.75, 0.05],
    ])
      ringMesh(
        x,
        z,
        [
          [-0.7, 0.25],
          [h, 0.25],
          [h + 0.22, 0],
        ],
        6,
      );
    quad(
      [
        [-2, -0.72, 2],
        [2, -0.72, 2],
        [2, -0.72, -2],
        [-2, -0.72, -2],
      ],
      [0, 1, 0],
      4,
    );
    return tris;
  }
  const s = 0.55;
  quad(
    [
      [-s, -s, s],
      [s, -s, s],
      [s, s, s],
      [-s, s, s],
    ],
    [0, 0, 1],
  );
  quad(
    [
      [s, -s, -s],
      [-s, -s, -s],
      [-s, s, -s],
      [s, s, -s],
    ],
    [0, 0, -1],
  );
  quad(
    [
      [s, -s, s],
      [s, -s, -s],
      [s, s, -s],
      [s, s, s],
    ],
    [1, 0, 0],
  );
  quad(
    [
      [-s, -s, -s],
      [-s, -s, s],
      [-s, s, s],
      [-s, s, -s],
    ],
    [-1, 0, 0],
  );
  quad(
    [
      [-s, s, s],
      [s, s, s],
      [s, s, -s],
      [-s, s, -s],
    ],
    [0, 1, 0],
  );
  quad(
    [
      [-s, -s, -s],
      [s, -s, -s],
      [s, -s, s],
      [-s, -s, s],
    ],
    [0, -1, 0],
  );
  // A sloped receiver catches errors hidden by a flat floor.
  quad(
    [
      [-1.8, -0.9, 1.8],
      [1.8, -0.9, 1.8],
      [1.8, -0.55, -1.8],
      [-1.8, -0.55, -1.8],
    ],
    [0, 1, 0.0972],
    3,
  );
  return tris;
}
export type RasterResult = {
  pixels: Uint8ClampedArray;
  depth: Float64Array;
  coverage: Uint8ClampedArray;
  uvPixels: Uint8ClampedArray;
  normalPixels: Uint8ClampedArray;
  shadowDepth?: Float64Array;
  width: number;
  triangles: number[][][];
  trace: string[];
  probe: Record<string, number | string | boolean | null>;
  metrics: Record<string, number | string | boolean | null>;
};
export function rasterize(
  triangles: Vertex[][],
  o: RasterOptions,
  shade?: (v: Vertex, z: number) => V3,
): RasterResult {
  const size = o.size,
    pixels = new Uint8ClampedArray(size * size * 4),
    depth = new Float64Array(size * size),
    coverage = new Uint8ClampedArray(size * size),
    uvPixels = new Uint8ClampedArray(size * size * 4),
    normalPixels = new Uint8ClampedArray(size * size * 4);
  depth.fill(1);
  for (let i = 0; i < size * size; i++) pixels.set([8, 8, 11, 255], i * 4);
  let covered = 0,
    passed = 0,
    generated = 0;
  const screenTris: number[][][] = [],
    trace: string[] = [],
    probe: RasterResult["probe"] = { hit: false };
  for (const input of triangles) {
    const clipped = o.clip ? clipTriangle(input) : [input];
    for (let tri of clipped) {
      if (tri.some((v) => v.clip[3] <= 1e-8)) continue;
      let screen = tri.map((v) => [
        ((v.clip[0] / v.clip[3] + 1) * size) / 2,
        ((v.clip[1] / v.clip[3] + 1) * size) / 2,
        v.clip[2] / v.clip[3],
      ]);
      let area = edge(screen[0], screen[1], screen[2]);
      if (Math.abs(area) < 1e-10 || (o.cull && area <= 0)) continue;
      if (area < 0) {
        tri = [tri[0], tri[2], tri[1]];
        screen = [screen[0], screen[2], screen[1]];
        area = -area;
      }
      generated++;
      screenTris.push(screen);
      if (o.renderMode === "vertices" || o.renderMode === "wireframe") {
        const point = (x: number, y: number) => {
          x = Math.round(x);
          y = Math.round(y);
          if (x >= 0 && x < size && y >= 0 && y < size)
            pixels.set([85, 240, 214, 255], ((size - 1 - y) * size + x) * 4);
        };
        for (const v of screen)
          for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++) point(v[0] + dx, v[1] + dy);
        if (o.renderMode === "wireframe")
          for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
            const a = screen[edgeIndex],
              b = screen[(edgeIndex + 1) % 3],
              dx = b[0] - a[0],
              dy = b[1] - a[1];
            let lo = 0,
              hi = 1,
              valid = true;
            for (const [p, q] of [
              [-dx, a[0]],
              [dx, size - 1 - a[0]],
              [-dy, a[1]],
              [dy, size - 1 - a[1]],
            ]) {
              if (p === 0) {
                if (q < 0) valid = false;
              } else {
                const t = q / p;
                if (p < 0) lo = Math.max(lo, t);
                else hi = Math.min(hi, t);
              }
            }
            if (valid && lo <= hi) {
              const steps = Math.max(
                1,
                Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * (hi - lo)),
              );
              for (let j = 0; j <= steps; j++) {
                const t = lo + ((hi - lo) * j) / steps;
                point(a[0] + dx * t, a[1] + dy * t);
              }
            }
          }
        continue;
      }
      const minX = Math.max(
          0,
          Math.ceil(Math.min(...screen.map((v) => v[0])) - 0.5),
        ),
        maxX = Math.min(
          size - 1,
          Math.floor(Math.max(...screen.map((v) => v[0])) - 0.5),
        );
      const minY = Math.max(
          0,
          Math.ceil(Math.min(...screen.map((v) => v[1])) - 0.5),
        ),
        maxY = Math.min(
          size - 1,
          Math.floor(Math.max(...screen.map((v) => v[1])) - 0.5),
        );
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const p = [x + 0.5, y + 0.5],
            e = [
              edge(screen[1], screen[2], p),
              edge(screen[2], screen[0], p),
              edge(screen[0], screen[1], p),
            ];
          if (
            e.some(
              (v, i) =>
                v < 0 ||
                (v === 0 && !topLeft(screen[(i + 1) % 3], screen[(i + 2) % 3])),
            )
          )
            continue;
          covered++;
          const coverageIndex = (size - 1 - y) * size + x;
          coverage[coverageIndex] = Math.min(255, coverage[coverageIndex] + 1);
          const b = e.map((v) => v / area) as V3,
            z = (b.reduce((s, v, i) => s + v * screen[i][2], 0) + 1) / 2;
          if (o.clip && (z < 0 || z > 1)) continue;
          const index = (size - 1 - y) * size + x;
          if (o.depth && z >= depth[index]) continue;
          passed++;
          depth[index] = z;
          const w = tri.map((v) => v.clip[3]);
          const attr = (key: "world" | "normal" | "uv", component: number) =>
            interpolate(
              tri.map((v) => v[key][component]),
              w,
              b,
              o.perspective,
            );
          const v: Vertex = {
            clip: [0, 0, z, 1],
            world: [attr("world", 0), attr("world", 1), attr("world", 2)],
            normal: normalize([
              attr("normal", 0),
              attr("normal", 1),
              attr("normal", 2),
            ]),
            uv: [attr("uv", 0), attr("uv", 1)],
          };
          const color = shade
            ? shade(v, z)
            : o.filter === "mip"
              ? sampleMip(...v.uv, o.lod)
              : checker(...v.uv, o.filter);
          uvPixels.set(
            [
              Math.round((v.uv[0] - Math.floor(v.uv[0])) * 255),
              Math.round((v.uv[1] - Math.floor(v.uv[1])) * 255),
              0,
              255,
            ],
            index * 4,
          );
          normalPixels.set(
            [...v.normal.map((n) => Math.round((n + 1) * 127.5)), 255],
            index * 4,
          );
          for (let c = 0; c < 3; c++)
            pixels[index * 4 + c] = Math.round(
              Math.max(0, Math.min(1, color[c])) * 255,
            );
          if (x === o.probeX && size - 1 - y === o.probeY)
            Object.assign(probe, {
              hit: true,
              depth: z,
              b0: b[0],
              b1: b[1],
              b2: b[2],
              u: v.uv[0],
              v: v.uv[1],
              normalX: v.normal[0],
              normalY: v.normal[1],
              normalZ: v.normal[2],
            });
        }
    }
  }
  if (triangles[0]) {
    const v = triangles[0][0];
    trace.push(
      \`首顶点世界坐标 \${v.world.map((x) => x.toFixed(4)).join(", ")}\`,
      \`齐次坐标 \${v.clip.map((x) => x.toFixed(4)).join(", ")}\`,
      \`透视除法 w=\${v.clip[3].toFixed(4)}\`,
    );
  }
  trace.push(
    \`输入 \${triangles.length}，裁剪／剔除后 \${generated} 个三角形\`,
    \`覆盖 \${covered} 次，深度通过 \${passed} 次\`,
    \`检查像素 (\${o.probeX}, \${o.probeY})：\${JSON.stringify(probe)}\`,
  );
  return {
    pixels,
    depth,
    coverage,
    uvPixels,
    normalPixels,
    width: size,
    triangles: screenTris,
    trace,
    probe,
    metrics: {
      inputTriangles: triangles.length,
      rasterTriangles: generated,
      coveredSamples: covered,
      depthPassed: passed,
      visiblePixels: Array.from(depth).filter((x) => x < 1).length,
    },
  };
}
export function renderScene(
  o: RasterOptions,
  pixelShader?: (v: Vertex, depth: number, base: V3) => V3,
): RasterResult {
  if (o.aa === "ssaa2") {
    const base = renderScene({ ...o, aa: "none" }, pixelShader),
      high = renderScene(
        {
          ...o,
          aa: "none",
          size: o.size * 2,
          probeX: o.probeX * 2,
          probeY: o.probeY * 2,
        },
        pixelShader,
      );
    for (let y = 0; y < o.size; y++)
      for (let x = 0; x < o.size; x++)
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++)
              sum +=
                high.pixels[((y * 2 + dy) * high.width + x * 2 + dx) * 4 + c];
          base.pixels[(y * o.size + x) * 4 + c] = Math.round(sum / 4);
        }
    Object.assign(base.metrics, {
      sampleResolution: high.width,
      sampleCoveredSamples: high.metrics.coveredSamples,
      resolvedPixels: o.size * o.size,
    });
    base.trace.push(
      "2×2 SSAA 颜色 resolve；深度、UV、法线和 probe 保留中心样本诊断",
    );
    return base;
  }
  const model = rotationY((o.angle * Math.PI) / 180),
    camera = lookAt([0, 0.6, o.distance], [0, -0.1, 0]),
    projection = perspective(Math.PI / 3, 1, 0.3, 20),
    vp = multiply(projection, camera);
  const geometry = mesh(o.scene);
  const vertices = geometry.map((tri) =>
    tri.map((v) => {
      const p = transform(model, [...v.position, 1]),
        n = transform(model, [...v.normal, 0]);
      return {
        world: p.slice(0, 3) as V3,
        normal: normalize(n.slice(0, 3) as V3),
        uv: v.uv,
        clip: transform(vp, p),
      };
    }),
  );
  const light: V3 = [2, 3, 2],
    lightVP = multiply(
      perspective(Math.PI / 2, 1, 0.3, 15),
      lookAt(light, [0, 0, 0]),
    );
  const shadow = o.shadows
    ? rasterize(
        vertices.map((t) =>
          t.map((v) => ({ ...v, clip: transform(lightVP, [...v.world, 1]) })),
        ),
        { ...o, clip: true, depth: true, cull: false, perspective: true },
        () => [0, 0, 0],
      )
    : undefined;
  const result = rasterize(vertices, o, (v, z) => {
    let visibility = 1;
    if (shadow) {
      const p = transform(lightVP, [...v.world, 1]);
      const nx = p[0] / p[3],
        ny = p[1] / p[3],
        nz = (p[2] / p[3] + 1) / 2;
      if (
        p[3] > 0 &&
        Math.abs(nx) < 1 &&
        Math.abs(ny) < 1 &&
        nz >= 0 &&
        nz <= 1
      ) {
        const x = Math.floor(((nx + 1) * o.size) / 2),
          y = o.size - 1 - Math.floor(((ny + 1) * o.size) / 2);
        visibility = shadowVisibility(
          shadow.depth,
          o.size,
          x,
          y,
          nz,
          o.bias,
          o.shadowFilter,
        );
      }
    }
    const diffuse = o.lighting
      ? 0.18 +
        0.82 *
          Math.max(0, dot(v.normal, normalize(sub(light, v.world)))) *
          visibility
      : 1;
    const base = (
      o.texturing === false
        ? [0.35, 0.8, 0.72]
        : o.filter === "mip"
          ? sampleMip(...v.uv, o.lod)
          : checker(...v.uv, o.filter)
    ).map((c) => c * diffuse) as V3;
    return pixelShader ? pixelShader(v, z, base) : base;
  });
  if (shadow) {
    result.metrics.shadowPassTriangles = shadow.metrics.rasterTriangles;
    result.shadowDepth = shadow.depth;
  }
  result.trace.push(
    o.shadows
      ? \`光源深度比较，bias=\${o.bias}，filter=\${o.shadowFilter}\`
      : "未启用阴影 pass",
  );
  return result;
}
export function rasterOptions(
  p: Record<string, string | number | boolean>,
): RasterOptions {
  const finite = (key: string, fallback: number, min: number, max: number) => {
    const x = Number(p[key] ?? fallback);
    return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : fallback;
  };
  return {
    renderMode:
      p.renderMode === "vertices" || p.renderMode === "wireframe"
        ? p.renderMode
        : "filled",
    texturing: p.texturing !== false,
    size: Math.round(finite("resolution", 128, 32, 384)),
    angle: finite("angle", 25, -180, 180),
    distance: finite("distance", 3, 0.35, 6),
    clip: p.clip !== false,
    depth: p.depth !== false,
    perspective: p.perspective !== false,
    lighting: p.lighting !== false,
    shadows: !!p.shadows,
    bias: finite("bias", 0.005, 0, 0.05),
    cull: p.cull !== false,
    filter: String(p.filter ?? "nearest"),
    scene: String(p.scene ?? "cube"),
    lod: finite("lod", 0, 0, 5),
    aa: String(p.aa ?? "none"),
    shadowFilter: String(p.shadowFilter ?? "hard"),
    probeX: Math.floor(finite("probeX", 64, 0, 383)),
    probeY: Math.floor(finite("probeY", 64, 0, 383)),
  };
}
`,Oe=["顶点投影","三角形边界","覆盖次数","深度测试","UV 插值","法线插值","片元着色","阴影比较"],Bn=["transform","clipTriangle","rasterize","rasterize","interpolate","interpolate","renderScene","shadowVisibility"],Z=()=>{};function Jn({lab:n,record:s,update:a,onFrame:r,onExplore:t,frame:i,onSave:d}){const l=n.workspace==="shader",c=Re[n.id],m=A.useMemo(()=>Je(n,s)??(l?H(n.id):void 0),[s.code,s.rasterDraft,n,l]),[x,v]=A.useState("代码"),[h,j]=A.useState(""),[p,f]=A.useState(),[M,w]=A.useState(6),[y,P]=A.useState(50),[E,D]=A.useState(),[I,V]=A.useState(),[g,z]=A.useState(!1),[u,N]=A.useState(),B=A.useRef(null);A.useLayoutEffect(()=>{const o=B.current;if(!o||!p)return;const b=()=>{const U=o.querySelector(".live-image iframe, .live-image canvas");if(!U)return;const _=o.getBoundingClientRect(),L=U.getBoundingClientRect();o.style.setProperty("--ab-top",`${L.top-_.top}px`),o.style.setProperty("--ab-left",`${L.left-_.left}px`),o.style.setProperty("--ab-width",`${L.width}px`),o.style.setProperty("--ab-height",`${L.height}px`)};b();const C=new ResizeObserver(b);return C.observe(o),o.querySelectorAll(".live-image iframe, .live-image canvas").forEach(U=>C.observe(U)),()=>C.disconnect()},[p,M,l]);const O=Xe(i,s.params,m),k=vn[n.id],T=A.useMemo(()=>jn(k),[k]),W=l?yn(k,s.params,O?E:void 0):wn(k,s.params,I?.result),R=(Cn[n.id]??[]).map(o=>Sn.find(b=>b.id===o)),S=()=>{const o=R.flatMap(L=>L.variants.map((Tn,Le)=>({fault:L,variant:Le}))).filter(L=>!(u?.fault.id===L.fault.id&&u.variant===L.variant)),{fault:b,variant:C}=o[Math.floor(Math.random()*o.length)],{correct:U,faulty:_}=Pn(we(n),b,C);f(void 0),z(!1),r(void 0),N({fault:b,variant:C,params:_,correct:U,reference:me(Fe(U)),tries:0,solved:!1})},Y=()=>{N(void 0),f(void 0)},$=o=>{if(!u)return;const b=I;if(!b||JSON.stringify(b.params)!==JSON.stringify(u.params)){N({...u,verdict:"waiting"});return}const C=An(u.reference,b.result),U=On(o,C),_=u.tries+1;U.kind==="right"?(N({...u,tries:_,solved:!0,diffs:C,verdict:U}),f({schemaVersion:1,labId:n.id,labVersion:n.version,source:"cpu",at:new Date().toISOString(),parameters:structuredClone(u.correct),environment:{},metrics:{},events:[],checks:[]})):N({...u,tries:_,verdict:U})},X=()=>{if(g||!k?.target){f(void 0),z(!1);return}f({schemaVersion:1,labId:n.id,labVersion:n.version,source:l?"webgl":"cpu",at:new Date().toISOString(),code:k.target(),parameters:structuredClone(s.params),environment:{},metrics:{},events:[],checks:[]}),z(!0)},F=o=>{try{Ge(o),j(""),a(o.language==="raster"?{rasterDraft:o.text}:{code:o})}catch(b){j(String(b))}},fe=o=>{s.runtimeError!==o&&a({runtimeError:o})};function ge(o){const b=n.controls.find(C=>C.key===o);return e.jsxs("label",{className:"control",children:[b.label,b.type==="checkbox"?e.jsx("input",{"aria-label":b.label,type:"checkbox",checked:!!s.params[b.key],onChange:C=>{a({params:{...s.params,[b.key]:C.target.checked}})}}):b.type==="select"?e.jsx("select",{"aria-label":b.label,value:String(s.params[b.key]),onChange:C=>{a({params:{...s.params,[b.key]:C.target.value}})},children:b.options?.map(C=>e.jsx("option",{children:C},C))}):e.jsxs(e.Fragment,{children:[e.jsx("output",{children:String(s.params[b.key])}),e.jsx("input",{"aria-label":b.label,type:"range",min:b.min,max:b.max,step:b.step??1,value:Number(s.params[b.key]),onChange:C=>{a({params:{...s.params,[b.key]:Number(C.target.value)}})}})]}),b.hint&&e.jsx("small",{children:b.hint})]},b.key)}const be=(l?["amount","time"]:["angle","distance"]).filter(o=>n.controls.some(b=>b.key===o)),ve=O?"ok":s.runtimeError?"error":"pending",Ue=Bn[M],je=de.indexOf(`export function ${Ue}`),ye=de.indexOf(`
export `,je+1);return e.jsxs("div",{id:"workbench",className:`graphics-workbench studio ${l?"shader-studio":"render-studio"}`,children:[!l&&e.jsx(an,{lesson:n.id}),e.jsxs("div",{className:"studio-bar",children:[e.jsxs("div",{children:[e.jsx("span",{className:"eyebrow",children:l?"LIVE SHADER STUDIO":"RENDER PIPELINE DESK"}),e.jsx("p",{children:l?"改一行，看看光与形状怎样变化。":"改一个条件，追踪它怎样变成像素。"})]}),e.jsxs("div",{className:"toolbar",children:[e.jsx("button",{disabled:!O,onClick:()=>{f(structuredClone(i)),z(!1)},children:"固定当前画面为 A"}),p&&e.jsx("button",{onClick:()=>{f(void 0),z(!1)},children:"关闭 A/B"}),e.jsx("button",{className:"primary",disabled:!O,onClick:d,children:"保存画面与源码"})]})]}),e.jsxs("div",{className:"studio-live",children:[e.jsxs("section",{className:"graphics-code studio-editor","aria-label":l?"Shader 创作区":"渲染器实验区",children:[e.jsx("nav",{className:"studio-tabs","aria-label":"学习方式",children:["代码","讲解","练习","本机迁移"].map(o=>e.jsx("button",{"aria-pressed":x===o,onClick:()=>v(o),children:o},o))}),e.jsxs("div",{className:"studio-editor-body",children:[e.jsx(kn,{labId:n.id,brief:xn[n.id],tasks:c.tasks,checks:k,states:u?[]:W,runtimeError:s.runtimeError??"",targetOn:g,onTarget:k?.target?X:void 0,scaffold:ke[n.id],onMoreHint:l&&ke[n.id]?.level===3?()=>F(H(n.id,!1,!0)):void 0,onExplore:t}),e.jsx(Nn,{labId:n.id}),e.jsx(en,{labId:n.id}),!l&&e.jsx(Rn,{offered:R,active:u&&{symptom:u.fault.symptom,solved:u.solved,tries:u.tries,why:u.solved?u.fault.why:void 0,diffs:u.diffs,verdict:u.verdict},onStart:S,onAnswer:$,onStop:Y}),x==="代码"&&(l&&m?.language==="glsl"?e.jsxs(e.Fragment,{children:[e.jsx("h3",{children:"实时编写 GLSL"}),(n.lesson??1)>=6&&e.jsxs("details",{children:[e.jsx("summary",{children:"顶点 Shader"}),e.jsx(ne,{label:"顶点 Shader",value:m.vertex,onChange:o=>F({...m,vertex:o})})]}),e.jsx(ne,{label:"片元 Shader",value:m.fragment,onChange:o=>F({...m,fragment:o})}),e.jsx("small",{children:"修改后自动编译。错误时保留上一张成功画面，并暂停保存当前快照。"}),e.jsxs("div",{className:"toolbar",children:[e.jsx("button",{onClick:()=>F(H(n.id)),children:"重置起始代码"}),e.jsx("button",{onClick:()=>{t(),F(H(n.id,!0))},children:"应用参考实现（记录辅助）"}),e.jsx("button",{onClick:()=>{ee(`${n.id}.vert`,m.vertex),ee(`${n.id}.frag`,m.fragment)},children:"导出 GLSL"})]}),e.jsxs("details",{onToggle:o=>{o.currentTarget.open&&t()},children:[e.jsx("summary",{children:"查看参考实现（记录辅助）"}),e.jsx("pre",{children:H(n.id,!0).fragment})]})]}):e.jsxs(e.Fragment,{children:[e.jsx("h3",{children:"实时片元着色练习"}),e.jsxs("p",{children:["修改 r、g、b 表达式，右侧直接显示这段计算的结果。先尝试把"," ",e.jsx("code",{children:"r = baseR"})," 改成 ",e.jsx("code",{children:"r = fract(u)"}),"。"]}),e.jsx(ne,{label:"实时颜色表达式",value:s.rasterDraft??Pe,onChange:o=>F({language:"raster",text:o})}),e.jsxs("div",{className:"toolbar",children:[e.jsx("button",{onClick:()=>F({language:"raster",text:Ie}),children:"用 UV 显示颜色"}),e.jsx("button",{onClick:()=>{a({rasterDraft:void 0})},children:"恢复内置着色"}),e.jsx("button",{onClick:()=>ee(`${n.id}.shade.txt`,s.rasterDraft??Pe),children:"导出着色表达式"})]}),e.jsxs("details",{children:[e.jsx("summary",{children:"变量和函数"}),e.jsx("p",{children:"u / v：插值 UV；nx / ny / nz：单位法线；x / y / z：世界坐标；depth：深度；baseR / baseG / baseB：当前纹理、光照和阴影的原颜色；pi：圆周率。"}),e.jsx("p",{children:"支持 + − * /、括号，以及 sin、cos、abs、sqrt、floor、fract、min、max、pow、clamp、mix、step。三个通道以分号分隔，最多 2 KiB。计算结果夹到 0–1；这是受限表达式，不是 C++ 或 JavaScript。"})]}),e.jsxs("details",{children:[e.jsxs("summary",{children:["当前阶段的管线实现：",Oe[M]]}),e.jsx("pre",{className:"raster-source",children:de.slice(je,ye<0?void 0:ye)})]}),M<=1&&e.jsx(De,{params:s.params})]})),x==="讲解"&&e.jsx(mn,{lab:n,params:s.params,onExplore:t}),x==="练习"&&e.jsxs(e.Fragment,{children:[e.jsx("h3",{children:l?"从看到的效果，走到自己做出来":"先定位阶段，再独立重建"}),e.jsx("p",{children:l?"先自由改动；把感兴趣的版本固定为 A，再选择下面的任务复现。":"先看最终画面，再切换诊断视图、选择像素；定位错误后，在本机重建相应函数。"}),e.jsx("ol",{className:"lesson-tasks",children:c.tasks.map(o=>e.jsxs("li",{children:[e.jsx("strong",{children:o.title}),e.jsx("p",{children:o.instructions}),e.jsxs("details",{onToggle:b=>{b.currentTarget.open&&t()},children:[e.jsx("summary",{children:"核对预期现象（记录辅助）"}),e.jsx("p",{children:o.expected})]})]},o.title))}),e.jsx("h3",{children:"交付与自查"}),e.jsx("ul",{children:c.rubric.map(o=>e.jsx("li",{children:o},o))}),e.jsxs("details",{children:[e.jsx("summary",{children:"可选预测挑战"}),e.jsx("p",{children:n.challenge}),e.jsxs("label",{children:["预测与原因",e.jsx("textarea",{"aria-label":"预测与原因",value:s.prediction,onChange:o=>{a({prediction:o.target.value})}})]}),e.jsxs("label",{children:["预期现象",e.jsx("input",{"aria-label":"可检查的答案",value:s.answer,onChange:o=>{a({answer:o.target.value})}})]})]})]}),x==="本机迁移"&&e.jsxs(e.Fragment,{children:[e.jsx("h3",{children:l?"迁移到 Unity":"用 C++ 重建管线"}),e.jsx("p",{children:n.native}),e.jsxs("a",{download:!0,href:`/labs/graphics/${l?"unity-shaderlab":"renderlab-cpp"}.zip`,children:["下载",l?" Unity":" C++"," 示例与练习 ↧"]}),c.unity&&e.jsx(he,{children:c.unity}),!l&&e.jsxs(e.Fragment,{children:[e.jsx(ne,{label:"我的本机 C++ 片段",value:s.code?.language==="cpp"?s.code.text:"",onChange:o=>F({language:"cpp",text:o})}),e.jsx("p",{children:"C++ 在本机编译运行；此处的片段用于记录，不驱动网页预览。实时表达式草稿和 C++ 草稿分别保留。"}),e.jsx("button",{onClick:()=>ee(`${n.id}.cpp`,s.code?.language==="cpp"?s.code.text:""),children:"导出本机 C++ 片段"})]})]}),h&&e.jsx("p",{role:"alert",children:h})]})]}),e.jsxs("section",{className:"graphics-output studio-viewport","aria-label":"实时画面","data-state":ve,children:[e.jsxs("div",{className:"studio-preview-title",children:[e.jsx("h3",{children:u?"排错挑战":p?"B · 当前版本":"实时预览"}),e.jsx("span",{className:"pill",children:l?"WebGL2":Oe[M]})]}),e.jsxs("div",{ref:B,className:`studio-canvases ${p?"has-reference":""}`,style:{"--wipe":y/100},children:[e.jsx("div",{className:"live-image",children:l&&m?e.jsx(Ne,{lab:n,params:s.params,code:m,onFrame:r,onDiagnostic:fe,probes:T,onSamples:D}):e.jsx(ze,{lab:n,params:u?u.params:s.params,code:u?void 0:m,onFrame:u?Z:r,onParams:o=>u?N({...u,params:o}):void a({params:o}),onDiagnostic:fe,stage:M,onStage:w,onResult:(o,b)=>V(o&&b?{result:o,params:b}:void 0)})}),p&&e.jsx("div",{className:"pinned-image",children:l&&p.code?e.jsx(Ne,{lab:n,params:p.parameters,code:p.code,onFrame:Z,onDiagnostic:Z,readOnly:!0}):e.jsx(ze,{lab:n,params:p.parameters,code:p.code,onFrame:Z,onParams:Z,onDiagnostic:Z,stage:M,readOnly:!0})}),p&&e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"ab-label is-a",children:u?"A · 正确渲染":g?"A · 目标画面":"A · 固定版本"}),e.jsx("span",{className:"ab-label is-b",children:"B · 当前"}),e.jsx("input",{className:"wipe-range",type:"range",min:0,max:100,value:y,"aria-label":"A/B 对比分割线",onChange:o=>P(Number(o.target.value))})]})]}),p&&e.jsxs("p",{className:"studio-ab-note",children:["拖动竖线对比 A 与 B；A 重现固定参数与源码，",l?"固定时间":"随 B 切换诊断视图","。关闭后不保留此临时对照，需长期保存请保存快照。"]}),e.jsx("p",{className:"studio-runtime",role:"status","data-state":ve,children:u?"排错挑战进行中 · 这张图带有一处错误，不会保存":O?"当前修改已生效 · 可保存快照":s.runtimeError?"当前修改未运行成功 · 上一张成功画面仅供参考":"正在更新画面 · 等待当前输入"}),!u&&e.jsx("div",{className:"studio-quick-controls",children:be.map(ge)}),e.jsxs("details",{className:"studio-parameters",hidden:!!u,children:[e.jsx("summary",{children:l?"场景、采样与全部参数":"几何、光照与全部参数"}),e.jsx("div",{className:"studio-quick-controls",children:n.controls.filter(o=>!be.includes(o.key)).map(o=>ge(o.key))}),e.jsx("button",{onClick:()=>{a({params:we(n)})},children:"重置参数"})]}),O&&e.jsxs("details",{className:"studio-metrics",children:[e.jsxs("summary",{children:["当前帧数据",p?"与 A 的对照":""]}),e.jsx("dl",{children:Object.entries(i.metrics).map(([o,b])=>e.jsxs("div",{children:[e.jsx("dt",{children:qe(o)}),e.jsxs("dd",{children:[Me(b),p&&p.metrics[o]!==void 0&&e.jsxs("small",{children:[" · A: ",Me(p.metrics[o])]})]})]},o))})]})]})]}),e.jsxs("section",{className:"studio-notebook",id:"reflection",children:[e.jsxs("div",{children:[e.jsx("h3",{children:"实验笔记"}),e.jsx("p",{children:"写下你改了什么、看到什么，以及下一步想尝试什么。"})]}),e.jsxs("label",{children:["我的解释",e.jsx("textarea",{"aria-label":"我的解释",value:s.explanation,onChange:o=>{a({explanation:o.target.value})},placeholder:"例如：让红通道随 u 变化后，横向渐变出现；下一步用 sin(u * pi * 8) 做条纹。"})]}),e.jsxs("div",{className:"toolbar",children:[e.jsx("button",{className:"primary",disabled:!O,onClick:d,children:"保存这个版本"}),e.jsx("button",{onClick:()=>{a(_e(s))},children:"开始新尝试"}),e.jsxs("small",{children:[s.assisted?"此草稿使用过参考或提示":"自由探索中"," ·"," ",s.runs.length," 个已保存版本"]})]}),s.runs.length>0&&e.jsxs("p",{className:"studio-last-snapshot",children:["最近保存的快照 ·"," ",new Date(s.runs.at(-1).at).toLocaleTimeString()," · 源码与参数已保留"]}),e.jsxs("details",{children:[e.jsx("summary",{children:"复现后的自我确认"}),e.jsx("p",{children:n.variant}),e.jsx("div",{className:"flags",children:[["seen","已浏览"],["hint","使用提示"],["independent","独立解释"],["variant","变式验证"]].map(([o,b])=>e.jsxs("label",{children:[e.jsx("input",{type:"checkbox",checked:!!s.flags[o],onChange:C=>{a({flags:{...s.flags,[o]:C.target.checked}})}}),b,"（自己确认）"]},o))})]}),e.jsxs("nav",{"aria-label":"保存与迁移",children:[e.jsx("a",{href:"#attempt-history",children:"版本历史"}),e.jsx("a",{href:"#native-evidence",children:"导入本机结果与导出备份"}),e.jsx("a",{href:"#reading",children:"原资料"})]})]})]})}export{Jn as GraphicsWorkbench};
