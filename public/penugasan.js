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
    for(const r of data.assignmentDays){const arr=assignmentDays.get(r.assignment_id)||[];arr.push(r);assignmentDays.set(r.assignment_id,arr);}
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
  summary.append(title,node('span',group.days.filter(d=>d.amount>0).length+'/'+group.days.length+' hari uang harian (bulan ini) · '+money(totalGroup(group)),'groupTotal'));details.append(summary);
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
function readDaily(){
  return [...$('dailyDates').querySelectorAll('.dayRateLine')].map(el=>({
    date:el.dataset.day,checked:el.querySelector('.dayRateCheck').checked,
    amount:Number(el.querySelector('.dayRateAmount').value||0)
  }));
}
function selectedDaily(){return readDaily().filter(x=>x.checked).map(({date,amount})=>({date,amount}));}
function validDaily(){return readDaily().every(x=>!x.checked||(Number.isSafeInteger(x.amount)&&x.amount>0&&x.amount<=999999999));}
function dailyTotal(){return selectedDaily().reduce((s,x)=>s+x.amount,0);}
function syncDailyLine(line){
  const cb=line.querySelector('.dayRateCheck'),amount=line.querySelector('.dayRateAmount'),pill=line.querySelector('.dayRatePill');
  amount.disabled=!cb.checked;line.classList.toggle('isSelected',cb.checked);
  pill.textContent=cb.checked?'Diklaim':'Tidak diklaim';
}
function renderDaily(initial=null){
  const root=$('dailyDates');
  const prior=initial||readDaily();const selections=new Map(prior.map(x=>[x.date,x]));
  root.replaceChildren();const days=chosenDays();
  if(!days.length){root.append(node('p','Pilih tanggal mulai dan selesai agar rincian uang harian tampil.','subtle'));return;}
  const isEdit=!!current;
  for(const day of days){
    const saved=selections.get(day),checked=saved?('checked' in saved? saved.checked : Number(saved.amount)>0):!isEdit;
    const line=node('div','','dayRateLine');line.dataset.day=day;
    const label=node('label','','dayRateToggle'),cb=document.createElement('input');cb.type='checkbox';cb.className='dayRateCheck';cb.checked=checked;
    const title=node('span',localDate(day)),pill=node('span','','dayRatePill');label.append(cb,title,pill);
    const amount=document.createElement('input');amount.type='number';amount.className='dayRateAmount';amount.min='0';amount.max='999999999';amount.step='1';
    amount.value=String(saved?.amount??Number(fields.amount.value||0));
    amount.setAttribute('aria-label','Uang harian untuk '+localDate(day));
    cb.onchange=()=>{if(cb.checked&&!(Number(amount.value)>0))amount.value=fields.amount.value||'0';syncDailyLine(line);summary();};
    line.append(label,amount);root.append(line);syncDailyLine(line);
  }
}
function setDailySelection(enabled){
  for(const line of $('dailyDates').querySelectorAll('.dayRateLine')){
    const cb=line.querySelector('.dayRateCheck');cb.checked=enabled;
    if(enabled&&!Number(line.querySelector('.dayRateAmount').value))line.querySelector('.dayRateAmount').value=fields.amount.value||'0';
    syncDailyLine(line);
  }
  summary();
}
function chosenDays(){
  if(current)return (assignmentDays.get(current.assignment_id)||[{day:current.day}]).map(x=>x.day);
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
  current=row||null;lastPayload='';requestKey='';form.reset();$('expenses').replaceChildren();$('nights').replaceChildren();$('dailyDates').replaceChildren();
  fields.day.value=day;fields.day.readOnly=true;fields.end.value=day;fields.end.min=day;fields.end.max=iso(new Date(Math.min(stamp(day).getTime()+30*dayMs,stamp('2099-12-31').getTime())));
  const claim=row?costs.get(row.assignment_id):null;
  if(row){
    for(const name of ['reference','activity','destination','kind','status','amount'])fields[name].value=row[name];
    fields.transport.value=String(claim?.transport||0);
    for(const item of claim?.expenses||[])expenseLine(item);
    $('nightRate').value=String(claim?.lodging?.[0]?.amount||0);
  }
  $('title').textContent=row?'Ubah penugasan':'Catat penugasan';$('endLabel').hidden=!!row;$('remove').hidden=!row;$('another').hidden=!row;$('placement').hidden=!!row;$('error').textContent='';
  renderDaily(row?(assignmentDays.get(row.assignment_id)||[row]).map(x=>({date:x.day,amount:x.amount,checked:x.amount>0})):null);
  renderNights(claim?.lodging||[]);summary();if(!dialog.open)dialog.showModal();
}

