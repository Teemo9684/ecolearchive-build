import { describe, expect, it } from "vitest";
import { officialDocumentHtml } from "./officialDocumentHtml";
const sample={kind:"جدول إرسال",title:"جدول إرسال",body:"الرقم | بيان الوثائق | عدد النسخ | ملاحظات\n01 | ملف توظيف | 04 | نسخة أصلية",headerLine:"الجمهورية الجزائرية الديمقراطية الشعبية",directorate:"مديرية التربية لولاية خنشلة",schoolName:"المدرسة الابتدائية العربي التبسي",city:"خنشلة"};
describe("official transmittal form",()=>{
  it("renders exactly three columns",()=>{
    const html=officialDocumentHtml(sample);
    expect(html.match(/<th>/g)).toHaveLength(3);
    expect(html).toContain("<td>ملف توظيف</td><td>04</td><td>نسخة أصلية</td>");
    expect(html).not.toContain("<th>الرقم</th>");
  });
  it("escapes supplied document text safely",()=>{
    const html=officialDocumentHtml({...sample,title:"<script>bad</script>"});
    expect(html).not.toContain("<script>bad</script>");
    expect(html).toContain("&lt;script&gt;bad&lt;/script&gt;");
  });
});
