'use strict';
// Buku kas disimpan bersama state portofolio D1. Saldo rekening adalah saldo dasar + mutasi.
// Tidak mengubah nilai aset lain atau menggandakan mutasi bank menjadi kategori aset baru.
const cashCategories={
 income:[['gaji','Gaji & upah'],['bonus','Bonus & insentif'],['usaha','Penghasilan usaha'],['bunga','Bunga / bagi hasil'],['hadiah','Hadiah & bantuan'],['pengembalian','Pengembalian dana'],['lainnya','Lain-lain']],
 expense:[['makan','Makan & minum'],['belanja','Belanja'],['transport','Transportasi'],['tagihan','Tagihan & utilitas'],['kesehatan','Kesehatan'],['pendidikan','Pendidikan'],['cicilan','Cicilan & utang'],['hiburan','Hiburan'],['tabungan','Alokasi tabungan'],['lainnya','Lain-lain']],
 transfer:[['transfer','Pindah antar rekening']]
};
const cashTypeLabels={income:'Uang masuk',expense:'Uang keluar',transfer:'Transfer'};
const cashCache=new WeakMap();
const transactionsOf=s=>Array.isArray(s?.transactions)?s.transactions:[];
function cashDeltas(s){
 if(cashCache.has(s))return cashCache.get(s);
 const result=new Map();const add=(id,amount)=>result.set(id,(result.get(id)||0)+amount);
 for(const t of transactionsOf(s)){
  if(t.type==='transfer'){add(t.accountId,-t.amount);add(t.toAccountId,t.amount)}
  else add(t.accountId,t.type==='income'?t.amount:-t.amount);
 }
 cashCache.set(s,result);return result;
}
function bankBalance(a,s=state){return a.amount+(cashDeltas(s).get(a.id)||0)}
function validCashflow(s){
 if(s.transactions===undefined)return true;
 if(!Array.isArray(s.transactions)||s.transactions.length>5000)return false;
 const banks=new Map(s.assets.filter(a=>a.kind==='bank').map(a=>[a.id,a]));const ids=new Set();
 for(const t of s.transactions){
  if(!t||typeof t.id!=='string'||!/^[-\w]{1,80}$/.test(t.id)||ids.has(t.id)||
    !['income','expense','transfer'].includes(t.type)||!validDay(t.date)||
    !Number.isSafeInteger(t.amount)||t.amount<=0||t.amount>1e15||
    typeof t.accountId!=='string'||!banks.has(t.accountId)||
    typeof t.category!=='string'||!t.category.trim()||t.category.length>60||
    typeof t.note!=='string'||t.note.length>240)return false;
  ids.add(t.id);
  if(t.type==='transfer'){
   if(typeof t.toAccountId!=='string'||t.toAccountId===t.accountId||!banks.has(t.toAccountId))return false;
  }else if(t.toAccountId!==undefined)return false;
 }
 for(const a of banks.values()){const balance=bankBalance(a,s);if(!number(balance)||balance>1e15)return false}
 return true;
}
const cashBankAssets=(s=state)=>s.assets.filter(a=>a.kind==='bank');
function cashAccountName(id,s=state){const a=s.assets.find(a=>a.id===id&&a.kind==='bank');return a?(a.bank+' · '+a.name+(a.last4?' ••••'+a.last4:'')):'Rekening tidak ditemukan'}
function cashBankOptions(selected='',includeAll=false){return (includeAll?'<option value="">Semua rekening</option>':'')+cashBankAssets().map(a=>'<option value="'+esc(a.id)+'" '+(a.id===selected?'selected':'')+'>'+esc(cashAccountName(a.id))+'</option>').join('')}
function cashRange(mode,reference,start,end){
 if(mode==='all')return {start:'1900-01-01',end:'9999-12-31',label:'Semua tanggal'};
 if(mode==='custom')return {start:start||localDay(),end:end||localDay(),label:'Tanggal khusus · '+(start||localDay())+' sampai '+(end||localDay())};
 const day=reference||localDay();if(mode==='day')return {start:day,end:day,label:'Harian · '+day};
 const d=new Date(day+'T12:00:00');
 if(mode==='week'){
  d.setDate(d.getDate()-((d.getDay()+6)%7));const a=localDay(d);d.setDate(d.getDate()+6);
  return {start:a,end:localDay(d),label:'Mingguan · '+a+' sampai '+localDay(d)};
 }
 if(mode==='month'){
  const first=day.slice(0,7)+'-01';d.setMonth(d.getMonth()+1,0);
  return {start:first,end:localDay(d),label:'Bulanan · '+new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(new Date(day+'T12:00:00'))};
 }
 return {start:day,end:day,label:'Harian · '+day};
}
let cashPage=1;let cashFiltered=[];
function cashFilterRange(){return cashRange($('cashPeriod').value,$('cashReference').value,$('cashStart').value,$('cashEnd').value)}
function cashFilteredRows(){
 const {start,end}=cashFilterRange(),type=$('cashTypeFilter').value,bank=$('cashBankFilter').value;
 const matching=transactionsOf(state).filter(t=>t.date>=start&&t.date<=end&&(!type||t.type===type)&&(!bank||t.accountId===bank||t.toAccountId===bank));
 return matching.map((t,i)=>({t,i})).sort((a,b)=>b.t.date.localeCompare(a.t.date)||b.i-a.i).map(x=>x.t);
}
function cashMoneyClass(n){return n>0?'cashPositive':n<0?'cashNegative':''}
function cashRenderAccountCards(){
 const banks=cashBankAssets();$('cashBalances').innerHTML=banks.length?banks.map(a=>'<div class="cashBankCard"><small>'+esc(cashAccountName(a.id))+'</small><strong>'+money(bankBalance(a))+'</strong><span class="cashLabel">Saldo rekening terkini</span></div>').join(''):'<div class="cashEmptyBank">Belum ada rekening bank. <button type="button" id="cashCreateBank">+ Buat rekening bank</button> dahulu untuk mulai mencatat transaksi.</div>';
 const add=$('cashCreateBank');if(add)add.onclick=()=>assetForm('bank');
}
function renderCashflow(){
 const banks=cashBankAssets();cashRenderAccountCards();
 const filter=$('cashBankFilter'),old=filter.value;filter.innerHTML=cashBankOptions(old,true);filter.value=banks.some(a=>a.id===old)?old:'';
 const mode=$('cashPeriod').value;
 $('cashReferenceWrap').hidden=mode==='custom'||mode==='all';$('cashStartWrap').hidden=mode!=='custom';$('cashEndWrap').hidden=mode!=='custom';
 const range=cashFilterRange();$('cashPeriodLabel').innerHTML='<strong>'+esc(range.label)+'</strong> · Rentang waktu transaksi yang ditampilkan';
 const invalid=range.start>range.end;
 cashFiltered=invalid?[]:cashFilteredRows();
 const income=cashFiltered.reduce((s,t)=>s+(t.type==='income'?t.amount:0),0);
 const expense=cashFiltered.reduce((s,t)=>s+(t.type==='expense'?t.amount:0),0);
 const transfer=cashFiltered.reduce((s,t)=>s+(t.type==='transfer'?t.amount:0),0);
 const net=income-expense;
 $('cashIncome').textContent=money(income);$('cashExpense').textContent=money(expense);$('cashNet').textContent=(net<0?'− ':'')+money(Math.abs(net));$('cashNet').className=cashMoneyClass(net);$('cashTransfer').textContent=money(transfer);
 $('cashCount').textContent=invalid?'Rentang tanggal tidak valid':cashFiltered.length+' transaksi';
 $('cashCsv').disabled=!cashFiltered.length;
 for(const id of ['cashIncomeAdd','cashExpenseAdd','cashTransferAdd'])$(id).disabled=!banks.length||(id==='cashTransferAdd'&&banks.length<2);
 const visible=cashFiltered.slice(0,cashPage*60);
 $('cashList').innerHTML=invalid?'<p class="cashEmpty cashError">Tanggal mulai tidak boleh lebih besar daripada tanggal akhir.</p>':visible.length?visible.map(t=>{
  const isIncome=t.type==='income',transfer=t.type==='transfer';const source=cashAccountName(t.accountId);const destination=transfer?cashAccountName(t.toAccountId):'';
  return '<div class="cashRow"><div class="cashRowText"><b><span class="cashTypeTag '+t.type+'">'+cashTypeLabels[t.type]+'</span>'+esc(t.note||cashCategoryName(t))+'</b><small>'+esc(t.date)+' · '+esc(cashCategoryName(t))+'</small><small>'+esc(transfer?source+' → '+destination:source)+'</small></div><span class="cashRowAmount '+(isIncome?'cashPositive':transfer?'':'cashNegative')+'">'+(isIncome?'+ ':transfer?'⇄ ':'− ')+money(t.amount)+'</span><button data-cash-id="'+esc(t.id)+'" type="button" aria-label="Ubah transaksi '+esc(t.date)+'">Ubah</button></div>';
 }).join(''):'<p class="cashEmpty">Belum ada transaksi pada periode ini. Klik Uang masuk atau Uang keluar untuk mencatat transaksi pertama.</p>';
 $('cashMore').hidden=cashFiltered.length<=visible.length;
}
function cashCategoryName(t){return (cashCategories[t.type]||[]).find(([k])=>k===t.category)?.[1]||t.category}
function cashTypeOptions(selected){return ['income','expense','transfer'].map(k=>'<option value="'+k+'" '+(k===selected?'selected':'')+'>'+cashTypeLabels[k]+'</option>').join('')}
function cashTransactionForm(current=null,type='income'){
 if(!cashBankAssets().length){modal('Tambahkan rekening terlebih dahulu','<p>Buat minimal satu rekening bank untuk menghubungkan pemasukan/pengeluaran dengan saldo. Pilih Tambah aset → Tabungan bank.</p>',null);return}
 const a=current||{},kind=a.type||type,defaultAccount=a.accountId||cashBankAssets()[0].id;
 const fields=label('Jenis transaksi','<select name="type" id="cashEntryType">'+cashTypeOptions(kind)+'</select>')+
  label('Tanggal transaksi','<input type="date" name="date" min="1900-01-01" max="'+localDay()+'" value="'+esc(a.date||localDay())+'" required>')+
  num('amount','Jumlah transaksi (Rp)',a.amount??'',1e15,1,1)+
  label('Rekening sumber / rekening terkait','<select id="cashEntryBank" name="accountId" required>'+cashBankOptions(defaultAccount)+'</select>')+
  '<div id="cashEntryTo"></div><div id="cashEntryCategory"></div>'+
  label('Catatan (opsional)','<textarea name="note" maxlength="240" rows="3" placeholder="Misalnya gaji November, belanja kebutuhan, atau transfer antarbank">'+esc(a.note||'')+'</textarea>')+
  (current?'<button type="button" id="cashDelete" class="soft warn">Hapus transaksi</button>':'')+
  '<p id="cashEntryHint" class="cashInlineHint"></p>';
 modal(current?'Ubah transaksi':'Catat '+cashTypeLabels[kind].toLowerCase(),fields,async form=>{
  const newType=form.get('type');const item={id:current?.id||crypto.randomUUID(),type:newType,date:form.get('date'),amount:Number(form.get('amount')),
   accountId:form.get('accountId'),category:form.get('category'),note:form.get('note').trim()};
  if(newType==='transfer')item.toAccountId=form.get('toAccountId');
  const tx=transactionsOf(state);const next={...state,transactions:current?tx.map(old=>old.id===current.id?item:old):[...tx,item]};
  if(!valid(next))throw Error('Periksa nominal, tanggal, rekening tujuan, atau saldo rekening. Saldo akhir tidak boleh negatif.');
  await commit(next);cashPage=1;
 },current?'Simpan perubahan':'Simpan transaksi');
 const kindSelect=$('cashEntryType');
 function dynamic(){
  const type=kindSelect.value,source=$('cashEntryBank').value;
  $('cashEntryBank').closest('label').firstChild.textContent=type==='income'?'Rekening penerima':type==='expense'?'Rekening pembayaran':'Rekening sumber';
  const tos=cashBankAssets().filter(a=>a.id!==source);
  $('cashEntryTo').innerHTML=type==='transfer'?label('Rekening tujuan','<select name="toAccountId" required>'+tos.map(b=>'<option value="'+esc(b.id)+'" '+(b.id===a.toAccountId?'selected':'')+'>'+esc(cashAccountName(b.id))+'</option>').join('')+'</select>'):'';
  const available=cashCategories[type]||cashCategories.income;
  $('cashEntryCategory').innerHTML=label('Kategori','<select name="category">'+available.map(([k,v])=>'<option value="'+k+'" '+(a.category===k?'selected':'')+'>'+v+'</option>').join('')+'</select>');
  $('cashEntryHint').textContent=type==='transfer'?'Transfer hanya memindahkan saldo antarrekening, bukan pendapatan atau pengeluaran.':type==='income'?'Nominal akan menambah saldo rekening penerima.':'Nominal akan mengurangi saldo rekening pembayaran. Saldo akhir tidak boleh negatif.';
 }
 kindSelect.onchange=dynamic;$('cashEntryBank').onchange=dynamic;dynamic();
 if(current)$('cashDelete').onclick=()=>modal('Hapus transaksi?', '<p>Transaksi tanggal '+esc(current.date)+' senilai '+money(current.amount)+' akan dihapus. Saldo bank akan dihitung kembali secara otomatis.</p>',async()=>{
  const next={...state,transactions:transactionsOf(state).filter(t=>t.id!==current.id)};
  if(!valid(next))throw Error('Penghapusan membuat saldo akhir rekening negatif. Periksa transaksi lain atau saldo dasar.');
  await commit(next);cashPage=1;
 },'Ya, hapus transaksi');
}
function exportCashCSV(){
 const headers=['Tanggal','Jenis','Kategori','Nominal (Rp)','Rekening asal / terkait','Rekening tujuan','Catatan'];
 const rows=cashFiltered.map(t=>[t.date,cashTypeLabels[t.type],cashCategoryName(t),t.amount,cashAccountName(t.accountId),t.type==='transfer'?cashAccountName(t.toAccountId):'',t.note]);
 // Awalan berbahaya pada CSV dibersihkan untuk mencegah formula injection di Excel.
 const cell=v=>{let x=String(v??'');if(/^[\s\t\r\n]*[=+@-]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"'};
 const body='\uFEFF'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
 const u=URL.createObjectURL(new Blob([body],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=u;link.download='Arunika-Buku-Kas-'+localDay()+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(u),2000);
}
function setupCashflow(){
 const date=localDay();for(const id of ['cashReference','cashStart','cashEnd']){$(id).value=date;$(id).max=date}
 for(const id of ['cashPeriod','cashReference','cashStart','cashEnd','cashTypeFilter','cashBankFilter'])$(id).addEventListener('change',()=>{cashPage=1;renderCashflow()});
 $('cashIncomeAdd').onclick=()=>cashTransactionForm(null,'income');$('cashExpenseAdd').onclick=()=>cashTransactionForm(null,'expense');$('cashTransferAdd').onclick=()=>cashTransactionForm(null,'transfer');
 $('cashMore').onclick=()=>{cashPage++;renderCashflow()};$('cashCsv').onclick=exportCashCSV;
 $('cashList').onclick=e=>{const button=e.target.closest('button[data-cash-id]');if(!button)return;const tx=transactionsOf(state).find(t=>t.id===button.dataset.cashId);if(tx)cashTransactionForm(tx)};
}
