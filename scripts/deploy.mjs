#!/usr/bin/env node
/** Deploy with Wrangler, then verify and record the result in GitHub Deployments.
 * Uses existing gh/Wrangler authentication; never copies credentials into the repo.
 */
import {spawnSync} from 'node:child_process';
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
export const targets={
 'game-hub':{name:'Kevin’s Mazes hub',worker:'kevins-mazes',assets:'public'},
 'big-cahuna':{name:'The Big Cahuna Run',worker:'the-big-cahuna-run',assets:'dist'},
 'maze-chase':{name:'Maze Chase',worker:'kevins-maze-chase',assets:'dist'},
};
const repo='kaybarax/kevins-mazes';
function run(command,args,{cwd=root,json=false,input,quiet=false}={}){
 const r=spawnSync(command,args,{cwd,encoding:'utf8',input:input===undefined?undefined:JSON.stringify(input),maxBuffer:20*1024*1024});
 if(r.error)throw r.error;
 if(!quiet&&!json){process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');}
 if(r.status!==0)throw Error(`${command} failed: ${r.stderr||r.stdout}`);
 return json?JSON.parse(r.stdout):r.stdout.trim();
}
function api(endpoint,body){return run('gh',['api',`repos/${repo}/${endpoint}`,'--method','POST','--input','-'],{json:true,input:body});}
async function files(dir,prefix=''){
 const result=[];for(const entry of await readdir(path.join(dir,prefix),{withFileTypes:true})){
  if(entry.name.startsWith('.'))continue;const file=path.join(prefix,entry.name);
  if(entry.isDirectory())result.push(...await files(dir,file));else result.push(file);
 }return result;
}
export async function verifyAssets(directory,url){
 const all=await files(directory);
 for(let start=0;start<all.length;start+=4)await Promise.all(all.slice(start,start+4).map(async file=>{
  const response=await fetch(`${url}/${file.split(path.sep).map(encodeURIComponent).join('/')}`,{cache:'no-store'});
  if(!response.ok)throw Error(`Live asset failed: ${file} (${response.status})`);
  const digest=data=>createHash('sha256').update(data).digest('hex');
  if(digest(Buffer.from(await response.arrayBuffer()))!==digest(await readFile(path.join(directory,file))))throw Error(`Live asset differs from the built source: ${file}`);
 }));
 return all.length;
}
async function main(){
 const key=process.argv[2];if(!targets[key])throw Error('Usage: node scripts/deploy.mjs game-hub|big-cahuna|maze-chase');
 const target=targets[key],cwd=path.join(root,key),url=`https://${target.worker}.the-big-cahuna-run.workers.dev`;
 if(run('git',['status','--porcelain'],{quiet:true}))throw Error('Commit and push changes before deploying so the GitHub record identifies the exact source.');
 const sha=run('git',['rev-parse','HEAD'],{quiet:true});
 run('gh',['api',`repos/${repo}/commits/${sha}`],{json:true});
 if(key!=='game-hub')run('npm',['run','build'],{cwd});
 const deployment=api('deployments',{ref:sha,environment:key,auto_merge:false,required_contexts:[],production_environment:true,description:`Deploy ${target.name} to Cloudflare`,payload:{provider:'cloudflare-workers',worker:target.worker,url,source_sha:sha}});
 const status=(state,description)=>api(`deployments/${deployment.id}/statuses`,{state,description:description.slice(0,140),environment_url:url,log_url:`https://github.com/${repo}/commit/${sha}`,auto_inactive:state==='success'});
 try{
  status('in_progress','Wrangler upload and live asset verification running');
  const wrangler=path.join(root,'maze-chase/node_modules/.bin/wrangler');
  const output=run(wrangler,['deploy'],{cwd});
  const count=await verifyAssets(path.join(cwd,target.assets),url);
  if(key!=='game-hub'){
   const health=await fetch(url+'/api/health').then(r=>r.json());if(!health.ok)throw Error('Live game health check failed');
  }
  const version=output.match(/Current Version ID:\s*([a-f0-9-]+)/i)?.[1]||'see Wrangler output';
  status('success',`Verified ${count} live assets; Cloudflare version ${version}`);
  console.log(`Recorded successful GitHub deployment ${deployment.id}: ${url}`);
 }catch(error){status('failure',error.message);throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
