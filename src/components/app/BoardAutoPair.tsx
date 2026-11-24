import {useEffect,useState} from "react";
import {syncBoard,subscribeBoardSync,type SyncState} from "@/lib/digital-board/auto-sync";
import {Button} from "@/components/ui/button";
import {isDesktopRuntime} from "@/lib/db/desktop";
type Device={id:string;name:string;ip:string};
const invoke=(cmd:string,args?:Record<string,unknown>)=>window.__TAURI_INTERNALS__!.invoke(cmd,args);
export function BoardAutoPair({revision}:{revision?:string}){
 const [sync,setSync]=useState<SyncState>({phase:"idle"});
 useEffect(()=>subscribeBoardSync(setSync),[]);
 const [devices,setDevices]=useState<Device[]>([]),[paired,setPaired]=useState<Device|null>(null),[pending,setPending]=useState<Device|null>(null),[code,setCode]=useState(""),[manual,setManual]=useState(""),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{if(isDesktopRuntime())void invoke("board_paired").then(setPaired).catch(e=>setStatus(String(e)));},[]);
 async function search(){setDevices(await invoke("board_discover"));}
 async function action(fn:()=>Promise<void>){setBusy(true);try{await fn();}catch(e){setStatus(String(e));}finally{setBusy(false);}}
 async function begin(d:Device){await invoke("board_pair_begin",{device:d});setPending(d);setStatus("أكد الاقتران على شاشة الجهاز ثم أدخل الرمز خلال دقيقتين");}
 async function send(){await syncBoard();}
 return <section className="panel space-y-3 p-4"><h2 className="font-bold">الاقتران التلقائي (تجريبي)</h2><p>{paired?"الجهاز المقترن: "+paired.name:"لا يوجد جهاز مقترن"}</p><fieldset disabled={busy||!isDesktopRuntime()} className="space-y-2"><Button onClick={()=>void action(search)}>البحث عن أجهزة العرض</Button>{devices.map(d=><div key={d.id+d.ip} className="flex gap-2"><span>{d.name}</span><Button variant="outline" onClick={()=>void action(()=>begin(d))}>اقتران</Button></div>)}<details><summary>اتصال يدوي استثنائي</summary><input dir="ltr" value={manual} onChange={e=>setManual(e.target.value)} placeholder="IPv4"/><Button onClick={()=>void action(()=>begin({id:"manual",name:"جهاز عرض",ip:manual}))}>اقتران</Button></details>{pending&&<div><input dir="ltr" inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} placeholder="000000"/><Button disabled={code.length!==6} onClick={()=>void action(async()=>{setPaired(await invoke("board_pair_finish",{code}));setPending(null);setCode("");setStatus("تم حفظ الاقتران");void syncBoard();})}>تأكيد الرمز</Button></div>}<Button disabled={!paired||!revision} onClick={()=>void action(send)}>إرسال النسخة المعتمدة</Button><Button variant="outline" disabled={!paired} onClick={()=>void action(async()=>{await invoke("board_unpair");setPaired(null);setStatus("تم حذف الاقتران من الحاسوب");})}>إلغاء الاقتران</Button></fieldset><p role="status">{status}</p><p>{sync.phase==="success"?"تمت المزامنة بنجاح":sync.phase==="sending"?"جارٍ الاتصال والتحقق":sync.phase==="offline"?"غير متصل أو لم يصل تأكيد التفعيل":"بانتظار الاقتران والاعتماد"}{sync.revision&&" · "+sync.revision}{sync.at&&" · "+new Date(sync.at*1000).toLocaleString()}{sync.error&&" · "+sync.error}</p></section>;
}
