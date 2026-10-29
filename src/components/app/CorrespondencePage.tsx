import { Link } from "@tanstack/react-router";
import { preservePreviousWordVersion } from "@/lib/services/documentHistory";
import { printHtml } from "@/lib/printHtml";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Paperclip, Pencil, Plus, Printer, FileText, RotateCcw, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Confirm, Empty, ErrorBox, Field, Loading, PageHeader, Pill } from "./bits";
import { DropZone, ImportDialog } from "./documents";
import { DocumentTable } from "./DocumentTable";
import { useCollection, useSettings } from "@/lib/db/hooks";
import { repo, uid, nowIso } from "@/lib/db/idb";
import type { AcademicYear, ArchiveCategory, Correspondence, DocumentRecord, Settings } from "@/lib/db/types";
import { exportCsv, fmtDate } from "@/lib/files";
import { CORR_STATUS, PRIORITY } from "@/lib/labels";
import { logAudit } from "@/lib/services/audit";
import { syncCorrespondenceArchive } from "@/lib/services/correspondenceArchive";
import { sha256 } from "@/lib/files";
import type { DocumentFile } from "@/lib/db/types";

const empty = (dir: "in" | "out", year: string): Correspondence => ({
  id: "", direction: dir, reference: "", subject: "", party: "", date: new Date().toISOString().slice(0, 10),
  category: "المراسلات الإدارية", academicYear: year, priority: "normal", status: "pending", notes: "", deletedAt: null, createdAt: "",
});

