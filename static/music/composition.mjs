// Original score/live-code work model; no code from Strudel executes in this origin.
export const DEFAULT_ABC = `X:1
T:窗边的小练习
M:4/4
L:1/4
Q:1/4=80
K:C
C D E G | A G E D | "F"F A G E | "G7"D2 "C"C2 |]
`;
export const LIVE_PRESETS = [
 {id:'pulse',title:'01 · 一个会呼吸的节奏',code:'// 每个循环四拍；修改方括号内的节奏后按 play / update\nsetcpm(90/4)\ns("bd [~ sd] hh*4 [sd hh]").bank("RolandTR909")',hint:'~ 是休止，*4 是重复四次，[ ] 将一拍分成更小的格子。'},
 {id:'arpeggio',title:'02 · 音阶与琶音',code:'setcpm(80/4)\nn("0 2 4 7 4 2 1 3").scale("C4:major")\n  .s("triangle").gain(0.35).room(0.25)',hint:'n 中的数字是音阶级数，从 0 开始。试着把 major 改为 minor。'},
 {id:'jazz',title:'03 · 爵士 ii–V–I',code:'// 每个循环换一个和弦：Dm7 → G7 → Cmaj7\nsetcpm(72/4)\nnote("<[d3,f3,a3,c4] [g2,b2,d3,f3] [c3,e3,g3,b3] [c3,e3,g3,b3]>")\n  .s("triangle").gain(0.25).room(0.3)',hint:'逗号使音符同时发声，尖括号让和弦逐个循环切换。先听导向音，再改变声部位置。'},
 {id:'layers',title:'04 · 低音与旋律叠层',code:'setcpm(96/4)\nstack(\n  note("<c2 a1 f2 g1>").s("sawtooth").lpf(400).gain(0.2),\n  n("0 2 4 6 4 2 1 3").scale("C4:major").s("triangle").gain(0.3)\n)',hint:'stack 将独立声部叠在一起；先单独试听每层，再调整音量与音域。'}
];
export const SCORE_PRESETS = [
 {id:'melody',title:'旋律 · 从四小节开始',abc:DEFAULT_ABC},
 {id:'piano',title:'钢琴 · 双手独立声部',abc:`X:1
T:双手对话
%%score { RH LH }
M:4/4
L:1/4
Q:1/4=72
K:C
V:RH clef=treble name="右手"
C E G c | B G D2 | A F E D | C4 |]
V:LH clef=bass name="左手"
C, G, E, G, | G,, D, B,, D, | F,, C, A,, C, | C,4 |]
`},
 {id:'jazz',title:'爵士 · ii–V–I 和弦谱',abc:`X:1
T:ii–V–I · 导向音
%%score { RH LH }
M:4/4
L:1/4
Q:1/4=72
K:C
V:RH clef=treble name="右手"
"Dm7"[Fc]4 | "G7"[FB]4 | "Cmaj7"[EB]4 | [EB]4 |]
V:LH clef=bass name="左手"
D,4 | G,,4 | C,4 | C,4 |]
`},
 {id:'rhythm',title:'节奏 · 附点、三连音与反复',abc:`X:1
T:跳动的小圆舞
M:3/4
L:1/8
Q:1/4=84
K:G
|: G2 B2 d2 | e3 d B2 | (3ABc d2 z2 |1 B2 A2 G2 :|2 A2 F2 G2 |]
`}
];
export const MAX_SOURCE=40000,MAX_WORKS=20;
export const freshCreative=()=>({abc:DEFAULT_ABC,live:LIVE_PRESETS[0].code,title:'我的编曲',works:[]});
export function validateCreative(raw){
 const c=freshCreative();if(!raw||typeof raw!=='object'||Array.isArray(raw))return c;
 for(const key of ['abc','live','title'])if(typeof raw[key]==='string')c[key]=raw[key].slice(0,key==='title'?100:MAX_SOURCE);
 const seen=new Set();
 c.works=(Array.isArray(raw.works)?raw.works:[]).filter(w=>w&&['score','live'].includes(w.kind)&&typeof w.id==='string'&&/^[a-zA-Z0-9-]{1,70}$/.test(w.id)&&!seen.has(w.id)&&seen.add(w.id)&&typeof w.source==='string'&&typeof w.title==='string').slice(0,MAX_WORKS).map(w=>({id:w.id,kind:w.kind,title:w.title.slice(0,100),source:w.source.slice(0,MAX_SOURCE),at:Number.isFinite(w.at)?Math.max(0,Math.min(8640000000000000,w.at)):0}));return c;
}
export function abcPitch(midi,spelling){
 let letter,octave,mark='';const match=spelling?.match(/^([A-G])(♯|♭|𝄫|𝄪)?(-?\d+)$/u);
 if(match){letter=match[1];octave=+match[3];mark={'♯':'^','♭':'_','𝄫':'__','𝄪':'^^'}[match[2]]||'=';}
 else {const names=['C','^C','D','^D','E','F','^F','G','^G','A','^A','B'];const value=names[((midi%12)+12)%12];letter=value.at(-1);mark=value.length>1?'^':'=';octave=Math.floor(midi/12)-1;}
 return mark+(octave>=5?letter.toLowerCase()+"'".repeat(Math.max(0,octave-5)):letter+','.repeat(Math.max(0,4-octave)));
}
export function abcDuration(beats){
 if(!Number.isFinite(beats)||beats<=0||beats>64)throw Error('时值必须为正数，且不超过 64 拍。');
 if(beats===1)return '';const denominator=192,numerator=Math.round(beats*denominator);let a=numerator,b=denominator;while(b)[a,b]=[b,a%b];return denominator/a===1?String(numerator/a):`${numerator/a}/${denominator/a}`;
}
export function insertToken({letter='C',octave=4,accidental='',beats=1,kind='note'}={}){
 if(kind==='bar')return ' | ';if(kind==='rest')return `z${abcDuration(beats)} `;
 if(!/^[A-G]$/.test(letter)||!['','^','_','=','^^','__'].includes(accidental)||!Number.isInteger(octave)||octave<1||octave>7)throw Error('音符参数无效。');
 const note=accidental+(octave>=5?letter.toLowerCase()+"'".repeat(octave-5):letter+','.repeat(4-octave));return note+abcDuration(beats)+' ';
}
export function eventsToABC(events,title='和弦练习',bpm=72){
 if(!events?.length)return DEFAULT_ABC;
 const handNotes=(e,hand)=>e[hand] || e.notes.filter(n=>hand==='left'?n<60:n>=60);
 const voices=[];
 for(const hand of ['right','left']){
  if(!events.some(e=>handNotes(e,hand).length))continue;
  let remaining=0,position=0;const tokens=[];
  for(const e of events){
   const notes=handNotes(e,hand);
   if(remaining>0){remaining-=e.beats;position+=e.beats;if(position%4===0)tokens.push('|');continue;}
   const duration=notes.length?Math.max(...notes.map(n=>e.durations?.[n]??e.beats)):e.beats;
   const pitch=notes.map(n=>abcPitch(n,e.spellings?.[n]));tokens.push((pitch.length>1?'['+pitch.join('')+']':pitch[0]||'z')+abcDuration(duration));
   remaining=duration-e.beats;position+=e.beats;if(position%4===0)tokens.push('|');
  }
  voices.push(`V:${hand} clef=${hand==='left'?'bass':'treble'} name="${hand==='left'?'左手':'右手'}"\n${tokens.join(' ')} |]`);
 }
 return `X:1\nT:${title.replace(/[\r\n]/g,' ')}\n%%score { ${voices.map(v=>v.match(/^V:(\w+)/)[1]).join(' ')} }\nM:4/4\nL:1/4\nQ:1/4=${bpm}\nK:C\n${voices.join('\n')}\n`;
}
export function audioTimeline(commands){
 const tempo=Number(commands.tempo)||120,unit=240/tempo;const notes=[];let skipped=0;
 for(const track of commands.tracks||[])for(const e of track)if(e.cmd==='note'){
  if(!Number.isInteger(e.pitch)||e.pitch<21||e.pitch>108||e.instrument===128){skipped++;continue;}
  if(!Number.isFinite(e.start)||!Number.isFinite(e.duration)||e.start<0||e.duration<=0)throw Error('乐谱含无效的播放时间。');
  notes.push({note:e.pitch,start:e.start*unit,duration:Math.max(.025,e.duration*unit-Math.max(0,e.gap||0)),velocity:Math.max(1,Math.min(127,e.volume||82)),startChar:e.startChar,endChar:e.endChar});
 }
 notes.sort((a,b)=>a.start-b.start);const duration=Math.max(0,Number(commands.totalDuration)*unit||0,...notes.map(n=>n.start+n.duration));
 if(notes.length>4000||duration>1200)throw Error('当前最多播放 4000 个音、20 分钟的单曲，请分段导入。');
 return {notes,duration,tempo,skipped};
}
export function strudelURL(source){
 if(typeof source!=='string'||source.length>MAX_SOURCE)throw Error('代码过长，请分成较短的作品。');
 const bytes=new TextEncoder().encode(source);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 return 'https://strudel.cc/#'+btoa(binary);
}
export function checkABC(source){
 if(!source.trim())throw Error('先输入音符，或载入一个示例。');if(source.length>MAX_SOURCE)throw Error('ABC 乐谱最多 40000 个字符，请分曲导入。');
 if(!/^K:/m.test(source))throw Error('缺少 K: 调号行，例如 K:C。');
 if((source.match(/^X:/gm)||[]).length>1)throw Error('请一次导入一首曲目（一个 X: 段落）。');
 // Text styling is allowed; embedded PostScript/HTML/JavaScript is not part of this editor.
 if(/^%%(?:beginps|beginsvg|beginhtml|include|abc-include)\b/im.test(source))throw Error('此编辑器不支持嵌入图形代码或外部 include 指令。');return source;
}
