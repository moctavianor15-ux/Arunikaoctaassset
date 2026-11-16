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
function details(a){
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
