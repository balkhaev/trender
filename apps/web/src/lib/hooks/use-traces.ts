"use client";

import { useQuery } from "@tanstack/react-query";
import { getTrace, getTraces, type TracesFilter } from "../traces-api";

export function useTraces(filter: TracesFilter = {}) {
  return useQuery({
    queryKey: ["traces", filter],
    queryFn: () => getTraces(filter),
    refetchInterval: 5000,
  });
}

export function useTrace(traceId: string | null) {
  return useQuery({
    queryKey: ["trace", traceId],
    queryFn: () => (traceId ? getTrace(traceId) : null),
    enabled: !!traceId,
    refetchInterval: 3000,
  });
}
