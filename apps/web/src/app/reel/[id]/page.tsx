"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  Film,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

/**
 * Преобразует относительные API URL в абсолютные
 */
function resolveVideoUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  if (url.startsWith("/api/")) {
    return `${API_URL}${url}`;
  }
  return url;
}

import { useMutation } from "@tanstack/react-query";
import NextImage from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { AnalysisComparison } from "@/components/analysis-comparison";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoGenerator } from "@/components/video-generator";
import { VideoPreview } from "@/components/video-preview";
import { useDeleteReel } from "@/lib/hooks/use-dashboard";
import {
  useAnalyzeReel,
  useAnalyzeReelByFrames,
  useDownloadReel,
  useGenerateVideo,
  useReelDebug,
} from "@/lib/hooks/use-templates";
import { hasVideo, refreshReelMetadata } from "@/lib/reels-api";
import type {
  KlingGenerationOptions,
  ReelLog,
  StageStats,
  TemplateAnalysis,
  VideoGeneration,
} from "@/lib/templates-api";

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: React.ElementType }
> = {
  scraped: {
    label: "Найден",
    className: "border-glass-border bg-surface-2 text-muted-foreground",
    icon: Clock,
  },
  downloading: {
    label: "Загрузка...",
    className: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    icon: Loader2,
  },
  downloaded: {
    label: "Загружен",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    icon: CheckCircle2,
  },
  analyzing: {
    label: "Анализ...",
    className: "border-violet-500/20 bg-violet-500/10 text-violet-300",
    icon: Loader2,
  },
  analyzed: {
    label: "Готов",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    icon: Sparkles,
  },
  failed: {
    label: "Ошибка",
    className: "border-red-500/20 bg-red-500/10 text-red-300",
    icon: XCircle,
  },
};

