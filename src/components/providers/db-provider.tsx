"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DatabaseBackup, RefreshCw } from "lucide-react";
import { getDatabase, type Database } from "@/lib/db";
import type { TableName } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";

const DbContext = createContext<Database | null>(null);

export function useDb(): Database {
  const db = useContext(DbContext);
  if (!db) throw new Error("useDb must be used inside <DbProvider>");
  return db;
}

export function DbProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getDatabase().then(
      (d) => alive && setDb(d),
      (err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => { alive = false; };
  }, [attempt]);

  const open = () => {
    setError(null);
    setAttempt((a) => a + 1);
  };

  if (error) {
    return (
      <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <DatabaseBackup className="size-7" aria-hidden />
        </div>
        <div className="max-w-sm space-y-1">
          <h1 className="text-lg font-semibold">Local storage could not be opened</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <Button onClick={open} size="lg">
          <RefreshCw /> Try again
        </Button>
      </div>
    );
  }
  if (!db) return <BootSkeleton />;
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

function BootSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="size-12 animate-pulse rounded-2xl bg-primary/15" />
        <span className="text-sm">Opening your planner…</span>
      </div>
    </div>
  );
}

export interface LiveQuery<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs `query` against the local database and re-runs it whenever one of
 * `tables` is written (or any table, if omitted). Keeps the previous result
 * while refreshing after a write, so the UI doesn't flash skeletons.
 * `deps` must be JSON-serialisable values (ids, keys, numbers).
 */
export function useLiveQuery<T>(query: (db: Database) => Promise<T>, deps: unknown[], tables?: TableName[]): LiveQuery<T> {
  const db = useDb();
  const depsKey = JSON.stringify(deps);
  const tablesKey = tables?.join(",") ?? "*";
  const queryRef = useRef(query);
  useLayoutEffect(() => {
    queryRef.current = query;
  });
  const [state, setState] = useState<{ data: T | undefined; error: string | null; key: string | null }>({ data: undefined, error: null, key: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    queryRef.current(db).then(
      (data) => !cancelled && setState({ data, error: null, key: depsKey }),
      (err: unknown) => !cancelled && setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err), key: depsKey })),
    );
    return () => { cancelled = true; };
  }, [db, depsKey, version]);

  useEffect(() => {
    const watch = tablesKey === "*" ? null : new Set(tablesKey.split(","));
    return db.onChange((changed) => {
      if (!watch || changed.some((t) => watch.has(t))) setVersion((v) => v + 1);
    });
  }, [db, tablesKey]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const current = state.key === depsKey;
  return { data: current ? state.data : undefined, error: current ? state.error : null, loading: !current, reload };
}
