"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EDITABLE_FIELDS,
  type ImageReference,
  type RemixModifications,
} from "@/lib/remix-prompt";
import {
  type TemplateAnalysis,
  uploadImageReference,
} from "@/lib/templates-api";

type RemixEditorProps = {
  analysis: TemplateAnalysis;
  onModificationsChange: (
    mods: RemixModifications,
    refs: ImageReference[]
  ) => void;
  disabled?: boolean;
};

type FieldDef = (typeof EDITABLE_FIELDS)[number];

type FieldEditorProps = {
  fieldDef: FieldDef;
  currentValue: string;
  originalStr: string;
  imageRef: ImageReference | undefined;
  isUploading: boolean;
  disabled: boolean;
  onTextChange: (value: string) => void;
  onImageUpload: (file: File) => void;
  onRemoveImage: () => void;
};

/**
 * Single field editor component - extracted for complexity reduction
 */
function FieldEditor({
  fieldDef,
  currentValue,
  originalStr,
  imageRef,
  isUploading,
  disabled,
  onTextChange,
  onImageUpload,
  onRemoveImage,
}: FieldEditorProps) {
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) {
      onImageUpload(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="font-medium text-sm">{fieldDef.label}</Label>
        {fieldDef.supportsImage ? (
          <Badge className="text-xs" variant="outline">
            {fieldDef.imageType === "element" ? "@Element" : "@Image"}
          </Badge>
        ) : null}
      </div>

      {/* Original value preview */}
      <div className="mb-1 line-clamp-2 text-muted-foreground text-xs">
        Сейчас: {originalStr.slice(0, 80)}
        {originalStr.length > 80 ? "..." : ""}
      </div>

      {/* Text input */}
      <Textarea
        className="resize-none text-sm"
        disabled={disabled}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Заменить на..."
        rows={2}
        value={currentValue}
      />

      {/* Image upload zone (if field supports it) */}
      {fieldDef.supportsImage ? (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Drag-and-drop zone requires event handlers
        // biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop zone requires event handlers
        <div
          className={`relative rounded-lg border-2 border-dashed p-3 transition-colors ${
            imageRef
              ? "border-emerald-500/50 bg-emerald-500/5"
              : "border-muted-foreground/20 hover:border-muted-foreground/40"
          }`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {imageRef ? (
            // Show uploaded image
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 overflow-hidden rounded">
                <Image
                  alt="Reference"
                  className="object-cover"
                  fill
                  src={imageRef.imageUrl}
                  unoptimized
                />
              </div>
              <div className="flex-1 text-emerald-300 text-sm">
                Референс загружен
              </div>
              <Button
                disabled={disabled}
                onClick={onRemoveImage}
                size="icon"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ) : (
            // Upload prompt
            <label className="flex cursor-pointer items-center justify-center gap-2 text-muted-foreground text-sm">
              {isUploading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Загрузка...
                </>
              ) : (
                <>
                  <ImagePlus className="h-4 w-4" />
                  Перетащите или выберите изображение
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
      ) : null}
    </div>
  );
}

/**
 * RemixEditor - Component for editing analysis fields and uploading image references
 * Used to create "remix" versions of videos with customized elements
 */
export function RemixEditor({
  analysis,
  onModificationsChange,
  disabled = false,
}: RemixEditorProps) {
  // Text modifications for each field
  const [modifications, setModifications] = useState<RemixModifications>({});

  // Image references for fields that support them
  const [imageRefs, setImageRefs] = useState<ImageReference[]>([]);

  // Upload state
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  // Update modifications and notify parent
  const handleFieldChange = useCallback(
    (field: string, value: string) => {
      const newMods = { ...modifications, [field]: value };
      setModifications(newMods);
      onModificationsChange(newMods, imageRefs);
    },
    [modifications, imageRefs, onModificationsChange]
  );

  // Handle image upload for a field
  const handleImageUpload = useCallback(
    async (field: string, file: File, imageType: "image" | "element") => {
      setUploadingField(field);

      try {
        const result = await uploadImageReference(file);

        // Add or replace image reference for this field
        const newRef: ImageReference = {
          field,
          imageUrl: result.url,
          type: imageType,
        };

        const newRefs = [...imageRefs.filter((r) => r.field !== field), newRef];

        setImageRefs(newRefs);
        onModificationsChange(modifications, newRefs);

        toast.success(`Изображение загружено для ${field}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Ошибка загрузки";
        toast.error(message);
      } finally {
        setUploadingField(null);
      }
    },
    [imageRefs, modifications, onModificationsChange]
  );

  // Remove image reference for a field
  const handleRemoveImage = useCallback(
    (field: string) => {
      const newRefs = imageRefs.filter((r) => r.field !== field);
      setImageRefs(newRefs);
      onModificationsChange(modifications, newRefs);
    },
    [imageRefs, modifications, onModificationsChange]
  );

  // Get current image ref for a field
  const getImageRef = (field: string) =>
    imageRefs.find((r) => r.field === field);

  return (
    <div className="space-y-4">
      {/* Editable fields grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {EDITABLE_FIELDS.map((fieldDef) => {
          const currentValue =
            modifications[fieldDef.key as keyof RemixModifications] || "";
          const originalValue =
            analysis[fieldDef.key as keyof TemplateAnalysis];
          const originalStr =
            typeof originalValue === "string" ? originalValue : "";
          const imageRef = getImageRef(fieldDef.key);
          const isUploading = uploadingField === fieldDef.key;

          return (
            <FieldEditor
              currentValue={currentValue}
              disabled={disabled}
              fieldDef={fieldDef}
              imageRef={imageRef}
              isUploading={isUploading}
              key={fieldDef.key}
              onImageUpload={(file) =>
                handleImageUpload(
                  fieldDef.key,
                  file,
                  fieldDef.supportsImage ? fieldDef.imageType : "image"
                )
              }
              onRemoveImage={() => handleRemoveImage(fieldDef.key)}
              onTextChange={(value) => handleFieldChange(fieldDef.key, value)}
              originalStr={originalStr}
            />
          );
        })}
      </div>
    </div>
  );
}
