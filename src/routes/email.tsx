import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, Inbox, Send, Paperclip, ShieldCheck, Archive, ExternalLink } from "lucide-react";

/**
 * Gmail integration entry point.
 * Do not request Gmail credentials or store OAuth tokens in localStorage.
 * OAuth desktop authorization must be configured before enabling live actions.
 */
export const Route = createFileRoute("/email")({
  component: EmailCenter,
});

function EmailCenter() {
  const features = [
    { title: "البريد الوارد", icon: Inbox, description: "استقبال الرسائل والبحث فيها بعد ربط Gmail" },
    { title: "إرسال رسالة", icon: Send, description: "إرسال مراسلة مع مرفقاتها بعد الربط" },
    { title: "المرفقات", icon: Paperclip, description: "حفظ المستندات التي تختارها في الأرشيف" },
    { title: "الأرشفة", icon: Archive, description: "تسجيل المراسلات المختارة دون تكرار" },
  ];
  return (
    <section className="space-y-5" dir="rtl">
      <header className="panel p-5">
        <h1 className="flex items-center gap-3 text-xl font-bold"><Mail className="h-6 w-6" /> البريد الإلكتروني المدرسي</h1>
        <p className="mt-2 text-sm text-muted-foreground">إدارة Gmail من داخل المنظومة بعد تفعيل الاتصال الرسمي والآمن.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {features.map(({title,icon:Icon,description})=>(
          <div key={title} className="panel flex items-center gap-3 p-5" title={description}>
            <Icon className="h-6 w-6 shrink-0 text-primary"/>
            <div className="font-semibold">{title}</div>
          </div>
        ))}
      </div>
      <div className="panel space-y-3 p-5">
        <div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5"/> إعداد الاتصال</div>
        <p className="text-sm">اتصال Gmail غير مفعّل بعد. سيستعمل البرنامج تسجيل الدخول الرسمي من Google، دون إدخال كلمة مرور البريد داخل المنظومة.</p>
        <p className="text-sm text-muted-foreground">يلزم إعداد مشروع Google Cloud وتفعيل Gmail API وبيانات OAuth لتطبيق Windows. لن يرسل البرنامج أو يقرأ أي رسالة قبل منح الإذن.</p>
        <a className="inline-flex items-center gap-2 text-sm font-semibold text-primary underline" href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener noreferrer">
          إعداد Gmail API <ExternalLink className="h-4 w-4"/>
        </a>
        <div><Link to="/mail/incoming" className="text-sm text-primary underline">الانتقال إلى سجل البريد الوارد الإداري</Link></div>
      </div>
    </section>
  );
}
