use std::{net::{UdpSocket,Ipv4Addr},time::{Duration,Instant},sync::Mutex,fs};
use serde::{Serialize,Deserialize};
use serde_json::{json,Value};
use rand::{RngCore,rngs::OsRng};
use sha2::{Sha256,Digest};
use hmac::{Hmac,Mac};
use p256::{ecdh::EphemeralSecret,PublicKey,elliptic_curve::sec1::ToEncodedPoint};
use aes_gcm::{Aes256Gcm,KeyInit,aead::{Aead,Payload},Nonce};
use tauri::Manager;
use base64::{Engine,engine::general_purpose::STANDARD as B64};
type H=Hmac<Sha256>;
fn digest(parts:&[&[u8]])->Vec<u8>{let mut h=Sha256::new();for p in parts{h.update(p);}h.finalize().to_vec()}
fn mac(key:&[u8],data:&[u8])->Vec<u8>{let mut h=<H as Mac>::new_from_slice(key).expect("HMAC key");h.update(data);h.finalize().into_bytes().to_vec()}
fn verify(key:&[u8],data:&[u8],tag:&[u8])->bool{let mut h=<H as Mac>::new_from_slice(key).expect("HMAC key");h.update(data);h.verify_slice(tag).is_ok()}
fn random()->[u8;32]{let mut x=[0;32];OsRng.fill_bytes(&mut x);x}
fn err(e:impl std::fmt::Display)->String{e.to_string()}
#[derive(Clone,Serialize,Deserialize)] pub struct Device {id:String,name:String,ip:String}
#[derive(Serialize,Deserialize)] struct Pair {device:Device,key:String}
struct Pending {device:Device,secret:Vec<u8>,code:String,session:String,expires:Instant}
#[derive(Default)] pub struct PairState(Mutex<Option<Pending>>);
fn client()->Result<reqwest::blocking::Client,String>{reqwest::blocking::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(20)).build().map_err(err)}
fn url(ip:&str,path:&str)->Result<String,String>{let ip:Ipv4Addr=ip.parse().map_err(err)?;if !ip.is_private(){return Err("Private IPv4 required".into());}Ok(format!("http://{}:8766/board/{}",ip,path))}
fn post(ip:&str,path:&str,v:Value)->Result<Value,String>{let r=client()?.post(url(ip,path)?).json(&v).send().map_err(err)?.error_for_status().map_err(err)?;if r.content_length().unwrap_or(0)>65536{return Err("Response too large".into());}r.json().map_err(err)}
fn un64(v:&Value,k:&str)->Result<Vec<u8>,String>{B64.decode(v[k].as_str().ok_or("Missing field")?).map_err(err)}
fn text(v:&Value,k:&str)->Result<String,String>{v[k].as_str().map(str::to_owned).ok_or_else(||"Missing field".into())}
fn discover()->Result<Vec<Device>,String>{
 let sock=UdpSocket::bind("0.0.0.0:0").map_err(err)?;sock.set_broadcast(true).map_err(err)?;sock.set_read_timeout(Some(Duration::from_millis(250))).map_err(err)?;
 let challenge=B64.encode(random());let request=format!("TABSI_BOARD_DISCOVER_V3 {}",challenge);
 sock.send_to(request.as_bytes(),"255.255.255.255:8767").map_err(err)?;
 let mut out:Vec<Device>=vec![];let end=Instant::now()+Duration::from_secs(3);let mut buf=[0u8;2048];
 while Instant::now()<end{if let Ok((n,addr))=sock.recv_from(&mut buf){if let std::net::IpAddr::V4(ip)=addr.ip(){if !ip.is_private(){continue;}if let Ok(v)=serde_json::from_slice::<Value>(&buf[..n]){if v["challenge"].as_str()!=Some(challenge.as_str()){continue;}if let (Ok(id),Ok(name))=(text(&v,"id"),text(&v,"name")){if id.len()<=100&&name.len()<=200&&!out.iter().any(|d|d.id==id&&d.ip==ip.to_string()){out.push(Device{id,name,ip:ip.to_string()});}}}}}}
 Ok(out)
}
#[tauri::command] pub async fn board_discover()->Result<Vec<Device>,String>{tauri::async_runtime::spawn_blocking(discover).await.map_err(err)?}
fn path(app:&tauri::AppHandle)->Result<std::path::PathBuf,String>{let p=app.path().app_data_dir().map_err(err)?;fs::create_dir_all(&p).map_err(err)?;Ok(p.join("board-pair-v3.dpapi"))}
#[cfg(windows)] fn protect(bytes:&[u8],decrypt:bool)->Result<Vec<u8>,String>{
 use windows_sys::Win32::Security::Cryptography::{CRYPT_INTEGER_BLOB,CryptProtectData,CryptUnprotectData,CRYPTPROTECT_UI_FORBIDDEN};use windows_sys::Win32::Foundation::LocalFree;
 let mut input=CRYPT_INTEGER_BLOB{cbData:bytes.len() as u32,pbData:bytes.as_ptr() as *mut u8};let mut output=CRYPT_INTEGER_BLOB{cbData:0,pbData:std::ptr::null_mut()};
 let ok=unsafe{if decrypt{CryptUnprotectData(&mut input,std::ptr::null_mut(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),CRYPTPROTECT_UI_FORBIDDEN,&mut output)}else{CryptProtectData(&mut input,std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),std::ptr::null_mut(),CRYPTPROTECT_UI_FORBIDDEN,&mut output)}};
 if ok==0{return Err("DPAPI failed".into());}let result=unsafe{std::slice::from_raw_parts(output.pbData,output.cbData as usize).to_vec()};unsafe{LocalFree(output.pbData as *mut core::ffi::c_void)};Ok(result)
}
#[cfg(not(windows))] fn protect(_: &[u8],_:bool)->Result<Vec<u8>,String>{Err("Requires Windows".into())}
fn load(app:&tauri::AppHandle)->Result<Option<Pair>,String>{let p=path(app)?;if !p.exists(){return Ok(None);}let data=protect(&fs::read(p).map_err(err)?,true)?;serde_json::from_slice(&data).map(Some).map_err(err)}
#[tauri::command] pub fn board_paired(app:tauri::AppHandle)->Result<Option<Device>,String>{Ok(load(&app)?.map(|p|p.device))}
#[tauri::command] pub fn board_unpair(app:tauri::AppHandle)->Result<(),String>{let p=path(&app)?;if p.exists(){fs::remove_file(&p).map_err(err)?;}let receipt=p.with_file_name("board-receipt-v3.dpapi");if receipt.exists(){fs::remove_file(receipt).map_err(err)?;}Ok(())}
#[tauri::command] pub async fn board_pair_begin(app:tauri::AppHandle,device:Device)->Result<(),String>{tauri::async_runtime::spawn_blocking(move||{
 let sk=EphemeralSecret::random(&mut OsRng);let pk=sk.public_key().to_encoded_point(false);let nonce=random();let commit=digest(&[b"tabsi-pair-v3",pk.as_bytes(),&nonce]);
 let response=post(&device.ip,"pair/start",json!({"commit":B64.encode(commit)}))?;
 let tvpk=un64(&response,"public")?;let tvnonce=un64(&response,"nonce")?;let session=text(&response,"session")?;
 if tvnonce.len()!=32||tvpk.len()!=65||session.len()>100{return Err("Invalid pairing response".into());}
 let tvpub=PublicKey::from_sec1_bytes(&tvpk).map_err(err)?;
 let transcript=digest(&[b"tabsi-pair-v3",pk.as_bytes(),&nonce,&tvpk,&tvnonce,session.as_bytes()]);
 let shared=sk.diffie_hellman(&tvpub);let secret=mac(shared.raw_secret_bytes().as_slice(),&transcript);
 let sas=mac(&secret,b"sas");let code=format!("{:06}",u32::from_be_bytes(sas[..4].try_into().unwrap())%1_000_000);
 post(&device.ip,"pair/reveal",json!({"session":session,"public":B64.encode(pk.as_bytes()),"nonce":B64.encode(nonce)}))?;
 let state=app.state::<PairState>();*state.0.lock().map_err(err)?=Some(Pending{device,secret,code,session,expires:Instant::now()+Duration::from_secs(120)});Ok(())
 }).await.map_err(err)?}
