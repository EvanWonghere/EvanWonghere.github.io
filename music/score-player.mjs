// Look-ahead scheduling bounds live Web Audio voices even for long imported scores.
export class ScorePlayer {
 constructor(audio){this.audio=audio;this.generation=0;this.ids=new Set();this.timer=null;this.running=false;}
 stop(){this.generation++;clearInterval(this.timer);this.timer=null;for(const id of this.ids)this.audio.release(id,this.audio.context?.currentTime,true);this.ids.clear();this.running=false;}
 async play(timeline,{offset=0,onTime=()=>{},onEnd=()=>{}}={}){
  this.stop();const generation=this.generation;await this.audio.init();
  const pitches=[...new Set(timeline.notes.map(n=>n.note))];
  for(let i=0;i<pitches.length;i+=8){if(generation!==this.generation)return;await Promise.all(pitches.slice(i,i+8).map(n=>this.audio.load(n)));}
  if(generation!==this.generation)return;
  const notes=timeline.notes.filter(n=>n.start+n.duration>offset).map(n=>({...n,start:Math.max(0,n.start-offset),duration:n.duration-Math.max(0,offset-n.start)}));
  const start=this.audio.context.currentTime+.12,end=timeline.duration-offset;let index=0;this.running=true;
  const schedule=()=>{
   if(generation!==this.generation)return;const elapsed=this.audio.context.currentTime-start;
   for(const id of this.ids)if(!this.audio.voices.has(id))this.ids.delete(id);
   while(index<notes.length&&notes[index].start<elapsed+.15){const n=notes[index++],when=start+n.start;const id=this.audio.noteOn(n.note,n.velocity,when);if(id){this.ids.add(id);this.audio.release(id,when+n.duration,true);}}
   onTime(Math.max(0,elapsed)+offset);
   if(elapsed>=end+.06){this.stop();onEnd();}
  };schedule();if(this.running)this.timer=setInterval(schedule,25);
 }
}
