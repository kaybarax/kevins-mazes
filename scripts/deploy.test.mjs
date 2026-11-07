import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {verifyAssets} from './deploy.mjs';
test('live verification rejects changed and missing assets',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'maze-deploy-'));
 await writeFile(path.join(dir,'index.html'),'expected');
 let body='expected',status=200;
 const server=createServer((req,res)=>{res.writeHead(status);res.end(body);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}`;
 try {
  assert.equal(await verifyAssets(dir,url),1);
  body='old build';await assert.rejects(verifyAssets(dir,url),/differs/);
  status=404;await assert.rejects(verifyAssets(dir,url),/404/);
 } finally {await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