#[tauri::command] pub async fn board_pair_finish(app:tauri::AppHandle,code:String)->Result<Device,String>{tauri::async_runtime::spawn_blocking(move||{
 let state=app.state::<PairState>();let p=state.0.lock().map_err(err)?.take().ok_or("Start pairing first")?;
 if Instant::now()>p.expires||p.code!=code{return Err("Incorrect or expired pairing code; restart pairing".into());}
 let proof=mac(&p.secret,b"pc-confirm");let r=match post(&p.device.ip,"pair/finish",json!({"session":p.session,"proof":B64.encode(proof)})){Ok(v)=>v,Err(e)=>{*state.0.lock().map_err(err)?=Some(p);return Err(e);}};
 if !verify(&p.secret,b"tv-confirm",&un64(&r,"proof")?){return Err("Invalid device confirmation".into());}
 let key=mac(&p.secret,b"board-master-v3");let pair=Pair{device:p.device.clone(),key:B64.encode(key)};
 let encrypted=protect(&serde_json::to_vec(&pair).map_err(err)?,false)?;fs::write(path(&app)?,encrypted).map_err(err)?;Ok(p.device)
 }).await.map_err(err)?}
#[derive(Clone,Serialize,Deserialize)] pub struct Receipt{revision:String,sha256:String,activated:bool,device_id:String,at:u64}
#[tauri::command] pub fn board_last_receipt(app:tauri::AppHandle)->Result<Option<Receipt>,String>{let p=path(&app)?.with_file_name("board-receipt-v3.dpapi");if !p.exists(){return Ok(None);}let bytes=protect(&fs::read(p).map_err(err)?,true)?;serde_json::from_slice(&bytes).map(Some).map_err(err)}
#[tauri::command] pub async fn board_push(app:tauri::AppHandle,ip:Option<String>)->Result<Receipt,String>{tauri::async_runtime::spawn_blocking(move||{
 let pair=load(&app)?.ok_or("Pair device first")?;let ip=ip.unwrap_or(pair.device.ip);
 // Read only the persisted, approved board record, not a caller-supplied snapshot.
 let conn=super::connect(&app)?;let raw:String=conn.query_row("SELECT payload FROM records WHERE collection='digitalBoard' AND id='board'",[],|r|r.get(0)).map_err(err)?;
 let value:Value=serde_json::from_str(&raw).map_err(err)?;let snapshot=value.get("approved").filter(|v|v.is_object()).ok_or("No approved board")?;
 let revision=text(snapshot,"revision")?;let plain=serde_json::to_vec(snapshot).map_err(err)?;if plain.len()>32*1024*1024{return Err("Package too large".into());}
 let master=B64.decode(pair.key).map_err(err)?;let enc=mac(&master,b"aes");let ack=mac(&master,b"ack");
 let cipher=Aes256Gcm::new_from_slice(&enc).map_err(err)?;let mut iv=[0;12];OsRng.fill_bytes(&mut iv);
 let encrypted=cipher.encrypt(Nonce::from_slice(&iv),Payload{msg:&plain,aad:b"ecolearchive-board-v2"}).map_err(|_|"Encryption failed")?;
 let mut blob=iv.to_vec();blob.extend(encrypted);let hash=format!("{:x}",Sha256::digest(&blob));
 let r=post(&ip,"push",json!({"revision":revision,"sha256":hash,"blob":B64.encode(blob)}))?;
 let expected=format!("activated\n{}\n{}",revision,hash);
 if r["revision"].as_str()!=Some(revision.as_str())||r["sha256"].as_str()!=Some(hash.as_str())||!verify(&ack,expected.as_bytes(),&un64(&r,"proof")?){return Err("No authenticated activation receipt".into());}
 let receipt=Receipt{revision,sha256:hash,activated:true,device_id:pair.device.id,at:std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(err)?.as_secs()};let file=path(&app)?.with_file_name("board-receipt-v3.dpapi");fs::write(file,protect(&serde_json::to_vec(&receipt).map_err(err)?,false)?).map_err(err)?;Ok(receipt)
 }).await.map_err(err)?}

#[cfg(test)] mod tests {use super::*;#[test] fn authenticated_receipt_rejects_changes(){let key=[7u8;32];let tag=mac(&key,b"activated\nr1\nhash");assert!(verify(&key,b"activated\nr1\nhash",&tag));assert!(!verify(&key,b"activated\nr2\nhash",&tag));assert!(!verify(&[8;32],b"activated\nr1\nhash",&tag));}#[test] fn encrypted_payload_rejects_tampering(){let key=[7u8;32];let cipher=Aes256Gcm::new_from_slice(&key).unwrap();let nonce=[4u8;12];let mut data=cipher.encrypt(Nonce::from_slice(&nonce),Payload{msg:b"demo",aad:b"ecolearchive-board-v2"}).unwrap();assert_eq!(cipher.decrypt(Nonce::from_slice(&nonce),Payload{msg:&data,aad:b"ecolearchive-board-v2"}).unwrap(),b"demo");data[0]^=1;assert!(cipher.decrypt(Nonce::from_slice(&nonce),Payload{msg:&data,aad:b"ecolearchive-board-v2"}).is_err());}}
