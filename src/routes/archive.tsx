import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Copy, Download, ShieldCheck } from "lucide-react";
import { scanArchiveIntegrity, type IntegrityReport } from "@/lib/services/archiveIntegrity";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBox, Loading, PageHeader, Pill } from "@/components/app/bits";
import { DropZone, ImportDialog } from "@/components/app/documents";
import { DocumentTable } from "@/components/app/DocumentTable";
import { normalizeGeneratedReferences } from "@/lib/services/generatedArchive";
import { useCollection } from "@/lib/db/hooks";
import type { AcademicYear, ArchiveCategory, DocumentRecord } from "@/lib/db/types";
import { DOC_TYPE_LABEL, exportCsv, fmtDate } from "@/lib/files";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/archive")({
  head: () => ({
    meta: [
      { title: "الأرشيف الرقمي — منظومة الأرشيف المدرسي" },
      { name: "description", content: "استيراد وتصنيف وبحث ومعاينة الوثائق المؤرشفة للمدرسة." },
      { property: "og:title", content: "الأرشيف الرقمي" },
      { property: "og:description", content: "أرشيف هرمي للوثائق مع كشف التكرار وسلة المحذوفات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ArchivePage,
});

type Tab = "active" | "archived" | "bin" | "dups";

function ArchivePage() {
  const { data: docs, loading, error } = useCollection<DocumentRecord>("documents");
  const { data: cats } = useCollection<ArchiveCategory>("archiveCategories");
  const { data: years } = useCollection<AcademicYear>("academicYears");
  const [files, setFiles] = useState<File[]>([]);
  const [integrity,setIntegrity]=useState<IntegrityReport|null>(null);
  const [checking,setChecking]=useState(false);
  const checkIntegrity=async()=>{setChecking(true);try{setIntegrity(await scanArchiveIntegrity());}catch(e){toast.error("تعذر فحص سلامة الأرشيف: "+String(e));}finally{setChecking(false);}};
  useEffect(() => { normalizeGeneratedReferences().catch(console.warn); }, []);
  const hash = useRouterState({ select: s => s.location.hash });
  const [tab, setTab] = useState<Tab>(hash === "bin" ? "bin" : "active");
  useEffect(() => { if (hash === "bin") setTab("bin"); }, [hash]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [year, setYear] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState<"date-desc" | "date-asc" | "title">("date-desc");

  const dupGroups = useMemo(() => {
    const m = new Map<string, DocumentRecord[]>();
    docs.filter((d) => d.hash && !d.deletedAt).forEach((d) => m.set(d.hash!, [...(m.get(d.hash!) ?? []), d]));
    return [...m.values()].filter((g) => g.length > 1);
  }, [docs]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = docs.filter((d) =>
      tab === "bin" ? !!d.deletedAt : !d.deletedAt && (tab === "archived" ? d.status === "archived" : d.status === "active"),
    );
    if (tab === "dups") list = dupGroups.flat();
    if (cat) list = list.filter((d) => d.categoryId === cat);
    if (year) list = list.filter((d) => d.academicYear === year);
    if (type) list = list.filter((d) => d.docType === type);
    if (s) list = list.filter((d) => [d.title, d.reference, d.fileName, d.description, d.subcategory, ...d.tags].some((x) => x?.toLowerCase().includes(s)));
    return [...list].sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "ar") : sort === "date-asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  }, [docs, tab, cat, year, type, q, sort, dupGroups]);

  const counts = {
    active: docs.filter((d) => !d.deletedAt && d.status === "active").length,
    archived: docs.filter((d) => !d.deletedAt && d.status === "archived").length,
    bin: docs.filter((d) => d.deletedAt).length,
    dups: dupGroups.length,
  };
  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? "";

  const TABS: [Tab, string][] = [["active", "الوثائق النشطة"], ["archived", "المؤرشفة"], ["dups", "المكررات"], ["bin", "سلة المحذوفات"]];

  return (
    <div>
      <PageHeader title="الأرشيف الرقمي"
        actions={<><Button variant="outline" disabled={checking} onClick={checkIntegrity}><ShieldCheck className="h-4 w-4" />{checking?"جار الفحص…":"فحص سلامة الأرشيف"}</Button><Button variant="outline" onClick={() => exportCsv([["العنوان", "المرجع", "التصنيف", "السنة", "النوع", "التاريخ", "اسم الملف"], ...filtered.map((d) => [d.title, d.reference, catName(d.categoryId), d.academicYear, DOC_TYPE_LABEL[d.docType] ?? "", fmtDate(d.date), d.fileName ?? ""])], "فهرس-الأرشيف.csv")}>
          <Download className="h-4 w-4" />تصدير الفهرس</Button></>} />
      {integrity&&<section className="panel mt-3 p-4 text-sm" role="status"><h2 className="font-bold mb-2">نتائج فحص الأرشيف — {integrity.documents} وثيقة</h2>{([["ملفات مفقودة",integrity.missingFiles],["اختلاف بصمة الملفات",integrity.hashMismatches],["مراسلات غير مرتبطة",integrity.unlinkedCorrespondences],["مراجع مكررة",integrity.duplicateReferences]] as const).map(([label,items])=><div key={label} className="mb-1"><strong>{label}: {items.length}</strong>{items.length>0&&<ul className="list-disc ps-5">{items.slice(0,30).map((item,i)=><li key={i}>{item}</li>)}</ul>}</div>)}</section>}
      <DropZone onFiles={setFiles} />
      <ImportDialog files={files} onClose={() => setFiles([])} />

      <div className="panel mt-5">
        <div className="flex flex-wrap gap-1 border-b px-3 pt-3">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("rounded-t-md px-3 py-2 text-sm", tab === k ? "border-b-2 border-gold font-bold text-primary" : "text-muted-foreground hover:text-foreground")}>
              {l} <span className="text-xs opacity-70">({counts[k]})</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          <Input className="max-w-xs" placeholder="بحث في العنوان والمرجع والكلمات المفتاحية..." value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="field-select" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">كل التصنيفات</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="field-select" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">كل السنوات</option>{years.map((y) => <option key={y.id} value={y.label}>{y.label}</option>)}
          </select>
          <select className="field-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">كل الأنواع</option>{Object.entries(DOC_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="field-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="date-desc">الأحدث أولا</option><option value="date-asc">الأقدم أولا</option><option value="title">حسب العنوان</option>
          </select>
        </div>
        {tab === "dups" && (
          <div className="mx-3 mb-3 flex items-center gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <Copy className="h-4 w-4" /> تكشف المكررات عبر البصمة الرقمية SHA-256 لمحتوى الملف. لا يحذف أي ملف تلقائيا؛ راجع كل مجموعة وقرر يدويا.
            {dupGroups.length > 0 && <Pill tone="warning">{dupGroups.length} مجموعة</Pill>}
          </div>
        )}
        {tab === "bin" && <div className="mx-3 mb-3 rounded-md bg-muted p-3 text-xs text-muted-foreground">الوثائق في السلة قابلة للاستعادة. الحذف النهائي يزيل النسخة المخزنة في التطبيق فقط.</div>}
        {error ? <div className="p-3"><ErrorBox error={error} /></div> : loading ? <Loading /> : (
          <DocumentTable docs={filtered} cats={cats} mode={tab === "bin" ? "bin" : "active"} />
        )}
      </div>
    </div>
  );
}
