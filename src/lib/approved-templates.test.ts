import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { copyApprovedTemplate, readApprovedTemplate } from "./approved-templates";

const readBytes = (file: Blob): Promise<Uint8Array> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error);
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
  reader.readAsArrayBuffer(file);
});

describe("approved template file safeguards", () => {
  it("rejects an unsupported template extension", async () => {
    const input = new File(["plain text"], "document.txt", { type: "text/plain" });
    await expect(readApprovedTemplate(input)).rejects.toThrow();
  });
  it("rejects files that pretend to be DOCX", async () => {
    const input = new File(["not a word document"], "fake.docx");
    await expect(readApprovedTemplate(input)).rejects.toThrow();
  });
  it("accepts a PDF signature and returns a separate copy", async () => {
    const input = new File(["%PDF-1.7\nexample"], "form.pdf", { type: "application/pdf" });
    const template = await readApprovedTemplate(input);
    const copy = copyApprovedTemplate(template);
    expect(copy).not.toBe(input);
    expect(copy.name).toBe("form.pdf");
    expect(await readBytes(copy)).toEqual(await readBytes(input));
  });
  it("rejects ZIP files that lack the required Word document", async () => {
    const zip = new PizZip();
    zip.file("notes.txt", "not a Word document");
    const bytes = zip.generate({ type: "uint8array" });
    await expect(readApprovedTemplate(new File([bytes], "fake.docx"))).rejects.toThrow();
  });
  it("recognizes real DOCX package parts without converting them to HTML", async () => {
    const zip = new PizZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("word/document.xml", "<w:document/>");
    const bytes = zip.generate({ type: "uint8array" });
    const input = new File([bytes], "letter.docx");
    const approved = await readApprovedTemplate(input);
    expect(approved.format).toBe("docx");
    const copy = copyApprovedTemplate(approved);
    expect(await readBytes(copy)).toEqual(await readBytes(input));
  });
});
