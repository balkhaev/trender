"use client";

import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  Eye,
  Film,
  Heart,
  Loader2,
  Maximize,
  MessageCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import NextImage from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoGenerator } from "@/components/video-generator";
import { VideoPreview } from "@/components/video-preview";
import { VideoTrimButton } from "@/components/video-trim-section";
import { useDeleteReel } from "@/lib/hooks/use-dashboard";
import {
  useAnalyzeReel,
  useDownloadReel,
  useGenerateVideo,
  useReelDebug,
  useResetReelStatus,
  useResizeReel,
} from "@/lib/hooks/use-templates";
import { hasVideo, refreshReelMetadata } from "@/lib/reels-api";
import type {
  CompositeGeneration,
  KlingGenerationOptions,
  ReelLog,
  SceneGeneration,
  StageStats,
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

const LOG_LEVEL_CONFIG: Record<
  string,
  { color: string; bgColor: string; borderColor: string }
> = {
  debug: {
    color: "text-muted-foreground",
    bgColor: "bg-surface-1",
    borderColor: "before:bg-muted-foreground/50",
  },
  info: {
    color: "text-blue-300",
    bgColor: "bg-blue-500/10",
    borderColor: "before:bg-blue-500",
  },
  warn: {
    color: "text-amber-300",
    bgColor: "bg-amber-500/10",
    borderColor: "before:bg-amber-500",
  },
  error: {
    color: "text-red-300",
    bgColor: "bg-red-500/10",
    borderColor: "before:bg-red-500",
  },
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

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const generatorRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, refetch } = useReelDebug(reelId);
  const { mutate: downloadReel, isPending: isDownloading } = useDownloadReel();
  const { mutate: analyzeReel, isPending: isAnalyzing } = useAnalyzeReel();
  const { mutate: generateVideo, isPending: isGenerating } = useGenerateVideo();
  const { mutateAsync: deleteReelAsync, isPending: isDeleting } =
    useDeleteReel();
  const { mutate: resizeReel, isPending: isResizing } = useResizeReel();
  const { mutate: resetReelStatus, isPending: isResetting } =
    useResetReelStatus();
  const { mutate: updateTemplate, isPending: isUpdatingTemplate } = useMutation(
    {
      mutationFn: ({
        id,
        data,
      }: {
        id: string;
        data: { isFeatured?: boolean };
      }) =>
        import("@/lib/templates-api").then((m) => m.updateTemplate(id, data)),
      onSuccess: () => {
        refetch();
      },
      onError: (err: Error) => toast.error(err.message),
    }
  );
  const { mutate: refreshMetadata, isPending: isRefreshingMetadata } =
    useMutation({
      mutationFn: () => refreshReelMetadata(reelId),
      onSuccess: () => {
        toast.success("Метаданные обновлены");
        refetch();
      },
      onError: (err: Error) => toast.error(err.message),
    });

  const { mutate: regenerateSceneMutation, isPending: isRegeneratingScene } =
    useMutation({
      mutationFn: (sceneId: string) =>
        import("@/lib/templates-api").then((m) => m.regenerateScene(sceneId)),
      onSuccess: () => {
        toast.success("Перегенерация сцены запущена");
        refetch();
      },
      onError: (err: Error) => toast.error(err.message),
    });

  const handleResetStatus = useCallback(() => {
    resetReelStatus(reelId, {
      onSuccess: () => {
        toast.success("Статус сброшен до 'Скачано'");
        refetch();
      },
      onError: (err: Error) => toast.error(err.message),
    });
  }, [reelId, resetReelStatus, refetch]);

  const handleResize = useCallback(() => {
    resizeReel(reelId, {
      onSuccess: (result) => {
        if (result.resized) {
          toast.success(result.message);
        } else {
          toast.info(result.message);
        }
        refetch();
      },
      onError: (err: Error) => toast.error(err.message),
    });
  }, [reelId, resizeReel, refetch]);

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

  const handleToggleFeatured = useCallback(() => {
    if (!data?.template) return;
    const newFeatured = !data.template.isFeatured;
    updateTemplate(
      { id: data.template.id, data: { isFeatured: newFeatured } },
      {
        onSuccess: () => {
          toast.success(
            newFeatured ? "Добавлено в тренды" : "Убрано из трендов"
          );
        },
      }
    );
  }, [data?.template, updateTemplate]);

  const handleGenerate = useCallback(
    (prompt: string, options: KlingGenerationOptions, analysisId: string) => {
      // Get source video URL
      const sourceVideoUrl = data?.videoUrl || data?.reel.videoUrl;
      if (!sourceVideoUrl) {
        toast.error("Нет исходного видео для генерации");
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        generateVideo(
          {
            analysisId,
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
    [data?.videoUrl, data?.reel?.videoUrl, generateVideo, refetch]
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

  const _videoSource =
    data.reel.source === "reels" ? "reels" : data.reel.source || "reels";

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col p-4 lg:p-6">
        {/* Sticky Header */}
        <header className="-mx-4 lg:-mx-6 sticky top-0 z-10 mb-6 border-glass-border border-b bg-background/80 px-4 py-4 backdrop-blur-xl lg:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                asChild
                className="transition-transform duration-200 hover:scale-105"
                size="icon"
                variant="ghost"
              >
                <Link href="/">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div>
                <h1 className="flex items-center gap-2 font-semibold text-xl">
                  <code className="font-mono text-base">{reelId}</code>
                  <Badge
                    className={`${statusConfig.className} transition-all duration-300 ${isStatusAnimated ? "animate-glow-pulse" : ""}`}
                    variant="secondary"
                  >
                    <StatusIcon
                      className={`mr-1 h-3 w-3 ${isStatusAnimated ? "animate-spin" : ""}`}
                    />
                    {statusConfig.label}
                  </Badge>
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Featured toggle button - only show if template exists */}
              {data?.template && (
                <Button
                  className="transition-all duration-200 hover:scale-105 active:scale-95"
                  disabled={isUpdatingTemplate}
                  onClick={handleToggleFeatured}
                  size="sm"
                  title={
                    data.template.isFeatured
                      ? "Убрать из трендов"
                      : "Добавить в тренды"
                  }
                  variant={data.template.isFeatured ? "default" : "outline"}
                >
                  {isUpdatingTemplate ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <svg
                      className={`mr-1 h-4 w-4 ${data.template.isFeatured ? "fill-current" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                  {data.template.isFeatured ? "В трендах" : "В тренды"}
                </Button>
              )}

              <Button
                className="transition-all duration-200 hover:scale-105 active:scale-95"
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
                  <Button
                    className="transition-all duration-200 hover:scale-105 active:scale-95"
                    disabled={isDeleting}
                    size="icon"
                    variant="outline"
                  >
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
                      Это действие удалит рил, все связанные анализы, генерации
                      и файлы. Это действие нельзя отменить.
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
        </header>

        {/* Main content */}
        <div className="grid gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
          {/* Video Player - Sticky on desktop */}
          <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {hasVideo(data.reel) && data.reel.videoUrl ? (
              <VideoPreview className="w-full" videoUrl={data.reel.videoUrl} />
            ) : (
              <div className="flex aspect-9/16 w-full items-center justify-center rounded-2xl border border-glass-border bg-gradient-to-br from-surface-2 to-surface-1">
                <div className="text-center text-muted-foreground">
                  <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-surface-3/50">
                    <Play className="h-8 w-8" />
                  </div>
                  <p className="text-sm">Видео не загружено</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <Card className="animate-delay-100 animate-fade-in-up gap-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Действия</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {/* Скачать (показываем только если видео ещё не скачано) */}
                {(data.reel.status === "scraped" ||
                  data.reel.status === "downloading") && (
                  <Button
                    className="transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
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

                <Button
                  asChild
                  className="transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  variant="secondary"
                >
                  <a
                    href={data.reel.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Открыть в Instagram
                  </a>
                </Button>

                {/* Download video to device - only show when video exists */}
                {hasVideo(data.reel) && data.reel.videoUrl && (
                  <Button
                    asChild
                    className="transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    variant="outline"
                  >
                    <a download href={data.reel.videoUrl}>
                      <Download className="mr-2 h-4 w-4" />
                      Скачать видео
                    </a>
                  </Button>
                )}

                {/* Resize button - only show when video exists */}
                {hasVideo(data.reel) && (
                  <Button
                    className="transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    disabled={isResizing}
                    onClick={handleResize}
                    variant="outline"
                  >
                    {isResizing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Maximize className="mr-2 h-4 w-4" />
                    )}
                    Увеличить для Kling
                  </Button>
                )}

                {/* Video Trim Button */}
                {hasVideo(data.reel) &&
                  (data.videoUrl || data.reel.videoUrl) && (
                    <VideoTrimButton
                      videoUrl={data.videoUrl || data.reel.videoUrl || ""}
                    />
                  )}

                {/* Reset Status Button - show when stuck in analyzing or failed */}
                {hasVideo(data.reel) &&
                  (data.reel.status === "analyzing" ||
                    data.reel.status === "failed") && (
                    <Button
                      className="transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      disabled={isResetting}
                      onClick={handleResetStatus}
                      variant="outline"
                    >
                      {isResetting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-2 h-4 w-4" />
                      )}
                      Сбросить статус
                    </Button>
                  )}
              </CardContent>
            </Card>
          </div>

          {/* Info and Debug */}
          <div className="space-y-6">
            {/* Info cards with refresh button */}
            <div className="animate-fade-in-up">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium text-muted-foreground text-sm">
                  Информация
                </h3>
                <Button
                  className="transition-all duration-200 hover:scale-105 active:scale-95"
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
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <InfoCard
                  icon={<Heart className="h-5 w-5 text-pink-500" />}
                  iconBg="from-pink-500/20 to-pink-500/5"
                  label="Лайки"
                  value={
                    data.reel.likeCount
                      ? formatNumber(data.reel.likeCount)
                      : "—"
                  }
                />
                <InfoCard
                  icon={<Eye className="h-5 w-5 text-blue-400" />}
                  iconBg="from-blue-500/20 to-blue-500/5"
                  label="Просмотры"
                  value={
                    data.reel.viewCount
                      ? formatNumber(data.reel.viewCount)
                      : "—"
                  }
                />
                <InfoCard
                  icon={<MessageCircle className="h-5 w-5 text-amber-400" />}
                  iconBg="from-amber-500/20 to-amber-500/5"
                  label="Комменты"
                  value={
                    data.reel.commentCount
                      ? formatNumber(data.reel.commentCount)
                      : "—"
                  }
                />
                <InfoCard
                  icon={<Clock className="h-5 w-5 text-emerald-400" />}
                  iconBg="from-emerald-500/20 to-emerald-500/5"
                  label="Длительность"
                  value={
                    data.reel.duration
                      ? formatDuration(data.reel.duration)
                      : "—"
                  }
                />
              </div>
            </div>

            {data.reel.caption ? (
              <Card className="animate-delay-100 animate-fade-in-up">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Описание</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm leading-relaxed">
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

            {/* Video Generator (Kling) - показываем когда видео скачано */}
            {hasVideo(data.reel) && (
              <div
                className="animate-delay-200 animate-fade-in-up"
                ref={generatorRef}
              >
                <VideoGenerator
                  analyses={data.analyses || []}
                  canAnalyze={
                    data.reel.status !== "analyzing" &&
                    data.reel.status !== "scraped" &&
                    data.reel.status !== "downloading"
                  }
                  isAnalyzing={isAnalyzing}
                  isGenerating={isGenerating}
                  onAnalyze={handleAnalyze}
                  onGenerate={handleGenerate}
                  sourceVideoUrl={data.videoUrl || data.reel.videoUrl || ""}
                />
              </div>
            )}

            {/* Generations Card - отдельная секция */}
            {((data.generations?.length ?? 0) > 0 ||
              (data.sceneGenerations?.length ?? 0) > 0 ||
              (data.compositeGenerations?.length ?? 0) > 0) && (
              <Card className="animate-delay-250 animate-fade-in-up">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Film className="h-4 w-4" />
                    Генерации
                    <Badge variant="secondary">
                      {(data.generations?.length ?? 0) +
                        (data.sceneGenerations?.length ?? 0) +
                        (data.compositeGenerations?.length ?? 0)}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Composite generations first (финальные результаты) */}
                  {(data.compositeGenerations?.length ?? 0) > 0 && (
                    <div className="space-y-3">
                      <h4 className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                        <Sparkles className="h-4 w-4" />
                        Составные генерации
                      </h4>
                      {data.compositeGenerations?.map((gen) => (
                        <CompositeGenerationCard
                          generation={gen}
                          key={gen.id}
                          onRegenerateScene={regenerateSceneMutation}
                          sceneGenerations={data.sceneGenerations}
                        />
                      ))}
                    </div>
                  )}

                  {/* Full video generations */}
                  {(data.generations?.length ?? 0) > 0 && (
                    <div className="space-y-3">
                      <h4 className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                        <Film className="h-4 w-4" />
                        Полные генерации
                      </h4>
                      {data.generations?.map((gen) => (
                        <GenerationCard generation={gen} key={gen.id} />
                      ))}
                    </div>
                  )}

                  {/* Scene generations */}
                  {(data.sceneGenerations?.length ?? 0) > 0 && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button
                          className="w-full justify-between"
                          variant="ghost"
                        >
                          <span className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Генерации сцен ({data.sceneGenerations?.length})
                          </span>
                          <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 space-y-3">
                        {data.sceneGenerations?.map((gen) => (
                          <SceneGenerationCard
                            generation={gen}
                            key={gen.id}
                            onRegenerate={regenerateSceneMutation}
                          />
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Debug Tabs - Collapsible */}
            <Collapsible className="animate-delay-300 animate-fade-in-up">
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer pb-2 transition-colors hover:bg-surface-2/50">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        Отладка
                        {data.recentErrors?.length > 0 && (
                          <Badge
                            className="bg-red-500/20 text-red-300"
                            variant="secondary"
                          >
                            {data.recentErrors.length} ошибок
                          </Badge>
                        )}
                      </CardTitle>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <Tabs defaultValue="logs">
                      <TabsList className="mb-4">
                        <TabsTrigger value="logs">
                          Логи ({data.logs?.length ?? 0})
                        </TabsTrigger>
                        <TabsTrigger value="stats">Статистика</TabsTrigger>
                      </TabsList>

                      <TabsContent value="logs">
                        <ScrollArea className="h-[400px]">
                          <div className="space-y-2 pr-4">
                            {!data.logs || data.logs.length === 0 ? (
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
                          {!data.stageStats || data.stageStats.length === 0 ? (
                            <p className="py-8 text-center text-muted-foreground text-sm">
                              Статистики пока нет
                            </p>
                          ) : (
                            data.stageStats.map((stat) => (
                              <StageStatCard key={stat.stage} stat={stat} />
                            ))
                          )}

                          {data.recentErrors?.length > 0 ? (
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
                                      <Badge variant="outline">
                                        {err.stage}
                                      </Badge>
                                      <span className="text-muted-foreground text-xs">
                                        {new Date(
                                          err.createdAt
                                        ).toLocaleTimeString("ru-RU")}
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
                    </Tabs>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
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
  iconBg = "from-primary/20 to-primary/5",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  iconBg?: string;
}) {
  return (
    <Card className="group transition-all duration-200 hover:border-primary/20 hover:bg-surface-2/80">
      <CardContent className="flex items-center gap-3 p-4">
        {icon && (
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${iconBg} transition-transform duration-200 group-hover:scale-110`}
          >
            {icon}
          </div>
        )}
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="font-semibold text-lg tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LogItem({ log }: { log: ReelLog }) {
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
                src={generation.videoUrl ?? undefined}
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
  if (!show || videoUrl === null) {
    return null;
  }

  return (
    <div className="flex gap-2">
      <Button asChild className="flex-1" size="sm" variant="default">
        <a href={videoUrl} rel="noopener" target="_blank">
          <ExternalLink className="mr-1 h-3 w-3" />
          Открыть видео
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a download href={videoUrl}>
          <Download className="mr-1 h-3 w-3" />
          Скачать
        </a>
      </Button>
    </div>
  );
}

function CompositeGenerationCard({
  generation,
  sceneGenerations,
  onRegenerateScene,
}: {
  generation: CompositeGeneration;
  sceneGenerations?: SceneGeneration[];
  onRegenerateScene?: (sceneId: string) => void;
}) {
  const isActive =
    generation.status === "pending" ||
    generation.status === "waiting" ||
    generation.status === "generating" ||
    generation.status === "concatenating" ||
    generation.status === "uploading";
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

  const statusConfig: Record<string, { label: string; className: string }> = {
    pending: {
      label: "В очереди",
      className: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    },
    waiting: {
      label: "Ожидание сцен",
      className: "border-blue-500/20 bg-blue-500/10 text-blue-200",
    },
    generating: {
      label: "Генерация",
      className: "border-violet-500/20 bg-violet-500/10 text-violet-200",
    },
    concatenating: {
      label: "Склейка",
      className: "border-cyan-500/20 bg-cyan-500/10 text-cyan-200",
    },
    uploading: {
      label: "Загрузка",
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

  const status = statusConfig[generation.status] || statusConfig.pending;

  // Get scene generations for this composite
  const sceneConfigs = generation.sceneConfig || [];
  const getSceneGeneration = (generationId?: string) =>
    sceneGenerations?.find((sg) => sg.id === generationId);

  return (
    <div className="overflow-hidden rounded-xl border border-glass-border bg-card shadow-(--shadow-glass) backdrop-blur-xl">
      <div className="flex items-center justify-between border-glass-border border-b bg-surface-2 px-4 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="default">COMPOSITE</Badge>
          <Badge className="text-xs" variant="outline">
            {sceneConfigs.length} сцен
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
          {duration !== null && (
            <span className="text-emerald-300">({duration}с)</span>
          )}
        </div>
      </div>

      <div className="flex flex-col p-4">
        {generation.videoUrl && (
          <div className="mb-3 flex h-80 gap-3">
            <video
              className="h-full rounded-lg"
              controls
              muted
              src={generation.videoUrl}
            />
          </div>
        )}

        {/* Scene breakdown */}
        {sceneConfigs.length > 0 && (
          <div className="mb-3">
            <p className="mb-2 font-medium text-muted-foreground text-xs">
              Сцены:
            </p>
            <div className="flex flex-wrap gap-2">
              {sceneConfigs.map((config) => {
                const sceneGen = getSceneGeneration(config.generationId);
                const sceneStatus = config.useOriginal
                  ? "original"
                  : sceneGen?.status || "pending";

                return (
                  <div
                    className="group relative flex items-center gap-1.5 rounded-lg border border-glass-border bg-surface-1 px-2 py-1"
                    key={config.sceneId}
                  >
                    <span className="font-medium text-xs">
                      #{config.sceneIndex + 1}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {config.startTime.toFixed(1)}s-{config.endTime.toFixed(1)}
                      s
                    </span>
                    <Badge
                      className="text-xs"
                      variant={
                        sceneStatus === "completed" ||
                        sceneStatus === "original"
                          ? "default"
                          : sceneStatus === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {config.useOriginal
                        ? "Оригинал"
                        : sceneStatus === "completed"
                          ? "Готово"
                          : sceneStatus === "processing"
                            ? "..."
                            : sceneStatus === "failed"
                              ? "Ошибка"
                              : "Ожидание"}
                    </Badge>
                    {onRegenerateScene && !config.useOriginal && (
                      <Button
                        className="ml-1 h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => onRegenerateScene(config.sceneId)}
                        size="sm"
                        title="Перегенерировать сцену"
                        variant="ghost"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Progress */}
        {isActive && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {generation.progressMessage || "Обработка..."}
              </span>
              <span className="font-medium">{generation.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-1">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${generation.progress}%` }}
              />
            </div>
          </div>
        )}

        <GenerationError error={generation.error} show={isFailed} />
        <GenerationActions show={isCompleted} videoUrl={generation.videoUrl} />
      </div>
    </div>
  );
}

function SceneGenerationCard({
  generation,
  onRegenerate,
}: {
  generation: SceneGeneration;
  onRegenerate?: (sceneId: string) => void;
}) {
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

  const statusConfig: Record<string, { label: string; className: string }> = {
    pending: {
      label: "В очереди",
      className: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    },
    processing: {
      label: "Генерация",
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

  const status = statusConfig[generation.status] || statusConfig.pending;
  const sceneInfo = generation.scene;

  return (
    <div className="overflow-hidden rounded-lg border border-glass-border bg-card/50">
      <div className="flex items-center justify-between border-glass-border border-b bg-surface-2/50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Badge className="text-xs" variant="outline">
            Сцена {sceneInfo ? sceneInfo.index + 1 : "?"}
          </Badge>
          {sceneInfo && (
            <span className="text-muted-foreground text-xs">
              {sceneInfo.startTime.toFixed(1)}s - {sceneInfo.endTime.toFixed(1)}
              s
            </span>
          )}
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
          {duration !== null && (
            <span className="text-emerald-300">{duration}с</span>
          )}
          {(isCompleted || isFailed) && onRegenerate && (
            <Button
              className="h-6 px-2 text-xs"
              onClick={() => onRegenerate(generation.sceneId)}
              size="sm"
              variant="ghost"
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Перегенерировать
            </Button>
          )}
        </div>
      </div>

      <div className="p-3">
        {generation.videoUrl && (
          <div className="mb-2">
            <video
              className="h-32 rounded-lg"
              controls
              muted
              src={generation.videoUrl}
            />
          </div>
        )}

        {/* Progress */}
        {isActive && (
          <div className="mb-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-1">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${generation.progress}%` }}
              />
            </div>
          </div>
        )}

        {isFailed && generation.error && (
          <p className="text-red-300 text-xs">{generation.error}</p>
        )}
      </div>
    </div>
  );
}
