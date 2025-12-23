"use client";

import { ImageIcon, Loader2 } from "lucide-react";
import type { MediaItem } from "@/lib/media-api";
import { ImageCard } from "./image-card";

type ImageGridProps = {
  items: MediaItem[];
  isLoading?: boolean;
  onDelete?: (id: string) => void;
  onSelect?: (item: MediaItem) => void;
  selectable?: boolean;
  selectedId?: string;
  emptyMessage?: string;
};

export function ImageGrid({
  items,
  isLoading = false,
  onDelete,
  onSelect,
  selectable = false,
  selectedId,
  emptyMessage = "Нет изображений",
}: ImageGridProps) {
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <ImageIcon className="h-12 w-12" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <ImageCard
          item={item}
          key={item.id}
          onDelete={onDelete}
          onSelect={onSelect}
          selectable={selectable}
          selected={selectedId === item.id}
        />
      ))}
    </div>
  );
}
