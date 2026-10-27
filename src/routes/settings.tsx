import { inspectArchiveHealth, type ArchiveHealthReport } from "@/lib/services/archiveHealth";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, DatabaseBackup, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Confirm, Field, PageHeader, Pill } from "@/components/app/bits";
import { useCollection, useSettings } from "@/lib/db/hooks";
import { repo } from "@/lib/db/idb";
import type { AcademicYear, ArchiveCategory, AuditLog, DocumentRecord, Settings } from "@/lib/db/types";
import { exportFullBackup, restoreBackup, verifyBackup, type BackupCheck } from "@/lib/services/backup";
import { logAudit } from "@/lib/services/audit";
import { scanArchiveIntegrity, type IntegrityReport } from "@/lib/services/archiveIntegrity";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات والنسخ الاحتياطي — منظومة الأرشيف المدرسي" },
      { name: "description", content: "معلومات المؤسسة والسنوات الدراسية والتصنيفات والنسخ الاحتياطي." },
      { property: "og:title", content: "الإعدادات والنسخ الاحتياطي" },
      { property: "og:description", content: "إعدادات المنظومة والنسخ الاحتياطي الكامل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const current = useSettings();
  const [s, setS] = useState<Settings>(current);
  useEffect(() => setS(current), [current]);
  const { data: years } = useCollection<AcademicYear>("academicYears");
  const { data: cats } = useCollection<ArchiveCategory>("archiveCategories");
  const { data: docs } = useCollection<DocumentRecord>("documents");
  const { data: logs } = useCollection<AuditLog>("auditLogs");
  const [newYear, setNewYear] = useState("");
  const [newCat, setNewCat] = useState("");
  const [check, setCheck] = useState<BackupCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [availableUpdate, setAvailableUpdate] = useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthReport, setHealthReport] = useState<ArchiveHealthReport | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{downloaded:number;total:number|null;phase:string}|null>(null);
  const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const invokeDesktop = <T,>(command: string): Promise<T> => (window as unknown as { __TAURI_INTERNALS__: { invoke: (name: string) => Promise<T> } }).__TAURI_INTERNALS__.invoke(command);
  const checkUpdates = async () => {
    setUpdateBusy(true);
    try {
      const version = await invokeDesktop<string | null>("check_desktop_update");
      setAvailableUpdate(version);
      if (!version) toast.success("البرنامج محدّث، لا يوجد إصدار أحدث");
      else toast.success(`يتوفر التحديث ${version}`);
    } catch (err) {
      toast.error("تعذر فحص التحديثات. تحقق من اتصال الإنترنت: " + String(err));
    } finally { setUpdateBusy(false); }
  };
  const installUpdate = async () => {
    if (!availableUpdate || !window.confirm(`هل تريد تثبيت الإصدار ${availableUpdate}؟ احفظ عملك أولًا؛ البرنامج سيُعاد تشغيله.`)) return;
    setUpdateBusy(true);
    setDownloadProgress({downloaded:0,total:null,phase:"checking"});
    const poll=window.setInterval(()=>{
      invokeDesktop<{downloaded:number;total:number|null;phase:string}>("get_update_download_progress")
        .then(setDownloadProgress).catch(()=>{});
    },350);
    try { await invokeDesktop("install_desktop_update"); }
    catch (err) { toast.error("تعذر تثبيت التحديث: " + String(err)); setUpdateBusy(false); }
    finally {window.clearInterval(poll);}
  };


  const saveInfo = async () => {
    if (!s.schoolName.trim()) { toast.error("اسم المؤسسة مطلوب"); return; }
    await repo<Settings>("settings").put(s);
    await logAudit("update", "settings", "main", "تعديل الإعدادات");
    toast.success("تم حفظ الإعدادات");
  };
  const addYear = async () => {
    if (!/^\d{4}-\d{4}$/.test(newYear) || +newYear.slice(5) !== +newYear.slice(0, 4) + 1) { toast.error("صيغة السنة غير صحيحة، مثال: 2027-2028"); return; }
    if (years.some((y) => y.label === newYear)) { toast.error("السنة موجودة مسبقا"); return; }
    await repo<AcademicYear>("academicYears").put({ id: newYear, label: newYear, current: false });
    setNewYear(""); toast.success("أضيفت السنة الدراسية");
  };
  const setCurrent = async (label: string) => {
    await repo<AcademicYear>("academicYears").putMany(years.map((y) => ({ ...y, current: y.label === label })));
    await repo<Settings>("settings").put({ ...current, currentYear: label });
    toast.success(`السنة الحالية: ${label}`);
  };
  const addCat = async () => {
    if (!newCat.trim()) { toast.error("اسم التصنيف مطلوب"); return; }
    if (cats.some((c) => c.name === newCat.trim())) { toast.error("التصنيف موجود مسبقا"); return; }
    await repo<ArchiveCategory>("archiveCategories").put({ id: `cat-${Date.now()}`, name: newCat.trim(), parentId: null });
    setNewCat(""); toast.success("أضيف التصنيف");
  };
  const removeCat = async (c: ArchiveCategory) => {
    if (docs.some((d) => d.categoryId === c.id)) { toast.error("لا يمكن حذف تصنيف يحتوي على وثائق"); return; }
    await repo("archiveCategories").remove(c.id); toast.success("حذف التصنيف");
  };

  return (
    <div className="space-y-5">
      <PageHeader title="الإعدادات والنسخ الاحتياطي" />

      <section className="panel p-4">
        <h2 className="mb-3 font-bold">معلومات المؤسسة وترويسة الوثائق</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="اسم المؤسسة"><Input value={s.schoolName} onChange={(e) => setS({ ...s, schoolName: e.target.value })} /></Field>
          <Field label="البلدية / المدينة"><Input value={s.city} onChange={(e) => setS({ ...s, city: e.target.value })} /></Field>
          <Field label="الولاية"><Input value={s.wilaya} onChange={(e) => setS({ ...s, wilaya: e.target.value })} /></Field>
          <Field label="المديرية"><Input value={s.directorate} onChange={(e) => setS({ ...s, directorate: e.target.value })} /></Field>
          <Field label="سطر الترويسة"><Input value={s.headerLine} onChange={(e) => setS({ ...s, headerLine: e.target.value })} /></Field>
          <Field label="لغة القوائم">
            <select className="field-select w-full" value={s.locale} onChange={(e) => setS({ ...s, locale: e.target.value as Settings["locale"] })}>
              <option value="ar">العربية</option><option value="fr">Français (القوائم فقط)</option>
            </select>
          </Field>
          <Field label="بادئة ترقيم البريد الوارد"><Input value={s.prefixIn} onChange={(e) => setS({ ...s, prefixIn: e.target.value })} /></Field>
          <Field label="بادئة ترقيم البريد الصادر"><Input value={s.prefixOut} onChange={(e) => setS({ ...s, prefixOut: e.target.value })} /></Field>
        </div>
        <Button className="mt-4" onClick={saveInfo}>حفظ</Button>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="mb-3 font-bold">السنوات الدراسية</h2>
          <div className="mb-3 flex gap-2"><Input placeholder="2027-2028" value={newYear} onChange={(e) => setNewYear(e.target.value)} /><Button onClick={addYear}>إضافة</Button></div>
          <ul className="divide-y rounded-md border">
            {[...years].sort((a, b) => b.label.localeCompare(a.label)).map((y) => (
              <li key={y.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{y.label}</span>
                {current.currentYear === y.label ? <Pill tone="gold">السنة الحالية</Pill> : <Button size="sm" variant="ghost" onClick={() => setCurrent(y.label)}>تعيين كحالية</Button>}
              </li>
            ))}
          </ul>
        </section>
        <section className="panel p-4">
          <h2 className="mb-3 font-bold">تصنيفات الأرشيف</h2>
          <div className="mb-3 flex gap-2"><Input placeholder="اسم التصنيف" value={newCat} onChange={(e) => setNewCat(e.target.value)} /><Button onClick={addCat}>إضافة</Button></div>
          <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
            {cats.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                <span>{c.name} <span className="text-xs text-muted-foreground">({docs.filter((d) => d.categoryId === c.id).length})</span></span>
                <Button size="icon" variant="ghost" onClick={() => removeCat(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel p-4">
        <h2 className="mb-2 font-bold">فحص سلامة الأرشيف</h2>
        <Button variant="outline" disabled={scanning} onClick={async()=>{
          setScanning(true);
          try{setIntegrity(await scanArchiveIntegrity());}catch(e){toast.error("تعذر فحص الأرشيف: "+String(e));}
          finally{setScanning(false);}
        }}>{scanning?"جار فحص الملفات…":"فحص الأرشيف دون تعديل البيانات"}</Button>
        {integrity&&<div className="mt-3 space-y-1 text-sm">
          <div>الوثائق المفحوصة: {integrity.documents}</div>
          <div>ملفات مفقودة: {integrity.missingFiles.length} · بصمات غير مطابقة: {integrity.hashMismatches.length}</div>
          <div>مراسلات غير مرتبطة: {integrity.unlinkedCorrespondences.length} · أرقام أرشيف مكررة: {integrity.duplicateReferences.length}</div>
          {[...integrity.missingFiles,...integrity.hashMismatches,...integrity.unlinkedCorrespondences,...integrity.duplicateReferences].length>0&&
           <details className="mt-2"><summary className="cursor-pointer">عرض التفاصيل</summary>
             <ul className="mt-2 list-inside list-disc">{[...integrity.missingFiles,...integrity.hashMismatches,...integrity.unlinkedCorrespondences,...integrity.duplicateReferences].map((x,i)=><li key={i}>{x}</li>)}</ul>
           </details>}
        </div>}
      </section>
      <section className="panel p-4">
        <h2 className="mb-2 font-bold">فحص سلامة الأرشيف الرقمي</h2>
        <Button variant="outline" disabled={healthBusy} onClick={async()=>{
          setHealthBusy(true);
          try { setHealthReport(await inspectArchiveHealth()); }
          catch(e) { toast.error("تعذر فحص الأرشيف: "+String(e)); }
          finally { setHealthBusy(false); }
        }}>{healthBusy?"جار فحص الملفات…":"فحص سلامة الأرشيف"}</Button>
        {healthReport&&<div className="mt-3 space-y-2 text-sm" role="status">
          <p>الوثائق: {healthReport.checkedDocuments} · الملفات: {healthReport.checkedFiles} · المراسلات: {healthReport.checkedCorrespondences}</p>
          {healthReport.problems.length===0 ? <p className="text-success">لم يكشف الفحص عن مشاكل في الملفات والروابط التي تم التحقق منها.</p> :
            <div><p className="font-semibold text-destructive">تم العثور على {healthReport.problems.length} ملاحظة:</p>
              <ul className="list-disc space-y-1 ps-5">{healthReport.problems.map((problem,i)=><li key={i}>{problem}</li>)}</ul>
            </div>}
          <p className="text-xs text-muted-foreground">فحص للقراءة فقط، لم يتم تعديل أي سجل.</p>
        </div>}
      </section>

      <section className="panel p-4">
        <h2 className="mb-1 font-bold">النسخ الاحتياطي الكامل والاستعادة</h2>
        <p className="mb-3 text-sm text-muted-foreground">تشمل النسخة كل الجداول والملفات المرفقة مع بصمة SHA-256 لكل ملف للتحقق من السلامة عند الاستعادة. احفظها على قرص خارجي.</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={async () => { setBusy(true); try { await exportFullBackup(); toast.success("تم إنشاء النسخة الاحتياطية"); } catch (e: any) { toast.error("تعذر إنشاء النسخة: " + e.message); } setBusy(false); }}>
            <DatabaseBackup className="h-4 w-4" />إنشاء نسخة احتياطية كاملة
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />استعادة من نسخة</Button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f) return;
            try { setCheck(await verifyBackup(f)); } catch (err: any) { toast.error(err.message); }
          }} />
        </div>
        {check && (
          <div className="mt-3 rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold">
              {check.ok ? <ShieldCheck className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
              {check.ok ? "فحص السلامة ناجح" : `ملفات تالفة: ${check.corrupted.join("، ")}`} — بتاريخ {new Date(check.createdAt).toLocaleString("fr-DZ")}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">وثائق: {check.counts.documents} · ملفات: {check.counts.documentFiles} · مراسلات: {check.counts.correspondences} · أساتذة: {check.counts.teachers} · عمال: {check.counts.employees}</div>
          </div>
        )}
        <Confirm open={!!check} onOpenChange={(v) => !v && setCheck(null)} title="استعادة النسخة الاحتياطية؟" destructive confirmLabel="استبدال البيانات الحالية"
          description={`سيتم استبدال كل البيانات الحالية بمحتوى النسخة (${check?.counts.documents ?? 0} وثيقة، ${check?.counts.documentFiles ?? 0} ملف). ${check && !check.ok ? "تحذير: النسخة تحتوي ملفات تالفة. " : ""}ينصح بإنشاء نسخة من الوضع الحالي أولا.`}
          onConfirm={async () => { if (!check) return; setBusy(true); try { await restoreBackup(check); toast.success("تمت الاستعادة بنجاح"); } catch (e: any) { toast.error("فشلت الاستعادة: " + e.message); } setBusy(false); setCheck(null); }} />
      </section>

      {isDesktop && (
        <section className="panel p-4">
          <h2 className="mb-2 font-bold">تحديث البرنامج عن بُعد</h2>
          <p className="mb-3 text-sm text-muted-foreground">افحص الإصدارات الرسمية الموقّعة عند الاتصال بالإنترنت. لا يُثبَّت أي تحديث دون موافقتك. احفظ عملك وخذ نسخة احتياطية قبل تحديثات مهمة.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={updateBusy} onClick={checkUpdates}>{updateBusy ? "يرجى الانتظار…" : "البحث عن تحديثات"}</Button>
            {availableUpdate && <Button disabled={updateBusy} onClick={installUpdate}>تثبيت الإصدار {availableUpdate}</Button>}
            {downloadProgress && <span className="text-sm font-semibold tabular-nums" role="status">
              {downloadProgress.phase==="installing"?"جار تثبيت التحديث…":downloadProgress.phase==="checking"?"جار تحضير التحديث…":downloadProgress.total && downloadProgress.total>0
                ? Math.min(100,Math.floor(downloadProgress.downloaded/downloadProgress.total*100))+"%"
                :"جار التحميل…"}
            </span>}
          </div>
          {downloadProgress && <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar"
            aria-label="تقدم تحميل التحديث" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={downloadProgress.total ? Math.min(100,Math.floor(downloadProgress.downloaded/downloadProgress.total*100)):undefined}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{width:downloadProgress.total?Math.min(100,downloadProgress.downloaded/downloadProgress.total*100)+"%":"15%"}}/>
          </div>}
        </section>
      )}

      <section className="panel p-4">
        <h2 className="mb-1 font-bold">الأمان والصلاحيات</h2>
        <p className="text-sm text-muted-foreground">
          البنية مهيأة لدورين: مدير النظام والموظف المرخص. لم تفعل المصادقة في هذا النموذج عمدا، لأن تخزين كلمات المرور في المتصفح لا يوفر حماية حقيقية.
          المصادقة المحلية والتشفير أثناء التخزين يتطلبان تنفيذا أصليا في النسخة المكتبية ومراجعة للمخاطر قبل إدخال بيانات حقيقية. لا يرسل التطبيق أي بيانات إلى خوادم خارجية.
        </p>
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 font-bold">سجل العمليات (آخر 15)</h2>
        <ul className="divide-y text-sm">
          {[...logs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15).map((l) => (
            <li key={l.id} className="flex justify-between gap-2 py-1.5"><span>{l.summary}</span><span className="text-xs text-muted-foreground">{new Date(l.at).toLocaleString("fr-DZ")}</span></li>
          ))}
          {logs.length === 0 && <li className="py-2 text-muted-foreground">لا توجد عمليات بعد</li>}
        </ul>
      </section>
    </div>
  );
}
