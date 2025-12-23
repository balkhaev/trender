"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePersonalMedia } from "@/lib/hooks/use-media";
import type { AssetCategory, MediaItem, MediaSource } from "@/lib/media-api";
import { ImageFilters } from "./image-filters";
import { ImageGrid } from "./image-grid";

type ImagePickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: MediaItem) => void;
  filter?: {
    type?: "image" | "video";
    source?: MediaSource;
    category?: AssetCategory;
  };
  title?: string;
};

export function ImagePickerDialog({
  open,
  onOpenChange,
  onSelect,
  filter,
  title = "Выберите изображение",
}: ImagePickerDialogProps) {
  const [source, setSource] = useState<MediaSource | "all">(
    filter?.source || "all"
  );
  const [category, setCategory] = useState<AssetCategory | undefined>(
    filter?.category
  );
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);

  const { data, isLoading } = usePersonalMedia({
    type: filter?.type || "image",
    source: source === "all" ? undefined : source,
    category,
    limit: 50,
  });

  const handleSelect = (item: MediaItem) => {
    setSelectedItem(item);
  };

  const handleConfirm = () => {
    if (selectedItem) {
      onSelect(selectedItem);
      onOpenChange(false);
      setSelectedItem(null);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <ImageFilters
            category={category}
            onCategoryChange={setCategory}
            onSourceChange={setSource}
            source={source}
          />

          <div className="max-h-[400px] overflow-y-auto">
            <ImageGrid
              emptyMessage="Нет изображений. Загрузите или сгенерируйте новые."
              isLoading={isLoading}
              items={data?.items || []}
              onSelect={handleSelect}
              selectable
              selectedId={selectedItem?.id}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Отмена
          </Button>
          <Button disabled={!selectedItem} onClick={handleConfirm}>
            Выбрать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
