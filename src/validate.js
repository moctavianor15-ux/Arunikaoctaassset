const keys=['house','car','bike','gold','crypto','business','emergency','spending'];
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
  if(a.kind==='house')return number(a.land)&&number(a.building);
  if(a.kind==='gold')return number(a.grams,1e7)&&a.grams>0&&number(a.karat,24)&&a.karat>0&&['spot','manual'].includes(a.mode)&&(a.mode==='spot'||(number(a.rate,1e10)&&a.rate>0));
  if(a.kind==='crypto')return validCrypto(a);
  if(a.kind==='business')return Object.keys(businessFields).every(k=>number(a[k]))&&number(a.share,100)&&a.share>0;
  return number(a.amount);
 });
}
function validCrypto(a){
 if(!['balance','auto','manual'].includes(a.mode)||typeof a.wallet!=='string'||a.wallet.length>80||!number(a.fxManual,1e7)||!number(a.cost,1e12))return false;
 if(a.mode==='balance')return number(a.balance,1e12);
 if(!number(a.units,1e15)||a.units<=0)return false;
 return a.mode==='auto'?coins.includes(a.symbol):typeof a.symbol==='string'&&/^[a-z0-9._-]{1,18}$/i.test(a.symbol)&&number(a.unitPrice,1e12)&&a.unitPrice>0;
}

export {valid};
