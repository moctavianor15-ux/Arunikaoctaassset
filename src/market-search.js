import {identifyAsset} from './asset-identity.js';
// Pencarian web Cloudflare menggunakan AI Gateway credits / key penyedia, BUKAN kuota Workers AI gratis.
// HANYA setelah izin eksplisit pengguna dan variabel MARKET_SEARCH_ENABLED=true.
export const searchEnabled=env=>String(env.MARKET_SEARCH_ENABLED||'').toLowerCase()==='true';
const moneyPattern=/\bRp\.?\s*([0-9][0-9.,\s]{0,15})(?:\s*(juta|jt|miliar|milyar|M|ribu|rb))?\b/gi;
function parseIDR(text){
 const prices=[];for(const m of String(text||'').matchAll(moneyPattern)){
  let n=m[1].trim().replace(/\s/g,'');
  const unit=(m[2]||'').toLowerCase(),scale=/^(juta|jt)$/.test(unit)?1e6:/^(miliar|milyar|m)$/.test(unit)?1e9:/^(ribu|rb)$/.test(unit)?1e3:1;
  if(scale!==1){n=n.replace(/,/g,'.');if(/^\d+(\.\d{1,2})?$/.test(n))n=Number(n);else continue}
  else {n=n.replace(/[.,]/g,'');if(!/^\d+$/.test(n))continue;n=Number(n)}
  const value=Math.round(n*scale);
  if(Number.isSafeInteger(value))prices.push(value);
 }return prices;
}
function comparable(item,profile){
 if(!item||typeof item.url!=='string'||!/^https:\/\//i.test(item.url))return null;
 let parsed;try{parsed=new URL(item.url);if(parsed.username||parsed.password||parsed.hostname==='localhost'||!parsed.hostname.includes('.'))return null}catch{return null}
 const title=String(item.title||'').slice(0,180),description=String(item.description||'').slice(0,480),text=(title+' '+description).toLowerCase();
 if(profile.model&&!text.includes(profile.model.toLowerCase()))return null;
 if(profile.brand&&!text.includes(profile.brand.toLowerCase())&&!(profile.brand==='Apple'&&/iphone/i.test(text))&&!(profile.brand==='Toyota'&&/fortuner|avanza|innova|rush|yaris|agya/i.test(text)))return null;
 if(profile.year&&!new RegExp('(?:^|\\D)'+profile.year+'(?:\\D|$)').test(text))return null;
 if(profile.transmission&&!(profile.transmission==='MT'?/\bmt\b|m\/t|manual/i:/\bat\b|a\/t|matic|automatic|otomatis/i).test(text))return null;
 if(profile.storageGB&&!new RegExp('(?:^|\\D)'+profile.storageGB+'\\s*(?:g|gb)(?:\\D|$)','i').test(text))return null;
 if(profile.variant){
  const v=profile.variant.toLowerCase();
  if(!text.includes(v))return null;
  if(v==='pro'&&/\bpro\s*max\b/.test(text))return null;
  if(v==='pro max'&&!/\bpro\s*max\b/.test(text))return null;
 }
 const min=profile.kind==='car'?30000000:profile.kind==='bike'?3000000:150000,max=['car','bike'].includes(profile.kind)?3000000000:150000000;
 // Tolak hasil berisi DP/cicilan supaya angkanya tidak dianggap harga penuh.
 if(/(?:^|\W)(?:DP|uang muka|cicilan|angsuran)(?:\W|$)/i.test(text))return null;
 const prices=parseIDR(title+' '+description).filter(p=>p>=min&&p<=max);
 // Harga harus disebut dalam teks sumber; tidak pernah dibuat oleh model.
 if(!prices.length)return null;
 const price=prices[0];
 return {title,url:parsed.href.slice(0,700),price,note:'Harga tercantum dalam cuplikan penawaran; belum diverifikasi sebagai harga transaksi.'};
}
export async function findMarketOffers(env,asset){
 const identity=identifyAsset(asset);
 if(!searchEnabled(env))return {status:'disabled',identity,sources:[],prices:[],note:'Pencarian pasar berbayar belum diaktifkan oleh pemilik situs.'};
 if(!env.AI||typeof env.AI.websearch!=='function')return {status:'unsupported',identity,sources:[],prices:[],note:'Runtime Cloudflare belum mendukung Web Search API.'};
 if(!identity.query||identity.matchLevel==='kurang')return {status:'incomplete',identity,sources:[],prices:[],note:'Nama aset belum cukup spesifik untuk pencarian yang dapat dibandingkan.'};
 try{
  const response=await env.AI.websearch({gatewayId:'default',provider:'ceramic',query:identity.query.slice(0,250),limit:7});
  if(!response.ok)throw Object.assign(Error('Web search returned HTTP '+response.status),{status:response.status});
  const raw=await response.json();const rows=Array.isArray(raw.items)?raw.items:[];
  const unique=new Set(),sources=[];
  for(const item of rows){const row=comparable(item,identity);if(!row||unique.has(row.url))continue;unique.add(row.url);sources.push(row);if(sources.length>=5)break}
  if(sources.length<2)return {status:'insufficient',identity,prices:[],sources,note:'Ditemukan kurang dari dua penawaran dengan spesifikasi dan angka harga yang cocok; tidak membuat rata-rata pasar.'};
  const prices=sources.map(x=>x.price).sort((a,b)=>a-b),median=prices[Math.floor(prices.length/2)],within=prices.filter(p=>p>=median*.5&&p<=median*2);
  if(within.length<2)return {status:'insufficient',identity,prices:[],sources,note:'Harga penawaran terlalu berbeda; diperlukan pemeriksaan manual.'};
  return {status:'offers',identity,sources,prices:within,note:'Data berasal dari cuplikan hasil pencarian saat diminta. Ini harga penawaran, bukan transaksi terkonfirmasi; pastikan relevansi dan tanggal listing.'};
 }catch(e){
  // Tidak pernah mencetak asset, prompt atau URL pribadi ke log.
  console.warn('[Arunika market] search unavailable',Number(e?.status||0));
  return {status:'unavailable',identity,sources:[],prices:[],note:'Pencarian pasar tidak tersedia atau kredit AI Gateway habis; estimasi biasa tetap dapat digunakan.'};
 }
}
export const extractPriceCandidates=parseIDR;
