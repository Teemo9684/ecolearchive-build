import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("Windows desktop repository", () => {
  it("uses Tauri SQLite commands and emits updates to subscribed screens", async () => {
    const calls: Array<{ command: string; args: any }> = [];
    const stored = new Map<string, any>();
    const invoke = vi.fn(async (command: string, args: any = {}) => {
      calls.push({ command, args });
      if (command === "list_records") return [...stored.values()];
      if (command === "get_record") return stored.get(args.id) ?? null;
      if (command === "put_record") { stored.set(args.value.id, args.value); return null; }
      if (command === "remove_record") { stored.delete(args.id); return null; }
      return null;
    });
    vi.stubGlobal("window", { __TAURI_INTERNALS__: { invoke } });
    const { repo, subscribe } = await import("./idb");
    const changed = vi.fn();
    const stop = subscribe("students", changed);
    await repo<{ id: string; name: string }>("students").put({ id: "1", name: "أحمد" });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(await repo<{ id: string; name: string }>("students").list()).toEqual([{ id: "1", name: "أحمد" }]);
    await repo<{ id: string }>("students").remove("1");
    expect(changed).toHaveBeenCalledTimes(2);
    expect(calls.map(c => c.command)).toContain("put_record");
    expect(calls.map(c => c.command)).toContain("remove_record");
    stop();
  });

  it("preserves IndexedDB as the browser-only fallback", async () => {
    vi.stubGlobal("window", {});
    const { isDesktopRuntime } = await import("./desktop");
    expect(isDesktopRuntime()).toBe(false);
  });
});
