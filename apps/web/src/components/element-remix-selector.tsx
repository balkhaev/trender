"use client";

import { ImagePlus, Mountain, Package, Trash2, User } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type DetectableElement,
  uploadImageReference,
} from "@/lib/templates-api";

// Selection state for a single element
export type ElementSelection = {
  elementId: string;
  elementType: "character" | "object" | "background";
  selectedOptionId: string | null; // null = no change, "custom" = custom image
  customImageUrl?: string;
  customPrompt?: string;
};

type ElementRemixSelectorProps = {
  elements: DetectableElement[];
  onSelectionChange: (selections: ElementSelection[]) => void;
  disabled?: boolean;
};

// Icon for element type
function ElementTypeIcon({ type }: { type: DetectableElement["type"] }) {
  switch (type) {
    case "character":
      return <User className="h-4 w-4" />;
    case "object":
      return <Package className="h-4 w-4" />;
    case "background":
      return <Mountain className="h-4 w-4" />;
  }
}

// Label for element type
function getTypeLabel(type: DetectableElement["type"]): string {
  switch (type) {
    case "character":
      return "Персонаж";
    case "object":
      return "Объект";
    case "background":
      return "Фон";
  }
}

// Single element card with remix options
type ElementCardProps = {
  element: DetectableElement;
  selection: ElementSelection | undefined;
  onSelect: (optionId: string | null) => void;
  onCustomUpload: (file: File) => Promise<void>;
  onCustomPromptChange: (prompt: string) => void;
  onRemoveCustom: () => void;
  isUploading: boolean;
  disabled: boolean;
};

function ElementCard({
  element,
  selection,
  onSelect,
  onCustomUpload,
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
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Remix Options Grid */}
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
 * ElementRemixSelector - Select remix options for detected video elements
 */
export function ElementRemixSelector({
  elements,
  onSelectionChange,
  disabled = false,
}: ElementRemixSelectorProps) {
  const [selections, setSelections] = useState<ElementSelection[]>([]);
  const [uploadingElement, setUploadingElement] = useState<string | null>(null);

  // Track if we've notified parent to avoid infinite loops
  const lastNotifiedRef = useRef<string>("");

  // Get selection for an element
  const getSelection = (elementId: string) =>
    selections.find((s) => s.elementId === elementId);

  // Update selection for an element
  const updateSelection = useCallback(
    (elementId: string, update: Partial<ElementSelection>) => {
      const element = elements.find((e) => e.id === elementId);
      if (!element) {
        return;
      }

      setSelections((prev) => {
        const existing = prev.find((s) => s.elementId === elementId);

        if (existing) {
          // Update existing selection
          const updated = { ...existing, ...update };
          // Remove if no option selected and no custom image
          if (updated.selectedOptionId || updated.customImageUrl) {
            return prev.map((s) => (s.elementId === elementId ? updated : s));
          }
          return prev.filter((s) => s.elementId !== elementId);
        }
        // Create new selection
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

  // Notify parent when selections change
  useEffect(() => {
    // Only notify if selections actually changed (compare serialized)
    const serialized = JSON.stringify(
      selections.map((s) => s.elementId + s.selectedOptionId)
    );
    if (serialized !== lastNotifiedRef.current) {
      lastNotifiedRef.current = serialized;
      onSelectionChange(selections);
    }
  }, [selections, onSelectionChange]);

  // Handle option selection
  const handleSelect = useCallback(
    (elementId: string, optionId: string | null) => {
      updateSelection(elementId, { selectedOptionId: optionId });
    },
    [updateSelection]
  );

  // Handle custom image upload
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

  // Handle custom prompt change
  const handleCustomPromptChange = useCallback(
    (elementId: string, prompt: string) => {
      updateSelection(elementId, { customPrompt: prompt });
    },
    [updateSelection]
  );

  // Remove custom image
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

  if (!elements.length) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">
            Выберите элементы для замены
          </h3>
          <p className="text-muted-foreground text-xs">
            Нажмите на вариант или загрузите своё изображение
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
            selection={getSelection(element.id)}
          />
        ))}
      </div>
    </div>
  );
}