function nextRef(list: Correspondence[], dir: "in" | "out", s: Settings) {
  const yr = new Date().getFullYear();
  const nums = list.filter(c => c.direction === dir && c.reference.endsWith("/" + yr)).map(c => Number(c.reference.split("/")[1])).filter(n => Number.isInteger(n) && n > 0);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${dir === "in" ? s.prefixIn : s.prefixOut}/${String(n).padStart(3, "0")}/${yr}`;
}

function printSlip(c: Correspondence, s: Settings) {
  const clean=(v:string)=>v.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  printHtml(`<html dir="rtl" lang="ar"><head><title>${clean(c.reference)}</title><style>body{font-family:Cairo,Tahoma,sans-serif;padding:40px;line-height:1.9}h1{text-align:center;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:20px}td{border:1px solid #333;padding:8px}.h{text-align:center;font-size:13px}</style></head><body>
  <div class="h">${clean(s.headerLine)}<br>${clean(s.directorate)}<br><b>${clean(s.schoolName)} — ${clean(s.city)}</b></div><hr>
  <h1>بطاقة ${c.direction === "in" ? "بريد وارد" : "بريد صادر"}</h1>
  <table><tr><td>رقم المرجع</td><td>${clean(c.reference)}</td></tr><tr><td>التاريخ</td><td>${fmtDate(c.date)}</td></tr>
  <tr><td>${c.direction === "in" ? "المرسل" : "المرسل إليه"}</td><td>${clean(c.party)}</td></tr><tr><td>الموضوع</td><td>${clean(c.subject)}</td></tr>
  <tr><td>الأولوية</td><td>${PRIORITY[c.priority]}</td></tr><tr><td>الحالة</td><td>${CORR_STATUS[c.status]}</td></tr><tr><td>ملاحظات</td><td>${clean(c.notes || "—")}</td></tr></table>
  <p style="margin-top:60px;text-align:left">مديرة المدرسة: ....................</p></body></html>`);
}


async function editSlipWord(c: Correspondence, s: Settings) {
  if (!("__TAURI_INTERNALS__" in window)) {
    toast.error("تحرير Word المباشر متوفر في نسخة Windows");
    return;
  }
  const native = window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args: unknown) => Promise<string> } };
  const rows = [
    "المرجع: " + c.reference, "التاريخ: " + fmtDate(c.date),
    (c.direction === "in" ? "المرسل: " : "المرسل إليه: ") + c.party,
    "الموضوع: " + c.subject,
    "الأولوية: " + PRIORITY[c.priority],
    "ملاحظات: " + (c.notes || "—"),
    "", "التوقيع: ........................",
  ];
  try {
    const path = await native.__TAURI_INTERNALS__.invoke("create_word_document", {
      title: (c.direction === "in" ? "بطاقة بريد وارد " : "مراسلة إدارية ") + c.reference,
      body: rows.join("\n"),
      header: [s.headerLine, "وزارة التربية الوطنية", s.directorate, s.schoolName + " — " + s.city],
    });
    const encoded=await native.__TAURI_INTERNALS__.invoke("read_generated_word_document",{filePath:path});
    const bytes=Uint8Array.from(atob(encoded),v=>v.charCodeAt(0));
    const blob=new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
    const fileId="corr-word-file-"+c.id;
    const hash=await sha256(blob);
    const name="مراسلة-"+c.reference.replace(/[\\/:*?"<>|]/g,"-")+".docx";
    await repo<DocumentFile>("documentFiles").put({id:fileId,blob,name,type:blob.type,hash:hash??""});
    const category=(await repo<ArchiveCategory>("archiveCategories").list()).find(x=>x.name==="المراسلات الإدارية");
    if(!category) throw new Error("تصنيف المراسلات الإدارية غير موجود");
    const doc:DocumentRecord={
      id:"corr-word-"+c.id,title:"Word — "+c.subject,reference:c.reference,
      categoryId:category.id,subcategory:"وثيقة Word مرتبطة بالبريد",academicYear:c.academicYear,
      docType:"word",tags:["مراسلة","Word"],description:"word-source-path:"+path,
      date:c.date,relatedType:"correspondence",relatedId:c.id,fileId,fileName:name,
      mimeType:blob.type,size:blob.size,hash,status:"active",deletedAt:c.deletedAt,
      createdAt:c.createdAt,updatedAt:nowIso(),
    };
    await repo<DocumentRecord>("documents").put(doc);
    toast.success("تم إنشاء Word وربطه بالمراسلة في الأرشيف");
  } catch(e) { toast.error("تعذر فتح Word: " + String(e)); }
}

async function syncCorrespondenceWord(c: Correspondence, document: DocumentRecord) {
  if (!window.__TAURI_INTERNALS__?.invoke) { toast.error("هذه الميزة خاصة ببرنامج Windows"); return; }
  const prefix="word-source-path:";
  if (!document.description.startsWith(prefix) || !document.fileId) {
    toast.error("لا يوجد ملف Word مرتبط قابل للمزامنة");return;
  }
  try {
    const encoded=await window.__TAURI_INTERNALS__.invoke("read_generated_word_document",{
      filePath: document.description.slice(prefix.length)
    }) as string;
    const bytes=Uint8Array.from(atob(encoded),ch=>ch.charCodeAt(0));
    const blob=new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
    const hash=await sha256(blob);
    await preservePreviousWordVersion(document,hash);
    await repo<DocumentFile>("documentFiles").put({
      id:document.fileId,name:document.fileName||"مراسلة.docx",blob,type:blob.type,hash:hash??""
    });
    await repo<DocumentRecord>("documents").put({
      ...document,size:blob.size,mimeType:blob.type,hash,updatedAt:nowIso()
    });
    toast.success("تم تحديث نسخة Word في أرشيف المراسلة "+c.reference);
  }catch(e){toast.error("تعذر مزامنة Word: "+String(e));}
}

export function CorrespondencePage({ direction }: { direction: "in" | "out" }) {
  const settings = useSettings();
  const { data, loading, error } = useCollection<Correspondence>("correspondences");
  const { data: years } = useCollection<AcademicYear>("academicYears");
  const { data: docs } = useCollection<DocumentRecord>("documents");
  const { data: cats } = useCollection<ArchiveCategory>("archiveCategories");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [year, setYear] = useState("");
  const [showBin, setShowBin] = useState(false);
  const [edit, setEdit] = useState<Correspondence | null>(null);
  const [errs, setErrs] = useState<Partial<Record<string, string>>>({});
  const [del, setDel] = useState<Correspondence | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const isIn = direction === "in";
  const title = isIn ? "البريد الوارد" : "البريد الصادر";
  const partyLabel = isIn ? "المرسل (المصدر)" : "المرسل إليه (الوجهة)";

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data
      .filter((c) => c.direction === direction && (showBin ? !!c.deletedAt : !c.deletedAt))
      .filter((c) => (!status || c.status === status) && (!priority || c.priority === priority) && (!year || c.academicYear === year))
      .filter((c) => !s || [c.reference, c.subject, c.party, c.notes].some((x) => x.toLowerCase().includes(s)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, direction, q, status, priority, year, showBin]);

  const open = (c?: Correspondence) => {
    setErrs({});
    setEdit(c ? { ...c } : { ...empty(direction, settings.currentYear), reference: nextRef(data, direction, settings) });
  };

  const save = async () => {
    if (!edit) return;
    const e: Partial<Record<string, string>> = {};
    if (!edit.reference.trim()) e['reference'] = "رقم المرجع مطلوب";
    else if (data.some((c) => c.direction === direction && c.reference.trim() === edit.reference.trim() && c.id !== edit.id)) e['reference'] = "رقم المرجع مستعمل مسبقا";
    if (!edit.subject.trim()) e['subject'] = "الموضوع مطلوب";
    if (!edit.party.trim()) e['party'] = "هذا الحقل مطلوب";
    if (!edit.date) e['date'] = "التاريخ مطلوب";
    setErrs(e);
    if (Object.keys(e).length) return;
    const isNew = !edit.id;
    const item = { ...edit, id: edit.id || uid(), createdAt: edit.createdAt || nowIso() };
    try {
      await repo<Correspondence>("correspondences").put(item);
      await syncCorrespondenceArchive(item, settings);
      await logAudit(isNew ? "create" : "update", "correspondence", item.id, item.reference).catch(console.warn);
    } catch (err) {
      toast.error("تعذر إكمال حفظ المراسلة وأرشفتها: " + (err instanceof Error ? err.message : String(err)));
      return;
    }
    if (isNew) setEdit(item); else setEdit(null);
  };

  const attachments = edit?.id ? docs.filter((d) => d.relatedType === "correspondence" && d.relatedId === edit.id && !d.deletedAt) : [];
  const docCount = (id: string) => docs.filter((d) => d.relatedType === "correspondence" && d.relatedId === id && !d.deletedAt).length;

  return (
    <div>
      <PageHeader title={title}
        actions={<>
          <Button onClick={() => open()}><Plus className="h-4 w-4" />تسجيل {isIn ? "بريد وارد" : "بريد صادر"}</Button>
          <Button variant="outline" onClick={() => exportCsv([["المرجع", "التاريخ", partyLabel, "الموضوع", "الأولوية", "الحالة", "السنة"], ...list.map((c) => [c.reference, fmtDate(c.date), c.party, c.subject, PRIORITY[c.priority], CORR_STATUS[c.status], c.academicYear])], `${title}.csv`)}><Download className="h-4 w-4" />تصدير إكسل</Button>
        </>} />
      <div className="panel">
        <div className="flex flex-wrap gap-2 border-b p-3">
          <Input className="max-w-xs" placeholder="بحث بالمرجع أو الموضوع أو الجهة..." value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="field-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الحالات</option>{Object.entries(CORR_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="field-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">كل الأولويات</option>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="field-select" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">كل السنوات</option>{years.map((y) => <option key={y.id} value={y.label}>{y.label}</option>)}
          </select>
          <label className="ms-auto flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={showBin} onChange={(e) => setShowBin(e.target.checked)} />المحذوفات</label>
        </div>
        {error ? <div className="p-3"><ErrorBox error={error} /></div> : loading ? <Loading /> : list.length === 0 ? <Empty text="لا توجد مراسلات" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-start [&>th]:font-semibold">
                  <th>المرجع</th><th>التاريخ</th><th>{isIn ? "المرسل" : "المرسل إليه"}</th><th>الموضوع</th><th>الأولوية</th><th>الحالة</th><th>مرفقات</th><th className="text-end">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-accent/40 [&>td]:px-3 [&>td]:py-2">
                    <td className="whitespace-nowrap font-semibold">{c.reference}</td>
                    <td className="whitespace-nowrap text-xs">{fmtDate(c.date)}</td>
                    <td className="text-xs">{c.party}</td>
                    <td className="max-w-72"><div className="truncate">{c.subject}</div></td>
                    <td><Pill tone={c.priority === "very_urgent" ? "destructive" : c.priority === "urgent" ? "warning" : "muted"}>{PRIORITY[c.priority]}</Pill></td>
                    <td><Pill tone={c.status === "pending" ? "gold" : c.status === "processed" ? "success" : "muted"}>{CORR_STATUS[c.status]}</Pill></td>
                    <td className="text-xs">{docCount(c.id) > 0 ? <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" />{docCount(c.id)}</span> : "—"}</td>
                    <td>
                      <div className="flex justify-end gap-0.5">
                        {showBin ? (
                          <Button size="sm" variant="outline" onClick={async () => { await repo<Correspondence>("correspondences").put({ ...c, deletedAt: null }); await syncCorrespondenceArchive({ ...c, deletedAt: null }, settings); }}><RotateCcw className="h-3.5 w-3.5" />استعادة</Button>
                        ) : (
                          <>
                            <Link to="/archive" hash={`related:correspondence:${c.id}`} className="rounded-md px-2 py-1.5 text-xs font-semibold text-primary hover:bg-muted" title="وثائق المراسلة في الأرشيف">الأرشيف</Link>
                            <Button size="icon" variant="ghost" title="تعديل" onClick={() => open(c)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" title="طباعة" onClick={() => printSlip(c, settings)}><Printer className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" title="تحرير في Word" onClick={() => editSlipWord(c, settings)}><FileText className="h-4 w-4" /></Button>
                            {docs.some(d=>d.id==="corr-word-"+c.id && d.description.startsWith("word-source-path:")) &&
                              <Button size="sm" variant="outline" title="حفظ تعديلات Word في الأرشيف" onClick={()=>{
                                const document=docs.find(d=>d.id==="corr-word-"+c.id);
                                if(document) void syncCorrespondenceWord(c,document);
                              }}>مزامنة Word</Button>}
                            <Button size="icon" variant="ghost" title="حذف" onClick={() => setDel(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent dir="rtl" className="max-w-3xl">
          <DialogHeader className="text-start"><DialogTitle>{edit?.id ? "تعديل مراسلة" : `تسجيل ${isIn ? "بريد وارد" : "بريد صادر"}`}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="رقم المرجع" error={errs['reference']}><Input value={edit.reference} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} /></Field>
              <Field label="التاريخ" error={errs['date']}><Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
              <Field label="الموضوع" error={errs['subject']} className="sm:col-span-2"><Input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></Field>
              <Field label={partyLabel} error={errs['party']}><Input value={edit.party} onChange={(e) => setEdit({ ...edit, party: e.target.value })} /></Field>
              <Field label="الصنف">
                <select className="field-select w-full" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                  {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="السنة الدراسية">
                <select className="field-select w-full" value={edit.academicYear} onChange={(e) => setEdit({ ...edit, academicYear: e.target.value })}>
                  {years.map((y) => <option key={y.id} value={y.label}>{y.label}</option>)}
                </select>
              </Field>
              <Field label="الأولوية">
                <select className="field-select w-full" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value as Correspondence["priority"] })}>
                  {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="الحالة">
                <select className="field-select w-full" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Correspondence["status"] })}>
                  {Object.entries(CORR_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="ملاحظات" className="sm:col-span-2"><Textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
              <div className="sm:col-span-2">
                <div className="mb-2 text-xs font-semibold text-muted-foreground">المرفقات</div>
                {edit.id ? (
                  <>
                    <DropZone compact onFiles={setFiles} />
                    {attachments.length > 0 && <div className="mt-2 rounded-md border"><DocumentTable docs={attachments} cats={cats} /></div>}
                  </>
                ) : <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">احفظ المراسلة أولا ثم أضف المرفقات.</div>}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={save}>حفظ</Button>
            <Button variant="outline" onClick={() => setEdit(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImportDialog files={files} onClose={() => setFiles([])} relatedType="correspondence" relatedId={edit?.id ?? null} defaultCategory="cat-1" />
      <Confirm open={!!del} onOpenChange={(v) => !v && setDel(null)} title="حذف المراسلة؟" destructive confirmLabel="حذف"
        description={`ستنقل المراسلة ${del?.reference} إلى المحذوفات ويمكن استعادتها.`}
        onConfirm={async () => { if (!del) return; const deleted = { ...del, deletedAt: nowIso() }; await repo<Correspondence>("correspondences").put(deleted); await syncCorrespondenceArchive(deleted, settings); await logAudit("delete", "correspondence", del.id, del.reference); setDel(null); }} />
    </div>
  );
}
