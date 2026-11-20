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
    const rows = await db.prepare('SELECT * FROM duty_days WHERE day BETWEEN ? AND ? ORDER BY day').bind(month+'-01',month+'-31').all();
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
  const {kind,status,amount} = data;
  if (!['Dalam daerah','Luar daerah'].includes(kind) || !['Tanpa klaim','Draf','Diajukan','Dibayar'].includes(status)) bad('Jenis tugas atau status tidak valid.');
  if (!Number.isSafeInteger(amount) || amount<0 || amount>999999999 || (status==='Tanpa klaim' ? amount!==0 : amount===0)) bad('Periksa nominal uang harian.');
  const values = [field(data.reference,100),field(data.activity,200),field(data.destination,150),kind,status,amount,crypto.randomUUID()];
  if (req.method === 'PUT') {
    const r = await db.prepare('UPDATE duty_days SET reference=?,activity=?,destination=?,kind=?,status=?,amount=?,version=? WHERE day=? AND version=?').bind(...values,data.day,data.version).run();
    if (!r.meta.changes) bad('Catatan berubah. Muat ulang kalender sebelum melanjutkan.',409);
  } else {
    const start=dateValue(data.day), end=dateValue(data.end);
    if (!Number.isFinite(end) || end<start || end-start>30*86400000) bad('Pilih rentang 1 sampai 31 hari.');
    const statements=[];
    for (let t=start;t<=end;t+=86400000) {
      const day=new Date(t).toISOString().slice(0,10);
      statements.push(db.prepare('INSERT INTO duty_days (day,reference,activity,destination,kind,status,amount,version) VALUES (?,?,?,?,?,?,?,?)').bind(day,...values));
    }
    try { await db.batch(statements); } catch (e) {
      if (/UNIQUE constraint failed: duty_days.day/i.test(e.message)) bad('Rentang bertabrakan dengan tanggal yang sudah tercatat. Pilih rentang lain atau ubah catatan pada tanggal tersebut.',409);
      throw e;
    }
  }
  return {ok:true};
}
