//! Desktop-only Google OAuth: system browser, PKCE, loopback, DPAPI at rest.
use serde::{Deserialize,Serialize};
use std::{fs,io::{Read,Write},net::TcpListener,time::{Duration,Instant}};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD,Engine};
use rand::RngCore;
use sha2::{Sha256,Digest};
use tauri::Manager;
use std::error::Error as _;
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
 use windows_sys::Win32::Security::Cryptography::{CRYPT_INTEGER_BLOB,CryptProtectData,CryptUnprotectData,CRYPTPROTECT_UI_FORBIDDEN};
 use windows_sys::Win32::Foundation::LocalFree;
 let mut input=CRYPT_INTEGER_BLOB{cbData:bytes.len() as u32,pbData:bytes.as_ptr() as *mut u8};
 let mut output=CRYPT_INTEGER_BLOB{cbData:0,pbData:std::ptr::null_mut()};
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
// Desktop OAuth client credentials are public-client credentials, but keep the
// optional client secret off UI storage, protected by Windows DPAPI.
fn client_secret_path(app:&tauri::AppHandle)->Result<std::path::PathBuf,String>{
 let dir=app.path().app_data_dir().map_err(|e|e.to_string())?;
 fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
 Ok(dir.join("gmail-oauth-client.dpapi"))
}
fn read_client_secret(app:&tauri::AppHandle)->Result<Option<String>,String>{
 let path=client_secret_path(app)?;
 if !path.exists(){return Ok(None)}
 let plaintext=protect(&fs::read(path).map_err(|e|e.to_string())?,true)?;
 let value=String::from_utf8(plaintext).map_err(|e|e.to_string())?;
 Ok(Some(value))
}
#[tauri::command]
pub fn gmail_set_client_secret(app:tauri::AppHandle,secret:String)->Result<(),String>{
 let value=secret.trim();
 if value.len()>512 || value.chars().any(char::is_control){return Err("قيمة Google OAuth غير صالحة".into())}
 let path=client_secret_path(&app)?;
 if value.is_empty(){if path.exists(){fs::remove_file(path).map_err(|e|e.to_string())?;}return Ok(())}
 let encrypted=protect(value.as_bytes(),false)?;
 fs::write(path,encrypted).map_err(|e|e.to_string())
}
#[tauri::command]
pub fn gmail_has_client_secret(app:tauri::AppHandle)->Result<bool,String>{
 Ok(read_client_secret(&app)?.is_some())
}
fn network_error_kind(error:&reqwest::Error)->String{
 let phase=if error.is_timeout(){"انتهت مهلة الاتصال"}else if error.is_connect(){"فشل إنشاء اتصال TCP/TLS"}else if error.is_request(){"تعذر إرسال طلب HTTPS"}else if error.is_body(){"تعذر قراءة الاستجابة"}else{"خطأ اتصال HTTPS"};
 // Avoid logging URLs, credentials, authorization codes or token responses.
 let mut source=error.source();
 let mut os_code=None;
 while let Some(cause)=source{
  if let Some(io)=cause.downcast_ref::<std::io::Error>() {os_code=io.raw_os_error();}
  source=cause.source();
 }
 match os_code{Some(code)=>format!("{phase} (Windows error {code})"),None=>phase.into()}
}
fn exchange_form<'a>(client_id:&'a str,code:&'a str,verifier:&'a str,redirect:&'a str,secret:Option<&'a str>)->Vec<(&'static str,&'a str)>{
 let mut form=vec![("client_id",client_id),("code",code),("code_verifier",verifier),
 ("redirect_uri",redirect),("grant_type","authorization_code")];
 if let Some(value)=secret.filter(|s|!s.is_empty()){form.push(("client_secret",value));}
 form
}
fn oauth_callback(target:&str,port:u16,expected_state:&str)->Result<Option<String>,String>{
 let url=url::Url::parse(&format!("http://127.0.0.1:{port}{target}")).map_err(|_|"عنوان استجابة Google غير صالح".to_string())?;
 if url.path()!="/" || url.host_str()!=Some("127.0.0.1") || url.port()!=Some(port){return Err("مسار استجابة Google غير صحيح".into())}
 let args:std::collections::HashMap<_,_>=url.query_pairs().map(|(a,b)|(a.to_string(),b.to_string())).collect();
 if args.get("state").map(String::as_str)!=Some(expected_state){return Err("فشل التحقق من رمز الأمان OAuth state".into())}
 if let Some(e)=args.get("error"){return Err(format!("Google رفض التفويض: {}",e.chars().take(80).collect::<String>()))}
 Ok(args.get("code").cloned())
}
#[cfg(test)]
mod oauth_tests {
 use super::*;
 #[test]
 fn callback_decodes_code_and_checks_state(){
  assert_eq!(oauth_callback("/?code=a%2Fb%2Bc&state=abc",45200,"abc").unwrap(),Some("a/b+c".into()));
  assert!(oauth_callback("/?code=secret&state=wrong",45200,"abc").is_err());
  assert!(oauth_callback("/other?code=secret&state=abc",45200,"abc").is_err());
  assert!(oauth_callback("/?error=access_denied&state=abc",45200,"abc").is_err());
 }
 #[test]
 fn pkce_challenge_matches_rfc7636_vector(){
  let verifier="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert_eq!(URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())),"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
 }
 #[test]
 fn exchange_uses_matching_pkce_and_redirect(){
  let form=exchange_form("desktop.apps.googleusercontent.com","code","pkce-verifier","http://127.0.0.1:49200/",None);
  assert_eq!(form.iter().find(|x|x.0=="code_verifier").unwrap().1,"pkce-verifier");
  assert_eq!(form.iter().find(|x|x.0=="redirect_uri").unwrap().1,"http://127.0.0.1:49200/");
  assert!(!form.iter().any(|x|x.0=="client_secret"));
 }
 #[test]
 fn exchange_can_send_desktop_client_secret_when_configured(){
  let form=exchange_form("desktop.apps.googleusercontent.com","code","verifier","http://127.0.0.1:49200/",Some("desktop-secret"));
  assert_eq!(form.iter().find(|x|x.0=="client_secret").unwrap().1,"desktop-secret");
 }
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
    // TcpListener is nonblocking on Windows; accepted sockets may inherit that mode.
    // Switch the callback connection to blocking I/O before reading the HTTP request.
    // Browsers and security software can open speculative local sockets and close
    // them without sending a callback. Never let those sockets abort OAuth.
    if stream.set_nonblocking(false).is_err(){continue;}
    if stream.set_read_timeout(Some(Duration::from_secs(8))).is_err(){continue;}
    let mut data=[0u8;8192];
    let n=match stream.read(&mut data){
     Ok(0)=>continue,
     Ok(n)=>n,
     Err(e) if matches!(e.kind(),std::io::ErrorKind::TimedOut|std::io::ErrorKind::WouldBlock|std::io::ErrorKind::ConnectionReset|std::io::ErrorKind::ConnectionAborted)=>continue,
     Err(_)=>continue
    };
    let first=String::from_utf8_lossy(&data[..n]).lines().next().unwrap_or("").to_owned();
    let Some(target)=first.strip_prefix("GET ").and_then(|v|v.split_whitespace().next())else{continue;};
    // Reject unrelated browser requests (favicon, probes) without ending OAuth.
    if !target.starts_with("/?"){
     let _=stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n");
     continue;
    }
    let parsed=oauth_callback(target,port,&state);
    let success=matches!(&parsed,Ok(Some(_)));
    let message=if success{"تمت موافقة Google. ارجع إلى EcoleArchive للتأكد من إتمام الاتصال."}else{"لم يكتمل الربط. ارجع إلى EcoleArchive وأعد المحاولة."};
    let html=format!("<!doctype html><html lang='ar' dir='rtl'><meta charset='utf-8'><title>EcoleArchive</title><body style='font-family:sans-serif;text-align:center;padding:50px'><h2>{message}</h2><script>window.close()</script></body></html>");
    let response=format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",html.len(),html);
    stream.write_all(response.as_bytes()).ok();
    break parsed?.ok_or("لم يتم استلام رمز Google")?;
   },
   Err(e) if e.kind()==std::io::ErrorKind::WouldBlock=>std::thread::sleep(Duration::from_millis(120)),
   Err(e)=>return Err(e.to_string())
  }
 };
 let http=reqwest::blocking::Client::builder()
  .connect_timeout(Duration::from_secs(12))
  .timeout(Duration::from_secs(45))
  .build().map_err(|e|format!("تعذر إعداد اتصال Google HTTPS: {}",network_error_kind(&e)))?;
 let secret=read_client_secret(app)?;
 let form=exchange_form(client_id,code.as_str(),verifier.as_str(),redirect.as_str(),secret.as_deref());
 let response=http.post("https://oauth2.googleapis.com/token").form(&form).send().map_err(|e|format!("تعذر الاتصال بخادم Google OAuth أثناء تبادل الرمز: {}",network_error_kind(&e)))?;
 if !response.status().is_success(){
  let status=response.status();
  let body=response.text().unwrap_or_default();
  let parsed:serde_json::Value=serde_json::from_str(&body).unwrap_or_default();
  let code=parsed["error"].as_str().unwrap_or("unknown_error");
  let description=parsed["error_description"].as_str().unwrap_or("");
  let safe_code=if matches!(code,"invalid_request"|"invalid_client"|"invalid_grant"|"unauthorized_client"|"invalid_scope"|"access_denied"|"unsupported_grant_type"){code}else{"oauth_error"};
  let safe_description=description.chars().filter(|c|!c.is_control()).take(160).collect::<String>();
  return Err(format!("Google OAuth: {safe_code} (HTTP {status}). {safe_description}"));
 }
 let token:TokenResponse=response.json().map_err(|e|e.to_string())?;
 let profile=http.get("https://www.googleapis.com/oauth2/v3/userinfo").bearer_auth(&token.access_token).send().map_err(|e|format!("تعذر الاتصال بخادم Google userinfo: {}",network_error_kind(&e)))?;
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
