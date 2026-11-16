// Penilaian AI: hanya saran. Tidak ada akses langsung ke katalog/marketplace.
export const valuedKinds = ['house','car','bike','phone','electronics'];
export const modelName='@cf/meta/llama-3.1-8b-instruct';
const cap = (n,min,max)=>Math.max(min,Math.min(max,n));
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
 // Identitas dan parameter valuasi. Nilai AI tidak boleh dipakai bila dasar aset berubah.
 return JSON.stringify([a.kind,a.name,a.land,a.building,a.amount,a.purchasePrice,a.acquiredAt,a.direction,a.annualRate,a.valuationMode,a.landRate,a.buildingRate,a.deviceType]);
}
function parseReply(r){
 const raw=typeof r==='string'?r:r?.response??r?.result?.response??'';
 if(typeof raw!=='string')throw Error('AI tidak mengembalikan respons yang dapat dibaca.');
 const from=raw.indexOf('{'),to=raw.lastIndexOf('}');
 if(from<0||to<from)throw Error('AI mengembalikan format yang tidak sesuai.');
 let data;try{data=JSON.parse(raw.slice(from,to+1))}catch{throw Error('AI mengembalikan JSON tidak valid.')}
 if(!Number.isFinite(data.adjustment)||data.adjustment<0.9||data.adjustment>1.1||typeof data.explanation!=='string'||!data.explanation.trim()||data.explanation.length>400)
  throw Error('AI menghasilkan perkiraan di luar batas aman. Silakan coba ulang.');
 return data;
}
export function assessInput(request){
 if(!request||typeof request.assetId!=='string'||!/^[-\w]{1,80}$/.test(request.assetId))return null;
 if(!['new','good','fair','poor'].includes(request.condition)||typeof request.note!=='string'||request.note.length>180)return null;
 if(!Array.isArray(request.comparables)||request.comparables.length>3||!request.comparables.every(v=>Number.isSafeInteger(v)&&v>0&&v<=1e15))return null;
 if(typeof request.sourceUrl!=='string'||request.sourceUrl.length>300||request.sourceUrl&&(!/^https:\/\/[^\s]+$/i.test(request.sourceUrl)||request.sourceUrl.includes('@')))return null;
 return request;
}
export async function estimateAI(env,a,req,now=new Date()){
 if(!env.AI||typeof env.AI.run!=='function')throw Object.assign(Error('Binding Workers AI bernama AI belum diatur pada Cloudflare Production. Tambahkan binding AI lalu deploy ulang.'),{status:503});
 const dateParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 const today=dateParts.year+'-'+dateParts.month+'-'+dateParts.day,base=baseline(a,today);
 if(!validMoney(base))throw Object.assign(Error('Nilai dasar aset belum valid.'),{status:400});
 const samples=[...req.comparables].sort((x,y)=>x-y);
 const med=samples.length?samples[Math.floor(samples.length/2)]:null;
 const midpoint=med===null?base:base*.35+med*.65;
 const prompt=[
  'Anda membantu pemilik aset pribadi Indonesia menilai kewajaran harga aset. TIDAK memiliki akses internet/harga realtime.',
  'Balas SATU objek JSON saja: {"adjustment":1.0,"explanation":"kalimat Bahasa Indonesia singkat"}.',
  'adjustment merupakan faktor koreksi kecil 0.90 hingga 1.10 berdasarkan kondisi, umur, spesifikasi. Bukan harga absolut.',
  'Jangan mengarang harga pasar, sumber pasar, atau klaim sudah melihat iklan. Jika pembanding kosong, jelaskan estimasi semata berdasarkan model penyusutan/kenaikan.',
  'Data sumber URL diberikan pemilik dan tidak diverifikasi, jangan mengaku sudah mengunjunginya.',
  JSON.stringify({jenis:a.kind,nama:a.name,tipe:a.deviceType||null,tanggalPerolehan:a.acquiredAt||null,hargaDasarRupiah:Math.round(base),kondisi:req.condition,catatan:req.note,hargaPembandingDariPengguna:req.comparables,referensiUser:req.sourceUrl||null,tanggalPenilaian:today})
 ].join('\n');
 let data;
 try{
  const response=await env.AI.run(modelName,{messages:[{role:'system',content:'Jawab hanya JSON sesuai instruksi; tidak punya akses web.'},{role:'user',content:prompt}],max_tokens:250,temperature:0.2});
  data=parseReply(response);
 }catch(e){if(e.status===503)throw e;throw Object.assign(Error('Layanan AI belum dapat menyelesaikan penilaian. Coba kembali nanti.'),{status:502})}
 const amount=Math.round(cap(midpoint*data.adjustment,0,1e15));
 const spread=samples.length>=3?.13:samples.length>=1?.2:.30;
 return {
  amount,lower:Math.max(0,Math.round(amount*(1-spread))),upper:Math.min(1e15,Math.round(amount*(1+spread))),
  baseline:Math.round(base),asOf:now.toISOString(),model:modelName,
  confidence:samples.length>=3?'sedang':'rendah',sourceType:samples.length?'input-pengguna':'model-tanpa-data-pasar',
  reason:data.explanation.trim(),comparablesUsed:samples.length,comparablePrices:samples,sourceUrl:req.sourceUrl,
  condition:req.condition,signature:assetSignature(a)
 };
}
