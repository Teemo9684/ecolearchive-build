/**
 * Native DOCX template rendering.
 * Input is an authentic .docx (ZIP/OOXML) and output remains an authentic .docx.
 * Template tags use {field}, e.g. {المرسل_إليه}. Fields may span
 * several Word runs, but should remain inside one paragraph.
 * No HTML-to-Word conversion is performed.
 */
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function renderApprovedDocx(
  source: ArrayBuffer | Uint8Array,
  values: Record<string, string>,
): Blob {
  const zip = new PizZip(source);
  // strict null handling: a missing required field must not silently turn blank.
  const required = extractApprovedDocxFields(source);
  if (!required.length) throw new Error("القالب لا يحتوي على أي حقول للتعبئة");
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(values, key) || !values[key]?.trim()) {
      throw new Error(`حقل غير معبأ: ${key}`);
    }
  }
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: (part) => { throw new Error(`حقل غير معبأ: ${part.value}`); },
  });
  doc.render(values);
  const bytes = doc.getZip().generate({ type: "uint8array", compression: "DEFLATE" });
  // Copy to an ArrayBuffer with a concrete backing store (TS 5.8 BlobPart safe).
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: DOCX_MIME });
}

export async function renderApprovedDocxFile(
  source: File,
  values: Record<string, string>,
  filename: string,
): Promise<File> {
  if (!source.name.toLowerCase().endsWith(".docx")) {
    throw new Error("القالب لازم يكون بصيغة DOCX");
  }
  const result = renderApprovedDocx(await source.arrayBuffer(), values);
  const safeName = filename.replace(/[\\/:*?"<>|]/g, "-").trim();
  if (!safeName || safeName === ".docx") throw new Error("اسم الوثيقة مطلوب");
  return new File([result], safeName.toLowerCase().endsWith(".docx") ? safeName : `${safeName}.docx`, { type: DOCX_MIME });
}

/** Extract placeholders, including tags split across styled Word runs. */
export function extractApprovedDocxFields(source: ArrayBuffer | Uint8Array): string[] {
  const zip = new PizZip(source);
  const names = new Set<string>();
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(name)) continue;
    const xml = zip.file(name)?.asText() ?? "";
    const paragraphs = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];
    for (const paragraph of paragraphs) {
      const text = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map(m => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"))
        .join("");
      for (const match of text.matchAll(/\{([^{}]+)\}/g)) {
        const key = match[1].trim();
        if (key) names.add(key);
      }
    }
  }
  return [...names];
}
