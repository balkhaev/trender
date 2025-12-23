"use client";

import { Sparkles, Trash2, Upload } from "lucide-react";
import Image from "next/image";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MediaItem } from "@/lib/media-api";

type ImageCardProps = {
  item: MediaItem;
  onDelete?: (id: string) => void;
  onSelect?: (item: MediaItem) => void;
  selectable?: boolean;
  selected?: boolean;
};

export function ImageCard({
  item,
  onDelete,
  onSelect,
  selectable = false,
  selected = false,
}: ImageCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleClick = () => {
    if (selectable && onSelect) {
      onSelect(item);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(item.id);
    }
    setShowDeleteDialog(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Card
        className={`group relative overflow-hidden transition-all ${
          selectable ? "cursor-pointer hover:ring-2 hover:ring-primary" : ""
        } ${selected ? "ring-2 ring-primary" : ""}`}
        onClick={handleClick}
      >
        <div className="relative aspect-square">
          <Image
            alt={item.filename}
            className="object-cover"
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            src={item.url}
          />

          {/* Overlay with info */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

          {/* Source badge */}
          <div className="absolute top-2 left-2">
            <Badge
              className="text-xs"
              variant={item.source === "generated" ? "default" : "secondary"}
            >
              {item.source === "generated" ? (
                <Sparkles className="mr-1 h-3 w-3" />
              ) : (
                <Upload className="mr-1 h-3 w-3" />
              )}
              {item.source === "generated" ? "AI" : "Upload"}
            </Badge>
          </div>

          {/* Category badge */}
          {item.category && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-background/80 text-xs" variant="outline">
                {item.category}
              </Badge>
            </div>
          )}

          {/* Actions on hover */}
          {onDelete && !selectable && (
            <div className="absolute right-2 bottom-2 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteDialog(true);
                }}
                size="icon"
                variant="destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Info on hover */}
          <div className="absolute right-0 bottom-0 left-0 p-2 opacity-0 transition-opacity group-hover:opacity-100">
            <p className="truncate text-white text-xs">{item.filename}</p>
            <p className="text-white/70 text-xs">{formatSize(item.size)}</p>
          </div>
        </div>
      </Card>

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить изображение?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Изображение будет удалено из
              библиотеки.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
