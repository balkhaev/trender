"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type LogEntry = {
  id: string;
  level: string;
  stage: string;
  message: string;
  createdAt: string;
};

type PipelineProgressProps = {
  title?: string;
  status: string;
  progress: number;
  progressStage: string;
  progressMessage: string;
  lastActivityAt?: string | null;
  logs?: LogEntry[];
  className?: string;
};

const STAGE_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-muted-foreground" />,
  uploading: <Loader2 className="h-4 w-4 animate-spin text-blue-400" />,
  processing: <Loader2 className="h-4 w-4 animate-spin text-violet-400" />,
  analyzing: <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />,
  downloading: <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />,
  completed: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  failed: <XCircle className="h-4 w-4 text-red-400" />,
};

const STAGE_COLORS: Record<string, string> = {
  pending: "bg-muted-foreground",
  uploading: "bg-blue-500",
  processing: "bg-violet-500",
  analyzing: "bg-emerald-500",
  downloading: "bg-cyan-500",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) {
    return "только что";
  }
  if (diffSec < 60) {
    return `${diffSec}с назад`;
  }
  if (diffSec < 3600) {
    return `${Math.floor(diffSec / 60)}м назад`;
  }
  return `${Math.floor(diffSec / 3600)}ч назад`;
}

function isStale(lastActivityAt: string | null | undefined): boolean {
  if (!lastActivityAt) {
    return false;
  }
  const date = new Date(lastActivityAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return diffMs > 60_000; // More than 60 seconds without activity
}

export function PipelineProgress({
  title = "Прогресс",
  status,
  progress,
  progressStage,
  progressMessage,
  lastActivityAt,
  logs,
  className,
}: PipelineProgressProps) {
  const stale = useMemo(() => isStale(lastActivityAt), [lastActivityAt]);
  const icon = STAGE_ICONS[progressStage] || STAGE_ICONS.processing;
  const colorClass = STAGE_COLORS[progressStage] || STAGE_COLORS.processing;

  const isActive =
    status !== "completed" &&
    status !== "failed" &&
    status !== "analyzed" &&
    status !== "scraped";

  return (
    <Card className={cn("border-violet-500/20", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {title}
          {stale === true && isActive === true ? (
            <Badge
              className="ml-auto flex items-center gap-1 text-yellow-300"
              variant="outline"
            >
              <AlertTriangle className="h-3 w-3" />
              Возможно зависло
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground capitalize">
              {progressStage || status}
            </span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress className={cn("h-2", colorClass)} value={progress} />
        </div>

        {/* Progress message */}
        {progressMessage ? (
          <p className="text-muted-foreground text-sm">{progressMessage}</p>
        ) : null}

        {/* Last activity */}
        {lastActivityAt ? (
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Clock className="h-3 w-3" />
            <span>Последняя активность: {formatTimeAgo(lastActivityAt)}</span>
          </div>
        ) : null}

        {/* Logs (collapsible) */}
        {Array.isArray(logs) && logs.length > 0 ? (
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
              <span>Логи ({logs.length})</span>
              <span className="text-muted-foreground text-xs">развернуть</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2">
                {logs.map((log) => (
                  <div
                    className={cn(
                      "rounded px-2 py-1 font-mono text-xs",
                      log.level === "error" && "bg-red-500/10 text-red-300",
                      log.level === "warn" &&
                        "bg-yellow-500/10 text-yellow-300",
                      log.level === "info" && "text-muted-foreground",
                      log.level === "debug" && "text-muted-foreground/60"
                    )}
                    key={log.id}
                  >
                    <span className="mr-2 text-muted-foreground">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="mr-2 font-medium">[{log.stage}]</span>
                    {log.message}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Компактный индикатор прогресса для встраивания в списки/карточки
 */
export function PipelineProgressBadge({
  status,
  progress,
  progressStage,
  progressMessage,
  lastActivityAt,
}: Omit<PipelineProgressProps, "title" | "logs" | "className">) {
  const stale = useMemo(() => isStale(lastActivityAt), [lastActivityAt]);
  const icon = STAGE_ICONS[progressStage] || STAGE_ICONS.processing;

  const isActive =
    status !== "completed" &&
    status !== "failed" &&
    status !== "analyzed" &&
    status !== "scraped";

  if (!isActive) {
    return (
      <Badge
        className={cn(
          "flex items-center gap-1",
          status === "failed" ? "text-red-300" : "text-emerald-300"
        )}
        variant="outline"
      >
        {status === "failed" ? (
          <XCircle className="h-3 w-3" />
        ) : (
          <CheckCircle2 className="h-3 w-3" />
        )}
        {status === "failed" ? "Ошибка" : "Готово"}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm">{progressMessage || progressStage}</span>
        {stale ? <AlertTriangle className="h-3 w-3 text-yellow-400" /> : null}
      </div>
      <Progress className="h-1.5" value={progress} />
    </div>
  );
}
