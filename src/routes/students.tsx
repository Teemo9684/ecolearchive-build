import { createFileRoute, Link } from "@tanstack/react-router";
import { FilePlus2, FolderOpen, Send, Inbox, FileText, GraduationCap } from "lucide-react";

/**
 * Student affairs handles administrative paperwork only.
 * Student master data belongs to the Ministry platform and is not duplicated here.
 */
export const Route = createFileRoute("/students")({ component: StudentAffairs });

const actions = [
  { title: "شهادة مدرسية", detail: "إنشاء وتحرير الشهادات الإدارية للتلاميذ", to: "/templates" as const, icon: FilePlus2 },
  { title: "طلبات التحويل", detail: "إعداد مراسلات التحويل والإحالة وحفظ نسخها", to: "/templates" as const, icon: GraduationCap },
  { title: "استدعاءات الأولياء", detail: "تحضير استدعاء أو إشعار غياب قابل للطباعة", to: "/templates" as const, icon: FileText },
  { title: "المراسلات الصادرة", detail: "تسجيل وإرسال المراسلات المتعلقة بالتلاميذ", to: "/mail/outgoing" as const, icon: Send },
  { title: "المراسلات الواردة", detail: "متابعة الطلبات والملفات المستلمة", to: "/mail/incoming" as const, icon: Inbox },
  { title: "الأرشيف الرقمي", detail: "البحث عن الوثائق المحفوظة حسب نوعها وسنتها", to: "/archive" as const, icon: FolderOpen },
];

function StudentAffairs() {
  return <section dir="rtl" className="space-y-6">
    <header className="space-y-2">
      <h1 className="text-2xl font-bold">شؤون التلاميذ</h1>
      <p className="text-sm text-muted-foreground">الوثائق والمعاملات الإدارية الخاصة بالتلاميذ، دون تكرار سجلات المنصة الوزارية.</p>
    </header>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {actions.map(({ title, detail, to, icon: Icon }) =>
        <Link key={title} to={to} className="group rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/30">
          <Icon aria-hidden="true" className="mb-3 h-7 w-7 text-primary" />
          <h2 className="font-bold">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        </Link>
      )}
    </div>
  </section>;
}
