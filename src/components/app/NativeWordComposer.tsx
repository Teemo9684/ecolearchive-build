import { useEffect, useRef, useState } from "react";
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

/** One-page everyday workflow: choose document type, fill fields, preview, save, print. */
export function NativeWordComposer() {
  const settings=useSettings();
  const {data:categories}=useCollection<ArchiveCategory>("archiveCategories");
  const [templates,setTemplates]=useState<StoredTemplate[]>([]);
  const [selected,setSelected]=useState("");
  const [source,setSource]=useState<File|null>(null);
  const [fields,setFields]=useState<string[]>([]);
  const [values,setValues]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [preview,setPreview]=useState<string|null>(null);
  const previewCache = useRef<{key:string;url:string}|null>(null);
  const [preparingPreview,setPreparingPreview]=useState(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
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
  useEffect(()=>{if(!selected||!isDesktopRuntime()){setSource(null);setFields([]);setPreview(null);return;}
    let active=true;
    const run=async()=>{
      setBusy(true); setPreview(null); setSource(null);setFields([]);
      try{
        const encoded=await window.__TAURI_INTERNALS__!.invoke("read_user_word_template",{name:selected}) as string;
        const file=new File([decode64(encoded)],selected,{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
        await readApprovedTemplate(file);
        const names=extractApprovedDocxFields(await bytesOf(file));
        // Ordinary DOCX files are valid templates too. If no placeholders exist,
        // offer preview/save/print with the original layout unchanged.
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
    const sendingNumber = (values["رقم_الارسال"] ?? "").trim();
    const formattedSendingNumber = !sendingNumber ? "" :
      /^\d+\s*\/\s*م\.\s*ع\.\s*ت\s*\/\s*\d{4}$/.test(sendingNumber)
        ? sendingNumber
        : `${sendingNumber}/م. ع. ت/${new Date().getFullYear()}`;
    const data={...values,
      ...(fields.includes("رقم_الارسال")?{"رقم_الارسال":formattedSendingNumber}:{}),
      ...(fields.includes("المجموع")?{"المجموع":String(sum)}:{})};
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
  const action=async(mode:"preview"|"save"|"print")=>{
    if(busy)return;
    setBusy(true);
    if(mode==="preview")setPreparingPreview(true);
    try{
      const key=JSON.stringify([selected,values]);
      if(mode==="preview" && previewCache.current?.key===key){
        setPreview(previewCache.current.url);
        return;
      }
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
        if(mode==="preview"){
          const pdf = await window.__TAURI_INTERNALS__!.invoke("preview_generated_docx_pdf",{base64:encoded}) as string;
          const bytes=decode64(pdf);
          const blob=new Blob([bytes],{type:"application/pdf"});
          const url=URL.createObjectURL(blob);
          if(previewCache.current)URL.revokeObjectURL(previewCache.current.url);
          previewCache.current={key,url};
          setPreview(url);
        }else{
          await window.__TAURI_INTERNALS__!.invoke("open_generated_docx",{base64:encoded,fileName:output.name,print:true});
        }
        preserveDirectoryEntries();
      }
    }catch(e){toast.error(String(e instanceof Error?e.message:e));}
    finally{setBusy(false);setPreparingPreview(false);}
  };
  return <section className="panel mb-5 space-y-5 p-5" dir="rtl">
    <h2 className="text-lg font-bold">إنشاء وثيقة</h2>
    <label className="block text-sm font-medium">نوع الوثيقة
      <select className="field-select mt-2 block w-full" value={selected} disabled={busy||loading} onChange={e=>setSelected(e.target.value)}>
        <option value="">اختر نوع الوثيقة</option>
        {templates.map(t=><option value={t.name} key={t.name}>{t.name.replace(/\.docx$/i,"")}</option>)}
      </select>
    </label>
    {!loading&&!templates.length&&<p className="text-sm text-muted-foreground">لا توجد قوالب Word بعد في Documents / EcoleArchive / قوالب الوثائق. ضع ملفات DOCX هناك؛ ستظهر عند دخول القسم.</p>}
    {source&&<>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map(key=><label key={key} className="block text-sm font-medium">{key.replaceAll("_"," ")}
          {key==="رقم_الارسال" && <span className="block text-xs text-muted-foreground">أدخل الرقم فقط (مثل 15)، وسيظهر في الوثيقة: 15/م. ع. ت/{new Date().getFullYear()}. اتركه فارغًا إذا لم يكن مطلوبًا.</span>}
          {/^(?:نص_المراسلة|نص المراسلة|المحتوى|المتن|نص_الوثيقة)$/.test(key.trim()) ? (
            <textarea rows={8} dir="rtl" className="field-select mt-2 block min-h-40 w-full resize-y whitespace-pre-wrap leading-7" value={values[key]??""} onChange={e=>{setValues(v=>({...v,[key]:e.target.value}));setPreview(null);}} />
          ) : (
            <input list={key==="المرسل_إليه"?"native-recipients":key==="المصلحة"?"native-departments":undefined} className="field-select mt-2 block w-full" value={values[key]??""} onChange={e=>{setValues(v=>({...v,[key]:e.target.value}));setPreview(null);}} />
          )}
        </label>)}
      </div>
      <datalist id="native-recipients">{recipients.map(r=><option key={r} value={r}/>)}</datalist>
      <datalist id="native-departments">{departments.map(r=><option key={r} value={r}/>)}</datalist>
      <div className="flex flex-wrap gap-3">
        <button className="rounded-lg border px-5 py-2 disabled:opacity-50" disabled={busy} onClick={()=>void action("preview")}>{preparingPreview?"جارٍ تجهيز المعاينة…":"معاينة"}</button>
        <button className="rounded-lg bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50" disabled={busy} onClick={()=>void action("save")}>حفظ</button>
        <button className="rounded-lg border px-5 py-2 disabled:opacity-50" disabled={busy} onClick={()=>void action("print")}>طباعة</button>
      </div>
      {preparingPreview && <p role="status" className="text-sm text-muted-foreground">جارٍ تحضير معاينة مطابقة للقالب…</p>}
      {preview&&<div className="overflow-hidden rounded-xl border bg-muted p-2"><div className="mb-2 flex items-center justify-between px-2 text-sm font-semibold"><span>معاينة الوثيقة قبل الطباعة</span><button className="rounded-md border px-3 py-1" onClick={()=>setPreview(null)}>إغلاق المعاينة</button></div><iframe title="معاينة الوثيقة" src={preview} className="h-[70vh] min-h-[500px] w-full rounded-lg bg-white" /></div>}
    </>}
  </section>;
}
