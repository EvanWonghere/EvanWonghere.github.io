// Chord spelling keeps letter names (E-flat, B-sharp, etc.), rather than naming only piano keys.
export const KEYS = ['C','D♭','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const NATURAL = { C:0,D:2,E:4,F:5,G:7,A:9,B:11 }, LETTERS = ['C','D','E','F','G','A','B'];
export const CHORD_TYPES = [
    { id:'major', symbol:'', name:'大三和弦', semitones:[0,4,7], degrees:[1,3,5], formula:'1 3 5', family:'三和弦', hint:'大三度 + 小三度。先认根音，再比较三音。' },
    { id:'minor', symbol:'m', name:'小三和弦', semitones:[0,3,7], degrees:[1,3,5], formula:'1 ♭3 5', family:'三和弦', hint:'小三度 + 大三度；只降低大三和弦的三音。' },
    { id:'dim', symbol:'dim', name:'减三和弦', semitones:[0,3,6], degrees:[1,3,5], formula:'1 ♭3 ♭5', family:'三和弦', hint:'两个小三度叠置，五音也降低半音。' },
    { id:'aug', symbol:'aug', name:'增三和弦', semitones:[0,4,8], degrees:[1,3,5], formula:'1 3 ♯5', family:'三和弦', hint:'两个大三度叠置，留意增五度的张力。' },
    { id:'sus2', symbol:'sus2', name:'挂二和弦', semitones:[0,2,7], degrees:[1,2,5], formula:'1 2 5', family:'色彩和弦', hint:'以二音替代三音；与保留三音的 add9 区分。' },
    { id:'sus4', symbol:'sus4', name:'挂四和弦', semitones:[0,5,7], degrees:[1,4,5], formula:'1 4 5', family:'色彩和弦', hint:'以四音替代三音。试着让 4 下行解决到 3。' },
    { id:'6', symbol:'6', name:'大六和弦', semitones:[0,4,7,9], degrees:[1,3,5,6], formula:'1 3 5 6', family:'色彩和弦', hint:'这里的 6 是和弦符号的附加六音，不是古典数字低音的第一转位。' },
    { id:'m6', symbol:'m6', name:'小六和弦', semitones:[0,3,7,9], degrees:[1,3,5,6], formula:'1 ♭3 5 6', family:'色彩和弦', hint:'小三和弦加大六度，常用作爵士小调主和弦。' },
    { id:'maj7', symbol:'maj7', name:'大七和弦', semitones:[0,4,7,11], degrees:[1,3,5,7], formula:'1 3 5 7', family:'七和弦', hint:'大三和弦 + 大七度；与属七和弦的降七音对照。' },
    { id:'7', symbol:'7', name:'属七和弦', semitones:[0,4,7,10], degrees:[1,3,5,7], formula:'1 3 5 ♭7', family:'七和弦', hint:'3 与 ♭7 构成三全音。符号 7 表示性质，是否有属功能还要看上下文。' },
    { id:'m7', symbol:'m7', name:'小七和弦', semitones:[0,3,7,10], degrees:[1,3,5,7], formula:'1 ♭3 5 ♭7', family:'七和弦', hint:'小三和弦 + 小七度，是大调 ii 级的常见结构。' },
    { id:'mMaj7', symbol:'m(maj7)', name:'小大七和弦', semitones:[0,3,7,11], degrees:[1,3,5,7], formula:'1 ♭3 5 7', family:'七和弦', hint:'小三和弦上加大七度，可体现和声/旋律小调主和弦色彩。' },
    { id:'m7b5', symbol:'m7♭5', name:'半减七和弦', semitones:[0,3,6,10], degrees:[1,3,5,7], formula:'1 ♭3 ♭5 ♭7', family:'七和弦', hint:'减三和弦 + 小七度；小调 ii 级常用。' },
    { id:'dim7', symbol:'dim7', name:'减七和弦', semitones:[0,3,6,9], degrees:[1,3,5,7], formula:'1 ♭3 ♭5 𝄫7', family:'七和弦', hint:'七音按字母应拼成减七度，如 Cdim7 的 B𝄫，在十二平均律里与 A 同音。' },
    { id:'add9', symbol:'add9', name:'附加九和弦', semitones:[0,4,7,14], degrees:[1,3,5,9], formula:'1 3 5 9', family:'扩展和弦', hint:'保留三音，加入九音，不包含七音；与 C9 不同。' },
    { id:'maj9', symbol:'maj9', name:'大九和弦', semitones:[0,4,7,11,14], degrees:[1,3,5,7,9], formula:'1 3 5 7 9', family:'扩展和弦', hint:'大七和弦加九音。先听 3/7，再把 9 加入上方。' },
    { id:'9', symbol:'9', name:'属九和弦', semitones:[0,4,7,10,14], degrees:[1,3,5,7,9], formula:'1 3 5 ♭7 9', family:'扩展和弦', hint:'属七和弦加九音，符号隐含降七音；可省略五音。' },
    { id:'m9', symbol:'m9', name:'小九和弦', semitones:[0,3,7,10,14], degrees:[1,3,5,7,9], formula:'1 ♭3 5 ♭7 9', family:'扩展和弦', hint:'小七和弦加九音，经常出现在大调 ii–V–I 的 ii 级。' },
    { id:'13', symbol:'13', name:'属十三和弦', semitones:[0,4,7,10,14,21], degrees:[1,3,5,7,9,13], formula:'1 3 5 ♭7 9 13（省 11）', family:'扩展和弦', hint:'此配置省略自然 11，避免与大三音紧邻冲突。实际伴奏也常省根音或五音。' },
    { id:'7b9', symbol:'7(♭9)', name:'属七降九和弦', semitones:[0,4,7,10,13], degrees:[1,3,5,7,9], formula:'1 3 5 ♭7 ♭9', family:'变化属和弦', hint:'降九音可半音下行解决到目标和弦五音；常用于小调属和弦。' },
    { id:'7s9', symbol:'7(♯9)', name:'属七升九和弦', semitones:[0,4,7,10,15], degrees:[1,3,5,7,9], formula:'1 3 5 ♭7 ♯9', family:'变化属和弦', hint:'升九音与三音并存；理论拼写为升九度，不把它直接改名为小三音。' },
    { id:'7s11', symbol:'7(♯11)', name:'属七升十一和弦', semitones:[0,4,7,10,18], degrees:[1,3,5,7,11], formula:'1 3 5 ♭7 ♯11', family:'变化属和弦', hint:'升十一提供明亮张力。先保留三音与七音，留意旋律是否支持这枚扩展音。' }
];
export const rootPC = root => (NATURAL[root[0]] + (root.includes('𝄫') ? -2 : root.includes('𝄪') ? 2 : root.includes('♭') ? -1 : root.includes('♯') ? 1 : 0) + 12) % 12;
export function spellPitch(root, degree, midi) {
    const letter = LETTERS[(LETTERS.indexOf(root[0]) + degree - 1) % 7];
    let accidental = ((midi % 12 - NATURAL[letter] + 18) % 12) - 6;
    const mark = accidental === -2 ? '𝄫' : accidental === 2 ? '𝄪' : accidental === -1 ? '♭' : accidental === 1 ? '♯' : '';
    return `${letter}${mark}${Math.round((midi - NATURAL[letter] - accidental) / 12) - 1}`;
}
export const chordType = id => CHORD_TYPES.find(t => t.id === id) || CHORD_TYPES[0];
export function makeChord(root='C', typeId='maj7', { inversion=0, voicing='close', bass=false, octave=4 }={}) {
    const type = chordType(typeId), rootMidi=(octave+1)*12+rootPC(root);
    let parts=type.semitones.map((offset,i)=>({midi:rootMidi+offset,degree:type.degrees[i]}));
    if(voicing==='shell') { const guides=parts.filter(p=>p.degree===3 || p.degree===7); parts=guides.length>=2?guides:parts.filter(p=>[1,3,5].includes(p.degree)); }
    if(voicing==='rootless') parts=parts.filter(p=>p.degree!==1);
    if(voicing==='open' && parts.length>=3) parts[1].midi+=12;
    parts.sort((a,b)=>a.midi-b.midi);
    for(let i=0;i<Math.min(inversion,parts.length-1);i++){const p=parts.shift();while(p.midi<=parts.at(-1).midi)p.midi+=12;parts.push(p);}
    while(parts.at(-1)?.midi>108)parts.forEach(p=>p.midi-=12);
    const right=parts.map(p=>p.midi), left=bass?[rootMidi-24]:[], spellings={};
    parts.forEach(p=>spellings[p.midi]=spellPitch(root,p.degree,p.midi)); if(bass)spellings[rootMidi-24]=spellPitch(root,1,rootMidi-24);
    return { notes:[...left,...right],left,right,spellings,symbol:root+type.symbol,type,beats:4 };
}
const step=(offset,degree,type,label)=>({offset,degree,type,label});
export const PROGRESSIONS=[
    { id:'classical', name:'古典基本终止 · I–IV–V–I', family:'古典与调性', description:'先弹低音，再听上方三音。最后 V 的导音向 I 的主音解决。', steps:[step(0,1,'major','I'),step(5,4,'major','IV'),step(7,5,'major','V'),step(0,1,'major','I')] },
    { id:'predominant', name:'下属准备 · I–ii–V7–I', family:'古典与调性', description:'从稳定主和弦到下属功能，再经属七返回主和弦；试着唱出 V7 的七音下行。',steps:[step(0,1,'major','I'),step(2,2,'minor','ii'),step(7,5,'7','V7'),step(0,1,'major','I')] },
    { id:'deceptive',name:'阻碍进行 · I–IV–V–vi',family:'古典与调性',description:'V 后转向 vi，期待暂时没有完全结束。再自行补 ii–V–I 收束。',steps:[step(0,1,'major','I'),step(5,4,'major','IV'),step(7,5,'major','V'),step(9,6,'minor','vi')] },
    { id:'secondary',name:'副属链 · I–VI7–ii7–V7–I',family:'古典与调性',description:'VI7 在这里是 V7/ii；升高的音服务于临时主音 ii，不代表整首永久转调。',steps:[step(0,1,'maj7','Imaj7'),step(9,6,'7','V7/ii'),step(2,2,'m7','ii7'),step(7,5,'7','V7'),step(0,1,'maj7','Imaj7')] },
    { id:'jazz251',name:'爵士大调 ii–V–I',family:'爵士基础',description:'以三音和七音作为锚点。C 调中 F–C → F–B → E–B：一个音保留，另一个半音移动。',steps:[step(2,2,'m7','ii7'),step(7,5,'7','V7'),step(0,1,'maj7','Imaj7'),step(0,1,'maj7','Imaj7')] },
    { id:'jazz-minor',name:'爵士小调 iiø–V7♭9–i6',family:'爵士基础',description:'此处以所选根音为小调主音。半减 ii、变化属 V 和小六主和弦分别提供准备、张力与落点。',steps:[step(2,2,'m7b5','iiø7'),step(7,5,'7b9','V7(♭9)'),step(0,1,'m6','i6'),step(0,1,'m6','i6')] },
    { id:'turnaround',name:'Turnaround · I–VI7–ii–V',family:'爵士基础',description:'最后的 V 指向下一轮 I。先均匀四拍，再尝试把和弦放到弱拍。',steps:[step(0,1,'maj7','Imaj7'),step(9,6,'7','VI7'),step(2,2,'m7','ii7'),step(7,5,'7','V7')] },
    { id:'extended251',name:'色彩 ii–V–I · m9–13–maj9',family:'爵士进阶',description:'先练 shell 确认功能，再加入 9 与 13。不要一次把全部扩展音挤在中低音区。',steps:[step(2,2,'m9','ii9'),step(7,5,'13','V13'),step(0,1,'maj9','Imaj9'),step(0,1,'maj9','Imaj9')] },
    { id:'tritone',name:'三全音替代 · ii7–♭II7–Imaj7',family:'爵士进阶',description:'♭II7 与 V7 共享等音的三音/七音。低音从 ii 经 ♭II 半音走向 I。',steps:[step(2,2,'m7','ii7'),step(1,2,'7','subV7'),step(0,1,'maj7','Imaj7'),step(0,1,'maj7','Imaj7')] },
    { id:'blues',name:'十二小节 Blues',family:'爵士基础',description:'基础 I7 / IV7 / V7 布鲁斯。此处的 I7 是主和弦色彩，不能机械地当作必须解决的属功能。',steps:[0,0,0,0,5,5,0,0,7,5,0,7].map(o=>step(o,o===0?1:o===5?4:5,'7',o===0?'I7':o===5?'IV7':'V7')) }
];
function closeToPrevious(chord,previous) {
    if(!previous || chord.right.length!==previous.length)return chord;
    let best=chord.right,score=Infinity;
    // Inversions and octave displacement; preserve pitch classes and playable middle register.
    for(let rotate=0;rotate<chord.right.length;rotate++)for(const shift of [-12,0,12]){
        const candidate=chord.right.map((n,i)=>n+(i<rotate?12:0)+shift).sort((a,b)=>a-b);
        if(candidate[0]<48 || candidate.at(-1)>84)continue;
        const cost=candidate.reduce((sum,n,i)=>sum+Math.abs(n-previous[i]),0);
        if(cost<score){score=cost;best=candidate;}
    }
    const spellings={...chord.spellings};
    best.forEach(n=>{const original=chord.right.find(m=>m%12===n%12);const text=chord.spellings[original];spellings[n]=text.replace(/-?\d+$/,String(Number(text.match(/-?\d+$/)[0])+(n-original)/12));});
    return {...chord,right:best,notes:[...chord.left,...best],spellings};
}
export function progressionEvents(id,root='C',voicing='shell',smooth=true) {
    const progression=PROGRESSIONS.find(p=>p.id===id)||PROGRESSIONS[0];let previous=null;
    return progression.steps.map(s=>{
        const rootMidi=60+rootPC(root)+s.offset, name=spellPitch(root,s.degree,rootMidi).replace(/-?\d+$/,'');
        let chord=makeChord(name,s.type,{voicing,bass:true});if(smooth)chord=closeToPrevious(chord,previous);previous=chord.right;
        return {...chord,label:`${s.label} · ${chord.symbol}`,beats:4};
    });
}

// Compact only oversized upper structures when sending them to two-hand practice.
export function playableHands(event) {
    const right=[...event.right],left=[...event.left],spellings={...event.spellings};
    const move=(from,to)=>{spellings[to]=spellings[from].replace(/-?\d+$/,m=>String(+m+(to-from)/12));return to;};
    if(right.at(-1)-right[0]>12){
        for(let i=0;i<left.length;i++)left[i]=move(left[i],48+left[i]%12);
        while(right.length>1&&right.at(-1)-right[0]>12){const from=right.shift();left.push(move(from,48+from%12));}
    }
    const uniqueLeft=[...new Set(left)].sort((a,b)=>a-b);
    return {...event,left:uniqueLeft,right,notes:[...uniqueLeft,...right],spellings};
}
