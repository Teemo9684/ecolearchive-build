import { useSyncExternalStore } from "react";
import { isDesktopRuntime } from "@/lib/db/desktop";

let available: string | null = null;
let checking = false;
const listeners = new Set<() => void>();
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function snapshot() { return available; }
export function useAvailableDesktopUpdate() { return useSyncExternalStore(subscribe, snapshot, snapshot); }

export async function checkDesktopUpdateNow() {
  if (!isDesktopRuntime() || checking) return;
  checking = true;
  try {
    const result = await window.__TAURI_INTERNALS__!.invoke("check_desktop_update");
    const next = typeof result === "string" && result ? result : null;
    if (next !== available) {
      available = next;
      listeners.forEach(fn => fn());
    }
  } catch {
    // Never discard an already discovered update during a temporary network failure.
  } finally { checking = false; }
}
