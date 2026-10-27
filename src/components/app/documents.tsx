import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, FileUp, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./bits";
import { useCollection, useSettings } from "@/lib/db/hooks";
import type { AcademicYear, ArchiveCategory, DocumentRecord, RelatedType } from "@/lib/db/types";
import { ACCEPT, MAX_FILE_MB, formatSize } from "@/lib/files";
import { downloadDocument, getFile, importPrepared, prepareFiles, updateDocument, type PreparedFile } from "@/lib/services/documents";

export function DropZone({ onFiles, compact }: { onFiles: (f: File[]) => void; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = Array.from(e.dataTransfer.files); if (f.length) onFiles(f); }}
      onClick={() => ref.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center transition-colors ${over ? "border-gold bg-gold/10" : "border-border hover:border-primary/40"} ${compact ? "p-4" : "p-8"}`}
    >
      <Upload className="h-6 w-6 text-primary" />
      <div className="text-sm font-semibold">اسحب الملفات هنا أو انقر للاختيار</div>
      <div className="text-xs text-muted-foreground">PDF، وورد، إكسل، صور — حتى {MAX_FILE_MB} م.ب للملف. يتم حفظ نسخة فقط، ولا يعدل الملف الأصلي.</div>
      <input ref={ref} type="file" multiple accept={ACCEPT} className="hidden"
        onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) onFiles(f); e.target.value = ""; }} />
    </div>
  );
}

export function ImportDialog({
  files, onClose, relatedType = null, relatedId = null, defaultCategory,
}: { files: File[]; onClose: () => void; relatedType?: RelatedType | null; relatedId?: string | null; defaultCategory?: string }) {
  const settings = useSettings();
  const { data: cats } = useCollection<ArchiveCategory>("archiveCategories");
  const { data: years } = useCollection<AcademicYear>("academicYears");
  const [prepared, setPrepared] = useState<PreparedFile[] | null>(null);
  const [skipDup, setSkipDup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState({ categoryId: defaultCategory ?? "", subcategory: "", academicYear: settings.currentYear, tags: "", description: "", date: new Date().toISOString().slice(0, 10) });
  const [err, setErr] = useState("");

  useEffect(() => { if (files.length) { setPrepared(null); prepareFiles(files).then(setPrepared); } }, [files]);
  useEffect(() => { const first = cats[0]; if (!m.categoryId && first) setM((x) => ({ ...x, categoryId: defaultCategory ?? first.id })); }, [cats, defaultCategory, m.categoryId]);

  const submit = async () => {
    if (!m.categoryId) { setErr("يرجى اختيار التصنيف"); return; }
    if (!prepared) return;
    setBusy(true);
    try {
      const items = prepared.filter((p) => !(skipDup && p.duplicateOf));
      const n = await importPrepared(items, { ...m, tags: m.tags.split(/[,،]/).map((t) => t.trim()).filter(Boolean), relatedType, relatedId });
      toast.success(`تم استيراد ${n} ملف بنجاح`);
      onClose();
    } catch (e: any) {
      toast.error("تعذر الاستيراد: " + (e?.message ?? "خطأ غير معروف") + " — قد تكون مساحة التخزين ممتلئة");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={files.length > 0} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader className="text-start"><DialogTitle>استيراد وثائق ({files.length})</DialogTitle></DialogHeader>
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
          {!prepared && <div className="text-muted-foreground">جار حساب البصمة الرقمية وكشف التكرار...</div>}
          {prepared?.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{p.file.name}</span>
              <span className="text-xs text-muted-foreground">{formatSize(p.file.size)}</span>
              {p.tooLarge && <span className="text-xs text-destructive">حجم كبير جدا</span>}
              {p.duplicateOf && <span className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3 w-3" />مكرر: {p.duplicateOf.title}</span>}
            </div>
          ))}
        </div>
        {prepared?.some((p) => p.duplicateOf) && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} /> تجاهل الملفات المكررة
          </label>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="التصنيف" error={err}>
            <select className="field-select w-full" value={m.categoryId} onChange={(e) => setM({ ...m, categoryId: e.target.value })}>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="التصنيف الفرعي"><Input value={m.subcategory} onChange={(e) => setM({ ...m, subcategory: e.target.value })} placeholder="اختياري" /></Field>
          <Field label="السنة الدراسية">
            <select className="field-select w-full" value={m.academicYear} onChange={(e) => setM({ ...m, academicYear: e.target.value })}>
              {years.map((y) => <option key={y.id} value={y.label}>{y.label}</option>)}
            </select>
          </Field>
          <Field label="تاريخ الوثيقة"><Input type="date" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} /></Field>
          <Field label="الكلمات المفتاحية" className="sm:col-span-2"><Input value={m.tags} onChange={(e) => setM({ ...m, tags: e.target.value })} placeholder="مفصولة بفواصل" /></Field>
          <Field label="الوصف" className="sm:col-span-2"><Textarea rows={2} value={m.description} onChange={(e) => setM({ ...m, description: e.target.value })} /></Field>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={submit} disabled={busy || !prepared}>{busy ? "جار الاستيراد..." : "استيراد"}</Button>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PreviewDialog({ doc, onClose }: { doc: DocumentRecord | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [type, setType] = useState("");
  useEffect(() => {
    let u: string | null = null;
    setUrl(null); setText(null);
    if (doc) getFile(doc).then(async (f) => {
      if (!f) { setType("none"); return; }
      const t = f.type || doc.mimeType || "";
      setType(t);
      if (t.startsWith("text/")) setText(await f.blob.text());
      else { u = URL.createObjectURL(f.blob); setUrl(u); }
    });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [doc]);
  const canInline = type.startsWith("image/") || type === "application/pdf";
  return (
    <Dialog open={!!doc} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-4xl">
        <DialogHeader className="text-start"><DialogTitle className="pe-6">{doc?.title}</DialogTitle></DialogHeader>
        <div className="min-h-64 rounded-md border bg-muted/40">
          {type === "none" && <div className="p-8 text-center text-sm text-muted-foreground">لا يوجد ملف مرفق بهذه الوثيقة</div>}
          {text !== null && <pre className="whitespace-pre-wrap p-4 text-sm">{text}</pre>}
          {url && type.startsWith("image/") && <img src={url} alt={doc?.title} className="mx-auto max-h-[65vh]" />}
          {url && type === "application/pdf" && <iframe src={url} title="معاينة" className="h-[65vh] w-full" />}
          {url && !canInline && (
            <div className="p-8 text-center text-sm text-muted-foreground">المعاينة غير مدعومة لهذا النوع من الملفات في المتصفح (وورد/إكسل). يمكنك تنزيل الملف وفتحه ببرنامجه.</div>
          )}
        </div>
        <DialogFooter className="sm:justify-start">
          {doc?.fileId && <Button variant="outline" onClick={() => doc && downloadDocument(doc).catch((e) => toast.error(e.message))}><Download className="h-4 w-4" />تنزيل النسخة</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditDocDialog({ doc, onClose }: { doc: DocumentRecord | null; onClose: () => void }) {
  const { data: cats } = useCollection<ArchiveCategory>("archiveCategories");
  const { data: years } = useCollection<AcademicYear>("academicYears");
  const [d, setD] = useState<DocumentRecord | null>(doc);
  const [tags, setTags] = useState("");
  useEffect(() => { setD(doc); setTags(doc?.tags.join("، ") ?? ""); }, [doc]);
  if (!d) return null;
  const save = async () => {
    if (!d.title.trim()) { toast.error("عنوان الوثيقة مطلوب"); return; }
    await updateDocument({ ...d, title: d.title.trim(), tags: tags.split(/[,،]/).map((t) => t.trim()).filter(Boolean) });
    toast.success("تم حفظ بيانات الوثيقة");
    onClose();
  };
  return (
    <Dialog open={!!doc} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader className="text-start"><DialogTitle>تعديل البيانات الوصفية</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">تعديل العنوان لا يغير اسم الملف الأصلي: {d.fileName ?? "—"}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="العنوان" className="sm:col-span-2"><Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
          <Field label="المرجع"><Input value={d.reference} onChange={(e) => setD({ ...d, reference: e.target.value })} /></Field>
          <Field label="التاريخ"><Input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
          <Field label="التصنيف">
            <select className="field-select w-full" value={d.categoryId} onChange={(e) => setD({ ...d, categoryId: e.target.value })}>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="التصنيف الفرعي"><Input value={d.subcategory} onChange={(e) => setD({ ...d, subcategory: e.target.value })} /></Field>
          <Field label="السنة الدراسية">
            <select className="field-select w-full" value={d.academicYear} onChange={(e) => setD({ ...d, academicYear: e.target.value })}>
              {years.map((y) => <option key={y.id} value={y.label}>{y.label}</option>)}
            </select>
          </Field>
          <Field label="الكلمات المفتاحية"><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
          <Field label="الوصف" className="sm:col-span-2"><Textarea rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={save}>حفظ</Button>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
