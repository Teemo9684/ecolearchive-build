import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { repo, uid } from "@/lib/db/idb";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/bits";
import { useCollection } from "@/lib/db/hooks";
import type { StaffRecord, Staff } from "@/lib/db/types";

export const Route = createFileRoute("/admin-files")({ component: AdministrativeFiles });
const LABELS:Record<string,string>={performance:"المردودية",evaluation:"التنقيط",absence:"الغياب",leave:"العطل",training:"التكوين",decision:"القرارات"};
function AdministrativeFiles(){
 const records=useCollection<StaffRecord>("staffRecords");
 const teachers=useCollection<Staff>("teachers");
 const employees=useCollection<Staff>("employees");
 const [q,setQ]=useState("");
 const [staffId,setStaffId]=useState("");
 const [type,setType]=useState<StaffRecord["type"]>("performance");
 const [period,setPeriod]=useState("");
 const [score,setScore]=useState("");
 const [date,setDate]=useState(new Date().toISOString().slice(0,10));
 const [details,setDetails]=useState("");
 const people=useMemo(()=>new Map([...teachers.data,...employees.data].map(p=>[p.id,p])),[teachers.data,employees.data]);
 const save=async()=>{
  const staff=people.get(staffId);
  if(!staff||!period.trim()){toast.error("اختر العامل أو الأستاذ وحدد الفترة");return;}
  try {
   await repo<StaffRecord>("staffRecords").put({
    id:uid(),staffId,staffKind:staff.kind,type,period:period.trim(),date,dateEnd:"",score:score.trim(),details:details.trim(),createdAt:new Date().toISOString(),
   });
   setScore("");setDetails("");toast.success("تم حفظ السجل");
  }catch(e){toast.error("تعذر حفظ السجل: "+String(e));}
 };
 const rows=records.data.filter(r=>{
  const name=people.get(r.staffId)?.fullName||"";
  return [name,LABELS[r.type],r.period,r.details,r.score].join(" ").toLowerCase().includes(q.toLowerCase());
 }).sort((a,b)=>b.date.localeCompare(a.date));
 return <div dir="rtl" className="space-y-5">
  <PageHeader title="التنقيط والمردودية" />
  <section className="rounded-xl border bg-card p-5 shadow-sm">
   <h2 className="mb-3 font-bold">إضافة سجل تنقيط أو مردودية</h2>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <label className="space-y-1 text-sm">العامل أو الأستاذ
     <select className="field-select w-full" value={staffId} onChange={e=>setStaffId(e.target.value)}>
      <option value="">اختر المعني</option>
      {[...employees.data,...teachers.data].filter(s=>!s.deletedAt).map(s=><option key={s.id} value={s.id}>{s.fullName} — {s.kind==="employee"?"عامل":"أستاذ"}</option>)}
     </select>
    </label>
    <label className="space-y-1 text-sm">نوع السجل
     <select className="field-select w-full" value={type} onChange={e=>setType(e.target.value as StaffRecord["type"])}>
      <option value="performance">المردودية</option><option value="evaluation">التنقيط</option>
     </select>
    </label>
    <label className="space-y-1 text-sm">الفترة<Input value={period} onChange={e=>setPeriod(e.target.value)} placeholder="مثال: الثلاثي الأول 2026" /></label>
    <label className="space-y-1 text-sm">التاريخ<Input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
    <label className="space-y-1 text-sm">العلامة<Input value={score} onChange={e=>setScore(e.target.value)} /></label>
    <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-3">ملاحظات<Textarea value={details} onChange={e=>setDetails(e.target.value)} rows={2}/></label>
   </div>
   <Button className="mt-3" onClick={save}>حفظ السجل</Button>
  </section>
  <section className="rounded-xl border bg-card p-5 shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">السجلات الإدارية ({rows.length})</h2><Input className="max-w-xs" placeholder="بحث بالاسم أو الفترة..." value={q} onChange={e=>setQ(e.target.value)} /></div>
   {records.error?<p className="mt-3 text-destructive">{records.error}</p>:records.loading?<p className="mt-3">جار التحميل...</p>:rows.length===0?<p className="mt-4 text-muted-foreground">لا توجد سجلات. يمكن إضافة التنقيط والمردودية من ملف الأستاذ أو العامل.</p>:<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b text-right">{["الموظف","نوع الوثيقة","الفترة","التاريخ","العلامة","الملف"].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-b"><td className="p-3">{people.get(r.staffId)?.fullName||"ملف غير موجود"}</td><td className="p-3">{LABELS[r.type]||r.type}</td><td className="p-3">{r.period||"—"}</td><td className="p-3">{r.date||"—"}</td><td className="p-3">{r.score||"—"}</td><td className="p-3"><Link className="text-primary underline" to={r.staffKind==="teacher"?"/teachers/$id":"/employees/$id"} params={{id:r.staffId}}>عرض الملف</Link></td></tr>)}</tbody></table></div>}
  </section>
  <section className="rounded-xl border bg-card p-5"><h2 className="mb-2 font-bold">وثائق المؤسسة</h2><div className="flex gap-4 text-primary underline"><Link to="/archive">فتح الأرشيف</Link><Link to="/templates">إنشاء وثيقة</Link></div></section>
 </div>;
}
