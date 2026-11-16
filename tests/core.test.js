import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker.js';
import {hashPassword,verifyPassword,digest,credentialVersion} from '../src/auth.js';
import {valid} from '../src/validate.js';
const password='test-password-long-2026',hash=hashPassword(password);
function setup(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001.sql',import.meta.url),'utf8'));
 const env={AUTH_USERNAME:'owner',AUTH_PASSWORD_HASH:hash,DB:{prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null},async run(){return db.prepare(sql).run(...args)}}},async first(){return db.prepare(sql).get()||null}}}},ASSETS:{fetch:async()=>new Response('asset')}};
 const req=(path,method='GET',body,cookie,origin='https://example.test')=>worker.fetch(new Request('https://example.test'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
 return {db,env,req};
}
const state={version:1,assets:[{id:'a',kind:'house',name:'Rumah',land:100,building:200}],debt:20,monthly:30,months:6};
test('hash acak, password benar dan salah',()=>{assert(verifyPassword(password,hash));assert(!verifyPassword('wrong',hash));assert.notEqual(hash,hashPassword(password))});
test('validasi data menolak angka negatif dan ID ganda',()=>{assert(valid(state));assert(!valid({...state,debt:-1}));assert(!valid({...state,assets:[...state.assets,...state.assets]}));assert(!valid({...state,months:0}));assert(!valid({...state,assets:[{id:'a',kind:'crypto',name:'BTC',mode:'auto',units:1,symbol:'BAD',wallet:'',cost:0,fxManual:0}]}))});
test('API privat, CSRF, login, save, konflik, logout',async()=>{
 const {req}=setup();assert.equal((await req('/api/portfolio')).status,401);assert.equal((await req('/')).status,200);assert.equal((await req('/cashflow.js')).status,200);
 assert.equal((await req('/api/login','POST',{username:'owner',password},null,'https://evil.test')).status,403);
 assert.equal((await req('/api/login','POST',{username:'owner',password:'wrong'})).status,401);
 const login=await req('/api/login','POST',{username:'owner',password});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
 assert.equal((await req('/api/portfolio','PUT',{state,revision:0},cookie)).status,200);
 assert.equal((await req('/api/portfolio','PUT',{state,revision:0},cookie)).status,409);
 assert.equal((await req('/api/portfolio','PUT',{state:{...state,debt:-1},revision:1},cookie)).status,400);
 const saved=await (await req('/api/portfolio','GET',undefined,cookie)).json();assert.deepEqual(saved.state,state);assert.equal(saved.revision,1);
 assert.equal((await req('/api/logout','POST',undefined,cookie)).status,200);assert.equal((await req('/api/portfolio','GET',undefined,cookie)).status,401);
});
test('sesi kedaluwarsa dan rotasi credential',async()=>{
 const {req,db,env}=setup();const raw='a'.repeat(64);db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(raw),credentialVersion(env),1);
 assert.equal((await req('/api/portfolio','GET',undefined,'__Host-arunika='+raw)).status,401);
 const login=await req('/api/login','POST',{username:'owner',password});env.AUTH_USERNAME='changed';assert.equal((await req('/api/portfolio','GET',undefined,login.headers.get('set-cookie'))).status,401);
});
test('rate limit menghentikan percobaan ke-11',async()=>{const {req}=setup();for(let i=0;i<10;i++)assert.equal((await req('/api/login','POST',{})).status,401);assert.equal((await req('/api/login','POST',{})).status,429)});
test('header keamanan dan pembatasan ukuran',async()=>{const {req}=setup();const r=await req('/login');assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal((await req('/api/login','POST',{password:'x'.repeat(3000)})).status,413)});
test('rumus rumah, emas, kripto, porsi usaha negatif dan dana darurat',()=>{
 const ctx=vm.createContext({Intl,localStorage:{getItem:()=>null},document:{getElementById:()=>({})}});
 const portfolio=readFileSync(new URL('../public/portfolio.js',import.meta.url),'utf8');const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const cash=readFileSync(new URL('../public/cashflow.js',import.meta.url),'utf8');
 vm.runInContext(portfolio+'\n'+cash+'\n'+app.slice(0,app.indexOf("$('form').onsubmit")),ctx);
 const calc=s=>vm.runInContext(s,ctx);
 assert.equal(calc('value({kind:"house",land:100,building:200})'),300);
 assert.equal(calc('quote={rate:1000};value({kind:"gold",mode:"spot",grams:10,karat:18})'),7500);
 assert.equal(calc('value({kind:"gold",mode:"manual",grams:10,rate:500,karat:18})'),5000);
 assert.equal(calc('value({kind:"crypto",mode:"balance",balance:100,fxManual:16000})'),1600000);
 assert.equal(calc('equity({cash:100,inventory:100,receivables:0,equipment:0,other:0,liabilities:300,share:50})'),-50);
 assert.equal(calc('state.monthly=3000000;state.months=6;state.monthly*state.months'),18000000);
});

