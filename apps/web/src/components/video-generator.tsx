"use client";

import { Clock, Film, Loader2, Settings2, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { type ElementSelection, RemixEditor } from "@/components/remix-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildElementPrompt, canGenerate } from "@/lib/remix-prompt";
import type {
  AnalysisType,
  KlingGenerationOptions,
  TemplateAnalysis,
} from "@/lib/templates-api";

const ANALYSIS_TYPE_CONFIG: Record<
  AnalysisType,
  { label: string; description: string; icon: React.ElementType }
> = {
  standard: {
    label: "Анализ",
    description: "Полное видео загружается в Gemini",
    icon: Sparkles,
  },
  frames: {
    label: "По кадрам",
    description: "Быстрый анализ по кадрам",
    icon: Film,
  },
  enchanting: {
    label: "Enchanting",
    description: "Gemini + ChatGPT для креативных вариантов",
    icon: Wand2,
  },
};

type VideoGeneratorProps = {
  analyses: TemplateAnalysis[];
  sourceVideoUrl: string;
  onGenerate: (
    prompt: string,
    options: KlingGenerationOptions,
    analysisId: string
  ) => Promise<void>;
  onAnalyze: () => void;
  onAnalyzeFrames: () => void;
  onAnalyzeEnchanting?: () => void;
  isGenerating?: boolean;
  isAnalyzing?: boolean;
  isAnalyzingFrames?: boolean;
  isAnalyzingEnchanting?: boolean;
  canAnalyze?: boolean;
};

export function VideoGenerator({
  analyses,
  sourceVideoUrl,
  onGenerate,
  onAnalyze,
  onAnalyzeFrames,
  onAnalyzeEnchanting,
  isGenerating = false,
  isAnalyzing = false,
  isAnalyzingFrames = false,
  isAnalyzingEnchanting = false,
  canAnalyze = true,
}: VideoGeneratorProps) {
  // Group analyses by type
  const analysesByType = useMemo(() => {
    const byType: Record<AnalysisType, TemplateAnalysis | null> = {
      standard: null,
      frames: null,
      enchanting: null,
    };

    for (const analysis of analyses) {
      const type = analysis.analysisType || "standard";
      if (!byType[type]) {
        byType[type] = analysis;
      }
    }

    return byType;
  }, [analyses]);

  // Determine active tab based on available analyses
  const availableTypes = useMemo(
    () =>
      (Object.keys(analysesByType) as AnalysisType[]).filter(
        (type) => analysesByType[type] !== null
      ),
    [analysesByType]
  );

  const [activeTab, setActiveTab] = useState<AnalysisType>(() => {
    if (availableTypes.length > 0) {
      return availableTypes[0];
    }
    return "standard";
  });

  // Update active tab when analyses change
  useEffect(() => {
    if (availableTypes.length > 0 && !availableTypes.includes(activeTab)) {
      setActiveTab(availableTypes[0]);
    }
  }, [availableTypes, activeTab]);

  // Get current analysis based on active tab
  const currentAnalysis = analysesByType[activeTab];

  // Element selections for remix
  const [elementSelections, setElementSelections] = useState<
    ElementSelection[]
  >([]);

  // Reset selections when analysis changes
  useEffect(() => {
    setElementSelections([]);
  }, [currentAnalysis?.id]);

  // Generation options
  const [duration, setDuration] = useState<number>(() => {
    const d = currentAnalysis?.duration;
    if (d && d >= 1 && d <= 10) {
      return d;
    }
    return 5;
  });

  const [aspectRatio, setAspectRatio] = useState<
    "16:9" | "9:16" | "1:1" | "auto"
  >(() => {
    const ar = currentAnalysis?.aspectRatio;
    if (ar && ["16:9", "9:16", "1:1"].includes(ar)) {
      return ar as "16:9" | "9:16" | "1:1";
    }
    return "auto";
  });

  const [keepAudio, setKeepAudio] = useState(false);

  // Update options when analysis changes
  useEffect(() => {
    if (currentAnalysis) {
      const d = currentAnalysis.duration;
      if (d && d >= 1 && d <= 10) {
        setDuration(d);
      }
      const ar = currentAnalysis.aspectRatio;
      if (ar && ["16:9", "9:16", "1:1"].includes(ar)) {
        setAspectRatio(ar as "16:9" | "9:16" | "1:1");
      }
    }
  }, [currentAnalysis]);

  // Generated prompt
  const { prompt: generatedPrompt, elementRefs } = useMemo(
    () =>
      buildElementPrompt(currentAnalysis?.elements || [], elementSelections),
    [currentAnalysis?.elements, elementSelections]
  );

  const canGenerateNow = useMemo(
    () => canGenerate(elementSelections),
    [elementSelections]
  );

  const handleSelectionsChange = useCallback(
    (selections: ElementSelection[]) => {
      setElementSelections(selections);
    },
    []
  );

  const handleGenerate = useCallback(async () => {
    if (!sourceVideoUrl) {
      toast.error("Нет исходного видео для генерации");
      return;
    }

    if (!currentAnalysis) {
      toast.error("Сначала проанализируйте видео");
      return;
    }

    if (!canGenerateNow) {
      toast.error("Выберите элементы для замены");
      return;
    }

    const options: KlingGenerationOptions = {
      duration,
      aspectRatio,
      keepAudio,
    };

    if (elementRefs.length > 0) {
      options.elements = elementRefs;
    }

    await onGenerate(generatedPrompt, options, currentAnalysis.id);
  }, [
    sourceVideoUrl,
    currentAnalysis,
    canGenerateNow,
    generatedPrompt,
    elementRefs,
    duration,
    aspectRatio,
    keepAudio,
    onGenerate,
  ]);

  const isAnyAnalyzing =
    isAnalyzing || isAnalyzingFrames || isAnalyzingEnchanting;

  return (
    <Card className="border-violet-500/20 bg-linear-to-br from-violet-500/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="h-4 w-4 text-violet-400" />
          Генерация видео
        </CardTitle>
        <CardDescription>
          Проанализируйте видео и выберите элементы для ремикса
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Analysis Tabs */}
        <Tabs
          onValueChange={(v) => setActiveTab(v as AnalysisType)}
          value={activeTab}
        >
          <div className="flex items-center gap-2">
            <TabsList className="flex-1">
              {(["standard", "frames", "enchanting"] as const).map((type) => {
                const config = ANALYSIS_TYPE_CONFIG[type];
                const Icon = config.icon;
                const hasAnalysis = analysesByType[type] !== null;

                return (
                  <TabsTrigger className="flex-1 gap-1" key={type} value={type}>
                    <Icon className="h-3 w-3" />
                    {config.label}
                    {hasAnalysis && (
                      <Badge
                        className="ml-1 h-4 px-1 text-[10px]"
                        variant="secondary"
                      >
                        ✓
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* Analyze Button */}
            <Button
              disabled={
                !canAnalyze ||
                isAnyAnalyzing ||
                (activeTab === "enchanting" && !onAnalyzeEnchanting)
              }
              onClick={
                activeTab === "frames"
                  ? onAnalyzeFrames
                  : activeTab === "enchanting"
                    ? onAnalyzeEnchanting
                    : onAnalyze
              }
              size="sm"
              variant="outline"
            >
              {(activeTab === "standard" && isAnalyzing) ||
              (activeTab === "frames" && isAnalyzingFrames) ||
              (activeTab === "enchanting" && isAnalyzingEnchanting) ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              {analysesByType[activeTab] ? "Переанализ" : "Анализ"}
            </Button>
          </div>

          {/* Tab Content */}
          {(["standard", "frames", "enchanting"] as const).map((type) => {
            const analysis = analysesByType[type];
            const config = ANALYSIS_TYPE_CONFIG[type];

            return (
              <TabsContent className="mt-4 space-y-4" key={type} value={type}>
                {/* Analysis Status */}
                {analysis ? (
                  <>
                    {/* Analysis Results */}
                    <AnalysisResults analysis={analysis} />

                    {/* Remix Editor */}
                    <div className="space-y-2">
                      <Label className="font-medium text-sm">
                        Элементы для замены
                      </Label>
                      <RemixEditor
                        analysis={analysis}
                        disabled={isGenerating}
                        key={analysis.id}
                        onSelectionsChange={handleSelectionsChange}
                      />
                    </div>

                    {/* Prompt Preview */}
                    {canGenerateNow && (
                      <div className="space-y-2">
                        <Label className="font-medium text-sm">
                          Сгенерированный промпт
                        </Label>
                        <div className="rounded-lg border bg-surface-1 p-3">
                          <p className="font-mono text-sm text-violet-200">
                            {generatedPrompt}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Generation Options */}
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <Input
                          className="w-20"
                          disabled={isGenerating}
                          max={10}
                          min={1}
                          onChange={(e) => {
                            const val = Number.parseInt(e.target.value, 10);
                            if (val >= 1 && val <= 10) {
                              setDuration(val);
                            }
                          }}
                          type="number"
                          value={duration}
                        />
                        <span className="text-muted-foreground text-sm">
                          сек
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                        <Select
                          disabled={isGenerating}
                          onValueChange={(v) =>
                            setAspectRatio(v as typeof aspectRatio)
                          }
                          value={aspectRatio}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Авто</SelectItem>
                            <SelectItem value="9:16">9:16</SelectItem>
                            <SelectItem value="16:9">16:9</SelectItem>
                            <SelectItem value="1:1">1:1</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={keepAudio}
                          disabled={isGenerating}
                          onCheckedChange={setKeepAudio}
                        />
                        <span className="text-muted-foreground text-sm">
                          Сохранить аудио
                        </span>
                      </div>
                    </div>

                    {/* Generate Button */}
                    <Button
                      className="w-full bg-violet-600 hover:bg-violet-700"
                      disabled={
                        isGenerating || !sourceVideoUrl || !canGenerateNow
                      }
                      onClick={handleGenerate}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Генерация...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Сгенерировать ремикс
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <config.icon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">
                      {config.description}
                    </p>
                    <p className="mt-1 text-muted-foreground/70 text-xs">
                      Нажмите "Анализ" чтобы начать
                    </p>
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function AnalysisResults({ analysis }: { analysis: TemplateAnalysis }) {
  return (
    <div className="space-y-3 rounded-lg border bg-surface-1/50 p-3">
      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {analysis.style && (
          <Badge variant="secondary">
            <Film className="mr-1 h-3 w-3" />
            {analysis.style}
          </Badge>
        )}
        {analysis.duration !== null && analysis.duration > 0 && (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" />
            {analysis.duration}с
          </Badge>
        )}
        <Badge variant="outline">{analysis.aspectRatio}</Badge>
        {analysis.elements && (
          <Badge variant="outline">{analysis.elements.length} элементов</Badge>
        )}
      </div>

      {/* Kling Prompt */}
      {analysis.klingPrompt && (
        <div className="rounded-lg border bg-surface-2 p-2">
          <p className="mb-1 font-medium text-muted-foreground text-xs">
            Промпт для Kling:
          </p>
          <p className="line-clamp-2 font-mono text-sm text-violet-200">
            {analysis.klingPrompt}
          </p>
        </div>
      )}
    </div>
  );
}