function summary(){
  const claimed=fields.status.value!=='Tanpa klaim';
  // Untuk edit, tanggal lain dalam penugasan dapat mempunyai status berbeda.
  // Jangan sembunyikan tarif lama saat status tanggal yang dibuka Tanpa klaim.
  fields.amount.disabled=!claimed&&!current;
  fields.transport.disabled=!claimed;$('nightRate').disabled=!claimed;$('addExpense').disabled=!claimed;
  for(const input of $('expenses').querySelectorAll('input,button'))input.disabled=!claimed;
  for(const line of $('nights').querySelectorAll('.nightLine')){
    const cb=line.querySelector('.nightCheck'),amount=line.querySelector('.nightAmount');cb.disabled=!claimed;amount.disabled=!claimed||!cb.checked;
  }
  const all=readDaily(),dailyEntries=selectedDaily(),count=dailyEntries.length,daily=dailyEntries.reduce((s,x)=>s+x.amount,0);
  const transport=Number(fields.transport.value||0),other=readExpenses().reduce((s,x)=>s+x.amount,0),lodging=readLodging().reduce((s,x)=>s+x.amount,0),nightCount=readLodging().length;
  const total=daily+transport+other+lodging;
  const clickedAmount=dailyEntries.find(x=>x.date===fields.day.value)?.amount||0;
  const invalidNights=[...$('nights').querySelectorAll('.nightLine')].some(line=>line.querySelector('.nightCheck').checked&&Number(line.querySelector('.nightAmount').value||0)<=0);
  const valid=validDaily()&&!invalidNights&&(current?(claimed?total>0:clickedAmount===0):(claimed?total>0:total===0));
  fields.amount.setCustomValidity(!valid?'Periksa tanggal dan nominal uang harian (tanggal terpilih harus lebih dari Rp0), status klaim, serta penginapan.':'');
  const start=stamp(fields.day.value).getTime(),end=stamp(fields.end.value).getTime(),special=[],days=chosenDays();
  if(!current&&days.length)for(let t=start;t<=end;t+=dayMs){const d=new Date(t),h=holidays.get(iso(d));if(h||[0,6].includes(d.getUTCDay()))special.push(iso(d).slice(5).split('-').reverse().join('/')+' '+(h?h.category+' '+h.name:'akhir pekan'));}
  $('special').textContent=special.length?'Periksa tanggal dalam surat tugas: '+special.join(', '):'';
  $('dailyCount').textContent=count+' dari '+days.length+' tanggal dipilih untuk uang harian';
  $('dailyTotal').textContent=money(daily);
  const lines=[['Uang harian',count+' dari '+days.length+' hari',money(daily)],['Transport','Sekali',money(transport)],['Biaya lainnya',readExpenses().length+' jenis',money(other)],['Penginapan',nightCount+' malam',money(lodging)]];
  const target=$('estimate');target.replaceChildren();for(const [label,quantity,sum] of lines){const line=node('div','','estimateLine');line.append(node('span',label),node('small',quantity),node('strong',sum));target.append(line);}
  const grand=node('div','','estimateGrand');grand.append(node('strong','Estimasi biaya seluruh penugasan'),node('strong',money(total)));target.append(grand);
  if(current)target.append(node('p','Pilihan uang harian berlaku untuk tanggal yang dicentang dalam penugasan ini, termasuk lintas bulan. Transport, biaya tambahan, dan penginapan tetap dihitung sesuai rincian masing-masing.','tip'));
  return valid;
}

