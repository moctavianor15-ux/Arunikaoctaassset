import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {duties} from '../src/duties.js';
function setup(seedLegacy=false){
  const database=new DatabaseSync(':memory:');
  for(const i of ['0002_penugasan','0003_biaya_penugasan','0004_warna_penugasan'])database.exec(readFileSync(new URL('../migrations/'+i+'.sql',import.meta.url),'utf8'));
  if(seedLegacy){
    for(const day of ['2026-03-02','2026-03-03'])database.prepare("INSERT INTO duty_days(day,reference,activity,destination,kind,status,amount,transport,other,detail,version) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(day,'ST/001','Rakor','Samarinda','Luar daerah','Dibayar',100000,120000,10000,'Parkir','v-old-'+day);
  }
  database.exec(readFileSync(new URL('../migrations/0005_biaya_klaim_penugasan.sql',import.meta.url),'utf8'));
  function prepare(sql){
    const stmt=database.prepare(sql);
    return {bind(...args){return {
      async first(){return stmt.get(...args)||null},
      async all(){return {results:stmt.all(...args)}},
      async run(){return {meta:{changes:Number(stmt.run(...args).changes)}}},
      _run(){return {meta:{changes:Number(stmt.run(...args).changes)}}}
    };}};
  }
  const db={prepare,async batch(statements){database.exec('BEGIN');try{const result=statements.map(s=>s._run());database.exec('COMMIT');return result;}catch(error){database.exec('ROLLBACK');throw error;}}};
  const request=(method,data,month='2026-03')=>duties(new Request('https://local.test/api/duties?month='+month,{method}),db,async()=>data);
  return {database,request};
}
const make=(patch={})=>({day:'2026-03-04',end:'2026-03-06',reference:'ST/002',activity:'Pengawasan',destination:'Balikpapan',kind:'Luar daerah',status:'Draf',amount:100000,transport:200000,expenses:[{label:'Parkir',amount:30000},{label:'Bagasi',amount:20000}],lodging:[{date:'2026-03-04',amount:350000},{date:'2026-03-05',amount:400000}],requestId:crypto.randomUUID(),...patch});
test('migrasi 0005 menjaga seluruh total klaim lama dan tidak berulang per hari',async()=>{
  const {request,database}=setup(true),data=await request('GET');
  assert.equal(data.days.length,2);assert.equal(data.days.reduce((sum,row)=>sum+row.transport+row.other,0),0);
  assert.equal(data.costs.length,1);assert.equal(data.costs[0].transport,240000);
  assert.equal(data.costs[0].expenses.reduce((sum,x)=>sum+x.amount,0),20000);
  assert.equal(data.days.reduce((sum,r)=>sum+r.amount,0)+data.costs[0].transport+data.costs[0].expenses.reduce((sum,x)=>sum+x.amount,0),460000);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM duty_costs').get().n,1);
});
test('transport dan biaya tambahan satu kali, penginapan hanya pada malam yang dicentang',async()=>{
  const {request,database}=setup(),input=make();
  assert.deepEqual((await request('POST',input)).days,['2026-03-04','2026-03-05','2026-03-06']);
  let data=await request('GET');assert.equal(data.days.length,3);assert.equal(data.costs.length,1);
  assert.equal(data.days.reduce((s,r)=>s+r.amount,0),300000);
  assert(data.days.every(r=>r.transport===0&&r.other===0));
  assert.equal(data.costs[0].transport,200000);assert.equal(data.costs[0].expenses.length,2);
  assert.deepEqual(data.costs[0].lodging.map(x=>x.date),['2026-03-04','2026-03-05']);
  assert.equal(data.days.reduce((s,r)=>s+r.amount,0)+data.costs[0].transport+data.costs[0].expenses.reduce((s,x)=>s+x.amount,0)+data.costs[0].lodging.reduce((s,x)=>s+x.amount,0),1300000);
  assert.equal((await request('POST',input)).days.length,3);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM duty_days').get().n,3);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM duty_costs').get().n,1);
  const edited={...input,day:'2026-03-05',amount:150000,transport:500000,expenses:[{label:'Taksi',amount:20000}],lodging:[{date:'2026-03-05',amount:280000}],version:data.days[1].version,costVersion:data.costs[0].version};
  await request('PUT',edited);data=await request('GET');
  assert.deepEqual(data.days.map(r=>r.amount),[100000,150000,100000]);
  assert.equal(data.costs[0].transport,500000);assert.deepEqual(data.costs[0].lodging,[{date:'2026-03-05',amount:280000}]);
  await assert.rejects(request('PUT',edited),e=>e.status===409);
  data=await request('GET');assert.equal(data.days[1].amount,150000);
});
test('pembuatan biaya ditolak jika malam di luar rentang, nominal negatif, atau kosong tanpa status tepat',async()=>{
  const {request,database}=setup();
  for(const data of [make({lodging:[{date:'2026-03-07',amount:400000}]}),make({transport:-1}),make({expenses:[{label:'',amount:8000}]}),make({status:'Tanpa klaim'})]){
    await assert.rejects(request('POST',data),e=>e.status===400);
  }
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM duty_days').get().n,0);
});
test('hapus tanggal mengalokasikan biaya sekali ke tanggal pertama yang tersisa lalu bersihkan seluruh penugasan',async()=>{
  const {request,database}=setup();await request('POST',make());
  let d=await request('GET');await request('DELETE',{day:d.days[0].day,version:d.days[0].version});
  d=await request('GET');assert.equal(d.days.length,2);assert.equal(d.costs[0].charge_day,'2026-03-05');
  for(const r of d.days)await request('DELETE',{day:r.day,version:r.version});
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM duty_costs').get().n,0);
});
test('biaya penugasan terpisah, tidak dihitung dua kali walau surat dan kegiatan sama',async()=>{
  const {request}=setup();await request('POST',make({end:'2026-03-04',lodging:[]}));await request('POST',make({day:'2026-03-10',end:'2026-03-10',lodging:[],requestId:crypto.randomUUID()}));
  const d=await request('GET');assert.equal(d.days.length,2);assert.equal(d.costs.length,2);assert.notEqual(d.days[0].assignment_id,d.days[1].assignment_id);
});
test('malam terpilih yang sudah dipakai penugasan lain ditolak tanpa menulis sebagian data',async()=>{
  const {request,database}=setup();
  await request('POST',make({day:'2026-03-04',end:'2026-03-04',lodging:[],requestId:crypto.randomUUID()}));
  await assert.rejects(request('POST',make({day:'2026-03-03',end:'2026-03-05',lodging:[{date:'2026-03-04',amount:250000}],requestId:crypto.randomUUID()})),e=>e.status===409);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM duty_days').get().n,1);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM duty_costs').get().n,1);
});
test('lodging malam yang dihapus ikut dibersihkan, malam lain tetap',async()=>{
  const {request}=setup();await request('POST',make());
  let data=await request('GET');await request('DELETE',{day:'2026-03-04',version:data.days[0].version});
  data=await request('GET');assert.deepEqual(data.costs[0].lodging,[{date:'2026-03-05',amount:400000}]);
});
test('rentang penugasan lintas bulan menyimpan satu biaya transport dan rincian malam',async()=>{
  const {request}=setup();await request('POST',make({day:'2026-03-30',end:'2026-04-02',lodging:[{date:'2026-03-31',amount:300000},{date:'2026-04-01',amount:350000}]}));
  const march=await request('GET'),april=await request('GET',undefined,'2026-04');
  assert.deepEqual(march.days.map(r=>r.day),['2026-03-30','2026-03-31']);
  assert.deepEqual(april.days.map(r=>r.day),['2026-04-01','2026-04-02']);
  assert.equal(march.costs[0].assignment_id,april.costs[0].assignment_id);
  assert.equal(march.costs[0].transport,200000);
});
test('V6: hanya tanggal uang harian yang dicentang dibayar, transport sekali, penginapan per malam',async()=>{
  const {request,database}=setup();
  const inp=make({day:'2026-03-10',end:'2026-03-13',dailyRates:[{date:'2026-03-10',amount:530000},{date:'2026-03-12',amount:650000}],lodging:[{date:'2026-03-11',amount:450000}]});
  assert.deepEqual((await request('POST',inp)).days,['2026-03-10','2026-03-11','2026-03-12','2026-03-13']);
  const data=await request('GET');
  assert.deepEqual(data.days.map(r=>r.amount),[530000,0,650000,0]);
  assert.equal(data.days.reduce((s,x)=>s+x.amount,0),1180000);
  assert.equal(data.costs[0].transport,200000);
  assert.equal(data.costs[0].lodging.length,1);
  assert.deepEqual(data.assignmentDays.map(x=>x.amount),[530000,0,650000,0]);
  assert.equal(database.prepare('SELECT SUM(amount) AS s FROM duty_days').get().s,1180000);
});
test('V6: pilihan tanggal dapat diubah sekaligus saat edit tanpa menghapus penginapan dan transport',async()=>{
  const {request}=setup();
  await request('POST',make({day:'2026-03-10',end:'2026-03-12',dailyRates:[{date:'2026-03-10',amount:530000}],lodging:[{date:'2026-03-11',amount:450000}]}));
  let data=await request('GET');
  const clicked=data.days[0],claim=data.costs[0];
  const edited=make({day:clicked.day,end:'2026-03-12',version:clicked.version,costVersion:claim.version,
    dailyVersions:data.assignmentDays.map(r=>({date:r.day,version:r.version})),dailyRates:[{date:'2026-03-11',amount:620000},{date:'2026-03-12',amount:530000}],
    amount:0,transport:claim.transport,expenses:claim.expenses,lodging:claim.lodging});
  await request('PUT',edited);
  data=await request('GET');
  assert.deepEqual(data.days.map(x=>x.amount),[0,620000,530000]);
  assert.equal(data.costs[0].transport,200000);
  assert.deepEqual(data.costs[0].lodging,[{date:'2026-03-11',amount:450000}]);
  assert.equal(data.days[0].status,'Draf');
  await assert.rejects(request('PUT',edited),e=>e.status===409);
});
test('V6: edit uang harian penugasan lintas bulan tidak melewatkan hari di bulan lain',async()=>{
  const {request}=setup();
  await request('POST',make({day:'2026-03-31',end:'2026-04-02',dailyRates:[{date:'2026-04-01',amount:530000}],lodging:[{date:'2026-03-31',amount:100000}]}));
  const march=await request('GET');
  assert.equal(march.assignmentDays.length,3);
  assert.deepEqual(march.assignmentDays.map(r=>r.day),['2026-03-31','2026-04-01','2026-04-02']);
  const clicked=march.days[0],claim=march.costs[0];
  await request('PUT',make({day:clicked.day,end:'2026-04-02',version:clicked.version,costVersion:claim.version,
    dailyVersions:march.assignmentDays.map(r=>({date:r.day,version:r.version})),dailyRates:[{date:'2026-03-31',amount:600000},{date:'2026-04-02',amount:710000}],
    amount:600000,transport:claim.transport,expenses:claim.expenses,lodging:claim.lodging}));
  const march2=await request('GET'),april=await request('GET',undefined,'2026-04');
  assert.deepEqual(march2.days.map(x=>x.amount),[600000]);
  assert.deepEqual(april.days.map(x=>x.amount),[0,710000]);
});
test('V6: menolak pilihan uang harian ganda, tanggal di luar rentang, nominal nol, dan penugasan bentrok',async()=>{
  const {request,database}=setup();
  const invalid=[
    [{date:'2026-03-04',amount:0}],
    [{date:'2026-03-07',amount:100000}],
    [{date:'2026-03-04',amount:100000},{date:'2026-03-04',amount:200000}],
    [{date:'2026-03-05',amount:-1}]
  ];
  for(const dailyRates of invalid)await assert.rejects(request('POST',make({dailyRates})),e=>e.status===400);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM duty_days').get().n,0);
  await request('POST',make({day:'2026-03-04',end:'2026-03-04',dailyRates:[{date:'2026-03-04',amount:100000}],lodging:[]}));
  await assert.rejects(request('POST',make({day:'2026-03-03',end:'2026-03-05',dailyRates:[{date:'2026-03-03',amount:100000}],lodging:[]})),e=>e.status===409);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM duty_days').get().n,1);
});
test('V6: tidak memilih uang harian boleh jika masih ada transport atau biaya lainnya',async()=>{
  const {request}=setup();await request('POST',make({dailyRates:[],amount:0,lodging:[],expenses:[],transport:200000}));
  const data=await request('GET');assert.equal(data.days.length,3);assert(data.days.every(x=>x.amount===0));
  assert.equal(data.costs[0].transport,200000);
});
