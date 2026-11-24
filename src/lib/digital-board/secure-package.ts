import type {BoardSnapshot} from "./model";
export const MAX_PACKAGE_BYTES=32*1024*1024;
export function hex(bytes:Uint8Array){return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");}
export function randomKey(){return hex(crypto.getRandomValues(new Uint8Array(32)));}
export async function encryptBoard(snapshot:BoardSnapshot,keyHex:string){
 if(!/^[0-9a-f]{64}$/i.test(keyHex))throw new Error("مفتاح الاقتران غير صالح");
 const raw=new Uint8Array(keyHex.match(/../g)!.map(x=>parseInt(x,16)));
 const key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt"]);
 const payload=new TextEncoder().encode(JSON.stringify(snapshot));
 if(payload.length>MAX_PACKAGE_BYTES)throw new Error("حجم الحزمة يتجاوز 32 ميغابايت");
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode("ecolearchive-board-v2")},key,payload));
 const envelope=new Uint8Array(12+ciphertext.length);envelope.set(iv);envelope.set(ciphertext,12);
 return {bytes:envelope,sha256:hex(new Uint8Array(await crypto.subtle.digest("SHA-256",envelope)))};
}
