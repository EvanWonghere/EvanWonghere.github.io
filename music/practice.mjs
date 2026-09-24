const row=(notes,hand='right',beats=1)=>notes.map(n=>({notes:Array.isArray(n)?n:[n],[hand]:Array.isArray(n)?n:[n],beats}));
const scale=[60,62,64,65,67,69,71,72,71,69,67,65,64,62,60];
const make=(id,title,level,hand,notes,fingers,detail,goalBpm=72)=>({id,title,level,hand,events:row(notes,hand),fingers,detail,goalBpm,target:'音高与时值稳定；手腕放松，换指不中断。'});
export const EXTRA_PIECES=[
 make('scale-left','C 大调 · 左手全音阶',2,'left',scale.map(n=>n-12),'5 4 3 2 1 3 2 1 2 3 1 2 3 4 5','左手一个八度往返 · 每音一拍'),
 {id:'parallel',title:'C 大调 · 双手同向',level:2,hand:'both',events:scale.map(n=>({notes:[n-12,n],left:[n-12],right:[n],beats:1})),fingers:'右 12312345 / 左 54321321；下行逆序',detail:'双手相距八度 · 换指位置不同 · 先分手，再合手',goalBpm:60,target:'左右手同时起音，转换处不重、不停。'},
 {id:'contrary',title:'C 大调 · 双手反向',level:3,hand:'both',events:[60,62,64,65,67,69,71,72].map((n,i)=>({notes:[[48,47,45,43,41,40,38,36][i],n],left:[[48,47,45,43,41,40,38,36][i]],right:[n],beats:1})),fingers:'左右手从拇指起：1 2 3 1 2 3 4 5',detail:'右手向上，左手向下 · 每音一拍',goalBpm:60,target:'不要被另一只手的运动带走，分别听清两个方向。'},
 make('scale-d','D 大调 · 两个升号',2,'right',[62,64,66,67,69,71,73,74],'1 2 3 1 2 3 4 5','F♯ 与 C♯ · 右手一个八度上行'),
 make('scale-f','F 大调 · 新的换指位置',2,'right',[65,67,69,70,72,74,76,77],'1 2 3 4 1 2 3 4','B♭ · 在第四指之后穿指'),
 make('minor-natural','A 自然小调 · 右手',2,'right',[57,59,60,62,64,65,67,69],'1 2 3 1 2 3 4 5','第 6、7 级保持自然小调音高'),
 make('minor-harmonic','A 和声小调 · 导音',3,'right',[57,59,60,62,64,65,68,69],'1 2 3 1 2 3 4 5','G♯ 指向 A；F–G♯ 为增二度，慢练'),
 make('chromatic','半音阶 · C 到 C',3,'right',[60,61,62,63,64,65,66,67,68,69,70,71,72],'1 3 1 3 1 2 3 1 3 1 3 1 2','黑键三指；E–F、B–C 用 1–2 衔接',60),
 {id:'alberti',title:'阿尔贝蒂低音 · 左手',level:3,hand:'left',events:row([48,55,52,55,48,55,52,55,53,60,57,60,55,62,59,62],'left',.5),fingers:'每组常用 5 1 3 1，按手型与位置调整',detail:'低–高–中–高 · 每音半拍 · 4/4 两小节',meter:4,goalBpm:60,target:'低音均匀而轻，拇指不突出，保持两拍一组的方向。'},
 {id:'held-melody',title:'长旋律与流动低音',level:3,hand:'both',events:Array.from({length:16},(_,i)=>{const left=[48,55,52,55][i%4],right=i%4===0?[64,65,67,60][i/4]:null;return{notes:[left,...(right?[right]:[])],left:[left],right:right?[right]:[],beats:.5,durations:{[left]:.5,...(right?{[right]:2}:{})}}}),fingers:'左 5 1 3 1；右手长音保持两拍，不跟着低音重弹',detail:'右手长音两拍，左手八分音符 · 可分手练习',meter:4,goalBpm:60,target:'右手持续歌唱，左手保持轻巧；用完整时值模式检查提前松键。'},
 make('arp-left','C 大三和弦琶音 · 左手',3,'left',[48,52,55,60,55,52,48],'5 3 2 1 2 3 5','左手一个八度 · 把手臂移动与指法结合'),
 {id:'cadence-four',title:'I–IV–V–I · 双手和声',level:3,hand:'both',events:[{left:[48],right:[60,64,67]},{left:[41],right:[60,65,69]},{left:[43],right:[59,62,67]},{left:[48],right:[60,64,67]}].map(e=>({...e,notes:[...e.left,...e.right],beats:4})),fingers:'左手低音；右手按配置选择舒适的 1–3–5 / 1–2–5',detail:'C 大调 · 每和弦四拍 · 保留共同音',meter:4,goalBpm:60,target:'先分手找位，再合手；最后一和弦保持满四拍。'},
 {id:'jazz-shell',title:'爵士 ii–V–I · 根音与导向音',level:4,hand:'both',events:[{left:[50],right:[65,72]},{left:[43],right:[65,71]},{left:[48],right:[64,71]},{left:[48],right:[64,71]}].map(e=>({...e,notes:[...e.left,...e.right],beats:4})),fingers:'右手两音间保持自然跨度，可用 1–5；左手根音',detail:'Dm7 → G7 → Cmaj7 → Cmaj7 · 先听 F/C、F/B、E/B',meter:4,goalBpm:72,target:'导向音平稳半音移动；能说出每个音是三音还是七音。'},
 {id:'jazz-rootless',title:'爵士 ii–V–I · 无根音配置',level:4,hand:'right',events:row([[65,69,72,76],[65,69,71,76],[64,67,71,74],[64,67,71,74]],'right',4),fingers:'根据手型分配四音；跨距过大时分手，不强行拉伸',detail:'Dm9 → G13 → Cmaj9 · 不包含根音 · 独立练右手配置',meter:4,goalBpm:60,target:'先在工坊听带低音版本，再练无根音；保持三音、七音和色彩音清楚。'}
];
// Public-domain theme, arranged here for beginner practice; not a facsimile of the original score.
const ode=[64,64,65,67,67,65,64,62,60,60,62,64,64,62,62,64,64,65,67,67,65,64,62,60,60,62,64,62,60,60];
const odeBeats=ode.map(()=>1);for(const i of [12,27])odeBeats[i]=1.5;for(const i of [13,28])odeBeats[i]=.5;for(const i of [14,29])odeBeats[i]=2;
EXTRA_PIECES.push({id:'ode-theme',title:'欢乐颂主题 · 教学简编',level:2,hand:'right',events:ode.map((n,i)=>({notes:[n],right:[n],beats:odeBeats[i]})),fingers:'C 位五指：C1 D2 E3 F4 G5；先读节奏，不依赖逐音提示',detail:'贝多芬公共领域主题 · 本站单旋律教学简编 · 4/4 八小节',meter:4,goalBpm:80,target:'附点末句与长音准确；以两小节为单位形成呼吸。'});
// More practice: two more scales, a two-octave arpeggio, accompaniment patterns and two public-domain
// themes arranged here for teaching (single-line or simple two-hand versions, not facsimiles).
const duo=(pairs,beats=1)=>pairs.map(([left,right,b])=>({notes:[...left,...right],left,right,beats:b??beats}));
EXTRA_PIECES.push(
 {id:'scale-a-melodic',title:'A 旋律小调 · 上行升六七、下行还原',level:3,hand:'right',events:row([57,59,60,62,64,66,68,69,67,65,64,62,60,59,57],'right'),fingers:'1 2 3 1 2 3 4 5 / 5 4 3 2 1 3 2 1',detail:'上行 F♯、G♯，下行 G、F · 每音一拍',goalBpm:60,target:'上下行的第 6、7 级不同，先唱再弹。'},
 make('scale-bflat','B♭ 大调 · 从四指开始',3,'right',[70,72,74,75,77,79,81,82],'4 1 2 3 1 2 3 4','B♭ 与 E♭ · 右手第四指落在 B♭，拇指在 C 与 F',60),
 make('arp-two-octave','C 大三和弦 · 两个八度琶音',3,'right',[60,64,67,72,76,79,84,79,76,72,67,64,60],'1 2 3 1 2 3 5 3 2 1 3 2 1','拇指在第二个 C 下穿 · 手臂带动横移，不跳手',60),
 {id:'waltz-left',title:'圆舞曲伴奏 · 左手“嘭–恰–恰”',level:3,hand:'left',events:row([48,[52,55],[52,55],43,[53,59],[53,59],48,[52,55],[52,55],43,[53,59],[53,59]],'left'),fingers:'低音 5，和弦 2 1 / 3 1',detail:'3/4 · C–G7–C–G7 · 第一拍低音，二三拍轻',meter:3,goalBpm:72,target:'第一拍低音清楚，二三拍和弦轻而短。'},
 {id:'pop-comp',title:'流行四和弦 · 双手伴奏',level:3,hand:'both',events:duo([[[48],[64,67,72],2],[[48],[64,67,72],2],[[43],[62,67,71],2],[[43],[62,67,71],2],[[45],[64,69,72],2],[[45],[64,69,72],2],[[41],[65,69,72],2],[[41],[65,69,72],2]]),fingers:'左手根音 5；右手就近配置，尽量保留共同音',detail:'C–G–Am–F · 每和弦两次、每次两拍 · 右手换和弦只移动少数手指',goalBpm:72,target:'换和弦不断音，右手保留共同音 C 与 G。'},
 {id:'blues-bass',title:'布鲁斯走动低音 · 左手',level:4,hand:'left',events:row([48,52,55,57,58,57,55,52,53,57,60,62,63,62,60,57],'left',.5),fingers:'5 3 2 1 1 1 2 3 / 按手型调整',detail:'C7 与 F7 各一小节 · C E G A B♭ A G E · 八分音符',meter:4,goalBpm:80,target:'八分音符均匀，B♭ 与 E♭ 清楚。'},
 {id:'twinkle-duo',title:'小星星 · 双手简编',level:2,hand:'both',events:duo([[[48],[60]],[[],[60]],[[48],[67]],[[],[67]],[[53],[69]],[[],[69]],[[48],[67],2],[[53],[65]],[[],[65]],[[48],[64]],[[],[64]],[[43],[62]],[[],[62]],[[48],[60],2]]),fingers:'右手 C 位：C1 G5 A5…；左手 5 与 2 交替',detail:'公共领域童谣旋律 · 左手在每两拍的开头弹低音',goalBpm:72,target:'左手低音与右手旋律同时落下，旋律更突出。'},
 {id:'minuet-g',title:'G 大调小步舞曲 · 主题前八小节',level:3,hand:'right',events:[[74,1],[67,.5],[69,.5],[71,.5],[72,.5],[74,1],[67,1],[67,1],[76,1],[72,.5],[74,.5],[76,.5],[78,.5],[79,1],[67,1],[67,1],[72,1],[74,.5],[72,.5],[71,.5],[69,.5],[71,1],[72,.5],[71,.5],[69,.5],[67,.5],[66,1],[67,.5],[69,.5],[71,.5],[67,.5],[69,3]].map(([n,b])=>({notes:[n],right:[n],beats:b})),fingers:'开头 D 用 5 指；八分音符连贯，四分音符稍分开',detail:'3/4 · 传为佩措尔德作（旧归于巴赫，BWV Anh. 114）· 公共领域旋律，本站单旋律教学简编',meter:3,goalBpm:80,target:'每小节第一拍略重，八分音符均匀；第 8 小节保持满三拍。'}
);
export const PIANO_LEVELS=[{id:1,name:'预备 · 音位与五指',goal:'左右手分别准确、均匀地弹五指；认识基本谱号与时值。',book:'配合《拜厄》Op.101 开头的读谱、单手与双手基础练习。'},{id:2,name:'基础 · 音阶与短曲',goal:'C/G/D/F 大调单手音阶、C 调双手同向，读出完整乐句。',book:'配合《拜厄》的五指扩展、换位与双手练习；按原谱逐项检查指法与奏法。'},{id:3,name:'发展 · 织体与控制',goal:'反向音阶、琶音、左手伴奏与右手长音，建立声部层次。',book:'基本动作稳定后，配合《布格缪勒》Op.100 的初级练习曲，重视表情与乐句。'},{id:4,name:'和声 · 古典与爵士',goal:'终止、七和弦、ii–V–I 与导向音，逐步进入十二调和配置变化。',book:'配合书架中的乐理教材和 Jazz Chord Voicings；先骨架，再色彩与伴奏节奏。'}];
export function preparePiece(piece,{hand='both',from=1,to=Infinity,repeats=1}={}) {
    if(!piece)return null;
    const start=Math.max(0,Math.min(piece.events.length-1,from-1)),end=Math.max(start+1,Math.min(piece.events.length,to));
    let events=piece.events.slice(start,end).map(e=>{
        const fallback=piece.hand||(['left','scale-left','arp-left','alberti'].includes(piece.id)?'left':['both','cadence-four','jazz-shell','held-melody','parallel','contrary'].includes(piece.id)?'both':'right');
        const left=e.left || (fallback==='left'?e.notes:fallback==='both'?e.notes.filter(n=>n<60):[]);
        const right=e.right || (fallback==='right'?e.notes:fallback==='both'?e.notes.filter(n=>n>=60):[]);
        return {...e,left,right,notes:hand==='both'?e.notes:hand==='left'?left:right};
    });
    // Preserve the timeline, distinguish sustained notes from rests, and trim holds at loop boundaries.
    const total=events.reduce((sum,e)=>sum+e.beats,0);let elapsed=0,heldUntil=0;
    events=events.map(e=>{
        const sustain=!e.notes.length && heldUntil>elapsed;
        const durations=Object.fromEntries(e.notes.map(n=>[n,Math.min(e.durations?.[n]??e.beats,total-elapsed)]));
        for(const duration of Object.values(durations))heldUntil=Math.max(heldUntil,elapsed+duration);
        elapsed+=e.beats;return {...e,durations,sustain};
    });
    events=Array.from({length:Math.max(1,Math.min(4,repeats))},()=>events).flat();
    const variant=hand!=='both'||start!==0||end!==piece.events.length||repeats!==1;
    return {...piece,id:variant?`${piece.id}--${hand}-${start+1}-${end}-${repeats}`:piece.id,baseId:piece.id,events,selection:{hand,from:start+1,to:end,repeats}};
}
export class PracticeJudge {
    constructor(events,{mode='wait',bpm=72,start=0,duration=false}={}) {
        this.events=events;this.mode=mode;this.beatMs=60000/bpm;this.start=start;this.duration=duration;this.index=0;this.errors=0;this.hits=new Map();this.held=new Map();this.lengths=[];this.offsets=[];this.hit=new Set();let beat=0;
        this.positions=events.map(e=>{const p=beat;beat+=e.beats;return p;});this.totalBeats=beat;this.totalNotes=events.reduce((n,e)=>n+e.notes.length,0);
        this.advance();
    }
    advance(){while(this.index<this.events.length && this.events[this.index].notes.every(n=>this.hits.get(`${this.index}:${n}`))){this.hit.add(this.index);this.index++;}}
    noteOn(token,note,now){
        const elapsed=(now-this.start)/this.beatMs;
        const index=this.mode==='wait'?this.index:this.events.findIndex((e,i)=>e.notes.includes(note)&&!this.hits.get(`${i}:${note}`)&&Math.abs(this.positions[i]-elapsed)<=.25);
        const e=this.events[index];
        if(!e||!e.notes.includes(note)||this.hits.has(`${index}:${note}`)){this.errors++;return{correct:false,index};}
        this.hits.set(`${index}:${note}`,true);this.held.set(token,{at:now,expected:(e.durations?.[note]??e.beats)*this.beatMs});
        if(this.mode!=='wait')this.offsets.push(Math.abs(now-(this.start+this.positions[index]*this.beatMs)));
        if(e.notes.every(n=>this.hits.has(`${index}:${n}`)))this.hit.add(index);
        if(this.mode==='wait')this.advance();return{correct:true,index,complete:this.mode==='wait'&&this.index>=this.events.length};
    }
    noteOff(token,now){const h=this.held.get(token);if(!h)return;this.held.delete(token);this.lengths.push({expected:h.expected,actual:Math.max(0,now-h.at)});}
    result(now){
        for(const token of [...this.held.keys()])this.noteOff(token,now);
        const pitch=Math.round(100*this.hits.size/Math.max(1,this.totalNotes+this.errors));
        const goodDurations=this.lengths.filter(d=>Math.abs(d.actual-d.expected)<=Math.max(100,d.expected*.25)).length;
        const durationScore=Math.round(100*goodDurations/Math.max(1,this.totalNotes));
        return{score:this.duration&&this.mode!=='wait'?Math.round(pitch*.75+durationScore*.25):pitch,pitch,durationScore,errors:this.errors,hits:this.hits.size,total:this.totalNotes,timingMs:this.offsets.length?Math.round(this.offsets.reduce((a,b)=>a+b,0)/this.offsets.length):null};
    }
}
