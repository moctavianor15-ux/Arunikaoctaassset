import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {valid as serverValid} from '../src/validate.js';
const here=new URL('../',import.meta.url);
const read=(f)=>readFileSync(new URL(f,here),'utf8');
const gold={id:'gold-1',kind:'gold',name:'Antam 10 gram',grams:10,karat:24,mode:'manual',rate:1800000,costTotal:15000000,goldType:'batangan'};
const stock={id:'stock-1',kind:'stock',name:'Bank Central Asia',ticker:'BBCA',exchange:'IDX',currency:'IDR',shares:200,buyPrice:8500,price:9100,priceDate:'2026-11-16',fxManual:0,broker:'Sekuritas contoh'};
const state={version:1,assets:[gold,stock],debt:0,monthly:0,months:6};
function context(){
 const js=[read('public/portfolio.js'),read('public/cashflow.js'),read('public/ai-valuation.js')].join('\n')+'\n';
 const app=read('public/app.js');const ctx=vm.createContext({Intl,localStorage:{getItem:()=>null},document:{getElementById:()=>({})}});
 vm.runInContext(js+app.slice(0,app.indexOf("$('form').onsubmit")),ctx);return ctx;
}
const evaluate=(ctx,code)=>vm.runInContext(code,ctx);
test('V12: emas lama tetap valid dan emas baru menyimpan tipe serta modal',()=>{
 const old={...gold};delete old.goldType;delete old.costTotal;
 assert(serverValid({...state,assets:[old]}));assert(serverValid(state));
 assert(!serverValid({...state,assets:[{...gold,goldType:'imitasi'}]}));
 assert(!serverValid({...state,assets:[{...gold,costTotal:-5}]}));
});
test('V12: saham BEI menyimpan bursa, lot/lembar, harga, dan tanggal',()=>{
 assert(serverValid(state));
 for(const change of [{shares:0},{shares:-1},{price:-1},{price:0},{priceDate:'tidak-valid'},{ticker:'A <script>'},{ticker:'aapl'},{currency:'JPY'},{broker:'x'.repeat(81)}]){
  assert(!serverValid({...state,assets:[{...stock,...change}]}),JSON.stringify(change));
 }
});
test('V12: rumus emas, saham dan perubahan modal tidak dihitung dua kali',()=>{
 const ctx=context();
 assert.equal(evaluate(ctx,`value(${JSON.stringify(gold)})`),18000000);
 assert.equal(evaluate(ctx,`value(${JSON.stringify(stock)})`),1820000);
 evaluate(ctx,`state=${JSON.stringify(state)}`);
 assert.equal(evaluate(ctx,'summary().total'),19820000);
 assert.equal(evaluate(ctx,'summary().net'),19820000);
 assert.equal(evaluate(ctx,`(value(${JSON.stringify(stock)})-stockCostValue(${JSON.stringify(stock)}))`),120000);
 assert.equal(evaluate(ctx,`value({kind:'gold',grams:10,karat:18,mode:'spot'})`),null);
 assert.equal(evaluate(ctx,`quote={rate:2000000};value({kind:'gold',grams:10,karat:18,mode:'spot'})`),15000000);
 assert(evaluate(ctx,`valid(${JSON.stringify(state)})`));
});
test('V12: saham USD membutuhkan kurs yang valid, atau menunggu kurs',()=>{
 const ctx=context(),us={...stock,exchange:'NASDAQ',ticker:'AAPL',currency:'USD',shares:5,price:200,buyPrice:150,fxManual:16000};
 assert.equal(evaluate(ctx,`value(${JSON.stringify(us)})`),16000000);
 assert.equal(evaluate(ctx,`value(${JSON.stringify({...us,fxManual:0})})`),null);
 assert.equal(evaluate(ctx,`market.fx={rate:15900,date:'2026-11-16'};value(${JSON.stringify({...us,fxManual:0})})`),15900000);
});
test('V12: aset baru, harga manual dan branding ada pada halaman',()=>{
 const html=read('public/index.html'),login=read('public/login.html');
 for(const id of ['goldTotal','stockTotal','goldGo','stockGo'])assert(html.includes(`id="${id}"`),id);
 for(const f of ['logo-arunika.webp','favicon.ico','favicon.png','icon-192.png','icon-512.png','site.webmanifest','apple-touch-icon.png'])assert(existsSync(new URL('public/'+f,here)),f);
 assert(html.includes('rel="manifest"'));assert(login.includes('rel="manifest"'));
 assert(html.includes('class="brandLogo"'));assert(login.includes('class="loginBrandLogo"'));
});
test('V12: kode asli tetap mempertahankan binding D1 dan API investasi tanpa migrasi',()=>{
 const source=read('src/worker.js'),valid=read('src/validate.js');
 assert(source.includes("env.DB.prepare('UPDATE portfolio SET data="));
 assert(source.includes("'/favicon.ico'"));assert(valid.includes("if(a.kind==='stock')return validStock(a)"));
 assert(!read('public/portfolio.js').includes('apiKey='));
});
