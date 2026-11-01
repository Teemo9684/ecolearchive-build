import { useSyncExternalStore } from "react";

// Shared, in-memory Gmail indicator. No message content or account credentials stored.
let unread = 0;
const subscribers = new Set<() => void>();
export function setGmailUnreadCount(value: number) {
  const next = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  if (next === unread) return;
  unread = next;
  subscribers.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}
function getSnapshot() { return unread; }
export function useGmailUnreadCount() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
