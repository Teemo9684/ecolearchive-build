import { useEffect, useState } from "react";
import { toast } from "sonner";
import { extractApprovedDocxFields, renderApprovedDocxFile } from "@/lib/native-docx";
import { readApprovedTemplate } from "@/lib/approved-templates";
import { importPrepared, prepareFiles } from "@/lib/services/documents";
import { useCollection, useSettings } from "@/lib/db/hooks";
import type { ArchiveCategory } from "@/lib/db/types";
import { isDesktopRuntime } from "@/lib/db/desktop";

type StoredTemplate = {name:string;path:string};
const bytesOf = (file: Blob): Promise<ArrayBuffer> => new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(reader.error);
  reader.onload=()=>resolve(reader.result as ArrayBuffer);
  reader.readAsArrayBuffer(file);
});
function decode64(encoded:string): Uint8Array {
  const binary=atob(encoded); const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  return bytes;
}
function encode64(bytes:Uint8Array):string {
  let out=""; for(let i=0;i<bytes.length;i+=8192) out+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(out);
}

/** Everyday workflow: fill DOCX fields, archive, or review and print using Microsoft Word. */
export function NativeWordComposer({initialKind}:{initialKind?:"bordereau"|"correspondence"}) {
  const settings=useSettings();
  const {data:categories}=useCollection<ArchiveCategory>("archiveCategories");
  const [templates,setTemplates]=useState<StoredTemplate[]>([]);
  const [selected,setSelected]=useState("");
  const [source,setSource]=useState<File|null>(null);
  const [fields,setFields]=useState<string[]>([]);
  const [values,setValues]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [recipients,setRecipients]=useState<string[]>(()=>{
    try{return JSON.parse(localStorage.getItem("ecolearchive-recipients")||"[]") as string[];}catch{return [];}
  });
  const [departments,setDepartments]=useState<string[]>(()=>{
    try{return JSON.parse(localStorage.getItem("ecolearchive-departments")||"[]") as string[];}catch{return [];}
  });
  useEffect(()=>{
    if(!isDesktopRuntime()){setLoading(false);return;}
    let mounted=true;
    const scan=()=>void window.__TAURI_INTERNALS__!.invoke("list_user_word_templates").then(v=>{
      if(mounted)setTemplates(v as StoredTemplate[]);
    }).catch(e=>{if(mounted)toast.error("تعذر قراءة القوالب: "+String(e));})
      .finally(()=>{if(mounted)setLoading(false);});
    scan();
    // Refresh automatically whenever Windows focus returns, with no extra controls.
    window.addEventListener("focus",scan);
    return ()=>{mounted=false;window.removeEventListener("focus",scan);};
  },[]);
  useEffect(()=>{
    if(!initialKind||!templates.length)return;
    const match=templates.find(t=>{
      const label=t.name.replace(/\.docx$/i,"").normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g,"");
      return initialKind==="bordereau"
        ? /جدول\s*(ال)?إرسال|bordereau/i.test(label)
        : /مراسلة|correspondance|courrier|رسالة\s*إدارية/i.test(label);
    });
    if(match)setSelected(match.name);
    else toast.error(initialKind==="bordereau"?"قالب جدول الإرسال غير موجود في قوالب الوثائق":"قالب المراسلة غير موجود في قوالب الوثائق");
  },[initialKind,templates]);
  useEffect(()=>{if(!selected||!isDesktopRuntime()){setSource(null);setFields([]);return;}
    let active=true;
    const run=async()=>{
      setBusy(true);  setSource(null);setFields([]);
      try{
        const encoded=await window.__TAURI_INTERNALS__!.invoke("read_user_word_template",{name:selected}) as string;
        const file=new File([decode64(encoded)],selected,{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
        await readApprovedTemplate(file);
        const names=extractApprovedDocxFields(await bytesOf(file));
        // Ordinary DOCX files are valid templates too. If no placeholders exist,
        // offer save/print with the original layout unchanged.
        if(!active)return;
        const auto:Record<string,string>={
          "المدرسة":settings.schoolName,"المدينة":settings.city,"الولاية":settings.wilaya,
          "المديرية":settings.directorate,"السنة_الدراسية":settings.currentYear,
          "التاريخ":new Date().toLocaleDateString("fr-DZ")
        };
        setValues(Object.fromEntries(names.map(k=>[k,auto[k]??""])));
        setFields(names);setSource(file);
      }catch(e){if(active)toast.error("تعذر قراءة القالب: "+String(e));}
      finally{if(active)setBusy(false);}
    };
    void run();return()=>{active=false;};
  },[selected,settings.schoolName,settings.city,settings.wilaya,settings.directorate,settings.currentYear]);
  const ready=async()=>{
    if(!source)throw Error("اختر نوع الوثيقة");

    if(fields.length===0) return new File([await bytesOf(source)], selected, {type:source.type});
    const numbers=fields.filter(k=>/^(?:عدد_الوثائق|عدد_المرفقات)(?:_\d+)?$/.test(k));
    const parseQuantity=(value:string)=>{
      const western=value.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660))
        .replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0)).trim();
      if(!western)return 0;
      if(!/^\d+$/.test(western))throw Error("عدد الوثائق والمرفقات يجب أن يكون عددًا صحيحًا");
      return Number(western);
    };
    const sum=numbers.reduce((total,k)=>total+parseQuantity(values[k]??""),0);
    // Only templates explicitly containing {رقم_الارسال} receive a sending number.
    // Keep empty optional values blank; use the current calendar year automatically.
    const data:Record<string,string>={...values, ...(fields.includes("المجموع")?{"المجموع":String(sum)}:{})};
    for (const key of fields) {
      const normalized=key.replace(/[إأآٱ]/g,"ا").replace(/[_\s-]+/g,"");
      if(normalized!=="رقمالارسال")continue;
      const value=(values[key]??"").trim();
      if(!value){data[key]="";continue;}
      if(!/^\d+$/.test(value))throw Error("اكتب رقم الإرسال فقط، مثل 15");
      data[key]=`رقم الإرسال : ${value}/ م. ع. ت/ ${new Date().getFullYear()}`;
    }
    return renderApprovedDocxFile(source,data,selected.replace(/\.docx$/i,""));
  };
  const preserveDirectoryEntries=()=>{
    const store=(key:string, field:string, old:string[], setter:(v:string[])=>void)=>{
      const value=values[field]?.trim();
      if(!value||old.includes(value))return;
      const next=[...old,value].sort((a,b)=>a.localeCompare(b,"ar"));
      setter(next);
      try{localStorage.setItem(key,JSON.stringify(next));}catch{}
    };
    store("ecolearchive-recipients","المرسل_إليه",recipients,setRecipients);
    store("ecolearchive-departments","المصلحة",departments,setDepartments);
  };
  const action=async(mode:"save"|"print")=>{
    if(busy)return;
    setBusy(true);
    try{
      const output=await ready();
      if(mode==="save"){
        const category=categories[0]?.id;
        if(!category)throw Error("أضف تصنيفًا للأرشيف من الإعدادات أولًا");
        const prepared=await prepareFiles([output]);
        if(prepared[0]?.tooLarge)throw Error("حجم الوثيقة يتجاوز الحد المسموح");
        if(prepared[0]?.duplicateOf)throw Error("هذه الوثيقة موجودة بالفعل في الأرشيف");
        await importPrepared(prepared,{categoryId:category,subcategory:"",academicYear:settings.currentYear,tags:[],description:"وثيقة إدارية: "+selected,date:new Date().toISOString().slice(0,10),relatedType:null,relatedId:null});
        preserveDirectoryEntries();
        // Save silently; the archive is the single source of truth.
      }else{
        const encoded=encode64(new Uint8Array(await bytesOf(output)));
        if(!isDesktopRuntime())throw Error("المعاينة والطباعة تتطلب نسخة Windows");
        await window.__TAURI_INTERNALS__!.invoke("open_generated_docx",{base64:encoded,fileName:output.name,print:false});
        preserveDirectoryEntries();
      }
    }catch(e){toast.error(String(e instanceof Error?e.message:e));}
    finally{setBusy(false);}
  };
  return <section className="panel mb-5 space-y-5 p-5" dir="rtl">
    <h2 className="text-lg font-bold">إنشاء وثيقة</h2>
    <label className="block text-sm font-medium">نوع الوثيقة
      <select className="field-select mt-2 block w-full" value={selected} disabled={busy||loading} onChange={e=>setSelected(e.target.value)}>
        <option value="">اختر نوع الوثيقة</option>
        {templates.map(t=><option value={t.name} key={t.name}>{t.name.replace(/\.docx$/i,"")}</option>)}
      </select>
    </label>
    {!loading&&!templates.length&&<p className="text-sm text-muted-foreground" title="ضع نماذج DOCX في Documents / EcoleArchive / قوالب الوثائق">لا توجد قوالب</p>}
    {source&&<>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map(key=><label key={key} className="block text-sm font-medium">{key.replaceAll("_"," ")}
          {key==="رقم_الارسال" && <span className="cursor-help text-xs text-muted-foreground" title={`أدخل الرقم فقط مثل 15؛ وسيظهر رقم الإرسال : 15/ م. ع. ت/ ${new Date().getFullYear()}. يمكن ترك الحقل فارغًا.`} aria-label="مساعدة رقم الإرسال"> ⓘ</span>}
          {/^(?:نص_المراسلة|نص المراسلة|المحتوى|المتن|نص_الوثيقة)$/.test(key.trim()) ? (
            <textarea rows={8} dir="rtl" className="field-select mt-2 block min-h-40 w-full resize-y whitespace-pre-wrap leading-7" value={values[key]??""} onChange={e=>{setValues(v=>({...v,[key]:e.target.value}));}} />
          ) : (
            <input list={key==="المرسل_إليه"?"native-recipients":key==="المصلحة"?"native-departments":undefined} className="field-select mt-2 block w-full" value={values[key]??""} onChange={e=>{setValues(v=>({...v,[key]:e.target.value}));}} />
          )}
        </label>)}
      </div>
      <datalist id="native-recipients">{recipients.map(r=><option key={r} value={r}/>)}</datalist>
      <datalist id="native-departments">{departments.map(r=><option key={r} value={r}/>)}</datalist>
      <div className="flex flex-wrap gap-3">
        <button className="rounded-lg bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50" disabled={busy} onClick={()=>void action("save")}>حفظ</button>
        <button className="rounded-lg border px-5 py-2 disabled:opacity-50" disabled={busy} onClick={()=>void action("print")}>{"طباعة عبر Word"}</button>
      </div>
    </>}
  </section>;
}
