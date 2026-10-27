import { describe, it, expect } from "vitest";
import { createUpdateManifest } from "./manifest";
const valid = () => ({
  version:"0.2.0",url:"https://github.com/Teemo9684/ecolearchive-updates/releases/download/v0.2.0/ecolearchive-setup.exe",
  signature:"ed25519-signature-from-signed-tauri-updater-artifact-with-enough-length",
  publishedAt:"2026-10-24T12:00:00Z"
});
describe("signed remote Windows updates manifest",() => {
  it("creates the Tauri updater windows platform payload",() => {
    const m=createUpdateManifest(valid());
    expect(m.platforms["windows-x86_64"].url).toContain("/releases/download/");
    expect(m.version).toBe("0.2.0");
  });
  it("rejects unsigned and insecure updates",() => {
    expect(()=>createUpdateManifest({...valid(),signature:""})).toThrow();
    expect(()=>createUpdateManifest({...valid(),url:"http://example.org/a.exe"})).toThrow();
    expect(()=>createUpdateManifest({...valid(),version:"next"})).toThrow();
  });
});
