"use client";

import { useCallback, useEffect, useState } from "react";
import { getKlingBalance, type KlingBalance } from "../kling-api";

export type UseKlingBalanceResult = {
  remainingTokens: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useKlingBalance(pollInterval = 300_000): UseKlingBalanceResult {
  const [data, setData] = useState<KlingBalance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      const result = await getKlingBalance();
      setData(result);
      setError(result.error || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();

    const interval = setInterval(fetchBalance, pollInterval);

    return () => clearInterval(interval);
  }, [fetchBalance, pollInterval]);

  return {
    remainingTokens: data?.remainingTokens ?? 0,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
