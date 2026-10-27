import { createFileRoute } from "@tanstack/react-router";
import { CorrespondencePage } from "@/components/app/CorrespondencePage";

export const Route = createFileRoute("/mail/outgoing")({
  head: () => ({
    meta: [
      { title: "البريد الصادر — منظومة الأرشيف المدرسي" },
      { name: "description", content: "تسجيل ومتابعة البريد الصادر من المدرسة." },
      { property: "og:title", content: "البريد الصادر" },
      { property: "og:description", content: "سجل البريد الصادر مع الترقيم والمرفقات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <CorrespondencePage direction="out" />,
});
