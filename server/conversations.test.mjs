import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scryptSync,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'timi-test-'));
const child=spawn(process.execPath,['server/conversations.mjs'],{env:{...process.env,TIMI_DATA_DIR:dir,TIMI_LOG_PORT:'3199',TIMI_LOG_SECRET:'test-secret',TIMI_ADMIN_HASH:'salt:'+scryptSync('test-password','salt',64).toString('hex')},stdio:'ignore'});
let cookie='';
async function req(path,method='GET',data,origin='https://timi.store'){return fetch('http://127.0.0.1:3199'+path,{method,headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie,Authorization:'Bearer test-secret'},body:data?JSON.stringify(data):undefined});}
try{
 for(let i=0;i<50;i++){try{await req('/');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.equal((await req('/api/admin/conversations')).status,401);
 assert.equal((await req('/api/admin/login','POST',{password:'test-password'},'https://evil.test')).status,403);
 assert.equal((await req('/api/admin/login','POST',{password:'bad'})).status,401);
 const login=await req('/api/admin/login','POST',{password:'test-password'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 const baseline=await(await req('/api/admin/notifications')).json();assert.equal(baseline.items.length,0);
 const conversation=randomUUID();const {id}=await(await req('/internal/turns','POST',{action:'begin',conversation,question:'你好，中文保存测试'})).json();assert.ok(id);
 const fresh=await(await req('/api/admin/notifications?after='+baseline.cursor)).json();assert.equal(fresh.items.length,1);assert.equal(fresh.items[0].conversation,conversation);assert.equal(fresh.unread,1);
 assert.equal((await(await req('/api/admin/notifications')).json()).items.length,0);
 await req('/internal/turns','POST',{action:'finish',id,answer:'你好，测试回答',status:'answered'});
 assert.equal((await(await req('/api/admin/notifications?after='+fresh.cursor)).json()).items.length,0);
 let b=await(await req('/api/admin/conversations?q='+encodeURIComponent('中文'))).json();assert.equal(b.items.length,1);assert.equal(b.items[0].unread,1);
 b=await(await req('/api/admin/conversations/'+conversation)).json();assert.equal(b.items[0].question,'你好，中文保存测试');assert.equal(b.items[0].answer,'你好，测试回答');
 await req('/api/admin/conversations/'+conversation,'POST',{action:'read',through:Date.now()});b=await(await req('/api/admin/conversations')).json();assert.equal(b.items[0].unread,0);
 assert.equal((await req('/api/admin/conversations/'+conversation,'DELETE',undefined,'https://evil.test')).status,403);
 await req('/api/admin/conversations/'+conversation,'DELETE');b=await(await req('/api/admin/conversations')).json();assert.equal(b.items.length,0);assert.equal((await(await req('/api/admin/notifications?after='+fresh.cursor)).json()).unread,0);
 await req('/api/admin/logout','POST',{});assert.equal((await req('/api/admin/conversations')).status,401);assert.equal((await req('/api/admin/notifications')).status,401);
 console.log('PASS: auth, CSRF, cookies, persistence, search, unread, delete, logout');
}finally{child.kill();await new Promise(r=>child.once('exit',r));rmSync(dir,{recursive:true,force:true});}
