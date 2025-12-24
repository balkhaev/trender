"use client";

import {
  Clock,
  FolderOpen,
  ImagePlus,
  Mountain,
  Package,
  Trash2,
  User,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MediaItem } from "@/lib/media-api";
import {
  uploadImageReference,
  type VideoElement,
  type VideoScene,
} from "@/lib/templates-api";
import { formatTime } from "@/lib/utils";
import { ImagePickerDialog } from "./library/image-picker-dialog";

// Selection state for a single element
export type ElementSelection = {
  elementId: string;
  elementType: "character" | "object" | "background";
  selectedOptionId: string | null;
  customImageUrl?: string;
  customPrompt?: string;
};

type FlatElementListProps = {
  elements: VideoElement[];
  scenes: VideoScene[];
  onSelectionsChange: (selections: ElementSelection[]) => void;
  disabled?: boolean;
};

function ElementTypeIcon({ type }: { type: VideoElement["type"] }) {
  switch (type) {
    case "character":
      return <User className="h-4 w-4" />;
    case "object":
      return <Package className="h-4 w-4" />;
    case "background":
      return <Mountain className="h-4 w-4" />;
  }
}

function getTypeLabel(type: VideoElement["type"]): string {
  switch (type) {
    case "character":
      return "Персонаж";
    case "object":
      return "Объект";
    case "background":
      return "Фон";
  }
}

type ElementCardProps = {
  element: VideoElement;
  scenes: VideoScene[];
  selection: ElementSelection | undefined;
  onSelect: (optionId: string | null) => void;
  onCustomUpload: (file: File) => Promise<void>;
  onSelectFromLibrary: () => void;
  onCustomPromptChange: (prompt: string) => void;
  onRemoveCustom: () => void;
  isUploading: boolean;
  disabled: boolean;
};

