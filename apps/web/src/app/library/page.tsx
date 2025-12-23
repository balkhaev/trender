"use client";

import { Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ImageFilters } from "@/components/library/image-filters";
import { ImageGrid } from "@/components/library/image-grid";
import { Button } from "@/components/ui/button";
import {
  useDeleteMedia,
  usePersonalMedia,
  useUploadMedia,
} from "@/lib/hooks/use-media";
import type { AssetCategory, MediaSource } from "@/lib/media-api";

export default function LibraryPage() {
  const [source, setSource] = useState<MediaSource | "all">("all");
  const [category, setCategory] = useState<AssetCategory | undefined>(
    undefined
  );

  const { data, isLoading, refetch } = usePersonalMedia({
    type: "image",
    source: source === "all" ? undefined : source,
    category,
    limit: 100,
  });

  const uploadMutation = useUploadMedia();
  const deleteMutation = useDeleteMedia();

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;

      for (const file of Array.from(files)) {
        try {
          await uploadMutation.mutateAsync(file);
          toast.success(`${file.name} загружен`);
        } catch {
          toast.error(`Ошибка загрузки ${file.name}`);
        }
      }

      refetch();
      e.target.value = "";
    },
    [uploadMutation, refetch]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteMutation.mutateAsync(id);
        toast.success("Изображение удалено");
        refetch();
      } catch {
        toast.error("Ошибка удаления");
      }
    },
    [deleteMutation, refetch]
  );

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-bold text-2xl">Библиотека</h1>
          <p className="text-muted-foreground">
            Управляйте загруженными и сгенерированными изображениями
          </p>
        </div>

        <div className="flex gap-2">
          <Button asChild variant="outline">
            <label className="cursor-pointer">
              <Upload className="mr-2 h-4 w-4" />
              Загрузить
              <input
                accept="image/*"
                className="hidden"
                disabled={uploadMutation.isPending}
                multiple
                onChange={handleFileUpload}
                type="file"
              />
            </label>
          </Button>

          <Button asChild>
            <Link href="/assets">
              <Sparkles className="mr-2 h-4 w-4" />
              Сгенерировать
            </Link>
          </Button>
        </div>
      </div>

      <ImageFilters
        category={category}
        onCategoryChange={setCategory}
        onSourceChange={setSource}
        source={source}
      />

      <div className="text-muted-foreground text-sm">
        {data?.total ?? 0} изображений
      </div>

      <ImageGrid
        emptyMessage={
          source === "generated"
            ? "Нет сгенерированных изображений. Перейдите в раздел Ассеты."
            : "Нет изображений. Загрузите или сгенерируйте новые."
        }
        isLoading={isLoading || uploadMutation.isPending}
        items={data?.items || []}
        onDelete={handleDelete}
      />
    </div>
  );
}
