import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { FileText, GraduationCap, Inbox, Send, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Empty, PageHeader, Pill } from "@/components/app/bits";
import { PreviewDialog } from "@/components/app/documents";
import { useCollection } from "@/lib/db/hooks";
import type { Correspondence, DocumentRecord, Staff } from "@/lib/db/types";
import { fmtDate } from "@/lib/files";

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>): { q?: string | undefined } => ({ q: typeof s["q"] === "string" ? (s["q"] as string) : undefined }),
  head: () => ({
    meta: [
      { title: "البحث الشامل — منظومة الأرشيف المدرسي" },
      { name: "description", content: "بحث موحد في الوثائق والمراسلات والأساتذة والعمال." },
      { property: "og:title", content: "البحث الشامل" },
      { property: "og:description", content: "بحث في البيانات الوصفية وأسماء الملفات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

type Scope = "all" | "docs" | "mail" | "staff";

function SearchPage() {
  const { q: initial = "" } = Route.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState(initial);
  const [scope, setScope] = useState<Scope>("all");
  const [year, setYear] = useState("");
  const [preview, setPreview] = useState<DocumentRecord | null>(null);
  useEffect(() => setQ(initial), [initial]);
  const docs = useCollection<DocumentRecord>("documents").data;
  const corr = useCollection<Correspondence>("correspondences").data;
  const teachers = useCollection<Staff>("teachers").data;
  const employees = useCollection<Staff>("employees").data;

  const r = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    const m = (...f: (string | null | undefined)[]) => f.some((x) => x?.toLowerCase().includes(s));
    const staff = [...teachers, ...employees].filter((x) => !x.deletedAt);
    const staffName = (id: string | null) => staff.find((x) => x.id === id)?.fullName;
    return {
      docs: docs.filter((d) => !d.deletedAt && (!year || d.academicYear === year) && m(d.title, d.reference, d.fileName, d.description, d.academicYear, d.date, d.subcategory, staffName(d.relatedId), ...d.tags)),
      mail: corr.filter((c) => !c.deletedAt && (!year || c.academicYear === year) && m(c.reference, c.subject, c.party, c.notes, c.date, c.academicYear, c.category)),
      staff: staff.filter((x) => m(x.fullName, x.employeeId, x.grade, x.assignment)),
    };
  }, [q, year, docs, corr, teachers, employees]);
  const total = r ? r.docs.length + r.mail.length + r.staff.length : 0;
  const years = [...new Set([...docs.map((d) => d.academicYear), ...corr.map((c) => c.academicYear)])].sort();

  return (
    <div>
      <PageHeader title="البحث الشامل" subtitle="البحث حاليا في البيانات الوصفية وأسماء الملفات فقط؛ البحث داخل محتوى PDF والوورد مرحلة لاحقة، والوثائق الممسوحة ضوئيا تتطلب التعرف الضوئي على الحروف" />
      <div className="panel mb-4 flex flex-wrap gap-2 p-3">
        <Input autoFocus className="max-w-md" value={q} placeholder="عنوان، رقم، مرسل، اسم، تاريخ، كلمة مفتاحية..."
          onChange={(e) => { setQ(e.target.value); navigate({ to: "/search", search: { q: e.target.value }, replace: true }); }} />
        <select className="field-select" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
          <option value="all">الكل</option><option value="docs">الوثائق</option><option value="mail">المراسلات</option><option value="staff">المستخدمون</option>
        </select>
        <select className="field-select" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">كل السنوات</option>{years.map((y) => <option key={y}>{y}</option>)}
        </select>
        {r && <span className="self-center text-sm text-muted-foreground">{total} نتيجة</span>}
      </div>
      {!r ? <Empty text="اكتب كلمة للبحث" /> : total === 0 ? <Empty text="لا توجد نتائج مطابقة" /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {(scope === "all" || scope === "docs") && <Group title="الوثائق" count={r.docs.length}>
            {r.docs.map((d) => <button key={d.id} onClick={() => setPreview(d)} className="flex w-full items-start gap-2 px-3 py-2 text-start hover:bg-accent/50">
              <FileText className="mt-0.5 h-4 w-4 text-primary" /><div className="min-w-0"><div className="truncate text-sm font-semibold">{d.title}</div><div className="text-xs text-muted-foreground">{d.academicYear} · {fmtDate(d.date)} {d.status === "archived" && "· مؤرشف"}</div></div>
            </button>)}
          </Group>}
          {(scope === "all" || scope === "mail") && <Group title="المراسلات" count={r.mail.length}>
            {r.mail.map((c) => <Link key={c.id} to={c.direction === "in" ? "/mail/incoming" : "/mail/outgoing"} className="flex items-start gap-2 px-3 py-2 hover:bg-accent/50">
              {c.direction === "in" ? <Inbox className="mt-0.5 h-4 w-4 text-primary" /> : <Send className="mt-0.5 h-4 w-4 text-primary" />}
              <div className="min-w-0"><div className="truncate text-sm font-semibold">{c.subject}</div><div className="text-xs text-muted-foreground">{c.reference} · {c.party}</div></div>
            </Link>)}
          </Group>}
          {(scope === "all" || scope === "staff") && <Group title="الأساتذة والعمال" count={r.staff.length}>
            {r.staff.map((x) => <Link key={x.id} to={x.kind === "teacher" ? "/teachers/$id" : "/employees/$id"} params={{ id: x.id }} className="flex items-start gap-2 px-3 py-2 hover:bg-accent/50">
              {x.kind === "teacher" ? <GraduationCap className="mt-0.5 h-4 w-4 text-primary" /> : <Users className="mt-0.5 h-4 w-4 text-primary" />}
              <div><div className="text-sm font-semibold">{x.fullName}</div><div className="text-xs text-muted-foreground">{x.grade} · {x.assignment}</div></div>
            </Link>)}
          </Group>}
        </div>
      )}
      <PreviewDialog doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b px-3 py-2.5"><h2 className="font-bold">{title}</h2><Pill tone="primary">{count}</Pill></div>
      <div className="divide-y">{count ? children : <Empty text="لا نتائج" />}</div>
    </section>
  );
}
