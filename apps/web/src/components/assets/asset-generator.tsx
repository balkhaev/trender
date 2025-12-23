"use client";

import { Loader2, Sparkles } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AspectRatio, AssetCategory } from "@/lib/assets-api";
import { useGenerateAsset } from "@/lib/hooks/use-media";
import { CategorySelector } from "./category-selector";
import { StylePresets } from "./style-presets";

const aspectRatios: { value: AspectRatio; label: string }[] = [
  { value: "1:1", label: "1:1 (Квадрат)" },
  { value: "16:9", label: "16:9 (Горизонтальный)" },
  { value: "9:16", label: "9:16 (Вертикальный)" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
];

export function AssetGenerator() {
  const [category, setCategory] = useState<AssetCategory | null>(null);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  const generateMutation = useGenerateAsset();

  const handleGenerate = async () => {
    if (!(category && prompt.trim())) {
      toast.error("Выберите категорию и введите описание");
      return;
    }

    try {
      const result = await generateMutation.mutateAsync({
        prompt: prompt.trim(),
        category,
        aspectRatio,
        style: style || undefined,
      });

      setGeneratedUrl(result.asset.url);
      toast.success("Изображение сгенерировано!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка генерации");
    }
  };

  const handleReset = () => {
    setGeneratedUrl(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: Form */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Категория</CardTitle>
          </CardHeader>
          <CardContent>
            <CategorySelector onSelect={setCategory} selected={category} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Описание</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              className="resize-none"
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Опишите что хотите сгенерировать..."
              rows={4}
              value={prompt}
            />
            <p className="text-muted-foreground text-sm">
              {prompt.length}/1000 символов
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Настройки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Стиль</Label>
              <StylePresets onSelect={setStyle} selected={style} />
            </div>

            <div className="space-y-2">
              <Label>Соотношение сторон</Label>
              <Select
                onValueChange={(v) => setAspectRatio(v as AspectRatio)}
                value={aspectRatio}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aspectRatios.map((ar) => (
                    <SelectItem key={ar.value} value={ar.value}>
                      {ar.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Button
          className="w-full"
          disabled={!(category && prompt.trim()) || generateMutation.isPending}
          onClick={handleGenerate}
          size="lg"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Генерация...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Сгенерировать
            </>
          )}
        </Button>
      </div>

      {/* Right: Preview */}
      <Card className="lg:sticky lg:top-20 lg:self-start">
        <CardHeader>
          <CardTitle>Результат</CardTitle>
        </CardHeader>
        <CardContent>
          {generatedUrl ? (
            <div className="space-y-4">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                <Image
                  alt="Generated asset"
                  className="object-contain"
                  fill
                  src={generatedUrl}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={handleReset}
                  variant="outline"
                >
                  Новая генерация
                </Button>
                <Button asChild className="flex-1" variant="outline">
                  <a
                    download
                    href={generatedUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Скачать
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed">
              <div className="text-center text-muted-foreground">
                <Sparkles className="mx-auto mb-2 h-12 w-12" />
                <p>Здесь появится результат</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
