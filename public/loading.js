'use strict';
(()=>{
 const el=id=>document.getElementById(id),box=el('loading');if(!box)return;
 let timer,finished=false;
 function stage(n,message){if(finished)return;el('loadingFill').style.width=n+'%';el('loadingBar').setAttribute('aria-valuenow',String(n));el('loadingMessage').textContent=message;el('loadingStep').textContent=n===100?'Selesai':n<35?'Tahap 1 dari 4':n<72?'Tahap 2 dari 4':n<95?'Tahap 3 dari 4':'Tahap 4 dari 4'}
 function fail(message){if(finished)return;clearTimeout(timer);box.hidden=false;box.classList.add('isError');el('loadingHeading').textContent='Mari sambungkan kembali.';el('loadingMessage').textContent=message;el('loadingStep').textContent='Perlu diperiksa';el('loadingActions').hidden=false;el('loadingBar').setAttribute('aria-valuetext','Pemuatan terhenti');}
 function start(message='Menyiapkan ruang pribadi Anda…'){finished=false;clearTimeout(timer);box.hidden=false;box.classList.remove('isError');el('loadingActions').hidden=true;el('loadingHeading').textContent='Selangkah menuju tenang.';el('loadingBar').removeAttribute('aria-valuetext');stage(12,message);timer=setTimeout(()=>fail('Pemuatan belum selesai. Periksa koneksi lalu coba lagi. Jika berulang, periksa deployment dan konfigurasi server.'),25000)}
 function done(){clearTimeout(timer);stage(100,'Portofolio siap ditampilkan.');finished=true;box.hidden=true}
 async function read(response){if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Backend belum aktif atau respons server tidak sesuai. Untuk paket v4, gunakan build npm run build dan output dist di Cloudflare Pages.');try{return await response.json()}catch{throw Error('Respons server tidak dapat dibaca. Coba kembali.')}}
 el('loadingRetry').onclick=()=>location.reload();
 window.ArunoLoad={stage,fail,start,done,read};
 window.addEventListener('error',e=>{if(!box.hidden)fail('Komponen aplikasi gagal dimuat. Muat ulang halaman; jika berulang, pastikan semua file v4 telah diunggah dan build terbaru berhasil.')},true);
 if(!box.hidden)start();
})();
