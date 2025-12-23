"use client";

import { Clock, Film, Layers } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
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
import type { VideoScene } from "@/lib/templates-api";

type SceneElementsProps = {
  scenes: VideoScene[];
  onSelectionsChange: (selections: ElementSelection[]) => void;
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
 */
export function SceneElements({
  scenes,
  onSelectionsChange,
  disabled = false,
}: SceneElementsProps) {
  // Track selections per scene (sceneIndex -> selections)
  const [sceneSelections, setSceneSelections] = useState<
    Map<number, ElementSelection[]>
  >(new Map());

  // Track if we've notified parent to avoid infinite loops
  const lastNotifiedRef = useRef<string>("");

  // Handle selection change for a specific scene
  const handleSceneSelectionChange = useCallback(
    (sceneIndex: number, selections: ElementSelection[]) => {
      setSceneSelections((prev) => {
        // Check if anything actually changed
        const existing = prev.get(sceneIndex);
        const existingLength = existing?.length ?? 0;

        if (selections.length === 0 && existingLength === 0) {
          return prev; // No change
        }

        const newMap = new Map(prev);
        if (selections.length === 0) {
          newMap.delete(sceneIndex);
        } else {
          newMap.set(sceneIndex, selections);
        }
        return newMap;
      });
    },
    []
  );

  // Notify parent when selections change (outside of setState to avoid render loop)
  useEffect(() => {
    const allSelections: ElementSelection[] = [];
    for (const sceneSelectionList of sceneSelections.values()) {
      allSelections.push(...sceneSelectionList);
    }

    // Only notify if selections actually changed (compare serialized)
    const serialized = JSON.stringify(
      allSelections.map((s) => s.elementId + s.selectedOptionId)
    );
    if (serialized !== lastNotifiedRef.current) {
      lastNotifiedRef.current = serialized;
      onSelectionsChange(allSelections);
    }
  }, [sceneSelections, onSelectionsChange]);

  // Count total selected elements
  const totalSelected = Array.from(sceneSelections.values()).reduce(
    (sum, s) => sum + s.length,
    0
  );

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
        {totalSelected > 0 && (
          <Badge variant="secondary">{totalSelected} выбрано</Badge>
        )}
      </div>

      <Accordion
        className="space-y-2"
        defaultValue={["scene-0"]}
        type="multiple"
      >
        {scenes.map((scene) => {
          const sceneSelected = sceneSelections.get(scene.index)?.length || 0;
          const elementsCount = scene.elements?.length || 0;

          return (
            <AccordionItem
              className="rounded-lg border bg-surface-1/30"
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
                        className="object-cover"
                        fill
                        src={scene.thumbnailUrl}
                        unoptimized
                      />
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
                    {sceneSelected > 0 && (
                      <Badge variant="secondary">{sceneSelected} выбр.</Badge>
                    )}
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-4">
                {elementsCount > 0 ? (
                  <ElementRemixSelector
                    disabled={disabled}
                    elements={scene.elements}
                    onSelectionChange={(selections) =>
                      handleSceneSelectionChange(scene.index, selections)
                    }
                  />
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-center">
                    <p className="text-muted-foreground text-sm">
                      Элементы в этой сцене не найдены
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
