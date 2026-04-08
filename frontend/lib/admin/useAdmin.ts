"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type AdminState = { status: "loading" | "ok" | "forbidden" };

export function useAdminGuard() {
  const router = useRouter();
  const [state, setState] = useState<AdminState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/admin/dashboard/overview", { credentials: "include", cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          setState({ status: "ok" });
        } else {
          setState({ status: "forbidden" });
          router.replace("/login?next=/admin");
        }
      } catch {
        if (!cancelled) {
          setState({ status: "forbidden" });
          router.replace("/login?next=/admin");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  return state;
}

export function useAdminFetch<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
