import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { freshProgress, validateProgress, loadProgress, saveProgress, STORAGE_KEY, recordAnswer, recordSkill, DAY, localDay, streakDays, noteName, frequency, midiPitch, isBlack, earQuestion, SEVENTHS, detectPitch, scoreRhythm } from '../static/music/core.mjs';
import { LESSONS, QUESTIONS, PIECES, MELODIES, RHYTHMS } from '../static/music/curriculum.mjs';
import { staff } from '../static/music/notation.mjs';
import { LESSON_DETAILS } from '../static/music/lesson-details.mjs';
import { KEYS, CHORD_TYPES, PROGRESSIONS, makeChord, progressionEvents, rootPC, playableHands } from '../static/music/harmony.mjs';
import { preparePiece, PracticeJudge } from '../static/music/practice.mjs';
import { PianoAudio, Transport, INSTRUMENTS } from '../static/music/audio.mjs';

test('88-key range, octave naming, equal temperament and black key layout', () => {
    assert.equal(noteName(21),'A0'); assert.equal(noteName(60),'C4'); assert.equal(noteName(108),'C8');
    assert.equal(frequency(69),440); assert.equal(frequency(81),880); assert.equal(midiPitch(440),69);
    assert.equal(Array.from({length:88},(_,i)=>21+i).filter(isBlack).length,36);
});
test('curriculum has unique complete questions and playable bounded exercises', () => {
    assert.equal(LESSONS.length,24); assert.equal(QUESTIONS.length,72); assert.equal(new Set(QUESTIONS.map(q=>q.id)).size,72);
    for (const q of QUESTIONS) { assert.ok(q.options.includes(q.answer)); assert.equal(new Set(q.options).size,q.options.length); assert.ok(q.explanation); }
    for (const p of PIECES) for (const e of p.events) { assert.ok(e.beats>0); assert.equal(new Set(e.notes).size,e.notes.length); assert.ok(e.notes.every(n=>n>=21 && n<=108)); }
    for (const m of MELODIES) { assert.equal(m.notes.length,m.beats.length); assert.equal(m.solfege.split(' ').length,m.notes.length); }
    for (const r of RHYTHMS) { assert.equal(new Set(r.positions).size,r.positions.length); assert.ok(r.positions.every(n=>n>=0 && n<8)); }
});
test('answer grading persists attempts, wrong-card schedule and expanding review intervals', () => {
    const p=freshProgress(), now=new Date(2026,8,5,12).getTime();
    recordAnswer(p,'theory-pitch-0',false,now);
    assert.equal(p.cards['theory-pitch-0'].due,now+600000);
    assert.equal(p.cards['theory-pitch-0'].streak,0);
    recordAnswer(p,'theory-pitch-0',true,now+1000);
    assert.equal(p.cards['theory-pitch-0'].due,now+1000+DAY);
    recordAnswer(p,'theory-pitch-0',true,now+2000);
    assert.equal(p.cards['theory-pitch-0'].due,now+2000+3*DAY);
    assert.equal(p.cards['theory-pitch-0'].attempts,3); assert.equal(p.cards['theory-pitch-0'].correct,2);
    recordAnswer(p,'theory-pitch-0',false,now+3000); assert.equal(p.cards['theory-pitch-0'].streak,0);
    assert.equal(p.days[localDay(new Date(now))].answers,4);
});
test('progress round trip keeps lessons, skill history, settings and correct counts', () => {
    const p=freshProgress(); p.lessons.pitch=true; p.lastLesson='touch'; p.settings.bpm=96; p.settings.octave=3;
    recordAnswer(p,'ear-interval-60-7',true); recordSkill(p,'piano-five-wait',92); recordSkill(p,'piano-five-wait',75);
    let data; const storage={getItem:()=>data,setItem:(key,value)=>{assert.equal(key,STORAGE_KEY);data=value;}};
    assert.equal(saveProgress(storage,p),null); assert.deepEqual(loadProgress(storage).progress,p);
    assert.equal(p.skills['piano-five-wait'].attempts,2); assert.equal(p.skills['piano-five-wait'].best,92); assert.equal(p.skills['piano-five-wait'].latest,75);
});
test('malformed, future-version, quota-denied and polluted saves fail safely', () => {
    assert.throws(()=>validateProgress({version:2,lessons:{},cards:{},settings:{}}));
    const malformed=loadProgress({getItem:()=>'{broken'}); assert.equal(malformed.blocked,true); assert.ok(malformed.error);
    assert.ok(saveProgress({setItem(){throw new Error('QuotaExceededError');}},freshProgress()));
    const hostile=JSON.parse('{"version":1,"lessons":{"__proto__":true,"pitch":true},"cards":{"constructor":{},"safe":{"attempts":2,"correct":900}},"settings":{"bpm":999,"volume":-10}}');
    const valid=validateProgress(hostile); assert.equal(valid.settings.bpm,200); assert.equal(valid.settings.volume,0); assert.equal(valid.cards.safe.correct,2); assert.equal(Object.hasOwn(valid.lessons,'__proto__'),false); assert.equal(Object.hasOwn(valid.cards,'constructor'),false);
});
test('streak uses local calendar days and preserves yesterday before today is practiced', () => {
    const now=new Date(2026,8,5,0,10); const days={'2026-09-03':{seconds:5},'2026-09-04':{answers:1}};
    assert.equal(streakDays(days,now),2); days['2026-09-05']={seconds:5}; assert.equal(streakDays(days,now),3);
    assert.equal(streakDays(days,new Date(2026,8,7)),0);
});
test('ear questions agree with chromatic interval and chord structure across every root', () => {
    for (const mode of ['direction','interval','chord','seventh']) for (const level of ['beginner','advanced']) for(let i=0;i<500;i++) {
        const q=earQuestion(mode,level); assert.ok(q.options.includes(q.answer)); assert.equal(q.options.length,new Set(q.options).size);
        assert.ok(q.notes.every(n=>n>=21 && n<=108));
        if (mode==='seventh') assert.deepEqual(q.notes.map(n=>n-q.notes[0]),SEVENTHS[q.answer]);
        if (mode==='direction') assert.equal(q.answer,q.notes[1]===q.notes[0]?'相同':q.notes[1]>q.notes[0]?'上行':'下行');
        if (mode==='chord') assert.equal(q.notes[2]-q.notes[0],{'大三和弦':7,'小三和弦':7,'减三和弦':6,'增三和弦':8}[q.answer]);
    }
});
test('microphone pitch estimator handles silence, fundamental and harmonic-rich vocal-range signals', () => {
    assert.equal(detectPitch(new Float32Array(4096),48000),null);
    for (const rate of [44100,48000]) for (const note of [40,48,57,60,69,76,81]) {
        const hz=frequency(note), signal=Float32Array.from({length:4096},(_,i)=>.24*Math.sin(2*Math.PI*hz*i/rate)+.1*Math.sin(4*Math.PI*hz*i/rate));
        const detected=detectPitch(signal,rate); assert.ok(detected,`${note} detected`); assert.ok(Math.abs(midiPitch(detected)-note)<.1,`${note} pitch ${detected}`);
    }
});
test('rhythm scores preserve count-in alignment and penalize extras and missing taps', () => {
    assert.equal(scoreRhythm([0,1,2,3],[0,500,1000,1500],500).score,100);
    assert.equal(scoreRhythm([0,1,2,3],[500,1000,1500,2000],500).score,75);
    assert.equal(scoreRhythm([0,1,2,3],[0,500,1000,1500,1750],500).score,80);
    assert.equal(scoreRhythm([0,1,2,3],[],500).score,0);
    assert.equal(scoreRhythm([0,1],[110,610],500).score,100);
    assert.equal(scoreRhythm([0,1],[111,611],500).score,0);
});
test('notation marks middle C with ledger line and avoids pitch-answer leaks in quiz labels', () => {
    const svg=staff([{notes:[60],beats:1}],{label:'识谱题'});
    assert.match(svg,/y1="102"/); assert.doesNotMatch(svg,/C4/);
    assert.match(staff([{notes:[66],beats:1}]),/♯/);
    assert.match(staff([{notes:[48,60,64,67],beats:2}],{clef:'grand'}),/𝄢/);
});
test('every local sample in all four instrument banks contains MP3 data', async () => {
    for(const {path} of Object.values(INSTRUMENTS)) {
    const dir=new URL(`../static/music/samples/${path}`,import.meta.url); const files=(await readdir(dir)).filter(f=>f.endsWith('.mp3'));
    assert.equal(files.length,88);
    for(let n=21;n<=108;n++) { const bytes=await readFile(new URL(`${n}.mp3`,dir)); assert.ok(bytes.length>1000); assert.equal(bytes[0],255); }
    }
});
// A small Web Audio fake tests cancellation/voice ownership, not sound fidelity.
function fakeAudio() {
    const param=()=>({value:1,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelAndHoldAtTime(){}});
    const sources=[];
    const node=()=>({connect(){},disconnect(){},addEventListener(){}});
    const ctx={currentTime:0,state:'running',createGain:()=>({...node(),gain:param()}),createBiquadFilter:()=>({...node(),frequency:param()}),createBufferSource:()=>{const s={...node(),start(t){this.started=t;},stop(t){this.stops.push(t);},stops:[]};sources.push(s);return s;}};
    const audio=new PianoAudio(); audio.context=ctx; audio.master=node(); for(let n=21;n<=108;n++)audio.buffers.set(n,{});
    return {audio,sources};
}
test('scheduled piano voices remain cancellable before start; pedal note-off waits for release', () => {
    const {audio,sources}=fakeAudio(); const id=audio.noteOn(60,90,10); audio.release(id,11,true);
    assert.equal(audio.voices.has(id),true); audio.stopAll(); assert.ok(sources[0].stops.at(-1)<.1);
    const second=audio.noteOn(64); audio.setPedal(true); audio.release(second); assert.equal(audio.voices.get(second).released,false);
    audio.setPedal(false); assert.equal(audio.voices.get(second).released,true);
});
test('transport cancellation during sample preparation never starts delayed notes', async () => {
    const {audio,sources}=fakeAudio(); audio.init=async()=>audio.context;
    let resolve; audio.load=()=>new Promise(r=>resolve=r);
    const transport=new Transport(audio); const play=transport.play([{notes:[60],beats:1}],72);
    await new Promise(r=>setImmediate(r)); transport.stop(); resolve({}); await play; assert.equal(sources.length,0);
});

