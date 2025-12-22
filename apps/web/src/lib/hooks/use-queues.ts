"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getQueuesStatus,
  getTotalPendingJobs,
  type QueueStatus,
} from "../queues-api";

export type UseQueuesResult = {
  queues: QueueStatus[];
  totalPending: number;
  totalActive: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useQueues(pollInterval = 5000): UseQueuesResult {
  const [queues, setQueues] = useState<QueueStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getQueuesStatus();
      setQueues(data.queues);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Poll for updates
    const interval = setInterval(fetchStatus, pollInterval);

    return () => clearInterval(interval);
  }, [fetchStatus, pollInterval]);

  const totalPending = getTotalPendingJobs(queues);
  const totalActive = queues.reduce((sum, q) => sum + q.active, 0);

  return {
    queues,
    totalPending,
    totalActive,
    isLoading,
    error,
    refetch: fetchStatus,
  };
}
