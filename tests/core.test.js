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
 const {req}=setup();assert.equal((await req('/api/portfolio')).status,401);assert.equal((await req('/')).status,200);
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
 vm.runInContext(portfolio+'\n'+app.slice(0,app.indexOf("$('form').onsubmit")),ctx);
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
