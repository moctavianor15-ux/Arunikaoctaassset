import {identifyAsset} from './asset-identity.js';
// Arunika V10: saran AI Cloudflare. Seluruh nilai akhir divalidasi/dihitung di server.
// Model gratis-terdukung (dalam alokasi Workers AI), failover maksimal 2 percobaan.
export const valuedKinds=['house','car','bike','phone','electronics'];
export const modelNames=['@cf/zai-org/glm-4.7-flash','@cf/google/gemma-4-26b-a4b-it'];
export const modelName=modelNames[0];
export const aiBackendVersion='v11-2026-11-16';
const cap=(n,min,max)=>Math.max(min,Math.min(max,n));
const validMoney=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e15;
function projection(value,date,direction,rate,today){
 const from=Date.parse(date+'T00:00:00Z'),to=Date.parse(today+'T00:00:00Z');
 if(!Number.isFinite(from)||!Number.isFinite(to))return value;
 const years=Math.max(0,(to-from)/86400000/365.2425);
 return cap(value*Math.pow(direction==='up'?1+rate/100:direction==='down'?1-rate/100:1,years),0,1e15);
}
export function baseline(a,today=new Date().toISOString().slice(0,10)){
 if(a.kind==='house'){
  if(a.valuationMode==='auto')return projection(a.land,a.acquiredAt,'up',a.landRate,today)+projection(a.building,a.acquiredAt,'down',a.buildingRate,today);
  return a.land+a.building;
 }
 if(a.kind==='phone'||a.kind==='electronics')return a.valuationMode==='auto'?projection(a.purchasePrice,a.acquiredAt,a.direction,a.annualRate,today):a.amount;
 if(a.kind==='car'||a.kind==='bike')return a.valuationMode==='auto'?projection(a.amount,a.acquiredAt,a.direction,a.annualRate,today):a.amount;
 return null;
}
export function assetSignature(a){
 return JSON.stringify([a.kind,a.name,a.land,a.building,a.amount,a.purchasePrice,a.acquiredAt,a.direction,a.annualRate,a.valuationMode,a.landRate,a.buildingRate,a.deviceType]);
}
// Cloudflare legacy mengembalikan {response}, model-model terkini memakai choices[].message.content.
export function parseReply(reply){
 const content=typeof reply==='string'?reply:
  reply?.choices?.[0]?.message?.content??reply?.response??reply?.result?.response??reply?.output_text??null;
 if(content&&typeof content==='object'&&!Array.isArray(content)&&Object.hasOwn(content,'adjustment'))return checkReply(content);
 const raw=Array.isArray(content)?content.map(part=>typeof part==='string'?part:part?.text??'').join('\n'):content;
 if(typeof raw!=='string'||!raw.trim())throw Error('Respons AI kosong atau tidak dikenali.');
 const clean=raw.replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
 // Terima JSON murni, JSON berfence, atau JSON dengan pengantar teks (tanpa menelan data lain).
 const attempts=[clean,clean.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim()];
 for(let i=0;i<clean.length;i++){
  if(clean[i]!=='{')continue;
  let depth=0,quoted=false,escaped=false;
  for(let j=i;j<clean.length;j++){
   const c=clean[j];
   if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
   if(c==='"'){quoted=true;continue}
   if(c==='{')depth++;
   if(c==='}'&&--depth===0){attempts.push(clean.slice(i,j+1));break}
  }
 }
 for(const item of attempts){
  try{return checkReply(JSON.parse(item))}
  catch(e){if(e?.code==='INVALID_ADVICE')throw e}
 }
 throw Error('AI tidak mengirimkan JSON penilaian yang dapat diverifikasi.');
}
function checkReply(data){
 const adjustment=typeof data?.adjustment==='string'&&/^\d+(?:\.\d+)?$/.test(data.adjustment)?Number(data.adjustment):data?.adjustment;
 const reason=typeof data?.explanation==='string'?data.explanation.trim():'';
 if(!Number.isFinite(adjustment)||adjustment<0.9||adjustment>1.1||!reason||reason.length>400){
  const err=Error('Faktor penilaian AI di luar batas atau alasan tidak valid.');err.code='INVALID_ADVICE';throw err;
 }
 return {adjustment,explanation:reason};
}
export function assessInput(request){
 if(!request||typeof request.assetId!=='string'||!/^[-\w]{1,80}$/.test(request.assetId))return null;
 if(!['new','good','fair','poor'].includes(request.condition)||typeof request.note!=='string'||request.note.length>180)return null;
 if(!Array.isArray(request.comparables)||request.comparables.length>3||!request.comparables.every(v=>Number.isSafeInteger(v)&&v>0&&v<=1e15))return null;
 if(request.marketMode!==undefined&&!['free','live'].includes(request.marketMode))return null;
 if(request.marketMode==='live'&&request.consentPaidSearch!==true)return null;
 if(request.itemName!==undefined&&(typeof request.itemName!=='string'||!request.itemName.trim()||request.itemName.length>90))return null;
 if(typeof request.sourceUrl!=='string'||request.sourceUrl.length>300||request.sourceUrl&&(!/^https:\/\/[^\s]+$/i.test(request.sourceUrl)||request.sourceUrl.includes('@')))return null;
 return request;
}
// Klasifikasi sengaja tidak meneruskan pesan mentah provider ke browser (potensi data internal).
function aiFailureType(e){
 const s=String(e?.message||''),status=Number(e?.status||e?.statusCode||0),code=Number(e?.code||0);
 if(code===3036||/daily.*(?:allocation|quota)|neurons?.*(?:exhausted|depleted)|account limited|insufficient credits/i.test(s))return 'quota';
 if(code===3040||/out of capacity/i.test(s))return 'capacity';
 if(status===429||code===429||/rate.limit|limit exceeded/i.test(s))return 'rate';
 if(status===401||status===403||code===5035||/billing|paid plan|permission denied|not authorized/i.test(s))return 'permission';
 if(status===404||status===410||code===5028||/deprecated|model.*not found|model.*not available/i.test(s))return 'model';
 if(/time.?out|timed out|deadline|aborted/i.test(s))return 'timeout';
 if(e?.code==='INVALID_ADVICE'||/JSON|respons AI kosong|format.*AI|respons AI tidak/i.test(s))return 'format';
 return 'temporary';
}
function serviceError(types){
 if(types.includes('quota'))return Object.assign(Error('Kuota atau kapasitas Cloudflare Workers AI sedang habis. Penilaian tidak dibuat; coba lagi nanti atau lihat menu Workers AI → Usage.'),{status:429,code:'AI_QUOTA'});
 if(types.every(t=>t==='permission'))return Object.assign(Error('Akses Cloudflare Workers AI ditolak. Periksa paket akun, binding AI Production, dan halaman Workers AI → Usage.'),{status:503,code:'AI_ACCESS'});
 if(types.every(t=>t==='model'))return Object.assign(Error('Model Workers AI tidak tersedia. Kedua model sudah dicoba. Pastikan backend Arunika V10 telah ter-deploy.'),{status:503,code:'AI_MODEL_UNAVAILABLE'});
 if(types.every(t=>t==='format'))return Object.assign(Error('Respons kedua model AI tidak sesuai format penilaian. Tidak ada nilai aset yang diubah.'),{status:503,code:'AI_BAD_RESPONSE'});
 return Object.assign(Error('Cloudflare Workers AI gagal merespons dengan benar setelah mencoba model utama dan cadangan. Gunakan kode referensi error untuk memeriksa log Cloudflare.'),{status:503,code:'AI_PROVIDER_ERROR'});
}
function aiOptions(messages,model,probe=false){
 const opts={messages,max_completion_tokens:probe?160:320,temperature:probe?0:0.15,stream:false};
 // Tanpa reasoning berpanjang-panjang yang sering memenuhi batas token output untuk jawaban JSON.
 if(model==='@cf/zai-org/glm-4.7-flash')opts.chat_template_kwargs={enable_thinking:false};
 return opts;
}
// Tes nyata end-to-end. Hanya dipanggil saat pengguna menekan tombol, bukan ketika halaman dimuat.
export async function diagnoseAI(env){
 if(!env.AI||typeof env.AI.run!=='function')throw Object.assign(Error('Binding Workers AI bernama AI tidak ditemukan pada Production. Tambahkan AI lalu deploy ulang.'),{status:503,code:'AI_BINDING_MISSING'});
 const failures=[];
 const messages=[{role:'system',content:'Balas tepat dalam satu objek JSON tanpa markdown. Jangan tampilkan proses berpikir.'},{role:'user',content:'Uji respons dalam Bahasa Indonesia. Balas JSON {"adjustment":1.0,"explanation":"Koneksi AI berfungsi."}'}];
 for(const model of modelNames){
  try{
   const data=parseReply(await env.AI.run(model,aiOptions(messages,model,true)));
   return {ok:true,model,version:aiBackendVersion,message:'Model AI berhasil menjawab dan format JSON penilaiannya valid.',sampleAdjustment:data.adjustment};
  }catch(e){
   const kind=aiFailureType(e);failures.push(kind);
   console.warn('[Arunika AI] diagnostic',aiBackendVersion,model,kind,'upstream',Number(e?.status||e?.statusCode||0)||0,Number(e?.code||0)||0);
   if(kind==='quota')break;
  }
 }
 throw serviceError(failures);
}
export async function estimateAI(env,a,req,now=new Date(),market=null){
 if(!env.AI||typeof env.AI.run!=='function')throw Object.assign(Error('Binding Workers AI bernama AI belum diatur pada Cloudflare Production. Tambahkan binding AI lalu deploy ulang.'),{status:503,code:'AI_BINDING_MISSING'});
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 const today=parts.year+'-'+parts.month+'-'+parts.day,base=baseline(a,today);
 if(!validMoney(base))throw Object.assign(Error('Nilai dasar aset belum valid.'),{status:400,code:'AI_BASE_INVALID'});
 const identity=identifyAsset({...a,name:req.itemName||a.name});
 const samples=[...req.comparables].sort((x,y)=>x-y);
 const searched=market?.status==='offers'&&market.prices.length>=2?market.prices:[];
 const sourcePrices=searched.length?searched:samples;
 const med=sourcePrices.length?(sourcePrices.length%2?sourcePrices[(sourcePrices.length-1)/2]:(sourcePrices[sourcePrices.length/2-1]+sourcePrices[sourcePrices.length/2])/2):null;
 const midpoint=med===null?base:base*(searched.length?.20:.35)+med*(searched.length?.80:.65);
 const prompt=[
  'Anda ahli penilaian indikatif aset pribadi di Indonesia. Tidak memiliki akses internet atau harga pasar realtime.',
  'Jawab satu JSON tanpa Markdown: {"adjustment":1.0,"explanation":"Satu kalimat singkat Bahasa Indonesia"}.',
  'adjustment HARUS angka 0.90–1.10. Pertimbangkan kondisi, umur dan spesifikasi. Jangan menciptakan data harga pasar.',
  'URL adalah referensi pengguna, bukan bukti telah mengunjungi situs. Tanpa pembanding, akui hanya asumsi penyusutan/kenaikan.',
  'Identifikasi barang berdasar nama, spesifikasi, tahun dan kapasitas. Jangan klaim model resmi tersedia tanpa verifikasi.',
  JSON.stringify({jenis:a.kind,nama:identity.name,identitasTerdeteksi:identity,tipe:a.deviceType||null,tanggalPerolehan:a.acquiredAt||null,hargaDasarRupiah:Math.round(base),kondisi:req.condition,catatan:req.note,hargaPembandingDariPengguna:req.comparables,hargaPenawaranDariPencarian:searched,referensiUser:req.sourceUrl||null,tanggalPenilaian:today})
 ].join('\n');
 const messages=[{role:'system',content:'Berikan hanya objek JSON berisi adjustment dan explanation, tanpa penalaran, tanpa klaim akses web.'},{role:'user',content:prompt}];
 const failures=[];
 for(const model of modelNames){
  try{
   // Disable panjang reasoning di GLM; meminta respons singkat untuk menghemat kuota gratis.
   const opts=aiOptions(messages,model);
   const response=await env.AI.run(model,opts);
   const data=parseReply(response);
   const amount=Math.round(cap(midpoint*data.adjustment,0,1e15));
   const spread=searched.length>=3?.16:searched.length>=2?.22:samples.length>=3?.13:samples.length>=1?.2:.30;
   return {
    amount,lower:Math.max(0,Math.round(amount*(1-spread))),upper:Math.min(1e15,Math.round(amount*(1+spread))),
    baseline:Math.round(base),asOf:now.toISOString(),model,
    confidence:searched.length>=2||samples.length>=3?'sedang':'rendah',sourceType:searched.length?'hasil-penelusuran':samples.length?'input-pengguna':'model-tanpa-data-pasar',
    reason:data.explanation,comparablesUsed:samples.length,comparablePrices:samples,sourceUrl:req.sourceUrl,
    condition:req.condition,signature:assetSignature(a),identity,marketStatus:market?.status||'not-requested',marketNote:market?.note||'',marketSources:searched.length?(market.sources||[]):[],method:'ai'
   };
  }catch(e){
   const kind=aiFailureType(e);failures.push(kind);
   // Jangan kirim catatan/prompt/nilai aset ke logs, hanya kategori kegagalan.
   console.warn('[Arunika AI] inference failed:',aiBackendVersion,model,kind,'upstream',Number(e?.status||e?.statusCode||0)||0,Number(e?.code||0)||0);
   if(kind==='quota')break; // quota bersama, failover hanya membuang kredit.
  }
 }
 throw serviceError(failures);
}

