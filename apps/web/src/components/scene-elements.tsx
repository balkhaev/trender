"use client";

import { Check, Clock, Film, Layers, RotateCcw } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ElementRemixSelector,
  type ElementSelection,
} from "@/components/element-remix-selector";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildElementPrompt } from "@/lib/remix-prompt";
import type { VideoScene } from "@/lib/templates-api";

// Scene selection with elementSelections for each scene
export type SceneSelection = {
  sceneId: string;
  sceneIndex: number;
  useOriginal: boolean;
  elementSelections: ElementSelection[];
};

type SceneElementsProps = {
  scenes: VideoScene[];
  onSelectionsChange: (selections: ElementSelection[]) => void;
  onSceneSelectionsChange?: (sceneSelections: SceneSelection[]) => void;
  disabled?: boolean;
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

/**
 * SceneElements - Component for displaying scenes with their elements
 * Each scene can be expanded to show its remix elements
 * Each scene generates its OWN prompt from its elementSelections
 */
export function SceneElements({
  scenes,
  onSelectionsChange,
  onSceneSelectionsChange,
  disabled = false,
}: SceneElementsProps) {
  // Track selections per scene (sceneIndex -> selections)
  const [sceneSelections, setSceneSelections] = useState<
    Map<number, ElementSelection[]>
  >(new Map());

  // Track which scenes use original (no generation)
  const [useOriginalScenes, setUseOriginalScenes] = useState<Set<number>>(
    new Set()
  );

  // Track if we've notified parent to avoid infinite loops
  const lastNotifiedRef = useRef<string>("");
  const lastSceneNotifiedRef = useRef<string>("");

  // Toggle scene to use original
  const toggleUseOriginal = useCallback((sceneIndex: number) => {
    setUseOriginalScenes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sceneIndex)) {
        newSet.delete(sceneIndex);
      } else {
        newSet.add(sceneIndex);
      }
      return newSet;
    });
  }, []);

  // Handle selection change for a specific scene
  const handleSceneSelectionChange = useCallback(
    (sceneIndex: number, selections: ElementSelection[]) => {
      setSceneSelections((prev) => {
        const existing = prev.get(sceneIndex);
        const existingLength = existing?.length ?? 0;

        if (selections.length === 0 && existingLength === 0) {
          return prev;
        }

        const newMap = new Map(prev);
        if (selections.length === 0) {
          newMap.delete(sceneIndex);
        } else {
          newMap.set(sceneIndex, selections);
        }
        return newMap;
      });

      // When user selects something, remove from useOriginal
      if (selections.length > 0) {
        setUseOriginalScenes((prev) => {
          if (prev.has(sceneIndex)) {
            const newSet = new Set(prev);
            newSet.delete(sceneIndex);
            return newSet;
          }
          return prev;
        });
      }
    },
    []
  );

  // Build scene prompts for preview
  const scenePrompts = useMemo(() => {
    const prompts: Map<number, string> = new Map();

    for (const scene of scenes) {
      if (useOriginalScenes.has(scene.index)) {
        prompts.set(scene.index, "Оригинал (без генерации)");
        continue;
      }

      const selections = sceneSelections.get(scene.index) || [];
      if (selections.length > 0) {
        const { prompt } = buildElementPrompt(scene.elements || [], selections);
        prompts.set(scene.index, prompt);
      }
    }

    return prompts;
  }, [scenes, sceneSelections, useOriginalScenes]);

  // Notify parent when selections change (flat list for backward compatibility)
  useEffect(() => {
    const allSelections: ElementSelection[] = [];
    for (const sceneSelectionList of sceneSelections.values()) {
      allSelections.push(...sceneSelectionList);
    }

    const serialized = JSON.stringify(
      allSelections.map((s) => s.elementId + s.selectedOptionId)
    );
    if (serialized !== lastNotifiedRef.current) {
      lastNotifiedRef.current = serialized;
      onSelectionsChange(allSelections);
    }
  }, [sceneSelections, onSelectionsChange]);

  // Notify parent with scene-based selections
  useEffect(() => {
    if (!onSceneSelectionsChange) return;

    const sceneSelectionsArray: SceneSelection[] = scenes.map((scene) => ({
      sceneId: scene.id,
      sceneIndex: scene.index,
      useOriginal: useOriginalScenes.has(scene.index),
      elementSelections: sceneSelections.get(scene.index) || [],
    }));

    const serialized = JSON.stringify(sceneSelectionsArray);
    if (serialized !== lastSceneNotifiedRef.current) {
      lastSceneNotifiedRef.current = serialized;
      onSceneSelectionsChange(sceneSelectionsArray);
    }
  }, [scenes, sceneSelections, useOriginalScenes, onSceneSelectionsChange]);

  // Count stats
  const totalSelected = Array.from(sceneSelections.values()).reduce(
    (sum, s) => sum + s.length,
    0
  );
  const scenesToGenerate = scenes.filter(
    (s) =>
      !useOriginalScenes.has(s.index) &&
      (sceneSelections.get(s.index)?.length || 0) > 0
  ).length;
  const scenesOriginal = useOriginalScenes.size;

  if (!scenes.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-muted-foreground text-sm">Сцены не найдены</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">
            {scenes.length} {scenes.length === 1 ? "сцена" : "сцен"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {scenesOriginal > 0 && (
            <Badge variant="outline">{scenesOriginal} оригинал</Badge>
          )}
          {scenesToGenerate > 0 && (
            <Badge variant="secondary">{scenesToGenerate} к генерации</Badge>
          )}
          {totalSelected > 0 && (
            <Badge variant="default">{totalSelected} элем.</Badge>
          )}
        </div>
      </div>

      <Accordion
        className="space-y-2"
        defaultValue={["scene-0"]}
        type="multiple"
      >
        {scenes.map((scene) => {
          const selections = sceneSelections.get(scene.index) || [];
          const isOriginal = useOriginalScenes.has(scene.index);
          const elementsCount = scene.elements?.length || 0;
          const scenePrompt = scenePrompts.get(scene.index);

          return (
            <AccordionItem
              className={`rounded-lg border ${isOriginal ? "border-muted bg-muted/30" : "bg-surface-1/30"}`}
              key={scene.id}
              value={`scene-${scene.index}`}
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex w-full items-center gap-3">
                  {/* Scene Thumbnail */}
                  {scene.thumbnailUrl ? (
                    <div className="relative h-12 w-20 overflow-hidden rounded">
                      <Image
                        alt={`Сцена ${scene.index + 1}`}
                        className={`object-cover ${isOriginal ? "opacity-50" : ""}`}
                        fill
                        src={scene.thumbnailUrl}
                        unoptimized
                      />
                      {isOriginal && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Check className="h-5 w-5 text-green-400" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-12 w-20 items-center justify-center rounded bg-muted">
                      <Film className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}

                  {/* Scene Info */}
                  <div className="flex flex-1 flex-col items-start gap-1">
                    <span className="font-medium text-sm">
                      Сцена {scene.index + 1}
                      {isOriginal && (
                        <span className="ml-2 text-green-500 text-xs">
                          (оригинал)
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Clock className="h-3 w-3" />
                      <span>
                        {formatTime(scene.startTime)} —{" "}
                        {formatTime(scene.endTime)}
                      </span>
                      <span className="text-muted-foreground/50">•</span>
                      <span>{scene.duration.toFixed(1)}с</span>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-2">
                    {elementsCount > 0 && (
                      <Badge variant="outline">{elementsCount} элем.</Badge>
                    )}
                    {selections.length > 0 && !isOriginal && (
                      <Badge variant="secondary">
                        {selections.length} выбр.
                      </Badge>
                    )}
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="space-y-3 px-4 pb-4">
                {/* Use Original Toggle */}
                <div className="flex items-center justify-between rounded-lg border bg-surface-2/50 p-3">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Использовать оригинал</span>
                  </div>
                  <Button
                    disabled={disabled}
                    onClick={() => toggleUseOriginal(scene.index)}
                    size="sm"
                    variant={isOriginal ? "default" : "outline"}
                  >
                    {isOriginal ? (
                      <>
                        <Check className="mr-1 h-3 w-3" />
                        Да
                      </>
                    ) : (
                      "Нет"
                    )}
                  </Button>
                </div>

                {/* Element Selector (hidden if using original) */}
                {!isOriginal && elementsCount > 0 && (
                  <ElementRemixSelector
                    disabled={disabled}
                    elements={scene.elements}
                    onSelectionChange={(sels) =>
                      handleSceneSelectionChange(scene.index, sels)
                    }
                  />
                )}

                {!isOriginal && elementsCount === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center">
                    <p className="text-muted-foreground text-sm">
                      Элементы в этой сцене не найдены
                    </p>
                  </div>
                )}

                {/* Scene Prompt Preview */}
                {scenePrompt && !isOriginal && selections.length > 0 && (
                  <div className="rounded-lg border bg-violet-500/10 p-3">
                    <p className="mb-1 font-medium text-violet-300 text-xs">
                      Промпт для сцены {scene.index + 1}:
                    </p>
                    <p className="font-mono text-sm text-violet-200">
                      {scenePrompt}
                    </p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
