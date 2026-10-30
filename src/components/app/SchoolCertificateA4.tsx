import type { CSSProperties } from "react";

const value=(data:Record<string,string>, key:string)=>data[key]?.trim()||"........................";
const paper:CSSProperties={width:"210mm",minHeight:"297mm",padding:"14mm 16mm",margin:"0 auto",background:"#fff",color:"#151515",position:"relative",boxSizing:"border-box",fontFamily:"'Traditional Arabic','Arial',serif",fontSize:"19px",lineHeight:1.8,direction:"rtl"};
const row:CSSProperties={display:"flex",justifyContent:"space-between",gap:"8mm",alignItems:"baseline"};
export function SchoolCertificateA4({data}:{data:Record<string,string>}) {
  return <article dir="rtl" className="ecole-certificate-a4" style={paper}>
    <style>{`@media print{@page{size:A4;margin:0}body *{visibility:hidden!important}.ecole-certificate-a4,.ecole-certificate-a4 *{visibility:visible!important}.ecole-certificate-a4{position:absolute!important;inset:0!important;margin:0!important;box-shadow:none!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}}.ecole-certificate-a4 *{box-sizing:border-box}.ecole-certificate-a4 .ornament{border:3px double #25364b;outline:1px solid #25364b;outline-offset:-7px}.ecole-certificate-a4 .certificate-title{background:#e5e5e5;border:1.5px solid #222;letter-spacing:.2px}`}</style>
    <div className="ornament" style={{position:"absolute",inset:"8mm",pointerEvents:"none",borderRadius:"2mm"}}/>
    <header style={{textAlign:"center",lineHeight:1.5,fontSize:"16px",fontWeight:700}}>
      <div>الجمهورية الجزائرية الديمقراطية الشعبية</div>
      <div>وزارة التربية الوطنية</div>
    </header>
    <div style={{marginTop:"9mm",fontSize:"16px",lineHeight:1.6}}>
      <div>مديرية التربية لولاية خنشلة</div>
      <div>المدرسة الابتدائية: العربي التبسي</div>
      <div>الرقم: {value(data,"رقم_الشهادة")}/ م.ع.ت / {value(data,"السنة_الدراسية")}</div>
    </div>
    <div className="certificate-title" style={{margin:"16mm auto 14mm",width:"115mm",textAlign:"center",fontSize:"28px",fontWeight:700,padding:"1.5mm 3mm"}}>شهادة مدرسية</div>
    <section style={{margin:"0 9mm",fontSize:"22px",lineHeight:2.2}}>
      <p style={{margin:"0 0 6mm"}}>يشهد مدير(ة) المؤسسة أن السيد(ة):</p>
      <div>الاسم: <strong>{value(data,"الاسم")}</strong></div>
      <div>اللقب: <strong>{value(data,"اللقب")}</strong></div>
      <div style={row}><span>تاريخ الميلاد: <strong>{value(data,"تاريخ_الميلاد")}</strong></span><span>مكان الميلاد: <strong>{value(data,"مكان_الميلاد")}</strong></span></div>
      <div>المستوى الدراسي: <strong>{value(data,"المستوى_الدراسي")}</strong></div>
      <div>تاريخ الخروج من المؤسسة: <strong>{value(data,"تاريخ_الخروج")}</strong></div>
      <div>رقم التسجيل: <strong>{value(data,"رقم_التسجيل")}</strong></div>
      <div style={{textAlign:"left",marginTop:"20mm"}}>خنشلة في: {value(data,"التاريخ")}</div>
      <div style={{textAlign:"left",margin:"5mm 20mm 0 0",fontWeight:700}}>المديرة</div>
    </section>
  </article>;
}