// Jika semua model gagal, UI tetap memiliki proyeksi aman dan diberi label BUKAN hasil AI.
export function fallbackEstimate(a,req,now=new Date(),market=null){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const base=baseline(a,today);
 const identity=identifyAsset({...a,name:req.itemName||a.name});
 const samples=[...req.comparables].sort((x,y)=>x-y);
 const searched=market?.status==='offers'&&market.prices.length>=2?market.prices:[];
 const reference=searched.length?searched:samples;
 const med=reference.length?(reference.length%2?reference[(reference.length-1)/2]:(reference[reference.length/2-1]+reference[reference.length/2])/2):null;
 const amount=Math.round(cap(med===null?base:base*(searched.length?.2:.35)+med*(searched.length?.8:.65),0,1e15));
 return {amount,lower:Math.max(0,Math.round(amount*.7)),upper:Math.min(1e15,Math.round(amount*1.3)),baseline:Math.round(base),asOf:now.toISOString(),
  model:'Perhitungan rumus Arunika (tanpa respons AI)',confidence:'rendah',
  sourceType:searched.length?'hasil-penelusuran':samples.length?'input-pengguna':'model-tanpa-data-pasar',
  reason:'AI belum berhasil merespons. Angka ini berasal dari proyeksi dan/atau harga pembanding, BUKAN penilaian AI atau harga transaksi terverifikasi.',
  comparablesUsed:samples.length,comparablePrices:samples,sourceUrl:req.sourceUrl,condition:req.condition,signature:assetSignature(a),identity,
  marketStatus:market?.status||'not-requested',marketNote:market?.note||'',marketSources:searched.length?(market.sources||[]):[],method:'fallback'};
}
