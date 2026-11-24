use base64::Engine;
#[tauri::command]
pub async fn board_office_pdf(encoded:String,extension:String)->Result<String,String>{
 tauri::async_runtime::spawn_blocking(move||convert(encoded,extension)).await.map_err(|e|e.to_string())?
}
fn convert(encoded:String,extension:String)->Result<String,String>{
 if !["docx","xlsx"].contains(&extension.as_str())||encoded.len()>28*1024*1024{return Err("Only DOCX/XLSX up to 20 MiB".into());}
 let bytes=base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|_|"Invalid document")?;
 if bytes.len()>20*1024*1024||!bytes.starts_with(b"PK"){return Err("Invalid Office file".into());}
 // Reject macros, external relationships and embedded objects before Office opens the package.
 let mut archive=zip::ZipArchive::new(std::io::Cursor::new(&bytes)).map_err(|_|"Invalid Office ZIP")?;
 if archive.len()>5000{return Err("Too many ZIP entries".into());}
 let mut total=0u64;
 for i in 0..archive.len(){use std::io::Read;let mut file=archive.by_index(i).map_err(|_|"Invalid ZIP entry")?;total=total.saturating_add(file.size());if total>100*1024*1024{return Err("Expanded file too large".into());}
 let name=file.name().to_ascii_lowercase();
 if name.contains("vbaproject")||name.contains("embeddings/")||name.contains("externallinks/")||name.contains("activex/")||name.contains("connections.xml"){return Err("Active or external Office content is not supported".into());}
 if name.ends_with(".rels"){if file.size()>2*1024*1024{return Err("Relationship file too large".into());}let mut xml=String::new();file.read_to_string(&mut xml).map_err(|_|"Invalid relationships")?;if xml.to_ascii_lowercase().contains("external"){return Err("External relationships are not supported".into());}}
 }
 drop(archive);
 #[cfg(windows)]{
 use std::{fs,process::{Command,Stdio},os::windows::process::CommandExt,time::{Duration,Instant}};
 use rand::RngCore;
 let mut random=[0u8;16];rand::rngs::OsRng.fill_bytes(&mut random);let token=random.iter().map(|b|format!("{:02x}",b)).collect::<Vec<_>>().join("");
 let dir=std::env::temp_dir().join(format!("ecole-board-{}",token));fs::create_dir(&dir).map_err(|e|e.to_string())?;
 let result=(||->Result<String,String>{
 let input=dir.join(format!("source.{}",extension));let output=dir.join("output.pdf");let script=dir.join("convert.ps1");fs::write(&input,&bytes).map_err(|e|e.to_string())?;
 fs::write(&script,r#"
param([string]$source,[string]$target,[string]$kind)
$ErrorActionPreference='Stop'
$app=$null
$doc=$null
try {
 if($kind -eq 'docx'){
  $app=New-Object -ComObject Word.Application
  $app.Visible=$false
  $app.DisplayAlerts=0
  $app.AutomationSecurity=3
  $app.Options.UpdateLinksAtOpen=$false
  $doc=$app.Documents.Open($source,$false,$true)
  $doc.ExportAsFixedFormat($target,17)
 }else{
  $app=New-Object -ComObject Excel.Application
  $app.Visible=$false
  $app.DisplayAlerts=$false
  $app.AutomationSecurity=3
  $app.AskToUpdateLinks=$false
  $app.EnableEvents=$false
  $doc=$app.Workbooks.Open($source,0,$true)
  $doc.ExportAsFixedFormat(0,$target)
 }
} finally {
 if($null -ne $doc){try{$doc.Close($false)}catch{}}
 if($null -ne $app){try{$app.Quit()}catch{}}
}
"#).map_err(|e|e.to_string())?;
 let mut child=Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-File"]).arg(&script).arg(&input).arg(&output).arg(&extension).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(0x08000000).spawn().map_err(|e|e.to_string())?;
 let start=Instant::now();loop{match child.try_wait().map_err(|e|e.to_string())?{Some(s)=>{if !s.success(){return Err("Office conversion failed; verify Office installation and document".into());}break;},None if start.elapsed()>Duration::from_secs(90)=>{let _=child.kill();let _=child.wait();return Err("Office conversion timed out".into());},None=>std::thread::sleep(Duration::from_millis(150))}}
 let meta=fs::metadata(&output).map_err(|e|e.to_string())?;if meta.len()>10*1024*1024{return Err("Generated PDF exceeds 10 MiB".into());}
 let pdf=fs::read(output).map_err(|e|e.to_string())?;if !pdf.starts_with(b"%PDF-"){return Err("Invalid PDF output".into());}Ok(base64::engine::general_purpose::STANDARD.encode(pdf))
 })();let _=fs::remove_dir_all(dir);result
 }
 #[cfg(not(windows))]{Err("Requires Windows and Microsoft Office".into())}
}
