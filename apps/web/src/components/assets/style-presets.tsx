"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useStylePresets } from "@/lib/hooks/use-media";

type StylePresetsProps = {
  selected: string | null;
  onSelect: (style: string | null) => void;
};

export function StylePresets({ selected, onSelect }: StylePresetsProps) {
  const { data, isLoading } = useStylePresets();

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton className="h-8 w-24" key={i} />
        ))}
      </div>
    );
  }

  const styles = data?.styles || [];

  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        className="cursor-pointer"
        onClick={() => onSelect(null)}
        variant={selected === null ? "default" : "outline"}
      >
        Без стиля
      </Badge>
      {styles.map((style) => (
        <Badge
          className="cursor-pointer"
          key={style.id}
          onClick={() => onSelect(style.id)}
          title={style.description}
          variant={selected === style.id ? "default" : "outline"}
        >
          {style.label}
        </Badge>
      ))}
    </div>
  );
}
