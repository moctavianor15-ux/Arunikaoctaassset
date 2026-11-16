import {assetSignature} from './valuation-ai.js';
const keys=['house','car','bike','gold','crypto','business','bank','phone','electronics','emergency','spending'];
const coins = ['BTC','ETH','SOL','XRP','BNB','ADA','DOGE','USDT','USDC'];
const businessFields = {
 cash:'Kas dan saldo bank usaha', inventory:'Persediaan barang', receivables:'Piutang yang diperkirakan tertagih',
 equipment:'Peralatan, properti dan aset tetap', other:'Aset usaha lainnya', liabilities:'Sisa utang usaha'
};
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
function validVehicleValuation(a){return (a.valuationMode===undefined||a.valuationMode==='manual'||(a.valuationMode==='auto'&&validAutomaticFields(a)))&&validUserAI(a)}
function validHouseValuation(a){return (a.valuationMode===undefined||a.valuationMode==='manual'||(a.valuationMode==='auto'&&validDay(a.acquiredAt)&&number(a.landRate,100)&&number(a.buildingRate,100)))&&validUserAI(a)}
function validElectronics(a){
 return (a.kind!=='electronics'||electronicTypes.includes(a.deviceType))&&number(a.purchasePrice)&&validDay(a.acquiredAt)&&
  (a.valuationMode==='manual'?number(a.amount):a.valuationMode==='auto'&&valuationDirections.includes(a.direction)&&number(a.annualRate,100))&&validUserAI(a);
}
function validUserAI(a){
 if(a.ownerValue!==undefined&&!number(a.ownerValue))return false;
 if(a.valuationSource!==undefined&&!['projection','user','ai'].includes(a.valuationSource))return false;
 if(a.valuationSource==='user'&&!number(a.ownerValue))return false;
 if(a.aiValuation===undefined)return a.valuationSource!=='ai';
 const v=a.aiValuation;
 return v&&number(v.amount)&&number(v.lower)&&number(v.upper)&&v.lower<=v.amount&&v.amount<=v.upper&&number(v.baseline)&&
  typeof v.asOf==='string'&&Number.isFinite(Date.parse(v.asOf))&&v.asOf.length<=40&&
  typeof v.model==='string'&&v.model.length<=120&&['rendah','sedang'].includes(v.confidence)&&
  ['input-pengguna','model-tanpa-data-pasar'].includes(v.sourceType)&&typeof v.reason==='string'&&v.reason.length<=400&&
  Number.isInteger(v.comparablesUsed)&&v.comparablesUsed>=0&&v.comparablesUsed<=3&&Array.isArray(v.comparablePrices)&&v.comparablePrices.length===v.comparablesUsed&&v.comparablePrices.every(x=>Number.isSafeInteger(x)&&x>0&&x<=1e15)&&
  typeof v.sourceUrl==='string'&&v.sourceUrl.length<=300&&(!v.sourceUrl||(/^https:\/\/[^\s]+$/i.test(v.sourceUrl)&&!v.sourceUrl.includes('@')))&&
  ['new','good','fair','poor'].includes(v.condition)&&typeof v.signature==='string'&&v.signature.length<=600&&v.signature===assetSignature(a);
}
function validCrypto(a){
 if(!['balance','auto','manual'].includes(a.mode)||typeof a.wallet!=='string'||a.wallet.length>80||!number(a.fxManual,1e7)||!number(a.cost,1e12))return false;
 if(a.mode==='balance')return number(a.balance,1e12);
 if(!number(a.units,1e15)||a.units<=0)return false;
 return a.mode==='auto'?coins.includes(a.symbol):typeof a.symbol==='string'&&/^[a-z0-9._-]{1,18}$/i.test(a.symbol)&&number(a.unitPrice,1e12)&&a.unitPrice>0;
}


// Data buku kas opsional untuk kompatibilitas cadangan dan database versi sebelumnya.
function validCashflow(s){
 if(s.transactions===undefined)return true;
 if(!Array.isArray(s.transactions)||s.transactions.length>5000)return false;
 const banks=new Map(s.assets.filter(a=>a.kind==='bank').map(a=>[a.id,a]));
 const changes=new Map();const ids=new Set();
 const add=(id,amount)=>changes.set(id,(changes.get(id)||0)+amount);
 for(const t of s.transactions){
  if(!t||typeof t.id!=='string'||!/^[-\w]{1,80}$/.test(t.id)||ids.has(t.id)||
    !['income','expense','transfer'].includes(t.type)||!validDay(t.date)||
    !Number.isSafeInteger(t.amount)||t.amount<=0||t.amount>1e15||
    typeof t.accountId!=='string'||!banks.has(t.accountId)||
    typeof t.category!=='string'||!t.category.trim()||t.category.length>60||
    typeof t.note!=='string'||t.note.length>240)return false;
  ids.add(t.id);
  if(t.type==='transfer'){
   if(typeof t.toAccountId!=='string'||t.toAccountId===t.accountId||!banks.has(t.toAccountId))return false;
   add(t.accountId,-t.amount);add(t.toAccountId,t.amount);
  }else{
   if(t.toAccountId!==undefined)return false;
   add(t.accountId,t.type==='income'?t.amount:-t.amount);
  }
 }
 for(const [id,a] of banks){const balance=a.amount+(changes.get(id)||0);if(!number(balance)||balance>1e15)return false}
 return true;
}

export {valid};
