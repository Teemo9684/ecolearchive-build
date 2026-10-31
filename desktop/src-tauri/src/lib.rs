use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const SCHEMA: &str = include_str!("../../sqlite/001_init.sql");

const COLLECTIONS: &[&str] = &[
    "academicYears", "archiveCategories", "documents", "documentFiles",
    "correspondences", "teachers", "employees", "staffRecords", "students",
    "classes", "inventoryItems", "templates", "settings", "auditLogs",
];

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("ecolearchive.sqlite3"))
}
fn connect(app: &tauri::AppHandle) -> Result<Connection, String> {
    let conn = Connection::open(database_path(app)?).map_err(|e| e.to_string())?;
    conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(5)).map_err(|e| e.to_string())?;
    Ok(conn)
}
fn check_collection(collection: &str) -> Result<(), String> {
    if COLLECTIONS.contains(&collection) && collection != "documentFiles" { Ok(()) }
    else { Err("Invalid collection".into()) }
}
#[tauri::command]
fn list_records(app: tauri::AppHandle, collection: String) -> Result<Vec<serde_json::Value>, String> {
    check_collection(&collection)?;
    let conn = connect(&app)?;
    let mut stmt = conn.prepare("SELECT payload FROM records WHERE collection=?1 ORDER BY id").map_err(|e| e.to_string())?;
    let entries = stmt.query_map([&collection], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
    entries.map(|v| {
        let payload = v.map_err(|e| e.to_string())?;
        serde_json::from_str(&payload).map_err(|e| e.to_string())
    }).collect()
}
#[tauri::command]
fn get_record(app: tauri::AppHandle, collection: String, id: String) -> Result<Option<serde_json::Value>, String> {
    check_collection(&collection)?;
    let conn = connect(&app)?;
    let raw: Option<String> = conn.query_row(
        "SELECT payload FROM records WHERE collection=?1 AND id=?2",
        params![collection,id], |r| r.get(0)
    ).optional().map_err(|e| e.to_string())?;
    raw.map(|v| serde_json::from_str(&v).map_err(|e| e.to_string())).transpose()
}
#[tauri::command]
fn put_record(app: tauri::AppHandle, collection: String, value: serde_json::Value) -> Result<(), String> {
    check_collection(&collection)?;
    let id = value.get("id").and_then(|v| v.as_str()).filter(|v| !v.is_empty()).ok_or("Missing ID")?;
    let conn = connect(&app)?;
    conn.execute("INSERT INTO records(collection,id,payload) VALUES(?1,?2,?3)
        ON CONFLICT(collection,id) DO UPDATE SET payload=excluded.payload,updated_at=datetime('now')",
        params![collection,id,value.to_string()]).map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn remove_record(app: tauri::AppHandle, collection: String, id: String) -> Result<(), String> {
    check_collection(&collection)?;
    connect(&app)?.execute("DELETE FROM records WHERE collection=?1 AND id=?2",params![collection,id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn put_many_records(app: tauri::AppHandle, collection: String, values: Vec<serde_json::Value>) -> Result<(), String> {
    check_collection(&collection)?;
    let mut conn=connect(&app)?;
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    for value in values {
        let id=value.get("id").and_then(|v|v.as_str()).filter(|v|!v.is_empty()).ok_or("Missing ID")?;
        tx.execute("INSERT INTO records(collection,id,payload) VALUES(?1,?2,?3)
            ON CONFLICT(collection,id) DO UPDATE SET payload=excluded.payload,updated_at=datetime('now')",
            params![collection,id,value.to_string()]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e|e.to_string())
}
#[tauri::command]
fn clear_records(app: tauri::AppHandle, collection: String) -> Result<(), String> {
    check_collection(&collection)?;
    connect(&app)?.execute("DELETE FROM records WHERE collection=?1",[collection]).map_err(|e|e.to_string())?;
    Ok(())
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
struct StoredFile { id:String,name:String,mime_type:String,hash:String,base64:String }
#[tauri::command]
fn list_files(app:tauri::AppHandle)->Result<Vec<StoredFile>,String>{
    use base64::Engine;
    let conn=connect(&app)?;
    let mut stmt=conn.prepare("SELECT id,name,mime_type,sha256,data FROM attachments ORDER BY id").map_err(|e|e.to_string())?;
    let rows = stmt.query_map([],|r|{
        let data:Vec<u8>=r.get(4)?;
        Ok(StoredFile{id:r.get(0)?,name:r.get(1)?,mime_type:r.get(2)?,hash:r.get(3)?,base64:base64::engine::general_purpose::STANDARD.encode(data)})
    }).map_err(|e|e.to_string())?;
    let files = rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    Ok(files)
}
#[tauri::command]
fn get_file(app:tauri::AppHandle,id:String)->Result<Option<StoredFile>,String>{
    use base64::Engine;
    let conn=connect(&app)?;
    conn.query_row("SELECT id,name,mime_type,sha256,data FROM attachments WHERE id=?1",[id],|r|{
        let data:Vec<u8>=r.get(4)?;
        Ok(StoredFile{id:r.get(0)?,name:r.get(1)?,mime_type:r.get(2)?,hash:r.get(3)?,base64:base64::engine::general_purpose::STANDARD.encode(data)})
    }).optional().map_err(|e|e.to_string())
}
#[tauri::command]
fn put_file(app:tauri::AppHandle,value:StoredFile)->Result<(),String>{
    use base64::Engine;
    let bytes=base64::engine::general_purpose::STANDARD.decode(&value.base64).map_err(|e|e.to_string())?;
    let digest=format!("{:x}",Sha256::digest(&bytes));
    if !value.hash.is_empty() && !value.hash.eq_ignore_ascii_case(&digest) {
        return Err("Attachment checksum mismatch".into());
    }
    connect(&app)?.execute("INSERT INTO attachments(id,name,mime_type,sha256,data,bytes) VALUES(?1,?2,?3,?4,?5,?6)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,mime_type=excluded.mime_type,sha256=excluded.sha256,data=excluded.data,bytes=excluded.bytes",
      params![value.id,value.name,value.mime_type,digest,&bytes,bytes.len() as i64]).map_err(|e|e.to_string())?;
    Ok(())
}
#[tauri::command]
fn remove_file(app:tauri::AppHandle,id:String)->Result<(),String>{
    connect(&app)?.execute("DELETE FROM attachments WHERE id=?1",[id]).map_err(|e|e.to_string())?;
    Ok(())
}
#[tauri::command]
fn clear_files(app:tauri::AppHandle)->Result<(),String>{
    connect(&app)?.execute("DELETE FROM attachments",[]).map_err(|e|e.to_string())?;
    Ok(())
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct ImportAttachment { id: String, name: String, mime_type: String, hash: String, base64: String, bytes: usize }
#[derive(Deserialize)]
struct ImportRecord { collection: String, id: String, payload: String }
#[derive(Deserialize)]
struct ImportPlan { records: Vec<ImportRecord>, attachments: Vec<ImportAttachment>, counts: std::collections::HashMap<String, usize> }
#[derive(Serialize)]
struct ImportReport { records: usize, attachments: usize }

/// Import only into an EMPTY database, in one transaction; never silently overwrite school records.
#[tauri::command]
fn import_verified_backup(app: tauri::AppHandle, plan: ImportPlan) -> Result<ImportReport,String> {
    use base64::Engine;
    let mut conn = connect(&app)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let current:i64 = tx.query_row("SELECT (SELECT count(*) FROM records) + (SELECT count(*) FROM attachments)",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    if current != 0 { return Err("قاعدة البيانات ليست فارغة. لا يمكن الكتابة فوق البيانات الحالية".into()); }
    for name in COLLECTIONS {
        if !plan.counts.contains_key(*name) { return Err(format!("Missing backup collection: {name}")); }
    }
    let expected:usize = plan.counts.iter().filter(|(name,_)| name.as_str() != "documentFiles").map(|(_,v)|v).sum();
    if expected != plan.records.len() || plan.counts.get("documentFiles") != Some(&plan.attachments.len()) {
        return Err("Backup record counts do not match".into());
    }
    let mut seen=std::collections::HashSet::new();
    for row in &plan.records {
        check_collection(&row.collection)?;
        let parsed:serde_json::Value=serde_json::from_str(&row.payload).map_err(|e|e.to_string())?;
        if parsed.get("id").and_then(|x|x.as_str())!=Some(row.id.as_str()) || !seen.insert((row.collection.as_str(),row.id.as_str())) {
            return Err("Duplicate or mismatched record ID".into());
        }
        tx.execute("INSERT INTO records(collection,id,payload) VALUES(?1,?2,?3)",
            params![row.collection,row.id,row.payload]).map_err(|e|e.to_string())?;
    }
    for file in &plan.attachments {
        let bytes=base64::engine::general_purpose::STANDARD.decode(&file.base64).map_err(|e|e.to_string())?;
        if bytes.len()!=file.bytes {return Err("Attachment size mismatch".into());}
        let digest=format!("{:x}",Sha256::digest(&bytes));
        if file.hash.is_empty() || !digest.eq_ignore_ascii_case(&file.hash) {
            return Err(format!("Attachment integrity failed: {}",file.name));
        }
        tx.execute("INSERT INTO attachments(id,name,mime_type,sha256,data,bytes) VALUES(?1,?2,?3,?4,?5,?6)",
          params![file.id,file.name,file.mime_type,digest,&bytes,bytes.len() as i64]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e|e.to_string())?;
    Ok(ImportReport{records:plan.records.len(),attachments:plan.attachments.len()})
}
#[tauri::command]
fn restore_verified_backup(app: tauri::AppHandle, plan: ImportPlan) -> Result<ImportReport, String> {
    use base64::Engine;
    let mut conn=connect(&app)?;
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    for name in COLLECTIONS {
        if !plan.counts.contains_key(*name) {return Err(format!("Missing backup collection: {name}"));}
    }
    let expected:usize=plan.counts.iter().filter(|(name,_)|name.as_str()!="documentFiles").map(|(_,n)|*n).sum();
    if plan.records.len()!=expected || plan.counts.get("documentFiles")!=Some(&plan.attachments.len()) {
        return Err("Backup counts do not match".into());
    }
    let mut seen=std::collections::HashSet::new();
    for row in &plan.records {
        check_collection(&row.collection)?;
        let parsed:serde_json::Value=serde_json::from_str(&row.payload).map_err(|e|e.to_string())?;
        if parsed.get("id").and_then(|v|v.as_str())!=Some(&row.id) || !seen.insert((row.collection.as_str(),row.id.as_str())) {
            return Err("Invalid or repeated backup record".into());
        }
    }
    let mut attachments=Vec::new();
    for file in &plan.attachments {
        let bytes=base64::engine::general_purpose::STANDARD.decode(&file.base64).map_err(|e|e.to_string())?;
        if bytes.len()!=file.bytes {return Err("Attachment size mismatch".into());}
        let digest=format!("{:x}",Sha256::digest(&bytes));
        if file.hash.is_empty() || !digest.eq_ignore_ascii_case(&file.hash) {return Err(format!("Attachment integrity failed: {}",file.name));}
        attachments.push((file,digest,bytes));
    }
    tx.execute("DELETE FROM records",[]).map_err(|e|e.to_string())?;
    tx.execute("DELETE FROM attachments",[]).map_err(|e|e.to_string())?;
    for row in &plan.records {
        tx.execute("INSERT INTO records(collection,id,payload) VALUES(?1,?2,?3)",params![row.collection,row.id,row.payload]).map_err(|e|e.to_string())?;
    }
    for (file,digest,bytes) in attachments {
        tx.execute("INSERT INTO attachments(id,name,mime_type,sha256,data,bytes) VALUES(?1,?2,?3,?4,?5,?6)",params![file.id,file.name,file.mime_type,digest,bytes,bytes.len() as i64]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e|e.to_string())?;
    Ok(ImportReport{records:plan.records.len(),attachments:plan.attachments.len()})
}
#[tauri::command]
async fn check_desktop_update(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    let release = updater.check().await.map_err(|e| e.to_string())?;
    Ok(release.map(|update| update.version))
}

#[derive(Clone, Serialize)]
struct UpdateDownloadProgress {
    downloaded: u64,
    total: Option<u64>,
    phase: String,
}
#[derive(Clone)]
struct UpdateProgressStore(std::sync::Arc<std::sync::Mutex<UpdateDownloadProgress>>);
#[tauri::command]
fn get_update_download_progress(app: tauri::AppHandle) -> Result<UpdateDownloadProgress, String> {
    let state = app.state::<UpdateProgressStore>();
    state.0.lock().map(|v| v.clone()).map_err(|e| e.to_string())
}
#[tauri::command]
async fn install_desktop_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let progress = app.state::<UpdateProgressStore>().0.clone();
    if let Ok(mut s) = progress.lock() {
        *s = UpdateDownloadProgress { downloaded: 0, total: None, phase: "checking".into() };
    }
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?
        .ok_or_else(|| "لا يوجد تحديث جديد".to_string())?;
    if let Ok(mut s) = progress.lock() { s.phase = "downloading".into(); }
    let receive = progress.clone();
    let finish = progress.clone();
    let result = update.download_and_install(move |bytes, total| {
        if let Ok(mut s) = receive.lock() {
            s.downloaded = s.downloaded.saturating_add(bytes as u64);
            if let Some(t) = total { s.total = Some(t); }
        }
    }, move || {
        if let Ok(mut s) = finish.lock() { s.phase = "installing".into(); }
    }).await;
    if let Err(e) = result {
        if let Ok(mut s) = progress.lock() { s.phase = "error".into(); }
        return Err(e.to_string());
    }
    app.restart();
}


fn word_xml_escape(input: &str) -> String {
    input.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
         .replace('"', "&quot;").replace('\'', "&apos;")
}
fn word_paragraph(text: &str, bold: bool) -> String {
    format!(r#"<w:p><w:pPr><w:bidi/><w:jc w:val="right"/><w:spacing w:after="125"/></w:pPr><w:r><w:rPr><w:rtl/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Traditional Arabic"/><w:sz w:val="25"/><w:szCs w:val="29"/>{}</w:rPr><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
        if bold { "<w:b/>" } else { "" }, word_xml_escape(text))
}
fn word_heading(text: &str, is_title: bool) -> String {
    let size = if is_title { 42 } else { 27 };
    let shading = if is_title { r#"<w:shd w:fill="DCEAF8"/><w:pBdr><w:bottom w:val="single" w:sz="12" w:color="1A4576"/></w:pBdr>"# } else { "" };
    format!(r#"<w:p><w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="120" w:after="180"/>{}</w:pPr><w:r><w:rPr><w:b/><w:rtl/><w:color w:val="15355A"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Traditional Arabic"/><w:sz w:val="{}"/><w:szCs w:val="{}"/></w:rPr><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#, shading, size, size+4, word_xml_escape(text))
}
fn word_table_cell(value: &str, header: bool) -> String {
    let shade = if header { r#"<w:shd w:fill="174875"/>"# } else { "" };
    let color = if header { r#"<w:color w:val="FFFFFF"/><w:b/>"# } else { "" };
    format!(r#"<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:vAlign w:val="center"/>{}</w:tcPr><w:p><w:pPr><w:bidi/><w:jc w:val="right"/><w:spacing w:before="80" w:after="80"/></w:pPr><w:r><w:rPr><w:rtl/>{}<w:rFonts w:cs="Traditional Arabic"/><w:szCs w:val="26"/></w:rPr><w:t xml:space="preserve">{}</w:t></w:r></w:p></w:tc>"#, shade, color, word_xml_escape(value.trim()))
}
fn word_table(rows: &[Vec<String>]) -> String {
    let mut xml = String::from(r#"<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="7" w:color="1A4576"/><w:left w:val="single" w:sz="7" w:color="1A4576"/><w:bottom w:val="single" w:sz="7" w:color="1A4576"/><w:right w:val="single" w:sz="7" w:color="1A4576"/><w:insideH w:val="single" w:sz="4" w:color="9FB6D2"/><w:insideV w:val="single" w:sz="4" w:color="9FB6D2"/></w:tblBorders></w:tblPr><w:tblGrid/>"#);
    for (i, row) in rows.iter().enumerate() {
        xml.push_str("<w:tr>");
        for cell in row { xml.push_str(&word_table_cell(cell, i == 0)); }
        xml.push_str("</w:tr>");
    }
    xml.push_str("</w:tbl>");
    xml
}
#[tauri::command]
fn read_generated_word_document(app: tauri::AppHandle, file_path: String) -> Result<String, String> {
    use base64::Engine;
    let allowed = app.path().app_data_dir().map_err(|e| e.to_string())?.join("word-documents")
        .canonicalize().map_err(|e| e.to_string())?;
    let target = std::path::Path::new(&file_path).canonicalize().map_err(|e| e.to_string())?;
    if !target.starts_with(&allowed) || target.extension().and_then(|e| e.to_str()) != Some("docx") {
        return Err("مسار الملف غير مسموح".into());
    }
    let metadata = fs::metadata(&target).map_err(|e| e.to_string())?;
    if metadata.len() > 12 * 1024 * 1024 { return Err("حجم الملف يتجاوز الحد المسموح".into()); }
    let content = fs::read(&target).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(content))
}
#[tauri::command]
fn create_word_document(app: tauri::AppHandle, title: String, body: String, header: Vec<String>) -> Result<String, String> {
    use std::io::Write;
    if title.len() > 600 || body.len() > 150_000 || header.len() > 8 { return Err("وثيقة طويلة جدًا".into()); }
    let folder = app.path().app_data_dir().map_err(|e| e.to_string())?.join("word-documents");
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let clean_title: String = title.chars().filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_').take(55).collect();
    let clean_title = if clean_title.trim().is_empty() { "document" } else { clean_title.trim() };
    let unique = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
    let path = folder.join(format!("{}-{}.docx", clean_title, unique));
    let file = fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("[Content_Types].xml", opts).map_err(|e| e.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#).map_err(|e| e.to_string())?;
    zip.start_file("_rels/.rels", opts).map_err(|e| e.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#).map_err(|e| e.to_string())?;
    let mut paras = String::new();
    for h in header { paras.push_str(&word_heading(&h, false)); }
    paras.push_str(&word_paragraph("", false));
    paras.push_str(&word_heading(&title, true));
    paras.push_str(&word_paragraph("", false));
    let mut pending_rows: Vec<Vec<String>> = Vec::new();
    for line in body.lines() {
        if line.contains('|') {
            let parts: Vec<String> = line.split('|').map(|cell| cell.trim().to_string()).collect();
            // The school's approved dispatch form has three visible columns:
            // document type, quantity and notes (not the old serial-number column).
            let normalized = if title.contains("جدول إرسال") && parts.len() >= 4 {
                parts[1..4].to_vec()
            } else { parts };
            pending_rows.push(normalized);
        } else {
            if !pending_rows.is_empty() {
                paras.push_str(&word_table(&pending_rows));
                pending_rows.clear();
            }
            paras.push_str(&word_paragraph(line, false));
        }
    }
    if !pending_rows.is_empty() { paras.push_str(&word_table(&pending_rows)); }
    let document = format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>"#, paras);
    zip.start_file("word/document.xml", opts).map_err(|e| e.to_string())?;
    zip.write_all(document.as_bytes()).map_err(|e| e.to_string())?;
    zip.finish().map_err(|e| e.to_string())?;
    #[cfg(target_os="windows")]
    std::process::Command::new("cmd").args(["/C", "start", ""]).arg(&path)
        .spawn().map_err(|e| format!("تم إنشاء الملف لكن تعذر فتح Word: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn installed_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}


/** User-owned Word templates live in Windows Documents; generated documents never overwrite them. */
fn approved_templates_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let documents = app.path().document_dir().map_err(|e| e.to_string())?;
    let folder = documents.join("EcoleArchive").join("قوالب الوثائق");
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    Ok(folder)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserTemplateInfo { name: String, path: String }
#[tauri::command]
fn list_user_word_templates(app: tauri::AppHandle) -> Result<Vec<UserTemplateInfo>, String> {
    let folder = approved_templates_directory(&app)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(folder).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let valid = path.is_file()
            && path.extension().and_then(|x| x.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("docx"))
            && !path.file_name().and_then(|x| x.to_str()).unwrap_or("").starts_with("~$");
        if valid {
            out.push(UserTemplateInfo {
                name: path.file_name().unwrap().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
            });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}
#[tauri::command]
fn read_user_word_template(app: tauri::AppHandle, name: String) -> Result<String, String> {
    use base64::Engine;
    let basename = std::path::Path::new(&name);
    if basename.components().count() != 1 || basename.file_name().and_then(|v|v.to_str()) != Some(name.as_str())
        || !name.to_lowercase().ends_with(".docx") || name.starts_with("~$") {
        return Err("Invalid template filename".into());
    }
    let root = approved_templates_directory(&app)?;
    let path = root.join(name);
    if !path.is_file() { return Err("Template not found".into()); }
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > 20 * 1024 * 1024 { return Err("Template exceeds 20MB".into()); }
    let raw = fs::read(path).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(raw))
}
#[tauri::command]
fn user_word_template_folder(app: tauri::AppHandle) -> Result<String, String> {
    Ok(approved_templates_directory(&app)?.to_string_lossy().to_string())
}


/** Work on a generated copy in the temporary directory; the user's approved
 * Documents template is never opened for editing or overwritten. */
#[cfg(target_os="windows")]
fn print_docx_with_windows_dialog(path: &std::path::Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Controls::Dialogs::{PrintDlgW, PRINTDLGW, DEVNAMES, CommDlgExtendedError};
    use windows_sys::Win32::System::Memory::{GlobalLock, GlobalUnlock};
    #[link(name = "kernel32")]
    unsafe extern "system" { fn GlobalFree(memory: *mut std::ffi::c_void) -> *mut std::ffi::c_void; }
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

    let mut dialog: PRINTDLGW = unsafe { std::mem::zeroed() };
    dialog.lStructSize = std::mem::size_of::<PRINTDLGW>() as u32;
    dialog.nCopies = 1;
    dialog.Flags = 0x0000_0008 | 0x0008_0000; // PD_NOSELECTION | PD_DISABLEPRINTTOFILE
    let accepted = unsafe { PrintDlgW(&mut dialog) } != 0;
    if !accepted {
        let code = unsafe { CommDlgExtendedError() };
        if code != 0 { return Err(format!("تعذر فتح نافذة الطباعة (رمز {})", code)); }
        return Ok(()); // user cancelled; no printing
    }

    let printer = unsafe {
        if dialog.hDevNames.is_null() { None } else {
            let memory = GlobalLock(dialog.hDevNames);
            if memory.is_null() { None } else {
                let names = &*(memory as *const DEVNAMES);
                let wide = (memory as *const u16).add(names.wDeviceOffset as usize);
                let len = (0..1024).position(|i| *wide.add(i) == 0);
                let selected = len.map(|n| String::from_utf16_lossy(std::slice::from_raw_parts(wide, n)));
                GlobalUnlock(dialog.hDevNames);
                selected
            }
        }
    };
    unsafe {
        if !dialog.hDevNames.is_null() { GlobalFree(dialog.hDevNames); }
        if !dialog.hDevMode.is_null() { GlobalFree(dialog.hDevMode); }
    }
    let selected = printer.filter(|n| !n.trim().is_empty()).ok_or("لم نتمكن من تحديد الطابعة المختارة")?;
    // Word's registered printto verb receives the printer explicitly. No PowerShell or visible console.
    let pathname: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let action: Vec<u16> = "printto".encode_utf16().chain(std::iter::once(0)).collect();
    let args: Vec<u16> = format!("\"{}\"", selected.replace('"', ""))
        .encode_utf16().chain(std::iter::once(0)).collect();
    let result = unsafe {
        ShellExecuteW(std::ptr::null_mut(), action.as_ptr(), pathname.as_ptr(),
            args.as_ptr(), std::ptr::null(), SW_HIDE)
    };
    if (result as isize) <= 32 {
        return Err(format!("تعذر إرسال الوثيقة للطابعة المختارة (Windows: {}). تحقق من دعم Word للطباعة المباشرة.", result as isize));
    }
    Ok(())
}

#[tauri::command]
fn open_generated_docx(base64: String, file_name: String, print: bool) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64).map_err(|_| "Invalid DOCX payload")?;
    if bytes.len() < 16 || bytes.len() > 20 * 1024 * 1024
        || !bytes.starts_with(b"PK") || !file_name.to_lowercase().ends_with(".docx") {
        return Err("Invalid generated Word file".into());
    }
    let checksum = format!("{:x}", Sha256::digest(&bytes));
    let dir = std::env::temp_dir().join("EcoleArchive").join("word-preview");
    fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
    let path = dir.join(format!("document-{}.docx", &checksum[..24]));
    fs::write(&path, bytes).map_err(|e|e.to_string())?;
    #[cfg(target_os="windows")]
    {
        if print { return print_docx_with_windows_dialog(&path); }
        // ShellExecuteW opens the registered DOCX handler directly with no PowerShell
        // or visible console window. Word receives a generated temporary copy only.
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let path_w: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let verb: Vec<u16> = std::ffi::OsStr::new(if print { "print" } else { "open" })
            .encode_wide().chain(std::iter::once(0)).collect();
        let result = unsafe {
            ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), path_w.as_ptr(),
                std::ptr::null(), std::ptr::null(), SW_SHOWNORMAL)
        };
        if (result as isize) <= 32 {
            return Err(format!("تعذر فتح Word أو تشغيل الطباعة (Windows error {})", result as isize));
        }
        Ok(())
    }
    #[cfg(not(target_os="windows"))]
    { let _ = (path, print); Err("This feature requires Windows".into()) }
}

#[tauri::command]
async fn preview_generated_docx_pdf(base64: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || preview_generated_docx_pdf_blocking(base64))
        .await.map_err(|e| format!("Preview worker failed: {}", e))?
}


#[cfg(target_os="windows")]
struct WordPdfWorker {
    process: std::process::Child,
    stdin: std::process::ChildStdin,
    stdout: std::io::BufReader<std::process::ChildStdout>,
}
#[cfg(target_os="windows")]
static WORD_PDF_WORKER: std::sync::OnceLock<std::sync::Mutex<Option<WordPdfWorker>>> = std::sync::OnceLock::new();

#[cfg(target_os="windows")]
fn new_word_pdf_worker() -> Result<WordPdfWorker,String> {
    use std::process::{Command,Stdio};
    use std::os::windows::process::CommandExt;
    use std::io::Write;
    const CREATE_NO_WINDOW:u32=0x08000000;
    let dir=std::env::temp_dir().join("EcoleArchive").join("word-preview");
    fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
    let script_path=dir.join("word-pdf-worker.ps1");
    // Requests are base64-encoded UTF-8 paths, separated by TAB; ASCII OK/ERR
    // responses are the only output on stdout. Word remains alive between requests.
    let script=r#"$ErrorActionPreference='Stop'
$word=$null
try {
  $word=New-Object -ComObject Word.Application
  $word.Visible=$false
  $word.DisplayAlerts=0
  $word.ScreenUpdating=$false
  while ($null -ne ($request=[Console]::ReadLine())) {
    $doc=$null
    try {
      $p=$request.Split([char]9)
      if ($p.Length -ne 2) { throw 'Invalid request' }
      $source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[0]))
      $target=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[1]))
      $doc=$word.Documents.Open($source,$false,$true)
      $doc.ExportAsFixedFormat($target,17)
      [Console]::Out.WriteLine('OK')
    } catch {
      [Console]::Out.WriteLine('ERR '+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_.Exception.Message)))
    } finally {
      if ($null -ne $doc) { try { $doc.Close(0) } catch {} }
    }
    [Console]::Out.Flush()
  }
} finally {
  if ($null -ne $word) { try { $word.Quit() } catch {} }
}"#;
    fs::write(&script_path,script).map_err(|e|e.to_string())?;
    let mut process=Command::new("powershell.exe")
        .arg("-NoProfile").arg("-NonInteractive").arg("-WindowStyle").arg("Hidden")
        .arg("-File").arg(&script_path)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn().map_err(|e|format!("Word conversion worker: {}",e))?;
    let stdin=process.stdin.take().ok_or("Worker stdin missing")?;
    let stdout=std::io::BufReader::new(process.stdout.take().ok_or("Worker stdout missing")?);
    let _=&mut process;
    Ok(WordPdfWorker{process,stdin,stdout})
}

#[cfg(target_os="windows")]
fn word_pdf_worker_convert(docx:&std::path::Path,pdf:&std::path::Path)->Result<(),String>{
    use std::io::{BufRead,Write};
    use base64::Engine;
    let mutex=WORD_PDF_WORKER.get_or_init(||std::sync::Mutex::new(None));
    let mut guard=mutex.lock().map_err(|_|"Word worker lock poisoned")?;
    let encode=|path:&std::path::Path|base64::engine::general_purpose::STANDARD.encode(path.to_string_lossy().as_bytes());
    let request=format!("{}\t{}\n",encode(docx),encode(pdf));
    for retry in 0..2 {
        if guard.is_none(){*guard=Some(new_word_pdf_worker()?);}
        let worker=guard.as_mut().ok_or("Worker unavailable")?;
        if worker.stdin.write_all(request.as_bytes()).and_then(|_|worker.stdin.flush()).is_err(){
            if let Some(mut process)=guard.take(){let _=process.process.kill();let _=process.process.wait();}
            if retry==0 {continue;}return Err("Word worker stopped".into());
        }
        let mut answer=String::new();
        if worker.stdout.read_line(&mut answer).ok().filter(|n|*n>0).is_none(){
            if let Some(mut process)=guard.take(){let _=process.process.kill();let _=process.process.wait();}
            if retry==0 {continue;}return Err("Word worker did not respond".into());
        }
        if answer.trim()=="OK"{return Ok(());}
        let error=answer.trim().strip_prefix("ERR ").and_then(|s|base64::engine::general_purpose::STANDARD.decode(s).ok())
            .and_then(|v|String::from_utf8(v).ok()).unwrap_or_else(||"Word PDF conversion failed".into());
        return Err(error);
    }
    Err("Word conversion failed".into())
}

fn preview_generated_docx_pdf_blocking(base64: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64).map_err(|_| "Invalid DOCX payload")?;
    if bytes.len() < 16 || bytes.len() > 20 * 1024 * 1024 || !bytes.starts_with(b"PK") {
        return Err("Invalid Word document".into());
    }
    #[cfg(target_os="windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        let checksum = format!("{:x}", Sha256::digest(&bytes));
        let dir = std::env::temp_dir().join("EcoleArchive").join("word-preview");
        fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
        let docx = dir.join(format!("preview-{}.docx", &checksum[..24]));
        let pdf = dir.join(format!("preview-{}.pdf", &checksum[..24]));
        if !pdf.is_file() {
            fs::write(&docx, &bytes).map_err(|e|e.to_string())?;
            // A single PowerShell/Word COM worker is retained between documents.
            // Requests are serialized because Office COM is single-threaded.
            word_pdf_worker_convert(&docx, &pdf)?;
            if !pdf.is_file() {return Err("Word did not create the PDF".into());}
        }
        let result=fs::read(pdf).map_err(|e|e.to_string())?;
        if !result.starts_with(b"%PDF") {return Err("Invalid generated PDF".into())}
        Ok(base64::engine::general_purpose::STANDARD.encode(result))
    }
    #[cfg(not(target_os="windows"))]
    {let _=bytes;Err("Requires Windows with Microsoft Word".into())}
}


#[tauri::command]
fn open_generated_pdf(base64: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64).map_err(|_| "Invalid PDF payload")?;
    if bytes.len() < 8 || bytes.len() > 25 * 1024 * 1024 || !bytes.starts_with(b"%PDF") {
        return Err("Invalid PDF document".into());
    }
    #[cfg(target_os="windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let hash = format!("{:x}", Sha256::digest(&bytes));
        let dir = std::env::temp_dir().join("EcoleArchive").join("word-preview");
        fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
        let pdf = dir.join(format!("print-{}.pdf", &hash[..24]));
        fs::write(&pdf, bytes).map_err(|e|e.to_string())?;
        let filename: Vec<u16> = pdf.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let verb: Vec<u16> = std::ffi::OsStr::new("open").encode_wide().chain(std::iter::once(0)).collect();
        let result = unsafe { ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), filename.as_ptr(),
            std::ptr::null(), std::ptr::null(), SW_SHOWNORMAL) };
        if (result as isize) <= 32 {
            return Err(format!("تعذر فتح ملف PDF للطباعة (Windows error {})", result as isize));
        }
        Ok(())
    }
    #[cfg(not(target_os="windows"))]
    { let _ = bytes; Err("Requires Windows".into()) }
}

pub fn run() {
    tauri::Builder::default()
      .plugin(tauri_plugin_updater::Builder::new().build())
      .manage(UpdateProgressStore(std::sync::Arc::new(std::sync::Mutex::new(UpdateDownloadProgress { downloaded: 0, total: None, phase: "idle".into() }))))
      .invoke_handler(tauri::generate_handler![list_records,get_record,put_record,put_many_records,remove_record,clear_records,list_files,get_file,put_file,remove_file,clear_files,import_verified_backup,restore_verified_backup,check_desktop_update,install_desktop_update,get_update_download_progress,create_word_document,read_generated_word_document,installed_app_version,list_user_word_templates,read_user_word_template,user_word_template_folder,open_generated_docx,preview_generated_docx_pdf,open_generated_pdf])
      .run(tauri::generate_context!())
      .expect("Could not start school desktop app");
}

#[cfg(test)]
mod sqlite_tests {
    use super::*;

    #[test]
    fn schema_stores_and_restores_arabic_records() {
        let conn = Connection::open_in_memory().expect("memory SQLite");
        conn.execute_batch(SCHEMA).expect("schema initialization");
        let body = serde_json::json!({"id":"doc-1","title":"جدول الإرسال","reference":"أرش/001/2026"}).to_string();
        conn.execute("INSERT INTO records(collection,id,payload) VALUES(?1,?2,?3)",
            params!["documents","doc-1",&body]).expect("insert");
        let restored: String = conn.query_row(
            "SELECT payload FROM records WHERE collection=?1 AND id=?2",
            params!["documents","doc-1"], |r| r.get(0)
        ).expect("read");
        assert_eq!(serde_json::from_str::<serde_json::Value>(&restored).unwrap()["title"], "جدول الإرسال");
    }

    #[test]
    fn database_transaction_rolls_back_partial_import() {
        let mut conn = Connection::open_in_memory().expect("memory SQLite");
        conn.execute_batch(SCHEMA).expect("schema initialization");
        {
            let tx = conn.transaction().expect("transaction");
            tx.execute("INSERT INTO records(collection,id,payload) VALUES('students','1','{\"id\":\"1\"}')",[]).unwrap();
            // No commit simulates a failed import.
        }
        let count:i64=conn.query_row("SELECT count(*) FROM records",[],|r|r.get(0)).unwrap();
        assert_eq!(count,0);
    }

    #[test]
    fn word_tables_preserve_rtl_and_navy_header() {
        let rows = vec![
            vec!["نوع الوثائق".to_string(), "العدد".to_string(), "ملاحظات".to_string()],
            vec!["محضر تنصيب".to_string(), "02".to_string(), String::new()],
        ];
        let xml = word_table(&rows);
        assert!(xml.contains("<w:bidiVisual/>"));
        assert!(xml.contains("174875"));
        assert!(xml.contains("محضر تنصيب"));
        assert!(word_heading("جدول إرسال", true).contains("w:jc"));
    }

    #[test]
    fn rejects_invalid_payloads_and_duplicate_ids() {
        let conn = Connection::open_in_memory().expect("memory SQLite");
        conn.execute_batch(SCHEMA).expect("schema initialization");
        assert!(conn.execute("INSERT INTO records(collection,id,payload) VALUES('students','1','not json')",[]).is_err());
        conn.execute("INSERT INTO records(collection,id,payload) VALUES('students','1','{\"id\":\"1\"}')",[]).unwrap();
        assert!(conn.execute("INSERT INTO records(collection,id,payload) VALUES('students','1','{\"id\":\"1\"}')",[]).is_err());
    }
}
