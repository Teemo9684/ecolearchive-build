/** Builds an official Tauri v2 latest.json manifest.
 * The signature must come from the signed updater artifact, never synthesized.
 */
export interface SignedRelease {
  version: string;
  url: string;
  signature: string;
  notes?: string;
  publishedAt?: string;
}
export function createUpdateManifest(release: SignedRelease) {
  const { version, url, signature, notes = "", publishedAt } = release;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error("رقم الإصدار غير صالح");
  if (!/^https:\/\//.test(url) || !url.includes("/releases/download/"))
    throw new Error("رابط ملف التحديث لازم يكون HTTPS رسمي");
  if (!signature.trim() || signature.trim().length < 50)
    throw new Error("توقيع التحديث مفقود أو غير صالح");
  const date = publishedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(date))) throw new Error("تاريخ النشر غير صالح");
  return {
    version,
    notes,
    pub_date: date,
    platforms: {
      "windows-x86_64": { signature: signature.trim(), url },
    },
  };
}
