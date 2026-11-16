import {hashPassword} from '../src/auth.js';
import {writeFileSync} from 'node:fs';
if(!process.stdin.isTTY)throw Error('Jalankan dari terminal interaktif.');
process.stdout.write('Password baru (minimal 14 karakter, tidak ditampilkan): ');
process.stdin.setRawMode(true);process.stdin.resume();let password='';
process.stdin.on('data',chunk=>{for(const c of chunk.toString()){
 if(c==='\u0003'){process.stdin.setRawMode(false);process.exit(1)}
 if(c==='\r'||c==='\n'){
 process.stdin.setRawMode(false);process.stdin.pause();
 if(password.length<14||password.length>128){console.error('\nPanjang password harus 14–128 karakter.');process.exit(1)}
 writeFileSync('password-hash.txt',hashPassword(password)+'\n',{mode:0o600});console.log('\nHash tersimpan di password-hash.txt. Jangan unggah file ini ke GitHub.');process.exit(0);
 }else if(c==='\u007f')password=password.slice(0,-1);else if(c>=' ')password+=c;
}});
