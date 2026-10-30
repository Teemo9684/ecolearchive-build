import type { CSSProperties } from "react";

/** Independent fixed-layout A4 school certificate preview.
 * The source DOCX is still used for archival save and official printing.
 * Coordinates mirror the actual uploaded certificate, not a generic template.
 */
const mm=(n:number)=>n+"mm";
const contentStyle:CSSProperties={fontFamily:"'Traditional Arabic',Arial,sans-serif",direction:"rtl",color:"#171717"};
function field(data:Record<string,string>,key:string){
  return data[key]?.trim()||"........................";
}
const rule:CSSProperties={position:"absolute",pointerEvents:"none",borderColor:"#141414"};
export function SchoolCertificateA4({data}:{data:Record<string,string>}){
  return <article dir="rtl" className="ecole-certificate-a4" style={{...contentStyle,width:mm(210),height:mm(297),minHeight:mm(297),position:"relative",background:"#fff",overflow:"hidden",margin:"0 auto",flexShrink:0,boxSizing:"border-box"}}>
    <style>{`
      .ecole-certificate-a4{font-synthesis:none}
      .ecole-certificate-a4 *{box-sizing:border-box}
      .ecole-certificate-a4 .cert-ribbon{position:relative;width:122mm;height:24mm;margin:0 auto;display:flex;align-items:center;justify-content:center;background:#d8d8d8;clip-path:polygon(0% 18%,16% 20%,16% 8%,84% 8%,84% 20%,100% 18%,89% 50%,100% 85%,72% 80%,27% 80%,0% 85%,11% 50%);font-size:27pt;font-weight:700}
      .ecole-certificate-a4 .cert-row{min-height:10.2mm;white-space:pre-wrap}
      .ecole-certificate-a4 .cert-field{font-weight:600}
      @media print{@page{size:A4;margin:0}.ecole-certificate-a4{box-shadow:none!important;break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    `}</style>
    <div style={{...rule,top:mm(6),bottom:mm(6),right:mm(8),borderRightWidth:"1.1mm"}}/>
    <div style={{...rule,top:mm(6),bottom:mm(6),left:mm(8),borderLeftWidth:"1.1mm"}}/>
    <div style={{...rule,left:mm(8),right:mm(8),top:mm(6),borderTopWidth:"0.9mm"}}/>
    <div style={{...rule,left:mm(8),right:mm(8),bottom:mm(6),borderBottomWidth:"0.9mm"}}/>
    {[[6,6],[196,6],[6,281],[196,281]].map(([x,y],i)=><div key={i} aria-hidden style={{position:"absolute",top:mm(y),left:mm(x),width:mm(9),height:mm(9),border:"1.3mm double #151515",transform:"rotate(45deg)",background:"#fff",zIndex:1}}/>)}
    <header style={{position:"absolute",top:mm(19),left:mm(17),right:mm(17),textAlign:"center",fontSize:"17pt",lineHeight:1.6,fontWeight:700}}>
      <div style={{textDecoration:"underline"}}>الجمهورية الجزائرية الديمقراطية الشعبية</div>
      <div>وزارة التربية الوطنية</div>
    </header>
    <section style={{position:"absolute",top:mm(51),right:mm(24),left:mm(20),fontSize:"12.5pt",fontWeight:700,lineHeight:1.95,textAlign:"right"}}>
      <div>مديرية التربية لولاية خنشلة</div>
      <div>المدرسة الابتدائية العربي التبسي</div>
      <div>الرقم: <span className="cert-field">{field(data,"رقم_الشهادة")}</span>/ م.ع.ت / <span className="cert-field">{field(data,"السنة_الدراسية")}</span></div>
    </section>
    <div style={{position:"absolute",top:mm(88),right:0,left:0}}><div className="cert-ribbon">شهادة مدرسية</div></div>
    <section style={{position:"absolute",top:mm(126),right:mm(24),left:mm(24),fontSize:"13.5pt",lineHeight:1.75,textAlign:"right"}}>
      <div className="cert-row">يشهد مدير(ة) المؤسسة أن السيد(ة):</div>
      <div className="cert-row">الاسم: <span className="cert-field">{field(data,"الاسم")}</span></div>
      <div className="cert-row">اللقب: <span className="cert-field">{field(data,"اللقب")}</span></div>
      <div className="cert-row" style={{display:"flex",flexWrap:"nowrap",justifyContent:"space-between",gap:mm(4)}}>
        <span>تاريخ الميلاد: <span className="cert-field">{field(data,"تاريخ_الميلاد")}</span></span>
        <span>مكان الميلاد: <span className="cert-field">{field(data,"مكان_الميلاد")}</span></span>
      </div>
      <div className="cert-row">المستوى الدراسي: <span className="cert-field">{field(data,"المستوى_الدراسي")}</span></div>
      <div className="cert-row">تاريخ الخروج من المؤسسة: <span className="cert-field">{field(data,"تاريخ_الخروج")}</span></div>
      <div className="cert-row">رقم التسجيل: <span className="cert-field">{field(data,"رقم_التسجيل")}</span></div>
      <div style={{marginTop:mm(7),textAlign:"center"}}>خنشلة في: <span className="cert-field">{field(data,"التاريخ")}</span></div>
      <div style={{marginTop:mm(7),paddingRight:mm(30),textAlign:"center",fontWeight:700}}>المديرة</div>
    </section>
  </article>;
}
