import {holidays,sources} from './libur.js';
const $=id=>document.getElementById(id);
const form=$('entry'),fields=form.elements,dialog=$('editor');
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Makassar'}).format(new Date());
const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
const stamp=day=>new Date(day+'T00:00:00Z'),iso=date=>date.toISOString().slice(0,10),dayMs=86400000;
const localDate=day=>stamp(day).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const statusClass={'Tanpa klaim':'unclaimed',Draf:'draft',Diajukan:'submitted',Dibayar:'paid'};
let month=today.slice(0,7),rows=[],costs=new Map(),assignmentDays=new Map(),ready=false,serial=0,current=null,busy=false;
let requestKey='',lastPayload='';
function node(tag,text='',cls=''){const el=document.createElement(tag);el.textContent=text;el.className=cls;return el;}
async function api(method,payload){
  const response=await fetch('/api/duties?month='+month,{method,headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});
  if(response.status===401){location.assign('/login');throw Error('Sesi berakhir.');}
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Gagal memproses data.'),{status:response.status});return data;
}
async function load(){
  const ticket=++serial;ready=false;rows=[];costs.clear();assignmentDays.clear();render();$('notice').textContent='Memuat penugasan…';$('reload').hidden=true;
  try{
    const data=await api('GET');if(ticket!==serial)return;
    rows=data.days;costs=new Map(data.costs.map(c=>[c.assignment_id,c]));
    for(const r of data.assignmentDays){const arr=assignmentDays.get(r.assignment_id)||[];arr.push(r.day);assignmentDays.set(r.assignment_id,arr);}
    ready=true;render();$('notice').textContent='';
  }catch(e){if(ticket===serial){$('notice').textContent=e.message;$('reload').hidden=false;}}
}
function hueFor(key){let hash=2166136261;for(const ch of key)hash=Math.imul(hash^ch.codePointAt(0),16777619);return (hash>>>0)%3600/10;}
function markAssignment(element,group){element.style.setProperty('--duty-edge',`hsl(${group.hue}, 68%, 30%)`);element.style.setProperty('--duty-bg',`hsl(${group.hue}, 73%, 84%)`);element.classList.add('assignmentColor');}
function groupAssignments(days){const groups=new Map();for(const r of days){const key=r.assignment_id;if(!groups.has(key))groups.set(key,{id:key,days:[],hue:hueFor(key)});groups.get(key).days.push(r);}return groups;}
function groupBreakdown(group){
  const claim=costs.get(group.id);const items=[];
  if(claim){
    if(claim.transport>0&&claim.charge_day.startsWith(month))items.push({date:claim.charge_day,label:'Transport (sekali)',amount:claim.transport,category:'transport'});
    if(claim.charge_day.startsWith(month))for(const e of claim.expenses)items.push({date:claim.charge_day,label:e.label,amount:e.amount,category:'other'});
    for(const h of claim.lodging)if(h.date.startsWith(month))items.push({date:h.date,label:'Penginapan · 1 malam',amount:h.amount,category:'lodging'});
  }
  return items;
}
function totalGroup(group){return group.days.reduce((s,r)=>s+r.amount,0)+groupBreakdown(group).reduce((s,x)=>s+x.amount,0);}
function historyGroup(group){
  const first=group.days[0],details=node('details','','claimGroup'),summary=node('summary');markAssignment(summary,group);
  const title=node('span','','claimTitle');title.append(node('strong',first.activity),node('small',first.reference));
  summary.append(title,node('span',group.days.length+' hari · '+money(totalGroup(group)),'groupTotal'));details.append(summary);
  const scroll=node('div','','scroll'),table=node('table'),header=table.createTHead().insertRow();
  for(const label of ['Tanggal','Tujuan','Jenis dinas','Status','Uang harian']){const th=node('th',label);th.scope='col';header.append(th);}
  const body=table.createTBody();for(const r of group.days){const tr=body.insertRow(),button=node('button',localDate(r.day));button.onclick=()=>openDay(r.day,r);tr.insertCell().append(button);for(const v of [r.destination,r.kind,r.status,money(r.amount)])tr.insertCell().textContent=v;}
  scroll.append(table);details.append(scroll);
  const breakdown=groupBreakdown(group);
  if(breakdown.length){const sub=node('div','','extraBlock');sub.append(node('strong','Biaya satu kali dan per malam (bulan ini)'));const breakdownTable=node('table');const h=breakdownTable.createTHead().insertRow();for(const label of ['Tanggal alokasi','Rincian','Nominal'])h.append(node('th',label));const b=breakdownTable.createTBody();for(const item of breakdown){const tr=b.insertRow();for(const v of [localDate(item.date),item.label,money(item.amount)])tr.insertCell().textContent=v;}sub.append(breakdownTable);details.append(sub);}
  else details.append(node('p','Tidak ada biaya transport/penginapan/tambahan yang dibukukan dalam bulan ini.','subtle groupNote'));
  return details;
}
function render(){
  $('month').value=month;const first=stamp(month+'-01');$('heading').textContent=first.toLocaleDateString('id-ID',{month:'long',year:'numeric',timeZone:'UTC'});
  const source=sources[month.slice(0,4)];$('source').replaceChildren();if(source){const a=node('a','Sumber kalender nasional '+month.slice(0,4));a.href=source;a.target='_blank';a.rel='noopener';$('source').append(a);}else $('source').textContent='Data libur nasional dan cuti bersama tahun ini belum tersedia.';
  const groups=groupAssignments(rows),legend=$('assignments');legend.replaceChildren();legend.hidden=!rows.length;
  for(const g of groups.values()){const r=g.days[0],item=node('li');markAssignment(item,g);item.append(node('strong',r.activity),node('span',r.reference));legend.append(item);}
  const grid=$('grid');grid.replaceChildren();for(let i=0;i<(first.getUTCDay()+6)%7;i++)grid.append(node('span'));
  const dates=new Map(rows.map(r=>[r.day,r]));
  for(let d=new Date(first);iso(d).startsWith(month);d.setUTCDate(d.getUTCDate()+1)){
    const day=iso(d),holiday=holidays.get(day),row=dates.get(day);
    const appearance=holiday?(holiday.category==='Cuti bersama'?'leave':'national'):[0,6].includes(d.getUTCDay())?'weekend':'';
    const b=node('button',String(d.getUTCDate()),'cell '+appearance);if(day===today)b.setAttribute('aria-current','date');if(holiday)b.append(node('small',holiday.name));
    if(row){markAssignment(b,groups.get(row.assignment_id));b.title=row.reference+' · '+row.activity;b.append(node('small',row.activity,'taskName'),node('small',row.kind),node('small',row.status,'statusLabel '+statusClass[row.status]));if(holiday)b.querySelector('small').classList.add(appearance);}
    b.setAttribute('aria-label',[day,holiday?.category,holiday?.name,row?.reference,row?.activity,row?.status].filter(Boolean).join(', '));b.disabled=!ready;b.onclick=()=>openDay(day,row);grid.append(b);
  }
  $('totals').replaceChildren();$('list').replaceChildren();if(!ready)return;
  const breakdown=new Map();for(const row of rows){const x=breakdown.get(row.status)||{days:0,amount:0};x.days++;x.amount+=row.amount;breakdown.set(row.status,x);}
  for(const g of groups.values())for(const item of groupBreakdown(g)){
    const row=dates.get(item.date)||g.days[0];const x=breakdown.get(row.status)||{days:0,amount:0};x.amount+=item.amount;breakdown.set(row.status,x);
  }
  for(const status of ['Tanpa klaim','Draf','Diajukan','Dibayar']){const total=breakdown.get(status)||{days:0,amount:0},card=node('div',status+' · '+total.days+' hari');card.append(node('strong',money(total.amount)));$('totals').append(card);}
  for(const g of groups.values())$('list').append(historyGroup(g));if(!groups.size)$('list').append(node('p','Belum ada penugasan bulan ini. Pilih tanggal untuk mencatat.'));
}
function expenseLine(item={label:'',amount:0}){
  const line=node('div','','expenseLine'),label=node('label','Jenis biaya'),name=document.createElement('input');name.className='expenseName';name.placeholder='Mis. taksi / parkir';name.maxLength=100;name.value=item.label;
  const amountLabel=node('label','Nominal (Rp)'),amount=document.createElement('input');amount.type='number';amount.className='expenseAmount';amount.min='0';amount.max='999999999';amount.step='1';amount.value=String(item.amount);label.append(name);amountLabel.append(amount);
  const remove=node('button','Hapus','removeExpense');remove.type='button';remove.setAttribute('aria-label','Hapus jenis biaya');remove.onclick=()=>{line.remove();summary();};line.append(label,amountLabel,remove);$('expenses').append(line);
}
function readExpenses(){return [...$('expenses').querySelectorAll('.expenseLine')].map(el=>({label:el.querySelector('.expenseName').value.trim(),amount:Number(el.querySelector('.expenseAmount').value||0)})).filter(x=>x.label||x.amount>0);}
function readLodging(){return [...$('nights').querySelectorAll('.nightLine')].filter(el=>el.querySelector('.nightCheck').checked).map(el=>({date:el.dataset.day,amount:Number(el.querySelector('.nightAmount').value||0)})).filter(x=>x.amount>0);}
function chosenDays(){
  if(current)return assignmentDays.get(current.assignment_id)||[current.day];
  if(!fields.day.value||!fields.end.value)return [];
  const start=stamp(fields.day.value).getTime(),end=stamp(fields.end.value).getTime(),count=(end-start)/dayMs+1;
  if(!(count>=1&&count<=31))return [];
  return Array.from({length:count},(_,i)=>iso(new Date(start+i*dayMs)));
}
function renderNights(initial=[]){
  const previous=initial.length?initial:readLodging();const selections=new Map(previous.map(x=>[x.date,x.amount]));
  const root=$('nights');root.replaceChildren();const days=chosenDays();
  if(!days.length){root.append(node('p','Pilih rentang penugasan agar malam penginapan muncul.','subtle'));return;}
  for(const day of days){
    const line=node('div','','nightLine');line.dataset.day=day;
    const label=node('label','','nightToggle'),cb=document.createElement('input');cb.type='checkbox';cb.className='nightCheck';cb.checked=selections.has(day);
    const date=node('span',localDate(day)),pill=node('span',cb.checked?'Diklaim':'Tidak diklaim','nightPill');label.append(cb,date,pill);
    const amount=document.createElement('input');amount.type='number';amount.className='nightAmount';amount.min='0';amount.max='999999999';amount.step='1';amount.value=String(selections.get(day)||Number($('nightRate').value||0));amount.disabled=!cb.checked;amount.setAttribute('aria-label','Tarif penginapan untuk '+localDate(day));
    cb.onchange=()=>{amount.disabled=!cb.checked;pill.textContent=cb.checked?'Diklaim':'Tidak diklaim';if(cb.checked&&!Number(amount.value))amount.value=$('nightRate').value||'0';summary();};line.append(label,amount);root.append(line);
  }
}
function openDay(day,row){
  current=row||null;lastPayload='';requestKey='';form.reset();$('expenses').replaceChildren();$('nights').replaceChildren();
  fields.day.value=day;fields.day.readOnly=true;fields.end.value=day;fields.end.min=day;fields.end.max=iso(new Date(Math.min(stamp(day).getTime()+30*dayMs,stamp('2099-12-31').getTime())));
  const claim=row?costs.get(row.assignment_id):null;
  if(row){for(const name of ['reference','activity','destination','kind','status','amount'])fields[name].value=row[name];fields.transport.value=String(claim?.transport||0);for(const item of claim?.expenses||[])expenseLine(item);$('nightRate').value=String(claim?.lodging?.[0]?.amount||0);}
  $('title').textContent=row?'Ubah penugasan':'Catat penugasan';$('endLabel').hidden=!!row;$('remove').hidden=!row;$('another').hidden=!row;$('placement').hidden=!!row;$('error').textContent='';
  renderNights(claim?.lodging||[]);summary();if(!dialog.open)dialog.showModal();
}
function summary(){
  const claimed=fields.status.value!=='Tanpa klaim';
  fields.amount.disabled=!claimed;fields.transport.disabled=!claimed;$('nightRate').disabled=!claimed;$('addExpense').disabled=!claimed;
  for(const input of $('expenses').querySelectorAll('input,button'))input.disabled=!claimed;
  for(const line of $('nights').querySelectorAll('.nightLine')){
    const cb=line.querySelector('.nightCheck'),amount=line.querySelector('.nightAmount');cb.disabled=!claimed;amount.disabled=!claimed||!cb.checked;
  }
  const count=chosenDays().length,daily=Number(fields.amount.value||0),transport=Number(fields.transport.value||0),other=readExpenses().reduce((s,x)=>s+x.amount,0),lodging=readLodging().reduce((s,x)=>s+x.amount,0),nightCount=readLodging().length;
  // Untuk edit satu tanggal, uang harian tanggal lain tidak dihitung ulang di formulir.
  const payableDays=current?1:count,total=daily*payableDays+transport+other+lodging;
  const invalidNights=[...$('nights').querySelectorAll('.nightLine')].some(line=>line.querySelector('.nightCheck').checked&&Number(line.querySelector('.nightAmount').value||0)<=0);
  const valid=(current ? (claimed?total>0:daily===0) : (claimed?total>0:total===0))&&!invalidNights;
  fields.amount.setCustomValidity(!valid?'Periksa status klaim dan rincian biaya; setiap malam terpilih harus memiliki tarif.':'');
  const start=stamp(fields.day.value).getTime(),end=stamp(fields.end.value).getTime(),special=[];
  if(!current&&count)for(let t=start;t<=end;t+=dayMs){const d=new Date(t),h=holidays.get(iso(d));if(h||[0,6].includes(d.getUTCDay()))special.push(iso(d).slice(5).split('-').reverse().join('/')+' '+(h?h.category+' '+h.name:'akhir pekan'));}
  $('special').textContent=special.length?'Periksa tanggal dalam surat tugas: '+special.join(', '):'';
  const lines=[['Uang harian',payableDays+' × '+money(daily),money(payableDays*daily)],['Transport','Sekali',money(transport)],['Biaya lainnya',readExpenses().length+' jenis',money(other)],['Penginapan',nightCount+' malam',money(lodging)]];
  const target=$('estimate');target.replaceChildren();for(const [label,quantity,sum] of lines){const line=node('div','','estimateLine');line.append(node('span',label),node('small',quantity),node('strong',sum));target.append(line);}
  const grand=node('div','','estimateGrand');grand.append(node('strong',current?'Jumlah yang diubah pada tanggal ini + biaya penugasan':'Estimasi total klaim'),node('strong',money(total)));target.append(grand);
  if(current)target.append(node('p','Transport, biaya lainnya, dan penginapan berlaku untuk seluruh penugasan. Uang harian tanggal lain tetap tersimpan.','tip'));
}
async function save(method){
  if(busy)return;busy=true;const controls=[...form.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);
  const data=Object.fromEntries(new FormData(form));data.amount=Number(fields.amount.value||0);data.transport=Number(fields.transport.value||0);
  data.expenses=readExpenses();data.lodging=readLodging();
  if(fields.status.value==='Tanpa klaim'){data.amount=0;if(!current){data.transport=0;data.expenses=[];data.lodging=[];}}
  if(current){data.version=current.version;data.costVersion=costs.get(current.assignment_id)?.version;}
  if(method==='POST'){const fingerprint=JSON.stringify(data);if(fingerprint!==lastPayload){requestKey=crypto.randomUUID();lastPayload=fingerprint;}data.requestId=requestKey;}
  try{
    const result=await api(method,data);dialog.close();if(result.days){month=result.days[0].slice(0,7);$('receipt').textContent='Tersimpan untuk '+result.days.length+' hari: '+result.days.map(localDate).join(', ')+'.'+(result.warning?' '+result.warning:'');}
    else $('receipt').textContent=method==='DELETE'?'Catatan tanggal ini dihapus.':'Perubahan rincian klaim penugasan tersimpan.';
    await load();
  }catch(e){$('error').textContent=e.message;if(e.status===409)await load();}
  finally{busy=false;controls.forEach(b=>b.disabled=false);summary();}
}
function navigate(value){if(/^20\d\d-(0[1-9]|1[012])$/.test(value)){month=value;$('receipt').textContent='';load();}else $('month').value=month;}
function shift(delta){const d=stamp(month+'-01');d.setUTCMonth(d.getUTCMonth()+delta);navigate(iso(d).slice(0,7));}
$('prev').onclick=()=>shift(-1);$('next').onclick=()=>shift(1);$('today').onclick=()=>navigate(today.slice(0,7));$('month').onchange=e=>navigate(e.target.value);$('reload').onclick=load;
$('addExpense').onclick=()=>{if($('expenses').children.length>=30){$('error').textContent='Maksimal 30 jenis biaya lainnya.';return;}expenseLine();summary();};
$('nightRate').onchange=()=>{for(const line of $('nights').querySelectorAll('.nightLine')){const value=line.querySelector('.nightAmount');if(!line.querySelector('.nightCheck').checked)value.value=$('nightRate').value||'0';}summary();};
fields.end.onchange=()=>{renderNights();summary();};
fields.status.onchange=()=>{if(fields.status.value==='Tanpa klaim'){fields.amount.value='0';if(!current){fields.transport.value='0';$('expenses').replaceChildren();for(const line of $('nights').querySelectorAll('.nightLine'))line.querySelector('.nightCheck').checked=false;}}summary();};
form.oninput=summary;form.onsubmit=e=>{e.preventDefault();save(current?'PUT':'POST');};
$('another').onclick=()=>openDay(fields.day.value,null);$('close').onclick=()=>dialog.close();dialog.oncancel=e=>{if(busy)e.preventDefault();};
$('remove').onclick=()=>{if(current&&confirm('Hapus catatan tanggal '+current.day+'? Biaya penugasan tetap ada jika masih ada tanggal lain.'))save('DELETE');};
load();
