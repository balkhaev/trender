"use client";

import {
  Camera,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  Film,
  MapPin,
  Palette,
  Save,
  Settings2,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateAnalysis } from "@/lib/templates-api";

type QuickField = {
  key: keyof TemplateAnalysis;
  label: string;
  icon: React.ElementType;
  type: "text" | "textarea" | "select" | "number";
  options?: { value: string; label: string }[];
  placeholder?: string;
};

const QUICK_FIELDS: QuickField[] = [
  {
    key: "subject",
    label: "Субъект",
    icon: Users,
    type: "textarea",
    placeholder: "Кто или что является главным объектом видео",
  },
  {
    key: "action",
    label: "Действие",
    icon: Zap,
    type: "textarea",
    placeholder: "Что происходит на видео",
  },
  {
    key: "environment",
    label: "Окружение",
    icon: MapPin,
    type: "textarea",
    placeholder: "Где происходит действие",
  },
  {
    key: "cameraStyle",
    label: "Камера",
    icon: Camera,
    type: "text",
    placeholder: "Стиль съёмки и движения камеры",
  },
  {
    key: "mood",
    label: "Настроение",
    icon: Sparkles,
    type: "text",
    placeholder: "Атмосфера и эмоции",
  },
  {
    key: "colorPalette",
    label: "Цвета",
    icon: Palette,
    type: "text",
    placeholder: "Цветовая гамма и грейдинг",
  },
  {
    key: "style",
    label: "Стиль",
    icon: Film,
    type: "select",
    options: [
      { value: "cinematic", label: "Кинематографичный" },
      { value: "documentary", label: "Документальный" },
      { value: "commercial", label: "Рекламный" },
      { value: "music video", label: "Музыкальный клип" },
      { value: "social media", label: "Соц. сети" },
      { value: "vlog", label: "Влог" },
      { value: "tutorial", label: "Туториал" },
      { value: "artistic", label: "Арт" },
    ],
  },
  {
    key: "aspectRatio",
    label: "Формат",
    icon: Settings2,
    type: "select",
    options: [
      { value: "9:16", label: "9:16 (Вертикальный)" },
      { value: "16:9", label: "16:9 (Горизонтальный)" },
      { value: "1:1", label: "1:1 (Квадрат)" },
      { value: "auto", label: "Авто" },
    ],
  },
];

