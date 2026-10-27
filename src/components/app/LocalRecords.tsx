import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/bits";
import { useCollection } from "@/lib/db/hooks";
import { repo, uid } from "@/lib/db/idb";
import { exportCsv } from "@/lib/files";
import type { InventoryItem, Student } from "@/lib/db/types";

type Field = { key: string; label: string; type?: string; required?: boolean };
const students: Field[] = [
  {key:"fullName",label:"اسم ولقب التلميذ",required:true},
  {key:"birthDate",label:"تاريخ الميلاد",type:"date",required:true},
  {key:"gender",label:"الجنس (m ذكر / f أنثى)",required:true},
  {key:"enrollmentYear",label:"السنة الدراسية"},
  {key:"status",label:"الحالة"}
];
const inventory: Field[] = [
  {key:"inventoryNumber",label:"رقم الجرد",required:true},
  {key:"name",label:"التجهيز أو العتاد",required:true},
  {key:"category",label:"الصنف"},
  {key:"location",label:"الموقع"},
  {key:"status",label:"الحالة"},
  {key:"acquisitionDate",label:"تاريخ الاقتناء",type:"date"},
  {key:"notes",label:"ملاحظات"}
];
type Data = Record<string,any> & {id:string;deletedAt?:string|null};
export function LocalRecords({kind}:{kind:"students"|"inventoryItems"}) {
 const isStudents=kind==="students", store=isStudents?"students":"inventoryItems";
 const fields=isStudents?students:inventory;
 const {data,loading,error}=useCollection<Data>(store);
 const [form,setForm]=useState<Record<string,string>>({}),[editing,setEditing]=useState<string|null>(null),[search,setSearch]=useState("");
 const [busy,setBusy]=useState(false);
 const [showDeleted,setShowDeleted]=useState(false);
 const update=(key:string,value:string)=>setForm(f=>({...f,[key]:value}));
 async function save(e:FormEvent) {
  e.preventDefault();
  if(busy)return;
  if(isStudents&&!["m","f"].includes(form.gender||"")){toast.error("الجنس لازم يكون m أو f");return;}
  const num=(form.inventoryNumber||"").trim();
  if(!isStudents&&data.some(x=>x.inventoryNumber===num&&!x.deletedAt&&x.id!==editing)){toast.error("رقم الجرد مستعمل من قبل");return;}
  setBusy(true);
  try {
   const values=Object.fromEntries(fields.map(f=>[f.key,(form[f.key]||"").trim()]));
   const old=editing?data.find(x=>x.id===editing):undefined;
   const record=isStudents?{...values,classId:old?.classId??null}:{...values,deletedAt:old?.deletedAt??null};
   await repo<Data>(store).put({...record,id:editing||uid()} as Data);
   setEditing(null);setForm({});toast.success("تم حفظ البيانات");
  }catch{toast.error("تعذر الحفظ، تحقق من مساحة التخزين");}
  finally{setBusy(false);}
 }
 const filtered=data.filter(x=>isStudents || (!!x.deletedAt===showDeleted)).filter(x=>Object.values(x).some(v=>typeof v==="string"&&v.toLowerCase().includes(search.toLowerCase())));
 const title=isStudents?"شؤون التلاميذ":"الجرد المدرسي";
 return <div className="space-y-6" dir="rtl">
  <PageHeader title={title} />
  {!isStudents&&<div className="flex gap-2"><Button variant="outline" onClick={()=>exportCsv([["رقم الجرد","التجهيز","الصنف","الموقع","الحالة","تاريخ الاقتناء","ملاحظات"],...data.filter(x=>!x.deletedAt).map(x=>[x.inventoryNumber,x.name,x.category,x.location,x.status,x.acquisitionDate,x.notes])],"سجل-الجرد.csv")}>تصدير الجرد إلى Excel</Button></div>}
  <section className="rounded-xl border bg-card p-5 shadow-sm">
   <h2 className="mb-4 font-bold">{editing?"تعديل السجل":"إضافة سجل جديد"}</h2>
   <form onSubmit={save} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {fields.map(f=><label key={f.key} className="space-y-1 text-sm"><span>{f.label}</span><Input value={form[f.key]||""} type={f.type||"text"} required={f.required} onChange={e=>update(f.key,e.target.value)} /></label>)}
    <div className="flex items-end gap-2"><Button disabled={busy} type="submit">{editing?"حفظ التعديل":"إضافة"}</Button>{editing&&<Button type="button" variant="outline" onClick={()=>{setEditing(null);setForm({});}}>إلغاء</Button>}</div>
   </form>
  </section>
  <section className="rounded-xl border bg-card p-5 shadow-sm">
   <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">السجلات ({filtered.length})</h2>{!isStudents&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showDeleted} onChange={e=>setShowDeleted(e.target.checked)}/>السجلات المحذوفة</label>}<Input aria-label="البحث في السجلات" className="max-w-xs" placeholder="ابحث بالاسم أو الرقم..." value={search} onChange={e=>setSearch(e.target.value)} /></div>
   {error?<p role="alert" className="text-destructive">{error}</p>:loading?<p>جار تحميل السجلات...</p>:filtered.length===0?<p className="text-muted-foreground">لا توجد سجلات مطابقة</p>:
    <div className="overflow-x-auto"><table className="w-full min-w-[550px] text-right text-sm"><thead><tr className="border-b">{(isStudents?["الاسم","تاريخ الميلاد","الجنس","السنة الدراسية"]:["رقم الجرد","التجهيز","الموقع","الحالة"]).map(t=><th key={t} className="p-3">{t}</th>)}<th className="p-3">إجراءات</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id} className="border-b">
    {(isStudents?[x.fullName,x.birthDate,x.gender==="m"?"ذكر":"أنثى",x.enrollmentYear]:[x.inventoryNumber,x.name,x.location,x.status]).map((v,i)=><td key={i} className="p-3">{v||"—"}</td>)}
    <td className="p-3 whitespace-nowrap">{showDeleted&&!isStudents?<Button variant="outline" size="sm" onClick={async()=>{await repo<Data>(store).put({...x,deletedAt:null});toast.success("تمت استعادة السجل");}}>استعادة</Button>:<><Button variant="outline" size="sm" onClick={()=>{setEditing(x.id);setForm(x);window.scrollTo({top:0,behavior:"smooth"});}}>تعديل</Button>{" "}<Button variant="outline" size="sm" onClick={async()=>{if(!window.confirm("نقل السجل إلى المحذوفات؟"))return;try{await repo<Data>(store).put({...x,deletedAt:new Date().toISOString()});toast.success("تم نقل السجل للمحذوفات");}catch{toast.error("تعذر الحذف");}}}>حذف</Button></>}</td></tr>)}</tbody></table></div>}
  </section>

 </div>;
}
