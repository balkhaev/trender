"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useTagTrends } from "@/lib/hooks/use-trends";
import { matchIdeaToTrends, parseIdeaTags } from "@/lib/idea-utils";

function uniq(items: string[]): string[] {
  return Array.from(new Set(items));
}

export default function IdeaPage() {
  const [rawTags, setRawTags] = useState<string>("");
  const [hours, setHours] = useState<number>(24);
  const [selected, setSelected] = useState<string[]>([]);

  const { data, isLoading, isError, refetch } = useTagTrends(hours, 50);

  const inputTags = useMemo(() => parseIdeaTags(rawTags), [rawTags]);
  const result = useMemo(
    () => matchIdeaToTrends(rawTags, data?.tags ?? [], { suggestedLimit: 15 }),
    [rawTags, data?.tags]
  );

  const matched = result.matched;
  const suggested = result.suggested;

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const finalTags = useMemo(
    () => uniq([...inputTags, ...selected]).join(", "),
    [inputTags, selected]
  );

  function toggleSelected(tag: string) {
    setSelected((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      }
      return [...prev, tag];
    });
  }

  async function copyFinalTags(): Promise<void> {
    try {
      await navigator.clipboard.writeText(finalTags);
      toast.success("Скопировано");
    } catch (error) {
      console.error("Copy failed:", error);
      toast.error("Не удалось скопировать");
    }
  }

  const trendsContent = (() => {
    if (isLoading) {
      return <div className="text-muted-foreground text-sm">Загрузка…</div>;
    }
    if (isError) {
      return (
        <div className="text-destructive text-sm">
          Не удалось загрузить тренды
        </div>
      );
    }

    return (
      <>
        <div className="text-muted-foreground text-sm">
          Видео в выборке: {data?.videosAnalyzed ?? 0} • окно:{" "}
          {data?.windowHours ?? hours}ч
        </div>

        <div className="flex flex-wrap gap-2">
          {(data?.tags ?? []).slice(0, 10).map((t) => (
            <Badge key={t.tag} variant="secondary">
              {t.tag}
            </Badge>
          ))}
        </div>

        <Separator />

        <div className="grid gap-2">
          <h2 className="font-semibold text-lg">Совпадения</h2>
          {matched.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              Пока нет совпадений — добавьте теги или увеличьте окно.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {matched.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        <Separator />

        <div className="grid gap-2">
          <h2 className="font-semibold text-lg">Рекомендации</h2>
          {suggested.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              Нет рекомендаций (мало данных или всё уже в тегах).
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {suggested.map((t) => {
                const isSelected = selectedSet.has(t.tag);
                return (
                  <button
                    key={t.tag}
                    onClick={() => toggleSelected(t.tag)}
                    type="button"
                  >
                    <Badge variant={isSelected ? "default" : "secondary"}>
                      {t.tag}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Separator />

        <div className="grid gap-2">
          <h2 className="font-semibold text-lg">Итоговые теги</h2>
          <div className="text-muted-foreground text-sm">
            Выбрано: {selected.length} • всего:{" "}
            {uniq([...inputTags, ...selected]).length}
          </div>
          <div className="rounded-md border border-glass-border bg-surface-1 p-3 font-mono text-xs">
            {finalTags.length > 0 ? finalTags : "—"}
          </div>
          <div className="flex items-center gap-2">
            <Button
              disabled={finalTags.length === 0}
              onClick={() => copyFinalTags()}
            >
              Скопировать итоговые теги
            </Button>
            <Button
              disabled={selected.length === 0}
              onClick={() => setSelected([])}
              variant="secondary"
            >
              Сбросить выбор
            </Button>
          </div>
        </div>
      </>
    );
  })();

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4 p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-semibold text-2xl">Идея нового видео</h1>
          <Button onClick={() => refetch()} variant="secondary">
            Обновить
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ввод</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="idea-tags">Мои теги</Label>
              <Textarea
                id="idea-tags"
                onChange={(e) => setRawTags(e.target.value)}
                placeholder="Например: food, travel, street-food"
                value={rawTags}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="idea-hours">Окно тренда (часы)</Label>
              <Input
                id="idea-hours"
                inputMode="numeric"
                max={168}
                min={1}
                onChange={(e) => setHours(Number(e.target.value))}
                type="number"
                value={hours}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Тренды</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {trendsContent}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
