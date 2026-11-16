import {digest,token,verifyPassword,credentialVersion} from './auth.js';
import {valid} from './validate.js';
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8',...headers}});
const fail=(message,status)=>{throw Object.assign(Error(message),{status})};
const cookie=t=>`__Host-arunika=${t}; Path=/; HttpOnly; Secure; SameSite=Strict${t?'':'; Max-Age=0'}`;
function harden(response){
 const r=new Response(response.body,response); const h=r.headers;
 h.set('Cache-Control','no-store');h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','no-referrer');h.set('X-Frame-Options','DENY');
 h.set('Strict-Transport-Security','max-age=31536000');h.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 h.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.coinbase.com https://api.gold-api.com https://api.frankfurter.dev; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");return r;
}
async function body(req,max){
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail('Gunakan JSON.',415);
 if(Number(req.headers.get('content-length'))>max)fail('Data terlalu besar.',413);
 const reader=req.body?.getReader();if(!reader)fail('Data kosong.',400);
 const chunks=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail('Data terlalu besar.',413)}chunks.push(value)}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail('JSON tidak valid.',400)}
}
async function limit(env,key,max,now){
 const row=await env.DB.prepare('INSERT INTO attempts(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count').bind(key,now+900,now,now).first();
 if(row.count>max)fail('Terlalu banyak percobaan. Tunggu 15 menit lalu coba kembali.',429);
}
async function session(req,env,now){
 const raw=req.headers.get('cookie')?.match(/(?:^|;\s*)__Host-arunika=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!raw)return null;
 return await env.DB.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires>? AND credential_version=?').bind(digest(raw),now,credentialVersion(env)).first();
}
async function route(req,env){
 const u=new URL(req.url),p=u.pathname,now=Math.floor(Date.now()/1000);
 if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))return Response.redirect('https://'+u.host+u.pathname+u.search,308);
 const publicPaths=new Set(['/','/index.html','/login','/login.html','/login.js','/style.css','/landscape.svg','/loading.js','/loading.css','/app.js','/portfolio.js']);
 if(publicPaths.has(p)&&['GET','HEAD'].includes(req.method)){
  return env.ASSETS.fetch(req);
 }
 if(!env.DB)fail('Database belum terhubung. Tambahkan binding D1 bernama DB, lalu deploy ulang.',503);
 if(!env.AUTH_USERNAME||!env.AUTH_PASSWORD_HASH)fail('Login belum dikonfigurasi. Tambahkan Secrets AUTH_USERNAME dan AUTH_PASSWORD_HASH, lalu deploy ulang.',503);
 if(!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(env.AUTH_PASSWORD_HASH))fail('Format AUTH_PASSWORD_HASH salah. Gunakan hasil npm run password, bukan password biasa.',503);
 if(!['GET','HEAD'].includes(req.method)&&req.headers.get('origin')!==u.origin)fail('Permintaan lintas situs ditolak.',403);
 if(p==='/api/login'&&req.method==='POST'){
  await limit(env,'global',100,now);
  await limit(env,'ip:'+digest(req.headers.get('CF-Connecting-IP')||'local'),10,now);
  const b=await body(req,2048);
  if(typeof b.username!=='string'||typeof b.password!=='string'||b.password.length>128||b.username.length>80)fail('Username atau password salah.',401);
  const ok=verifyPassword(b.password,env.AUTH_PASSWORD_HASH);
  if(!ok||b.username!==env.AUTH_USERNAME)fail('Username atau password salah.',401);
  await env.DB.prepare('DELETE FROM sessions WHERE expires<=?').bind(now).run();
  await env.DB.prepare('DELETE FROM attempts WHERE expires<=?').bind(now).run();
  const t=token();await env.DB.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(digest(t),credentialVersion(env),now+28800).run();
  return json({ok:true},200,{'Set-Cookie':cookie(t)});
 }
 const s=await session(req,env,now);
 if(!s){if(p.startsWith('/api/'))fail('Sesi berakhir. Silakan masuk kembali.',401);return Response.redirect(u.origin+'/login',302)}
 if(p==='/api/session'&&req.method==='GET')return json({username:env.AUTH_USERNAME});
 if(p==='/api/logout'&&req.method==='POST'){
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(s.token_hash).run();return json({ok:true},200,{'Set-Cookie':cookie('')});
 }
 if(p==='/api/portfolio'&&req.method==='GET'){
  const r=await env.DB.prepare('SELECT * FROM portfolio WHERE id=1').first();if(!r)fail('Database belum diinisialisasi. Jalankan migrations/0001.sql di D1 Console.',503);return json({state:JSON.parse(r.data),revision:r.revision,updatedAt:r.updated_at});
 }
 if(p==='/api/portfolio'&&req.method==='PUT'){
  const b=await body(req,3000000);
  if(!valid(b.state)||!Number.isSafeInteger(b.revision)||b.revision<0)fail('Data aset tidak valid.',400);
  const r=await env.DB.prepare('UPDATE portfolio SET data=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=? RETURNING revision').bind(JSON.stringify(b.state),now,b.revision).first();
  if(!r)fail('Data telah berubah di tab atau perangkat lain. Unduh cadangan bila diperlukan, lalu muat ulang halaman.',409);
  return json({revision:r.revision,updatedAt:now});
 }
 if(p.startsWith('/api/'))fail('Endpoint tidak ditemukan.',404);
 if(!['GET','HEAD'].includes(req.method))fail('Metode tidak diizinkan.',405);
 return env.ASSETS.fetch(req);
}
export default {
 async fetch(req,env){try{return harden(await route(req,env))}catch(e){if(/no such table|no such column/i.test(e.message||''))e=Object.assign(Error('Struktur database belum siap. Jalankan migrations/0001.sql di D1 Console, lalu coba kembali.'),{status:503});return harden(json({error:e.status?e.message:'Layanan belum dapat memproses permintaan. Coba kembali.'},e.status||500))}},
 async scheduled(event,env){const now=Math.floor(Date.now()/1000);await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires<=?').bind(now),env.DB.prepare('DELETE FROM attempts WHERE expires<=?').bind(now)])}
};
