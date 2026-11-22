const bad = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
const monthPattern = /^20\d{2}-(0[1-9]|1[0-2])$/;
const dayMs=86400000;
function dateValue(value) {
  if (typeof value !== 'string' || value.length !== 10 || !monthPattern.test(value.slice(0,7))) return NaN;
  const time = Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value ? time : NaN;
}
function field(value,max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) bad('Lengkapi nomor surat, kegiatan, dan tujuan.');
  return value.trim();
}
function number(value,label) {
  if (!Number.isSafeInteger(value)||value<0||value>999999999)bad('Nominal '+label+' harus berupa bilangan bulat Rp 0–999.999.999.');
  return value;
}
function claims(data,allowedDays){
  const transport=number(data.transport,'transport');
  if(!Array.isArray(data.expenses)||data.expenses.length>30)bad('Maksimal 30 rincian biaya lainnya.');
  const expenses=data.expenses.map(item=>{
    if(!item||typeof item.label!=='string'||!item.label.trim()||item.label.trim().length>100)bad('Lengkapi nama biaya lainnya (maksimal 100 karakter).');
    return {label:item.label.trim(),amount:number(item.amount,'biaya lainnya')};
  }).filter(item=>item.amount>0);
  if(!Array.isArray(data.lodging)||data.lodging.length>31)bad('Maksimal 31 malam penginapan.');
  const nights=new Set();
  const lodging=data.lodging.map(item=>{
    if(!item||!Number.isFinite(dateValue(item.date))||!allowedDays.includes(item.date))bad('Tanggal malam penginapan harus termasuk tanggal penugasan.');
    if(nights.has(item.date))bad('Tanggal penginapan tidak boleh ganda.');
    nights.add(item.date);
    return {date:item.date,amount:number(item.amount,'penginapan per malam')};
  }).filter(item=>item.amount>0).sort((a,b)=>a.date.localeCompare(b.date));
  const extra=transport+expenses.reduce((n,x)=>n+x.amount,0)+lodging.reduce((n,x)=>n+x.amount,0);
  if(!Number.isSafeInteger(extra))bad('Total rincian biaya melebihi batas.');
  return {transport,expenses,lodging,extra};
}
function details(data){
  const {kind,status,amount}=data;
  if (!['Dalam daerah','Luar daerah'].includes(kind) || !['Tanpa klaim','Draf','Diajukan','Dibayar'].includes(status))bad('Jenis dinas atau status klaim tidak valid.');
  return {values:[field(data.reference,100),field(data.activity,200),field(data.destination,150),kind,status,number(amount,'uang harian')]};
}
export async function duties(req,db,readBody) {
  const url=new URL(req.url);
  if(req.method==='GET'){
    const month=url.searchParams.get('month');
    if(!monthPattern.test(month))bad('Bulan tidak valid.');
    const start=month+'-01',end=month+'-31';
    const q='SELECT DISTINCT assignment_id FROM duty_days WHERE day BETWEEN ? AND ?';
    const [days,costs,assignmentDays]=await Promise.all([
      db.prepare(`SELECT d.*, c.id AS colorId FROM duty_days d JOIN duty_colors c ON c.ref_key=lower(trim(d.reference)) AND c.activity_key=lower(trim(d.activity)) WHERE d.day BETWEEN ? AND ? ORDER BY d.day`).bind(start,end).all(),
      db.prepare(`SELECT * FROM duty_costs WHERE assignment_id IN (${q})`).bind(start,end).all(),
      db.prepare(`SELECT assignment_id,day FROM duty_days WHERE assignment_id IN (${q}) ORDER BY day`).bind(start,end).all()
    ]);
    return {days:days.results,costs:costs.results.map(row=>({...row,expenses:JSON.parse(row.expenses),lodging:JSON.parse(row.lodging)})),assignmentDays:assignmentDays.results};
  }
  if(!['POST','PUT','DELETE'].includes(req.method))bad('Metode tidak tersedia.',405);
  const data=await readBody(req,16384);
  if(!data||!Number.isFinite(dateValue(data.day)))bad('Tanggal tidak valid.');
  if(req.method!=='POST'&&typeof data.version!=='string')bad('Versi catatan diperlukan.');
  if(req.method==='DELETE'){
    const old=await db.prepare('SELECT assignment_id FROM duty_days WHERE day=? AND version=?').bind(data.day,data.version).first();
    if(!old)bad('Catatan sudah berubah. Muat ulang kalender.',409);
    const results=await db.batch([
      db.prepare('DELETE FROM duty_days WHERE day=? AND version=?').bind(data.day,data.version),
      db.prepare(`UPDATE duty_costs SET lodging=COALESCE((SELECT json_group_array(json(value)) FROM json_each(lodging) WHERE json_extract(value,'$.date')<>?),'[]'),version=? WHERE assignment_id=? AND NOT EXISTS(SELECT 1 FROM duty_days WHERE day=? AND assignment_id=?)`)
        .bind(data.day,crypto.randomUUID(),old.assignment_id,data.day,old.assignment_id),
      db.prepare(`UPDATE duty_costs SET charge_day=(SELECT MIN(day) FROM duty_days WHERE assignment_id=?) WHERE assignment_id=? AND NOT EXISTS(SELECT 1 FROM duty_days WHERE assignment_id=? AND day=charge_day) AND EXISTS(SELECT 1 FROM duty_days WHERE assignment_id=?)`).bind(old.assignment_id,old.assignment_id,old.assignment_id,old.assignment_id),
      db.prepare('DELETE FROM duty_costs WHERE assignment_id=? AND NOT EXISTS(SELECT 1 FROM duty_days WHERE assignment_id=?)').bind(old.assignment_id,old.assignment_id)
    ]);
    if(!results[0].meta.changes)bad('Catatan berubah. Muat ulang kalender.',409);
    return {ok:true};
  }
  const {values}=details(data);
  if(req.method==='PUT'){
    const row=await db.prepare('SELECT assignment_id FROM duty_days WHERE day=? AND version=?').bind(data.day,data.version).first();
    if(!row)bad('Catatan berubah. Muat ulang kalender.',409);
    if(typeof data.costVersion!=='string')bad('Versi biaya penugasan diperlukan.',409);
    const full=await db.prepare('SELECT day FROM duty_days WHERE assignment_id=? ORDER BY day').bind(row.assignment_id).all();
    const costs=claims(data,full.results.map(r=>r.day));
    if(data.status==='Tanpa klaim' && data.amount!==0)bad('Uang harian harus nol jika status tanggal ini Tanpa klaim.');
    if(data.status!=='Tanpa klaim' && data.amount+costs.extra===0)bad('Isi sedikitnya satu biaya klaim.');
    const next=crypto.randomUUID();
    // Kedua UPDATE saling tergantung dalam batch transaksional D1:
    // catatan biaya harus berhasil terlebih dulu sebelum baris tanggal diubah.
    const changes=await db.batch([
      db.prepare(`UPDATE duty_costs SET transport=?,expenses=?,lodging=?,version=?
        WHERE assignment_id=? AND version=? AND EXISTS(SELECT 1 FROM duty_days WHERE day=? AND version=? AND assignment_id=?)`)
        .bind(costs.transport,JSON.stringify(costs.expenses),JSON.stringify(costs.lodging),next,row.assignment_id,data.costVersion,data.day,data.version,row.assignment_id),
      db.prepare(`UPDATE duty_days SET reference=?,activity=?,destination=?,kind=?,status=?,amount=?,transport=0,other=0,detail='',version=?
        WHERE day=? AND version=? AND assignment_id=?
        AND EXISTS(SELECT 1 FROM duty_costs WHERE assignment_id=? AND version=?)`)
        .bind(...values,next,data.day,data.version,row.assignment_id,row.assignment_id,next)
    ]);
    if(!changes[0].meta.changes||!changes[1].meta.changes)bad('Data penugasan diubah dari perangkat lain. Muat ulang terlebih dahulu.',409);
    return {ok:true};
  }
  const start=dateValue(data.day), end=dateValue(data.end);
  if(!Number.isFinite(end)||end<start||end-start>30*dayMs)bad('Pilih rentang 1 sampai 31 hari.');
  if(typeof data.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(data.requestId))bad('Permintaan pencatatan tidak valid. Muat ulang halaman.');
  const count=(end-start)/dayMs+1;
  const allowed=Array.from({length:count},(_,i)=>new Date(start+i*dayMs).toISOString().slice(0,10));
  const costs=claims(data,allowed);
  if((data.status==='Tanpa klaim') !== (data.amount+costs.extra===0))bad('Pilih status klaim dan isi nominal, atau Tanpa klaim dengan seluruh biaya nol.');
  // Tetap memakai perilaku lama: tanggal terpakai dilewati dan rentang hari digeser.
  // Penginapan tidak boleh berada pada tanggal yang akhirnya terlewati.
  const assignmentId=crypto.randomUUID(), attempt=crypto.randomUUID();
  const fingerprint=JSON.stringify([data.day,data.end,...values,costs]);
  await db.batch([
    db.prepare(`WITH RECURSIVE calendar(day) AS (
      SELECT ? UNION ALL SELECT date(day,'+1 day') FROM calendar WHERE day<'2099-12-31'
    ), available AS (
      SELECT day FROM calendar WHERE NOT EXISTS (SELECT 1 FROM duty_days d WHERE d.day=calendar.day) LIMIT ?
    )
    INSERT OR IGNORE INTO duty_submissions(request_id,fingerprint,attempt,days)
    SELECT ?,?,?,json_group_array(day) FROM (SELECT day FROM available ORDER BY day)
    HAVING count(*)=? AND NOT EXISTS (SELECT 1 FROM duty_days WHERE day IN (SELECT value FROM json_each(?)))`)
      .bind(data.day,count,data.requestId,fingerprint,attempt,count,JSON.stringify(costs.lodging.map(x=>x.date))),
    db.prepare(`INSERT INTO duty_days(day,reference,activity,destination,kind,status,amount,transport,other,detail,version,assignment_id)
      SELECT dates.value,?,?,?,?,?,?,0,0,'',?,? FROM duty_submissions s,json_each(s.days) dates
      WHERE s.request_id=? AND s.attempt=?`).bind(...values,attempt,assignmentId,data.requestId,attempt),
    db.prepare(`INSERT INTO duty_costs(assignment_id,transport,expenses,lodging,charge_day,version)
      SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM duty_submissions WHERE request_id=? AND attempt=?)`)
      .bind(assignmentId,costs.transport,JSON.stringify(costs.expenses),JSON.stringify(costs.lodging),data.day,attempt,data.requestId,attempt)
  ]);
  const receipt=await db.prepare('SELECT fingerprint,days FROM duty_submissions WHERE request_id=?').bind(data.requestId).first();
  if(!receipt)bad('Tanggal penugasan atau malam penginapan yang dipilih sudah terisi, atau durasi tidak tersedia. Ubah tanggal dan simpan lagi.',409);
  if(receipt.fingerprint!==fingerprint)bad('Permintaan sudah diproses dengan isian berbeda. Buka kembali formulir.',409);
  const insertedDays=JSON.parse(receipt.days);
  return {ok:true,days:insertedDays};
}
