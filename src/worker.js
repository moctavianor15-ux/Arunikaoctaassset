import {duties} from './duties.js';
import {digest,token,verifyPassword,credentialVersion} from './auth.js';
import {valid} from './validate.js';
import {assessInput,estimateAI,fallbackEstimate,valuedKinds,modelNames,diagnoseAI,aiBackendVersion} from './valuation-ai.js';
import {identifyAsset} from './asset-identity.js';
import {findMarketOffers,searchEnabled} from './market-search.js';
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8',...headers}});
const fail=(message,status,code)=>{throw Object.assign(Error(message),{status,code})};
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
async function limit(env,key,max,now,ttl=900){
 const row=await env.DB.prepare('INSERT INTO attempts(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count').bind(key,now+ttl,now,now).first();
 if(row.count>max)fail(key==='ai-day'?'Batas 30 permintaan AI Arunika per hari tercapai. Coba lagi setelah 00.00 UTC.':'Terlalu banyak percobaan. Tunggu 15 menit lalu coba kembali.',429);
}
async function session(req,env,now){
 const raw=req.headers.get('cookie')?.match(/(?:^|;\s*)__Host-arunika=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!raw)return null;
 return await env.DB.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires>? AND credential_version=?').bind(digest(raw),now,credentialVersion(env)).first();
}
async function route(req,env){
 const u=new URL(req.url),p=u.pathname,now=Math.floor(Date.now()/1000);
 if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))return Response.redirect('https://'+u.host+u.pathname+u.search,308);
 const publicPaths=new Set(['/','/index.html','/login','/login.html','/login.js','/style.css','/landscape.svg','/loading.js','/loading.css','/app.js','/portfolio.js','/cashflow.js','/ai-valuation.js','/favicon.ico','/favicon.png','/icon-192.png','/icon-512.png','/apple-touch-icon.png','/logo-arunika.webp','/logo-arunika.png','/site.webmanifest']);
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
 if(p==='/api/duties'){
  try{return json(await duties(req,env.DB,body))}
  catch(e){if(/no such table: duty_costs|no such column: assignment_id|has no column named assignment_id/i.test(e.message))fail('Jalankan migrations/0005_biaya_klaim_penugasan.sql pada database D1 produksi terlebih dahulu.',503);if(/no such table: duty_colors/i.test(e.message))fail('Jalankan migrations/0004_warna_penugasan.sql pada D1 kalender.',503);if(/no such table: duty_submissions|no such column: (transport|other|detail)|has no column named (transport|other|detail)/i.test(e.message))fail('Jalankan migrations/0003_biaya_penugasan.sql pada D1 kalender.',503);if(/no such table: duty_days/i.test(e.message))fail('Kalender belum aktif. Jalankan migrations/0002_penugasan.sql di D1 Console.',503);throw e}
 }
 if(p==='/api/session'&&req.method==='GET')return json({username:env.AUTH_USERNAME});
 if(p==='/api/logout'&&req.method==='POST'){
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(s.token_hash).run();return json({ok:true},200,{'Set-Cookie':cookie('')});
 }
 if(p==='/api/ai/status'&&req.method==='GET'){
  // Memeriksa binding saja, TIDAK memanggil model dan tidak memakan kuota.
  return json({configured:!!(env.AI&&typeof env.AI.run==='function'),version:aiBackendVersion,provider:'Cloudflare Workers AI',model:modelNames[0],backupModel:modelNames[1],tested:false,marketRealtime:searchEnabled(env)&&typeof env.AI?.websearch==='function',marketSearchEnabled:searchEnabled(env),freeAllowance:'Alokasi gratis Workers AI berlaku sesuai kuota akun; pemakaian berlebih pada paket berbayar dapat ditagih.'});
 }
 if(p==='/api/ai/identify'&&req.method==='GET'){
  const kind=u.searchParams.get('kind')||'',name=u.searchParams.get('name')||'';
  if(!valuedKinds.includes(kind)||!name.trim()||name.length>90)fail('Nama dan kategori barang tidak valid.',400);
  return json({identity:identifyAsset({kind,name})});
 }
 if(p==='/api/ai/diagnose'&&req.method==='POST'){
  // Uji panggilan model yang sesungguhnya; hanya atas permintaan pengguna dan terbatas.
  await limit(env,'ai-diagnose-day',10,now,86400-now%86400);
  await limit(env,'ai-ip:'+digest(req.headers.get('CF-Connecting-IP')||'local'),20,now);
  return json(await diagnoseAI(env));
 }
 if(p==='/api/ai/estimate'&&req.method==='POST'){
  // Autentikasi, Origin dan rate-limit telah diterapkan sebelum panggilan AI.
  await limit(env,'ai-global',50,now);
  await limit(env,'ai-ip:'+digest(req.headers.get('CF-Connecting-IP')||'local'),20,now);
  const input=assessInput(await body(req,4096));
  if(!input)fail('Data perbandingan AI tidak valid.',400);
  const record=await env.DB.prepare('SELECT data FROM portfolio WHERE id=1').first();
  if(!record)fail('Data portofolio belum tersedia.',503);
  const asset=JSON.parse(record.data).assets?.find(a=>a.id===input.assetId);
  if(!asset||!valuedKinds.includes(asset.kind))fail('Aset yang dapat dinilai AI tidak ditemukan.',404);
  // Batas harian untuk mengurangi risiko konsumsi Neurons berlebihan; bukan jaminan tagihan nol.
  await limit(env,'ai-day',30,now,86400-now%86400);
  // Pencarian terbaru sengaja opsional: bisa berbayar. Wajib persetujuan di UI dan aktivasi di backend.
  let market=null;
  if(input.marketMode==='live'){
   if(!searchEnabled(env))market={status:'disabled',sources:[],prices:[],note:'Pencarian berbayar belum diaktifkan dalam konfigurasi situs.'};
   else {await limit(env,'ai-market-day',10,now,86400-now%86400);market=await findMarketOffers(env,{...asset,name:input.itemName||asset.name})}
  }
  let advice;
  try{advice=await estimateAI(env,asset,input,new Date(),market)}
  catch(e){
   // Hanya kegagalan layanan AI yang boleh memakai hasil fallback, bukan input/kesalahan database.
   if(!['AI_QUOTA','AI_ACCESS','AI_MODEL_UNAVAILABLE','AI_BAD_RESPONSE','AI_PROVIDER_ERROR','AI_BINDING_MISSING'].includes(e.code))throw e;
   console.warn('[Arunika AI] using non-AI fallback',aiBackendVersion,e.code);
   advice=fallbackEstimate(asset,input,new Date(),market);
  }
  return json({advice});
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
 async fetch(req,env){try{return harden(await route(req,env))}catch(e){
  if(/no such table|no such column/i.test(e.message||''))e=Object.assign(Error('Struktur database belum siap. Jalankan migrations/0001.sql di D1 Console, lalu coba kembali.'),{status:503,code:'DATABASE_SCHEMA'});
  const aiRequest=new URL(req.url).pathname.startsWith('/api/ai/');
  const requestId=aiRequest?crypto.randomUUID().slice(0,8):undefined;
  const code=typeof e.code==='string'&&/^[A-Z_]{3,40}$/.test(e.code)?e.code:(aiRequest?'AI_UNEXPECTED':'REQUEST_FAILED');
  if(aiRequest)console.warn('[Arunika AI] request error:',aiBackendVersion,requestId,code,'HTTP',e.status||500);
  return harden(json({error:e.status?e.message:'Layanan belum dapat memproses permintaan. Coba kembali.',...(aiRequest?{code,requestId,version:aiBackendVersion}:{})},e.status||500));
 }},
 async scheduled(event,env){const now=Math.floor(Date.now()/1000);await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires<=?').bind(now),env.DB.prepare('DELETE FROM attempts WHERE expires<=?').bind(now)])}
};
