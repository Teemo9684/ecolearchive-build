import { createFileRoute } from "@tanstack/react-router";
import { NativeWordComposer } from "@/components/app/NativeWordComposer";

export const Route = createFileRoute("/templates")({
  validateSearch: (search: Record<string, unknown>) => ({
    kind: search.kind === "bordereau" || search.kind === "correspondence" ? search.kind : undefined,
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const { kind } = Route.useSearch();
  return <div dir="rtl" className="mx-auto max-w-5xl"><NativeWordComposer initialKind={kind} /></div>;
}
