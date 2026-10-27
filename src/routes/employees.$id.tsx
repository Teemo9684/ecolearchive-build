import { createFileRoute } from "@tanstack/react-router";
import { StaffProfile } from "@/components/app/Staff";

export const Route = createFileRoute("/employees/$id")({
  head: () => ({
    meta: [
      { title: "ملف عامل — منظومة الأرشيف المدرسي" },
      { name: "description", content: "الملف المهني للعامل." },
      { property: "og:title", content: "ملف عامل" },
      { property: "og:description", content: "الملف المهني والتنقيط والعطل والوثائق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  return <StaffProfile kind="employee" id={id} />;
}
