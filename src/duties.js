const bad = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
const monthPattern = /^20\d{2}-(0[1-9]|1[0-2])$/;
function dateValue(value) {
  if (typeof value !== 'string' || value.length !== 10 || !monthPattern.test(value.slice(0,7))) return NaN;
  const time = Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value ? time : NaN;
}
function field(value,max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) bad('Lengkapi nomor surat, kegiatan, dan tujuan.');
  return value.trim();
}
export async function duties(req,db,readBody) {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const month = url.searchParams.get('month');
    if (!monthPattern.test(month)) bad('Bulan tidak valid.');
    const rows = await db.prepare( `SELECT d.*, c.id AS colorId
      FROM duty_days d JOIN duty_colors c
      ON c.ref_key=lower(trim(d.reference)) AND c.activity_key=lower(trim(d.activity))
      WHERE d.day BETWEEN ? AND ? ORDER BY d.day`).bind(month+'-01',month+'-31').all();
    return {days:rows.results};
  }
  if (!['POST','PUT','DELETE'].includes(req.method)) bad('Metode tidak tersedia.',405);
  const data = await readBody(req,4096);
  if (!data || !Number.isFinite(dateValue(data.day))) bad('Tanggal tidak valid.');
  if (req.method !== 'POST' && typeof data.version !== 'string') bad('Versi catatan diperlukan.');
  if (req.method === 'DELETE') {
    const r = await db.prepare('DELETE FROM duty_days WHERE day=? AND version=?').bind(data.day,data.version).run();
    if (!r.meta.changes) bad('Catatan berubah. Muat ulang kalender sebelum melanjutkan.',409);
    return {ok:true};
  }
  const {kind,status,amount,transport=0,other=0} = data;
  const detail=typeof data.detail==='string'?data.detail.trim():'';
  if (detail.length>160 || (other>0 && !detail)) bad('Isi keterangan biaya lainnya (maksimal 160 karakter).');
  if (!['Dalam daerah','Luar daerah'].includes(kind) || !['Tanpa klaim','Draf','Diajukan','Dibayar'].includes(status)) bad('Jenis tugas atau status tidak valid.');
  const costs=[amount,transport,other];
  if (costs.some(n=>!Number.isSafeInteger(n)||n<0||n>999999999)) bad('Periksa nominal biaya per tanggal.');
  const total=amount+transport+other;
  if ((status==='Tanpa klaim') !== (total===0)) bad('Untuk mencatat biaya, pilih status klaim dan isi sedikitnya satu nominal.');
  const values=[field(data.reference,100),field(data.activity,200),field(data.destination,150),kind,status,...costs,detail];
  if (req.method === 'PUT') {
    if (!Object.hasOwn(data,'transport') || !Object.hasOwn(data,'other')) bad('Muat ulang halaman untuk memakai formulir biaya terbaru.',409);
    const r=await db.prepare('UPDATE duty_days SET reference=?,activity=?,destination=?,kind=?,status=?,amount=?,transport=?,other=?,detail=?,version=? WHERE day=? AND version=?').bind(...values,crypto.randomUUID(),data.day,data.version).run();
    if (!r.meta.changes) bad('Catatan berubah. Muat ulang kalender sebelum melanjutkan.',409);
  } else {
    const start=dateValue(data.day), end=dateValue(data.end);
    if (!Number.isFinite(end) || end<start || end-start>30*86400000) bad('Pilih rentang 1 sampai 31 hari.');
    if(typeof data.requestId!=='string' || !/^[a-f0-9-]{36}$/i.test(data.requestId)) bad('Muat ulang halaman untuk memakai kalender terbaru.');
    const count=(end-start)/86400000+1;
    const attempt=crypto.randomUUID();
    const fingerprint=JSON.stringify([data.day,data.end,...values]);
    // D1 serializes the allocation and inserts in one transaction. A retry
    // reads its existing receipt even if the original dates were later edited.
    await db.batch([
      db.prepare(`WITH RECURSIVE calendar(day) AS (
        SELECT ? UNION ALL SELECT date(day,'+1 day') FROM calendar WHERE day<'2099-12-31'
      ), available AS (
        SELECT day FROM calendar WHERE NOT EXISTS (SELECT 1 FROM duty_days d WHERE d.day=calendar.day) LIMIT ?
      )
      INSERT OR IGNORE INTO duty_submissions(request_id,fingerprint,attempt,days)
      SELECT ?,?,?,json_group_array(day) FROM (SELECT day FROM available ORDER BY day) HAVING count(*)=?`)
        .bind(data.day,count,data.requestId,fingerprint,attempt,count),
      db.prepare(`INSERT INTO duty_days(day,reference,activity,destination,kind,status,amount,transport,other,detail,version)
        SELECT dates.value,?,?,?,?,?,?,?,?,?,? FROM duty_submissions s,json_each(s.days) dates
        WHERE s.request_id=? AND s.attempt=?`).bind(...values,attempt,data.requestId,attempt)
    ]);
    const receipt=await db.prepare('SELECT fingerprint,days FROM duty_submissions WHERE request_id=?').bind(data.requestId).first();
    if(!receipt) bad('Sisa tanggal kosong sampai Desember 2099 tidak cukup untuk durasi ini.');
    if(receipt.fingerprint!==fingerprint) bad('Permintaan sudah diproses dengan isian berbeda. Buka kembali formulir.',409);
    return {ok:true,days:JSON.parse(receipt.days)};
  }
  return {ok:true};
}
