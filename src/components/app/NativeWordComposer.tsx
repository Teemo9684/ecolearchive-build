import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { extractApprovedDocxFields, renderApprovedDocxFile } from "@/lib/native-docx";
import { readApprovedTemplate } from "@/lib/approved-templates";
import { downloadBlob } from "@/lib/files";
import { importPrepared, prepareFiles } from "@/lib/services/documents";
import { useCollection, useSettings } from "@/lib/db/hooks";
import type { ArchiveCategory } from "@/lib/db/types";

/** Pilot: user-provided approved DOCX, no reconstructed HTML layout. */
export function NativeWordComposer() {
  const settings = useSettings();
  const { data: categories } = useCollection<ArchiveCategory>("archiveCategories");
  const [categoryId, setCategoryId] = useState("");
  const [source, setSource] = useState<File | null>(null);
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [fields, setFields] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string,string>>({});
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfFrame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!source || format !== "pdf") { setPdfUrl(null); return; }
    const url = URL.createObjectURL(source);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source, format]);
  const [recipients, setRecipients] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("ecolearchive-recipients") || "[]") as string[]; } catch { return []; }
  });
  const loadFile = async (file?: File) => {
    if (!file) return;
    try {
      const approved = await readApprovedTemplate(file);
      const names = approved.format === "docx" ? extractApprovedDocxFields(await file.arrayBuffer()) : [];
      if (approved.format === "docx" && !names.length) throw new Error("ما لقيناش الحقول. استعمل {اسم_الحقل} داخل قالب Word");
      setFormat(approved.format);
      setSource(file); setTitle(file.name.replace(/\.(docx|pdf)$/i,"")); setFields(names);
      setValues(Object.fromEntries(names.map(k => [k, ({ "المدرسة": settings.schoolName, "المدينة": settings.city, "الولاية": settings.wilaya, "المديرية": settings.directorate, "السنة_الدراسية": settings.currentYear, "التاريخ": new Date().toLocaleDateString("fr-DZ") } as Record<string, string>)[k] ?? ""])));
    } catch(e) { setSource(null); setFields([]); toast.error(String(e instanceof Error ? e.message : e)); }
  };
  const rememberRecipient = (value: string) => {
    const clean=value.trim();
    if (!clean || recipients.includes(clean)) return;
    const next=[...recipients,clean].sort((a,b)=>a.localeCompare(b,"ar"));
    setRecipients(next);
    try {localStorage.setItem("ecolearchive-recipients",JSON.stringify(next));}catch{/* optional */}
  };
  const create = async (archive: boolean) => {
    if (!source || busy) return;
    const missing=fields.find(k=>!values[k]?.trim());
    if (missing) {toast.error("أكمل الحقل: "+missing);return;}
    setBusy(true);
    try {
      const output = format === "docx"
        ? await renderApprovedDocxFile(source,values,title || "وثيقة")
        : new File([source], (title.trim() || "وثيقة").replace(/[\\/:*?"<>|]/g, "-") + ".pdf", {type:"application/pdf"});
      if (archive) {
        const category = categoryId || categories[0]?.id;
        if (!category) throw new Error("اختَر تصنيف الأرشيف قبل الحفظ");
        const prepared = await prepareFiles([output]);
        if (prepared[0]?.tooLarge) throw new Error("حجم الوثيقة يتجاوز الحد المسموح");
        if (prepared[0]?.duplicateOf) throw new Error("هذه النسخة موجودة بالفعل في الأرشيف");
        await importPrepared(prepared, {
          categoryId: category, subcategory: "", academicYear: settings.currentYear,
          tags: [], description: "نسخة من القالب الأصلي: " + source.name,
          date: new Date().toISOString().slice(0,10), relatedType: null, relatedId: null
        });
        // Save silently; archive list is the confirmation.
      } else downloadBlob(output,output.name);
      if(fields.includes("المرسل_إليه")) rememberRecipient(values["المرسل_إليه"]);
    } catch(e) {toast.error(String(e instanceof Error?e.message:e));}
    finally {setBusy(false);}
  };
  return <section className="panel mb-5 p-5" dir="rtl">
    <h2 className="text-lg font-bold mb-2">قوالب الوثائق المعتمدة — تجريبي</h2>
    <p className="text-sm text-muted-foreground mb-4">قالب Word يقبل تعبئة الحقول، وملف PDF يحفظ كما هو دون تعديل. المعاينة والطباعة الأصلية ما زالت قيد الاختبار.</p>
    <label className="block mb-3 text-sm">ملف القالب Word أو PDF
      <input type="file" accept=".docx,.pdf" className="block w-full mt-1" onChange={e=>void loadFile(e.target.files?.[0])}/>
    </label>
    {source && <>
      <label className="block text-sm mb-3">اسم الوثيقة
        <input className="field-select block w-full mt-1" value={title} onChange={e=>setTitle(e.target.value)}/>
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map(key=><label key={key} className="text-sm">{key}
          <input list={key==="المرسل_إليه"?"native-recipients":undefined} className="field-select block w-full mt-1" value={values[key]??""} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/>
        </label>)}
      </div>
      <datalist id="native-recipients">{recipients.map(r=><option key={r} value={r}/>)}</datalist>
      <label className="block text-sm mt-4">تصنيف الأرشيف
        <select className="field-select block w-full mt-1" value={categoryId || categories[0]?.id || ""} onChange={e=>setCategoryId(e.target.value)}>{categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
      </label>
      {pdfUrl && <iframe ref={pdfFrame} src={pdfUrl} title="معاينة PDF" className="w-full h-[55vh] mt-4 rounded border" />}
      <div className="flex flex-wrap gap-3 mt-5">
        <button type="button" disabled={busy} onClick={()=>void create(true)} className="rounded-lg bg-primary text-primary-foreground px-5 py-2 disabled:opacity-50">حفظ في الأرشيف</button>
        {format === "pdf" && <button type="button" disabled={!pdfUrl} onClick={() => { try { pdfFrame.current?.contentWindow?.focus(); pdfFrame.current?.contentWindow?.print(); } catch { toast.error("افتح ملف PDF للطباعة من قارئ PDF"); } }} className="rounded-lg border px-5 py-2 disabled:opacity-50">طباعة PDF</button>}
        <button type="button" disabled={busy} onClick={()=>void create(false)} className="rounded-lg border px-5 py-2 disabled:opacity-50">تحميل {format.toUpperCase()}</button>
      </div>
    </>}
  </section>;
}
