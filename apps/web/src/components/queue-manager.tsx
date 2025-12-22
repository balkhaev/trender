"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cleanQueue,
  getQueueJobs,
  getQueuesStatus,
  type JobState,
  obliterateQueue,
  pauseQueue,
  type QueueJob,
  type QueueStatus,
  removeJob,
  resumeQueue,
  retryJob,
} from "@/lib/queues-api";
import { cn } from "@/lib/utils";

const QUEUE_LABELS: Record<string, string> = {
  "reel-pipeline": "Анализ рилсов",
  pipeline: "Анализ рилсов",
  "video-generation": "Генерация видео",
  "scrape-reels": "Скрейпинг",
  scrape: "Скрейпинг",
};

const STATE_LABELS: Record<JobState, string> = {
  waiting: "Ожидание",
  active: "Активные",
  completed: "Завершённые",
  failed: "Проваленные",
  delayed: "Отложенные",
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: number, end?: number): string {
  const duration = (end ?? Date.now()) - start;
  const seconds = Math.floor(duration / 1000);
  if (seconds < 60) {
    return `${seconds}с`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}м ${seconds % 60}с`;
}

export function QueueManager() {
  const queryClient = useQueryClient();
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<JobState>("waiting");

  // Fetch queue statuses
  const { data: queues, isLoading: queuesLoading } = useQuery({
    queryKey: ["queues-status"],
    queryFn: getQueuesStatus,
    refetchInterval: 5000,
  });

  // Fetch jobs for selected queue
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ["queue-jobs", selectedQueue, selectedState],
    queryFn: () =>
      selectedQueue ? getQueueJobs(selectedQueue, selectedState) : null,
    enabled: !!selectedQueue,
    refetchInterval: 3000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["queues-status"] });
    queryClient.invalidateQueries({ queryKey: ["queue-jobs"] });
  };

  // Mutations
  const removeJobMutation = useMutation({
    mutationFn: ({ queue, jobId }: { queue: string; jobId: string }) =>
      removeJob(queue, jobId),
    onSuccess: () => {
      toast.success("Задача удалена");
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const retryJobMutation = useMutation({
    mutationFn: ({ queue, jobId }: { queue: string; jobId: string }) =>
      retryJob(queue, jobId),
    onSuccess: () => {
      toast.success("Задача перезапущена");
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const cleanMutation = useMutation({
    mutationFn: ({
      queue,
      state,
    }: {
      queue: string;
      state: "completed" | "failed";
    }) => cleanQueue(queue, state),
    onSuccess: (count) => {
      toast.success(`Очищено ${count} задач`);
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const obliterateMutation = useMutation({
    mutationFn: (queue: string) => obliterateQueue(queue),
    onSuccess: () => {
      toast.success("Очередь полностью очищена");
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (queue: string) => pauseQueue(queue),
    onSuccess: () => {
      toast.success("Очередь приостановлена");
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (queue: string) => resumeQueue(queue),
    onSuccess: () => {
      toast.success("Очередь возобновлена");
      invalidateAll();
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  if (queuesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Queue Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {queues?.queues?.map((queue) => (
          <QueueCard
            isSelected={selectedQueue === queue.name}
            key={queue.name}
            onSelect={() => setSelectedQueue(queue.name)}
            queue={queue}
          />
        ))}
      </div>

      {/* Selected Queue Details */}
      {selectedQueue ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>
                {QUEUE_LABELS[selectedQueue] || selectedQueue}
              </CardTitle>
              <CardDescription>Управление задачами в очереди</CardDescription>
            </div>

            <div className="flex items-center gap-2">
              {/* State filter */}
              <Select
                onValueChange={(v) => setSelectedState(v as JobState)}
                value={selectedState}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Pause/Resume */}
              {jobsData?.isPaused ? (
                <Button
                  onClick={() => resumeMutation.mutate(selectedQueue)}
                  size="sm"
                  variant="outline"
                >
                  <Play className="mr-1 h-4 w-4" />
                  Возобновить
                </Button>
              ) : (
                <Button
                  onClick={() => pauseMutation.mutate(selectedQueue)}
                  size="sm"
                  variant="outline"
                >
                  <Pause className="mr-1 h-4 w-4" />
                  Пауза
                </Button>
              )}

              {/* Clean actions */}
              <Button
                onClick={() =>
                  cleanMutation.mutate({
                    queue: selectedQueue,
                    state: "completed",
                  })
                }
                size="sm"
                variant="outline"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Очистить готовые
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive">
                    <AlertTriangle className="mr-1 h-4 w-4" />
                    Очистить всё
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Очистить очередь?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Это действие удалит ВСЕ задачи из очереди, включая
                      активные. Это действие нельзя отменить.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => obliterateMutation.mutate(selectedQueue)}
                    >
                      Очистить
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardHeader>

          <CardContent>
            <JobsTableContent
              isLoading={jobsLoading}
              jobs={jobsData?.jobs}
              onRemove={(jobId) =>
                removeJobMutation.mutate({ queue: selectedQueue, jobId })
              }
              onRetry={(jobId) =>
                retryJobMutation.mutate({ queue: selectedQueue, jobId })
              }
              state={selectedState}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="text-center text-muted-foreground">
          Выберите очередь для просмотра задач
        </div>
      )}
    </div>
  );
}

function JobsTableContent({
  isLoading,
  jobs,
  state,
  onRemove,
  onRetry,
}: {
  isLoading: boolean;
  jobs: QueueJob[] | undefined;
  state: JobState;
  onRemove: (jobId: string) => void;
  onRetry: (jobId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Нет задач в состоянии "{STATE_LABELS[state]}"
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Данные</TableHead>
          <TableHead>Прогресс</TableHead>
          <TableHead>Время</TableHead>
          <TableHead className="text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <JobRow
            job={job}
            key={job.id}
            onRemove={() => onRemove(job.id)}
            onRetry={() => onRetry(job.id)}
            state={state}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function getQueueIcon(queue: QueueStatus): React.ReactNode {
  if (queue.failed > 0) {
    return <AlertTriangle className="h-4 w-4 text-red-400" />;
  }
  if (queue.active > 0) {
    return <Loader2 className="h-4 w-4 animate-spin text-violet-400" />;
  }
  return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
}

function QueueCard({
  queue,
  isSelected,
  onSelect,
}: {
  queue: QueueStatus;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const total = queue.waiting + queue.active + queue.completed + queue.failed;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors hover:border-violet-500/50",
        isSelected === true && "border-violet-500 bg-violet-500/5"
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {getQueueIcon(queue)}
          {QUEUE_LABELS[queue.name] || queue.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {queue.waiting > 0 ? (
            <Badge variant="secondary">
              <Clock className="mr-1 h-3 w-3" />
              {queue.waiting} ожидает
            </Badge>
          ) : null}
          {queue.active > 0 ? (
            <Badge className="bg-violet-500/20 text-violet-300">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              {queue.active} активно
            </Badge>
          ) : null}
          {queue.failed > 0 ? (
            <Badge variant="destructive">
              <XCircle className="mr-1 h-3 w-3" />
              {queue.failed} ошибок
            </Badge>
          ) : null}
          {total === 0 ? (
            <span className="text-muted-foreground text-sm">Пусто</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function JobRow({
  job,
  state,
  onRemove,
  onRetry,
}: {
  job: QueueJob;
  state: JobState;
  onRemove: () => void;
  onRetry: () => void;
}) {
  // Extract meaningful data from job
  const dataPreview = getJobDataPreview(job.data);
  const progress = getProgressValue(job.progress);

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{job.id.slice(0, 12)}</TableCell>
      <TableCell>
        <div className="max-w-xs truncate text-sm">{dataPreview}</div>
        {job.failedReason ? (
          <div className="mt-1 max-w-xs truncate text-red-400 text-xs">
            {job.failedReason}
          </div>
        ) : null}
      </TableCell>
      <TableCell>
        {state === "active" ? (
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-violet-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-muted-foreground text-xs">{progress}%</span>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {formatTimestamp(job.timestamp)}
        {job.processedOn ? (
          <span className="ml-2">
            ({formatDuration(job.processedOn, job.finishedOn)})
          </span>
        ) : null}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {state === "failed" ? (
            <Button onClick={onRetry} size="sm" variant="ghost">
              <RefreshCw className="h-4 w-4" />
            </Button>
          ) : null}
          <Button onClick={onRemove} size="sm" variant="ghost">
            <Trash2 className="h-4 w-4 text-red-400" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function getProgressValue(progress: number | Record<string, unknown>): number {
  if (typeof progress === "number") {
    return progress;
  }
  if (typeof progress === "object" && progress !== null) {
    const percent = (progress as Record<string, unknown>).percent;
    if (typeof percent === "number") {
      return percent;
    }
  }
  return 0;
}

function getJobDataPreview(data: Record<string, unknown>): string {
  // Try to extract meaningful info from job data
  if (data.reelId) {
    return `Рилс: ${data.reelId}`;
  }
  if (data.generationId) {
    return `Генерация: ${String(data.generationId).slice(0, 8)}...`;
  }
  if (data.hashtag) {
    return `#${data.hashtag}`;
  }
  if (data.action) {
    return `${data.action}`;
  }

  // Fallback to JSON preview
  const json = JSON.stringify(data);
  return json.length > 50 ? `${json.slice(0, 50)}...` : json;
}
