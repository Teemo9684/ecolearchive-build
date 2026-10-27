type OfficialDocument = {
  kind: string; title: string; body: string;
  headerLine: string; directorate: string; schoolName: string; city: string;
};
const safe = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const parsedRows = (body: string) => body.split(/\r?\n/).filter(line => line.includes("|"))
  .map(line => line.split("|").map(cell => cell.trim()))
  .filter(cells => cells.length >= 3 && !/^الرقم$|^نوع الوثائق$/.test(cells[0]))
  .map(cells => cells.length >= 4 ? [cells[1],cells[2],cells[3]] : cells.slice(0,3))
  .filter(cells => cells[0] !== "بيان الوثائق" && cells[0] !== "نوع الوثائق");

function transmittal(d: OfficialDocument): string {
  const rows=parsedRows(d.body);
  const lines=d.body.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const destination=lines.find(x=>x.startsWith("إلى السيد")) || "إلى السيد(ة): ........................";
  const department=lines.find(x=>x.startsWith("المصلحة")) || "";
  const ref=lines.find(x=>x.startsWith("رقم الإرسال")) || "رقم الإرسال: ........................";
  const subject=lines.find(x=>x.startsWith("الموضوع")) || "";
  const total=rows.length > 0 && rows.every(r=>/^\d+$/.test(r[1] || "")) ? rows.reduce((n,r)=>n+Number(r[1]),0) : null;
  const rowsHtml=rows.map(r=>"<tr><td>"+safe(r[0]||"")+"</td><td>"+safe(r[1]||"")+"</td><td>"+safe(r[2]||"")+"</td></tr>").join("");
  return `<header><strong>${safe(d.headerLine)}</strong><br><strong>وزارة التربية الوطنية</strong></header>
  <div class="letterhead"><div class="sender">${safe(d.directorate)}<br>${safe(d.schoolName)} — ${safe(d.city)}<br>${safe(ref)}</div>
  <div class="recipient">${safe(destination)}${department?"<br>"+safe(department):""}</div></div>
  <h1 class="title">جدول إرسال</h1>
  <table class="dispatch"><thead><tr><th>نوع الوثائق</th><th>العدد</th><th>ملاحظات</th></tr></thead>
  <tbody><tr class="intro"><td>تجدون رفقة هذا الإرسال:</td><td></td><td></td></tr>${rowsHtml || "<tr><td>........................</td><td>......</td><td></td></tr>"}
  <tr class="spacer"><td></td><td></td><td></td></tr></tbody>
  <tfoot><tr><td>المجموع</td><td>${total===null?"........":String(total).padStart(2,"0")}</td><td></td></tr></tfoot></table>
  ${subject?"<p class=\"subject\">"+safe(subject)+"</p>":""}
  <footer>${safe(d.city)} في: ........................<div class="signature">مديرة المدرسة<br><span>الإمضاء والختم</span></div></footer>`;
}
function plain(d:OfficialDocument): string {
 return `<header><strong>${safe(d.headerLine)}</strong><br>وزارة التربية الوطنية<br>${safe(d.directorate)}<br>${safe(d.schoolName)} — ${safe(d.city)}</header>
 <h1 class="title">${safe(d.title || d.kind)}</h1><article>${safe(d.body)}</article>
 <footer>${safe(d.city)} في: ........................<div class="signature">مديرة المدرسة<br><span>الإمضاء والختم</span></div></footer>`;
}
export function officialDocumentHtml(d: OfficialDocument): string {
 return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
 <title>${safe(d.title || d.kind)}</title><style>
 @page{size:A4;margin:16mm 15mm}
 *{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;background:#fff;color:#101c31;font-size:13px;line-height:1.8;margin:0}
 header{text-align:center;line-height:2.1;font-size:14px;padding:0 0 14px}header strong{font-size:15px;text-decoration:underline;text-underline-offset:5px}
 .letterhead{display:flex;justify-content:space-between;gap:24px;margin:15px 0 30px;align-items:flex-start;font-weight:600}
 .sender{width:54%;text-align:right}.recipient{width:42%;text-align:center;padding-top:20px}
 .title{font-size:24px;letter-spacing:0;text-align:center;width:max-content;max-width:90%;margin:18px auto 28px;padding:10px 45px;
 background:linear-gradient(180deg,#f0f6fd,#d0e0f3);border:1.5px solid #183e70;border-radius:12px;box-shadow:0 4px 9px #23466b22}
 .dispatch{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed;border:1px solid #1b416c;border-radius:6px;overflow:hidden}
 .dispatch th,.dispatch td{border-left:1px solid #40658d;border-bottom:1px solid #aac0d9;padding:9px 10px;vertical-align:top}
 .dispatch th:last-child,.dispatch td:last-child{border-left:0}
 .dispatch th{background:linear-gradient(#316da6,#103967);color:#fff;font-size:14px;text-align:center}
 .dispatch th:first-child{width:64%}.dispatch th:nth-child(2){width:13%}.dispatch th:last-child{width:23%}
 .dispatch td:nth-child(2){text-align:center;font-variant-numeric:tabular-nums}
 .dispatch tbody tr:nth-child(even):not(.spacer){background:#eef4fb}
 .dispatch .intro td{font-weight:600}
 .dispatch .spacer td{height:130px}
 .dispatch tfoot td{background:#d0e0f3;font-size:15px;font-weight:700;border-bottom:0}
 .subject{font-weight:600;margin:14px 0 0}article{white-space:pre-wrap;min-height:360px;margin:35px 12px}
 footer{margin-top:27px;text-align:left;min-height:120px;font-weight:600}
 .signature{margin-top:12px;min-height:95px;width:240px;text-align:center}
 .signature span{font-size:11px;color:#596779;font-weight:400}
 </style></head><body>${d.kind==="جدول إرسال"?transmittal(d):plain(d)}</body></html>`;
}
