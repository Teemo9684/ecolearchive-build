import type {BoardSnapshot} from "./model";
export function tvChecksum(data:unknown){const s=JSON.stringify(data);let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(16).padStart(8,"0");}
// Explicit projection into the current TV receiver's SchoolData contract.
// Missing information is blank, never copied from demonstration data.
export function toTvPackage(snapshot:BoardSnapshot,version:number){
 if(!Number.isSafeInteger(version)||version<1)throw new Error("رقم نسخة غير صالح");
 const pages=snapshot.pages.filter(p=>p.enabled);
 const rows=(kind:string)=>pages.filter(p=>p.kind===kind).flatMap(p=>p.rows??[]);
 const identity=rows("identity");const field=(label:string)=>identity.find(r=>r.cells[0]===label)?.cells[1]??"";
 const levels=rows("statistics").map(r=>({key:r.id,label:r.cells[0]??"",groups:Number(r.cells[1]),boys:Number(r.cells[2]),girls:Number(r.cells[3])}));
 const screen={identity:"school",statistics:"students",calendar:"calendars",schedule:"timetable",news:"news",document:"documents"} as const;
 const data={
 school:{name:snapshot.school,nameFr:field("الاسم بالفرنسية"),wilaya:field("الولاية"),commune:field("البلدية"),directorate:field("المديرية"),inspection:field("المقاطعة"),year:snapshot.year,opened:field("تاريخ الافتتاح"),classrooms:Number(field("عدد الحجرات"))||0,groups:levels.reduce((a,r)=>a+r.groups,0),system:field("نظام الدوام"),area:field("المساحة"),facilities:[],indicators:identity.filter(r=>r.cells[0]&&r.cells[1]).map(r=>({label:r.cells[0],value:r.cells[1]}))},
 levels,ages:[],teachers:{total:0,male:0,female:0,byRole:[],byLevel:[],seniority:[]},admin:{chart:{role:"الإدارة",name:""},staff:[]},workers:{categories:[],services:[]},rooms:[],
 calendars:pages.filter(p=>p.kind==="calendar").map(p=>({id:p.id,title:p.title,events:(p.rows??[]).map(r=>({date:r.cells[0],title:r.cells[1],note:r.cells.slice(2).filter(Boolean).join(" · ")}))})),
 timetable:{group:"",days:[]},slotsTimes:[],workHours:rows("schedule").map(r=>({label:[r.cells[0],r.cells[1]].filter(Boolean).join(" · "),value:[r.cells[2],r.cells[3]].join(" — ")})),parentHours:[],
 documents:pages.filter(p=>p.kind==="document"&&!p.asset).map(p=>({id:p.id,title:p.title,ref:"",date:"",pages:[{heading:p.title,blocks:[{p:p.body}]}]})),
 news:pages.filter(p=>p.kind==="news").flatMap(p=>p.rows?.length?p.rows.map(r=>({id:r.id,title:p.title,body:r.cells[1],date:r.cells[0],priority:"info" as const})):[{id:p.id,title:p.title,body:p.body,date:"",priority:"info" as const}]),
 history:[],playlist:pages.filter(p=>p.kind!=="document"||!p.asset).map(p=>({screen:screen[p.kind],seconds:p.seconds})),idleResumeSeconds:120};
 const checksum=tvChecksum(data);return {manifest:{version,checksum,approvedAt:snapshot.approvedAt},snapshot:{version,checksum,approvedAt:snapshot.approvedAt,source:"lan" as const,data}};
}
