"use client";

import { Box, ImageIcon, Layers, User } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { AssetCategory } from "@/lib/assets-api";

type CategorySelectorProps = {
  selected: AssetCategory | null;
  onSelect: (category: AssetCategory) => void;
};

const categories: {
  id: AssetCategory;
  label: string;
  description: string;
  icon: React.ReactNode;
  examples: string[];
}[] = [
  {
    id: "background",
    label: "Фоны",
    description: "Сцены, окружение, пейзажи",
    icon: <ImageIcon className="h-6 w-6" />,
    examples: ["Город на закате", "Космическая станция", "Уютная кофейня"],
  },
  {
    id: "character",
    label: "Персонажи",
    description: "Люди, существа, герои",
    icon: <User className="h-6 w-6" />,
    examples: ["Киберпанк девушка", "Робот-помощник", "Сказочный эльф"],
  },
  {
    id: "object",
    label: "Объекты",
    description: "Предметы, вещи, продукты",
    icon: <Box className="h-6 w-6" />,
    examples: ["Светящийся кристалл", "Винтажная камера", "Волшебная книга"],
  },
  {
    id: "texture",
    label: "Текстуры",
    description: "Паттерны, материалы",
    icon: <Layers className="h-6 w-6" />,
    examples: ["Мрамор", "Дерево", "Металл"],
  },
];

export function CategorySelector({
  selected,
  onSelect,
}: CategorySelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {categories.map((category) => (
        <Card
          className={`cursor-pointer p-4 transition-all hover:border-primary ${
            selected === category.id
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : ""
          }`}
          key={category.id}
          onClick={() => onSelect(category.id)}
        >
          <div className="mb-2 flex items-center gap-2">
            <div
              className={`rounded-lg p-2 ${
                selected === category.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              {category.icon}
            </div>
          </div>
          <CardTitle className="text-sm">{category.label}</CardTitle>
          <CardDescription className="mt-1 text-xs">
            {category.description}
          </CardDescription>
          <div className="mt-2 flex flex-wrap gap-1">
            {category.examples.slice(0, 2).map((example) => (
              <span
                className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs"
                key={example}
              >
                {example}
              </span>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
