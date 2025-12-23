const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export type SpanKind =
  | "internal"
  | "server"
  | "client"
  | "producer"
  | "consumer";
export type SpanStatus = "unset" | "ok" | "error";

export type TraceSpan = {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: SpanKind;
  service: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: SpanStatus;
  errorMessage: string | null;
  attributes: Record<string, unknown> | null;
  events: Array<{
    name: string;
    timestamp: string;
    attributes?: Record<string, unknown>;
  }> | null;
};

export type Trace = {
  id: string;
  traceId: string;
  name: string;
  rootService: string;
  rootPath: string | null;
  userId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: SpanStatus;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  spans?: TraceSpan[];
  _count?: { spans: number };
};

export type TracesFilter = {
  limit?: number;
  offset?: number;
  status?: SpanStatus;
  service?: string;
  from?: string;
  to?: string;
};

export async function getTraces(
  filter: TracesFilter = {}
): Promise<{ traces: Trace[]; total: number }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined) params.set(key, String(value));
  }

  const response = await fetch(`${API_URL}/api/traces?${params}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to get traces");
  return response.json();
}

export async function getTrace(traceId: string): Promise<Trace> {
  const response = await fetch(`${API_URL}/api/traces/${traceId}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to get trace");
  return response.json();
}

export async function cleanupTraces(
  olderThanDays = 7
): Promise<{ success: boolean; deleted: number }> {
  const response = await fetch(`${API_URL}/api/traces/cleanup`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ olderThanDays }),
  });
  if (!response.ok) throw new Error("Failed to cleanup traces");
  return response.json();
}

// Helper function to format duration
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
