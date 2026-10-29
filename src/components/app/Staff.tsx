import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Download, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Confirm, Empty, ErrorBox, Field, Loading, PageHeader, Pill } from "./bits";
import { DropZone, ImportDialog } from "./documents";
import { DocumentTable } from "./DocumentTable";
import { useCollection } from "@/lib/db/hooks";
import { repo, uid, nowIso } from "@/lib/db/idb";
import type { ArchiveCategory, DocumentRecord, Staff, StaffKind, StaffRecord, StaffRecordType } from "@/lib/db/types";
import { exportCsv, fmtDate } from "@/lib/files";
import { RECORD_TYPE, STAFF_STATUS } from "@/lib/labels";
import { logAudit } from "@/lib/services/audit";
import { cn } from "@/lib/utils";

const storeOf = (k: StaffKind): "teachers" | "employees" => (k === "teacher" ? "teachers" : "employees");
const T = (k: StaffKind) => k === "teacher"
  ? { title: "ملفات الأساتذة", one: "أستاذ", assign: "القسم المسند", list: "/teachers" as const }
  : { title: "ملفات العمال", one: "عامل", assign: "المصلحة / المهمة", list: "/employees" as const };

function StaffForm({ kind, value, onClose, all }: { kind: StaffKind; value: Staff | null; onClose: () => void; all: Staff[] }) {
  const [s, setS] = useState<Staff | null>(value);
  const [errs, setErrs] = useState<Partial<Record<string, string>>>({});
  if (!value) return null;
  const v = s ?? value;
  const save = async () => {
    const e: Partial<Record<string, string>> = {};
    if (v.fullName.trim().length < 3) e['fullName'] = "الاسم الكامل مطلوب";
    if (!v.employeeId.trim()) e['employeeId'] = "المعرف الوظيفي مطلوب";
    else if (all.some((x) => x.employeeId.trim() === v.employeeId.trim() && x.id !== v.id)) e['employeeId'] = "المعرف مستعمل مسبقا";
    if (!v.recruitmentDate) e['recruitmentDate'] = "تاريخ التوظيف مطلوب";
    if (v.phone && !/^[0-9+\s]{9,15}$/.test(v.phone)) e['phone'] = "رقم الهاتف غير صالح";
    setErrs(e);
    if (Object.keys(e).length) return;
    const isNew = !v.id;
    const item = { ...v, id: v.id || uid(), createdAt: v.createdAt || nowIso(), fullName: v.fullName.trim() };
    await repo<Staff>(storeOf(kind)).put(item);
    await logAudit(isNew ? "create" : "update", kind, item.id, item.fullName);
    toast.success(isNew ? "تمت الإضافة بنجاح" : "تم حفظ التعديلات");
    onClose();
  };
  const set = (p: Partial<Staff>) => setS({ ...v, ...p });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader className="text-start"><DialogTitle>{v.id ? "تعديل الملف" : `إضافة ${T(kind).one}`}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الاسم واللقب" error={errs['fullName']}><Input value={v.fullName} onChange={(e) => set({ fullName: e.target.value })} /></Field>
          <Field label="المعرف الوظيفي" error={errs['employeeId']}><Input value={v.employeeId} onChange={(e) => set({ employeeId: e.target.value })} /></Field>
          <Field label="تاريخ التوظيف" error={errs['recruitmentDate']}><Input type="date" value={v.recruitmentDate} onChange={(e) => set({ recruitmentDate: e.target.value })} /></Field>
          <Field label="الرتبة"><Input value={v.grade} onChange={(e) => set({ grade: e.target.value })} /></Field>
          <Field label={T(kind).assign}><Input value={v.assignment} onChange={(e) => set({ assignment: e.target.value })} /></Field>
          <Field label="الوضعية">
            <select className="field-select w-full" value={v.status} onChange={(e) => set({ status: e.target.value as Staff["status"] })}>
              {Object.entries(STAFF_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="الهاتف (اختياري)" error={errs['phone']}><Input dir="ltr" value={v.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="ملاحظات" className="sm:col-span-2"><Textarea rows={2} value={v.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={save}>حفظ</Button><Button variant="outline" onClick={onClose}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const blank = (kind: StaffKind): Staff => ({ id: "", kind, fullName: "", employeeId: "", recruitmentDate: "", grade: "", assignment: "", status: "active", phone: "", notes: "", deletedAt: null, createdAt: "" });

export function StaffList({ kind }: { kind: StaffKind }) {
  const t = T(kind);
  const { data, loading, error } = useCollection<Staff>(storeOf(kind));
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [bin, setBin] = useState(false);
  const [edit, setEdit] = useState<Staff | null>(null);
  const [del, setDel] = useState<Staff | null>(null);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.filter((x) => (bin ? !!x.deletedAt : !x.deletedAt) && (!status || x.status === status) &&
      (!s || [x.fullName, x.employeeId, x.grade, x.assignment].some((f) => f.toLowerCase().includes(s))))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
  }, [data, q, status, bin]);

  return (
    <div>
      <PageHeader title={t.title} subtitle="سجلات مهنية سرية — للاستعمال الإداري الداخلي فقط"
        actions={<>
          <Button onClick={() => setEdit(blank(kind))}><Plus className="h-4 w-4" />إضافة {t.one}</Button>
          <Button variant="outline" onClick={() => exportCsv([["الاسم", "المعرف", "تاريخ التوظيف", "الرتبة", t.assign, "الوضعية"], ...list.map((x) => [x.fullName, x.employeeId, fmtDate(x.recruitmentDate), x.grade, x.assignment, STAFF_STATUS[x.status]])], `${t.title}.csv`)}><Download className="h-4 w-4" />تصدير القائمة</Button>
        </>} />
      <div className="panel">
        <div className="flex flex-wrap gap-2 border-b p-3">
          <Input className="max-w-xs" placeholder="بحث بالاسم أو المعرف أو الرتبة..." value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="field-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الوضعيات</option>{Object.entries(STAFF_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label className="ms-auto flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={bin} onChange={(e) => setBin(e.target.checked)} />المحذوفون</label>
        </div>
        {error ? <div className="p-3"><ErrorBox error={error} /></div> : loading ? <Loading /> : list.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-start [&>th]:font-semibold"><th>الاسم واللقب</th><th>المعرف</th><th>الرتبة</th><th>{t.assign}</th><th>تاريخ التوظيف</th><th>الوضعية</th><th className="text-end">إجراءات</th></tr>
              </thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.id} className="border-t hover:bg-accent/40 [&>td]:px-3 [&>td]:py-2">
                    <td>{bin ? x.fullName : <Link to={kind === "teacher" ? "/teachers/$id" : "/employees/$id"} params={{ id: x.id }} className="font-semibold text-primary hover:underline">{x.fullName}</Link>}</td>
                    <td className="text-xs">{x.employeeId}</td><td className="text-xs">{x.grade}</td><td className="text-xs">{x.assignment}</td>
                    <td className="whitespace-nowrap text-xs">{fmtDate(x.recruitmentDate)}</td>
                    <td><Pill tone={x.status === "active" ? "success" : x.status === "leave" ? "gold" : "muted"}>{STAFF_STATUS[x.status]}</Pill></td>
                    <td><div className="flex justify-end gap-0.5">
                      {bin ? <Button size="sm" variant="outline" onClick={() => repo<Staff>(storeOf(kind)).put({ ...x, deletedAt: null }).then(() => toast.success("تمت الاستعادة"))}><RotateCcw className="h-3.5 w-3.5" />استعادة</Button> : <>
                        <Button size="icon" variant="ghost" onClick={() => setEdit(x)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDel(x)} title="حذف"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && <StaffForm key={edit.id || "new"} kind={kind} value={edit} all={data} onClose={() => setEdit(null)} />}
      <Confirm open={!!del} onOpenChange={(v) => !v && setDel(null)} title="حذف الملف؟" destructive confirmLabel="حذف"
        description={`سينقل ملف ${del?.fullName} إلى المحذوفين ويمكن استعادته، وتبقى سجلاته ووثائقه محفوظة.`}
        onConfirm={async () => { if (!del) return; await repo<Staff>(storeOf(kind)).put({ ...del, deletedAt: nowIso() }); await logAudit("delete", kind, del.id, del.fullName); toast.success("تم نقل الملف إلى المحذوفين"); setDel(null); }} />
    </div>
  );
}

const TABS: ("profile" | StaffRecordType | "docs")[] = ["profile", "performance", "evaluation", "absence", "leave", "training", "docs"];
const TAB_LABEL: Record<string, string> = { profile: "الملف المهني", ...RECORD_TYPE, docs: "القرارات والوثائق" };

export function StaffProfile({ kind, id }: { kind: StaffKind; id: string }) {
  const t = T(kind);
  const { data, loading } = useCollection<Staff>(storeOf(kind));
  const { data: recs } = useCollection<StaffRecord>("staffRecords");
  const { data: docs } = useCollection<DocumentRecord>("documents");
  const { data: cats } = useCollection<ArchiveCategory>("archiveCategories");
  const [tab, setTab] = useState<(typeof TABS)[number]>("profile");
  const [edit, setEdit] = useState<Staff | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const s = data.find((x) => x.id === id);
  if (loading) return <Loading />;
  if (!s) return <div><Empty text="الملف غير موجود" /><div className="text-center"><Link to={t.list} className="text-primary">العودة إلى القائمة</Link></div></div>;
  const myDocs = docs.filter((d) => d.relatedId === s.id && !d.deletedAt);

  return (
    <div>
      <Link to={t.list} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowRight className="h-4 w-4" />{t.title}</Link>
      <div className="panel mb-4 flex flex-wrap items-center gap-4 p-4">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">{s.fullName.charAt(0)}</div>
        <div className="flex-1">
          <div className="text-lg font-bold">{s.fullName}</div>
          <div className="text-sm text-muted-foreground">{s.grade} · {s.assignment} · {s.employeeId}</div>
        </div>
        <Pill tone={s.status === "active" ? "success" : "gold"}>{STAFF_STATUS[s.status]}</Pill>
        <Link to="/archive" hash={`related:${kind}:${s.id}`} className="rounded-lg border px-3 py-2 text-sm font-semibold text-primary hover:bg-muted">وثائق الملف في الأرشيف</Link>
        <Button variant="outline" onClick={() => setEdit(s)}><Pencil className="h-4 w-4" />تعديل</Button>
      </div>
      <div className="panel">
        <div className="flex gap-1 overflow-x-auto border-b px-3 pt-3">
          {TABS.map((k) => (
            <button key={k} onClick={() => setTab(k)} className={cn("whitespace-nowrap rounded-t-md px-3 py-2 text-sm", tab === k ? "border-b-2 border-gold font-bold text-primary" : "text-muted-foreground")}>
              {TAB_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === "profile" && (
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              {[["الاسم واللقب", s.fullName], ["المعرف الوظيفي", s.employeeId], ["تاريخ التوظيف", fmtDate(s.recruitmentDate)], ["الرتبة", s.grade], [t.assign, s.assignment], ["الوضعية", STAFF_STATUS[s.status]], ["الهاتف", s.phone || "—"], ["ملاحظات", s.notes || "—"]].map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold">{v}</dd></div>
              ))}
            </dl>
          )}
          {tab === "docs" && (
            <div className="space-y-3">
              <DropZone compact onFiles={setFiles} />
              <DocumentTable docs={myDocs} cats={cats} />
            </div>
          )}
          {tab !== "profile" && tab !== "docs" && <RecordsTab staff={s} type={tab} recs={recs.filter((r) => r.staffId === s.id && r.type === tab)} />}
        </div>
      </div>
      {edit && <StaffForm kind={kind} value={edit} all={data} onClose={() => setEdit(null)} />}
      <ImportDialog files={files} onClose={() => setFiles([])} relatedType={kind} relatedId={s.id} defaultCategory="cat-9" />
    </div>
  );
}

function RecordsTab({ staff, type, recs }: { staff: Staff; type: StaffRecordType; recs: StaffRecord[] }) {
  const hasScore = type === "performance" || type === "evaluation";
  const hasEnd = type === "leave" || type === "absence";
  const [edit, setEdit] = useState<StaffRecord | null>(null);
  const [err, setErr] = useState("");
  const [del, setDel] = useState<StaffRecord | null>(null);
  const save = async () => {
    if (!edit) return;
    if (!edit.date) { setErr("التاريخ مطلوب"); return; }
    if (hasEnd && edit.dateEnd && edit.dateEnd < edit.date) { setErr("تاريخ النهاية يجب أن يكون بعد تاريخ البداية"); return; }
    if (hasScore && edit.score && (isNaN(Number(edit.score)) || Number(edit.score) < 0)) { setErr("العلامة يجب أن تكون رقما موجبا"); return; }
    const item = { ...edit, id: edit.id || uid(), createdAt: edit.createdAt || nowIso() };
    await repo<StaffRecord>("staffRecords").put(item);
    await logAudit("save", "staffRecord", item.id, `${RECORD_TYPE[type]} - ${staff.fullName}`);
    toast.success("تم حفظ السجل");
    setEdit(null);
  };
  const sorted = [...recs].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">سجل {RECORD_TYPE[type]} — الوثائق الداعمة ترفق من تبويب القرارات والوثائق</div>
        <Button size="sm" onClick={() => { setErr(""); setEdit({ id: "", staffId: staff.id, staffKind: staff.kind, type, period: "", date: new Date().toISOString().slice(0, 10), dateEnd: "", score: "", details: "", createdAt: "" }); }}><Plus className="h-4 w-4" />إضافة</Button>
      </div>
      {sorted.length === 0 ? <Empty text="لا توجد سجلات" /> : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground"><tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-start"><th>الفترة</th><th>التاريخ</th>{hasEnd && <th>إلى</th>}{hasScore && <th>العلامة</th>}<th>التفاصيل</th><th /></tr></thead>
            <tbody>{sorted.map((r) => (
              <tr key={r.id} className="border-t [&>td]:px-3 [&>td]:py-2">
                <td>{r.period || "—"}</td><td className="text-xs">{fmtDate(r.date)}</td>{hasEnd && <td className="text-xs">{fmtDate(r.dateEnd)}</td>}{hasScore && <td className="font-bold">{r.score || "—"}</td>}<td>{r.details}</td>
                <td><div className="flex justify-end gap-0.5">
                  <Button size="icon" variant="ghost" onClick={() => { setErr(""); setEdit(r); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDel(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent dir="rtl">
          <DialogHeader className="text-start"><DialogTitle>{RECORD_TYPE[type]}</DialogTitle></DialogHeader>
          {edit && <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الفترة"><Input value={edit.period} onChange={(e) => setEdit({ ...edit, period: e.target.value })} placeholder="مثال: الفصل الأول 2026-2027" /></Field>
            <Field label={hasEnd ? "من تاريخ" : "التاريخ"}><Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            {hasEnd && <Field label="إلى تاريخ"><Input type="date" value={edit.dateEnd} onChange={(e) => setEdit({ ...edit, dateEnd: e.target.value })} /></Field>}
            {hasScore && <Field label="العلامة"><Input inputMode="decimal" value={edit.score} onChange={(e) => setEdit({ ...edit, score: e.target.value })} /></Field>}
            <Field label="التفاصيل" className="sm:col-span-2"><Textarea rows={3} value={edit.details} onChange={(e) => setEdit({ ...edit, details: e.target.value })} /></Field>
            {err && <p className="text-sm text-destructive sm:col-span-2">{err}</p>}
          </div>}
          <DialogFooter className="gap-2 sm:justify-start"><Button onClick={save}>حفظ</Button><Button variant="outline" onClick={() => setEdit(null)}>إلغاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Confirm open={!!del} onOpenChange={(v) => !v && setDel(null)} title="حذف السجل؟" destructive confirmLabel="حذف"
        description="سيحذف هذا السجل نهائيا. يسجل الحذف في سجل العمليات."
        onConfirm={async () => { if (!del) return; await repo("staffRecords").remove(del.id); await logAudit("delete", "staffRecord", del.id, `${RECORD_TYPE[type]} - ${staff.fullName}`); toast.success("تم الحذف"); setDel(null); }} />
    </div>
  );
}
