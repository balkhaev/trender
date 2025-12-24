"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import type { ElementType } from "react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAnalyzeReel,
  useDownloadReel,
  useProcessReel,
  useReelDebug,
} from "@/lib/hooks/use-templates";
import { hasVideo } from "@/lib/reels-api";
import type {
  AILogDetail,
  ReelDebugInfo,
  ReelLog,
  StageStats,
  VideoGeneration,
} from "@/lib/templates-api";

type ReelDebugPanelProps = {
  reelId: string;
  onClose: () => void;
};

type StatusConfig = { label: string; color: string; icon: ElementType };

const STATUS_CONFIG: Record<string, StatusConfig> = {
  scraped: { label: "Скрапнут", color: "bg-gray-500", icon: Clock },
  downloading: { label: "Загрузка...", color: "bg-blue-500", icon: Loader2 },
  downloaded: { label: "Загружен", color: "bg-green-500", icon: CheckCircle2 },
  analyzing: { label: "Анализ...", color: "bg-purple-500", icon: Loader2 },
  analyzed: { label: "Готов", color: "bg-emerald-500", icon: Sparkles },
  failed: { label: "Ошибка", color: "bg-red-500", icon: XCircle },
};

const LOG_LEVEL_CONFIG: Record<string, { color: string; bgColor: string }> = {
  debug: { color: "text-gray-500", bgColor: "bg-gray-100 dark:bg-gray-800" },
  info: { color: "text-blue-500", bgColor: "bg-blue-50 dark:bg-blue-950" },
  warn: { color: "text-amber-500", bgColor: "bg-amber-50 dark:bg-amber-950" },
  error: { color: "text-red-500", bgColor: "bg-red-50 dark:bg-red-950" },
};

type GenerationBadgeVariant = "default" | "secondary" | "destructive";

function getGenerationBadgeVariant(status: string): GenerationBadgeVariant {
  if (status === "completed") {
    return "default";
  }
  if (status === "failed") {
    return "destructive";
  }
  return "secondary";
}

function getGenerationStatusText(gen: VideoGeneration): string {
  if (gen.status === "pending") {
    return "Ожидание...";
  }
  if (gen.status === "processing") {
    return "Генерация...";
  }
  if (gen.status === "completed") {
    return "Готово";
  }
  if (gen.status === "failed") {
    return gen.error ?? "Ошибка";
  }
  return gen.status;
}

function GenerationsSection({
  generations,
}: {
  generations: VideoGeneration[];
}) {
  if (generations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h4 className="font-medium text-sm">Генерации</h4>
      {generations.map((gen) => (
        <GenerationRow gen={gen} key={gen.id} />
      ))}
    </div>
  );
}

