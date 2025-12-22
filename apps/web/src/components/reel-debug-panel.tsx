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
  ReelDebugInfo,
  ReelLog,
  StageStats,
  VideoGeneration,
} from "@/lib/templates-api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

function resolveVideoUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  if (url.startsWith("/api/")) {
    return `${API_URL}${url}`;
  }
  return url;
}

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
  const href = resolveVideoUrl(gen.videoUrl);
  const variant = getGenerationBadgeVariant(gen.status);

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Badge variant={variant}>{gen.provider}</Badge>
        <span className="text-muted-foreground text-sm">
          {getGenerationStatusText(gen)}
        </span>
      </div>
      {href ? (
        <Button asChild size="sm" variant="ghost">
          <a href={href} rel="noopener" target="_blank">
            Открыть
          </a>
        </Button>
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
            {data.template.title || data.template.analysis.subject}
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
  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2 pr-4">
        {logs.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            Логов пока нет
          </p>
        ) : (
          logs.map((log) => (
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
        <pre className="mt-2 overflow-auto rounded bg-muted p-2 font-mono text-xs">
          {JSON.stringify(log.metadata, null, 2)}
        </pre>
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
