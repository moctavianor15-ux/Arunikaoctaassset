'use strict';
const coinNames = {
 "BTC": "Bitcoin",
 "ETH": "Ethereum",
 "USDT": "Tether",
 "SOL": "Solana",
 "BNB": "BNB",
 "XRP": "XRP",
 "USDC": "USD Coin",
 "DOGE": "Dogecoin",
 "ADA": "Cardano",
 "TRX": "TRON",
 "LINK": "Chainlink",
 "AVAX": "Avalanche",
 "LTC": "Litecoin",
 "BCH": "Bitcoin Cash",
 "DOT": "Polkadot",
 "XLM": "Stellar",
 "SUI": "Sui"
};
const coins = Object.keys(coinNames);
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
function coinPositions(assets) {
 const groups = new Map();
 for (const asset of assets) {
  if (asset.kind !== 'crypto' || asset.mode === 'balance') continue;
  const symbol = asset.symbol.toUpperCase();
  const row = groups.get(symbol) || {symbol, units: 0, positions: []};
  row.units += asset.units;
  row.positions.push(asset);
  groups.set(symbol, row);
 }
 return [...groups.values()].sort((a,b) => a.symbol.localeCompare(b.symbol));
}
function coinBreakdown(assets) {
 const groups = coinPositions(assets);
 if (!groups.length) return '';
 return '<details class="coinBreakdown"><summary>Kepemilikan per koin (' + groups.length + ')</summary><dl>' +
  groups.map(row => '<div><dt>' + esc(row.symbol) + '</dt><dd>' +
   row.units.toLocaleString('id-ID',{maximumFractionDigits:18}) + ' unit · ' +
   positionValue(row.positions, dollars, usd) + '</dd></div>').join('') + '</dl></details>';
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
 const chosen=aiSelectedValue(a);
 const chosenText=chosen===null?'':'<br><b>Dipakai untuk kekayaan bersih: '+esc(aiValueLabel(a))+' · '+money(chosen)+'</b>';
 return '<div class="detail"><span class="valuationCaption">'+model+' · acuan '+esc(info.date)+'</span><br>Nilai dasar '+money(info.basis)+' · Saat ini '+money(info.current)+'<br>'+valuationDelta(info)+chosenText+(info.land!==undefined?'<br>Proyeksi tanah '+money(info.land)+' · bangunan '+money(info.building):'')+'</div>';
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

// Portofolio emas (kompatibel dengan format aset emas sejak versi pertama).
const goldKinds={batangan:'Emas batangan',perhiasan:'Perhiasan emas',digital:'Emas digital',lainnya:'Emas lainnya'};
function goldForm(a={}){
 a=a||{};
 $('specific').innerHTML=
  label('Jenis emas','<select name="goldType">'+opts(Object.entries(goldKinds),a.goldType||'batangan')+'</select>')+
  num('grams','Berat emas (gram)',a.grams??'',1e7,'any','0.000001')+
  num('karat','Kadar emas (karat)',a.karat??24,24,'any','0.001')+
  num('costTotal','Total modal pembelian (Rp, isi 0 jika tidak diketahui)',a.costTotal??0,1e15)+
  label('Dasar penilaian','<select name="mode" id="mode">'+opts([['spot','Otomatis: spot emas 24K × kadar'],['manual','Manual: harga buyback aktual per gram']],a.mode||'spot')+'</select>')+
  '<div id="rateBox"></div><div class="estimate" id="goldPreview" aria-live="polite"></div>'+
  '<p class="hint">Harga spot memakai acuan emas internasional dan kurs USD/IDR saat data berhasil diambil; bukan jaminan harga buyback toko. Modal dapat dipakai untuk membandingkan untung/rugi yang belum direalisasikan. Catat emas ini satu kali saja.</p>';
 const paint=()=>{
  $('rateBox').innerHTML=$('mode').value==='manual'?num('rate','Harga buyback untuk kadar ini (Rp/gram)',a.rate??'',1e10,'any','0.01'):'<p class="hint">Perhitungan: gram × kadar ÷ 24 × harga spot per gram. Jika sumber spot tidak tersedia, nilai ditandai menunggu harga.</p>';
  preview();
 };
 const preview=()=>{
  const d=new FormData($('form'));
  const grams=Number(d.get('grams')),karat=Number(d.get('karat')),cost=Number(d.get('costTotal'));
  const rate=d.get('mode')==='manual'?Number(d.get('rate')):quote?.rate;
  const current=rate==null?null:grams*(d.get('mode')==='manual'?1:karat/24)*rate;
  $('goldPreview').textContent=current===null?'Nilai menunggu harga spot. Anda bisa memakai mode manual.':'Nilai estimasi '+money(current)+(cost>0?' · Selisih modal '+(current-cost>=0?'+':'−')+money(Math.abs(current-cost)):'');
 };
 $('mode').onchange=paint;$('specific').oninput=preview;paint();
}
// Pencatatan saham: harga pasar MANUAL dengan waktu pembaruan, tidak mengarang kuotasi realtime.
function stockFx(a){return a.currency==='IDR'?1:(a.fxManual||market.fx?.rate||null)}
function stockValue(a){const fx=stockFx(a);return fx===null?null:a.shares*a.price*fx}
function stockCostValue(a){const fx=stockFx(a);return fx===null?null:a.shares*a.buyPrice*fx}
const stockCatalog = {
 IDX: {BBCA:'Bank Central Asia',BBRI:'Bank Rakyat Indonesia',BMRI:'Bank Mandiri',BBNI:'Bank Negara Indonesia',
  TLKM:'Telkom Indonesia',ASII:'Astra International',ICBP:'Indofood CBP',INDF:'Indofood Sukses Makmur',ANTM:'Aneka Tambang'},
 NASDAQ: {AAPL:'Apple',MSFT:'Microsoft',NVDA:'NVIDIA',AMZN:'Amazon',GOOGL:'Alphabet Kelas A',META:'Meta Platforms'},
 NYSE: {JPM:'JPMorgan Chase',V:'Visa',KO:'Coca-Cola',XOM:'Exxon Mobil'}
};
function stockCatalogOptions() {
 return Object.entries(stockCatalog).map(([market,stocks]) =>
  '<optgroup label="'+(market === 'IDX' ? 'Indonesia · BEI' : 'Amerika Serikat · '+market)+'">'+
  opts(Object.entries(stocks).map(([ticker,name])=>[market+'/'+ticker,ticker+' · '+name]))+'</optgroup>').join('');
}
function stockForm(a={}){
 a=a||{};
 $('specific').innerHTML=
  label('Pilih saham','<select id="stockPreset"><option value="">Isi sendiri atau pilih emiten</option>'+stockCatalogOptions()+'</select>')+
  label('Kode saham / ticker','<input name="ticker" maxlength="14" pattern="[A-Za-z0-9.\\-]{1,14}" placeholder="BBCA / TLKM / AAPL" value="'+esc(a.ticker||'')+'" required>')+
  label('Bursa','<select name="exchange" id="stockExchange">'+opts([['IDX','Indonesia (BEI/IDX)'],['NYSE','Amerika (NYSE)'],['NASDAQ','Amerika (NASDAQ)'],['OTHER','Bursa lainnya']],a.exchange||'IDX')+'</select>')+
  label('Mata uang harga per lembar','<select name="currency" id="stockCurrency">'+opts([['IDR','Rupiah (IDR)'],['USD','Dolar AS (USD)']],a.currency||'IDR')+'</select>')+
  num('shares','Jumlah saham (lembar; 1 lot BEI = 100 lembar)',a.shares??'',1e12,'any','0.000001')+
  num('buyPrice','Harga beli rata-rata per lembar (0 jika tidak tahu)',a.buyPrice??0,1e12,'any')+
  num('price','Harga terkini per lembar (diisi manual)',a.price??'',1e12,'any','0.000001')+
  label('Tanggal harga terakhir diperbarui','<input name="priceDate" type="date" min="1900-01-01" max="'+localDay()+'" value="'+esc(a.priceDate||localDay())+'" required>')+
  label('Sekuritas / broker (opsional)','<input name="broker" maxlength="80" placeholder="Contoh: Stockbit, IPOT" value="'+esc(a.broker||'')+'">')+
  '<div id="stockFxBox"></div><div class="estimate" id="stockPreview" aria-live="polite"></div>'+
  '<p class="hint">Harga saham tidak terhubung ke bursa realtime. Perbarui harga per lembar dan tanggal secara manual; kurs USD/IDR dapat mengikuti data Frankfurter jika tersedia. Nilai saham tidak otomatis mengurangi saldo bank. Jika pembelian saham dibayar lewat bank, catat juga mutasi uang keluar agar uang tidak dihitung dua kali.</p>';
 const paintFx=()=>{
  $('stockFxBox').innerHTML=$('stockCurrency').value==='USD'
   ?num('fxManual','Kurs manual Rp/USD (0 untuk kurs otomatis)',a.fxManual??0,1e7,'any') 
   :'<input type="hidden" name="fxManual" value="0">';
  preview();
 };
 function preview(){
  const data=new FormData($('form')),shares=Number(data.get('shares')),price=Number(data.get('price')),buy=Number(data.get('buyPrice'));
  const curr=data.get('currency'),fx=curr==='IDR'?1:(Number(data.get('fxManual'))||market.fx?.rate||null);
  const lots=data.get('exchange')==='IDX'?' · '+(shares/100).toLocaleString('id-ID',{maximumFractionDigits:4})+' lot':'';
  $('stockPreview').textContent=fx===null?'Kurs USD belum tersedia. Masukkan kurs manual untuk menghitung nilai dalam rupiah.':
   'Nilai saham '+money(shares*price*fx)+lots+(buy>0?' · Selisih modal '+(price>=buy?'+':'−')+money(Math.abs((price-buy)*shares*fx)):'');
 }
 const fields=$('form').elements;
 const preset=$('stockPreset');
 const currentPreset=()=>stockCatalog[fields.exchange.value]?.[fields.ticker.value.toUpperCase()]
  ? fields.exchange.value+'/'+fields.ticker.value.toUpperCase() : '';
 preset.value=currentPreset();
 preset.onchange=()=>{
  if(!preset.value){fields.ticker.focus();return}
  const [exchange,ticker]=preset.value.split('/');
  const previousName=stockCatalog[fields.exchange.value]?.[fields.ticker.value.toUpperCase()];
  if(!fields.name.value.trim() || fields.name.value===previousName)fields.name.value=stockCatalog[exchange][ticker];
  fields.ticker.value=ticker;
  fields.exchange.value=exchange;
  fields.currency.value=exchange==='IDX'?'IDR':'USD';
  paintFx();
 };
 fields.ticker.oninput=()=>{preset.value=currentPreset()};
 $('stockCurrency').onchange=paintFx;$('stockExchange').onchange=()=>{preset.value=currentPreset();preview()};$('specific').oninput=preview;paintFx();
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
 if(a.kind==='gold'){
  const amount=a.mode==='manual'?a.grams*a.rate:quote?a.grams*a.karat/24*quote.rate:null;
  const difference=a.costTotal>0&&amount!==null?'<br>Modal '+money(a.costTotal)+' · '+(amount>=a.costTotal?'Untung belum direalisasi ':'Rugi belum direalisasi ')+money(Math.abs(amount-a.costTotal)):'';
  return '<div class="detail">'+esc(goldKinds[a.goldType]||'Emas')+' · '+qty.format(a.grams)+' gram · '+a.karat+'K · '+(a.mode==='spot'?'acuan spot otomatis':'buyback manual')+difference+'</div>';
 }
 if(a.kind==='stock'){
  const amount=stockValue(a),cost=stockCostValue(a);
  const gain=cost!==null&&a.buyPrice>0?'<br>Modal '+money(cost)+' · '+(amount>=cost?'Untung belum direalisasi ':'Rugi belum direalisasi ')+money(Math.abs(amount-cost)):'';
  return '<div class="detail">'+esc(a.exchange)+' · '+esc(a.ticker)+' · '+a.shares.toLocaleString('id-ID',{maximumFractionDigits:6})+' lembar'+
   (a.exchange==='IDX'?' ('+(a.shares/100).toLocaleString('id-ID',{maximumFractionDigits:4})+' lot)':'')+'<br>'+
   'Harga '+esc(a.currency)+' '+qty.format(a.price)+' / lembar · '+esc(a.priceDate)+(a.broker?'<br>'+esc(a.broker):'')+
   (amount===null?'<br>Kurs USD/IDR belum tersedia. Isi kurs manual untuk menghitung.':gain)+'</div>';
 }
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
function cryptoForm(a={}, initialSymbol){
 a=a||{};
 const textBox=(key,title,max,value='')=>label(title,'<input name="'+key+'" maxlength="'+max+'" value="'+esc(value||'')+'">');
 $('specific').innerHTML=label('Cara mencatat','<select name="mode" id="cryptoMode">'+opts([['balance','Saldo di bursa kripto (USD)'],['auto','Jumlah koin × harga pasar otomatis'],['manual','Jumlah koin × harga USD manual']],a.mode || 'auto')+'</select>')+'<div id="cryptoInputs"></div>'+textBox('wallet','Nama bursa atau dompet (opsional)',80,a.wallet)+num('cost','Modal posisi ini dalam USD (isi 0 jika belum diketahui)',a.cost??0,1e12,'any')+num('fxManual','Kurs manual Rp/USD (isi 0 untuk otomatis)',a.fxManual??0,1e7,'any')+'<p class="hint">Jika saldo bursa sudah mencakup semua koin, pilih satu cara pencatatan agar kepemilikan Anda dihitung sekali.</p>';
 function inputs(){
  const mode=$('cryptoMode').value;
  if(mode==='balance'){$('cryptoInputs').innerHTML=num('balance','Nilai portofolio dalam USD',a.balance,1e12,'any');return}
  const symbol=mode==='auto'?label('Koin','<select name="symbol">'+opts(coins.map(c=>[c,coinNames[c]===c?c:coinNames[c]+' ('+c+')']),a.symbol || initialSymbol)+'</select>'):label('Simbol koin','<input name="symbol" maxlength="18" pattern="[a-zA-Z0-9._\\-]{1,18}" value="'+esc(a.symbol||initialSymbol||'')+'" required>');
  $('cryptoInputs').innerHTML=symbol+num('units','Jumlah unit koin',a.units,1e15,'any')+(mode==='manual'?num('unitPrice','Harga per koin (USD)',a.unitPrice,1e12,'any'):'');
 }
 const previewBox = document.createElement('div');
 previewBox.className = 'estimate';
 previewBox.setAttribute('aria-live','polite');
 $('specific').append(previewBox);
 function preview() {
  const data = new FormData($('form'));
  const mode = data.get('mode');
  const quantity = data.get(mode === 'balance' ? 'balance' : 'units');
  if (!quantity) { previewBox.textContent = 'Masukkan saldo atau jumlah koin untuk melihat estimasi.'; return; }
  const price = mode === 'balance' ? 1 : mode === 'manual' ? data.get('unitPrice') : market.prices[data.get('symbol')]?.rate;
  if (!Number(price)) { previewBox.textContent = mode === 'manual' ? 'Masukkan harga per koin dalam USD.' : 'Harga koin akan diperbarui setelah posisi disimpan.'; return; }
  const amount = Number(quantity) * Number(price);
  const fx = Number(data.get('fxManual')) || market.fx?.rate;
  previewBox.textContent = usd(amount) + (fx ? ' · ' + money(amount * fx) : ' · Menunggu kurs rupiah');
 }
 $('cryptoMode').onchange = () => { inputs(); preview(); };
 $('specific').oninput = preview;
 inputs(); preview();
}
function businessForm(a={}){
 a=a||{};
 $('specific').innerHTML='<p class="hint">Masukkan nilai seluruh usaha. Persentase kepemilikan diterapkan setelah utang dikurangi.</p>'+Object.entries(businessFields).map(([k,title])=>num(k,title+' (Rp)',a[k]??0)).join('')+num('share','Porsi kepemilikan Anda (%)',a.share??100,100,'any','0.000001')+'<div class="estimate" id="equityPreview"></div><p class="hint">Catat aset dan utang usaha hanya di sini agar tidak terhitung dua kali.</p>';
 const preview=()=>{const fields=new FormData($('form')),draft={};for(const k of [...Object.keys(businessFields),'share'])draft[k]=Number(fields.get(k));$('equityPreview').textContent='Nilai porsi Anda · '+money(equity(draft))};
 $('specific').oninput=preview;preview();
}
