'use strict';
const coins = ['BTC','ETH','SOL','XRP','BNB','ADA','DOGE','USDT','USDC'];
const businessFields = {
 cash:'Kas dan saldo bank usaha', inventory:'Persediaan barang', receivables:'Piutang yang diperkirakan tertagih',
 equipment:'Peralatan, properti dan aset tetap', other:'Aset usaha lainnya', liabilities:'Sisa utang usaha'
};
const marketKey='arunika.market.v1';
const usd=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'USD',currencyDisplay:'code',maximumFractionDigits:8}).format(n);
function sanePrice(q){return q&&Number.isFinite(q.rate)&&q.rate>0&&q.rate<=1e12&&typeof q.date==='string'&&Number.isFinite(Date.parse(q.date))}
function cleanMarket(data){
 const result={fx:null,prices:{}};
 if(sanePrice(data?.fx))result.fx=data.fx;
 for(const symbol of coins)if(sanePrice(data?.prices?.[symbol]))result.prices[symbol]=data.prices[symbol];
 return result;
}
let market=cleanMarket(null);
try{market=cleanMarket(JSON.parse(localStorage.getItem(marketKey)))}catch{}
const pendingPrices=new Set(),failedPrices=new Set();
let fxFailed=false;
function cacheMarket(){try{localStorage.setItem(marketKey,JSON.stringify(market))}catch{}}
async function readJSON(url){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{const response=await fetch(url,{signal:ctrl.signal,cache:'no-store',referrerPolicy:'no-referrer'});if(!response.ok)throw Error();return await response.json()}finally{clearTimeout(timer)}
}
async function updateCoin(symbol){
 if(!coins.includes(symbol)||pendingPrices.has(symbol))return;
 pendingPrices.add(symbol);
 try{
  const {data}=await readJSON('https://api.coinbase.com/v2/prices/'+symbol+'-USD/spot');
  const q={rate:Number(data.amount),date:new Date().toISOString()};
  if(data.base!==symbol||data.currency!=='USD'||!sanePrice(q))throw Error();
  market.prices[symbol]=q;failedPrices.delete(symbol);cacheMarket();
 }catch{failedPrices.add(symbol)}finally{pendingPrices.delete(symbol);render()}
}
function activeCoins(){return [...new Set(state.assets.filter(a=>a.kind==='crypto'&&a.mode==='auto').map(a=>a.symbol))]}
function businessGross(a){return a.cash+a.inventory+a.receivables+a.equipment+a.other}
function equity(a){return (businessGross(a)-a.liabilities)*a.share/100}
function dollars(a){
 if(a.mode==='balance')return a.balance;
 const price=a.mode==='auto'?market.prices[a.symbol]?.rate:a.unitPrice;
 return price==null?null:a.units*price;
}
function validCrypto(a){
 if(!['balance','auto','manual'].includes(a.mode)||typeof a.wallet!=='string'||a.wallet.length>80||!number(a.fxManual,1e7)||!number(a.cost,1e12))return false;
 if(a.mode==='balance')return number(a.balance,1e12);
 if(!number(a.units,1e15)||a.units<=0)return false;
 return a.mode==='auto'?coins.includes(a.symbol):typeof a.symbol==='string'&&/^[a-z0-9._-]{1,18}$/i.test(a.symbol)&&number(a.unitPrice,1e12)&&a.unitPrice>0;
}