type AnalysisEditorProps = {
  analysis: TemplateAnalysis;
  onSave: (analysis: Partial<TemplateAnalysis>) => Promise<void>;
  isSaving?: boolean;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex form component with multiple field types and state
export function AnalysisEditor({
  analysis,
  onSave,
  isSaving = false,
}: AnalysisEditorProps) {
  const [editedAnalysis, setEditedAnalysis] = useState<
    Partial<TemplateAnalysis>
  >({});
  const [isProMode, setIsProMode] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const hasChanges = Object.keys(editedAnalysis).length > 0;

  const getValue = useCallback(
    (key: keyof TemplateAnalysis) => {
      if (key in editedAnalysis) {
        return editedAnalysis[key];
      }
      return analysis[key];
    },
    [analysis, editedAnalysis]
  );

  const setValue = useCallback(
    (key: keyof TemplateAnalysis, value: unknown) => {
      setEditedAnalysis((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!hasChanges) {
      return;
    }
    await onSave(editedAnalysis);
    setEditedAnalysis({});
  }, [editedAnalysis, hasChanges, onSave]);

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  }, []);

  const renderFieldInput = (field: QuickField, value: unknown) => {
    if (field.type === "textarea") {
      return (
        <Textarea
          className="resize-none"
          onChange={(e) => setValue(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={2}
          value={String(value || "")}
        />
      );
    }

    if (field.type === "select" && field.options) {
      return (
        <Select
          onValueChange={(v) => setValue(field.key, v)}
          value={String(value || "")}
        >
          <SelectTrigger>
            <SelectValue placeholder="Выберите..." />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <Input
        onChange={(e) => setValue(field.key, e.target.value)}
        placeholder={field.placeholder}
        value={String(value || "")}
      />
    );
  };

  const renderQuickField = (field: QuickField) => {
    const value = getValue(field.key);
    const Icon = field.icon;
    const isEdited = field.key in editedAnalysis;

    return (
      <div className="space-y-2" key={field.key}>
        <Label className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {field.label}
          {Boolean(isEdited) && (
            <Badge className="text-xs" variant="secondary">
              изменено
            </Badge>
          )}
        </Label>
        {renderFieldInput(field, value)}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Edit3 className="h-4 w-4" />
              Параметры видео
            </CardTitle>
            <CardDescription>
              {isProMode
                ? "Полное редактирование всех параметров"
                : "Быстрая настройка основных параметров"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsProMode(!isProMode)}
              size="sm"
              variant={isProMode ? "default" : "outline"}
            >
              <Settings2 className="mr-1 h-3 w-3" />
              {isProMode ? "Quick" : "Pro"}
            </Button>
            {Boolean(hasChanges) && (
              <Button disabled={isSaving} onClick={handleSave} size="sm">
                <Save className="mr-1 h-3 w-3" />
                Сохранить
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Mode Fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          {QUICK_FIELDS.map(renderQuickField)}
        </div>

        {/* Duration */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Длительность генерации (1-10 сек)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              className="w-24"
              max={10}
              min={1}
              onChange={(e) => {
                const val = Number.parseInt(e.target.value, 10);
                if (val >= 1 && val <= 10) {
                  setValue("duration", val);
                }
              }}
              type="number"
              value={Number(getValue("duration")) || 5}
            />
            <span className="text-muted-foreground text-sm">сек</span>
          </div>
        </div>

        {/* Pro Mode Sections */}
        {Boolean(isProMode) && (
          <div className="space-y-3 border-t pt-4">
            {/* Lighting */}
            <div className="space-y-2">
              <Label>Освещение</Label>
              <Textarea
                onChange={(e) => setValue("lighting", e.target.value)}
                placeholder="Детальное описание освещения"
                rows={2}
                value={String(getValue("lighting") || "")}
              />
            </div>

            {/* Kling Prompt */}
            <div className="space-y-2">
              <Label>Промпт для Kling AI</Label>
              <Textarea
                onChange={(e) => setValue("klingPrompt", e.target.value)}
                placeholder="Промпт изменений для video-to-video генерации"
                rows={3}
                value={String(getValue("klingPrompt") || "")}
              />
            </div>

            {/* Characters Section */}
            <Collapsible
              onOpenChange={() => toggleSection("characters")}
              open={expandedSections.includes("characters")}
            >
              <CollapsibleTrigger asChild>
                <Button className="w-full justify-between" variant="ghost">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Персонажи ({analysis.characters?.length || 0})
                  </span>
                  {expandedSections.includes("characters") ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                {analysis.characters?.map((char, idx) => (
                  <div
                    className="rounded-lg border bg-surface-1 p-3 text-sm"
                    key={char.id || idx}
                  >
                    <div className="font-medium">{char.id}</div>
                    <div className="text-muted-foreground">
                      {char.age}, {char.gender}
                    </div>
                    <div>{char.appearance}</div>
                    <div className="text-muted-foreground">{char.clothing}</div>
                  </div>
                ))}
                {(!analysis.characters || analysis.characters.length === 0) && (
                  <p className="text-muted-foreground text-sm">
                    Персонажи не обнаружены
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Scenes Section */}
            <Collapsible
              onOpenChange={() => toggleSection("scenes")}
              open={expandedSections.includes("scenes")}
            >
              <CollapsibleTrigger asChild>
                <Button className="w-full justify-between" variant="ghost">
                  <span className="flex items-center gap-2">
                    <Film className="h-4 w-4" />
                    Сцены ({analysis.scenes?.length || 0})
                  </span>
                  {expandedSections.includes("scenes") ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                {analysis.scenes?.map((scene) => (
                  <div
                    className="rounded-lg border bg-surface-1 p-3 text-sm"
                    key={scene.timestamp}
                  >
                    <div className="font-medium">{scene.timestamp}</div>
                    <div>{scene.description}</div>
                    <div className="text-muted-foreground">{scene.action}</div>
                  </div>
                ))}
                {(!analysis.scenes || analysis.scenes.length === 0) && (
                  <p className="text-muted-foreground text-sm">
                    Сцены не разобраны
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Camera Movements Section */}
            <Collapsible
              onOpenChange={() => toggleSection("camera")}
              open={expandedSections.includes("camera")}
            >
              <CollapsibleTrigger asChild>
                <Button className="w-full justify-between" variant="ghost">
                  <span className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    Движения камеры ({analysis.cameraMovements?.length || 0})
                  </span>
                  {expandedSections.includes("camera") ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                {analysis.cameraMovements?.map((mov) => (
                  <div
                    className="rounded-lg border bg-surface-1 p-3 text-sm"
                    key={`${mov.type}-${mov.startTime}`}
                  >
                    <div className="font-medium">
                      {mov.type} {mov.direction}
                    </div>
                    <div className="text-muted-foreground">
                      {mov.startTime} - {mov.endTime}, скорость: {mov.speed}
                    </div>
                  </div>
                ))}
                {(!analysis.cameraMovements ||
                  analysis.cameraMovements.length === 0) && (
                  <p className="text-muted-foreground text-sm">
                    Движения камеры не обнаружены
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Tags */}
            <div className="space-y-2">
              <Label>Теги</Label>
              <div className="flex flex-wrap gap-1">
                {analysis.tags?.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