async function save(method){
  if(busy)return;
  if(method!=='DELETE'&&!summary()){$('error').textContent='Periksa tanggal dan nominal uang harian. Setiap tanggal yang dicentang harus memiliki nominal di atas Rp0.';return;}
  busy=true;const controls=[...form.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);
  const data=Object.fromEntries(new FormData(form));data.dailyRates=selectedDaily();
  data.amount=current?(data.dailyRates.find(x=>x.date===current.day)?.amount||0):Number(fields.amount.value||0);
  data.transport=Number(fields.transport.value||0);
  data.expenses=readExpenses();data.lodging=readLodging();
  if(fields.status.value==='Tanpa klaim'){
    if(!current){data.dailyRates=[];data.amount=0;data.transport=0;data.expenses=[];data.lodging=[];}
    else data.amount=0;
  }
  if(current){
    data.version=current.version;data.costVersion=costs.get(current.assignment_id)?.version;
    data.dailyVersions=(assignmentDays.get(current.assignment_id)||[{day:current.day,version:current.version}]).map(x=>({date:x.day,version:x.version}));
  }
  if(method==='POST'){const fingerprint=JSON.stringify(data);if(fingerprint!==lastPayload){requestKey=crypto.randomUUID();lastPayload=fingerprint;}data.requestId=requestKey;}
  try{
    const result=await api(method,data);dialog.close();if(result.days){month=result.days[0].slice(0,7);$('receipt').textContent='Tersimpan untuk '+result.days.length+' hari penugasan: '+result.days.map(localDate).join(', ')+'. Uang harian hanya dihitung pada tanggal yang dicentang.'+(result.warning?' '+result.warning:'');}
    else $('receipt').textContent=method==='DELETE'?'Catatan tanggal ini dihapus.':'Perubahan rincian klaim penugasan tersimpan.';
    await load();
  }catch(e){$('error').textContent=e.message;if(e.status===409)await load();}
  finally{busy=false;controls.forEach(b=>b.disabled=false);summary();}
}

function navigate(value){if(/^20\d\d-(0[1-9]|1[012])$/.test(value)){month=value;$('receipt').textContent='';load();}else $('month').value=month;}
function shift(delta){const d=stamp(month+'-01');d.setUTCMonth(d.getUTCMonth()+delta);navigate(iso(d).slice(0,7));}
$('prev').onclick=()=>shift(-1);$('next').onclick=()=>shift(1);$('today').onclick=()=>navigate(today.slice(0,7));$('month').onchange=e=>navigate(e.target.value);$('reload').onclick=load;
$('addExpense').onclick=()=>{if($('expenses').children.length>=30){$('error').textContent='Maksimal 30 jenis biaya lainnya.';return;}expenseLine();summary();};
$('applyDaily').onclick=()=>{for(const line of $('dailyDates').querySelectorAll('.dayRateLine'))if(line.querySelector('.dayRateCheck').checked)line.querySelector('.dayRateAmount').value=fields.amount.value||'0';summary();};
$('selectDaily').onclick=()=>setDailySelection(true);$('clearDaily').onclick=()=>setDailySelection(false);
$('nightRate').onchange=()=>{for(const line of $('nights').querySelectorAll('.nightLine')){const value=line.querySelector('.nightAmount');if(!line.querySelector('.nightCheck').checked)value.value=$('nightRate').value||'0';}summary();};
fields.end.onchange=()=>{renderDaily();renderNights();summary();};
fields.amount.oninput=()=>{if(!current){for(const line of $('dailyDates').querySelectorAll('.dayRateLine'))if(line.querySelector('.dayRateCheck').checked)line.querySelector('.dayRateAmount').value=fields.amount.value||'0';}summary();};
fields.status.onchange=()=>{if(fields.status.value==='Tanpa klaim'&&!current){setDailySelection(false);fields.transport.value='0';$('expenses').replaceChildren();for(const line of $('nights').querySelectorAll('.nightLine'))line.querySelector('.nightCheck').checked=false;}summary();};
form.oninput=summary;form.onsubmit=e=>{e.preventDefault();save(current?'PUT':'POST');};
$('another').onclick=()=>openDay(fields.day.value,null);$('close').onclick=()=>dialog.close();dialog.oncancel=e=>{if(busy)e.preventDefault();};
$('remove').onclick=()=>{if(current&&confirm('Hapus catatan tanggal '+current.day+'? Biaya penugasan tetap ada jika masih ada tanggal lain.'))save('DELETE');};
load();
