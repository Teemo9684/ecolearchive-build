import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { renderApprovedDocx, extractApprovedDocxFields, DOCX_MIME } from "./native-docx";

const readBlob = (blob: Blob): Promise<ArrayBuffer> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error);
  reader.onload = () => resolve(reader.result as ArrayBuffer);
  reader.readAsArrayBuffer(blob);
});
function minimalDocx(text: string) {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`);
  return zip.generate({type:"uint8array"});
}
describe("native DOCX generation", () => {
  it("refuses templates without fillable fields", () => {
    expect(() => renderApprovedDocx(minimalDocx("نص ثابت"), {})).toThrow();
  });
  it("rejects empty fields even when provided as blank strings", () => {
    expect(() => renderApprovedDocx(minimalDocx("{recipient}"), {recipient: "  "})).toThrow();
  });
  it("discovers field names in the header as well as body", () => {
    const zip = new PizZip(minimalDocx("{body}"));
    zip.file("word/header1.xml", '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>{school}</w:t></w:r></w:p></w:hdr>');
    expect(extractApprovedDocxFields(zip.generate({type:"uint8array"})).sort()).toEqual(["body", "school"]);
  });
  it("extracts fields split between Word runs", () => {
    const zip = new PizZip(minimalDocx("placeholder"));
    const xml = zip.file("word/document.xml")!.asText().replace(
      "<w:t>placeholder</w:t>",
      "<w:t>{المرسل</w:t></w:r><w:r><w:t>_إليه}</w:t>"
    );
    zip.file("word/document.xml", xml);
    const input = zip.generate({type:"uint8array"});
    expect(extractApprovedDocxFields(input)).toContain("المرسل_إليه");
  });
  it("replaces placeholders inside real OOXML and keeps source unchanged", async () => {
    const original = minimalDocx("{recipient}");
    const copyBefore = new Uint8Array(original);
    const output = renderApprovedDocx(original, {recipient:"مديرية التربية"});
    expect(output.type).toBe(DOCX_MIME);
    const opened = new PizZip(new Uint8Array(await readBlob(output)));
    expect(opened.file("word/document.xml")!.asText()).toContain("مديرية التربية");
    expect(new Uint8Array(original)).toEqual(copyBefore);
  });
  it("rejects missing required values", () => {
    expect(() => renderApprovedDocx(minimalDocx("{recipient}"), {})).toThrow();
  });
});
