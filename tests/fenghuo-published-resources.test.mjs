import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const game=join(root,'static/games/fenghuo-app/game');
test('game resource bundle is present and not excluded by Hugo cache ignore rules',()=>{
 const settings=JSON.parse(readFileSync(join(game,'src',readdirSync(join(game,'src')).find(n=>/^settings.*\.json$/.test(n))),'utf8'));
 const version=settings.assets.bundleVers.resources;
 assert.ok(version,'dynamic resources bundle version must be registered');
 for(const file of [`assets/resources/config.${version}.json`,`assets/resources/index.${version}.js`]){
  assert.ok(existsSync(join(game,file)),file+' must be shipped');
  const ignored=spawnSync('git',['check-ignore','--no-index','-q','static/games/fenghuo-app/game/'+file],{cwd:root});
  assert.equal(ignored.status,1,file+' must not be ignored by Git');
 }
 const files=[];
 function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const p=join(dir,entry.name);entry.isDirectory()?walk(p):files.push(p);}}
 walk(join(game,'assets/resources'));
 assert.equal(files.filter(p=>p.endsWith('.mp3')).length,4,'all four runtime music files must be shipped');
 assert.equal(files.filter(p=>p.includes('/import/')&&p.endsWith('.json')).length,4,'all four music descriptors must be shipped');
 for(const p of files){const relative=p.slice(root.length);const ignored=spawnSync('git',['check-ignore','--no-index','-q',relative],{cwd:root});assert.equal(ignored.status,1,relative+' must not be ignored');}
 const cache=spawnSync('git',['check-ignore','--no-index','-q','resources/_gen/test'],{cwd:root});
 assert.equal(cache.status,0,'Hugo root cache must remain ignored');
});
