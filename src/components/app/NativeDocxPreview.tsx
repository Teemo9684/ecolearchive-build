import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";

/** Isolated, offline DOCX preview. This is a browser rendering, not Word-identical pagination. */
export function NativeDocxPreview({ file, printFrame = false }: { file: File; printFrame?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const doc = frame.current?.contentDocument;
        if (!doc) throw new Error("تعذر فتح محرك العرض الداخلي");
        doc.body.replaceChildren();
        doc.body.style.margin = "0";
        doc.body.style.background = "#e5e7eb";
        const reset = doc.createElement("style");
        reset.textContent = `@page {size:A4; margin:0} body {margin:0} @media print {body {background:white !important} .docx-wrapper {background:transparent !important; padding:0 !important} .docx-wrapper>section {box-shadow:none !important; margin:0 !important} }`;
        doc.head.appendChild(reset);
        const bytes = await file.arrayBuffer();
        if (!active) return;
        await renderAsync(bytes, doc.body, doc.head, {
          breakPages: true, inWrapper: true, useBase64URL: true,
          ignoreLastRenderedPageBreak: false,
        });
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [file]);

  return <div className="relative h-full min-h-[500px]">
    {loading && <p role="status" className="p-3 text-sm">جارٍ تجهيز العرض الداخلي…</p>}
    {error && <p role="alert" className="p-3 text-sm text-red-600">تعذر عرض DOCX: {error}</p>}
    <iframe ref={frame} id={printFrame ? "ecolearchive-print-frame" : undefined}
      title="معاينة DOCX الداخلية" className="h-full min-h-[500px] w-full rounded bg-white"
      style={{ display: error ? "none" : "block" }} />
  </div>;
}
