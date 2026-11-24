export type BoardKind = "identity" | "statistics" | "calendar" | "schedule" | "news" | "document";
export const kinds: Record<BoardKind,string> = {identity:"البطاقة التقنية",statistics:"الإحصائيات",calendar:"الرزنامات",schedule:"التوقيت المدرسي",news:"الأخبار والإعلانات",document:"الوثائق"};
export interface BoardPage { id:string; kind:BoardKind; title:string; body:string; seconds:number; enabled:boolean; asset?:{mime:string; data:string}; }
export interface BoardSnapshot { schemaVersion:1; revision:string; approvedAt:string; school:string; year:string; pages:BoardPage[] }
export interface BoardRecord { id:string; pages:BoardPage[]; approved?:BoardSnapshot }
export function makeSnapshot(pages:BoardPage[],school:string,year:string,revision:string,approvedAt:string):BoardSnapshot {
 const selected=pages.filter(p=>p.enabled);
 if(!selected.length) throw new Error("فعّل صفحة واحدة على الأقل");
 return {schemaVersion:1,revision,approvedAt,school,year,pages:selected.map(p=>{
 if(!p.title.trim() || !Number.isInteger(p.seconds)||p.seconds<5||p.seconds>300) throw new Error("تحقق من عنوان الصفحة ومدة العرض");
 return {id:p.id,kind:p.kind,title:p.title,body:p.body,seconds:p.seconds,enabled:true,...(p.asset?{asset:{mime:p.asset.mime,data:p.asset.data}}:{})};
 })};
}
export function movePage(pages:BoardPage[],index:number,delta:number):BoardPage[]{
 const target=index+delta; if(index<0||index>=pages.length||target<0||target>=pages.length)return pages;
 const copy=[...pages]; [copy[index],copy[target]]=[copy[target],copy[index]]; return copy;
}
