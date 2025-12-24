import { API_URL } from "./api-client";

// Types
export type LogLevel = "debug" | "info" | "warn" | "error";
export type PipelineStage = "scrape" | "download" | "analyze" | "generate";
export type AIProvider = "gemini" | "openai" | "kling";

export type ReelLog = {
  id: string;
  reelId: string;
  level: LogLevel;
  stage: string;
  message: string;
  metadata: Record<string, unknown> | null;
  duration: number | null;
  createdAt: string;
  reel?: {
    id: string;
    status: string;
  };
};

export type AILog = {
  id: string;
  reelId: string | null;
  generationId: string | null;
  provider: AIProvider;
  operation: string;
  model: string | null;
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  inputMeta: Record<string, unknown> | null;
  outputMeta: Record<string, unknown> | null;
  createdAt: string;
};

export type AIMetrics = {
  provider: AIProvider;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  avgDuration: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

export type DebugStats = {
  period: {
    from: string;
    to: string;
  };
  logs: {
    total: number;
    byLevel: Record<string, number>;
    byStage: Record<string, number>;
  };
  ai: {
    total: number;
    success: number;
    errors: number;
  };
  queues: {
    totalActive: number;
    totalPending: number;
    byQueue: Record<
      string,
      {
        active: number;
        pending: number;
        failed: number;
      }
    >;
  };
};

export type LogsFilter = {
  level?: LogLevel;
  stage?: string;
  reelId?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type AILogsFilter = {
  provider?: AIProvider;
  operation?: string;
  status?: string;
  reelId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

/**
 * Get debug stats for dashboard
 */
export async function getDebugStats(
  from?: string,
  to?: string
): Promise<DebugStats> {
  const params = new URLSearchParams();
  if (from) {
    params.set("from", from);
  }
  if (to) {
    params.set("to", to);
  }

  const response = await fetch(`${API_URL}/api/debug/stats?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get debug stats");
  }

  return response.json();
}

/**
 * Get logs with filtering
 */
export async function getDebugLogs(
  filter: LogsFilter = {}
): Promise<{ logs: ReelLog[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (filter.level) {
    params.set("level", filter.level);
  }
  if (filter.stage) {
    params.set("stage", filter.stage);
  }
  if (filter.reelId) {
    params.set("reelId", filter.reelId);
  }
  if (filter.search) {
    params.set("search", filter.search);
  }
  if (filter.from) {
    params.set("from", filter.from);
  }
  if (filter.to) {
    params.set("to", filter.to);
  }
  if (filter.limit) {
    params.set("limit", filter.limit.toString());
  }
  if (filter.offset) {
    params.set("offset", filter.offset.toString());
  }

  const response = await fetch(`${API_URL}/api/debug/logs?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get debug logs");
  }

  return response.json();
}

/**
 * Get AI logs with filtering
 */
export async function getAILogs(
  filter: AILogsFilter = {}
): Promise<{ logs: AILog[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (filter.provider) {
    params.set("provider", filter.provider);
  }
  if (filter.operation) {
    params.set("operation", filter.operation);
  }
  if (filter.status) {
    params.set("status", filter.status);
  }
  if (filter.reelId) {
    params.set("reelId", filter.reelId);
  }
  if (filter.from) {
    params.set("from", filter.from);
  }
  if (filter.to) {
    params.set("to", filter.to);
  }
  if (filter.limit) {
    params.set("limit", filter.limit.toString());
  }
  if (filter.offset) {
    params.set("offset", filter.offset.toString());
  }

  const response = await fetch(`${API_URL}/api/debug/ai-logs?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get AI logs");
  }

  return response.json();
}

/**
 * Get AI metrics by provider
 */
export async function getAIMetrics(
  from?: string,
  to?: string
): Promise<{ metrics: AIMetrics[] }> {
  const params = new URLSearchParams();
  if (from) {
    params.set("from", from);
  }
  if (to) {
    params.set("to", to);
  }

  const response = await fetch(`${API_URL}/api/debug/ai-metrics?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get AI metrics");
  }

  return response.json();
}

/**
 * Get logs for specific reel
 */
export async function getReelLogs(
  reelId: string,
  stage?: PipelineStage,
  limit?: number
): Promise<{
  logs: ReelLog[];
  stats: Array<{
    stage: string;
    count: number;
    totalDuration: number;
    errors: number;
  }>;
  recentErrors: ReelLog[];
}> {
  const params = new URLSearchParams();
  if (stage) {
    params.set("stage", stage);
  }
  if (limit) {
    params.set("limit", limit.toString());
  }

  const response = await fetch(
    `${API_URL}/api/debug/reels/${reelId}/logs?${params}`,
    { credentials: "include" }
  );

  if (!response.ok) {
    throw new Error("Failed to get reel logs");
  }

  return response.json();
}

/**
 * Cleanup old logs
 */
export async function cleanupLogs(olderThanDays = 30): Promise<{
  success: boolean;
  deleted: { reelLogs: number; aiLogs: number };
}> {
  const response = await fetch(`${API_URL}/api/debug/cleanup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ olderThanDays }),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to cleanup logs");
  }

  return response.json();
}

// Helper functions
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) {
    return "-";
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function getLogLevelColor(level: LogLevel): string {
  switch (level) {
    case "debug":
      return "text-gray-500";
    case "info":
      return "text-blue-500";
    case "warn":
      return "text-yellow-500";
    case "error":
      return "text-red-500";
    default:
      return "text-gray-500";
  }
}

export function getProviderColor(provider: AIProvider): string {
  switch (provider) {
    case "gemini":
      return "text-blue-500";
    case "openai":
      return "text-green-500";
    case "kling":
      return "text-purple-500";
    default:
      return "text-gray-500";
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "success":
      return "text-green-500";
    case "error":
      return "text-red-500";
    case "pending":
      return "text-yellow-500";
    default:
      return "text-gray-500";
  }
}

// ============================================================================
// Job Health Types & API
// ============================================================================

export type StalledJob = {
  id: string;
  queueName: string;
  jobId: string;
  entityId: string | null;
  entityType: string | null;
  substage: string | null;
  lastActivityAt: string;
  startedAt: string;
  minutesSinceActivity: number;
};

export type RecentFailure = {
  id: string;
  queueName: string;
  jobId: string;
  entityId: string | null;
  completedAt: string | null;
  alertMessage: string | null;
};

export type HealthStatus = {
  status: "healthy" | "unhealthy";
  timestamp: string;
  problems: {
    stalled: StalledJob[];
    slow: StalledJob[];
    recentFailures: RecentFailure[];
  };
  summary: {
    stalledCount: number;
    slowCount: number;
    recentFailuresCount: number;
  };
};

export type ActiveJob = {
  id: string;
  queueName: string;
  jobId: string;
  entityId: string | null;
  entityType: string | null;
  substage: string | null;
  startedAt: string;
  lastActivityAt: string;
  durationMs: number;
};

export type QueueHealthStats = Record<
  string,
  {
    active: number;
    stalled: number;
    completedLast24h: number;
    failedLast24h: number;
    avgDurationMs: number | null;
  }
>;

/**
 * Get job health status - проблемные jobs
 */
export async function getHealthStatus(
  stalledMinutes?: number
): Promise<HealthStatus> {
  const params = new URLSearchParams();
  if (stalledMinutes) {
    params.set("stalledMinutes", stalledMinutes.toString());
  }

  const response = await fetch(`${API_URL}/api/debug/health?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get health status");
  }

  return response.json();
}

/**
 * Get stalled jobs only
 */
export async function getStalledJobs(thresholdMinutes?: number): Promise<{
  count: number;
  thresholdMinutes: number;
  jobs: StalledJob[];
}> {
  const params = new URLSearchParams();
  if (thresholdMinutes) {
    params.set("threshold", thresholdMinutes.toString());
  }

  const response = await fetch(`${API_URL}/api/debug/stalled-jobs?${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get stalled jobs");
  }

  return response.json();
}

/**
 * Get active jobs
 */
export async function getActiveJobs(): Promise<{
  count: number;
  jobs: ActiveJob[];
}> {
  const response = await fetch(`${API_URL}/api/debug/active-jobs`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get active jobs");
  }

  return response.json();
}

/**
 * Get queue health stats
 */
export async function getQueueHealthStats(): Promise<{
  stats: QueueHealthStats;
}> {
  const response = await fetch(`${API_URL}/api/debug/queue-health`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get queue health stats");
  }

  return response.json();
}
