import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { isDesktopRuntime } from "@/lib/db/desktop";
import { useSettings } from "@/lib/db/hooks";
import { Archive, Inbox, Send, Mail, Star, Trash2, Search, Paperclip, ShieldCheck, Plus, X, AlertCircle, LogOut, ChevronDown, ExternalLink } from "lucide-react";
import { toast } from "sonner";

/** The Gmail UI is intentionally disconnected until desktop OAuth is configured.
 * Never ship the Lovable cloud gateway keys or request a Google account password.
 */
// The mailbox is mounted persistently by AppShell to preserve its state across routes.
export const Route = createFileRoute("/email")({ component: () => null });
type GmailInboxState = {ids:string[];unread_count:number};
type GmailPage = {items:GmailItem[];next_page_token:string|null};
type GmailItem = {id:string;thread_id:string;subject:string;sender:string;date:string;snippet:string;unread:boolean;has_attachments:boolean;message_id:string;draft_id?:string|null};
type Folder = "INBOX" | "STARRED" | "SENT" | "TRASH" | "DRAFTS";
const folders: {id:Folder;label:string;icon:typeof Inbox}[] = [
  {id:"INBOX",label:"الوارد",icon:Inbox},
  {id:"STARRED",label:"المميزة",icon:Star},
  {id:"SENT",label:"المرسلة",icon:Send},
  {id:"TRASH",label:"المحذوفات",icon:Trash2},
  {id:"DRAFTS",label:"المسودات",icon:Mail},
];
export function EmailCenter() {
  const [folder,setFolder]=useState<Folder>("INBOX");
  const [search,setSearch]=useState("");
  const [activeQuery,setActiveQuery]=useState("");
  const [nextPageToken,setNextPageToken]=useState<string|null>(null);
  const [loadingMore,setLoadingMore]=useState(false);

  const [compose,setCompose]=useState(false);
  const [to,setTo]=useState("");
  const [recentRecipients,setRecentRecipients]=useState<string[]>([]);
  const [subject,setSubject]=useState("");
  const [body,setBody]=useState("");
  const [files,setFiles]=useState<{name:string;mime:string;data:string}[]>([]);
  const [sending,setSending]=useState(false);
  const [replyThread,setReplyThread]=useState<{threadId:string;messageId:string}|null>(null);
  const [downloadList,setDownloadList]=useState<{part_id:string;name:string;mime:string;size:number}[]>([]);
  const [downloading,setDownloading]=useState("");


  const draft=()=>setCompose(false);
  const saveDraft=async()=>{
    if(!gmailEmail){toast.error("اربط Gmail أولًا");return;}
    setSending(true);
    try{
      await invoke<string>("gmail_save_draft",{to,subject,body,attachments:files});
      toast.success("تم حفظ المسودة في Gmail");
      setCompose(false);setFiles([]);setTo("");setSubject("");setBody("");setReplyThread(null);
      if(folder==="DRAFTS")await refreshMessages();
    }catch(e){toast.error("تعذر حفظ المسودة: "+String(e));}
    finally{setSending(false);}
  };
  const addFiles=async(input:FileList|null)=>{
    if(!input)return;
    for(const file of Array.from(input)){
      if(file.size>15*1024*1024){toast.error("المرفق أكبر من 15MB: "+file.name);continue;}
      const data=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");
        reader.onerror=()=>reject(new Error("تعذر قراءة الملف"));
        reader.readAsDataURL(file);
      });
      setFiles(prev=>prev.length>=10?prev:[...prev,{name:file.name,mime:file.type||"application/octet-stream",data}]);
    }
  };
  const sendMail=async()=>{
    if(!gmailEmail||sending)return;
    if(!to.trim()||!to.includes("@")){toast.error("تحقق من البريد الإلكتروني للمرسل إليه");return;}
    setSending(true);
    try{
      await invoke<string>("gmail_send_message",{to,subject,body,attachments:files,threadId:replyThread?.threadId||null,inReplyTo:replyThread?.messageId||null});
      rememberRecipient(to);
      toast.success("تم إرسال الرسالة عبر Gmail");
      setCompose(false);setTo("");setSubject("");setBody("");setFiles([]);setReplyThread(null);
      if(folder==="SENT")await refreshMessages();
    }catch(e){toast.error("فشل الإرسال: "+String(e));}
    finally{setSending(false);}
  };
  const [accountMenu,setAccountMenu]=useState(false);
  const [gmailEmail,setGmailEmail]=useState<string|null>(null);
  const recipientsStorageKey=gmailEmail?"ecolearchive:gmail-recipients:"+gmailEmail.toLowerCase():null;
  const rememberRecipient=(address:string)=>{
    const email=address.trim().toLowerCase();
    if(!recipientsStorageKey||!email||!email.includes("@"))return;
    setRecentRecipients(previous=>{
      const updated=[email,...previous.filter(value=>value.toLowerCase()!==email)].slice(0,100);
      try{window.localStorage.setItem(recipientsStorageKey,JSON.stringify(updated));}catch{/* Local storage unavailable; retain in-memory suggestions. */}
      return updated;
    });
  };
  const [connecting,setConnecting]=useState(false);
  const [messages,setMessages]=useState<GmailItem[]>([]);
  const [loadingMessages,setLoadingMessages]=useState(false);
  const [selected,setSelected]=useState<GmailItem|null>(null);
  const [messageBody,setMessageBody]=useState("");
  const [reading,setReading]=useState(false);
  const [mailError,setMailError]=useState("");
  const [unreadCount,setUnreadCount]=useState(0);
  const [autoSync,setAutoSync]=useState(true);
  const [notifyNew,setNotifyNew]=useState(true);
  const [lastSynced,setLastSynced]=useState<string|null>(null);
  const inboxIdsRef=useRef<Set<string>|null>(null);
  const syncInFlightRef=useRef(false);
  const folderRef=useRef(folder);
  const queryRef=useRef(activeQuery);
  const notifyRef=useRef(notifyNew);
  folderRef.current=folder;
  queryRef.current=activeQuery;
  notifyRef.current=notifyNew;


  const invoke = <T,>(command:string,args?:Record<string,unknown>):Promise<T> => window.__TAURI_INTERNALS__!.invoke(command,args) as Promise<T>;

  const settings=useSettings();
  const readClientId=()=>settings.gmailClientId?.trim()||"";
  useEffect(()=>{
    if(!recipientsStorageKey){setRecentRecipients([]);return;}
    try{
      const stored=JSON.parse(window.localStorage.getItem(recipientsStorageKey)||"[]") as unknown;
      setRecentRecipients(Array.isArray(stored)?stored.filter((value):value is string=>typeof value==="string"&&value.includes("@")).slice(0,100):[]);
    }catch{setRecentRecipients([]);}
  },[recipientsStorageKey]);
  useEffect(()=>{if(isDesktopRuntime())void window.__TAURI_INTERNALS__!.invoke("gmail_account_status").then(v=>setGmailEmail(v as string|null)).catch(e=>toast.error(String(e)));},[]);
  useEffect(()=>{
    if(!gmailEmail||!isDesktopRuntime()){setMessages([]);setSelected(null);setMailError("");setNextPageToken(null);return;}
    let active=true;
    setLoadingMessages(true);setMailError("");setSelected(null);setNextPageToken(null);
    const promise=folder==="DRAFTS"
      ?invoke<GmailItem[]>("gmail_list_messages",{folder}).then(items=>({items,next_page_token:null} as GmailPage))
      :invoke<GmailPage>("gmail_search_messages",{folder,query:activeQuery,pageToken:null});
    void promise.then(page=>{if(active){setMessages(page.items);setNextPageToken(page.next_page_token);}})
      .catch(e=>{if(active){setMessages([]);setMailError(String(e));toast.error("تعذر تحميل البريد: "+String(e));}})
      .finally(()=>{if(active)setLoadingMessages(false);});
    return ()=>{active=false;};
  },[gmailEmail,folder,activeQuery]);
  useEffect(()=>{
    inboxIdsRef.current=null;
    setUnreadCount(0);
    setLastSynced(null);
    if(!gmailEmail||!isDesktopRuntime()||!autoSync)return;
    let active=true;
    const sync=async()=>{
      if(syncInFlightRef.current||document.visibilityState==="hidden"||!navigator.onLine)return;
      syncInFlightRef.current=true;
      try{
        const snapshot=await invoke<GmailInboxState>("gmail_inbox_state");
        if(!active)return;
        const newIds=new Set(snapshot.ids);
        const previous=inboxIdsRef.current;
        const arrived=previous?snapshot.ids.filter(id=>!previous.has(id)):[];
        inboxIdsRef.current=newIds;
        setUnreadCount(snapshot.unread_count);
        setLastSynced(new Date().toLocaleTimeString("ar-DZ",{hour:"2-digit",minute:"2-digit"}));
        if(arrived.length){
          if(notifyRef.current)toast.info(arrived.length===1?"وصلت رسالة جديدة إلى Gmail":`وصلت ${arrived.length} رسائل جديدة إلى Gmail`);
          if(folderRef.current==="INBOX"&&!queryRef.current){
            const page=await invoke<GmailPage>("gmail_search_messages",{folder:"INBOX",query:"",pageToken:null});
            if(active){setMessages(current=>[...page.items,...current.filter(item=>!page.items.some(m=>m.id===item.id))]);setNextPageToken(page.next_page_token);}
          }
        }
      }catch(e){
        // Temporary network issues must not interrupt reading or flood notifications.
        if(active)setLastSynced("تعذر التحديث التلقائي");
      }finally{syncInFlightRef.current=false;}
    };
    void sync();
    const timer=window.setInterval(()=>void sync(),5000);
    const onResume=()=>{if(document.visibilityState==="visible")void sync();};
    window.addEventListener("online",onResume);
    document.addEventListener("visibilitychange",onResume);
    return ()=>{active=false;window.clearInterval(timer);window.removeEventListener("online",onResume);document.removeEventListener("visibilitychange",onResume);};
  },[gmailEmail,autoSync]);
  const readMessage=async(item:GmailItem)=>{
    setSelected(item);setMessageBody("");setDownloadList([]);setReading(true);
    try{
      const [text,attachments]=await Promise.all([
        invoke<string>("gmail_read_message",{id:item.id}),
        invoke<{part_id:string;name:string;mime:string;size:number}[]>("gmail_message_attachments",{id:item.id})
      ]);
      setMessageBody(text);setDownloadList(attachments);
    }
    catch(e){setMessageBody("تعذر فتح الرسالة: "+String(e));}
    finally{setReading(false);}
  };
  const downloadAttachment=async(part:{part_id:string;name:string})=>{
    if(!selected)return;
    setDownloading(part.part_id);
    try{
      const path=await invoke<string>("gmail_download_attachment",{id:selected.id,partId:part.part_id,name:part.name});
      toast.success("تم حفظ المرفق: "+path);
    }catch(e){toast.error("تعذر تنزيل المرفق: "+String(e));}
    finally{setDownloading("");}
  };
  const draftAction=async(action:"SEND"|"DELETE")=>{
    if(!selected?.draft_id)return;
    if(action==="DELETE"&&!confirm("هل تريد حذف هذه المسودة نهائيًا من Gmail؟"))return;
    setSending(true);
    try{
      await invoke<void>("gmail_draft_action",{id:selected.draft_id,action});
      toast.success(action==="SEND"?"تم إرسال المسودة عبر Gmail":"تم حذف المسودة");
      setSelected(null);await refreshMessages();
    }catch(e){toast.error(String(e));}
    finally{setSending(false);}
  };
  const manageMessage=async(action:"READ"|"UNREAD"|"STAR"|"UNSTAR"|"TRASH"|"RESTORE"|"ARCHIVE")=>{
    if(!selected)return;
    try{
      await invoke<void>("gmail_update_message",{id:selected.id,action});
      toast.success("تم تحديث الرسالة");
      setSelected(null);
      await refreshMessages();
    }catch(e){toast.error("تعذر تعديل الرسالة: "+String(e));}
  };
  const reply=()=>{
    if(!selected)return;
    const from=selected.sender.match(/<([^>]+)>/)?.[1]||selected.sender;
    setTo(from);setSubject(selected.subject.startsWith("Re:")?selected.subject:"Re: "+selected.subject);
    setBody("");setFiles([]);setReplyThread({threadId:selected.thread_id,messageId:selected.message_id});
    setSelected(null);setCompose(true);
  };
  const forward=()=>{
    if(!selected)return;
    setTo("");setSubject(selected.subject.startsWith("Fwd:")?selected.subject:"Fwd: "+selected.subject);
    setBody("\n\n---------- Forwarded message ----------\nFrom: "+selected.sender+"\nSubject: "+selected.subject+"\n\n"+messageBody);
    setReplyThread(null);setFiles([]);setSelected(null);setCompose(true);
  };
  const refreshMessages=async()=>{
    if(!gmailEmail)return;
    setLoadingMessages(true);setMailError("");
    try{
      if(folder==="DRAFTS"){setMessages(await invoke<GmailItem[]>("gmail_list_messages",{folder}));setNextPageToken(null);}
      else{
        const page=await invoke<GmailPage>("gmail_search_messages",{folder,query:activeQuery,pageToken:null});
        setMessages(page.items);setNextPageToken(page.next_page_token);
      }
    }catch(e){setMailError(String(e));toast.error(String(e));}
    finally{setLoadingMessages(false);}
  };
  const loadMore=async()=>{
    if(!gmailEmail||!nextPageToken||loadingMore||folder==="DRAFTS")return;
    setLoadingMore(true);
    try{
      const page=await invoke<GmailPage>("gmail_search_messages",{folder,query:activeQuery,pageToken:nextPageToken});
      setMessages(prev=>[...prev,...page.items.filter(item=>!prev.some(old=>old.id===item.id))]);
      setNextPageToken(page.next_page_token);
    }catch(e){toast.error("تعذر تحميل بقية الرسائل: "+String(e));}
    finally{setLoadingMore(false);}
  };
  const connectGmail=async()=>{
    if(!isDesktopRuntime()){toast.error("تسجيل الدخول يعمل فقط في نسخة Windows");return;}
    const clientId=readClientId();
    if(!clientId.endsWith(".apps.googleusercontent.com")){toast.error("أدخل Google Client ID واحفظه مرة واحدة من الإعدادات");return;}
    setConnecting(true);
    try {
      const email=await window.__TAURI_INTERNALS__!.invoke("gmail_connect",{clientId:clientId.trim()}) as string;
      setGmailEmail(email);toast.success("تم ربط الحساب: "+email);
    }catch(e){toast.error("تعذر ربط Gmail: "+String(e));}
    finally{setConnecting(false);}
  };
  const signOut=async()=>{
    if(!isDesktopRuntime())return;
    try{await window.__TAURI_INTERNALS__!.invoke("gmail_sign_out");setGmailEmail(null);setMessages([]);setSelected(null);toast.success("تم فصل Gmail من البرنامج");}
    catch(e){toast.error(String(e));}
  };
  return <section className="space-y-5" dir="rtl">
    <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Mail className="h-7 w-7"/> البريد الإلكتروني</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gmail المدرسي</p>
      </div>
      <div className="flex flex-wrap gap-2"><button className="rounded-xl border px-4 py-3 font-semibold" disabled={connecting} onClick={()=>gmailEmail?setAccountMenu(v=>!v):void connectGmail()}>{gmailEmail?gmailEmail:connecting?"جارٍ الاتصال…":"إضافة حساب"}</button><button className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground" onClick={()=>setCompose(true)}><Plus className="h-5 w-5"/> رسالة جديدة</button></div>
    </div>
    {accountMenu&&<div className="panel space-y-3 p-4"><h2 className="font-bold">إدارة حسابات البريد</h2><p className="text-sm text-muted-foreground">{gmailEmail?`الحساب المرتبط: ${gmailEmail}`:"لا يوجد حساب متصل حاليًا."} لا نخزن كلمات المرور داخل البرنامج.</p><button onClick={()=>{setAccountMenu(false);void connectGmail();}} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">إضافة حساب جديد</button><button disabled={!gmailEmail||connecting} onClick={()=>void signOut()} className="mr-2 inline-flex items-center gap-2 rounded-lg border px-4 py-2 disabled:opacity-50"><LogOut className="h-4 w-4"/> تسجيل الخروج</button></div>}
    <div className="panel flex items-start gap-2 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/>
      <div className="text-sm"><strong>{gmailEmail?`متصل بحساب ${gmailEmail}`:"Gmail غير متصل بعد."}</strong> {gmailEmail?"يتم تحميل الرسائل مباشرة من Gmail، ويمكن إرسال بريد وتنزيل المرفقات.":"اضغط «إضافة حساب»، ووافق عبر صفحة Google الرسمية. لن يطلب البرنامج كلمة مرورك."}</div>
    </div>
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="panel space-y-1 p-3">
        {folders.map(({id,label,icon:Icon})=><button key={id} onClick={()=>setFolder(id)} className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-right transition-colors ${folder===id?"bg-primary text-primary-foreground":"hover:bg-muted"}`}><Icon className="h-5 w-5"/><span>{label}</span>{id==="INBOX"&&unreadCount>0&&<span className="mr-auto rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">{unreadCount}</span>}</button>)}
        <Link to="/mail/incoming" className="mt-3 flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted"><Archive className="h-4 w-4"/> سجل المراسلات الإدارية</Link>
      </aside>
      <div className="panel min-h-[430px] overflow-hidden">
        <div className="flex items-center gap-2 border-b p-4">
          <Search className="h-5 w-5 text-muted-foreground"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")setActiveQuery(search);}} className="w-full bg-transparent outline-none" placeholder="البحث في Gmail" aria-label="البحث في Gmail" />
          <button onClick={()=>setActiveQuery(search)} className="rounded-lg border px-3 py-1 text-sm">بحث</button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={autoSync} onChange={e=>setAutoSync(e.target.checked)}/> مزامنة تلقائية كل 5 ثواني</label>
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={notifyNew} onChange={e=>setNotifyNew(e.target.checked)}/> تنبيه الرسائل الجديدة</label>
          </div>
          <span>{lastSynced?"آخر فحص: "+lastSynced:""}</span>
        </div>
        <div className="flex items-center justify-between border-b px-4 py-2 text-sm">
          <span>{gmailEmail?folders.find(f=>f.id===folder)?.label:"اربط Gmail لعرض الرسائل"}</span>
          <button disabled={!gmailEmail||loadingMessages} className="rounded-lg border px-3 py-1.5 disabled:opacity-50" onClick={()=>void refreshMessages()}>{loadingMessages?"جارٍ التحديث…":"تحديث البريد"}</button>
        </div>
        {mailError&&<p className="m-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{mailError}</p>}
        {gmailEmail&&messages.length>0?<div className="divide-y">
          {messages.filter(m=>folder==="DRAFTS"?[m.sender,m.subject,m.snippet].some(v=>v.toLowerCase().includes(search.toLowerCase())):true).map(m=><button key={m.id} onClick={()=>void readMessage(m)} className={"w-full px-4 py-3 text-right hover:bg-muted/60 "+(m.unread?"font-bold":"")}>
            <div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate">{m.sender||"مرسل غير معروف"}</span><span className="shrink-0 text-xs font-normal text-muted-foreground" dir="ltr">{m.date}</span></div>
            <div className="mt-1 flex items-center gap-2"><span className="truncate">{m.subject||"(بدون موضوع)"}</span>{m.has_attachments&&<Paperclip className="h-4 w-4 shrink-0"/>}</div>
            <p className="mt-1 truncate text-xs font-normal text-muted-foreground">{m.snippet}</p>
          </button>)}
        </div>:<div className="flex min-h-[270px] flex-col items-center justify-center gap-3 px-5 text-center text-muted-foreground">
          <Inbox className="h-10 w-10"/><p>{loadingMessages?"جارٍ جلب رسائل Gmail…":gmailEmail?"لا توجد رسائل في هذا المجلد.":"اضغط «إضافة حساب» للبدء."}</p>
        </div>}
        {gmailEmail&&nextPageToken&&folder!=="DRAFTS"&&<div className="flex justify-center p-3"><button disabled={loadingMore} onClick={()=>void loadMore()} className="rounded-lg border px-5 py-2 text-sm">{loadingMore?"جارٍ التحميل…":"تحميل رسائل أقدم"}</button></div>}
        {selected&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="قراءة رسالة Gmail">
          <div className="panel max-h-[85vh] w-full max-w-3xl overflow-auto space-y-3 p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{selected.subject||"(بدون موضوع)"}</h2><button title="إغلاق" onClick={()=>setSelected(null)}><X/></button></div>
            <p className="text-sm text-muted-foreground">{selected.sender}</p>
            <p className="text-xs text-muted-foreground" dir="ltr">{selected.date}</p>
            {selected.has_attachments&&<p className="text-xs text-muted-foreground">الرسالة تحتوي على مرفقات.</p>}
            {downloadList.map(a=><button key={a.part_id} disabled={!!downloading} className="flex w-full items-center gap-2 rounded-lg border p-2 text-right text-sm" onClick={()=>void downloadAttachment(a)}><Paperclip className="h-4 w-4"/>{a.name} — {Math.round(a.size/1024)} KB {downloading===a.part_id?"(جارٍ التنزيل…)":"(تنزيل)"}</button>)}
            {selected.draft_id?<div className="flex flex-wrap gap-2 border-t pt-3 text-sm">
              <button disabled={sending} onClick={()=>void draftAction("SEND")} className="rounded-lg bg-primary px-3 py-2 text-primary-foreground">إرسال المسودة</button>
              <button disabled={sending} onClick={()=>void draftAction("DELETE")} className="rounded-lg border px-3 py-2">حذف المسودة</button>
            </div>:<div className="flex flex-wrap gap-2 border-t pt-3 text-sm">
              <button onClick={reply} className="rounded-lg border px-3 py-2">رد</button>
              <button onClick={forward} className="rounded-lg border px-3 py-2">إعادة توجيه</button>
              <button onClick={()=>void manageMessage("READ")} className="rounded-lg border px-3 py-2">تحديد كمقروء</button>
              <button onClick={()=>void manageMessage("UNREAD")} className="rounded-lg border px-3 py-2">غير مقروء</button>
              <button onClick={()=>void manageMessage("STAR")} className="rounded-lg border px-3 py-2">تمييز بنجمة</button>
              <button onClick={()=>void manageMessage("ARCHIVE")} className="rounded-lg border px-3 py-2">أرشفة البريد</button>
              <button onClick={()=>void manageMessage(selected&&folder==="TRASH"?"RESTORE":"TRASH")} className="rounded-lg border px-3 py-2">{folder==="TRASH"?"استرجاع":"نقل للمحذوفات"}</button>
            </div>}
            <div className="whitespace-pre-wrap break-words border-t pt-4 text-sm" dir="auto">{reading?"جارٍ فتح الرسالة…":messageBody}</div>
          </div>
        </div>}
      </div>
    </div>
    {compose&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="رسالة جديدة">
      <div className="panel w-full max-w-2xl space-y-3 p-5">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">رسالة جديدة</h2><button title="إغلاق" onClick={draft}><X/></button></div>
        <label className="block text-sm">إلى<input className="field-select mt-1 w-full" type="email" list="gmail-recipient-suggestions" autoComplete="email" value={to} onChange={e=>setTo(e.target.value)}/><datalist id="gmail-recipient-suggestions">{recentRecipients.map(address=><option key={address} value={address}/>)}</datalist></label>
        <label className="block text-sm">الموضوع<input className="field-select mt-1 w-full" value={subject} onChange={e=>setSubject(e.target.value)}/></label>
        <label className="block text-sm">الرسالة<textarea className="field-select mt-1 min-h-48 w-full" value={body} onChange={e=>setBody(e.target.value)}/></label>
        <div className="text-sm"><input id="gmail-attachments-input" type="file" multiple className="sr-only" onChange={e=>void addFiles(e.target.files)}/><label htmlFor="gmail-attachments-input" className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 hover:bg-muted"><Paperclip className="h-4 w-4"/><span>إرفاق ملفات</span></label></div>
        {files.map((a,i)=><div key={i} className="flex items-center justify-between rounded-lg border p-2 text-sm"><span>{a.name}</span><button onClick={()=>setFiles(v=>v.filter((_,j)=>j!==i))} title="حذف المرفق"><X className="h-4 w-4"/></button></div>)}
        <div className="flex justify-end gap-2"><button onClick={draft} className="rounded-lg border px-4 py-2">إغلاق</button><button disabled={!gmailEmail||sending} onClick={()=>void saveDraft()} className="rounded-lg border px-4 py-2 disabled:opacity-50">حفظ كمسودة</button><button disabled={!gmailEmail||sending} onClick={()=>void sendMail()} className="rounded-lg bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50"><Send className="inline h-4 w-4"/> {sending?"جارٍ الإرسال…":"إرسال"}</button></div>
      </div>
    </div>}
  </section>;
}