function GenerationRow({ gen }: { gen: VideoGeneration }) {
  const [expanded, setExpanded] = useState(false);
  const href = gen.videoUrl;
  const variant = getGenerationBadgeVariant(gen.status);

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <Badge variant={variant}>{gen.provider}</Badge>
          <span className="text-muted-foreground text-sm">
            {getGenerationStatusText(gen)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {href ? (
            <Button asChild size="sm" variant="ghost">
              <a href={href} rel="noopener" target="_blank">
                Открыть
              </a>
            </Button>
          ) : null}
          <Button
            onClick={() => setExpanded(!expanded)}
            size="icon"
            variant="ghost"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t p-3">
          {gen.prompt ? (
            <div>
              <h5 className="mb-1 font-medium text-sm">Prompt</h5>
              <pre className="whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
                {gen.prompt}
              </pre>
            </div>
          ) : null}

          {gen.imageReferences?.length > 0 ? (
            <div>
              <h5 className="mb-1 font-medium text-sm">
                Images ({gen.imageReferences.length})
              </h5>
              <div className="flex flex-wrap gap-2">
                {gen.imageReferences.map((url) => (
                  <a
                    className="block"
                    href={url}
                    key={url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <img
                      alt="Reference"
                      className="h-12 w-12 rounded border object-cover"
                      src={url}
                    />
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {gen.remixSource ? (
            <div className="text-sm">
              <span className="text-muted-foreground">Remix source:</span>{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">
                {gen.remixSource}
              </code>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Progress:</span>{" "}
              <span className="font-medium">{gen.progress}%</span>
              {gen.klingProgress !== undefined ? (
                <span className="text-muted-foreground">
                  {" "}
                  (kling: {gen.klingProgress}%)
                </span>
              ) : null}
            </div>
            <div>
              <span className="text-muted-foreground">Stage:</span>{" "}
              <span className="font-medium">{gen.progressStage}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Создано:</span>{" "}
              <span className="font-medium">
                {new Date(gen.createdAt).toLocaleString("ru-RU")}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Завершено:</span>{" "}
              <span className="font-medium">
                {gen.completedAt
                  ? new Date(gen.completedAt).toLocaleString("ru-RU")
                  : "—"}
              </span>
            </div>
          </div>

          {gen.progressMessage ? (
            <div className="text-sm">
              <span className="text-muted-foreground">Message:</span>{" "}
              {gen.progressMessage}
            </div>
          ) : null}

          {gen.error ? (
            <div className="rounded bg-red-50 p-2 text-red-600 text-sm dark:bg-red-950 dark:text-red-400">
              {gen.error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type OverviewTabProps = {
  data: ReelDebugInfo;
  statusLabel: string;
  isStatusAnimated: boolean;
  isProcessing: boolean;
  isDownloading: boolean;
  isAnalyzing: boolean;
  onProcess: () => void;
  onDownload: () => void;
  onAnalyze: () => void;
};

function OverviewTab({
  data,
  statusLabel,
  isStatusAnimated,
  isProcessing,
  isDownloading,
  isAnalyzing,
  onProcess,
  onDownload,
  onAnalyze,
}: OverviewTabProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <InfoCard label="Статус" value={statusLabel} />
        <InfoCard
          label="Файл"
          value={data.reel.s3Key || data.reel.localPath || "—"}
        />
        <InfoCard
          label="Скрапнут"
          value={new Date(data.reel.scrapedAt).toLocaleString("ru-RU")}
        />
        <InfoCard
          label="Обновлён"
          value={new Date(data.reel.updatedAt).toLocaleString("ru-RU")}
        />
      </div>

      {data.reel.errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <div className="flex items-center gap-2 font-medium text-red-600 text-sm dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            Ошибка
          </div>
          <p className="mt-1 text-red-600 text-sm dark:text-red-400">
            {data.reel.errorMessage}
          </p>
        </div>
      ) : null}

      {data.template ? (
        <div className="rounded-lg border p-4">
          <h4 className="mb-2 flex items-center gap-2 font-medium text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Шаблон создан
          </h4>
          <p className="text-muted-foreground text-sm">
            {data.template.title || "Шаблон"}
          </p>
          {data.template.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {data.template.tags.map((tag) => (
                <Badge className="text-xs" key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={isProcessing || isStatusAnimated}
          onClick={onProcess}
          size="sm"
        >
          {isProcessing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Обработать полностью
        </Button>
        <Button
          disabled={
            isDownloading ||
            data.reel.status === "downloading" ||
            hasVideo(data.reel)
          }
          onClick={onDownload}
          size="sm"
          variant="outline"
        >
          {isDownloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Скачать
        </Button>
        <Button
          disabled={
            isAnalyzing ||
            data.reel.status === "analyzing" ||
            !hasVideo(data.reel)
          }
          onClick={onAnalyze}
          size="sm"
          variant="outline"
        >
          {isAnalyzing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Анализировать
        </Button>
      </div>

      <GenerationsSection generations={data.generations} />
    </div>
  );
}

type LogsTabProps = {
  logs: ReelLog[];
  expandedLogs: Set<string>;
  onToggle: (logId: string) => void;
};

function LogsTab({ logs, expandedLogs, onToggle }: LogsTabProps) {
  const [showDebug, setShowDebug] = useState(false);

  const filteredLogs = showDebug
    ? logs
    : logs.filter((log) => log.level !== "debug");

  const debugCount = logs.filter((log) => log.level === "debug").length;

  return (
    <div className="space-y-2">
      {debugCount > 0 && (
        <div className="flex items-center justify-between">
          <Button
            onClick={() => setShowDebug(!showDebug)}
            size="sm"
            variant="ghost"
          >
            {showDebug
              ? `Скрыть debug (${debugCount})`
              : `Показать debug (${debugCount})`}
          </Button>
        </div>
      )}
      <ScrollArea className="h-[400px]">
        <div className="space-y-2 pr-4">
          {filteredLogs.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">
              Логов пока нет
            </p>
          ) : (
            filteredLogs.map((log) => (
              <LogItem
                expanded={expandedLogs.has(log.id)}
                key={log.id}
                log={log}
                onToggle={() => onToggle(log.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

type StatsTabProps = {
  stageStats: StageStats[];
  recentErrors: ReelLog[];
};

function StatsTab({ stageStats, recentErrors }: StatsTabProps) {
  return (
    <div className="space-y-4">
      {stageStats.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground text-sm">
          Статистики пока нет
        </p>
      ) : (
        stageStats.map((stat) => <StageStatCard key={stat.stage} stat={stat} />)
      )}

      {recentErrors.length > 0 ? (
        <div className="space-y-2">
          <h4 className="font-medium text-red-500 text-sm">Последние ошибки</h4>
          {recentErrors.map((err) => (
            <div
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-600 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-400"
              key={err.id}
            >
              <div className="flex items-center justify-between">
                <Badge variant="outline">{err.stage}</Badge>
                <span className="text-muted-foreground text-xs">
                  {new Date(err.createdAt).toLocaleTimeString("ru-RU")}
                </span>
              </div>
              <p className="mt-1">{err.message}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type AILogsTabProps = {
  aiLogs: AILogDetail[];
  expandedLogs: Set<string>;
  onToggle: (logId: string) => void;
};

function AILogsTab({ aiLogs, expandedLogs, onToggle }: AILogsTabProps) {
  if (!aiLogs || aiLogs.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        AI логов пока нет
      </p>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-3 pr-4">
        {aiLogs.map((log) => (
          <AILogItem
            expanded={expandedLogs.has(log.id)}
            key={log.id}
            log={log}
            onToggle={() => onToggle(log.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function AILogItem({
  log,
  expanded,
  onToggle,
}: {
  log: AILogDetail;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isSuccess = log.status === "success";
  const imageUrls = (log.inputMeta?.imageUrls as string[] | undefined) ?? [];

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge variant={isSuccess ? "default" : "destructive"}>
              {log.provider}
            </Badge>
            <span className="text-muted-foreground text-sm">
              {log.operation}
            </span>
            {log.duration ? (
              <span className="text-muted-foreground text-xs">
                {(log.duration / 1000).toFixed(1)}s
              </span>
            ) : null}
          </div>
          {log.error ? (
            <p className="mt-1 text-red-500 text-sm">{log.error}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {new Date(log.createdAt).toLocaleTimeString("ru-RU")}
          </span>
          <Button onClick={onToggle} size="icon" variant="ghost">
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-3 space-y-3 border-t pt-3">
          {log.inputMeta ? (
            <div>
              <h5 className="mb-2 font-medium text-sm">Request</h5>
              <div className="overflow-auto rounded bg-muted p-2 font-mono text-xs">
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(log.inputMeta, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}

          {log.outputMeta ? (
            <div>
              <h5 className="mb-2 font-medium text-sm">Response</h5>
              <div className="overflow-auto rounded bg-muted p-2 font-mono text-xs">
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(log.outputMeta, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}

          {imageUrls.length > 0 ? (
            <div>
              <h5 className="mb-2 font-medium text-sm">
                Images ({imageUrls.length})
              </h5>
              <div className="flex flex-wrap gap-2">
                {imageUrls.map((url, i) => (
                  <a
                    className="block"
                    href={url}
                    key={url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <img
                      alt={`Reference ${i + 1}`}
                      className="h-16 w-16 rounded border object-cover"
                      src={url}
                    />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ReelDebugPanel({ reelId, onClose }: ReelDebugPanelProps) {
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useReelDebug(reelId);
  const { mutate: processReel, isPending: isProcessing } = useProcessReel();
  const { mutate: downloadReel, isPending: isDownloading } = useDownloadReel();
  const { mutate: analyzeReel, isPending: isAnalyzing } = useAnalyzeReel();

  const toggleLogExpand = (logId: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  const handleProcess = useCallback(() => {
    processReel(
      { reelId },
      {
        onSuccess: () => toast.success("Обработка запущена"),
        onError: (err) => toast.error(err.message),
      }
    );
  }, [reelId, processReel]);

  const handleDownload = useCallback(() => {
    downloadReel(reelId, {
      onSuccess: () => toast.success("Загрузка запущена"),
      onError: (err) => toast.error(err.message),
    });
  }, [reelId, downloadReel]);

  const handleAnalyze = useCallback(() => {
    analyzeReel(reelId, {
      onSuccess: () => toast.success("Анализ запущен"),
      onError: (err) => toast.error(err.message),
    });
  }, [reelId, analyzeReel]);

  const handleRefetch = useCallback(() => {
    refetch().catch(() => {
      // ignore
    });
  }, [refetch]);

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="w-full">
        <CardContent className="py-12 text-center text-muted-foreground">
          Рил не найден
        </CardContent>
      </Card>
    );
  }

  const statusConfig = STATUS_CONFIG[data.reel.status] || STATUS_CONFIG.scraped;
  const StatusIcon = statusConfig.icon;
  const isStatusAnimated =
    data.reel.status === "downloading" || data.reel.status === "analyzing";

  return (
    <Card className="w-full">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <code className="font-mono text-base">{reelId}</code>
            <Badge
              className={`${statusConfig.color} text-white`}
              variant="secondary"
            >
              <StatusIcon
                className={`mr-1 h-3 w-3 ${isStatusAnimated ? "animate-spin" : ""}`}
              />
              {statusConfig.label}
            </Badge>
          </CardTitle>
          <CardDescription>
            {data.reel.source} • {data.reel.likeCount?.toLocaleString() || 0}{" "}
            лайков
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={isLoading}
            onClick={handleRefetch}
            size="icon"
            variant="ghost"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
          <Button onClick={onClose} size="icon" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Обзор</TabsTrigger>
            <TabsTrigger value="logs">Логи ({data.logs.length})</TabsTrigger>
            <TabsTrigger value="ai-logs">
              AI Logs ({data.aiLogs?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="stats">Статистика</TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-4" value="overview">
            <OverviewTab
              data={data}
              isAnalyzing={isAnalyzing}
              isDownloading={isDownloading}
              isProcessing={isProcessing}
              isStatusAnimated={isStatusAnimated}
              onAnalyze={handleAnalyze}
              onDownload={handleDownload}
              onProcess={handleProcess}
              statusLabel={statusConfig.label}
            />
          </TabsContent>

          <TabsContent value="logs">
            <LogsTab
              expandedLogs={expandedLogs}
              logs={data.logs}
              onToggle={toggleLogExpand}
            />
          </TabsContent>

          <TabsContent value="stats">
            <StatsTab
              recentErrors={data.recentErrors}
              stageStats={data.stageStats}
            />
          </TabsContent>

          <TabsContent value="ai-logs">
            <AILogsTab
              aiLogs={data.aiLogs ?? []}
              expandedLogs={expandedLogs}
              onToggle={toggleLogExpand}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 truncate font-medium text-sm">{value}</p>
    </div>
  );
}

function LogItem({
  log,
  expanded,
  onToggle,
}: {
  log: ReelLog;
  expanded: boolean;
  onToggle: () => void;
}) {
  const config = LOG_LEVEL_CONFIG[log.level] || LOG_LEVEL_CONFIG.info;
  const hasMetadata = Object.keys(log.metadata ?? {}).length > 0;
  const showMetadata = expanded && hasMetadata;

  return (
    <div className={`rounded-lg p-3 ${config.bgColor}`}>
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
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {new Date(log.createdAt).toLocaleTimeString("ru-RU")}
          </span>
          {hasMetadata ? (
            <Button onClick={onToggle} size="icon" variant="ghost">
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          ) : null}
        </div>
      </div>

      {showMetadata ? (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {Object.entries(log.metadata ?? {}).map(([key, value]) => (
            <span className="rounded bg-muted px-2 py-1" key={key}>
              <span className="text-muted-foreground">{key}:</span>{" "}
              <span className="font-medium">
                {typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value)}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StageStatCard({ stat }: { stat: StageStats }) {
  const avgDuration =
    stat.count > 0 ? Math.round(stat.totalDuration / stat.count) : 0;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium capitalize">{stat.stage}</h4>
        {stat.errors > 0 ? (
          <Badge variant="destructive">{stat.errors} ошибок</Badge>
        ) : (
          <Badge variant="secondary">OK</Badge>
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Логов:</span>{" "}
          <span className="font-medium">{stat.count}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Общее время:</span>{" "}
          <span className="font-medium">{stat.totalDuration}ms</span>
        </div>
        <div>
          <span className="text-muted-foreground">Среднее:</span>{" "}
          <span className="font-medium">{avgDuration}ms</span>
        </div>
      </div>
    </div>
  );
}
