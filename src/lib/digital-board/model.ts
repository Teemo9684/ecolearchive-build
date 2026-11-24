export type BoardKind = "identity" | "statistics" | "calendar" | "schedule" | "news" | "document";
export const kinds: Record<BoardKind,string> = {identity:"البطاقة التقنية",statistics:"الإحصائيات",calendar:"الرزنامات",schedule:"التوقيت المدرسي",news:"الأخبار والإعلانات",document:"الوثائق"};
export interface BoardRow { id:string; cells:string[] }
export const columns:Partial<Record<BoardKind,string[]>>={identity:["البيان","القيمة"],statistics:["المستوى / الفئة","الأفواج","ذكور","إناث"],calendar:["التاريخ","النشاط","التوقيت","المكان"],schedule:["اليوم","الفترة","من","إلى"],news:["التاريخ","الإعلان"]};
export function totalStudents(rows:BoardRow[]){return rows.reduce((a,r)=>{const n=(i:number)=>/^\d+$/.test(r.cells[i]??"")?Number(r.cells[i]):0;return {groups:a.groups+n(1),boys:a.boys+n(2),girls:a.girls+n(3)};},{groups:0,boys:0,girls:0});}
export interface BoardPage { id:string; kind:BoardKind; title:string; body:string; seconds:number; enabled:boolean; rows?:BoardRow[]; asset?:{mime:string; data:string}; }
export interface BoardSnapshot { schemaVersion:1; revision:string; approvedAt:string; school:string; year:string; pages:BoardPage[] }
export interface BoardRecord { id:string; pages:BoardPage[]; approved?:BoardSnapshot }
export function makeSnapshot(pages:BoardPage[],school:string,year:string,revision:string,approvedAt:string):BoardSnapshot {
 const selected=pages.filter(p=>p.enabled);
 if(!selected.length) throw new Error("فعّل صفحة واحدة على الأقل");
 return {schemaVersion:1,revision,approvedAt,school,year,pages:selected.map(p=>{
 if(!p.title.trim() || !Number.isInteger(p.seconds)||p.seconds<5||p.seconds>300) throw new Error("تحقق من عنوان الصفحة ومدة العرض");
 if(p.kind==="statistics" && p.rows?.some(r=>[1,2,3].some(i=>!/^\d{1,6}$/.test(r.cells[i]??"")))) throw new Error("أدخل أعداداً صحيحة غير سالبة في الإحصائيات");
 if(p.asset && (!["image/png","image/jpeg","image/webp","application/pdf"].includes(p.asset.mime)||!p.asset.data.startsWith("data:"+p.asset.mime+";base64,")||p.asset.data.length>14*1024*1024)) throw new Error("ملف العرض غير صالح");
 return {id:p.id,kind:p.kind,title:p.title,body:p.body,seconds:p.seconds,enabled:true,...(p.rows?{rows:p.rows.map(r=>({id:r.id,cells:r.cells.map(String)}))}:{}),...(p.asset?{asset:{mime:p.asset.mime,data:p.asset.data}}:{})};
 })};
}
export function movePage(pages:BoardPage[],index:number,delta:number):BoardPage[]{
 const target=index+delta; if(index<0||index>=pages.length||target<0||target>=pages.length)return pages;
 const copy=[...pages]; [copy[index],copy[target]]=[copy[target],copy[index]]; return copy;
}
