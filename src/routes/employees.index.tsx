import { createFileRoute } from "@tanstack/react-router";
import { StaffList } from "@/components/app/Staff";

export const Route = createFileRoute("/employees/")({
  head: () => ({
    meta: [
      { title: "عمال المؤسسة — منظومة الأرشيف المدرسي" },
      { name: "description", content: "دليل العمال الإداريين وعمال الصيانة والخدمات." },
      { property: "og:title", content: "عمال المؤسسة" },
      { property: "og:description", content: "الملفات المهنية للعمال." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <StaffList kind="employee" />,
});
