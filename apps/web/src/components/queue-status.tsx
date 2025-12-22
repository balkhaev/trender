"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useQueues } from "@/lib/hooks/use-queues";
import {
  getQueueDisplayName,
  type QueueStatus as QueueStatusType,
} from "@/lib/queues-api";

export function QueueStatus() {
  const { queues, totalPending, totalActive, isLoading, error } = useQueues();

  // Don't show anything if no pending/active jobs and not loading
  if (!isLoading && totalPending === 0 && totalActive === 0 && !error) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground"
          type="button"
        >
          {totalActive > 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
          ) : null}
          <span>Задачи</span>
          {totalPending > 0 ? (
            <Badge
              className="h-5 min-w-5 justify-center px-1 text-xs"
              variant="secondary"
            >
              {totalPending}
            </Badge>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="space-y-3">
          <div className="font-medium text-sm">Очереди задач</div>

          <QueueContentSection
            error={error}
            isLoading={isLoading}
            queues={queues}
          />

          {queues.length > 0 ? (
            <div className="border-t pt-2 text-muted-foreground text-xs">
              Всего в очереди: {totalPending}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function QueueContentSection({
  error,
  isLoading,
  queues,
}: {
  error: Error | null;
  isLoading: boolean;
  queues: QueueStatusType[];
}) {
  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-2 text-destructive text-xs">
        Ошибка загрузки
      </div>
    );
  }

  if (isLoading && queues.length === 0) {
    return (
      <div className="flex items-center justify-center py-4 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-sm">Загрузка...</span>
      </div>
    );
  }

  if (queues.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {queues.map((queue) => (
        <QueueRow key={queue.name} queue={queue} />
      ))}
    </div>
  );
}

function QueueRow({ queue }: { queue: QueueStatusType }) {
  const hasActivity = queue.waiting > 0 || queue.active > 0;

  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5">
      <div className="flex items-center gap-2">
        {queue.active > 0 ? (
          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
        ) : null}
        <span className="text-sm">{getQueueDisplayName(queue.name)}</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        {queue.active > 0 ? (
          <span className="text-blue-500">{queue.active} актив.</span>
        ) : null}
        {queue.waiting > 0 ? (
          <span className="text-muted-foreground">{queue.waiting} ожид.</span>
        ) : null}
        {hasActivity ? null : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </div>
    </div>
  );
}
