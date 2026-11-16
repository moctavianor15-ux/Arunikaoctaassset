'use strict';
const $ = id => document.getElementById(id);
const categories = {
 house:['Rumah','Tanah & bangunan · opsi proyeksi','#488269','M3 11 12 4l9 7M5 10v10h14V10M10 20v-7h4v7'],
 car:['Mobil','Kendaraan roda empat','#577d9f','M3 17v-5l2-6h13l3 6v5H3Zm1-5h16M6 17v2m12-2v2M6 14h2m8 0h2'],
 bike:['Motor','Kendaraan roda dua','#9078a8','M8 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm14 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-17 0 4-6h5l-3 6H5m14 0-4-10h-3M8 9h3'],
 phone:['HP & smartphone','Ponsel, telepon pintar','#567a99','M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm4 17h2M8 5h8'],
 electronics:['Elektronik lainnya','Laptop, TV, tablet, kamera & lainnya','#8d6b97','M3 4h18v12H3V4Zm6 16h6m-3-4v4M6 8h5'],
 gold:['Emas','Logam mulia & perhiasan','#b68c39','m3 18 2-6h6l2 6H3Zm11 0-1-6h6l2 6h-7ZM8 10l2-6h5l2 6H8Z'],
 crypto:['Kripto','Saldo USD & koin digital','#7055a4','m12 2 8 5v10l-8 5-8-5V7l8-5Zm0 4-4 6 4 3 4-3-4-6Zm-4 9 4 4 4-4'],
 business:['Aset usaha','Ekuitas sesuai kepemilikan','#397189','M3 10l2-6h14l2 6m-18 0h18m-17 1v9h16v-9m-13 9v-6h5v6'],
 bank:['Tabungan bank','Saldo rekening tabungan, giro & deposito','#327a74','M3 9l9-6 9 6v2H3V9Zm2 4v6m5-6v6m4-6v6m5-6v6M3 21h18'],
 emergency:['Tabungan darurat','Cadangan kebutuhan pokok','#4b9692','m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6l8-3Zm-4 9 3 3 5-6'],
 spending:['Tabungan konsumtif','Dana kebutuhan terencana','#bc7760','M3 8h17v12H3V6l13-3v5m5 4h-6v4h6z']
};
const paths={edit:'m4 16 12-12 4 4L8 20l-5 1 1-5Zm10-10 4 4',backup:'M4 15v5h16v-5M12 3v12m-5-5 5 5 5-5',refresh:'M20 9a8 8 0 1 0 0 7M20 3v6h-6'};
function icon(path){return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="'+path+'"/></svg>'}
const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
const fmtDate=s=>new Date(s).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keys=Object.keys(categories), key='arunika.portfolio.v1', quoteKey='arunika.spot.v1';
const defaults=()=>({version:1,assets:[],debt:0,monthly:0,months:6});
const number=(n,max=1e15)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max;
function valid(s){
 if(!s||s.version!==1||!Array.isArray(s.assets)||s.assets.length>5000||!number(s.debt)||!number(s.monthly)||!Number.isInteger(s.months)||s.months<1||s.months>120)return false;
 const ids=new Set();
 return s.assets.every(a=>{
  if(!a||!keys.includes(a.kind)||typeof a.id!=='string'||!/^[-\w]{1,80}$/.test(a.id)||ids.has(a.id)||typeof a.name!=='string'||!a.name.trim()||a.name.length>90)return false;
  ids.add(a.id);
  if(a.kind==='house')return number(a.land)&&number(a.building)&&validHouseValuation(a);
  if(a.kind==='gold')return number(a.grams,1e7)&&a.grams>0&&number(a.karat,24)&&a.karat>0&&['spot','manual'].includes(a.mode)&&(a.mode==='spot'||(number(a.rate,1e10)&&a.rate>0));
  if(a.kind==='crypto')return validCrypto(a);
  if(a.kind==='bank')return number(a.amount)&&typeof a.bank==='string'&&a.bank.trim().length>0&&a.bank.length<=60&&['tabungan','giro','deposito','lainnya'].includes(a.accountType)&&typeof a.last4==='string'&&(!a.last4||/^[0-9]{4}$/.test(a.last4));
  if(a.kind==='phone'||a.kind==='electronics')return validElectronics(a);
  if(a.kind==='business')return Object.keys(businessFields).every(k=>number(a[k]))&&number(a.share,100)&&a.share>0;
  if(a.kind==='car'||a.kind==='bike')return number(a.amount)&&validVehicleValuation(a);
  return number(a.amount);
 })&&validCashflow(s);
}

// V1 tetap kompatibel: atribut penilaian baru hanya wajib untuk aset yang memakai proyeksi.
const electronicTypes=['laptop','komputer','tablet','televisi','kamera','audio','kulkas','mesin_cuci','gaming','jam_pintar','lainnya'];
const valuationDirections=['down','up','flat'];
function validDay(v){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const t=Date.parse(v+'T00:00:00Z');
 return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===v&&t>=Date.UTC(1900,0,1)&&t<=Date.now()+86400000;
}
function validAutomaticFields(a){return validDay(a.acquiredAt)&&valuationDirections.includes(a.direction)&&number(a.annualRate,100)}
function validVehicleValuation(a){return a.valuationMode===undefined||a.valuationMode==='manual'||(a.valuationMode==='auto'&&validAutomaticFields(a))}
function validHouseValuation(a){return a.valuationMode===undefined||a.valuationMode==='manual'||(a.valuationMode==='auto'&&validDay(a.acquiredAt)&&number(a.landRate,100)&&number(a.buildingRate,100))}
function validElectronics(a){
 return (a.kind!=='electronics'||electronicTypes.includes(a.deviceType))&&number(a.purchasePrice)&&validDay(a.acquiredAt)&&
  (a.valuationMode==='manual'?number(a.amount):a.valuationMode==='auto'&&valuationDirections.includes(a.direction)&&number(a.annualRate,100));
}
const validQuote=q=>q&&number(q.rate,1e10)&&q.rate>0&&Number.isFinite(Date.parse(q.goldDate))&&Number.isFinite(Date.parse(q.fxDate));
let state=defaults(),quote=null,raw=null,loadError=false,fetchState='',busy=false,handler,openedRaw;
let revision=0,ready=false,saving=false;
try{const q=JSON.parse(localStorage.getItem(quoteKey));if(validQuote(q))quote=q}catch{}
async function api(path, options={}){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000),...options});
 if(response.status===401){location.replace('/login');throw Error('Sesi berakhir. Silakan masuk kembali.')}
 const data=await ArunoLoad.read(response);if(!response.ok)throw Error(data.error||'Permintaan gagal.');return data;
}
async function commit(next){
 if(!ready||saving)throw Error('Tunggu hingga penyimpanan selesai.');
 if(!valid(next))throw Error('Periksa kembali angka dan nama yang diisi.');
 saving=true;$('save').disabled=true;$('syncStatus').textContent='Menyimpan ke server…';
 try{
 const result=await api('/api/portfolio',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:next,revision})});
 revision=result.revision;state=next;render();$('syncStatus').textContent='Tersimpan di server · '+new Date().toLocaleTimeString('id-ID');
 }catch(e){if(e.name==='TimeoutError'||e.name==='AbortError')e=Error('Koneksi melewati batas waktu. Muat ulang untuk memeriksa apakah data sudah tersimpan.');$('syncStatus').textContent='Belum terkonfirmasi · '+e.message;throw e}
 finally{saving=false;$('save').disabled=false}
}
async function boot(){
 ArunoLoad.stage(35,'Menghubungkan akun dan membaca portofolio…');
 try{
 const data=await api('/api/portfolio');if(!valid(data.state))throw Error('Data server tidak valid.');
 ArunoLoad.stage(72,'Memeriksa data aset dan menyiapkan ringkasan…');
 state=data.state;revision=data.revision;render();ArunoLoad.stage(95,'Menyelesaikan tampilan portofolio…');ready=true;$('appShell').hidden=false;ArunoLoad.done();refresh();
 $('syncStatus').textContent='Terhubung · data tersimpan di server';
 }catch(e){ArunoLoad.fail(e.name==='TimeoutError'?'Koneksi server melewati batas waktu. Coba lagi setelah koneksi stabil.':e.message)}
}
function value(a){
 if(a.kind==='bank')return bankBalance(a);
 if(a.kind==='house')return valuationInfo(a)?.current??a.land+a.building;
 if(a.kind==='phone'||a.kind==='electronics')return valuationInfo(a).current;
 if((a.kind==='car'||a.kind==='bike')&&a.valuationMode==='auto')return valuationInfo(a).current;
 if(a.kind==='gold')return a.mode==='manual'?a.grams*a.rate:quote?a.grams*a.karat/24*quote.rate:null;
 if(a.kind==='business')return equity(a);
 if(a.kind==='crypto'){const fx=a.fxManual||market.fx?.rate, amount=dollars(a);return fx&&amount!==null?amount*fx:null}
 return a.amount;
}
function summary(){
 const sums=Object.fromEntries(keys.map(k=>[k,0]));let missing=0,deficit=0;
 for(const a of state.assets){
  const v=value(a);
  if(v===null)missing++;
  else if(v<0)deficit-=v;
  else sums[a.kind]+=v;
 }
 const total=Object.values(sums).reduce((a,b)=>a+b,0);
 return {sums,missing,deficit,total,net:total-state.debt-deficit};
}
function assetNotes(a){
 if(a.kind==='phone'||a.kind==='electronics'||a.valuationMode==='auto'){const info=valuationInfo(a);if(info)return '<span class="netNote">'+(a.kind==='electronics'?esc(deviceTypes[a.deviceType]||'Elektronik')+' · ':'')+(info.auto?'Estimasi otomatis':'Harga manual')+' · Nilai dasar '+money(info.basis)+' · '+esc(info.date)+'</span>'+valuationDelta(info)}
 if(a.kind==='house')return '<span class="netNote">Tanah '+money(a.land)+' · Bangunan '+money(a.building)+'</span>';
 if(a.kind==='gold')return '<span class="netNote">'+a.grams.toLocaleString('id-ID')+' gram · '+a.karat+' karat · '+(a.mode==='manual'?'Buyback manual':'Harga spot')+'</span>';
 if(a.kind==='bank')return '<span class="netNote">'+esc(a.bank)+' · '+esc(bankTypeName(a.accountType))+(a.last4?' · Rekening ••••'+esc(a.last4):'')+' · Saldo dasar '+money(a.amount)+(transactionsOf(state).some(t=>t.accountId===a.id||t.toAccountId===a.id)?' + mutasi buku kas':'')+'</span>';
 if(a.kind==='business')return '<span class="netNote">Porsi kepemilikan '+a.share+'% · Utang usaha sudah diperhitungkan</span>';
 if(a.kind==='crypto')return '<span class="netNote">'+(a.wallet?esc(a.wallet)+' · ':'')+(a.mode==='balance'?'Saldo USD':'Aset kripto dalam USD')+'</span>';
 return '';
}
function renderNetBreakdown(info){
 const {sums,missing,deficit,total,net}=info;
 const groups=keys.map(k=>{
  const items=state.assets.filter(a=>a.kind===k&&!(value(a)!==null&&value(a)<0));
  if(!items.length)return '';
  return '<div class="netGroup"><div class="netGroupTitle"><span class="netGroupName"><i class="dot" style="background:'+categories[k][2]+'"></i>'+categories[k][0]+'</span><strong>'+money(sums[k])+'</strong></div>'+
   items.map(a=>'<div class="netAsset"><div><b>'+esc(a.name)+'</b>'+assetNotes(a)+'</div><span class="netAmount">'+(value(a)===null?'Menunggu harga':money(value(a)))+'</span></div>').join('')+'</div>';
 }).filter(Boolean).join('');
 const negatives=state.assets.filter(a=>a.kind==='business'&&value(a)!==null&&value(a)<0);
 $('netDetails').innerHTML='<p class="hint">Rincian setiap aset dan saldo yang membentuk kekayaan bersih Anda. Nilai mengikuti data portofolio dan harga/kurs yang tersedia.</p>'+
 (groups||'<p class="hint">Belum ada aset yang dicatat. Gunakan Tambah aset untuk mulai.</p>')+
 '<div class="netEquation"><div><span>Total aset bernilai positif</span><strong>'+money(total)+'</strong></div><div><span>Utang pribadi</span><strong class="subtraction">− '+money(state.debt)+'</strong></div>'+
 (negatives.length?'<div class="netNegative"><span>Ekuitas usaha negatif</span><strong class="subtraction">− '+money(deficit)+'</strong></div>'+negatives.map(a=>'<div class="netNegativeDetail"><span>'+esc(a.name)+'</span><span>'+money(value(a))+'</span></div>').join(''):'')+
 '<div class="netResult"><span>KEKAYAAN BERSIH</span><strong>'+money(net)+(missing?' *':'')+'</strong></div></div>'+
 (missing?'<p class="hint warn">* '+missing+' aset masih menunggu harga/kurs. Angkanya belum masuk perhitungan.</p>':'');
}
function renderValuationSummary(){
 const entries=state.assets.map(a=>({asset:a,info:valuationInfo(a)})).filter(row=>row.info);
 const increased=entries.reduce((s,row)=>s+Math.max(0,row.info.delta),0);
 const decreased=entries.reduce((s,row)=>s+Math.max(0,-row.info.delta),0);
 $('valuationSummary').innerHTML='<div class="valuationTotals"><div><span>Kenaikan estimasi</span><strong class="positive">'+money(increased)+'</strong></div><div><span>Penyusutan estimasi</span><strong class="negative">− '+money(decreased)+'</strong></div><div><span>Selisih bersih</span><strong>'+money(increased-decreased)+'</strong></div></div>'+
 (entries.length?'<div class="valuationRows">'+entries.map(({asset,info})=>'<div><span><b>'+esc(asset.name)+'</b><small>'+(info.auto?'Proyeksi per tanggal '+esc(localDay()):'Dibanding nilai beli')+'</small></span>'+valuationDelta(info)+'</div>').join('')+'</div>':'<p class="hint">Tambahkan HP atau barang elektronik untuk melihat perubahan nilainya. Rumah, mobil, dan motor dapat menggunakan mode otomatis secara opsional.</p>')+
 '<p class="hint">Perubahan nilai adalah perkiraan di atas kertas, bukan keuntungan terealisasi. Angka tidak ditambahkan lagi ke kekayaan bersih karena sudah termasuk dalam nilai aset saat ini.</p>';
}
function render(){
 const {sums,missing,deficit,total,net}=summary();
 $('total').textContent=money(total)+(missing?' *':'');$('net').textContent=money(net)+(missing?' *':'');$('owed').textContent=money(state.debt);
 renderNetBreakdown({sums,missing,deficit,total,net});renderValuationSummary();
 $('debtDetail').textContent=deficit?'Koreksi terpisah: defisit ekuitas usaha '+money(deficit):'';
 $('count').textContent=state.assets.length+' aset';
 $('composition').innerHTML='<div class="allocation">'+keys.map(k=>'<span style="width:'+(total?sums[k]/total*100:0)+'%;background:'+categories[k][2]+'"></span>').join('')+'</div><div class="legend">'+keys.map(k=>'<div><i class="dot" style="background:'+categories[k][2]+'"></i>'+categories[k][0]+'<b>'+(total?(100*sums[k]/total).toLocaleString('id-ID',{maximumFractionDigits:1}):0)+'%</b></div>').join('')+'</div>'+(missing?'<p class="hint warn">* '+missing+' catatan menunggu harga atau kurs dan belum masuk total.</p>':'')+(loadError?'<p class="warn">Data lokal tidak dapat dibaca. Penyimpanan perubahan diblokir untuk melindungi data asli.</p>':'');
 $('price').textContent=quote?money(quote.rate)+' / gram':'Harga belum tersedia';
 $('quoteStatus').textContent=fetchState||'Mengambil acuan pasar…';
 $('quoteTime').textContent=quote?'Emas '+fmtDate(quote.goldDate)+' · Kurs '+quote.fxDate:'Gold API · Kurs USD/IDR Frankfurter';
 $('refresh').disabled=busy;$('marketRefresh').disabled=busy;
 const holdings=state.assets.filter(a=>a.kind==='crypto'), known=holdings.map(dollars).filter(v=>v!==null);
 $('cryptoTotal').textContent=usd(known.reduce((sum,n)=>sum+n,0))+(known.length<holdings.length?' *':'');
 $('fxStatus').textContent=(market.fx?'1 USD = '+money(market.fx.rate)+' · Frankfurter '+market.fx.date+(fxFailed?' (kurs tersimpan)':''):'Kurs USD otomatis belum tersedia')+(known.length<holdings.length?' · '+(holdings.length-known.length)+' posisi menunggu harga':'');
 $('businessTotal').textContent=money(sums.business-deficit);
 $('businessNote').textContent=deficit?'Defisit ekuitas '+money(deficit)+' mengurangi estimasi kekayaan bersih.':'Ekuitas bersih sesuai porsi kepemilikan Anda.';
 $('bankTotal').textContent=money(sums.bank);
 $('bankNote').textContent=state.assets.filter(a=>a.kind==='bank').length+' rekening · saldo dihitung otomatis dari transaksi.';
 renderCashflow();
 const selected=$('filter').value;
 $('portfolio').innerHTML='<div class="cards">'+keys.filter(k=>!selected||selected===k).map(k=>{
  const [name,detail,color,path]=categories[k], items=state.assets.filter(a=>a.kind===k);
  return '<article class="card"><div class="cardTop"><div class="tile" style="background:'+color+'20;color:'+color+'">'+icon(path)+'</div><div><h3>'+name+'</h3><span class="hint">'+detail+'</span></div></div><strong>'+money(k==='business'?sums[k]-deficit:sums[k])+'</strong>'+items.map(a=>'<div class="row"><div>'+esc(a.name)+'<br><b>'+(value(a)===null?'Menunggu harga':money(value(a)))+'</b>'+details(a)+(k==='gold'?'<br>'+a.grams+' g · '+a.karat+' K · '+(a.mode==='manual'?'Buyback manual':'Spot'):'')+'</div><button data-id="'+a.id+'" aria-label="Ubah '+esc(a.name)+'">'+icon(paths.edit)+'</button></div>').join('')+'<button class="textBtn" data-new="'+k+'">+ Tambah '+name.toLowerCase()+'</button></article>';
 }).join('')+'</div>';
 const target=state.monthly*state.months,bal=sums.emergency;
 $('progress').innerHTML=target?'<b>'+money(bal)+' dari '+money(target)+'</b><div class="track"><div style="width:'+Math.min(100,bal/target*100)+'%"></div></div><span class="hint">Mencukupi '+(bal/state.monthly).toLocaleString('id-ID',{maximumFractionDigits:1})+' bulan dari target '+state.months+' bulan. '+(bal>=target?'Target tercapai.':'Masih perlu '+money(target-bal)+'.')+'</span>':'<p class="hint">Masukkan pengeluaran pokok per bulan dan jumlah bulan yang ingin Anda siapkan.</p>';
}
async function refresh(){
 if(busy)return;busy=true;fetchState='Memeriksa harga dan kurs…';render();
 const fxTask=readJSON('https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR').then(f=>{
  const fx={rate:f.rates.IDR,date:f.date};if(f.base!=='USD'||!sanePrice(fx))throw Error();
  market.fx=fx;fxFailed=false;cacheMarket();return fx;
 }).catch(()=>{fxFailed=true;return null});
 const goldTask=Promise.all([readJSON('https://api.gold-api.com/price/XAU'),fxTask]).then(([g,fx])=>{
  if(!fx)throw Error();
  const next={rate:g.price*fx.rate/31.1034768,goldDate:g.updatedAt,fxDate:fx.date};
  if(g.symbol!=='XAU'||!validQuote(next))throw Error();
  quote=next;fetchState='Harga spot internasional · USD dikonversi ke rupiah';
  try{localStorage.setItem(quoteKey,JSON.stringify(quote))}catch{}
 }).catch(()=>{fetchState=quote?'Pembaruan gagal · memakai harga tersimpan.':'Harga emas belum tersedia. Buyback bisa diisi manual.'});
 try{await Promise.all([fxTask,goldTask,...activeCoins().map(updateCoin)])}finally{busy=false;render()}
}
function modal(title,html,action,saveLabel='Simpan'){
 openedRaw=raw;$('title').textContent=title;$('fields').innerHTML=html;$('error').textContent='';handler=action;$('save').hidden=!action;$('save').style.display=action?'':'none';$('save').textContent=saveLabel;if(!$('dlg').open)$('dlg').showModal();
}
const label=(name,input)=>'<label>'+name+input+'</label>';
const num=(name,text,v='',max='1000000000000000',step='1',min='0')=>label(text,'<input name="'+name+'" type="number" inputmode="decimal" step="'+step+'" min="'+min+'" max="'+max+'" value="'+esc(v??'')+'" required>');
const opts=(items,val)=>items.map(([k,n])=>'<option value="'+k+'" '+(k===val?'selected':'')+'>'+n+'</option>').join('');
function assetForm(k='house',a=null){
 const options=opts(keys.map(id=>[id,categories[id][0]]),k);
 modal(a?'Ubah aset':'Tambah aset',label('Kategori','<select id="kind" '+(a?'disabled':'')+'>'+options+'</select>')+label('Nama aset','<input name="name" maxlength="90" placeholder="Misalnya rumah tinggal" value="'+esc(a?.name||'')+'" required>')+'<div id="specific"></div>'+(a?'<button type="button" id="del" class="soft warn">Hapus aset</button>':''),async data=>{
  const kind=$('kind').value, item={kind,id:a?.id||crypto.randomUUID(),name:data.get('name').trim()};
  for(const [field,v] of data)if(field!=='name')item[field]=['mode','wallet','symbol','bank','accountType','last4','valuationMode','direction','acquiredAt','deviceType'].includes(field)?v.trim():Number(v);
  await commit({...state,assets:a?state.assets.map(old=>old.id===a.id?item:old):[...state.assets,item]});
  if(kind==='crypto'&&item.mode==='auto')void updateCoin(item.symbol);
 });
 function specific(){
  const kind=$('kind').value;
  $('specific').oninput=null;
  if(kind==='crypto'){cryptoForm(a);return}
  if(kind==='business'){businessForm(a);return}
  if(kind==='bank'){bankForm(a);return}
  if(['phone','electronics','house','car','bike'].includes(kind)){valuationForm(a,kind);return}
  $('specific').innerHTML=kind==='house'?num('land','Nilai tanah saat ini (Rp)',a?.land)+num('building','Nilai bangunan saat ini (Rp)',a?.building):kind==='gold'?num('grams','Berat (gram)',a?.grams,1e7,'any','0.000001')+num('karat','Kadar (karat)',a?.karat??24,24,'any','0.001')+label('Dasar penilaian','<select name="mode" id="mode">'+opts([['spot','Spot otomatis sesuai kadar'],['manual','Buyback manual per gram aktual']],a?.mode)+'</select>')+'<div id="rateBox"></div>':num('amount',kind==='car'||kind==='bike'?'Estimasi harga jual saat ini (Rp)':'Saldo saat ini (Rp)',a?.amount);
  if(kind==='gold'){
   function rateBox(){$('rateBox').innerHTML=$('mode').value==='manual'?num('rate','Harga buyback untuk kadar ini (Rp/gram)',a?.rate,1e10,1,1):'<p class="hint">Berat × kadar/24 × harga spot per gram. Harga jual kembali di toko dapat berbeda.</p>'}
   $('mode').onchange=rateBox;rateBox();
  }
 }
 $('kind').onchange=specific;specific();
 if(a)$('del').onclick=()=>{
  if(a.kind==='bank'&&transactionsOf(state).some(t=>t.accountId===a.id||t.toAccountId===a.id)){modal('Rekening masih punya transaksi','<p>Rekening ini sudah memiliki riwayat transaksi. Hapus atau pindahkan transaksi tersebut terlebih dahulu agar pencatatan dan saldo tetap konsisten.</p>',null);return}
  modal('Hapus aset?', '<p>'+esc(a.name)+' akan dihapus dari portofolio.</p>',()=>commit({...state,assets:state.assets.filter(v=>v.id!==a.id)}),'Ya, hapus aset');
 };
}
$('form').onsubmit=async e=>{e.preventDefault();try{if(handler){await handler(new FormData(e.target));$('dlg').close()}}catch(err){$('error').textContent=err.message||'Perubahan gagal disimpan.'}};
$('close').onclick=()=>{if(!saving)$('dlg').close()};$('dlg').addEventListener('cancel',e=>{if(saving)e.preventDefault()});
$('filter').innerHTML='<option value="">Semua kategori</option>'+opts(keys.map(k=>[k,categories[k][0]]));
$('filter').onchange=render;$('add').onclick=()=>assetForm();
setupCashflow();
$('bankGo').onclick=()=>{$('filter').value='bank';render();$('portofolio').scrollIntoView({behavior:'smooth',block:'start'})};
$('toggleNet').onclick=()=>{const open=$('netBreakdown').hidden;$('netBreakdown').hidden=!open;$('toggleNet').setAttribute('aria-expanded',String(open));$('toggleNet').textContent=open?'Tutup rincian kekayaan bersih':'Lihat rincian kekayaan bersih';if(open)$('netBreakdown').scrollIntoView({behavior:'smooth',block:'nearest'})};
$('portfolio').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.new)assetForm(b.dataset.new);else{const a=state.assets.find(v=>v.id===b.dataset.id);if(a)assetForm(a.kind,a)}};
$('goal').onclick=()=>modal('Target dana darurat',num('monthly','Pengeluaran pokok per bulan (Rp)',state.monthly||'')+num('months','Target perlindungan (bulan)',state.months,120,1,1),d=>commit({...state,monthly:Number(d.get('monthly')),months:Number(d.get('months'))}));
$('debt').innerHTML=icon(paths.edit);$('debt').onclick=()=>modal('Sisa kewajiban',num('debt','Total sisa pokok utang (Rp)',state.debt)+'<p class="hint">Jumlahkan sisa pokok KPR, kendaraan, dan pinjaman lain. Angka ini mengurangi kekayaan bersih.</p>',d=>commit({...state,debt:Number(d.get('debt'))}));
$('backup').innerHTML=icon(paths.backup)+'Cadangan';$('backup').onclick=()=>{
 modal('Cadangan pribadi','<p class="hint">Data tersimpan di database pribadi Anda. Unduh cadangan secara berkala. Cadangan versi lama juga dapat diimpor di sini. Berkas cadangan berisi angka keuangan Anda dalam bentuk terbaca.</p><button type="button" class="soft" id="export">Unduh cadangan</button>'+label('Pulihkan dari cadangan JSON','<input id="import" type="file" accept=".json,application/json">'),null);
 $('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({...state,quote,market},null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='Arunika-Cadangan-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};
 $('import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>3000000)throw Error();const d=JSON.parse(await file.text());if(!valid(d))throw Error();const {version,assets,debt,monthly,months}=d;
 modal('Pulihkan cadangan?', '<p>Ganti '+state.assets.length+' aset dan '+transactionsOf(state).length+' transaksi saat ini dengan '+assets.length+' aset dan '+transactionsOf(d).length+' transaksi dari cadangan? <strong>Riwayat Buku Kas saat ini juga akan diganti</strong>. Unduh cadangan baru sebelum melanjutkan.</p>',async ()=>{await commit({version,assets,debt,monthly,months,transactions:transactionsOf(d)});const restored=cleanMarket(d.market);if(!market.fx)market.fx=restored.fx;market.prices={...restored.prices,...market.prices};cacheMarket();render();activeCoins().forEach(updateCoin);if(!quote&&validQuote(d.quote)){quote=d.quote;try{localStorage.setItem(quoteKey,JSON.stringify(quote))}catch{}render()}},'Ganti dengan cadangan');
 }catch{$('error').textContent='Berkas tidak sesuai format cadangan Arunika.'}};
};
$('refresh').innerHTML=icon(paths.refresh);$('refresh').onclick=refresh;$('goldIcon').innerHTML=icon(categories.gold[3]);$('date').textContent=new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toUpperCase();
function nav(){document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash===(location.hash||'#ringkasan')))}
window.addEventListener('hashchange',nav);$('marketRefresh').onclick=refresh;nav();boot();setInterval(()=>{if(ready&&!document.hidden)refresh()},900000);document.addEventListener('visibilitychange',()=>{if(ready&&!document.hidden)render()});

$('logout').onclick=async()=>{if(saving)return;try{await api('/api/logout',{method:'POST'});state=defaults();document.body.replaceChildren();location.replace('/login')}catch(e){$('syncStatus').textContent=e.message}};
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload()});
$('legacy').onclick=()=>{
 try{const old=JSON.parse(localStorage.getItem(key));if(!valid(old))throw Error('Tidak ada data versi lama yang valid pada browser dan alamat situs ini. Gunakan impor cadangan JSON jika alamat situs berbeda.');
 modal('Pindahkan data lama?', '<p>Ganti data server dengan '+old.assets.length+' aset dari browser ini? Unduh cadangan server terlebih dahulu bila diperlukan.</p>',async()=>{await commit(old);localStorage.removeItem(key)},'Ya, pindahkan');
 }catch(e){$('syncStatus').textContent=e.message}
};
