import{c as he,l as O,r as i,f as ue,u as q,d as pe,j as e,L,e as fe,g as me,h as ve,R as xe}from"./index-sPiXCj20.js";import{S as ge,l as K,s as J}from"./scaffold-8jNMQKTe.js";import{C as be,b as ye,a as je,d as _e,u as Le,e as Z}from"./RasterPreview-C3itZWhd.js";import{d as ie,l as I}from"./relatedLessons-jK1o99NX.js";import{R as we}from"./RendererView-8PVQCQv0.js";import{M as Ne,r as Se}from"./index-Bvl4yCMY.js";import"./theme-DG4w92gX.js";const Ee=`#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution, u_mouse;
uniform vec4 u_click,u_orbit;
uniform sampler2D u_field;
uniform float u_time, u_amount, u_hue, u_gain;
out vec4 outColor;
vec3 palette(float t){return .5+.5*cos(6.28318*(vec3(.0,.33,.67)+t));}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(3.1,7.7);a*=.5;}return v;}
vec2 at(vec2 m){vec2 p=(m-.5)*2.;p.x*=u_resolution.x/u_resolution.y;return p;}
vec2 stage(){return at(v_uv);}
mat2 rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
vec4 flow(){return texture(u_field,v_uv);}
vec3 grade(vec3 c){float a=u_hue,ca=cos(a);vec3 n=vec3(.57735);return (c*ca+cross(n,c)*sin(a)+n*dot(n,c)*(1.-ca))*u_gain;}
vec3 finish(vec3 c,float k){return 1.-exp(-max(grade(c),0.)*k);}
vec2 toUv(vec2 p){p.x/=u_resolution.x/u_resolution.y;return p*.5+.5;}
`,w=[{id:"blackhole",learn:["shader-uv","shader-noise","shader-light"],layers:[{id:"L_BEND",label:"引力弯折",what:"光线在黑洞附近弯折；关掉后光线走直线",idle:!0},{id:"L_DISK",label:"吸积盘",what:"y=0 平面上的发光气体盘",idle:!0},{id:"L_RING",label:"光子环",what:"绕过阴影边缘的一圈细亮线",idle:!0},{id:"L_STARS",label:"星空",what:"被引力透镜扭曲的背景星星",idle:!0}],title:"事件视界",caption:"拖动转动视角，光线绕着黑洞弯折",lesson:"shader-light",tags:["光线步进","引力透镜","吸积盘"],body:`
void main(){
 vec2 p=stage();
 float yw=u_orbit.x+.35,pt=clamp(.3+u_orbit.y,-1.25,1.25);
 vec3 ro=vec3(0.,0.,-21.),rd=normalize(vec3(p,1.9));
 ro.yz*=rot(pt);rd.yz*=rot(pt);ro.xz*=rot(yw);rd.xz*=rot(yw);
 vec3 pos=ro,vel=rd,hv=cross(pos,vel);float h2=dot(hv,hv),trans=1.;
 vec3 col=vec3(0.);float ring=0.;
 for(int i=0;i<110;i++){
  float r2=dot(pos,pos),r=sqrt(r2),dt=clamp(.05*r,.04,1.);
#if L_RING
  ring+=trans*exp(-pow((r-1.6)*5.,2.))*dt*.5;
#endif
  vec3 np=pos+vel*dt;
#if L_DISK
  if(pos.y*np.y<0.){
   vec3 hp=mix(pos,np,pos.y/(pos.y-np.y));float hr=length(hp.xz);
   if(hr>2.6&&hr<7.5){
    float sw=atan(hp.z,hp.x)+u_time*1.3/(hr*sqrt(hr));
    float band=.45+.55*noise(vec2(hr*5.,sw*4.))+.3*noise(vec2(hr*15.,sw*9.));
    float heat=pow(2.6/hr,1.4);
    vec3 orb=normalize(vec3(-hp.z,0.,hp.x));
    float dop=clamp(dot(orb,-vel)*inversesqrt(hr)*1.6,-.8,.9);
    vec3 em=mix(vec3(1.,.38,.08),vec3(1.,.92,.75),clamp(heat*1.3,0.,1.))*(1.+1.8*dop)*heat*3.6*band;
    float a=smoothstep(7.5,6.2,hr)*smoothstep(2.6,3.,hr);
    col+=trans*em*a;trans*=1.-.55*a;
   }
  }
#endif
#if L_BEND
  vel=normalize(vel-1.5*h2*pos/(r2*r2*r)*dt);
#endif
  pos=np;
  if(r<1.){trans=0.;break;}
  if(r>40.)break;
 }
 vec3 sky=vec3(.004,.006,.016);
#if L_STARS
 sky+=vec3(.9,.95,1.)*3.*pow(hash(floor(vec2(atan(vel.z,vel.x),asin(clamp(vel.y,-1.,1.)))*vec2(300.))),260.);
#endif
 col+=trans*sky+(trans>0.?vec3(1.,.85,.65)*ring:vec3(0.));
 outColor=vec4(finish(col,1.15),1.);
}`},{id:"metal",learn:["shader-shapes","shader-light"],layers:[{id:"L_BLEND",label:"融合",what:"平滑最小值把球融成一体；关掉后只是互相穿插的球",idle:!0},{id:"L_ENV",label:"环境反射",what:"表面反射的摄影棚天空和灯箱",idle:!0},{id:"L_FRESNEL",label:"边缘高光",what:"掠射角越大越亮的 Fresnel 项",idle:!0}],title:"液态金属",caption:"它跟着指针游动，点击会甩出一滴",lesson:"shader-light",tags:["SDF 融合","光线步进","环境反射"],body:`
float smin(float a,float b,float k){float h=max(k-abs(a-b),0.)/k;return min(a,b)-h*h*k*.25;}
#if L_BLEND
#define MERGE(a,b) smin(a,b,.55)
#else
#define MERGE(a,b) min(a,b)
#endif
float map(vec3 p){
 float t=u_time*.5,d=1e5;
 for(int i=0;i<5;i++){float k=float(i);
  vec3 c=vec3(cos(t*.8+k*1.9)*1.6,sin(t*.7+k*2.3)*.8,sin(t*.5+k)*.4);
  d=MERGE(d,length(p-c)-(.3+.07*sin(k*3.+t)));}
 d=MERGE(d,length(p-vec3(at(u_mouse)*2.,0.))-(.42+.25*u_click.w));
 float age=u_time-u_click.z;vec2 ang=vec2(cos(u_click.z*7.),sin(u_click.z*7.));
 return MERGE(d,length(p-vec3(at(u_click.xy)*2.+ang*age*1.3,0.))-.32*exp(-age*.8));
}
void main(){
 vec2 p=stage();vec3 ro=vec3(0.,0.,-4.5),rd=normalize(vec3(p,2.2));float t=0.;
 for(int i=0;i<48;i++){float d=map(ro+rd*t);if(d<.002||t>9.)break;t+=d;}
 vec3 c=mix(vec3(.05,.055,.08),vec3(.2,.23,.3),v_uv.y);
 if(t<9.){
  vec3 pos=ro+rd*t;vec2 e=vec2(.003,0.);
  vec3 n=normalize(vec3(map(pos+e.xyy)-map(pos-e.xyy),map(pos+e.yxy)-map(pos-e.yxy),map(pos+e.yyx)-map(pos-e.yyx)));
  vec3 r=reflect(rd,n);
#if L_ENV
  vec3 env=mix(vec3(.16,.18,.24),vec3(1.,1.,1.05),smoothstep(-.5,.8,r.y));
  env+=vec3(1.,.96,.9)*(smoothstep(.2,.0,abs(r.x*.5+r.y*.25-.3))+smoothstep(.1,.0,abs(r.x*.5-r.y*.2+.45)))*smoothstep(-.4,.5,-r.z)*2.2;
  env+=vec3(1.,.5,.2)*pow(max(dot(r,normalize(vec3(.6,-.3,-.7))),0.),10.)*.9;
#else
  vec3 env=vec3(.5);
#endif
#if L_FRESNEL
  float fr=pow(1.-max(dot(n,-rd),0.),3.);
#else
  float fr=0.;
#endif
  c=env*(.7+.5*fr)+vec3(.2,.5,.9)*fr*.35;
 }
 outColor=vec4(finish(c,1.2),1.);
}`},{id:"lattice",learn:["shader-uv","shader-patterns","shader-shapes"],layers:[{id:"L_BULGE",label:"指针顶开",what:"指针附近的网格被推开",idle:!0},{id:"L_PLUCK",label:"拨动波",what:"点击后一圈衰减的弹性波",idle:!1},{id:"L_TENSION",label:"拉伸变色",what:"用屏幕导数量出网格被拉伸多少，越紧越红",idle:!0},{id:"L_NODES",label:"节点",what:"网格交点上的小圆点",idle:!0}],title:"弹性光网",caption:"指针把网格顶开，点击拨动它，拉得越紧颜色越红",lesson:"shader-patterns",tags:["坐标变换","导数","弹性波"],body:`
void main(){
 vec2 p=stage(),m=at(u_mouse),q=p;vec4 F=flow();
#if L_BULGE
 vec2 d=q-m;q-=normalize(d+1e-4)*exp(-dot(d,d)*5.)*.17*(1.+u_click.w);
#endif
 q-=F.xy*.45;
#if L_PLUCK
 float age=u_time-u_click.z;vec2 cd=q-at(u_click.xy);
 q+=normalize(cd+1e-4)*sin(length(cd)*16.-age*11.)*exp(-age*1.4-length(cd)*1.2)*.05;
#endif
 float s=.11;vec2 g=q/s,dl=abs(fract(g+.5)-.5);
 float line=max(smoothstep(.035,0.,dl.x),smoothstep(.035,0.,dl.y));
#if L_NODES
 float node=smoothstep(.17,.05,length(dl));
#else
 float node=0.;
#endif
#if L_TENSION
 float base=length(dFdx(p/s)),tension=clamp(abs(length(dFdx(g))/max(base,1e-5)-1.)*2.5,0.,1.);
#else
 float tension=0.;
#endif
 vec3 ink=mix(vec3(.15,.85,1.),vec3(1.,.2,.55),tension);
 vec3 c=vec3(.012,.02,.045)*(1.2-length(p)*.4);
 c+=ink*(line*.5+node*1.3)*(.45+F.z*2.5+tension*1.5)*smoothstep(3.,.3,length(p));
 outColor=vec4(finish(c,1.3),1.);
}`},{id:"halftone",learn:["shader-patterns","shader-noise"],layers:[{id:"L_CYAN",label:"青",what:"第一版网点，倾斜约 15°",idle:!0},{id:"L_MAGENTA",label:"品红",what:"第二版网点，倾斜约 75°",idle:!0},{id:"L_YELLOW",label:"黄",what:"第三版网点，不倾斜",idle:!0},{id:"L_BLACK",label:"黑",what:"只在几种油墨叠得很重的地方出现",idle:!1}],title:"半调纸墨",tone:"light",caption:"指针划过的地方，纸下的印刷油墨浮上来",lesson:"shader-patterns",tags:["半调网点","旋转网格","减色混合"],body:`
float dotsAt(vec2 p,float ang,float dens){
 vec2 c=fract(rot(ang)*p*20.)-.5;float r=sqrt(clamp(dens,0.,1.))*.74,aa=fwidth(length(c))*1.3;
 return smoothstep(r+aa,r-aa,length(c));
}
void main(){
 vec2 p=stage(),m=at(u_mouse);vec4 F=flow();float t=u_time*.12;
 vec2 q=p+F.xy*.3;
 float c=smoothstep(.35,.85,fbm(q*1.1+vec2(t,0.)));
 float mg=smoothstep(.35,.85,fbm(q*1.1+vec2(4.2,t*1.2)+3.));
 float y=smoothstep(.3,.8,fbm(q*.9+vec2(-t,7.7)))*.85;
 float reveal=clamp(.16+F.w*1.6+F.z*.5+exp(-dot(p-m,p-m)*28.)*.3,0.,1.);
 float k=smoothstep(.55,.95,c*mg*1.5)*.7*reveal;
 vec3 col=vec3(.96,.93,.86);
#if L_CYAN
 col*=mix(vec3(1.),vec3(.1,.5,.86),dotsAt(p,.26,c*reveal));
#endif
#if L_MAGENTA
 col*=mix(vec3(1.),vec3(.93,.18,.5),dotsAt(p,1.31,mg*reveal));
#endif
#if L_YELLOW
 col*=mix(vec3(1.),vec3(1.,.8,.1),dotsAt(p,0.,y*reveal));
#endif
#if L_BLACK
 col*=mix(vec3(1.),vec3(.09,.09,.12),dotsAt(p,.78,k));
#endif
 col*=.97+.04*hash(gl_FragCoord.xy);
 outColor=vec4(clamp(grade(col),0.,1.),1.);
}`},{id:"aurora",learn:["shader-noise"],layers:[{id:"L_CURTAIN",label:"光幕",what:"七层被噪声扭曲的发光带",idle:!0},{id:"L_STARS",label:"星星",what:"闪烁的星点",idle:!0},{id:"L_RIDGE",label:"山脊",what:"地平线上的黑色轮廓",idle:!0},{id:"L_METEOR",label:"流星",what:"点击后划过的一道亮线",idle:!1}],title:"极光潮汐",caption:"划过的风会吹弯光幕，点击放出一颗流星",lesson:"shader-noise",tags:["FBM 噪声","域扭曲","发光叠加"],body:`
void main(){
 vec4 F=flow();vec2 p=stage()-F.xy*vec2(.5,.35),m=at(u_mouse),cp=at(u_click.xy);float t=u_time*.18;
 vec3 c=vec3(.006,.012,.04)+vec3(.02,.035,.09)*exp(-length(p+vec2(0,.95))*1.5);
#if L_CURTAIN
 for(int i=0;i<7;i++){
  float k=float(i),x=p.x+m.x*.25+k*.21;
  float n=fbm(vec2(x*2.3,t+k));
  float y=p.y+.32-m.y*.18+sin(x*2.+t+k*.5)*.17+n*.8;
  float curtain=exp(-abs(y)*14.)*(.25+.75*fbm(vec2(x*9.,p.y*3.+t)));
  c+=curtain*mix(vec3(.05,.95,.6),vec3(.5,.12,1.),k/6.)*1.05;
 }
#endif
#if L_METEOR
 float age=u_time-u_click.z;vec2 dir=normalize(vec2(-.85,-.4)),pa=p-(cp+dir*age*1.5);
 float h=clamp(dot(pa,-dir)/.5,0.,1.);
 c+=exp(-length(pa+dir*h*.5)*95.)*(1.-h)*exp(-age*1.2)*vec3(.8,.95,1.)*1.8;
#endif
 c+=F.z*vec3(.2,.75,.6)*.12;
#if L_STARS
 c+=pow(hash(floor(gl_FragCoord.xy/3.)),120.)*(.4+.3*sin(t*5.+p.x*30.));
#endif
#if L_RIDGE
 float ridge=-.8+.12*fbm(vec2(p.x*1.4+7.,1.))+.04*sin(p.x*3.);
 c=mix(c,vec3(.002,.004,.012),smoothstep(.012,-.012,p.y-ridge));
#endif
 outColor=vec4(finish(c,2.1),1.);
}`},{id:"pool",learn:["shader-patterns","shader-light"],layers:[{id:"L_REFRACT",label:"折射",what:"水面斜率把池底瓷砖的图案扭曲",idle:!0},{id:"L_CAUSTIC",label:"焦散",what:"水面像透镜，把光聚成亮纹",idle:!0},{id:"L_GLINT",label:"高光",what:"水面法线对着太阳时的亮点",idle:!0},{id:"L_WAKE",label:"水痕",what:"指针划过留下的波痕",idle:!1}],title:"泳池焦散",caption:"手指划过水面留下波痕，点击落下一滴水",lesson:"shader-patterns",tags:["波的叠加","折射","焦散"],body:`
float src(vec2 p,vec2 s,float k,float w,float a){float r=length(p-s);return a*sin(r*k-u_time*w)/(1.+r*2.2);}
float surf(vec2 p){
 float t=u_time*.25,age=u_time-u_click.z;
 float h=src(p,vec2(cos(t)*.8,sin(t*1.3)*.5),24.,2.4,.35)+src(p,vec2(sin(t*.8+2.)*.9,cos(t*.9)*.45),28.,2.8,.35)+src(p,vec2(-.5+sin(t*1.7)*.2,-.4),20.,2.,.3);
 float rr=length(p-at(u_click.xy))-age*.8;
 h+=exp(-rr*rr*40.)*sin(rr*40.)*exp(-age*.9)*1.1;
#if L_WAKE
 vec4 W=texture(u_field,toUv(p));
 h+=W.w*.5+W.z*.2;
#endif
 return h;
}
void main(){
 vec2 p=stage();float e=.01,h=surf(p);
 float hx=surf(p+vec2(e,0.)),hy=surf(p+vec2(0.,e));
 vec2 g=vec2(hx-h,hy-h)/e;
 float lap=(hx+hy+surf(p-vec2(e,0.))+surf(p-vec2(0.,e))-4.*h)/(e*e);
#if L_REFRACT
 vec2 tp=(p+g*.022)*3.2;
#else
 vec2 tp=p*3.2;
#endif
 vec2 tf=fract(tp);
 float grout=smoothstep(.015,.04,min(min(tf.x,1.-tf.x),min(tf.y,1.-tf.y)));
 vec3 tile=mix(vec3(.08,.55,.7),vec3(.2,.78,.82),hash(floor(tp)))*grout+vec3(.1,.38,.5)*(1.-grout);
#if L_CAUSTIC
 float caustic=pow(clamp(.3+lap*.0035,0.,1.6),2.5);
#else
 float caustic=0.;
#endif
#if L_GLINT
 vec3 n=normalize(vec3(-g*.05,1.));
 float spec=pow(max(dot(reflect(-normalize(vec3(-.4,.5,.8)),n),vec3(0.,0.,1.)),0.),70.);
#else
 float spec=0.;
#endif
 vec3 c=tile*(.75+.9*caustic)*(.7+.5*exp(-dot(p,p)*.25))+caustic*vec3(.5,.9,1.)*.35+spec*vec3(1.,.97,.9)*.8;
 outColor=vec4(finish(c,1.05),1.);
}`},{id:"glass",learn:["shader-shapes","shader-patterns","shader-noise"],layers:[{id:"L_LEAD",label:"铅条",what:"用第一近点和第二近点的距离差找出的格子边缘",idle:!0},{id:"L_TEXTURE",label:"玻璃纹理",what:"每块玻璃里的噪声起伏",idle:!0},{id:"L_LAMP",label:"灯光",what:"指针处的光让附近的玻璃更亮",idle:!0},{id:"L_SHATTER",label:"碎裂",what:"点击后附近的格子被推散再复原",idle:!1}],title:"彩色玻璃",caption:"指针是一盏灯，点击会让附近的玻璃碎裂坠落再复原",lesson:"shader-shapes",tags:["Voronoi","最近点距离","边缘检测"],body:`
vec2 h22(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453);}
void main(){
 vec2 p=stage(),m=at(u_mouse);vec4 F=flow();float t=u_time*.3,age=u_time-u_click.z;
 vec2 q=p*3.2+F.xy*.6,ci=floor(q),cp=at(u_click.xy);
 float d1=9.,d2=9.;vec2 id=vec2(0.);
 for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){
  vec2 cell=ci+vec2(float(i),float(j)),o=h22(cell);
  vec2 site=cell+.5+.42*sin(t*(.5+o.yx*.8)+6.28318*o);
#if L_SHATTER
  vec2 away=site/3.2-cp;
  site+=(normalize(away+1e-4)*.8+vec2(0.,-.9))*age*exp(-age*1.5)*exp(-dot(away,away)*2.2)*3.;
#endif
  float d=length(q-site);
  if(d<d1){d2=d1;d1=d;id=cell;}else if(d<d2)d2=d;
 }
 float dm=length(q-m*3.2);
 if(dm<d1){d2=d1;d1=dm;id=vec2(77.7,13.1);}else if(dm<d2)d2=dm;
 float edge=d2-d1;
 float hh=hash(id);
 vec3 base=palette(hh*.9+.05);
 base=mix(vec3(dot(base,vec3(.33))),base,1.35);
#if L_TEXTURE
 float tex=.8+.4*fbm(q*3.+hh*9.);
#else
 float tex=1.;
#endif
#if L_LAMP
 float lamp=exp(-dot(p-m,p-m)*2.5);
#else
 float lamp=0.;
#endif
 vec3 c=base*tex*(.45+.8*(1.-d1*.9)+lamp*1.2+F.z*.8);
#if L_LEAD
 float lead=smoothstep(.09,.03,edge);
 c+=vec3(.9,.95,1.)*smoothstep(.15,.08,edge)*(1.-lead)*.3;
 c=mix(c,vec3(.012,.012,.02),lead);
#endif
 outColor=vec4(finish(c,1.15),1.);
}`},{id:"dither",learn:["shader-post","shader-light"],layers:[{id:"L_DITHER",label:"抖动",what:"用 Bayer 矩阵把连续亮度量化成黑白点；关掉后是连续灰度",idle:!0},{id:"L_LIGHT",label:"台灯",what:"法线与指针灯光的 N·L 和衰减；关掉后只显示高度",idle:!0},{id:"L_DETAIL",label:"细节",what:"第二层更细的噪声",idle:!0}],title:"抖动浮雕",caption:"指针是一盏台灯，沙丘被拆成黑白两色的点",lesson:"shader-post",tags:["有序抖动","法线光照","量化"],body:`
float bayer(vec2 p){
 const float b[16]=float[](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
 return (b[int(mod(p.y,4.))*4+int(mod(p.x,4.))]+.5)/16.;
}
float height(vec2 p){
 float t=u_time*.1,h=fbm(p*1.3+vec2(t,t*.6));
#if L_DETAIL
 h+=.35*fbm(p*3.1-vec2(t*1.5,0.));
#endif
 return h;
}
void main(){
 vec2 px=floor(gl_FragCoord.xy/4.),uvq=(px*4.+2.)/u_resolution;
 vec2 p=(uvq-.5)*2.;p.x*=u_resolution.x/u_resolution.y;
 vec4 F=texture(u_field,uvq);p-=F.xy*.2;
 float e=.02,h=height(p);
 vec3 n=normalize(vec3(-(height(p+vec2(e,0.))-h)/e*.4,-(height(p+vec2(0.,e))-h)/e*.4,1.));
 vec3 lp=vec3(at(u_mouse),.6),l=normalize(lp-vec3(p,h*.5));
 float fall=1./(1.+dot(lp.xy-p,lp.xy-p)*.8),age=u_time-u_click.z;
#if L_LIGHT
 float lum=max(dot(n,l),0.)*fall*(1.15+u_click.w*.9)+exp(-age*3.)*.45*fall+F.z*.3+(h-.5)*.2;
#else
 float lum=h*.8;
#endif
#if L_DITHER
 float on=step(bayer(px),clamp(lum,0.,1.));
#else
 float on=clamp(lum,0.,1.);
#endif
 vec3 c=mix(vec3(.05,.07,.2),vec3(.93,.95,1.),on);
 outColor=vec4(clamp(grade(c),0.,1.),1.);
}`}];function ke(t){return{language:"glsl",vertex:he,fragment:Ee+`// EXHIBIT:${w[t].id}
`+w[t].layers.map(n=>`#define ${n.id} 1 // ${n.what}
`).join("")+w[t].body}}const le=t=>new RegExp(`^(#define ${t} )([01])`,"m");function Re(t,n){const h=le(n).exec(t);return h?h[2]==="1":void 0}function Ce(t,n,h){return t.replace(le(n),`$1${h?1:0}`)}function oe(t,n,h=Math.random()){if(t<2)return 0;const o=Math.floor(Math.max(0,Math.min(.999999,h))*(t-1));return o>=n?o+1:o}const C={"shader-uv":[],"shader-shapes":["shader-uv"],"shader-patterns":["shader-shapes"],"shader-texture":["shader-uv"],"shader-noise":["shader-patterns"],"shader-vertex":["shader-uv"],"shader-light":["shader-vertex"],"shader-project":["shader-texture","shader-noise","shader-light"],"shader-normal":["shader-light","shader-texture"],"shader-alpha":["shader-uv"],"shader-post":["shader-texture"],"shader-multipass":["shader-post"],"shader-pbr":["shader-light"],"shader-urp":["shader-project"],"raster-coordinates":[],"raster-clipping":["raster-coordinates"],"raster-coverage":["raster-coordinates"],"raster-depth":["raster-coverage"],"raster-interpolation":["raster-coverage"],"raster-shading":["raster-depth","raster-interpolation"],"raster-shadows":["raster-shading"],"raster-project":["raster-clipping","raster-shadows"],"raster-model":["raster-depth"],"raster-cull":["raster-model"],"raster-lod":["raster-shading"],"raster-aa":["raster-coverage"],"raster-pcf":["raster-shadows"],"raster-engine":["raster-project","raster-model","raster-lod","raster-aa","raster-pcf"]},W={none:"还没开始",tried:"试过",independent:"已确认独立解释",variant:"已确认变式验证"};function Ae(t){if(!t)return"none";const n=t.flags??{};return n.variant?"variant":n.independent?"independent":(t.runs?.length??0)>0||!!t.explanation?.trim()||!!t.code||t.rasterDraft!==void 0||!!n.seen||!!n.hint?"tried":"none"}const Q=t=>t==="independent"||t==="variant";function Te(t){const n={},h=o=>n[o]??=(C[o]??[]).filter(r=>t.includes(r)).length===0?0:1+Math.max(...C[o].filter(r=>t.includes(r)).map(h));return t.forEach(h),n}function Pe(t){const n=d=>!Q(t[d]),h=d=>(C[d]??[]).every(u=>Q(t[u])),o=d=>O.filter(u=>u.workspace===d).sort((u,p)=>(u.lesson??0)-(p.lesson??0)).map(u=>u.id),r=ie.find(n),l=r&&t[r]==="tried"?"你试过这一课，还没确认独立解释；":"";return{path:r===void 0?void 0:{id:r,reason:`${l}${(C[r]??[]).length?`它的先修（${C[r].map(I).join("、")}）你都确认过了`:"没有先修，可以直接开始"}`},shader:o("shader").filter(d=>n(d)&&h(d)&&d!==r),raster:o("raster").filter(d=>n(d)&&h(d)&&d!==r)}}function Y(t){const[n,h]=i.useState({status:{},loaded:!1,failed:!1});return i.useEffect(()=>{let o=!0;const r=O.filter(l=>l.workspace);return Promise.allSettled(r.map(l=>ue(t,l.id,l.version))).then(l=>{if(!o)return;const d={};let u=!1;l.forEach((p,m)=>{p.status==="rejected"&&(u=!0),d[r[m].id]=Ae(p.status==="fulfilled"?p.value:void 0)}),h({status:d,loaded:!0,failed:u})}),()=>{o=!1}},[t]),n}const ee=O.find(t=>t.id==="shader-uv"),te=()=>{};function Ie(){let t=-1;try{t=Number(localStorage.getItem("hive-shader-exhibit")??-1)}catch{}return(!Number.isInteger(t)||t<0||t>=w.length)&&(t=-1),t<0?Math.floor(Math.random()*w.length):oe(w.length,t)}const ae=20,se=[{label:"原色",hue:0,color:"#f4f1ea"},{label:"金色",hue:-1.05,color:"#ffb347"},{label:"绿色",hue:2.1,color:"#5fe39a"},{label:"青色",hue:3.14,color:"#4fd5ff"},{label:"蓝紫",hue:4.19,color:"#8a7dff"},{label:"品红",hue:5.24,color:"#ff5da2"}];function Me(){const[t,n]=i.useState(Ie),[h,o]=i.useState(),[r,l]=i.useState(!1),[d,u]=i.useState(0),[p,m]=i.useState(1),[b,v]=i.useState(1),[c,x]=i.useState(!0),[N,A]=i.useState(!1),[R,S]=i.useState(!1),[E,j]=i.useState(()=>!matchMedia("(prefers-reduced-motion: reduce)").matches),k=i.useRef(null),B=q(),U=Y(B.user?.id??"guest");i.useEffect(()=>{try{localStorage.setItem("hive-shader-exhibit",String(t))}catch{}},[t]),i.useEffect(()=>{const s=k.current;if(!s||!("IntersectionObserver"in window))return;const a=new IntersectionObserver(([y])=>x(y.isIntersecting),{threshold:.05});return a.observe(s),()=>a.disconnect()},[]),i.useEffect(()=>{if(!r)return;const s=requestAnimationFrame(()=>{const a=k.current?.querySelector("textarea.source-editor");if(!a)return;const y=a.value.split(`
`).findIndex(g=>g.includes("// EXHIBIT:"));a.scrollTop=Math.max(0,y)*(parseFloat(getComputedStyle(a).lineHeight)||20)});return()=>cancelAnimationFrame(s)},[r,t]);const M=E&&c,f=w[t],$=s=>{n(s),o(void 0),S(!0),setTimeout(()=>S(!1),500);try{localStorage.setItem("hive-shader-exhibit",String(s))}catch{}};i.useEffect(()=>{if(!M||r)return;const s=setTimeout(()=>$((t+1)%w.length),ae*1e3);return()=>clearTimeout(s)},[M,r,t]);const T=i.useMemo(()=>({...pe(ee),resolution:420,scene:"plane",mouseX:.5,mouseY:.5}),[]),z=i.useMemo(()=>({hue:se[d].hue,gain:p,speed:b}),[d,p,b]),P=i.useMemo(()=>{const s=ke(t);return{...s,fragment:h??s.fragment}},[t,h]);return e.jsxs("section",{ref:k,className:`effect-gallery immersive${r?" is-editing":""}`,"data-tone":f.tone,"aria-label":"Shader 灵感展厅",onPointerMove:s=>{const a=s.currentTarget.getBoundingClientRect();s.currentTarget.style.setProperty("--spot-x",`${s.clientX-a.left}px`),s.currentTarget.style.setProperty("--spot-y",`${s.clientY-a.top}px`)},onPointerDown:()=>A(!0),children:[e.jsx("div",{className:`exhibit-canvas stage${R?" switching":""}`,children:e.jsx(ge,{lab:ee,params:T,code:P,onFrame:te,onDiagnostic:te,readOnly:!0,autoPlay:M,interactive:!0,fill:!0,tune:z})}),e.jsx("div",{className:"stage-veil","aria-hidden":"true"}),e.jsxs("div",{className:"exhibit-copy",children:[e.jsxs("span",{className:"eyebrow",children:["SHADERLAB / INSPIRATION ",String(t+1).padStart(2,"0")]}),e.jsxs("h1",{children:["让下一束光",e.jsx("br",{}),"出自你的代码。"]}),e.jsx("h2",{children:f.title}),e.jsxs("p",{children:[f.caption,"。"]}),e.jsx("div",{className:"mechanism-tags",children:f.tags.map(s=>e.jsx("span",{children:s},s))}),e.jsxs("div",{className:"toolbar",children:[e.jsx("button",{className:"primary",onClick:()=>l(s=>!s),children:r?"收起源码":"改写这个效果"}),e.jsx(L,{to:`/experiment/${f.lesson}`,children:"从机制开始拆解 ↗"})]}),e.jsx("p",{className:"exhibit-note",children:"原创参考展品 · 先改出自己的变化，再逐步学会从零构造。"}),e.jsxs("div",{className:"anatomy",children:[e.jsx("span",{className:"anatomy-label",children:"拆开看每一层"}),e.jsx("div",{className:"layer-chips",role:"group","aria-label":"层开关",children:f.layers.map(s=>{const a=Re(P.fragment,s.id);return e.jsx("button",{"aria-pressed":a===!0,disabled:a===void 0,title:`${s.what}（只改源码里的 #define ${s.id}）`,onClick:()=>o(Ce(P.fragment,s.id,!a)),children:s.label},s.id)})}),e.jsxs("details",{className:"anatomy-learn",children:[e.jsxs("summary",{children:["拆解它要先学的课 · 你已确认"," ",f.learn.filter(s=>["independent","variant"].includes(U.status[s])).length," ","/ ",f.learn.length]}),e.jsx("ul",{children:f.learn.map(s=>e.jsxs("li",{children:[e.jsx(L,{to:`/experiment/${s}`,children:I(s)}),e.jsx("small",{children:W[U.status[s]??"none"]})]},s))}),e.jsx("p",{children:"课程是建议，不是门槛：可以先学，也可以直接拆。"})]})]})]}),r&&e.jsxs("div",{className:"exhibit-editor",children:[e.jsx(be,{label:"展品片元源码",value:P.fragment,onChange:o}),e.jsxs("div",{className:"toolbar",children:[e.jsx("button",{onClick:()=>o(void 0),children:"恢复展品源码"}),e.jsx("button",{onClick:()=>fe(`${f.id}.frag`,P.fragment),children:"下载我的 Shader"})]}),e.jsx("p",{children:"这份草稿留在当前展厅会话；离开前可下载。课程里的草稿和实验记录独立保存。"})]}),e.jsxs("div",{className:"stage-dock",children:[e.jsx("div",{className:"exhibit-dots","aria-label":"选择展品",children:w.map((s,a)=>e.jsxs("button",{"aria-label":`展品：${s.title}`,"aria-pressed":t===a,className:t===a&&M&&!r?"auto":"",style:{"--auto":`${ae}s`},onClick:()=>$(a),children:[e.jsx("span",{children:String(a+1).padStart(2,"0")}),e.jsx("b",{children:s.title})]},s.id))}),e.jsxs("div",{className:"stage-controls",role:"group","aria-label":"光场控制",children:[e.jsx("div",{className:"swatches",children:se.map((s,a)=>e.jsx("button",{className:"swatch","aria-label":`色调：${s.label}`,"aria-pressed":d===a,style:{"--swatch":s.color},onClick:()=>u(a)},s.label))}),e.jsxs("label",{children:["强度",e.jsx("input",{type:"range",min:.5,max:1.8,step:.05,value:p,"aria-label":"光强",onChange:s=>m(Number(s.target.value))})]}),e.jsxs("label",{children:["速度",e.jsx("input",{type:"range",min:0,max:2.5,step:.1,value:b,"aria-label":"流动速度",onChange:s=>v(Number(s.target.value))})]}),e.jsx("button",{onClick:()=>$(oe(w.length,t)),children:"换一束光 ↻"}),e.jsx("button",{onClick:()=>j(s=>!s),children:E?"暂停光场":"播放光场"})]}),e.jsx("span",{className:`stage-hint${N?" is-quiet":""}`,children:"移动 搅动 · 点击 激荡 · 拖动 转动视角"})]})]})}const G=48,F=new Map;function $e(t){const n=i.useMemo(()=>ye(t),[t.installed,t.distance,t.scene,t.lod]),o=je(t.installed).includes("shading")?t.color:void 0,r=JSON.stringify([n,o,t.angle]),[l,d]=i.useState(()=>F.get(r)??[]);return i.useEffect(()=>{const u=F.get(r);if(u){d(u);return}d([]);const p=[],m=new Worker(new URL("/labs/assets/raster.worker-D-t5nk60.js",import.meta.url),{type:"module"}),b=v=>m.postMessage({token:v,params:{...n,angle:(t.angle+v*360/G+540)%360-180},expressions:o});return m.onmessage=v=>{if(v.data.error)return m.terminate();p[v.data.token]=v.data.result,d(p.slice()),p.length<G?b(p.length):(F.set(r,p),F.size>3&&F.delete(F.keys().next().value),m.terminate())},m.onerror=()=>m.terminate(),b(0),()=>m.terminate()},[r]),l}function ze(){const t=q();return e.jsx(De,{owner:t.user?.id??"guest"},t.user?.id??"guest")}function Fe(){let t=-1;try{t=Number(localStorage.getItem("hive-render-exhibit")??-1)}catch{}return(!Number.isInteger(t)||t<0||t>=3)&&(t=-1),t<0?Math.floor(Math.random()*3):(t+1+Math.floor(Math.random()*2))%3}const re=[{stage:0,label:"投影顶点"},{stage:1,label:"三角形边界"},{stage:2,label:"覆盖次数"},{stage:3,label:"深度缓冲"},{stage:4,label:"插值 UV"},{stage:5,label:"插值法线"}],Oe=["棱光工坊","琥珀之城","模型之屋"],Ue=6;function De({owner:t}){const[n,h]=i.useState(Fe),[o,r]=i.useState(!1),[l,d]=i.useState(1),[u,p]=i.useState(()=>!matchMedia("(prefers-reduced-motion: reduce)").matches),[m,b]=i.useState(0),[v,c]=i.useState(!0),[x,N]=i.useState(!1),A=i.useRef(null),R=i.useRef(null),S=i.useRef(null),E=i.useRef(null),j=i.useRef(null),k=i.useRef(0);i.useEffect(()=>{try{localStorage.setItem("hive-render-exhibit",String(n))}catch{}},[n]),i.useEffect(()=>{const a=()=>{document.hidden&&p(!1)};return addEventListener("visibilitychange",a),()=>removeEventListener("visibilitychange",a)},[]),i.useEffect(()=>{const a=A.current;if(!a||!("IntersectionObserver"in window))return;const y=new IntersectionObserver(([g])=>c(g.isIntersecting),{threshold:.05});return y.observe(a),()=>y.disconnect()},[]);const B=i.useMemo(()=>_e(n),[n]),U=$e(B),M=Le(t),f=U.length,$=f?(Math.round(m)%f+f)%f:0,T=U[$];i.useEffect(()=>{if(!u||o||!v||f<2)return;let a=0,y=performance.now();const g=_=>{const ce=Math.min(.1,(_-y)/1e3);y=_,!j.current&&_>k.current&&b(de=>(de+ce*Ue)%f),a=requestAnimationFrame(g)};return a=requestAnimationFrame(g),()=>cancelAnimationFrame(a)},[u,o,v,f>1]),i.useEffect(()=>{!T||!S.current||!E.current||(Z(S.current,T,6,{key:!0}),Z(E.current,T,l,{xray:!0}))},[T,l]);const z=(a,y)=>{const g=R.current;if(!g)return;const _=g.getBoundingClientRect();g.style.setProperty("--lx",`${a.clientX-_.left}px`),g.style.setProperty("--ly",`${a.clientY-_.top}px`),g.style.setProperty("--lr",`${(y??(a.buttons?.3:.18))*_.width}px`)},P=(B.angle+$*360/G+540)%360-180,s=T?.metrics;return e.jsxs("section",{ref:A,className:"effect-gallery immersive render-gallery","aria-label":"Renderer 成品展厅",children:[e.jsx("div",{className:"render-backdrop","aria-hidden":"true"}),e.jsxs("div",{ref:R,className:"render-stage",style:{touchAction:"pan-y"},onPointerEnter:a=>z(a),onPointerMove:a=>{j.current&&f&&(b(j.current.position-(a.clientX-j.current.x)/9),N(!0)),z(a)},onPointerDown:a=>{o||(j.current={x:a.clientX,position:m},a.currentTarget.setPointerCapture(a.pointerId),z(a))},onPointerUp:a=>{j.current=null,k.current=performance.now()+1500,z(a,.18)},onPointerCancel:()=>j.current=null,onPointerLeave:()=>R.current?.style.setProperty("--lr","0px"),children:[e.jsx("div",{className:"render-floor","aria-hidden":"true"}),o?e.jsx(we,{project:M.project,keyBackdrop:!0}):e.jsxs("div",{className:"raster-preview turntable",children:[e.jsxs("div",{className:"canvas-wrap",children:[e.jsx("canvas",{ref:S,"aria-label":"完整参考管线的 CPU 渲染画面"}),e.jsx("canvas",{ref:E,className:"lens-canvas","aria-hidden":"true"})]}),e.jsx("div",{className:"lens-ring","aria-hidden":"true",children:e.jsx("span",{children:re.find(a=>a.stage===l)?.label})}),e.jsx("p",{className:"render-metrics",children:s?`CPU 实测 · ${s.inputTriangles} 个输入三角形 · ${s.coveredSamples} 次覆盖 · ${s.depthPassed} 次深度通过`:"正在预渲染视角…"})]}),!o&&e.jsxs("svg",{className:"axis-gizmo",viewBox:"-40 -40 80 80","aria-hidden":"true",children:[[["X",0,"var(--bad)"],["Z",90,"var(--accent)"]].map(([a,y,g])=>{const _=(P+Number(y))*Math.PI/180;return e.jsxs("g",{stroke:String(g),fill:String(g),children:[e.jsx("line",{x1:"0",y1:"0",x2:Math.cos(_)*28,y2:Math.sin(_)*9,strokeWidth:"2"}),e.jsx("text",{x:Math.cos(_)*34,y:Math.sin(_)*11+3,fontSize:"9",stroke:"none",textAnchor:"middle",children:a})]},a)}),e.jsxs("g",{stroke:"var(--ok)",fill:"var(--ok)",children:[e.jsx("line",{x1:"0",y1:"0",x2:"0",y2:"-28",strokeWidth:"2"}),e.jsx("text",{x:"0",y:"-32",fontSize:"9",stroke:"none",textAnchor:"middle",children:"Y"})]})]})]}),e.jsx("div",{className:"stage-veil","aria-hidden":"true"}),e.jsxs("div",{className:"exhibit-copy",children:[e.jsx("span",{className:"eyebrow",children:"RENDERLAB / BUILD YOUR LIGHT"}),e.jsxs("h1",{children:["从一个顶点，",e.jsx("br",{}),"到你自己的渲染器。"]}),e.jsx("h2",{children:o?"我的 Renderer":Oe[n]}),e.jsx("p",{children:"把投影、覆盖、材质和阴影接成一条管线。眼前的成品，是同一套部件最后组合出的画面。"}),e.jsxs("div",{className:"mechanism-tags",children:[e.jsx("span",{children:"CPU 光栅化"}),e.jsx("span",{children:"双 Pass 阴影"}),e.jsx("span",{children:"SSAA + PCF"})]}),e.jsxs("div",{className:"toolbar",children:[e.jsx(L,{className:"primary",to:"/renderlab/build",children:"进入我的 Renderer 装配台 →"}),e.jsx("button",{onClick:()=>r(a=>!a),children:o?"看看参考成品":"看看我的进度"})]}),e.jsxs("p",{className:"exhibit-note",children:[o?"独立项目 · 在学习中不断组装和改进":"参考成品 · 不会自动安装到你的项目"," ","· 每个视角都由 CPU 渲染器实际计算"]})]}),e.jsxs("div",{className:"stage-dock",children:[!o&&e.jsx("div",{className:"exhibit-dots","aria-label":"透镜里的管线阶段",children:re.map(a=>e.jsxs("button",{"aria-pressed":l===a.stage,onClick:()=>d(a.stage),children:[e.jsx("span",{children:String(a.stage+1).padStart(2,"0")}),e.jsx("b",{children:a.label})]},a.stage))}),e.jsxs("div",{className:"stage-controls",role:"group","aria-label":"成品控制",children:[e.jsx("button",{onClick:()=>{const a=(n+1)%3;h(a),b(0),r(!1);try{localStorage.setItem("hive-render-exhibit",String(a))}catch{}},children:"换一个成品 ↻"}),e.jsx("button",{onClick:()=>p(a=>!a),children:u?"暂停巡游":"自动巡游"}),!o&&f<G&&e.jsxs("span",{children:["预渲染 ",f," / ",G]})]}),e.jsx("span",{className:`stage-hint${x?" is-quiet":""}`,children:"移动 透视管线 · 拖动 旋转 · 按住 放大透镜"})]})]})}const Ge=`### 第一段源码怎么读

GLSL ES 3.00 用于这里的 WebGL2；Unity 的 ShaderLab 是材质/Pass 的声明外壳，里面通常编写 HLSL。本专区名称与 Unity 语言名称相同，但浏览器不会编译 Unity 的 ShaderLab 文件。

| 写法 | 含义 | 练习 |
|---|---|---|
| float x = 0.5; | 一个浮点值，语句以分号结束 | 将它写入红色通道 |
| vec2 uv; / vec3 color; | 二维/三维分量 | 用 uv.yx 交换两轴 |
| vec4(color, 1.0) | RGB 加 alpha | alpha 不自动打开混合 |
| uniform float u_time; | 一次 draw 共享的输入 | 比较固定 0 秒与 1 秒 |
| in vec2 v_uv; | 由顶点阶段输出后插值的输入 | 与屏幕像素坐标比较 |
| out vec4 outColor; | 当前片元颜色输出 | 不会修改其他片元 |
| texture(u_texture, uv) | 连续 UV 读取离散纹理 | 比较 nearest/linear |

顶点 Shader 输出 gl_Position，光栅化确定覆盖，片元 Shader 决定颜色，之后还有深度测试、混合与目标写入。代码语法正确只说明能够编译；不同坐标空间、错误采样或混合状态仍能产生错误结果。

### 最小练习

第一课中依次输出常量红色、UV 渐变、随固定时间变化的蓝色。每次只改一项。遇到诊断先检查类型、分号和括号，再检查公式；恢复成功帧之后才能保存本次观测。不要在片元中假设从左到右的执行顺序。

[The Book of Shaders：从颜色与向量开始](https://thebookofshaders.com/06/)`,qe=`### 数学准备

| 概念 | 定义 | 管线中的用途 |
|---|---|---|
| 向量差 b-a | 从 a 指向 b | 光源方向、相机方向 |
| 长度 sqrt(x²+y²+z²) | 向量大小 | 单位化前的分母 |
| 点积 ax*bx+ay*by+az*bz | 单位向量时等于夹角余弦 | 漫反射与投影 |
| 叉积 | 生成垂直于两向量的方向 | 相机基、面法线 |
| 归一化 v/length(v) | 保留方向，长度变 1 | 注意零向量不能直接除 |
| 矩阵乘向量 | 每一行和向量做点积 | 表达旋转、平移、投影 |
| 齐次位置 (x,y,z,1) | 平移会影响它 | 模型与相机变换 |
| 齐次方向 (x,y,z,0) | 平移不影响它 | 方向变换，法线另需逆转置 |

本课程固定列向量：P*V*M*p 从右到左执行。内存按列存放不意味着数学上可以交换矩阵顺序。角度控制为度，sin/cos 需要先转成弧度：degree*π/180。

### 编译准备

网页 CPU 实验直接可用。独立重建需要 C++20 编译器与 Python 3。下载源包，在解压根目录运行 README 中的命令；default 是参考实现，exercise 才会使用自己的 TODO。先实现单位矩阵和单个三角形，再进入模型、阴影与抗锯齿。

RenderLab 展示真实 CPU 算法，中间缓冲帮助解释 GPU 管线。GPU API 的资源、状态和提交还需继续做实际 WebGL 实验与 Unity Frame Debugger 对照。

[LearnOpenGL：坐标空间](https://learnopengl.com/Getting-started/Coordinate-Systems)`;function Be({kind:t}){return e.jsx("section",{className:"panel graphics-primer",children:e.jsxs("details",{children:[e.jsx("summary",{children:"开始之前：零基础准备与最小练习"}),e.jsx(Ne,{remarkPlugins:[Se],children:t==="shader"?Ge:qe})]})})}function He(){return e.jsxs("section",{className:"dual-path","aria-label":"双线路径",children:[e.jsx("h2",{children:"两条线一起学"}),e.jsx("p",{children:"ShaderLab 和 RenderLab 讲的是同一条管线的两面。按这个顺序交替学，相关的概念会挨在一起出现；每个实验室自己的先后顺序不变。你也可以只走一条线。"}),e.jsx("ol",{children:ie.map(t=>{const n=O.find(h=>h.id===t);return e.jsx("li",{"data-lab":n.workspace==="shader"?"shader":"render",children:e.jsx(L,{to:`/experiment/${t}`,children:I(t)})},t)})})]})}function We(){const t=q(),n=t.user?.id??"guest",h=Y(n),o=me(n);if(!h.loaded)return null;const r=Pe(h.status),l=[["ShaderLab",r.shader],["RenderLab",r.raster]];return e.jsxs("section",{className:"next-steps","aria-label":"下一步建议",children:[e.jsx("h2",{children:"下一步建议"}),o.due.length>0&&e.jsxs("p",{className:"next-review",children:["先做到期的复习：",o.due.length," 项，见上方「该复习了」。"]}),r.path?e.jsxs("div",{className:"next-pick",children:[e.jsxs(L,{to:`/experiment/${r.path.id}`,children:[I(r.path.id)," →"]}),e.jsxs("p",{children:["按双线路径的下一课。",r.path.reason]})]}):e.jsx("p",{children:"28 课你都已经确认过独立解释了。可以回头做复习，或去展厅拆解一件作品。"}),l.some(([,d])=>d.length>0)&&e.jsxs("div",{className:"next-ready",children:[e.jsx("h3",{children:"这些课现在也可以开始（先修都已确认）"}),e.jsx("ul",{children:l.map(([d,u])=>u.length?e.jsxs("li",{children:[e.jsx("span",{className:"tag",children:d}),e.jsxs("span",{children:[u.slice(0,4).map(p=>e.jsx(L,{to:`/experiment/${p}`,children:I(p).replace(/^[A-Za-z]+ /,"")},p)),u.length>4&&e.jsxs("em",{children:["还有 ",u.length-4," 课"]})]})]},d):null)})]}),e.jsx("small",{children:"建议只依据你自己在课程里确认过的状态和下面的先修图；你可以忽略它，直接去任何一课。"})]})}const H=150,D=42,ne=46,V=14,X={none:"○",tried:"◐",independent:"●",variant:"★"};function Ve({kind:t}){const n=q(),h=Y(n.user?.id??"guest"),o=O.filter(c=>c.workspace===t).sort((c,x)=>(c.lesson??0)-(x.lesson??0)),r=o.map(c=>c.id),l=Te(r),d={},u={};for(const c of r)d[c]=u[l[c]]=(u[l[c]]??-1)+1;const p=Math.max(...Object.values(l))+1,m=(Math.max(...Object.values(u))+1)*(D+V)-V,b=p*H+(p-1)*ne,v=c=>({x:l[c]*(H+ne),y:d[c]*(D+V)});return e.jsxs("section",{className:"lesson-map","aria-label":"先修关系图",children:[e.jsx("h2",{children:"学习地图"}),e.jsx("p",{children:"线表示「建议先学」，不是锁：你可以直接进入任何一课。颜色来自你自己确认过的记录，页面不会替你判断掌握。"}),e.jsx("div",{className:"map-scroll",children:e.jsxs("div",{className:"map-canvas",style:{width:b,height:m},children:[e.jsx("svg",{width:b,height:m,"aria-hidden":"true",children:r.flatMap(c=>(C[c]??[]).filter(x=>r.includes(x)).map(x=>{const N=v(x),A=v(c),R=N.x+H,S=N.y+D/2,E=A.x,j=A.y+D/2,k=(R+E)/2;return e.jsx("path",{d:`M${R} ${S} C${k} ${S} ${k} ${j} ${E} ${j}`},`${x}>${c}`)}))}),o.map(c=>{const x=h.status[c.id]??"none",N=v(c.id);return e.jsxs(L,{to:`/experiment/${c.id}`,className:`map-node status-${x}`,style:{left:N.x,top:N.y,width:H,height:D},"aria-label":`${I(c.id)}，${W[x]}，起点：${K[J[c.id].level]}`,title:`${c.title}
${W[x]}
起点：${K[J[c.id].level]}${(C[c.id]??[]).length?`
建议先学：${C[c.id].map(I).join("、")}`:""}`,children:[e.jsx("b",{children:X[x]}),e.jsxs("span",{children:[c.lesson," · ",c.title.split(/[：:]/)[0]]})]},c.id)})]})}),e.jsxs("p",{className:"map-legend",children:[Object.keys(X).map(c=>e.jsxs("span",{children:[X[c]," ",W[c]]},c)),h.failed&&e.jsx("span",{role:"alert",children:"部分记录没能读取，进度可能不完整"})]})]})}function tt({kind:t}){const n=q(),h=O.filter(l=>l.workspace===t).sort((l,d)=>(l.lesson??0)-(d.lesson??0)),o=ve(n.user?.id??"guest"),r=h.find(l=>l.id===o);return e.jsxs("main",{id:"main-content",tabIndex:-1,className:"graphics-home","data-lab":t==="shader"?"shader":"render",children:[t==="shader"?e.jsx(Me,{}):e.jsx(ze,{}),e.jsxs("div",{className:"graphics-home-body",children:[e.jsxs("div",{className:"breadcrumb",children:[e.jsx(L,{to:"/",children:"概念实验室"})," /"," ",t==="shader"?"ShaderLab":"RenderLab"]}),e.jsxs("section",{className:"hero graphics-course-intro",children:[e.jsx("div",{className:"eyebrow",children:t==="shader"?"WRITE LIGHT, SHAPE AND MOTION":"FOLLOW A TRIANGLE TO THE SCREEN"}),e.jsx("h2",{children:t==="shader"?"ShaderLab 学习路径":"RenderLab 装配路径"}),e.jsx("p",{children:t==="shader"?"从喜欢的画面出发，边改代码边看效果。固定版本做 A/B 对照，再独立复现、迁移到 Unity。":"每一课都给同一台 Renderer 接入一个部件；边看画面边检查管线，再用 C++ 独立重建。"}),e.jsx(L,{className:"primary",to:`/experiment/${r?.id??h[0].id}`,children:r?`继续：${r.title}`:t==="shader"?"打开实时创作台 →":"打开管线检查台 →"}),e.jsxs("p",{children:[h.length," 个实验 · 8 节基础 + 6 节应用 · 两个阶段项目 · 掌握状态由本人确认"]})]}),e.jsx("div",{className:"workflow",children:t==="shader"?"看效果 → 改代码 → 实时对照 → 拆解原理 → 独立复现 → Unity 迁移":"看成品 → 接部件 → 查像素 → 改算法 → 联调同一台 Renderer → C++ 重建"}),e.jsx(Be,{kind:t}),e.jsx(xe,{}),e.jsx(We,{}),e.jsx(Ve,{kind:t}),e.jsx(He,{}),e.jsx("section",{className:"cards",children:h.map(l=>e.jsxs(L,{className:"card",to:`/experiment/${l.id}`,children:[e.jsxs("span",{className:"eyebrow",children:["LESSON ",String(l.lesson).padStart(2,"0"),l.lesson===8||l.lesson===14?" / PROJECT":(l.lesson??0)>8?" / APPLICATION":" / FOUNDATION"]}),e.jsx("h2",{children:l.title}),e.jsx("p",{children:l.intro}),e.jsx("small",{children:l.prerequisites.length?"建议完成上一课":"可以直接开始"}),e.jsx("span",{className:"arrow",children:"打开工作台 ↗"})]},l.id))}),e.jsxs("section",{className:"panel",children:[e.jsx("h2",{children:"从这里继续"}),e.jsx("p",{children:t==="shader"?"已覆盖法线贴图、透明、多 Pass、PBR 入门和 URP 实战；后续可选 IBL、Ray Marching 与反馈模拟。":"已覆盖 OBJ、剔除、显式 LOD、SSAA 和 PCF；后续可选自动 LOD、透明排序、级联、PBR 与路径追踪。"}),e.jsx("a",{href:t==="shader"?"https://radiant-shaders.com/learn":"https://www.pbr-book.org/",target:"_blank",rel:"noreferrer",children:"进阶参考资料 ↗"}),e.jsx("p",{children:e.jsxs(L,{to:t==="shader"?"/renderlab":"/shaderlab",children:["连接到 ",t==="shader"?"RenderLab":"ShaderLab"," →"]})})]})]})]})}export{tt as GraphicsHome};