function ElementCard({
  element,
  scenes,
  selection,
  onSelect,
  onCustomUpload,
  onSelectFromLibrary,
  onCustomPromptChange,
  onRemoveCustom,
  isUploading,
  disabled,
}: ElementCardProps) {
  const selectedOptionId = selection?.selectedOptionId ?? null;
  const isCustomSelected = selectedOptionId === "custom";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onCustomUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) {
      onCustomUpload(file);
    }
  };

  // Get scenes where this element appears
  const appearanceScenes = (element.appearances ?? [])
    .map((app) => scenes.find((s) => s.index === app.sceneIndex))
    .filter(Boolean) as VideoScene[];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Badge className="gap-1" variant="secondary">
            <ElementTypeIcon type={element.type} />
            {getTypeLabel(element.type)}
          </Badge>
          <CardTitle className="text-base">{element.label}</CardTitle>
        </div>
        <p className="line-clamp-2 text-muted-foreground text-xs">
          {element.description}
        </p>

        {/* Appearances */}
        {element.appearances && element.appearances.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            {element.appearances.map((app, idx) => (
              <Badge
                className="text-xs"
                key={`${app.sceneIndex}-${idx}`}
                variant="outline"
              >
                {formatTime(app.startTime)}-{formatTime(app.endTime)}
              </Badge>
            ))}
          </div>
        )}

        {/* Scene thumbnails */}
        {appearanceScenes.length > 0 && (
          <div className="mt-2 flex gap-1">
            {appearanceScenes.slice(0, 4).map((scene) => (
              <div
                className="relative h-8 w-12 overflow-hidden rounded"
                key={scene.id}
                title={`Сцена ${scene.index + 1}: ${formatTime(scene.startTime)}-${formatTime(scene.endTime)}`}
              >
                {scene.thumbnailUrl ? (
                  <Image
                    alt={`Сцена ${scene.index + 1}`}
                    className="object-cover"
                    fill
                    src={scene.thumbnailUrl}
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted text-xs">
                    {scene.index + 1}
                  </div>
                )}
              </div>
            ))}
            {appearanceScenes.length > 4 && (
              <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-xs">
                +{appearanceScenes.length - 4}
              </div>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Remix Options Grid */}
        {element.remixOptions.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {element.remixOptions.map((option) => (
              <button
                className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-all hover:bg-accent ${
                  selectedOptionId === option.id
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border"
                } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                disabled={disabled}
                key={option.id}
                onClick={() =>
                  onSelect(selectedOptionId === option.id ? null : option.id)
                }
                type="button"
              >
                <span className="text-xl">{option.icon}</span>
                <span className="truncate font-medium text-sm">
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Text-only prompt input */}
        {!selection?.customImageUrl && (
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">
              Или опишите замену текстом:
            </Label>
            <textarea
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              onChange={(e) => {
                const value = e.target.value;
                onCustomPromptChange(value);
                if (value.trim()) {
                  onSelect("custom");
                } else if (selectedOptionId === "custom") {
                  onSelect(null);
                }
              }}
              placeholder="Например: синий робот, космический корабль, средневековый замок..."
              rows={2}
              value={selection?.customPrompt || ""}
            />
          </div>
        )}

        {/* Custom Image Upload */}
        <div
          className={`rounded-lg border-2 border-dashed p-3 transition-colors ${
            isCustomSelected
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/20 hover:border-muted-foreground/40"
          }`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {selection?.customImageUrl ? (
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 overflow-hidden rounded">
                <Image
                  alt="Custom reference"
                  className="object-cover"
                  fill
                  src={selection.customImageUrl}
                  unoptimized
                />
              </div>
              <div className="flex-1">
                <Input
                  className="h-8 text-sm"
                  disabled={disabled}
                  onChange={(e) => onCustomPromptChange(e.target.value)}
                  placeholder="Описание замены..."
                  value={selection.customPrompt || ""}
                />
              </div>
              <Button
                disabled={disabled}
                onClick={onRemoveCustom}
                size="icon"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label
                className={`flex cursor-pointer items-center justify-center gap-2 text-sm ${
                  isCustomSelected ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {isUploading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Загрузка...
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-4 w-4" />
                    Загрузить своё изображение
                  </>
                )}
                <input
                  accept="image/*"
                  className="sr-only"
                  disabled={disabled || isUploading}
                  onChange={handleFileChange}
                  type="file"
                />
              </label>
              <button
                className="flex items-center justify-center gap-2 text-muted-foreground text-sm hover:text-primary"
                disabled={disabled || isUploading}
                onClick={onSelectFromLibrary}
                type="button"
              >
                <FolderOpen className="h-4 w-4" />
                Выбрать из библиотеки
              </button>
            </div>
          )}
        </div>

        {/* Selected option prompt preview */}
        {selectedOptionId && selectedOptionId !== "custom" && (
          <div className="rounded bg-muted/50 p-2">
            <Label className="text-muted-foreground text-xs">Промпт:</Label>
            <p className="text-xs">
              {
                element.remixOptions.find((o) => o.id === selectedOptionId)
                  ?.prompt
              }
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * FlatElementList - Flat list of video elements with scene appearances
 * Elements are unique across scenes, with appearances array showing where they appear
 */
export function FlatElementList({
  elements,
  scenes,
  onSelectionsChange,
  disabled = false,
}: FlatElementListProps) {
  const [selections, setSelections] = useState<ElementSelection[]>([]);
  const [uploadingElement, setUploadingElement] = useState<string | null>(null);
  const [libraryDialogElement, setLibraryDialogElement] = useState<
    string | null
  >(null);
  const lastNotifiedRef = useRef<string>("");

  const getSelection = (elementId: string) =>
    selections.find((s) => s.elementId === elementId);

  const updateSelection = useCallback(
    (elementId: string, update: Partial<ElementSelection>) => {
      const element = elements.find((e) => e.id === elementId);
      if (!element) {
        return;
      }

      setSelections((prev) => {
        const existing = prev.find((s) => s.elementId === elementId);

        if (existing) {
          const updated = { ...existing, ...update };
          // Сохраняем selection если есть: выбранная опция, картинка, или текстовый промпт
          if (
            updated.selectedOptionId ||
            updated.customImageUrl ||
            updated.customPrompt?.trim()
          ) {
            return prev.map((s) => (s.elementId === elementId ? updated : s));
          }
          return prev.filter((s) => s.elementId !== elementId);
        }
        return [
          ...prev,
          {
            elementId,
            elementType: element.type,
            selectedOptionId: null,
            ...update,
          },
        ];
      });
    },
    [elements]
  );

  useEffect(() => {
    const serialized = JSON.stringify(
      selections.map((s) => ({
        id: s.elementId,
        optionId: s.selectedOptionId,
        customPrompt: s.customPrompt,
        customImageUrl: s.customImageUrl,
      }))
    );
    if (serialized !== lastNotifiedRef.current) {
      lastNotifiedRef.current = serialized;
      onSelectionsChange(selections);
    }
  }, [selections, onSelectionsChange]);

  const handleSelect = useCallback(
    (elementId: string, optionId: string | null) => {
      updateSelection(elementId, { selectedOptionId: optionId });
    },
    [updateSelection]
  );

  const handleCustomUpload = useCallback(
    async (elementId: string, file: File) => {
      setUploadingElement(elementId);

      try {
        const result = await uploadImageReference(file);
        updateSelection(elementId, {
          selectedOptionId: "custom",
          customImageUrl: result.url,
        });
        toast.success("Изображение загружено");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Ошибка загрузки";
        toast.error(message);
      } finally {
        setUploadingElement(null);
      }
    },
    [updateSelection]
  );

  const handleCustomPromptChange = useCallback(
    (elementId: string, prompt: string) => {
      updateSelection(elementId, { customPrompt: prompt });
    },
    [updateSelection]
  );

  const handleRemoveCustom = useCallback(
    (elementId: string) => {
      updateSelection(elementId, {
        selectedOptionId: null,
        customImageUrl: undefined,
        customPrompt: undefined,
      });
    },
    [updateSelection]
  );

  const handleSelectFromLibrary = useCallback(
    (elementId: string, item: MediaItem) => {
      updateSelection(elementId, {
        selectedOptionId: "custom",
        customImageUrl: item.url,
      });
      setLibraryDialogElement(null);
      toast.success("Изображение выбрано из библиотеки");
    },
    [updateSelection]
  );

  if (!elements.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-muted-foreground text-sm">Элементы не найдены</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">
            Элементы видео ({elements.length})
          </h3>
          <p className="text-muted-foreground text-xs">
            Выберите элементы для замены. Изменения применятся ко всем сценам.
          </p>
        </div>
        {selections.length > 0 && (
          <Badge variant="secondary">{selections.length} выбрано</Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {elements.map((element) => (
          <ElementCard
            disabled={disabled}
            element={element}
            isUploading={uploadingElement === element.id}
            key={element.id}
            onCustomPromptChange={(prompt) =>
              handleCustomPromptChange(element.id, prompt)
            }
            onCustomUpload={(file) => handleCustomUpload(element.id, file)}
            onRemoveCustom={() => handleRemoveCustom(element.id)}
            onSelect={(optionId) => handleSelect(element.id, optionId)}
            onSelectFromLibrary={() => setLibraryDialogElement(element.id)}
            scenes={scenes}
            selection={getSelection(element.id)}
          />
        ))}
      </div>

      <ImagePickerDialog
        filter={{ type: "image" }}
        onOpenChange={(open) => {
          if (!open) setLibraryDialogElement(null);
        }}
        onSelect={(item) => {
          if (libraryDialogElement) {
            handleSelectFromLibrary(libraryDialogElement, item);
          }
        }}
        open={!!libraryDialogElement}
        title="Выберите изображение из библиотеки"
      />
    </div>
  );
}
