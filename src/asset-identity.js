// Ekstraksi identitas barang dari label milik pengguna. Tidak menganggap model resmi ada.
const brands={
  fortuner:'Toyota',avanza:'Toyota',innova:'Toyota',rush:'Toyota',yaris:'Toyota',agya:'Toyota',raize:'Toyota',
  brio:'Honda',jazz:'Honda',hrv:'Honda',crv:'Honda',civic:'Honda',city:'Honda',
  xpander:'Mitsubishi',pajero:'Mitsubishi',triton:'Mitsubishi',
  ertiga:'Suzuki',xl7:'Suzuki',baleno:'Suzuki',
  terios:'Daihatsu',xenia:'Daihatsu',sigra:'Daihatsu',ayla:'Daihatsu',
  almaz:'Wuling',air:'Wuling',
};
const knownBrands=['toyota','honda','mitsubishi','daihatsu','suzuki','wuling','hyundai','kia','nissan','bmw','mercedes','ford','mazda','isuzu','yamaha','kawasaki','oppo','vivo','xiaomi','redmi','poco','realme','infinix','tecno','samsung','apple','asus','acer','lenovo','hp','dell','sony','lg'];
const clean=s=>String(s||'').replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,90);
const title=s=>s.replace(/\b\w/g,m=>m.toUpperCase());
export function identifyAsset(asset){
 const name=clean(asset?.name),kind=asset?.kind||'other',low=name.toLowerCase();
 const out={name,kind,brand:null,model:null,year:null,transmission:null,storageGB:null,variant:null,matchLevel:'kurang',query:null,warning:''};
 let brand=knownBrands.find(s=>new RegExp('(?:^|\\W)'+s+'(?:\\W|$)','i').test(low));
 if(kind==='phone'){
  if(/\biphone\b/i.test(low)){
   out.brand='Apple'; const m=low.match(/\biphone\s*(\d{1,2}|se|x[rs]?)(?:\s*(pro\s*max|pro|plus|mini|max))?/i);
   out.model=m?'iPhone '+m[1].toUpperCase():'iPhone';out.variant=m?.[2]?title(m[2]):null;
  }else if(/\bgalaxy\b/i.test(low)){
   out.brand='Samsung';const m=low.match(/\bgalaxy\s*([a-z]\d{1,3}(?:\s*(?:ultra|plus|fe))?)/i);out.model=m?'Galaxy '+m[1].toUpperCase():'Galaxy';
  }else if(brand){out.brand=title(brand);out.model=name.replace(new RegExp(brand,'i'),'').trim().slice(0,60)||null}
  const st=low.match(/(?:^|\s)(\d{2,4})\s*(tb|gb|g)\b/i);
  if(st){const n=Number(st[1])*(st[2].toLowerCase()==='tb'?1024:1);if(n>=32&&n<=4096)out.storageGB=n}
  out.matchLevel=out.model&&out.storageGB?'rinci':out.model?'model':'kurang';
 }else if(kind==='car'||kind==='bike'){
  const model=Object.keys(brands).find(x=>new RegExp('(?:^|\\W)'+x+'(?:\\W|$)','i').test(low));
  out.brand=model?brands[model]:brand?title(brand):null;
  out.model=model?title(model):null;
  const y=low.match(/\b(19\d{2}|20\d{2})\b/);if(y){const year=Number(y[1]);if(year<=new Date().getUTCFullYear()+1)out.year=year}
  if(/(?:^|\W)(m\/t|mt|manual)(?:$|\W)/i.test(low))out.transmission='MT';
  else if(/(?:^|\W)(a\/t|at|matic|automatic|otomatis)(?:$|\W)/i.test(low))out.transmission='AT';
  out.matchLevel=out.model&&out.year&&out.transmission?'rinci':out.model&&out.year?'model':'kurang';
 }else if(kind==='electronics'){
  out.brand=brand?title(brand):null;out.model=name||null;
  out.matchLevel=out.brand?'model':'kurang';
 }else if(kind==='house'){
  out.model=name||null;out.matchLevel='kurang';
 }
 const terms=[out.brand,out.model,out.variant,out.year,out.transmission,out.storageGB?out.storageGB+'GB':null].filter(Boolean);
 out.query=terms.length?terms.join(' ')+' harga bekas dijual Indonesia Rp':null;
 out.warning=kind==='phone'?'Nama perangkat dikenali dari teks, bukan verifikasi katalog resmi.':
  kind==='car'||kind==='bike'?'Periksa tahun, transmisi, lokasi, kilometer, dan kondisi fisik sebelum menilai.':'Jenis aset dikenali dari nama pengguna.';
 return out;
}
