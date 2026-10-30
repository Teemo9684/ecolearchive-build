import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Archive, Inbox, Send, Mail, Star, Trash2, Search, Paperclip, ShieldCheck, Plus, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/** The Gmail UI is intentionally disconnected until desktop OAuth is configured.
 * Never ship the Lovable cloud gateway keys or request a Google account password.
 */
export const Route = createFileRoute("/email")({ component: EmailCenter });
type Folder = "INBOX" | "STARRED" | "SENT" | "TRASH";
const folders: {id:Folder;label:string;icon:typeof Inbox}[] = [
  {id:"INBOX",label:"الوارد",icon:Inbox},
  {id:"STARRED",label:"المميزة",icon:Star},
  {id:"SENT",label:"المرسلة",icon:Send},
  {id:"TRASH",label:"المحذوفات",icon:Trash2},
];
function EmailCenter() {
  const [folder,setFolder]=useState<Folder>("INBOX");
  const [search,setSearch]=useState("");
  const [compose,setCompose]=useState(false);
  const [to,setTo]=useState("");
  const [subject,setSubject]=useState("");
  const [body,setBody]=useState("");

  const draft=()=>{
    if(to.trim()||subject.trim()||body.trim()){

      toast.info("لا يمكن إرسال الرسالة قبل ربط حساب Gmail؛ احتفظ بنصها خارج البرنامج إلى حين تفعيل الاتصال");
    }
    setCompose(false);
  };
  const [showSetup,setShowSetup]=useState(false);
  return <section className="space-y-5" dir="rtl">
    <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Mail className="h-7 w-7"/> البريد الإلكتروني</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gmail المدرسي</p>
      </div>
      <div className="flex flex-wrap gap-2"><button className="rounded-xl border px-4 py-3 font-semibold" onClick={()=>setShowSetup(v=>!v)}>ربط حساب Gmail</button><button className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground" onClick={()=>setCompose(true)}><Plus className="h-5 w-5"/> رسالة جديدة</button></div>
    </div>
    <div className="panel flex items-start gap-2 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/>
      <div className="text-sm"><strong>Gmail غير متصل بعد.</strong> يتم الربط عبر تسجيل الدخول الرسمي من Google على كمبيوتر المدرسة. لا تدخل كلمة مرور الحساب هنا؛ الإرسال والاستقبال غير متاحين حتى اكتمال الإعداد.</div>
    </div>
    {showSetup&&<div className="panel space-y-2 p-4 text-sm"><h2 className="font-bold">إعداد ربط Gmail الآمن</h2><p>يستلزم الربط إعداد Google OAuth 2.0 من نوع Desktop App، وإنشاء Client ID خاص بالمنظومة. تسجيل الدخول المباشر غير متاح حتى يكتمل اتصال Google API؛ هذا الزر لا يطلب كلمة السر ولا يرسل بيانات الحساب.</p><a className="text-primary underline" href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener noreferrer">إعداد Gmail API عبر Google Cloud</a></div>}
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="panel space-y-1 p-3">
        {folders.map(({id,label,icon:Icon})=><button key={id} onClick={()=>setFolder(id)} className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-right transition-colors ${folder===id?"bg-primary text-primary-foreground":"hover:bg-muted"}`}><Icon className="h-5 w-5"/><span>{label}</span></button>)}
        <Link to="/mail/incoming" className="mt-3 flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted"><Archive className="h-4 w-4"/> سجل المراسلات الإدارية</Link>
      </aside>
      <div className="panel min-h-[430px] overflow-hidden">
        <div className="flex items-center gap-2 border-b p-4">
          <Search className="h-5 w-5 text-muted-foreground"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} className="w-full bg-transparent outline-none" placeholder="البحث في Gmail" aria-label="البحث في Gmail" />
        </div>
        <div className="flex min-h-[330px] flex-col items-center justify-center gap-3 px-5 text-center text-muted-foreground">
          <Inbox className="h-12 w-12"/>
          <h2 className="font-semibold text-foreground">{folders.find(f=>f.id===folder)?.label}</h2>
          <p className="max-w-md text-sm">الرسائل الحقيقية تظهر هنا بعد ربط حساب Gmail. لم يتم تنزيل أي رسائل أو إرسال أي مراسلة.</p>
        </div>
      </div>
    </div>
    {compose&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="رسالة جديدة">
      <div className="panel w-full max-w-2xl space-y-3 p-5">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">رسالة جديدة</h2><button title="إغلاق" onClick={draft}><X/></button></div>
        <label className="block text-sm">إلى<input className="field-select mt-1 w-full" type="email" value={to} onChange={e=>setTo(e.target.value)}/></label>
        <label className="block text-sm">الموضوع<input className="field-select mt-1 w-full" value={subject} onChange={e=>setSubject(e.target.value)}/></label>
        <label className="block text-sm">الرسالة<textarea className="field-select mt-1 min-h-48 w-full" value={body} onChange={e=>setBody(e.target.value)}/></label>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertCircle className="h-4 w-4"/> إرسال الرسائل والمرفقات يتطلب ربط Gmail أولًا.</div>
        <div className="flex justify-end gap-2"><button onClick={draft} className="rounded-lg border px-4 py-2">إغلاق</button><button disabled title="اربط Gmail أولًا" className="rounded-lg bg-primary px-5 py-2 text-primary-foreground opacity-50"><Send className="inline h-4 w-4"/> إرسال</button></div>
      </div>
    </div>}
  </section>;
}