test('every lesson has substantial explanation, worked examples, assignments and mastery criteria',()=>{
    assert.equal(PIECES.length,23);
    for(const lesson of LESSONS){const d=LESSON_DETAILS[lesson.id];assert.ok(d,lesson.id);assert.ok(d.sections.length>=3);assert.ok(d.sections.every(s=>s.text.length>45));assert.ok(d.example.steps.length>=2);assert.ok(d.example.answer);assert.ok(d.practice.length>=3);assert.ok(d.check);}
});
test('all chord qualities and transpositions stay playable and preserve spelled pitch classes',()=>{
    assert.equal(CHORD_TYPES.length,22);assert.equal(PROGRESSIONS.length,10);
    for(const root of KEYS)for(const type of CHORD_TYPES)for(const voicing of ['close','open','shell','rootless'])for(let inversion=0;inversion<4;inversion++){
        const chord=makeChord(root,type.id,{voicing,inversion,bass:true});
        assert.equal(chord.notes.length,new Set(chord.notes).size);
        const practice=playableHands(chord);assert.ok(practice.right.at(-1)-practice.right[0]<=12);assert.ok(practice.left.at(-1)-practice.left[0]<=12);
        assert.deepEqual([...new Set(practice.notes.map(n=>n%12))].sort(),[...new Set(chord.notes.map(n=>n%12))].sort());
        for(const n of practice.notes)assert.equal(rootPC(practice.spellings[n]),n%12);
        for(const n of chord.notes){assert.ok(n>=21&&n<=108,`${root} ${type.id} ${n}`);assert.equal(rootPC(chord.spellings[n]),n%12);}
    }
    assert.equal(makeChord('C','dim7').spellings[69],'B𝄫4');
    assert.equal(makeChord('F♯','maj7').spellings[77],'E♯5');
    assert.equal(makeChord('B♭','minor').spellings[73],'D♭5');
    for(const root of KEYS)for(const p of PROGRESSIONS)for(const voicing of ['close','open','shell','rootless']){
        const events=progressionEvents(p.id,root,voicing,true);assert.equal(events.length,p.steps.length);
        events.forEach((e,i)=>{assert.equal(e.left[0]%12,(rootPC(root)+p.steps[i].offset)%12);assert.ok(e.notes.every(n=>n>=21&&n<=108));});
    }
});
test('one-hand practice preserves held voices and trims notes at a loop boundary',()=>{
    const piece=PIECES.find(p=>p.id==='held-melody');
    const right=preparePiece(piece,{hand:'right'});assert.deepEqual(right.events.slice(0,4).map(e=>e.notes),[[64],[],[],[]]);assert.equal(right.events[1].sustain,true);assert.equal(right.events[0].durations[64],2);
    const loop=preparePiece(piece,{hand:'right',from:1,to:2,repeats:2});assert.equal(loop.events.length,4);assert.equal(loop.events[0].durations[64],1);assert.equal(loop.events[2].durations[64],1);
    assert.match(staff(right.events),/保持/);assert.match(staff([{notes:[66],beats:1},{notes:[65],beats:1}]),/♮/);
    assert.ok(preparePiece(PIECES.find(p=>p.id==='five'),{hand:'left'}).events.every(e=>!e.notes.length));
});
test('practice judge accepts a held right note over moving bass and grades release duration',()=>{
    const events=preparePiece(PIECES.find(p=>p.id==='held-melody'),{from:1,to:4}).events;
    const judge=new PracticeJudge(events,{mode:'timed',bpm:60,start:0,duration:true});
    judge.noteOn('r',64,0);
    for(let i=0;i<4;i++){const note=events[i].left[0];assert.equal(judge.noteOn(`l${i}`,note,i*500).correct,true);judge.noteOff(`l${i}`,(i+1)*500);}
    judge.noteOff('r',2000);assert.equal(judge.result(2000).score,100);
    const short=new PracticeJudge([{notes:[60],beats:2}],{mode:'timed',bpm:60,duration:true});short.noteOn('r',60,0);short.noteOff('r',100);assert.equal(short.result(2000).score,75);
    const wrong=new PracticeJudge([{notes:[60],beats:1}],{mode:'timed',bpm:60});assert.equal(wrong.noteOn('x',60,251).correct,false);assert.equal(wrong.result(1000).score,0);
    const wait=new PracticeJudge([{notes:[],beats:1},{notes:[60,64],beats:1}],{mode:'wait'});assert.equal(wait.index,1);wait.noteOn('a',60,0);assert.equal(wait.noteOn('b',64,5000).complete,true);
});
test('expanded progress migrates old saves and retains practice assignments, journal and workshop selections',()=>{
    const p=freshProgress();p.lessonTasks.jazz251=[true,false,true];p.journal=[{text:'慢练 ii–V–I',at:1,bpm:60}];
    p.preferences={'piano-piece':'workshop_c_10_mMaj7_rootless_0_1_1','harmony-type':'mMaj7','harmony-bass':'false'};
    recordSkill(p,'piano-workshop_c_10_mMaj7_rootless_0_1_1--right-1-1-4-timed-duration',90);const skill=Object.values(p.skills)[0];skill.bestBpm=60;skill.latestBpm=60;
    assert.deepEqual(validateProgress(p),p);recordSkill(p,Object.keys(p.skills)[0],95);assert.equal(Object.values(p.skills)[0].attempts,2);assert.equal(Object.values(p.skills)[0].bestBpm,60);
    delete p.lessonTasks;delete p.journal;assert.deepEqual(validateProgress(p).lessonTasks,{});assert.deepEqual(validateProgress(p).journal,[]);
});
test('switching instruments during download cannot populate the new bank with old samples',async()=>{
    const {audio}=fakeAudio();audio.buffers.clear();audio.context.decodeAudioData=async bytes=>bytes;
    const original=globalThis.fetch;let resolve;
    try{globalThis.fetch=()=>new Promise(r=>resolve=r);const pending=audio.load(60);audio.setInstrument('electric');resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});await pending;assert.equal(audio.buffers.size,0);assert.equal(audio.instrument,'electric');}
    finally{globalThis.fetch=original;}
});
