"use client";

import {
  Check,
  Copy,
  ExternalLink,
  Heart,
  Loader2,
  Sparkles,
  Video,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useGenerateFromTemplate } from "@/lib/hooks/use-templates";
import type { Template } from "@/lib/templates-api";

function formatLikes(likes: number | null | undefined): string {
  if (likes === null || likes === undefined) {
    return "0";
  }
  if (likes >= 1_000_000) {
    return `${(likes / 1_000_000).toFixed(1)}M`;
  }
  if (likes >= 1000) {
    return `${(likes / 1000).toFixed(1)}K`;
  }
  return likes.toString();
}

type TemplateCardProps = {
  template: Template;
  onSelect?: (template: Template) => void;
};

export function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const [copied, setCopied] = useState(false);
  const { mutate: generate, isPending } = useGenerateFromTemplate();

  const handleCopy = useCallback(async () => {
    const prompt =
      template.analysis.klingPrompt || template.analysis.veo3Prompt;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    toast.success("Промпт скопирован");
    setTimeout(() => setCopied(false), 2000);
  }, [template.analysis.klingPrompt, template.analysis.veo3Prompt]);

  const handleGenerate = useCallback(() => {
    generate(
      { templateId: template.id },
      {
        onSuccess: () => {
          toast.success("Генерация Kling AI запущена");
        },
        onError: (err) => {
          toast.error(err.message);
        },
      }
    );
  }, [template.id, generate]);

  return (
    <Card className="group overflow-hidden transition-shadow hover:shadow-lg">
      {/* Thumbnail / Preview */}
      <div className="relative aspect-[9/16] max-h-48 overflow-hidden bg-muted">
        {template.reel.thumbnailUrl ? (
          <Image
            alt={template.title || "Template preview"}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            fill
            sizes="(max-width: 768px) 50vw, 200px"
            src={template.reel.thumbnailUrl}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Video className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}

        {/* Overlay with likes */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 font-medium text-sm text-white">
              <Heart className="h-4 w-4 fill-pink-500 text-pink-500" />
              {formatLikes(template.reel.likeCount)}
            </span>
            <a
              className="text-white/80 transition-colors hover:text-white"
              href={template.reel.url}
              onClick={(e) => e.stopPropagation()}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Generation count badge */}
        {template.generationCount > 0 ? (
          <div className="absolute top-2 right-2">
            <Badge className="bg-black/50 text-white" variant="secondary">
              <Sparkles className="mr-1 h-3 w-3" />
              {template.generationCount}
            </Badge>
          </div>
        ) : null}
      </div>

      <CardHeader className="p-3 pb-2">
        <CardTitle className="line-clamp-2 text-sm">
          {template.title || template.analysis.subject}
        </CardTitle>
        <CardDescription className="line-clamp-1 text-xs">
          {template.analysis.action}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 p-3 pt-0">
        {/* Tags */}
        {template.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {template.tags.slice(0, 3).map((tag) => (
              <Badge className="text-xs" key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
            {template.tags.length > 3 ? (
              <Badge className="text-xs" variant="outline">
                +{template.tags.length - 3}
              </Badge>
            ) : null}
          </div>
        ) : null}

        {/* Category */}
        {template.category ? (
          <Badge className="text-xs" variant="secondary">
            {template.category}
          </Badge>
        ) : null}

        {/* Actions */}
        <Button
          className="w-full"
          disabled={isPending}
          onClick={handleGenerate}
          size="sm"
        >
          {isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-3 w-3" />
          )}
          Kling AI
        </Button>

        <Button
          className="w-full"
          onClick={handleCopy}
          size="sm"
          variant="outline"
        >
          {copied ? (
            <>
              <Check className="mr-1 h-3 w-3" />
              Скопировано
            </>
          ) : (
            <>
              <Copy className="mr-1 h-3 w-3" />
              Промпт
            </>
          )}
        </Button>

        {onSelect ? (
          <Button
            className="w-full"
            onClick={() => onSelect(template)}
            size="sm"
            variant="ghost"
          >
            Подробнее
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
