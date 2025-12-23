"use client";

import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/debug-api";
import { useHealthStatus } from "@/lib/hooks/use-debug";

export function HealthAlerts() {
  const { data: health, isLoading } = useHealthStatus(5);

  if (isLoading || !health) {
    return null;
  }

  const { stalled, slow, recentFailures } = health.problems;
  const hasProblems =
    stalled.length > 0 || slow.length > 0 || recentFailures.length > 0;

  if (!hasProblems) {
    return (
      <Alert className="border-emerald-500/50 bg-emerald-500/10">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <AlertTitle className="text-emerald-400">
          Все системы работают нормально
        </AlertTitle>
        <AlertDescription className="text-emerald-300/70">
          Нет зависших или проблемных задач
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stalled jobs alert */}
      {stalled.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Зависшие задачи ({stalled.length})</AlertTitle>
          <AlertDescription>
            <div className="mt-2 space-y-2">
              {stalled.slice(0, 5).map((job) => (
                <div
                  className="flex items-center justify-between rounded bg-red-500/10 p-2"
                  key={job.id}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{job.queueName}</span>
                    {job.substage && (
                      <Badge className="text-xs" variant="outline">
                        {job.substage}
                      </Badge>
                    )}
                    {job.entityId && (
                      <span className="text-muted-foreground text-xs">
                        {job.entityType}: {job.entityId.slice(0, 8)}...
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3 w-3" />
                    <span>{job.minutesSinceActivity} мин без активности</span>
                  </div>
                </div>
              ))}
              {stalled.length > 5 && (
                <span className="text-muted-foreground text-sm">
                  и ещё {stalled.length - 5}...
                </span>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Slow jobs alert */}
      {slow.length > 0 && (
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <Clock className="h-4 w-4 text-yellow-500" />
          <AlertTitle className="text-yellow-400">
            Медленные задачи ({slow.length})
          </AlertTitle>
          <AlertDescription>
            <div className="mt-2 space-y-1 text-sm">
              {slow.slice(0, 5).map((job) => (
                <div className="flex items-center gap-2" key={job.id}>
                  <span>{job.queueName}</span>
                  {job.substage && (
                    <Badge className="text-xs" variant="secondary">
                      {job.substage}
                    </Badge>
                  )}
                  <span className="text-muted-foreground">
                    (
                    {formatDuration(
                      Date.now() - new Date(job.startedAt).getTime()
                    )}
                    )
                  </span>
                </div>
              ))}
              {slow.length > 5 && (
                <span className="text-muted-foreground">
                  и ещё {slow.length - 5}...
                </span>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Recent failures */}
      {recentFailures.length > 0 && (
        <Alert className="border-orange-500/50 bg-orange-500/10">
          <XCircle className="h-4 w-4 text-orange-500" />
          <AlertTitle className="text-orange-400">
            Недавние ошибки ({recentFailures.length})
          </AlertTitle>
          <AlertDescription>
            <div className="mt-2 space-y-1 text-sm">
              {recentFailures.slice(0, 5).map((job) => (
                <div className="flex items-center gap-2" key={job.id}>
                  <span>{job.queueName}</span>
                  {job.entityId && (
                    <span className="text-muted-foreground">
                      ({job.entityId.slice(0, 8)}...)
                    </span>
                  )}
                  {job.alertMessage && (
                    <span className="max-w-[200px] truncate text-orange-300/70">
                      {job.alertMessage}
                    </span>
                  )}
                </div>
              ))}
              {recentFailures.length > 5 && (
                <span className="text-muted-foreground">
                  и ещё {recentFailures.length - 5}...
                </span>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
