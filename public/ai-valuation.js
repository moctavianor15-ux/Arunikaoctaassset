/* Arunika v8: nilai sendiri + saran AI, tidak pernah menimpa aset tanpa pilihan pemilik. */
'use strict';
const aiKinds=['phone','electronics','car','bike','house'];
const aiConditions=[['good','Baik / terawat'],['new','Seperti baru'],['fair','Cukup / pemakaian wajar'],['poor','Perlu perbaikan']];
function aiAssetSignature(a){return JSON.stringify([a.kind,a.name,a.land,a.building,a.amount,a.purchasePrice,a.acquiredAt,a.direction,a.annualRate,a.valuationMode,a.landRate,a.buildingRate,a.deviceType])}
function aiSuggestion(a){return a.aiValuation&&a.aiValuation.signature===aiAssetSignature(a)?a.aiValuation:null}
function aiSelectedValue(a){
 if(!aiKinds.includes(a.kind))return null;
 if(a.valuationSource==='user'&&number(a.ownerValue))return a.ownerValue;
 if(a.valuationSource==='ai'&&aiSuggestion(a)&&a.aiValuation.method!=='fallback')return a.aiValuation.amount;
 return null;
}
function aiValueLabel(a){return a.valuationSource==='user'?'Nilai pilihan Anda':a.valuationSource==='ai'?'Saran AI yang Anda setujui':'Proyeksi otomatis'}
function aiBaseValue(a){const info=valuationInfo(a);return info?info.current:(a.kind==='house'?a.land+a.building:a.amount)}
// GET ini hanya memeriksa binding, tanpa memanggil model atau menghabiskan Neurons.
async function checkAIConnection(probe=false){
 const status=$('aiConnectionStatus'),button=$('aiCheck');if(!status||!button)return;
 button.disabled=true;status.classList.remove('aiProblem');
 status.textContent=probe?'Menguji model AI sungguhan…':'Memeriksa versi backend dan binding AI…';
 try{
  const result=await api('/api/ai/status',{signal:AbortSignal.timeout(15000)});
  if(result.version!=='v11-2026-11-16'){
   status.classList.add('aiProblem');
   status.textContent='Backend AI lama masih aktif! Pastikan src/worker.js dan src/valuation-ai.js versi V11 telah dideploy di Cloudflare Production.';
   return;
  }
  if(!result.configured){
   status.classList.add('aiProblem');
   status.textContent='Binding Workers AI (AI) belum aktif di Production. Tambahkan binding lalu deploy ulang.';
   return;
  }
  if(!probe){status.textContent='Backend V11 dan binding AI terdeteksi. Klik Uji AI sungguhan untuk memastikan model dapat menjawab.';return;}
  const tested=await api('/api/ai/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(45000)});
  status.textContent='AI BERHASIL: '+(tested.model||'model tersedia')+' menjawab dengan JSON valid. Saran AI siap diuji pada aset.';
 }catch(e){
  status.classList.add('aiProblem');
  status.textContent='Gagal menguji AI: '+(e.name==='TimeoutError'||e.name==='AbortError'?'waktu koneksi habis':e.message);
 }finally{button.disabled=false}
}
function renderAIValuations(){
 const node=$('aiValuationList');if(!node)return;
 const assets=state.assets.filter(a=>aiKinds.includes(a.kind));
 node.innerHTML=assets.length?assets.map(a=>{
  const advice=aiSuggestion(a),base=aiBaseValue(a),my=number(a.ownerValue)?a.ownerValue:null;
  const using=a.valuationSource==='user'?'user':a.valuationSource==='ai'&&advice&&advice.method!=='fallback'?'ai':'projection';
  const current=using==='user'?my:using==='ai'?advice.amount:base;
  const aiDate=advice?new Date(advice.asOf).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}):null;
  const stale=advice&&Date.now()-Date.parse(advice.asOf)>7*86400000;
  const aiIsFallback=advice?.method==='fallback';
  const detected=advice?.identity;
  const identityText=detected?[detected.brand,detected.model,detected.variant,detected.year,detected.transmission,detected.storageGB?detected.storageGB+'GB':null].filter(Boolean).join(' · '):'';
  const links=advice?.marketSources?.slice(0,5).map((s,i)=>'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">Sumber '+(i+1)+' · '+money(s.price)+' · '+esc(s.title)+'</a>').join('<br>')||'';
  return '<article class="aiAsset"><div class="aiAssetTitle"><div><b>'+esc(a.name)+'</b><small>'+esc(categories[a.kind][0])+' · Dipakai: '+esc(using==='user'?'Nilai Anda':using==='ai'?'Saran AI':'Model otomatis')+'</small></div><strong>'+money(current)+'</strong></div>'+
    '<div class="aiThree"><div class="'+(using==='projection'?'aiChosen':'')+'"><small>PROYEKSI ARUNIKA</small><b>'+money(base)+'</b><span>Harga dasar & waktu</span></div><div class="'+(using==='user'?'aiChosen':'')+'"><small>NILAI DARI ANDA</small><b>'+(my===null?'Belum diisi':money(my))+'</b><span>Penilaian pribadi</span></div><div class="'+(using==='ai'?'aiChosen':'')+'"><small>'+(aiIsFallback?'PROYEKSI CADANGAN (BUKAN AI)':'SARAN AI')+'</small><b>'+(advice?money(advice.amount):'Belum diminta')+'</b><span>'+(advice?'Rentang '+money(advice.lower)+' – '+money(advice.upper):'Klik Minta saran AI')+'</span></div></div>'+
    (advice?'<p class="aiReason">'+(aiIsFallback?'<b>AI sedang tidak tersedia; bukan hasil AI.</b><br>':'')+(identityText?'<b>Terdeteksi: '+esc(identityText)+'</b><br>':'')+esc(advice.reason)+'<br><small>Keyakinan '+esc(advice.confidence)+' · '+esc(advice.sourceType==='hasil-penelusuran'?'Cuplikan penawaran pasar (belum terverifikasi)':advice.sourceType==='input-pengguna'?'Harga pembanding dari Anda (belum diverifikasi)':'Tanpa data pasar terkini')+' · '+esc(aiDate)+(stale?' · Perlu diperbarui':'')+'</small>'+(advice.comparablePrices?.length?'<br><small>Harga acuan pengguna: '+advice.comparablePrices.map(money).join(' · ')+'</small>':'')+(advice.sourceUrl?'<br><a href="'+esc(advice.sourceUrl)+'" target="_blank" rel="noopener noreferrer">Link harga dari Anda (belum diverifikasi)</a>':'')+(advice.marketNote?'<br><small>'+esc(advice.marketNote)+'</small>':'')+(links?'<div class="aiMarketLinks">'+links+'</div>':'')+'</p>':'')+
    '<div class="aiActions"><button type="button" class="soft" data-ai="owner" data-id="'+esc(a.id)+'">Isi nilai saya</button><button type="button" class="soft" data-ai="estimate" data-id="'+esc(a.id)+'">'+(advice?'Perbarui saran AI':'Minta saran AI')+'</button>'+
    (using!=='projection'?'<button type="button" class="soft" data-ai="projection" data-id="'+esc(a.id)+'">Gunakan proyeksi</button>':'')+
    (my!==null&&using!=='user'?'<button type="button" class="soft" data-ai="use-owner" data-id="'+esc(a.id)+'">Pakai nilai saya</button>':'')+
    (advice&&!aiIsFallback&&using!=='ai'?'<button type="button" class="soft" data-ai="use-ai" data-id="'+esc(a.id)+'">Pakai nilai AI</button>':'')+'</div></article>';
 }).join(''):'<p class="hint">Belum ada rumah, kendaraan, HP, atau elektronik. Tambahkan salah satu aset tersebut untuk memulai perbandingan nilai.</p>';
}
function setupAIValuations(){
 $('aiCheck').onclick=()=>checkAIConnection(true);
 $('aiValuationList').onclick=async e=>{
  const btn=e.target.closest('button[data-ai]');if(!btn)return;
  const a=state.assets.find(item=>item.id===btn.dataset.id&&aiKinds.includes(item.kind));if(!a)return;
  const action=btn.dataset.ai;
  if(action==='owner'){
   modal('Nilai pribadi · '+a.name,num('ownerValue','Nilai menurut Anda sekarang (Rp)',a.ownerValue??Math.round(aiBaseValue(a)))+'<p class="hint">Jika nilai ini belum dipilih sebagai sumber, kekayaan bersih tidak berubah. Jika nilai Anda sudah dipakai, perubahan ini memperbarui kekayaan bersih.</p>',async form=>{
    const ownerValue=Number(form.get('ownerValue'));
    await commit({...state,assets:state.assets.map(item=>item.id===a.id?{...item,ownerValue}:item)});
   });return;
  }
  if(action==='estimate'){
   modal('Saran AI · '+a.name,
    label('Nama dan spesifikasi barang','<input name="itemName" id="aiItemName" maxlength="90" required value="'+esc(a.name)+'" placeholder="Contoh: Toyota Fortuner 2012 MT / iPhone 18 Pro 512 GB">')+
    '<div id="aiDetected" class="aiDetected" role="status">Mendeteksi model dan varian…</div>'+ 
    label('Kondisi aset' ,'<select name="condition">'+opts(aiConditions,a.aiValuation?.condition||'good')+'</select>')+
    '<p class="hint">Opsional: masukkan 1–3 harga aset sejenis yang Anda temukan. Mode gratis tidak mencari harga di internet; semua link dan harga dari Anda belum diverifikasi.</p>'+
    [1,2,3].map(n=>label('Harga pembanding '+n+' (Rp, opsional)','<input name="comp'+n+'" type="number" inputmode="numeric" min="1" max="1000000000000000" step="1" placeholder="Contoh: 4500000">')).join('')+
    label('Link sumber harga (opsional)','<input name="sourceUrl" type="url" maxlength="300" placeholder="https://...">')+
    label('Keterangan kondisi / spesifikasi (opsional)','<textarea name="note" maxlength="180" rows="2" placeholder="Contoh: baterai 85%, garansi habis, layar mulus"></textarea>')+
    label('Sumber data penilaian', '<select name="marketMode" id="marketMode"><option value="free">Gratis: AI + proyeksi (tanpa pencarian pasar)</option><option value="live">Cari penawaran terbaru (AI Gateway credits / mungkin berbayar)</option></select>')+
    '<div id="marketConsentWrap" hidden><label class="aiConsent"><input type="checkbox" name="consentPaidSearch" value="yes"> Saya setuju satu pencarian berpotensi dikenai biaya AI Gateway. Wajib diaktifkan pemilik situs.</label></div>'+ 
    '<p class="hint">AI mengenali nama/varian. Untuk penawaran terkini perlu AI Gateway credits; hasil pencarian merupakan harga iklan, bukan harga transaksi. Jika AI gagal, proyeksi cadangan ditandai jelas dan tidak bisa dipakai sebagai nilai AI.</p>',async form=>{
     const comparables=[1,2,3].map(i=>form.get('comp'+i)).filter(Boolean).map(Number);
     const marketMode=form.get('marketMode')||'free';
     if(marketMode==='live'&&form.get('consentPaidSearch')!=='yes')throw Error('Centang persetujuan biaya pencarian pasar terlebih dahulu.');
     const payload={assetId:a.id,itemName:(form.get('itemName')||'').trim(),marketMode,consentPaidSearch:marketMode==='live',condition:form.get('condition'),comparables,sourceUrl:(form.get('sourceUrl')||'').trim(),note:(form.get('note')||'').trim()};
     if(comparables.some(v=>!Number.isSafeInteger(v)||v<=0))throw Error('Harga pembanding harus angka rupiah bulat positif.');
     $('save').disabled=true;$('save').textContent='AI sedang menganalisis…';
     try{
      const {advice}=await api('/api/ai/estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)});
      const current=state.assets.find(item=>item.id===a.id);
      if(!current||aiAssetSignature(current)!==aiAssetSignature(a))throw Error('Aset berubah selama proses AI. Ulangi penilaian.');
      if(advice.method==='fallback'&&current.valuationSource==='ai'){
       $('syncStatus').textContent='AI belum merespons. Nilai AI yang pernah Anda setujui tetap dipertahankan; tidak ada perubahan data.';
       return;
      }
      await commit({...state,assets:state.assets.map(item=>item.id===a.id?{...item,aiValuation:advice}:item)});
     }catch(err){if(err.name==='TimeoutError'||err.name==='AbortError')throw Error('Permintaan AI terlalu lama. Coba kembali; jika berulang periksa Workers AI di Cloudflare.');throw err}
     finally{$('save').disabled=false;$('save').textContent='Hitung dengan AI'}
    },'Hitung dengan AI');
    const modeEl=$('marketMode'),consentEl=$('marketConsentWrap'),nameEl=$('aiItemName'),detected=$('aiDetected');
    modeEl.onchange=()=>{consentEl.hidden=modeEl.value!=='live'};
    let job=0;nameEl.oninput=()=>{const ticket=++job;detected.textContent='Mendeteksi spesifikasi…';setTimeout(async()=>{if(ticket!==job||!nameEl.isConnected)return;try{const r=await api('/api/ai/identify?kind='+encodeURIComponent(a.kind)+'&name='+encodeURIComponent(nameEl.value),{signal:AbortSignal.timeout(7000)});if(ticket!==job||!nameEl.isConnected)return;const x=r.identity;detected.textContent='Terbaca: '+[x.brand,x.model,x.variant,x.year,x.transmission,x.storageGB?x.storageGB+' GB':null].filter(Boolean).join(' · ')+(x.matchLevel==='kurang'?' · Tambahkan merek/model/tahun/varian agar pencarian akurat':'')+' · Belum diverifikasi sebagai model resmi.'}catch{if(ticket===job)detected.textContent='Deteksi sementara tidak tersedia; estimasi tetap bisa dijalankan.'}},300)};
    nameEl.dispatchEvent(new Event('input'));return;
  }
  let source;
  if(action==='projection')source='projection';
  if(action==='use-owner'&&number(a.ownerValue))source='user';
  if(action==='use-ai'&&aiSuggestion(a)&&aiSuggestion(a).method!=='fallback')source='ai';
  if(!source)return;
  const name=source==='ai'?'estimasi AI':source==='user'?'nilai Anda':'proyeksi Arunika';
  modal('Pilih sumber penilaian','<p>Gunakan <b>'+esc(name)+'</b> untuk menghitung nilai '+esc(a.name)+' dan kekayaan bersih?</p><p class="hint">Hanya sumber penilaian untuk aset ini yang berubah. Nilai lain tetap tersimpan, dan Anda dapat menggantinya kembali.</p>',()=>commit({...state,assets:state.assets.map(item=>item.id===a.id?{...item,valuationSource:source}:item)}),'Ya, pakai nilai ini');
 };
}
