import { useEffect, useState } from "react";
import type { Correspondence } from "@/lib/db/types";

// Keep read receipts locally; never change correspondence status or delete mail.
const KEY = "ecolearchive:seen-incoming:v1";
const EVENT = "ecolearchive:incoming-read";
const readSeen = (): string[] => {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
};

export function useIncomingAlerts(records: Correspondence[], path: string): number {
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    const refresh = () => setSeen(readSeen());
    refresh();
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  useEffect(() => {
    if (!path.startsWith("/mail/incoming")) return;
    const ids = records.filter(c => c.direction === "in" && !c.deletedAt).map(c => c.id);
    if (!ids.length) return;
    const existing = readSeen();
    const merged = Array.from(new Set([...existing, ...ids]));
    if (merged.length === existing.length) return;
    localStorage.setItem(KEY, JSON.stringify(merged));
    window.dispatchEvent(new Event(EVENT));
  }, [records, path]);
  const seenSet = new Set(seen);
  return records.filter(c => c.direction === "in" && !c.deletedAt && !seenSet.has(c.id)).length;
}
