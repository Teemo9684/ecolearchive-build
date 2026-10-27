import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/bits";
import { useCollection } from "@/lib/db/hooks";
import type { ArchiveCategory, Correspondence, DocumentRecord, Staff } from "@/lib/db/types";
import { exportCsv } from "@/lib/files";
import { CORR_STATUS, STAFF_STATUS } from "@/lib/labels";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "التقارير والإحصائيات — منظومة الأرشيف المدرسي" },
      { name: "description", content: "إحصائيات مستخرجة من السجلات المخزنة." },
      { property: "og:title", content: "التقارير والإحصائيات" },
      { property: "og:description", content: "إحصائيات الوثائق والمراسلات والمستخدمين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reports,
});

const count = <T,>(arr: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  arr.forEach((x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1));
  return [...m.entries()].map(([name, value]) => ({ name, value }));
};

function Chart({ title, data, csv }: { title: string; data: { name: string; value: number }[]; csv: string }) {
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">{title}</h2>
        <Button size="sm" variant="ghost" className="no-print" onClick={() => exportCsv([["البند", "العدد"], ...data.map((d) => [d.name, d.value])], csv)}><Download className="h-4 w-4" />إكسل</Button>
      </div>
      <div className="h-56" dir="ltr">
        <ResponsiveContainer>
          <BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" /><XAxis dataKey="name" tick={{ fontSize: 11 }} reversed /><YAxis allowDecimals={false} orientation="right" tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" name="العدد" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} /></BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Reports() {
  const docs = useCollection<DocumentRecord>("documents").data.filter((d) => !d.deletedAt);
  const cats = useCollection<ArchiveCategory>("archiveCategories").data;
  const corr = useCollection<Correspondence>("correspondences").data.filter((c) => !c.deletedAt);
  const teachers = useCollection<Staff>("teachers").data.filter((s) => !s.deletedAt);
  const employees = useCollection<Staff>("employees").data.filter((s) => !s.deletedAt);
  const [year, setYear] = useState("");
  const years = [...new Set([...docs.map((d) => d.academicYear), ...corr.map((c) => c.academicYear)])].sort();
  const fd = year ? docs.filter((d) => d.academicYear === year) : docs;
  const fc = year ? corr.filter((c) => c.academicYear === year) : corr;
  const monthly = useMemo(() => {
    const m = new Map<string, { name: string; in: number; out: number }>();
    fc.forEach((c) => { const k = c.date.slice(0, 7); const e = m.get(k) ?? { name: k, in: 0, out: 0 }; e[c.direction]++; m.set(k, e); });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [fc]);

  return (
    <div>
      <PageHeader title="التقارير والإحصائيات"
        actions={<>
          <select className="field-select no-print" value={year} onChange={(e) => setYear(e.target.value)}><option value="">كل السنوات</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
          <Button variant="outline" className="no-print" onClick={() => window.print()}><Printer className="h-4 w-4" />طباعة / PDF</Button>
        </>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Chart title="الوثائق حسب السنة الدراسية" data={count(docs, (d) => d.academicYear)} csv="وثائق-حسب-السنة.csv" />
        <Chart title="الوثائق حسب التصنيف" data={count(fd, (d) => cats.find((c) => c.id === d.categoryId)?.name ?? "—")} csv="وثائق-حسب-التصنيف.csv" />
        <section className="panel p-4">
          <h2 className="mb-3 font-bold">حجم المراسلات الشهري</h2>
          <div className="h-56" dir="ltr"><ResponsiveContainer><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" /><XAxis dataKey="name" tick={{ fontSize: 11 }} reversed /><YAxis allowDecimals={false} orientation="right" /><Tooltip /><Legend /><Bar dataKey="in" name="وارد" fill="var(--color-chart-1)" /><Bar dataKey="out" name="صادر" fill="var(--color-chart-2)" /></BarChart></ResponsiveContainer></div>
        </section>
        <Chart title="المراسلات حسب الحالة" data={count(fc, (c) => CORR_STATUS[c.status])} csv="مراسلات-حسب-الحالة.csv" />
        <Chart title="المستخدمون حسب الفئة والوضعية" data={[...count(teachers, (s) => `أستاذ - ${STAFF_STATUS[s.status]}`), ...count(employees, (s) => `عامل - ${STAFF_STATUS[s.status]}`)]} csv="المستخدمون.csv" />
        <Chart title="الوثائق حسب الحالة" data={count(fd, (d) => (d.status === "active" ? "نشطة" : "مؤرشفة"))} csv="وثائق-حسب-الحالة.csv" />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">إحصائيات التلاميذ والأقسام والجرد ستضاف عند إنجاز وحداتها.</p>
    </div>
  );
}
