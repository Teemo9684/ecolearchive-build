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
  .append_pair("scope","openid email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send")
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

#[derive(Serialize)]
pub struct GmailItem {
 id:String, thread_id:String, subject:String, sender:String, date:String,
 snippet:String, unread:bool, has_attachments:bool, message_id:String, draft_id:Option<String>,
}
fn gmail_http()->Result<reqwest::blocking::Client,String>{
 reqwest::blocking::Client::builder()
 .connect_timeout(Duration::from_secs(12)).timeout(Duration::from_secs(45))
 .build().map_err(|e|network_error_kind(&e))
}
fn gmail_access_token(app:&tauri::AppHandle,http:&reqwest::blocking::Client)->Result<String,String>{
 let account=load(app)?.ok_or("حساب Gmail غير مرتبط")?;
 let secret=read_client_secret(app)?;
 let mut form=vec![("client_id",account.client_id.as_str()),("refresh_token",account.refresh_token.as_str()),("grant_type","refresh_token")];
 if let Some(ref value)=secret{form.push(("client_secret",value.as_str()));}
 let response=http.post("https://oauth2.googleapis.com/token").form(&form).send()
 .map_err(|e|format!("تعذر تجديد جلسة Gmail: {}",network_error_kind(&e)))?;
 if !response.status().is_success(){
  let status=response.status();
  return Err(format!("تعذر تجديد تفويض Gmail (HTTP {status}). أعد ربط الحساب إذا انتهت الصلاحية"));
 }
 let json:serde_json::Value=response.json().map_err(|_|"استجابة تجديد Gmail غير صالحة")?;
 json["access_token"].as_str().map(str::to_owned).ok_or("لم يرجع Google رمز وصول".into())
}
fn gmail_headers(json:&serde_json::Value,key:&str)->String{
 json["payload"]["headers"].as_array().and_then(|arr|arr.iter().find(|h|h["name"].as_str().is_some_and(|s|s.eq_ignore_ascii_case(key))))
 .and_then(|h|h["value"].as_str()).unwrap_or("").to_string()
}
fn gmail_has_attachment(part:&serde_json::Value)->bool{
 if part["filename"].as_str().is_some_and(|s|!s.is_empty()){return true;}
 part["parts"].as_array().is_some_and(|parts|parts.iter().any(gmail_has_attachment))
}
fn gmail_plain_text(part:&serde_json::Value)->Option<String>{
 if part["mimeType"].as_str()==Some("text/plain"){
  if let Some(encoded)=part["body"]["data"].as_str(){
   if let Ok(bytes)=URL_SAFE_NO_PAD.decode(encoded){
    if let Ok(text)=String::from_utf8(bytes){return Some(text)}
   }
  }
 }
 part["parts"].as_array().and_then(|arr|arr.iter().find_map(gmail_plain_text))
}
fn gmail_get_json(http:&reqwest::blocking::Client,token:&str,url:&str)->Result<serde_json::Value,String>{
 let response=http.get(url).bearer_auth(token).send().map_err(|e|format!("تعذر جلب رسائل Gmail: {}",network_error_kind(&e)))?;
 if !response.status().is_success(){
  let status=response.status();
  return Err(format!("رفض Gmail قراءة الرسائل (HTTP {status}). تحقق من صلاحيات Gmail API"));
 }
 response.json().map_err(|_|"رد Gmail غير صالح".into())
}
#[tauri::command]
pub async fn gmail_list_messages(app:tauri::AppHandle,folder:String)->Result<Vec<GmailItem>,String>{
 tauri::async_runtime::spawn_blocking(move||{
  let http=gmail_http()?;
  let token=gmail_access_token(&app,&http)?;
  if folder=="DRAFTS"{
   let listing=gmail_get_json(&http,&token,"https://gmail.googleapis.com/gmail/v1/users/me/drafts?maxResults=30")?;
   let mut items=Vec::new();
   if let Some(drafts)=listing["drafts"].as_array(){
    for draft in drafts{
     let Some(draft_id)=draft["id"].as_str()else{continue};
     if !safe_message_id(draft_id){continue}
     let data=gmail_get_json(&http,&token,&format!("https://gmail.googleapis.com/gmail/v1/users/me/drafts/{draft_id}?format=full"))?;
     let m=&data["message"];
     items.push(GmailItem{
      id:m["id"].as_str().unwrap_or("").into(),
      thread_id:m["threadId"].as_str().unwrap_or("").into(),
      sender:gmail_headers(m,"To"),subject:gmail_headers(m,"Subject"),
      date:gmail_headers(m,"Date"),snippet:m["snippet"].as_str().unwrap_or("").into(),
      unread:false,has_attachments:m["payload"]["parts"].as_array().is_some_and(|a|a.iter().any(gmail_has_attachment)),
      message_id:gmail_headers(m,"Message-ID"),draft_id:Some(draft_id.to_owned()),
     });
    }
   }
   return Ok(items);
  }
  let label=match folder.as_str(){"INBOX"|"SENT"|"STARRED"|"TRASH"=>folder.as_str(),_=>return Err("مجلد Gmail غير صالح".into())};
  let url=format!("https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds={label}&maxResults=30");
  let listing=gmail_get_json(&http,&token,&url)?;
  let mut items=Vec::new();
  if let Some(messages)=listing["messages"].as_array(){
   for msg in messages{
    let Some(id)=msg["id"].as_str()else{continue};
    let safe_id=id.chars().all(|c|c.is_ascii_alphanumeric());
    if !safe_id{continue}
    let detail=gmail_get_json(&http,&token,&format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}?format=metadata"))?;
    let labels=detail["labelIds"].as_array();
    items.push(GmailItem{
     id:id.into(),thread_id:detail["threadId"].as_str().unwrap_or("").into(),
     sender:gmail_headers(&detail,"From"),subject:gmail_headers(&detail,"Subject"),
     date:gmail_headers(&detail,"Date"),
     snippet:detail["snippet"].as_str().unwrap_or("").into(),message_id:gmail_headers(&detail,"Message-ID"),draft_id:None,
     unread:labels.is_some_and(|l|l.iter().any(|v|v.as_str()==Some("UNREAD"))),
     has_attachments:detail["payload"]["parts"].as_array().is_some_and(|a|a.iter().any(gmail_has_attachment))
    });
   }
  }
  Ok(items)
 }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn gmail_read_message(app:tauri::AppHandle,id:String)->Result<String,String>{
 if id.is_empty()||!id.chars().all(|c|c.is_ascii_alphanumeric()){return Err("معرّف الرسالة غير صالح".into())}
 tauri::async_runtime::spawn_blocking(move||{
  let http=gmail_http()?;
  let token=gmail_access_token(&app,&http)?;
  let data=gmail_get_json(&http,&token,&format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}?format=full"))?;
  Ok(gmail_plain_text(&data["payload"]).unwrap_or_else(||data["snippet"].as_str().unwrap_or("لا يوجد نص عادي متاح لهذه الرسالة").into()))
 }).await.map_err(|e|e.to_string())?
}

#[derive(Deserialize)]
pub struct OutgoingAttachment {name:String,mime:String,data:String}
#[derive(Serialize)]
pub struct GmailAttachment {part_id:String,name:String,mime:String,size:i64}
fn gmail_attachment_parts(node:&serde_json::Value,out:&mut Vec<GmailAttachment>){
 if let (Some(name),Some(part_id))=(node["filename"].as_str(),node["body"]["attachmentId"].as_str()){
  if !name.is_empty(){out.push(GmailAttachment{part_id:part_id.into(),name:name.into(),mime:node["mimeType"].as_str().unwrap_or("application/octet-stream").into(),size:node["body"]["size"].as_i64().unwrap_or(0)})}
 }
 if let Some(parts)=node["parts"].as_array(){for part in parts{gmail_attachment_parts(part,out)}}
}
#[tauri::command]
pub async fn gmail_message_attachments(app:tauri::AppHandle,id:String)->Result<Vec<GmailAttachment>,String>{
 if !safe_message_id(&id){return Err("معرّف الرسالة غير صالح".into())}
 tauri::async_runtime::spawn_blocking(move||{
  let http=gmail_http()?;let token=gmail_access_token(&app,&http)?;
  let data=gmail_get_json(&http,&token,&format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}?format=full"))?;
  let mut out=Vec::new();gmail_attachment_parts(&data["payload"],&mut out);Ok(out)
 }).await.map_err(|e|e.to_string())?
}
fn safe_message_id(value:&str)->bool{!value.is_empty()&&value.len()<=128&&value.chars().all(|c|c.is_ascii_alphanumeric()||c=='-'||c=='_')}
fn safe_filename(name:&str)->String{
 let clean=name.chars().map(|c|if c.is_control()||"\\/:*?\"<>|".contains(c){'_'}else{c}).collect::<String>();
 let clean=clean.trim_matches(|c|c=='.'||c==' ').chars().take(120).collect::<String>();
 if clean.is_empty(){"attachment.bin".into()}else{clean}
}
#[tauri::command]
pub async fn gmail_download_attachment(app:tauri::AppHandle,id:String,part_id:String,name:String)->Result<String,String>{
 if !safe_message_id(&id)||!safe_message_id(&part_id){return Err("معرّف المرفق غير صالح".into())}
 tauri::async_runtime::spawn_blocking(move||{
  let http=gmail_http()?;let token=gmail_access_token(&app,&http)?;
  // Verify this part belongs to the message before downloading.
  let message=gmail_get_json(&http,&token,&format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}?format=full"))?;
  let mut known=Vec::new();gmail_attachment_parts(&message["payload"],&mut known);
  if !known.iter().any(|a|a.part_id==part_id&&a.name==name){return Err("المرفق لا ينتمي للرسالة".into())}
  let data=gmail_get_json(&http,&token,&format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}/attachments/{part_id}"))?;
  let encoded=data["data"].as_str().ok_or("Google لم يرجع بيانات المرفق")?;
  let bytes=URL_SAFE_NO_PAD.decode(encoded).map_err(|_|"ترميز المرفق غير صالح")?;
  if bytes.len()>25*1024*1024{return Err("المرفق أكبر من الحد المسموح 25MB".into())}
  let dir=app.path().document_dir().map_err(|e|e.to_string())?.join("EcoleArchive").join("Gmail");
  fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
  let filename=safe_filename(&name);
  let path=(0..1000).map(|i|if i==0{dir.join(&filename)}else{dir.join(format!("{i}-{filename}"))})
   .find(|p|!p.exists()).ok_or("تعذر تخصيص اسم للمرفق")?;
  fs::write(&path,bytes).map_err(|e|e.to_string())?;
  Ok(path.to_string_lossy().to_string())
 }).await.map_err(|e|e.to_string())?
}
fn mime_safe(s:&str)->String{s.chars().filter(|c|c.is_ascii_alphanumeric()||"/.+-".contains(*c)).take(80).collect()}
fn mail_header(s:&str)->String{s.chars().filter(|c|*c!='\r'&&*c!='\n'&& !c.is_control()).collect()}
fn gmail_build_raw(recipient:&str,subject:&str,body:&str,attachments:Vec<OutgoingAttachment>,in_reply_to:Option<&str>)->Result<String,String>{
  let boundary=format!("ecolearchive-{}",rand::random::<u64>());
  let encoded_subject=if subject.is_ascii(){mail_header(&subject)}else{format!("=?UTF-8?B?{}?=",base64::engine::general_purpose::STANDARD.encode(subject.as_bytes()))};
  let mut msg=format!("To: {recipient}\r\nSubject: {encoded_subject}\r\nMIME-Version: 1.0\r\n");  if let Some(ref message_id)=in_reply_to{
   let value=mail_header(message_id);
   if !value.is_empty()&&value.len()<300{
    msg.push_str(&format!("In-Reply-To: {value}\r\nReferences: {value}\r\n"));
   }
  }

  if attachments.is_empty(){
   msg.push_str("Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n");
   msg.push_str(&base64::engine::general_purpose::STANDARD.encode(body.as_bytes()));
  }else{
   msg.push_str(&format!("Content-Type: multipart/mixed; boundary=\"{boundary}\"\r\n\r\n--{boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"));
   msg.push_str(&base64::engine::general_purpose::STANDARD.encode(body.as_bytes()));
   for a in attachments{
    let bytes=base64::engine::general_purpose::STANDARD.decode(&a.data).map_err(|_|"ترميز مرفق الإرسال غير صالح")?;
    if bytes.len()>15*1024*1024||msg.len()+bytes.len()*2>22*1024*1024{return Err("حجم مرفقات الإرسال كبير جدًا".into())}
    let name=safe_filename(&a.name);
    let mime=mime_safe(&a.mime);
    msg.push_str(&format!("\r\n--{boundary}\r\nContent-Type: {}; name=\"{}\"\r\nContent-Disposition: attachment; filename=\"{}\"\r\nContent-Transfer-Encoding: base64\r\n\r\n",if mime.is_empty(){"application/octet-stream"}else{&mime},name,name));
    msg.push_str(&base64::engine::general_purpose::STANDARD.encode(bytes));
   }
   msg.push_str(&format!("\r\n--{boundary}--\r\n"));
  }
  Ok(URL_SAFE_NO_PAD.encode(msg.as_bytes()))
}
#[tauri::command]
pub async fn gmail_send_message(app:tauri::AppHandle,to:String,subject:String,body:String,attachments:Vec<OutgoingAttachment>,thread_id:Option<String>,in_reply_to:Option<String>)->Result<String,String>{
 let recipient=mail_header(to.trim());
 if recipient.is_empty()||recipient.len()>320||!recipient.contains('@')||recipient.contains(' '){return Err("عنوان المرسل إليه غير صالح".into())}
 if subject.len()>500||body.len()>1000000||attachments.len()>10{return Err("حجم الرسالة أو عدد المرفقات تجاوز الحد".into())}
 tauri::async_runtime::spawn_blocking(move||{
  let http=gmail_http()?;let token=gmail_access_token(&app,&http)?;
  let raw=gmail_build_raw(&recipient,&subject,&body,attachments,in_reply_to.as_deref())?;
  let response=http.post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send").bearer_auth(&token)
    .json(&match thread_id.filter(|id|safe_message_id(id)){
     Some(id)=>serde_json::json!({"raw":raw,"threadId":id}),
     None=>serde_json::json!({"raw":raw})
    }).send().map_err(|e|format!("فشل اتصال إرسال Gmail: {}",network_error_kind(&e)))?;
  if !response.status().is_success(){return Err(format!("رفض Gmail إرسال الرسالة (HTTP {})",response.status()))}
  let result:serde_json::Value=response.json().map_err(|_|"رد Gmail بعد الإرسال غير صالح")?;
  result["id"].as_str().map(str::to_owned).ok_or("لم يؤكد Gmail معرّف الرسالة المرسلة".into())
 }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn gmail_update_message(app:tauri::AppHandle,id:String,action:String)->Result<(),String>{
 if !safe_message_id(&id){return Err("معرّف الرسالة غير صالح".into())}
 tauri::async_runtime::spawn_blocking(move||{
  let http=gmail_http()?;let token=gmail_access_token(&app,&http)?;
  let base=format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}");
  let response=match action.as_str(){
   "TRASH"=>http.post(format!("{base}/trash")).bearer_auth(&token).send(),
   "RESTORE"=>http.post(format!("{base}/untrash")).bearer_auth(&token).send(),
   "READ"=>http.post(format!("{base}/modify")).bearer_auth(&token)
      .json(&serde_json::json!({"removeLabelIds":["UNREAD"]})).send(),
   "UNREAD"=>http.post(format!("{base}/modify")).bearer_auth(&token)
      .json(&serde_json::json!({"addLabelIds":["UNREAD"]})).send(),
   "STAR"=>http.post(format!("{base}/modify")).bearer_auth(&token)
      .json(&serde_json::json!({"addLabelIds":["STARRED"]})).send(),
   "UNSTAR"=>http.post(format!("{base}/modify")).bearer_auth(&token)
      .json(&serde_json::json!({"removeLabelIds":["STARRED"]})).send(),
   "ARCHIVE"=>http.post(format!("{base}/modify")).bearer_auth(&token)
      .json(&serde_json::json!({"removeLabelIds":["INBOX"]})).send(),
   _=>return Err("عملية Gmail غير مدعومة".into()),
  }.map_err(|e|format!("خطأ الاتصال عند تحديث Gmail: {}",network_error_kind(&e)))?;
  if !response.status().is_success(){return Err(format!("رفض Gmail العملية (HTTP {}). قد يلزم إعادة ربط الحساب للسماح بتعديل الرسائل.",response.status()))}
  Ok(())
 }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn gmail_save_draft(app:tauri::AppHandle,to:String,subject:String,body:String,attachments:Vec<OutgoingAttachment>)->Result<String,String>{
 if subject.len()>500||body.len()>1000000||attachments.len()>10{return Err("حجم المسودة كبير جدًا".into())}
 tauri::async_runtime::spawn_blocking(move||{
  let http=gmail_http()?;let token=gmail_access_token(&app,&http)?;
  let recipient=mail_header(to.trim());
  if !recipient.is_empty()&&(!recipient.contains('@')||recipient.len()>320){return Err("عنوان المستلم غير صالح".into())}
  let raw=gmail_build_raw(&recipient,&subject,&body,attachments,None)?;
  let response=http.post("https://gmail.googleapis.com/gmail/v1/users/me/drafts").bearer_auth(&token)
   .json(&serde_json::json!({"message":{"raw":raw}})).send()
   .map_err(|e|format!("فشل حفظ مسودة Gmail: {}",network_error_kind(&e)))?;
  if !response.status().is_success(){return Err(format!("رفض Gmail حفظ المسودة (HTTP {})؛ قد يلزم تجديد الصلاحيات",response.status()))}
  let data:serde_json::Value=response.json().map_err(|_|"استجابة المسودة غير صالحة")?;
  data["id"].as_str().map(str::to_owned).ok_or("لم يرجع Gmail معرف المسودة".into())
 }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn gmail_draft_action(app:tauri::AppHandle,id:String,action:String)->Result<(),String>{
 if !safe_message_id(&id){return Err("معرّف المسودة غير صالح".into())}
 tauri::async_runtime::spawn_blocking(move||{
  let http=gmail_http()?;let token=gmail_access_token(&app,&http)?;
  let response=match action.as_str(){
   "SEND"=>http.post("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send").bearer_auth(&token)
     .json(&serde_json::json!({"id":id})).send(),
   "DELETE"=>http.delete(format!("https://gmail.googleapis.com/gmail/v1/users/me/drafts/{id}")).bearer_auth(&token).send(),
   _=>return Err("عملية مسودة غير مدعومة".into())
  }.map_err(|e|format!("فشل اتصال Gmail للمسودات: {}",network_error_kind(&e)))?;
  if !response.status().is_success(){return Err(format!("رفض Gmail عملية المسودة (HTTP {})",response.status()))}
  Ok(())
 }).await.map_err(|e|e.to_string())?
}
