import { createFileRoute } from "@tanstack/react-router";
import { NativeWordComposer } from "@/components/app/NativeWordComposer";

export const Route = createFileRoute("/templates")({
  component: () => <div dir="rtl" className="mx-auto max-w-5xl"><NativeWordComposer /></div>,
});
