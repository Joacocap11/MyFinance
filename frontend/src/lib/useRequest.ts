import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

export interface RequestState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  retry: () => void;
  setData: Dispatch<SetStateAction<T | null>>;
}

export function useRequest<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[],
): RequestState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [settledIdentity, setSettledIdentity] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  const dependencyKey = JSON.stringify(dependencies) ?? "";
  const requestIdentity = `${dependencyKey}:${attempt}`;

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    void loaderRef
      .current(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setError(null);
        setSettledIdentity(requestIdentity);
      })
      .catch((reason: unknown) => {
        if (
          controller.signal.aborted ||
          (reason instanceof DOMException && reason.name === "AbortError")
        )
          return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Ocurrió un error inesperado",
        );
        setSettledIdentity(requestIdentity);
      });
    return () => controller.abort();
  }, [requestIdentity]);

  const isPending = settledIdentity !== requestIdentity;
  return {
    data,
    error: isPending ? null : error,
    loading: isPending && data === null,
    refreshing: isPending && data !== null,
    retry,
    setData,
  };
}
