import {holidays,sources} from './libur.js';
const $=id=>document.getElementById(id);
const form=$('entry'), fields=form.elements, dialog=$('editor');
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Makassar'}).format(new Date());
const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
const stamp=day=>new Date(day+'T00:00:00Z');
const iso=date=>date.toISOString().slice(0,10);
const dayMs=86400000;
let month=today.slice(0,7), rows=[], ready=false, serial=0, current=null, busy=false;
function node(tag,text,cls=''){
  const el=document.createElement(tag); el.textContent=text; el.className=cls; return el;
}
async function api(method,payload){
  const response=await fetch('/api/duties?month='+month,{
    method,headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined
  });
  if(response.status===401){ location.assign('/login'); throw Error('Sesi berakhir.'); }
  const data=await response.json();
  if(!response.ok) throw Object.assign(Error(data.error||'Gagal memproses data.'),{status:response.status});
  return data;
}
async function load(){
  const ticket=++serial;
  ready=false; rows=[]; render(); $('notice').textContent='Memuat penugasan…'; $('reload').hidden=true;
  try{
    const data=await api('GET');
    if(ticket!==serial)return;
    rows=data.days; ready=true; render(); $('notice').textContent='';
  }catch(e){if(ticket===serial){$('notice').textContent=e.message; $('reload').hidden=false;}}
}
function render(){
  $('month').value=month;
  const first=stamp(month+'-01');
  $('heading').textContent=first.toLocaleDateString('id-ID',{month:'long',year:'numeric',timeZone:'UTC'});
  const source=sources[month.slice(0,4)];
  $('source').replaceChildren();
  if(source){const a=node('a','Sumber kalender nasional '+month.slice(0,4));a.href=source;a.target='_blank';a.rel='noopener';$('source').append(a);}
  else $('source').textContent='Data libur nasional dan cuti bersama tahun ini belum tersedia.';
  const grid=$('grid'); grid.replaceChildren();
  for(let i=0;i<(first.getUTCDay()+6)%7;i++)grid.append(node('span',''));
  for(let d=new Date(first);iso(d).startsWith(month);d.setUTCDate(d.getUTCDate()+1)){
    const day=iso(d), holiday=holidays.get(day), row=rows.find(r=>r.day===day);
    const appearance=holiday?(holiday.category==='Cuti bersama'?'leave':'national'):[0,6].includes(d.getUTCDay())?'weekend':'';
    const b=node('button',String(d.getUTCDate()),'cell '+appearance);
    if(day===today)b.setAttribute('aria-current','date');
    if(holiday)b.append(node('small',holiday.name));
    if(row)b.append(node('small',row.kind+' · '+row.status,'duty'));
    b.setAttribute('aria-label',[day,holiday?.category,holiday?.name,row?.activity,row?.status].filter(Boolean).join(', '));
    b.disabled=!ready;b.onclick=()=>openDay(day,row);grid.append(b);
  }
  $('totals').replaceChildren();$('list').replaceChildren();
  if(!ready)return;
  for(const status of ['Draf','Diajukan','Dibayar']){
    const items=rows.filter(r=>r.status===status);
    const card=node('div',status+' · '+items.length+' hari');
    card.append(node('strong',money(items.reduce((sum,r)=>sum+r.amount,0))));$('totals').append(card);
  }
  for(const r of rows){
    const tr=node('tr',''),td=node('td',''),b=node('button',r.day);
    b.onclick=()=>openDay(r.day,r);td.append(b);tr.append(td);
    for(const value of [r.reference+' · '+r.activity,r.destination,r.kind,r.status,money(r.amount)])tr.append(node('td',value));
    $('list').append(tr);
  }
  if(!rows.length){const tr=node('tr',''),td=node('td','Belum ada penugasan bulan ini. Pilih tanggal untuk mencatat.');td.colSpan=6;tr.append(td);$('list').append(tr);}
}
function openDay(day,row){
  current=row||null;form.reset();
  Object.assign(fields.day,{value:day,readOnly:true});fields.end.value=day;fields.end.min=day;
  fields.end.max=iso(new Date(Math.min(stamp(day).getTime()+30*dayMs,stamp('2099-12-31').getTime())));
  for(const name of ['reference','activity','destination','kind','status','amount'])if(row)fields[name].value=row[name];
  $('title').textContent=row?'Ubah penugasan':'Catat penugasan';$('endLabel').hidden=!!row;$('remove').hidden=!row;
  $('error').textContent='';summary();dialog.showModal();
}
function summary(){
  const claimed=fields.status.value!=='Tanpa klaim';
  fields.amount.disabled=!claimed;fields.amount.min=claimed?'1':'0';
  if(!claimed)fields.amount.value='0';
  const start=stamp(fields.day.value).getTime(), end=stamp(fields.end.value).getTime();
  const count=(end-start)/dayMs+1;
  if(!(count>=1 && count<=31)){$('special').textContent='';$('estimate').textContent='Pilih rentang 1–31 hari.';return;}
  const special=[];
  for(let t=start;t<=end;t+=dayMs){
    const d=new Date(t), h=holidays.get(iso(d));
    if(h||[0,6].includes(d.getUTCDay()))special.push(iso(d).slice(5).split('-').reverse().join('/')+' '+(h?h.category+' '+h.name:'akhir pekan'));
  }
  $('special').textContent=special.length?'Periksa tanggal dalam surat tugas: '+special.join(', '):'';
  $('estimate').textContent=count+' hari × '+money(Number(fields.amount.value)||0)+' = '+money(count*(Number(fields.amount.value)||0))+'. Status berlaku untuk setiap tanggal yang disimpan.';
}
async function save(method){
  if(busy)return;
  busy=true;const controls=[...form.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);
  const data=Object.fromEntries(new FormData(form));data.amount=Number(fields.amount.value);if(current)data.version=current.version;
  try{await api(method,data);dialog.close();await load();}
  catch(e){$('error').textContent=e.message;if(e.status===409)await load();}
  finally{busy=false;controls.forEach(b=>b.disabled=false);}
}
function navigate(value){if(/^20\d\d-(0[1-9]|1[012])$/.test(value)){month=value;load();}else $('month').value=month;}
function shift(delta){const d=stamp(month+'-01');d.setUTCMonth(d.getUTCMonth()+delta);navigate(iso(d).slice(0,7));}
$('prev').onclick=()=>shift(-1);$('next').onclick=()=>shift(1);$('today').onclick=()=>navigate(today.slice(0,7));
$('month').onchange=e=>navigate(e.target.value);$('reload').onclick=load;
form.oninput=summary;form.onsubmit=e=>{e.preventDefault();save(current?'PUT':'POST');};
$('close').onclick=()=>dialog.close();dialog.oncancel=e=>{if(busy)e.preventDefault();};
$('remove').onclick=()=>{if(current&&confirm('Hapus penugasan dan catatan klaim tanggal '+current.day+'?'))save('DELETE');};
load();
