import { archiveGeneratedWord } from "@/lib/services/generatedWordArchive";
import { officialDocumentHtml } from "@/lib/services/officialDocumentHtml";
import { printHtml } from "@/lib/printHtml";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app/bits";
import { useCollection,useSettings } from "@/lib/db/hooks";
import { repo,uid } from "@/lib/db/idb";
import type { Template } from "@/lib/db/types";
import { archiveGeneratedTemplate } from "@/lib/services/generatedArchive";
export const Route=createFileRoute("/templates")({component:Templates});
const choices:Record<string,string> = Object.fromEntries(["مراسلة إدارية","جدول إرسال","محضر اجتماع","شهادة مدرسية","شهادة إدارية","إشعار غياب"].map(kind=>[kind,""]));

function Templates(){const {data:templates}=useCollection<Template>("templates");const settings=useSettings();const [wordPath,setWordPath]=useState("");const [showPreview,setShowPreview]=useState(false);const [item,setItem]=useState<Template>({id:"",name:"",kind:"مراسلة إدارية",body:choices["مراسلة إدارية"]});
 const content=()=>officialDocumentHtml({kind:item.kind,title:item.name||item.kind,body:item.body,headerLine:settings.headerLine,directorate:settings.directorate,schoolName:settings.schoolName,city:settings.city});
 const save=async()=>{if(!item.name.trim()){toast.error("عنوان الوثيقة مطلوب");return;}const t={...item,id:item.id||uid()};try{await repo<Template>("templates").put(t);setItem(t);toast.success("تم حفظ المسودة دون تغيير الأرشيف");}catch(e){toast.error("تعذر حفظ المسودة: "+String(e));}};
 const approve=async()=>{if(!item.name.trim()){toast.error("عنوان الوثيقة مطلوب");return;}const t={...item,id:item.id||uid()};try{await repo<Template>("templates").put(t);setItem(t);await archiveGeneratedTemplate(t,settings);toast.success("تم اعتماد الوثيقة وحفظها بالأرشيف");}catch(e){toast.error("تعذر أرشفة الوثيقة: "+String(e));}};
 const print=()=>printHtml(content());
 const syncWord=async(path:string,template:Template)=>{
   const native=window as unknown as {__TAURI_INTERNALS__:{invoke:(cmd:string,args:unknown)=>Promise<string>}};
   const encoded=await native.__TAURI_INTERNALS__.invoke("read_generated_word_document",{filePath:path});
   const bytes=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));
   await archiveGeneratedWord(template,settings,new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}));
 };
 const word=async()=>{
   if ("__TAURI_INTERNALS__" in window) {
     try {
       const t={...item,id:item.id||uid(),name:item.name.trim()||item.kind};
       await repo<Template>("templates").put(t);
       setItem(t);
       const native=window as unknown as {__TAURI_INTERNALS__:{invoke:(cmd:string,args:unknown)=>Promise<string>}};
       const path=await native.__TAURI_INTERNALS__.invoke("create_word_document",{
         title:t.name,body:t.body,
         header:[settings.headerLine,"وزارة التربية الوطنية",settings.directorate,settings.schoolName+" — "+settings.city],
       });
       setWordPath(path);
       await syncWord(path,t);
       toast.success("تم إنشاء Word وربط نسخته بالأرشيف");
     }catch(e){toast.error("لم تكتمل عملية Word: "+String(e));}
     return;
   }
   const url=URL.createObjectURL(new Blob(["\ufeff",content()],{type:"application/msword"}));
   const a=document.createElement("a");a.href=url;a.download=(item.name||"وثيقة")+".doc";a.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const resyncWord=async()=>{
   if(!wordPath||!item.id)return;
   try {await syncWord(wordPath,item);toast.success("تم تحديث نسخة Word في الأرشيف");}
   catch(e){toast.error("تعذر مزامنة Word: "+String(e));}
 };
 return <div><PageHeader title="إنشاء الوثائق الإدارية"/><div className="grid gap-5 lg:grid-cols-[260px_1fr]"><aside className="panel p-3"><div className="mb-3 font-bold">القوالب المحفوظة</div><Button className="mb-3 w-full" onClick={()=>{setWordPath("");setItem({id:"",name:"",kind:"مراسلة إدارية",body:choices["مراسلة إدارية"]});}}>وثيقة جديدة</Button>{templates.map(t=><button className="block w-full border-b p-2 text-start text-sm" key={t.id} onClick={()=>{setWordPath("");setItem({...t});}}>{t.name}</button>)}</aside><section className="panel space-y-3 p-5"><label className="block text-sm">نوع الوثيقة<select className="field-select mt-1 w-full" value={item.kind} onChange={e=>{const kind=e.target.value;setItem({...item,kind,body:choices[kind]})}}>{Object.keys(choices).map(k=><option key={k}>{k}</option>)}</select></label><label className="block text-sm">العنوان<Input className="mt-1" value={item.name} onChange={e=>setItem({...item,name:e.target.value})}/></label><label className="block text-sm">نص الوثيقة<Textarea rows={16} className="mt-1 whitespace-pre-wrap" value={item.body} onChange={e=>setItem({...item,body:e.target.value})}/></label><div className="flex flex-wrap gap-2"><Button onClick={save}>حفظ المسودة</Button><Button variant="outline" onClick={approve}>اعتماد وأرشفة</Button><Button variant="outline" onClick={()=>setShowPreview(p=>!p)}>{showPreview?"إخفاء المعاينة":"معاينة A4"}</Button><Button variant="outline" onClick={print}>طباعة / PDF</Button><Button variant="outline" onClick={word}>تحرير في Word</Button>{wordPath&&<Button variant="outline" onClick={resyncWord}>مزامنة تعديلات Word إلى الأرشيف</Button>}{item.id&&<Button variant="destructive" onClick={async()=>{if(window.confirm("حذف القالب؟")){await repo<Template>("templates").remove(item.id);setItem({id:"",name:"",kind:"مراسلة إدارية",body:choices["مراسلة إدارية"]});}}}>حذف</Button>}</div>{showPreview&&<div className="mt-5 overflow-hidden rounded-lg border bg-white p-2"><iframe title="معاينة ورقة A4" srcDoc={content()} className="h-[720px] w-full border-0 bg-white" sandbox="allow-same-origin" /></div>}</section></div></div>;
}
