import { SchoolCertificateA4 } from "./SchoolCertificateA4";

type Props={
  selected:string; values:Record<string,string>; busy:boolean;
  onClose:()=>void; onConfirm:()=>void;
};
/** Confirmation before native Word printing. Never calls window.print on a DOCX approximation. */
export function PrintReviewDialog({selected,values,busy,onClose,onConfirm}:Props){
  const certificate=/شهادة\s*مدرسية/i.test(selected);
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-2 sm:p-4" dir="rtl" role="dialog" aria-modal="true" aria-label="مراجعة الوثيقة قبل الطباعة">
    <div className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div><h2 className="text-lg font-bold">مراجعة قبل الطباعة</h2><p className="text-xs text-muted-foreground">{selected.replace(/\.docx$/i,"")} — ورقة A4</p></div>
        <button className="rounded-lg border px-4 py-2" onClick={onClose} disabled={busy}>إغلاق</button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[235px_minmax(0,1fr)]">
        <aside className="space-y-4 border-b p-4 text-sm lg:border-b-0 lg:border-l">
          <div><h3 className="font-bold">الوثيقة الأصلية</h3><p className="mt-2 text-muted-foreground">الطباعة النهائية تتم بواسطة Microsoft Word للحفاظ على الهوامش والزخارف والأشكال الخاصة.</p></div>
          <div className="rounded-lg border p-3"><strong>حجم الورق:</strong> A4<br/><strong>الاتجاه:</strong> حسب قالب Word الأصلي<br/><strong>عدد النسخ والطابعة:</strong> تضبطهما من نافذة الطباعة في Windows أو Word</div>
          <p className="text-xs text-muted-foreground">المعاينة هنا إرشادية، وقد تختلف عناصر Word المعقدة. راجع صفحة الطباعة النهائية قبل التأكيد إن أظهرها نظامك.</p>
          <button className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50" disabled={busy} onClick={onConfirm}>{busy?"جارٍ تجهيز الوثيقة…":"متابعة إلى الطباعة"}</button>
        </aside>
        <div className="min-h-0 overflow-auto bg-gray-200 p-3 text-gray-900">
          {certificate?<SchoolCertificateA4 data={values}/>:<div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center rounded-lg bg-white p-10 text-center shadow">
            <h3 className="text-lg font-bold">المعاينة الدقيقة لهذه الوثيقة تعتمد على Word</h3>
            <p className="mt-3 text-sm">للحفاظ على الشكل الأصلي، اضغط «متابعة إلى الطباعة» لفتح مسار الطباعة الرسمي. لا يتم طبع أي محتوى من هذه البطاقة.</p>
          </div>}
        </div>
      </div>
    </div>
  </div>;
}
