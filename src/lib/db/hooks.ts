import { useEffect, useState } from "react";
import { repo, subscribe, type StoreName } from "./idb";
import { ensureSeed, DEFAULT_SETTINGS } from "./seed";
import type { Settings } from "./types";

export function useCollection<T extends { id: string }>(store: StoreName) {
  const [data, setData] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      ensureSeed()
        .then(() => repo<T>(store).list())
        .then((d) => alive && setData(d))
        .catch((e) => alive && setError(String(e?.message ?? e)));
    load();
    const off = subscribe(store, load);
    return () => {
      alive = false;
      off();
    };
  }, [store]);
  return { data: data ?? [], loading: data === null && !error, error };
}

export function useSettings(): Settings {
  const { data } = useCollection<Settings>("settings");
  return data.find((s) => s.id === "main") ?? DEFAULT_SETTINGS;
}
