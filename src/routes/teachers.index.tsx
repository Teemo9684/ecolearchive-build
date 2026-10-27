import { createFileRoute } from "@tanstack/react-router";
import { StaffList } from "@/components/app/Staff";

export const Route = createFileRoute("/teachers/")({
  head: () => ({
    meta: [
      { title: "العمال التربويون — منظومة الأرشيف المدرسي" },
      { name: "description", content: "دليل الأساتذة وملفاتهم المهنية." },
      { property: "og:title", content: "العمال التربويون" },
      { property: "og:description", content: "سجلات مهنية للأساتذة: التنقيط والمردودية والعطل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StaffList kind="teacher" />,
});
