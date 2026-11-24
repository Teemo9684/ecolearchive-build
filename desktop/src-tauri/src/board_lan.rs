use std::{io::{Read,Write},net::{Ipv4Addr,TcpListener,TcpStream},sync::{Mutex,Arc,atomic::{AtomicBool,Ordering}},thread,time::Duration};
use serde::Serialize;
use sha2::{Digest,Sha256};
use base64::Engine;
#[derive(Default)]
pub struct BoardLan(pub Mutex<Option<Server>>);
pub struct Server { stop:Arc<AtomicBool>, handle:thread::JoinHandle<()>, address:String }
#[derive(Serialize)]
pub struct Status { address:String, running:bool }
fn stop_server(server:Server){server.stop.store(true,Ordering::Release);let _=server.handle.join();}
impl Drop for BoardLan {fn drop(&mut self){if let Ok(slot)=self.0.get_mut(){if let Some(server)=slot.take(){stop_server(server);}}}}
fn reply(stream:&mut TcpStream,status:&str,kind:&str,body:&[u8]){
 let header=format!("HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",status,kind,body.len());
 let _=stream.write_all(header.as_bytes()).and_then(|_|stream.write_all(body));
}
fn serve(mut stream:TcpStream,peer:Ipv4Addr,manifest:&[u8],payload:&[u8]){
 if stream.peer_addr().ok().map(|a|a.ip())!=Some(std::net::IpAddr::V4(peer)){return;}
 let _=stream.set_read_timeout(Some(Duration::from_secs(2)));let _=stream.set_write_timeout(Some(Duration::from_secs(10)));
 let mut request=[0u8;4096];let mut used=0;
 while used<request.len(){match stream.read(&mut request[used..]){Ok(0)|Err(_)=>return,Ok(n)=>{used+=n;if request[..used].windows(4).any(|w|w==b"\r\n\r\n"){break;}}}}
 let first=std::str::from_utf8(&request[..used]).unwrap_or("").lines().next().unwrap_or("");
 match first {"GET /tv/v2/manifest.json HTTP/1.1"|"GET /tv/v2/manifest.json HTTP/1.0"=>reply(&mut stream,"200 OK","application/json",manifest),"GET /tv/v2/snapshot.bin HTTP/1.1"|"GET /tv/v2/snapshot.bin HTTP/1.0"=>reply(&mut stream,"200 OK","application/octet-stream",payload),_=>reply(&mut stream,"404 Not Found","text/plain",b"Not found")}
}
#[tauri::command]
pub fn board_lan_start(state:tauri::State<'_,BoardLan>,bind_ip:String,tv_ip:String,port:u16,encrypted:String,revision:String)->Result<Status,String>{
 let ip:Ipv4Addr=bind_ip.parse().map_err(|_|"Invalid PC IP")?;let peer:Ipv4Addr=tv_ip.parse().map_err(|_|"Invalid TV IP")?;
 if !ip.is_private()||!peer.is_private()||ip==peer||port<1024||revision.is_empty()||revision.len()>100{return Err("Use distinct private IPv4 addresses and port >= 1024".into());}
 if encrypted.len()>46*1024*1024{return Err("Package too large".into());}
 let payload=base64::engine::general_purpose::STANDARD.decode(encrypted).map_err(|_|"Invalid encrypted package")?;
 if payload.len()<28||payload.len()>32*1024*1024+28{return Err("Invalid package length".into());}
 let manifest=serde_json::to_vec(&serde_json::json!({"protocol":2,"revision":revision,"sha256":format!("{:x}",Sha256::digest(&payload)),"bytes":payload.len(),"cipher":"AES-256-GCM"})).map_err(|e|e.to_string())?;
 let mut slot=state.0.lock().map_err(|_|"Server state unavailable")?;
 if let Some(old)=slot.take(){stop_server(old);}
 let listener=TcpListener::bind((ip,port)).map_err(|e|e.to_string())?;listener.set_nonblocking(true).map_err(|e|e.to_string())?;
 let stop=Arc::new(AtomicBool::new(false));let flag=stop.clone();let address=format!("http://{}:{}",ip,port);
 let handle=thread::spawn(move||{while !flag.load(Ordering::Acquire){match listener.accept(){Ok((stream,_))=>serve(stream,peer,&manifest,&payload),Err(e) if e.kind()==std::io::ErrorKind::WouldBlock=>thread::sleep(Duration::from_millis(50)),Err(_)=>break}}});
 *slot=Some(Server{stop,handle,address:address.clone()});Ok(Status{address,running:true})
}
#[tauri::command]
pub fn board_lan_stop(state:tauri::State<'_,BoardLan>)->Result<(),String>{let mut slot=state.0.lock().map_err(|_|"Server state unavailable")?;if let Some(server)=slot.take(){stop_server(server);}Ok(())}
#[tauri::command]
pub fn board_lan_status(state:tauri::State<'_,BoardLan>)->Result<Status,String>{let slot=state.0.lock().map_err(|_|"Server state unavailable")?;Ok(match slot.as_ref(){Some(s) if !s.handle.is_finished()=>Status{address:s.address.clone(),running:true},_=>Status{address:String::new(),running:false}})}
