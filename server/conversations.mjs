import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
const dir=process.env.TIMI_DATA_DIR || './.data';
mkdirSync(dir,{recursive:true,mode:0o700});
const db=new DatabaseSync(`${dir}/conversations.sqlite`);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS turns(id TEXT PRIMARY KEY, conversation TEXT NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS turns_conversation ON turns(conversation,created); CREATE TABLE IF NOT EXISTS notifications(seq INTEGER PRIMARY KEY AUTOINCREMENT, conversation TEXT NOT NULL, created INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, expires INTEGER NOT NULL);`);
const age=30*86400000;
function purge(){db.prepare('DELETE FROM notifications WHERE created < ?').run(Date.now()-age);db.prepare('DELETE FROM turns WHERE created < ?').run(Date.now()-age);db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());}
purge();setInterval(purge,60000).unref();
const hash=s=>createHash('sha256').update(s).digest('hex');
const eq=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
const attempts=new Map();
function json(res,status,value,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",...extra});res.end(JSON.stringify(value));}
async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>48000)throw new Error('too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
function cookie(req){return (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('timi_admin='))?.slice(11)||'';}
const cookieValue=(token,seconds)=>`timi_admin=${token}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/internal/turns'&&req.method==='POST'){
  if(!process.env.TIMI_LOG_SECRET||!eq(req.headers.authorization,`Bearer ${process.env.TIMI_LOG_SECRET}`))return json(res,403,{error:'Forbidden'});
  const b=await body(req);const now=Date.now();
  if(b.action==='begin'){
   if(!/^[a-f0-9-]{36}$/.test(b.conversation)||typeof b.question!=='string'||!b.question.trim()||b.question.length>6000)return json(res,400,{error:'Invalid message'});
   const id=randomBytes(24).toString('hex');db.exec('BEGIN');try{db.prepare('INSERT INTO turns(id,conversation,question,status,created,updated) VALUES(?,?,?,?,?,?)').run(id,b.conversation,b.question,'pending',now,now);db.prepare('INSERT INTO notifications(conversation,created) VALUES(?,?)').run(b.conversation,now);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return json(res,200,{id});
  }
  if(b.action==='finish'&&typeof b.id==='string'&&['answered','error','cancelled'].includes(b.status)){
   db.prepare('UPDATE turns SET answer=?,status=?,updated=?,seen=0 WHERE id=?').run(String(b.answer||'').slice(0,6000),b.status,now,b.id);return json(res,200,{ok:true});
  }
  return json(res,400,{error:'Invalid request'});
 }
 if(!u.pathname.startsWith('/api/admin/'))return json(res,404,{error:'Not found'});
 const adminOrigins=(process.env.TIMI_ADMIN_ORIGINS||'https://timi.store,https://www.timi.store').split(',').map(v=>v.trim()).filter(Boolean);
 if(req.method!=='GET'&&!adminOrigins.includes(req.headers.origin))return json(res,403,{error:'请从管理台操作。'});
 if(u.pathname==='/api/admin/login'&&req.method==='POST'){
  const ip=req.headers['x-real-ip']||req.socket.remoteAddress; const now=Date.now();
  if(attempts.size>5000)for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);
  const a=attempts.get(ip);if(a&&a.until>now&&a.count>=5)return json(res,429,{error:'尝试过多，请15分钟后再试。'});
  const b=await body(req);const [salt,digest]=(process.env.TIMI_ADMIN_HASH||'').split(':');
  const good=typeof b.password==='string'&&b.password.length<=200&&salt&&digest&&eq(scryptSync(b.password,salt,64).toString('hex'),digest);
  if(!good){attempts.set(ip,{count:a&&a.until>now?a.count+1:1,until:a&&a.until>now?a.until:now+900000});return json(res,401,{error:'密码不正确。'});}
  attempts.delete(ip);const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?)').run(hash(token),now+8*3600000);return json(res,200,{ok:true},{'Set-Cookie':cookieValue(token,28800)});
 }
 const token=cookie(req);if(!token||!db.prepare('SELECT token FROM sessions WHERE token=? AND expires>?').get(hash(token),Date.now()))return json(res,401,{error:'请先登录。'});
 if(u.pathname==='/api/admin/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));return json(res,200,{ok:true},{'Set-Cookie':cookieValue('',0)});}
 purge();
 if(u.pathname==='/api/admin/notifications'&&req.method==='GET'){
  const latest=db.prepare("SELECT COALESCE(seq,0) AS cursor FROM sqlite_sequence WHERE name='notifications'").get()?.cursor||0;
  const raw=u.searchParams.get('after');const after=raw===null?latest:Number(raw);
  if(!Number.isSafeInteger(after)||after<0)return json(res,400,{error:'Invalid cursor'});
  const items=db.prepare('SELECT seq,conversation FROM notifications WHERE seq>? ORDER BY seq LIMIT 100').all(after);
  const unread=db.prepare('SELECT COUNT(*) AS count FROM turns WHERE seen=0').get().count;
  return json(res,200,{items,cursor:items.length?items.at(-1).seq:Math.max(after,latest),unread});
 }
 if(u.pathname==='/api/admin/conversations'&&req.method==='GET'){
  const q=(u.searchParams.get('q')||'').slice(0,120);const from=Date.parse(u.searchParams.get('from')||'')||0;const to=Date.parse(u.searchParams.get('to')||'')||Date.now();const offset=Math.max(0,Math.min(100000,Math.floor(Number(u.searchParams.get('offset')))||0));
  const rows=db.prepare(`SELECT conversation AS id,MIN(created) AS started,MAX(updated) AS updated,COUNT(*) AS count,SUM(CASE WHEN seen=0 THEN 1 ELSE 0 END) AS unread, SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors FROM turns WHERE conversation IN (SELECT DISTINCT conversation FROM turns WHERE created>=? AND created<=? AND (instr(question,?)>0 OR instr(answer,?)>0)) GROUP BY conversation ORDER BY updated DESC LIMIT 51 OFFSET ?`).all(from,to,q,q,offset);
  const more=rows.length>50;return json(res,200,{items:rows.slice(0,50).map(r=>({...r,preview:db.prepare('SELECT question FROM turns WHERE conversation=? ORDER BY created LIMIT 1').get(r.id).question})),more});
 }
 const match=u.pathname.match(/^\/api\/admin\/conversations\/([a-f0-9-]{36})$/);
 if(match){const id=match[1];
  if(req.method==='GET')return json(res,200,{items:db.prepare('SELECT id,question,answer,status,created,updated FROM turns WHERE conversation=? ORDER BY created').all(id)});
  if(req.method==='POST'){const b=await body(req);if(b.action!=='read')return json(res,400,{error:'Invalid action'});db.prepare('UPDATE turns SET seen=1 WHERE conversation=? AND updated<=?').run(id,Math.min(Date.now(),Number(b.through)||0));return json(res,200,{ok:true});}
  if(req.method==='DELETE'){db.prepare('DELETE FROM turns WHERE conversation=?').run(id);db.prepare('DELETE FROM notifications WHERE conversation=?').run(id);return json(res,200,{ok:true});}
 }
 return json(res,404,{error:'Not found'});
}catch{json(res,500,{error:'操作失败，请稍后重试。'});}}).listen(Number(process.env.TIMI_LOG_PORT||3102),'127.0.0.1');
