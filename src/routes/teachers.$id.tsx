import { createFileRoute } from "@tanstack/react-router";
import { StaffProfile } from "@/components/app/Staff";

export const Route = createFileRoute("/teachers/$id")({
  head: () => ({
    meta: [
      { title: "ملف أستاذ — منظومة الأرشيف المدرسي" },
      { name: "description", content: "الملف المهني للأستاذ." },
      { property: "og:title", content: "ملف أستاذ" },
      { property: "og:description", content: "الملف المهني والتنقيط والعطل والوثائق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  return <StaffProfile kind="teacher" id={id} />;
}