// Model nilai lokal, BUKAN harga pasar: pertumbuhan/penyusutan majemuk per 365,2425 hari.
function localDay(now=new Date()){
 const two=n=>String(n).padStart(2,'0');
 return now.getFullYear()+'-'+two(now.getMonth()+1)+'-'+two(now.getDate());
}
function projection(basis,acquiredAt,direction,rate,today=localDay()){
 const start=Date.parse(acquiredAt+'T00:00:00Z'),end=Date.parse(today+'T00:00:00Z');
 if(!Number.isFinite(start)||!Number.isFinite(end))return basis;
 const years=Math.max(0,(end-start)/86400000/365.2425);
 const factor=direction==='up'?1+rate/100:direction==='down'?1-rate/100:1;
 return Math.max(0,Math.min(1e15,basis*Math.pow(factor,years)));
}
function valuationInfo(a,today=localDay()){
 if(a.kind==='phone'||a.kind==='electronics'){
  const current=a.valuationMode==='auto'?projection(a.purchasePrice,a.acquiredAt,a.direction,a.annualRate,today):a.amount;
  return {basis:a.purchasePrice,current,delta:current-a.purchasePrice,auto:a.valuationMode==='auto',date:a.acquiredAt};
 }
 if((a.kind==='car'||a.kind==='bike')&&a.valuationMode==='auto'){
  const current=projection(a.amount,a.acquiredAt,a.direction,a.annualRate,today);
  return {basis:a.amount,current,delta:current-a.amount,auto:true,date:a.acquiredAt};
 }
 if(a.kind==='house'&&a.valuationMode==='auto'){
  const land=projection(a.land,a.acquiredAt,'up',a.landRate,today);
  const building=projection(a.building,a.acquiredAt,'down',a.buildingRate,today);
  const current=land+building,basis=a.land+a.building;
  return {basis,current,delta:current-basis,auto:true,date:a.acquiredAt,land,building};
 }
 return null;
}
const deviceTypes={laptop:'Laptop',komputer:'Komputer/PC',tablet:'Tablet',televisi:'Televisi',kamera:'Kamera',audio:'Audio & speaker',kulkas:'Kulkas',mesin_cuci:'Mesin cuci',gaming:'Konsol game',jam_pintar:'Jam pintar',lainnya:'Elektronik lain'};
function valuationDelta(info){
 if(!info)return '';
 const direction=info.delta>0.5?'up':info.delta<-.5?'down':'flat';
 const pct=info.basis?Math.abs(info.delta)/info.basis*100:0;
 return '<span class="valueDelta '+direction+'">'+(direction==='up'?'↗ Naik ':direction==='down'?'↘ Susut ':'→ Tetap ')+money(Math.abs(info.delta))+(info.basis?' ('+pct.toLocaleString('id-ID',{maximumFractionDigits:1})+'%)':'')+'</span>';
}
function currentValueHint(a){
 const info=valuationInfo(a);if(!info)return '';
 const model=info.auto?'Proyeksi otomatis':'Harga saat ini (manual)';
 return '<div class="detail"><span class="valuationCaption">'+model+' · acuan '+esc(info.date)+'</span><br>Nilai dasar '+money(info.basis)+' · Saat ini '+money(info.current)+'<br>'+valuationDelta(info)+(info.land!==undefined?'<br>Proyeksi tanah '+money(info.land)+' · bangunan '+money(info.building):'')+'</div>';
}
function dateInput(a){return label('Tanggal pembelian / tanggal dasar penilaian','<input name="acquiredAt" type="date" min="1900-01-01" max="'+localDay()+'" value="'+esc(a?.acquiredAt||localDay())+'" required>')}
function valuationSelect(mode){return label('Perhitungan nilai','<select name="valuationMode" id="valuationMode">'+opts([['auto','Otomatis mengikuti waktu'],['manual','Isi nilai saat ini secara manual']],mode)+'</select>')}
function directionSelect(a={},defaultDir='down'){
 return label('Arah perubahan nilai','<select name="direction" id="direction">'+opts([['down','Penyusutan nilai'],['up','Kenaikan nilai'],['flat','Tetap / tidak berubah']],a.direction||defaultDir)+'</select>')+
 num('annualRate','Besaran perubahan per tahun (%)',a.annualRate??(defaultDir==='down'?25:5),100,'any');
}
function valuationForm(a={},kind='phone'){
 a=a||{};const isDevice=kind==='phone'||kind==='electronics';const isHouse=kind==='house';
 const mode=a.valuationMode||(isDevice?'auto':'manual');
 const parent=$('specific');
 if(isDevice){
  parent.innerHTML=(kind==='electronics'?label('Jenis elektronik','<select name="deviceType">'+opts(Object.entries(deviceTypes),a.deviceType||'laptop')+'</select>'):'')+
   num('purchasePrice','Harga perolehan / nilai dasar (Rp)',a.purchasePrice??'',1e15,1)+dateInput(a)+valuationSelect(mode)+
   '<div id="valuationOptions"></div><div class="estimate valuationPreview" id="valuationPreview" aria-live="polite"></div><p class="hint">Nilai otomatis adalah proyeksi dari harga perolehan, tanggal, dan persentase tahunan. Bukan harga jual sebenarnya atau harga dari toko online. Jangan hitung ganda dengan aset usaha.</p>';
 }else if(isHouse){
  parent.innerHTML=num('land','Nilai dasar tanah (Rp)',a.land)+num('building','Nilai dasar bangunan (Rp)',a.building)+valuationSelect(mode)+'<div id="valuationOptions"></div><div class="estimate valuationPreview" id="valuationPreview" aria-live="polite"></div><p class="hint">Mode manual mempertahankan penilaian rumah yang sudah ada. Mode otomatis memproyeksikan kenaikan tanah dan penyusutan bangunan secara terpisah, bukan harga pasar langsung.</p>';
 }else{
  parent.innerHTML=num('amount',mode==='auto'?'Harga perolehan / nilai dasar (Rp)':'Estimasi harga jual saat ini (Rp)',a.amount)+valuationSelect(mode)+'<div id="valuationOptions"></div><div class="estimate valuationPreview" id="valuationPreview" aria-live="polite"></div><p class="hint">Nilai mobil/motor yang sudah ada tetap manual hingga Anda memilih otomatis. Proyeksi bukan harga pasar kendaraan yang terverifikasi.</p>';
 }
 const modeBox=$('valuationMode');
 function paintFields(){
  const mode=modeBox.value;
  if(isDevice){
   $('valuationOptions').innerHTML=mode==='auto'?directionSelect(a,'down'):num('amount','Estimasi harga jual saat ini (Rp)',a.valuationMode==='manual'?(a.amount??a.purchasePrice):a.valuationMode==='auto'?Math.round(valuationInfo(a)?.current??a.purchasePrice):a.purchasePrice??'',1e15);
  }else if(isHouse){
   $('valuationOptions').innerHTML=mode==='auto'?dateInput(a)+num('landRate','Kenaikan nilai tanah per tahun (%)',a.landRate??5,100,'any')+num('buildingRate','Penyusutan bangunan per tahun (%)',a.buildingRate??3,100,'any'):'';
  }else{
   $('valuationOptions').innerHTML=mode==='auto'?dateInput(a)+directionSelect(a,'down'):'';
   const amount=parent.querySelector('input[name="amount"]');if(amount){amount.closest('label').firstChild.textContent=mode==='auto'?'Harga perolehan / nilai dasar (Rp)':'Estimasi harga jual saat ini (Rp)'}
  }
  preview();
 }
 function preview(){
  const data=new FormData($('form'));
  const draft={kind,valuationMode:data.get('valuationMode')};
  if(isDevice){draft.purchasePrice=Number(data.get('purchasePrice'));draft.amount=Number(data.get('amount'));draft.acquiredAt=data.get('acquiredAt')}
  else if(isHouse){draft.land=Number(data.get('land'));draft.building=Number(data.get('building'));draft.acquiredAt=data.get('acquiredAt');draft.landRate=Number(data.get('landRate'));draft.buildingRate=Number(data.get('buildingRate'))}
  else {draft.amount=Number(data.get('amount'));draft.acquiredAt=data.get('acquiredAt')}
  draft.direction=data.get('direction');draft.annualRate=Number(data.get('annualRate'));
  const info=valuationInfo(draft),output=$('valuationPreview');
  if(!info){output.textContent='Mode manual · nilai aset sesuai angka yang Anda masukkan.';return}
  output.innerHTML='<span class="valuationPreviewTitle">Perkiraan nilai saat ini · '+money(info.current)+'</span>'+valuationDelta(info)+'<small>'+(!info.auto?'Selisih terhadap harga perolehan.':'Dihitung otomatis sampai '+esc(localDay())+'.')+'</small>';
 }
 modeBox.onchange=paintFields;parent.oninput=preview;parent.onchange=e=>{if(e.target!==modeBox)preview()};paintFields();
}
const bankTypes={tabungan:'Tabungan',giro:'Giro',deposito:'Deposito',lainnya:'Lainnya'};
function bankTypeName(code){return bankTypes[code]||'Rekening'}
function bankForm(a={}){
 a=a||{};
 $('specific').innerHTML=label('Nama bank','<input name="bank" maxlength="60" placeholder="Contoh: BCA, Mandiri, BRI, BNI" value="'+esc(a.bank??'')+'" required>')+
 label('Jenis rekening','<select name="accountType">'+opts(Object.entries(bankTypes),a.accountType||'tabungan')+'</select>')+
 num('amount','Saldo saat ini (Rp)',a.amount??0)+
 label('4 digit terakhir rekening (opsional)','<input name="last4" type="text" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="Contoh: 1234" value="'+esc(a.last4??'')+'">')+
 '<p class="hint">Isi saldo masing-masing rekening secara terpisah. Demi privasi, jangan tulis nomor rekening lengkap. Jangan mencatat kembali saldo yang sama sebagai tabungan darurat atau konsumtif agar tidak dihitung dua kali.</p>';
}
function details(a){
 if(a.kind==='phone'||a.kind==='electronics'||(a.valuationMode==='auto'&&['car','bike','house'].includes(a.kind)))return (a.kind==='electronics'?'<div class="detail">'+esc(deviceTypes[a.deviceType]||'Elektronik')+'</div>':'')+currentValueHint(a);
 if(a.kind==='bank')return '<div class="detail">'+esc(a.bank)+' · '+esc(bankTypeName(a.accountType))+(a.last4?' · Rekening ••••'+esc(a.last4):'')+'</div>'; 
 if(a.kind==='business')return '<div class="detail">Aset usaha '+money(businessGross(a))+' · Utang '+money(a.liabilities)+'<br>Porsi Anda '+a.share+'% · Ekuitas '+money(equity(a))+'</div>';
 if(a.kind!=='crypto')return '';
 const amount=dollars(a),price=market.prices[a.symbol],fx=a.fxManual||market.fx?.rate;
 const lines=[];
 if(a.wallet)lines.push(esc(a.wallet));
 if(a.mode!=='balance')lines.push(a.units.toLocaleString('id-ID',{maximumFractionDigits:18})+' '+esc(a.symbol)+' × '+(a.mode==='manual'?usd(a.unitPrice):price?usd(price.rate):'menunggu harga'));
 lines.push(amount===null?'Nilai USD menunggu harga':usd(amount));
 if(a.mode==='auto'&&price)lines.push((failedPrices.has(a.symbol)?'Harga tersimpan':'Coinbase')+' · diambil '+fmtDate(price.date));
 if(a.mode==='auto'&&!price&&failedPrices.has(a.symbol))lines.push('Harga belum tersedia. Coba perbarui atau gunakan harga manual.');
 lines.push(fx?'Kurs '+money(fx)+' / USD · '+(a.fxManual?'manual':esc(market.fx.date)+(fxFailed?' (tersimpan)':'')):'Kurs belum tersedia');
 if(a.cost>0&&amount!==null)lines.push('Selisih terhadap modal '+usd(amount-a.cost));
 return '<div class="detail">'+lines.join('<br>')+'</div>';
}
function cryptoForm(a={}){
 a=a||{};
 const textBox=(key,title,max,value='')=>label(title,'<input name="'+key+'" maxlength="'+max+'" value="'+esc(value||'')+'">');
 $('specific').innerHTML=label('Cara mencatat','<select name="mode" id="cryptoMode">'+opts([['balance','Saldo total dari exchange (USD)'],['auto','Jumlah koin × harga pasar otomatis'],['manual','Jumlah koin × harga USD manual']],a.mode)+'</select>')+'<div id="cryptoInputs"></div>'+textBox('wallet','Exchange atau dompet (opsional)',80,a.wallet)+num('cost','Total modal posisi ini (USD, isi 0 jika dilewati)',a.cost??0,1e12,'any')+num('fxManual','Kurs manual Rp/USD (isi 0 untuk otomatis)',a.fxManual??0,1e7,'any')+'<p class="hint">Catat saldo total exchange atau rincian koin yang membentuk saldo tersebut sekali saja.</p>';
 function inputs(){
  const mode=$('cryptoMode').value;
  if(mode==='balance'){$('cryptoInputs').innerHTML=num('balance','Nilai portofolio dalam USD',a.balance,1e12,'any');return}
  const symbol=mode==='auto'?label('Koin','<select name="symbol">'+opts(coins.map(c=>[c,c]),a.symbol)+'</select>'):label('Simbol koin','<input name="symbol" maxlength="18" pattern="[a-zA-Z0-9._\\-]{1,18}" value="'+esc(a.symbol||'')+'" required>');
  $('cryptoInputs').innerHTML=symbol+num('units','Jumlah unit koin',a.units,1e15,'any')+(mode==='manual'?num('unitPrice','Harga per koin (USD)',a.unitPrice,1e12,'any'):'');
 }
 $('cryptoMode').onchange=inputs;inputs();
}
function businessForm(a={}){
 a=a||{};
 $('specific').innerHTML='<p class="hint">Masukkan nilai seluruh usaha. Persentase kepemilikan diterapkan setelah utang dikurangi.</p>'+Object.entries(businessFields).map(([k,title])=>num(k,title+' (Rp)',a[k]??0)).join('')+num('share','Porsi kepemilikan Anda (%)',a.share??100,100,'any','0.000001')+'<div class="estimate" id="equityPreview"></div><p class="hint">Catat aset dan utang usaha hanya di sini agar tidak terhitung dua kali.</p>';
 const preview=()=>{const fields=new FormData($('form')),draft={};for(const k of [...Object.keys(businessFields),'share'])draft[k]=Number(fields.get(k));$('equityPreview').textContent='Nilai porsi Anda · '+money(equity(draft))};
 $('specific').oninput=preview;preview();
}
