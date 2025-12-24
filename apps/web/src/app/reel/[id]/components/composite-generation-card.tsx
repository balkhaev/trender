"use client";

import {
  Clock,
  Film,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { COMPOSITE_STATUS_CONFIG } from "@/lib/status-config";
import type { CompositeGeneration, SceneGeneration } from "@/lib/templates-api";
import { GenerationActions, GenerationError } from "./generation-card";

type CompositeGenerationCardProps = {
  generation: CompositeGeneration;
  sceneGenerations?: SceneGeneration[];
  onRegenerateScene?: (params: {
    sceneId: string;
    prompt?: string;
    useGeneratedAsSource?: boolean;
    imageUrls?: string[];
  }) => void;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
};

export function CompositeGenerationCard({
  generation,
  sceneGenerations,
  onRegenerateScene,
  onDelete,
  isDeleting,
}: CompositeGenerationCardProps) {
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [regenerateSceneId, setRegenerateSceneId] = useState<string | null>(
    null
  );
  const [regeneratePrompt, setRegeneratePrompt] = useState("");
  const [useGeneratedAsSource, setUseGeneratedAsSource] = useState(false);
  const [hasCompletedGeneration, setHasCompletedGeneration] = useState(false);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

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

  const handleOpenRegenerateDialog = (sceneId: string) => {
    const sceneGen = sceneGenerations?.find((sg) =>
      generation.sceneConfig?.some(
        (c) => c.sceneId === sceneId && c.generationId === sg.id
      )
    );
    const hasCompleted =
      sceneGen?.status === "completed" && !!sceneGen?.videoUrl;

    const images =
      sceneGen?.selectedElements
        ?.filter((e) => e.customMediaUrl)
        .map((e) => e.customMediaUrl as string) || [];

    setRegenerateSceneId(sceneId);
    setRegeneratePrompt(sceneGen?.prompt || "");
    setHasCompletedGeneration(hasCompleted);
    setUseGeneratedAsSource(false);
    setReferenceImages(images);
    setRegenerateDialogOpen(true);
  };

  const handleRegenerate = () => {
    if (regenerateSceneId && onRegenerateScene) {
      onRegenerateScene({
        sceneId: regenerateSceneId,
        prompt: regeneratePrompt || undefined,
        useGeneratedAsSource: useGeneratedAsSource || undefined,
        imageUrls: referenceImages.length > 0 ? referenceImages : undefined,
      });
      setRegenerateDialogOpen(false);
      setRegenerateSceneId(null);
      setRegeneratePrompt("");
      setReferenceImages([]);
    }
  };

  const status =
    COMPOSITE_STATUS_CONFIG[generation.status] ||
    COMPOSITE_STATUS_CONFIG.pending;

  const sceneConfigs = generation.sceneConfig || [];
  const getSceneGeneration = (generationId?: string) =>
    sceneGenerations?.find((sg) => sg.id === generationId);

  const handleDelete = () => {
    onDelete?.(generation.id);
    setDeleteDialogOpen(false);
  };

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
          {onDelete && (
            <AlertDialog
              onOpenChange={setDeleteDialogOpen}
              open={deleteDialogOpen}
            >
              <AlertDialogTrigger asChild>
                <Button
                  className="ml-2 h-6 w-6"
                  disabled={isDeleting}
                  size="icon"
                  variant="ghost"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3 text-destructive" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить генерацию?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Это действие удалит составную генерацию, все связанные
                    генерации сцен и видеофайлы.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleDelete}
                  >
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

        {/* Scene breakdown with previews */}
        {sceneConfigs.length > 0 && (
          <div className="mb-3">
            <p className="mb-2 font-medium text-muted-foreground text-xs">
              Сцены:
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sceneConfigs.map((config) => {
                const sceneGen = getSceneGeneration(config.generationId);
                const sceneStatus = config.useOriginal
                  ? "original"
                  : sceneGen?.status || "pending";
                const thumbnailUrl = sceneGen?.scene?.thumbnailUrl;
                const sceneVideoUrl = sceneGen?.videoUrl;
                const isSceneActive =
                  sceneStatus === "pending" ||
                  sceneStatus === "processing" ||
                  sceneStatus === "generating";

                return (
                  <ScenePreviewCard
                    config={config}
                    isSceneActive={isSceneActive}
                    key={config.sceneId}
                    onRegenerateClick={() =>
                      handleOpenRegenerateDialog(config.sceneId)
                    }
                    onRegenerateScene={onRegenerateScene}
                    sceneStatus={sceneStatus}
                    sceneVideoUrl={sceneVideoUrl}
                    thumbnailUrl={thumbnailUrl}
                  />
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

      {/* Regenerate Dialog */}
      <Dialog
        onOpenChange={setRegenerateDialogOpen}
        open={regenerateDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Перегенерация сцены</DialogTitle>
            <DialogDescription>
              Выберите источник и введите промпт для генерации
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Source selection */}
            <div className="space-y-2">
              <p className="font-medium text-sm">Источник:</p>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => setUseGeneratedAsSource(false)}
                  size="sm"
                  variant={useGeneratedAsSource ? "outline" : "default"}
                >
                  <Film className="mr-2 h-4 w-4" />
                  Оригинал
                </Button>
                <Button
                  className="flex-1"
                  disabled={!hasCompletedGeneration}
                  onClick={() => setUseGeneratedAsSource(true)}
                  size="sm"
                  title={
                    hasCompletedGeneration
                      ? "Использовать предыдущую генерацию"
                      : "Нет завершённой генерации"
                  }
                  variant={useGeneratedAsSource ? "default" : "outline"}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Генерация
                </Button>
              </div>
              {!hasCompletedGeneration && (
                <p className="text-muted-foreground text-xs">
                  Для использования генерации как источника нужна завершённая
                  генерация этой сцены
                </p>
              )}
            </div>

            {/* Reference Images */}
            {referenceImages.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium text-sm">Референсные изображения:</p>
                <div className="flex flex-wrap gap-2">
                  {referenceImages.map((url, idx) => (
                    <div
                      className="group relative h-16 w-16 overflow-hidden rounded-lg border"
                      key={url}
                    >
                      <img
                        alt={`Референс ${idx + 1}`}
                        className="h-full w-full object-cover"
                        src={url}
                      />
                      <button
                        className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/80 opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                        onClick={() =>
                          setReferenceImages((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        title="Удалить"
                        type="button"
                      >
                        <XCircle className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">
                  Изображения будут использованы как референсы для генерации
                </p>
              </div>
            )}

            {/* Prompt */}
            <div className="space-y-2">
              <p className="font-medium text-sm">Промпт:</p>
              <Textarea
                className="min-h-[100px]"
                onChange={(e) => setRegeneratePrompt(e.target.value)}
                placeholder="Опишите что должно быть на видео..."
                value={regeneratePrompt}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setRegenerateDialogOpen(false)}
              variant="outline"
            >
              Отмена
            </Button>
            <Button onClick={handleRegenerate}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Перегенерировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ScenePreviewCardProps = {
  config: {
    sceneId: string;
    sceneIndex: number;
    startTime: number;
    endTime: number;
    useOriginal?: boolean;
  };
  sceneStatus: string;
  thumbnailUrl?: string | null;
  sceneVideoUrl?: string | null;
  isSceneActive: boolean;
  onRegenerateScene?: CompositeGenerationCardProps["onRegenerateScene"];
  onRegenerateClick: () => void;
};

function ScenePreviewCard({
  config,
  sceneStatus,
  thumbnailUrl,
  sceneVideoUrl,
  isSceneActive,
  onRegenerateScene,
  onRegenerateClick,
}: ScenePreviewCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-glass-border bg-surface-1">
      {/* Preview area */}
      <div className="relative aspect-video bg-surface-2">
        {sceneVideoUrl ? (
          <video
            className="h-full w-full object-cover"
            controls
            muted
            src={sceneVideoUrl}
          />
        ) : thumbnailUrl ? (
          <img
            alt={`Сцена ${config.sceneIndex + 1}`}
            className="h-full w-full object-cover"
            src={thumbnailUrl}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {isSceneActive ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : config.useOriginal ? (
              <Film className="h-6 w-6 text-muted-foreground" />
            ) : (
              <Clock className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
        )}

        {/* Status overlay */}
        <div className="absolute top-1 left-1">
          <Badge
            className="text-xs"
            variant={
              sceneStatus === "completed"
                ? "default"
                : sceneStatus === "original"
                  ? "secondary"
                  : sceneStatus === "failed"
                    ? "destructive"
                    : "outline"
            }
          >
            {config.useOriginal
              ? "Ориг"
              : sceneStatus === "completed"
                ? "Готово"
                : sceneStatus === "processing" || sceneStatus === "generating"
                  ? "..."
                  : sceneStatus === "failed"
                    ? "Ошибка"
                    : "Ожид"}
          </Badge>
        </div>

        {/* Regenerate button overlay */}
        {onRegenerateScene && !config.useOriginal && (
          <Button
            className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={onRegenerateClick}
            size="sm"
            title="Перегенерировать сцену"
            variant="secondary"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Scene info */}
      <div className="flex items-center justify-between px-2 py-1">
        <span className="font-medium text-xs">#{config.sceneIndex + 1}</span>
        <span className="text-muted-foreground text-xs">
          {config.startTime.toFixed(1)}s — {config.endTime.toFixed(1)}s
        </span>
      </div>
    </div>
  );
}