test('halaman login tetap tersedia tanpa binding, API memberi petunjuk',async()=>{const {req,env}=setup();delete env.DB;assert.equal((await req('/login')).status,200);const r=await req('/api/portfolio');assert.equal(r.status,503);assert.match((await r.json()).error,/binding D1/)});
test('password mentah tidak diterima sebagai hash',async()=>{const {req,env}=setup();env.AUTH_PASSWORD_HASH='not-a-hash';const r=await req('/api/login','POST',{username:'owner',password});assert.equal(r.status,503);assert.match((await r.json()).error,/Format AUTH_PASSWORD_HASH/)});
test('schema hilang memberi pesan aman',async()=>{const {req,db}=setup();db.exec('DROP TABLE attempts');const r=await req('/api/login','POST',{username:'owner',password});assert.equal(r.status,503);assert.match((await r.json()).error,/migrations/)});

test('tabungan bank: validasi beberapa rekening, jenis, saldo, dan keamanan data',()=>{
 const accounts=[
  {id:'bank-bca',kind:'bank',name:'Tabungan utama',bank:'BCA',accountType:'tabungan',last4:'1234',amount:15000000},
  {id:'bank-mandiri',kind:'bank',name:'Deposito berjangka',bank:'Mandiri',accountType:'deposito',last4:'',amount:8000000}
 ];
 assert(valid({...state,assets:[...state.assets,...accounts]}));
 for(const change of [
  {bank:' '}, {bank:'a'.repeat(61)}, {accountType:'investasi'}, {last4:'12345'},
  {last4:'abcd'}, {amount:-10}, {amount:'50000'}, {amount:Infinity}
 ])assert(!valid({...state,assets:[{...accounts[0],...change}]}),JSON.stringify(change));
 assert(valid({...state,assets:[{...accounts[0],last4:''}]}));
});

test('rekening bank tersimpan di D1 bersama aset lama tanpa migrasi dan tetap bisa dibaca',async()=>{
 const {req}=setup();
 const bank={id:'rekening-satu',kind:'bank',name:'Rekening operasional',bank:'BRI',accountType:'giro',last4:'4932',amount:27500000};
 const next={...state,assets:[...state.assets,bank]};
 const login=await req('/api/login','POST',{username:'owner',password});
 const cookie=login.headers.get('set-cookie');
 assert.equal((await req('/api/portfolio','PUT',{state:next,revision:0},cookie)).status,200);
 const res=await (await req('/api/portfolio','GET',undefined,cookie)).json();
 assert.deepEqual(res.state,next);
 assert.equal(res.revision,1);
});

