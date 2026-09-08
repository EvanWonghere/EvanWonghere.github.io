import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DEFAULT_ABC,SCORE_PRESETS,LIVE_PRESETS,freshCreative,validateCreative,abcPitch,abcDuration,insertToken,eventsToABC,audioTimeline,strudelURL,checkABC} from '../static/music/composition.mjs';
import {freshProgress,validateProgress} from '../static/music/core.mjs';
import {progressionEvents,playableHands} from '../static/music/harmony.mjs';
import {PIECES} from '../static/music/curriculum.mjs';
import {ScorePlayer} from '../static/music/score-player.mjs';
const ABC=createRequire(import.meta.url)('../static/music/vendor/abcjs-6.7.0.min.js');
const parse=source=>audioTimeline(ABC.parseOnly(checkABC(source))[0].setUpAudio({chordsOff:true}));
const score=body=>`X:1\nT:Test\nM:4/4\nL:1/4\nQ:1/4=120\nK:C\n${body}`;
test('ABC renders real pitch, key signature, durations, chords and independent voices',()=>{
 for(const preset of SCORE_PRESETS)assert.ok(parse(preset.abc).notes.length,preset.id);
 const result=parse(score('[CEG]2 z C/2 D/2 |]'));assert.deepEqual(result.notes.map(n=>n.note),[60,64,67,60,62]);assert.equal(result.duration,2);assert.equal(result.notes[3].start,1.5);
 const key=parse(score('F F =F F |]').replace('K:C','K:G'));assert.deepEqual(key.notes.map(n=>n.note),[66,66,65,65]);
 const duet=parse(SCORE_PRESETS[1].abc);assert.equal(duet.notes.filter(n=>n.start===0).length,2);
});
test('ties merge, repeats expand, tempo changes retain timing and tuplets sum to a beat',()=>{
 const tied=parse(score('C2-C2 |]'));assert.equal(tied.notes.length,1);assert.equal(tied.notes[0].duration,2);
 const repeated=parse(score('|: C D :| E2 |]'));assert.deepEqual(repeated.notes.map(n=>n.note),[60,62,60,62,64]);assert.equal(repeated.duration,3);
 const tempo=parse(score('C D [Q:1/4=60] E F |]'));assert.equal(tempo.duration,3);
 const tuplet=parse(score('(3CDE F2 |]'));assert.ok(Math.abs(tuplet.duration-2)<.00001);
});
test('pitch and duration tools preserve octave, accidental spelling and fractions',()=>{
 assert.equal(abcPitch(60),'=C');assert.equal(abcPitch(48),'=C,');assert.equal(abcPitch(72),"=c");assert.equal(abcPitch(69,'B𝄫4'),'__B');
 assert.equal(abcDuration(.5),'1/2');assert.equal(abcDuration(1.5),'3/2');assert.equal(insertToken({letter:'F',octave:5,accidental:'^',beats:2}),'^f2 ');assert.throws(()=>abcDuration(0));
});
test('workshop and sustained piano exercises become playable scores with preserved musical content',()=>{
 const events=progressionEvents('jazz251','B♭','shell').map(playableHands),rendered=parse(eventsToABC(events,'test',60));
 assert.equal(rendered.duration,16);assert.deepEqual(rendered.notes.filter(n=>n.start===0).map(n=>n.note).sort((a,b)=>a-b),events[0].notes.slice().sort((a,b)=>a-b));
 const held=PIECES.find(p=>p.id==='held-melody'),timeline=parse(eventsToABC(held.events,held.title,60));assert.equal(timeline.notes.length,20);assert.equal(timeline.notes.find(n=>n.note===64).duration,2);assert.equal(timeline.duration,8);
});
test('old progress migrates and new works round-trip without executing source code',()=>{
 const p=freshProgress();delete p.creative;assert.deepEqual(validateProgress(p).creative,freshCreative());
 p.creative={abc:DEFAULT_ABC,live:'throw new Error("never evaluate")',title:'test',works:[{id:'work-1',kind:'score',title:'<script>x</script>',source:DEFAULT_ABC,at:42}]};assert.deepEqual(validateProgress(p).creative,p.creative);
 const invalid=validateCreative({...p.creative,works:[...p.creative.works,...p.creative.works,{id:'bad',kind:'evil',title:'a',source:'a'}]});assert.equal(invalid.works.length,1);
});
test('Strudel payload uses official HTTPS origin and preserves Unicode without inline execution',()=>{
 for(const p of LIVE_PRESETS){const url=strudelURL(p.code);assert.equal(new URL(url).origin,'https://strudel.cc');assert.equal(Buffer.from(url.split('#')[1],'base64').toString(),p.code);}
 assert.throws(()=>strudelURL('a'.repeat(40001)));assert.throws(()=>checkABC('X:1\nC D E'));assert.throws(()=>checkABC(DEFAULT_ABC+'\nX:2\nK:G'));assert.throws(()=>checkABC(DEFAULT_ABC+'\n%%beginhtml'));
});
test('MIDI output is a binary Standard MIDI file',()=>{
 const data=ABC.synth.getMidiFile(ABC.parseOnly(DEFAULT_ABC)[0],{midiOutputType:'binary',chordsOff:true});assert.ok(data instanceof Uint8Array);assert.equal(Buffer.from(data.subarray(0,4)).toString(),'MThd');assert.ok(data.length>50);
});
test('score playback bounds scheduling and cancels asynchronous preparations',async()=>{
 const calls=[],voices=new Map();const resolves=[];const audio={context:{currentTime:0},voices,init:async()=>{},load:()=>new Promise(r=>resolves.push(r)),noteOn:(note,velocity,time)=>{calls.push({note,time});const id=String(calls.length);voices.set(id,{});return id;},release:()=>{}};
 const player=new ScorePlayer(audio),timeline={notes:[{note:60,start:0,duration:1,velocity:80},{note:62,start:100,duration:1,velocity:80}],duration:101};
 const pending=player.play(timeline);await new Promise(r=>setImmediate(r));player.stop();resolves.forEach(r=>r());await pending;assert.equal(calls.length,0);assert.equal(player.running,false);
 audio.load=async()=>{};await player.play(timeline);assert.equal(calls.length,1);player.stop();assert.equal(player.timer,null);
});
