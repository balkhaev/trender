"use client";

import { Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssetCategory, MediaSource } from "@/lib/media-api";

type ImageFiltersProps = {
  source: MediaSource | "all";
  category: AssetCategory | undefined;
  onSourceChange: (source: MediaSource | "all") => void;
  onCategoryChange: (category: AssetCategory | undefined) => void;
};

const categories: { value: AssetCategory; label: string }[] = [
  { value: "background", label: "Фоны" },
  { value: "character", label: "Персонажи" },
  { value: "object", label: "Объекты" },
  { value: "texture", label: "Текстуры" },
];

export function ImageFilters({
  source,
  category,
  onSourceChange,
  onCategoryChange,
}: ImageFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Source filter */}
      <div className="flex gap-1">
        <Button
          onClick={() => onSourceChange("all")}
          size="sm"
          variant={source === "all" ? "default" : "outline"}
        >
          Все
        </Button>
        <Button
          onClick={() => onSourceChange("upload")}
          size="sm"
          variant={source === "upload" ? "default" : "outline"}
        >
          <Upload className="mr-1 h-4 w-4" />
          Загруженные
        </Button>
        <Button
          onClick={() => onSourceChange("generated")}
          size="sm"
          variant={source === "generated" ? "default" : "outline"}
        >
          <Sparkles className="mr-1 h-4 w-4" />
          Сгенерированные
        </Button>
      </div>

      {/* Category filter */}
      <Select
        onValueChange={(value) =>
          onCategoryChange(
            value === "all" ? undefined : (value as AssetCategory)
          )
        }
        value={category || "all"}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Категория" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все категории</SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat.value} value={cat.value}>
              {cat.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