test('rincian kekayaan bersih menghitung bank dan semua kategori, mengurangi utang serta defisit usaha',()=>{
 const ctx=vm.createContext({Intl,localStorage:{getItem:()=>null},document:{getElementById:()=>({})}});
 const portfolio=readFileSync(new URL('../public/portfolio.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const cash=readFileSync(new URL('../public/cashflow.js',import.meta.url),'utf8');
 vm.runInContext(portfolio+'\n'+cash+'\n'+app.slice(0,app.indexOf("$('form').onsubmit")),ctx);
 const testState={version:1,assets:[
  {id:'house',kind:'house',name:'Rumah',land:300,building:200},
  {id:'bank1',kind:'bank',name:'Rekening 1',bank:'BCA',accountType:'tabungan',last4:'1234',amount:100},
  {id:'bank2',kind:'bank',name:'Rekening 2',bank:'BNI',accountType:'tabungan',last4:'',amount:200},
  {id:'biz',kind:'business',name:'Usaha',cash:100,inventory:0,receivables:0,equipment:0,other:0,liabilities:200,share:50}
 ],debt:120,monthly:0,months:6};
 ctx.sample=testState;
 const s=vm.runInContext('state=sample; summary()',ctx);
 assert.equal(s.sums.bank,300);
 assert.equal(s.sums.house,500);
 assert.equal(s.total,800);
 assert.equal(s.deficit,50);
 assert.equal(s.net,630);
 assert.equal(s.missing,0);
});

test('rincian aset bank menampilkan label yang aman dari HTML tidak tepercaya',()=>{
 const nodes={netDetails:{innerHTML:''}};
 const ctx=vm.createContext({Intl,localStorage:{getItem:()=>null},document:{getElementById:id=>nodes[id]||{}}});
 const portfolio=readFileSync(new URL('../public/portfolio.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const cash=readFileSync(new URL('../public/cashflow.js',import.meta.url),'utf8');
 vm.runInContext(portfolio+'\n'+cash+'\n'+app.slice(0,app.indexOf("$('form').onsubmit")),ctx);
 ctx.example={version:1,assets:[{id:'evil',kind:'bank',name:'<img src=x onerror=alert(1)>',bank:'BCA & Co',accountType:'tabungan',last4:'',amount:100}],debt:10,monthly:0,months:6};
 vm.runInContext('state=example; renderNetBreakdown(summary())',ctx);
 assert.match(nodes.netDetails.innerHTML,/&lt;img/);
 assert.match(nodes.netDetails.innerHTML,/BCA &amp; Co/);
 assert(!nodes.netDetails.innerHTML.includes('<img src=x'));
 assert.match(nodes.netDetails.innerHTML,/KEKAYAAN BERSIH/);
});

// Pengujian v5: perangkat elektronik & proyeksi aset tetap.
function contextForValuation(){
 const ctx=vm.createContext({Intl,localStorage:{getItem:()=>null},document:{getElementById:()=>({})}});
 const portfolio=readFileSync(new URL('../public/portfolio.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const cash=readFileSync(new URL('../public/cashflow.js',import.meta.url),'utf8');
 vm.runInContext(portfolio+'\n'+cash+'\n'+app.slice(0,app.indexOf("$('form').onsubmit")),ctx);
 return ctx;
}
const phone={id:'hp1',kind:'phone',name:'HP pribadi',purchasePrice:12000000,acquiredAt:'2025-11-16',valuationMode:'auto',direction:'down',annualRate:25};
const laptop={id:'lap1',kind:'electronics',name:'Laptop kerja pribadi',deviceType:'laptop',purchasePrice:20000000,acquiredAt:'2025-11-16',valuationMode:'auto',direction:'up',annualRate:10};
test('validasi HP, laptop dan kompatibilitas aset yang sudah ada',()=>{
 assert(valid({...state,assets:[...state.assets,phone,laptop]}));
 for(const change of [
  {purchasePrice:-1},{purchasePrice:'12000000'},{acquiredAt:'2025-02-30'},
  {acquiredAt:'2029-01-01'},{annualRate:101},{annualRate:-1},
  {direction:'crash'},{valuationMode:'unknown'}
 ])assert(!valid({...state,assets:[{...phone,...change}]}),JSON.stringify(change));
 assert(!valid({...state,assets:[{...laptop,deviceType:'<img>'}]}));
 assert(valid({...state,assets:[{...phone,valuationMode:'manual',amount:6500000}]}));
 assert(!valid({...state,assets:[{...phone,valuationMode:'manual',amount:-1}]}));
 assert(valid({...state,assets:[{id:'c',kind:'car',name:'Mobil lama',amount:140000000},{id:'b',kind:'bike',name:'Motor lama',amount:15000000}]}));
 assert(!valid({...state,assets:[{id:'c',kind:'car',name:'Mobil',amount:1,valuationMode:'auto',acquiredAt:'2020-01-01',direction:'down',annualRate:120}]}));
 assert(valid({...state,assets:[{id:'h',kind:'house',name:'Rumah',land:100,building:200,valuationMode:'auto',acquiredAt:'2019-01-01',landRate:5,buildingRate:3}]}));
 assert(!valid({...state,assets:[{id:'h',kind:'house',name:'Rumah',land:100,building:200,valuationMode:'auto',acquiredAt:'2019-01-01',landRate:200,buildingRate:3}]}));
});
test('estimasi penyusutan dan kenaikan otomatis mengikuti waktu, manual tidak berubah',()=>{
 const ctx=contextForValuation();
 const testData={phone,laptop,manual:{...phone,valuationMode:'manual',amount:7200000},car:{kind:'car',name:'Mobil',amount:100000000,valuationMode:'auto',acquiredAt:'2025-11-16',direction:'down',annualRate:20},house:{kind:'house',name:'Rumah',land:200000000,building:100000000,valuationMode:'auto',acquiredAt:'2025-11-16',landRate:10,buildingRate:5}};
 ctx.sample=testData;
 const calc=s=>vm.runInContext(s,ctx);
 assert.equal(calc('projection(10000000,"2025-11-16","down",20,"2025-11-16")'),10000000);
 assert(Math.abs(calc('projection(10000000,"2025-11-16","down",20,"2026-11-16")')-8000000)<1500);
 assert(Math.abs(calc('projection(10000000,"2025-11-16","up",10,"2026-11-16")')-11000000)<1500);
 assert.equal(calc('projection(10000000,"2025-11-16","flat",33,"2026-11-16")'),10000000);
 assert.equal(calc('projection(10000000,"2025-11-16","down",100,"2026-11-16")'),0);
 assert.equal(calc('projection(10000000,"2025-11-16","up",10,"2025-11-15")'),10000000);
 assert(Math.abs(calc('valuationInfo(sample.phone,"2026-11-16").current')-9000000)<3000);
 assert(Math.abs(calc('valuationInfo(sample.laptop,"2026-11-16").current')-22000000)<1500);
 assert.equal(calc('valuationInfo(sample.manual,"2026-11-16").current'),7200000);
 assert(Math.abs(calc('valuationInfo(sample.car,"2026-11-16").current')-80000000)<15000);
 assert(Math.abs(calc('valuationInfo(sample.house,"2026-11-16").current')-315000000)<15000);
 assert.equal(calc('value({kind:"car",amount:150000000})'),150000000);
});
test('API dapat menyimpan aset baru, membaca kembali serta memulihkan bersama aset lama',async()=>{
 const {req}=setup();const next={...state,assets:[...state.assets,phone,laptop]};
 const login=await req('/api/login','POST',{username:'owner',password});
 const cookie=login.headers.get('set-cookie');
 assert.equal((await req('/api/portfolio','PUT',{state:next,revision:0},cookie)).status,200);
 const read=await (await req('/api/portfolio','GET',undefined,cookie)).json();
 assert.deepEqual(read.state,next);assert.equal(read.revision,1);
 const invalid={...next,assets:[{...phone,annualRate:150}]};
 assert.equal((await req('/api/portfolio','PUT',{state:invalid,revision:1},cookie)).status,400);
 const restored=await (await req('/api/portfolio','GET',undefined,cookie)).json();
 assert.deepEqual(restored.state,next);
});
test('perincian kekayaan bersih termasuk HP/elektronik, tidak menghitung dua kali selisih',()=>{
 const ctx=contextForValuation();
 ctx.sample={...state,assets:[...state.assets,{...phone,acquiredAt:'2026-11-16'},{...laptop,acquiredAt:'2026-11-16'}]};
 const result=vm.runInContext('state=sample; summary()',ctx);
 assert.equal(result.sums.phone,12000000);
 assert.equal(result.sums.electronics,20000000);
 assert.equal(result.total,32000300);
 assert.equal(result.net,32000280);
});
test('teks nama perangkat tidak dijalankan sebagai HTML di rincian dan kartu',()=>{
 const nodes={netDetails:{innerHTML:''}};
 const ctx=vm.createContext({Intl,localStorage:{getItem:()=>null},document:{getElementById:id=>nodes[id]||{}}});
 const portfolio=readFileSync(new URL('../public/portfolio.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const cash=readFileSync(new URL('../public/cashflow.js',import.meta.url),'utf8');
 vm.runInContext(portfolio+'\n'+cash+'\n'+app.slice(0,app.indexOf("$('form').onsubmit")),ctx);
 ctx.sample={version:1,assets:[{...laptop,name:'<svg onload=alert(1)>'}],debt:0,monthly:0,months:6};
 vm.runInContext('state=sample; renderNetBreakdown(summary())',ctx);
 assert.match(nodes.netDetails.innerHTML,/&lt;svg/);
 assert(!nodes.netDetails.innerHTML.includes('<svg onload='));
});

// Buku kas (v6): validasi di backend, dampak langsung ke saldo, filter tanggal dan keamanan.
const bankOne={id:'bank-1',kind:'bank',name:'Rekening utama',bank:'BCA',accountType:'tabungan',last4:'1234',amount:1000000};
const bankTwo={id:'bank-2',kind:'bank',name:'Rekening cadangan',bank:'Mandiri',accountType:'tabungan',last4:'2345',amount:500000};
const testCashState={version:1,assets:[bankOne,bankTwo],debt:0,monthly:0,months:6};
const incomeTx={id:'tx-1',date:'2026-11-15',type:'income',amount:250000,accountId:'bank-1',category:'gaji',note:'Gaji mingguan'};
const expenseTx={id:'tx-2',date:'2026-11-16',type:'expense',amount:70000,accountId:'bank-1',category:'makan',note:'Sarapan'};
const transferTx={id:'tx-3',date:'2026-11-16',type:'transfer',amount:100000,accountId:'bank-1',toAccountId:'bank-2',category:'transfer',note:'Pindah dana'};
function cashContext(){return contextForValuation()}
test('buku kas menerima state lama, mencatat transaksi dan menolak rekening hilang, tanggal/nominal berbahaya',()=>{
 assert(valid(testCashState));
 const full={...testCashState,transactions:[incomeTx,expenseTx,transferTx]};assert(valid(full));
 const wrong=[
  {...incomeTx,amount:-5},{...incomeTx,amount:0},{...incomeTx,amount:0.5},{...incomeTx,amount:'250000'},
  {...incomeTx,date:'2026-02-30'},{...incomeTx,date:'2035-01-01'},
  {...incomeTx,accountId:'nonexisting'},{...incomeTx,type:'random'},
  {...incomeTx,category:''},{...incomeTx,note:'x'.repeat(241)}
 ];
 for(const t of wrong)assert(!valid({...testCashState,transactions:[t]}),JSON.stringify(t));
 assert(!valid({...testCashState,transactions:[incomeTx,incomeTx]}),'ID harus unik');
 assert(!valid({...testCashState,transactions:[{...transferTx,toAccountId:'bank-1'}]}),'tidak boleh transfer ke rekening sendiri');
 assert(!valid({...testCashState,transactions:[{...transferTx,toAccountId:'notfound'}]}));
 assert(!valid({...testCashState,transactions:'not-array'}));
 assert(!valid({...testCashState,assets:[bankTwo],transactions:[incomeTx]}),'bank yang punya riwayat tidak boleh dihapus');
 assert(!valid({...testCashState,transactions:[{...expenseTx,amount:1100000}]}),'tidak boleh minus');
});
test('pemasukan, pengeluaran, transfer dan perbaikan histori otomatis masuk ke saldo tanpa hitung ganda',()=>{
 const ctx=cashContext();ctx.sample={...testCashState,transactions:[incomeTx,expenseTx,transferTx]};
 const results=vm.runInContext('state=sample; ({balance1:bankBalance(state.assets[0]),balance2:bankBalance(state.assets[1]),sum:summary()})',ctx);
 assert.equal(results.balance1,1080000);
 assert.equal(results.balance2,600000);
 assert.equal(results.sum.sums.bank,1680000);
 assert.equal(results.sum.net,1680000);
 const withoutTransfer=vm.runInContext('state={...sample,transactions:[sample.transactions[0],sample.transactions[1]]}; summary()',ctx);
 assert.equal(withoutTransfer.net,1680000,'transfer tidak menaikkan kekayaan bersih');
 const edited=vm.runInContext('state={...sample,transactions:[{...sample.transactions[0],amount:300000},sample.transactions[1],sample.transactions[2]]};summary()',ctx);
 assert.equal(edited.net,1730000,'perubahan histori memperbarui saldo tanpa efek ganda');
 const deleted=vm.runInContext('state={...sample,transactions:[sample.transactions[0],sample.transactions[2]]};summary()',ctx);
 assert.equal(deleted.net,1750000,'hapus pengeluaran memulihkan saldo');
});
test('rekap harian, mingguan Senin–Minggu, bulanan, khusus dan keseluruhan',()=>{
 const ctx=cashContext();const c=x=>vm.runInContext(x,ctx);
 assert.equal(c('cashRange("day","2026-11-16").start'),'2026-11-16');
 assert.equal(c('cashRange("week","2026-11-16").start'),'2026-11-16');
 assert.equal(c('cashRange("week","2026-11-22").end'),'2026-11-22');
 assert.equal(c('cashRange("week","2026-11-01").start'),'2026-10-26');
 assert.equal(c('cashRange("month","2026-02-15").end'),'2026-02-28');
 assert.equal(c('cashRange("month","2028-02-15").end'),'2028-02-29');
 assert.equal(c('cashRange("custom","2026-11-16","2026-01-01","2026-01-31").start'),'2026-01-01');
 assert.equal(c('cashRange("all","2026-11-16").end'),'9999-12-31');
});
test('API D1 menyimpan/membaca buku kas dan memblokir overdraft atau saldo transfer tidak valid',async()=>{
 const {req}=setup();const login=await req('/api/login','POST',{username:'owner',password});
 const cookie=login.headers.get('set-cookie');const full={...testCashState,transactions:[incomeTx,expenseTx,transferTx]};
 assert.equal((await req('/api/portfolio','PUT',{revision:0,state:full},cookie)).status,200);
 const got=await (await req('/api/portfolio','GET',undefined,cookie)).json();assert.deepEqual(got.state,full);assert.equal(got.revision,1);
 for(const s of [
  {...full,transactions:[{...expenseTx,amount:99999999999}]},
  {...full,transactions:[{...transferTx,toAccountId:'wrong'}]},
  {...full,assets:[bankOne]}
 ])assert.equal((await req('/api/portfolio','PUT',{state:s,revision:1},cookie)).status,400);
 const gotAfter=await (await req('/api/portfolio','GET',undefined,cookie)).json();assert.deepEqual(gotAfter.state,full);
});
test('transaksi tidak menampilkan HTML asing dari catatan dan nama rekening',()=>{
 const nodes={cashBalances:{innerHTML:''},cashList:{innerHTML:''},cashBankFilter:{innerHTML:'',value:''},cashPeriod:{value:'all'},cashReference:{value:'2026-11-16'},cashStart:{value:'2026-11-01'},cashEnd:{value:'2026-11-30'},cashTypeFilter:{value:''},cashReferenceWrap:{hidden:false},cashStartWrap:{hidden:false},cashEndWrap:{hidden:false},cashPeriodLabel:{innerHTML:''},cashCount:{textContent:''},cashCsv:{disabled:false},cashIncome:{textContent:''},cashExpense:{textContent:''},cashNet:{textContent:'',className:''},cashTransfer:{textContent:''},cashMore:{hidden:true},cashArchiveMonth:{value:'2026-11',max:''},cashPrevMonth:{disabled:false},cashNextMonth:{disabled:false},cashThisMonth:{disabled:false},cashArchiveCount:{textContent:''},cashArchiveCsv:{disabled:false},cashArchiveStats:{innerHTML:''},cashCalendar:{innerHTML:''},cashDayTitle:{innerHTML:''},cashDaySummary:{innerHTML:''}};
 const ctx=vm.createContext({Intl,localStorage:{getItem:()=>null},document:{getElementById:id=>nodes[id]||{}},Date});
 const portfolio=readFileSync(new URL('../public/portfolio.js',import.meta.url),'utf8');
 const cash=readFileSync(new URL('../public/cashflow.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 vm.runInContext(portfolio+'\n'+cash+'\n'+app.slice(0,app.indexOf("$('form').onsubmit")),ctx);
 ctx.sample={...testCashState,assets:[{...bankOne,name:'<img src=x>'},bankTwo],transactions:[{...incomeTx,note:'<svg onload=alert(1)>'}]};
 vm.runInContext('state=sample;cashArchiveDay="2026-11-15";renderCashflow()',ctx);
 assert.match(nodes.cashBalances.innerHTML,/&lt;img/);
 assert.match(nodes.cashList.innerHTML,/&lt;svg/);
 assert(!nodes.cashList.innerHTML.includes('<svg onload'));
});

// v7: arsip bulanan berkalender, terpisah dari filter periode dan saldo bank.
test('arsip transaksi mengelompokkan per bulan dan hari, tidak menjumlah antarbulan',()=>{
 const ctx=cashContext();
 const tx=[incomeTx,expenseTx,transferTx,
  {id:'oct',type:'expense',accountId:'bank-1',date:'2026-10-31',amount:9000,category:'makan',note:'Makan Oktober'},
  {id:'dec',type:'income',accountId:'bank-2',date:'2026-12-01',amount:1000,category:'gaji',note:'Gaji Desember'}];
 ctx.txs=tx;
 const r=vm.runInContext('cashArchiveForMonth("2026-11",txs,"","")',ctx);
 assert.deepEqual([...r].map(x=>x.id),['tx-3','tx-2','tx-1']);
 assert.equal(vm.runInContext('cashTotals(cashArchiveForMonth("2026-11",txs,"","" )).income',ctx),250000);
 assert.equal(vm.runInContext('cashTotals(cashArchiveForMonth("2026-11",txs,"","" )).expense',ctx),70000);
 assert.equal(vm.runInContext('cashTotals(cashArchiveForMonth("2026-11",txs,"","" )).transfer',ctx),100000);
 assert.equal(vm.runInContext('cashArchiveForMonth("2026-11",txs,"income","").length',ctx),1);
 assert.equal(vm.runInContext('cashArchiveForMonth("2026-11",txs,"","bank-2").length',ctx),1,'Transfer ke rekening ikut filter bank tujuan');
 assert.equal(vm.runInContext('cashArchiveForMonth("2026-10",txs,"","").length',ctx),1);
 assert.equal(vm.runInContext('cashArchiveForMonth("2026-12",txs,"","").length',ctx),1);
});
test('navigasi kalender bulanan menangani pergantian tahun dan bulan Februari',()=>{
 const ctx=cashContext(),evalJs=x=>vm.runInContext(x,ctx);
 assert.equal(evalJs('cashMonthShift("2026-01",-1)'), '2025-12');
 assert.equal(evalJs('cashMonthShift("2026-12",1)'), '2027-01');
 assert.equal(evalJs('cashMonthShift("2028-03",-1)'), '2028-02');
 assert.equal(evalJs('new Date(2028,2,0).getDate()'),29);
 assert.equal(evalJs('cashFullDay("2026-11-16").toLowerCase().includes("november")'),true);
});
test('arsip kalender menampilkan satu tanggal, batasi 15 baris dan saldo utuh',()=>{
 const nodes={cashArchiveMonth:{value:'2026-11'},cashTypeFilter:{value:''},cashBankFilter:{value:''},cashPrevMonth:{disabled:false},cashNextMonth:{disabled:false},cashThisMonth:{disabled:false},cashArchiveCount:{textContent:''},cashArchiveCsv:{disabled:false},cashArchiveStats:{innerHTML:''},cashCalendar:{innerHTML:''},cashDayTitle:{innerHTML:''},cashDaySummary:{innerHTML:''},cashList:{innerHTML:''},cashMore:{hidden:true}};
 const ctx=vm.createContext({Intl,Date,localStorage:{getItem:()=>null},document:{getElementById:id=>nodes[id]||{}},setTimeout});
 const portfolio=readFileSync(new URL('../public/portfolio.js',import.meta.url),'utf8');
 const cash=readFileSync(new URL('../public/cashflow.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 vm.runInContext(portfolio+'\n'+cash+'\n'+app.slice(0,app.indexOf("$('form').onsubmit")),ctx);
 const entries=Array.from({length:35},(_,i)=>({...incomeTx,id:'series-'+i,date:'2026-11-08',amount:1000,note:'Hari sibuk '+i}));
 ctx.sample={...testCashState,transactions:[...entries,expenseTx,{...incomeTx,id:'other-day',date:'2026-11-04'}]};
 vm.runInContext('state=sample;cashArchiveDay="2026-11-08";renderCashArchive()',ctx);
 assert.equal(nodes.cashList.innerHTML.match(/class="cashRow"/g)?.length,15);
 assert.equal(nodes.cashMore.hidden,false);
 assert.match(nodes.cashCalendar.innerHTML,/8 catatan|35 catatan/);
 assert.match(nodes.cashArchiveCount.textContent,/37 transaksi/);
 assert(nodes.cashCalendar.innerHTML.includes('aria-pressed="true"'));
 assert.equal(vm.runInContext('cashTotals(cashArchiveForMonth("2026-11")).count',ctx),37);
 vm.runInContext('cashDayVisible=45;renderCashArchive()',ctx);
 assert.equal(nodes.cashList.innerHTML.match(/class="cashRow"/g)?.length,35);
 assert.equal(nodes.cashMore.hidden,true);
 vm.runInContext('cashArchiveDay="2026-11-16";renderCashArchive()',ctx);
 assert.equal(nodes.cashList.innerHTML.match(/class="cashRow"/g)?.length,1,'hari lain punya transaksi yang berbeda');
 assert.match(nodes.cashList.innerHTML,/Sarapan/);
 assert.equal(vm.runInContext('bankBalance(state.assets[0])',ctx),1035000-70000+250000,'saldo dihitung atas keseluruhan histori, bukan hari terbuka');
});
test('pembaruan arsip tidak memerlukan migrasi D1, pemulihan backup membawa kembali transaksi',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(html,/id="cashCalendar"/);assert.match(html,/id="cashArchiveMonth"/);
 assert.match(js,/transactions:transactionsOf\(d\)/);
 assert.doesNotMatch(js,/commit\(\{version,assets,debt,monthly,months\}\)/);
});
