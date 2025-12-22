"use client";

import { Loader2, Sparkles } from "lucide-react";
import { TemplateCard } from "@/components/template-card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useTemplates } from "@/lib/hooks/use-templates";

export function TemplatesSection() {
  const { data, isLoading } = useTemplates({ limit: 20, published: true });

  const templates = data?.templates || [];

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Sparkles className="h-8 w-8" />
        <p>Нет готовых шаблонов</p>
        <p className="text-sm">Проанализируйте рилсы чтобы создать шаблоны</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-lg">
          <Sparkles className="h-5 w-5" />
          Шаблоны для генерации
          <Badge variant="secondary">{templates.length}</Badge>
        </h2>
      </div>

      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-4 pb-4">
          {templates.map((template) => (
            <div className="w-[280px] flex-shrink-0" key={template.id}>
              <TemplateCard template={template} />
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
