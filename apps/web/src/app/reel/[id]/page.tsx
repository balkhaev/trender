"use client";

import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
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
  useDeleteCompositeGeneration,
  useDeleteGeneration,
  useDownloadReel,
  useGenerateVideo,
  useReelDebug,
  useResetReelStatus,
  useResizeReel,
} from "@/lib/hooks/use-templates";
import { hasVideo, refreshReelMetadata } from "@/lib/reels-api";
import { isAnimatedStatus, REEL_STATUS_CONFIG } from "@/lib/status-config";
import type { KlingGenerationOptions } from "@/lib/templates-api";
import { formatDuration, formatNumber } from "@/lib/utils";
import {
  CompositeGenerationCard,
  GenerationCard,
  InfoCard,
  LogItem,
  StageStatCard,
} from "./components";

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
  const { mutate: deleteGeneration, isPending: isDeletingGeneration } =
    useDeleteGeneration();
  const { mutate: deleteCompositeGeneration, isPending: isDeletingComposite } =
    useDeleteCompositeGeneration();
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
      mutationFn: ({
        sceneId,
        prompt,
        useGeneratedAsSource,
        imageUrls,
      }: {
        sceneId: string;
        prompt?: string;
        useGeneratedAsSource?: boolean;
        imageUrls?: string[];
      }) =>
        import("@/lib/templates-api").then((m) =>
          m.regenerateScene(sceneId, {
            prompt,
            useGeneratedAsSource,
            imageUrls,
          })
        ),
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

  const handleDeleteGeneration = useCallback(
    (generationId: string) => {
      deleteGeneration(generationId, {
        onSuccess: () => {
          toast.success("Генерация удалена");
          refetch();
        },
        onError: (err: Error) => toast.error(err.message),
      });
    },
    [deleteGeneration, refetch]
  );

  const handleDeleteComposite = useCallback(
    (compositeId: string) => {
      deleteCompositeGeneration(compositeId, {
        onSuccess: () => {
          toast.success("Генерация удалена");
          refetch();
        },
        onError: (err: Error) => toast.error(err.message),
      });
    },
    [deleteCompositeGeneration, refetch]
  );

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

  const reelStatus = data.reel
    .status as import("@trender/types/reel").ReelStatus;
  const statusConfig =
    REEL_STATUS_CONFIG[reelStatus] || REEL_STATUS_CONFIG.scraped;
  const StatusIcon = statusConfig.icon;
  const statusAnimated = isAnimatedStatus(reelStatus);

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
                    className={`${statusConfig.className} transition-all duration-300 ${statusAnimated ? "animate-glow-pulse" : ""}`}
                    variant="secondary"
                  >
                    <StatusIcon
                      className={`mr-1 h-3 w-3 ${statusAnimated ? "animate-spin" : ""}`}
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
              (data.compositeGenerations?.length ?? 0) > 0) && (
              <Card className="animate-delay-250 animate-fade-in-up">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Film className="h-4 w-4" />
                    Генерации
                    <Badge variant="secondary">
                      {(data.generations?.length ?? 0) +
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
                          isDeleting={isDeletingComposite}
                          key={gen.id}
                          onDelete={handleDeleteComposite}
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
                        <GenerationCard
                          generation={gen}
                          isDeleting={isDeletingGeneration}
                          key={gen.id}
                          onDelete={handleDeleteGeneration}
                        />
                      ))}
                    </div>
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
