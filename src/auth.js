import {scryptSync, timingSafeEqual, randomBytes, createHash} from 'node:crypto';
export const digest = s => createHash('sha256').update(s).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export function hashPassword(password, salt=randomBytes(16).toString('hex')) {
 return `scrypt$${salt}$${scryptSync(password,salt,32,{N:16384,r:8,p:5,maxmem:32*1024*1024}).toString('hex')}`;
}
export function verifyPassword(password, hash) {
 if(!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(hash||''))throw Error('Invalid password configuration');
 const actual=hashPassword(password,hash.split('$')[1]).split('$')[2];
 return timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(hash.split('$')[2],'hex'));
}
export function credentialVersion(env){return digest(env.AUTH_USERNAME+'|'+env.AUTH_PASSWORD_HASH)}
