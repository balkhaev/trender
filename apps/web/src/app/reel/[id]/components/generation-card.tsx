"use client";

import { Clock, Download, ExternalLink, Loader2, Trash2 } from "lucide-react";
import NextImage from "next/image";
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
  GENERATION_STATUS_CONFIG,
  getGenerationVariant,
} from "@/lib/status-config";
import type { VideoGeneration } from "@/lib/templates-api";

type GenerationCardProps = {
  generation: VideoGeneration;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
};

export function GenerationCard({
  generation,
  onDelete,
  isDeleting,
}: GenerationCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
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

  const status =
    GENERATION_STATUS_CONFIG[generation.status] ||
    GENERATION_STATUS_CONFIG.pending;

  const handleDelete = () => {
    onDelete?.(generation.id);
    setDeleteDialogOpen(false);
  };

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
                    Это действие удалит генерацию и связанный видеофайл из
                    хранилища.
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

// Re-export helper components for use in CompositeGenerationCard
export { GenerationError, GenerationActions };
