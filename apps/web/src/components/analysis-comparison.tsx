"use client";

import {
  Camera,
  ChevronDown,
  ChevronUp,
  Clock,
  Film,
  MapPin,
  Palette,
  Sparkles,
  Users,
  Wand2,
  Zap,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AnalysisType, TemplateAnalysis } from "@/lib/templates-api";

type AnalysisComparisonProps = {
  analyses: TemplateAnalysis[];
  onUseForGeneration: (analysis: TemplateAnalysis) => void;
};

const ANALYSIS_TYPE_LABELS: Record<AnalysisType, string> = {
  standard: "Анализ",
  frames: "По кадрам",
};

const ANALYSIS_TYPE_DESCRIPTIONS: Record<AnalysisType, string> = {
  standard: "Полное видео загружено в Gemini",
  frames: "Анализ по кадрам через Gemini 2.5 Flash",
};

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) {
    return "";
  }
  return new Date(dateStr).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AnalysisComparison({
  analyses,
  onUseForGeneration,
}: AnalysisComparisonProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  // Group analyses by type, keeping the most recent of each type
  const analysesByType = useMemo(() => {
    const byType: Record<AnalysisType, TemplateAnalysis | null> = {
      standard: null,
      frames: null,
    };

    for (const analysis of analyses) {
      const type = analysis.analysisType || "standard";
      // Keep the most recent (analyses are sorted by createdAt desc)
      if (!byType[type]) {
        byType[type] = analysis;
      }
    }

    return byType;
  }, [analyses]);

  const availableTypes = useMemo(
    () =>
      (Object.keys(analysesByType) as AnalysisType[]).filter(
        (type) => analysesByType[type] !== null
      ),
    [analysesByType]
  );

  const defaultTab = availableTypes[0] || "standard";

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  }, []);

  if (analyses.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Sparkles className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">
            Нет анализов. Запустите анализ видео.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          Анализ видео
        </CardTitle>
        <CardDescription>
          {availableTypes.length > 1
            ? "Сравните результаты разных методов анализа"
            : "Результат анализа видео"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-4 w-full">
            {(["standard", "frames"] as const).map((type) => {
              const analysis = analysesByType[type];
              const isAvailable = analysis !== null;

              return (
                <TabsTrigger
                  className="flex-1"
                  disabled={!isAvailable}
                  key={type}
                  value={type}
                >
                  {type === "frames" && <Film className="mr-1 h-3 w-3" />}
                  {ANALYSIS_TYPE_LABELS[type]}
                  {!isAvailable && (
                    <span className="ml-1 text-muted-foreground text-xs">
                      —
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex tab content render with multiple sections */}
          {(["standard", "frames"] as const).map((type) => {
            const analysis = analysesByType[type];
            if (!analysis) {
              return null;
            }

            return (
              <TabsContent className="space-y-4" key={type} value={type}>
                {/* Header with date and Use button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {ANALYSIS_TYPE_LABELS[type]}
                    </Badge>
                    {analysis.createdAt ? (
                      <span className="text-muted-foreground text-xs">
                        {formatDate(analysis.createdAt)}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    className="bg-violet-600 hover:bg-violet-700"
                    onClick={() => onUseForGeneration(analysis)}
                    size="sm"
                  >
                    <Wand2 className="mr-1 h-3 w-3" />
                    Использовать
                  </Button>
                </div>

                <p className="text-muted-foreground text-xs">
                  {ANALYSIS_TYPE_DESCRIPTIONS[type]}
                </p>

                {/* Quick fields */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <AnalysisField
                    icon={Users}
                    label="Субъект"
                    value={analysis.subject}
                  />
                  <AnalysisField
                    icon={Zap}
                    label="Действие"
                    value={analysis.action}
                  />
                  <AnalysisField
                    icon={MapPin}
                    label="Окружение"
                    value={analysis.environment}
                  />
                  <AnalysisField
                    icon={Camera}
                    label="Камера"
                    value={analysis.cameraStyle}
                  />
                  <AnalysisField
                    icon={Sparkles}
                    label="Настроение"
                    value={analysis.mood}
                  />
                  <AnalysisField
                    icon={Palette}
                    label="Цвета"
                    value={analysis.colorPalette}
                  />
                </div>

                {/* Additional info */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    <Film className="mr-1 h-3 w-3" />
                    {analysis.style}
                  </Badge>
                  {analysis.duration !== null && analysis.duration > 0 ? (
                    <Badge variant="secondary">
                      <Clock className="mr-1 h-3 w-3" />
                      {analysis.duration}с
                    </Badge>
                  ) : null}
                  <Badge variant="outline">{analysis.aspectRatio}</Badge>
                </div>

                {/* Kling Prompt */}
                {analysis.klingPrompt ? (
                  <div className="rounded-lg border bg-surface-1 p-3">
                    <p className="mb-1 font-medium text-muted-foreground text-xs">
                      Промпт для Kling:
                    </p>
                    <p className="font-mono text-sm text-violet-200">
                      {analysis.klingPrompt}
                    </p>
                  </div>
                ) : null}

                {/* Collapsible sections */}
                {analysis.scenes?.length > 0 ? (
                  <Collapsible
                    onOpenChange={() => toggleSection(`${type}-scenes`)}
                    open={expandedSections.includes(`${type}-scenes`)}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        className="w-full justify-between"
                        variant="ghost"
                      >
                        <span className="flex items-center gap-2">
                          <Film className="h-4 w-4" />
                          Сцены ({analysis.scenes.length})
                        </span>
                        {expandedSections.includes(`${type}-scenes`) ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-2">
                      {analysis.scenes.map((scene) => (
                        <div
                          className="rounded-lg border bg-surface-1 p-3 text-sm"
                          key={`scene-${scene.timestamp}`}
                        >
                          <div className="font-medium">{scene.timestamp}</div>
                          <div>{scene.description}</div>
                          <div className="text-muted-foreground">
                            {scene.action}
                          </div>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}

                {analysis.characters?.length > 0 ? (
                  <Collapsible
                    onOpenChange={() => toggleSection(`${type}-characters`)}
                    open={expandedSections.includes(`${type}-characters`)}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        className="w-full justify-between"
                        variant="ghost"
                      >
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Персонажи ({analysis.characters.length})
                        </span>
                        {expandedSections.includes(`${type}-characters`) ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-2">
                      {analysis.characters.map((char, idx) => (
                        <div
                          className="rounded-lg border bg-surface-1 p-3 text-sm"
                          key={char.id || idx}
                        >
                          <div className="font-medium">{char.id}</div>
                          <div className="text-muted-foreground">
                            {char.age}, {char.gender}
                          </div>
                          <div>{char.appearance}</div>
                          <div className="text-muted-foreground">
                            {char.clothing}
                          </div>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}

                {/* Tags */}
                {analysis.tags?.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {analysis.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function AnalysisField({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  if (!value) {
    return null;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-muted-foreground text-xs">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="text-sm">{value}</p>
    </div>
  );
}
