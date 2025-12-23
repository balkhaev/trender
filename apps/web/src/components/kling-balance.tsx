"use client";

import { Coins } from "lucide-react";
import { useKlingBalance } from "@/lib/hooks/use-kling-balance";

export function KlingBalance() {
  const { remainingTokens, isLoading, error } = useKlingBalance();

  if (isLoading || error) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
      <Coins className="h-4 w-4" />
      <span>{remainingTokens}</span>
    </div>
  );
}
