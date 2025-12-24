"use client";

import { Badge } from "@/components/ui/badge";
import { LOG_LEVEL_CONFIG } from "@/lib/status-config";
import type { ReelLog } from "@/lib/templates-api";

type LogItemProps = {
  log: ReelLog;
};

export function LogItem({ log }: LogItemProps) {
  const config = LOG_LEVEL_CONFIG[log.level] || LOG_LEVEL_CONFIG.info;

  return (
    <div
      className={`relative rounded-lg p-3 pl-5 transition-all duration-200 hover:bg-surface-2/50 ${config.bgColor} before:absolute before:top-2 before:bottom-2 before:left-0 before:w-1 before:rounded-full ${config.borderColor}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge className="text-xs" variant="outline">
              {log.stage}
            </Badge>
            <span className={`font-medium text-xs ${config.color}`}>
              {log.level.toUpperCase()}
            </span>
            {log.duration ? (
              <span className="text-muted-foreground text-xs">
                {log.duration}ms
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm">{log.message}</p>
        </div>
        <span className="shrink-0 text-muted-foreground text-xs">
          {new Date(log.createdAt).toLocaleTimeString("ru-RU")}
        </span>
      </div>
    </div>
  );
}
