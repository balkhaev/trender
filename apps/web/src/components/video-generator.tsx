"use client";

import { Clock, Film, Loader2, Settings2, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type ElementSelection,
  FlatElementList,
} from "@/components/flat-element-list";
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
import { buildElementPrompt, canGenerate } from "@/lib/remix-prompt";
import { buildSceneSelections, canUseSceneGeneration } from "@/lib/scene-utils";
import {
  generateWithScenes,
  type KlingGenerationOptions,
  type TemplateAnalysis,
} from "@/lib/templates-api";

type VideoGeneratorProps = {
  analyses: TemplateAnalysis[];
  sourceVideoUrl: string;
  onGenerate: (
    prompt: string,
    options: KlingGenerationOptions,
    analysisId: string
  ) => Promise<void>;
  onAnalyze: () => void;
  isGenerating?: boolean;
  isAnalyzing?: boolean;
  canAnalyze?: boolean;
};

export function VideoGenerator({
  analyses,
  sourceVideoUrl,
  onGenerate,
  onAnalyze,
  isGenerating = false,
  isAnalyzing = false,
  canAnalyze = true,
}: VideoGeneratorProps) {
  // Get the latest scenes analysis (or first available)
  const analysis = useMemo(() => {
    // Prefer scenes analysis
    const scenesAnalysis = analyses.find((a) => a.analysisType === "scenes");
    if (scenesAnalysis) return scenesAnalysis;
    // Fallback to first available
    return analyses[0] ?? null;
  }, [analyses]);

  // Element selections for remix
  const [elementSelections, setElementSelections] = useState<
    ElementSelection[]
  >([]);

  // Reset selections when analysis changes
  useEffect(() => {
    setElementSelections([]);
  }, [analysis?.id]);

  // Generation options
  const [duration, setDuration] = useState<number>(5);
  const [aspectRatio, setAspectRatio] = useState<
    "16:9" | "9:16" | "1:1" | "auto"
  >("auto");
  const [keepAudio, setKeepAudio] = useState(false);

  // Update options when analysis changes
  useEffect(() => {
    if (analysis) {
      const d = analysis.duration;
      if (d && d >= 1 && d <= 10) {
        setDuration(d);
      }
      const ar = analysis.aspectRatio;
      if (ar && ["16:9", "9:16", "1:1"].includes(ar)) {
        setAspectRatio(ar as "16:9" | "9:16" | "1:1");
      }
    }
  }, [analysis]);

  // Collect all elements from videoElements or fallback to videoScenes
  const allElements = useMemo(() => {
    if (!analysis) return [];

    // Prefer videoElements if populated
    if (analysis.videoElements && analysis.videoElements.length > 0) {
      return analysis.videoElements;
    }

    // Fallback: extract unique elements from videoScenes
    if (analysis.videoScenes && analysis.videoScenes.length > 0) {
      const elementMap = new Map<
        string,
        NonNullable<(typeof analysis.videoScenes)[0]["elements"]>[0]
      >();
      for (const scene of analysis.videoScenes) {
        if (scene.elements) {
          for (const element of scene.elements) {
            if (!elementMap.has(element.id)) {
              elementMap.set(element.id, element);
            }
          }
        }
      }
      return Array.from(elementMap.values());
    }

    return [];
  }, [analysis]);

  // Generated prompt
  const { prompt: generatedPrompt, elementRefs } = useMemo(
    () => buildElementPrompt(allElements, elementSelections),
    [allElements, elementSelections]
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

    if (!analysis) {
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

    const scenes = analysis.videoScenes;

    // Scene-based генерация если есть сцены
    if (canUseSceneGeneration(scenes, elementSelections)) {
      const sceneSelections = buildSceneSelections(
        allElements,
        scenes!,
        elementSelections
      );

      try {
        const result = await generateWithScenes(
          analysis.id,
          sceneSelections,
          options
        );

        if (result.type === "composite" && result.compositeGenerationId) {
          toast.success("Генерация по сценам запущена");
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Ошибка генерации"
        );
      }
      return;
    }

    // Fallback на обычную генерацию полного видео
    if (elementRefs.length > 0) {
      options.elements = elementRefs;
    }

    await onGenerate(generatedPrompt, options, analysis.id);
  }, [
    sourceVideoUrl,
    analysis,
    canGenerateNow,
    generatedPrompt,
    elementRefs,
    elementSelections,
    allElements,
    duration,
    aspectRatio,
    keepAudio,
    onGenerate,
  ]);

  return (
    <Card className="border-violet-500/20 bg-linear-to-br from-violet-500/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-4 w-4 text-violet-400" />
              Генерация видео
            </CardTitle>
            <CardDescription>
              Проанализируйте видео и выберите элементы для ремикса
            </CardDescription>
          </div>
          <Button
            disabled={!canAnalyze || isAnalyzing}
            onClick={onAnalyze}
            size="sm"
            variant="outline"
          >
            {isAnalyzing ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3 w-3" />
            )}
            {analysis ? "Переанализ" : "Анализ"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {analysis ? (
          <>
            {/* Analysis Results */}
            <AnalysisResults analysis={analysis} />

            {/* Element List */}
            {allElements.length > 0 && analysis.videoScenes && (
              <div className="space-y-2">
                <Label className="font-medium text-sm">
                  Элементы для замены
                </Label>
                <FlatElementList
                  disabled={isGenerating}
                  elements={allElements}
                  key={analysis.id}
                  onSelectionsChange={handleSelectionsChange}
                  scenes={analysis.videoScenes}
                />
              </div>
            )}

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
                <span className="text-muted-foreground text-sm">сек</span>
              </div>

              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <Select
                  disabled={isGenerating}
                  onValueChange={(v) => setAspectRatio(v as typeof aspectRatio)}
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
              disabled={isGenerating || !sourceVideoUrl || !canGenerateNow}
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
            <Film className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              PySceneDetect + Gemini unified анализ
            </p>
            <p className="mt-1 text-muted-foreground/70 text-xs">
              Нажмите "Анализ" чтобы начать
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AnalysisResults({ analysis }: { analysis: TemplateAnalysis }) {
  const totalElements = analysis.videoElements?.length || 0;

  return (
    <div className="space-y-3 rounded-lg border bg-surface-1/50 p-3">
      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {analysis.duration !== null && analysis.duration > 0 && (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" />
            {analysis.duration}с
          </Badge>
        )}
        <Badge variant="outline">{analysis.aspectRatio}</Badge>
        {analysis.scenesCount && analysis.scenesCount > 0 && (
          <Badge variant="outline">{analysis.scenesCount} сцен</Badge>
        )}
        {totalElements > 0 && (
          <Badge variant="outline">{totalElements} элементов</Badge>
        )}
        {analysis.tags?.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}
