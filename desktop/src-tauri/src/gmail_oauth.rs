//! Desktop-only Google OAuth: system browser, PKCE, loopback, DPAPI at rest.
use serde::{Deserialize,Serialize};
use std::{fs,io::{Read,Write},net::TcpListener,time::{Duration,Instant}};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD,Engine};
use rand::RngCore;
use sha2::{Sha256,Digest};
use tauri::Manager;
#[derive(Serialize,Deserialize)]
struct Account { email:String, refresh_token:String, client_id:String }
#[derive(Deserialize)]
struct TokenResponse { access_token:String, refresh_token:Option<String> }
fn account_path(app:&tauri::AppHandle)->Result<std::path::PathBuf,String>{
 let dir=app.path().app_data_dir().map_err(|e|e.to_string())?;
 fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
 Ok(dir.join("gmail-account.dpapi"))
}
#[cfg(windows)]
fn protect(bytes:&[u8],decrypt:bool)->Result<Vec<u8>,String>{
 use windows_sys::Win32::Security::Cryptography::{DATA_BLOB,CryptProtectData,CryptUnprotectData,CRYPTPROTECT_UI_FORBIDDEN};
 use windows_sys::Win32::Foundation::LocalFree;
 let mut input=DATA_BLOB{cbData:bytes.len() as u32,pbData:bytes.as_ptr() as *mut u8};
 let mut output=DATA_BLOB{cbData:0,pbData:std::ptr::null_mut()};
 let ok=unsafe{if decrypt{CryptUnprotectData(&mut input,std::ptr::null_mut(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),CRYPTPROTECT_UI_FORBIDDEN,&mut output)}else{CryptProtectData(&mut input,std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),std::ptr::null_mut(),CRYPTPROTECT_UI_FORBIDDEN,&mut output)}};
 if ok==0{return Err("تعذر حماية بيانات Gmail باستخدام Windows".into())}
 let result=unsafe{std::slice::from_raw_parts(output.pbData,output.cbData as usize).to_vec()};
 unsafe{LocalFree(output.pbData as *mut core::ffi::c_void)};
 Ok(result)
}
#[cfg(not(windows))]
fn protect(_bytes:&[u8],_decrypt:bool)->Result<Vec<u8>,String>{Err("Requires Windows".into())}
fn load(app:&tauri::AppHandle)->Result<Option<Account>,String>{
 let p=account_path(app)?;
 if !p.exists(){return Ok(None)}
 let bytes=fs::read(p).map_err(|e|e.to_string())?;
 let json=protect(&bytes,true)?;
 serde_json::from_slice(&json).map(Some).map_err(|e|e.to_string())
}
#[tauri::command]
pub fn gmail_account_status(app:tauri::AppHandle)->Result<Option<String>,String>{
 Ok(load(&app)?.map(|a|a.email))
}
#[tauri::command]
pub fn gmail_sign_out(app:tauri::AppHandle)->Result<(),String>{
 let p=account_path(&app)?;if p.exists(){fs::remove_file(p).map_err(|e|e.to_string())?;}Ok(())
}
#[tauri::command]
pub async fn gmail_connect(app:tauri::AppHandle,client_id:String)->Result<String,String>{
 if !client_id.ends_with(".apps.googleusercontent.com") || client_id.len()>256 || client_id.chars().any(char::is_whitespace){
  return Err("أدخل Google OAuth Client ID من نوع Desktop App".into())
 }
 tauri::async_runtime::spawn_blocking(move||connect_blocking(&app,&client_id))
  .await.map_err(|e|e.to_string())?
}
fn connect_blocking(app:&tauri::AppHandle,client_id:&str)->Result<String,String>{
 let listener=TcpListener::bind("127.0.0.1:0").map_err(|e|e.to_string())?;
 listener.set_nonblocking(true).map_err(|e|e.to_string())?;
 let port=listener.local_addr().map_err(|e|e.to_string())?.port();
 let redirect=format!("http://127.0.0.1:{port}/");
 let mut random=[0u8;32];rand::thread_rng().fill_bytes(&mut random);
 let verifier=URL_SAFE_NO_PAD.encode(random);
 rand::thread_rng().fill_bytes(&mut random);
 let state=URL_SAFE_NO_PAD.encode(random);
 let challenge=URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
 let mut auth=url::Url::parse("https://accounts.google.com/o/oauth2/v2/auth").map_err(|e|e.to_string())?;
 auth.query_pairs_mut()
  .append_pair("client_id",client_id).append_pair("redirect_uri",&redirect)
  .append_pair("response_type","code")
  .append_pair("scope","openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send")
  .append_pair("access_type","offline").append_pair("prompt","consent")
  .append_pair("code_challenge",&challenge).append_pair("code_challenge_method","S256")
  .append_pair("state",&state);
 open_browser(auth.as_str())?;
 let started=Instant::now();
 let code=loop{
  if started.elapsed()>Duration::from_secs(180){return Err("انتهت مهلة تسجيل الدخول. حاول من جديد.".into())}
  match listener.accept(){
   Ok((mut stream,_))=>{
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
    let mut data=[0u8;8192];let n=stream.read(&mut data).map_err(|e|e.to_string())?;
    let first=String::from_utf8_lossy(&data[..n]).lines().next().unwrap_or("").to_owned();
    let target=first.split_whitespace().nth(1).ok_or("Invalid OAuth callback")?;
    let query=url::Url::parse(&format!("http://127.0.0.1:{port}{target}")).map_err(|e|e.to_string())?;
    let args:std::collections::HashMap<_,_>=query.query_pairs().map(|(a,b)|(a.to_string(),b.to_string())).collect();
    let valid=args.get("state").map(String::as_str)==Some(state.as_str()) && query.path()=="/";
    let success=valid && args.contains_key("code");
    let message=if success{"تم ربط الحساب. يمكنك العودة إلى EcoleArchive."}else{"لم يكتمل الربط. ارجع إلى EcoleArchive وأعد المحاولة."};
    let html=format!("<!doctype html><html lang='ar' dir='rtl'><meta charset='utf-8'><title>EcoleArchive</title><body style='font-family:sans-serif;text-align:center;padding:50px'><h2>{message}</h2><script>window.close()</script></body></html>");
    let response=format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",html.len(),html);
    stream.write_all(response.as_bytes()).ok();
    if !valid{return Err("فشل التحقق من رمز الأمان OAuth state".into())}
    if let Some(err)=args.get("error"){return Err(format!("Google رفض التفويض: {err}"))}
    break args.get("code").cloned().ok_or("لم يتم استلام رمز Google")?;
   },
   Err(e) if e.kind()==std::io::ErrorKind::WouldBlock=>std::thread::sleep(Duration::from_millis(120)),
   Err(e)=>return Err(e.to_string())
  }
 };
 let http=reqwest::blocking::Client::builder().timeout(Duration::from_secs(25)).build().map_err(|e|e.to_string())?;
 let response=http.post("https://oauth2.googleapis.com/token").form(&[
  ("client_id",client_id),("code",code.as_str()),("code_verifier",verifier.as_str()),
  ("redirect_uri",redirect.as_str()),("grant_type","authorization_code")
 ]).send().map_err(|e|e.to_string())?;
 if !response.status().is_success(){return Err("Google لم يقبل تبادل رمز التفويض. تحقق من إعدادات Desktop OAuth.".into())}
 let token:TokenResponse=response.json().map_err(|e|e.to_string())?;
 let profile=http.get("https://www.googleapis.com/oauth2/v3/userinfo").bearer_auth(&token.access_token).send().map_err(|e|e.to_string())?;
 if !profile.status().is_success(){return Err("تعذر التحقق من عنوان البريد الإلكتروني".into())}
 let identity:serde_json::Value=profile.json().map_err(|e|e.to_string())?;
 let email=identity["email"].as_str().filter(|v|v.contains('@')).ok_or("لم يرجع Google عنوان البريد")?.to_string();
 let refresh=token.refresh_token.or_else(||load(app).ok().flatten().filter(|a|a.email==email&&a.client_id==client_id).map(|a|a.refresh_token)).ok_or("لم يصدر Google رمزًا لتجديد الجلسة")?;
 let encrypted=protect(&serde_json::to_vec(&Account{email:email.clone(),refresh_token:refresh,client_id:client_id.into()}).map_err(|e|e.to_string())?,false)?;
 fs::write(account_path(app)?,encrypted).map_err(|e|e.to_string())?;
 Ok(email)
}
#[cfg(windows)]
fn open_browser(link:&str)->Result<(),String>{
 use windows_sys::Win32::UI::Shell::ShellExecuteW;
 use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
 let verb:Vec<u16>="open".encode_utf16().chain(std::iter::once(0)).collect();
 let uri:Vec<u16>=link.encode_utf16().chain(std::iter::once(0)).collect();
 let result=unsafe{ShellExecuteW(std::ptr::null_mut(),verb.as_ptr(),uri.as_ptr(),std::ptr::null(),std::ptr::null(),SW_SHOWNORMAL)};
 if (result as isize)<=32{Err("تعذر فتح المتصفح".into())}else{Ok(())}
}
#[cfg(not(windows))]
fn open_browser(_link:&str)->Result<(),String>{Err("Requires Windows".into())}
