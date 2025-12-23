"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AILog,
  type AILogsFilter,
  type AIMetrics,
  cleanupLogs,
  type DebugStats,
  getAILogs,
  getAIMetrics,
  getDebugLogs,
  getDebugStats,
  getReelLogs,
  type LogsFilter,
  type PipelineStage,
  type ReelLog,
} from "../debug-api";

/**
 * Get debug stats for dashboard
 */
export function useDebugStats(from?: string, to?: string) {
  return useQuery<DebugStats>({
    queryKey: ["debug", "stats", from, to],
    queryFn: () => getDebugStats(from, to),
    refetchInterval: 10_000, // 10 sec
  });
}

/**
 * Get logs with filtering
 */
export function useDebugLogs(filter: LogsFilter = {}) {
  return useQuery<{
    logs: ReelLog[];
    total: number;
    limit: number;
    offset: number;
  }>({
    queryKey: ["debug", "logs", filter],
    queryFn: () => getDebugLogs(filter),
    refetchInterval: 5000, // 5 sec
  });
}

/**
 * Get AI logs with filtering
 */
export function useAILogs(filter: AILogsFilter = {}) {
  return useQuery<{
    logs: AILog[];
    total: number;
    limit: number;
    offset: number;
  }>({
    queryKey: ["debug", "ai-logs", filter],
    queryFn: () => getAILogs(filter),
    refetchInterval: 5000, // 5 sec
  });
}

/**
 * Get AI metrics by provider
 */
export function useAIMetrics(from?: string, to?: string) {
  return useQuery<{ metrics: AIMetrics[] }>({
    queryKey: ["debug", "ai-metrics", from, to],
    queryFn: () => getAIMetrics(from, to),
    refetchInterval: 10_000, // 10 sec
  });
}

/**
 * Get logs for specific reel
 */
export function useReelLogs(
  reelId: string,
  stage?: PipelineStage,
  limit?: number
) {
  return useQuery<{
    logs: ReelLog[];
    stats: Array<{
      stage: string;
      count: number;
      totalDuration: number;
      errors: number;
    }>;
    recentErrors: ReelLog[];
  }>({
    queryKey: ["debug", "reel-logs", reelId, stage, limit],
    queryFn: () => getReelLogs(reelId, stage, limit),
    refetchInterval: 3000, // 3 sec
    enabled: !!reelId,
  });
}

/**
 * Cleanup old logs
 */
export function useCleanupLogs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (olderThanDays?: number) => cleanupLogs(olderThanDays),
    onSuccess: () => {
      // Invalidate debug queries
      queryClient.invalidateQueries({ queryKey: ["debug"] });
    },
  });
}

// ============================================================================
// Job Health Hooks
// ============================================================================

/**
 * Get job health status - проблемные jobs
 */
export function useHealthStatus(stalledMinutes?: number) {
  const { getHealthStatus } = require("../debug-api");

  return useQuery<{
    status: "healthy" | "unhealthy";
    timestamp: string;
    problems: {
      stalled: Array<{
        id: string;
        queueName: string;
        jobId: string;
        entityId: string | null;
        entityType: string | null;
        substage: string | null;
        lastActivityAt: string;
        startedAt: string;
        minutesSinceActivity: number;
      }>;
      slow: Array<{
        id: string;
        queueName: string;
        jobId: string;
        entityId: string | null;
        entityType: string | null;
        substage: string | null;
        lastActivityAt: string;
        startedAt: string;
        minutesSinceActivity: number;
      }>;
      recentFailures: Array<{
        id: string;
        queueName: string;
        jobId: string;
        entityId: string | null;
        completedAt: string | null;
        alertMessage: string | null;
      }>;
    };
    summary: {
      stalledCount: number;
      slowCount: number;
      recentFailuresCount: number;
    };
  }>({
    queryKey: ["debug", "health", stalledMinutes],
    queryFn: () => getHealthStatus(stalledMinutes),
    refetchInterval: 10_000, // 10 sec
  });
}

/**
 * Get stalled jobs only
 */
export function useStalledJobs(thresholdMinutes?: number) {
  const { getStalledJobs } = require("../debug-api");

  return useQuery<{
    count: number;
    thresholdMinutes: number;
    jobs: Array<{
      id: string;
      queueName: string;
      jobId: string;
      entityId: string | null;
      entityType: string | null;
      substage: string | null;
      lastActivityAt: string;
      startedAt: string;
      minutesSinceActivity: number;
    }>;
  }>({
    queryKey: ["debug", "stalled-jobs", thresholdMinutes],
    queryFn: () => getStalledJobs(thresholdMinutes),
    refetchInterval: 15_000, // 15 sec
  });
}

/**
 * Get active jobs
 */
export function useActiveJobs() {
  const { getActiveJobs } = require("../debug-api");

  return useQuery<{
    count: number;
    jobs: Array<{
      id: string;
      queueName: string;
      jobId: string;
      entityId: string | null;
      entityType: string | null;
      substage: string | null;
      startedAt: string;
      lastActivityAt: string;
      durationMs: number;
    }>;
  }>({
    queryKey: ["debug", "active-jobs"],
    queryFn: () => getActiveJobs(),
    refetchInterval: 5000, // 5 sec
  });
}

/**
 * Get queue health stats
 */
export function useQueueHealthStats() {
  const { getQueueHealthStats } = require("../debug-api");

  return useQuery<{
    stats: Record<
      string,
      {
        active: number;
        stalled: number;
        completedLast24h: number;
        failedLast24h: number;
        avgDurationMs: number | null;
      }
    >;
  }>({
    queryKey: ["debug", "queue-health"],
    queryFn: () => getQueueHealthStats(),
    refetchInterval: 15_000, // 15 sec
  });
}
