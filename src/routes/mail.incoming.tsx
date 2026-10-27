import { createFileRoute } from "@tanstack/react-router";
import { CorrespondencePage } from "@/components/app/CorrespondencePage";

export const Route = createFileRoute("/mail/incoming")({
  head: () => ({
    meta: [
      { title: "البريد الوارد — منظومة الأرشيف المدرسي" },
      { name: "description", content: "تسجيل ومتابعة البريد الوارد إلى المدرسة." },
      { property: "og:title", content: "البريد الوارد" },
      { property: "og:description", content: "سجل البريد الوارد مع المرفقات والأولوية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <CorrespondencePage direction="in" />,
});
