import {DEFAULT_ABC,SCORE_PRESETS,LIVE_PRESETS,MAX_SOURCE,MAX_WORKS,freshCreative,abcPitch,abcDuration,insertToken,eventsToABC,audioTimeline,strudelURL,checkABC} from './composition.mjs';
import {ScorePlayer} from './score-player.mjs';
const $=s=>document.querySelector(s);
const scripts=new Map();
function script(src){if(scripts.has(src))return scripts.get(src);const promise=new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=()=>{tag.remove();scripts.delete(src);reject(Error('工具文件未能加载，请检查网络后重试。'));};document.head.append(tag);});scripts.set(src,promise);return promise;}
const loadABC=()=>script('/music/vendor/abcjs-6.7.0.min.js');
function download(text,name,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const filename=s=>(s||'etude').replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,70)||'etude';
function xmlDocument(text){
 if(/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text))throw Error('不支持含自定义实体的 XML。');
 const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('MusicXML 格式不完整，无法解析。');return doc;
}
export async function readScoreFile(file){
 if(file.size>2*1024*1024)throw Error('乐谱文件最多 2 MB，请先按乐章拆分。');
 if(/\.abc$/i.test(file.name)){const abc=await file.text();checkABC(abc);return {abc,warning:''};}
 if(!/\.(xml|musicxml|mxl)$/i.test(file.name))throw Error('请选择 .abc、.musicxml、.xml 或 .mxl 乐谱；照片和 PDF 暂不识别。');
 let text;
 if(/\.mxl$/i.test(file.name)){
  const {unzipSync,strFromU8}=await import('./vendor/fflate-0.8.2.mjs');let total=0;
  const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:entry=>{total+=entry.originalSize;if(total>8*1024*1024||entry.originalSize>2*1024*1024)throw Error('解压后的乐谱过大，请使用更小的文件。');return /\.(xml|musicxml)$/i.test(entry.name);}});
  if(!files['META-INF/container.xml'])throw Error('MXL 缺少 META-INF/container.xml。');
  const container=xmlDocument(strFromU8(files['META-INF/container.xml']));const path=container.querySelector('rootfile')?.getAttribute('full-path');if(!path||!files[path])throw Error('MXL 中找不到主乐谱文件。');text=strFromU8(files[path]);
 }else text=await file.text();
 const doc=xmlDocument(text);if(doc.documentElement.localName!=='score-partwise')throw Error('目前支持 score-partwise MusicXML；请在制谱软件中重新导出为此格式。');
 if(doc.querySelectorAll('note').length>2000)throw Error('当前最多导入 2000 个音符，请分段导出。');
 await script('/music/vendor/jquery-3.7.1.min.js');await script('/music/vendor/xml2abc-122.js');
 const [abc,warning]=window.vertaal(doc,{u:0,b:4,n:100,c:0,v:1,d:0,m:0,x:0,t:0,v1:0,noped:1,stm:0,p:'',s:0});
 checkABC(abc);return {abc,warning:String(warning||'').replace(/<[^>]*>/g,'').trim()};
}
export function mountCreative({audio,getProgress,persist,stopAll,notify,setTab}){
 const player=new ScorePlayer(audio);let visual=null,timeline=null,selected=null,activeWork={score:'',live:''},renderTimer,renderGeneration=0,importGeneration=0,frame=null,frameTimer;
 let libraryKind='score',lastHighlight='';
 let history=[],historyIndex=-1;
 function remember(){const value=$('#score-source').value;if(history[historyIndex]!==value){history=history.slice(0,historyIndex+1);history.push(value);if(history.length>50)history.shift();historyIndex=history.length-1;}$('#score-undo').disabled=historyIndex<1;$('#score-redo').disabled=historyIndex>=history.length-1;}
 function travel(step){const next=historyIndex+step;if(next<0||next>=history.length)return;historyIndex=next;$('#score-source').value=history[next];selected=null;sourceChanged();}
 const state=()=>getProgress().creative ||= freshCreative();
 const status=(text,bad=false)=>{$('#score-status').textContent=text;$('#score-status').classList.toggle('bad',bad);};
 const saveDraft=()=>{state().abc=$('#score-source').value;state().live=$('#live-source').value;state().title=$('#live-title').value;persist();};
 const library=()=>{const list=$('#creative-works');list.replaceChildren(new Option('选择已保存作品…',''));for(const w of state().works.filter(w=>w.kind===libraryKind))list.add(new Option(w.title,w.id));list.value=activeWork[libraryKind];$('#work-update').disabled=!activeWork[libraryKind];$('#work-delete').disabled=!activeWork[libraryKind];$('#works-count').textContent=`${state().works.length} / ${MAX_WORKS} 首 · 包含在进度 JSON 备份中`;};
 function clearHighlight(){document.querySelectorAll('#composition-sheet .score-playing').forEach(e=>e.classList.remove('score-playing'));lastHighlight='';}
 function stopScore(){player.stop();clearHighlight();$('#score-play').disabled=!timeline;$('#score-stop').disabled=true;$('#score-time').textContent='已停止';}
 function stopLive(){clearTimeout(frameTimer);if(frame){frame.remove();frame=null;$('#live-frame').hidden=true;$('#live-status').textContent='演奏已停止；本站代码草稿已保留。';}$('#live-stop').disabled=true;}
 function stop(){clearTimeout(renderTimer);renderGeneration++;stopScore();stopLive();}
 function selectElement(abc,el){if(!Number.isFinite(abc.startChar)||abc.startChar<0)return;selected={from:abc.startChar,to:abc.endChar};$('#score-source').setSelectionRange(selected.from,selected.to);$('#score-selection').textContent=`已选中谱面元素：${$('#score-source').value.slice(selected.from,selected.to)} · 可替换或删除`;$('#score-selected-play').disabled=false;}
 async function render(){
  const generation=++renderGeneration;stopScore();timeline=null;visual=null;selected=null;$('#score-play').disabled=true;$('#score-selected-play').disabled=true;$('#score-selection').textContent='点击谱面音符可选中，使用输入工具替换。';
  try{
   const source=checkABC($('#score-source').value);await loadABC();if(generation!==renderGeneration)return;
   const tunes=window.ABCJS.renderAbc('composition-sheet',source,{responsive:'resize',add_classes:true,staffwidth:Math.max(320,$('#composition-sheet').clientWidth-50),wrap:{minSpacing:1.5,maxSpacing:2.7,preferredMeasuresPerLine:4},paddingright:25,paddingleft:25,selectionColor:'#9b6934',clickListener:selectElement});
   visual=tunes[0];if(!visual)throw Error('未能读取这份 ABC 乐谱。');
   timeline=audioTimeline(visual.setUpAudio({chordsOff:true}));
   if(!timeline.notes.length)throw Error('乐谱中没有可播放的钢琴音符。');
   const warnings=visual.warnings||[];status(`${timeline.notes.length} 个发声音符 · ${Math.ceil(timeline.duration)} 秒 · 原谱 ${Math.round(timeline.tempo)} BPM${timeline.skipped?` · ${timeline.skipped} 个打击乐/超出钢琴音域的音未播放`:''}${warnings.length?' · 请核对下方排谱提示':''}`);
   $('#score-warnings').textContent=warnings.map(w=>String(w).replace(/<[^>]*>/g,'')).join('\n');$('#score-warnings').hidden=!warnings.length;
   $('#score-play').disabled=false;$('#score-export-midi').disabled=false;$('#score-export-svg').disabled=false;
  }catch(e){timeline=null;visual=null;status(e.message,true);$('#score-export-midi').disabled=true;$('#score-export-svg').disabled=true;$('#composition-sheet').replaceChildren();}
 }
 function sourceChanged(){importGeneration++;stopAll();timeline=null;visual=null;for(const id of ['score-play','score-selected-play','score-export-midi','score-export-svg'])$('#'+id).disabled=true;remember();saveDraft();clearTimeout(renderTimer);renderTimer=setTimeout(render,220);}
 function replaceSource(text){$('#score-source').value=text;remember();activeWork.score='';saveDraft();library();void render();}
 function insert(kind){
  const input=$('#score-source'),start=selected?.from??input.selectionStart,end=selected?.to??input.selectionEnd;
  if(start<=input.value.indexOf('\n',input.value.indexOf('K:'))) {notify('先把光标放在 K: 调号之后的音符区域，或点击谱面音符。');return;}
  const prefix=input.value.slice(0,start),units=[...prefix.matchAll(/(?:^|\[)L:(\d+)\/(\d+)/gm)];
  const unit=units.length?+units.at(-1)[1]/+units.at(-1)[2]:1/8;const beats=+$('#note-length').value/(4*unit);
  let token='';if(kind!=='delete'){
   token=insertToken({letter:$('#note-letter').value,octave:+$('#note-octave').value,accidental:$('#note-accidental').value,beats,kind});
   if(kind==='chord'){const root=12*(+$('#note-octave').value+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[$('#note-letter').value]+($('#note-accidental').value==='='?0:({'^':1,'_':-1}[$('#note-accidental').value] ?? ({sharp:1,flat:-1}[visual?.getKeySignature?.().accidentals?.find(a=>a.note.toUpperCase()===$('#note-letter').value)?.acc]||0)));const steps=$('#note-quality').value==='minor'?[0,3,7]:$('#note-quality').value==='7'?[0,4,7,10]:[0,4,7];token='['+steps.map(n=>abcPitch(root+n)).join('')+']'+abcDuration(beats)+' ';}
  }
  input.setRangeText(token,start,end,'end');selected=null;sourceChanged();input.focus();
 }
 async function play(fromSelected=false){
  if(!timeline)return;const selectedStart=selected?.from;const from=fromSelected?timeline.notes.find(n=>n.startChar===selectedStart)?.start||0:0;
  const rate=+$('#score-speed').value,scaled={...timeline,notes:timeline.notes.map(n=>({...n,start:n.start/rate,duration:n.duration/rate})),duration:timeline.duration/rate};
  stopAll();$('#score-play').disabled=true;$('#score-stop').disabled=false;
  try{await player.play(scaled,{offset:from/rate,onTime:time=>{
    $('#score-time').textContent=`${Math.floor(time)} / ${Math.ceil(scaled.duration)} 秒`;
    const notes=scaled.notes.filter(n=>n.start<=time&&n.start+n.duration>time);const key=notes.map(n=>n.startChar).join(',');if(key===lastHighlight)return;clearHighlight();lastHighlight=key;
    for(const s of visual?.engraver?.selectables||[]){const abc=s.absEl?.abcelem;if(abc&&notes.some(n=>n.startChar===abc.startChar))for(const el of s.absEl.elemset||[])el.classList.add('score-playing');}
   },onEnd:()=>{stopScore();$('#score-time').textContent='播放完成';}});}catch(e){stopScore();status(e.message,true);}
 }
 $('#score-source').value=state().abc;$('#live-source').value=state().live;$('#live-title').value=state().title;
 remember();$('#score-undo').onclick=()=>travel(-1);$('#score-redo').onclick=()=>travel(1);
 $('#score-presets').replaceChildren(...SCORE_PRESETS.map(p=>new Option(p.title,p.id)));
 $('#live-presets').replaceChildren(...LIVE_PRESETS.map(p=>new Option(p.title,p.id)));
 $('#score-source').addEventListener('input',()=>{selected=null;sourceChanged();});$('#score-source').addEventListener('click',()=>{selected=null;});
 $('#score-render').onclick=()=>{stopAll();saveDraft();void render();};$('#score-play').onclick=()=>play();$('#score-selected-play').onclick=()=>play(true);$('#score-stop').onclick=()=>{stopAll();stopScore();};
 $('#score-speed').onchange=stopScore;
 for(const kind of ['note','rest','bar','chord','delete'])document.getElementById('insert-'+kind).onclick=()=>insert(kind);
 $('#score-load-example').onclick=()=>{importGeneration++;stopAll();replaceSource(SCORE_PRESETS.find(p=>p.id===$('#score-presets').value).abc);};
 $('#score-import').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;const generation=++importGeneration;stopAll();$('#score-import-status').textContent='正在读取乐谱…';
  try{const result=await readScoreFile(file);if(generation!==importGeneration)return;replaceSource(result.abc);$('#score-import-status').textContent=`已导入 ${file.name}。${result.warning?'转换提示：'+result.warning:'请核对调号、反复与声部。'}`;}catch(error){$('#score-import-status').textContent=error.message;}
 };
 $('#score-export-abc').onclick=()=>download($('#score-source').value,filename(visual?.metaText?.title)+'.abc');
 $('#score-export-midi').onclick=()=>{if(!visual)return;try{const data=window.ABCJS.synth.getMidiFile(visual,{midiOutputType:'binary',chordsOff:true});download(data,filename(visual.metaText?.title)+'.mid','audio/midi');}catch(e){notify('MIDI 导出失败：'+e.message);}};
 $('#score-export-svg').onclick=()=>{const svgs=[...document.querySelectorAll('#composition-sheet svg')];if(!svgs.length)return;let y=0;const parts=svgs.map(svg=>{const copy=svg.cloneNode(true);copy.querySelectorAll('.score-playing').forEach(e=>e.classList.remove('score-playing'));const box=svg.viewBox.baseVal,height=box.height||svg.getBoundingClientRect().height;copy.setAttribute('x','0');copy.setAttribute('y',y);copy.setAttribute('height',height);copy.setAttribute('width',box.width||900);y+=height;return new XMLSerializer().serializeToString(copy);});download(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${y}" viewBox="0 0 900 ${y}" style="color:#222;background:white">${parts.join('')}</svg>`,filename(visual.metaText?.title)+'.svg','image/svg+xml');};
 $('#live-source').oninput=saveDraft;$('#live-title').oninput=saveDraft;
 $('#live-load-example').onclick=()=>{stopAll();const p=LIVE_PRESETS.find(p=>p.id===$('#live-presets').value);$('#live-source').value=p.code;$('#live-title').value=p.title;$('#live-hint').textContent=p.hint;activeWork.live='';saveDraft();library();};
 $('#live-launch').onclick=()=>{stopAll();saveDraft();try{const url=strudelURL($('#live-source').value);frame=document.createElement('iframe');frame.title='Strudel 官方实时编曲编辑器';frame.allow='autoplay';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-downloads allow-popups');frame.referrerPolicy='no-referrer';frame.src=url;frame.onload=()=>{clearTimeout(frameTimer);$('#live-status').textContent='Strudel 已加载；先点击编辑器中央的 play 启动。若页面空白，请使用“在 Strudel 打开”。';};$('#live-frame').replaceChildren(frame);$('#live-frame').hidden=false;$('#live-stop').disabled=false;$('#live-status').textContent='正在连接 strudel.cc…';frameTimer=setTimeout(()=>$('#live-status').textContent='加载较慢，可在 Strudel 独立页面打开；本站草稿已保存。',18000);}catch(e){notify(e.message);}};
 $('#live-stop').onclick=stopLive;
 $('#live-open').onclick=()=>{saveDraft();window.open(strudelURL($('#live-source').value),'_blank','noopener,noreferrer');};
 $('#live-export').onclick=()=>download($('#live-source').value,filename($('#live-title').value)+'.js');
 $('#live-import').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>MAX_SOURCE*3){notify('代码文件过大。');return;}const text=await file.text();if(text.length>MAX_SOURCE){notify('代码最多 40000 字符。');return;}stopAll();$('#live-source').value=text;$('#live-title').value=file.name.replace(/\.[^.]+$/,'');activeWork.live='';saveDraft();library();};
 $('#creative-works').onchange=e=>{const w=state().works.find(w=>w.id===e.target.value);if(!w)return;stopAll();activeWork[w.kind]=w.id;if(w.kind==='score'){$('#score-source').value=w.source;remember();void render();}else{$('#live-source').value=w.source;$('#live-title').value=w.title;}saveDraft();library();};
 function storeWork(update){saveDraft();const source=libraryKind==='score'?state().abc:state().live,title=libraryKind==='score'?(/^T:(.*)$/m.exec(source)?.[1]?.trim()||'未命名乐谱'):state().title||'未命名编曲';let work=update?state().works.find(w=>w.id===activeWork[libraryKind]):null;if(!work){if(state().works.length>=MAX_WORKS){notify('作品库已满，请先导出并删除不再需要的作品。');return;}work={id:crypto.randomUUID(),kind:libraryKind};state().works.push(work);}Object.assign(work,{title,source,at:Date.now()});activeWork[libraryKind]=work.id;persist();library();notify('作品已保存在此浏览器。');}
 $('#work-save').onclick=()=>storeWork(false);$('#work-update').onclick=()=>storeWork(true);$('#work-delete').onclick=()=>{const id=activeWork[libraryKind];if(!id||!confirm('删除选中的已存作品？当前编辑草稿会保留。'))return;state().works=state().works.filter(w=>w.id!==id);activeWork[libraryKind]='';persist();library();};
 $('#live-hint').textContent=(LIVE_PRESETS.find(p=>p.code===state().live)||LIVE_PRESETS[0]).hint;
 const worksPanel=$('#creative-library');
 return {
  stop,stopScore,
  show(name){if(!['compose','live'].includes(name))return;libraryKind=name==='compose'?'score':'live';document.getElementById(name==='compose'?'score-library-slot':'live-library-slot').append(worksPanel);worksPanel.hidden=false;library();if(name==='compose')void render();},
  sync(){stop();importGeneration++;activeWork={score:'',live:''};$('#score-source').value=state().abc;history=[];historyIndex=-1;remember();$('#live-source').value=state().live;$('#live-title').value=state().title;library();if(!document.querySelector('[data-panel=compose]').hidden)void render();},
  fromEvents(events,title){stopAll();replaceSource(eventsToABC(events,title,getProgress().settings.bpm));setTab('compose',true);},
 };
}
