import { describe, expect, it } from "vitest";
import { officialDocumentHtml } from "./officialDocumentHtml";

const info = {
 title:"جدول إرسال",kind:"جدول إرسال",headerLine:"الجمهورية الجزائرية الديمقراطية الشعبية",
 directorate:"مديرية التربية لولاية خنشلة",schoolName:"المدرسة الابتدائية العربي التبسي",city:"خنشلة",
};
describe("school official print layout",()=>{
 it("prints approved three-column dispatch and escapes user content",()=>{
   const html=officialDocumentHtml({...info,body:"رقم الإرسال: 005/2026\nإلى السيد مدير التربية\nالرقم | بيان الوثائق | عدد النسخ | ملاحظات\n01 | مقرر تعيين | 04 | <script>alert(1)</script>"});
   expect(html).toContain("<th>نوع الوثائق</th><th>العدد</th><th>ملاحظات</th>");
   expect(html).not.toContain("<th>الرقم</th>");
   expect(html).toContain("مقرر تعيين");
   expect(html).toContain("&lt;script&gt;");
   expect(html).not.toContain("<script>");
   expect(html).toContain("مديرة المدرسة");
 });
 it("does not alter the official school name",()=>{
   const html=officialDocumentHtml({...info,body:"وثائق إدارية"});
   expect(html).toContain("المدرسة الابتدائية العربي التبسي");
 });
});
