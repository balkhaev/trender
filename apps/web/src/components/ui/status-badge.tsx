"use client";

import type { ReelStatus } from "@trender/types/reel";
import { Badge } from "@/components/ui/badge";
import {
  REEL_STATUS_CONFIG,
  REEL_STATUS_CONFIG_SIMPLE,
  isAnimatedStatus,
  type StatusConfigItem,
} from "@/lib/status-config";

type StatusBadgeProps = {
  status: ReelStatus;
  /** Use simple variant without borders (for cards) */
  variant?: "default" | "simple";
  /** Show status icon */
  showIcon?: boolean;
  className?: string;
};

/**
 * Unified StatusBadge component for reel status display
 */
export function StatusBadge({
  status,
  variant = "default",
  showIcon = true,
  className = "",
}: StatusBadgeProps) {
  const config =
    variant === "simple" ? REEL_STATUS_CONFIG_SIMPLE : REEL_STATUS_CONFIG;
  const statusConfig = config[status] || config.scraped;
  const StatusIcon = statusConfig.icon;
  const isAnimated = isAnimatedStatus(status);

  return (
    <Badge
      className={`gap-1 ${statusConfig.className} ${isAnimated ? "animate-glow-pulse" : ""} ${className}`}
      variant="secondary"
    >
      {showIcon && (
        <StatusIcon
          className={`h-3 w-3 ${isAnimated ? "animate-spin" : ""}`}
        />
      )}
      {statusConfig.label}
    </Badge>
  );
}

type GenericStatusBadgeProps = {
  status: string;
  config: Record<string, StatusConfigItem>;
  showIcon?: boolean;
  className?: string;
};

/**
 * Generic status badge for any status type
 */
export function GenericStatusBadge({
  status,
  config,
  showIcon = true,
  className = "",
}: GenericStatusBadgeProps) {
  const statusConfig = config[status];
  if (!statusConfig) {
    return (
      <Badge className={className} variant="secondary">
        {status}
      </Badge>
    );
  }

  const StatusIcon = statusConfig.icon;

  return (
    <Badge
      className={`gap-1 ${statusConfig.className} ${className}`}
      variant="secondary"
    >
      {showIcon && <StatusIcon className="h-3 w-3" />}
      {statusConfig.label}
    </Badge>
  );
}