const LOG_LEVEL_CONFIG: Record<string, { color: string; bgColor: string }> = {
  debug: { color: "text-muted-foreground", bgColor: "bg-surface-1" },
  info: { color: "text-blue-300", bgColor: "bg-blue-500/10" },
  warn: { color: "text-amber-300", bgColor: "bg-amber-500/10" },
  error: { color: "text-red-300", bgColor: "bg-red-500/10" },
};

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(0)}K`;
  }
  return num.toString();
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getGenerationVariant(
  status: string
): "default" | "destructive" | "secondary" {
  if (status === "completed") {
    return "default";
  }
  if (status === "failed") {
    return "destructive";
  }
  return "secondary";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI страница содержит много условного рендера и секций.
export default function ReelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reelId = params.id as string;

  // Selected analysis for generation (set when user clicks "Use for generation")
  const [selectedAnalysis, setSelectedAnalysis] =
    useState<TemplateAnalysis | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const generatorRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, refetch } = useReelDebug(reelId);
  const { mutate: downloadReel, isPending: isDownloading } = useDownloadReel();
  const { mutate: analyzeReel, isPending: isAnalyzing } = useAnalyzeReel();
  const { mutate: analyzeReelByFrames, isPending: isAnalyzingFrames } =
    useAnalyzeReelByFrames();
  const { mutate: generateVideo, isPending: isGenerating } = useGenerateVideo();
  const { mutateAsync: deleteReelAsync, isPending: isDeleting } =
    useDeleteReel();
  const { mutate: refreshMetadata, isPending: isRefreshingMetadata } =
    useMutation({
      mutationFn: () => refreshReelMetadata(reelId),
      onSuccess: () => {
        toast.success("Метаданные обновлены");
        refetch();
      },
      onError: (err: Error) => toast.error(err.message),
    });

  const handleDownload = useCallback(() => {
    downloadReel(reelId, {
      onSuccess: () => toast.success("Загрузка запущена"),
      onError: (err: Error) => toast.error(err.message),
    });
  }, [reelId, downloadReel]);

  const handleAnalyze = useCallback(() => {
    analyzeReel(reelId, {
      onSuccess: () => toast.success("Анализ запущен"),
      onError: (err: Error) => toast.error(err.message),
    });
  }, [reelId, analyzeReel]);

  const handleAnalyzeFrames = useCallback(() => {
    analyzeReelByFrames(reelId, {
      onSuccess: () => toast.success("Анализ по кадрам запущен"),
      onError: (err: Error) => toast.error(err.message),
    });
  }, [reelId, analyzeReelByFrames]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteReelAsync(reelId);
      toast.success("Рил удалён");
      setDeleteDialogOpen(false);
      router.push("/");
    } catch {
      toast.error("Не удалось удалить рил");
    }
  }, [reelId, deleteReelAsync, router]);

  // Get the active analysis (selected or first available)
  const activeAnalysis =
    selectedAnalysis ||
    (data?.analyses && data.analyses.length > 0 ? data.analyses[0] : null);

  const handleUseForGeneration = useCallback((analysis: TemplateAnalysis) => {
    setSelectedAnalysis(analysis);
    toast.success(
      `Выбран анализ "${analysis.analysisType === "frames" ? "По кадрам" : "Стандартный"}" для генерации`
    );

    // Прокрутить к генератору
    setTimeout(() => {
      generatorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }, []);

  const handleGenerate = useCallback(
    (prompt: string, options: KlingGenerationOptions) => {
      if (!activeAnalysis?.id) {
        toast.error("Сначала проанализируйте рил");
        return Promise.resolve();
      }

      // Get source video URL
      const sourceVideoUrl = data?.videoUrl || data?.reel.videoUrl;
      if (!sourceVideoUrl) {
        toast.error("Нет исходного видео для генерации");
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        generateVideo(
          {
            analysisId: activeAnalysis.id,
            prompt,
            sourceVideoUrl,
            options,
          },
          {
            onSuccess: () => {
              toast.success("Генерация Kling AI запущена");
              refetch();
              resolve();
            },
            onError: (err: Error) => {
              toast.error(err.message);
              reject(err);
            },
          }
        );
      });
    },
    [
      activeAnalysis?.id,
      data?.videoUrl,
      data?.reel?.videoUrl,
      generateVideo,
      refetch,
    ]
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <XCircle className="h-16 w-16 text-muted-foreground" />
        <h1 className="font-semibold text-xl">Рил не найден</h1>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            На главную
          </Link>
        </Button>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[data.reel.status] || STATUS_CONFIG.scraped;
  const StatusIcon = statusConfig.icon;
  const isStatusAnimated =
    data.reel.status === "downloading" || data.reel.status === "analyzing";

  const videoSource =
    data.reel.source === "reels" ? "reels" : data.reel.source || "reels";

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 lg:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild size="icon" variant="ghost">
              <Link href="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="flex items-center gap-2 font-semibold text-xl">
                <code className="font-mono">{reelId}</code>
                <Badge className={statusConfig.className} variant="secondary">
                  <StatusIcon
                    className={`mr-1 h-3 w-3 ${isStatusAnimated ? "animate-spin" : ""}`}
                  />
                  {statusConfig.label}
                </Badge>
              </h1>
              <p className="text-muted-foreground text-sm">
                {data.reel.source}
                {data.reel.duration
                  ? ` • ${formatDuration(data.reel.duration)}`
                  : ""}
                {data.reel.likeCount
                  ? ` • ${formatNumber(data.reel.likeCount)} лайков`
                  : ""}
                {data.reel.viewCount
                  ? ` • ${formatNumber(data.reel.viewCount)} просмотров`
                  : ""}
                {data.reel.commentCount
                  ? ` • ${formatNumber(data.reel.commentCount)} комментов`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              disabled={isLoading}
              onClick={() => refetch()}
              size="icon"
              variant="outline"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>

            <AlertDialog
              onOpenChange={setDeleteDialogOpen}
              open={deleteDialogOpen}
            >
              <AlertDialogTrigger asChild>
                <Button disabled={isDeleting} size="icon" variant="outline">
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-destructive" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить рил?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Это действие удалит рил, все связанные анализы, генерации и
                    файлы. Это действие нельзя отменить.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleDelete}
                  >
                    {isDeleting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Main content */}
        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          {/* Video Player */}
          <div className="space-y-4">
            {hasVideo(data.reel) ? (
              <VideoPreview
                className="w-full"
                reelId={reelId}
                s3Key={data.reel.s3Key}
                source={videoSource}
              />
            ) : (
              <Card>
                <CardContent className="p-4">
                  <div className="flex aspect-9/16 w-full items-center justify-center rounded-lg bg-surface-1">
                    <div className="text-center text-muted-foreground">
                      <Play className="mx-auto mb-2 h-12 w-12" />
                      <p className="text-sm">Видео не загружено</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <Card className="gap-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Действия</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {/* Шаг 1: Скачать (показываем только если видео ещё не скачано) */}
                {(data.reel.status === "scraped" ||
                  data.reel.status === "downloading") && (
                  <Button
                    disabled={
                      isDownloading || data.reel.status === "downloading"
                    }
                    onClick={handleDownload}
                    variant="outline"
                  >
                    {isDownloading || data.reel.status === "downloading" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Скачать
                  </Button>
                )}

                {/* Шаг 2: Анализ / По кадрам (показываем если видео скачано, проанализировано или была ошибка) */}
                {(data.reel.status === "downloaded" ||
                  data.reel.status === "analyzing" ||
                  data.reel.status === "analyzed" ||
                  data.reel.status === "failed") && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      disabled={
                        isAnalyzing ||
                        isAnalyzingFrames ||
                        data.reel.status === "analyzing"
                      }
                      onClick={handleAnalyze}
                      variant="outline"
                    >
                      {isAnalyzing || data.reel.status === "analyzing" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Анализ
                    </Button>
                    <Button
                      disabled={
                        isAnalyzing ||
                        isAnalyzingFrames ||
                        data.reel.status === "analyzing"
                      }
                      onClick={handleAnalyzeFrames}
                      title="Анализ видео по кадрам через Gemini 2.5 Flash"
                      variant="outline"
                    >
                      {isAnalyzingFrames ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Film className="mr-2 h-4 w-4" />
                      )}
                      По кадрам
                    </Button>
                  </div>
                )}

                <Button asChild variant="secondary">
                  <a
                    href={data.reel.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Открыть в Instagram
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Info and Debug */}
          <div className="space-y-4">
            {/* Info cards with refresh button */}
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-muted-foreground text-sm">
                Информация
              </h3>
              <Button
                disabled={isRefreshingMetadata}
                onClick={() => refreshMetadata()}
                size="sm"
                variant="ghost"
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${isRefreshingMetadata ? "animate-spin" : ""}`}
                />
                Обновить
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <InfoCard
                icon={<Heart className="h-4 w-4 text-pink-500" />}
                label="Лайки"
                value={
                  data.reel.likeCount ? formatNumber(data.reel.likeCount) : "—"
                }
              />
              <InfoCard
                icon={<Eye className="h-4 w-4 text-blue-400" />}
                label="Просмотры"
                value={
                  data.reel.viewCount ? formatNumber(data.reel.viewCount) : "—"
                }
              />
              <InfoCard
                icon={<MessageCircle className="h-4 w-4 text-amber-400" />}
                label="Комменты"
                value={
                  data.reel.commentCount
                    ? formatNumber(data.reel.commentCount)
                    : "—"
                }
              />
              <InfoCard
                icon={<Clock className="h-4 w-4 text-emerald-400" />}
                label="Длительность"
                value={
                  data.reel.duration ? formatDuration(data.reel.duration) : "—"
                }
              />
              <InfoCard label="Источник" value={data.reel.source || "reels"} />
            </div>

            {data.reel.caption ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Описание</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  {data.reel.caption}
                </CardContent>
              </Card>
            ) : null}

            {/* Error message */}
            {data.reel.errorMessage ? (
              <Card className="border-red-500/20 bg-surface-1">
                <CardContent className="flex items-start gap-3 p-4">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
                  <div>
                    <p className="font-medium text-red-300 text-sm">
                      Ошибка обработки
                    </p>
                    <p className="mt-1 text-red-300/90 text-sm">
                      {data.reel.errorMessage}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Analysis Comparison (switch between standard/frames) */}
            {data.analyses?.length > 0 ? (
              <AnalysisComparison
                analyses={data.analyses}
                onUseForGeneration={handleUseForGeneration}
              />
            ) : null}

            {/* Video Generator (Kling) */}
            {activeAnalysis ? (
              <div ref={generatorRef}>
                <VideoGenerator
                  analysis={activeAnalysis}
                  isGenerating={isGenerating}
                  onGenerate={handleGenerate}
                  sourceVideoUrl={data.videoUrl || data.reel.videoUrl || ""}
                />
              </div>
            ) : null}

            {/* Debug Tabs */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Отладка</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="logs">
                  <TabsList className="mb-4">
                    <TabsTrigger value="logs">
                      Логи ({data.logs.length})
                    </TabsTrigger>
                    <TabsTrigger value="stats">Статистика</TabsTrigger>
                    {data.generations.length > 0 ? (
                      <TabsTrigger value="generations">
                        Генерации ({data.generations.length})
                      </TabsTrigger>
                    ) : null}
                  </TabsList>

                  <TabsContent value="logs">
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2 pr-4">
                        {data.logs.length === 0 ? (
                          <p className="py-8 text-center text-muted-foreground text-sm">
                            Логов пока нет
                          </p>
                        ) : (
                          data.logs.map((log) => (
                            <LogItem key={log.id} log={log} />
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="stats">
                    <div className="space-y-4">
                      {data.stageStats.length === 0 ? (
                        <p className="py-8 text-center text-muted-foreground text-sm">
                          Статистики пока нет
                        </p>
                      ) : (
                        data.stageStats.map((stat) => (
                          <StageStatCard key={stat.stage} stat={stat} />
                        ))
                      )}

                      {data.recentErrors.length > 0 ? (
                        <>
                          <Separator />
                          <div className="space-y-2">
                            <h4 className="font-medium text-red-500 text-sm">
                              Последние ошибки
                            </h4>
                            {data.recentErrors.map((err) => (
                              <div
                                className="rounded-lg border border-red-500/20 bg-surface-1 p-3 text-red-300 text-sm"
                                key={err.id}
                              >
                                <div className="flex items-center justify-between">
                                  <Badge variant="outline">{err.stage}</Badge>
                                  <span className="text-muted-foreground text-xs">
                                    {new Date(err.createdAt).toLocaleTimeString(
                                      "ru-RU"
                                    )}
                                  </span>
                                </div>
                                <p className="mt-1">{err.message}</p>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </TabsContent>

                  {data.generations.length > 0 ? (
                    <TabsContent value="generations">
                      <div className="space-y-3">
                        {data.generations.map((gen) => (
                          <GenerationCard generation={gen} key={gen.id} />
                        ))}
                      </div>
                    </TabsContent>
                  ) : null}
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function InfoCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 px-4 py-0">
        {icon}
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="font-medium text-sm">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LogItem({ log }: { log: ReelLog }) {
  const config = LOG_LEVEL_CONFIG[log.level] || LOG_LEVEL_CONFIG.info;

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
        <span className="text-muted-foreground text-xs">
          {new Date(log.createdAt).toLocaleTimeString("ru-RU")}
        </span>
      </div>
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
          <span className="text-muted-foreground">Общее:</span>{" "}
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

function GenerationCard({ generation }: { generation: VideoGeneration }) {
  const isActive =
    generation.status === "pending" || generation.status === "processing";
  const isCompleted = generation.status === "completed";
  const isFailed = generation.status === "failed";

  const duration =
    generation.completedAt && generation.createdAt
      ? Math.round(
          (new Date(generation.completedAt).getTime() -
            new Date(generation.createdAt).getTime()) /
            1000
        )
      : null;

  const statusConfig = {
    pending: {
      label: "В очереди",
      className: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    },
    processing: {
      label: "Генерация...",
      className: "border-blue-500/20 bg-blue-500/10 text-blue-200",
    },
    completed: {
      label: "Готово",
      className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    },
    failed: {
      label: "Ошибка",
      className: "border-red-500/20 bg-red-500/10 text-red-200",
    },
  };

  const status =
    statusConfig[generation.status as keyof typeof statusConfig] ||
    statusConfig.pending;

  return (
    <div className="overflow-hidden rounded-xl border border-glass-border bg-card shadow-(--shadow-glass) backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-glass-border border-b bg-surface-2 px-4 py-2">
        <div className="flex items-center gap-2">
          <Badge variant={getGenerationVariant(generation.status)}>
            {generation.provider.toUpperCase()}
          </Badge>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${status.className}`}
          >
            {isActive ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {status.label}
              </span>
            ) : (
              status.label
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Clock className="h-3 w-3" />
          {new Date(generation.createdAt).toLocaleString("ru-RU")}
          {duration !== null ? (
            <span className="text-emerald-300">({duration}с)</span>
          ) : null}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col p-4">
        {/* Thumbnail + Video preview */}
        {generation.thumbnailUrl !== null || generation.videoUrl !== null ? (
          <div className="mb-3 flex h-80 gap-3">
            {generation.thumbnailUrl !== null ? (
              <NextImage
                alt="Превью"
                className="rounded-lg object-cover"
                height={80}
                src={generation.thumbnailUrl}
                unoptimized
                width={80}
              />
            ) : null}
            {generation.videoUrl !== null ? (
              <video
                className="h-full rounded-lg"
                controls
                muted
                src={resolveVideoUrl(generation.videoUrl) ?? undefined}
              />
            ) : null}
          </div>
        ) : null}

        {/* Prompt */}
        {generation.prompt ? (
          <div className="mb-3">
            <p className="mb-1 font-medium text-muted-foreground text-xs">
              Промпт:
            </p>
            <p className="line-clamp-3 rounded-lg bg-muted/50 p-2 text-sm">
              {generation.prompt}
            </p>
          </div>
        ) : null}

        {/* Error */}
        <GenerationError error={generation.error} show={isFailed} />

        {/* Actions */}
        <GenerationActions show={isCompleted} videoUrl={generation.videoUrl} />

        {/* Processing indicator */}
        {isActive ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-1">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500" />
            </div>
            <span className="text-xs">Обработка...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GenerationError({
  show,
  error,
}: {
  show: boolean;
  error: string | null;
}) {
  if (!show || error === null) {
    return null;
  }

  return (
    <div className="mb-3 rounded-lg border border-red-500/20 bg-surface-1 p-2 text-red-300 text-sm">
      <p className="mb-1 font-medium text-xs">Ошибка:</p>
      {error}
    </div>
  );
}

function GenerationActions({
  show,
  videoUrl,
}: {
  show: boolean;
  videoUrl: string | null;
}) {
  const resolvedUrl = resolveVideoUrl(videoUrl);

  if (!show || resolvedUrl === null) {
    return null;
  }

  return (
    <div className="flex gap-2">
      <Button asChild className="flex-1" size="sm" variant="default">
        <a href={resolvedUrl} rel="noopener" target="_blank">
          <ExternalLink className="mr-1 h-3 w-3" />
          Открыть видео
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a download href={resolvedUrl}>
          <Download className="mr-1 h-3 w-3" />
          Скачать
        </a>
      </Button>
    </div>
  );
}
