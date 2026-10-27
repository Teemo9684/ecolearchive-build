import { describe, expect, it } from "vitest";
import { officialDocumentHtml } from "@/lib/services/officialDocumentHtml";

const base = {
  kind:"جدول إرسال", title:"جدول إرسال",
  headerLine:"الجمهورية الجزائرية الديمقراطية الشعبية",
  directorate:"مديرية التربية لولاية خنشلة",
  schoolName:"المدرسة الابتدائية العربي التبسي",city:"خنشلة",
};
describe("Official administrative document preview",()=>{
 it("uses the agreed three-column layout and retains quantities",()=>{
  const html=officialDocumentHtml({...base,body:"إلى السيد مدير التربية\nالرقم | بيان الوثائق | عدد النسخ | ملاحظات\n01 | مقرر التعيين | 04 | أصلية"});
  expect(html).toContain("<th>نوع الوثائق</th><th>العدد</th><th>ملاحظات</th>");
  expect(html).toContain("مقرر التعيين");
  expect(html).toContain(">04</td>");
  expect(html).toContain("مديرة المدرسة");
  expect(html).not.toContain("زخرفة");
 });
 it("escapes markup entered in a document title or its body",()=>{
  const html=officialDocumentHtml({...base,kind:"مراسلة إدارية",title:"<script>alert(1)</script>",body:"<img src=x onerror=alert(1)>"});
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;script&gt;");
 });
});
